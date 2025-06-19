/**
 * models/CoPhieu.model.js
 * Model for CoPhieu (Stock) - provides DB access methods for stock management.
 */
const AppError = require('../utils/errors/AppError');
const db = require('./db');
const sql = require('mssql');

const CoPhieu = {};

/** Tạo mới cổ phiếu với Status = 0 */
CoPhieu.create = async (newCoPhieuData) => {
  const { MaCP, TenCty, DiaChi, SoLuongPH } = newCoPhieuData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), MaCP);
    request.input('TenCty', sql.NVarChar(50), TenCty);
    request.input('DiaChi', sql.NVarChar(100), DiaChi);
    request.input('SoLuongPH', sql.Int, SoLuongPH);

    const query = `
        INSERT INTO COPHIEU (MaCP, TenCTy, DiaChi, SoLuongPH, Status)
        OUTPUT INSERTED.*
        VALUES (@MaCP, @TenCty, @DiaChi, @SoLuongPH, 0);
    `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error('SQL error creating CoPhieu', err);
    if (err.number === 2627 || err.number === 2601) {
      throw new Error(
        `Mã cổ phiếu '${MaCP}' hoặc Tên công ty '${TenCty}' đã tồn tại.`
      );
    }
    throw err;
  }
};

/** Hàm tìm cổ phiếu theo MaCP */
CoPhieu.findByMaCP = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);
    const query =
      'SELECT MaCP, TenCty, DiaChi, SoLuongPH, Status FROM COPHIEU WHERE MaCP = @MaCP';
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error('SQL error finding CoPhieu by MaCP', err);
    throw err;
  }
};

/** Lấy danh sách CP đang giao dịch (Status = 1) */
CoPhieu.getActiveStocks = async () => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const query =
      'SELECT MaCP, TenCty, DiaChi, SoLuongPH, Status FROM COPHIEU WHERE Status = 1 ORDER BY MaCP';
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting active stocks', err);
    throw err;
  }
};

/** Lấy tất cả CP cho Admin (có thể lọc theo Status ở frontend) */
CoPhieu.getAllForAdmin = async () => {
  try {
    const pool = await db.getPool();
    const request = pool.request();

    const query = `
      SELECT 
        cp.MaCP, 
        cp.TenCty, 
        cp.DiaChi, 
        cp.SoLuongPH, 
        cp.Status,
        lg.GiaTran,
        lg.GiaSan,
        lg.GiaTC
      FROM COPHIEU cp
      LEFT JOIN LICHSUGIA lg 
        ON cp.MaCP = lg.MaCP 
        AND lg.Ngay = (
          SELECT MAX(Ngay) 
          FROM LICHSUGIA 
          WHERE MaCP = cp.MaCP
        )
      ORDER BY cp.MaCP;
    `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting all stocks for admin', err);
    throw err;
  }
};

/** Tìm cổ phiếu theo trạng thái */
CoPhieu.findByStatus = async (status) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('Status', sql.TinyInt, status);

    const query = `
      SELECT MaCP, TenCty, DiaChi, SoLuongPH, Status
      FROM COPHIEU
      WHERE Status = @Status
      ORDER BY MaCP;
    `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(`SQL error finding CoPhieu by status ${status}:`, err);
    throw err;
  }
};

/** Cập nhật thông tin dữ liệu của CP (không đổi Status) */
CoPhieu.updateDetails = async (maCP, coPhieuData) => {
  const { TenCty, DiaChi, SoLuongPH } = coPhieuData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);

    let setClauses = [];
    if (TenCty !== undefined) {
      request.input('TenCty', sql.NVarChar(50), TenCty);
      setClauses.push('TenCty = @TenCty');
    }
    if (DiaChi !== undefined) {
      request.input('DiaChi', sql.NVarChar(100), DiaChi);
      setClauses.push('DiaChi = @DiaChi');
    }
    if (SoLuongPH !== undefined) {
      if (typeof SoLuongPH !== 'number' || SoLuongPH <= 0) {
        throw new Error('Số lượng phát hành phải là số nguyên dương.');
      }
      request.input('SoLuongPH', sql.Int, SoLuongPH);
      setClauses.push('SoLuongPH = @SoLuongPH');
    }

    if (setClauses.length === 0) {
      console.warn(`No details to update for MaCP ${maCP}.`);
      return 0;
    }

    const query = `
        UPDATE COPHIEU
        SET ${setClauses.join(', ')}
        WHERE MaCP = @MaCP;
        SELECT @@ROWCOUNT as AffectedRows;
    `;
    const result = await request.query(query);
    return result.recordset[0].AffectedRows;
  } catch (err) {
    console.error('SQL error updating CoPhieu details', err);
    if (err.number === 2627 || err.number === 2601) {
      throw new Error(`Tên công ty '${TenCty}' đã tồn tại.`);
    }
    throw err;
  }
};

/** Cập nhật Status của CP */
CoPhieu.updateStatus = async (maCP, newStatus) => {
  try {
    if (![0, 1, 2].includes(newStatus)) {
      throw new Error(`Trạng thái ${newStatus} không hợp lệ.`);
    }
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);
    request.input('NewStatus', sql.TinyInt, newStatus);

    const query = `
        UPDATE COPHIEU
        SET Status = @NewStatus
        WHERE MaCP = @MaCP;
        SELECT @@ROWCOUNT as AffectedRows;
    `;
    const result = await request.query(query);
    return result.recordset[0].AffectedRows;
  } catch (err) {
    console.error(
      `SQL error updating status for ${maCP} to ${newStatus}:`,
      err
    );
    throw err;
  }
};

/** Xóa cứng CP (chỉ khi Status = 0) */
CoPhieu.hardDelete = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);

    const query = 'DELETE FROM COPHIEU WHERE MaCP = @MaCP AND Status = 0;';
    const result = await request.query(query);
    return result.rowsAffected[0];
  } catch (err) {
    console.error(`SQL error hard deleting CoPhieu ${maCP}:`, err);
    if (err.number === 547) {
      throw new Error(
        `Không thể xóa cứng cổ phiếu ${maCP} vì có dữ liệu liên quan (Lịch sử giá, Lệnh đặt...). Chỉ xóa được khi Status = 0 và chưa có liên kết.`
      );
    }
    throw err;
  }
};

/** Lấy dữ liệu cho Bảng Giá Điện Tử */
CoPhieu.getMarketBoardData = async () => {
  try {
    const pool = await db.getPool();
    const request = pool.request();

    const query = `
   DECLARE @NgayHienTai DATE = CAST(GETDATE() AS DATE);
   DECLARE @NgayHienTaiStart DATETIME = CAST(@NgayHienTai AS DATETIME);
   DECLARE @NgayHienTaiEnd DATETIME = DATEADD(ms, -3, DATEADD(day, 1, @NgayHienTaiStart));

  WITH GiaHomNay AS (
    SELECT MaCP, GiaTran, GiaSan, GiaTC, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua
    FROM LICHSUGIA
    WHERE Ngay = @NgayHienTai
  ),
  LenhKhopCuoi AS (
    SELECT MaCP, GiaKhop, SoLuongKhop AS KLKhopCuoi
    FROM (
      SELECT
        ld.MaCP,
        lk.GiaKhop,
        lk.SoLuongKhop,
        ROW_NUMBER() OVER(PARTITION BY ld.MaCP ORDER BY lk.NgayGioKhop DESC) as rn
      FROM LENHKHOP lk
      JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
      WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd
    ) AS KhopGanNhat
    WHERE rn = 1
  ),
  TongKhopTheoLenh AS (
    SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop
    FROM LENHKHOP
    GROUP BY MaGD
  ),
  TongKhopTrongNgay AS (
    SELECT ld.MaCP, SUM(ISNULL(lk.SoLuongKhop, 0)) AS TongKLKhopTrongNgay
    FROM LENHKHOP lk
    JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
    WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd
    GROUP BY ld.MaCP
  ),
  TongGiaTriGiaoDichTrongNgay AS (
    SELECT
      ld.MaCP,
      SUM(ISNULL(lk.SoLuongKhop, 0) * ISNULL(lk.GiaKhop, 0)) AS TongGTGDTrongNgay
    FROM LENHKHOP lk
    JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
    WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd
    GROUP BY ld.MaCP
  ),
  LenhDatCho AS (
     SELECT
       ld.MaGD, ld.MaCP, ld.LoaiGD, ld.Gia,
       (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) AS SoLuongConLai
     FROM LENHDAT ld
     LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD
     WHERE ld.TrangThai IN (N'Chờ', N'Một phần')
       AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0
       AND CAST(ld.NgayGD AS DATE) = @NgayHienTai
  ),
  Top3Mua AS (
    SELECT
      MaCP,
      MAX(CASE WHEN rn = 1 THEN Gia END) AS GiaMua1,
      SUM(CASE WHEN rn = 1 THEN SoLuongConLai END) AS KLMua1,
      MAX(CASE WHEN rn = 2 THEN Gia END) AS GiaMua2,
      SUM(CASE WHEN rn = 2 THEN SoLuongConLai END) AS KLMua2,
      MAX(CASE WHEN rn = 3 THEN Gia END) AS GiaMua3,
      SUM(CASE WHEN rn = 3 THEN SoLuongConLai END) AS KLMua3
    FROM (
      SELECT
        MaCP, Gia, SoLuongConLai,
        DENSE_RANK() OVER (PARTITION BY MaCP ORDER BY Gia DESC) as rn
      FROM LenhDatCho
      WHERE LoaiGD = 'M'
    ) AS RankedMua
    WHERE rn <= 3
    GROUP BY MaCP
  ),
      TongDatMuaCho AS (
        SELECT MaCP, SUM(SoLuongConLai) AS TongKLDatMua
        FROM LenhDatCho
        WHERE LoaiGD = 'M'
        GROUP BY MaCP
      ),
      TongDatBanCho AS (
        SELECT MaCP, SUM(SoLuongConLai) AS TongKLDatBan
        FROM LenhDatCho
        WHERE LoaiGD = 'B'
        GROUP BY MaCP
      ),
  Top3Ban AS (
     SELECT
      MaCP,
      MIN(CASE WHEN rn = 1 THEN Gia END) AS GiaBan1,
      SUM(CASE WHEN rn = 1 THEN SoLuongConLai END) AS KLBan1,
      MIN(CASE WHEN rn = 2 THEN Gia END) AS GiaBan2,
      SUM(CASE WHEN rn = 2 THEN SoLuongConLai END) AS KLBan2,
      MIN(CASE WHEN rn = 3 THEN Gia END) AS GiaBan3,
      SUM(CASE WHEN rn = 3 THEN SoLuongConLai END) AS KLBan3
    FROM (
      SELECT
        MaCP, Gia, SoLuongConLai,
        DENSE_RANK() OVER (PARTITION BY MaCP ORDER BY Gia ASC) as rn
      FROM LenhDatCho
      WHERE LoaiGD = 'B'
    ) AS RankedBan
    WHERE rn <= 3
    GROUP BY MaCP
  )
  SELECT
    cp.MaCP,
    cp.TenCty,
    gn.GiaTC,
    gn.GiaTran,
    gn.GiaSan,
    gn.GiaMoCua,
    gn.GiaCaoNhat,
    gn.GiaThapNhat,
    gn.GiaDongCua,
    ISNULL(t3m.GiaMua1, 0) AS GiaMua1,
    ISNULL(t3m.KLMua1, 0) AS KLMua1,
    ISNULL(t3m.GiaMua2, 0) AS GiaMua2,
    ISNULL(t3m.KLMua2, 0) AS KLMua2,
    ISNULL(t3m.GiaMua3, 0) AS GiaMua3,
    ISNULL(t3m.KLMua3, 0) AS KLMua3,
    lkc.GiaKhop AS GiaKhopCuoi,
    ISNULL(lkc.KLKhopCuoi, 0) AS KLKhopCuoi,
    (lkc.GiaKhop - gn.GiaTC) AS ThayDoi,
    (lkc.GiaKhop - gn.GiaTC) * 100.0 / NULLIF(gn.GiaTC, 0) AS PhanTramThayDoi,
    ISNULL(t3b.GiaBan1, 0) AS GiaBan1,
    ISNULL(t3b.KLBan1, 0) AS KLBan1,
    ISNULL(t3b.GiaBan2, 0) AS GiaBan2,
    ISNULL(t3b.KLBan2, 0) AS KLBan2,
    ISNULL(t3b.GiaBan3, 0) AS GiaBan3,
    ISNULL(t3b.KLBan3, 0) AS KLBan3,
    ISNULL(tdm.TongKLDatMua, 0) AS TongKLDatMua,
    ISNULL(tdb.TongKLDatBan, 0) AS TongKLDatBan,
    ISNULL(tktn.TongKLKhopTrongNgay, 0) AS TongKLKhop,
    ISNULL(tgt.TongGTGDTrongNgay, 0) AS TongGTGD
  FROM COPHIEU cp
  JOIN GiaHomNay gn ON cp.MaCP = gn.MaCP
  LEFT JOIN LenhKhopCuoi lkc ON cp.MaCP = lkc.MaCP
  LEFT JOIN TongKhopTrongNgay tktn ON cp.MaCP = tktn.MaCP
  LEFT JOIN TongGiaTriGiaoDichTrongNgay tgt ON cp.MaCP = tgt.MaCP
  LEFT JOIN Top3Mua t3m ON cp.MaCP = t3m.MaCP
  LEFT JOIN Top3Ban t3b ON cp.MaCP = t3b.MaCP
  LEFT JOIN TongDatMuaCho tdm ON cp.MaCP = tdm.MaCP
  LEFT JOIN TongDatBanCho tdb ON cp.MaCP = tdb.MaCP
  WHERE cp.Status = 1
  ORDER BY cp.MaCP;
  IF @@ERROR <> 0
  BEGIN
      THROW 50000, 'An error occurred while executing the query.', 1;
  END
    `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting market board data', err);
    throw new Error(`Lỗi khi lấy dữ liệu bảng giá: ${err.message}`);
  }
};

/** Lấy dữ liệu thị trường chi tiết cho một mã CP */
CoPhieu.getMarketDataByMaCP = async (maCPInput) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    if (!maCPInput || typeof maCPInput !== 'string' || maCPInput.length > 10) {
      throw new AppError(
        'Invalid MaCPInput. It must be a non-empty string with a maximum length of 10.',
        400
      );
    }
    request.input('MaCPInput', sql.NVarChar(10), maCPInput.trim());

    const query = `
      DECLARE @NgayHienTai DATE = CAST(GETDATE() AS DATE);
      DECLARE @NgayHienTaiStart DATETIME = CAST(@NgayHienTai AS DATETIME);
      DECLARE @NgayMai DATE = DATEADD(day, 1, @NgayHienTai);
      DECLARE @NgayMaiStart DATETIME = CAST(@NgayMai AS DATETIME);
      DECLARE @NgayHienTaiEnd DATETIME = DATEADD(ms, -3, @NgayMaiStart);

      WITH GiaHomNay AS (
          SELECT MaCP, GiaTran, GiaSan, GiaTC, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua
          FROM LICHSUGIA WHERE Ngay = @NgayHienTai AND MaCP = @MaCPInput
      ),
      LenhKhopCuoi AS (
          SELECT MaCP, GiaKhop, SoLuongKhop AS KLKhopCuoi
          FROM ( SELECT ld.MaCP, lk.GiaKhop, lk.SoLuongKhop, ROW_NUMBER() OVER(PARTITION BY ld.MaCP ORDER BY lk.NgayGioKhop DESC) as rn
                 FROM LENHKHOP lk JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
                 WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd AND ld.MaCP = @MaCPInput
               ) AS KhopGanNhat WHERE rn = 1
      ),
      TongKhopTheoLenh AS (
    SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop
    FROM LENHKHOP
    GROUP BY MaGD
),
      TongKhopTrongNgay AS (
          SELECT ld.MaCP, SUM(ISNULL(lk.SoLuongKhop, 0)) AS TongKLKhopTrongNgay
          FROM LENHKHOP lk JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
          WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd AND ld.MaCP = @MaCPInput
          GROUP BY ld.MaCP
      ),
      LenhDatCho AS (
     SELECT
         ld.MaGD, ld.MaCP, ld.LoaiGD, ld.Gia,
         (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) AS SoLuongConLai
     FROM LENHDAT ld
     LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD
     WHERE ld.TrangThai IN (N'Chờ', N'Một phần')
       AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0
),
Top3Mua AS (
    SELECT
        MaCP,
        MAX(CASE WHEN rn = 1 THEN Gia END) AS GiaMua1,
        SUM(CASE WHEN rn = 1 THEN SoLuongConLai END) AS KLMua1,
        MAX(CASE WHEN rn = 2 THEN Gia END) AS GiaMua2,
        SUM(CASE WHEN rn = 2 THEN SoLuongConLai END) AS KLMua2,
        MAX(CASE WHEN rn = 3 THEN Gia END) AS GiaMua3,
        SUM(CASE WHEN rn = 3 THEN SoLuongConLai END) AS KLMua3
    FROM (
        SELECT
            MaCP, Gia, SoLuongConLai,
            DENSE_RANK() OVER (PARTITION BY MaCP ORDER BY Gia DESC) as rn
        FROM LenhDatCho
        WHERE LoaiGD = 'M'
    ) AS RankedMua
    WHERE rn <= 3
    GROUP BY MaCP
),
      TongDatMuaCho AS (
          SELECT MaCP, SUM(SoLuongConLai) AS TongKLDatMua
          FROM LenhDatCho
          WHERE LoaiGD = 'M'
          GROUP BY MaCP
      ),
      TongDatBanCho AS (
          SELECT MaCP, SUM(SoLuongConLai) AS TongKLDatBan
          FROM LenhDatCho
          WHERE LoaiGD = 'B'
          GROUP BY MaCP
      ),
Top3Ban AS (
     SELECT
        MaCP,
        MIN(CASE WHEN rn = 1 THEN Gia END) AS GiaBan1,
        SUM(CASE WHEN rn = 1 THEN SoLuongConLai END) AS KLBan1,
        MIN(CASE WHEN rn = 2 THEN Gia END) AS GiaBan2,
        SUM(CASE WHEN rn = 2 THEN SoLuongConLai END) AS KLBan2,
        MIN(CASE WHEN rn = 3 THEN Gia END) AS GiaBan3,
        SUM(CASE WHEN rn = 3 THEN SoLuongConLai END) AS KLBan3
    FROM (
        SELECT
            MaCP, Gia, SoLuongConLai,
            DENSE_RANK() OVER (PARTITION BY MaCP ORDER BY Gia ASC) as rn
        FROM LenhDatCho
        WHERE LoaiGD = 'B'
    ) AS RankedBan
    WHERE rn <= 3
    GROUP BY MaCP
)
      SELECT TOP 1
          cp.MaCP, cp.TenCty, cp.DiaChi, cp.SoLuongPH, cp.Status,
          gn.GiaTC, gn.GiaTran, gn.GiaSan,
          gn.GiaMoCua, gn.GiaCaoNhat, gn.GiaThapNhat,
          ISNULL(lkc.GiaKhop, gn.GiaTC) AS GiaKhopCuoi, ISNULL(lkc.KLKhopCuoi, 0) AS KLKhopCuoi,
          ISNULL(lkc.GiaKhop, gn.GiaTC) - gn.GiaTC AS ThayDoi,
          CASE WHEN ISNULL(gn.GiaTC, 0) = 0 THEN 0 ELSE (ISNULL(lkc.GiaKhop, gn.GiaTC) - gn.GiaTC) * 100.0 / gn.GiaTC END AS PhanTramThayDoi,
          ISNULL(t3m.GiaMua1, 0) AS GiaMua1, ISNULL(t3m.KLMua1, 0) AS KLMua1,
          ISNULL(t3m.GiaMua2, 0) AS GiaMua2, ISNULL(t3m.KLMua2, 0) AS KLMua2,
          ISNULL(t3m.GiaMua3, 0) AS GiaMua3, ISNULL(t3m.KLMua3, 0) AS KLMua3,
          ISNULL(t3b.GiaBan1, 0) AS GiaBan1, ISNULL(t3b.KLBan1, 0) AS KLBan1,
          ISNULL(t3b.GiaBan2, 0) AS GiaBan2, ISNULL(t3b.KLBan2, 0) AS KLBan2,
          ISNULL(t3b.GiaBan3, 0) AS GiaBan3, ISNULL(t3b.KLBan3, 0) AS KLBan3,
          ISNULL(tktn.TongKLKhopTrongNgay, 0) AS TongKLKhop
      FROM COPHIEU cp
      JOIN GiaHomNay gn ON cp.MaCP = gn.MaCP
      LEFT JOIN LenhKhopCuoi lkc ON cp.MaCP = lkc.MaCP
      LEFT JOIN TongKhopTrongNgay tktn ON cp.MaCP = tktn.MaCP
      LEFT JOIN Top3Mua t3m ON cp.MaCP = t3m.MaCP
      LEFT JOIN Top3Ban t3b ON cp.MaCP = t3b.MaCP
      WHERE cp.MaCP = @MaCPInput AND cp.Status = 1;
    `;
    const result = await request.query(query);
    if (result.recordset.length === 0) {
      throw new AppError(
        `Không tìm thấy dữ liệu cho mã cổ phiếu ${maCPInput}.`,
        404
      );
    }
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error getting market data for ${maCPInput}:`, err);
    throw new AppError(`Lỗi khi lấy dữ liệu thị trường cho ${maCPInput}.`, 500);
  }
};

/**
 * Lấy tổng số lượng cổ phiếu đã được phân bổ (đang được sở hữu bởi NĐT).
 * @param {string} maCP Mã cổ phiếu.
 * @returns {Promise<number>} Tổng số lượng đã phân bổ.
 */
CoPhieu.getTotalDistributedQuantity = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);
    const query = `
          SELECT ISNULL(SUM(SoLuong), 0) as TotalDistributed
          FROM SOHUU
          WHERE MaCP = @MaCP;
      `;
    const result = await request.query(query);
    return result.recordset[0].TotalDistributed;
  } catch (err) {
    console.error(
      `SQL error getting total distributed quantity for ${maCP}:`,
      err
    );
    throw new AppError(
      `Lỗi khi lấy tổng số lượng đã phân bổ cho ${maCP}.`,
      500
    );
  }
};

module.exports = CoPhieu;
