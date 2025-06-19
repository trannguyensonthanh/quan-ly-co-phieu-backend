/**
 * routes/market.routes.js
 * Định nghĩa các route liên quan đến thị trường (market)
 */
const express = require('express');
const router = express.Router();
const marketController = require('../controllers/market.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhanVienOrNhaDauTu } = require('../middleware/verifyRole');
const {
  maCpParamValidationRules,
} = require('../middleware/validators/coPhieuValidator');

// GET /api/market/board
router.get('/board', marketController.getBoard);

// GET /api/market/stocks/:maCP
router.get(
  '/stocks/:maCP',
  [verifyToken, isNhanVienOrNhaDauTu, maCpParamValidationRules('maCP')],
  marketController.getStockMarketData
);

// GET /api/market/stream
router.get('/stream', marketController.streamMarketData);

module.exports = router;
