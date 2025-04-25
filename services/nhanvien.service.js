// services/nhanvien.service.js
const NhanVienModel = require("../models/NhanVien.model");
const passwordHasher = require("../utils/passwordHasher");

const ConflictError = require("../utils/errors/ConflictError");
const AppError = require("../utils/errors/AppError");
const { checkGlobalExistence } = require("../models/Admin.model");
const NhanVienService = {};

/**
 * Tạo mới Nhân viên (chỉ tạo bản ghi, không quản lý SQL Login).
 * @param {object} nvData Dữ liệu nhân viên (MaNV, HoTen, ...)
 * @param {string} rawPassword Mật khẩu gốc.
 * @returns {Promise<object>} Nhân viên đã tạo (không có hash).
 */
NhanVienService.createNhanVien = async (nvData, rawPassword) => {
  // 1. Kiểm tra trùng lặp (MaNV, CMND, Email - Model nên có hàm check)
  const existence = await checkGlobalExistence(
    nvData.MaNV,
    nvData.CMND,
    nvData.Email
  );
  if (existence?.MaNVExists)
    throw new ConflictError(`Mã Nhân viên '${nvData.MaNV}' đã tồn tại.`);
  if (existence?.CMNDExists)
    throw new ConflictError(`Số CMND '${nvData.CMND}' đã tồn tại.`);
  if (existence?.EmailExists && nvData.Email)
    throw new ConflictError(`Email '${nvData.Email}' đã tồn tại.`);

  // 2. Hash mật khẩu
  const hashedPassword = await passwordHasher.hashPassword(rawPassword);

  // 3. Gọi Model để tạo
  try {
    const createdNV = await NhanVienModel.create(nvData, hashedPassword); // Model create cần nhận hash
    const { PasswordHash, ...result } = createdNV; // Loại bỏ hash khỏi kết quả trả về
    return result;
  } catch (error) {
    // Xử lý lỗi từ model (vd: lỗi DB khác)
    console.error("Error creating NhanVien in service:", error);
    if (error instanceof ConflictError) throw error; // Ném lại lỗi trùng lặp nếu model bắt được
    throw new AppError(
      `Lỗi khi tạo nhân viên ${nvData.MaNV}: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy thông tin Nhân viên theo Mã Nhân viên.
 * @param {string} maNV Mã Nhân viên.
 * @returns {Promise<object>} Thông tin Nhân viên.
 */
NhanVienService.getNhanVienByMaNV = async (maNV) => {
  try {
    const nhanVien = await NhanVienModel.findByMaNV(maNV);
    if (!nhanVien) {
      throw new AppError(`Không tìm thấy Nhân viên với Mã '${maNV}'.`, 404);
    }
    return nhanVien;
  } catch (error) {
    console.error("Error fetching NhanVien in service:", error);
    throw new AppError(
      `Lỗi khi lấy thông tin Nhân viên ${maNV}: ${error.message}`,
      500
    );
  }
};

/**
 * Cập nhật thông tin Nhân viên.
 * @param {string} maNV Mã Nhân viên.
 * @param {object} updateData Dữ liệu cập nhật.
 * @returns {Promise<object>} Nhân viên đã cập nhật.
 */
NhanVienService.updateNhanVien = async (maNV, updateData) => {
  try {
    const updatedNhanVien = await NhanVienModel.update(maNV, updateData);
    if (!updatedNhanVien) {
      throw new AppError(`Không tìm thấy Nhân viên với Mã '${maNV}'.`, 404);
    }
    return updatedNhanVien;
  } catch (error) {
    console.error("Error updating NhanVien in service:", error);
    throw new AppError(
      `Lỗi khi cập nhật Nhân viên ${maNV}: ${error.message}`,
      500
    );
  }
};

/**
 * Xóa Nhân viên theo Mã Nhân viên.
 * @param {string} maNV Mã Nhân viên.
 * @returns {Promise<void>}
 */
NhanVienService.deleteNhanVien = async (maNV) => {
  try {
    const deleted = await NhanVienModel.delete(maNV);
    if (!deleted) {
      throw new AppError(`Không tìm thấy Nhân viên với Mã '${maNV}'.`, 404);
    }
  } catch (error) {
    console.error("Error deleting NhanVien in service:", error);
    throw new AppError(`Lỗi khi xóa Nhân viên ${maNV}: ${error.message}`, 500);
  }
};

module.exports = NhanVienService;
