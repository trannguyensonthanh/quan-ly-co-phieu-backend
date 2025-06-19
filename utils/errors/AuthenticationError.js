// utils/errors/AuthenticationError.js
// Định nghĩa lớp lỗi xác thực

const AppError = require('./AppError');

class AuthenticationError extends AppError {
  /**
   * Lỗi xác thực
   * @param {string} message
   */
  constructor(message) {
    super(message || 'Xác thực thất bại.', 401);
  }
}

module.exports = AuthenticationError;
