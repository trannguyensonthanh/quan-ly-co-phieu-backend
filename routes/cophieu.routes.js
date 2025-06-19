/**
 * routes/cophieu.routes.js
 * Định nghĩa các route cho quản lý cổ phiếu.
 */
const express = require('express');
const router = express.Router();
const coPhieuController = require('../controllers/cophieu.controller');
const { verifyToken } = require('../middleware/authJwt');
const {
  isNhanVien,
  isNhanVienOrNhaDauTu,
} = require('../middleware/verifyRole');
const {
  createCoPhieuValidationRules,
  updateCoPhieuValidationRules,
  maCpParamValidationRules,
  getStockOrdersValidationRules,
  listStockValidationRules,
  getRecentHistoryValidationRules,
} = require('../middleware/validators/coPhieuValidator');
const {
  dateRangeQueryValidation,
} = require('../middleware/validators/statementValidator');

// GET /api/cophieu -> Lấy danh sách cổ phiếu đang được giao dịch (cho NDT)
router.get('/', [verifyToken, isNhanVienOrNhaDauTu], coPhieuController.findAll);

router.use(verifyToken, isNhanVien);

router.post('/', createCoPhieuValidationRules(), coPhieuController.create);

router.get('/admin/all', coPhieuController.findAllForAdmin);

router.get('/status/:status', coPhieuController.findByStatus);

router.get(
  '/admin/:macp',
  maCpParamValidationRules(),
  coPhieuController.findOne
);

router.put('/:macp', updateCoPhieuValidationRules(), coPhieuController.update);

router.delete('/:macp', maCpParamValidationRules(), coPhieuController.delete);

router.put(
  '/:macp/list',
  maCpParamValidationRules(),
  listStockValidationRules(),
  coPhieuController.listStock
);

router.put(
  '/:macp/delist',
  maCpParamValidationRules(),
  coPhieuController.delistStock
);

router.get(
  '/:macp/undo-info',
  maCpParamValidationRules(),
  coPhieuController.getLatestUndoInfo
);

router.get(
  '/:macp/orders',
  getStockOrdersValidationRules(),
  coPhieuController.getStockOrders
);

router.get(
  '/:macp/history',
  [
    verifyToken,
    isNhanVienOrNhaDauTu,
    maCpParamValidationRules(),
    dateRangeQueryValidation(),
  ],
  coPhieuController.getStockPriceHistory
);

router.get(
  '/:macp/history/recent',
  [verifyToken, isNhanVienOrNhaDauTu, getRecentHistoryValidationRules()],
  coPhieuController.getRecentStockPriceHistory
);

router.get(
  '/:macp/distributed-quantity',
  [maCpParamValidationRules('macp')],
  coPhieuController.getTotalDistributedQuantity
);

router.get(
  '/:macp/shareholders',
  maCpParamValidationRules('macp'),
  coPhieuController.getShareholders
);

module.exports = router;
