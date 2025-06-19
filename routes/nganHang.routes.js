/**
 * routes/nganHang.routes.js
 * Định nghĩa các routes CRUD cho quản lý ngân hàng.
 */
const express = require('express');
const router = express.Router();
const nganHangController = require('../controllers/nganHang.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhanVien } = require('../middleware/verifyRole');
const {
  maNHParamValidation,
  createNganHangValidationRules,
  updateNganHangValidationRules,
} = require('../middleware/validators/nganHangValidator');

router.use(verifyToken, isNhanVien);

router.get('/', nganHangController.getAllBanks);

router.post(
  '/',
  createNganHangValidationRules(),
  nganHangController.createBank
);

router.get('/:maNH', maNHParamValidation(), nganHangController.getBankById);

router.put(
  '/:maNH',
  updateNganHangValidationRules(),
  nganHangController.updateBank
);

router.delete('/:maNH', maNHParamValidation(), nganHangController.deleteBank);

module.exports = router;
