// config/auth.config.js - Cấu hình xác thực và JWT

require('dotenv').config(); // Để lấy JWT_SECRET từ .env

module.exports = {
  secret:
    process.env.JWT_SECRET || 'default-very-secret-key-change-in-production',
  jwtExpiration: 3600,
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-key',
  jwtRefreshExpirationString: '7d',
  jwtRefreshCookieExpirationMs: 7 * 24 * 60 * 60 * 1000,
  jwtResetPasswordSecret:
    process.env.JWT_RESET_PASSWORD_SECRET ||
    'default-reset-password-secret-key',
  jwtResetPasswordExpiration: 3600,
  resetPasswordUrl:
    process.env.RESET_PASSWORD_URL || 'http://localhost:8081/reset-password',
};
