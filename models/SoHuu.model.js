/**
 * models/SoHuu.model.js
 * Quản lý sở hữu cổ phiếu của nhà đầu tư.
 */
const sql = require('mssql');
const db = require('./db');
const AppError = require('../utils/errors/AppError');

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
    request.input('MaNDT', sql.NChar(20), maNDT);

    const queryGetDate = 'SELECT CAST(GETDATE() AS DATE) as TodayDate';
    const dateResult = await pool.request().query(queryGetDate);
    if (!dateResult.recordset || dateResult.recordset.length === 0) {
      throw new AppError('Không thể lấy ngày hiện tại từ server.', 500);
    }
    const today = dateResult.recordset[0].TodayDate;
    request.input('NgayHienTai', sql.Date, today);

    const query = `
          WITH GiaGanNhat AS (
              SELECT
                  MaCP,
                  COALESCE(GiaDongCua, GiaMoCua, GiaTC) AS GiaHienTai
              FROM LICHSUGIA
              WHERE Ngay = @NgayHienTai
          )
          SELECT
              sh.MaCP,
              cp.TenCty,
              sh.SoLuong,
              ISNULL(gnn.GiaHienTai, 0) AS GiaKhopCuoi
          FROM SOHUU sh
          JOIN COPHIEU cp ON sh.MaCP = cp.MaCP
          LEFT JOIN GiaGanNhat gnn ON sh.MaCP = gnn.MaCP
          WHERE sh.MaNDT = @MaNDT
            AND sh.SoLuong > 0
            AND cp.Status = 1
          ORDER BY sh.MaCP;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(`SQL error finding SoHuu by MaNDT ${maNDT}:`, err);
    throw new AppError(
      `Lỗi khi lấy danh mục sở hữu cho NĐT ${maNDT}: ${err.message}`,
      500
    );
  }
};

/**
 * Hàm lấy số lượng sở hữu của một cổ phiếu cụ thể cho NDT
 */
SoHuu.getSoLuong = async (maNDT, maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    request.input('MaCP', sql.NVarChar(10), maCP);

    const query = `
            SELECT SoLuong
            FROM SOHUU
            WHERE MaNDT = @MaNDT AND MaCP = @MaCP;
        `;
    const result = await request.query(query);
    return result.recordset.length > 0 ? result.recordset[0].SoLuong : 0;
  } catch (err) {
    console.error('SQL error getting SoLuong from SoHuu', err);
    throw new AppError(`Lỗi khi lấy số lượng sở hữu CP ${maCP}.`, 500);
  }
};

/**
 * Hàm cập nhật hoặc thêm mới sở hữu (Dùng khi khớp lệnh Mua/Bán)
 */
SoHuu.upsert = async (maNDT, maCP, soLuongThayDoi) => {
  try {
    const currentSoLuong = await SoHuu.getSoLuong(maNDT, maCP);
    const newSoLuong = currentSoLuong + soLuongThayDoi;

    if (newSoLuong < 0) {
      throw new Error(`Số lượng sở hữu không thể âm cho ${maNDT} - ${maCP}`);
    }

    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaNDT', sql.NChar(20), maNDT);
    request.input('MaCP', sql.NChar(10), maCP);
    request.input('NewSoLuong', sql.Int, newSoLuong);

    if (currentSoLuong > 0 || (currentSoLuong === 0 && newSoLuong > 0)) {
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
    }

    return { MaCP: maCP, SoLuong: newSoLuong };
  } catch (err) {
    console.error('SQL error upserting SoHuu', err);
    throw err;
  }
};

/**
 * Hàm cập nhật số lượng sở hữu (dùng trong transaction)
 * quantityChange có thể là số dương (mua) hoặc số âm (bán)
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
    return true;
  }
  const inputSuffix = `${maNDT}_${maCP}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const maNDTInput = `MaNDT_sohuu_${inputSuffix}`;
  const maCPInput = `MaCP_sohuu_${inputSuffix}`;
  const quantityChangeInput = `QuantityChange_${inputSuffix}`;
  try {
    transactionRequest.input(maNDTInput, sql.NChar(20), maNDT);
    transactionRequest.input(maCPInput, sql.NChar(10), maCP);
    transactionRequest.input(quantityChangeInput, sql.Int, quantityChange);

    const query = `
                     BEGIN TRY
                MERGE SOHUU AS target
                USING (SELECT @${maNDTInput} AS MaNDT, @${maCPInput} AS MaCP) AS source
                ON (target.MaNDT = source.MaNDT AND target.MaCP = source.MaCP)
                WHEN MATCHED THEN
                    UPDATE SET target.SoLuong = CASE
                                                    WHEN target.SoLuong + @${quantityChangeInput} >= 0 THEN target.SoLuong + @${quantityChangeInput}
                                                    ELSE target.SoLuong
                                                END
                WHEN NOT MATCHED BY TARGET AND @${quantityChangeInput} > 0 THEN
                    INSERT (MaNDT, MaCP, SoLuong)
                    VALUES (@${maNDTInput}, @${maCPInput}, @${quantityChangeInput});

                IF @@ROWCOUNT = 0
                   AND @${quantityChangeInput} < 0
                   AND EXISTS (SELECT 1 FROM SOHUU WHERE MaNDT = @${maNDTInput} AND MaCP = @${maCPInput})
                BEGIN
                   DECLARE @CurrentSoLuong INT;
                   SELECT @CurrentSoLuong = SoLuong FROM SOHUU WHERE MaNDT = @${maNDTInput} AND MaCP = @${maCPInput};
                   DECLARE @ErrorMsg NVARCHAR(300) = FORMATMESSAGE(N'Không thể trừ %d cổ phiếu %s cho NDT %s. Số lượng sở hữu hiện tại (%d) không đủ.', ABS(@${quantityChangeInput}), @${maCPInput}, @${maNDTInput}, @CurrentSoLuong);
                   THROW 50001, @ErrorMsg, 1;
                END
                ELSE IF @@ROWCOUNT = 0
                   AND @${quantityChangeInput} < 0
                   AND NOT EXISTS (SELECT 1 FROM SOHUU WHERE MaNDT = @${maNDTInput} AND MaCP = @${maCPInput})
                BEGIN
                    DECLARE @ErrorMsgNotExist NVARCHAR(300) = FORMATMESSAGE(N'Không thể bán cổ phiếu %s cho NDT %s. Không có bản ghi sở hữu.', @${maCPInput}, @${maNDTInput});
                    THROW 50002, @ErrorMsgNotExist, 1;
                END;

            END TRY
            BEGIN CATCH
                THROW;
            END CATCH
        `;
    await transactionRequest.query(query);
    return true;
  } catch (err) {
    console.error(
      `SQL error updating SoHuu quantity for ${maNDT}, ${maCP}`,
      err
    );
    if (err.number === 50001) {
      throw new Error(err.message);
    }
    throw err;
  }
};

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
    return true;
  }
  const suffix = `${maNDT}_${maCP}_${Date.now()}`;
  const maNDTInput = `MaNDT_sohuu_${suffix}`;
  const maCPInput = `MaCP_sohuu_${suffix}`;
  const quantityInput = `QuantityAdd_${suffix}`;

  try {
    transactionRequest.input(maNDTInput, sql.NChar(20), maNDT);
    transactionRequest.input(maCPInput, sql.NVarChar(10), maCP);
    transactionRequest.input(quantityInput, sql.Int, quantityToAdd);

    const query = `
          MERGE INTO dbo.SOHUU AS Target
          USING (SELECT @${maNDTInput} AS MaNDT, @${maCPInput} AS MaCP) AS Source
          ON (Target.MaNDT = Source.MaNDT AND Target.MaCP = Source.MaCP)
          WHEN MATCHED THEN
              UPDATE SET Target.SoLuong = Target.SoLuong + @${quantityInput}
          WHEN NOT MATCHED BY TARGET THEN
              INSERT (MaNDT, MaCP, SoLuong)
              VALUES (Source.MaNDT, Source.MaCP, @${quantityInput});
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
    if (err.number === 547) {
      if (err.message.includes('FK_SOHUU_NDT'))
        throw new Error(`Lỗi sở hữu: Mã NĐT '${maNDT}' không tồn tại.`);
      if (err.message.includes('FK_SOHUU_CP'))
        throw new Error(`Lỗi sở hữu: Mã CP '${maCP}' không tồn tại.`);
    }
    if (err.number === 547 && err.message.includes('CK_SOHUU_SoLuong')) {
      throw new Error(
        `Lỗi sở hữu: Số lượng không hợp lệ cho ${maNDT}-${maCP}.`
      );
    }
    throw new Error(`Lỗi cập nhật sở hữu cho ${maNDT}-${maCP}: ${err.message}`);
  }
};

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
  if (quantityChange === 0) return true;

  const suffix = `${maNDT}_${maCP}_${Date.now()}`;
  const maNDTInput = `MaNDT_sohuu_${suffix}`;
  const maCPInput = `MaCP_sohuu_${suffix}`;
  const quantityChangeInput = `QuantityChange_${suffix}`;

  try {
    transactionRequest.input(maNDTInput, sql.NChar(20), maNDT);
    transactionRequest.input(maCPInput, sql.NVarChar(10), maCP);
    transactionRequest.input(quantityChangeInput, sql.Int, quantityChange);

    const query = `
          MERGE INTO dbo.SOHUU AS Target
          USING (SELECT @${maNDTInput} AS MaNDT, @${maCPInput} AS MaCP) AS Source
          ON (Target.MaNDT = Source.MaNDT AND Target.MaCP = Source.MaCP)
          WHEN MATCHED AND Target.SoLuong + @${quantityChangeInput} > 0 THEN
              UPDATE SET Target.SoLuong = Target.SoLuong + @${quantityChangeInput}
          WHEN MATCHED AND Target.SoLuong + @${quantityChangeInput} <= 0 THEN
              DELETE
          WHEN NOT MATCHED BY TARGET AND @${quantityChangeInput} > 0 THEN
              INSERT (MaNDT, MaCP, SoLuong)
              VALUES (Source.MaNDT, Source.MaCP, @${quantityChangeInput})
          ;
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
      if (err.message.includes('FK_SOHUU_NDT'))
        throw new Error(`Lỗi sở hữu: Mã NĐT '${maNDT}' không tồn tại.`);
      if (err.message.includes('FK_SOHUU_CP'))
        throw new Error(`Lỗi sở hữu: Mã CP '${maCP}' không tồn tại.`);
      if (err.message.includes('CK_SOHUU_SoLuong')) {
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
    request.input('MaCP', sql.NVarChar(10), maCP);

    const query = `
          SELECT
              sh.MaNDT,
              ndt.HoTen AS TenNDT,
              ndt.Email,
              ndt.Phone,
              sh.SoLuong
          FROM SOHUU sh
          JOIN NDT ndt ON sh.MaNDT = ndt.MaNDT
          WHERE sh.MaCP = @MaCP AND sh.SoLuong > 0
          ORDER BY ndt.HoTen;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error(`SQL error finding shareholders for ${maCP}:`, err);
    throw new AppError(`Lỗi khi lấy danh sách cổ đông cho ${maCP}.`, 500);
  }
};

module.exports = SoHuu;
