// services/portfolio.service.js
const sql = require("mssql"); // Cần cho transaction
const db = require("../models/db"); // Cần cho transaction
const TaiKhoanNganHangModel = require("../models/TaiKhoanNganHang.model");
const GiaoDichTienModel = require("../models/GiaoDichTien.model"); // <<< IMPORT
const SoHuuModel = require("../models/SoHuu.model"); // Giữ lại import nếu cần getPortfolio
const BadRequestError = require("../utils/errors/BadRequestError");
const AuthorizationError = require("../utils/errors/AuthorizationError");
const NotFoundError = require("../utils/errors/NotFoundError");
const AppError = require("../utils/errors/AppError");
const PortfolioService = {};

// ... (getMyBalances, getMyPortfolio giữ nguyên) ... => nó ở nhadautu.services.js

// --- THÊM HÀM MỚI CHO NĐT TỰ RÚT TIỀN ---
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
      "Mã tài khoản và số tiền rút (dương) là bắt buộc."
    );
  }

  let transaction;
  try {
    // Kiểm tra xem MaTK có thuộc MaNDT này không
    const tknh = await TaiKhoanNganHangModel.findByMaTK(maTK);
    if (!tknh) {
      throw new NotFoundError(
        `Mã tài khoản ngân hàng '${maTK}' không tồn tại.`
      );
    }
    if (tknh.MaNDT !== maNDT) {
      // Lỗi này không nên xảy ra nếu frontend chỉ hiển thị TK của NDT đó
      throw new AuthorizationError(`Tài khoản '${maTK}' không thuộc về bạn.`);
    }

    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    // Bước 1: Giảm số dư tài khoản (decreaseBalance đã check đủ tiền)
    await TaiKhoanNganHangModel.decreaseBalance(request, maTK, soTien);

    // Bước 2: Ghi nhận giao dịch tiền
    const giaoDichData = {
      MaTK: maTK,
      LoaiGDTien: "Rút tiền",
      SoTien: soTien,
      GhiChu: ghiChu || `Nhà đầu tư tự rút tiền`,
      MaNVThucHien: null, // Để NULL vì NĐT tự làm
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
    // Lỗi từ decreaseBalance (ko đủ tiền, ko tìm thấy TK) hoặc create GiaoDichTien
    if (
      error.message.includes("không tồn tại") ||
      error.message.includes("không đủ")
    ) {
      throw new BadRequestError(error.message);
    }
    // Ném lại lỗi khác
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
    throw new BadRequestError("Mã cổ phiếu là bắt buộc.");
  }
  try {
    // Gọi hàm model đã có
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
