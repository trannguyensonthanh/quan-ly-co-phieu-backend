const AppError = require("./AppError");

class AuthenticationError extends AppError {
  constructor(message) {
    super(message || "Xác thực thất bại.", 401); // 401 Unauthorized
  }
}

module.exports = AuthenticationError;
