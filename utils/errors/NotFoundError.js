// utils/errors/NotFoundError.js

/**
 * NotFoundError class - Lỗi không tìm thấy tài nguyên (404 Not Found)
 */
const AppError = require('./AppError');

class NotFoundError extends AppError {
  constructor(message) {
    super(message || 'Không tìm thấy tài nguyên được yêu cầu.', 404);
  }
}

module.exports = NotFoundError;
