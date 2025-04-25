// routes/trading.routes.js
const express = require("express");
const router = express.Router();
const tradingController = require("../controllers/trading.controller");
const { verifyToken } = require("../middleware/authJwt");
const { isNhaDauTu } = require("../middleware/verifyRole"); // Chỉ Nhà Đầu Tư được đặt lệnh
const {
  placeOrderValidationRules,
  modifyOrderValidationRules,
} = require("../middleware/validators/tradingValidator");
const {
  cancelOrderValidationRules,
} = require("../middleware/validators/tradingValidator");
// Áp dụng middleware xác thực và phân quyền cho tất cả route trading
router.use(verifyToken, isNhaDauTu);

// POST /api/trading/buy -> Đặt lệnh mua
router.post(
  "/buy",
  placeOrderValidationRules(),
  tradingController.placeBuyOrder
);

// POST /api/trading/sell -> Đặt lệnh bán
router.post(
  "/sell",
  placeOrderValidationRules(), // Sử dụng lại validator cũ
  tradingController.placeSellOrder
);

// DELETE /api/trading/orders/:magd -> Hủy lệnh đặt
router.delete(
  "/orders/:magd",
  cancelOrderValidationRules(),
  tradingController.cancelOrder
);

// PUT /api/trading/orders/:maGD -> Sửa lệnh LO
router.put(
  "/orders/:maGD", // <<< Dùng PUT và cùng param
  modifyOrderValidationRules(), // <<< Dùng validator mới
  tradingController.modifyOrder // <<< Gọi controller mới
);

/* // Hoặc dùng PUT/PATCH nếu muốn
router.put(
  '/orders/:magd/cancel',
   cancelOrderValidationRules(),
   tradingController.cancelOrder
);
*/

module.exports = router;
