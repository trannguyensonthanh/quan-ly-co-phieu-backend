const sql = require("mssql");
const db = require("./db");
const AppError = require("../utils/errors/AppError");
const TaiKhoanNganHang = {};

// Hàm tìm TKNH theo MaTK (Khóa chính)
TaiKhoanNganHang.findByMaTK = async (maTK) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaTK", sql.NChar(20), maTK);
    // Join với bảng NGANHANG để lấy tên NH
    const query = `
            SELECT tk.MaTK, tk.MaNDT, tk.SoTien, tk.MaNH, nh.TenNH
            FROM TAIKHOAN_NGANHANG tk
            LEFT JOIN NGANHANG nh ON tk.MaNH = nh.MaNH
            WHERE tk.MaTK = @MaTK
        `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error("SQL error finding TaiKhoanNganHang by MaTK", err);
    throw err;
  }
};

// Hàm tìm tất cả TKNH của một Nhà đầu tư (MaNDT)
TaiKhoanNganHang.findByMaNDT = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
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
    console.error("SQL error finding TaiKhoanNganHang by MaNDT", err);
    throw err;
  }
};

// Hàm tạo mới Tài khoản Ngân hàng cho NDT
TaiKhoanNganHang.create = async (newTKNHData) => {
  const { MaTK, MaNDT, SoTien, MaNH } = newTKNHData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaTK", sql.NChar(20), MaTK);
    request.input("MaNDT", sql.NChar(20), MaNDT);
    request.input("SoTien", sql.Float, SoTien);
    request.input("MaNH", sql.NChar(20), MaNH);

    const query = `
            INSERT INTO TAIKHOAN_NGANHANG (MaTK, MaNDT, SoTien, MaNH)
            VALUES (@MaTK, @MaNDT, @SoTien, @MaNH)
        `;
    await request.query(query);
    // Lấy lại thông tin vừa tạo kèm tên ngân hàng
    return await TaiKhoanNganHang.findByMaTK(MaTK);
  } catch (err) {
    console.error("SQL error creating TaiKhoanNganHang", err);
    if (err.number === 2627 || err.number === 2601) {
      // PK violation
      throw new Error(`Mã tài khoản '${MaTK}' đã tồn tại.`);
    }
    if (err.number === 547) {
      // FK violation
      if (err.message.includes("FK__TAIKHOAN___MaNDT")) {
        throw new Error(`Mã Nhà Đầu Tư '${MaNDT}' không tồn tại.`);
      }
      if (err.message.includes("FK__TAIKHOAN___MaNH")) {
        throw new Error(`Mã Ngân Hàng '${MaNH}' không tồn tại.`);
      }
    }
    throw err;
  }
};

// Hàm cập nhật Tài khoản Ngân hàng
TaiKhoanNganHang.updateByMaTK = async (maTK, tknhData) => {
  // Chỉ nên cho phép cập nhật các trường như MaNH, có thể cả SoTien (nhưng cẩn thận)
  // MaNDT không nên đổi.
  const { SoTien, MaNH } = tknhData;
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaTK", sql.NChar(20), maTK);

    let setClauses = [];
    // Chỉ cập nhật nếu giá trị được cung cấp và khác null/undefined
    if (SoTien !== undefined && SoTien !== null) {
      request.input("SoTien", sql.Float, SoTien);
      setClauses.push("SoTien = @SoTien");
    }
    if (MaNH) {
      request.input("MaNH", sql.NChar(20), MaNH);
      setClauses.push("MaNH = @MaNH");
    }

    if (setClauses.length === 0) {
      return 0; // Không có gì để cập nhật
    }

    const query = `
            UPDATE TAIKHOAN_NGANHANG
            SET ${setClauses.join(", ")}
            WHERE MaTK = @MaTK
        `;

    const result = await request.query(query);
    return result.rowsAffected[0];
  } catch (err) {
    console.error("SQL error updating TaiKhoanNganHang", err);
    if (err.number === 547 && err.message.includes("FK__TAIKHOAN___MaNH")) {
      throw new Error(`Mã Ngân Hàng '${MaNH}' không tồn tại.`);
    }
    throw err;
  }
};

// Hàm xóa Tài khoản Ngân hàng
TaiKhoanNganHang.deleteByMaTK = async (maTK) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaTK", sql.NChar(20), maTK);

    // Kiểm tra ràng buộc trước khi xóa (Ví dụ: Lệnh đặt đang sử dụng MaTK này)
    const checkLenhDatQuery = `SELECT COUNT(*) as count FROM LENHDAT WHERE MaTK = @MaTK AND TrangThai NOT IN (N'Hết', N'Hủy')`;
    const lenhDatResult = await request.query(checkLenhDatQuery);
    if (lenhDatResult.recordset[0].count > 0) {
      throw new Error(
        `Không thể xóa tài khoản ${maTK} vì đang có lệnh đặt chưa hoàn thành sử dụng tài khoản này.`
      );
    }

    // Kiểm tra số tiền còn lại
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

    const deleteQuery = "DELETE FROM TAIKHOAN_NGANHANG WHERE MaTK = @MaTK";
    const result = await request.query(deleteQuery);
    return result.rowsAffected[0];
  } catch (err) {
    console.error("SQL error deleting TaiKhoanNganHang", err);
    throw err; // Ném lỗi, bao gồm cả lỗi constraint tự tạo
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
    // Join với NDT và NGANHANG để lấy thêm thông tin
    const query = `
          SELECT
              tk.MaTK, tk.MaNDT, ndt.HoTen AS TenNDT, tk.SoTien, tk.MaNH, nh.TenNH
          FROM TAIKHOAN_NGANHANG tk
          JOIN NDT ndt ON tk.MaNDT = ndt.MaNDT
          JOIN NGANHANG nh ON tk.MaNH = nh.MaNH
          ORDER BY ndt.HoTen, tk.MaTK; -- Sắp xếp theo tên NĐT rồi đến Mã TK
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error("SQL error getting all bank accounts:", err);
    throw new AppError(
      "Lỗi khi lấy danh sách tất cả tài khoản ngân hàng.",
      500
    );
  }
};

// Hàm kiểm tra và giảm số dư (dùng trong transaction)
// Cần truyền đối tượng request của transaction vào
TaiKhoanNganHang.decreaseBalance = async (
  transactionRequest,
  maTK,
  amountToDecrease
) => {
  if (amountToDecrease <= 0) {
    throw new Error("Số tiền cần giảm phải lớn hơn 0.");
  }
  try {
    // Gán MaTK vào request của transaction
    transactionRequest.input("MaTK_decrease", sql.NChar(20), maTK); // Dùng tên input khác để tránh trùng
    transactionRequest.input("AmountToDecrease", sql.Float, amountToDecrease);

    // 1. Lấy số dư hiện tại và kiểm tra
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
          "vi-VN"
        )}đ) để thực hiện giao dịch ${amountToDecrease.toLocaleString(
          "vi-VN"
        )}đ.`
      );
    }

    // 2. Thực hiện giảm số dư
    const updateBalanceQuery = `
          UPDATE TAIKHOAN_NGANHANG
          SET SoTien = SoTien - @AmountToDecrease
          WHERE MaTK = @MaTK_decrease;
      `;
    const updateResult = await transactionRequest.query(updateBalanceQuery);

    if (updateResult.rowsAffected[0] === 0) {
      // Trường hợp hiếm: tìm thấy nhưng update không thành công
      throw new Error(`Không thể cập nhật số dư cho tài khoản ${maTK}.`);
    }
    console.log(
      `Balance decreased for ${maTK} by ${amountToDecrease}. New potential balance: ${
        currentBalance - amountToDecrease
      }`
    );
    return currentBalance - amountToDecrease; // Trả về số dư mới (tạm thời)
  } catch (err) {
    console.error(`Error decreasing balance for ${maTK}`, err);
    // Ném lỗi để transaction rollback
    throw err;
  }
};

// Hàm tăng số dư (dùng khi hủy lệnh mua hoặc khớp lệnh bán - trong transaction)
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
    // Có thể không cần ném lỗi mà chỉ return true nếu không muốn dừng transaction
    console.warn(
      `Attempted to increase balance by zero or negative amount for ${maTK}. Amount: ${amountToIncrease}`
    );
    return true;
    // throw new Error('Số tiền cần tăng phải lớn hơn 0.');
  }

  // Tên input động
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
      // Có thể tài khoản đã bị xóa trong lúc xử lý? Hoặc lỗi logic khác.
      console.warn(
        `Attempted to increase balance for non-existent or unchanged account ${maTK}`
      );
      // Quyết định ném lỗi hay không tùy vào logic nghiệp vụ
      throw new Error(`Không thể cập nhật (tăng) số dư cho tài khoản ${maTK}.`);
    }

    return true; // Hoặc trả về số dư mới nếu cần
  } catch (err) {
    console.error(`Error increasing balance for ${maTK}`, err);
    throw err;
  }
};

// Hàm lấy các sự kiện tiền mặt của NDT trong khoảng thời gian
TaiKhoanNganHang.getCashFlowEvents = async (maNDT, tuNgay, denNgay) => {
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

    // Query sử dụng UNION ALL để kết hợp 2 nguồn sự kiện
    const query = `
    -- Sự kiện 1: Đặt lệnh Mua (Trừ tiền)
    SELECT
        ld.NgayGD AS Ngay,
        'LENHDAT_M' AS Nguon, -- Thêm nguồn để phân biệt
        ld.MaGD AS IDGoc,      -- ID gốc của sự kiện
        -(ld.SoLuong * ld.Gia) AS SoTienPhatSinh,
        N'Đặt lệnh mua ' + ld.MaCP + N' (Mã GD: ' + CAST(ld.MaGD AS VARCHAR) + N')' AS LyDo,
        ld.MaTK
    FROM LENHDAT ld
    JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
    WHERE tk.MaNDT = @MaNDT AND ld.LoaiGD = 'M'
      AND ld.NgayGD >= @TuNgay AND ld.NgayGD <= @DenNgay

    UNION ALL

    -- Sự kiện 2: Khớp lệnh Bán (Cộng tiền)
    SELECT
        lk.NgayGioKhop AS Ngay,
        'LENHKHOP_B' AS Nguon,
        lk.MaLK AS IDGoc, -- ID Lệnh khớp
        (lk.SoLuongKhop * lk.GiaKhop) AS SoTienPhatSinh,
        N'Khớp lệnh bán ' + ld.MaCP + N' (Mã GD: ' + CAST(ld.MaGD AS VARCHAR) + N', Mã LK: ' + CAST(lk.MaLK AS VARCHAR) + N')' AS LyDo,
        ld.MaTK
    FROM LENHKHOP lk
    JOIN LENHDAT ld ON lk.MaGD = ld.MaGD
    JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
    WHERE tk.MaNDT = @MaNDT AND ld.LoaiGD = 'B'
      AND lk.NgayGioKhop >= @TuNgay AND lk.NgayGioKhop <= @DenNgay

    UNION ALL

   -- *** SỰ KIỆN 3: Giao dịch Nạp/Rút tiền từ bảng GIAODICHTIEN ***
    SELECT
        gdt.NgayGD AS Ngay,
        'GIAODICHTIEN' AS Nguon,
        gdt.MaGDTien AS IDGoc,
        -- Quy đổi thành số tiền phát sinh (+/-)
        CASE
            WHEN gdt.LoaiGDTien = N'Nạp tiền' THEN gdt.SoTien
            WHEN gdt.LoaiGDTien = N'Rút tiền' THEN -gdt.SoTien
            ELSE 0 -- Trường hợp khác nếu có
        END AS SoTienPhatSinh,
        -- Xây dựng Lý do
        gdt.LoaiGDTien +
           ISNULL(N' (NV: ' + gdt.MaNVThucHien + N')', N' (Tự thực hiện)') + -- Ghi người thực hiện
           ISNULL(N' - Ghi chú: ' + gdt.GhiChu, '') AS LyDo,
        gdt.MaTK
    FROM GIAODICHTIEN gdt
    JOIN TAIKHOAN_NGANHANG tk ON gdt.MaTK = tk.MaTK
    WHERE tk.MaNDT = @MaNDT
      AND gdt.NgayGD >= @TuNgay AND gdt.NgayGD <= @DenNgay

    -- Thêm các nguồn khác nếu có (Phí, Thuế...)

    ORDER BY Ngay ASC; -- Sắp xếp theo thời gian xảy ra sự kiện
`;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error("SQL error getting cash flow events", err);
    throw err;
  }
};

// (Optional & Difficult) Hàm lấy số dư tại một thời điểm - Cần logic phức tạp hơn
TaiKhoanNganHang.getBalanceAtDate = async (maNDT, targetDate) => {
  console.warn(
    "getBalanceAtDate function is complex and not fully implemented."
  );
  // Logic ví dụ:
  // 1. Lấy số dư hiện tại của tất cả các TK của NDT.
  // 2. Lấy TẤT CẢ các sự kiện cash flow (như getCashFlowEvents) xảy ra SAU targetDate.
  // 3. "Hoàn tác" các sự kiện đó từ số dư hiện tại để ra số dư tại targetDate.
  // --> Rất phức tạp và dễ lỗi nếu bỏ sót sự kiện.
  // --> Tạm thời trả về null hoặc một giá trị không xác định.
  return null; // Placeholder
};

module.exports = TaiKhoanNganHang;
