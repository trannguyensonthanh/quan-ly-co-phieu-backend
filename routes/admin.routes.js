// routes/admin.routes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhanVien } = require('../middleware/verifyRole'); // Chỉ Nhân viên được làm
const adminValidator = require('../middleware/validators/adminValidator');
const coPhieuController = require('../controllers/cophieu.controller'); // Import controller
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
  maNdtParamValidation, // Import validator mới
  updateDistributionValidationRules, // Import validator mới
  relistStockValidationRules,
} = require('../middleware/validators/adminStockValidator');
// Áp dụng middleware xác thực và phân quyền chung

router.get('/market/status', adminController.getMarketStatus); // Lấy trạng thái và chế độ hiện tại

router.use(verifyToken, isNhanVien);

// POST /api/admin/logins -> Tạo login mới
// router.post(
//   "/logins",
//   adminValidator.createLoginValidationRules(),
//   adminController.createLogin
// );

// POST /api/admin/accounts -> Tạo login mới
router.post(
  '/accounts',
  adminValidator.createAccountValidationRules(), // <<< SỬ DỤNG VALIDATOR MỚI
  adminController.createAccount // <<< GỌI CONTROLLER MỚI
);

// PUT /api/admin/accounts/:accountId -> Cập nhật thông tin tài khoản
router.put(
  '/accounts/:accountId', // Dùng accountId chung cho MaNV/MaNDT
  adminValidator.updateAccountValidationRules(),
  adminController.updateAccount
);

// THÊM ROUTE DELETE
router.delete(
  '/accounts/:accountId', // Dùng accountId chung
  (req, res, next) => {
    console.log('DELETE ACCOUNT');
    next(); // nhớ gọi next() để đi tiếp
  },
  adminValidator.deleteAccountValidationRules(),
  adminController.deleteAccount
);

// GET /api/admin/users -> Lấy danh sách NV + NDT
router.get('/users', adminController.getAllUsers);

// DELETE /api/admin/logins/:loginname -> Xóa login
router.delete(
  '/logins/:loginname',
  adminValidator.deleteLoginValidationRules(),
  adminController.deleteLogin
);

// POST /api/admin/device -> Tạo backup device (nếu chưa có)
router.post('/device', adminController.createDevice); // Thêm route này

// Các route quản trị khác (backup/restore) sẽ thêm vào đây sau
// POST /api/admin/backup -> Thực hiện backup
router.post('/backup', adminController.backup);

// POST /api/admin/restore -> Thực hiện restore
// Body có thể chứa { pointInTime: 'YYYY-MM-DDTHH:MM:SS' } (nhưng sẽ bị bỏ qua ban đầu)
router.post('/restore', adminController.restore);

// GET /api/admin/backup-history -> Lấy danh sách lịch sử backup (MỚI)
router.get('/backup-history', adminController.getBackupHistory); // Thêm route này

// --- THÊM ROUTES TRIGGER THỊ TRƯỜNG ---
// POST /api/admin/market/trigger-ato -> Kích hoạt khớp lệnh ATO
router.post('/market/trigger-ato', adminController.triggerATO);

// POST /api/admin/market/trigger-atc -> Kích hoạt khớp lệnh ATC
router.post('/market/trigger-atc', adminController.triggerATC);

// POST /api/admin/market/prepare-prices -> Chuẩn bị giá cho ngày tiếp theo
router.post('/market/prepare-prices', adminController.prepareNextDayPrices);

// --- Market Mode & Status Control ---
// POST /api/admin/market/mode/auto -> Đặt chế độ Tự động
router.post('/market/mode/auto', adminController.setModeAuto); // Đặt chế độ Tự động

// POST /api/admin/market/mode/manual -> Đặt chế độ Thủ công
router.post('/market/mode/manual', adminController.setModeManual); // Đặt chế độ Thủ công

// GET /api/admin/cash-transactions -> Lấy toàn bộ lịch sử Nạp/Rút
router.get(
  '/cash-transactions',
  dateRangeQueryValidation(), // Validate ngày tháng trong query
  adminController.getAllCashTransactions // Gọi controller mới
);

// POST /api/admin/undo-last-cophieu-action -> Hoàn tác hành động CP cuối cùng (Status=0)
router.post(
  '/undo-last-cophieu-action',

  coPhieuController.undoLastAction // <<< Gọi hàm undo đã sửa trong cophieu.controller
);

// GET /api/admin/undo-logs -> Lấy toàn bộ lịch sử hoàn tác
router.get('/undo-logs', adminController.getAllUndoLogs);

// --- THÊM ROUTE TRIGGER KHỚP LỆNH LIÊN TỤC ---
// POST /api/admin/market/trigger-continuous -> Kích hoạt 1 chu kỳ khớp lệnh LO
router.post('/market/trigger-continuous', adminController.triggerContinuous);

// GET /api/admin/orders/all -> Lấy toàn bộ lệnh đặt của tất cả NĐT
router.get(
  '/orders/all',
  dateRangeQueryValidation(), // Validate ngày tháng trong query
  adminController.getAllOrders // Gọi controller mới
);

// --- THÊM ROUTE ADMIN ĐẶT LẠI MẬT KHẨU ---
// PUT /api/admin/accounts/:accountId/reset-password
router.put(
  '/accounts/:accountId/reset-password',
  adminResetPasswordValidationRules(), // <<< Áp dụng validator mới
  adminController.resetPassword // <<< Gọi controller mới
);

// POST /api/admin/stocks/:maCP/distribute -> Admin phân bổ CP chờ niêm yết
router.post(
  '/stocks/:maCP/distribute', // Endpoint mới
  distributeStockValidationRules(), // <<< Dùng validator mới
  adminController.distributeStock // <<< Gọi controller mới
);

router.get(
  '/stocks/:maCP/distribution',
  maCpParamValidation('maCP'),
  adminController.getDistributionList
); // Xem danh sách phân bổ

router.put(
  '/stocks/:maCP/distribution/:maNDT',
  updateDistributionValidationRules(),
  adminController.updateInvestorDistribution
); // Sửa SL của 1 NĐT

router.delete(
  '/stocks/:maCP/distribution/:maNDT',
  [maCpParamValidation('maCP'), maNdtParamValidation()],
  adminController.revokeInvestorDistribution
); // Xóa phân bổ của 1 NĐT

// --- THÊM ROUTE CHO PHÉP GIAO DỊCH TRỞ LẠI ---
// PUT /api/admin/stocks/:maCP/relist -> Chuyển Status từ 2 về 1
router.put(
  '/stocks/:maCP/relist', // Endpoint mới
  relistStockValidationRules(), // <<< Dùng validator mới
  coPhieuController.relistStock // <<< Gọi controller mới (đặt trong cophieu.controller.js)
);

module.exports = router;
