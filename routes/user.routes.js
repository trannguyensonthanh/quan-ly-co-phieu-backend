/**
 * routes/user.routes.js
 * Định nghĩa các route liên quan đến người dùng.
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken } = require('../middleware/authJwt');
const { isNhanVienOrNhaDauTu } = require('../middleware/verifyRole');

/**
 * Lấy thông tin cá nhân của người dùng đang đăng nhập
 */
router.get(
  '/me',
  [verifyToken, isNhanVienOrNhaDauTu],
  userController.getMyProfile
);

module.exports = router;
