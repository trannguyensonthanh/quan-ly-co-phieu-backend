// app.js
const express = require("express");
const cors = require("cors");
const db = require("./models/db"); // Import module db để có thể gọi connectDb
const errorHandler = require("./middleware/errorHandler"); // Sẽ tạo file này sau
const cookieParser = require("cookie-parser"); // Thêm cookie-parser để xử lý cookies
const app = express();

// --- Middleware ---

// Cho phép CORS từ mọi nguồn (điều chỉnh cho môi trường production sau)
app.use(
  cors({
    // Cấu hình CORS để cho phép gửi cookie từ frontend (nếu frontend ở domain khác)
    origin: [
      process.env.FRONTEND_URL || "http://localhost:8081",
      "http://192.168.56.1:8081",
      "http://10.241.4.99:8081/", // Thêm URL frontend mới
    ], // Thay bằng URL frontend của bạn
    credentials: true, // Quan trọng để cho phép gửi cookie
  })
);

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// --- Kết nối Database ---
// Gọi hàm kết nối database khi ứng dụng khởi động
db.connectDb().catch((err) => {
  console.error(
    "Failed to connect to the database. Application cannot start.",
    err
  );
  process.exit(1); // Thoát ứng dụng nếu không kết nối được DB
});

// --- Routes ---

// Route thử nghiệm
app.get("/", (req, res) => {
  res.json({
    message: "Chào mừng bạn đến với API Quản lý Giao dịch Cổ phiếu!",
  });
});

// Placeholder cho các routes chính (sẽ thêm sau)
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes"); // Import route mới
const coPhieuRoutes = require("./routes/cophieu.routes"); // Import route cổ phiếu
const nhaDauTuRoutes = require("./routes/nhadautu.routes");
const portfolioRoutes = require("./routes/portfolio.routes");
const tradingRoutes = require("./routes/trading.routes"); // Import trading routes
const statementRoutes = require("./routes/statement.routes"); // Import statement routes
const adminRoutes = require("./routes/admin.routes");
const marketRoutes = require("./routes/market.routes"); // Import market routes
// const nhanvienRoutes = require('./routes/nhanvien.routes');
const nganHangRoutes = require("./routes/nganHang.routes");
const adminBankAccountRoutes = require("./routes/adminBankAccount.routes"); // <<< IMPORT ROUTE MỚI

// ... (các routes khác)
app.get("/", (req, res) => {
  /* ... */
});
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/cophieu", coPhieuRoutes);
// app.use('/api/nhanvien', nhanvienRoutes); // Ví dụ tiền tố /api/nhanvien
app.use("/api/nhadautu", nhaDauTuRoutes); // Ví dụ tiền tố /api/nhadautu
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/trading", tradingRoutes);
app.use("/api/statement", statementRoutes); // Sử dụng statement routes\
app.use("/api/admin", adminRoutes);
app.use("/api/market", marketRoutes); // Sử dụng market routes
app.use("/api/banks", nganHangRoutes);
app.use("/api/admin/bank-accounts", adminBankAccountRoutes);
// ...

// --- Error Handling Middleware ---
// Middleware này phải được đặt SAU các routes
app.use(errorHandler); // Sẽ uncomment sau khi tạo file errorHandler

module.exports = app; // Export Express app để server.js sử dụng
