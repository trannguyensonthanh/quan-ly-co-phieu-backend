/**
 * controllers/market.controller.js
 * Controller for market-related endpoints (market board, stock data, SSE stream)
 */
const MarketService = require('../services/market.service');
const StockService = require('../services/stock.service');

const { validationResult } = require('express-validator');
const marketEmitter = require('../marketEventEmitter');
const SSE = require('express-sse');
const CoPhieuModel = require('../models/CoPhieu.model');
const sse = new SSE();

/**
 * Controller lấy dữ liệu Bảng Giá
 */
exports.getBoard = async (req, res, next) => {
  const boardData = await StockService.getMarketBoard();
  res.status(200).send(boardData);
};

/**
 * GET /api/market/stocks/:maCP
 */
exports.getStockMarketData = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maCP = req.params.maCP;
  console.log(`[Market Controller] Get Stock Market Data request for ${maCP}`);
  try {
    const stockData = await MarketService.getStockMarketData(maCP);
    res.status(200).send(stockData);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/market/stream (SSE stream)
 */
exports.streamMarketData = (req, res) => {
  console.log('[SSE Controller] Client connected to market stream.');
  sse.init(req, res);
};

const marketUpdateListenerSSE = async (eventData) => {
  console.log(
    '[SSE express-sse] Received marketUpdate event for MaCP:',
    eventData.maCP
  );
  try {
    const updatedStockData = await CoPhieuModel.getMarketDataByMaCP(
      eventData.maCP
    );
    if (updatedStockData) {
      sse.send(updatedStockData, 'marketUpdate');
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
    '[SSE express-sse] Received orderBookUpdate event for MaCP:',
    eventData.maCP
  );
  try {
    const updatedStockData = await CoPhieuModel.getMarketDataByMaCP(
      eventData.maCP
    );
    if (updatedStockData) {
      sse.send(updatedStockData, 'orderBookUpdate');
    }
  } catch (error) {
    console.error(
      `[SSE express-sse] Error fetching updated data for ${eventData.maCP}:`,
      error
    );
  }
};

if (!marketEmitter.listenerCount('marketUpdate') > 0) {
  marketEmitter.on('marketUpdate', marketUpdateListenerSSE);
  console.log("Registered SSE listener for 'marketUpdate'");
}
if (!marketEmitter.listenerCount('orderBookUpdate') > 0) {
  marketEmitter.on('orderBookUpdate', orderBookUpdateListenerSSE);
  console.log("Registered SSE listener for 'orderBookUpdate'");
}
