// services/investor.service.js
const sql = require("mssql"); // Cần cho transaction
const db = require("../models/db"); // Cần cho transaction
const NhaDauTuModel = require("../models/NhaDauTu.model");
const TaiKhoanNganHangModel = require("../models/TaiKhoanNganHang.model");
const SoHuuModel = require("../models/SoHuu.model");
const GiaoDichTienModel = require("../models/GiaoDichTien.model"); // <<< IMPORT MODEL MỚI
const NotFoundError = require("../utils/errors/NotFoundError");
const BadRequestError = require("../utils/errors/BadRequestError");
const AppError = require("../utils/errors/AppError");
const ConflictError = require("../utils/errors/ConflictError");

const InvestorService = {};

// ... (Các hàm CRUD NDT, CRUD TKNH, Tra cứu, Sao kê cũ giữ nguyên) ...

// --- THÊM HÀM MỚI CHO NẠP/RÚT TIỀN (DO ADMIN THỰC HIỆN) ---

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
      "Mã tài khoản và số tiền nạp (dương) là bắt buộc."
    );
  }

  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    // Bước 1: Tăng số dư tài khoản
    // Hàm increaseBalance đã kiểm tra amount > 0
    const successIncrease = await TaiKhoanNganHangModel.increaseBalance(
      request,
      maTK,
      soTien
    );
    if (!successIncrease) {
      // Lỗi này ít khi xảy ra nếu check tồn tại trước, nhưng phòng ngừa
      throw new AppError(
        `Không thể cập nhật số dư cho tài khoản ${maTK}.`,
        500
      );
    }

    // Bước 2: Ghi nhận giao dịch tiền
    const giaoDichData = {
      MaTK: maTK,
      LoaiGDTien: "Nạp tiền",
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
    // Ném lại lỗi đã được chuẩn hóa từ model hoặc lỗi chung
    if (error.message.includes("không tồn tại")) {
      // Lỗi từ increaseBalance hoặc create GiaoDichTien
      throw new NotFoundError(error.message);
    }
    throw error; // Ném lại các lỗi khác
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
      "Mã tài khoản và số tiền rút (dương) là bắt buộc."
    );
  }

  let transaction;
  try {
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
    // Lỗi từ decreaseBalance (ko đủ tiền, ko tìm thấy TK) hoặc create GiaoDichTien
    if (
      error.message.includes("không tồn tại") ||
      error.message.includes("không đủ")
    ) {
      throw new BadRequestError(error.message); // Coi là Bad Request
    }
    if (error.message.includes("Mã nhân viên")) {
      // Lỗi FK của NV
      throw new NotFoundError(error.message);
    }
    throw error; // Ném lại các lỗi khác
  }
};

module.exports = InvestorService;
