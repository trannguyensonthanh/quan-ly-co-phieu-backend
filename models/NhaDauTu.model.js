/**
 * models/NhaDauTu.model.js
 * Model cho bảng NDT (Nhà Đầu Tư)
 */

const sql = require('mssql');
const db = require('./db');
const TaiKhoanNganHangModel = require('./TaiKhoanNganHang.model');
const passwordHasher = require('../utils/passwordHasher');

let NhaDauTu = {};

/**
 * Hàm lấy thông tin profile NĐT (không lấy mật khẩu)
 */
NhaDauTu.findProfileByMaNDT = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    const query = `
            SELECT MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
            FROM NDT
            WHERE MaNDT = @MaNDT
        `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error finding profile for NhaDauTu ${maNDT}:`, err);
    throw err;
  }
};

/**
 * Tìm kiếm Nhà đầu tư theo mã NDT (MaNDT)
 */
NhaDauTu.findByMaNDT = async (maNDT, includeBankAccounts = false) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    const query =
      'SELECT MaNDT, HoTen, MKGD, Email, CMND, GioiTinh, DiaChi, Phone, NgaySinh FROM NDT WHERE MaNDT = @MaNDT';
    const result = await request.query(query);
    const ndt = result.recordset[0];
    if (ndt && includeBankAccounts === true) {
      try {
        ndt.TaiKhoanNganHang = await TaiKhoanNganHangModel.findByMaNDT(maNDT);
      } catch (bankErr) {
        console.error(
          `Error fetching bank accounts for NDT ${maNDT}:`,
          bankErr
        );
        ndt.TaiKhoanNganHang = [];
      }
    }
    return ndt;
  } catch (err) {
    console.error('SQL error finding NhaDauTu by MaNDT', err);
    throw err;
  }
};

/**
 * Hàm tìm kiếm Nhà đầu tư bằng Email
 */
NhaDauTu.findByEmail = async (email) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('Email', sql.NVarChar(50), email);
    const query = `
          SELECT MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
          FROM NDT
          WHERE Email = @Email
      `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error finding NhaDauTu by Email ${email}:`, err);
    throw err;
  }
};

/**
 * Hàm tìm kiếm Nhà đầu tư bằng CMND
 */
NhaDauTu.findByCMND = async (cmnd) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('CMND', sql.NChar(10), cmnd);
    const query = `
          SELECT MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
          FROM NDT
          WHERE CMND = @CMND
      `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error finding NhaDauTu by CMND ${cmnd}:`, err);
    throw err;
  }
};

/**
 * Hàm lấy tất cả Nhà đầu tư
 */
NhaDauTu.getAll = async () => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const query = `
          SELECT MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
          FROM NDT
          ORDER BY HoTen
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting all NhaDauTu', err);
    throw err;
  }
};

/**
 * Hàm tạo mới Nhà đầu tư
 */
NhaDauTu.create = async (newNDTData) => {
  const { MaNDT, HoTen, NgaySinh, MKGD, DiaChi, Phone, CMND, GioiTinh, Email } =
    newNDTData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), MaNDT);
    request.input('HoTen', sql.NVarChar(50), HoTen);
    request.input('NgaySinh', sql.Date, NgaySinh ? new Date(NgaySinh) : null);
    request.input('MKGD', sql.NVarChar(255), MKGD);
    request.input('DiaChi', sql.NVarChar(100), DiaChi);
    request.input('Phone', sql.NVarChar(15), Phone);
    request.input('CMND', sql.NChar(10), CMND);
    request.input('GioiTinh', sql.NChar(5), GioiTinh);
    request.input('Email', sql.NVarChar(50), Email);

    const query = `
    INSERT INTO NDT (MaNDT, HoTen, NgaySinh, MKGD, DiaChi, Phone, CMND, GioiTinh, Email)
    OUTPUT INSERTED.*
    VALUES (@MaNDT, @HoTen, @NgaySinh, @MKGD, @DiaChi, @Phone, @CMND, @GioiTinh, @Email);
`;
    await request.query(query);
    const { MKGD: _, ...createdNDT } = newNDTData;
    createdNDT.MaNDT = MaNDT;
    return createdNDT;
  } catch (err) {
    console.error('SQL error creating NhaDauTu', err);
    if (err.number === 2627 || err.number === 2601) {
      if (err.message.includes('PK__NDT')) {
        throw new Error(`Mã Nhà Đầu Tư '${MaNDT}' đã tồn tại.`);
      }
      if (err.message.includes('UQ__NDT__CMND')) {
        throw new Error(`Số CMND '${CMND}' đã tồn tại.`);
      }
    }
    throw err;
  }
};

/**
 * Hàm cập nhật Nhà đầu tư
 */
NhaDauTu.updateByMaNDT = async (maNDT, ndtData) => {
  const { HoTen, NgaySinh, DiaChi, Phone, GioiTinh, Email } = ndtData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    request.input('HoTen', sql.NVarChar(50), HoTen);
    request.input('NgaySinh', sql.Date, NgaySinh ? new Date(NgaySinh) : null);
    request.input('DiaChi', sql.NVarChar(100), DiaChi);
    request.input('Phone', sql.NVarChar(15), Phone);
    request.input('GioiTinh', sql.NChar(5), GioiTinh);
    request.input('Email', sql.NVarChar(50), Email);

    let setClauses = [];
    if (HoTen !== undefined) setClauses.push('HoTen = @HoTen');
    if (NgaySinh !== undefined) setClauses.push('NgaySinh = @NgaySinh');
    if (DiaChi !== undefined) setClauses.push('DiaChi = @DiaChi');
    if (Phone !== undefined) setClauses.push('Phone = @Phone');
    if (GioiTinh !== undefined) setClauses.push('GioiTinh = @GioiTinh');
    if (Email !== undefined) setClauses.push('Email = @Email');

    if (setClauses.length === 0) {
      return 0;
    }

    const query = `
          UPDATE NDT
          SET ${setClauses.join(', ')}
          WHERE MaNDT = @MaNDT
      `;

    const result = await request.query(query);
    return result.rowsAffected[0];
  } catch (err) {
    console.error('SQL error updating NhaDauTu', err);
    throw err;
  }
};

/**
 * Hàm xóa Nhà đầu tư
 */
NhaDauTu.deleteByMaNDT = async (maNDT) => {
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);

    await transaction.begin();
    const request = transaction.request();
    request.input('MaNDT', sql.NChar(20), maNDT);

    const checkLenhDatQuery = `SELECT COUNT(*) as count FROM LENHDAT ld JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK WHERE tk.MaNDT = @MaNDT AND ld.TrangThai NOT IN (N'Hết', N'Hủy')`;
    const lenhDatResult = await request.query(checkLenhDatQuery);
    if (lenhDatResult.recordset[0].count > 0) {
      await transaction.rollback();
      throw new Error(
        `Không thể xóa NDT ${maNDT} vì còn lệnh đặt chưa hoàn thành.`
      );
    }

    const checkSoHuuQuery =
      'SELECT COUNT(*) as count FROM SOHUU WHERE MaNDT = @MaNDT AND SoLuong > 0';
    const soHuuResult = await request.query(checkSoHuuQuery);
    if (soHuuResult.recordset[0].count > 0) {
      await transaction.rollback();
      throw new Error(`Không thể xóa NDT ${maNDT} vì đang sở hữu cổ phiếu.`);
    }

    const checkTaiKhoanQuery =
      'SELECT COUNT(*) as count FROM TAIKHOAN_NGANHANG WHERE MaNDT = @MaNDT AND SoTien > 0';
    const taiKhoanResult = await request.query(checkTaiKhoanQuery);
    if (taiKhoanResult.recordset[0].count > 0) {
      await transaction.rollback();
      throw new Error(
        `Không thể xóa NDT ${maNDT} vì tài khoản ngân hàng liên kết vẫn còn số dư.`
      );
    }

    const deleteTKNHQuery =
      'DELETE FROM TAIKHOAN_NGANHANG WHERE MaNDT = @MaNDT';
    await request.query(deleteTKNHQuery);

    const deleteNDTQuery = 'DELETE FROM NDT WHERE MaNDT = @MaNDT';
    const result = await request.query(deleteNDTQuery);

    await transaction.commit();
    return result.rowsAffected[0];
  } catch (err) {
    if (transaction && transaction.active) {
      await transaction.rollback();
    }
    console.error('SQL error deleting NhaDauTu', err);
    throw err;
  }
};

/**
 * Hàm cập nhật mật khẩu hash (MKGD)
 */
NhaDauTu.updatePasswordHash = async (maNDT, hashedPassword) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    request.input('MKGD', sql.NVarChar(255), hashedPassword);

    const query = `UPDATE NDT SET MKGD = @MKGD WHERE MaNDT = @MaNDT`;
    const result = await request.query(query);
    if (result.rowsAffected[0] === 0) {
      throw new Error(
        `Không tìm thấy Nhà Đầu Tư với mã '${maNDT}' để cập nhật mật khẩu.`
      );
    }
    return true;
  } catch (err) {
    console.error(
      `SQL error updating password hash for NhaDauTu ${maNDT}:`,
      err
    );
    throw err;
  }
};

/**
 * Hàm xóa mật khẩu hash (MKGD)
 */
NhaDauTu.clearPasswordHash = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);

    const query = `UPDATE NDT SET MKGD = NULL WHERE MaNDT = @MaNDT`;
    const result = await request.query(query);
    return result.rowsAffected[0] > 0;
  } catch (err) {
    console.error(
      `SQL error clearing password hash for NhaDauTu ${maNDT}:`,
      err
    );
    throw err;
  }
};

/**
 * Hàm kiểm tra NhaDauTu tồn tại
 */
NhaDauTu.exists = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    const query = 'SELECT 1 FROM NDT WHERE MaNDT = @MaNDT';
    const result = await request.query(query);
    return result.recordset.length > 0;
  } catch (err) {
    console.error(`SQL error checking existence for NhaDauTu ${maNDT}:`, err);
    throw err;
  }
};

/**
 * Hàm kiểm tra thông tin trùng lặp (trước khi tạo)
 */
NhaDauTu.checkExistence = async (maNDT, cmnd, email) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    request.input('CMND', sql.NChar(10), cmnd);
    request.input('Email', sql.NVarChar(50), email);

    const query = `
          SELECT
              CASE WHEN EXISTS (SELECT 1 FROM NDT WHERE MaNDT = @MaNDT) THEN 1 ELSE 0 END AS MaNDTExists,
              CASE WHEN EXISTS (SELECT 1 FROM NDT WHERE CMND = @CMND) THEN 1 ELSE 0 END AS CMNDExists,
              CASE WHEN @Email IS NOT NULL AND EXISTS (SELECT 1 FROM NDT WHERE Email = @Email) THEN 1 ELSE 0 END AS EmailExists;
      `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error('SQL error checking NDT existence', err);
    throw err;
  }
};

/**
 * Hàm tạo mới Nhà đầu tư (phiên bản dùng trong Transaction của Service)
 */
NhaDauTu.createInTransaction = async (
  transactionRequest,
  newNDTData,
  hashedPassword
) => {
  const { MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email } =
    newNDTData;
  try {
    transactionRequest.input('MaNDT_crt', sql.NChar(20), MaNDT);
    transactionRequest.input('HoTen_crt', sql.NVarChar(50), HoTen);
    transactionRequest.input(
      'NgaySinh_crt',
      sql.Date,
      NgaySinh ? new Date(NgaySinh) : null
    );
    transactionRequest.input('MKGD_crt', sql.NVarChar(255), hashedPassword);
    transactionRequest.input('DiaChi_crt', sql.NVarChar(100), DiaChi);
    transactionRequest.input('Phone_crt', sql.NVarChar(15), Phone);
    transactionRequest.input('CMND_crt', sql.NChar(10), CMND);
    transactionRequest.input('GioiTinh_crt', sql.NChar(5), GioiTinh);
    transactionRequest.input('Email_crt', sql.NVarChar(50), Email);

    const query = `
          INSERT INTO NDT (MaNDT, HoTen, NgaySinh, MKGD, DiaChi, Phone, CMND, GioiTinh, Email)
          VALUES (@MaNDT_crt, @HoTen_crt, @NgaySinh_crt, @MKGD_crt, @DiaChi_crt, @Phone_crt, @CMND_crt, @GioiTinh_crt, @Email_crt);
      `;
    await transactionRequest.query(query);
    return MaNDT;
  } catch (err) {
    console.error('SQL error creating NhaDauTu in transaction', err);
    if (err.number === 2627 || err.number === 2601) {
      throw new Error(
        `Lỗi khi tạo NDT: Mã NDT hoặc CMND có thể đã tồn tại (Race condition).`
      );
    }
    throw err;
  }
};

module.exports = NhaDauTu;
