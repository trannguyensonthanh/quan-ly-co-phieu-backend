// models/LenhDat.model.js
const sql = require("mssql");
const db = require("./db");
const AppError = require("../utils/errors/AppError"); // Nếu cần xử lý lỗi
const LenhDat = {};

// Hàm tạo mới lệnh đặt (dùng trong transaction)
// Cần truyền đối tượng request của transaction vào
LenhDat.create = async (transactionRequest, lenhDatData) => {
  const { LoaiGD, LoaiLenh, SoLuong, MaCP, Gia, MaTK, TrangThai } = lenhDatData;
  try {
    // Không cần input MaGD vì nó tự động tăng
    transactionRequest.input("LoaiGD", sql.Char(1), LoaiGD);
    transactionRequest.input("LoaiLenh", sql.NChar(5), LoaiLenh);
    transactionRequest.input("SoLuong", sql.Int, SoLuong);
    transactionRequest.input("MaCP_ld", sql.NChar(10), MaCP); // Đặt tên khác tránh trùng
    transactionRequest.input("Gia", sql.Float, Gia);
    transactionRequest.input("MaTK_ld", sql.NChar(20), MaTK); // Đặt tên khác tránh trùng
    transactionRequest.input("TrangThai", sql.NVarChar(20), TrangThai);
    // NgayGD dùng Default GetDate() trong DB nên không cần truyền

    const query = `
            INSERT INTO LENHDAT (LoaiGD, LoaiLenh, SoLuong, MaCP, Gia, MaTK, TrangThai)
            OUTPUT INSERTED.MaGD, INSERTED.NgayGD -- Trả về MaGD và NgayGD vừa tạo
            VALUES (@LoaiGD, @LoaiLenh, @SoLuong, @MaCP_ld, @Gia, @MaTK_ld, @TrangThai);
        `;
    const result = await transactionRequest.query(query);

    if (result.recordset.length === 0) {
      throw new Error(
        "Không thể tạo lệnh đặt hoặc lấy thông tin lệnh vừa tạo."
      );
    }

    console.log(`Order placed: MaGD=${result.recordset[0].MaGD}`);
    // Trả về thông tin lệnh vừa tạo (có thể bổ sung các trường khác)
    return {
      MaGD: result.recordset[0].MaGD,
      NgayGD: result.recordset[0].NgayGD,
      ...lenhDatData,
    };
  } catch (err) {
    console.error("SQL error creating LenhDat", err);
    // Ném lỗi để transaction rollback
    throw err;
  }
};

// Hàm lấy danh sách lệnh đặt của một MaTK trong khoảng thời gian
// Bao gồm cả thông tin khớp (nếu có) để phục vụ sao kê A.4
LenhDat.findByMaTKAndDateRange = async (maTK, tuNgay, denNgay) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaTK", sql.NChar(20), maTK);
    // Đảm bảo tuNgay là đầu ngày và denNgay là cuối ngày để bao gồm cả ngày đó
    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input("TuNgay", sql.DateTime, startDate);

    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997); // Cuối ngày
    request.input("DenNgay", sql.DateTime, endDate);

    // Query lấy thông tin lệnh đặt và tổng hợp thông tin từ lệnh khớp (nếu có)
    // Sử dụng LEFT JOIN để lấy cả những lệnh chưa khớp
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
              -- Tính tổng số lượng đã khớp từ bảng LENHKHOP
              ISNULL((SELECT SUM(SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop,
               -- Lấy giá khớp trung bình (hoặc có thể lấy danh sách giá khớp) - Tùy yêu cầu chi tiết
              (SELECT AVG(GiaKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS GiaKhopTrungBinh
              -- Có thể lấy thêm ngày giờ khớp cuối cùng nếu cần
              -- (SELECT MAX(NgayGioKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS NgayGioKhopCuoi
          FROM LENHDAT ld
          WHERE ld.MaTK = @MaTK
            AND ld.NgayGD >= @TuNgay
            AND ld.NgayGD <= @DenNgay
          ORDER BY ld.NgayGD DESC; -- Sắp xếp theo ngày mới nhất trước
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error("SQL error finding LenhDat by MaTK and date range", err);
    throw err;
  }
};

// Hàm lấy danh sách lệnh đặt của tất cả các MaTK thuộc về một MaNDT trong khoảng thời gian
LenhDat.findByMaNDTAndDateRange = async (maNDT, tuNgay, denNgay) => {
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
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK -- Join để lọc theo MaNDT
          WHERE tk.MaNDT = @MaNDT
            AND ld.NgayGD >= @TuNgay
            AND ld.NgayGD <= @DenNgay
          ORDER BY ld.NgayGD DESC;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error("SQL error finding LenhDat by MaNDT and date range", err);
    throw err;
  }
};

// Các hàm khác: tìm lệnh, hủy lệnh, cập nhật trạng thái... sẽ thêm sau

// hàm tìm các lệnh đặt dựa trên mã cổ phiếu
LenhDat.findByMaCPAndDateRange = async (maCP, tuNgay, denNgay) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NChar(10), maCP);

    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input("TuNgay", sql.DateTime, startDate);

    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997);
    request.input("DenNgay", sql.DateTime, endDate);

    // Query tương tự A.4 nhưng lọc theo MaCP
    const query = `
          SELECT
              ld.MaGD,
              ld.NgayGD,
              ld.LoaiGD,
              ld.LoaiLenh,
              ld.SoLuong AS SoLuongDat,
              ld.Gia AS GiaDat,
              ld.MaTK, -- Có thể cần để tham chiếu NDT nếu muốn
              ld.TrangThai,
              -- Thông tin khớp từ LENHKHOP
              ISNULL((SELECT SUM(SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop,
              (SELECT AVG(GiaKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS GiaKhopTrungBinh,
              (SELECT MAX(NgayGioKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS NgayGioKhopCuoi
          FROM LENHDAT ld
          WHERE ld.MaCP = @MaCP
            AND ld.NgayGD >= @TuNgay
            AND ld.NgayGD <= @DenNgay
          ORDER BY ld.NgayGD DESC; -- Sắp xếp theo ngày mới nhất trước
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

// Hàm tìm lệnh đặt theo MaGD và lấy các thông tin cần cho việc hủy
LenhDat.findOrderForCancellation = async (maGD) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaGD", sql.Int, maGD);

    // Lấy cả MaTK, LoaiGD, Gia, SoLuong, TrangThai và tổng đã khớp
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
              tk.MaNDT, -- Lấy MaNDT để kiểm tra quyền sở hữu
              ISNULL((SELECT SUM(SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK -- Join để lấy MaNDT
          WHERE ld.MaGD = @MaGD;
      `;
    const result = await request.query(query);

    if (result.recordset.length > 0) {
      const order = result.recordset[0];
      // Áp dụng trim() cho các trường chuỗi
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
    return undefined; // Trả về undefined nếu không có lệnh
  } catch (err) {
    console.error(`SQL error finding order ${maGD} for cancellation`, err);
    throw err;
  }
};

// Hàm cập nhật trạng thái lệnh thành 'Hủy' (dùng trong transaction)
LenhDat.updateStatusToCancelled = async (transactionRequest, maGD) => {
  try {
    transactionRequest.input("MaGD_cancel", sql.Int, maGD); // Tên input khác
    transactionRequest.input("TrangThaiMoi", sql.NVarChar(20), "Hủy");

    const query = `
          UPDATE LENHDAT
          SET TrangThai = @TrangThaiMoi
          WHERE MaGD = @MaGD_cancel
            AND TrangThai IN (N'Chờ', N'Một phần'); -- Chỉ hủy các lệnh đang chờ/khớp 1 phần
      `;
    const result = await transactionRequest.query(query);
    return result.rowsAffected[0]; // Trả về 1 nếu thành công, 0 nếu lệnh không ở trạng thái hủy được hoặc không tồn tại
  } catch (err) {
    console.error(`SQL error updating order ${maGD} status to Cancelled`, err);
    throw err; // Ném lỗi để transaction rollback
  }
};

// Hàm tính tổng số lượng đã khớp cho một MaGD
async function getTotalMatchedQuantity(maGD) {
  // Hàm tiện ích nội bộ, có thể không cần export nếu chỉ dùng ở đây
  try {
    const pool = await db.getPool(); // Có thể cần tối ưu, không tạo pool mỗi lần gọi
    const request = pool.request();
    request.input("MaGD_khop", sql.Int, maGD);
    const query =
      "SELECT ISNULL(SUM(SoLuongKhop), 0) AS TongKhop FROM LENHKHOP WHERE MaGD = @MaGD_khop";
    const result = await request.query(query);
    return result.recordset[0].TongKhop;
  } catch (err) {
    console.error(
      `Error calculating total matched quantity for MaGD ${maGD}:`,
      err
    );
    return 0; // Trả về 0 nếu có lỗi để tránh dừng khớp lệnh
  }
}

// Hàm lấy các lệnh MUA đang chờ khớp, sắp xếp ưu tiên
LenhDat.findPendingBuyOrders = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NChar(10), maCP);

    // Query lấy lệnh mua 'Chờ' hoặc 'Một phần'
    // Tính SoLuongConLai = SoLuong (gốc) - Tổng SoLuongKhop
    const query = `
               WITH MatchedTotals AS (
                -- Tính tổng đã khớp cho các lệnh liên quan để tối ưu
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
              tk.MaNDT, -- Lấy MaNDT để cập nhật SoHuu
              -- Tính toán số lượng còn lại
              (ld.SoLuong - ISNULL(mt.TongKhop, 0)) AS SoLuongConLai
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK -- Join lấy MaNDT
          LEFT JOIN MatchedTotals mt ON ld.MaGD = mt.MaGD 
          WHERE ld.MaCP = @MaCP
            AND ld.LoaiGD = 'M'
            AND ld.TrangThai IN (N'Chờ', N'Một phần')
            AND (ld.SoLuong - ISNULL(mt.TongKhop, 0)) > 0 -- Điều kiện lọc quan trọng
          ORDER BY
              ld.Gia DESC,  -- Ưu tiên giá mua cao nhất
              ld.NgayGD ASC;  -- Nếu giá bằng nhau, ưu tiên lệnh cũ nhất
      `;
    const result = await request.query(query);
    // Lọc lại lần nữa để chắc chắn SoLuongConLai > 0 (phòng trường hợp tính toán SQL phức tạp có sai sót nhỏ)
    return result.recordset.filter((order) => order.SoLuongConLai > 0);
  } catch (err) {
    console.error(`SQL error finding pending buy orders for ${maCP}`, err);
    throw err;
  }
};

// Hàm lấy các lệnh BÁN đang chờ khớp, sắp xếp ưu tiên
LenhDat.findPendingSellOrders = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NChar(10), maCP);

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
              tk.MaNDT, -- Lấy MaNDT để cập nhật SoHuu
              (ld.SoLuong - ISNULL(mt.TongKhop, 0)) AS SoLuongConLai
          FROM LENHDAT ld
           JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK -- Join lấy MaNDT
          WHERE ld.MaCP = @MaCP
            AND ld.LoaiGD = 'B'
            AND ld.TrangThai IN (N'Chờ', N'Một phần')
            AND (ld.SoLuong - ISNULL(mt.TongKhop, 0)) > 0
          ORDER BY
              ld.Gia ASC,   -- Ưu tiên giá bán thấp nhất
              ld.NgayGD ASC;  -- Nếu giá bằng nhau, ưu tiên lệnh cũ nhất
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
// Hàm cập nhật trạng thái lệnh sau khi khớp (dùng trong transaction)
LenhDat.updateStatusAfterMatch = async (
  transactionRequest,
  maGD,
  newStatus
) => {
  // Tên input động để tránh xung đột trong transaction
  const statusInputName = `NewStatus_${maGD}`;
  const maGDInputName = `MaGD_update_${maGD}`;
  // Kiểm tra trạng thái hợp lệ
  if (newStatus !== "Một phần" && newStatus !== "Hết") {
    throw new Error(`Trạng thái cập nhật không hợp lệ: ${newStatus}`);
  }
  try {
    // Sử dụng lại tên input MaGD_cancel hoặc đặt tên mới
    transactionRequest.input(maGDInputName, sql.Int, maGD);
    transactionRequest.input(statusInputName, sql.NVarChar(20), newStatus);

    const query = `
            UPDATE LENHDAT
            SET TrangThai = @${statusInputName}
            WHERE MaGD = @${maGDInputName}
              AND TrangThai IN (N'Chờ', N'Một phần');
        `;
    const result = await transactionRequest.query(query);
    // Không cần kiểm tra rowsAffected chặt chẽ ở đây vì logic khớp lệnh đã xác định lệnh này cần update
    if (result.rowsAffected[0] === 0) {
      console.warn(
        `Order ${maGD} status might have changed before updateAfterMatch. Expected 'Chờ' or 'Một phần'.`
      );
      // Có thể ném lỗi hoặc chỉ cảnh báo tùy vào mức độ nghiêm ngặt mong muốn
      // throw new Error(`Không thể cập nhật trạng thái cho lệnh ${maGD} sau khi khớp (trạng thái có thể đã thay đổi).`);
    }
    return result.rowsAffected[0];
  } catch (err) {
    console.error(`SQL error updating order ${maGD} status after match`, err);
    throw err; // Ném lỗi để transaction rollback
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
  sortBy = "Default"
) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NVarChar(10), maCP);

    // --- Xác định LoaiGD cần lọc dựa trên sortBy ---
    let loaiGdFilter = "";
    if (sortBy === "ContinuousBuy") {
      loaiGdFilter = "AND ld.LoaiGD = 'M'"; // Chỉ lấy lệnh Mua
    } else if (sortBy === "ContinuousSell") {
      loaiGdFilter = "AND ld.LoaiGD = 'B'"; // Chỉ lấy lệnh Bán
    }
    // Nếu sortBy là 'Default' (cho ATO/ATC), không lọc theo LoaiGD ở đây

    // Xây dựng mệnh đề WHERE cho LoaiLenh (giữ nguyên)
    let loaiLenhFilter = "";
    if (Array.isArray(allowedLoaiLenh) && allowedLoaiLenh.length > 0) {
      const loaiLenhParams = allowedLoaiLenh
        .map((loai, index) => {
          const paramName = `LoaiLenh${index}`;
          request.input(paramName, sql.NChar(5), loai);
          return `@${paramName}`;
        })
        .join(", ");
      loaiLenhFilter = `AND ld.LoaiLenh IN (${loaiLenhParams})`;
    }

    // Xây dựng mệnh đề ORDER BY (giữ nguyên)
    let orderByClause = "";
    switch (sortBy) {
      case "ContinuousBuy":
        orderByClause = "ORDER BY ld.Gia DESC, ld.NgayGD ASC"; // Giá cao -> Thời gian
        break;
      case "ContinuousSell":
        orderByClause = "ORDER BY ld.Gia ASC, ld.NgayGD ASC"; // Giá thấp -> Thời gian
        break;
      case "Default": // Dùng cho ATO/ATC
      default:
        // Ưu tiên ATO/ATC -> LO. Trong LO ưu tiên giá -> thời gian.
        orderByClause = `ORDER BY
                                  CASE ld.LoaiLenh WHEN 'ATO' THEN 1 WHEN 'ATC' THEN 1 ELSE 2 END ASC, -- Ưu tiên ATO/ATC
                                  CASE ld.LoaiGD WHEN 'M' THEN ld.Gia END DESC, -- Lệnh Mua LO ưu tiên giá cao
                                  CASE ld.LoaiGD WHEN 'B' THEN ld.Gia END ASC,  -- Lệnh Bán LO ưu tiên giá thấp
                                  ld.NgayGD ASC`; // Cuối cùng là thời gian
        break;
    }

    // CTE tính tổng khớp (giữ nguyên)
    const query = `
        WITH TongKhopTheoLenh AS (
            SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop
            FROM dbo.LENHKHOP WHERE MaGD IN (SELECT MaGD FROM dbo.LENHDAT WHERE MaCP = @MaCP) -- Tối ưu hơn nếu lọc MaCP ở đây
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
          ${loaiLenhFilter} -- Filter LoaiLenh
          ${loaiGdFilter}   -- <<< THÊM FILTER LoaiGD Ở ĐÂY >>>
        ${orderByClause}; -- Sắp xếp
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
    request.input("MaNDT", sql.NChar(20), maNDT);

    // Lấy ngày hiện tại của SQL Server
    const queryGetDate = "SELECT CAST(GETDATE() AS DATE) as TodayDate";
    const dateResult = await pool.request().query(queryGetDate);
    const today = dateResult.recordset[0].TodayDate;
    request.input("NgayHomNay", sql.Date, today); // Input ngày hôm nay

    // Query tương tự findByMaNDTAndDateRange nhưng lọc theo ngày hôm nay
    const query = `
          SELECT
              ld.MaGD, ld.NgayGD, ld.LoaiGD, ld.LoaiLenh,
              ld.SoLuong AS SoLuongDat, ld.MaCP, ld.Gia AS GiaDat,
              ld.MaTK, ld.TrangThai,
              ISNULL((SELECT SUM(lk.SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop,
              (SELECT AVG(lk.GiaKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS GiaKhopTrungBinh
              -- Thêm các cột khác nếu cần
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          WHERE tk.MaNDT = @MaNDT
            AND CAST(ld.NgayGD AS DATE) = @NgayHomNay -- Lọc theo ngày hôm nay
          ORDER BY ld.NgayGD DESC; -- Sắp xếp mới nhất trước
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
    request.input("TuNgay", sql.DateTime, startDate);
    const endDate = new Date(denNgay);
    endDate.setHours(23, 59, 59, 997);
    request.input("DenNgay", sql.DateTime, endDate);

    // Query lấy tất cả LENHDAT và join thông tin cần thiết
    const query = `
          SELECT
              ld.MaGD, ld.NgayGD, ld.LoaiGD, ld.LoaiLenh,
              ld.SoLuong AS SoLuongDat, ld.MaCP, ld.Gia AS GiaDat,
              ld.MaTK, tk.MaNDT, ndt.HoTen AS TenNDT, -- Thêm MaNDT, TenNDT
              ld.TrangThai,
              ISNULL((SELECT SUM(lk.SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop,
              (SELECT AVG(lk.GiaKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD) AS GiaKhopTrungBinh
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          JOIN NDT ndt ON tk.MaNDT = ndt.MaNDT -- Join thêm NDT
          WHERE ld.NgayGD >= @TuNgay AND ld.NgayGD <= @DenNgay
          ORDER BY ld.NgayGD DESC; -- Sắp xếp mới nhất trước
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error("SQL error getting all admin orders:", err);
    throw new AppError("Lỗi khi lấy toàn bộ lịch sử lệnh đặt.", 500);
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
    // Đặt tên input động
    const suffix = `${maGD}_upd_${Date.now()}`;
    transactionRequest.input(`MaGD_upd_${suffix}`, sql.Int, maGD);

    let setClauses = [];
    if (newGia !== null && newGia !== undefined) {
      transactionRequest.input(`NewGia_${suffix}`, sql.Float, newGia);
      setClauses.push("Gia = @NewGia_" + suffix);
    }
    if (newSoLuong !== null && newSoLuong !== undefined) {
      transactionRequest.input(`NewSoLuong_${suffix}`, sql.Int, newSoLuong);
      setClauses.push("SoLuong = @NewSoLuong_" + suffix);
    }

    if (setClauses.length === 0) {
      console.warn(
        `[Update Order ${maGD}] No price or quantity provided for update.`
      );
      return 0; // Không có gì để cập nhật
    }

    // Query cập nhật, chỉ cho phép khi là LO và trạng thái là Chờ/Một phần
    // và Số lượng mới phải >= Tổng đã khớp
    const query = `
          UPDATE dbo.LENHDAT
          SET ${setClauses.join(",\n          ")},
              -- Reset NgayGD để mất ưu tiên thời gian cũ? Tùy quy định sàn.
              NgayGD = GETDATE() -- Uncomment nếu muốn reset thời gian
          WHERE MaGD = @MaGD_upd_${suffix}
            AND LoaiLenh = 'LO' -- Chỉ cho sửa lệnh LO
            AND TrangThai IN (N'Chờ', N'Một phần') -- Chỉ sửa lệnh đang chờ/khớp 1 phần
            -- Đảm bảo số lượng mới không nhỏ hơn số lượng đã khớp
            AND (@NewSoLuong_${suffix} IS NULL OR @NewSoLuong_${suffix} >= ISNULL((SELECT SUM(lk.SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = @MaGD_upd_${suffix}), 0));

          SELECT @@ROWCOUNT AS AffectedRows;
      `;

    const result = await transactionRequest.query(query);
    return result.recordset[0].AffectedRows;
  } catch (err) {
    console.error(`SQL error updating order details for MaGD ${maGD}:`, err);
    // Check lỗi ràng buộc giá/số lượng nếu có (vd: > 0)
    if (err.number === 547 || err.number === 515) {
      // Check constraint violation
      throw new Error(`Dữ liệu sửa lệnh không hợp lệ (Giá hoặc Số lượng).`);
    }
    throw new Error(`Lỗi khi cập nhật lệnh đặt ${maGD}: ${err.message}`); // Ném lỗi để transaction rollback
  }
};

module.exports = LenhDat;
