/**
 * controllers/user.controller.js
 * Xử lý các API liên quan đến người dùng (Nhân viên, Nhà đầu tư)
 */

const NhanVienModel = require('../models/NhanVien.model');
const NhaDauTuModel = require('../models/NhaDauTu.model');
const NotFoundError = require('../utils/errors/NotFoundError');
const AuthorizationError = require('../utils/errors/AuthorizationError');

/**
 * Lấy thông tin hồ sơ của người dùng hiện tại
 */
exports.getMyProfile = async (req, res, next) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  let profile;
  if (userRole === 'NhanVien') {
    profile = await NhanVienModel.findProfileByMaNV(userId);
  } else if (userRole === 'NhaDauTu') {
    profile = await NhaDauTuModel.findProfileByMaNDT(userId);
  } else {
    console.warn(
      `getMyProfile called with invalid role: ${userRole} for user ${userId}`
    );
    return next(new AuthorizationError('Vai trò người dùng không hợp lệ.'));
  }

  if (!profile) {
    console.warn(
      `Profile not found in DB for user ${userId} with role ${userRole}.`
    );
    return next(new NotFoundError('Không tìm thấy thông tin người dùng.'));
  }

  res.status(200).send(profile);
};
