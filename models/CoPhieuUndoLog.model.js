/**
 * models/CoPhieuUndoLog.model.js
 * Model thao tác với bảng COPHIEU_UndoLog (ghi nhận các hành động có thể hoàn tác trên cổ phiếu).
 */
const sql = require('mssql');
const db = require('./db');

const CoPhieuUndoLog = {};

/**
 * Ghi log hành động có thể undo. Sẽ xóa log cũ của cùng MaCP trước khi ghi log mới.
 * @param {string} maCP Mã cổ phiếu.
 * @param {string} actionType 'INSERT', 'UPDATE', 'DELETE'.
 * @param {object | null} oldData Dữ liệu cũ (dạng object) cho UPDATE/DELETE, null cho INSERT.
 * @param {string | null} performedBy Mã nhân viên thực hiện.
 * @returns {Promise<object>} Bản ghi log vừa tạo.
 */
CoPhieuUndoLog.create = async (maCP, actionType, oldData, performedBy) => {
  const oldDataJson = oldData ? JSON.stringify(oldData) : null;
  let transaction;
  try {
    const pool = await db.getPool();
    const request = pool.request();

    request.input('MaCP_ins', sql.NVarChar(10), maCP);
    request.input('ActionType', sql.VarChar(10), actionType);
    request.input('OldData', sql.NVarChar(sql.MAX), oldDataJson);
    request.input('PerformedBy', sql.NChar(20), performedBy);

    const insertQuery = `
            INSERT INTO COPHIEU_UndoLog (MaCP, ActionType, OldData, PerformedBy)
            OUTPUT INSERTED.*
            VALUES (@MaCP_ins, @ActionType, @OldData, @PerformedBy);
        `;
    const result = await request.query(insertQuery);

    console.log(`Undo log created for MaCP ${maCP}, Action: ${actionType}`);
    return result.recordset[0];
  } catch (err) {
    if (transaction && transaction.active) {
      await transaction.rollback();
    }
    console.error('SQL error creating Undo Log:', err);
    throw new Error(`Lỗi khi ghi nhận hành động hoàn tác: ${err.message}`);
  }
};

/**
 * Tìm bản ghi log undo mới nhất cho một MaCP.
 * @param {string} maCP Mã cổ phiếu.
 * @returns {Promise<object|null>} Log gần nhất hoặc null.
 */
CoPhieuUndoLog.findLatestByMaCP = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);
    const query = `
            SELECT TOP 1 UndoLogID, MaCP, ActionType, Timestamp, OldData, PerformedBy
            FROM COPHIEU_UndoLog
            WHERE MaCP = @MaCP
            ORDER BY UndoLogID DESC;
        `;
    const result = await request.query(query);
    return result.recordset[0] || null;
  } catch (err) {
    console.error('SQL error finding latest Undo Log:', err);
    throw new Error(`Lỗi khi tìm hành động hoàn tác gần nhất: ${err.message}`);
  }
};

/**
 * Xóa một bản ghi log undo theo ID.
 * @param {number} undoLogID ID của log cần xóa.
 * @returns {Promise<boolean>} True nếu xóa thành công.
 */
CoPhieuUndoLog.deleteLog = async (undoLogID) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('UndoLogID', sql.Int, undoLogID);
    const query = 'DELETE FROM COPHIEU_UndoLog WHERE UndoLogID = @UndoLogID;';
    const result = await request.query(query);
    console.log(`Deleted Undo log ID: ${undoLogID}`);
    return result.rowsAffected[0] > 0;
  } catch (err) {
    console.error('SQL error deleting Undo Log:', err);
    throw new Error(
      `Lỗi khi xóa hành động hoàn tác đã thực hiện: ${err.message}`
    );
  }
};

/**
 * Xóa TẤT CẢ log undo (dùng để reset khi qua ngày mới hoặc khởi động)
 * @returns {Promise<number>} Số lượng bản ghi đã xóa.
 */
CoPhieuUndoLog.clearAllLogs = async () => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const query = 'DELETE FROM COPHIEU_UndoLog;';
    const result = await request.query(query);
    console.log(
      `Cleared ${result.rowsAffected[0]} records from COPHIEU_UndoLog.`
    );
    return result.rowsAffected[0];
  } catch (err) {
    console.error('SQL error clearing Undo Logs:', err);
    throw new Error(`Lỗi khi xóa lịch sử hoàn tác: ${err.message}`);
  }
};

/**
 * Lấy tất cả các bản ghi log undo, có thể phân trang hoặc lọc theo thời gian nếu cần.
 * @param {object} [options] Tùy chọn lọc hoặc phân trang (ví dụ: { limit, offset, startDate, endDate })
 * @returns {Promise<Array<object>>} Mảng các bản ghi log.
 */
CoPhieuUndoLog.getAllLogs = async (options = {}) => {
  const { limit = 100, offset = 0 } = options;

  try {
    const pool = await db.getPool();
    const request = pool.request();

    const query = `
          SELECT UndoLogID, MaCP, ActionType, Timestamp, OldData, PerformedBy
          FROM COPHIEU_UndoLog
          ORDER BY Timestamp DESC
      `;
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error getting all Undo Logs:', err);
    throw new AppError('Lỗi khi lấy lịch sử hoàn tác.', 500);
  }
};

/**
 * Tìm bản ghi log undo mới nhất TRÊN TOÀN BẢNG.
 * @returns {Promise<object|null>} Log gần nhất hoặc null.
 */
CoPhieuUndoLog.findLatestGlobal = async () => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const query = `
          SELECT TOP 1 UndoLogID, MaCP, ActionType, Timestamp, OldData, PerformedBy
          FROM COPHIEU_UndoLog
          ORDER BY UndoLogID DESC;
      `;
    const result = await request.query(query);
    return result.recordset[0] || null;
  } catch (err) {
    console.error('SQL error finding latest global Undo Log:', err);
    throw new Error(`Lỗi khi tìm hành động hoàn tác gần nhất: ${err.message}`);
  }
};

/**
 * Xóa TẤT CẢ các bản ghi log undo cho một MaCP cụ thể.
 * Thường được gọi khi cổ phiếu được niêm yết (không thể undo nữa).
 * @param {string} maCP Mã cổ phiếu cần xóa log.
 * @returns {Promise<number>} Số lượng log đã xóa.
 */
CoPhieuUndoLog.deleteLogsByMaCP = async (maCP) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input('MaCP', sql.NVarChar(10), maCP);
    const query = 'DELETE FROM COPHIEU_UndoLog WHERE MaCP = @MaCP;';
    const result = await request.query(query);
    console.log(
      `Deleted ${result.rowsAffected[0]} Undo log(s) for MaCP: ${maCP}`
    );
    return result.rowsAffected[0];
  } catch (err) {
    console.error(`SQL error deleting Undo Logs for ${maCP}:`, err);
    return -1;
  }
};

module.exports = CoPhieuUndoLog;
