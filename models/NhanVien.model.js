/**
 * models/NhanVien.model.js
 * Model cho bảng NHANVIEN (Nhân viên) và các thao tác liên quan.
 */

const sql = require('mssql');
const db = require('./db');

let NhanVien = {};

/**
 * Lấy thông tin profile Nhân viên (không lấy mật khẩu)
 */
NhanVien.findProfileByMaNV = async (maNV) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNV', sql.NChar(20), maNV);
    const query = `
            SELECT MaNV, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
            FROM NHANVIEN
            WHERE MaNV = @MaNV
        `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error finding profile for NhanVien ${maNV}:`, err);
    throw err;
  }
};

/**
 * Lấy nhân viên theo mã (bao gồm mật khẩu hash)
 */
NhanVien.findByMaNV = async (maNV) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNV', sql.NChar(20), maNV);
    const query =
      'SELECT MaNV, HoTen, PasswordHash, Email, CMND, GioiTinh, DiaChi, Phone, NgaySinh FROM NHANVIEN WHERE MaNV = @MaNV';
    const result = await request.query(query);
    if (result.recordset[0]) {
      const record = result.recordset[0];
      if (record.MaNV) record.MaNV = record.MaNV.trim();
      if (record.CMND) record.CMND = record.CMND.trim();
      if (record.GioiTinh) record.GioiTinh = record.GioiTinh.trim();
    }
    return result.recordset[0];
  } catch (err) {
    console.error('SQL error finding NhanVien by MaNV', err);
    throw err;
  }
};

/**
 * Tìm kiếm nhân viên bằng CMND
 */
NhanVien.findByCMND = async (cmnd) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('CMND', sql.NVarChar(20), cmnd);
    const query = `
      SELECT MaNV, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
      FROM NHANVIEN
      WHERE CMND = @CMND
    `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error finding NhanVien by CMND ${cmnd}:`, err);
    throw err;
  }
};

/**
 * Tìm kiếm nhân viên bằng Email
 */
NhanVien.findByEmail = async (email) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('Email', sql.NVarChar(255), email);
    const query = `
      SELECT MaNV, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
      FROM NHANVIEN
      WHERE Email = @Email
    `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error finding NhanVien by Email ${email}:`, err);
    throw err;
  }
};

/**
 * Cập nhật mật khẩu hash
 */
NhanVien.updatePasswordHash = async (maNV, hashedPassword) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNV', sql.NChar(20), maNV);
    request.input('PasswordHash', sql.NVarChar(255), hashedPassword);

    const query = `UPDATE NHANVIEN SET PasswordHash = @PasswordHash WHERE MaNV = @MaNV`;
    const result = await request.query(query);
    if (result.rowsAffected[0] === 0) {
      throw new Error(
        `Không tìm thấy Nhân Viên với mã '${maNV}' để cập nhật mật khẩu.`
      );
    }
    return true;
  } catch (err) {
    console.error(
      `SQL error updating password hash for NhanVien ${maNV}:`,
      err
    );
    throw err;
  }
};

/**
 * Xóa mật khẩu hash
 */
NhanVien.clearPasswordHash = async (maNV) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNV', sql.NChar(20), maNV);

    const query = `UPDATE NHANVIEN SET PasswordHash = NULL WHERE MaNV = @MaNV`;
    const result = await request.query(query);
    return result.rowsAffected[0] > 0;
  } catch (err) {
    console.error(
      `SQL error clearing password hash for NhanVien ${maNV}:`,
      err
    );
    throw err;
  }
};

/**
 * Kiểm tra NhanVien tồn tại theo mã
 */
NhanVien.exists = async (maNV) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNV', sql.NChar(20), maNV);
    const query = 'SELECT 1 FROM NHANVIEN WHERE MaNV = @MaNV';
    const result = await request.query(query);
    return result.recordset.length > 0;
  } catch (err) {
    console.error(`SQL error checking existence for NhanVien ${maNV}:`, err);
    throw err;
  }
};

/**
 * Kiểm tra sự tồn tại của mã nhân viên, CMND và email
 */
NhanVien.checkExistence = async (maNV, cmnd, email) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNV', sql.NChar(20), maNV);
    request.input('CMND', sql.NVarChar(20), cmnd);
    request.input('Email', sql.NVarChar(255), email);

    const query = `
      SELECT 
        (SELECT COUNT(*) FROM NHANVIEN WHERE MaNV = @MaNV) AS MaNVExists,
        (SELECT COUNT(*) FROM NHANVIEN WHERE CMND = @CMND) AS CMNDExists,
        (SELECT COUNT(*) FROM NHANVIEN WHERE Email = @Email) AS EmailExists
    `;
    const result = await request.query(query);
    const { MaNVExists, CMNDExists, EmailExists } = result.recordset[0];
    return {
      MaNVExists: MaNVExists > 0,
      CMNDExists: CMNDExists > 0,
      EmailExists: EmailExists > 0,
    };
  } catch (err) {
    console.error(`SQL error checking existence for NhanVien:`, err);
    throw err;
  }
};

/**
 * Tạo mới Nhân viên (không quản lý SQL Login)
 */
NhanVien.create = async (newNVData, hashedPassword) => {
  const { MaNV, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email } =
    newNVData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNV', sql.NChar(20), MaNV);
    request.input('HoTen', sql.NVarChar(255), HoTen);
    request.input('NgaySinh', sql.Date, NgaySinh);
    request.input('DiaChi', sql.NVarChar(255), DiaChi);
    request.input('Phone', sql.NVarChar(20), Phone);
    request.input('CMND', sql.NVarChar(20), CMND);
    request.input('GioiTinh', sql.NVarChar(10), GioiTinh);
    request.input('Email', sql.NVarChar(255), Email);
    request.input('PasswordHash', sql.NVarChar(255), hashedPassword);

    const query = `
      INSERT INTO NHANVIEN (MaNV, HoTen, NgaySinh, PasswordHash, DiaChi, Phone, CMND, GioiTinh, Email)
      OUTPUT INSERTED.MaNV, INSERTED.HoTen, INSERTED.NgaySinh, INSERTED.DiaChi, INSERTED.Phone, INSERTED.CMND, INSERTED.GioiTinh, INSERTED.Email
      VALUES (@MaNV, @HoTen, @NgaySinh, @PasswordHash, @DiaChi, @Phone, @CMND, @GioiTinh, @Email);
    `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    if (
      err.code === 'EREQUEST' &&
      err.originalError &&
      err.originalError.info &&
      err.originalError.info.number === 2627
    ) {
      throw new Error(
        `Nhân viên với mã '${MaNV}' hoặc email '${Email}' đã tồn tại.`
      );
    }
    console.error(`SQL error creating NhanVien ${MaNV}:`, err);
    throw err;
  }
};

/**
 * Lấy danh sách tổng hợp của Nhân viên và Nhà đầu tư cho Admin.
 */
NhanVien.getAllUsersForAdmin = async () => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const query = `
          SELECT
              MaNV AS username,
              HoTen,
              Email,
              Phone,
              CMND,
              DiaChi,
              NgaySinh,
              GioiTinh,
              'NhanVien' AS role
          FROM dbo.NhanVien

          UNION ALL

          SELECT
              MaNDT AS username,
              HoTen,
              Email,
              Phone,
              CMND,
              DiaChi,
              NgaySinh,
              GioiTinh,
              'NhaDauTu' AS role
          FROM dbo.NDT

          ORDER BY role ASC, HoTen ASC;
      `;
    const result = await request.query(query);
    result.recordset = result.recordset.map((record) => {
      Object.keys(record).forEach((key) => {
        if (typeof record[key] === 'string') {
          record[key] = record[key].trim();
        }
      });
      return record;
    });
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting all users for admin:', err);
    throw new Error(`Lỗi khi lấy danh sách người dùng: ${err.message}`);
  }
};

/**
 * Cập nhật thông tin chi tiết của Nhân viên (không bao gồm mật khẩu).
 */
NhanVien.updateDetails = async (maNV, nvData) => {
  const { HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email } = nvData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNV', sql.NChar(20), maNV);

    let setClauses = [];
    if (HoTen !== undefined) {
      request.input('HoTen', sql.NVarChar(50), HoTen);
      setClauses.push('HoTen = @HoTen');
    }
    if (NgaySinh !== undefined) {
      request.input('NgaySinh', sql.Date, NgaySinh ? new Date(NgaySinh) : null);
      setClauses.push('NgaySinh = @NgaySinh');
    }
    if (DiaChi !== undefined) {
      request.input('DiaChi', sql.NVarChar(100), DiaChi);
      setClauses.push('DiaChi = @DiaChi');
    }
    if (Phone !== undefined) {
      request.input('Phone', sql.NVarChar(15), Phone);
      setClauses.push('Phone = @Phone');
    }
    if (CMND !== undefined) {
      request.input('CMND', sql.NChar(10), CMND);
      setClauses.push('CMND = @CMND');
    }
    if (GioiTinh !== undefined) {
      request.input('GioiTinh', sql.NChar(5), GioiTinh);
      setClauses.push('GioiTinh = @GioiTinh');
    }
    if (Email !== undefined) {
      request.input('Email', sql.NVarChar(50), Email);
      setClauses.push('Email = @Email');
    }

    if (setClauses.length === 0) {
      console.warn(`No details to update for MaNV ${maNV}.`);
      return 0;
    }

    const query = `
          UPDATE NHANVIEN
          SET ${setClauses.join(', ')}
          WHERE MaNV = @MaNV;
          SELECT @@ROWCOUNT as AffectedRows;
      `;
    const result = await request.query(query);
    return result.recordset[0].AffectedRows;
  } catch (err) {
    console.error(`SQL error updating NhanVien details for ${maNV}:`, err);
    if (err.number === 2627 || err.number === 2601) {
      if (err.message.includes('UQ_NhanVien_CMND'))
        throw new Error(`Số CMND '${CMND}' đã tồn tại.`);
      if (err.message.includes('UQ_NhanVien_Email'))
        throw new Error(`Email '${Email}' đã tồn tại.`);
    }
    throw err;
  }
};

/**
 * Xóa một Nhân viên khỏi hệ thống.
 */
NhanVien.deleteByMaNV = async (maNV) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNV', sql.NChar(20), maNV);

    const checkGDTienQuery =
      'SELECT COUNT(*) as Count FROM GIAODICHTIEN WHERE MaNVThucHien = @MaNV';
    const gdTienResult = await request.query(checkGDTienQuery);
    if (gdTienResult.recordset[0].Count > 0) {
      throw new Error(
        `Không thể xóa Nhân viên '${maNV}' vì đã có lịch sử thực hiện giao dịch tiền.`
      );
    }

    const deleteQuery = 'DELETE FROM NHANVIEN WHERE MaNV = @MaNV;';
    const result = await request.query(deleteQuery);
    return result.rowsAffected[0];
  } catch (err) {
    console.error(`SQL error deleting NhanVien ${maNV}:`, err);
    throw err;
  }
};

module.exports = NhanVien;
