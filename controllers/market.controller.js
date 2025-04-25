// controllers/market.controller.js
const MarketService = require("../services/market.service");
const StockService = require("../services/stock.service"); // Sử dụng service cổ phiếu
const AppError = require("../utils/errors/AppError");
const { validationResult } = require("express-validator");
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
    return res.status(400).json({ errors: errors.array() });
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
