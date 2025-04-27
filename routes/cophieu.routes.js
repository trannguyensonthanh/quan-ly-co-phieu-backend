// routes/cophieu.routes.js
const express = require("express");
const router = express.Router();
const coPhieuController = require("../controllers/cophieu.controller");
const { verifyToken } = require("../middleware/authJwt");
const {
  isNhanVien,
  isNhanVienOrNhaDauTu,
} = require("../middleware/verifyRole");
const {
  createCoPhieuValidationRules,
  updateCoPhieuValidationRules,
  maCpParamValidationRules,
  getStockOrdersValidationRules,
  listStockValidationRules,
  getRecentHistoryValidationRules,
} = require("../middleware/validators/coPhieuValidator"); // Import rules
const {
  dateRangeQueryValidation,
} = require("../middleware/validators/statementValidator");

// GET /api/cophieu -> Lấy danh sách cổ phiếu đang được giao dịch (cho NDT)
router.get("/", [verifyToken, isNhanVienOrNhaDauTu], coPhieuController.findAll);

// Middleware xác thực và phân quyền chung cho tất cả route cổ phiếu
// Chỉ Nhân viên mới được truy cập các API này
router.use(verifyToken, isNhanVien);

// Định nghĩa các routes cho COPHIEU

// POST /api/cophieu -> Tạo mới cổ phiếu
router.post("/", createCoPhieuValidationRules(), coPhieuController.create);

// GET /api/cophieu/admin/all -> Lấy TẤT CẢ cổ phiếu (cho Admin quản lý)
router.get("/admin/all", coPhieuController.findAllForAdmin);

// GET /api/cophieu/status/:status -> Lấy tất cả cổ phiếu dựa vào status
router.get(
  "/status/:status",
  coPhieuController.findByStatus // Gọi controller xử lý logic
);

// GET /api/cophieu/admin/:macp -> Lấy chi tiết 1 CP (bất kể status, cho Admin xem/sửa)
router.get(
  "/admin/:macp",
  maCpParamValidationRules(),
  coPhieuController.findOne
);

// GET /api/cophieu/:macp -> Lấy thông tin chi tiết một cổ phiếu
// router.get("/:macp", maCpParamValidationRules(), coPhieuController.findOne);

// PUT /api/cophieu/:macp -> Cập nhật thông tin cổ phiếu
router.put("/:macp", updateCoPhieuValidationRules(), coPhieuController.update);

// DELETE /api/cophieu/:macp -> Xóa cổ phiếu
router.delete("/:macp", maCpParamValidationRules(), coPhieuController.delete);

// PUT /api/cophieu/:macp/list -> Niêm yết CP (chuyển Status 0->1, thêm giá)
// Cần validator kiểm tra initialGiaTC trong body
router.put(
  "/:macp/list",

  maCpParamValidationRules(),
  listStockValidationRules(), // Thêm validator này
  coPhieuController.listStock
);

// PUT /api/cophieu/:macp/delist -> Ngừng giao dịch CP (chuyển Status 1->2)
router.put(
  "/:macp/delist",
  maCpParamValidationRules(),
  coPhieuController.delistStock
);

// // PUT /api/cophieu/:macp/open -> Mở giao dịch CP (chuyển Status 2->1)
// router.put(
//   "/:macp/open",
//   maCpParamValidationRules(), // Validate mã CP
//   coPhieuController.openStock // Gọi controller mới
// );

// GET /api/cophieu/:macp/undo-info -> Lấy thông tin về hành động undo cuối cùng
router.get(
  "/:macp/undo-info",
  maCpParamValidationRules(), // Validate mã CP
  coPhieuController.getLatestUndoInfo // Gọi controller mới
);

// Các chức năng khác như Phục hồi, Tìm kiếm phức tạp có thể thêm route riêng sau
// GET /api/cophieu/:macp/orders?tuNgay=...&denNgay=...
router.get(
  "/:macp/orders",
  getStockOrdersValidationRules(), // Áp dụng validator mới
  coPhieuController.getStockOrders
);

// LẤY LỊCH SỬ GIÁ CP dựa trên mã CP và khoảng thời gian
// GET /api/cophieu/:macp/history?tuNgay=...&denNgay=...
router.get(
  "/:macp/history",
  [
    // Middleware: xác thực, check role NDT hoặc NV, validate param và query
    verifyToken,
    isNhanVienOrNhaDauTu,
    maCpParamValidationRules(),
    dateRangeQueryValidation(),
  ],
  coPhieuController.getStockPriceHistory // Gọi controller mới
);

// --- THÊM ROUTE LẤY LỊCH SỬ GIÁ GẦN ĐÂY ---
// GET /api/cophieu/:macp/history/recent?days=N
router.get(
  "/:macp/history/recent", // Endpoint mới
  [
    verifyToken,
    isNhanVienOrNhaDauTu,
    getRecentHistoryValidationRules(), // <<< Dùng validator mới
  ],
  coPhieuController.getRecentStockPriceHistory // <<< Gọi controller mới
);

// --- THÊM ROUTE LẤY TỔNG SỐ LƯỢNG ĐÃ PHÂN BỔ ---
// GET /api/cophieu/:macp/distributed-quantity
router.get(
  "/:macp/distributed-quantity",
  [
    // verifyToken, // Bỏ nếu muốn public
    // isNhanVienOrNhaDauTu, // Bỏ nếu muốn public
    maCpParamValidationRules("macp"), // Validate mã CP
  ],
  coPhieuController.getTotalDistributedQuantity // Gọi controller mới
);

// --- THÊM ROUTE LẤY DANH SÁCH CỔ ĐÔNG ---
// GET /api/cophieu/:macp/shareholders -> Lấy danh sách NĐT sở hữu CP này
router.get(
  "/:macp/shareholders",
  maCpParamValidationRules("macp"), // Validate mã CP
  coPhieuController.getShareholders // Gọi controller mới
);

module.exports = router;
