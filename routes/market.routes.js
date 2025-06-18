// routes/market.routes.js
const express = require('express');
const router = express.Router();
const marketController = require('../controllers/market.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhanVienOrNhaDauTu } = require('../middleware/verifyRole'); // Cho phép cả 2 xem
const {
  maCpParamValidationRules,
} = require('../middleware/validators/coPhieuValidator');
// GET /api/market/board -> Lấy dữ liệu bảng giá
// Có thể bỏ verifyToken, isNhanVienOrNhaDauTu nếu muốn public
router.get(
  '/board',
  // [verifyToken, isNhanVienOrNhaDauTu], // Yêu cầu đăng nhập
  marketController.getBoard
);

// GET /api/market/stocks/:maCP -> Lấy dữ liệu thị trường chi tiết của 1 mã CP
router.get(
  '/stocks/:maCP', // Đổi tên param thành maCP cho nhất quán
  [
    verifyToken,
    isNhanVienOrNhaDauTu,
    maCpParamValidationRules('maCP'), // <<< Truyền tên param vào validator
  ],
  marketController.getStockMarketData
);

// GET /api/market/stream -> Endpoint cho client kết nối SSE
// Middleware xác thực là tùy chọn, nếu muốn chỉ user đăng nhập mới nhận được stream
router.get(
  '/stream',
  // [verifyToken, isNhanVienOrNhaDauTu], // <<< Yêu cầu đăng nhập để nhận stream
  marketController.streamMarketData // Gọi controller xử lý SSE
);

module.exports = router;
