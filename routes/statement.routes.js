// routes/statement.routes.js
const express = require("express");
const router = express.Router();
const statementController = require("../controllers/statement.controller");
const { verifyToken } = require("../middleware/authJwt");
const { isNhaDauTu } = require("../middleware/verifyRole"); // Chỉ NDT tự xem
const {
  dateRangeQueryValidation,
  maTkParamValidation,
} = require("../middleware/validators/statementValidator");

// Áp dụng middleware xác thực và phân quyền
router.use(verifyToken, isNhaDauTu);

// GET /api/statement/orders -> Lấy sao kê giao dịch lệnh của NDT đang đăng nhập
router.get(
  "/orders",
  dateRangeQueryValidation(), // Validate tuNgay, denNgay từ query
  statementController.getMyOrderStatement
);

// GET /api/statement/matched-orders -> Lấy sao kê lệnh khớp của NDT đang đăng nhập
router.get(
  "/matched-orders",
  dateRangeQueryValidation(), // Sử dụng lại validator ngày tháng
  statementController.getMyMatchedOrderStatement
);

// GET /api/statement/cash -> Lấy sao kê tiền mặt của NDT đang đăng nhập
router.get(
  "/cash",
  dateRangeQueryValidation(), // Validator ngày tháng
  statementController.getMyCashStatement
);

// GET /api/statement/deposits-withdrawals -> Lấy lịch sử giao dịch tiền (Nạp/Rút) của chính NĐT
router.get(
  "/deposits-withdrawals",
  dateRangeQueryValidation(), // Validate ngày tháng
  statementController.getMyDepositWithdrawHistory // Gọi controller mới
);

// GET /api/statement/orders/today -> Lấy lệnh đặt của NĐT trong ngày hiện tại
router.get(
  "/orders/today",
  // Không cần validator ngày tháng ở đây
  statementController.getMyOrdersToday // Gọi controller mới
);

// GET /api/statement/matched-orders/today -> Lấy lệnh khớp của NĐT trong ngày hiện tại
router.get(
  "/matched-orders/today",
  // Không cần validator ngày tháng
  statementController.getMyMatchedOrdersToday // Gọi controller mới
);

// GET /api/statement/accounts/:maTK/cash-statement-detail?tuNgay=...&denNgay=... => Lấy sao kê tài khoản tiền chi tiết
router.get(
  "/accounts/:maTK/cash-statement-detail",
  [
    // Validate cả MaTK và ngày tháng
    maTkParamValidation(),
    dateRangeQueryValidation(),
  ],
  statementController.getMyAccountCashStatementDetail
);

// GET /api/statement/bank-accounts -> Lấy thông tin tất cả tài khoản ngân hàng của NĐT đang đăng nhập
router.get(
  "/bank-accounts",
  statementController.getMyBankAccounts // Gọi controller mới
);

module.exports = router;
