const AppError = require("./AppError");

class NotFoundError extends AppError {
  constructor(message) {
    super(message || "Không tìm thấy tài nguyên được yêu cầu.", 404); // 404 Not Found
  }
}

module.exports = NotFoundError;
