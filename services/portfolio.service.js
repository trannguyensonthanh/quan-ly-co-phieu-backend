/**
 * services/portfolio.service.js
 * PortfolioService: Cung cấp các hàm xử lý liên quan đến danh mục đầu tư, số dư, rút tiền, số lượng cổ phiếu sở hữu.
 */
const sql = require('mssql');
const db = require('../models/db');
const TaiKhoanNganHangModel = require('../models/TaiKhoanNganHang.model');
const GiaoDichTienModel = require('../models/GiaoDichTien.model');
const SoHuuModel = require('../models/SoHuu.model');
const BadRequestError = require('../utils/errors/BadRequestError');
const AuthorizationError = require('../utils/errors/AuthorizationError');
const NotFoundError = require('../utils/errors/NotFoundError');
const AppError = require('../utils/errors/AppError');
const PortfolioService = {};

/**
 * Nhà đầu tư tự thực hiện rút tiền từ tài khoản của mình.
 * @param {string} maNDT Mã nhà đầu tư đang thực hiện.
 * @param {string} maTK Tài khoản ngân hàng cần rút.
 * @param {number} soTien Số tiền rút (phải dương).
 * @param {string} [ghiChu] Ghi chú (tùy chọn).
 * @returns {Promise<object>} Thông tin giao dịch tiền vừa tạo.
 */
PortfolioService.withdrawByInvestor = async (
  maNDT,
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
    const tknh = await TaiKhoanNganHangModel.findByMaTK(maTK);
    if (!tknh) {
      throw new NotFoundError(
        `Mã tài khoản ngân hàng '${maTK}' không tồn tại.`
      );
    }
    if (tknh.MaNDT !== maNDT) {
      throw new AuthorizationError(`Tài khoản '${maTK}' không thuộc về bạn.`);
    }

    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    await TaiKhoanNganHangModel.decreaseBalance(request, maTK, soTien);

    const giaoDichData = {
      MaTK: maTK,
      LoaiGDTien: 'Rút tiền',
      SoTien: soTien,
      GhiChu: ghiChu || `Nhà đầu tư tự rút tiền`,
      MaNVThucHien: null,
    };
    const createdGiaoDich = await GiaoDichTienModel.create(
      request,
      giaoDichData
    );

    await transaction.commit();
    console.log(`Investor ${maNDT} withdrew ${soTien} from account ${maTK}.`);
    return createdGiaoDich;
  } catch (error) {
    if (transaction && transaction.active) {
      await transaction.rollback();
    }
    console.error(
      `Error during investor withdraw by ${maNDT} from ${maTK}:`,
      error
    );
    if (
      error.message.includes('không tồn tại') ||
      error.message.includes('không đủ')
    ) {
      throw new BadRequestError(error.message);
    }
    throw error;
  }
};

/**
 * Lấy số lượng sở hữu của một mã cổ phiếu cụ thể cho NĐT đang đăng nhập.
 * @param {string} maNDT Mã NĐT (lấy từ token).
 * @param {string} maCP Mã cổ phiếu cần kiểm tra.
 * @returns {Promise<{maCP: string, soLuong: number}>} Object chứa mã CP và số lượng.
 */
PortfolioService.getStockQuantity = async (maNDT, maCP) => {
  console.log(
    `[Portfolio Service] Getting quantity for ${maCP} for NDT ${maNDT}`
  );
  if (!maCP) {
    throw new BadRequestError('Mã cổ phiếu là bắt buộc.');
  }
  try {
    const quantity = await SoHuuModel.getSoLuong(maNDT, maCP);
    return { maCP: maCP, soLuong: quantity };
  } catch (error) {
    console.error(
      `Error in getStockQuantity service for NDT ${maNDT}, CP ${maCP}:`,
      error
    );
    if (error instanceof AppError || error instanceof BadRequestError)
      throw error;
    throw new AppError(
      `Lỗi khi lấy số lượng sở hữu CP ${maCP}: ${error.message}`,
      500
    );
  }
};

module.exports = PortfolioService;
