/**
 * models/NganHang.model.js
 * Model thao tác với bảng NGANHANG trong CSDL.
 */
const sql = require('mssql');
const db = require('./db');
const AppError = require('../utils/errors/AppError');
const ConflictError = require('../utils/errors/ConflictError');

const NganHang = {};

/**
 * Lấy tất cả ngân hàng
 */
NganHang.getAll = async () => {
  try {
    const pool = await db.getPool();
    const result = await pool
      .request()
      .query(
        'SELECT MaNH, TenNH, DiaChi, Phone, Email FROM NGANHANG ORDER BY TenNH'
      );
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting all banks:', err);
    throw new AppError('Lỗi khi lấy danh sách ngân hàng.', 500);
  }
};

/**
 * Tìm ngân hàng theo Mã Ngân Hàng (MaNH)
 */
NganHang.findByMaNH = async (maNH) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNH', sql.NChar(20), maNH);
    const result = await request.query(
      'SELECT MaNH, TenNH, DiaChi, Phone, Email FROM NGANHANG WHERE MaNH = @MaNH'
    );
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error finding bank by MaNH ${maNH}:`, err);
    throw new AppError(`Lỗi khi tìm ngân hàng ${maNH}.`, 500);
  }
};

/**
 * Tạo mới một ngân hàng
 */
NganHang.create = async (nganHangData) => {
  const { MaNH, TenNH, DiaChi, Phone, Email } = nganHangData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNH', sql.NChar(20), MaNH);
    request.input('TenNH', sql.NVarChar(50), TenNH);
    request.input('DiaChi', sql.NVarChar(100), DiaChi);
    request.input('Phone', sql.NChar(10), Phone);
    request.input('Email', sql.NVarChar(50), Email);

    const query = `
            INSERT INTO NGANHANG (MaNH, TenNH, DiaChi, Phone, Email)
            OUTPUT INSERTED.*
            VALUES (@MaNH, @TenNH, @DiaChi, @Phone, @Email);
        `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error('SQL error creating bank:', err);
    if (err.number === 2627 || err.number === 2601) {
      if (err.message.includes('PK_NGANHANG')) {
        throw new ConflictError(`Mã ngân hàng '${MaNH}' đã tồn tại.`);
      }
      if (err.message.includes('UQ_NGANHANG_TenNH')) {
        throw new ConflictError(`Tên ngân hàng '${TenNH}' đã tồn tại.`);
      }
    }
    throw new AppError(`Lỗi khi tạo ngân hàng: ${err.message}`, 500);
  }
};

/**
 * Cập nhật thông tin ngân hàng
 */
NganHang.update = async (maNH, nganHangData) => {
  const { TenNH, DiaChi, Phone, Email } = nganHangData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNH', sql.NChar(20), maNH);

    let setClauses = [];
    if (TenNH !== undefined) {
      request.input('TenNH', sql.NVarChar(50), TenNH);
      setClauses.push('TenNH = @TenNH');
    }
    if (DiaChi !== undefined) {
      request.input('DiaChi', sql.NVarChar(100), DiaChi);
      setClauses.push('DiaChi = @DiaChi');
    }
    if (Phone !== undefined) {
      request.input('Phone', sql.NChar(10), Phone);
      setClauses.push('Phone = @Phone');
    }
    if (Email !== undefined) {
      request.input('Email', sql.NVarChar(50), Email);
      setClauses.push('Email = @Email');
    }

    if (setClauses.length === 0) return 0;

    const query = `
            UPDATE NGANHANG
            SET ${setClauses.join(', ')}
            WHERE MaNH = @MaNH;
            SELECT @@ROWCOUNT as AffectedRows;
        `;
    const result = await request.query(query);
    return result.recordset[0].AffectedRows;
  } catch (err) {
    console.error(`SQL error updating bank ${maNH}:`, err);
    if (err.number === 2627 || err.number === 2601) {
      if (err.message.includes('UQ_NGANHANG_TenNH')) {
        throw new ConflictError(`Tên ngân hàng '${TenNH}' đã tồn tại.`);
      }
    }
    throw new AppError(
      `Lỗi khi cập nhật ngân hàng ${maNH}: ${err.message}`,
      500
    );
  }
};

/**
 * Xóa một ngân hàng
 */
NganHang.delete = async (maNH) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNH', sql.NChar(20), maNH);

    const checkFKQuery =
      'SELECT COUNT(*) as Count FROM TAIKHOAN_NGANHANG WHERE MaNH = @MaNH';
    const fkResult = await request.query(checkFKQuery);
    if (fkResult.recordset[0].Count > 0) {
      throw new ConflictError(
        `Không thể xóa ngân hàng '${maNH}' vì đang có tài khoản nhà đầu tư liên kết.`
      );
    }

    const deleteQuery = 'DELETE FROM NGANHANG WHERE MaNH = @MaNH;';
    const result = await request.query(deleteQuery);
    return result.rowsAffected[0];
  } catch (err) {
    console.error(`SQL error deleting bank ${maNH}:`, err);
    if (err instanceof ConflictError) throw err;
    if (err.number === 547 && err.message.includes('TAIKHOAN_NGANHANG')) {
      throw new ConflictError(
        `Không thể xóa ngân hàng '${maNH}' vì có tài khoản nhà đầu tư liên kết (DB constraint).`
      );
    }
    throw new AppError(`Lỗi khi xóa ngân hàng ${maNH}: ${err.message}`, 500);
  }
};

module.exports = NganHang;
