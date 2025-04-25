// models/GiaoDichTien.model.js
const sql = require("mssql");
const db = require("./db");
const AppError = require("../utils/errors/AppError");

const GiaoDichTien = {};

/**
 * Tạo bản ghi giao dịch tiền mới (dùng trong transaction).
 * @param {object} transactionRequest Đối tượng request của transaction.
 * @param {object} data Dữ liệu giao dịch: { MaTK, LoaiGDTien, SoTien, GhiChu, MaNVThucHien }
 * @returns {Promise<object>} Bản ghi giao dịch vừa tạo.
 */
GiaoDichTien.create = async (transactionRequest, data) => {
  const { MaTK, LoaiGDTien, SoTien, GhiChu, MaNVThucHien } = data;
  try {
    // Đặt tên input động để tránh xung đột nếu gọi nhiều lần trong 1 trans
    const suffix = `${MaTK}_${Date.now()}`;
    transactionRequest.input(`MaTK_gdt_${suffix}`, sql.NChar(20), MaTK);
    transactionRequest.input(
      `LoaiGDTien_gdt_${suffix}`,
      sql.NVarChar(20),
      LoaiGDTien
    );
    transactionRequest.input(`SoTien_gdt_${suffix}`, sql.Float, SoTien);
    transactionRequest.input(`GhiChu_gdt_${suffix}`, sql.NVarChar(200), GhiChu);
    // MaNVThucHien có thể là NULL nếu NĐT tự rút (thiết kế sau)
    transactionRequest.input(`MaNV_gdt_${suffix}`, sql.NChar(20), MaNVThucHien);

    const query = `
            INSERT INTO GIAODICHTIEN (MaTK, LoaiGDTien, SoTien, GhiChu, MaNVThucHien)
            OUTPUT INSERTED.*
            VALUES (@MaTK_gdt_${suffix}, @LoaiGDTien_gdt_${suffix}, @SoTien_gdt_${suffix}, @GhiChu_gdt_${suffix}, @MaNV_gdt_${suffix});
        `;
    const result = await transactionRequest.query(query);
    console.log(
      `Created GiaoDichTien record ID: ${result.recordset[0]?.MaGDTien}`
    );
    return result.recordset[0];
  } catch (err) {
    console.error("SQL error creating GiaoDichTien:", err);
    // Kiểm tra lỗi FK nếu cần
    if (err.number === 547) {
      if (err.message.includes("FK_GIAODICHTIEN_TK")) {
        throw new Error(
          `Lỗi tạo giao dịch tiền: Mã tài khoản '${MaTK}' không tồn tại.`
        );
      }
      if (err.message.includes("FK_GIAODICHTIEN_NV") && MaNVThucHien) {
        throw new Error(
          `Lỗi tạo giao dịch tiền: Mã nhân viên '${MaNVThucHien}' không tồn tại.`
        );
      }
    }
    throw new Error(`Lỗi khi ghi nhận giao dịch tiền: ${err.message}`); // Ném lỗi để transaction rollback
  }
};

// ... (hàm create giữ nguyên) ...

/**
 * Lấy danh sách tất cả giao dịch tiền của một Nhà đầu tư trong khoảng thời gian.
 * @param {string} maNDT Mã nhà đầu tư.
 * @param {Date} tuNgay Ngày bắt đầu.
 * @param {Date} denNgay Ngày kết thúc.
 * @returns {Promise<Array<object>>} Mảng các giao dịch tiền.
 */
GiaoDichTien.findByMaNDT = async (maNDT, tuNgay, denNgay) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
    // Đảm bảo tuNgay là đầu ngày và denNgay là cuối ngày
    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input("TuNgay", sql.DateTime, startDate);
    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997);
    request.input("DenNgay", sql.DateTime, endDate);

    // Query lấy GIAODICHTIEN và join để lọc theo MaNDT
    const query = `
          SELECT
              gdt.MaGDTien,
              gdt.MaTK,
              gdt.NgayGD,
              gdt.LoaiGDTien,
              gdt.SoTien,
              gdt.GhiChu,
              gdt.MaNVThucHien
              -- Có thể join thêm TAIKHOAN_NGANHANG hoặc NDT nếu cần thêm thông tin
          FROM GIAODICHTIEN gdt
          JOIN TAIKHOAN_NGANHANG tk ON gdt.MaTK = tk.MaTK -- Join để lọc theo MaNDT
          WHERE tk.MaNDT = @MaNDT
            AND gdt.NgayGD >= @TuNgay
            AND gdt.NgayGD <= @DenNgay
          ORDER BY gdt.NgayGD DESC; -- Sắp xếp mới nhất trước
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(`SQL error finding GiaoDichTien by MaNDT ${maNDT}:`, err);
    throw new AppError(
      `Lỗi khi lấy lịch sử giao dịch tiền cho NĐT ${maNDT}.`,
      500
    );
  }
};

/**
 * Lấy TẤT CẢ lịch sử giao dịch tiền (Nạp/Rút) trong khoảng thời gian.
 * Bao gồm thông tin TKNH và NĐT.
 * @param {Date} tuNgay Ngày bắt đầu.
 * @param {Date} denNgay Ngày kết thúc.
 * @returns {Promise<Array<object>>} Mảng các giao dịch tiền.
 */
GiaoDichTien.getAll = async (tuNgay, denNgay) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    // Đảm bảo tuNgay là đầu ngày và denNgay là cuối ngày
    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input("TuNgay", sql.DateTime, startDate);
    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997);
    request.input("DenNgay", sql.DateTime, endDate);

    // Query lấy TẤT CẢ GIAODICHTIEN và join thông tin cần thiết
    const query = `
          SELECT
              gdt.MaGDTien,
              gdt.MaTK,
              tk.MaNDT,       -- Lấy MaNDT từ TKNH
              tk.SoTien AS SoDu, -- Số dư tài khoản (có thể không cần)
              ndt.HoTen AS TenNDT, -- Lấy Tên NĐT
              gdt.NgayGD,
              gdt.LoaiGDTien,
              gdt.SoTien,
              gdt.GhiChu,
              gdt.MaNVThucHien -- Mã NV đã thực hiện (nếu có)
              -- Thêm TenNH nếu cần: JOIN NGANHANG nh ON tk.MaNH = nh.MaNH
          FROM GIAODICHTIEN gdt
          JOIN TAIKHOAN_NGANHANG tk ON gdt.MaTK = tk.MaTK
          JOIN NDT ndt ON tk.MaNDT = ndt.MaNDT -- Join để lấy tên NĐT
          WHERE gdt.NgayGD >= @TuNgay AND gdt.NgayGD <= @DenNgay
          ORDER BY gdt.NgayGD DESC; -- Sắp xếp mới nhất trước
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error("SQL error getting all GiaoDichTien:", err);
    throw new AppError("Lỗi khi lấy toàn bộ lịch sử giao dịch tiền.", 500);
  }
};

module.exports = GiaoDichTien;
