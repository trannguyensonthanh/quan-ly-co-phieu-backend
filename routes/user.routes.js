// routes/user.routes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { verifyToken } = require("../middleware/authJwt"); // Import middleware xác thực
const { isNhanVienOrNhaDauTu } = require("../middleware/verifyRole"); // Import middleware phân quyền (ví dụ)

// Route để lấy thông tin cá nhân của người dùng đang đăng nhập
// Áp dụng cả verifyToken và isNhanVienOrNhaDauTu
router.get(
  "/me",
  [verifyToken, isNhanVienOrNhaDauTu], // Chạy verifyToken trước, sau đó isNhanVienOrNhaDauTu
  userController.getMyProfile
);

// Ví dụ route chỉ dành cho Nhân viên
// router.get('/admin-dashboard', [verifyToken, isNhanVien], someAdminControllerFunction);

// Ví dụ route chỉ dành cho Nhà đầu tư
// router.post('/dat-lenh', [verifyToken, isNhaDauTu], someTradingControllerFunction);

module.exports = router;
