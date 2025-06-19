// models/BackupRestore.model.js
const sql = require('mssql');
const db = require('./db');
const dbConfig = require('../config/db.config'); // Cần tên DB
const fs = require('fs').promises;

const path = require('path'); // Để xử lý đường dẫn
const AppError = require('../utils/errors/AppError');
// // Hàm thực hiện Backup Database vào file
// BackupRestore.backupDatabase = async (databaseName, backupFilePath) => {
//   try {
//     // Sử dụng connection pool hiện tại nhưng query có thể chạy lâu
//     const pool = await db.getPool();
//     const request = pool.request();
//     // Tăng timeout cho lệnh backup (vd: 5 phút)
//     request.timeout = 300000; // 300 seconds = 5 minutes

//     // !!! Cần kiểm tra backupFilePath để tránh injection, mặc dù nó được tạo từ service
//     // Trong thực tế, chỉ nên cho phép đường dẫn cố định + tên file động
//     const backupQuery = `
//             BACKUP DATABASE [${databaseName}]
//             TO DISK = N'${backupFilePath.replace(
//               /'/g,
//               "''"
//             )}' -- Thay ' thành ''
//             WITH NOFORMAT, INIT, NAME = N'${databaseName}-Full Database Backup', SKIP, NOREWIND, NOUNLOAD, STATS = 10;
//         `;
//     // INIT: Ghi đè lên file backup nếu đã tồn tại.
//     // NOFORMAT: Không format lại media (dùng với INIT).
//     // NAME: Tên của backup set.
//     // SKIP: Bỏ qua kiểm tra hết hạn.
//     // STATS = 10: Báo cáo tiến độ mỗi 10%.

//     console.log(
//       `Starting backup of [${databaseName}] to [${backupFilePath}]...`
//     );
//     await request.query(backupQuery);
//     console.log(`Backup of [${databaseName}] completed successfully.`);
//     return true;
//   } catch (err) {
//     console.error(`SQL error during backup of [${databaseName}]:`, err);
//     if (err.message.toLowerCase().includes("permission denied")) {
//       throw new Error(
//         `Không có quyền BACKUP DATABASE. Vui lòng kiểm tra quyền của tài khoản kết nối DB.`
//       );
//     }
//     if (err.message.toLowerCase().includes("operating system error")) {
//       throw new Error(
//         `Lỗi hệ điều hành khi ghi file backup (kiểm tra đường dẫn '${backupFilePath}' và quyền ghi của SQL Server Service Account).`
//       );
//     }
//     throw new Error(`Lỗi khi backup database: ${err.message}`);
//   }
// };

// Hàm thực hiện Restore Database từ file

const BackupRestoreModel = {};
const DB_NAME = dbConfig.database; // Tên DB
const DEVICE_NAME = `DEVICE_${DB_NAME}`; // Tên device logic
const DEVICE_PHYSICAL_PATH = process.env.BACKUP_DEVICE_PATH; // Lấy từ .env

/**
 * Thực hiện Full Backup vào một file mới có timestamp.
 * @param {string} fullBackupPath Đường dẫn đầy đủ đến file .bak mới sẽ được tạo.
 * @returns {Promise<boolean>} True nếu thành công.
 */
BackupRestoreModel.backupDatabaseToNewFile = async (fullBackupPath) => {
  try {
    const pool = await db.getPool(); // Dùng pool chính
    const request = pool.request();
    request.timeout = 300000; // 5 phút timeout

    // Backup vào file mới, KHÔNG dùng INIT, KHÔNG dùng Device
    const escapedPath = fullBackupPath.replace(/'/g, "''"); // Escape path
    const backupQuery = `BACKUP DATABASE [${DB_NAME}] TO DISK = N'${escapedPath}' WITH NOFORMAT, NAME = N'${DB_NAME}-Full Backup ${path.basename(
      fullBackupPath
    )}', SKIP, NOREWIND, NOUNLOAD, STATS = 10;`;

    console.log(
      `Starting full backup of [${DB_NAME}] to file [${fullBackupPath}]...`
    );
    await request.query(backupQuery);
    console.log(
      `Full backup to file [${fullBackupPath}] completed successfully.`
    );
    return true;
  } catch (err) {
    console.error(`SQL error during backup to file [${fullBackupPath}]:`, err);
    if (err.message.toLowerCase().includes('permission denied')) {
      throw new Error(`Không có quyền BACKUP DATABASE.`);
    }
    if (err.message.toLowerCase().includes('operating system error')) {
      throw new Error(
        `Lỗi ghi file backup '${path.basename(
          fullBackupPath
        )}'. Kiểm tra đường dẫn và quyền ghi của SQL Server Service Account.`
      );
    }
    // Cố gắng xóa file .bak rỗng nếu backup lỗi giữa chừng (best effort)
    try {
      await fs.unlink(fullBackupPath);
      console.log(
        `Removed potentially incomplete backup file: ${fullBackupPath}`
      );
    } catch (unlinkErr) {
      console.warn(
        `Failed to remove incomplete backup file '${fullBackupPath}': ${unlinkErr.message}`
      );
    }
    throw new Error(`Lỗi khi backup database: ${err.message}`);
  }
};

/** Ngắt kết nối của pool chính tạm thời */
const disconnectMainPool = async () => {
  const mainPool = await db.getPool(); // Lấy pool chính
  if (mainPool && mainPool.connected) {
    console.log('[Restore] Closing main application connection pool...');
    await mainPool.close(); // Đóng pool
    console.log('[Restore] Main application pool closed.');
    // Cần cơ chế để kết nối lại pool sau khi restore xong
    // => Cách tốt hơn là không đóng hoàn toàn mà chỉ đảm bảo không có kết nối active
    // => Tuy nhiên, đóng hoàn toàn là cách chắc chắn nhất
    // db.resetPool(); // Hàm này cần được tạo trong db.js để đặt pool = null
  }
};

/** Kết nối lại pool chính sau khi restore */
const reconnectMainPool = async () => {
  console.log('[Restore] Starting reconnectMainPool...');
  try {
    await db.connectDb(); // Gọi lại hàm connectDb để tạo pool mới
    console.log('[Restore] Main application pool reconnected.');
  } catch (err) {
    console.error('[Restore] Failed to reconnect main pool:', err);
  }
};
// (Optional) Hàm xóa Backup Device
BackupRestoreModel.deleteBackupDevice = async (deviceName) => {
  try {
    if (!deviceName || !/^[a-zA-Z0-9_]+$/.test(deviceName)) {
      throw new Error('Tên device không hợp lệ.');
    }
    console.log(`Attempting to delete device '${deviceName}'`);
    const masterPool = new sql.ConnectionPool({
      ...dbConfig,
      database: 'master',
      pool: { max: 1, min: 0 },
    });
    await masterPool.connect();
    const request = masterPool.request();
    // Dùng sp_dropdevice
    const query = `
          IF EXISTS (SELECT 1 FROM sys.backup_devices WHERE name = N'${deviceName}')
          BEGIN
              EXEC sp_dropdevice N'${deviceName}';
          END
      `;
    await request.query(query);
    await masterPool.close();
    console.log(`Backup device '${deviceName}' deleted if it existed.`);
    return true;
  } catch (err) {
    console.error(`SQL error deleting backup device ${deviceName}:`, err);
    if (err.message.toLowerCase().includes('permission denied')) {
      throw new Error(`Không có quyền xóa backup device.`);
    }
    throw new Error(`Lỗi khi xóa backup device: ${err.message}`);
  }
};

/**
 * Thực hiện Restore Full từ một file .bak cụ thể.
 * @param {string} fullBackupPath Đường dẫn đầy đủ đến file .bak cần restore.
 * @returns {Promise<boolean>} True nếu thành công.
 */
BackupRestoreModel.restoreDatabaseFromSpecificFile = async (fullBackupPath) => {
  let masterPool = null; // Khởi tạo là null
  let mainPoolWasClosed = false;

  try {
    // *** BƯỚC 0: Đóng Pool chính của ứng dụng ***
    const mainPool = await db.getPool(); // Lấy pool hiện tại
    if (mainPool && mainPool.connected) {
      console.log(
        '[Restore] Closing main application connection pool before restore...'
      );
      await mainPool.close(); // Đóng pool chính
      mainPoolWasClosed = true;
      console.log('[Restore] Main application pool closed.');
      // Cần cơ chế báo cho db.js biết pool đã đóng để getPool() không lỗi
      // Có thể thêm: sql.close(); // Đóng tất cả pool (cẩn thận)
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Chờ 1 giây để đảm bảo kết nối đóng hẳn
    }

    try {
      await fs.access(fullBackupPath, fs.constants.R_OK); // Check read access
    } catch (accessErr) {
      throw new Error(
        `File backup '${path.basename(
          fullBackupPath
        )}' không tồn tại hoặc không thể đọc.`
      );
    }

    masterPool = new sql.ConnectionPool({
      ...dbConfig,
      database: 'master',
      pool: { max: 1, min: 0 },
    });
    await masterPool.connect();
    const request = masterPool.request();
    request.timeout = 600000; // 10 phút timeout

    // 1. Đưa DB về Single User
    console.log(`Attempting to set [${DB_NAME}] to SINGLE_USER mode...`);
    const alterDbSingleUser = `ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`;
    try {
      await request.query(alterDbSingleUser);
      console.log(`Database [${DB_NAME}] set to SINGLE_USER.`);
    } catch (alterErr) {
      console.error(
        `Failed to set SINGLE_USER mode for [${DB_NAME}]: ${alterErr.message}`
      );
      // Đóng master pool nếu lỗi ở đây
      if (masterPool && masterPool.connected) await masterPool.close();
      // Cố gắng kết nối lại pool chính dù lỗi
      if (mainPoolWasClosed) await reconnectMainPool();
      throw new Error(
        `Không thể đưa database về chế độ single-user. Lỗi: ${alterErr.message}. Đảm bảo không có kết nối nào khác (SSMS?).`
      );
    }

    // 2. Thực hiện Restore Full
    console.log(`Starting full restore of [${DB_NAME}] from device]...`);
    const escapedPath = fullBackupPath.replace(/'/g, "''");
    const restoreQuery = `RESTORE DATABASE [${DB_NAME}] FROM DISK = N'${escapedPath}' WITH FILE = 1, REPLACE, RECOVERY, STATS = 5;`; // RECOVERY để online ngay
    try {
      await request.query(restoreQuery);
      console.log(`Full restore of [${DB_NAME}] completed successfully.`);
    } catch (restoreErr) {
      console.error(
        `Failed to restore database [${DB_NAME}] from file: ${restoreErr.message}`
      );
      throw new Error(
        `Lỗi khi restore database từ file '${path.basename(fullBackupPath)}': ${
          restoreErr.message
        }`
      );
    }
    console.log(`Full restore from device  completed successfully.`);

    // *** BƯỚC 5: Đưa database về chế độ MULTI_USER ***
    console.log(`Setting [${DB_NAME}] back to MULTI_USER mode...`);
    const alterDbMultiUser = `ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`;
    try {
      await request.query(alterDbMultiUser);
      console.log(`Database [${DB_NAME}] set to MULTI_USER.`);
    } catch (multiUserErr) {
      console.error(
        `Failed to set MULTI_USER mode for [${DB_NAME}]: ${multiUserErr.message}`
      );
      throw new Error(
        `Không thể đưa database về chế độ multi-user. Lỗi: ${multiUserErr.message}`
      );
    }

    // 3. (Không bắt buộc vì đã dùng RECOVERY) Đưa về Multi User
    // console.log(`Setting [${DB_NAME}] back to MULTI_USER mode...`);
    // const alterDbMultiUser = `ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`;
    // try { await request.query(alterDbMultiUser); } catch (multiUserErr) { console.error(`Failed to set MULTI_USER after restore: ${multiUserErr.message}`); }

    await masterPool.close();
    masterPool = null; // Đặt lại là null
    // 4. Kết nối lại Pool chính của ứng dụng
    if (mainPoolWasClosed) await reconnectMainPool();
    return true;
  } catch (err) {
    console.error(`SQL error during full restore from device`, err);
    // Cố gắng đưa về MULTI_USER nếu đang kết nối
    if (masterPool && masterPool.connected) {
      try {
        const recoveryRequest = masterPool.request();
        await recoveryRequest.query(
          `ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`
        );
      } catch (recoveryErr) {
        console.error(
          `Failed to set MULTI_USER after restore error: ${recoveryErr.message}`
        );
      }
      await masterPool.close();
    }
    // Kết nối lại pool chính nếu cần
    if (mainPoolWasClosed) await reconnectMainPool();
    if (err.message.toLowerCase().includes('permission denied'))
      throw new Error(`Không có quyền RESTORE DATABASE.`);
    if (
      err.message.toLowerCase().includes('exclusive access') ||
      err.message.toLowerCase().includes('database is in use')
    )
      throw new Error(`Không thể restore vì database đang được sử dụng.`);
    if (err.message.toLowerCase().includes('operating system error'))
      throw new Error(
        `Lỗi đọc file backup '${path.basename(fullBackupPath)}'.`
      );
    throw new Error(`Lỗi khi restore database: ${err.message}`);
  }
};

/**
 * Thực hiện Restore Point-in-Time.
 * @param {string} fullBackupPath Đường dẫn đầy đủ đến file Full Backup (.bak) làm base.
 * @param {string} pointInTime Thời điểm cần phục hồi (ISO format string).
 * @param {string} logBackupPath Đường dẫn thư mục chứa các file Transaction Log Backup (.trn).
 * @returns {Promise<boolean>} True nếu thành công.
 */

BackupRestoreModel.restoreDatabaseToPointInTime = async (
  fullBackupPath,
  pointInTime,
  logBackupPath
) => {
  let masterPool = null;
  let mainPoolWasClosed = false;
  try {
    // *** BƯỚC 0: Đóng Pool chính ***
    const mainPool = await db.getPool();
    if (mainPool && mainPool.connected) {
      console.log('[PITR Restore] Closing main application connection pool...');
      await mainPool.close();
      mainPoolWasClosed = true;
      console.log('[PITR Restore] Main application pool closed.');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    // *** BƯỚC 1: Kiểm tra đầu vào ***
    const targetTime = new Date(pointInTime);
    if (isNaN(targetTime.getTime())) {
      throw new Error('Thời điểm phục hồi không hợp lệ.');
    }
    // Format thời gian cho SQL Server (YYYY-MM-DDTHH:MM:SS.mmm)
    const stopAtString = targetTime.toISOString().slice(0, 23);
    console.log(
      `Target Point-in-Time: ${pointInTime}, SQL STOPAT: '${stopAtString}'`
    );

    if (!logBackupPath) {
      throw new Error('Đường dẫn chứa backup log chưa được cấu hình.');
    }
    if (!fullBackupPath)
      throw new Error('Chưa chọn file Full Backup làm điểm gốc.');

    // *** BƯỚC 2: Kiểm tra file full backup ***
    try {
      await fs.access(fullBackupPath, fs.constants.R_OK);
    } catch (err) {
      throw new Error(
        `File Full Backup '${path.basename(
          fullBackupPath
        )}' không tồn tại hoặc không thể đọc.`
      );
    }
    // *** BƯỚC 3: Tìm và sắp xếp file log backup ***
    console.log(`Looking for transaction log backups in: ${logBackupPath}`);
    let logFiles = [];
    try {
      const files = await fs.readdir(logBackupPath);
      const fileStats = await Promise.all(
        files.map(async (f) => {
          if (
            f.toLowerCase().endsWith('.trn') &&
            f.toUpperCase().includes(DB_NAME.toUpperCase())
          ) {
            const filePath = path.join(logBackupPath, f);
            try {
              const stats = await fs.stat(filePath);
              return { name: f, path: filePath, mtime: stats.mtime }; // Lấy thời gian sửa đổi
            } catch (statErr) {
              console.warn(
                `Could not get stats for log file ${f}: ${statErr.message}`
              );
              return null;
            }
          }
          return null;
        })
      );

      logFiles = fileStats
        .filter((f) => f !== null && f.mtime <= targetTime)
        .sort((a, b) => a.mtime - b.mtime); // Sắp xếp theo thời gian sửa đổi (tương đối)

      // **Cần logic lọc chính xác hơn**: Chỉ lấy các file log có mtime > thời gian của fullBackupPath
      // và <= thời gian cần restore + một khoảng thời gian nhỏ (để chắc chắn bao gồm điểm dừng).
      // Tạm thời vẫn giữ nguyên việc thử restore tuần tự.
      console.log(
        `Found ${logFiles.length} potential log backup files, sorted by modification time.`
      );
    } catch (readErr) {
      console.error(
        `Error reading log backup directory ${logBackupPath}:`,
        readErr
      );
      throw new Error(
        `Không thể đọc thư mục chứa backup log: ${logBackupPath}`
      );
    }

    if (logFiles.length === 0) {
      throw new Error(
        `Không tìm thấy file log backup nào phù hợp trong ${logBackupPath}.`
      );
      // Có thể throw lỗi hoặc tiếp tục thử restore full + log (nếu có)
    }

    // *** BƯỚC 4: Kết nối tới master database ***
    masterPool = new sql.ConnectionPool({
      ...dbConfig,
      database: 'master',
      pool: { max: 1, min: 0 },
    });
    await masterPool.connect();
    const request = masterPool.request();
    request.timeout = 900000; // 15 phút timeout

    // *** BƯỚC 5: Đưa DB về chế độ SINGLE_USER ***
    console.log(`Setting [${DB_NAME}] to SINGLE_USER mode for PITR...`);
    const alterDbSingleUser = `ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`;
    try {
      await request.query(alterDbSingleUser);
      console.log(`Database [${DB_NAME}] set to SINGLE_USER.`);
    } catch (alterErr) {
      console.error(`SQL error during full restore from device :`, err);
      // Cố gắng đưa về MULTI_USER nếu đang kết nối
      if (masterPool && masterPool.connected) {
        try {
          const recoveryRequest = masterPool.request();
          await recoveryRequest.query(
            `ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`
          );
        } catch (recoveryErr) {
          /* Ignore */
        }
        await masterPool.close();
      }
      // Phân tích lỗi restore
      if (err.message.toLowerCase().includes('permission denied'))
        throw new Error(`Không có quyền RESTORE DATABASE.`);
      if (
        err.message.toLowerCase().includes('exclusive access') ||
        err.message.toLowerCase().includes('database is in use')
      )
        throw new Error(
          `Không thể restore vì database đang được sử dụng (không thể ngắt hết kết nối).`
        );
      if (
        err.message.toLowerCase().includes('could not be restored') ||
        err.message.toLowerCase().includes('operating system error')
      )
        throw new Error(
          `Lỗi đọc từ device. Kiểm tra file backup và quyền đọc.`
        );
      throw new Error(`Lỗi khi restore database: ${err.message}`);
    }

    // 2. Restore Full Backup WITH NORECOVERY
    console.log(`Restoring Full Backup from device WITH NORECOVERY...`);
    const escapedFullPath = fullBackupPath.replace(/'/g, "''");
    const restoreFullQuery = `RESTORE DATABASE [${DB_NAME}] FROM DISK = N'${escapedFullPath}' WITH FILE = 1, REPLACE, NORECOVERY, STATS = 5;`;
    await request.query(restoreFullQuery);
    console.log(`Full Backup restored WITH NORECOVERY.`);

    // 3. Restore Log Backups WITH NORECOVERY (trừ log cuối cùng chứa STOPAT)
    console.log(`Restoring Transaction Logs WITH NORECOVERY...`);
    let lastRestoredLog = null;
    for (const logFile of logFiles) {
      const logFilePath = logFile.path.replace(/'/g, "''");
      console.log(`Attempting to restore Log: ${logFile.name}`);
      const restoreLogQuery = `RESTORE LOG [${DB_NAME}] FROM DISK = N'${logFilePath}' WITH NORECOVERY, STATS = 10;`;
      try {
        await request.query(restoreLogQuery);
        console.log(`Restored Log: ${logFile.name} WITH NORECOVERY.`);
        lastRestoredLog = logFile; // Ghi nhớ log cuối cùng đã restore thành công
      } catch (logErr) {
        console.warn(
          `Could not restore log ${logFile.name}. Error: ${logErr.message}.`
        );
        if (logErr.number === 4326 || logErr.number === 4305) {
          // Lỗi sequence hoặc file quá mới
          console.log(
            `Log sequence mismatch or file too recent. Stopping log restore loop.`
          );
          break;
        }
        throw logErr; // Ném lỗi khác
      }
    }

    // 4. Restore Log cuối cùng WITH STOPAT và RECOVERY
    // Sử dụng log cuối cùng đã restore thành công (nếu có) để áp dụng STOPAT
    if (!lastRestoredLog) {
      // Nếu không có log nào được restore (chỉ có full), thử recovery ngay
      console.log(
        `No transaction logs were restored. Attempting to recover database...`
      );
      const recoverOnlyQuery = `RESTORE DATABASE [${DB_NAME}] WITH RECOVERY;`;
      await request.query(recoverOnlyQuery);
    } else {
      console.log(
        `Applying STOPAT = '${stopAtString}' on last successfully restored log and RECOVERING...`
      );
      const lastLogPath = lastRestoredLog.path.replace(/'/g, "''");
      // Thực hiện restore log cuối cùng lại một lần nữa với STOPAT và RECOVERY
      // LƯU Ý: Nếu targetTime nằm trong khoảng trống giữa các log, lệnh này có thể lỗi.
      // Cách an toàn hơn là restore hết log với NORECOVERY rồi mới RECOVERY.
      // Tạm dùng cách đơn giản:
      const stopAtQuery = `RESTORE LOG [${DB_NAME}] FROM DISK = N'${lastLogPath}' WITH STOPAT = '${stopAtString}', RECOVERY;`;
      try {
        await request.query(stopAtQuery);
      } catch (stopAtErr) {
        // Nếu lỗi STOPAT, thử recovery đơn giản xem sao
        console.warn(
          `STOPAT failed: ${stopAtErr.message}. Attempting simple RECOVERY...`
        );
        const recoverOnlyQuery = `RESTORE DATABASE [${DB_NAME}] WITH RECOVERY;`;
        try {
          await request.query(recoverOnlyQuery);
        } catch (recoverErr) {
          console.error(
            'Simple recovery also failed after STOPAT error:',
            recoverErr.message
          );
          throw stopAtErr; // Ném lỗi STOPAT gốc
        }
      }

      // Cách an toàn hơn (thay thế bước 4 trên):
      // console.log(`All logs restored. Attempting final recovery...`);
      // const finalRecoveryQuery = `RESTORE DATABASE [${DB_NAME}] WITH RECOVERY;`;
      // await request.query(finalRecoveryQuery);
    }

    console.log(
      `Database [${DB_NAME}] restored to point in time '${pointInTime}' and recovered.`
    );

    // 5. Đóng master pool
    await masterPool.close();
    masterPool = null;
    // 6. Kết nối lại Pool chính
    if (mainPoolWasClosed) await reconnectMainPool();
    return true;
  } catch (err) {
    console.error(`SQL error during Point-in-Time restore:`, err);
    if (masterPool && masterPool.connected) {
      try {
        const recoveryRequest = masterPool.request();
        await recoveryRequest.query(
          `ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`
        );
      } catch (recoveryErr) {
        console.error(
          `Failed to set MULTI_USER after restore error: ${recoveryErr.message}`
        );
      }
      await masterPool.close();
    }
    if (mainPoolWasClosed) await reconnectMainPool();
    // Phân tích lỗi PITR tương tự hàm cũ
    if (err.message.toLowerCase().includes('permission denied'))
      throw new Error(`Không có quyền RESTORE DATABASE/LOG.`);
    if (err.message.toLowerCase().includes('stopat'))
      throw new Error(
        `Thời điểm phục hồi '${pointInTime}' không hợp lệ hoặc nằm ngoài phạm vi backup log.`
      );
    if (err.message.toLowerCase().includes('sequence'))
      throw new Error(`Lỗi thứ tự backup log.`);
    if (err.message.toLowerCase().includes('operating system error'))
      throw new Error(`Lỗi đọc file backup (full hoặc log).`);
    throw new Error(`Lỗi khi thực hiện Point-in-Time Restore: ${err.message}`);
  }
};

/**
 * Gọi SP để tạo backup device nếu chưa tồn tại.
 */
BackupRestoreModel.createBackupDevice = async () => {
  if (!DEVICE_PHYSICAL_PATH) {
    throw new AppError(
      'Đường dẫn BACKUP_DEVICE_PATH chưa được cấu hình trong file .env.',
      500
    );
  }
  try {
    const pool = await db.getPool(); // Nên dùng admin pool cho tác vụ này
    const request = pool.request();
    request.input('DeviceName', sql.NVarChar(128), DEVICE_NAME);
    request.input('PhysicalPath', sql.NVarChar(260), DEVICE_PHYSICAL_PATH);
    await request.execute('dbo.sp_TaoBackupDevice');
    console.log(`[MODEL] Device '${DEVICE_NAME}' created or verified.`);
    return { deviceName: DEVICE_NAME, physicalPath: DEVICE_PHYSICAL_PATH };
  } catch (err) {
    console.error(`[MODEL] Error creating backup device:`, err);
    throw new AppError(`Lỗi khi tạo backup device: ${err.message}`, 500);
  }
};

/**
 * Gọi SP để thực hiện Full Backup.
 * @param {boolean} isInit - True nếu muốn ghi đè, false nếu muốn nối tiếp.
 */
BackupRestoreModel.backupFull = async (isInit = false) => {
  try {
    const backupName = `Full Backup - ${new Date().toISOString()}`;
    const pool = await db.getPool();
    const request = pool.request();
    request.timeout = 300000; // 5 phút timeout
    request.input('DatabaseName', sql.NVarChar(128), DB_NAME);
    request.input('DeviceName', sql.NVarChar(128), DEVICE_NAME);
    request.input('BackupName', sql.NVarChar(255), backupName);
    request.input('Init', sql.Bit, isInit ? 1 : 0);
    await request.execute('dbo.sp_BackupFullToDevice');
    return { backupName, type: 'Full' };
  } catch (err) {
    console.error(`[MODEL] Error during Full Backup:`, err);
    throw new AppError(`Lỗi khi Full Backup: ${err.message}`, 500);
  }
};

/**
 * Gọi SP để thực hiện Log Backup.
 */
BackupRestoreModel.backupLog = async () => {
  try {
    const backupName = `Log Backup - ${new Date().toISOString()}`;
    const pool = await db.getPool();
    const request = pool.request();
    request.timeout = 60000; // 1 phút
    request.input('DatabaseName', sql.NVarChar(128), DB_NAME);
    request.input('DeviceName', sql.NVarChar(128), DEVICE_NAME);
    request.input('BackupName', sql.NVarChar(255), backupName);
    await request.execute('dbo.sp_BackupLogToDevice');
    return { backupName, type: 'Log' };
  } catch (err) {
    console.error(`[MODEL] Error during Log Backup:`, err);
    throw new AppError(`Lỗi khi Log Backup: ${err.message}`, 500);
  }
};

/**
 * Đọc danh sách các bản backup từ device.
 * Trả về mảng rỗng nếu file device chưa tồn tại.
 */
BackupRestoreModel.getBackupListFromDevice = async () => {
  if (!DEVICE_PHYSICAL_PATH) {
    throw new AppError('Đường dẫn BACKUP_DEVICE_PATH chưa được cấu hình.', 500);
  }

  // BƯỚC 1: KIỂM TRA SỰ TỒN TẠI CỦA FILE TRƯỚC
  try {
    await fs.access(DEVICE_PHYSICAL_PATH);
    // Nếu không có lỗi, file tồn tại, tiếp tục bước 2
  } catch (error) {
    // Nếu có lỗi (thường là ENOENT - file not found)
    console.log(
      `[MODEL] Backup device file not found at: ${DEVICE_PHYSICAL_PATH}. Returning empty history.`
    );
    return []; // Trả về mảng rỗng, không làm gì thêm
  }

  // BƯỚC 2: NẾU FILE TỒN TẠI, MỚI THỰC HIỆN RESTORE HEADERONLY
  try {
    const pool = await db.getPool(); // Sửa lại thành getPool()
    const request = pool.request();
    // Dùng tên device logic thay vì đường dẫn vật lý để an toàn hơn
    const query = `RESTORE HEADERONLY FROM ${DEVICE_NAME}`;

    const result = await request.query(query);

    return result.recordset.map((r) => ({
      position: r.Position,
      name: r.BackupName,
      description: r.BackupDescription,
      type: r.BackupType, // 1 = Full, 2 = Log
      backupDate: r.BackupFinishDate,
    }));
  } catch (err) {
    // Lỗi thường gặp là file device chưa tồn tại
    if (err.number === 3201) {
      return []; // Trả về mảng rỗng nếu file chưa có
    }
    console.error(`[MODEL] Error reading backup history from device:`, err);
    throw new AppError(
      `Lỗi đọc lịch sử sao lưu từ device: ${err.message}`,
      500
    );
  }
};

/**
 * Thực hiện Restore từ device.
 * @param {Array<number>} positions - Mảng các vị trí file cần restore theo thứ tự.
 * @param {string|null} pointInTime - Thời điểm cần phục hồi (nếu có).
 */
BackupRestoreModel.restoreFromDevice = async (
  positions,
  pointInTime = null
) => {
  let masterPool;
  const DB_NAME = dbConfig.database;
  const DEVICE_NAME = `DEVICE_${DB_NAME}`;

  await db.closeMainPool();

  try {
    console.log(
      '[MODEL] Creating temporary connection to [master] for restore...'
    );
    const masterDbConfig = {
      ...dbConfig,
      database: 'master',
      pool: { max: 1, min: 0 },
    };
    masterPool = new sql.ConnectionPool(masterDbConfig);
    await masterPool.connect();

    try {
      const singleUserQuery = `ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`;
      await masterPool.request().query(singleUserQuery);
      console.log('[MODEL] Database set to SINGLE_USER mode.');

      const restoreRequest = masterPool.request();
      restoreRequest.timeout = 900000;

      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const isLastFile = i === positions.length - 1;

        let restoreQuery;

        // Lấy thông tin của bản backup này để biết nó là Full hay Log
        const headerInfoResult = await masterPool
          .request()
          .query(
            `RESTORE HEADERONLY FROM ${DEVICE_NAME} WITH FILE = ${position}`
          );
        const backupInfo = headerInfoResult.recordset[0];
        const backupType = backupInfo.BackupType; // 1=Full, 2=Log, 5=Diff

        if (pointInTime && isLastFile && backupType === 2) {
          // Chỉ áp dụng STOPAT cho LOG
          // **SỬA LỖI ĐỊNH DẠNG THỜI GIAN**
          // Chuyển chuỗi ISO thành định dạng SQL Server yêu cầu (YYYY-MM-DDTHH:MI:SS.mmm)
          // và đảm bảo nó là UTC để tránh lỗi múi giờ.
          const stopAtTime = new Date(pointInTime)
            .toISOString()
            .slice(0, 23)
            .replace('T', ' ');

          restoreQuery = `RESTORE LOG [${DB_NAME}] FROM ${DEVICE_NAME} WITH FILE = ${position}, STOPAT = '${stopAtTime}', RECOVERY;`;
        } else if (isLastFile) {
          restoreQuery = `RESTORE DATABASE [${DB_NAME}] FROM ${DEVICE_NAME} WITH FILE = ${position}, REPLACE, RECOVERY;`;
        } else {
          restoreQuery = `RESTORE DATABASE [${DB_NAME}] FROM ${DEVICE_NAME} WITH FILE = ${position}, REPLACE, NORECOVERY;`;
        }

        console.log(`[MODEL] Executing Restore: ${restoreQuery}`);
        await restoreRequest.query(restoreQuery);
      }

      console.log('[MODEL] Restore process completed successfully.');
      // Không cần SET MULTI_USER nữa vì RECOVERY đã làm việc đó
      return true;
    } catch (restoreError) {
      console.error(
        '[MODEL] ERROR during restore sequence. Attempting to recover database...',
        restoreError
      );
      try {
        const recoveryRequest = masterPool.request();
        await recoveryRequest.query(
          `RESTORE DATABASE [${DB_NAME}] WITH RECOVERY;`
        );
        console.log(
          '[MODEL] Database successfully recovered to last valid state.'
        );
      } catch (recoveryFinalError) {
        console.error(
          '[MODEL] !!! CRITICAL: FAILED TO RECOVER DATABASE. MANUAL INTERVENTION REQUIRED. !!!',
          recoveryFinalError
        );
      }
      throw restoreError;
    }
  } catch (err) {
    console.error(
      '[MODEL] CRITICAL ERROR during restore process wrapper:',
      err
    );
    throw new AppError(`Lỗi trong quá trình Restore: ${err.message}`, 500);
  } finally {
    if (masterPool && masterPool.connected) await masterPool.close();
    await db.reconnectMainPool();
  }
};

module.exports = BackupRestoreModel;
