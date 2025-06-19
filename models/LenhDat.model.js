/**
 * models/LenhDat.model.js
 * Xử lý các thao tác với bảng LENHDAT (lệnh đặt) trong hệ thống quản lý cổ phiếu.
 */
const sql = require('mssql');
const db = require('./db');
const AppError = require('../utils/errors/AppError');
const LenhDat = {};

/**
 * Tính tổng số lượng cổ phiếu đang chờ bán (Chờ hoặc Một phần)
 * của một NĐT cho một mã CP cụ thể.
 * @param {string} maNDT
 * @param {string} maCP
 * @returns {Promise<number>} Tổng số lượng đang chờ bán.
 */
LenhDat.getTotalPendingSellQuantity = async (maNDT, maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    request.input('MaCP', sql.NVarChar(10), maCP);

    const query = `
          WITH TongKhopTheoLenh AS (
              SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop
              FROM dbo.LENHKHOP
              WHERE MaGD IN (SELECT ld.MaGD FROM dbo.LENHDAT ld JOIN dbo.TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK WHERE tk.MaNDT = @MaNDT AND ld.MaCP = @MaCP AND ld.LoaiGD = 'B')
              GROUP BY MaGD
          )
          SELECT ISNULL(SUM(ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)), 0) AS TongChoBan
          FROM dbo.LENHDAT ld
          JOIN dbo.TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD
          WHERE tk.MaNDT = @MaNDT
            AND ld.MaCP = @MaCP
            AND ld.LoaiGD = 'B'
            AND ld.TrangThai IN (N'Chờ', N'Một phần')
            AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0;
      `;
    const result = await request.query(query);
    return result.recordset[0]?.TongChoBan || 0;
  } catch (err) {
    console.error(
      `SQL error getting pending sell quantity for ${maNDT}-${maCP}:`,
      err
    );
    throw new AppError(
      `Lỗi khi lấy khối lượng chờ bán cho ${maNDT}-${maCP}.`,
      500
    );
  }
};

/**
 * Hàm tạo mới lệnh đặt (dùng trong transaction)
 * Cần truyền đối tượng request của transaction vào
 */
LenhDat.create = async (transactionRequest, lenhDatData) => {
  const { LoaiGD, LoaiLenh, SoLuong, MaCP, Gia, MaTK, TrangThai } = lenhDatData;
  try {
    transactionRequest.input('LoaiGD', sql.Char(1), LoaiGD);
    transactionRequest.input('LoaiLenh', sql.NChar(5), LoaiLenh);
    transactionRequest.input('SoLuong', sql.Int, SoLuong);
    transactionRequest.input('MaCP_ld', sql.NChar(10), MaCP);
    transactionRequest.input('Gia', sql.Float, Gia);
    transactionRequest.input('MaTK_ld', sql.NChar(20), MaTK);
    transactionRequest.input('TrangThai', sql.NVarChar(20), TrangThai);

    const query = `
            INSERT INTO LENHDAT (LoaiGD, LoaiLenh, SoLuong, MaCP, Gia, MaTK, TrangThai)
            OUTPUT INSERTED.MaGD, INSERTED.NgayGD
            VALUES (@LoaiGD, @LoaiLenh, @SoLuong, @MaCP_ld, @Gia, @MaTK_ld, @TrangThai);
        `;
    const result = await transactionRequest.query(query);

    if (result.recordset.length === 0) {
      throw new Error(
        'Không thể tạo lệnh đặt hoặc lấy thông tin lệnh vừa tạo.'
      );
    }

    console.log(`Order placed: MaGD=${result.recordset[0].MaGD}`);
    return {
      MaGD: result.recordset[0].MaGD,
      NgayGD: result.recordset[0].NgayGD,
      ...lenhDatData,
    };
  } catch (err) {
    console.error('SQL error creating LenhDat', err);
    throw err;
  }
};

/**
 * Hàm lấy danh sách lệnh đặt của một MaTK trong khoảng thời gian
 * Bao gồm cả thông tin khớp (nếu có) để phục vụ sao kê A.4
 */
LenhDat.findByMaTKAndDateRange = async (maTK, tuNgay, denNgay) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaTK', sql.NChar(20), maTK);
    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input('TuNgay', sql.DateTime, startDate);

    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997);
    request.input('DenNgay', sql.DateTime, endDate);

    const query = `
          SELECT
              ld.MaGD,
              ld.NgayGD,
              ld.LoaiGD,
              ld.LoaiLenh,
              ld.SoLuong AS SoLuongDat,
              ld.MaCP,
              ld.Gia AS GiaDat,
              ld.MaTK,
              ld.TrangThai,
              ISNULL((SELECT SUM(SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop,
              (SELECT AVG(GiaKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS GiaKhopTrungBinh
          FROM LENHDAT ld
          WHERE ld.MaTK = @MaTK
            AND ld.NgayGD >= @TuNgay
            AND ld.NgayGD <= @DenNgay
          ORDER BY ld.NgayGD DESC;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error finding LenhDat by MaTK and date range', err);
    throw err;
  }
};

/**
 * Hàm lấy danh sách lệnh đặt của tất cả các MaTK thuộc về một MaNDT trong khoảng thời gian
 */
LenhDat.findByMaNDTAndDateRange = async (maNDT, tuNgay, denNgay) => {
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
              ld.MaGD,
              ld.NgayGD,
              ld.LoaiGD,
              ld.LoaiLenh,
              ld.SoLuong AS SoLuongDat,
              ld.MaCP,
              ld.Gia AS GiaDat,
              ld.MaTK,
              ld.TrangThai,
              ISNULL((SELECT SUM(SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop,
              (SELECT AVG(GiaKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS GiaKhopTrungBinh
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          WHERE tk.MaNDT = @MaNDT
            AND ld.NgayGD >= @TuNgay
            AND ld.NgayGD <= @DenNgay
          ORDER BY ld.NgayGD DESC;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error finding LenhDat by MaNDT and date range', err);
    throw err;
  }
};

/**
 * hàm tìm các lệnh đặt dựa trên mã cổ phiếu
 */
LenhDat.findByMaCPAndDateRange = async (maCP, tuNgay, denNgay) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NChar(10), maCP);

    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input('TuNgay', sql.DateTime, startDate);

    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997);
    request.input('DenNgay', sql.DateTime, endDate);

    const query = `
          SELECT
              ld.MaGD,
              ld.NgayGD,
              ld.LoaiGD,
              ld.LoaiLenh,
              ld.SoLuong AS SoLuongDat,
              ld.Gia AS GiaDat,
              ld.MaTK,
              ld.TrangThai,
              ISNULL((SELECT SUM(SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop,
              (SELECT AVG(GiaKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS GiaKhopTrungBinh,
              (SELECT MAX(NgayGioKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS NgayGioKhopCuoi
          FROM LENHDAT ld
          WHERE ld.MaCP = @MaCP
            AND ld.NgayGD >= @TuNgay
            AND ld.NgayGD <= @DenNgay
          ORDER BY ld.NgayGD DESC;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(
      `SQL error finding LenhDat by MaCP ${maCP} and date range`,
      err
    );
    throw err;
  }
};

/**
 * Hàm tìm lệnh đặt theo MaGD và lấy các thông tin cần cho việc hủy
 */
LenhDat.findOrderForCancellation = async (maGD) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaGD', sql.Int, maGD);

    const query = `
          SELECT
              ld.MaGD,
              ld.NgayGD,
              ld.LoaiGD,
              ld.LoaiLenh,
              ld.SoLuong,
              ld.Gia,
              ld.MaTK,
              ld.TrangThai,
              ld.MaCP,
              tk.MaNDT,
              ISNULL((SELECT SUM(SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          WHERE ld.MaGD = @MaGD;
      `;
    const result = await request.query(query);

    if (result.recordset.length > 0) {
      const order = result.recordset[0];
      return {
        ...order,
        MaGD: order.MaGD,
        NgayGD: order.NgayGD,
        LoaiGD: order.LoaiGD ? order.LoaiGD.trim() : null,
        LoaiLenh: order.LoaiLenh ? order.LoaiLenh.trim() : null,
        MaTK: order.MaTK ? order.MaTK.trim() : null,
        TrangThai: order.TrangThai ? order.TrangThai.trim() : null,
        MaCP: order.MaCP ? order.MaCP.trim() : null,
      };
    }
    return undefined;
  } catch (err) {
    console.error(`SQL error finding order ${maGD} for cancellation`, err);
    throw err;
  }
};

/**
 * Hàm cập nhật trạng thái lệnh thành 'Hủy' (dùng trong transaction)
 */
LenhDat.updateStatusToCancelled = async (transactionRequest, maGD) => {
  try {
    transactionRequest.input('MaGD_cancel', sql.Int, maGD);
    transactionRequest.input('TrangThaiMoi', sql.NVarChar(20), 'Hủy');

    const query = `
          UPDATE LENHDAT
          SET TrangThai = @TrangThaiMoi
          WHERE MaGD = @MaGD_cancel
            AND TrangThai IN (N'Chờ', N'Một phần');
      `;
    const result = await transactionRequest.query(query);
    return result.rowsAffected[0];
  } catch (err) {
    console.error(`SQL error updating order ${maGD} status to Cancelled`, err);
    throw err;
  }
};

/**
 * Hàm tính tổng số lượng đã khớp cho một MaGD
 */
async function getTotalMatchedQuantity(maGD) {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaGD_khop', sql.Int, maGD);
    const query =
      'SELECT ISNULL(SUM(SoLuongKhop), 0) AS TongKhop FROM LENHKHOP WHERE MaGD = @MaGD_khop';
    const result = await request.query(query);
    return result.recordset[0].TongKhop;
  } catch (err) {
    console.error(
      `Error calculating total matched quantity for MaGD ${maGD}:`,
      err
    );
    return 0;
  }
}

/**
 * Hàm lấy các lệnh MUA đang chờ khớp, sắp xếp ưu tiên
 */
LenhDat.findPendingBuyOrders = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NChar(10), maCP);

    const query = `
               WITH MatchedTotals AS (
                SELECT MaGD, ISNULL(SUM(SoLuongKhop), 0) AS TongKhop
                FROM LENHKHOP
                WHERE MaGD IN (SELECT MaGD FROM LENHDAT WHERE MaCP = @MaCP AND LoaiGD = 'M' AND TrangThai IN (N'Chờ', N'Một phần'))
                GROUP BY MaGD
            )
          SELECT
              ld.MaGD,
              ld.NgayGD,
              ld.LoaiLenh,
              ld.SoLuong,
              ld.Gia,
              ld.MaTK,
              tk.MaNDT,
              (ld.SoLuong - ISNULL(mt.TongKhop, 0)) AS SoLuongConLai
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          LEFT JOIN MatchedTotals mt ON ld.MaGD = mt.MaGD 
          WHERE ld.MaCP = @MaCP
            AND ld.LoaiGD = 'M'
            AND ld.TrangThai IN (N'Chờ', N'Một phần')
            AND (ld.SoLuong - ISNULL(mt.TongKhop, 0)) > 0
          ORDER BY
              ld.Gia DESC,
              ld.NgayGD ASC;
      `;
    const result = await request.query(query);
    return result.recordset.filter((order) => order.SoLuongConLai > 0);
  } catch (err) {
    console.error(`SQL error finding pending buy orders for ${maCP}`, err);
    throw err;
  }
};

/**
 * Hàm lấy các lệnh BÁN đang chờ khớp, sắp xếp ưu tiên
 */
LenhDat.findPendingSellOrders = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NChar(10), maCP);

    const query = `
    WITH MatchedTotals AS (
                 SELECT MaGD, ISNULL(SUM(SoLuongKhop), 0) AS TongKhop
                 FROM LENHKHOP
                 WHERE MaGD IN (SELECT MaGD FROM LENHDAT WHERE MaCP = @MaCP AND LoaiGD = 'B' AND TrangThai IN (N'Chờ', N'Một phần'))
                 GROUP BY MaGD
            )
          SELECT
              ld.MaGD,
              ld.NgayGD,
              ld.LoaiLenh,
              ld.SoLuong,
              ld.Gia,
              ld.MaTK,
              tk.MaNDT,
              (ld.SoLuong - ISNULL(mt.TongKhop, 0)) AS SoLuongConLai
          FROM LENHDAT ld
           JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          WHERE ld.MaCP = @MaCP
            AND ld.LoaiGD = 'B'
            AND ld.TrangThai IN (N'Chờ', N'Một phần')
            AND (ld.SoLuong - ISNULL(mt.TongKhop, 0)) > 0
          ORDER BY
              ld.Gia ASC,
              ld.NgayGD ASC;
      `;
    const result = await request.query(query);
    return result.recordset.filter((order) => order.SoLuongConLai > 0);
  } catch (err) {
    console.error(`SQL error finding pending sell orders for ${maCP}`, err);
    throw err;
  }
};

/**
 * Cập nhật trạng thái của một lệnh đặt sau khi khớp (dùng trong transaction).
 * @param {object} transactionRequest Đối tượng request của transaction
 * @param {number} maGD Mã giao dịch của lệnh cần cập nhật
 * @param {string} newStatus Trạng thái mới ('Một phần' hoặc 'Hết')
 * @returns {Promise<number>} Số dòng bị ảnh hưởng (thường là 1)
 */
LenhDat.updateStatusAfterMatch = async (
  transactionRequest,
  maGD,
  newStatus
) => {
  const statusInputName = `NewStatus_${maGD}`;
  const maGDInputName = `MaGD_update_${maGD}`;
  if (newStatus !== 'Một phần' && newStatus !== 'Hết') {
    throw new Error(`Trạng thái cập nhật không hợp lệ: ${newStatus}`);
  }
  try {
    transactionRequest.input(maGDInputName, sql.Int, maGD);
    transactionRequest.input(statusInputName, sql.NVarChar(20), newStatus);

    const query = `
            UPDATE LENHDAT
            SET TrangThai = @${statusInputName}
            WHERE MaGD = @${maGDInputName}
              AND TrangThai IN (N'Chờ', N'Một phần');
        `;
    const result = await transactionRequest.query(query);
    if (result.rowsAffected[0] === 0) {
      console.warn(
        `Order ${maGD} status might have changed before updateAfterMatch. Expected 'Chờ' or 'Một phần'.`
      );
    }
    return result.rowsAffected[0];
  } catch (err) {
    console.error(`SQL error updating order ${maGD} status after match`, err);
    throw err;
  }
};

/**
 * Lấy danh sách các lệnh đặt đang chờ xử lý cho một mã CP.
 * Có thể lọc theo loại lệnh và sắp xếp theo quy tắc ưu tiên.
 *
 * @param {string} maCP Mã cổ phiếu.
 * @param {('ATO' | 'ATC' | 'LO' | null)[]} [allowedLoaiLenh=null] Mảng các loại lệnh cho phép (vd: ['ATO', 'LO']). Nếu null, lấy tất cả.
 * @param {string} [sortBy='Default'] Cách sắp xếp:
 *                 'Default': ATO/ATC trước -> LO (Giá -> Thời gian). Dùng cho ATO/ATC.
 *                 'ContinuousBuy': LO Mua (Giá cao -> Thời gian). Dùng cho khớp liên tục Mua.
 *                 'ContinuousSell': LO Bán (Giá thấp -> Thời gian). Dùng cho khớp liên tục Bán.
 * @returns {Promise<Array<object>>} Mảng các lệnh chờ khớp thông tin cần thiết.
 */
LenhDat.findPendingOrders = async (
  maCP,
  allowedLoaiLenh = null,
  sortBy = 'Default'
) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);

    let loaiGdFilter = '';
    if (sortBy === 'ContinuousBuy') {
      loaiGdFilter = "AND ld.LoaiGD = 'M'";
    } else if (sortBy === 'ContinuousSell') {
      loaiGdFilter = "AND ld.LoaiGD = 'B'";
    }

    let loaiLenhFilter = '';
    if (Array.isArray(allowedLoaiLenh) && allowedLoaiLenh.length > 0) {
      const loaiLenhParams = allowedLoaiLenh
        .map((loai, index) => {
          const paramName = `LoaiLenh${index}`;
          request.input(paramName, sql.NChar(5), loai);
          return `@${paramName}`;
        })
        .join(', ');
      loaiLenhFilter = `AND ld.LoaiLenh IN (${loaiLenhParams})`;
    }

    let orderByClause = '';
    switch (sortBy) {
      case 'ContinuousBuy':
        orderByClause = 'ORDER BY ld.Gia DESC, ld.NgayGD ASC';
        break;
      case 'ContinuousSell':
        orderByClause = 'ORDER BY ld.Gia ASC, ld.NgayGD ASC';
        break;
      case 'Default':
      default:
        orderByClause = `ORDER BY
                                  CASE ld.LoaiLenh WHEN 'ATO' THEN 1 WHEN 'ATC' THEN 1 ELSE 2 END ASC,
                                  CASE ld.LoaiGD WHEN 'M' THEN ld.Gia END DESC,
                                  CASE ld.LoaiGD WHEN 'B' THEN ld.Gia END ASC,
                                  ld.NgayGD ASC`;
        break;
    }

    const query = `
        WITH TongKhopTheoLenh AS (
            SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop
            FROM dbo.LENHKHOP WHERE MaGD IN (SELECT MaGD FROM dbo.LENHDAT WHERE MaCP = @MaCP)
            GROUP BY MaGD
        )
        SELECT
            ld.MaGD, ld.LoaiGD, ld.LoaiLenh, ld.Gia, ld.MaTK, tk.MaNDT, ld.NgayGD,
            (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) AS SoLuongConLai
        FROM dbo.LENHDAT ld
        JOIN dbo.TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
        LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD
        WHERE ld.MaCP = @MaCP
          AND ld.TrangThai IN (N'Chờ', N'Một phần')
          AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0
          ${loaiLenhFilter}
          ${loaiGdFilter}
        ${orderByClause};
    `;

    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(
      `SQL error finding pending orders for ${maCP} (sortBy: ${sortBy}):`,
      err
    );
    throw new Error(`Lỗi khi lấy lệnh chờ: ${err.message}`);
  }
};

/**
 * Lấy danh sách lệnh đặt của một MaNDT CHỈ TRONG NGÀY HÔM NAY.
 * Bao gồm cả thông tin khớp cơ bản.
 * @param {string} maNDT Mã nhà đầu tư.
 * @returns {Promise<Array<object>>} Mảng các lệnh đặt trong ngày.
 */
LenhDat.findByMaNDTForToday = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);

    const queryGetDate = 'SELECT CAST(GETDATE() AS DATE) as TodayDate';
    const dateResult = await pool.request().query(queryGetDate);
    const today = dateResult.recordset[0].TodayDate;
    request.input('NgayHomNay', sql.Date, today);

    const query = `
          SELECT
              ld.MaGD, ld.NgayGD, ld.LoaiGD, ld.LoaiLenh,
              ld.SoLuong AS SoLuongDat, ld.MaCP, ld.Gia AS GiaDat,
              ld.MaTK, ld.TrangThai,
              ISNULL((SELECT SUM(lk.SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop,
              (SELECT AVG(lk.GiaKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS GiaKhopTrungBinh
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          WHERE tk.MaNDT = @MaNDT
            AND CAST(ld.NgayGD AS DATE) = @NgayHomNay
          ORDER BY ld.NgayGD DESC;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(`SQL error finding today's orders for NDT ${maNDT}:`, err);
    throw new AppError(
      `Lỗi khi lấy lệnh đặt trong ngày cho NĐT ${maNDT}.`,
      500
    );
  }
};

/**
 * Lấy TẤT CẢ các lệnh đặt của tất cả NĐT trong khoảng thời gian cho Admin.
 * Bao gồm thông tin cơ bản của NĐT.
 * @param {Date} tuNgay Ngày bắt đầu.
 * @param {Date} denNgay Ngày kết thúc.
 * @returns {Promise<Array<object>>} Mảng các lệnh đặt.
 */
LenhDat.getAllOrdersAdmin = async (tuNgay, denNgay) => {
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
              ld.MaGD, ld.NgayGD, ld.LoaiGD, ld.LoaiLenh,
              ld.SoLuong AS SoLuongDat, ld.MaCP, ld.Gia AS GiaDat,
              ld.MaTK, tk.MaNDT, ndt.HoTen AS TenNDT,
              ld.TrangThai,
              ISNULL((SELECT SUM(lk.SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop,
              (SELECT AVG(lk.GiaKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS GiaKhopTrungBinh
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          JOIN NDT ndt ON tk.MaNDT = ndt.MaNDT
          WHERE ld.NgayGD >= @TuNgay AND ld.NgayGD <= @DenNgay
          ORDER BY ld.NgayGD DESC;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting all admin orders:', err);
    throw new AppError('Lỗi khi lấy toàn bộ lịch sử lệnh đặt.', 500);
  }
};

/**
 * Cập nhật Giá và/hoặc Số lượng cho một lệnh đặt LO đang chờ hoặc khớp một phần.
 * @param {object} transactionRequest Đối tượng request của transaction.
 * @param {number} maGD Mã giao dịch cần sửa.
 * @param {number | null} newGia Giá mới (null nếu không đổi giá).
 * @param {number | null} newSoLuong Số lượng mới (null nếu không đổi số lượng). Cần >= tổng đã khớp.
 * @returns {Promise<number>} Số dòng bị ảnh hưởng (0 hoặc 1).
 */
LenhDat.updateOrderDetails = async (
  transactionRequest,
  maGD,
  newGia,
  newSoLuong
) => {
  try {
    const suffix = `${maGD}_upd_${Date.now()}`;
    transactionRequest.input(`MaGD_upd_${suffix}`, sql.Int, maGD);

    let setClauses = [];
    if (newGia !== null && newGia !== undefined) {
      transactionRequest.input(`NewGia_${suffix}`, sql.Float, newGia);
      setClauses.push('Gia = @NewGia_' + suffix);
    }
    if (newSoLuong !== null && newSoLuong !== undefined) {
      transactionRequest.input(`NewSoLuong_${suffix}`, sql.Int, newSoLuong);
      setClauses.push('SoLuong = @NewSoLuong_' + suffix);
    }

    if (setClauses.length === 0) {
      console.warn(
        `[Update Order ${maGD}] No price or quantity provided for update.`
      );
      return 0;
    }

    const query = `
          UPDATE dbo.LENHDAT
          SET ${setClauses.join(',\n          ')},
              NgayGD = GETDATE()
          WHERE MaGD = @MaGD_upd_${suffix}
            AND LoaiLenh = 'LO'
            AND TrangThai IN (N'Chờ', N'Một phần')
            AND (@NewSoLuong_${suffix} IS NULL OR @NewSoLuong_${suffix} >= ISNULL((SELECT SUM(lk.SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = @MaGD_upd_${suffix}), 0));

          SELECT @@ROWCOUNT AS AffectedRows;
      `;

    const result = await transactionRequest.query(query);
    return result.recordset[0].AffectedRows;
  } catch (err) {
    console.error(`SQL error updating order details for MaGD ${maGD}:`, err);
    if (err.number === 547 || err.number === 515) {
      throw new Error(`Dữ liệu sửa lệnh không hợp lệ (Giá hoặc Số lượng).`);
    }
    throw new Error(`Lỗi khi cập nhật lệnh đặt ${maGD}: ${err.message}`);
  }
};

module.exports = LenhDat;
