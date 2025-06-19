/**
 * routes/statement.routes.js
 * Định nghĩa các route liên quan đến sao kê cho Nhà Đầu Tư (NĐT)
 */
const express = require('express');
const router = express.Router();
const statementController = require('../controllers/statement.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhaDauTu } = require('../middleware/verifyRole');
const {
  dateRangeQueryValidation,
  maTkParamValidation,
} = require('../middleware/validators/statementValidator');

// Áp dụng middleware xác thực và phân quyền
router.use(verifyToken, isNhaDauTu);

router.get(
  '/orders',
  dateRangeQueryValidation(),
  statementController.getMyOrderStatement
);

router.get(
  '/matched-orders',
  dateRangeQueryValidation(),
  statementController.getMyMatchedOrderStatement
);

router.get(
  '/cash',
  dateRangeQueryValidation(),
  statementController.getMyCashStatement
);

router.get(
  '/deposits-withdrawals',
  dateRangeQueryValidation(),
  statementController.getMyDepositWithdrawHistory
);

router.get('/orders/today', statementController.getMyOrdersToday);

router.get(
  '/matched-orders/today',
  statementController.getMyMatchedOrdersToday
);

router.get(
  '/accounts/:maTK/cash-statement-detail',
  [maTkParamValidation(), dateRangeQueryValidation()],
  statementController.getMyAccountCashStatementDetail
);

router.get('/bank-accounts', statementController.getMyBankAccounts);

module.exports = router;
