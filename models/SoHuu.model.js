// models/SoHuu.model.js
const sql = require("mssql");
const db = require("./db");
const AppError = require("../utils/errors/AppError");

const SoHuu = {};

// Hàm lấy danh mục sở hữu của một Nhà đầu tư (chỉ lấy SL > 0)
SoHuu.findByMaNDT = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);

    // Join với COPHIEU để lấy tên công ty
    const query = `
            SELECT sh.MaCP, cp.TenCty, sh.SoLuong
            FROM SOHUU sh
            JOIN COPHIEU cp ON sh.MaCP = cp.MaCP
            WHERE sh.MaNDT = @MaNDT AND sh.SoLuong > 0
            ORDER BY sh.MaCP;
        `;
    const result = await request.query(query);
    return result.recordset; // Trả về mảng các cổ phiếu sở hữu
  } catch (err) {
    console.error("SQL error finding SoHuu by MaNDT", err);
    throw err;
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
};

module.exports = SoHuu;
