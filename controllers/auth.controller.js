// controllers/auth.controller.js
// Controller cho các chức năng xác thực: đăng nhập, đăng ký, đổi mật khẩu, refresh token, logout, quên mật khẩu, đặt lại mật khẩu

const AuthService = require('../services/auth.service');
const { validationResult } = require('express-validator');
const BadRequestError = require('../utils/errors/BadRequestError');

// Đăng nhập
exports.signin = async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return next(
      new BadRequestError('Vui lòng cung cấp tên đăng nhập và mật khẩu.')
    );
  }

  try {
    const userData = await AuthService.signIn(username, password, res);
    res.status(200).send(userData);
  } catch (error) {
    next(error);
  }
};

// Đổi mật khẩu
exports.changePassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
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

// Đăng ký Nhà Đầu Tư
exports.signup = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }

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
  const { password: _, ...userResult } = signUpData;
  res
    .status(201)
    .send({ message: 'Đăng kí Nhà Đầu Tư thành công!', user: userResult });
};

// Refresh Token
exports.refreshToken = async (req, res, next) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    return res.status(403).send({ message: 'Refresh Token is required!' });
  }

  try {
    const newAccessTokenData = await AuthService.refreshToken(refreshToken);
    res.status(200).json(newAccessTokenData);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return res.status(error.status).send({ message: error.message });
    }
    next(error);
  }
};

// Đăng xuất
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.status(200).send({ message: 'Đăng xuất thành công!' });
  } catch (error) {
    next(error);
  }
};

// Quên mật khẩu
exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ message: 'Email is required!' });
  }

  try {
    await AuthService.forgotPassword(email);
    res
      .status(200)
      .send({ message: 'Reset password email sent successfully!' });
  } catch (error) {
    next(error);
  }
};

// Đặt lại mật khẩu
exports.resetPassword = async (req, res, next) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res
      .status(400)
      .send({ message: 'Token and new password are required!' });
  }

  try {
    await AuthService.resetPassword(token, newPassword);
    res.status(200).send({ message: 'Password reset successfully!' });
  } catch (error) {
    next(error);
  }
};
