// server.js
const app = require('./app'); // Import Express app từ app.js
const serverConfig = require('./config/server.config'); // Sẽ tạo file này sau
const { startAutoProcess, stopAutoProcess } = require('./autoMarketProcess');
const {
  startAutoScheduler,
  stopAutoScheduler,
} = require('./autoMarketScheduler');
const matchingWorker = require('./matchingWorker');
const db = require('./models/db');
// Lấy port từ biến môi trường hoặc dùng giá trị mặc định
const PORT = process.env.PORT || serverConfig.PORT || 3000;

// Khởi chạy server
const server = app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}.`);
  // --- KHỞI ĐỘNG TIẾN TRÌNH TỰ ĐỘNG NẾU MODE LÀ AUTO ---
  // (Bạn có thể chọn khởi động mặc định hoặc không)
  // if (marketState.getOperatingMode() === 'AUTO') {
  //     startAutoProcess();
  // } else {
  //     console.log("Initial market mode is MANUAL. Auto process not started.");
  // }
  // Hoặc luôn khởi động bộ kiểm tra, nó sẽ tự dừng nếu mode là MANUAL
  // --- RESET BẢNG UNDO LOG KHI KHỞI ĐỘNG ---
  try {
    const CoPhieuUndoLogModel = require('./models/CoPhieuUndoLog.model');
    await CoPhieuUndoLogModel.clearAllLogs();
    console.log('Cleared previous Undo Logs on server start.');
  } catch (clearErr) {
    console.error('Error clearing Undo Logs on server start:', clearErr);
  }
  startAutoScheduler(); // <<< LUÔN KHỞI ĐỘNG INTERVAL CHECKER
});

// Xử lý các lỗi server không mong muốn (ví dụ: port đã được sử dụng)
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

  // Các thông báo lỗi cụ thể
  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// (Tùy chọn) Xử lý khi server dừng (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('Server is shutting down...');
  stopAutoScheduler(); // <<< Gọi hàm stop từ module lập lịch
  matchingWorker.removeListener(); // <<< Hủy đăng ký listener
  server.close(async () => {
    console.log('HTTP server closed.');
    // Đóng connection pool nếu có
    try {
      const pool = await db.getPool(); // Lấy pool hiện tại (nếu đã tạo)
      if (pool && pool.connected) {
        await pool.close();
        console.log('Database connection pool closed.');
      }
    } catch (err) {
      console.error('Error closing database pool:', err);
    } finally {
      process.exit(0);
    }
  });
});
