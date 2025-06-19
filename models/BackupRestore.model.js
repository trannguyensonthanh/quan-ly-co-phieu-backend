/**
 * models/BackupRestore.model.js
 * Module thực hiện các chức năng Backup/Restore cho SQL Server.
 */
const sql = require('mssql');
const db = require('./db');
const dbConfig = require('../config/db.config');
const fs = require('fs').promises;
const path = require('path');
const AppError = require('../utils/errors/AppError');

const BackupRestoreModel = {};
const DB_NAME = dbConfig.database;
const DEVICE_NAME = `DEVICE_${DB_NAME}`;
const DEVICE_PHYSICAL_PATH = process.env.BACKUP_DEVICE_PATH;

/**
 * Thực hiện Full Backup vào một file mới có timestamp.
 * @param {string} fullBackupPath Đường dẫn đầy đủ đến file .bak mới sẽ được tạo.
 * @returns {Promise<boolean>} True nếu thành công.
 */
BackupRestoreModel.backupDatabaseToNewFile = async (fullBackupPath) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.timeout = 300000;
    const escapedPath = fullBackupPath.replace(/'/g, "''");
    const backupQuery = `BACKUP DATABASE [${DB_NAME}] TO DISK = N'${escapedPath}' WITH NOFORMAT, NAME = N'${DB_NAME}-Full Backup ${path.basename(
      fullBackupPath
    )}', SKIP, NOREWIND, NOUNLOAD, STATS = 10;`;
    await request.query(backupQuery);
    return true;
  } catch (err) {
    try {
      await fs.unlink(fullBackupPath);
    } catch (unlinkErr) {}
    throw new Error(`Lỗi khi backup database: ${err.message}`);
  }
};

/**
 * Ngắt kết nối của pool chính tạm thời
 */
const disconnectMainPool = async () => {
  const mainPool = await db.getPool();
  if (mainPool && mainPool.connected) {
    await mainPool.close();
  }
};

/**
 * Kết nối lại pool chính sau khi restore
 */
const reconnectMainPool = async () => {
  try {
    await db.connectDb();
  } catch (err) {}
};

/**
 * (Optional) Hàm xóa Backup Device
 */
BackupRestoreModel.deleteBackupDevice = async (deviceName) => {
  try {
    if (!deviceName || !/^[a-zA-Z0-9_]+$/.test(deviceName)) {
      throw new Error('Tên device không hợp lệ.');
    }
    const masterPool = new sql.ConnectionPool({
      ...dbConfig,
      database: 'master',
      pool: { max: 1, min: 0 },
    });
    await masterPool.connect();
    const request = masterPool.request();
    const query = `
          IF EXISTS (SELECT 1 FROM sys.backup_devices WHERE name = N'${deviceName}')
          BEGIN
              EXEC sp_dropdevice N'${deviceName}';
          END
      `;
    await request.query(query);
    await masterPool.close();
    return true;
  } catch (err) {
    throw new Error(`Lỗi khi xóa backup device: ${err.message}`);
  }
};

/**
 * Thực hiện Restore Full từ một file .bak cụ thể.
 * @param {string} fullBackupPath Đường dẫn đầy đủ đến file .bak cần restore.
 * @returns {Promise<boolean>} True nếu thành công.
 */
BackupRestoreModel.restoreDatabaseFromSpecificFile = async (fullBackupPath) => {
  let masterPool = null;
  let mainPoolWasClosed = false;
  try {
    const mainPool = await db.getPool();
    if (mainPool && mainPool.connected) {
      await mainPool.close();
      mainPoolWasClosed = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    try {
      await fs.access(fullBackupPath, fs.constants.R_OK);
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
    request.timeout = 600000;
    const alterDbSingleUser = `ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`;
    try {
      await request.query(alterDbSingleUser);
    } catch (alterErr) {
      if (masterPool && masterPool.connected) await masterPool.close();
      if (mainPoolWasClosed) await reconnectMainPool();
      throw new Error(
        `Không thể đưa database về chế độ single-user. Lỗi: ${alterErr.message}. Đảm bảo không có kết nối nào khác (SSMS?).`
      );
    }
    const escapedPath = fullBackupPath.replace(/'/g, "''");
    const restoreQuery = `RESTORE DATABASE [${DB_NAME}] FROM DISK = N'${escapedPath}' WITH FILE = 1, REPLACE, RECOVERY, STATS = 5;`;
    try {
      await request.query(restoreQuery);
    } catch (restoreErr) {
      throw new Error(
        `Lỗi khi restore database từ file '${path.basename(fullBackupPath)}': ${
          restoreErr.message
        }`
      );
    }
    const alterDbMultiUser = `ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`;
    try {
      await request.query(alterDbMultiUser);
    } catch (multiUserErr) {
      throw new Error(
        `Không thể đưa database về chế độ multi-user. Lỗi: ${multiUserErr.message}`
      );
    }
    await masterPool.close();
    masterPool = null;
    if (mainPoolWasClosed) await reconnectMainPool();
    return true;
  } catch (err) {
    if (masterPool && masterPool.connected) {
      try {
        const recoveryRequest = masterPool.request();
        await recoveryRequest.query(
          `ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`
        );
      } catch (recoveryErr) {}
      await masterPool.close();
    }
    if (mainPoolWasClosed) await reconnectMainPool();
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
    const mainPool = await db.getPool();
    if (mainPool && mainPool.connected) {
      await mainPool.close();
      mainPoolWasClosed = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const targetTime = new Date(pointInTime);
    if (isNaN(targetTime.getTime())) {
      throw new Error('Thời điểm phục hồi không hợp lệ.');
    }
    const stopAtString = targetTime.toISOString().slice(0, 23);
    if (!logBackupPath) {
      throw new Error('Đường dẫn chứa backup log chưa được cấu hình.');
    }
    if (!fullBackupPath)
      throw new Error('Chưa chọn file Full Backup làm điểm gốc.');
    try {
      await fs.access(fullBackupPath, fs.constants.R_OK);
    } catch (err) {
      throw new Error(
        `File Full Backup '${path.basename(
          fullBackupPath
        )}' không tồn tại hoặc không thể đọc.`
      );
    }
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
              return { name: f, path: filePath, mtime: stats.mtime };
            } catch (statErr) {
              return null;
            }
          }
          return null;
        })
      );
      logFiles = fileStats
        .filter((f) => f !== null && f.mtime <= targetTime)
        .sort((a, b) => a.mtime - b.mtime);
    } catch (readErr) {
      throw new Error(
        `Không thể đọc thư mục chứa backup log: ${logBackupPath}`
      );
    }
    if (logFiles.length === 0) {
      throw new Error(
        `Không tìm thấy file log backup nào phù hợp trong ${logBackupPath}.`
      );
    }
    masterPool = new sql.ConnectionPool({
      ...dbConfig,
      database: 'master',
      pool: { max: 1, min: 0 },
    });
    await masterPool.connect();
    const request = masterPool.request();
    request.timeout = 900000;
    const alterDbSingleUser = `ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`;
    try {
      await request.query(alterDbSingleUser);
    } catch (alterErr) {
      if (masterPool && masterPool.connected) {
        try {
          const recoveryRequest = masterPool.request();
          await recoveryRequest.query(
            `ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`
          );
        } catch (recoveryErr) {}
        await masterPool.close();
      }
      throw new Error(`Lỗi khi restore database: ${alterErr.message}`);
    }
    const escapedFullPath = fullBackupPath.replace(/'/g, "''");
    const restoreFullQuery = `RESTORE DATABASE [${DB_NAME}] FROM DISK = N'${escapedFullPath}' WITH FILE = 1, REPLACE, NORECOVERY, STATS = 5;`;
    await request.query(restoreFullQuery);
    let lastRestoredLog = null;
    for (const logFile of logFiles) {
      const logFilePath = logFile.path.replace(/'/g, "''");
      const restoreLogQuery = `RESTORE LOG [${DB_NAME}] FROM DISK = N'${logFilePath}' WITH NORECOVERY, STATS = 10;`;
      try {
        await request.query(restoreLogQuery);
        lastRestoredLog = logFile;
      } catch (logErr) {
        if (logErr.number === 4326 || logErr.number === 4305) {
          break;
        }
        throw logErr;
      }
    }
    if (!lastRestoredLog) {
      const recoverOnlyQuery = `RESTORE DATABASE [${DB_NAME}] WITH RECOVERY;`;
      await request.query(recoverOnlyQuery);
    } else {
      const lastLogPath = lastRestoredLog.path.replace(/'/g, "''");
      const stopAtQuery = `RESTORE LOG [${DB_NAME}] FROM DISK = N'${lastLogPath}' WITH STOPAT = '${stopAtString}', RECOVERY;`;
      try {
        await request.query(stopAtQuery);
      } catch (stopAtErr) {
        const recoverOnlyQuery = `RESTORE DATABASE [${DB_NAME}] WITH RECOVERY;`;
        try {
          await request.query(recoverOnlyQuery);
        } catch (recoverErr) {
          throw stopAtErr;
        }
      }
    }
    await masterPool.close();
    masterPool = null;
    if (mainPoolWasClosed) await reconnectMainPool();
    return true;
  } catch (err) {
    if (masterPool && masterPool.connected) {
      try {
        const recoveryRequest = masterPool.request();
        await recoveryRequest.query(
          `ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`
        );
      } catch (recoveryErr) {}
      await masterPool.close();
    }
    if (mainPoolWasClosed) await reconnectMainPool();
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
    const pool = await db.getPool();
    const request = pool.request();
    request.input('DeviceName', sql.NVarChar(128), DEVICE_NAME);
    request.input('PhysicalPath', sql.NVarChar(260), DEVICE_PHYSICAL_PATH);
    await request.execute('dbo.sp_TaoBackupDevice');
    return { deviceName: DEVICE_NAME, physicalPath: DEVICE_PHYSICAL_PATH };
  } catch (err) {
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
    request.timeout = 300000;
    request.input('DatabaseName', sql.NVarChar(128), DB_NAME);
    request.input('DeviceName', sql.NVarChar(128), DEVICE_NAME);
    request.input('BackupName', sql.NVarChar(255), backupName);
    request.input('Init', sql.Bit, isInit ? 1 : 0);
    await request.execute('dbo.sp_BackupFullToDevice');
    return { backupName, type: 'Full' };
  } catch (err) {
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
    request.timeout = 60000;
    request.input('DatabaseName', sql.NVarChar(128), DB_NAME);
    request.input('DeviceName', sql.NVarChar(128), DEVICE_NAME);
    request.input('BackupName', sql.NVarChar(255), backupName);
    await request.execute('dbo.sp_BackupLogToDevice');
    return { backupName, type: 'Log' };
  } catch (err) {
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
  try {
    await fs.access(DEVICE_PHYSICAL_PATH);
  } catch (error) {
    return [];
  }
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const query = `RESTORE HEADERONLY FROM ${DEVICE_NAME}`;
    const result = await request.query(query);
    return result.recordset.map((r) => ({
      position: r.Position,
      name: r.BackupName,
      description: r.BackupDescription,
      type: r.BackupType,
      backupDate: r.BackupFinishDate,
    }));
  } catch (err) {
    if (err.number === 3201) {
      return [];
    }
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
      const restoreRequest = masterPool.request();
      restoreRequest.timeout = 900000;
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const isLastFile = i === positions.length - 1;
        let restoreQuery;
        const headerInfoResult = await masterPool
          .request()
          .query(
            `RESTORE HEADERONLY FROM ${DEVICE_NAME} WITH FILE = ${position}`
          );
        const backupInfo = headerInfoResult.recordset[0];
        const backupType = backupInfo.BackupType;
        if (pointInTime && isLastFile && backupType === 2) {
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
        await restoreRequest.query(restoreQuery);
      }
      return true;
    } catch (restoreError) {
      try {
        const recoveryRequest = masterPool.request();
        await recoveryRequest.query(
          `RESTORE DATABASE [${DB_NAME}] WITH RECOVERY;`
        );
      } catch (recoveryFinalError) {}
      throw restoreError;
    }
  } catch (err) {
    throw new AppError(`Lỗi trong quá trình Restore: ${err.message}`, 500);
  } finally {
    if (masterPool && masterPool.connected) await masterPool.close();
    await db.reconnectMainPool();
  }
};

module.exports = BackupRestoreModel;
