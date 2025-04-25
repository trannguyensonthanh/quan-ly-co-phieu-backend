// routes/nhadautu.routes.js
const express = require("express");
const router = express.Router();
const ndtController = require("../controllers/nhadautu.controller");
const { verifyToken } = require("../middleware/authJwt");
const { isNhanVien } = require("../middleware/verifyRole");
const ndtValidator = require("../middleware/validators/nhadautuValidator");
const tknhValidator = require("../middleware/validators/taikhoanNganHangValidator");
const statementValidator = require("../middleware/validators/statementValidator"); // Import validator
const cashTransactionValidator = require("../middleware/validators/cashTransactionValidator"); // Import validator

// --- Routes cho Tài Khoản Ngân Hàng (TKNH) liên kết với NDT ---
// GET /api/nhadautu/:mandt/taikhoan -> Lấy danh sách TKNH của NDT
router.get(
  "/:mandt/taikhoan",
  tknhValidator.maNdtParamValidation(),
  ndtController.findTKNHByNDT
); // Reuse mandt validation

// Áp dụng middleware xác thực và phân quyền cho tất cả route NDT (chỉ Nhân Viên)
router.use(verifyToken, isNhanVien);

// --- Routes cho Nhà Đầu Tư (NDT) ---
// POST /api/nhadautu -> Tạo NDT mới
router.post("/", ndtValidator.createNdtValidation(), ndtController.createNDT);

// GET /api/nhadautu -> Lấy danh sách NDT
router.get("/", ndtController.findAllNDT);

// GET /api/nhadautu/:mandt -> Lấy chi tiết NDT (bao gồm TKNH)
router.get(
  "/:mandt",
  ndtValidator.maNdtParamValidation(),
  ndtController.findOneNDT
);

// PUT /api/nhadautu/:mandt -> Cập nhật thông tin NDT (không gồm mật khẩu, cmnd)
router.put(
  "/:mandt",
  ndtValidator.updateNdtValidation(),
  ndtController.updateNDT
);

// DELETE /api/nhadautu/:mandt -> Xóa NDT (cẩn thận!)
router.delete(
  "/:mandt",
  ndtValidator.maNdtParamValidation(),
  ndtController.deleteNDT
);

// POST /api/nhadautu/:mandt/taikhoan -> Thêm TKNH mới cho NDT
router.post(
  "/:mandt/taikhoan",
  tknhValidator.createTKNHValidation(),
  ndtController.addTKNH
);

// // PUT /api/nhadautu/taikhoan/:matk -> Cập nhật TKNH (theo MaTK)
// router.put(
//   "/taikhoan/:matk",
//   tknhValidator.updateTKNHValidation(),
//   ndtController.updateTKNH
// );

// // DELETE /api/nhadautu/taikhoan/:matk -> Xóa TKNH (theo MaTK)
// router.delete(
//   "/taikhoan/:matk",
//   tknhValidator.maTkParamValidation(),
//   ndtController.deleteTKNH
// );

// --- Routes Tra cứu cho Nhân Viên ---
// GET /api/nhadautu/:mandt/balance -> Lấy số dư tiền của NDT
router.get(
  "/:mandt/balance",
  ndtValidator.maNdtParamValidation(), // Validate MaNDT
  ndtController.getNDTBalances
);

// GET /api/nhadautu/:mandt/portfolio -> Lấy danh mục cổ phiếu của NDT
router.get(
  "/:mandt/portfolio",
  ndtValidator.maNdtParamValidation(), // Validate MaNDT
  ndtController.getNDTPortfolio
);

// --- Route Sao Kê cho Nhân Viên ---
// GET /api/nhadautu/:mandt/statement/orders?tuNgay=...&denNgay=... -> Lấy sao kê lệnh của NDT
router.get(
  "/:mandt/statement/orders",
  [
    // Mảng các middleware validator
    statementValidator.maNdtParamValidation(), // Validate :mandt
    statementValidator.dateRangeQueryValidation(), // Validate query params
  ],
  ndtController.getInvestorOrderStatement
);

// --- Route Sao Kê Lệnh Khớp cho Nhân Viên ---
// GET /api/nhadautu/:mandt/statement/matched-orders?tuNgay=...&denNgay=... -> Lấy sao kê lệnh khớp của NDT
router.get(
  "/:mandt/statement/matched-orders",
  [
    // Mảng validators
    statementValidator.maNdtParamValidation(),
    statementValidator.dateRangeQueryValidation(),
  ],
  ndtController.getInvestorMatchedOrderStatement
);

// GET /api/nhadautu/:mandt/statement/cash?tuNgay=...&denNgay=... => Lấy sao kê tiền mặt của NDT
router.get(
  "/:mandt/statement/cash",
  [
    // Mảng validators
    statementValidator.maNdtParamValidation(),
    statementValidator.dateRangeQueryValidation(),
  ],
  ndtController.getInvestorCashStatement
);

// POST /api/nhadautu/accounts/deposit -> Nhân viên nạp tiền
// Cần validator để kiểm tra maTK, soTien trong body
router.post(
  "/accounts/deposit",
  cashTransactionValidator.validateDepositOrWithdraw, // Ví dụ validator
  ndtController.adminDeposit
);

// POST /api/nhadautu/accounts/withdraw -> Nhân viên rút tiền
// Cần validator tương tự
router.post(
  "/accounts/withdraw",
  cashTransactionValidator.validateDepositOrWithdraw, // Ví dụ validator
  ndtController.adminWithdraw
);

// GET /api/nhadautu/:mandt/statement/deposits-withdrawals -> Lấy lịch sử GD Tiền của NĐT
router.get(
  "/:mandt/statement/deposits-withdrawals",
  [
    // Kết hợp validator cho MaNDT và ngày tháng
    statementValidator.maNdtParamValidation(),
    statementValidator.dateRangeQueryValidation(),
  ],
  ndtController.getInvestorDepositWithdrawHistory // Gọi controller mới
);

// GET /api/nhadautu/:mandt/accounts/:maTK/cash-statement-detail?tuNgay=...&denNgay=... => Lấy sao kê tài khoản tiền chi tiết cho admin
router.get(
  "/:mandt/accounts/:maTK/cash-statement-detail",
  (req, res, next) => {
    console.log("Request Params:", req.params);
    console.log("Query Params:", req.query);
    next();
  },
  [
    // Validate MaNDT, MaTK, và ngày tháng
    statementValidator.maNdtParamValidation(), // Đảm bảo validator này tồn tại
    statementValidator.maTkParamValidation(),
    statementValidator.dateRangeQueryValidation(),
  ],
  ndtController.getInvestorAccountCashStatementDetail
);

module.exports = router;
