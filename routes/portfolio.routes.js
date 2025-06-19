/**
 * routes/portfolio.routes.js
 * Định nghĩa các route liên quan đến danh mục đầu tư (portfolio) cho Nhà Đầu Tư.
 */
const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolio.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhaDauTu } = require('../middleware/verifyRole');
const {
  maCpParamValidationRules,
} = require('../middleware/validators/coPhieuValidator');

router.use(verifyToken, isNhaDauTu);

router.get('/balances', portfolioController.getMyBalances);

router.get('/stocks', portfolioController.getMyPortfolio);

router.post('/withdraw', portfolioController.investorWithdraw);

router.get(
  '/stocks/:maCP/quantity',
  maCpParamValidationRules('maCP'),
  portfolioController.getStockQuantity
);

module.exports = router;
