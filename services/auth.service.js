// services/auth.service.js
const NhanVienModel = require("../models/NhanVien.model");
const NhaDauTuModel = require("../models/NhaDauTu.model");
// const UserManagementModel = require("../models/UserManagement.model");
const passwordHasher = require("../utils/passwordHasher");
const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth.config");
const sql = require("mssql"); // Cần cho transaction
const db = require("../models/db"); // Cần cho transaction
const AuthenticationError = require("../utils/errors/AuthenticationError"); // Cần cho lỗi xác thực
const AppError = require("../utils/errors/AppError");
const NotFoundError = require("../utils/errors/NotFoundError");
const BadRequestError = require("../utils/errors/BadRequestError");
const ConflictError = require("../utils/errors/ConflictError");
const sendEmail = require("../utils/email.helper");
const AuthService = {};

AuthService.signIn = async (username, password, res) => {
  // <<<--- Thêm 'res' để set cookie
  try {
    let user;
    let role;
    let passwordHashField;
    let userIdField;

    // Tìm user và xác định role, field password, field ID
    user = await NhanVienModel.findByMaNV(username);
    if (user) {
      role = "NhanVien";
      passwordHashField = "PasswordHash";
      userIdField = "MaNV";
    } else {
      user = await NhaDauTuModel.findByMaNDT(username);
      if (user) {
        role = "NhaDauTu";
        passwordHashField = "MKGD";
        userIdField = "MaNDT";
      }
    }

    if (!user) {
      throw new AuthenticationError("Tên đăng nhập hoặc mật khẩu không đúng.");
    }

    const userId = user[userIdField]; // Lấy ID người dùng

    const hashedPassword = user[passwordHashField];
    if (!hashedPassword) {
      console.warn(`User ${username} found but has no password hash.`);
      throw new AuthenticationError("Tên đăng nhập hoặc mật khẩu không đúng.");
    }

    const passwordIsValid = await passwordHasher.comparePassword(
      password,
      hashedPassword
    );

    console.log(
      `Password validation for ${password}, ${hashedPassword}: ${
        passwordIsValid ? "valid" : "invalid"
      }`
    );

    if (!passwordIsValid) {
      throw new AuthenticationError("Tên đăng nhập hoặc mật khẩu không đúng.");
    }

    // --- TẠO TOKENS ---
    // 1. Access Token (Ngắn hạn, gửi trong body)
    const accessToken = jwt.sign(
      { id: userId, username: username, role: role },
      authConfig.secret,
      { expiresIn: authConfig.jwtExpiration } // Ví dụ: 1 giờ
    );

    // 2. Refresh Token (Dài hạn hơn, gửi qua HTTP-Only Cookie)
    const refreshToken = jwt.sign(
      // Payload của refresh token thường chỉ cần ID user là đủ, không cần role hay username
      { id: userId },
      authConfig.jwtRefreshSecret,
      { expiresIn: authConfig.jwtRefreshExpirationString } // Ví dụ: '7d'
    );

    // --- LƯU Ý: KHÔNG LƯU REFRESH TOKEN VÀO DB ---

    // --- GỬI REFRESH TOKEN QUA COOKIE ---
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true, // Quan trọng: Ngăn JS phía client truy cập cookie
      secure: process.env.NODE_ENV === "production", // Chỉ gửi qua HTTPS ở production
      sameSite: "strict", // Hoặc 'lax'. Giúp chống CSRF. 'strict' an toàn nhất.
      maxAge: authConfig.jwtRefreshCookieExpirationMs, // Thời gian sống của cookie (ms)
      // path: '/api/auth' // (Tùy chọn) Giới hạn cookie chỉ gửi đến endpoint xác thực
    });

    // --- TRẢ VỀ ACCESS TOKEN VÀ THÔNG TIN USER TRONG BODY ---
    return {
      id: userId,
      username: username,
      email: user.Email,
      role: role,
      accessToken: accessToken, // Chỉ trả về access token
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error("Unexpected Sign in error:", error);
    throw new AppError("Lỗi đăng nhập hệ thống.", 500);
  }
};

// Có thể thêm hàm signUp, signOut, refreshToken... ở đây nếu cần
AuthService.changePassword = async (
  userId,
  userRole,
  oldPassword,
  newPassword
) => {
  // 1. Xác định Model và tên cột mật khẩu dựa trên role
  let userModel;
  let passwordHashField;
  // Hàm tạm để lấy user và hash (có thể tích hợp vào findByMaNV/findByMaNDT sau)
  const getUserWithHash = async (id) => {
    // ... (giữ nguyên hàm này hoặc đảm bảo findBy... trả về hash)
    try {
      const pool = await db.getPool();
      const request = pool.request();
      let query;
      if (userRole === "NhanVien") {
        userModel = NhanVienModel; // Gán userModel ở đây
        passwordHashField = "PasswordHash"; // Gán field ở đây
        request.input("MaNV", sql.NChar(20), id);
        query = `SELECT MaNV, ${passwordHashField} FROM NHANVIEN WHERE MaNV = @MaNV`;
      } else if (userRole === "NhaDauTu") {
        userModel = NhaDauTuModel; // Gán userModel ở đây
        passwordHashField = "MKGD"; // Gán field ở đây
        request.input("MaNDT", sql.NChar(20), id);
        query = `SELECT MaNDT, ${passwordHashField} FROM NDT WHERE MaNDT = @MaNDT`;
      } else {
        throw new Error("Vai trò người dùng không hợp lệ.");
      }
      const result = await request.query(query);
      return result.recordset[0];
    } catch (err) {
      console.error("Error fetching user for password change:", err);
      throw new Error("Lỗi khi truy vấn thông tin người dùng.");
    }
  };
  // -----------------------------------------------------

  // 2. Lấy thông tin người dùng (bao gồm hash cũ)
  // const user = await findUserFunction(userId); // Sử dụng hàm find đã có nếu nó trả về hash
  const user = await getUserWithHash(userId); // Hoặc dùng hàm tạm thời ở trên

  if (!user) {
    // Trường hợp này không nên xảy ra nếu token hợp lệ
    throw new NotFoundError("Người dùng không tồn tại.");
  }
  const currentHashedPassword = user[passwordHashField];
  if (!currentHashedPassword) {
    // Người dùng tồn tại nhưng không có mật khẩu? Lỗi dữ liệu?
    console.error(
      `User ${userId} exists but has no password hash in field ${passwordHashField}.`
    );
    throw new AppError("Không thể xác thực mật khẩu cũ.", 500); // Lỗi dữ liệu bất thường
  }

  // 3. So sánh mật khẩu cũ nhập vào với hash trong DB
  const isOldPasswordValid = await passwordHasher.comparePassword(
    oldPassword,
    currentHashedPassword
  );
  if (!isOldPasswordValid) {
    throw new BadRequestError("Mật khẩu cũ không chính xác.");
  }

  // 4. (Tùy chọn) Kiểm tra mật khẩu mới có trùng mật khẩu cũ không
  if (oldPassword === newPassword) {
    throw new BadRequestError("Mật khẩu mới không được trùng với mật khẩu cũ.");
  }

  // 5. Hash mật khẩu mới
  const newHashedPassword = await passwordHasher.hashPassword(newPassword);

  // --- Bắt đầu các thay đổi (nên có transaction nếu có nhiều bước DB) ---
  // Mặc dù ALTER LOGIN và UPDATE là 2 lệnh riêng, việc đồng bộ là quan trọng.
  // Nếu 1 trong 2 thất bại, hệ thống sẽ ở trạng thái không nhất quán
  // (mật khẩu login SQL khác mật khẩu hash trong bảng).
  // Xử lý transaction phức tạp hơn vì ALTER LOGIN chạy ở context server.
  // --> Giải pháp tạm thời: thực hiện tuần tự và chấp nhận rủi ro không nhất quán nhỏ.

  // 6. Cập nhật mật khẩu SQL Server Login trước
  // try {
  //   // Truyền mật khẩu mới chưa hash vào hàm này
  //   await UserManagementModel.changeSqlLoginPassword(userId, newPassword);
  // } catch (error) {
  //   console.error(
  //     `Failed to update SQL Login password for ${userId}: ${error.message}`
  //   );
  //   // Không nên tiếp tục cập nhật hash trong bảng nếu login SQL lỗi
  //   throw error; // Ném lại lỗi (vd: không đủ quyền, pw policy)
  // }

  // 7. Cập nhật hash mới trong bảng NHANVIEN/NDT
  try {
    if (!userModel) throw new Error("Lỗi xác định model người dùng.");
    await userModel.updatePasswordHash(userId, newHashedPassword);
    console.log(
      `Password hash updated successfully in table for user ${userId}.`
    );
    return { message: "Đổi mật khẩu thành công." };
  } catch (error) {
    console.error(
      `Failed to update password hash in table for ${userId} after potentially changing SQL Login password: ${error.message}`
    );
    // Lỗi nghiêm trọng: Mật khẩu Login SQL đã đổi nhưng hash trong bảng chưa đổi.
    // Cần cơ chế xử lý/cảnh báo đặc biệt ở đây.
    // Tạm thời ném lỗi để báo cho người dùng biết.
    throw new Error(`Lỗi khi cập nhật mật khẩu`);
  }
};

// --- Service Đăng Kí Nhà Đầu Tư ---
AuthService.signUp = async (signUpData) => {
  const { MaNDT, password, ...ndtInfo } = signUpData; // Tách MaNDT, password và thông tin NDT còn lại

  // 1. Kiểm tra trùng lặp
  const existence = await NhaDauTuModel.checkExistence(
    MaNDT,
    ndtInfo.CMND,
    ndtInfo.Email
  );
  if (existence.MaNDTExists)
    throw new ConflictError(`Mã Nhà Đầu Tư '${MaNDT}' đã được sử dụng.`);
  if (existence.CMNDExists)
    throw new ConflictError(`Số CMND '${ndtInfo.CMND}' đã được sử dụng.`);
  if (existence.EmailExists)
    throw new ConflictError(`Email '${ndtInfo.Email}' đã được sử dụng.`);

  // 2. Hash mật khẩu
  const hashedPassword = await passwordHasher.hashPassword(password);

  // 3. Thực hiện tạo NDT và Login SQL trong transaction
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    // a. Tạo bản ghi NDT trong bảng NDT
    await NhaDauTuModel.createInTransaction(
      request,
      { MaNDT, ...ndtInfo },
      hashedPassword
    );
    console.log(`NDT record created for ${MaNDT}`);

    // b. Tạo SQL Login và User (Sử dụng mật khẩu gốc)
    //    Role cố định là 'Nhà đầu tư' cho signup
    // await UserManagementModel.createSqlLoginAndUser(
    //   MaNDT,
    //   password,
    //   "Nhà đầu tư"
    // );
    // console.log(`SQL Login and User created for ${MaNDT}`);

    // c. Commit transaction
    await transaction.commit();
    console.log(`Signup transaction committed for ${MaNDT}`);

    const { password: _, ...userResult } = { MaNDT, ...ndtInfo };
    return userResult;
  } catch (error) {
    console.error(
      `Transaction Error during signup for ${MaNDT}:`,
      error.message
    );
    if (transaction && transaction.active) {
      await transaction.rollback();
      console.log(`Signup transaction rolled back for ${MaNDT}`);
    }
    // Ném lỗi ra ngoài để controller xử lý
    // Các lỗi cụ thể (trùng lặp, pw policy, permission) đã được bắt trong model hoặc check ban đầu
    throw error;
  }
};

// --- SERVICE CHO REFRESH TOKEN ---
AuthService.refreshToken = async (requestToken) => {
  if (!requestToken) {
    // throw new AuthenticationError("Refresh Token is required!"); // Nên check ở controller
    throw new AppError("Refresh Token is required!", 403); // Forbidden nếu ko có token
  }

  try {
    // Bước 1: Xác thực chữ ký và thời gian hết hạn của Refresh Token
    const decoded = jwt.verify(requestToken, authConfig.jwtRefreshSecret);

    // Bước 2: Lấy thông tin user từ payload của refresh token (chứa id)
    const userId = decoded.id;
    if (!userId) {
      throw new AuthenticationError("Invalid Refresh Token payload.");
    }

    // Bước 3: (Rất quan trọng nếu muốn bảo mật cao hơn)
    // Kiểm tra xem user tương ứng với userId có còn tồn tại trong DB không?
    // Điều này ngăn việc tạo access token cho user đã bị xóa.
    let userExists =
      (await NhanVienModel.exists(userId)) ||
      (await NhaDauTuModel.exists(userId));
    if (!userExists) {
      throw new AuthenticationError(
        "User associated with this token no longer exists."
      );
    }

    // Bước 5: Nếu mọi thứ hợp lệ, tạo Access Token mới
    // Cần lấy lại role và username của user để đưa vào access token mới
    let userDetails = await NhanVienModel.findByMaNV(userId); // Thử tìm NV
    let role = "NhanVien";
    let username;
    if (!userDetails) {
      userDetails = await NhaDauTuModel.findByMaNDT(userId); // Thử tìm NDT
      role = "NhaDauTu";
    }

    if (!userDetails) {
      // Double check user existence
      throw new AuthenticationError(
        "User details not found for token refresh."
      );
    }
    // Cần đảm bảo model trả về trường username (MaNV hoặc MaNDT)
    username = userDetails.MaNV || userDetails.MaNDT;

    const newAccessToken = jwt.sign(
      { id: userId, username: username, role: role }, // Payload đầy đủ cho access token
      authConfig.secret,
      { expiresIn: authConfig.jwtExpiration }
    );

    return { accessToken: newAccessToken };
  } catch (err) {
    // Bắt lỗi từ jwt.verify (TokenExpiredError, JsonWebTokenError)
    // hoặc các lỗi AuthenticationError đã ném ra
    if (err instanceof jwt.TokenExpiredError) {
      console.error("Refresh Token Expired:", err.message);
      throw new AuthenticationError(
        "Refresh token đã hết hạn, vui lòng đăng nhập lại.",
        403
      ); // 403 để client biết cần login lại
    }
    if (err instanceof jwt.JsonWebTokenError) {
      console.error("Invalid Refresh Token:", err.message);
      throw new AuthenticationError("Refresh token không hợp lệ."); // 401 hoặc 403
    }
    if (err instanceof AuthenticationError || err instanceof NotFoundError) {
      throw err; // Ném lại lỗi đã biết
    }
    // Lỗi không mong muốn khác
    console.error("Unexpected error during token refresh:", err);
    throw new AppError("Lỗi khi làm mới phiên đăng nhập.", 500);
  }
};

// --- SERVICE CHO LOGOUT (Phiên bản không lưu DB) ---
/**
 * Xử lý logout. Trong phiên bản này, chủ yếu chỉ để log hoặc thực hiện
 * các hành động phụ khác nếu cần. Việc xóa token chính được thực hiện
 * bằng cách xóa cookie trong controller.
 * @param {string | undefined} requestToken Refresh token từ cookie (có thể undefined).
 * @returns {Promise<boolean>} True nếu xử lý thành công (luôn là true trong TH này).
 */
AuthService.logout = async (requestToken) => {
  // Nếu có refresh token được gửi lên (từ cookie)
  if (requestToken) {
    // Bước 1: (Bỏ qua vì không lưu DB)
    // Tìm và đánh dấu token là revoked trong DB
    // await RefreshToken.revokeToken(requestToken);
    console.log(
      "Logout request received with a refresh token (token not revoked in DB as not stored)."
    );
  } else {
    console.log("Logout request received without a refresh token.");
  }

  // Các hành động khác có thể thêm ở đây nếu cần (ví dụ: ghi log logout)

  return true; // Luôn trả về true vì không có thao tác DB để fail
};

// --- SERVICE CHO FORGOT PASSWORD ---
AuthService.forgotPassword = async (email) => {
  // 1. Kiểm tra email có tồn tại trong hệ thống không
  let user = await NhanVienModel.findByEmail(email);
  let role = "NhanVien";
  if (!user) {
    user = await NhaDauTuModel.findByEmail(email);
    role = "NhaDauTu";
  }

  if (!user) {
    throw new NotFoundError("Email không tồn tại trong hệ thống.");
  }

  // 2. Tạo token reset password
  const resetToken = jwt.sign(
    { id: user.MaNV || user.MaNDT, role: role },
    authConfig.jwtResetPasswordSecret,
    { expiresIn: authConfig.jwtResetPasswordExpiration }
  );

  // 3. Gửi email reset password (giả sử có hàm sendEmail)
  const resetLink = `${authConfig.resetPasswordUrl}?token=${resetToken}`;
  await sendEmail({
    to: email,
    subject: "Reset Password",
    text: `Click vào link sau để đặt lại mật khẩu: ${resetLink}`,
    html: `
      <!DOCTYPE html>
      <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Password</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              width: 100%;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #fff;
              border-radius: 8px;
              box-shadow: 0 0 15px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
            }
            .header h1 {
              color: #4CAF50;
              font-size: 24px;
            }
            .content {
              font-size: 16px;
              line-height: 1.5;
              color: #333;
              margin-bottom: 20px;
            }
            .btn {
              display: inline-block;
              background-color: #4CAF50;
              color: #fff;
              padding: 15px 30px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: bold;
              text-align: center;
              margin: 20px 0;
              font-size: 16px;
            }
            .footer {
              font-size: 14px;
              color: #777;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Khôi phục mật khẩu</h1>
            </div>
            <div class="content">
              <p>Chào bạn,</p>
              <p>Chúng tôi nhận thấy có yêu cầu khôi phục mật khẩu từ tài khoản của bạn. Nếu bạn không yêu cầu thay đổi mật khẩu, vui lòng bỏ qua email này.</p>
              <p>Để tiếp tục quá trình khôi phục, vui lòng nhấp vào nút dưới đây:</p>
              <a href="${resetLink}" class="btn">Đặt lại mật khẩu</a>
              <p>Link khôi phục này sẽ hết hạn trong 1 giờ.</p>
            </div>
            <div class="footer">
              <p>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi.</p>
              <p>Trân trọng, <br/> Đội ngũ hỗ trợ khách hàng</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });

  console.log(`Reset password email sent to ${email} with link: ${resetLink}`);
};

// --- SERVICE CHO RESET PASSWORD ---
AuthService.resetPassword = async (token, newPassword) => {
  try {
    console.log("Reset password token:", token);
    console.log("NewPassword:", newPassword);
    // 1. Xác thực token
    const decoded = jwt.verify(token, authConfig.jwtResetPasswordSecret);
    const { id, role } = decoded;

    console.log("Decoded token:", id, role);

    // 2. Lấy thông tin người dùng
    let userModel = role === "NhanVien" ? NhanVienModel : NhaDauTuModel;
    const user =
      role === "NhanVien"
        ? await userModel.findByMaNV(id)
        : await userModel.findByMaNDT(id);

    if (!user) {
      throw new NotFoundError("Người dùng không tồn tại.");
    }

    // 3. Hash mật khẩu mới
    const newHashedPassword = await passwordHasher.hashPassword(newPassword);

    // 4. Cập nhật mật khẩu mới
    await userModel.updatePasswordHash(id, newHashedPassword);
    console.log(`Password reset successfully for user ${id}`);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError("Reset token đã hết hạn.");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError("Reset token không hợp lệ.");
    }
    throw new AppError("Lỗi khi đặt lại mật khẩu.", 500);
  }
};

module.exports = AuthService;
