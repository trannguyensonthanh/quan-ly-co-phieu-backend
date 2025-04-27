// controllers/auth.controller.js
const AuthService = require("../services/auth.service");
const { validationResult } = require("express-validator"); // Sẽ dùng
const BadRequestError = require("../utils/errors/BadRequestError");

exports.signin = async (req, res, next) => {
  // Nhận cả req, res, next
  const { username, password } = req.body;
  if (!username || !password) {
    return next(
      new BadRequestError("Vui lòng cung cấp tên đăng nhập và mật khẩu.")
    );
  }

  try {
    // <<<--- THÊM TRY...CATCH Ở ĐÂY ĐỂ BẮT LỖI TỪ SERVICE
    // Truyền `res` vào hàm signIn của service
    const userData = await AuthService.signIn(username, password, res);
    // Service đã set cookie, giờ chỉ cần gửi response body
    res.status(200).send(userData);
  } catch (error) {
    // Chuyển lỗi từ service đến errorHandler
    next(error);
  }
};

// Controller đổi mật khẩu
exports.changePassword = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(", ");

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(), // Giữ danh sách lỗi chi tiết
    });
  }
  const userId = req.user.id;
  const userRole = req.user.role;
  const { oldPassword, newPassword } = req.body;

  const result = await AuthService.changePassword(
    userId,
    userRole,
    oldPassword,
    newPassword
  );
  res.status(200).send(result);
};

// Thêm controller cho signUp, signOut... nếu cần
// Controller đăng kí NDT
exports.signup = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(", ");

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(), // Giữ danh sách lỗi chi tiết
    });
  }

  // Lấy MaNDT, password và các thông tin khác từ body
  const {
    MaNDT,
    password,
    HoTen,
    NgaySinh,
    DiaChi,
    Phone,
    CMND,
    GioiTinh,
    Email,
  } = req.body;
  const signUpData = {
    MaNDT,
    password,
    HoTen,
    NgaySinh,
    DiaChi,
    Phone,
    CMND,
    GioiTinh,
    Email,
  };

  const newUser = await AuthService.signUp(signUpData);
  // Sử dụng newUser trả về từ service (nếu có chỉnh sửa service)
  const { password: _, ...userResult } = signUpData; // Hoặc lấy từ newUser nếu service trả về đúng
  res
    .status(201)
    .send({ message: "Đăng kí Nhà Đầu Tư thành công!", user: userResult });
};

// --- CONTROLLER MỚI CHO REFRESH TOKEN ---
exports.refreshToken = async (req, res, next) => {
  // Lấy refresh token từ cookie mà backend đã set
  const { refreshToken } = req.cookies; // Sử dụng cookie-parser đã thêm ở app.js

  if (!refreshToken) {
    // Nếu không có refresh token trong cookie -> lỗi
    // Không dùng next() ở đây vì muốn trả lỗi cụ thể cho refresh
    return res.status(403).send({ message: "Refresh Token is required!" }); // Forbidden hoặc Unauthorized
  }

  try {
    // Gọi service để xác thực refresh token và tạo access token mới
    const newAccessTokenData = await AuthService.refreshToken(refreshToken);
    // Service sẽ trả về { accessToken: '...' } nếu thành công
    res.status(200).json(newAccessTokenData);
  } catch (error) {
    // Nếu service ném lỗi (vd: token không hợp lệ, hết hạn)
    // Chuyển lỗi đến errorHandler
    // ErrorHandler sẽ xử lý các lỗi JWT như TokenExpiredError, JsonWebTokenError
    // Hoặc các lỗi AuthenticationError/AuthorizationError nếu service ném ra
    if (error.status === 401 || error.status === 403) {
      // Trả về lỗi cụ thể từ controller nếu muốn kiểm soát response chặt chẽ hơn
      return res.status(error.status).send({ message: error.message });
    }
    next(error); // Gửi các lỗi khác đến errorHandler chung
  }
};

// --- CONTROLLER MỚI CHO LOGOUT ---
exports.logout = async (req, res, next) => {
  try {
    // Lấy refresh token từ cookie để chuyển cho service (dù service có thể ko dùng đến nhiều)
    const { refreshToken } = req.cookies;

    // Gọi service để xử lý logout (hiện tại chủ yếu là để log hoặc làm việc khác nếu cần)
    // await AuthService.logout(refreshToken); // Service hiện tại không làm gì nhiều

    // Bước quan trọng: Yêu cầu trình duyệt xóa cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      // path: '/api/auth' // Đảm bảo các tùy chọn khớp với lúc set cookie
    });

    res.status(200).send({ message: "Đăng xuất thành công!" });
  } catch (error) {
    // Mặc dù service logout hiện tại đơn giản, vẫn nên có catch phòng trường hợp tương lai
    console.error("Error during logout:", error);
    next(error); // Chuyển lỗi đến errorHandler
  }
};

// --- CONTROLLER MỚI CHO FORGOT PASSWORD ---
exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ message: "Email is required!" });
  }

  try {
    // Gọi service để xử lý gửi email reset password
    await AuthService.forgotPassword(email);
    res
      .status(200)
      .send({ message: "Reset password email sent successfully!" });
  } catch (error) {
    next(error); // Chuyển lỗi đến errorHandler
  }
};

// --- CONTROLLER MỚI CHO RESET PASSWORD ---
exports.resetPassword = async (req, res, next) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res
      .status(400)
      .send({ message: "Token and new password are required!" });
  }

  try {
    // Gọi service để xử lý đặt lại mật khẩu
    await AuthService.resetPassword(token, newPassword);
    res.status(200).send({ message: "Password reset successfully!" });
  } catch (error) {
    next(error); // Chuyển lỗi đến errorHandler
  }
};
