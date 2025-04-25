const AppError = require("./AppError");

class AuthorizationError extends AppError {
  constructor(message) {
    super(message || "Bạn không có quyền thực hiện hành động này.", 403); // 403 Forbidden
  }
}

module.exports = AuthorizationError;
