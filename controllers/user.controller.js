// controllers/user.controller.js
const NhanVienModel = require("../models/NhanVien.model"); // Sẽ tạo model này sau
const NhaDauTuModel = require("../models/NhaDauTu.model"); // Sẽ tạo model này sau
const NotFoundError = require("../utils/errors/NotFoundError"); // Sẽ tạo error này sau
const AuthorizationError = require("../utils/errors/AuthorizationError"); // Sẽ tạo error này sau

exports.getMyProfile = async (req, res, next) => {
  // Thêm next
  const userId = req.user.id;
  const userRole = req.user.role;

  let profile;
  if (userRole === "NhanVien") {
    // --- Không cần try...catch ---
    profile = await NhanVienModel.findProfileByMaNV(userId);
  } else if (userRole === "NhaDauTu") {
    // --- Không cần try...catch ---
    profile = await NhaDauTuModel.findProfileByMaNDT(userId);
  } else {
    console.warn(
      `getMyProfile called with invalid role: ${userRole} for user ${userId}`
    );
    // Ném lỗi để errorHandler xử lý
    return next(new AuthorizationError("Vai trò người dùng không hợp lệ."));
  }

  if (!profile) {
    console.warn(
      `Profile not found in DB for user ${userId} with role ${userRole}.`
    );
    // Ném lỗi để errorHandler xử lý
    return next(new NotFoundError("Không tìm thấy thông tin người dùng."));
  }

  res.status(200).send(profile);
};
