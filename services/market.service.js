// services/market.service.js
const CoPhieuModel = require("../models/CoPhieu.model");
const AppError = require("../utils/errors/AppError");
const NotFoundError = require("../utils/errors/NotFoundError");

const MarketService = {};

// /** Lấy dữ liệu Bảng giá tổng hợp */
// MarketService.getMarketBoard = async () => {
//     console.log("[Market Service] Getting full market board...");
//     try {
//         return await CoPhieuModel.getMarketBoardData();
//     } catch (error) { /* ... error handling ... */ throw error; }
// }; => tương lai còn thời gian sẽ đưa thằng này vào sau

// --- THÊM HÀM MỚI ---
/** Lấy dữ liệu thị trường chi tiết cho một mã CP */
MarketService.getStockMarketData = async (maCP) => {
  console.log(`[Market Service] Getting market data for ${maCP}...`);
  try {
    const marketData = await CoPhieuModel.getMarketDataByMaCP(maCP);
    if (!marketData) {
      // Có thể do MaCP không tồn tại, không có giá hôm nay, hoặc Status != 1
      throw new NotFoundError(
        `Không tìm thấy dữ liệu thị trường hoặc cổ phiếu '${maCP}' không hợp lệ/đang giao dịch.`
      );
    }
    return marketData;
  } catch (error) {
    console.error(`Error in getStockMarketData service for ${maCP}:`, error);
    if (error instanceof NotFoundError || error instanceof AppError)
      throw error;
    throw new AppError(
      `Lỗi khi lấy dữ liệu thị trường CP ${maCP}: ${error.message}`,
      500
    );
  }
};

module.exports = MarketService;
