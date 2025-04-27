// services/admin.service.js
// const UserManagementModel = require("../models/UserManagement.model");
const NhanVienModel = require("../models/NhanVien.model");
const NhaDauTuModel = require("../models/NhaDauTu.model");
const passwordHasher = require("../utils/passwordHasher");
const BackupRestoreModel = require("../models/BackupRestore.model");
const path = require("path"); // Để xử lý đường dẫn file
const BadRequestError = require("../utils/errors/BadRequestError");
const NotFoundError = require("../utils/errors/NotFoundError");
const AppError = require("../utils/errors/AppError");
const ConflictError = require("../utils/errors/ConflictError");
const sql = require("mssql"); // Thư viện SQL Server
const dbConfig = require("../config/db.config");
const NhanVienService = require("./nhanvien.service");
const AdminModel = require("../models/Admin.model");
const fs = require("fs").promises;
const db = require("../models/db"); // Để gọi connectDb
const AuthorizationError = require("../utils/errors/AuthorizationError");
const AdminService = {};
const DB_NAME = dbConfig.database;
const TaiKhoanNganHangModel = require("../models/TaiKhoanNganHang.model");
const NganHangModel = require("../models/NganHang.model");
const GiaoDichTienModel = require("../models/GiaoDichTien.model");
const CoPhieuUndoLogModel = require("../models/CoPhieuUndoLog.model");
const LenhDatModel = require("../models/LenhDat.model");
const SoHuuModel = require("../models/SoHuu.model");
const CoPhieuModel = require("../models/CoPhieu.model");
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
  if (existence?.MaNDTExists)
    throw new ConflictError(`Mã Nhà Đầu Tư '${ndtData.MaNDT}' đã tồn tại.`);
  if (existence?.CMNDExists)
    throw new ConflictError(`Số CMND '${ndtData.CMND}' đã tồn tại.`);
  if (existence?.EmailExists && ndtData.Email)
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

    if (!createdNdt) throw new AppError("Tạo NĐT thất bại.", 500);

    // Loại bỏ mật khẩu hash trước khi trả về controller
    const { MKGD, ...result } = createdNdt;
    return result;
  } catch (error) {
    console.error("Error creating Investor account in service:", error);
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

// // Service tạo login
// AdminService.createLogin = async (targetUserId, password, role) => {
//   // 1. Kiểm tra xem targetUserId (là MaNV/MaNDT) tồn tại trong bảng tương ứng không
//   let userExists = false;
//   let updateHashFunction;
//   if (role === "Nhanvien") {
//     userExists = await NhanVienModel.exists(targetUserId);
//     updateHashFunction = NhanVienModel.updatePasswordHash;
//   } else if (role === "Nhà đầu tư") {
//     userExists = await NhaDauTuModel.exists(targetUserId);
//     updateHashFunction = NhaDauTuModel.updatePasswordHash;
//   } else {
//     throw new Error(`Vai trò '${role}' không hợp lệ.`);
//   }

//   if (!userExists) {
//     throw new Error(
//       `Không tìm thấy người dùng '${targetUserId}' với vai trò '${role}'.`
//     );
//   }

//   // 2. Hash mật khẩu mới
//   const hashedPassword = await passwordHasher.hashPassword(password);

//   // 3. Cập nhật hash trong bảng NHANVIEN/NDT
//   //    Thực hiện trước để nếu lỗi thì không tạo login/user SQL
//   try {
//     await updateHashFunction(targetUserId, hashedPassword);
//   } catch (error) {
//     // Lỗi có thể do targetUserId không tồn tại (đã check ở trên nhưng đề phòng race condition)
//     console.error(
//       `Failed to update password hash for ${targetUserId}: ${error.message}`
//     );
//     throw new Error(
//       `Lỗi khi cập nhật mật khẩu cho người dùng ${targetUserId}.`
//     );
//   }

//   // 4. Tạo SQL Login, DB User và thêm vào Role
//   try {
//     // Truyền mật khẩu gốc vào hàm tạo login SQL
//     await UserManagementModel.createSqlLoginAndUser(
//       targetUserId,
//       password,
//       role
//     );
//     return { message: `Tạo login và user '${targetUserId}' thành công.` };
//   } catch (error) {
//     // Nếu tạo login/user SQL thất bại, cần xem xét việc rollback (xóa hash đã update?)
//     // Tạm thời chỉ báo lỗi. Việc rollback phức tạp hơn.
//     console.error(
//       `Failed to create SQL login/user after updating hash for ${targetUserId}: ${error.message}`
//     );
//     // Cố gắng xóa hash đã lỡ cập nhật (best effort)
//     try {
//       if (role === "Nhanvien")
//         await NhanVienModel.clearPasswordHash(targetUserId);
//       else if (role === "Nhà đầu tư")
//         await NhaDauTuModel.clearPasswordHash(targetUserId);
//     } catch (clearError) {
//       console.error(
//         `Failed to clear password hash during rollback for ${targetUserId}: ${clearError.message}`
//       );
//     }
//     throw error; // Ném lỗi gốc từ createSqlLoginAndUser
//   }
// };

// // Service xóa login
// AdminService.deleteLogin = async (loginName) => {
//   // 1. Xóa SQL User và Login
//   // Hàm model sẽ xử lý nếu login/user không tồn tại
//   await UserManagementModel.dropSqlUserAndLogin(loginName);

//   // 2. Xóa hash trong bảng NHANVIEN hoặc NDT (thử cả hai)
//   let clearedNV = await NhanVienModel.clearPasswordHash(loginName);
//   let clearedNDT = await NhaDauTuModel.clearPasswordHash(loginName);

//   if (clearedNV || clearedNDT) {
//     console.log(
//       `Cleared password hash for ${loginName} in corresponding table.`
//     );
//   } else {
//     console.warn(
//       `Login ${loginName} dropped, but no corresponding user found in NHANVIEN or NDT tables to clear hash.`
//     );
//   }

//   return {
//     message: `Đã xóa login và user SQL '${loginName}' (nếu tồn tại) và xóa mật khẩu liên kết.`,
//   };
// };

// // Service thực hiện Backup
// AdminService.performBackup = async (databaseName) => {
//   const backupPath = process.env.BACKUP_PATH;
//   if (!backupPath) {
//     throw new Error(
//       "Đường dẫn backup (BACKUP_PATH) chưa được cấu hình trong file .env."
//     );
//   }
//   // Tạo tên file backup theo quy ước
//   const backupFileName = `BACKUP_${databaseName}_${new Date()
//     .toISOString()
//     .replace(/[:.]/g, "-")}.bak`; // Thêm timestamp để có nhiều bản backup
//   // const backupFileName = `BACKUP_${databaseName}.bak`; // Hoặc chỉ 1 file bị ghi đè (nếu dùng INIT)
//   const backupFilePath = path
//     .join(backupPath, backupFileName)
//     .replace(/\\/g, "/"); // Chuẩn hóa dấu /

//   try {
//     await BackupRestoreModel.backupDatabase(databaseName, backupFilePath);
//     return {
//       message: `Backup database [${databaseName}] thành công vào file: ${backupFilePath}`,
//     };
//   } catch (error) {
//     console.error(`Backup service error for ${databaseName}:`, error);
//     throw error; // Ném lỗi từ model lên controller
//   }
// };

// // Service thực hiện Restore (chỉ Full Restore từ file backup gần nhất)
// AdminService.performRestore = async (databaseName, pointInTime = null) => {
//   if (pointInTime) {
//     // Thông báo rõ ràng rằng PITR không được hỗ trợ đầy đủ
//     console.warn(
//       "Point-in-time restore requested but not fully supported. Performing full restore from latest backup file instead."
//     );
//     // return { success: false, message: "Phục hồi theo thời gian chưa được hỗ trợ đầy đủ trong phiên bản này." };
//   }

//   const backupPath = process.env.BACKUP_PATH;
//   if (!backupPath) {
//     throw new Error("Đường dẫn backup (BACKUP_PATH) chưa được cấu hình.");
//   }
//   // Xác định file backup để restore (ví dụ: file cố định bị ghi đè)
//   // Hoặc logic tìm file backup mới nhất nếu có timestamp trong tên file
//   const backupFileName = `BACKUP_${databaseName}.bak`; // Giả sử dùng file cố định bị ghi đè
//   const backupFilePath = path
//     .join(backupPath, backupFileName)
//     .replace(/\\/g, "/");

//   // Kiểm tra file backup tồn tại trước khi thử restore? (Tùy chọn)
//   // const fs = require('fs').promises;
//   // try { await fs.access(backupFilePath); } catch { throw new Error(`File backup '${backupFilePath}' không tồn tại hoặc không thể truy cập.`); }

//   try {
//     await BackupRestoreModel.restoreDatabase(databaseName, backupFilePath);
//     return {
//       message: `Restore database [${databaseName}] từ file '${backupFilePath}' thành công.`,
//     };
//   } catch (error) {
//     console.error(`Restore service error for ${databaseName}:`, error);
//     throw error; // Ném lỗi từ model lên controller
//   }
// };

// Service tạo "tài khoản ứng dụng" (trước đây là createLogin)
// AdminService.createApplicationUser = async (targetUserId, password, role) => {
//   // 1. Kiểm tra xem targetUserId (là MaNV/MaNDT) tồn tại trong bảng tương ứng không
//   let userExists = false;
//   let updateHashFunction;
//   if (role === "Nhanvien") {
//     userExists = await NhanVienModel.exists(targetUserId);
//     updateHashFunction = NhanVienModel.updatePasswordHash;
//   } else if (role === "Nhà đầu tư") {
//     userExists = await NhaDauTuModel.exists(targetUserId);
//     updateHashFunction = NhaDauTuModel.updatePasswordHash;
//   } else {
//     throw new BadRequestError(`Vai trò '${role}' không hợp lệ.`);
//   }

//   if (!userExists) {
//     throw new NotFoundError(
//       `Không tìm thấy người dùng '${targetUserId}' với vai trò '${role}'. Không thể tạo/cập nhật mật khẩu.`
//     );
//   }

//   // 2. Hash mật khẩu mới
//   const hashedPassword = await passwordHasher.hashPassword(password);

//   // 3. Cập nhật hash trong bảng NHANVIEN/NDT
//   try {
//     await updateHashFunction(targetUserId, hashedPassword);
//     console.log(`Password hash updated for user ${targetUserId}`);
//     return {
//       message: `Cập nhật mật khẩu cho tài khoản '${targetUserId}' thành công.`,
//     };
//   } catch (error) {
//     console.error(
//       `Failed to update password hash for ${targetUserId}: ${error.message}`
//     );
//     throw error;
//   }

//   // --- PHẦN TẠO SQL LOGIN/USER ĐÃ BỊ XÓA ---
// };

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

// // Service thực hiện Backup (KHÔNG THAY ĐỔI)
// AdminService.performBackup = async (databaseName) => {
//   const backupPath = process.env.BACKUP_PATH;
//   if (!backupPath) {
//     throw new AppError(
//       "Đường dẫn backup (BACKUP_PATH) chưa được cấu hình trong file .env.",
//       500
//     );
//   }
//   const backupFileName = `BACKUP_${databaseName}_${new Date()
//     .toISOString()
//     .replace(/[:.]/g, "-")}.bak`;
//   const backupFilePath = path
//     .join(backupPath, backupFileName)
//     .replace(/\\/g, "/");

//   try {
//     await BackupRestoreModel.backupDatabase(databaseName, backupFilePath);
//     return {
//       message: `Backup database [${databaseName}] thành công vào file: ${backupFilePath}`,
//     };
//   } catch (error) {
//     console.error(`Backup service error for ${databaseName}:`, error);
//     if (
//       error.message.includes("Không có quyền") ||
//       error.message.includes("permission denied")
//     ) {
//       throw new AuthorizationError(
//         `Không có quyền BACKUP DATABASE. Vui lòng kiểm tra quyền của tài khoản kết nối DB.`
//       );
//     }
//     if (error.message.includes("Lỗi hệ điều hành")) {
//       throw new AppError(error.message, 500); // Giữ nguyên message lỗi OS
//     }
//     throw error;
//   }
// };

// // Service thực hiện Restore (KHÔNG THAY ĐỔI)
// AdminService.performRestore = async (databaseName, pointInTime = null) => {
//   if (pointInTime) {
//     console.warn(
//       "Point-in-time restore requested but not fully supported. Performing full restore from latest backup file instead."
//     );
//   }

//   const backupPath = process.env.BACKUP_PATH;
//   if (!backupPath) {
//     throw new AppError(
//       "Đường dẫn backup (BACKUP_PATH) chưa được cấu hình.",
//       500
//     );
//   }
//   const backupFileName = `BACKUP_${databaseName}.bak`;
//   const backupFilePath = path
//     .join(backupPath, backupFileName)
//     .replace(/\\/g, "/");

//   try {
//     await BackupRestoreModel.restoreDatabase(databaseName, backupFilePath);
//     return {
//       message: `Restore database [${databaseName}] từ file '${backupFilePath}' thành công.`,
//     };
//   } catch (error) {
//     console.error(`Restore service error for ${databaseName}:`, error);
//     if (error.message.includes("Không có quyền")) {
//       throw new AuthorizationError(`Không có quyền RESTORE DATABASE.`);
//     }
//     if (
//       error.message.includes("database đang được sử dụng") ||
//       error.message.includes("exclusive access") ||
//       error.message.includes("single-user")
//     ) {
//       throw new ConflictError(error.message); // 409 Conflict - DB đang bị khóa/sử dụng
//     }
//     if (error.message.includes("Lỗi hệ điều hành")) {
//       throw new AppError(error.message, 500);
//     }
//     throw error;
//   }
// };

// Service thực hiện Backup (Sửa để dùng device)

// --- Backup Operations ---
/**
 * Thực hiện Full Backup, tạo file mới và tùy chọn dọn dẹp file cũ.
 * @param {boolean} deleteAllOld Nếu true, xóa tất cả các file .bak cũ hơn file vừa tạo.
 * @returns {Promise<object>} Thông tin về bản backup mới.
 */
AdminService.performBackup = async (deleteAllOld = false) => {
  const backupPath = process.env.BACKUP_PATH;
  if (!backupPath || !DB_NAME) {
    throw new AppError("Thiếu cấu hình BACKUP_PATH hoặc tên database.", 500);
  }

  // Bước 1: Tạo tên file backup mới
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 17); // Format YYYY-MM-DD_HH-MM-SS
  const newBackupFileName = `${DB_NAME}_FULL_${timestamp}.bak`;
  const newBackupFilePath = path
    .join(backupPath, newBackupFileName)
    .replace(/\\/g, "/");

  try {
    // Bước 2: Thực hiện backup vào file mới
    console.log(`Attempting backup to new file: ${newBackupFilePath}`);
    await BackupRestoreModel.backupDatabaseToNewFile(newBackupFilePath); // Gọi hàm model mới
    console.log(`Backup successful: ${newBackupFileName}`);

    // Lấy kích thước file backup mới
    let fileSizeBytes = 0;
    try {
      const stats = await fs.stat(newBackupFilePath);
      fileSizeBytes = stats.size;
    } catch (statErr) {
      console.error(
        `Failed to get file size for ${newBackupFileName}:`,
        statErr
      );
    }

    // Bước 3: Dọn dẹp file cũ (NẾU backup thành công VÀ deleteAllOld là true)
    if (deleteAllOld) {
      console.log(
        `Cleanup requested: Deleting old .bak files in ${backupPath}, keeping ${newBackupFileName}`
      );
      try {
        const files = await fs.readdir(backupPath);
        const oldBakFiles = files.filter(
          (f) =>
            f.toLowerCase().endsWith(".bak") &&
            f.toUpperCase().startsWith(DB_NAME.toUpperCase()) && // Chỉ xóa file của DB này
            f !== newBackupFileName // Không xóa file vừa tạo
        );

        if (oldBakFiles.length > 0) {
          console.log(`Found old files to delete: ${oldBakFiles.join(", ")}`);
          await Promise.all(
            oldBakFiles.map(async (oldFile) => {
              const oldFilePath = path.join(backupPath, oldFile);
              try {
                await fs.unlink(oldFilePath);
                console.log(`Deleted old backup: ${oldFile}`);
              } catch (deleteErr) {
                console.error(
                  `Failed to delete old backup file ${oldFile}:`,
                  deleteErr
                );
                // Có thể throw lỗi ở đây hoặc chỉ log warning
              }
            })
          );
          console.log("Old backup file cleanup complete.");
        } else {
          console.log("No old backup files found to delete.");
        }
      } catch (cleanupErr) {
        console.error(`Error during old backup file cleanup:`, cleanupErr);
        // Không nên throw lỗi ở đây vì backup chính đã thành công
        // throw new AppError(`Backup thành công nhưng gặp lỗi khi dọn dẹp file cũ: ${cleanupErr.message}`, 500);
      }
    }

    return {
      id: `${DB_NAME}_${timestamp}`, // Tạo ID duy nhất dựa trên tên DB và timestamp
      message: `Backup database [${DB_NAME}] thành công.`,
      fileName: newBackupFileName,
      filePath: newBackupFilePath,
      fileSizeBytes: fileSizeBytes,
      fileSizeMB: parseFloat((fileSizeBytes / (1024 * 1024)).toFixed(2)), // Kích thước MB
      createdAt: new Date().toISOString(), // Thêm thời gian tạo
      cleanupPerformed: deleteAllOld,
    };
  } catch (error) {
    console.error(`Backup service error for ${DB_NAME}:`, error);
    // Lỗi từ backupDatabaseToNewFile đã được chuẩn hóa tương đối
    throw error;
  }
};

// --- Restore Operations ---
/**
 * Thực hiện Restore (Full hoặc PITR) từ file backup đã chọn.
 * @param {string} backupFileName Tên file .bak được chọn từ lịch sử.
 * @param {string|null} pointInTime Thời điểm PITR (ISO string) hoặc null để restore full.
 * @returns {Promise<object>} Thông báo kết quả.
 */
AdminService.performRestore = async (backupFileName, pointInTime = null) => {
  const backupPath = process.env.BACKUP_PATH;
  const logBackupPath = process.env.LOG_BACKUP_PATH;
  if (!backupPath || !DB_NAME) {
    throw new AppError("Thiếu cấu hình BACKUP_PATH hoặc tên database.", 500);
  }
  if (!backupFileName) {
    throw new BadRequestError(
      "Vui lòng chọn một bản sao lưu từ lịch sử để phục hồi."
    );
  }

  const fullBackupPath = path
    .join(backupPath, backupFileName)
    .replace(/\\/g, "/");

  try {
    if (pointInTime) {
      // --- Thực hiện PITR ---
      console.log(
        `PITR request: Restore DB [${DB_NAME}] from [${backupFileName}] to [${pointInTime}]`
      );
      if (!logBackupPath) {
        throw new AppError(
          "Đường dẫn backup log (LOG_BACKUP_PATH) chưa được cấu hình cho PITR.",
          500
        );
      }
      await BackupRestoreModel.restoreDatabaseToPointInTime(
        fullBackupPath,
        pointInTime,
        logBackupPath
      ); // Gọi hàm PITR mới
      return {
        message: `Restore database [${DB_NAME}] về thời điểm '${pointInTime}' từ file '${backupFileName}' thành công.`,
      };
    } else {
      // --- Thực hiện Full Restore ---
      console.log(
        `Full Restore request: Restore DB [${DB_NAME}] from [${backupFileName}]`
      );
      await BackupRestoreModel.restoreDatabaseFromSpecificFile(fullBackupPath); // Gọi hàm restore full mới
      return {
        message: `Restore database [${DB_NAME}] từ file '${backupFileName}' thành công.`,
      };
    }
  } catch (error) {
    console.error(
      `Restore service error for ${DB_NAME} from ${backupFileName}:`,
      error
    );
    // Lỗi từ model restore đã được chuẩn hóa tương đối
    throw error;
  }
};

AdminService.createBackupDevice = async () => {
  const backupPath = process.env.BACKUP_PATH;
  if (!backupPath || !DB_NAME) {
    throw new AppError("Thiếu cấu hình BACKUP_PATH hoặc tên database.", 500);
  }
  const deviceName = `DEVICE_${DB_NAME}`;
  // File mặc định mà device trỏ tới (có thể không dùng nhiều)
  const physicalPath = path
    .join(backupPath, `${DB_NAME}_DeviceDefault.bak`)
    .replace(/\\/g, "/");

  try {
    await BackupRestoreModel.createBackupDevice(deviceName, physicalPath);
    return {
      message: `Backup device '${deviceName}' đã được tạo hoặc đã tồn tại.`,
      deviceName: deviceName,
      physicalPath: physicalPath,
    };
  } catch (error) {
    console.error("Service error creating backup device:", error);
    throw error; // Ném lại lỗi đã chuẩn hóa từ model
  }
};

// --- Backup History ---
/**
 * Lấy danh sách lịch sử các file Full Backup (.bak).
 * @returns {Promise<Array<object>>} Mảng các object chứa thông tin file backup.
 */
AdminService.getBackupHistory = async () => {
  const backupPath = process.env.BACKUP_PATH;
  if (!backupPath || !DB_NAME) {
    throw new AppError("Thiếu cấu hình BACKUP_PATH hoặc tên database.", 500);
  }

  try {
    const files = await fs.readdir(backupPath);
    const bakFilesInfo = await Promise.all(
      files
        .filter(
          (f) =>
            f.toLowerCase().endsWith(".bak") &&
            f.toUpperCase().startsWith(DB_NAME.toUpperCase())
        )
        .map(async (f) => {
          const filePath = path.join(backupPath, f);
          try {
            const stats = await fs.stat(filePath);
            return {
              fileName: f,
              createdAt: stats.mtime, // Thời gian sửa đổi cuối (gần đúng thời gian tạo)
              fileSizeBytes: stats.size,
              fileSizeMB: parseFloat((stats.size / (1024 * 1024)).toFixed(2)), // Kích thước MB
            };
          } catch (statErr) {
            console.error(
              `Could not get stats for file ${f}: ${statErr.message}`
            );
            return null; // Bỏ qua file không đọc được stats
          }
        })
    );

    // Lọc bỏ các file null và sắp xếp (mới nhất trước)
    const sortedHistory = bakFilesInfo
      .filter((info) => info !== null)
      .sort((a, b) => b.createdAt - a.createdAt);

    return sortedHistory;
  } catch (error) {
    console.error(`Error reading backup history from ${backupPath}:`, error);
    if (error.code === "ENOENT") {
      throw new NotFoundError(`Thư mục sao lưu '${backupPath}' không tồn tại.`);
    }
    throw new AppError(`Lỗi khi đọc lịch sử sao lưu: ${error.message}`, 500);
  }
};

AdminService.prepareNextDayPrices = async () => {
  console.log("[SERVICE PREPARE PRICES] Request received.");
  try {
    // --- Logic Xác định Ngày Giao dịch Tiếp theo ---

    const pool = await db.getPool();
    // Lấy ngày hiện tại từ SQL Server để đảm bảo đồng bộ
    const todayResult = await pool
      .request()
      .query("SELECT CAST(GETDATE() AS DATE) as TodayDate");
    const ngayHienTai = todayResult.recordset[0].TodayDate;

    // Sử dụng SQL Server để tính ngày tiếp theo
    const nextDayResult = await pool
      .request()
      .input("NgayHienTai", sql.Date, ngayHienTai)
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
    request.input("NgayHienTai", sql.Date, ngayHienTai);
    request.input("NgayTiepTheo", sql.Date, ngayTiepTheo);

    await request.execute("dbo.sp_PrepareNextDayPrices"); // Gọi SP đã tạo

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
  console.log("[Admin Service] Getting all users (Staff + Investors)...");
  try {
    const users = await NhanVienModel.getAllUsersForAdmin();
    return users;
  } catch (error) {
    console.error("Error in getAllUsers service:", error);
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
    if (role === "NhaDauTu")
      currentUser = await NhaDauTuModel.findByMaNDT(accountId);
    else if (role === "NhanVien")
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
    if (role === "NhaDauTu") {
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
    } else if (role === "NhanVien") {
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
      throw new BadRequestError("Vai trò không hợp lệ.");
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
    if (error.message.includes("đã tồn tại")) {
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
  let successMessage = "";

  try {
    if (role === "NhaDauTu") {
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
    } else if (role === "NhanVien") {
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
    } else {
      throw new BadRequestError("Vai trò không hợp lệ.");
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
      (error.message && error.message.includes("Không thể xóa"))
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
  console.log("[Admin Service] Getting all bank accounts...");
  try {
    // Gọi hàm mới trong Model TKNH
    return await TaiKhoanNganHangModel.getAll();
  } catch (error) {
    console.error("Error in getAllBankAccounts service:", error);
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
    console.error("Error in createBankAccount service:", error);
    // Lỗi Conflict (trùng MaTK) hoặc FK (sai MaNH) từ Model
    if (
      error instanceof ConflictError ||
      error instanceof BadRequestError ||
      (error.message &&
        (error.message.includes("đã tồn tại") ||
          error.message.includes("không tồn tại")))
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
      "Skipping Bank existence check during update. Relying on DB FK constraint."
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
      (error.message && error.message.includes("Không thể xóa"))
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
    throw new BadRequestError("Khoảng thời gian cung cấp không hợp lệ.");
  }

  try {
    const history = await GiaoDichTienModel.getAll(startDate, endDate); // Gọi hàm model mới
    return history;
  } catch (error) {
    console.error("Error in getAllCashTransactions service:", error);
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
  console.log("[Admin Service] Getting all undo logs with options:", options);
  try {
    const logs = await CoPhieuUndoLogModel.getAllLogs(options); // Gọi hàm model mới
    return logs;
  } catch (error) {
    console.error("Error in getAllUndoLogs service:", error);
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
    throw new BadRequestError("Khoảng thời gian cung cấp không hợp lệ.");
  }

  try {
    const orders = await LenhDatModel.getAllOrdersAdmin(startDate, endDate); // Gọi hàm model mới
    return orders;
  } catch (error) {
    console.error("Error in getAllOrders service:", error);
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
  if (role === "NhaDauTu") {
    userExists = await NhaDauTuModel.exists(accountId);
    updateHashFunction = NhaDauTuModel.updatePasswordHash;
  } else if (role === "NhanVien") {
    userExists = await NhanVienModel.exists(accountId);
    updateHashFunction = NhanVienModel.updatePasswordHash;
  } else {
    throw new BadRequestError("Vai trò không hợp lệ.");
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
  if (!maCP) throw new BadRequestError("Mã cổ phiếu là bắt buộc.");
  if (!Array.isArray(distributionList) || distributionList.length === 0) {
    throw new BadRequestError("Danh sách phân bổ không hợp lệ hoặc rỗng.");
  }

  let totalQuantityToDistribute = 0;

  const validationPromises = [];
  for (const item of distributionList) {
    // Kiểm tra cấu trúc từng item (bao gồm cả maTK và gia)
    if (
      !item.maNDT ||
      !item.maTK ||
      typeof item.soLuong !== "number" ||
      !Number.isInteger(item.soLuong) ||
      item.soLuong <= 0 ||
      item.gia === undefined ||
      item.gia === null ||
      typeof item.gia !== "number" ||
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
            } (${account.SoTien.toLocaleString("vi-VN")}đ) để nhận ${
              item.soLuong
            } ${maCP} với giá ${item.gia.toLocaleString("vi-VN")}đ.`
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
      "[Admin Service] All investor accounts validated successfully."
    );
  } catch (validationError) {
    // Nếu bất kỳ kiểm tra nào thất bại, ném lỗi đó ra
    console.error(
      "[Admin Service] Account validation failed:",
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
    if (error.message && error.message.includes("không đủ")) {
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
    request.input("MaCP", sql.NVarChar(10), maCP);
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
    typeof newSoLuong !== "number" ||
    !Number.isInteger(newSoLuong) ||
    newSoLuong < 0
  ) {
    throw new BadRequestError("Số lượng mới phải là số nguyên không âm.");
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
