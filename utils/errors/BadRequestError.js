const AppError = require("./AppError");

class BadRequestError extends AppError {
  constructor(message) {
    super(message || "Yêu cầu không hợp lệ.", 400); // 400 Bad Request
  }
}

module.exports = BadRequestError;
