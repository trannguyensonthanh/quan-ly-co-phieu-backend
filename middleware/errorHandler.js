// middleware/errorHandler.js
const AppError = require("../utils/errors/AppError"); // Import lớp base error (hoặc các lớp cụ thể nếu không dùng base)

// --- Hàm xử lý lỗi chi tiết (có thể tách ra để dễ quản lý) ---

// Xử lý lỗi từ thư viện mssql (ví dụ: lỗi ràng buộc)
const handleDatabaseError = (err) => {
  // Lỗi vi phạm Primary Key / Unique Constraint
  if (err.number === 2627 || err.number === 2601) {
    // Cố gắng trích xuất tên constraint hoặc thông tin gây lỗi từ message (khá phức tạp)
    // Ví dụ đơn giản:
    const message = `Dữ liệu bị trùng lặp. ${err.message}`;
    return new AppError(message, 409); // 409 Conflict
  }
  // Lỗi vi phạm Foreign Key
  if (err.number === 547) {
    // Ví dụ đơn giản:
    const message = `Dữ liệu tham chiếu không hợp lệ. ${err.message}`;
    return new AppError(message, 400); // 400 Bad Request
  }
  // Lỗi quyền truy cập DB
  if (err.message.toLowerCase().includes("permission denied")) {
    return new AppError(
      "Không có quyền truy cập cơ sở dữ liệu hoặc thực hiện thao tác này.",
      403
    );
  }

  // Các lỗi DB khác chưa xác định
  console.error("DATABASE ERROR:", err); // Log lỗi gốc để debug
  return new AppError("Đã xảy ra lỗi với cơ sở dữ liệu.", 500);
};

// Xử lý lỗi JWT
const handleJWTError = () =>
  new AppError("Token không hợp lệ. Vui lòng đăng nhập lại.", 401);
const handleJWTExpiredError = () =>
  new AppError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);

// --- Middleware chính ---
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Đặt giá trị mặc định nếu không có
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";
  err.message = err.message || "Đã có lỗi xảy ra!";

  // Log lỗi ra console (hoặc sử dụng logger nếu có)
  console.error("ERROR 💥:", {
    statusCode: err.statusCode,
    status: err.status,
    message: err.message,
    // stack: err.stack // Bật stack trace khi cần debug sâu
    errorObject: err, // Log cả object lỗi để xem chi tiết (vd: err.number từ mssql)
  });

  let error = { ...err, message: err.message }; // Tạo copy để tránh thay đổi lỗi gốc

  // Xử lý các lỗi cụ thể hơn
  if (error.number && typeof error.number === "number") {
    // Lỗi từ MSSQL thường có `number`
    error = handleDatabaseError(error);
  } else if (error.name === "JsonWebTokenError") {
    error = handleJWTError();
  } else if (error.name === "TokenExpiredError") {
    error = handleJWTExpiredError();
  }
  // Thêm các xử lý lỗi cụ thể khác ở đây nếu cần (ví dụ: lỗi từ express-validator nếu không dùng middleware riêng)

  // Chỉ trả về thông tin lỗi cần thiết cho client
  // Nếu là lỗi có thể dự đoán (operational), gửi message của nó
  // Nếu là lỗi lập trình hoặc không xác định, gửi message chung chung
  if (error.isOperational) {
    res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
    });
  } else {
    // 1) Log lỗi chi tiết (đã làm ở trên)
    // 2) Gửi response chung chung
    res.status(500).json({
      status: "error",
      message: "Đã xảy ra lỗi hệ thống không mong muốn!",
    });
  }
};

module.exports = errorHandler;
