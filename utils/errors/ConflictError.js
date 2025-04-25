const AppError = require("./AppError");

class ConflictError extends AppError {
  constructor(message) {
    super(message || "Xung đột tài nguyên.", 409); // 409 Conflict
  }
}

module.exports = ConflictError;
