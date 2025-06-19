/**
 * services/statement.service.js
 * Service xử lý các nghiệp vụ sao kê, lịch sử giao dịch cho Nhà đầu tư.
 */

const TaiKhoanNganHangModel = require('../models/TaiKhoanNganHang.model');
const GiaoDichTienModel = require('../models/GiaoDichTien.model');
const BadRequestError = require('../utils/errors/BadRequestError');
const AppError = require('../utils/errors/AppError');
const NotFoundError = require('../utils/errors/NotFoundError');
const AuthorizationError = require('../utils/errors/AuthorizationError');
const StatementService = {};
const LenhDatModel = require('../models/LenhDat.model');
const LenhKhopModel = require('../models/LenhKhop.model');
const sql = require('mssql');
const db = require('../models/db');

/**
 * Lấy sao kê tiền mặt cho một nhà đầu tư trong khoảng thời gian.
 */
StatementService.getCashStatement = async (maNDT, tuNgay, denNgay) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  const cashEvents = await TaiKhoanNganHangModel.getCashFlowEvents(
    maNDT,
    tuNgay,
    denNgay
  );
  return {
    transactions: cashEvents,
  };
};

/**
 * Lấy sao kê tiền mặt cho nhân viên xem của một nhà đầu tư.
 */
StatementService.getInvestorCashStatement = async (maNDT, tuNgay, denNgay) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  const cashEvents = await TaiKhoanNganHangModel.getCashFlowEvents(
    maNDT,
    tuNgay,
    denNgay
  );
  return { transactions: cashEvents };
};

/**
 * Lấy lịch sử các giao dịch Nạp/Rút tiền (từ bảng GIAODICHTIEN) cho một NĐT.
 * @param {string} maNDT Mã nhà đầu tư.
 * @param {string | Date} tuNgay Ngày bắt đầu.
 * @param {string | Date} denNgay Ngày kết thúc.
 * @returns {Promise<Array<object>>}
 */
StatementService.getDepositWithdrawHistory = async (maNDT, tuNgay, denNgay) => {
  console.log(
    `[Statement Service] Getting deposit/withdraw history for NDT ${maNDT} from ${tuNgay} to ${denNgay}`
  );
  const startDate = new Date(tuNgay);
  const endDate = new Date(denNgay);

  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }

  try {
    const history = await GiaoDichTienModel.findByMaNDT(
      maNDT,
      startDate,
      endDate
    );
    return history;
  } catch (error) {
    console.error(
      `Error in getDepositWithdrawHistory service for NDT ${maNDT}:`,
      error
    );
    if (error instanceof AppError || error instanceof BadRequestError)
      throw error;
    throw new AppError(
      `Lỗi khi lấy lịch sử nạp/rút tiền cho NĐT ${maNDT}: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy lịch sử lệnh đặt của NĐT trong ngày hôm nay.
 * @param {string} maNDT Mã nhà đầu tư.
 * @returns {Promise<Array<object>>}
 */
StatementService.getMyOrdersToday = async (maNDT) => {
  console.log(`[Statement Service] Getting today's orders for NDT ${maNDT}`);
  try {
    const orders = await LenhDatModel.findByMaNDTForToday(maNDT);
    return orders;
  } catch (error) {
    console.error(`Error in getMyOrdersToday service for NDT ${maNDT}:`, error);
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Lỗi khi lấy lệnh đặt trong ngày: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy lịch sử lệnh khớp của NĐT trong ngày hôm nay.
 * @param {string} maNDT Mã nhà đầu tư.
 * @returns {Promise<Array<object>>}
 */
StatementService.getMyMatchedOrdersToday = async (maNDT) => {
  console.log(
    `[Statement Service] Getting today's matched orders for NDT ${maNDT}`
  );
  try {
    const orders = await LenhKhopModel.findByMaNDTForToday(maNDT);
    return orders;
  } catch (error) {
    console.error(
      `Error in getMyMatchedOrdersToday service for NDT ${maNDT}:`,
      error
    );
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Lỗi khi lấy lệnh khớp trong ngày: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy sao kê tài khoản tiền chi tiết (bao gồm số dư đầu/cuối từng giao dịch)
 * cho một tài khoản ngân hàng cụ thể của Nhà đầu tư.
 * @param {string} maNDT Mã NĐT sở hữu tài khoản (để kiểm tra quyền).
 * @param {string} maTK Mã tài khoản ngân hàng cần xem sao kê.
 * @param {string | Date} tuNgay Ngày bắt đầu.
 * @param {string | Date} denNgay Ngày kết thúc.
 * @returns {Promise<Array<object>>} Mảng các dòng sao kê chi tiết.
 */
StatementService.getAccountCashStatementDetail = async (
  maNDT,
  maTK,
  tuNgay,
  denNgay,
  role = 'NDT'
) => {
  console.log(
    `[Statement Service] Getting detailed cash statement for NDT ${maNDT}, Account ${maTK} from ${tuNgay} to ${denNgay}`
  );

  const startDate = new Date(tuNgay);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(denNgay);
  endDate.setHours(23, 59, 59, 997);

  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  if (!maTK) {
    throw new BadRequestError('Mã tài khoản là bắt buộc.');
  }

  try {
    const accountInfo = await TaiKhoanNganHangModel.findByMaTK(maTK);
    if (!accountInfo) {
      throw new NotFoundError(`Không tìm thấy tài khoản ngân hàng '${maTK}'.`);
    }
    if (accountInfo.MaNDT !== maNDT && role !== 'NhanVien') {
      throw new AuthorizationError(
        `Bạn không có quyền xem sao kê cho tài khoản '${maTK}'.`
      );
    }

    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaTK', sql.NChar(20), maTK);
    request.input('TuNgay', sql.DateTime, startDate);
    request.input('DenNgay', sql.DateTime, endDate);

    const result = await request.execute('dbo.sp_GetCashStatementByAccount');
    return result.recordset;
  } catch (error) {
    console.error(
      `Error in getAccountCashStatementDetail service for NDT ${maNDT}, Account ${maTK}:`,
      error
    );
    if (
      error instanceof AppError ||
      error instanceof BadRequestError ||
      error instanceof NotFoundError ||
      error instanceof AuthorizationError
    )
      throw error;
    throw new AppError(
      `Lỗi khi lấy sao kê tài khoản tiền chi tiết: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy thông tin tất cả tài khoản ngân hàng của Nhà đầu tư đang đăng nhập.
 * @param {string} maNDT Mã nhà đầu tư.
 * @returns {Promise<Array<object>>} Mảng các tài khoản ngân hàng.
 */
StatementService.getMyBankAccounts = async (maNDT) => {
  console.log(`[Statement Service] Getting bank accounts for NDT ${maNDT}`);
  try {
    const bankAccounts = await TaiKhoanNganHangModel.findByMaNDT(maNDT);
    if (!bankAccounts || bankAccounts.length === 0) {
      throw new NotFoundError(
        `Không tìm thấy tài khoản ngân hàng nào cho NĐT ${maNDT}.`
      );
    }
    return bankAccounts;
  } catch (error) {
    console.error(
      `Error in getMyBankAccounts service for NDT ${maNDT}:`,
      error
    );
    if (error instanceof AppError || error instanceof NotFoundError)
      throw error;
    throw new AppError(
      `Lỗi khi lấy thông tin tài khoản ngân hàng: ${error.message}`,
      500
    );
  }
};

module.exports = StatementService;
