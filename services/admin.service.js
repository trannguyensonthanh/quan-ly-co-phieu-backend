// services/admin.service.js
// const UserManagementModel = require("../models/UserManagement.model");
const NhanVienModel = require('../models/NhanVien.model');
const NhaDauTuModel = require('../models/NhaDauTu.model');
const passwordHasher = require('../utils/passwordHasher');
const BackupRestoreModel = require('../models/BackupRestore.model');
const path = require('path'); // Để xử lý đường dẫn file
const BadRequestError = require('../utils/errors/BadRequestError');
const NotFoundError = require('../utils/errors/NotFoundError');
const AppError = require('../utils/errors/AppError');
const ConflictError = require('../utils/errors/ConflictError');
const sql = require('mssql'); // Thư viện SQL Server
const dbConfig = require('../config/db.config');
const NhanVienService = require('./nhanvien.service');
const AdminModel = require('../models/Admin.model');
const fs = require('fs').promises;
const db = require('../models/db'); // Để gọi connectDb
const AuthorizationError = require('../utils/errors/AuthorizationError');
const AdminService = {};
const DB_NAME = dbConfig.database;
const TaiKhoanNganHangModel = require('../models/TaiKhoanNganHang.model');
const NganHangModel = require('../models/NganHang.model');
const GiaoDichTienModel = require('../models/GiaoDichTien.model');
const CoPhieuUndoLogModel = require('../models/CoPhieuUndoLog.model');
const LenhDatModel = require('../models/LenhDat.model');
const SoHuuModel = require('../models/SoHuu.model');
const CoPhieuModel = require('../models/CoPhieu.model');
// --- HÀM MỚI: Admin tạo tài khoản Nhà Đầu Tư ---
/**
 * Admin tạo tài khoản Nhà Đầu Tư mới, bao gồm việc hash mật khẩu.
 * @param {object} ndtData Dữ liệu NDT (bao gồm MaNDT).
 * @param {string} rawPassword Mật khẩu gốc do Admin nhập.
 * @param {string} performedBy Mã Admin thực hiện (để ghi log nếu cần).
 * @returns {Promise<object>} Thông tin NĐT đã tạo (không có hash).
 */
AdminService.createInvestorAccount = async (
  ndtData,
  rawPassword,
  performedBy
) => {
  console.log(`Admin ${performedBy} creating Investor ${ndtData.MaNDT}`);
  // 1. Kiểm tra trùng lặp (MaNDT, CMND, Email)
  const existence = await AdminModel.checkGlobalExistence(
    ndtData.MaNDT,
    ndtData.CMND,
    ndtData.Email
  );
  if (existence?.idExists)
    throw new ConflictError(`Mã Nhà Đầu Tư '${ndtData.MaNDT}' đã tồn tại.`);
  if (existence?.cmndExists)
    throw new ConflictError(`Số CMND '${ndtData.CMND}' đã tồn tại.`);
  if (existence?.emailExists && ndtData.Email)
    throw new ConflictError(`Email '${ndtData.Email}' đã tồn tại.`);

  // 2. Hash mật khẩu
  const hashedPassword = await passwordHasher.hashPassword(rawPassword);

  // 3. Tạo bản ghi NDT trong DB
  try {
    // Gọi hàm create của Model, truyền hash vào
    // Hàm create cần trả về bản ghi đã tạo để loại bỏ hash
    const createdNdt = await NhaDauTuModel.create({
      ...ndtData,
      MKGD: hashedPassword,
    }); // Truyền hash vào MKGD

    if (!createdNdt) throw new AppError('Tạo NĐT thất bại.', 500);
    const pool = await db.getPool();
    const request = pool.request();
    request.input('LoginName', sql.NVarChar(128), ndtData.MaNDT);
    request.input('Password', sql.NVarChar(256), rawPassword);
    request.input('RoleName', sql.NVarChar(128), 'NhaDauTuRole');
    await request.execute('dbo.sp_AdminTaoNguoiDung');
    console.log(`Created SQL Login/User for ${ndtData.MaNDT}`);

    // Loại bỏ mật khẩu hash trước khi trả về controller
    const { MKGD, ...result } = createdNdt;
    return result;
  } catch (error) {
    console.error('Error creating Investor account in service:', error);
    if (error instanceof ConflictError) throw error;
    throw new AppError(
      `Lỗi khi tạo tài khoản NĐT ${ndtData.MaNDT}: ${error.message}`,
      500
    );
  }
};

// --- HÀM MỚI: Admin tạo tài khoản Nhân Viên ---
/**
 * Admin tạo tài khoản Nhân Viên mới, bao gồm việc hash mật khẩu.
 * @param {object} nvData Dữ liệu NV (bao gồm MaNV).
 * @param {string} rawPassword Mật khẩu gốc do Admin nhập.
 * @param {string} performedBy Mã Admin thực hiện.
 * @returns {Promise<object>} Thông tin NV đã tạo (không có hash).
 */
AdminService.createStaffAccount = async (nvData, rawPassword, performedBy) => {
  console.log(`Admin ${performedBy} creating Staff ${nvData.MaNV}`);
  // Gọi hàm tạo NV từ NhanVienService (đã bao gồm check trùng và hash)
  try {
    const result = await NhanVienService.createNhanVien(nvData, rawPassword);
    return result;
  } catch (error) {
    // Ném lại lỗi đã được xử lý từ NhanVienService
    throw error;
  }
};

// Service xóa "tài khoản ứng dụng" (trước đây là deleteLogin)
AdminService.clearUserPassword = async (targetUserId) => {
  // 1. Xóa hash trong bảng NHANVIEN hoặc NDT (thử cả hai)
  let clearedNV = false;
  let clearedNDT = false;

  try {
    // Cố gắng xóa hash của Nhân Viên
    clearedNV = await NhanVienModel.clearPasswordHash(targetUserId);
  } catch (err) {
    console.warn(`Could not clear NV hash for ${targetUserId}: ${err.message}`);
  }

  try {
    // Cố gắng xóa hash của Nhà Đầu Tư (nếu không phải NV)
    if (!clearedNV) {
      clearedNDT = await NhaDauTuModel.clearPasswordHash(targetUserId);
    }
  } catch (err) {
    console.warn(
      `Could not clear NDT hash for ${targetUserId}: ${err.message}`
    );
  }

  if (clearedNV || clearedNDT) {
    console.log(
      `Cleared password hash for ${targetUserId} in corresponding table.`
    );
    return {
      message: `Đã xóa mật khẩu của tài khoản '${targetUserId}'. Người dùng này sẽ không thể đăng nhập trừ khi mật khẩu được đặt lại.`,
    };
  } else {
    // Không tìm thấy user trong cả 2 bảng hoặc không có hash để xóa
    // Có thể coi là thành công vì mục đích là không còn mật khẩu
    // Hoặc throw lỗi nếu muốn chặt chẽ hơn
    console.warn(
      `No user found or no password hash to clear for ${targetUserId}.`
    );
    // throw new Error(`Không tìm thấy tài khoản '${targetUserId}' để xóa mật khẩu.`);
    return {
      message: `Không tìm thấy mật khẩu để xóa cho tài khoản '${targetUserId}'.`,
    };
  }
  // --- PHẦN XÓA SQL LOGIN/USER ĐÃ BỊ XÓA ---
};

// --- Backup Operations ---
/**
 * Service: Thực hiện backup (Full hoặc Log).
 * @param {'Full' | 'Log'} backupType - Loại backup.
 * @param {boolean} initDevice - (Chỉ dùng cho Full) True nếu muốn ghi đè device.
 */
AdminService.performBackup = async (backupType, initDevice = false) => {
  try {
    if (backupType === 'Full') {
      console.log(
        `[SERVICE] Performing Full Backup. Init device: ${initDevice}`
      );
      const result = await BackupRestoreModel.backupFull(initDevice);
      return {
        message: `Sao lưu Full thành công. Tên bản sao lưu: ${result.backupName}`,
        ...result,
      };
    } else if (backupType === 'Log') {
      console.log(`[SERVICE] Performing Log Backup.`);
      const result = await BackupRestoreModel.backupLog();
      return {
        message: `Sao lưu Log thành công. Tên bản sao lưu: ${result.backupName}`,
        ...result,
      };
    } else {
      throw new BadRequestError(
        'Loại backup không hợp lệ. Phải là "Full" hoặc "Log".'
      );
    }
  } catch (error) {
    console.error(`[SERVICE] Error during ${backupType} backup:`, error);
    throw error;
  }
};

// --- Restore Operations ---
/**
 * Service: Thực hiện Restore.
 * @param {Array<number>} positions - Mảng các vị trí file cần restore.
 * @param {string|null} pointInTime - Thời điểm cần phục hồi (ISO string).
 */
AdminService.performRestore = async (positions, pointInTime = null) => {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new BadRequestError(
      'Vui lòng chọn ít nhất một bản sao lưu để phục hồi.'
    );
  }
  // Sắp xếp các position theo thứ tự tăng dần để đảm bảo restore đúng chuỗi
  const sortedPositions = positions.sort((a, b) => a - b);

  console.log(
    `[SERVICE] Restore request received. Positions: [${sortedPositions.join(
      ', '
    )}]. Point-in-time: ${pointInTime || 'N/A'}`
  );

  try {
    // Gọi hàm model để thực hiện restore
    await BackupRestoreModel.restoreFromDevice(sortedPositions, pointInTime);

    let message = `Phục hồi CSDL từ các bản sao lưu ở vị trí [${sortedPositions.join(
      ', '
    )}] thành công.`;
    if (pointInTime) {
      message = `Phục hồi CSDL về thời điểm '${pointInTime}' thành công.`;
    }
    return { message: message };
  } catch (error) {
    console.error('[SERVICE] Error during restore:', error);
    // Ném lỗi để controller bắt và trả về cho client
    throw error;
  }
};

/**
 * Service: Tạo backup device.
 */
AdminService.createBackupDevice = async () => {
  try {
    console.log('[SERVICE] Request to create backup device...');
    // Model đã có đủ logic, chỉ cần gọi và trả về
    const result = await BackupRestoreModel.createBackupDevice();
    return {
      message: `Thiết bị sao lưu '${result.deviceName}' đã được tạo hoặc xác nhận tồn tại.`,
      ...result,
    };
  } catch (error) {
    console.error('[SERVICE] Error creating backup device:', error);
    throw error; // Ném lại lỗi đã được chuẩn hóa từ model
  }
};

/**
 * Service: Lấy danh sách các bản backup từ device.
 */
AdminService.getBackupHistory = async () => {
  try {
    console.log('[SERVICE] Getting backup history from device...');
    const history = await BackupRestoreModel.getBackupListFromDevice();
    // Sắp xếp lại để hiển thị bản mới nhất lên đầu
    return history.sort((a, b) => b.position - a.position);
  } catch (error) {
    console.error('[SERVICE] Error getting backup history:', error);
    throw error;
  }
};

AdminService.prepareNextDayPrices = async () => {
  console.log('[SERVICE PREPARE PRICES] Request received.');
  try {
    // --- Logic Xác định Ngày Giao dịch Tiếp theo ---

    const pool = await db.getPool();
    // Lấy ngày hiện tại từ SQL Server để đảm bảo đồng bộ
    const todayResult = await pool
      .request()
      .query('SELECT CAST(GETDATE() AS DATE) as TodayDate');
    const ngayHienTai = todayResult.recordset[0].TodayDate;

    // Sử dụng SQL Server để tính ngày tiếp theo
    const nextDayResult = await pool
      .request()
      .input('NgayHienTai', sql.Date, ngayHienTai)
      .query(`SELECT DATEADD(DAY, 1, @NgayHienTai) as NextTradingDay`);
    const ngayTiepTheo = nextDayResult.recordset[0].NextTradingDay;

    console.log(
      `[SERVICE PREPARE PRICES] Current Date: ${ngayHienTai
        .toISOString()
        .slice(0, 10)}, Next Trading Day: ${ngayTiepTheo
        .toISOString()
        .slice(0, 10)}`
    );

    // --- Gọi Stored Procedure ---
    const request = pool.request();
    request.input('NgayHienTai', sql.Date, ngayHienTai);
    request.input('NgayTiepTheo', sql.Date, ngayTiepTheo);

    await request.execute('dbo.sp_PrepareNextDayPrices'); // Gọi SP đã tạo

    console.log(
      `[SERVICE PREPARE PRICES] SP executed successfully for ${ngayTiepTheo
        .toISOString()
        .slice(0, 10)}.`
    );
    return {
      message: `Đã chuẩn bị giá tham chiếu/trần/sàn cho ngày ${ngayTiepTheo
        .toISOString()
        .slice(0, 10)} thành công.`,
    };
  } catch (error) {
    console.error(`Error preparing next day prices:`, error);
    // Ném lỗi đã chuẩn hóa hoặc lỗi gốc
    if (error instanceof AppError || error instanceof NotFoundError)
      throw error;
    throw new AppError(
      `Lỗi khi chuẩn bị giá ngày tiếp theo: ${error.message}`,
      500
    );
  }
};

/**
 * Service lấy danh sách tổng hợp NV và NDT cho Admin.
 * @returns {Promise<Array<object>>}
 */
AdminService.getAllUsers = async () => {
  console.log('[Admin Service] Getting all users (Staff + Investors)...');
  try {
    const users = await NhanVienModel.getAllUsersForAdmin();
    return users;
  } catch (error) {
    console.error('Error in getAllUsers service:', error);
    // Ném lại lỗi đã chuẩn hóa hoặc lỗi gốc
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Lỗi khi lấy danh sách người dùng: ${error.message}`,
      500
    );
  }
};

/**
 * Admin cập nhật thông tin cơ bản cho NDT hoặc NV.
 * @param {string} accountId MaNDT hoặc MaNV.
 * @param {'NhaDauTu' | 'Nhanvien'} role Vai trò của tài khoản.
 * @param {object} updateData Dữ liệu cần cập nhật (không bao gồm mật khẩu, status).
 * @returns {Promise<object>} Thông tin tài khoản sau khi cập nhật.
 */
AdminService.updateUserAccount = async (accountId, role, updateData) => {
  console.log(`Admin attempting to update ${role} account: ${accountId}`);

  // **Quan trọng: Kiểm tra trùng lặp CMND/Email nếu chúng được cập nhật**
  // Cần kiểm tra xem CMND/Email mới có bị trùng với BẤT KỲ user nào khác không (cả NV và NDT)
  if (updateData.CMND || updateData.Email) {
    // Lấy thông tin user hiện tại để loại trừ chính nó ra khỏi việc check trùng
    let currentUser = null;
    if (role === 'NhaDauTu')
      currentUser = await NhaDauTuModel.findByMaNDT(accountId);
    else if (role === 'NhanVien')
      currentUser = await NhanVienModel.findByMaNV(accountId);

    console.log(updateData.CMND, updateData.Email);
    console.log(currentUser.CMND, currentUser.Email);
    // Chỉ kiểm tra nếu CMND/Email thực sự thay đổi
    const cmndToCheck =
      updateData.CMND && currentUser && updateData.CMND !== currentUser.CMND
        ? updateData.CMND
        : null;
    const emailToCheck =
      updateData.Email && currentUser && updateData.Email !== currentUser.Email
        ? updateData.Email
        : null;

    if (cmndToCheck) {
      // Kiểm tra trùng lặp CMND trên bảng NDT
      const ndtWithSameCMND = await NhaDauTuModel.findByCMND(cmndToCheck);
      if (
        ndtWithSameCMND &&
        ndtWithSameCMND.MaNDT.trim() !== accountId.trim()
      ) {
        throw new ConflictError(`Số CMND '${cmndToCheck}' đã được sử dụng.`);
      }
      // Kiểm tra trùng lặp CMND trên bảng NV
      const nvWithSameCMND = await NhanVienModel.findByCMND(cmndToCheck);
      if (nvWithSameCMND && nvWithSameCMND.MaNV.trim() !== accountId.trim()) {
        throw new ConflictError(`Số CMND '${cmndToCheck}' đã được sử dụng.`);
      }
    }

    if (emailToCheck) {
      // Kiểm tra trùng lặp Email trên bảng NDT
      const ndtWithSameEmail = await NhaDauTuModel.findByEmail(emailToCheck);
      if (
        ndtWithSameEmail &&
        ndtWithSameEmail.MaNDT.trim() !== accountId.trim()
      ) {
        throw new ConflictError(`Email '${emailToCheck}' đã được sử dụng.`);
      }
      // Kiểm tra trùng lặp Email trên bảng NV
      const nvWithSameEmail = await NhanVienModel.findByEmail(emailToCheck);
      if (nvWithSameEmail && nvWithSameEmail.MaNV.trim() !== accountId.trim()) {
        throw new ConflictError(`Email '${emailToCheck}' đã được sử dụng.`);
      }
    }
  }

  let affectedRows = 0;
  let updatedUser = null;

  try {
    if (role === 'NhaDauTu') {
      // Gọi hàm update của NDT Model (đổi tên thành updateDetails nếu muốn)
      affectedRows = await NhaDauTuModel.updateByMaNDT(accountId, updateData); // Hàm này đã có
      if (affectedRows > 0) {
        updatedUser = await NhaDauTuModel.findProfileByMaNDT(accountId); // Lấy profile mới
      } else {
        // Thử lấy user xem có tồn tại không nếu affectedRows = 0
        updatedUser = await NhaDauTuModel.findProfileByMaNDT(accountId);
        if (!updatedUser)
          throw new NotFoundError(`Không tìm thấy Nhà Đầu Tư '${accountId}'.`);
      }
    } else if (role === 'NhanVien') {
      // Gọi hàm update của NV Model
      affectedRows = await NhanVienModel.updateDetails(accountId, updateData); // Hàm mới thêm ở trên
      if (affectedRows > 0) {
        updatedUser = await NhanVienModel.findProfileByMaNV(accountId); // Lấy profile mới
      } else {
        updatedUser = await NhanVienModel.findProfileByMaNV(accountId);
        if (!updatedUser)
          throw new NotFoundError(`Không tìm thấy Nhân Viên '${accountId}'.`);
      }
    } else {
      throw new BadRequestError('Vai trò không hợp lệ.');
    }

    console.log(
      `Update for ${role} ${accountId} affected ${affectedRows} rows.`
    );
    if (!updatedUser) {
      throw new NotFoundError(
        `Không tìm thấy tài khoản ${role} '${accountId}' sau khi cập nhật.`
      );
    }
    return updatedUser; // Trả về thông tin mới nhất
  } catch (error) {
    console.error(`Error updating ${role} account ${accountId}:`, error);
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError
    ) {
      throw error; // Ném lại lỗi đã biết
    }
    if (error.message.includes('đã tồn tại')) {
      // Lỗi unique từ model
      throw new ConflictError(error.message);
    }
    throw new AppError(
      `Lỗi khi cập nhật tài khoản ${accountId}: ${error.message}`,
      500
    );
  }
};

/**
 * Admin xóa tài khoản NDT hoặc NV.
 * @param {string} accountId MaNDT hoặc MaNV.
 * @param {'NhaDauTu' | 'Nhanvien'} role Vai trò của tài khoản cần xóa.
 * @returns {Promise<{message: string}>}
 */
AdminService.deleteUserAccount = async (accountId, role) => {
  console.log(`Admin attempting to delete ${role} account: ${accountId}`);

  let affectedRows = 0;
  let successMessage = '';
  const pool = await db.getPool();
  const request = pool.request();
  request.input('LoginName', sql.NVarChar(128), accountId);
  try {
    if (role === 'NhaDauTu') {
      // Gọi hàm xóa NDT (đã có kiểm tra ràng buộc phức tạp trong model)
      affectedRows = await NhaDauTuModel.deleteByMaNDT(accountId);
      if (affectedRows === 0) {
        // Kiểm tra xem có tồn tại không nếu xóa 0 dòng
        const exists = await NhaDauTuModel.exists(accountId);
        if (!exists)
          throw new NotFoundError(
            `Không tìm thấy Nhà Đầu Tư '${accountId}' để xóa.`
          );
        else
          throw new AppError(
            `Xóa Nhà Đầu Tư '${accountId}' thất bại (có thể do lỗi không mong muốn).`,
            500
          );
      }
      // Xóa mật khẩu hash (dù bản ghi đã xóa) - không thực sự cần nhưng để nhất quán
      await NhaDauTuModel.clearPasswordHash(accountId); // Bỏ qua lỗi nếu có
      successMessage = `Nhà Đầu Tư '${accountId}' và các dữ liệu liên kết (TKNH) đã được xóa.`;
      await request.execute('dbo.sp_AdminXoaNguoiDung');
      console.log(`Dropped SQL Login/User for ${accountId}`);
    } else if (role === 'NhanVien') {
      // Gọi hàm xóa NV (có kiểm tra ràng buộc cơ bản trong model)
      affectedRows = await NhanVienModel.deleteByMaNV(accountId);
      if (affectedRows === 0) {
        const exists = await NhanVienModel.exists(accountId);
        if (!exists)
          throw new NotFoundError(
            `Không tìm thấy Nhân Viên '${accountId}' để xóa.`
          );
        else throw new AppError(`Xóa Nhân Viên '${accountId}' thất bại.`, 500);
      }
      // Xóa mật khẩu hash
      await NhanVienModel.clearPasswordHash(accountId); // Bỏ qua lỗi
      successMessage = `Nhân Viên '${accountId}' đã được xóa.`;
      await request.execute('dbo.sp_AdminXoaNguoiDung');
      console.log(`Dropped SQL Login/User for ${accountId}`);
    } else {
      throw new BadRequestError('Vai trò không hợp lệ.');
    }

    // --- QUAN TRỌNG: XÓA SQL LOGIN tương ứng (nếu còn dùng) ---
    // Mặc dù đã bỏ logic tạo SQL Login, nếu trước đó đã tạo, cần xóa đi
    // Hoặc nếu quyết định giữ lại SQL Login thì phải xóa ở đây
    /*
      try {
          console.log(`Attempting to drop SQL User/Login for ${accountId}`);
          await UserManagementModel.dropSqlUserAndLogin(accountId); // Giả sử model này còn
      } catch (dropLoginErr) {
           console.warn(`Could not drop SQL User/Login for ${accountId}: ${dropLoginErr.message}`);
           // Không nên throw lỗi ở đây vì user DB đã xóa thành công
      }
      */

    return { message: successMessage };
  } catch (error) {
    console.error(`Error deleting ${role} account ${accountId}:`, error);
    // Ném lại các lỗi đã biết
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError ||
      (error.message && error.message.includes('Không thể xóa'))
    ) {
      // Lỗi ràng buộc từ model được coi là Conflict hoặc BadRequest tùy ngữ cảnh
      throw new ConflictError(error.message); // 409 Conflict
    }
    throw new AppError(
      `Lỗi khi xóa tài khoản ${accountId}: ${error.message}`,
      500
    );
  }
};

// --- THÊM HÀM QUẢN LÝ TẤT CẢ TÀI KHOẢN NGÂN HÀNG ---

/** Lấy danh sách tất cả TKNH của tất cả NĐT */
AdminService.getAllBankAccounts = async () => {
  console.log('[Admin Service] Getting all bank accounts...');
  try {
    // Gọi hàm mới trong Model TKNH
    return await TaiKhoanNganHangModel.getAll();
  } catch (error) {
    console.error('Error in getAllBankAccounts service:', error);
    throw error; // Ném lại lỗi đã chuẩn hóa từ model hoặc lỗi chung
  }
};

/** Lấy chi tiết một TKNH bất kỳ theo MaTK */
AdminService.getBankAccountByMaTK = async (maTK) => {
  console.log(`[Admin Service] Getting bank account by MaTK: ${maTK}`);
  try {
    const account = await TaiKhoanNganHangModel.findByMaTK(maTK);
    if (!account) {
      throw new NotFoundError(
        `Không tìm thấy tài khoản ngân hàng với mã '${maTK}'.`
      );
    }
    return account;
  } catch (error) {
    console.error(`Error in getBankAccountByMaTK service for ${maTK}:`, error);
    if (error instanceof NotFoundError) throw error;
    throw new AppError(
      `Lỗi khi lấy thông tin tài khoản ${maTK}: ${error.message}`,
      500
    );
  }
};

/** Admin tạo mới TKNH cho một NĐT */
AdminService.createBankAccount = async (tknhData) => {
  console.log(
    `[Admin Service] Creating bank account ${tknhData.MaTK} for NDT ${tknhData.MaNDT}`
  );
  // 1. Kiểm tra NĐT tồn tại
  const ndtExists = await NhaDauTuModel.exists(tknhData.MaNDT);
  if (!ndtExists) {
    throw new BadRequestError(
      `Mã Nhà Đầu Tư '${tknhData.MaNDT}' không tồn tại.`
    );
  }
  // 2. Kiểm tra Ngân hàng tồn tại (Model create đã làm, nhưng check sớm hơn)
  // const bankExists = await NganHangModel.findByMaNH(tknhData.MaNH); // Cần import NganHangModel
  // throw new BadRequestError(`Mã Ngân hàng '${tknhData.MaNH}' không tồn tại.`);

  // 3. Gọi Model tạo TKNH (Model đã check trùng MaTK)
  try {
    const newAccount = await TaiKhoanNganHangModel.create(tknhData);
    return newAccount;
  } catch (error) {
    console.error('Error in createBankAccount service:', error);
    // Lỗi Conflict (trùng MaTK) hoặc FK (sai MaNH) từ Model
    if (
      error instanceof ConflictError ||
      error instanceof BadRequestError ||
      (error.message &&
        (error.message.includes('đã tồn tại') ||
          error.message.includes('không tồn tại')))
    ) {
      throw error;
    }
    throw new AppError(
      `Lỗi khi tạo tài khoản ngân hàng ${tknhData.MaTK}: ${error.message}`,
      500
    );
  }
};

/** Admin cập nhật TKNH (chỉ SoTien, MaNH) */
AdminService.updateBankAccount = async (maTK, updateData) => {
  console.log(`[Admin Service] Updating bank account: ${maTK}`);
  // 1. Kiểm tra TKNH tồn tại
  const existingAccount = await TaiKhoanNganHangModel.findByMaTK(maTK);
  if (!existingAccount) {
    throw new NotFoundError(
      `Không tìm thấy tài khoản ngân hàng '${maTK}' để cập nhật.`
    );
  }
  // 2. Kiểm tra MaNH mới có tồn tại không (nếu có cập nhật MaNH)
  if (updateData.MaNH) {
    const bankExists = await NganHangModel.findByMaNH(updateData.MaNH);
    if (!bankExists)
      throw new BadRequestError(
        `Mã Ngân hàng '${updateData.MaNH}' không tồn tại.`
      );
    console.warn(
      'Skipping Bank existence check during update. Relying on DB FK constraint.'
    );
  }
  // 3. Gọi Model cập nhật
  try {
    const affectedRows = await TaiKhoanNganHangModel.updateByMaTK(
      maTK,
      updateData
    );
    // ... (Xử lý affectedRows nếu cần) ...
    return await TaiKhoanNganHangModel.findByMaTK(maTK); // Lấy lại thông tin mới nhất
  } catch (error) {
    console.error(`Error in updateBankAccount service for ${maTK}:`, error);
    if (
      error instanceof ConflictError ||
      error instanceof BadRequestError ||
      error instanceof NotFoundError
    ) {
      throw error; // Lỗi unique TenNH hoặc FK MaNH từ model
    }
    throw new AppError(
      `Lỗi khi cập nhật tài khoản ngân hàng ${maTK}: ${error.message}`,
      500
    );
  }
};

/** Admin xóa TKNH */
AdminService.deleteBankAccount = async (maTK) => {
  console.log(`[Admin Service] Deleting bank account: ${maTK}`);
  // 1. Kiểm tra tồn tại trước khi xóa
  const existingAccount = await TaiKhoanNganHangModel.findByMaTK(maTK);
  if (!existingAccount) {
    throw new NotFoundError(
      `Không tìm thấy tài khoản ngân hàng '${maTK}' để xóa.`
    );
  }
  // 2. Gọi Model xóa (đã có check ràng buộc lệnh đặt, số dư)
  try {
    const affectedRows = await TaiKhoanNganHangModel.deleteByMaTK(maTK);
    // if (affectedRows === 0) { /* ... xử lý nếu cần ... */ }
    return { message: `Tài khoản ngân hàng '${maTK}' đã được xóa.` };
  } catch (error) {
    console.error(`Error in deleteBankAccount service for ${maTK}:`, error);
    // Lỗi Conflict từ model (còn lệnh đặt, còn tiền)
    if (
      error instanceof ConflictError ||
      (error.message && error.message.includes('Không thể xóa'))
    ) {
      throw new ConflictError(error.message);
    }
    if (error instanceof NotFoundError) throw error; // Nếu bị xóa trước đó
    throw new AppError(
      `Lỗi khi xóa tài khoản ngân hàng ${maTK}: ${error.message}`,
      500
    );
  }
};

/**
 * Admin lấy toàn bộ lịch sử giao dịch tiền (Nạp/Rút) trong khoảng thời gian.
 * @param {string | Date} tuNgay Ngày bắt đầu.
 * @param {string | Date} denNgay Ngày kết thúc.
 * @returns {Promise<Array<object>>}
 */
AdminService.getAllCashTransactions = async (tuNgay, denNgay) => {
  console.log(
    `[Admin Service] Getting all cash transactions from ${tuNgay} to ${denNgay}`
  );
  // Chuyển đổi ngày sang Date object nếu cần
  const startDate = new Date(tuNgay);
  const endDate = new Date(denNgay);

  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }

  try {
    const history = await GiaoDichTienModel.getAll(startDate, endDate); // Gọi hàm model mới
    return history;
  } catch (error) {
    console.error('Error in getAllCashTransactions service:', error);
    if (error instanceof AppError || error instanceof BadRequestError)
      throw error;
    throw new AppError(
      `Lỗi khi lấy toàn bộ lịch sử giao dịch tiền: ${error.message}`,
      500
    );
  }
};

// --- THÊM HÀM LẤY TẤT CẢ UNDO LOG ---
/**
 * Admin lấy toàn bộ lịch sử hành động có thể hoàn tác (Undo Log).
 * @param {object} [options] Tùy chọn phân trang/lọc.
 * @returns {Promise<Array<object>>}
 */
AdminService.getAllUndoLogs = async (options = {}) => {
  console.log('[Admin Service] Getting all undo logs with options:', options);
  try {
    const logs = await CoPhieuUndoLogModel.getAllLogs(options); // Gọi hàm model mới
    return logs;
  } catch (error) {
    console.error('Error in getAllUndoLogs service:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(`Lỗi khi lấy lịch sử hoàn tác: ${error.message}`, 500);
  }
};

/**
 * Admin lấy toàn bộ lịch sử lệnh đặt của tất cả NĐT trong khoảng thời gian.
 * @param {string | Date} tuNgay Ngày bắt đầu.
 * @param {string | Date} denNgay Ngày kết thúc.
 * @returns {Promise<Array<object>>}
 */
AdminService.getAllOrders = async (tuNgay, denNgay) => {
  console.log(
    `[Admin Service] Getting all orders from ${tuNgay} to ${denNgay}`
  );
  const startDate = new Date(tuNgay);
  const endDate = new Date(denNgay);

  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }

  try {
    const orders = await LenhDatModel.getAllOrdersAdmin(startDate, endDate); // Gọi hàm model mới
    return orders;
  } catch (error) {
    console.error('Error in getAllOrders service:', error);
    if (error instanceof AppError || error instanceof BadRequestError)
      throw error;
    throw new AppError(
      `Lỗi khi lấy toàn bộ lịch sử lệnh đặt: ${error.message}`,
      500
    );
  }
};

/**
 * Admin đặt lại mật khẩu cho một tài khoản NDT hoặc NV.
 * @param {string} accountId MaNDT hoặc MaNV cần đặt lại mật khẩu.
 * @param {'NhaDauTu' | 'NhanVien'} role Vai trò của tài khoản.
 * @param {string} newPassword Mật khẩu mới (chưa hash).
 * @param {string} performedBy MaNV thực hiện (để ghi log nếu cần).
 * @returns {Promise<{message: string}>}
 */
AdminService.resetUserPassword = async (
  accountId,
  role,
  newPassword,
  performedBy
) => {
  console.log(
    `Admin ${performedBy} attempting to reset password for ${role} ${accountId}`
  );

  let userExists = false;
  let updateHashFunction;

  // 1. Xác định model và kiểm tra tài khoản tồn tại
  if (role === 'NhaDauTu') {
    userExists = await NhaDauTuModel.exists(accountId);
    updateHashFunction = NhaDauTuModel.updatePasswordHash;
  } else if (role === 'NhanVien') {
    userExists = await NhanVienModel.exists(accountId);
    updateHashFunction = NhanVienModel.updatePasswordHash;
  } else {
    throw new BadRequestError('Vai trò không hợp lệ.');
  }

  if (!userExists) {
    throw new NotFoundError(
      `Không tìm thấy tài khoản ${role} với mã '${accountId}'.`
    );
  }

  // 2. Hash mật khẩu mới
  const newHashedPassword = await passwordHasher.hashPassword(newPassword);

  // 3. Cập nhật mật khẩu hash trong DB
  try {
    await updateHashFunction(accountId, newHashedPassword);
    console.log(`Password hash updated successfully for ${role} ${accountId}.`);

    return {
      message: `Đặt lại mật khẩu cho ${role} '${accountId}' thành công.`,
    };
  } catch (error) {
    console.error(`Error resetting password for ${role} ${accountId}:`, error);
    // Lỗi có thể từ updateHashFunction (ví dụ: model không tìm thấy user dù exists trả về true - race condition?)
    if (error instanceof NotFoundError || error instanceof BadRequestError)
      throw error;
    throw new AppError(
      `Lỗi khi đặt lại mật khẩu cho ${accountId}: ${error.message}`,
      500
    );
  }
};

/**
 * Admin phân bổ cổ phiếu đang chờ niêm yết cho các nhà đầu tư.
 * @param {string} maCP Mã cổ phiếu cần phân bổ (phải có Status=0).
 * @param {Array<{maNDT: string, soLuong: number}>} distributionList Danh sách phân bổ.

 * @param {string} performedBy Mã Admin thực hiện.
 * @returns {Promise<{message: string, totalDistributed: number}>}
 */
AdminService.distributeStock = async (maCP, distributionList, performedBy) => {
  console.log(
    `[Admin Service] Request to distribute stock ${maCP} by ${performedBy}.`
  );

  // --- Validate đầu vào ---
  if (!maCP) throw new BadRequestError('Mã cổ phiếu là bắt buộc.');
  if (!Array.isArray(distributionList) || distributionList.length === 0) {
    throw new BadRequestError('Danh sách phân bổ không hợp lệ hoặc rỗng.');
  }

  let totalQuantityToDistribute = 0;

  const validationPromises = [];
  for (const item of distributionList) {
    // Kiểm tra cấu trúc từng item (bao gồm cả maTK và gia)
    if (
      !item.maNDT ||
      !item.maTK ||
      typeof item.soLuong !== 'number' ||
      !Number.isInteger(item.soLuong) ||
      item.soLuong <= 0 ||
      item.gia === undefined ||
      item.gia === null ||
      typeof item.gia !== 'number' ||
      item.gia < 0
    ) {
      throw new BadRequestError(
        `Dữ liệu phân bổ không hợp lệ: Thiếu hoặc sai định dạng MaNDT/MaTK/Số lượng/Giá.`
      );
    }
    totalQuantityToDistribute += item.soLuong;

    // Tạo promise để kiểm tra NĐT và TKNH có khớp không
    validationPromises.push(
      TaiKhoanNganHangModel.findByMaTK(item.maTK).then((account) => {
        if (!account) {
          throw new BadRequestError(
            `Tài khoản ngân hàng '${item.maTK}' không tồn tại.`
          );
        }
        console.log(account.MaNDT);
        console.log(item.maNDT);
        console.log(item.maNDT === account.MaNDT);
        if (account.MaNDT.trim() !== item.maNDT.trim()) {
          throw new BadRequestError(
            `Tài khoản '${item.maTK}' không thuộc về Nhà đầu tư '${item.maNDT}'.`
          );
        }
        // Kiểm tra sơ bộ số dư nếu có giá > 0
        if (item.gia > 0 && account.SoTien < item.soLuong * item.gia) {
          throw new BadRequestError(
            `NĐT ${item.maNDT} không đủ số dư trong tài khoản ${
              item.maTK
            } (${account.SoTien.toLocaleString('vi-VN')}đ) để nhận ${
              item.soLuong
            } ${maCP} với giá ${item.gia.toLocaleString('vi-VN')}đ.`
          );
        }
        return true; // Promise giải quyết thành true nếu hợp lệ
      })
    );
  }

  // --- Kiểm tra Cổ phiếu và Số lượng ---
  const stockInfo = await CoPhieuModel.findByMaCP(maCP);
  if (!stockInfo) throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
  if (stockInfo.Status !== 0)
    throw new BadRequestError(
      `Chỉ có thể phân bổ cổ phiếu đang ở trạng thái 'Chờ niêm yết' (Status=0). Status hiện tại: ${stockInfo.Status}.`
    );

  const totalDistributedPreviously =
    await CoPhieuModel.getTotalDistributedQuantity(maCP);
  const remainingToDistribute =
    stockInfo.SoLuongPH - totalDistributedPreviously;

  if (totalQuantityToDistribute > remainingToDistribute) {
    throw new BadRequestError(
      `Tổng số lượng phân bổ (${totalQuantityToDistribute}) vượt quá số lượng còn lại có thể phân bổ (${remainingToDistribute}) của mã CP ${maCP}.`
    );
  }

  // --- Thực thi tất cả các kiểm tra NĐT và TKNH ---
  try {
    await Promise.all(validationPromises); // Chờ tất cả các kiểm tra hoàn tất
    console.log(
      '[Admin Service] All investor accounts validated successfully.'
    );
  } catch (validationError) {
    // Nếu bất kỳ kiểm tra nào thất bại, ném lỗi đó ra
    console.error(
      '[Admin Service] Account validation failed:',
      validationError
    );
    throw validationError; // Ném lại lỗi BadRequestError đã tạo
  }

  // --- Thực hiện Phân bổ trong Transaction ---
  let transaction;
  const pool = await db.getPool();
  transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = transaction.request(); // Request dùng chung cho transaction

    for (const item of distributionList) {
      const { maNDT, maTK, soLuong, gia } = item;

      // 1. Cập nhật bảng SOHUU (dùng hàm mới trong transaction)
      await SoHuuModel.updateOrDeleteQuantity(request, maNDT, maCP, soLuong);

      // 2. Trừ tiền NĐT NẾU gia > 0, sử dụng maTK đã cung cấp
      if (gia > 0) {
        const amountToDeduct = soLuong * gia;
        console.log(
          `[Distribute Stock TXN] Attempting to deduct ${amountToDeduct} from account ${maTK} (NDT ${maNDT})...`
        );
        // Gọi decreaseBalance với MaTK cụ thể
        await TaiKhoanNganHangModel.decreaseBalance(
          request,
          maTK,
          amountToDeduct
        ); // Hàm này sẽ check lại số dư lần cuối
        console.log(
          `[Distribute Stock TXN] Deducted ${amountToDeduct} from account ${maTK}.`
        );
        // (Tùy chọn) Ghi log GIAODICHTIEN
      } else {
        console.log(
          `[Distribute Stock TXN] Assigning ${soLuong} ${maCP} to NDT ${maNDT} (Account ${maTK}) for free.`
        );
      }
    } // Kết thúc for loop

    await transaction.commit();

    const newTotalDistributed =
      totalDistributedPreviously + totalQuantityToDistribute;
    console.log(
      `[Distribute Stock] Transaction committed for ${maCP}. Total distributed now: ${newTotalDistributed}`
    );
    return {
      message: `Phân bổ ${totalQuantityToDistribute} cổ phiếu '${maCP}' thành công. Tổng số đã phân bổ: ${newTotalDistributed}/${stockInfo.SoLuongPH}.`,
      totalDistributed: newTotalDistributed,
    };
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    console.error(`[Distribute Stock] Transaction Error for ${maCP}:`, error);
    // Ném lại lỗi từ các model hoặc lỗi chung
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError ||
      error instanceof AppError
    )
      throw error;
    if (error.message && error.message.includes('không đủ')) {
      // Lỗi từ decreaseBalance nếu có
      throw new BadRequestError(error.message);
    }
    throw new AppError(
      `Lỗi khi phân bổ cổ phiếu ${maCP}: ${error.message}`,
      500
    );
  }
};

// --- THÊM HÀM QUẢN LÝ PHÂN BỔ ---

/** Lấy danh sách NĐT và số lượng đã được phân bổ cho một mã CP (Status=0) */
AdminService.getDistributionList = async (maCP) => {
  console.log(`[Admin Service] Getting distribution list for ${maCP}`);
  try {
    // Kiểm tra CP tồn tại và Status = 0
    const stockInfo = await CoPhieuModel.findByMaCP(maCP);
    if (!stockInfo)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (stockInfo.Status !== 0)
      throw new BadRequestError(
        `Chỉ xem được danh sách phân bổ của cổ phiếu đang 'Chờ niêm yết'. Status hiện tại: ${stockInfo.Status}.`
      );

    // Query vào SOHUU và join NDT
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);
    const query = `
          SELECT sh.MaNDT, ndt.HoTen AS TenNDT, sh.SoLuong
          FROM SOHUU sh
          JOIN NDT ndt ON sh.MaNDT = ndt.MaNDT
          WHERE sh.MaCP = @MaCP AND sh.SoLuong > 0 -- Chỉ lấy NĐT đang thực sự sở hữu
          ORDER BY ndt.HoTen;
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    console.error(
      `[Admin Service] Error getting distribution list for ${maCP}:`,
      error
    );
    if (error instanceof NotFoundError || error instanceof BadRequestError)
      throw error;
    throw new AppError(`Lỗi khi lấy danh sách phân bổ: ${error.message}`, 500);
  }
};

/** Admin thu hồi (xóa) toàn bộ phân bổ của một NĐT cho một mã CP (Status=0) */ // vì quá khó để triển khai nên thôi tạm thời bỏ qua
AdminService.revokeDistributionForInvestor = async (
  maCP,
  maNDT,
  performedBy
) => {
  console.log(
    `[Admin Service] Revoking distribution for NDT ${maNDT} from stock ${maCP} by ${performedBy}`
  );
  let transaction;
  const pool = await db.getPool();
  transaction = new sql.Transaction(pool);
  try {
    // Kiểm tra CP tồn tại và Status = 0
    const stockInfo = await CoPhieuModel.findByMaCP(maCP);
    if (!stockInfo)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (stockInfo.Status !== 0)
      throw new BadRequestError(
        `Chỉ thu hồi phân bổ được khi cổ phiếu đang 'Chờ niêm yết'.`
      );

    // Kiểm tra NĐT tồn tại (tùy chọn)
    // const ndtExists = await NhaDauTuModel.exists(maNDT);
    // if (!ndtExists) throw new NotFoundError(`Nhà đầu tư '${maNDT}' không tồn tại.`);

    await transaction.begin();
    const request = transaction.request();

    // Lấy số lượng hiện tại để biết có gì để xóa không
    const currentQuantity = await SoHuuModel.getSoLuong(maNDT, maCP); // Hàm getSoLuong cần được sửa để có thể chạy trong trans nếu cần

    if (currentQuantity > 0) {
      // Gọi hàm updateOrDelete với số lượng âm để xóa hoặc giảm về 0
      // Truyền transaction request vào nếu hàm model hỗ trợ
      await SoHuuModel.updateOrDeleteQuantity(
        request,
        maNDT,
        maCP,
        -currentQuantity
      );

      // TODO: Hoàn tiền cho NĐT nếu việc phân bổ ban đầu có tính phí? (Phức tạp)
    } else {
      console.log(
        `[Admin Service] NDT ${maNDT} currently holds 0 of ${maCP}. No revocation needed.`
      );
    }

    await transaction.commit();
    return {
      message: `Đã thu hồi toàn bộ phân bổ cổ phiếu '${maCP}' cho Nhà đầu tư '${maNDT}'.`,
    };
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    console.error(
      `[Admin Service] Error revoking distribution for ${maNDT} from ${maCP}:`,
      error
    );
    throw error;
  }
};

/** Admin cập nhật số lượng phân bổ cho một NĐT (Status=0) */ // vì quá khó để triển khai nên thôi tạm thời bỏ qua
AdminService.updateDistributionForInvestor = async (
  maCP,
  maNDT,
  newSoLuong,
  performedBy
) => {
  console.log(
    `[Admin Service] Updating distribution for NDT ${maNDT} on stock ${maCP} to ${newSoLuong} by ${performedBy}`
  );
  if (
    typeof newSoLuong !== 'number' ||
    !Number.isInteger(newSoLuong) ||
    newSoLuong < 0
  ) {
    throw new BadRequestError('Số lượng mới phải là số nguyên không âm.');
  }

  let transaction;
  const pool = await db.getPool();
  transaction = new sql.Transaction(pool);
  try {
    // Kiểm tra CP tồn tại và Status = 0
    const stockInfo = await CoPhieuModel.findByMaCP(maCP);
    if (!stockInfo)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (stockInfo.Status !== 0)
      throw new BadRequestError(
        `Chỉ cập nhật phân bổ được khi cổ phiếu đang 'Chờ niêm yết'.`
      );

    // Kiểm tra NĐT tồn tại
    const ndtExists = await NhaDauTuModel.exists(maNDT);
    if (!ndtExists)
      throw new NotFoundError(`Nhà đầu tư '${maNDT}' không tồn tại.`);

    await transaction.begin();
    const request = transaction.request();

    // Lấy số lượng hiện tại và tổng đã phân bổ
    const currentQuantity = await SoHuuModel.getSoLuong(maNDT, maCP); // Hàm này có thể cần chạy ngoài trans hoặc nhận trans
    const totalDistributed = await CoPhieuModel.getTotalDistributedQuantity(
      maCP
    ); // Hàm này nên chạy ngoài trans

    // Tính toán số lượng thay đổi
    const quantityChange = newSoLuong - currentQuantity;
    const newTotalDistributed = totalDistributed + quantityChange;

    // Kiểm tra số lượng mới có hợp lệ không
    if (newTotalDistributed > stockInfo.SoLuongPH) {
      throw new BadRequestError(
        `Số lượng mới (${newSoLuong}) làm tổng phân bổ (${newTotalDistributed}) vượt quá tổng phát hành (${stockInfo.SoLuongPH}).`
      );
    }

    // Gọi hàm update/delete/insert
    await SoHuuModel.updateOrDeleteQuantity(
      request,
      maNDT,
      maCP,
      quantityChange
    );

    // TODO: Xử lý tiền nếu giá phân bổ thay đổi hoặc số lượng thay đổi? (Rất phức tạp)

    await transaction.commit();
    return {
      message: `Đã cập nhật số lượng phân bổ cổ phiếu '${maCP}' cho Nhà đầu tư '${maNDT}' thành ${newSoLuong}.`,
    };
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    console.error(
      `[Admin Service] Error updating distribution for ${maNDT} on ${maCP}:`,
      error
    );
    throw error;
  }
};

module.exports = AdminService;
