// models/LenhKhop.model.js
const sql = require("mssql");
const db = require("./db");
const AppError = require("../utils/errors/AppError");

const LenhKhop = {};

// Hàm lấy danh sách Lệnh Khớp của một MaNDT trong khoảng thời gian
LenhKhop.findByMaNDTAndDateRange = async (maNDT, tuNgay, denNgay) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);

    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input("TuNgay", sql.DateTime, startDate);

    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997);
    request.input("DenNgay", sql.DateTime, endDate);

    // Query lấy thông tin từ LENHKHOP và join với LENHDAT, TAIKHOAN_NGANHANG
    const query = `
            SELECT
                lk.MaLK,
                lk.MaGD,
                lk.NgayGioKhop,
                lk.SoLuongKhop,
                lk.GiaKhop,
                lk.KieuKhop,
                ld.LoaiGD, -- Lấy loại giao dịch (Mua/Bán) từ Lệnh Đặt gốc
                ld.MaCP,   -- Lấy Mã CP từ Lệnh Đặt gốc
                ld.MaTK    -- Lấy Mã TK từ Lệnh Đặt gốc
            FROM LENHKHOP lk
            JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
            JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
            WHERE tk.MaNDT = @MaNDT
              AND lk.NgayGioKhop >= @TuNgay
              AND lk.NgayGioKhop <= @DenNgay
            ORDER BY lk.NgayGioKhop DESC; -- Sắp xếp theo thời gian khớp mới nhất
        `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error("SQL error finding LenhKhop by MaNDT and date range", err);
    throw err;
  }
};

/**
 * Tạo mới bản ghi Lệnh Khớp (dùng trong transaction).
 * @param {object} transactionRequest Đối tượng request của transaction
 * @param {object} khopData Dữ liệu lệnh khớp { MaGD, NgayGioKhop, SoLuongKhop, GiaKhop, KieuKhop }
 * @returns {Promise<object>} Thông tin lệnh khớp vừa tạo (bao gồm MaLK)
 */

// Hàm tạo lệnh khớp (sẽ dùng khi xây dựng logic khớp lệnh)
// LenhKhop.create = async (transactionRequest, khopData) => { ... }
LenhKhop.create = async (transactionRequest, khopData) => {
  const { MaGD, NgayGioKhop, SoLuongKhop, GiaKhop, KieuKhop } = khopData;
  const suffix = `${MaGD}_${Date.now()}`; // Thêm timestamp để gần như duy nhất
  const maGDInput = `MaGD_khop_${suffix}`;
  const ngayGioInput = `NgayGioKhop_${suffix}`;
  const slInput = `SoLuongKhop_${suffix}`;
  const giaInput = `GiaKhop_${suffix}`;
  const kieuInput = `KieuKhop_${suffix}`;
  try {
    // Không cần input MaLK vì nó tự động tăng
    // Sử dụng tên input duy nhất nếu cần, ví dụ dựa trên MaGD
    transactionRequest.input(maGDInput, sql.Int, MaGD);
    transactionRequest.input(ngayGioInput, sql.DateTime, NgayGioKhop);
    transactionRequest.input(slInput, sql.Int, SoLuongKhop);
    transactionRequest.input(giaInput, sql.Float, GiaKhop);
    transactionRequest.input(kieuInput, sql.NVarChar(50), KieuKhop);

    const query = `
          INSERT INTO LENHKHOP (MaGD, NgayGioKhop, SoLuongKhop, GiaKhop, KieuKhop)
          OUTPUT INSERTED.MaLK -- Trả về MaLK vừa tạo
          VALUES (@${maGDInput}, @${ngayGioInput}, @${slInput}, @${giaInput}, @${kieuInput});
      `;
    const result = await transactionRequest.query(query);

    if (result.recordset.length === 0 || !result.recordset[0].MaLK) {
      throw new Error(
        `Không thể tạo bản ghi LENHKHOP hoặc lấy MaLK cho MaGD ${MaGD}.`
      );
    }

    // Trả về thông tin lệnh khớp vừa tạo
    return {
      MaLK: result.recordset[0].MaLK,
      ...khopData,
    };
  } catch (err) {
    console.error(`SQL error creating LenhKhop for MaGD ${MaGD}`, err);
    // Kiểm tra lỗi khóa ngoại nếu cần (MaGD không tồn tại?)
    if (err.number === 547) {
      // Foreign key violation
      throw new Error(
        `Lỗi tạo lệnh khớp: Mã giao dịch ${MaGD} không tồn tại hoặc không hợp lệ.`
      );
    }
    throw err; // Ném lỗi khác để transaction rollback
  }
};

/**
 * Lấy danh sách Lệnh Khớp của một MaNDT CHỈ TRONG NGÀY HÔM NAY.
 * Bao gồm thông tin từ Lệnh Đặt gốc.
 * @param {string} maNDT Mã nhà đầu tư.
 * @returns {Promise<Array<object>>} Mảng các lệnh khớp trong ngày.
 */
LenhKhop.findByMaNDTForToday = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);

    // Lấy ngày hiện tại của SQL Server
    const queryGetDate = "SELECT CAST(GETDATE() AS DATE) as TodayDate";
    const dateResult = await pool.request().query(queryGetDate);
    const today = dateResult.recordset[0].TodayDate;
    request.input("NgayHomNay", sql.Date, today);

    // Query tương tự findByMaNDTAndDateRange nhưng lọc theo ngày hôm nay
    const query = `
          SELECT
              lk.MaLK, lk.MaGD, lk.NgayGioKhop, lk.SoLuongKhop, lk.GiaKhop, lk.KieuKhop,
              ld.LoaiGD, ld.MaCP, ld.MaTK
              -- Thêm các cột khác từ LENHDAT nếu cần (ví dụ: ld.Gia as GiaDat)
          FROM LENHKHOP lk
          JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          WHERE tk.MaNDT = @MaNDT
            AND CAST(lk.NgayGioKhop AS DATE) = @NgayHomNay -- Lọc theo ngày khớp là hôm nay
          ORDER BY lk.NgayGioKhop DESC; -- Mới nhất trước
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(
      `SQL error finding today's matched orders for NDT ${maNDT}:`,
      err
    );
    throw new AppError(
      `Lỗi khi lấy lệnh khớp trong ngày cho NĐT ${maNDT}.`,
      500
    );
  }
};

module.exports = LenhKhop;
