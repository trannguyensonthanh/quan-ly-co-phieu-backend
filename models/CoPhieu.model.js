// models/CoPhieu.model.js
const AppError = require('../utils/errors/AppError');
const db = require('./db');
const sql = require('mssql');

const CoPhieu = {};

// Hàm tạo mới cổ phiếu
/** Tạo mới cổ phiếu với Status = 0 */
CoPhieu.create = async (newCoPhieuData) => {
  const { MaCP, TenCty, DiaChi, SoLuongPH } = newCoPhieuData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), MaCP); // Đã là NVARCHAR
    request.input('TenCty', sql.NVarChar(50), TenCty);
    request.input('DiaChi', sql.NVarChar(100), DiaChi);
    request.input('SoLuongPH', sql.Int, SoLuongPH);
    // Status mặc định là 0 trong DB

    const query = `
        INSERT INTO COPHIEU (MaCP, TenCTy, DiaChi, SoLuongPH, Status)
        OUTPUT INSERTED.* -- Trả về bản ghi đã tạo
        VALUES (@MaCP, @TenCty, @DiaChi, @SoLuongPH, 0); -- Status = 0
    `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error('SQL error creating CoPhieu', err);
    if (err.number === 2627 || err.number === 2601) {
      // PK/Unique violation
      throw new Error(
        `Mã cổ phiếu '${MaCP}' hoặc Tên công ty '${TenCty}' đã tồn tại.`
      );
    }
    throw err;
  }
};

// Hàm tìm cổ phiếu theo MaCP
CoPhieu.findByMaCP = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);
    // Lấy cả Status
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
    // Thêm điều kiện WHERE Status = 1
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
  // Chỉ lấy các trường cần update từ coPhieuData
  const { TenCty, DiaChi, SoLuongPH } = coPhieuData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);

    // Xây dựng phần SET động
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
      return 0; // Không có gì update
    }

    const query = `
        UPDATE COPHIEU
        SET ${setClauses.join(', ')}
        WHERE MaCP = @MaCP;
        SELECT @@ROWCOUNT as AffectedRows; -- Trả về số dòng bị ảnh hưởng
    `;
    const result = await request.query(query);
    return result.recordset[0].AffectedRows;
  } catch (err) {
    console.error('SQL error updating CoPhieu details', err);
    if (err.number === 2627 || err.number === 2601) {
      // Lỗi trùng tên công ty
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

    // Thêm điều kiện WHERE Status = 0 để đảm bảo an toàn
    const query = 'DELETE FROM COPHIEU WHERE MaCP = @MaCP AND Status = 0;';
    const result = await request.query(query);
    return result.rowsAffected[0];
  } catch (err) {
    console.error(`SQL error hard deleting CoPhieu ${maCP}:`, err);
    // Lỗi FK sẽ xảy ra nếu cố xóa CP có Status != 0 mà lại có liên kết
    if (err.number === 547) {
      throw new Error(
        `Không thể xóa cứng cổ phiếu ${maCP} vì có dữ liệu liên quan (Lịch sử giá, Lệnh đặt...). Chỉ xóa được khi Status = 0 và chưa có liên kết.`
      );
    }
    throw err;
  }
};

// // Hàm lấy tất cả cổ phiếu (có thể thêm phân trang/sắp xếp sau)
// CoPhieu.getAll = async () => {
//   try {
//     const pool = await db.getPool();
//     const request = pool.request();
//     const query = "SELECT * FROM COPHIEU ORDER BY MaCP"; // Sắp xếp theo MaCP
//     const result = await request.query(query);
//     return result.recordset; // Trả về mảng các cổ phiếu
//   } catch (err) {
//     console.error("SQL error", err);
//     throw err;
//   }
// };

// // Hàm cập nhật cổ phiếu theo MaCP
// CoPhieu.updateByMaCP = async (maCP, coPhieuData) => {
//   const { TenCty, DiaChi, SoLuongPH } = coPhieuData;
//   try {
//     const pool = await db.getPool();
//     const request = pool.request();
//     request.input("MaCP", sql.NChar(10), maCP);
//     request.input("TenCty", sql.NVarChar(50), TenCty);
//     request.input("DiaChi", sql.NVarChar(100), DiaChi);
//     request.input("SoLuongPH", sql.Int, SoLuongPH);

//     const query = `
//             UPDATE COPHIEU
//             SET TenCTy = @TenCty, DiaChi = @DiaChi, SoLuongPH = @SoLuongPH
//             WHERE MaCP = @MaCP
//         `;
//     const result = await request.query(query);
//     // Kiểm tra xem có row nào được cập nhật không
//     return result.rowsAffected[0]; // Trả về số lượng row bị ảnh hưởng (0 hoặc 1)
//   } catch (err) {
//     console.error("SQL error", err);
//     throw err;
//   }
// };

// // Hàm xóa cổ phiếu theo MaCP
// CoPhieu.deleteByMaCP = async (maCP) => {
//   try {
//     const pool = await db.getPool();
//     const request = pool.request();
//     request.input("MaCP", sql.NChar(10), maCP);

//     // !! Lưu ý quan trọng: Cần kiểm tra ràng buộc khóa ngoại trước khi xóa
//     // Ví dụ: kiểm tra xem cổ phiếu này có trong bảng LENHDAT, SOHUU, LICHSUGIA không?
//     // Nếu có, bạn không thể xóa trực tiếp hoặc cần xử lý logic phức tạp hơn (vd: xóa mềm, thông báo lỗi rõ ràng)
//     // Tạm thời, chúng ta thực hiện xóa cứng và giả định không có ràng buộc cản trở

//     // Kiểm tra SOHUU
//     const checkSoHuuQuery =
//       "SELECT COUNT(*) as count FROM SOHUU WHERE MaCP = @MaCP";
//     const soHuuResult = await request.query(checkSoHuuQuery);
//     if (soHuuResult.recordset[0].count > 0) {
//       throw new Error(
//         `Không thể xóa cổ phiếu ${maCP} vì đang có nhà đầu tư sở hữu.`
//       );
//     }
//     // Kiểm tra LENHDAT (chỉ các lệnh chưa hoàn thành)
//     const checkLenhDatQuery = `SELECT COUNT(*) as count FROM LENHDAT WHERE MaCP = @MaCP AND TrangThai NOT IN (N'Hết', N'Hủy')`; // Giả định trạng thái hoàn thành
//     const lenhDatResult = await request.query(checkLenhDatQuery);
//     if (lenhDatResult.recordset[0].count > 0) {
//       throw new Error(
//         `Không thể xóa cổ phiếu ${maCP} vì đang có lệnh đặt chưa hoàn thành.`
//       );
//     }
//     // Kiểm tra LENHKHOP (thường không cần vì lệnh khớp là lịch sử)
//     // Kiểm tra LICHSUGIA (thường không cần vì lịch sử giá là cần thiết)

//     // Nếu kiểm tra OK, tiến hành xóa
//     const deleteQuery = "DELETE FROM COPHIEU WHERE MaCP = @MaCP";
//     const result = await request.query(deleteQuery);
//     return result.rowsAffected[0]; // Trả về số lượng row bị ảnh hưởng (0 hoặc 1)
//   } catch (err) {
//     console.error("SQL error or constraint violation", err);
//     // Ném lỗi để service/controller xử lý, bao gồm cả lỗi ràng buộc tự tạo
//     throw err;
//   }
// };

// Hàm lấy dữ liệu cho Bảng Giá Điện Tử
// CoPhieu.getMarketBoardData = async () => {
//   try {
//     const pool = await db.getPool();
//     const request = pool.request();

//     // Lấy ngày hiện tại (chỉ phần Date)
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     request.input("NgayHienTai", sql.Date, today);
//     const todayStart = new Date(today); // Bắt đầu ngày
//     const todayEnd = new Date(today); // Kết thúc ngày
//     todayEnd.setHours(23, 59, 59, 997);
//     request.input("NgayHienTaiStart", sql.DateTime, todayStart);
//     request.input("NgayHienTaiEnd", sql.DateTime, todayEnd);
//     // Query chính để tổng hợp dữ liệu
//     // Sử dụng Common Table Expressions (CTEs) để chia nhỏ logic
//     const query = `
//          WITH GiaHomNay AS (
//     -- Lấy giá Trần, Sàn, TC của ngày hôm nay
//     SELECT MaCP, GiaTran, GiaSan, GiaTC
//     FROM LICHSUGIA
//     WHERE CAST(Ngay AS DATE) = @NgayHienTai
// ),
// LenhKhopCuoi AS (
//     -- Lấy lệnh khớp cuối cùng trong ngày cho mỗi mã CP
//     SELECT MaCP, GiaKhop, NgayGioKhop
//     FROM (
//         SELECT
//             ld.MaCP,
//             lk.GiaKhop,
//             lk.NgayGioKhop,
//             ROW_NUMBER() OVER(PARTITION BY ld.MaCP ORDER BY lk.NgayGioKhop DESC) as rn
//         FROM LENHKHOP lk
//         JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
//         WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd
//     ) AS KhopGanNhat
//     WHERE rn = 1
// ),
// TongKhopTheoLenh AS (
//     -- *** CTE MỚI: Tính tổng số lượng đã khớp cho từng Lệnh Đặt ***
//     SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop
//     FROM LENHKHOP
//     -- Có thể thêm điều kiện WHERE NgayGioKhop nếu chỉ tính khớp trong ngày
//     -- WHERE NgayGioKhop >= @NgayHienTaiStart AND NgayGioKhop <= @NgayHienTaiEnd
//     GROUP BY MaGD
// ),
// TongKhopTrongNgay AS (
//     -- Tính tổng khối lượng khớp trong ngày cho mỗi mã CP (DÙNG CTE MỚI)
//     SELECT ld.MaCP, SUM(tkl.TongDaKhop) AS TongKLKhopTrongNgay
//     FROM TongKhopTheoLenh tkl
//     JOIN LENHDAT ld ON tkl.MaGD = ld.MaGD
//     -- Thêm điều kiện ngày khớp nếu TongKhopTheoLenh chưa lọc ngày
//     JOIN LENHKHOP lk ON lk.MaGD = ld.MaGD -- Cần join lại để lấy ngày khớp
//     WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd
//     GROUP BY ld.MaCP
// ),
// LenhDatCho AS (
//      -- *** CTE MỚI: Lấy các lệnh đang chờ và tính số lượng còn lại ***
//      SELECT
//          ld.MaGD,
//          ld.MaCP,
//          ld.LoaiGD,
//          ld.SoLuong,
//          ISNULL(tkl.TongDaKhop, 0) AS TongDaKhop,
//          (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) AS SoLuongConLai
//      FROM LENHDAT ld
//      LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD -- Join với tổng khớp theo lệnh
//      WHERE
//          ld.TrangThai IN (N'Chờ', N'Một phần')
//          AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0 -- Chỉ lấy lệnh còn SL > 0
// ),
// TongDatMuaCho AS (
//      -- Tính tổng KL đặt mua đang chờ TỪ LenhDatCho
//      SELECT MaCP, SUM(SoLuongConLai) AS TongKLDatMua
//      FROM LenhDatCho
//      WHERE LoaiGD = 'M'
//      GROUP BY MaCP
// ),
// TongDatBanCho AS (
//      -- Tính tổng KL đặt bán đang chờ TỪ LenhDatCho
//      SELECT MaCP, SUM(SoLuongConLai) AS TongKLDatBan
//      FROM LenhDatCho
//      WHERE LoaiGD = 'B'
//      GROUP BY MaCP
// )
// -- Kết hợp tất cả thông tin
// SELECT
//     cp.MaCP,
//     cp.TenCty,
//     gn.GiaTC,
//     gn.GiaTran,
//     gn.GiaSan,
//     ISNULL(lkc.GiaKhop, gn.GiaTC) AS GiaKhopCuoi,
//     ISNULL(lkc.GiaKhop, gn.GiaTC) - gn.GiaTC AS ThayDoi,
//      -- Thêm kiểm tra gn.GiaTC > 0 để tránh lỗi chia cho 0
//     CASE WHEN ISNULL(gn.GiaTC, 0) > 0 THEN (ISNULL(lkc.GiaKhop, gn.GiaTC) - gn.GiaTC) * 100.0 / gn.GiaTC ELSE 0 END AS PhanTramThayDoi,
//     ISNULL(tdm.TongKLDatMua, 0) AS TongKLDatMua,
//     ISNULL(tdb.TongKLDatBan, 0) AS TongKLDatBan,
//     ISNULL(tktn.TongKLKhopTrongNgay, 0) AS TongKLKhop -- Đổi tên CTE ở đây
// FROM COPHIEU cp
// LEFT JOIN GiaHomNay gn ON cp.MaCP = gn.MaCP
// LEFT JOIN LenhKhopCuoi lkc ON cp.MaCP = lkc.MaCP
// LEFT JOIN TongKhopTrongNgay tktn ON cp.MaCP = tktn.MaCP -- Đổi tên CTE ở đây
// LEFT JOIN TongDatMuaCho tdm ON cp.MaCP = tdm.MaCP
// LEFT JOIN TongDatBanCho tdb ON cp.MaCP = tdb.MaCP
// WHERE gn.MaCP IS NOT NULL -- Chỉ lấy các mã có giá trong ngày hôm nay
// ORDER BY cp.MaCP;
//       `;
//     const result = await request.query(query);
//     return result.recordset;
//   } catch (err) {
//     console.error("SQL error getting market board data", err);
//     throw err;
//   }
// };

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
    -- Lấy thông tin lệnh khớp CUỐI CÙNG trong ngày (giá và khối lượng)
    SELECT MaCP, GiaKhop, SoLuongKhop AS KLKhopCuoi -- Lấy thêm KL khớp
    FROM (
      SELECT
        ld.MaCP,
        lk.GiaKhop,
        lk.SoLuongKhop, -- Lấy KL khớp
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
    -- *** CTE MỚI: Tính Tổng Giá Trị Giao Dịch Trong Ngày ***
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
  ),
  -- *** CTE MỚI: Lấy Top 3 Giá Mua Tốt Nhất và Tổng KL tương ứng ***
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
        -- Xếp hạng các mức giá mua khác nhau (cao nhất là tốt nhất)
        DENSE_RANK() OVER (PARTITION BY MaCP ORDER BY Gia DESC) as rn
      FROM LenhDatCho
      WHERE LoaiGD = 'M'
    ) AS RankedMua
    -- Chỉ lấy 3 mức giá tốt nhất và tính tổng KL cho mỗi mức giá đó
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
  -- *** CTE MỚI: Lấy Top 3 Giá Bán Tốt Nhất và Tổng KL tương ứng ***
  Top3Ban AS (
     SELECT
      MaCP,
      MIN(CASE WHEN rn = 1 THEN Gia END) AS GiaBan1, -- Dùng MIN vì giá thấp là tốt nhất
      SUM(CASE WHEN rn = 1 THEN SoLuongConLai END) AS KLBan1,
      MIN(CASE WHEN rn = 2 THEN Gia END) AS GiaBan2,
      SUM(CASE WHEN rn = 2 THEN SoLuongConLai END) AS KLBan2,
      MIN(CASE WHEN rn = 3 THEN Gia END) AS GiaBan3,
      SUM(CASE WHEN rn = 3 THEN SoLuongConLai END) AS KLBan3
    FROM (
      SELECT
        MaCP, Gia, SoLuongConLai,
         -- Xếp hạng các mức giá bán khác nhau (thấp nhất là tốt nhất)
        DENSE_RANK() OVER (PARTITION BY MaCP ORDER BY Gia ASC) as rn -- Order ASC
      FROM LenhDatCho
      WHERE LoaiGD = 'B'
    ) AS RankedBan
    WHERE rn <= 3
    GROUP BY MaCP
  )
  -- Kết hợp tất cả thông tin
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

    -- Thông tin Giá/KL Mua tốt nhất
    ISNULL(t3m.GiaMua1, 0) AS GiaMua1,
    ISNULL(t3m.KLMua1, 0) AS KLMua1,
    ISNULL(t3m.GiaMua2, 0) AS GiaMua2,
    ISNULL(t3m.KLMua2, 0) AS KLMua2,
    ISNULL(t3m.GiaMua3, 0) AS GiaMua3,
    ISNULL(t3m.KLMua3, 0) AS KLMua3,

    -- Thông tin Khớp lệnh gần nhất
    lkc.GiaKhop AS GiaKhopCuoi,
    ISNULL(lkc.KLKhopCuoi, 0) AS KLKhopCuoi,
    (lkc.GiaKhop - gn.GiaTC) AS ThayDoi,
    (lkc.GiaKhop - gn.GiaTC) * 100.0 / NULLIF(gn.GiaTC, 0) AS PhanTramThayDoi,

    -- Thông tin Giá/KL Bán tốt nhất
    ISNULL(t3b.GiaBan1, 0) AS GiaBan1,
    ISNULL(t3b.KLBan1, 0) AS KLBan1,
    ISNULL(t3b.GiaBan2, 0) AS GiaBan2,
    ISNULL(t3b.KLBan2, 0) AS KLBan2,
    ISNULL(t3b.GiaBan3, 0) AS GiaBan3,
    ISNULL(t3b.KLBan3, 0) AS KLBan3,
    ISNULL(tdm.TongKLDatMua, 0) AS TongKLDatMua,
    ISNULL(tdb.TongKLDatBan, 0) AS TongKLDatBan,
    -- Tổng khối lượng khớp trong ngày
    ISNULL(tktn.TongKLKhopTrongNgay, 0) AS TongKLKhop,
    -- Tổng giá trị giao dịch trong ngày
    ISNULL(tgt.TongGTGDTrongNgay, 0) AS TongGTGD

  FROM COPHIEU cp
  JOIN GiaHomNay gn ON cp.MaCP = gn.MaCP -- INNER JOIN để chỉ lấy mã có giá
  LEFT JOIN LenhKhopCuoi lkc ON cp.MaCP = lkc.MaCP
  LEFT JOIN TongKhopTrongNgay tktn ON cp.MaCP = tktn.MaCP
  LEFT JOIN TongGiaTriGiaoDichTrongNgay tgt ON cp.MaCP = tgt.MaCP -- Join với Tổng GTGD
  LEFT JOIN Top3Mua t3m ON cp.MaCP = t3m.MaCP -- Join với Top 3 Mua
  LEFT JOIN Top3Ban t3b ON cp.MaCP = t3b.MaCP -- Join với Top 3 Bán
  LEFT JOIN TongDatMuaCho tdm ON cp.MaCP = tdm.MaCP
  LEFT JOIN TongDatBanCho tdb ON cp.MaCP = tdb.MaCP
  WHERE cp.Status = 1 -- Chỉ lấy CP đang giao dịch
  ORDER BY cp.MaCP;

  -- Ensure no null values in critical columns
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
    request.input('MaCPInput', sql.NVarChar(10), maCPInput.trim()); // Validate and sanitize input

    // Query tương tự getMarketBoardData nhưng thêm WHERE cho cp.MaCP
    const query = `
      DECLARE @NgayHienTai DATE = CAST(GETDATE() AS DATE);
      DECLARE @NgayHienTaiStart DATETIME = CAST(@NgayHienTai AS DATETIME);
      DECLARE @NgayMai DATE = DATEADD(day, 1, @NgayHienTai);
      DECLARE @NgayMaiStart DATETIME = CAST(@NgayMai AS DATETIME);
      DECLARE @NgayHienTaiEnd DATETIME = DATEADD(ms, -3, @NgayMaiStart);

      WITH GiaHomNay AS (
          SELECT MaCP, GiaTran, GiaSan, GiaTC, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua
          FROM LICHSUGIA WHERE Ngay = @NgayHienTai AND MaCP = @MaCPInput -- Lọc theo MaCP
      ),
      LenhKhopCuoi AS (
          SELECT MaCP, GiaKhop, SoLuongKhop AS KLKhopCuoi
          FROM ( SELECT ld.MaCP, lk.GiaKhop, lk.SoLuongKhop, ROW_NUMBER() OVER(PARTITION BY ld.MaCP ORDER BY lk.NgayGioKhop DESC) as rn
                 FROM LENHKHOP lk JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
                 WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd AND ld.MaCP = @MaCPInput -- Lọc theo MaCP
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
          WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd AND ld.MaCP = @MaCPInput -- Lọc theo MaCP
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
            -- Xếp hạng các mức giá mua khác nhau (cao nhất là tốt nhất)
            DENSE_RANK() OVER (PARTITION BY MaCP ORDER BY Gia DESC) as rn
        FROM LenhDatCho
        WHERE LoaiGD = 'M'
    ) AS RankedMua
    -- Chỉ lấy 3 mức giá tốt nhất và tính tổng KL cho mỗi mức giá đó
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
-- *** CTE MỚI: Lấy Top 3 Giá Bán Tốt Nhất và Tổng KL tương ứng ***
Top3Ban AS (
     SELECT
        MaCP,
        MIN(CASE WHEN rn = 1 THEN Gia END) AS GiaBan1, -- Dùng MIN vì giá thấp là tốt nhất
        SUM(CASE WHEN rn = 1 THEN SoLuongConLai END) AS KLBan1,
        MIN(CASE WHEN rn = 2 THEN Gia END) AS GiaBan2,
        SUM(CASE WHEN rn = 2 THEN SoLuongConLai END) AS KLBan2,
        MIN(CASE WHEN rn = 3 THEN Gia END) AS GiaBan3,
        SUM(CASE WHEN rn = 3 THEN SoLuongConLai END) AS KLBan3
    FROM (
        SELECT
            MaCP, Gia, SoLuongConLai,
             -- Xếp hạng các mức giá bán khác nhau (thấp nhất là tốt nhất)
            DENSE_RANK() OVER (PARTITION BY MaCP ORDER BY Gia ASC) as rn -- Order ASC
        FROM LenhDatCho
        WHERE LoaiGD = 'B'
    ) AS RankedBan
    WHERE rn <= 3
    GROUP BY MaCP
)
      -- Kết hợp thông tin
      SELECT TOP 1 -- Chỉ cần lấy 1 dòng
          cp.MaCP, cp.TenCty, cp.DiaChi, cp.SoLuongPH, cp.Status, -- Thêm thông tin cơ bản
          gn.GiaTC, gn.GiaTran, gn.GiaSan,
          gn.GiaMoCua, gn.GiaCaoNhat, gn.GiaThapNhat, -- Thêm giá OHLC đã lưu
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
      JOIN GiaHomNay gn ON cp.MaCP = gn.MaCP -- INNER JOIN để đảm bảo có giá hôm nay
      LEFT JOIN LenhKhopCuoi lkc ON cp.MaCP = lkc.MaCP
      LEFT JOIN TongKhopTrongNgay tktn ON cp.MaCP = tktn.MaCP
      LEFT JOIN Top3Mua t3m ON cp.MaCP = t3m.MaCP
      LEFT JOIN Top3Ban t3b ON cp.MaCP = t3b.MaCP
      WHERE cp.MaCP = @MaCPInput AND cp.Status = 1; -- <<< LỌC THEO Mã CP và Status=1
      -- Không cần ORDER BY vì chỉ lấy TOP 1
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

// -- Query lấy dữ liệu thị trường chi tiết cho một mã CP (Đã tối ưu)
// DECLARE @NgayHienTai DATE = CAST(GETDATE() AS DATE);
// DECLARE @NgayHienTaiStart DATETIME = CAST(@NgayHienTai AS DATETIME);
// DECLARE @NgayMai DATE = DATEADD(day, 1, @NgayHienTai);
// DECLARE @NgayMaiStart DATETIME = CAST(@NgayMai AS DATETIME);
// DECLARE @NgayHienTaiEnd DATETIME = DATEADD(ms, -3, @NgayMaiStart);

// -- Input MaCP (đã được truyền vào từ request)
// -- DECLARE @MaCPInput NVARCHAR(10) = 'FPT'; -- Ví dụ

// WITH GiaHomNay AS (
//     -- Lấy giá và OHLC của ngày hôm nay cho mã CP cụ thể
//     SELECT MaCP, GiaTran, GiaSan, GiaTC, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua
//     FROM LICHSUGIA
//     WHERE Ngay = @NgayHienTai AND MaCP = @MaCPInput
// ),
// LenhKhopCuoi AS (
//     -- Lấy giá và KL khớp cuối cùng trong ngày cho mã CP cụ thể
//     SELECT TOP 1 GiaKhop, SoLuongKhop AS KLKhopCuoi
//     FROM LENHKHOP lk
//     JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
//     WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd AND ld.MaCP = @MaCPInput
//     ORDER BY lk.NgayGioKhop DESC
// ),
// TongKhopTrongNgay AS (
//     -- Tính tổng KL khớp trong ngày cho mã CP cụ thể
//     SELECT SUM(ISNULL(lk.SoLuongKhop, 0)) AS TongKLKhopTrongNgay
//     FROM LENHKHOP lk
//     JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
//     WHERE lk.NgayGioKhop >= @NgayHienTaiStart AND lk.NgayGioKhop <= @NgayHienTaiEnd AND ld.MaCP = @MaCPInput
//     -- Không cần GROUP BY vì đã lọc theo MaCPInput
// ),
// -- CTE Tính toán Lệnh Đặt Chờ và Số Lượng Còn Lại cho Mã CP cụ thể
// LenhDatChoMaCP AS (
//      SELECT
//          ld.MaGD, ld.LoaiGD, ld.Gia,
//          -- Tính Số lượng còn lại bằng Subquery hoặc JOIN CTE TongKhopTheoLenh (tối ưu)
//          (ld.SoLuong - ISNULL((SELECT SUM(ISNULL(slk.SoLuongKhop, 0)) FROM LENHKHOP slk WHERE slk.MaGD = ld.MaGD), 0)) AS SoLuongConLai
//      FROM LENHDAT ld
//      WHERE ld.MaCP = @MaCPInput -- Lọc sớm theo MaCP
//        AND ld.TrangThai IN (N'Chờ', N'Một phần')
//        AND ld.LoaiLenh = 'LO' -- Chỉ lấy lệnh LO cho Top 3 giá
//        -- Thêm điều kiện lọc ngày nếu cần (ví dụ: chỉ lệnh hôm nay)
//        -- AND CAST(ld.NgayGD AS DATE) = @NgayHienTai
//        AND (ld.SoLuong - ISNULL((SELECT SUM(ISNULL(slk.SoLuongKhop, 0)) FROM LENHKHOP slk WHERE slk.MaGD = ld.MaGD), 0)) > 0 -- Đảm bảo còn SL
// ),
// Top3Mua AS (
//     -- Lấy Top 3 Giá Mua Tốt Nhất và Tổng KL từ LenhDatChoMaCP
//     SELECT
//         MAX(CASE WHEN rn_gia_mua = 1 THEN Gia END) AS GiaMua1,
//         SUM(CASE WHEN rn_gia_mua = 1 THEN SoLuongConLai END) AS KLMua1,
//         MAX(CASE WHEN rn_gia_mua = 2 THEN Gia END) AS GiaMua2,
//         SUM(CASE WHEN rn_gia_mua = 2 THEN SoLuongConLai END) AS KLMua2,
//         MAX(CASE WHEN rn_gia_mua = 3 THEN Gia END) AS GiaMua3,
//         SUM(CASE WHEN rn_gia_mua = 3 THEN SoLuongConLai END) AS KLMua3
//     FROM (
//         SELECT
//             Gia, SoLuongConLai,
//             DENSE_RANK() OVER (ORDER BY Gia DESC) as rn_gia_mua -- Xếp hạng mức giá mua
//         FROM LenhDatChoMaCP
//         WHERE LoaiGD = 'M' AND Gia IS NOT NULL -- Chỉ lệnh LO Mua
//     ) AS RankedMua
//     WHERE rn_gia_mua <= 3
//     -- Không cần GROUP BY MaCP vì đã lọc từ đầu
// ),
// Top3Ban AS (
//      -- Lấy Top 3 Giá Bán Tốt Nhất và Tổng KL từ LenhDatChoMaCP
//     SELECT
//         MIN(CASE WHEN rn_gia_ban = 1 THEN Gia END) AS GiaBan1,
//         SUM(CASE WHEN rn_gia_ban = 1 THEN SoLuongConLai END) AS KLBan1,
//         MIN(CASE WHEN rn_gia_ban = 2 THEN Gia END) AS GiaBan2,
//         SUM(CASE WHEN rn_gia_ban = 2 THEN SoLuongConLai END) AS KLBan2,
//         MIN(CASE WHEN rn_gia_ban = 3 THEN Gia END) AS GiaBan3,
//         SUM(CASE WHEN rn_gia_ban = 3 THEN SoLuongConLai END) AS KLBan3
//     FROM (
//         SELECT
//             Gia, SoLuongConLai,
//             DENSE_RANK() OVER (ORDER BY Gia ASC) as rn_gia_ban -- Xếp hạng mức giá bán
//         FROM LenhDatChoMaCP
//         WHERE LoaiGD = 'B' AND Gia IS NOT NULL -- Chỉ lệnh LO Bán
//     ) AS RankedBan
//     WHERE rn_gia_ban <= 3
//     -- Không cần GROUP BY MaCP
// )
// -- Kết hợp thông tin cuối cùng
// SELECT TOP 1
//     cp.MaCP, cp.TenCty, cp.DiaChi, cp.SoLuongPH, cp.Status,
//     gn.GiaTC, gn.GiaTran, gn.GiaSan,
//     gn.GiaMoCua, gn.GiaCaoNhat, gn.GiaThapNhat, -- Thêm giá OHLC
//     ISNULL(lkc.GiaKhop, gn.GiaTC) AS GiaKhopCuoi, ISNULL(lkc.KLKhopCuoi, 0) AS KLKhopCuoi,
//     ISNULL(lkc.GiaKhop, gn.GiaTC) - gn.GiaTC AS ThayDoi,
//     CASE WHEN ISNULL(gn.GiaTC, 0) = 0 THEN 0 ELSE (ISNULL(lkc.GiaKhop, gn.GiaTC) - gn.GiaTC) * 100.0 / gn.GiaTC END AS PhanTramThayDoi,
//     ISNULL(t3m.GiaMua1, 0) AS GiaMua1, ISNULL(t3m.KLMua1, 0) AS KLMua1,
//     ISNULL(t3m.GiaMua2, 0) AS GiaMua2, ISNULL(t3m.KLMua2, 0) AS KLMua2,
//     ISNULL(t3m.GiaMua3, 0) AS GiaMua3, ISNULL(t3m.KLMua3, 0) AS KLMua3,
//     ISNULL(t3b.GiaBan1, 0) AS GiaBan1, ISNULL(t3b.KLBan1, 0) AS KLBan1,
//     ISNULL(t3b.GiaBan2, 0) AS GiaBan2, ISNULL(t3b.KLBan2, 0) AS KLBan2,
//     ISNULL(t3b.GiaBan3, 0) AS GiaBan3, ISNULL(t3b.KLBan3, 0) AS KLBan3,
//     ISNULL(tktn.TongKLKhopTrongNgay, 0) AS TongKLKhop
// FROM COPHIEU cp
// -- JOIN quan trọng: Phải có thông tin giá hôm nay và CP phải đang giao dịch
// JOIN GiaHomNay gn ON cp.MaCP = gn.MaCP
// WHERE cp.MaCP = @MaCPInput AND cp.Status = 1 -- Điều kiện lọc chính
// -- LEFT JOIN với các thông tin khác
// LEFT JOIN LenhKhopCuoi lkc ON 1=1 -- Join không cần điều kiện vì đã lọc MaCP ở CTE
// LEFT JOIN TongKhopTrongNgay tktn ON 1=1 -- Join không cần điều kiện
// LEFT JOIN Top3Mua t3m ON 1=1 -- Join không cần điều kiện
// LEFT JOIN Top3Ban t3b ON 1=1; -- Join không cần điều kiện
