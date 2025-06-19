/**
 * models/TaiKhoanNganHang.model.js
 * Quản lý các thao tác với bảng TAIKHOAN_NGANHANG (Tài khoản ngân hàng của Nhà đầu tư)
 */

const sql = require('mssql');
const db = require('./db');
const AppError = require('../utils/errors/AppError');
const TaiKhoanNganHang = {};

/**
 * Tìm TKNH theo MaTK (Khóa chính)
 */
TaiKhoanNganHang.findByMaTK = async (maTK) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaTK', sql.NChar(20), maTK);
    const query = `
            SELECT tk.MaTK, tk.MaNDT, tk.SoTien, tk.MaNH, nh.TenNH
            FROM TAIKHOAN_NGANHANG tk
            LEFT JOIN NGANHANG nh ON tk.MaNH = nh.MaNH
            WHERE tk.MaTK = @MaTK
        `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error('SQL error finding TaiKhoanNganHang by MaTK', err);
    throw err;
  }
};

/**
 * Tìm tất cả TKNH của một Nhà đầu tư (MaNDT)
 */
TaiKhoanNganHang.findByMaNDT = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    const query = `
            SELECT tk.MaTK, tk.MaNDT, tk.SoTien, tk.MaNH, nh.TenNH
            FROM TAIKHOAN_NGANHANG tk
            LEFT JOIN NGANHANG nh ON tk.MaNH = nh.MaNH
            WHERE tk.MaNDT = @MaNDT
            ORDER BY tk.MaTK
        `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error finding TaiKhoanNganHang by MaNDT', err);
    throw err;
  }
};

/**
 * Tạo mới Tài khoản Ngân hàng cho NDT
 */
TaiKhoanNganHang.create = async (newTKNHData) => {
  const { MaTK, MaNDT, SoTien, MaNH } = newTKNHData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaTK', sql.NChar(20), MaTK);
    request.input('MaNDT', sql.NChar(20), MaNDT);
    request.input('SoTien', sql.Float, SoTien);
    request.input('MaNH', sql.NChar(20), MaNH);

    const query = `
            INSERT INTO TAIKHOAN_NGANHANG (MaTK, MaNDT, SoTien, MaNH)
            VALUES (@MaTK, @MaNDT, @SoTien, @MaNH)
        `;
    await request.query(query);
    return await TaiKhoanNganHang.findByMaTK(MaTK);
  } catch (err) {
    console.error('SQL error creating TaiKhoanNganHang', err);
    if (err.number === 2627 || err.number === 2601) {
      throw new Error(`Mã tài khoản '${MaTK}' đã tồn tại.`);
    }
    if (err.number === 547) {
      if (err.message.includes('FK__TAIKHOAN___MaNDT')) {
        throw new Error(`Mã Nhà Đầu Tư '${MaNDT}' không tồn tại.`);
      }
      if (err.message.includes('FK__TAIKHOAN___MaNH')) {
        throw new Error(`Mã Ngân Hàng '${MaNH}' không tồn tại.`);
      }
    }
    throw err;
  }
};

/**
 * Cập nhật Tài khoản Ngân hàng
 */
TaiKhoanNganHang.updateByMaTK = async (maTK, tknhData) => {
  const { SoTien, MaNH } = tknhData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaTK', sql.NChar(20), maTK);

    let setClauses = [];
    if (SoTien !== undefined && SoTien !== null) {
      request.input('SoTien', sql.Float, SoTien);
      setClauses.push('SoTien = @SoTien');
    }
    if (MaNH) {
      request.input('MaNH', sql.NChar(20), MaNH);
      setClauses.push('MaNH = @MaNH');
    }

    if (setClauses.length === 0) {
      return 0;
    }

    const query = `
            UPDATE TAIKHOAN_NGANHANG
            SET ${setClauses.join(', ')}
            WHERE MaTK = @MaTK
        `;

    const result = await request.query(query);
    return result.rowsAffected[0];
  } catch (err) {
    console.error('SQL error updating TaiKhoanNganHang', err);
    if (err.number === 547 && err.message.includes('FK__TAIKHOAN___MaNH')) {
      throw new Error(`Mã Ngân Hàng '${MaNH}' không tồn tại.`);
    }
    throw err;
  }
};

/**
 * Xóa Tài khoản Ngân hàng
 */
TaiKhoanNganHang.deleteByMaTK = async (maTK) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaTK', sql.NChar(20), maTK);

    const checkLenhDatQuery = `SELECT COUNT(*) as count FROM LENHDAT WHERE MaTK = @MaTK AND TrangThai NOT IN (N'Hết', N'Hủy')`;
    const lenhDatResult = await request.query(checkLenhDatQuery);
    if (lenhDatResult.recordset[0].count > 0) {
      throw new Error(
        `Không thể xóa tài khoản ${maTK} vì đang có lệnh đặt chưa hoàn thành sử dụng tài khoản này.`
      );
    }

    const checkSoTienQuery = `SELECT SoTien FROM TAIKHOAN_NGANHANG WHERE MaTK = @MaTK`;
    const soTienResult = await request.query(checkSoTienQuery);
    if (
      soTienResult.recordset.length > 0 &&
      soTienResult.recordset[0].SoTien > 0
    ) {
      throw new Error(
        `Không thể xóa tài khoản ${maTK} vì số dư vẫn lớn hơn 0.`
      );
    }

    const deleteQuery = 'DELETE FROM TAIKHOAN_NGANHANG WHERE MaTK = @MaTK';
    const result = await request.query(deleteQuery);
    return result.rowsAffected[0];
  } catch (err) {
    console.error('SQL error deleting TaiKhoanNganHang', err);
    throw err;
  }
};

/**
 * Lấy danh sách TẤT CẢ Tài khoản Ngân hàng của tất cả Nhà đầu tư.
 * Bao gồm tên NĐT và tên Ngân hàng.
 * @returns {Promise<Array<object>>} Mảng các tài khoản ngân hàng.
 */
TaiKhoanNganHang.getAll = async () => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const query = `
          SELECT
              tk.MaTK, tk.MaNDT, ndt.HoTen AS TenNDT, tk.SoTien, tk.MaNH, nh.TenNH
          FROM TAIKHOAN_NGANHANG tk
          JOIN NDT ndt ON tk.MaNDT = ndt.MaNDT
          JOIN NGANHANG nh ON tk.MaNH = nh.MaNH
          ORDER BY ndt.HoTen, tk.MaTK;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting all bank accounts:', err);
    throw new AppError(
      'Lỗi khi lấy danh sách tất cả tài khoản ngân hàng.',
      500
    );
  }
};

/**
 * Kiểm tra và giảm số dư (dùng trong transaction)
 * Cần truyền đối tượng request của transaction vào
 */
TaiKhoanNganHang.decreaseBalance = async (
  transactionRequest,
  maTK,
  amountToDecrease
) => {
  if (amountToDecrease <= 0) {
    throw new Error('Số tiền cần giảm phải lớn hơn 0.');
  }
  try {
    transactionRequest.input('MaTK_decrease', sql.NChar(20), maTK);
    transactionRequest.input('AmountToDecrease', sql.Float, amountToDecrease);

    const checkBalanceQuery = `
          SELECT SoTien FROM TAIKHOAN_NGANHANG WHERE MaTK = @MaTK_decrease;
      `;
    const balanceResult = await transactionRequest.query(checkBalanceQuery);

    if (balanceResult.recordset.length === 0) {
      throw new Error(`Tài khoản ngân hàng '${maTK}' không tồn tại.`);
    }

    const currentBalance = balanceResult.recordset[0].SoTien;
    if (currentBalance < amountToDecrease) {
      throw new Error(
        `Số dư tài khoản ${maTK} không đủ (${currentBalance.toLocaleString(
          'vi-VN'
        )}đ) để thực hiện giao dịch ${amountToDecrease.toLocaleString(
          'vi-VN'
        )}đ.`
      );
    }

    const updateBalanceQuery = `
          UPDATE TAIKHOAN_NGANHANG
          SET SoTien = SoTien - @AmountToDecrease
          WHERE MaTK = @MaTK_decrease;
      `;
    const updateResult = await transactionRequest.query(updateBalanceQuery);

    if (updateResult.rowsAffected[0] === 0) {
      throw new Error(`Không thể cập nhật số dư cho tài khoản ${maTK}.`);
    }
    console.log(
      `Balance decreased for ${maTK} by ${amountToDecrease}. New potential balance: ${
        currentBalance - amountToDecrease
      }`
    );
    return currentBalance - amountToDecrease;
  } catch (err) {
    console.error(`Error decreasing balance for ${maTK}`, err);
    throw err;
  }
};

/**
 * Tăng số dư tài khoản ngân hàng (dùng trong transaction).
 * @param {object} transactionRequest Đối tượng request của transaction
 * @param {string} maTK Mã tài khoản
 * @param {number} amountToIncrease Số tiền cần tăng (>0)
 * @returns {Promise<boolean>} True nếu thành công
 */
TaiKhoanNganHang.increaseBalance = async (
  transactionRequest,
  maTK,
  amountToIncrease
) => {
  if (amountToIncrease <= 0) {
    console.warn(
      `Attempted to increase balance by zero or negative amount for ${maTK}. Amount: ${amountToIncrease}`
    );
    return true;
  }

  const inputSuffix = `${maTK}_inc_${Date.now()}`;
  const maTKInput = `MaTK_increase_${inputSuffix}`;
  const amountInput = `AmountToIncrease_${inputSuffix}`;
  try {
    transactionRequest.input(maTKInput, sql.NChar(20), maTK);
    transactionRequest.input(amountInput, sql.Float, amountToIncrease);

    const query = `
           UPDATE TAIKHOAN_NGANHANG
            SET SoTien = SoTien + @${amountInput}
            WHERE MaTK = @${maTKInput};
      `;
    const result = await transactionRequest.query(query);
    if (result.rowsAffected[0] === 0) {
      console.warn(
        `Attempted to increase balance for non-existent or unchanged account ${maTK}`
      );
      throw new Error(`Không thể cập nhật (tăng) số dư cho tài khoản ${maTK}.`);
    }

    return true;
  } catch (err) {
    console.error(`Error increasing balance for ${maTK}`, err);
    throw err;
  }
};

/**
 * Lấy các sự kiện tiền mặt của NDT trong khoảng thời gian
 */
TaiKhoanNganHang.getCashFlowEvents = async (maNDT, tuNgay, denNgay) => {
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
        ld.NgayGD AS Ngay,
        'LENHDAT_M' AS Nguon,
        ld.MaGD AS IDGoc,
        -(ld.SoLuong * ld.Gia) AS SoTienPhatSinh,
        N'Đặt lệnh mua ' + ld.MaCP + N' (Mã GD: ' + CAST(ld.MaGD AS VARCHAR) + N')' AS LyDo,
        ld.MaTK
    FROM LENHDAT ld
    JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
    WHERE tk.MaNDT = @MaNDT AND ld.LoaiGD = 'M'
      AND ld.NgayGD >= @TuNgay AND ld.NgayGD <= @DenNgay

    UNION ALL

    SELECT
        lk.NgayGioKhop AS Ngay,
        'LENHKHOP_B' AS Nguon,
        lk.MaLK AS IDGoc,
        (lk.SoLuongKhop * lk.GiaKhop) AS SoTienPhatSinh,
        N'Khớp lệnh bán ' + ld.MaCP + N' (Mã GD: ' + CAST(ld.MaGD AS VARCHAR) + N', Mã LK: ' + CAST(lk.MaLK AS VARCHAR) + N')' AS LyDo,
        ld.MaTK
    FROM LENHKHOP lk
    JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
    JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
    WHERE tk.MaNDT = @MaNDT AND ld.LoaiGD = 'B'
      AND lk.NgayGioKhop >= @TuNgay AND lk.NgayGioKhop <= @DenNgay

    UNION ALL

    SELECT
        gdt.NgayGD AS Ngay,
        'GIAODICHTIEN' AS Nguon,
        gdt.MaGDTien AS IDGoc,
        CASE
            WHEN gdt.LoaiGDTien = N'Nạp tiền' THEN gdt.SoTien
            WHEN gdt.LoaiGDTien = N'Rút tiền' THEN -gdt.SoTien
            ELSE 0
        END AS SoTienPhatSinh,
        gdt.LoaiGDTien +
           ISNULL(N' (NV: ' + gdt.MaNVThucHien + N')', N' (Tự thực hiện)') +
           ISNULL(N' - Ghi chú: ' + gdt.GhiChu, '') AS LyDo,
        gdt.MaTK
    FROM GIAODICHTIEN gdt
    JOIN TAIKHOAN_NGANHANG tk ON gdt.MaTK = tk.MaTK
    WHERE tk.MaNDT = @MaNDT
      AND gdt.NgayGD >= @TuNgay AND gdt.NgayGD <= @DenNgay

    ORDER BY Ngay ASC;
`;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting cash flow events', err);
    throw err;
  }
};

/**
 * Lấy số dư tại một thời điểm - Cần logic phức tạp hơn
 */
TaiKhoanNganHang.getBalanceAtDate = async (maNDT, targetDate) => {
  console.warn(
    'getBalanceAtDate function is complex and not fully implemented.'
  );
  return null;
};

module.exports = TaiKhoanNganHang;
