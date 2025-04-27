// routes/auth.routes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/authJwt"); // Cần để lấy thông tin user
const { isNhanVienOrNhaDauTu } = require("../middleware/verifyRole"); // Đảm bảo user thuộc 1 trong 2 nhóm
const {
  changePasswordValidationRules,
  signUpValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
} = require("../middleware/validators/authValidator"); // Import validator
// const { body } = require('express-validator'); // Có thể thêm validation sau
// POST /api/auth/signup -> Đăng kí NDT mới
router.post("/signup", signUpValidationRules(), authController.signup);
// Định nghĩa route cho đăng nhập
// POST /api/auth/signin
router.post(
  "/signin",
  // [ // Thêm validation nếu muốn
  //     body('username').notEmpty().withMessage('Username is required'),
  //     body('password').notEmpty().withMessage('Password is required')
  // ],
  authController.signin
);

// PUT /api/auth/change-password -> Đổi mật khẩu cho user đang đăng nhập
router.put(
  "/change-password",
  [verifyToken, isNhanVienOrNhaDauTu], // Phải đăng nhập và thuộc 1 trong 2 role
  changePasswordValidationRules(),
  authController.changePassword
);

// POST /api/auth/refreshtoken -> Làm mới Access Token
router.post("/refreshtoken", authController.refreshToken);

// POST /api/auth/logout
// Middleware verifyToken là tùy chọn:
// - Nếu có: Chỉ user đang đăng nhập mới gọi được logout (an toàn hơn một chút).
// - Nếu không có: Bất kỳ ai cũng có thể gọi endpoint này, nhưng nó chỉ xóa cookie nếu có.
router.post("/logout", /* verifyToken, */ authController.logout); // Tạm thời không cần

// POST /api/auth/forgot-password -> Gửi email để reset mật khẩu
router.post(
  "/forgot-password",
  forgotPasswordValidationRules(),
  authController.forgotPassword
);

// POST /api/auth/reset-password -> Đặt lại mật khẩu mới
router.post(
  "/reset-password",
  resetPasswordValidationRules(),
  authController.resetPassword
);

module.exports = router;
