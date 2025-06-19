/**
 * services/nhanvien.service.js
 * Service xử lý logic liên quan đến Nhân viên.
 */
const NhanVienModel = require('../models/NhanVien.model');
const passwordHasher = require('../utils/passwordHasher');

const ConflictError = require('../utils/errors/ConflictError');
const AppError = require('../utils/errors/AppError');
const { checkGlobalExistence } = require('../models/Admin.model');
const NhanVienService = {};

/**
 * Tạo mới Nhân viên (chỉ tạo bản ghi, không quản lý SQL Login).
 * @param {object} nvData Dữ liệu nhân viên (MaNV, HoTen, ...)
 * @param {string} rawPassword Mật khẩu gốc.
 * @returns {Promise<object>} Nhân viên đã tạo (không có hash).
 */
NhanVienService.createNhanVien = async (nvData, rawPassword) => {
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

  const hashedPassword = await passwordHasher.hashPassword(rawPassword);

  try {
    const createdNV = await NhanVienModel.create(nvData, hashedPassword);
    const { PasswordHash, ...result } = createdNV;
    return result;
  } catch (error) {
    if (error instanceof ConflictError) throw error;
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
    throw new AppError(`Lỗi khi xóa Nhân viên ${maNV}: ${error.message}`, 500);
  }
};

module.exports = NhanVienService;
