// controllers/market.controller.js
const MarketService = require("../services/market.service");
const StockService = require("../services/stock.service"); // Sử dụng service cổ phiếu
const AppError = require("../utils/errors/AppError");
const { validationResult } = require("express-validator");
const marketEmitter = require("../marketEventEmitter");
const SSE = require("express-sse");
const CoPhieuModel = require("../models/CoPhieu.model"); // Import model cổ phiếu
const sse = new SSE();

// Controller lấy dữ liệu Bảng Giá
exports.getBoard = async (req, res, next) => {
  // Thêm next
  // --- Không cần try...catch ---
  const boardData = await StockService.getMarketBoard();
  res.status(200).send(boardData);
};

// GET /api/market/stocks/:maCP
exports.getStockMarketData = async (req, res, next) => {
  // Dùng maCpParamValidationRules
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(", ");

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(), // Giữ danh sách lỗi chi tiết
    });
  }
  const maCP = req.params.maCP; // Lấy từ param, đã validate
  console.log(`[Market Controller] Get Stock Market Data request for ${maCP}`);
  try {
    const stockData = await MarketService.getStockMarketData(maCP);
    res.status(200).send(stockData);
  } catch (error) {
    next(error); // Chuyển lỗi (NotFound, AppError) cho errorHandler
  }
};

// --- CONTROLLER MỚI CHO SSE STREAM ---
// GET /api/market/stream
exports.streamMarketData = (req, res) => {
  console.log("[SSE Controller] Client connected to market stream.");

  // === Cách 1: Dùng express-sse (Đơn giản hơn) ===
  sse.init(req, res);

  // (Tùy chọn) Gửi dữ liệu ban đầu ngay khi kết nối
  // MarketService.getMarketBoard()
  //    .then(boardData => sse.send(boardData, 'initialBoard')) // Gửi với tên event 'initialBoard'
  //    .catch(err => console.error('[SSE] Error sending initial board data:', err));

  // === Cách 2: Tự triển khai (Linh hoạt hơn) ===
  /*
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Quan trọng cho Nginx proxy
  res.flushHeaders(); // Gửi headers ngay lập tức

  // Hàm gửi dữ liệu xuống client
  const sendEvent = (eventName, data) => {
      const formattedData = JSON.stringify(data);
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${formattedData}\n\n`); // Format chuẩn của SSE
  };

  // Gửi comment để giữ kết nối (heartbeat)
  const heartbeatInterval = setInterval(() => {
      res.write(':ping\n\n');
  }, 15000); // Ví dụ: 15 giây

  // Gửi dữ liệu ban đầu (ví dụ)
  MarketService.getMarketBoard()
      .then(boardData => sendEvent('initialBoard', boardData))
      .catch(err => console.error('[SSE] Error sending initial board data:', err));


  // Lắng nghe sự kiện từ marketEmitter
  const marketUpdateListener = async (eventData) => {
      console.log('[SSE Handler] Received marketUpdate event for MaCP:', eventData.maCP);
      // Lấy dữ liệu mới nhất cho mã CP đó
      try {
          const updatedStockData = await CoPhieuModel.getMarketDataByMaCP(eventData.maCP);
          if (updatedStockData) {
              sendEvent('marketUpdate', updatedStockData); // Gửi dữ liệu cập nhật của mã CP đó
          }
      } catch (error) {
          console.error(`[SSE Handler] Error fetching updated data for ${eventData.maCP}:`, error);
      }
  };

  const orderBookUpdateListener = async (eventData) => {
       console.log('[SSE Handler] Received orderBookUpdate event for MaCP:', eventData.maCP);
       // Tương tự, lấy dữ liệu Top3 Mua/Bán mới nhất hoặc toàn bộ market data
        try {
          const updatedStockData = await CoPhieuModel.getMarketDataByMaCP(eventData.maCP); // Lấy lại cả dòng
          if (updatedStockData) {
              sendEvent('orderBookUpdate', updatedStockData); // Gửi với event name khác
          }
      } catch (error) {
          console.error(`[SSE Handler] Error fetching updated data for ${eventData.maCP}:`, error);
      }
  };

  marketEmitter.on('marketUpdate', marketUpdateListener);
  marketEmitter.on('orderBookUpdate', orderBookUpdateListener);


  // Xử lý khi client ngắt kết nối
  req.on('close', () => {
      console.log('[SSE Controller] Client disconnected.');
      clearInterval(heartbeatInterval); // Dừng gửi heartbeat
      // Xóa listener khỏi emitter để tránh memory leak
      marketEmitter.removeListener('marketUpdate', marketUpdateListener);
      marketEmitter.removeListener('orderBookUpdate', orderBookUpdateListener);
      res.end(); // Kết thúc response
  });
  */
};

// === Lắng nghe sự kiện và đẩy dữ liệu (NẾU DÙNG express-sse) ===
// Đặt listener này ở ngoài controller, chạy 1 lần khi module được load
const marketUpdateListenerSSE = async (eventData) => {
  console.log(
    "[SSE express-sse] Received marketUpdate event for MaCP:",
    eventData.maCP
  );
  try {
    const updatedStockData = await CoPhieuModel.getMarketDataByMaCP(
      eventData.maCP
    );
    if (updatedStockData) {
      // Gửi tới TẤT CẢ client đang kết nối, dùng tên event 'marketUpdate'
      sse.send(updatedStockData, "marketUpdate");
    }
  } catch (error) {
    console.error(
      `[SSE express-sse] Error fetching updated data for ${eventData.maCP}:`,
      error
    );
  }
};

const orderBookUpdateListenerSSE = async (eventData) => {
  console.log(
    "[SSE express-sse] Received orderBookUpdate event for MaCP:",
    eventData.maCP
  );
  try {
    const updatedStockData = await CoPhieuModel.getMarketDataByMaCP(
      eventData.maCP
    );
    if (updatedStockData) {
      // Gửi tới TẤT CẢ client đang kết nối, dùng tên event 'orderBookUpdate'
      sse.send(updatedStockData, "orderBookUpdate");
    }
  } catch (error) {
    console.error(
      `[SSE express-sse] Error fetching updated data for ${eventData.maCP}:`,
      error
    );
  }
};

// Chỉ đăng ký listener MỘT LẦN
if (!marketEmitter.listenerCount("marketUpdate") > 0) {
  // Kiểm tra để tránh đăng ký nhiều lần khi file reload (hot-reloading)
  marketEmitter.on("marketUpdate", marketUpdateListenerSSE);
  console.log("Registered SSE listener for 'marketUpdate'");
}
if (!marketEmitter.listenerCount("orderBookUpdate") > 0) {
  marketEmitter.on("orderBookUpdate", orderBookUpdateListenerSSE);
  console.log("Registered SSE listener for 'orderBookUpdate'");
}

// (Tùy chọn) Hủy đăng ký khi server tắt (khó thực hiện chính xác trong module này)
// process.on('SIGINT', () => {
//     marketEmitter.off('marketUpdate', marketUpdateListenerSSE);
//     marketEmitter.off('orderBookUpdate', orderBookUpdateListenerSSE);
// });
