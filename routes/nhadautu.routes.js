/**
 * routes/nhadautu.routes.js
 * Định nghĩa các route cho Nhà Đầu Tư (NDT) và các chức năng liên quan.
 */
const express = require('express');
const router = express.Router();
const ndtController = require('../controllers/nhadautu.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhanVien } = require('../middleware/verifyRole');
const ndtValidator = require('../middleware/validators/nhadautuValidator');
const tknhValidator = require('../middleware/validators/taikhoanNganHangValidator');
const statementValidator = require('../middleware/validators/statementValidator');
const cashTransactionValidator = require('../middleware/validators/cashTransactionValidator');

/**
 * Lấy danh sách TKNH của NDT
 */
router.get(
  '/:mandt/taikhoan',
  tknhValidator.maNdtParamValidation(),
  ndtController.findTKNHByNDT
);

router.use(verifyToken, isNhanVien);

/**
 * Tạo NDT mới
 */
router.post('/', ndtValidator.createNdtValidation(), ndtController.createNDT);

/**
 * Lấy danh sách NDT
 */
router.get('/', ndtController.findAllNDT);

/**
 * Lấy chi tiết NDT (bao gồm TKNH)
 */
router.get(
  '/:mandt',
  ndtValidator.maNdtParamValidation(),
  ndtController.findOneNDT
);

/**
 * Cập nhật thông tin NDT (không gồm mật khẩu, cmnd)
 */
router.put(
  '/:mandt',
  ndtValidator.updateNdtValidation(),
  ndtController.updateNDT
);

/**
 * Xóa NDT
 */
router.delete(
  '/:mandt',
  ndtValidator.maNdtParamValidation(),
  ndtController.deleteNDT
);

/**
 * Thêm TKNH mới cho NDT
 */
router.post(
  '/:mandt/taikhoan',
  tknhValidator.createTKNHValidation(),
  ndtController.addTKNH
);

/**
 * Lấy số dư tiền của NDT
 */
router.get(
  '/:mandt/balance',
  ndtValidator.maNdtParamValidation(),
  ndtController.getNDTBalances
);

/**
 * Lấy danh mục cổ phiếu của NDT
 */
router.get(
  '/:mandt/portfolio',
  ndtValidator.maNdtParamValidation(),
  ndtController.getNDTPortfolio
);

/**
 * Lấy sao kê lệnh của NDT
 */
router.get(
  '/:mandt/statement/orders',
  [
    statementValidator.maNdtParamValidation(),
    statementValidator.dateRangeQueryValidation(),
  ],
  ndtController.getInvestorOrderStatement
);

/**
 * Lấy sao kê lệnh khớp của NDT
 */
router.get(
  '/:mandt/statement/matched-orders',
  [
    statementValidator.maNdtParamValidation(),
    statementValidator.dateRangeQueryValidation(),
  ],
  ndtController.getInvestorMatchedOrderStatement
);

/**
 * Lấy sao kê tiền mặt của NDT
 */
router.get(
  '/:mandt/statement/cash',
  [
    statementValidator.maNdtParamValidation(),
    statementValidator.dateRangeQueryValidation(),
  ],
  ndtController.getInvestorCashStatement
);

/**
 * Nhân viên nạp tiền
 */
router.post(
  '/accounts/deposit',
  cashTransactionValidator.validateDepositOrWithdraw,
  ndtController.adminDeposit
);

/**
 * Nhân viên rút tiền
 */
router.post(
  '/accounts/withdraw',
  cashTransactionValidator.validateDepositOrWithdraw,
  ndtController.adminWithdraw
);

/**
 * Lấy lịch sử GD Tiền của NĐT
 */
router.get(
  '/:mandt/statement/deposits-withdrawals',
  [
    statementValidator.maNdtParamValidation(),
    statementValidator.dateRangeQueryValidation(),
  ],
  ndtController.getInvestorDepositWithdrawHistory
);

/**
 * Lấy sao kê tài khoản tiền chi tiết cho admin
 */
router.get(
  '/:mandt/accounts/:maTK/cash-statement-detail',
  (req, res, next) => {
    console.log('Request Params:', req.params);
    console.log('Query Params:', req.query);
    next();
  },
  [
    statementValidator.maNdtParamValidation(),
    statementValidator.maTkParamValidation(),
    statementValidator.dateRangeQueryValidation(),
  ],
  ndtController.getInvestorAccountCashStatementDetail
);

module.exports = router;
