// models/LichSuGia.model.js
const sql = require("mssql");
const db = require("./db");

const LichSuGia = {};

// Hàm lấy thông tin giá (Trần, Sàn, Tham chiếu) của mã CP trong ngày hiện tại
LichSuGia.getCurrentPriceInfo = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NChar(10), maCP);
    // Lấy ngày hiện tại (chỉ phần Date)
    const queryCheckDate = `DECLARE @NgayCheck DATE = CAST(GETDATE() AS DATE); SELECT @NgayCheck as NgayHienTai;`;
    const dateResult = await request.query(queryCheckDate);
    const today = dateResult.recordset[0].NgayHienTai;
    request.input("Ngay", sql.Date, today);

    // Query lấy giá của ngày hôm nay
    // Lưu ý: CSDL của bạn cần có dữ liệu giá cho ngày hiện tại
    const query = `
            SELECT GiaTran, GiaSan, GiaTC
            FROM LICHSUGIA
            WHERE MaCP = @MaCP AND CAST(Ngay AS DATE) = @Ngay;
        `;
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      // Có thể ném lỗi hoặc trả về null/undefined nếu không có dữ liệu giá cho ngày hôm nay
      throw new Error(
        `Không tìm thấy dữ liệu giá (Trần/Sàn/TC) cho mã CP '${maCP}' trong ngày hôm nay.`
      );
    }
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error getting current price info for ${maCP}`, err);
    throw err;
  }
};

/**
 * Kiểm tra xem một mã cổ phiếu đã có bất kỳ lịch sử giá nào chưa.
 * @param {string} maCP Mã cổ phiếu.
 * @returns {Promise<boolean>} True nếu đã có giá, False nếu chưa.
 */
LichSuGia.checkIfPriceExists = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NVarChar(10), maCP); // Sử dụng NVARCHAR
    const query = "SELECT COUNT(*) as Count FROM LICHSUGIA WHERE MaCP = @MaCP;";
    const result = await request.query(query);
    return result.recordset[0].Count > 0;
  } catch (err) {
    console.error(`SQL error checking price existence for ${maCP}:`, err);
    throw new Error(`Lỗi kiểm tra lịch sử giá: ${err.message}`);
  }
};

/**
 * Chèn giá tham chiếu ban đầu khi niêm yết cổ phiếu.
 * Tự động tính giá trần/sàn dựa trên giá tham chiếu.
 * @param {string} maCP Mã cổ phiếu.
 * @param {number} giaTC Giá tham chiếu ban đầu.
 * @returns {Promise<object>} Bản ghi giá vừa chèn.
 */
LichSuGia.insertInitialPrice = async (maCP, giaTC) => {
  const bienDoTran = 0.1; // Lấy từ config hoặc để cố định ở đây
  const bienDoSan = 0.1;
  const buocGia = 100;

  // Tính toán giá trần/sàn và làm tròn
  const giaTran = Math.floor((giaTC * (1 + bienDoTran)) / buocGia) * buocGia;
  const giaSan = Math.ceil((giaTC * (1 - bienDoSan)) / buocGia) * buocGia;
  const ngayHienTai = new Date(); // Lấy ngày hiện tại (phần date sẽ được SQL xử lý)

  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP_ins", sql.NVarChar(10), maCP);
    request.input("Ngay_ins", sql.Date, ngayHienTai); // Chỉ cần Date
    request.input("GiaTran_ins", sql.Float, giaTran);
    request.input("GiaSan_ins", sql.Float, giaSan);
    request.input("GiaTC_ins", sql.Float, giaTC);

    // Dùng MERGE để xử lý trường hợp giá ngày hôm đó đã tồn tại (ghi đè)
    const query = `
    MERGE LICHSUGIA AS target
    USING (SELECT @MaCP_ins AS MaCP, @Ngay_ins AS Ngay) AS source
    ON (target.MaCP = source.MaCP AND target.Ngay = source.Ngay)
    WHEN MATCHED THEN
        UPDATE SET GiaTran = @GiaTran_ins, GiaSan = @GiaSan_ins, GiaTC = @GiaTC_ins,
                   GiaMoCua = NULL, GiaCaoNhat = NULL, GiaThapNhat = NULL, GiaDongCua = NULL -- Reset OHLC nếu ghi đè
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (MaCP, Ngay, GiaTran, GiaSan, GiaTC, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua)
        VALUES (@MaCP_ins, @Ngay_ins, @GiaTran_ins, @GiaSan_ins, @GiaTC_ins, NULL, NULL, NULL, NULL)
    OUTPUT INSERTED.*;
`;

    const result = await request.query(query);
    console.log(
      `Inserted/Updated initial price for ${maCP} on ${ngayHienTai
        .toISOString()
        .slice(0, 10)}`
    );
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error inserting initial price for ${maCP}:`, err);
    if (err.number === 547) {
      // Lỗi FK nếu MaCP không tồn tại trong COPHIEU
      throw new Error(
        `Lỗi chèn giá ban đầu: Mã cổ phiếu '${maCP}' không tồn tại.`
      );
    }
    throw new Error(`Lỗi khi chèn giá ban đầu: ${err.message}`);
  }
};

// Các hàm khác CRUD cho LichSuGia có thể thêm ở đây nếu cần (vd: do Nhân viên cập nhật)
/**
 * Cập nhật các giá OHLC và giá đóng cửa tạm thời trong ngày.
 * Được gọi bên trong transaction của khớp lệnh.
 * @param {object} transactionRequest Đối tượng request của transaction đang chạy.
 * @param {string} maCP Mã cổ phiếu.
 * @param {Date} ngay Ngày giao dịch hiện tại (kiểu Date).
 * @param {number} khopPrice Giá khớp của giao dịch vừa xảy ra.
 * @returns {Promise<boolean>} True nếu thành công (hoặc không có gì để làm), false nếu lỗi.
 */
LichSuGia.updateOHLCPrice = async (
  transactionRequest,
  maCP,
  ngay,
  khopPrice
) => {
  try {
    // Đặt tên input động
    const suffix = `${maCP}_ohlc_${Date.now()}`;
    transactionRequest.input(`MaCP_ohlc_${suffix}`, sql.NVarChar(10), maCP);
    transactionRequest.input(`Ngay_ohlc_${suffix}`, sql.Date, ngay);
    transactionRequest.input(`KhopPrice_ohlc_${suffix}`, sql.Float, khopPrice);

    // Dùng MERGE để vừa UPDATE vừa khởi tạo giá trị nếu NULL
    const query = `
          MERGE LICHSUGIA AS target
          USING (SELECT @MaCP_ohlc_${suffix} AS MaCP, @Ngay_ohlc_${suffix} AS Ngay) AS source
          ON (target.MaCP = source.MaCP AND target.Ngay = source.Ngay)
          WHEN MATCHED THEN
              UPDATE SET
                  -- Cập nhật GiaMoCua nếu đang NULL
                  GiaMoCua = ISNULL(target.GiaMoCua, @KhopPrice_ohlc_${suffix}),
                  -- Cập nhật GiaCaoNhat nếu giá khớp mới cao hơn hoặc GiaCaoNhat đang NULL
                  GiaCaoNhat = CASE
                                   WHEN target.GiaCaoNhat IS NULL THEN @KhopPrice_ohlc_${suffix}
                                   WHEN @KhopPrice_ohlc_${suffix} > target.GiaCaoNhat THEN @KhopPrice_ohlc_${suffix}
                                   ELSE target.GiaCaoNhat
                               END,
                  -- Cập nhật GiaThapNhat nếu giá khớp mới thấp hơn hoặc GiaThapNhat đang NULL
                  GiaThapNhat = CASE
                                   WHEN target.GiaThapNhat IS NULL THEN @KhopPrice_ohlc_${suffix}
                                   WHEN @KhopPrice_ohlc_${suffix} < target.GiaThapNhat THEN @KhopPrice_ohlc_${suffix}
                                   ELSE target.GiaThapNhat
                                END,
                  -- Luôn cập nhật GiaDongCua (tạm thời) bằng giá khớp mới nhất
                  GiaDongCua = @KhopPrice_ohlc_${suffix}
          -- Không xử lý WHEN NOT MATCHED vì giá ngày đó phải được tạo trước
          ;
      `;
    await transactionRequest.query(query);
    return true;
  } catch (err) {
    console.error(`SQL error updating OHLC for ${maCP} on ${ngay}:`, err);
    // Không nên throw lỗi ở đây để không rollback transaction khớp lệnh
    // throw new Error(`Lỗi cập nhật giá OHLC: ${err.message}`);
    return false; // Chỉ báo lỗi
  }
};

// Hàm lấy đủ thông tin OHLC cho một ngày (dùng cho ATC trigger)
/**
 * Lấy đầy đủ thông tin giá OHLC, TC, Trần, Sàn cho một mã CP vào một ngày cụ thể.
 * @param {string} maCP Mã cổ phiếu.
 * @param {Date} ngay Ngày cần lấy thông tin (kiểu Date).
 * @returns {Promise<object|null>} Object chứa thông tin giá hoặc null nếu không tìm thấy.
 */
LichSuGia.getOHLCPriceInfo = async (maCP, ngay) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NVarChar(10), maCP);
    request.input("Ngay", sql.Date, ngay);
    const query = `
          SELECT GiaTC, GiaTran, GiaSan, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua
          FROM LICHSUGIA
          WHERE MaCP = @MaCP AND Ngay = @Ngay;
      `;
    const result = await request.query(query);
    return result.recordset[0] || null; // Trả về object hoặc undefined
  } catch (err) {
    console.error(`SQL error getting OHLC info for ${maCP} on ${ngay}:`, err);
    throw new Error(`Lỗi lấy thông tin giá OHLC: ${err.message}`);
  }
};

/**
 * Lấy lịch sử giá OHLC và các thông tin khác của một mã CP trong khoảng thời gian.
 * @param {string} maCP Mã cổ phiếu.
 * @param {Date} tuNgay Ngày bắt đầu.
 * @param {Date} denNgay Ngày kết thúc.
 * @returns {Promise<Array<object>>} Mảng lịch sử giá, sắp xếp theo ngày giảm dần.
 */
LichSuGia.getHistoryByMaCP = async (maCP, tuNgay, denNgay) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NVarChar(10), maCP);
    // Convert Date objects to string format suitable for SQL DATE comparison if needed,
    // or pass Date objects directly if driver handles it. Using Date objects is safer.
    const startDate = new Date(tuNgay);
    startDate.setHours(0, 0, 0, 0);
    request.input("TuNgay", sql.Date, startDate); // Use Date type
    const endDate = new Date(denNgay);
    endDate.setHours(0, 0, 0, 0); // Use Date type
    request.input("DenNgay", sql.Date, endDate);

    // Lấy tất cả các cột giá từ LICHSUGIA
    const query = `
          SELECT
              Ngay,
              GiaTC,
              GiaTran,
              GiaSan,
              GiaMoCua,
              GiaCaoNhat,
              GiaThapNhat,
              GiaDongCua
              -- Thêm khối lượng khớp nếu muốn (cần JOIN với LENHKHOP và tính SUM)
              --,(SELECT SUM(lk.SoLuongKhop)
              --  FROM LENHKHOP lk JOIN LENHDAT ld ON lk.MaGD=ld.MaGD
              --  WHERE ld.MaCP = lg.MaCP AND CAST(lk.NgayGioKhop AS DATE) = lg.Ngay
              -- ) AS KhoiLuongKhopNgay -- Query này có thể chậm nếu LICHSUGIA lớn
          FROM LICHSUGIA lg -- Alias bảng để dùng trong subquery nếu có
          WHERE MaCP = @MaCP
            AND Ngay >= @TuNgay
            AND Ngay <= @DenNgay
          ORDER BY Ngay DESC; -- Sắp xếp ngày mới nhất trước
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(`SQL error getting price history for ${maCP}:`, err);
    throw new AppError(`Lỗi khi lấy lịch sử giá cho ${maCP}.`, 500);
  }
};

/**
 * Lấy lịch sử giá OHLC và các thông tin khác của một mã CP
 * trong N ngày gần nhất tính từ ngày hiện tại.
 * @param {string} maCP Mã cổ phiếu.
 * @param {number} numberOfDays Số ngày gần nhất cần lấy (ví dụ: 7, 30, 365).
 * @returns {Promise<Array<object>>} Mảng lịch sử giá, sắp xếp theo ngày giảm dần.
 */
LichSuGia.getRecentHistoryByMaCP = async (maCP, numberOfDays = 30) => {
  // Mặc định 30 ngày
  if (numberOfDays <= 0) numberOfDays = 30; // Đảm bảo số ngày dương

  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NVarChar(10), maCP);
    request.input("NumberOfDays", sql.Int, numberOfDays);

    // Lấy ngày hiện tại của SQL Server
    // Không cần truyền ngày từ Node.js
    const query = `
          DECLARE @EndDate DATE = CAST(GETDATE() AS DATE);
          -- Tính ngày bắt đầu bằng cách trừ đi số ngày (trừ 1 vì bao gồm cả ngày hiện tại)
          DECLARE @StartDate DATE = DATEADD(day, -(@NumberOfDays - 1), @EndDate);

          SELECT TOP (@NumberOfDays) -- Lấy tối đa số ngày yêu cầu
              Ngay, GiaTC, GiaTran, GiaSan, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua
              -- Thêm khối lượng nếu cần và đã tối ưu
          FROM LICHSUGIA
          WHERE MaCP = @MaCP
            AND Ngay BETWEEN @StartDate AND @EndDate -- Lọc trong khoảng ngày tính được
          ORDER BY Ngay DESC; -- Sắp xếp ngày mới nhất trước
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(
      `SQL error getting recent price history for ${maCP} (last ${numberOfDays} days):`,
      err
    );
    throw new AppError(
      `Lỗi khi lấy lịch sử giá ${numberOfDays} ngày gần nhất cho ${maCP}.`,
      500
    );
  }
};

module.exports = LichSuGia;
