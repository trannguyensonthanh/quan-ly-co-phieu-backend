// routes/nganHang.routes.js
const express = require("express");
const router = express.Router();
const nganHangController = require("../controllers/nganHang.controller");
const { verifyToken } = require("../middleware/authJwt");
const { isNhanVien } = require("../middleware/verifyRole"); // Chỉ Admin được quản lý ngân hàng
const {
  maNHParamValidation,
  createNganHangValidationRules,
  updateNganHangValidationRules,
} = require("../middleware/validators/nganHangValidator"); // Import validators

// --- Middleware chung: Yêu cầu đăng nhập và là Nhân viên ---
router.use(verifyToken, isNhanVien);

// --- Định nghĩa các Routes CRUD ---

// GET /api/banks -> Lấy danh sách tất cả ngân hàng
router.get("/", nganHangController.getAllBanks);

// POST /api/banks -> Tạo ngân hàng mới
router.post(
  "/",
  createNganHangValidationRules(),
  nganHangController.createBank
);

// GET /api/banks/:maNH -> Lấy chi tiết một ngân hàng
router.get("/:maNH", maNHParamValidation(), nganHangController.getBankById);

// PUT /api/banks/:maNH -> Cập nhật ngân hàng
router.put(
  "/:maNH",
  updateNganHangValidationRules(),
  nganHangController.updateBank
);

// DELETE /api/banks/:maNH -> Xóa ngân hàng
router.delete("/:maNH", maNHParamValidation(), nganHangController.deleteBank);

module.exports = router;
