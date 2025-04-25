// services/nhadautu.service.js
const NhaDauTuModel = require("../models/NhaDauTu.model");
const TaiKhoanNganHangModel = require("../models/TaiKhoanNganHang.model");
const BadRequestError = require("../utils/errors/BadRequestError");
const ConflictError = require("../utils/errors/ConflictError");
const NotFoundError = require("../utils/errors/NotFoundError");
const SoHuuModel = require("../models/SoHuu.model"); // Model cho danh mục cổ phiếu
const NhaDauTuService = {};

// Service lấy danh sách NDT
NhaDauTuService.getAllNDT = async () => {
  return await NhaDauTuModel.getAll();
};

// Service lấy chi tiết NDT (kèm TKNH)
NhaDauTuService.getNDTDetails = async (maNDT) => {
  const ndt = await NhaDauTuModel.findByMaNDT(maNDT, true); // true để include bank accounts
  if (!ndt) {
    throw new NotFoundError(`Không tìm thấy Nhà Đầu Tư với mã '${maNDT}'.`);
  }
  // Nếu muốn đảm bảo TaiKhoanNganHang luôn là mảng (ngay cả khi lỗi fetch)
  if (!ndt.TaiKhoanNganHang) {
    ndt.TaiKhoanNganHang = [];
  }
  return ndt;
};

// Service tạo mới NDT
NhaDauTuService.createNDT = async (ndtData) => {
  try {
    // Model.create đã xử lý lỗi trùng PK/Unique và ném Error
    // ErrorHandler sẽ bắt các lỗi này và chuyển thành 409
    return await NhaDauTuModel.create(ndtData);
  } catch (error) {
    if (error.message.includes("đã tồn tại")) {
      // Lỗi từ check trong model
      throw new ConflictError(error.message);
    }
    // Ném lại lỗi khác (thường là lỗi DB) để errorHandler xử lý
    throw error;
  }
};

// Service cập nhật NDT
NhaDauTuService.updateNDT = async (maNDT, ndtData) => {
  const existingNDT = await NhaDauTuModel.findByMaNDT(maNDT);
  if (!existingNDT) {
    throw new NotFoundError(
      `Không tìm thấy Nhà Đầu Tư với mã '${maNDT}' để cập nhật.`
    );
  }
  // Thêm các kiểm tra nghiệp vụ khác nếu cần
  const affectedRows = await NhaDauTuModel.updateByMaNDT(maNDT, ndtData);
  if (affectedRows === 0 && Object.keys(ndtData).length > 0) {
    // Check if data was provided but no rows affected
    console.warn(`No changes detected when updating NDT ${maNDT}`);
  }
  // Trả về thông tin NDT đã cập nhật (không kèm TKNH)
  return await NhaDauTuModel.findByMaNDT(maNDT, false);
};

// Service xóa NDT
NhaDauTuService.deleteNDT = async (maNDT) => {
  const existingNDT = await NhaDauTuModel.findByMaNDT(maNDT);
  if (!existingNDT) {
    throw new NotFoundError(
      `Không tìm thấy Nhà Đầu Tư với mã '${maNDT}' để xóa.`
    );
  }
  try {
    // Model.deleteByMaNDT đã kiểm tra ràng buộc và ném Error nếu vi phạm
    // ErrorHandler sẽ bắt các lỗi ràng buộc này
    const affectedRows = await NhaDauTuModel.deleteByMaNDT(maNDT);
    // Model delete nên trả về true/false hoặc số dòng thay vì throw lỗi nếu chỉ là không tìm thấy dòng nào để xóa
    // if (affectedRows === 0) {
    // Có thể user đã bị xóa trước đó
    // console.warn(`NDT ${maNDT} already deleted or delete failed silently.`);
    // throw new AppError(`Xóa Nhà Đầu Tư '${maNDT}' thất bại.`, 500); // Hoặc coi là thành công?
    // }
    return {
      message: `Nhà Đầu Tư '${maNDT}' và các tài khoản ngân hàng liên kết đã được xóa (nếu có).`,
    };
  } catch (error) {
    if (error.message.includes("Không thể xóa")) {
      // Lỗi ràng buộc từ model
      throw new ConflictError(error.message); // 409 Conflict
    }
    throw error; // Ném lại lỗi DB khác
  }
};

// --- Service Tra cứu ---

// Lấy số dư tiền của một NDT
NhaDauTuService.getBalancesByNDT = async (maNDT) => {
  // Kiểm tra NDT tồn tại (tùy chọn, có thể bỏ qua nếu chỉ cần kết quả rỗng)
  // const existingNDT = await NhaDauTuModel.findByMaNDT(maNDT);
  // if (!existingNDT) {
  //     throw new Error(`Không tìm thấy Nhà Đầu Tư với mã '${maNDT}'.`);
  // }
  return await TaiKhoanNganHangModel.findByMaNDT(maNDT);
};

// Lấy danh mục cổ phiếu của một NDT
NhaDauTuService.getPortfolioByNDT = async (maNDT) => {
  // Kiểm tra NDT tồn tại (tùy chọn)
  return await SoHuuModel.findByMaNDT(maNDT);
};

// --- Services cho Tài Khoản Ngân Hàng ---

// Service lấy TKNH của một NDT
NhaDauTuService.getTKNHByNDT = async (maNDT) => {
  // Kiểm tra NDT có tồn tại không
  const existingNDT = await NhaDauTuModel.findByMaNDT(maNDT);
  if (!existingNDT) {
    throw new NotFoundError(`Không tìm thấy Nhà Đầu Tư với mã '${maNDT}'.`);
  }
  return await TaiKhoanNganHangModel.findByMaNDT(maNDT);
};

// Service thêm mới TKNH cho NDT
NhaDauTuService.addTKNH = async (maNDT, tknhData) => {
  // Kiểm tra NDT có tồn tại không
  const existingNDT = await NhaDauTuModel.findByMaNDT(maNDT);
  if (!existingNDT) {
    throw new NotFoundError(
      `Không tìm thấy Nhà Đầu Tư với mã '${maNDT}' để thêm tài khoản.`
    );
  }
  // Gán MaNDT vào dữ liệu TKNH
  tknhData.MaNDT = maNDT;
  // Kiểm tra nghiệp vụ (vd: Số tiền >= 0 đã có constraint DB)
  if (tknhData.SoTien < 0) {
    throw new BadRequestError("Số dư tài khoản không được âm.");
  }
  try {
    // Model.create đã xử lý lỗi trùng PK/FK và ném Error
    // ErrorHandler sẽ bắt và xử lý (409 cho PK, 400 cho FK)
    return await TaiKhoanNganHangModel.create(tknhData);
  } catch (error) {
    if (error.message.includes("đã tồn tại")) {
      // Lỗi PK từ model
      throw new ConflictError(error.message);
    }
    if (error.message.includes("không tồn tại")) {
      // Lỗi FK từ model
      throw new BadRequestError(error.message); // Mã NDT hoặc Mã NH không đúng
    }
    throw error; // Lỗi DB khác
  }
};

// // Service cập nhật TKNH
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
//     // if (affectedRows === 0 && Object.keys(tknhData).length > 0) { /*...*/ } // Xử lý tương tự updateNDT
//     return await TaiKhoanNganHangModel.findByMaTK(maTK);
//   } catch (error) {
//     if (
//       error.message.includes("Mã Ngân Hàng") &&
//       error.message.includes("không tồn tại")
//     ) {
//       // Lỗi FK từ model
//       throw new BadRequestError(error.message);
//     }
//     throw error;
//   }
// };

// // Service xóa TKNH
// NhaDauTuService.deleteTKNH = async (maTK) => {
//   const existingTKNH = await TaiKhoanNganHangModel.findByMaTK(maTK);
//   if (!existingTKNH) {
//     throw new NotFoundError(
//       `Không tìm thấy Tài khoản Ngân hàng với mã '${maTK}' để xóa.`
//     );
//   }
//   try {
//     // Model.deleteByMaTK đã kiểm tra ràng buộc và ném Error
//     const affectedRows = await TaiKhoanNganHangModel.deleteByMaTK(maTK);
//     // if (affectedRows === 0) { /*...*/ } // Xử lý tương tự deleteNDT
//     return { message: `Tài khoản Ngân hàng '${maTK}' đã được xóa.` };
//   } catch (error) {
//     if (error.message.includes("Không thể xóa")) {
//       // Lỗi ràng buộc từ model
//       throw new ConflictError(error.message);
//     }
//     throw error;
//   }
// };

module.exports = NhaDauTuService;
