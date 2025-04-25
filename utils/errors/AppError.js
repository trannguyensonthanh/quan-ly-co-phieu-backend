class AppError extends Error {
  constructor(message, statusCode) {
    super(message); // Gọi constructor của lớp Error cha

    this.statusCode = statusCode;
    // Xác định status dựa trên statusCode (4xx là 'fail', còn lại là 'error')
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    // Đánh dấu đây là lỗi có thể dự đoán trước (lỗi nghiệp vụ, validation,...)
    this.isOperational = true;

    // Ghi lại stack trace, loại bỏ constructor này khỏi stack
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
