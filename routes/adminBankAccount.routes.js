/**
 * routes/adminBankAccount.routes.js
 * Định nghĩa các route CRUD cho tài khoản ngân hàng (TKNH) của admin.
 */
const express = require('express');
const router = express.Router();
const adminBankAccountController = require('../controllers/adminBankAccount.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhanVien } = require('../middleware/verifyRole');
const {
  maTkParamValidation,
  createBankAccountValidationRules,
  updateBankAccountValidationRules,
} = require('../middleware/validators/taikhoanNganHangValidator');

router.use(verifyToken, isNhanVien);

router.get('/', adminBankAccountController.getAllBankAccounts);

router.post(
  '/',
  createBankAccountValidationRules(),
  adminBankAccountController.createBankAccount
);

router.get(
  '/:maTK',
  maTkParamValidation(),
  adminBankAccountController.getBankAccountById
);

router.put(
  '/:maTK',
  updateBankAccountValidationRules(),
  adminBankAccountController.updateBankAccount
);

router.delete(
  '/:maTK',
  maTkParamValidation(),
  adminBankAccountController.deleteBankAccount
);

module.exports = router;
