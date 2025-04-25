// routes/portfolio.routes.js
const express = require("express");
const router = express.Router();
const portfolioController = require("../controllers/portfolio.controller");
const { verifyToken } = require("../middleware/authJwt");
const { isNhaDauTu } = require("../middleware/verifyRole"); // Chỉ cho phép Nhà Đầu Tư
const {
  maCpParamValidationRules,
} = require("../middleware/validators/coPhieuValidator"); // Validator cho MaCP
// Áp dụng middleware xác thực và phân quyền (chỉ Nhà Đầu Tư)
router.use(verifyToken, isNhaDauTu);

// GET /api/portfolio/balances -> Lấy số dư tiền của NDT đang đăng nhập
router.get("/balances", portfolioController.getMyBalances);

// GET /api/portfolio/stocks -> Lấy danh mục cổ phiếu của NDT đang đăng nhập
router.get("/stocks", portfolioController.getMyPortfolio);

// POST /api/portfolio/withdraw -> Nhà đầu tư rút tiền
// Cần validator cho body (maTK, soTien)
router.post(
  "/withdraw",
  // withdrawValidator.validateSelfWithdraw, // Ví dụ
  portfolioController.investorWithdraw
);

// GET /api/portfolio/stocks/:maCP/quantity
router.get(
  "/stocks/:maCP/quantity", // Đặt tên route rõ ràng
  maCpParamValidationRules("maCP"), // Validate MaCP từ param
  portfolioController.getStockQuantity // Gọi controller mới
);

module.exports = router;
