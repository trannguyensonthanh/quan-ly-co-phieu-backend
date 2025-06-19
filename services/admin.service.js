/**
 * services/admin.service.js
 * Service layer for Admin operations: user management, backup/restore, stock distribution, etc.
 */

const NhanVienModel = require('../models/NhanVien.model');
const NhaDauTuModel = require('../models/NhaDauTu.model');
const passwordHasher = require('../utils/passwordHasher');
const BackupRestoreModel = require('../models/BackupRestore.model');
const path = require('path');
const BadRequestError = require('../utils/errors/BadRequestError');
const NotFoundError = require('../utils/errors/NotFoundError');
const AppError = require('../utils/errors/AppError');
const ConflictError = require('../utils/errors/ConflictError');
const sql = require('mssql');
const dbConfig = require('../config/db.config');
const NhanVienService = require('./nhanvien.service');
const AdminModel = require('../models/Admin.model');
const fs = require('fs').promises;
const db = require('../models/db');
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

/**
 * Admin tạo tài khoản Nhà Đầu Tư mới, bao gồm việc hash mật khẩu.
 */
AdminService.createInvestorAccount = async (
  ndtData,
  rawPassword,
  performedBy
) => {
  console.log(`Admin ${performedBy} creating Investor ${ndtData.MaNDT}`);
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

  const hashedPassword = await passwordHasher.hashPassword(rawPassword);

  try {
    const createdNdt = await NhaDauTuModel.create({
      ...ndtData,
      MKGD: hashedPassword,
    });

    if (!createdNdt) throw new AppError('Tạo NĐT thất bại.', 500);
    const pool = await db.getPool();
    const request = pool.request();
    request.input('LoginName', sql.NVarChar(128), ndtData.MaNDT);
    request.input('Password', sql.NVarChar(256), rawPassword);
    request.input('RoleName', sql.NVarChar(128), 'NhaDauTuRole');
    await request.execute('dbo.sp_AdminTaoNguoiDung');
    console.log(`Created SQL Login/User for ${ndtData.MaNDT}`);

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

/**
 * Admin tạo tài khoản Nhân Viên mới, bao gồm việc hash mật khẩu.
 */
AdminService.createStaffAccount = async (nvData, rawPassword, performedBy) => {
  console.log(`Admin ${performedBy} creating Staff ${nvData.MaNV}`);
  try {
    const result = await NhanVienService.createNhanVien(nvData, rawPassword);
    return result;
  } catch (error) {
    throw error;
  }
};

/**
 * Service xóa "tài khoản ứng dụng" (trước đây là deleteLogin)
 */
AdminService.clearUserPassword = async (targetUserId) => {
  let clearedNV = false;
  let clearedNDT = false;

  try {
    clearedNV = await NhanVienModel.clearPasswordHash(targetUserId);
  } catch (err) {
    console.warn(`Could not clear NV hash for ${targetUserId}: ${err.message}`);
  }

  try {
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
    console.warn(
      `No user found or no password hash to clear for ${targetUserId}.`
    );
    return {
      message: `Không tìm thấy mật khẩu để xóa cho tài khoản '${targetUserId}'.`,
    };
  }
};

/**
 * Service: Thực hiện backup (Full hoặc Log).
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

/**
 * Service: Thực hiện Restore.
 */
AdminService.performRestore = async (positions, pointInTime = null) => {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new BadRequestError(
      'Vui lòng chọn ít nhất một bản sao lưu để phục hồi.'
    );
  }
  const sortedPositions = positions.sort((a, b) => a - b);

  console.log(
    `[SERVICE] Restore request received. Positions: [${sortedPositions.join(
      ', '
    )}]. Point-in-time: ${pointInTime || 'N/A'}`
  );

  try {
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
    throw error;
  }
};

/**
 * Service: Tạo backup device.
 */
AdminService.createBackupDevice = async () => {
  try {
    console.log('[SERVICE] Request to create backup device...');
    const result = await BackupRestoreModel.createBackupDevice();
    return {
      message: `Thiết bị sao lưu '${result.deviceName}' đã được tạo hoặc xác nhận tồn tại.`,
      ...result,
    };
  } catch (error) {
    console.error('[SERVICE] Error creating backup device:', error);
    throw error;
  }
};

/**
 * Service: Lấy danh sách các bản backup từ device.
 */
AdminService.getBackupHistory = async () => {
  try {
    console.log('[SERVICE] Getting backup history from device...');
    const history = await BackupRestoreModel.getBackupListFromDevice();
    return history.sort((a, b) => b.position - a.position);
  } catch (error) {
    console.error('[SERVICE] Error getting backup history:', error);
    throw error;
  }
};

/**
 * Chuẩn bị giá tham chiếu/trần/sàn cho ngày giao dịch tiếp theo.
 */
AdminService.prepareNextDayPrices = async () => {
  console.log('[SERVICE PREPARE PRICES] Request received.');
  try {
    const pool = await db.getPool();
    const todayResult = await pool
      .request()
      .query('SELECT CAST(GETDATE() AS DATE) as TodayDate');
    const ngayHienTai = todayResult.recordset[0].TodayDate;

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

    const request = pool.request();
    request.input('NgayHienTai', sql.Date, ngayHienTai);
    request.input('NgayTiepTheo', sql.Date, ngayTiepTheo);

    await request.execute('dbo.sp_PrepareNextDayPrices');

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
 */
AdminService.getAllUsers = async () => {
  console.log('[Admin Service] Getting all users (Staff + Investors)...');
  try {
    const users = await NhanVienModel.getAllUsersForAdmin();
    return users;
  } catch (error) {
    console.error('Error in getAllUsers service:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Lỗi khi lấy danh sách người dùng: ${error.message}`,
      500
    );
  }
};

/**
 * Admin cập nhật thông tin cơ bản cho NDT hoặc NV.
 */
AdminService.updateUserAccount = async (accountId, role, updateData) => {
  console.log(`Admin attempting to update ${role} account: ${accountId}`);

  if (updateData.CMND || updateData.Email) {
    let currentUser = null;
    if (role === 'NhaDauTu')
      currentUser = await NhaDauTuModel.findByMaNDT(accountId);
    else if (role === 'NhanVien')
      currentUser = await NhanVienModel.findByMaNV(accountId);

    const cmndToCheck =
      updateData.CMND && currentUser && updateData.CMND !== currentUser.CMND
        ? updateData.CMND
        : null;
    const emailToCheck =
      updateData.Email && currentUser && updateData.Email !== currentUser.Email
        ? updateData.Email
        : null;

    if (cmndToCheck) {
      const ndtWithSameCMND = await NhaDauTuModel.findByCMND(cmndToCheck);
      if (
        ndtWithSameCMND &&
        ndtWithSameCMND.MaNDT.trim() !== accountId.trim()
      ) {
        throw new ConflictError(`Số CMND '${cmndToCheck}' đã được sử dụng.`);
      }
      const nvWithSameCMND = await NhanVienModel.findByCMND(cmndToCheck);
      if (nvWithSameCMND && nvWithSameCMND.MaNV.trim() !== accountId.trim()) {
        throw new ConflictError(`Số CMND '${cmndToCheck}' đã được sử dụng.`);
      }
    }

    if (emailToCheck) {
      const ndtWithSameEmail = await NhaDauTuModel.findByEmail(emailToCheck);
      if (
        ndtWithSameEmail &&
        ndtWithSameEmail.MaNDT.trim() !== accountId.trim()
      ) {
        throw new ConflictError(`Email '${emailToCheck}' đã được sử dụng.`);
      }
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
      affectedRows = await NhaDauTuModel.updateByMaNDT(accountId, updateData);
      if (affectedRows > 0) {
        updatedUser = await NhaDauTuModel.findProfileByMaNDT(accountId);
      } else {
        updatedUser = await NhaDauTuModel.findProfileByMaNDT(accountId);
        if (!updatedUser)
          throw new NotFoundError(`Không tìm thấy Nhà Đầu Tư '${accountId}'.`);
      }
    } else if (role === 'NhanVien') {
      affectedRows = await NhanVienModel.updateDetails(accountId, updateData);
      if (affectedRows > 0) {
        updatedUser = await NhanVienModel.findProfileByMaNV(accountId);
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
    return updatedUser;
  } catch (error) {
    console.error(`Error updating ${role} account ${accountId}:`, error);
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    if (error.message.includes('đã tồn tại')) {
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
      affectedRows = await NhaDauTuModel.deleteByMaNDT(accountId);
      if (affectedRows === 0) {
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
      await NhaDauTuModel.clearPasswordHash(accountId);
      successMessage = `Nhà Đầu Tư '${accountId}' và các dữ liệu liên kết (TKNH) đã được xóa.`;
      await request.execute('dbo.sp_AdminXoaNguoiDung');
      console.log(`Dropped SQL Login/User for ${accountId}`);
    } else if (role === 'NhanVien') {
      affectedRows = await NhanVienModel.deleteByMaNV(accountId);
      if (affectedRows === 0) {
        const exists = await NhanVienModel.exists(accountId);
        if (!exists)
          throw new NotFoundError(
            `Không tìm thấy Nhân Viên '${accountId}' để xóa.`
          );
        else throw new AppError(`Xóa Nhân Viên '${accountId}' thất bại.`, 500);
      }
      await NhanVienModel.clearPasswordHash(accountId);
      successMessage = `Nhân Viên '${accountId}' đã được xóa.`;
      await request.execute('dbo.sp_AdminXoaNguoiDung');
      console.log(`Dropped SQL Login/User for ${accountId}`);
    } else {
      throw new BadRequestError('Vai trò không hợp lệ.');
    }

    return { message: successMessage };
  } catch (error) {
    console.error(`Error deleting ${role} account ${accountId}:`, error);
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError ||
      (error.message && error.message.includes('Không thể xóa'))
    ) {
      throw new ConflictError(error.message);
    }
    throw new AppError(
      `Lỗi khi xóa tài khoản ${accountId}: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy danh sách tất cả TKNH của tất cả NĐT
 */
AdminService.getAllBankAccounts = async () => {
  console.log('[Admin Service] Getting all bank accounts...');
  try {
    return await TaiKhoanNganHangModel.getAll();
  } catch (error) {
    console.error('Error in getAllBankAccounts service:', error);
    throw error;
  }
};

/**
 * Lấy chi tiết một TKNH bất kỳ theo MaTK
 */
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

/**
 * Admin tạo mới TKNH cho một NĐT
 */
AdminService.createBankAccount = async (tknhData) => {
  console.log(
    `[Admin Service] Creating bank account ${tknhData.MaTK} for NDT ${tknhData.MaNDT}`
  );
  const ndtExists = await NhaDauTuModel.exists(tknhData.MaNDT);
  if (!ndtExists) {
    throw new BadRequestError(
      `Mã Nhà Đầu Tư '${tknhData.MaNDT}' không tồn tại.`
    );
  }
  try {
    const newAccount = await TaiKhoanNganHangModel.create(tknhData);
    return newAccount;
  } catch (error) {
    console.error('Error in createBankAccount service:', error);
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

/**
 * Admin cập nhật TKNH (chỉ SoTien, MaNH)
 */
AdminService.updateBankAccount = async (maTK, updateData) => {
  console.log(`[Admin Service] Updating bank account: ${maTK}`);
  const existingAccount = await TaiKhoanNganHangModel.findByMaTK(maTK);
  if (!existingAccount) {
    throw new NotFoundError(
      `Không tìm thấy tài khoản ngân hàng '${maTK}' để cập nhật.`
    );
  }
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
  try {
    const affectedRows = await TaiKhoanNganHangModel.updateByMaTK(
      maTK,
      updateData
    );
    return await TaiKhoanNganHangModel.findByMaTK(maTK);
  } catch (error) {
    console.error(`Error in updateBankAccount service for ${maTK}:`, error);
    if (
      error instanceof ConflictError ||
      error instanceof BadRequestError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }
    throw new AppError(
      `Lỗi khi cập nhật tài khoản ngân hàng ${maTK}: ${error.message}`,
      500
    );
  }
};

/**
 * Admin xóa TKNH
 */
AdminService.deleteBankAccount = async (maTK) => {
  console.log(`[Admin Service] Deleting bank account: ${maTK}`);
  const existingAccount = await TaiKhoanNganHangModel.findByMaTK(maTK);
  if (!existingAccount) {
    throw new NotFoundError(
      `Không tìm thấy tài khoản ngân hàng '${maTK}' để xóa.`
    );
  }
  try {
    const affectedRows = await TaiKhoanNganHangModel.deleteByMaTK(maTK);
    return { message: `Tài khoản ngân hàng '${maTK}' đã được xóa.` };
  } catch (error) {
    console.error(`Error in deleteBankAccount service for ${maTK}:`, error);
    if (
      error instanceof ConflictError ||
      (error.message && error.message.includes('Không thể xóa'))
    ) {
      throw new ConflictError(error.message);
    }
    if (error instanceof NotFoundError) throw error;
    throw new AppError(
      `Lỗi khi xóa tài khoản ngân hàng ${maTK}: ${error.message}`,
      500
    );
  }
};

/**
 * Admin lấy toàn bộ lịch sử giao dịch tiền (Nạp/Rút) trong khoảng thời gian.
 */
AdminService.getAllCashTransactions = async (tuNgay, denNgay) => {
  console.log(
    `[Admin Service] Getting all cash transactions from ${tuNgay} to ${denNgay}`
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
    const history = await GiaoDichTienModel.getAll(startDate, endDate);
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

/**
 * Admin lấy toàn bộ lịch sử hành động có thể hoàn tác (Undo Log).
 */
AdminService.getAllUndoLogs = async (options = {}) => {
  console.log('[Admin Service] Getting all undo logs with options:', options);
  try {
    const logs = await CoPhieuUndoLogModel.getAllLogs(options);
    return logs;
  } catch (error) {
    console.error('Error in getAllUndoLogs service:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(`Lỗi khi lấy lịch sử hoàn tác: ${error.message}`, 500);
  }
};

/**
 * Admin lấy toàn bộ lịch sử lệnh đặt của tất cả NĐT trong khoảng thời gian.
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
    const orders = await LenhDatModel.getAllOrdersAdmin(startDate, endDate);
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

  const newHashedPassword = await passwordHasher.hashPassword(newPassword);

  try {
    await updateHashFunction(accountId, newHashedPassword);
    console.log(`Password hash updated successfully for ${role} ${accountId}.`);

    return {
      message: `Đặt lại mật khẩu cho ${role} '${accountId}' thành công.`,
    };
  } catch (error) {
    console.error(`Error resetting password for ${role} ${accountId}:`, error);
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
 */
AdminService.distributeStock = async (maCP, distributionList, performedBy) => {
  console.log(
    `[Admin Service] Request to distribute stock ${maCP} by ${performedBy}.`
  );

  if (!maCP) throw new BadRequestError('Mã cổ phiếu là bắt buộc.');
  if (!Array.isArray(distributionList) || distributionList.length === 0) {
    throw new BadRequestError('Danh sách phân bổ không hợp lệ hoặc rỗng.');
  }

  let totalQuantityToDistribute = 0;

  const validationPromises = [];
  for (const item of distributionList) {
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

    validationPromises.push(
      TaiKhoanNganHangModel.findByMaTK(item.maTK).then((account) => {
        if (!account) {
          throw new BadRequestError(
            `Tài khoản ngân hàng '${item.maTK}' không tồn tại.`
          );
        }
        if (account.MaNDT.trim() !== item.maNDT.trim()) {
          throw new BadRequestError(
            `Tài khoản '${item.maTK}' không thuộc về Nhà đầu tư '${item.maNDT}'.`
          );
        }
        if (item.gia > 0 && account.SoTien < item.soLuong * item.gia) {
          throw new BadRequestError(
            `NĐT ${item.maNDT} không đủ số dư trong tài khoản ${
              item.maTK
            } (${account.SoTien.toLocaleString('vi-VN')}đ) để nhận ${
              item.soLuong
            } ${maCP} với giá ${item.gia.toLocaleString('vi-VN')}đ.`
          );
        }
        return true;
      })
    );
  }

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

  try {
    await Promise.all(validationPromises);
    console.log(
      '[Admin Service] All investor accounts validated successfully.'
    );
  } catch (validationError) {
    console.error(
      '[Admin Service] Account validation failed:',
      validationError
    );
    throw validationError;
  }

  let transaction;
  const pool = await db.getPool();
  transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = transaction.request();

    for (const item of distributionList) {
      const { maNDT, maTK, soLuong, gia } = item;

      await SoHuuModel.updateOrDeleteQuantity(request, maNDT, maCP, soLuong);

      if (gia > 0) {
        const amountToDeduct = soLuong * gia;
        console.log(
          `[Distribute Stock TXN] Attempting to deduct ${amountToDeduct} from account ${maTK} (NDT ${maNDT})...`
        );
        await TaiKhoanNganHangModel.decreaseBalance(
          request,
          maTK,
          amountToDeduct
        );
        console.log(
          `[Distribute Stock TXN] Deducted ${amountToDeduct} from account ${maTK}.`
        );
      } else {
        console.log(
          `[Distribute Stock TXN] Assigning ${soLuong} ${maCP} to NDT ${maNDT} (Account ${maTK}) for free.`
        );
      }
    }

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
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError ||
      error instanceof AppError
    )
      throw error;
    if (error.message && error.message.includes('không đủ')) {
      throw new BadRequestError(error.message);
    }
    throw new AppError(
      `Lỗi khi phân bổ cổ phiếu ${maCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy danh sách NĐT và số lượng đã được phân bổ cho một mã CP (Status=0)
 */
AdminService.getDistributionList = async (maCP) => {
  console.log(`[Admin Service] Getting distribution list for ${maCP}`);
  try {
    const stockInfo = await CoPhieuModel.findByMaCP(maCP);
    if (!stockInfo)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (stockInfo.Status !== 0)
      throw new BadRequestError(
        `Chỉ xem được danh sách phân bổ của cổ phiếu đang 'Chờ niêm yết'. Status hiện tại: ${stockInfo.Status}.`
      );

    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);
    const query = `
          SELECT sh.MaNDT, ndt.HoTen AS TenNDT, sh.SoLuong
          FROM SOHUU sh
          JOIN NDT ndt ON sh.MaNDT = ndt.MaNDT
          WHERE sh.MaCP = @MaCP AND sh.SoLuong > 0
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

/**
 * Admin thu hồi (xóa) toàn bộ phân bổ của một NĐT cho một mã CP (Status=0)
 */
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
    const stockInfo = await CoPhieuModel.findByMaCP(maCP);
    if (!stockInfo)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (stockInfo.Status !== 0)
      throw new BadRequestError(
        `Chỉ thu hồi phân bổ được khi cổ phiếu đang 'Chờ niêm yết'.`
      );

    await transaction.begin();
    const request = transaction.request();

    const currentQuantity = await SoHuuModel.getSoLuong(maNDT, maCP);

    if (currentQuantity > 0) {
      await SoHuuModel.updateOrDeleteQuantity(
        request,
        maNDT,
        maCP,
        -currentQuantity
      );
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

/**
 * Admin cập nhật số lượng phân bổ cho một NĐT (Status=0)
 */
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
    const stockInfo = await CoPhieuModel.findByMaCP(maCP);
    if (!stockInfo)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (stockInfo.Status !== 0)
      throw new BadRequestError(
        `Chỉ cập nhật phân bổ được khi cổ phiếu đang 'Chờ niêm yết'.`
      );

    const ndtExists = await NhaDauTuModel.exists(maNDT);
    if (!ndtExists)
      throw new NotFoundError(`Nhà đầu tư '${maNDT}' không tồn tại.`);

    await transaction.begin();
    const request = transaction.request();

    const currentQuantity = await SoHuuModel.getSoLuong(maNDT, maCP);
    const totalDistributed = await CoPhieuModel.getTotalDistributedQuantity(
      maCP
    );

    const quantityChange = newSoLuong - currentQuantity;
    const newTotalDistributed = totalDistributed + quantityChange;

    if (newTotalDistributed > stockInfo.SoLuongPH) {
      throw new BadRequestError(
        `Số lượng mới (${newSoLuong}) làm tổng phân bổ (${newTotalDistributed}) vượt quá tổng phát hành (${stockInfo.SoLuongPH}).`
      );
    }

    await SoHuuModel.updateOrDeleteQuantity(
      request,
      maNDT,
      maCP,
      quantityChange
    );

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

/**
 * Service: Gọi SP để chuẩn bị giá (TC, Trần, Sàn) cho ngày giao dịch hiện tại.
 */
AdminService.prepareTodayPrices = async () => {
  console.log('[SERVICE] Request to prepare prices for TODAY.');
  try {
    const pool = await db.getPool();
    const request = pool.request();

    await request.execute('dbo.sp_PrepareTodayPrices');

    return {
      message: `Đã chuẩn bị giá cho ngày hôm nay thành công. Vui lòng kiểm tra lại Bảng giá.`,
    };
  } catch (error) {
    console.error(`[SERVICE] Error preparing today's prices:`, error);

    throw new AppError(
      `Lỗi khi chuẩn bị giá cho ngày hôm nay: ${error.message}`,
      500
    );
  }
};

module.exports = AdminService;
