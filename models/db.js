// models/db.js
// Database connection pool and query utilities for MSSQL

const sql = require('mssql');
const dbConfig = require('../config/db.config.js');

let pool;

/**
 * Kết nối tới database và tạo connection pool nếu chưa có.
 */
const connectDb = async () => {
  try {
    if (pool && pool.connected) {
      return pool;
    }
    if (pool && !pool.connected) {
      try {
        await pool.close();
      } catch (e) {}
    }
    pool = await new sql.ConnectionPool(dbConfig).connect();

    pool.on('error', (err) => {
      pool = null;
    });

    return pool;
  } catch (err) {
    throw err;
  }
};

/**
 * Lấy connection pool đã kết nối, hoặc tự động kết nối lại nếu cần.
 */
const getPool = async () => {
  if (!pool || !pool.connected) {
    await connectDb();
  }
  if (!pool || !pool.connected) {
    throw new Error('Failed to establish database connection pool.');
  }
  return pool;
};

/**
 * Thực thi truy vấn SQL với tham số truyền vào.
 */
const query = async (sqlQuery, params = []) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    params.forEach((param) => {
      request.input(param.name, param.type, param.value);
    });
    const result = await request.query(sqlQuery);
    return result;
  } catch (err) {
    throw err;
  }
};

/**
 * Reset pool nếu pool đã đóng.
 */
const resetPool = () => {
  if (pool && !pool.connected) {
    pool = null;
  } else if (pool && pool.connected) {
  } else {
  }
};

/**
 * Đóng pool chính nếu đang mở.
 */
const closeMainPool = async () => {
  if (pool && pool.connected) {
    await pool.close();
    pool = null;
  }
};

/**
 * Kết nối lại pool chính.
 */
const reconnectMainPool = async () => {
  await getPool();
};

module.exports = {
  connectDb,
  getPool,
  query,
  sql,
  resetPool,
  closeMainPool,
  reconnectMainPool,
};
