// utils/errors/ConflictError.js

const AppError = require('./AppError');

/**
 * ConflictError class for handling resource conflict errors.
 */
class ConflictError extends AppError {
  constructor(message) {
    super(message || 'Xung đột tài nguyên.', 409);
  }
}

module.exports = ConflictError;
