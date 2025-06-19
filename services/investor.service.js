/**
 * services/investor.service.js
 * Service layer for investor-related operations, including admin deposit/withdraw.
 */
const sql = require('mssql');
const db = require('../models/db');
const NhaDauTuModel = require('../models/NhaDauTu.model');
const TaiKhoanNganHangModel = require('../models/TaiKhoanNganHang.model');
const SoHuuModel = require('../models/SoHuu.model');
const GiaoDichTienModel = require('../models/GiaoDichTien.model');
const NotFoundError = require('../utils/errors/NotFoundError');
const BadRequestError = require('../utils/errors/BadRequestError');
const AppError = require('../utils/errors/AppError');
const ConflictError = require('../utils/errors/ConflictError');

const InvestorService = {};

/**
 * Nhân viên thực hiện nạp tiền vào tài khoản của NĐT.
 * @param {string} maNVThucHien Mã nhân viên đang thực hiện.
 * @param {string} maTK Tài khoản ngân hàng của NĐT cần nạp.
 * @param {number} soTien Số tiền nạp (phải dương).
 * @param {string} [ghiChu] Ghi chú cho giao dịch.
 * @returns {Promise<object>} Thông tin giao dịch tiền vừa tạo.
 */
InvestorService.depositByAdmin = async (
  maNVThucHien,
  maTK,
  soTien,
  ghiChu = null
) => {
  if (!maTK || soTien <= 0) {
    throw new BadRequestError(
      'Mã tài khoản và số tiền nạp (dương) là bắt buộc.'
    );
  }

  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    const successIncrease = await TaiKhoanNganHangModel.increaseBalance(
      request,
      maTK,
      soTien
    );
    if (!successIncrease) {
      throw new AppError(
        `Không thể cập nhật số dư cho tài khoản ${maTK}.`,
        500
      );
    }

    const giaoDichData = {
      MaTK: maTK,
      LoaiGDTien: 'Nạp tiền',
      SoTien: soTien,
      GhiChu: ghiChu || `Nhân viên ${maNVThucHien} nạp tiền`,
      MaNVThucHien: maNVThucHien,
    };
    const createdGiaoDich = await GiaoDichTienModel.create(
      request,
      giaoDichData
    );

    await transaction.commit();
    console.log(
      `Admin ${maNVThucHien} deposited ${soTien} to account ${maTK}.`
    );
    return createdGiaoDich;
  } catch (error) {
    if (transaction && transaction.active) {
      await transaction.rollback();
    }
    console.error(
      `Error during admin deposit by ${maNVThucHien} to ${maTK}:`,
      error
    );
    if (error.message.includes('không tồn tại')) {
      throw new NotFoundError(error.message);
    }
    throw error;
  }
};

/**
 * Nhân viên thực hiện rút tiền khỏi tài khoản của NĐT.
 * @param {string} maNVThucHien Mã nhân viên đang thực hiện.
 * @param {string} maTK Tài khoản ngân hàng của NĐT cần rút.
 * @param {number} soTien Số tiền rút (phải dương).
 * @param {string} [ghiChu] Ghi chú cho giao dịch.
 * @returns {Promise<object>} Thông tin giao dịch tiền vừa tạo.
 */
InvestorService.withdrawByAdmin = async (
  maNVThucHien,
  maTK,
  soTien,
  ghiChu = null
) => {
  if (!maTK || soTien <= 0) {
    throw new BadRequestError(
      'Mã tài khoản và số tiền rút (dương) là bắt buộc.'
    );
  }

  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    await TaiKhoanNganHangModel.decreaseBalance(request, maTK, soTien);

    const giaoDichData = {
      MaTK: maTK,
      LoaiGDTien: 'Rút tiền',
      SoTien: soTien,
      GhiChu: ghiChu || `Nhân viên ${maNVThucHien} rút tiền`,
      MaNVThucHien: maNVThucHien,
    };
    const createdGiaoDich = await GiaoDichTienModel.create(
      request,
      giaoDichData
    );

    await transaction.commit();
    console.log(
      `Admin ${maNVThucHien} withdrew ${soTien} from account ${maTK}.`
    );
    return createdGiaoDich;
  } catch (error) {
    if (transaction && transaction.active) {
      await transaction.rollback();
    }
    console.error(
      `Error during admin withdraw by ${maNVThucHien} from ${maTK}:`,
      error
    );
    if (
      error.message.includes('không tồn tại') ||
      error.message.includes('không đủ')
    ) {
      throw new BadRequestError(error.message);
    }
    if (error.message.includes('Mã nhân viên')) {
      throw new NotFoundError(error.message);
    }
    throw error;
  }
};

module.exports = InvestorService;
