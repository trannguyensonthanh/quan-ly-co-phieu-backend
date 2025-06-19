/**
 * services/nhadautu.service.js
 * Service layer for Nhà Đầu Tư (Investor) and related bank account operations.
 */
const NhaDauTuModel = require('../models/NhaDauTu.model');
const TaiKhoanNganHangModel = require('../models/TaiKhoanNganHang.model');
const BadRequestError = require('../utils/errors/BadRequestError');
const ConflictError = require('../utils/errors/ConflictError');
const NotFoundError = require('../utils/errors/NotFoundError');
const SoHuuModel = require('../models/SoHuu.model');
const NhaDauTuService = {};

/**
 * Lấy danh sách NDT
 */
NhaDauTuService.getAllNDT = async () => {
  return await NhaDauTuModel.getAll();
};

/**
 * Lấy chi tiết NDT (kèm TKNH)
 */
NhaDauTuService.getNDTDetails = async (maNDT) => {
  const ndt = await NhaDauTuModel.findByMaNDT(maNDT, true);
  if (!ndt) {
    throw new NotFoundError(`Không tìm thấy Nhà Đầu Tư với mã '${maNDT}'.`);
  }
  if (!ndt.TaiKhoanNganHang) {
    ndt.TaiKhoanNganHang = [];
  }
  return ndt;
};

/**
 * Tạo mới NDT
 */
NhaDauTuService.createNDT = async (ndtData) => {
  try {
    return await NhaDauTuModel.create(ndtData);
  } catch (error) {
    if (error.message.includes('đã tồn tại')) {
      throw new ConflictError(error.message);
    }
    throw error;
  }
};

/**
 * Cập nhật NDT
 */
NhaDauTuService.updateNDT = async (maNDT, ndtData) => {
  const existingNDT = await NhaDauTuModel.findByMaNDT(maNDT);
  if (!existingNDT) {
    throw new NotFoundError(
      `Không tìm thấy Nhà Đầu Tư với mã '${maNDT}' để cập nhật.`
    );
  }
  const affectedRows = await NhaDauTuModel.updateByMaNDT(maNDT, ndtData);
  if (affectedRows === 0 && Object.keys(ndtData).length > 0) {
    console.warn(`No changes detected when updating NDT ${maNDT}`);
  }
  return await NhaDauTuModel.findByMaNDT(maNDT, false);
};

/**
 * Xóa NDT
 */
NhaDauTuService.deleteNDT = async (maNDT) => {
  const existingNDT = await NhaDauTuModel.findByMaNDT(maNDT);
  if (!existingNDT) {
    throw new NotFoundError(
      `Không tìm thấy Nhà Đầu Tư với mã '${maNDT}' để xóa.`
    );
  }
  try {
    const affectedRows = await NhaDauTuModel.deleteByMaNDT(maNDT);
    return {
      message: `Nhà Đầu Tư '${maNDT}' và các tài khoản ngân hàng liên kết đã được xóa (nếu có).`,
    };
  } catch (error) {
    if (error.message.includes('Không thể xóa')) {
      throw new ConflictError(error.message);
    }
    throw error;
  }
};

/**
 * Lấy số dư tiền của một NDT
 */
NhaDauTuService.getBalancesByNDT = async (maNDT) => {
  return await TaiKhoanNganHangModel.findByMaNDT(maNDT);
};

/**
 * Lấy danh mục cổ phiếu của một NDT
 */
NhaDauTuService.getPortfolioByNDT = async (maNDT) => {
  return await SoHuuModel.findByMaNDT(maNDT);
};

/**
 * Lấy TKNH của một NDT
 */
NhaDauTuService.getTKNHByNDT = async (maNDT) => {
  const existingNDT = await NhaDauTuModel.findByMaNDT(maNDT);
  if (!existingNDT) {
    throw new NotFoundError(`Không tìm thấy Nhà Đầu Tư với mã '${maNDT}'.`);
  }
  return await TaiKhoanNganHangModel.findByMaNDT(maNDT);
};

/**
 * Thêm mới TKNH cho NDT
 */
NhaDauTuService.addTKNH = async (maNDT, tknhData) => {
  const existingNDT = await NhaDauTuModel.findByMaNDT(maNDT);
  if (!existingNDT) {
    throw new NotFoundError(
      `Không tìm thấy Nhà Đầu Tư với mã '${maNDT}' để thêm tài khoản.`
    );
  }
  tknhData.MaNDT = maNDT;
  if (tknhData.SoTien < 0) {
    throw new BadRequestError('Số dư tài khoản không được âm.');
  }
  try {
    return await TaiKhoanNganHangModel.create(tknhData);
  } catch (error) {
    if (error.message.includes('đã tồn tại')) {
      throw new ConflictError(error.message);
    }
    if (error.message.includes('không tồn tại')) {
      throw new BadRequestError(error.message);
    }
    throw error;
  }
};

// /**
//  * Cập nhật TKNH
//  */
// NhaDauTuService.updateTKNH = async (maTK, tknhData) => {
//   const existingTKNH = await TaiKhoanNganHangModel.findByMaTK(maTK);
//   if (!existingTKNH) {
//     throw new NotFoundError(
//       `Không tìm thấy Tài khoản Ngân hàng với mã '${maTK}' để cập nhật.`
//     );
//   }
//   if (tknhData.SoTien !== undefined && tknhData.SoTien < 0) {
//     throw new BadRequestError("Số dư tài khoản không được âm.");
//   }
//   try {
//     const affectedRows = await TaiKhoanNganHangModel.updateByMaTK(
//       maTK,
//       tknhData
//     );
//     return await TaiKhoanNganHangModel.findByMaTK(maTK);
//   } catch (error) {
//     if (
//       error.message.includes("Mã Ngân Hàng") &&
//       error.message.includes("không tồn tại")
//     ) {
//       throw new BadRequestError(error.message);
//     }
//     throw error;
//   }
// };

// /**
//  * Xóa TKNH
//  */
// NhaDauTuService.deleteTKNH = async (maTK) => {
//   const existingTKNH = await TaiKhoanNganHangModel.findByMaTK(maTK);
//   if (!existingTKNH) {
//     throw new NotFoundError(
//       `Không tìm thấy Tài khoản Ngân hàng với mã '${maTK}' để xóa.`
//     );
//   }
//   try {
//     const affectedRows = await TaiKhoanNganHangModel.deleteByMaTK(maTK);
//     return { message: `Tài khoản Ngân hàng '${maTK}' đã được xóa.` };
//   } catch (error) {
//     if (error.message.includes("Không thể xóa")) {
//       throw new ConflictError(error.message);
//     }
//     throw error;
//   }
// };

module.exports = NhaDauTuService;
