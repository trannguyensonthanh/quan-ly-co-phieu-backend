/**
 * routes/trading.routes.js
 * Định nghĩa các route liên quan đến giao dịch (trading) cho Nhà Đầu Tư.
 */
const express = require('express');
const router = express.Router();
const tradingController = require('../controllers/trading.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhaDauTu } = require('../middleware/verifyRole');
const {
  placeOrderValidationRules,
  modifyOrderValidationRules,
} = require('../middleware/validators/tradingValidator');
const {
  cancelOrderValidationRules,
} = require('../middleware/validators/tradingValidator');

router.use(verifyToken, isNhaDauTu);

router.post(
  '/buy',
  placeOrderValidationRules(),
  tradingController.placeBuyOrder
);

router.post(
  '/sell',
  placeOrderValidationRules(),
  tradingController.placeSellOrder
);

router.delete(
  '/orders/:magd',
  cancelOrderValidationRules(),
  tradingController.cancelOrder
);

router.put(
  '/orders/:maGD',
  modifyOrderValidationRules(),
  tradingController.modifyOrder
);

module.exports = router;
