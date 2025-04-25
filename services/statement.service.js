// services/statement.service.js
const TradingService = require("./trading.service"); // Nếu cần gọi hàm khác từ đây
const TaiKhoanNganHangModel = require("../models/TaiKhoanNganHang.model"); // Import model TKNH
const { validationResult } = require("express-validator"); // Cần cho controller
const BadRequestError = require("../utils/errors/BadRequestError");
const AppError = require("../utils/errors/AppError"); // Cần cho controller
const NotFoundError = require("../utils/errors/NotFoundError"); // Cần cho controller
const AuthorizationError = require("../utils/errors/AuthorizationError"); // Cần cho controller
const StatementService = {}; // Đổi tên service nếu muốn tách riêng
const LenhDatModel = require("../models/LenhDat.model"); // Model cho lệnh đặt
const LenhKhopModel = require("../models/LenhKhop.model"); // Model cho lệnh khớp
const sql = require("mssql"); // Cần cho kiểu Date nếu gọi SP trực tiếp
const db = require("../models/db"); // Cần để gọi SP
// ... (các hàm sao kê lệnh đặt/khớp đã có) ...

// --- Service Lấy Sao Kê Tiền Mặt ---
StatementService.getCashStatement = async (maNDT, tuNgay, denNgay) => {
  // a. Kiểm tra ngày hợp lệ
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError("Khoảng thời gian cung cấp không hợp lệ.");
  }

  // b. Lấy các sự kiện giao dịch tiền trong khoảng thời gian
  const cashEvents = await TaiKhoanNganHangModel.getCashFlowEvents(
    maNDT,
    tuNgay,
    denNgay
  );

  // c. (Tùy chọn) Tính toán Số dư đầu kỳ và cuối kỳ
  // const openingBalance = await TaiKhoanNganHangModel.getBalanceAtDate(maNDT, tuNgay); // Khó khăn
  // let closingBalance = openingBalance;
  // if (openingBalance !== null) {
  //     cashEvents.forEach(event => {
  //         closingBalance += event.SoTienPhatSinh;
  //     });
  // } else {
  //      closingBalance = null; // Không tính được nếu không có số dư đầu
  // }

  // Trả về danh sách sự kiện (có thể bổ sung opening/closing nếu tính được)
  return {
    // openingBalance: openingBalance, // null nếu không tính được
    transactions: cashEvents,
    // closingBalance: closingBalance // null nếu không tính được
  };
};

// Hàm cho Nhân viên xem (có thể gộp nếu logic giống hệt)
StatementService.getInvestorCashStatement = async (maNDT, tuNgay, denNgay) => {
  // Tương tự getCashStatement, gọi các hàm model tương ứng
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError("Khoảng thời gian cung cấp không hợp lệ.");
  }
  // Optional: Check NDT exists
  const cashEvents = await TaiKhoanNganHangModel.getCashFlowEvents(
    maNDT,
    tuNgay,
    denNgay
  );
  // Optional: Calculate balances
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
  // Chuyển đổi ngày sang Date object nếu cần
  const startDate = new Date(tuNgay);
  const endDate = new Date(denNgay);

  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new BadRequestError("Khoảng thời gian cung cấp không hợp lệ.");
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
    const orders = await LenhDatModel.findByMaNDTForToday(maNDT); // Gọi hàm model mới
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
    const orders = await LenhKhopModel.findByMaNDTForToday(maNDT); // Gọi hàm model mới
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
  role = "NDT" // Tham số role để xác định quyền truy cập
) => {
  console.log(
    `[Statement Service] Getting detailed cash statement for NDT ${maNDT}, Account ${maTK} from ${tuNgay} to ${denNgay}`
  );

  // Chuyển đổi và kiểm tra ngày
  const startDate = new Date(tuNgay);
  startDate.setHours(0, 0, 0, 0); // Đầu ngày
  const endDate = new Date(denNgay);
  endDate.setHours(23, 59, 59, 997); // Cuối ngày

  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new BadRequestError("Khoảng thời gian cung cấp không hợp lệ.");
  }
  if (!maTK) {
    throw new BadRequestError("Mã tài khoản là bắt buộc.");
  }

  try {
    // *** KIỂM TRA QUYỀN SỞ HỮU TÀI KHOẢN ***
    // (Quan trọng khi NĐT tự gọi API)
    const accountInfo = await TaiKhoanNganHangModel.findByMaTK(maTK);
    if (!accountInfo) {
      throw new NotFoundError(`Không tìm thấy tài khoản ngân hàng '${maTK}'.`);
    }
    if (accountInfo.MaNDT !== maNDT && role !== "NhanVien") {
      throw new AuthorizationError(
        `Bạn không có quyền xem sao kê cho tài khoản '${maTK}'.`
      );
    }
    // *** HẾT KIỂM TRA QUYỀN ***

    // Gọi Stored Procedure
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaTK", sql.NChar(20), maTK);
    request.input("TuNgay", sql.DateTime, startDate); // SP dùng DATETIME
    request.input("DenNgay", sql.DateTime, endDate); // SP dùng DATETIME

    const result = await request.execute("dbo.sp_GetCashStatementByAccount");

    // SP đã trả về recordset chứa các dòng sao kê với số dư
    return result.recordset;
  } catch (error) {
    console.error(
      `Error in getAccountCashStatementDetail service for NDT ${maNDT}, Account ${maTK}:`,
      error
    );
    // Ném lại các lỗi đã biết hoặc lỗi chung
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

module.exports = StatementService;
