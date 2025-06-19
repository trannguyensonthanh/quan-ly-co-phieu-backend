/**
 * services/market.service.js
 * Service layer for market-related operations.
 */
const CoPhieuModel = require('../models/CoPhieu.model');
const AppError = require('../utils/errors/AppError');
const NotFoundError = require('../utils/errors/NotFoundError');

const MarketService = {};

/**
 * Lấy dữ liệu thị trường chi tiết cho một mã CP
 */
MarketService.getStockMarketData = async (maCP) => {
  console.log(`[Market Service] Getting market data for ${maCP}...`);
  try {
    const marketData = await CoPhieuModel.getMarketDataByMaCP(maCP);
    if (!marketData) {
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
