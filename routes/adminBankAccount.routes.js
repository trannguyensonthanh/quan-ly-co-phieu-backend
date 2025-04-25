// routes/adminBankAccount.routes.js
const express = require("express");
const router = express.Router();
const adminBankAccountController = require("../controllers/adminBankAccount.controller");
const { verifyToken } = require("../middleware/authJwt");
const { isNhanVien } = require("../middleware/verifyRole"); // Chỉ Admin
const {
  maTkParamValidation,
  createBankAccountValidationRules,
  updateBankAccountValidationRules,
} = require("../middleware/validators/taikhoanNganHangValidator");
// --- Middleware chung ---
router.use(verifyToken, isNhanVien);

// --- Định nghĩa Routes CRUD cho TKNH tổng quát ---

// GET /api/admin/bank-accounts -> Lấy tất cả TKNH
router.get("/", adminBankAccountController.getAllBankAccounts);

// POST /api/admin/bank-accounts -> Tạo TKNH mới cho NĐT
router.post(
  "/",
  createBankAccountValidationRules(),
  adminBankAccountController.createBankAccount
);

// GET /api/admin/bank-accounts/:maTK -> Lấy chi tiết TKNH theo MaTK
router.get(
  "/:maTK",
  maTkParamValidation(),
  adminBankAccountController.getBankAccountById
);

// PUT /api/admin/bank-accounts/:maTK -> Cập nhật TKNH
router.put(
  "/:maTK",
  updateBankAccountValidationRules(),
  adminBankAccountController.updateBankAccount
);

// DELETE /api/admin/bank-accounts/:maTK -> Xóa TKNH
router.delete(
  "/:maTK",
  maTkParamValidation(),
  adminBankAccountController.deleteBankAccount
);

module.exports = router;
