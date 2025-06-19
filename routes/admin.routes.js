/**
 * routes/admin.routes.js
 * Định nghĩa các route cho chức năng quản trị (admin) của hệ thống.
 */
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhanVien } = require('../middleware/verifyRole');
const adminValidator = require('../middleware/validators/adminValidator');
const coPhieuController = require('../controllers/cophieu.controller');
const validateRequest = require('../middleware/validateRequest');
const {
  dateRangeQueryValidation,
} = require('../middleware/validators/statementValidator');
const {
  adminResetPasswordValidationRules,
} = require('../middleware/validators/adminValidator');
const {
  maCpParamValidation,
  distributeStockValidationRules,
  maNdtParamValidation,
  updateDistributionValidationRules,
  relistStockValidationRules,
} = require('../middleware/validators/adminStockValidator');

router.get('/market/status', adminController.getMarketStatus);

router.use(verifyToken, isNhanVien);

router.post(
  '/accounts',
  adminValidator.createAccountValidationRules(),
  adminController.createAccount
);

router.put(
  '/accounts/:accountId',
  adminValidator.updateAccountValidationRules(),
  adminController.updateAccount
);

router.delete(
  '/accounts/:accountId',
  (req, res, next) => {
    next();
  },
  adminValidator.deleteAccountValidationRules(),
  adminController.deleteAccount
);

router.get('/users', adminController.getAllUsers);

router.delete(
  '/logins/:loginname',
  adminValidator.deleteLoginValidationRules(),
  adminController.deleteLogin
);

router.post('/device', adminController.createDevice);

router.post('/backup', adminController.backup);

router.post('/restore', adminController.restore);

router.get('/backup-history', adminController.getBackupHistory);

router.post('/market/trigger-ato', adminController.triggerATO);

router.post('/market/trigger-atc', adminController.triggerATC);

router.post('/market/prepare-prices', adminController.prepareNextDayPrices);

router.post('/market/mode/auto', adminController.setModeAuto);

router.post('/market/mode/manual', adminController.setModeManual);

router.get(
  '/cash-transactions',
  dateRangeQueryValidation(),
  adminController.getAllCashTransactions
);

router.post('/undo-last-cophieu-action', coPhieuController.undoLastAction);

router.get('/undo-logs', adminController.getAllUndoLogs);

router.post('/market/trigger-continuous', adminController.triggerContinuous);

router.get(
  '/orders/all',
  dateRangeQueryValidation(),
  adminController.getAllOrders
);

router.put(
  '/accounts/:accountId/reset-password',
  adminResetPasswordValidationRules(),
  adminController.resetPassword
);

router.post(
  '/stocks/:maCP/distribute',
  distributeStockValidationRules(),
  adminController.distributeStock
);

router.get(
  '/stocks/:maCP/distribution',
  maCpParamValidation('maCP'),
  adminController.getDistributionList
);

router.put(
  '/stocks/:maCP/distribution/:maNDT',
  updateDistributionValidationRules(),
  adminController.updateInvestorDistribution
);

router.delete(
  '/stocks/:maCP/distribution/:maNDT',
  [maCpParamValidation('maCP'), maNdtParamValidation()],
  adminController.revokeInvestorDistribution
);

router.put(
  '/stocks/:maCP/relist',
  relistStockValidationRules(),
  coPhieuController.relistStock
);

module.exports = router;
