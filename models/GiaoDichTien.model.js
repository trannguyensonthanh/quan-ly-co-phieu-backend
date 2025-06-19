/**
 * models/GiaoDichTien.model.js
 * Quản lý các thao tác với bảng GIAODICHTIEN (giao dịch tiền) trong CSDL.
 */
const sql = require('mssql');
const db = require('./db');
const AppError = require('../utils/errors/AppError');

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
    const suffix = `${MaTK}_${Date.now()}`;
    transactionRequest.input(`MaTK_gdt_${suffix}`, sql.NChar(20), MaTK);
    transactionRequest.input(
      `LoaiGDTien_gdt_${suffix}`,
      sql.NVarChar(20),
      LoaiGDTien
    );
    transactionRequest.input(`SoTien_gdt_${suffix}`, sql.Float, SoTien);
    transactionRequest.input(`GhiChu_gdt_${suffix}`, sql.NVarChar(200), GhiChu);
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
    console.error('SQL error creating GiaoDichTien:', err);
    if (err.number === 547) {
      if (err.message.includes('FK_GIAODICHTIEN_TK')) {
        throw new Error(
          `Lỗi tạo giao dịch tiền: Mã tài khoản '${MaTK}' không tồn tại.`
        );
      }
      if (err.message.includes('FK_GIAODICHTIEN_NV') && MaNVThucHien) {
        throw new Error(
          `Lỗi tạo giao dịch tiền: Mã nhân viên '${MaNVThucHien}' không tồn tại.`
        );
      }
    }
    throw new Error(`Lỗi khi ghi nhận giao dịch tiền: ${err.message}`);
  }
};

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
    request.input('MaNDT', sql.NChar(20), maNDT);
    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input('TuNgay', sql.DateTime, startDate);
    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997);
    request.input('DenNgay', sql.DateTime, endDate);

    const query = `
          SELECT
              gdt.MaGDTien,
              gdt.MaTK,
              gdt.NgayGD,
              gdt.LoaiGDTien,
              gdt.SoTien,
              gdt.GhiChu,
              gdt.MaNVThucHien
          FROM GIAODICHTIEN gdt
          JOIN TAIKHOAN_NGANHANG tk ON gdt.MaTK = tk.MaTK
          WHERE tk.MaNDT = @MaNDT
            AND gdt.NgayGD >= @TuNgay
            AND gdt.NgayGD <= @DenNgay
          ORDER BY gdt.NgayGD DESC;
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
    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input('TuNgay', sql.DateTime, startDate);
    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997);
    request.input('DenNgay', sql.DateTime, endDate);

    const query = `
          SELECT
              gdt.MaGDTien,
              gdt.MaTK,
              tk.MaNDT,
              tk.SoTien AS SoDu,
              ndt.HoTen AS TenNDT,
              gdt.NgayGD,
              gdt.LoaiGDTien,
              gdt.SoTien,
              gdt.GhiChu,
              gdt.MaNVThucHien
          FROM GIAODICHTIEN gdt
          JOIN TAIKHOAN_NGANHANG tk ON gdt.MaTK = tk.MaTK
          JOIN NDT ndt ON tk.MaNDT = ndt.MaNDT
          WHERE gdt.NgayGD >= @TuNgay AND gdt.NgayGD <= @DenNgay
          ORDER BY gdt.NgayGD DESC;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting all GiaoDichTien:', err);
    throw new AppError('Lỗi khi lấy toàn bộ lịch sử giao dịch tiền.', 500);
  }
};

module.exports = GiaoDichTien;
