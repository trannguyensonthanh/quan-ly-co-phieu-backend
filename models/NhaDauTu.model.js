// models/NhaDauTu.model.js (thêm vào)
const sql = require("mssql");
const db = require("./db");
const TaiKhoanNganHangModel = require("./TaiKhoanNganHang.model"); // Sẽ tạo model này
const passwordHasher = require("../utils/passwordHasher"); // Để hash mật khẩu khi tạo/cập nhật
// ...

let NhaDauTu = {};

// Hàm lấy thông tin profile NĐT (không lấy mật khẩu)
NhaDauTu.findProfileByMaNDT = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
    // Chỉ SELECT các cột cần thiết cho profile, TRÁNH lấy MKGD
    const query = `
            SELECT MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
            FROM NDT
            WHERE MaNDT = @MaNDT
        `;
    const result = await request.query(query);
    return result.recordset[0]; // Trả về profile hoặc undefined nếu không tìm thấy
  } catch (err) {
    console.error(`SQL error finding profile for NhaDauTu ${maNDT}:`, err);
    throw err; // Ném lỗi để service/controller xử lý
  }
};

// tìm kiếm Nhà đầu tư theo mã NDT (MaNDT)
NhaDauTu.findByMaNDT = async (maNDT, includeBankAccounts = false) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
    // Lấy cả MKGD (coi như password hash)
    const query =
      "SELECT MaNDT, HoTen, MKGD, Email, CMND, GioiTinh, DiaChi, Phone, NgaySinh FROM NDT WHERE MaNDT = @MaNDT";
    const result = await request.query(query);
    const ndt = result.recordset[0];
    // Chỉ lấy tài khoản ngân hàng nếu ndt tồn tại VÀ tham số includeBankAccounts là true
    if (ndt && includeBankAccounts === true) {
      // <<< SỬA ĐIỀU KIỆN IF
      console.log(`Fetching bank accounts for NDT ${maNDT}...`); // Log để debug
      try {
        ndt.TaiKhoanNganHang = await TaiKhoanNganHangModel.findByMaNDT(maNDT);
      } catch (bankErr) {
        console.error(
          `Error fetching bank accounts for NDT ${maNDT}:`,
          bankErr
        );
        // Quyết định xem có nên ném lỗi hay chỉ log và trả về NDT không có TKNH
        ndt.TaiKhoanNganHang = []; // Trả về mảng rỗng nếu lỗi
      }
    }

    return ndt;
  } catch (err) {
    console.error("SQL error finding NhaDauTu by MaNDT", err);
    throw err;
  }
};

// Hàm tìm kiếm Nhà đầu tư bằng Email
NhaDauTu.findByEmail = async (email) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("Email", sql.NVarChar(50), email);
    const query = `
          SELECT MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
          FROM NDT
          WHERE Email = @Email
      `;
    const result = await request.query(query);
    return result.recordset[0]; // Trả về NDT hoặc undefined nếu không tìm thấy
  } catch (err) {
    console.error(`SQL error finding NhaDauTu by Email ${email}:`, err);
    throw err;
  }
};

// Hàm tìm kiếm Nhà đầu tư bằng CMND
NhaDauTu.findByCMND = async (cmnd) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("CMND", sql.NChar(10), cmnd);
    const query = `
          SELECT MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
          FROM NDT
          WHERE CMND = @CMND
      `;
    const result = await request.query(query);
    return result.recordset[0]; // Trả về NDT hoặc undefined nếu không tìm thấy
  } catch (err) {
    console.error(`SQL error finding NhaDauTu by CMND ${cmnd}:`, err);
    throw err;
  }
};

// *** THÊM HÀM findProfileByMaNDT NẾU CHƯA CÓ (Hàm này không lấy MKGD) ***
NhaDauTu.findProfileByMaNDT = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
    const query = `
            SELECT MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
            FROM NDT
            WHERE MaNDT = @MaNDT
        `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error(`SQL error finding profile for NhaDauTu ${maNDT}:`, err);
    throw err;
  }
};

// Hàm lấy tất cả Nhà đầu tư (có thể thêm phân trang/tìm kiếm sau)
NhaDauTu.getAll = async () => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    // Chọn các trường cần thiết cho danh sách, không cần mật khẩu
    const query = `
          SELECT MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email
          FROM NDT
          ORDER BY HoTen
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error("SQL error getting all NhaDauTu", err);
    throw err;
  }
};

// Hàm tạo mới Nhà đầu tư
NhaDauTu.create = async (newNDTData) => {
  // MKGD (Mật khẩu giao dịch/đăng nhập) cần được hash
  const { MaNDT, HoTen, NgaySinh, MKGD, DiaChi, Phone, CMND, GioiTinh, Email } =
    newNDTData;

  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), MaNDT);
    request.input("HoTen", sql.NVarChar(50), HoTen);
    request.input("NgaySinh", sql.Date, NgaySinh ? new Date(NgaySinh) : null); // Chuyển đổi sang Date object
    request.input("MKGD", sql.NVarChar(255), MKGD); // Lưu mật khẩu đã hash
    request.input("DiaChi", sql.NVarChar(100), DiaChi);
    request.input("Phone", sql.NVarChar(15), Phone);
    request.input("CMND", sql.NChar(10), CMND);
    request.input("GioiTinh", sql.NChar(5), GioiTinh);
    request.input("Email", sql.NVarChar(50), Email);

    const query = `
    INSERT INTO NDT (MaNDT, HoTen, NgaySinh, MKGD, DiaChi, Phone, CMND, GioiTinh, Email)
    OUTPUT INSERTED.* -- Trả về để service loại bỏ MKGD
    VALUES (@MaNDT, @HoTen, @NgaySinh, @MKGD, @DiaChi, @Phone, @CMND, @GioiTinh, @Email);
`;
    await request.query(query);
    // Trả về dữ liệu đã tạo (không bao gồm mật khẩu)
    const { MKGD: _, ...createdNDT } = newNDTData; // Loại bỏ MKGD khỏi object trả về
    createdNDT.MaNDT = MaNDT; // Đảm bảo MaNDT có trong kết quả trả về
    return createdNDT;
  } catch (err) {
    console.error("SQL error creating NhaDauTu", err);
    // Bắt lỗi ràng buộc UNIQUE (ví dụ: CMND, MaNDT)
    if (err.number === 2627 || err.number === 2601) {
      // Mã lỗi cho vi phạm UNIQUE hoặc PRIMARY KEY
      if (err.message.includes("PK__NDT")) {
        throw new Error(`Mã Nhà Đầu Tư '${MaNDT}' đã tồn tại.`);
      }
      if (err.message.includes("UQ__NDT__CMND")) {
        // Giả sử tên constraint là UQ__NDT__CMND
        throw new Error(`Số CMND '${CMND}' đã tồn tại.`);
      }
    }
    throw err; // Ném lỗi khác
  }
};

// Hàm cập nhật Nhà đầu tư
NhaDauTu.updateByMaNDT = async (maNDT, ndtData) => {
  // Chỉ cập nhật các trường được phép, không bao gồm MaNDT (username)
  const { HoTen, NgaySinh, DiaChi, Phone, GioiTinh, Email } = ndtData;

  console.log("NhaDauTu.updateByMaNDT", ndtData); // Log để debug

  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT); // Sử dụng maNDT từ tham số
    request.input("HoTen", sql.NVarChar(50), HoTen);
    request.input("NgaySinh", sql.Date, NgaySinh ? new Date(NgaySinh) : null);
    request.input("DiaChi", sql.NVarChar(100), DiaChi);
    request.input("Phone", sql.NVarChar(15), Phone);
    request.input("GioiTinh", sql.NChar(5), GioiTinh);
    request.input("Email", sql.NVarChar(50), Email);

    // Xây dựng câu lệnh UPDATE linh hoạt hơn
    let setClauses = [];
    // Thêm các trường cần cập nhật vào mảng setClauses
    if (HoTen !== undefined) setClauses.push("HoTen = @HoTen");
    if (NgaySinh !== undefined) setClauses.push("NgaySinh = @NgaySinh");
    if (DiaChi !== undefined) setClauses.push("DiaChi = @DiaChi");
    if (Phone !== undefined) setClauses.push("Phone = @Phone");
    if (GioiTinh !== undefined) setClauses.push("GioiTinh = @GioiTinh");
    if (Email !== undefined) setClauses.push("Email = @Email");

    if (setClauses.length === 0) {
      return 0; // Không có gì để cập nhật
    }

    const query = `
          UPDATE NDT
          SET ${setClauses.join(", ")}
          WHERE MaNDT = @MaNDT
      `;

    const result = await request.query(query);
    return result.rowsAffected[0]; // Trả về số dòng bị ảnh hưởng
  } catch (err) {
    console.error("SQL error updating NhaDauTu", err);
    throw err;
  }
};

// Hàm xóa Nhà đầu tư (Cần kiểm tra ràng buộc rất cẩn thận)
NhaDauTu.deleteByMaNDT = async (maNDT) => {
  // !! Cảnh báo: Xóa NDT là hành động nguy hiểm, có thể làm mất dữ liệu giao dịch.
  // Thông thường nên dùng cơ chế "đánh dấu xóa" (soft delete) thay vì xóa cứng.
  // Ở đây tạm thực hiện xóa cứng và kiểm tra các ràng buộc cơ bản.
  let transaction; // Declare transaction outside the try block
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool); // Sử dụng transaction để đảm bảo an toàn

    await transaction.begin();
    const request = transaction.request(); // Yêu cầu trong transaction
    request.input("MaNDT", sql.NChar(20), maNDT);

    // 1. Kiểm tra Lệnh Đặt chưa hoàn thành
    const checkLenhDatQuery = `SELECT COUNT(*) as count FROM LENHDAT ld JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK WHERE tk.MaNDT = @MaNDT AND ld.TrangThai NOT IN (N'Hết', N'Hủy')`;
    const lenhDatResult = await request.query(checkLenhDatQuery);
    if (lenhDatResult.recordset[0].count > 0) {
      await transaction.rollback();
      throw new Error(
        `Không thể xóa NDT ${maNDT} vì còn lệnh đặt chưa hoàn thành.`
      );
    }

    // 2. Kiểm tra Sở Hữu Cổ phiếu
    const checkSoHuuQuery =
      "SELECT COUNT(*) as count FROM SOHUU WHERE MaNDT = @MaNDT AND SoLuong > 0";
    const soHuuResult = await request.query(checkSoHuuQuery);
    if (soHuuResult.recordset[0].count > 0) {
      await transaction.rollback();
      throw new Error(`Không thể xóa NDT ${maNDT} vì đang sở hữu cổ phiếu.`);
    }

    // 3. Kiểm tra Tài khoản Ngân hàng còn tiền
    const checkTaiKhoanQuery =
      "SELECT COUNT(*) as count FROM TAIKHOAN_NGANHANG WHERE MaNDT = @MaNDT AND SoTien > 0";
    const taiKhoanResult = await request.query(checkTaiKhoanQuery);
    if (taiKhoanResult.recordset[0].count > 0) {
      await transaction.rollback();
      throw new Error(
        `Không thể xóa NDT ${maNDT} vì tài khoản ngân hàng liên kết vẫn còn số dư.`
      );
    }

    // Nếu các kiểm tra ok:
    // 4. Xóa các bản ghi liên quan (theo thứ tự ngược lại của khóa ngoại)
    //    Ví dụ: Xóa lệnh khớp, lệnh đặt đã hoàn thành, sở hữu = 0, lịch sử giao dịch tiền... (TÙY THEO YÊU CẦU LƯU TRỮ)
    //    Hoặc đơn giản là xóa TK Ngân hàng trước

    // 4a. Xóa Tài Khoản Ngân Hàng liên kết
    const deleteTKNHQuery =
      "DELETE FROM TAIKHOAN_NGANHANG WHERE MaNDT = @MaNDT";
    await request.query(deleteTKNHQuery);

    // 4b. (Tùy chọn) Xóa các bản ghi lịch sử khác nếu cần...
    // Ví dụ: DELETE FROM LENHKHOP WHERE MaGD IN (SELECT MaGD FROM LENHDAT WHERE MaTK IN (SELECT MaTK FROM TAIKHOAN_NGANHANG WHERE MaNDT = @MaNDT))
    // Ví dụ: DELETE FROM LENHDAT WHERE MaTK IN (SELECT MaTK FROM TAIKHOAN_NGANHANG WHERE MaNDT = @MaNDT)
    // Ví dụ: DELETE FROM SOHUU WHERE MaNDT = @MaNDT (nếu đã đảm bảo SoLuong=0)

    // 5. Xóa Nhà Đầu Tư
    const deleteNDTQuery = "DELETE FROM NDT WHERE MaNDT = @MaNDT";
    const result = await request.query(deleteNDTQuery);

    await transaction.commit();
    return result.rowsAffected[0]; // Trả về số NDT đã xóa (0 hoặc 1)
  } catch (err) {
    // Đảm bảo rollback transaction nếu có lỗi ở bất kỳ bước nào
    if (transaction && transaction.active) {
      await transaction.rollback();
    }
    console.error("SQL error deleting NhaDauTu", err);
    // Ném lại lỗi để service xử lý, bao gồm cả lỗi constraint tự tạo
    throw err;
  }
};

// Hàm cập nhật mật khẩu hash (MKGD)
NhaDauTu.updatePasswordHash = async (maNDT, hashedPassword) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
    request.input("MKGD", sql.NVarChar(255), hashedPassword); // Cập nhật vào cột MKGD

    const query = `UPDATE NDT SET MKGD = @MKGD WHERE MaNDT = @MaNDT`;
    const result = await request.query(query);
    if (result.rowsAffected[0] === 0) {
      throw new Error(
        `Không tìm thấy Nhà Đầu Tư với mã '${maNDT}' để cập nhật mật khẩu.`
      );
    }
    return true;
  } catch (err) {
    console.error(
      `SQL error updating password hash for NhaDauTu ${maNDT}:`,
      err
    );
    throw err;
  }
};

// Hàm xóa mật khẩu hash (MKGD)
NhaDauTu.clearPasswordHash = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);

    const query = `UPDATE NDT SET MKGD = NULL WHERE MaNDT = @MaNDT`;
    const result = await request.query(query);
    return result.rowsAffected[0] > 0;
  } catch (err) {
    console.error(
      `SQL error clearing password hash for NhaDauTu ${maNDT}:`,
      err
    );
    throw err;
  }
};
// Hàm kiểm tra NhaDauTu tồn tại (nếu chưa có)
NhaDauTu.exists = async (maNDT) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
    const query = "SELECT 1 FROM NDT WHERE MaNDT = @MaNDT";
    const result = await request.query(query);
    return result.recordset.length > 0;
  } catch (err) {
    console.error(`SQL error checking existence for NhaDauTu ${maNDT}:`, err);
    throw err;
  }
};

// Hàm kiểm tra thông tin trùng lặp (trước khi tạo)
NhaDauTu.checkExistence = async (maNDT, cmnd, email) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("MaNDT", sql.NChar(20), maNDT);
    request.input("CMND", sql.NChar(10), cmnd);
    request.input("Email", sql.NVarChar(50), email);

    // Kiểm tra từng trường riêng biệt để báo lỗi cụ thể
    const query = `
          SELECT
              CASE WHEN EXISTS (SELECT 1 FROM NDT WHERE MaNDT = @MaNDT) THEN 1 ELSE 0 END AS MaNDTExists,
              CASE WHEN EXISTS (SELECT 1 FROM NDT WHERE CMND = @CMND) THEN 1 ELSE 0 END AS CMNDExists,
              CASE WHEN @Email IS NOT NULL AND EXISTS (SELECT 1 FROM NDT WHERE Email = @Email) THEN 1 ELSE 0 END AS EmailExists;
      `;
    const result = await request.query(query);
    console.log("Check existence result:", result.recordset[0]);
    return result.recordset[0]; // { MaNDTExists: 1/0, CMNDExists: 1/0, EmailExists: 1/0 }
  } catch (err) {
    console.error("SQL error checking NDT existence", err);
    throw err;
  }
};

// Hàm tạo mới Nhà đầu tư (phiên bản dùng trong Transaction của Service)
// Không hash password ở đây, hash ở service trước khi gọi
NhaDauTu.createInTransaction = async (
  transactionRequest,
  newNDTData,
  hashedPassword
) => {
  const { MaNDT, HoTen, NgaySinh, DiaChi, Phone, CMND, GioiTinh, Email } =
    newNDTData;
  try {
    transactionRequest.input("MaNDT_crt", sql.NChar(20), MaNDT);
    transactionRequest.input("HoTen_crt", sql.NVarChar(50), HoTen);
    transactionRequest.input(
      "NgaySinh_crt",
      sql.Date,
      NgaySinh ? new Date(NgaySinh) : null
    );
    transactionRequest.input("MKGD_crt", sql.NVarChar(255), hashedPassword); // Lưu hash
    transactionRequest.input("DiaChi_crt", sql.NVarChar(100), DiaChi);
    transactionRequest.input("Phone_crt", sql.NVarChar(15), Phone);
    transactionRequest.input("CMND_crt", sql.NChar(10), CMND);
    transactionRequest.input("GioiTinh_crt", sql.NChar(5), GioiTinh);
    transactionRequest.input("Email_crt", sql.NVarChar(50), Email);

    const query = `
          INSERT INTO NDT (MaNDT, HoTen, NgaySinh, MKGD, DiaChi, Phone, CMND, GioiTinh, Email)
          VALUES (@MaNDT_crt, @HoTen_crt, @NgaySinh_crt, @MKGD_crt, @DiaChi_crt, @Phone_crt, @CMND_crt, @GioiTinh_crt, @Email_crt);
      `;
    await transactionRequest.query(query);
    // Trả về MaNDT để xác nhận
    return MaNDT;
  } catch (err) {
    console.error("SQL error creating NhaDauTu in transaction", err);
    // Lỗi PK/Unique đã được check trước đó, nhưng vẫn có thể xảy ra do race condition
    if (err.number === 2627 || err.number === 2601) {
      throw new Error(
        `Lỗi khi tạo NDT: Mã NDT hoặc CMND có thể đã tồn tại (Race condition).`
      );
    }
    throw err; // Ném lỗi để transaction rollback
  }
};

module.exports = NhaDauTu;
