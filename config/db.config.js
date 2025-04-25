// config/db.config.js
require("dotenv").config(); // Load biến môi trường từ file .env

module.exports = {
  user: process.env.DB_USER, // Tên đăng nhập SQL Server
  password: process.env.DB_PASSWORD, // Mật khẩu SQL Server
  server: process.env.DB_SERVER, // Tên server hoặc IP address
  database: process.env.DB_DATABASE, // Tên cơ sở dữ liệu
  options: {
    encrypt: false, // Sử dụng true nếu kết nối tới Azure SQL Database
    trustServerCertificate: true, // Sử dụng true cho local dev hoặc khi không có SSL certificate hợp lệ
    useUTC: false,
  },
  pool: {
    // Cấu hình connection pool (tùy chọn nhưng khuyến nghị)
    max: 10, // Số lượng connection tối đa trong pool
    min: 0, // Số lượng connection tối thiểu
    idleTimeoutMillis: 30000, // Thời gian connection có thể nhàn rỗi trước khi bị đóng (ms)
  },
};
