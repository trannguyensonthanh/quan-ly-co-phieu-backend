/**
 * AuthService - Xử lý xác thực và quản lý người dùng
 * File: services/auth.service.js
 */

const NhanVienModel = require('../models/NhanVien.model');
const NhaDauTuModel = require('../models/NhaDauTu.model');
const passwordHasher = require('../utils/passwordHasher');
const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth.config');
const sql = require('mssql');
const db = require('../models/db');
const AuthenticationError = require('../utils/errors/AuthenticationError');
const AppError = require('../utils/errors/AppError');
const NotFoundError = require('../utils/errors/NotFoundError');
const BadRequestError = require('../utils/errors/BadRequestError');
const ConflictError = require('../utils/errors/ConflictError');
const sendEmail = require('../utils/email.helper');
const AuthService = {};

/**
 * Đăng nhập
 */
AuthService.signIn = async (username, password, res) => {
  try {
    let user;
    let role;
    let passwordHashField;
    let userIdField;

    user = await NhanVienModel.findByMaNV(username);
    if (user) {
      role = 'NhanVien';
      passwordHashField = 'PasswordHash';
      userIdField = 'MaNV';
    } else {
      user = await NhaDauTuModel.findByMaNDT(username);
      if (user) {
        role = 'NhaDauTu';
        passwordHashField = 'MKGD';
        userIdField = 'MaNDT';
      }
    }

    if (!user) {
      throw new AuthenticationError('Tên đăng nhập hoặc mật khẩu không đúng.');
    }

    const userId = user[userIdField];

    const hashedPassword = user[passwordHashField];
    if (!hashedPassword) {
      throw new AuthenticationError('Tên đăng nhập hoặc mật khẩu không đúng.');
    }

    const passwordIsValid = await passwordHasher.comparePassword(
      password,
      hashedPassword
    );

    if (!passwordIsValid) {
      throw new AuthenticationError('Tên đăng nhập hoặc mật khẩu không đúng.');
    }

    const accessToken = jwt.sign(
      { id: userId, username: username, role: role },
      authConfig.secret,
      { expiresIn: authConfig.jwtExpiration }
    );

    const refreshToken = jwt.sign({ id: userId }, authConfig.jwtRefreshSecret, {
      expiresIn: authConfig.jwtRefreshExpirationString,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: authConfig.jwtRefreshCookieExpirationMs,
    });

    return {
      id: userId,
      username: username,
      email: user.Email,
      role: role,
      accessToken: accessToken,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Lỗi đăng nhập hệ thống.', 500);
  }
};

/**
 * Đổi mật khẩu
 */
AuthService.changePassword = async (
  userId,
  userRole,
  oldPassword,
  newPassword
) => {
  let userModel;
  let passwordHashField;
  const getUserWithHash = async (id) => {
    try {
      const pool = await db.getPool();
      const request = pool.request();
      let query;
      if (userRole === 'NhanVien') {
        userModel = NhanVienModel;
        passwordHashField = 'PasswordHash';
        request.input('MaNV', sql.NChar(20), id);
        query = `SELECT MaNV, ${passwordHashField} FROM NHANVIEN WHERE MaNV = @MaNV`;
      } else if (userRole === 'NhaDauTu') {
        userModel = NhaDauTuModel;
        passwordHashField = 'MKGD';
        request.input('MaNDT', sql.NChar(20), id);
        query = `SELECT MaNDT, ${passwordHashField} FROM NDT WHERE MaNDT = @MaNDT`;
      } else {
        throw new Error('Vai trò người dùng không hợp lệ.');
      }
      const result = await request.query(query);
      return result.recordset[0];
    } catch (err) {
      throw new Error('Lỗi khi truy vấn thông tin người dùng.');
    }
  };

  const user = await getUserWithHash(userId);

  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại.');
  }
  const currentHashedPassword = user[passwordHashField];
  if (!currentHashedPassword) {
    throw new AppError('Không thể xác thực mật khẩu cũ.', 500);
  }

  const isOldPasswordValid = await passwordHasher.comparePassword(
    oldPassword,
    currentHashedPassword
  );
  if (!isOldPasswordValid) {
    throw new BadRequestError('Mật khẩu cũ không chính xác.');
  }

  if (oldPassword === newPassword) {
    throw new BadRequestError('Mật khẩu mới không được trùng với mật khẩu cũ.');
  }

  const newHashedPassword = await passwordHasher.hashPassword(newPassword);

  try {
    if (!userModel) throw new Error('Lỗi xác định model người dùng.');
    await userModel.updatePasswordHash(userId, newHashedPassword);
    return { message: 'Đổi mật khẩu thành công.' };
  } catch (error) {
    throw new Error(`Lỗi khi cập nhật mật khẩu`);
  }
};

/**
 * Đăng ký Nhà Đầu Tư
 */
AuthService.signUp = async (signUpData) => {
  const { MaNDT, password, ...ndtInfo } = signUpData;

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

  const hashedPassword = await passwordHasher.hashPassword(password);

  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    await NhaDauTuModel.createInTransaction(
      request,
      { MaNDT, ...ndtInfo },
      hashedPassword
    );

    await transaction.commit();

    const { password: _, ...userResult } = { MaNDT, ...ndtInfo };
    return userResult;
  } catch (error) {
    if (transaction && transaction.active) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Làm mới Access Token từ Refresh Token
 */
AuthService.refreshToken = async (requestToken) => {
  if (!requestToken) {
    throw new AppError('Refresh Token is required!', 403);
  }

  try {
    const decoded = jwt.verify(requestToken, authConfig.jwtRefreshSecret);

    const userId = decoded.id;
    if (!userId) {
      throw new AuthenticationError('Invalid Refresh Token payload.');
    }

    let userExists =
      (await NhanVienModel.exists(userId)) ||
      (await NhaDauTuModel.exists(userId));
    if (!userExists) {
      throw new AuthenticationError(
        'User associated with this token no longer exists.'
      );
    }

    let userDetails = await NhanVienModel.findByMaNV(userId);
    let role = 'NhanVien';
    let username;
    if (!userDetails) {
      userDetails = await NhaDauTuModel.findByMaNDT(userId);
      role = 'NhaDauTu';
    }

    if (!userDetails) {
      throw new AuthenticationError(
        'User details not found for token refresh.'
      );
    }
    username = userDetails.MaNV || userDetails.MaNDT;

    const newAccessToken = jwt.sign(
      { id: userId, username: username, role: role },
      authConfig.secret,
      { expiresIn: authConfig.jwtExpiration }
    );

    return { accessToken: newAccessToken };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError(
        'Refresh token đã hết hạn, vui lòng đăng nhập lại.',
        403
      );
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Refresh token không hợp lệ.');
    }
    if (err instanceof AuthenticationError || err instanceof NotFoundError) {
      throw err;
    }
    throw new AppError('Lỗi khi làm mới phiên đăng nhập.', 500);
  }
};

/**
 * Đăng xuất
 */
AuthService.logout = async (requestToken) => {
  if (requestToken) {
    // Không lưu DB
  }
  return true;
};

/**
 * Quên mật khẩu
 */
AuthService.forgotPassword = async (email) => {
  let user = await NhanVienModel.findByEmail(email);
  let role = 'NhanVien';
  if (!user) {
    user = await NhaDauTuModel.findByEmail(email);
    role = 'NhaDauTu';
  }

  if (!user) {
    throw new NotFoundError('Email không tồn tại trong hệ thống.');
  }

  const resetToken = jwt.sign(
    { id: user.MaNV || user.MaNDT, role: role },
    authConfig.jwtResetPasswordSecret,
    { expiresIn: authConfig.jwtResetPasswordExpiration }
  );

  const resetLink = `${authConfig.resetPasswordUrl}?token=${resetToken}`;
  await sendEmail({
    to: email,
    subject: 'Reset Password',
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
};

/**
 * Đặt lại mật khẩu
 */
AuthService.resetPassword = async (token, newPassword) => {
  try {
    const decoded = jwt.verify(token, authConfig.jwtResetPasswordSecret);
    const { id, role } = decoded;

    let userModel = role === 'NhanVien' ? NhanVienModel : NhaDauTuModel;
    const user =
      role === 'NhanVien'
        ? await userModel.findByMaNV(id)
        : await userModel.findByMaNDT(id);

    if (!user) {
      throw new NotFoundError('Người dùng không tồn tại.');
    }

    const newHashedPassword = await passwordHasher.hashPassword(newPassword);

    await userModel.updatePasswordHash(id, newHashedPassword);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Reset token đã hết hạn.');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Reset token không hợp lệ.');
    }
    throw new AppError('Lỗi khi đặt lại mật khẩu.', 500);
  }
};

module.exports = AuthService;
