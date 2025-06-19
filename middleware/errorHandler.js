/**
 * Middleware xử lý lỗi toàn cục cho ứng dụng Express.
 * Đặt tại: middleware/errorHandler.js
 */
const AppError = require('../utils/errors/AppError');

const handleDatabaseError = (err) => {
  if (err.number === 2627 || err.number === 2601) {
    const message = `Dữ liệu bị trùng lặp. ${err.message}`;
    return new AppError(message, 409);
  }
  if (err.number === 547) {
    const message = `Dữ liệu tham chiếu không hợp lệ. ${err.message}`;
    return new AppError(message, 400);
  }
  if (err.message.toLowerCase().includes('permission denied')) {
    return new AppError(
      'Không có quyền truy cập cơ sở dữ liệu hoặc thực hiện thao tác này.',
      403
    );
  }
  console.error('DATABASE ERROR:', err);
  return new AppError('Đã xảy ra lỗi với cơ sở dữ liệu.', 500);
};

const handleJWTError = () =>
  new AppError('Token không hợp lệ. Vui lòng đăng nhập lại.', 401);
const handleJWTExpiredError = () =>
  new AppError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);

/**
 * Middleware chính xử lý lỗi
 */
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  err.message = err.message || 'Đã có lỗi xảy ra!';

  console.error('ERROR 💥:', {
    statusCode: err.statusCode,
    status: err.status,
    message: err.message,
    errorObject: err,
  });

  let error = { ...err, message: err.message };

  if (error.number && typeof error.number === 'number') {
    error = handleDatabaseError(error);
  } else if (error.name === 'JsonWebTokenError') {
    error = handleJWTError();
  } else if (error.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }

  if (error.isOperational) {
    res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
    });
  } else {
    res.status(500).json({
      status: 'error',
      message: 'Đã xảy ra lỗi hệ thống không mong muốn!',
    });
  }
};

module.exports = errorHandler;
