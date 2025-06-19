/**
 * services/nganHang.service.js
 * Service xử lý logic liên quan đến ngân hàng.
 */
const NganHangModel = require('../models/NganHang.model');
const AppError = require('../utils/errors/AppError');
const NotFoundError = require('../utils/errors/NotFoundError');
const ConflictError = require('../utils/errors/ConflictError');

const NganHangService = {};

/**
 * Lấy danh sách tất cả ngân hàng
 */
NganHangService.getAllBanks = async () => {
  console.log('[Bank Service] Getting all banks...');
  try {
    return await NganHangModel.getAll();
  } catch (error) {
    console.error('Error in getAllBanks service:', error);
    throw error;
  }
};

/**
 * Lấy chi tiết một ngân hàng theo MaNH
 */
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

/**
 * Tạo mới một ngân hàng
 */
NganHangService.createBank = async (nganHangData) => {
  console.log(
    `[Bank Service] Creating new bank: ${nganHangData.MaNH} - ${nganHangData.TenNH}`
  );
  try {
    const newBank = await NganHangModel.create(nganHangData);
    return newBank;
  } catch (error) {
    console.error('Error in createBank service:', error);
    if (error instanceof ConflictError) throw error;
    throw error;
  }
};

/**
 * Cập nhật thông tin ngân hàng
 */
NganHangService.updateBank = async (maNH, nganHangData) => {
  console.log(`[Bank Service] Updating bank: ${maNH}`);
  const existingBank = await NganHangModel.findByMaNH(maNH);
  if (!existingBank) {
    throw new NotFoundError(
      `Không tìm thấy ngân hàng với mã '${maNH}' để cập nhật.`
    );
  }

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
    return existingBank;
  }

  try {
    const affectedRows = await NganHangModel.update(maNH, dataToUpdate);
    const updatedBank = await NganHangModel.findByMaNH(maNH);
    if (!updatedBank)
      throw new AppError(
        'Lỗi không mong muốn: Không tìm thấy ngân hàng sau khi cập nhật.',
        500
      );
    return updatedBank;
  } catch (error) {
    console.error(`Error in updateBank service for ${maNH}:`, error);
    if (error instanceof ConflictError || error instanceof NotFoundError)
      throw error;
    throw error;
  }
};

/**
 * Xóa một ngân hàng
 */
NganHangService.deleteBank = async (maNH) => {
  console.log(`[Bank Service] Deleting bank: ${maNH}`);
  const existingBank = await NganHangModel.findByMaNH(maNH);
  if (!existingBank) {
    throw new NotFoundError(
      `Không tìm thấy ngân hàng với mã '${maNH}' để xóa.`
    );
  }

  try {
    const affectedRows = await NganHangModel.delete(maNH);
    return { message: `Ngân hàng '${maNH}' đã được xóa thành công.` };
  } catch (error) {
    console.error(`Error in deleteBank service for ${maNH}:`, error);
    if (error instanceof ConflictError) throw error;
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
};

module.exports = NganHangService;
