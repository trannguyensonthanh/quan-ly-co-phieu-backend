// utils/errors/AuthorizationError.js

const AppError = require('./AppError');

/**
 * AuthorizationError: Lỗi khi người dùng không có quyền thực hiện hành động.
 */
class AuthorizationError extends AppError {
  constructor(message) {
    super(message || 'Bạn không có quyền thực hiện hành động này.', 403);
  }
}

module.exports = AuthorizationError;
