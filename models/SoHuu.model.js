// models/SoHuu.model.js
const sql = require("mssql");
const db = require("./db");
const AppError = require("../utils/errors/AppError");

const SoHuu = {};

/**
 * Lấy danh mục sở hữu của một Nhà đầu tư (chỉ lấy SL > 0).
 * Bao gồm Tên công ty và Giá khớp/đóng cửa gần nhất của ngày hiện tại.
 * @param {string} maNDT Mã nhà đầu tư.
 * @returns {Promise<Array<object>>} Mảng các cổ phiếu sở hữu kèm giá.
 */
SoHuu.findByMaNDT = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);

    // Lấy ngày hiện tại của SQL Server để lấy giá mới nhất
    const queryGetDate = "SELECT CAST(GETDATE() AS DATE) as TodayDate";
    const dateResult = await pool.request().query(queryGetDate);
    // Kiểm tra nếu không có ngày trả về (trường hợp cực hiếm)
    if (!dateResult.recordset || dateResult.recordset.length === 0) {
      throw new AppError("Không thể lấy ngày hiện tại từ server.", 500);
    }
    const today = dateResult.recordset[0].TodayDate;
    request.input("NgayHienTai", sql.Date, today);

    // Query chính: Join SOHUU, COPHIEU và LICHSUGIA của ngày hiện tại
    const query = `
          -- CTE để lấy giá mới nhất (Giá đóng cửa hoặc Giá TC nếu chưa có đóng cửa)
          WITH GiaGanNhat AS (
              SELECT
                  MaCP,
                  -- Ưu tiên GiaDongCua, rồi GiaMoCua (nếu khớp ATO mà chưa có khớp LT), rồi GiaTC
                  COALESCE(GiaDongCua, GiaMoCua, GiaTC) AS GiaHienTai
              FROM LICHSUGIA
              WHERE Ngay = @NgayHienTai -- Chỉ lấy giá của ngày hôm nay
          )
          SELECT
              sh.MaCP,
              cp.TenCty,
              sh.SoLuong,
              ISNULL(gnn.GiaHienTai, 0) AS GiaKhopCuoi -- Lấy giá từ CTE, trả về 0 nếu CP chưa có giá hôm nay
          FROM SOHUU sh
          JOIN COPHIEU cp ON sh.MaCP = cp.MaCP
          LEFT JOIN GiaGanNhat gnn ON sh.MaCP = gnn.MaCP -- LEFT JOIN để vẫn lấy được CP dù chưa có giá hôm nay
          WHERE sh.MaNDT = @MaNDT        -- Lọc theo NĐT
            AND sh.SoLuong > 0         -- Chỉ lấy CP đang sở hữu
            AND cp.Status = 1          -- Chỉ lấy CP đang giao dịch
          ORDER BY sh.MaCP;
      `;
    const result = await request.query(query);
    return result.recordset; // Trả về mảng các cổ phiếu sở hữu kèm giá
  } catch (err) {
    console.error(`SQL error finding SoHuu by MaNDT ${maNDT}:`, err);
    // Ném lỗi AppError để errorHandler xử lý
    throw new AppError(
      `Lỗi khi lấy danh mục sở hữu cho NĐT ${maNDT}: ${err.message}`,
      500
    );
  }
};

// Hàm lấy số lượng sở hữu của một cổ phiếu cụ thể cho NDT
SoHuu.getSoLuong = async (maNDT, maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
    request.input("MaCP", sql.NVarChar(10), maCP);

    const query = `
            SELECT SoLuong
            FROM SOHUU
            WHERE MaNDT = @MaNDT AND MaCP = @MaCP;
        `;
    const result = await request.query(query);
    // Trả về số lượng hoặc 0 nếu không tìm thấy bản ghi
    return result.recordset.length > 0 ? result.recordset[0].SoLuong : 0;
  } catch (err) {
    console.error("SQL error getting SoLuong from SoHuu", err);
    throw new AppError(`Lỗi khi lấy số lượng sở hữu CP ${maCP}.`, 500);
  }
};

// Hàm cập nhật hoặc thêm mới sở hữu (Dùng khi khớp lệnh Mua/Bán)
// Sẽ hoàn thiện khi làm chức năng khớp lệnh, tạm thời để đây
SoHuu.upsert = async (maNDT, maCP, soLuongThayDoi) => {
  // Logic này sẽ phức tạp hơn, cần dùng transaction
  // 1. Kiểm tra xem bản ghi đã tồn tại chưa
  // 2. Nếu tồn tại: UPDATE SoLuong = SoLuong + soLuongThayDoi
  // 3. Nếu chưa tồn tại và soLuongThayDoi > 0: INSERT mới
  // 4. Đảm bảo SoLuong >= 0
  console.warn(
    `SoHuu.upsert for ${maNDT}, ${maCP}, ${soLuongThayDoi} needs implementation.`
  );
  // Placeholder implementation (không an toàn, cần transaction và xử lý đúng)
  try {
    const currentSoLuong = await SoHuu.getSoLuong(maNDT, maCP);
    const newSoLuong = currentSoLuong + soLuongThayDoi;

    if (newSoLuong < 0) {
      throw new Error(`Số lượng sở hữu không thể âm cho ${maNDT} - ${maCP}`);
    }

    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
    request.input("MaCP", sql.NChar(10), maCP);
    request.input("NewSoLuong", sql.Int, newSoLuong);

    if (currentSoLuong > 0 || (currentSoLuong === 0 && newSoLuong > 0)) {
      // Update if exists or insert if creating with positive amount
      const query = `
                MERGE SOHUU AS target
                USING (SELECT @MaNDT AS MaNDT, @MaCP AS MaCP) AS source
                ON (target.MaNDT = source.MaNDT AND target.MaCP = source.MaCP)
                WHEN MATCHED THEN
                    UPDATE SET SoLuong = @NewSoLuong
                WHEN NOT MATCHED BY TARGET THEN
                    INSERT (MaNDT, MaCP, SoLuong)
                    VALUES (@MaNDT, @MaCP, @NewSoLuong);
            `;
      await request.query(query);
    } else if (currentSoLuong === 0 && newSoLuong === 0) {
      // No change needed if it doesn't exist and remains 0
    }

    return { MaCP: maCP, SoLuong: newSoLuong };
  } catch (err) {
    console.error("SQL error upserting SoHuu", err);
    throw err;
  }
};

// Hàm cập nhật số lượng sở hữu (dùng trong transaction)
// quantityChange có thể là số dương (mua) hoặc số âm (bán)
/**
 * Cập nhật số lượng sở hữu (dùng trong transaction).
 * Sử dụng MERGE để xử lý INSERT/UPDATE và kiểm tra số lượng âm.
 * @param {object} transactionRequest Đối tượng request của transaction
 * @param {string} maNDT Mã nhà đầu tư
 * @param {string} maCP Mã cổ phiếu
 * @param {number} quantityChange Số lượng thay đổi (+ cho mua, - cho bán)
 * @returns {Promise<boolean>} True nếu thành công
 */
SoHuu.updateQuantity = async (
  transactionRequest,
  maNDT,
  maCP,
  quantityChange
) => {
  if (quantityChange === 0) {
    console.warn(
      `Attempted to update SoHuu with zero quantity change for ${maNDT}, ${maCP}. Skipping.`
    );
    return true; // Không cần làm gì
  }
  // Tên input động
  const inputSuffix = `${maNDT}_${maCP}`.replace(/[^a-zA-Z0-9_]/g, "_");
  const maNDTInput = `MaNDT_sohuu_${inputSuffix}`;
  const maCPInput = `MaCP_sohuu_${inputSuffix}`;
  const quantityChangeInput = `QuantityChange_${inputSuffix}`;
  try {
    // Sử dụng tên input duy nhất để tránh xung đột
    transactionRequest.input(maNDTInput, sql.NChar(20), maNDT);
    transactionRequest.input(maCPInput, sql.NChar(10), maCP);
    transactionRequest.input(quantityChangeInput, sql.Int, quantityChange);

    // Sử dụng MERGE để xử lý cả INSERT và UPDATE
    // Quan trọng: Kiểm tra SoLuong + @QuantityChange >= 0 trước khi update
    const query = `
                     BEGIN TRY
                MERGE SOHUU AS target
                USING (SELECT @${maNDTInput} AS MaNDT, @${maCPInput} AS MaCP) AS source
                ON (target.MaNDT = source.MaNDT AND target.MaCP = source.MaCP)
                WHEN MATCHED THEN
                    -- Chỉ update nếu kết quả không âm
                    UPDATE SET target.SoLuong = CASE
                                                    WHEN target.SoLuong + @${quantityChangeInput} >= 0 THEN target.SoLuong + @${quantityChangeInput}
                                                    ELSE target.SoLuong -- Giữ nguyên nếu sẽ âm (lỗi sẽ được bắt sau)
                                                END
                WHEN NOT MATCHED BY TARGET AND @${quantityChangeInput} > 0 THEN
                    -- Chỉ insert nếu là mua và chưa có bản ghi
                    INSERT (MaNDT, MaCP, SoLuong)
                    VALUES (@${maNDTInput}, @${maCPInput}, @${quantityChangeInput});

                -- Kiểm tra sau MERGE xem có phải trường hợp update thất bại do số lượng âm không
                IF @@ROWCOUNT = 0 -- MERGE không update/insert gì cả
                   AND @${quantityChangeInput} < 0 -- Và đây là lệnh bán
                   AND EXISTS (SELECT 1 FROM SOHUU WHERE MaNDT = @${maNDTInput} AND MaCP = @${maCPInput}) -- Và bản ghi tồn tại
                BEGIN
                   -- Lấy số lượng hiện tại để đưa vào thông báo lỗi
                   DECLARE @CurrentSoLuong INT;
                   SELECT @CurrentSoLuong = SoLuong FROM SOHUU WHERE MaNDT = @${maNDTInput} AND MaCP = @${maCPInput};
                   DECLARE @ErrorMsg NVARCHAR(300) = FORMATMESSAGE(N'Không thể trừ %d cổ phiếu %s cho NDT %s. Số lượng sở hữu hiện tại (%d) không đủ.', ABS(@${quantityChangeInput}), @${maCPInput}, @${maNDTInput}, @CurrentSoLuong);
                   THROW 50001, @ErrorMsg, 1;
                END
                ELSE IF @@ROWCOUNT = 0 -- MERGE không update/insert gì cả
                   AND @${quantityChangeInput} < 0 -- Và đây là lệnh bán
                   AND NOT EXISTS (SELECT 1 FROM SOHUU WHERE MaNDT = @${maNDTInput} AND MaCP = @${maCPInput}) -- Và bản ghi không tồn tại
                BEGIN
                    -- Trường hợp bán cổ phiếu không sở hữu (không có bản ghi)
                    DECLARE @ErrorMsgNotExist NVARCHAR(300) = FORMATMESSAGE(N'Không thể bán cổ phiếu %s cho NDT %s. Không có bản ghi sở hữu.', @${maCPInput}, @${maNDTInput});
                    THROW 50002, @ErrorMsgNotExist, 1;
                END;

            END TRY
            BEGIN CATCH
                -- Ném lại lỗi gốc hoặc lỗi tùy chỉnh
                THROW;
            END CATCH
        `;
    await transactionRequest.query(query);
    return true; // Trả về true nếu thành công
  } catch (err) {
    console.error(
      `SQL error updating SoHuu quantity for ${maNDT}, ${maCP}`,
      err
    );
    // Kiểm tra lỗi tùy chỉnh từ THROW
    if (err.number === 50001) {
      throw new Error(err.message); // Ném lại lỗi số lượng âm
    }
    throw err; // Ném lỗi khác để transaction rollback
  }
}; // => có thể cải thiện sử dụng nham để đảm bảo luồng đi đúng đắn thì chưa cần

// // Hàm updateQuantity cũ (dùng trong khớp lệnh) giờ nên gọi hàm mới này
// SoHuu.updateQuantity = async (transactionRequest, maNDT, maCP, quantityChange) => {
//   // Gọi hàm mới để xử lý cả tăng, giảm, xóa về 0
//   return await SoHuu.updateOrDeleteQuantity(transactionRequest, maNDT, maCP, quantityChange);
// };

/**
 * Tăng số lượng sở hữu cho NĐT và CP cụ thể.
 * Tự động INSERT nếu chưa có bản ghi. Dùng MERGE cho hiệu quả.
 * Hàm này NÊN được gọi bên trong một transaction ở Service.
 * @param {object} transactionRequest Đối tượng request của transaction.
 * @param {string} maNDT Mã nhà đầu tư.
 * @param {string} maCP Mã cổ phiếu.
 * @param {number} quantityToAdd Số lượng cần cộng thêm (phải dương).
 * @returns {Promise<boolean>} True nếu thành công.
 */
SoHuu.upsertOrIncreaseQuantity = async (
  transactionRequest,
  maNDT,
  maCP,
  quantityToAdd
) => {
  if (quantityToAdd <= 0) {
    console.warn(
      `[SOHUU Upsert] Attempted to add non-positive quantity (${quantityToAdd}) for ${maNDT}-${maCP}. Skipping.`
    );
    return true; // Coi như thành công vì không có gì để làm
  }
  // Đặt tên input động
  const suffix = `${maNDT}_${maCP}_${Date.now()}`;
  const maNDTInput = `MaNDT_sohuu_${suffix}`;
  const maCPInput = `MaCP_sohuu_${suffix}`;
  const quantityInput = `QuantityAdd_${suffix}`;

  try {
    transactionRequest.input(maNDTInput, sql.NChar(20), maNDT);
    transactionRequest.input(maCPInput, sql.NVarChar(10), maCP);
    transactionRequest.input(quantityInput, sql.Int, quantityToAdd);

    // Dùng MERGE để vừa INSERT vừa UPDATE
    const query = `
          MERGE INTO dbo.SOHUU AS Target
          USING (SELECT @${maNDTInput} AS MaNDT, @${maCPInput} AS MaCP) AS Source
          ON (Target.MaNDT = Source.MaNDT AND Target.MaCP = Source.MaCP)
          WHEN MATCHED THEN
              -- Đã có bản ghi -> Cộng dồn số lượng
              UPDATE SET Target.SoLuong = Target.SoLuong + @${quantityInput}
          WHEN NOT MATCHED BY TARGET THEN
              -- Chưa có bản ghi -> Tạo mới
              INSERT (MaNDT, MaCP, SoLuong)
              VALUES (Source.MaNDT, Source.MaCP, @${quantityInput});
          -- Không cần OUTPUT ở đây trừ khi muốn lấy kết quả merge
      `;
    await transactionRequest.query(query);
    console.log(
      `[SOHUU Upsert] Updated quantity for ${maNDT}-${maCP} by +${quantityToAdd}`
    );
    return true;
  } catch (err) {
    console.error(
      `SQL error upserting/increasing SoHuu quantity for ${maNDT}-${maCP}:`,
      err
    );
    // Lỗi FK nếu MaNDT hoặc MaCP không tồn tại
    if (err.number === 547) {
      if (err.message.includes("FK_SOHUU_NDT"))
        throw new Error(`Lỗi sở hữu: Mã NĐT '${maNDT}' không tồn tại.`);
      if (err.message.includes("FK_SOHUU_CP"))
        throw new Error(`Lỗi sở hữu: Mã CP '${maCP}' không tồn tại.`);
    }
    // Lỗi Check constraint SoLuong < 0 (không nên xảy ra khi cộng)
    if (err.number === 547 && err.message.includes("CK_SOHUU_SoLuong")) {
      throw new Error(
        `Lỗi sở hữu: Số lượng không hợp lệ cho ${maNDT}-${maCP}.`
      );
    }
    throw new Error(`Lỗi cập nhật sở hữu cho ${maNDT}-${maCP}: ${err.message}`); // Ném lỗi để transaction rollback
  }
}; // ===> không dùng

/**
 * Cập nhật (Tăng/Giảm) hoặc Xóa số lượng sở hữu. Dùng cho Phân bổ/Thu hồi/Khớp lệnh.
 * Tự động INSERT nếu chưa có khi tăng. Tự động DELETE nếu về 0 khi giảm.
 * NÊN được gọi trong transaction ở Service.
 * @param {object} transactionRequest Đối tượng request của transaction.
 * @param {string} maNDT
 * @param {string} maCP
 * @param {number} quantityChange Số lượng thay đổi (+ để tăng, - để giảm).
 * @returns {Promise<boolean>} True nếu thành công.
 */
SoHuu.updateOrDeleteQuantity = async (
  transactionRequest,
  maNDT,
  maCP,
  quantityChange
) => {
  if (quantityChange === 0) return true; // Không làm gì

  // Đặt tên input động
  const suffix = `${maNDT}_${maCP}_${Date.now()}`;
  const maNDTInput = `MaNDT_sohuu_${suffix}`;
  const maCPInput = `MaCP_sohuu_${suffix}`;
  const quantityChangeInput = `QuantityChange_${suffix}`;

  try {
    transactionRequest.input(maNDTInput, sql.NChar(20), maNDT);
    transactionRequest.input(maCPInput, sql.NVarChar(10), maCP);
    transactionRequest.input(quantityChangeInput, sql.Int, quantityChange);

    // Dùng MERGE kết hợp kiểm tra số lượng âm và xóa nếu cần
    const query = `
          MERGE INTO dbo.SOHUU AS Target
          USING (SELECT @${maNDTInput} AS MaNDT, @${maCPInput} AS MaCP) AS Source
          ON (Target.MaNDT = Source.MaNDT AND Target.MaCP = Source.MaCP)
          WHEN MATCHED AND Target.SoLuong + @${quantityChangeInput} > 0 THEN
              -- Nếu khớp và kết quả > 0 -> Cập nhật số lượng
              UPDATE SET Target.SoLuong = Target.SoLuong + @${quantityChangeInput}
          WHEN MATCHED AND Target.SoLuong + @${quantityChangeInput} <= 0 THEN
              -- Nếu khớp và kết quả <= 0 -> Xóa bản ghi
              DELETE
          WHEN NOT MATCHED BY TARGET AND @${quantityChangeInput} > 0 THEN
              -- Nếu chưa có và đang tăng số lượng -> Thêm mới
              INSERT (MaNDT, MaCP, SoLuong)
              VALUES (Source.MaNDT, Source.MaCP, @${quantityChangeInput})
          ;

          -- Kiểm tra sau MERGE nếu là lệnh giảm mà không khớp (WHEN NOT MATCHED BY TARGET AND @quantityChangeInput < 0)
          -- Hoặc nếu số lượng không đủ (WHEN MATCHED AND Target.SoLuong + @quantityChangeInput < 0 nhưng DELETE không thành công?)
          -- Logic này phức tạp, tạm thời dựa vào constraint CHECK(SoLuong >= 0) và xử lý lỗi ở Service nếu cần.

      `;
    await transactionRequest.query(query);
    console.log(
      `[SOHUU Update/Delete] Updated quantity for ${maNDT}-${maCP} by ${quantityChange}`
    );
    return true;
  } catch (err) {
    console.error(
      `SQL error updating/deleting SoHuu quantity for ${maNDT}-${maCP}:`,
      err
    );
    if (err.number === 547) {
      // Lỗi FK hoặc Check Constraint
      if (err.message.includes("FK_SOHUU_NDT"))
        throw new Error(`Lỗi sở hữu: Mã NĐT '${maNDT}' không tồn tại.`);
      if (err.message.includes("FK_SOHUU_CP"))
        throw new Error(`Lỗi sở hữu: Mã CP '${maCP}' không tồn tại.`);
      if (err.message.includes("CK_SOHUU_SoLuong")) {
        // Lỗi này xảy ra khi cố gắng GIẢM nhiều hơn số lượng đang có
        throw new BadRequestError(
          `Số lượng sở hữu của NĐT ${maNDT} cho mã CP ${maCP} không đủ để giảm.`
        );
      }
    }
    throw new Error(
      `Lỗi cập nhật/xóa sở hữu cho ${maNDT}-${maCP}: ${err.message}`
    );
  }
};

/**
 * Lấy danh sách các Nhà đầu tư đang sở hữu một mã cổ phiếu cụ thể.
 * Bao gồm thông tin cơ bản của NĐT và số lượng sở hữu.
 * @param {string} maCP Mã cổ phiếu cần truy vấn.
 * @returns {Promise<Array<object>>} Mảng các cổ đông và số lượng.
 */
SoHuu.findShareholdersByMaCP = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaCP", sql.NVarChar(10), maCP);

    // Query join SOHUU với NDT để lấy thông tin
    const query = `
          SELECT
              sh.MaNDT,
              ndt.HoTen AS TenNDT,
              ndt.Email, -- Thêm thông tin NĐT nếu cần
              ndt.Phone,
              sh.SoLuong
          FROM SOHUU sh
          JOIN NDT ndt ON sh.MaNDT = ndt.MaNDT
          WHERE sh.MaCP = @MaCP AND sh.SoLuong > 0 -- Chỉ lấy người đang thực sự sở hữu
          ORDER BY ndt.HoTen; -- Sắp xếp theo tên NĐT
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(`SQL error finding shareholders for ${maCP}:`, err);
    throw new AppError(`Lỗi khi lấy danh sách cổ đông cho ${maCP}.`, 500);
  }
};

module.exports = SoHuu;
