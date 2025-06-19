/**
 * routes/auth.routes.js
 * Định nghĩa các route liên quan đến xác thực (authentication) cho ứng dụng.
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhanVienOrNhaDauTu } = require('../middleware/verifyRole');
const {
  changePasswordValidationRules,
  signUpValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
} = require('../middleware/validators/authValidator');

// POST /api/auth/signup -> Đăng kí NDT mới
router.post('/signup', signUpValidationRules(), authController.signup);

router.post('/signin', authController.signin);

router.put(
  '/change-password',
  [verifyToken, isNhanVienOrNhaDauTu],
  changePasswordValidationRules(),
  authController.changePassword
);

router.post('/refreshtoken', authController.refreshToken);

router.post('/logout', authController.logout);

router.post(
  '/forgot-password',
  forgotPasswordValidationRules(),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  resetPasswordValidationRules(),
  authController.resetPassword
);

module.exports = router;
