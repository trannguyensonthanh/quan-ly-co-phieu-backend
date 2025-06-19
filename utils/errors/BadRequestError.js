// utils/errors/BadRequestError.js

/**
 * BadRequestError class - dùng để xử lý lỗi 400 Bad Request
 */
const AppError = require('./AppError');

class BadRequestError extends AppError {
  constructor(message) {
    super(message || 'Yêu cầu không hợp lệ.', 400);
  }
}

module.exports = BadRequestError;
