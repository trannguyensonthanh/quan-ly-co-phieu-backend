// services/nganHang.service.js
const NganHangModel = require("../models/NganHang.model");
const AppError = require("../utils/errors/AppError");
const NotFoundError = require("../utils/errors/NotFoundError");
const ConflictError = require("../utils/errors/ConflictError");

const NganHangService = {};

/** Lấy danh sách tất cả ngân hàng */
NganHangService.getAllBanks = async () => {
  console.log("[Bank Service] Getting all banks...");
  try {
    return await NganHangModel.getAll();
  } catch (error) {
    console.error("Error in getAllBanks service:", error);
    throw error; // Ném lại lỗi đã được chuẩn hóa từ Model hoặc lỗi chung
  }
};

/** Lấy chi tiết một ngân hàng theo MaNH */
NganHangService.getBankByMaNH = async (maNH) => {
  console.log(`[Bank Service] Getting bank by MaNH: ${maNH}`);
  try {
    const bank = await NganHangModel.findByMaNH(maNH);
    if (!bank) {
      throw new NotFoundError(`Không tìm thấy ngân hàng với mã '${maNH}'.`);
    }
    return bank;
  } catch (error) {
    console.error(`Error in getBankByMaNH service for ${maNH}:`, error);
    if (error instanceof NotFoundError) throw error;
    throw new AppError(
      `Lỗi khi lấy thông tin ngân hàng ${maNH}: ${error.message}`,
      500
    );
  }
};

/** Tạo mới một ngân hàng */
NganHangService.createBank = async (nganHangData) => {
  console.log(
    `[Bank Service] Creating new bank: ${nganHangData.MaNH} - ${nganHangData.TenNH}`
  );
  // Model đã kiểm tra trùng lặp MaNH và TenNH
  try {
    const newBank = await NganHangModel.create(nganHangData);
    return newBank;
  } catch (error) {
    console.error("Error in createBank service:", error);
    if (error instanceof ConflictError) throw error; // Ném lại lỗi trùng lặp từ Model
    throw error; // Ném lại lỗi khác
  }
};

/** Cập nhật thông tin ngân hàng */
NganHangService.updateBank = async (maNH, nganHangData) => {
  console.log(`[Bank Service] Updating bank: ${maNH}`);
  // Kiểm tra xem ngân hàng có tồn tại không trước khi cập nhật
  const existingBank = await NganHangModel.findByMaNH(maNH);
  if (!existingBank) {
    throw new NotFoundError(
      `Không tìm thấy ngân hàng với mã '${maNH}' để cập nhật.`
    );
  }

  // Chỉ gửi các trường có giá trị để cập nhật (tránh gửi undefined)
  const dataToUpdate = {};
  if (nganHangData.TenNH !== undefined) dataToUpdate.TenNH = nganHangData.TenNH;
  if (nganHangData.DiaChi !== undefined)
    dataToUpdate.DiaChi = nganHangData.DiaChi;
  if (nganHangData.Phone !== undefined) dataToUpdate.Phone = nganHangData.Phone;
  if (nganHangData.Email !== undefined) dataToUpdate.Email = nganHangData.Email;

  if (Object.keys(dataToUpdate).length === 0) {
    console.warn(
      `[Bank Service] No valid fields provided to update bank ${maNH}.`
    );
    return existingBank; // Trả về thông tin hiện tại nếu không có gì update
  }

  try {
    const affectedRows = await NganHangModel.update(maNH, dataToUpdate);
    // Model đã xử lý lỗi trùng TenNH
    // if (affectedRows === 0) {
    //     console.warn(`Update for bank ${maNH} affected 0 rows.`);
    //     // Không hẳn là lỗi nếu dữ liệu gửi lên giống hệt dữ liệu cũ
    // }
    // Lấy lại thông tin mới nhất sau khi cập nhật
    const updatedBank = await NganHangModel.findByMaNH(maNH);
    if (!updatedBank)
      throw new AppError(
        "Lỗi không mong muốn: Không tìm thấy ngân hàng sau khi cập nhật.",
        500
      ); // Trường hợp hiếm
    return updatedBank;
  } catch (error) {
    console.error(`Error in updateBank service for ${maNH}:`, error);
    if (error instanceof ConflictError || error instanceof NotFoundError)
      throw error;
    throw error; // Ném lại lỗi khác
  }
};

/** Xóa một ngân hàng */
NganHangService.deleteBank = async (maNH) => {
  console.log(`[Bank Service] Deleting bank: ${maNH}`);
  // Kiểm tra tồn tại trước khi xóa
  const existingBank = await NganHangModel.findByMaNH(maNH);
  if (!existingBank) {
    throw new NotFoundError(
      `Không tìm thấy ngân hàng với mã '${maNH}' để xóa.`
    );
  }

  // Model delete đã kiểm tra ràng buộc FK từ TAIKHOAN_NGANHANG
  try {
    const affectedRows = await NganHangModel.delete(maNH);
    // if (affectedRows === 0) {
    //     // Có thể đã bị xóa bởi request khác?
    //     throw new AppError(`Xóa ngân hàng '${maNH}' thất bại.`, 500);
    // }
    return { message: `Ngân hàng '${maNH}' đã được xóa thành công.` };
  } catch (error) {
    console.error(`Error in deleteBank service for ${maNH}:`, error);
    // Lỗi Conflict từ model (do còn tài khoản liên kết)
    if (error instanceof ConflictError) throw error;
    if (error instanceof NotFoundError) throw error; // Nếu bị xóa trước đó
    throw error; // Ném lại lỗi khác
  }
};

module.exports = NganHangService;
