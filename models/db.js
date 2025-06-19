// models/db.js
const sql = require('mssql');
const dbConfig = require('../config/db.config.js');

let pool; // Biến lưu trữ connection pool

const connectDb = async () => {
  try {
    if (pool && pool.connected) {
      console.log('Database pool already connected.');
      return pool;
    }
    // Nếu pool là null hoặc đã bị đóng (pool && !pool.connected)
    console.log('Creating or Recreating database connection pool...');
    // Đóng pool cũ nếu nó tồn tại nhưng đã disconnected (đề phòng)
    if (pool && !pool.connected) {
      try {
        await pool.close();
      } catch (e) {
        /* ignore */
      }
    }
    pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log('Database connection pool created/recreated successfully.');

    pool.on('error', (err) => {
      console.error('Database Pool Error:', err);
      // Có thể thêm logic để cố gắng kết nối lại ở đây
      pool = null; // Reset pool để lần gọi sau thử tạo lại
    });

    return pool;
  } catch (err) {
    console.error('Database Connection Failed:', err);
    // Ném lỗi ra ngoài để ứng dụng biết kết nối thất bại
    throw err;
    // Hoặc xử lý khác tùy theo yêu cầu, ví dụ: thoát ứng dụng
    // process.exit(1);
  }
};

// Hàm để lấy connection pool (đảm bảo đã kết nối)
const getPool = async () => {
  if (!pool || !pool.connected) {
    console.log('Pool not available or closed, attempting connectDb...');
    // connectDb giờ sẽ tự động tạo lại pool nếu cần
    await connectDb();
  }
  if (!pool || !pool.connected) {
    // Kiểm tra lại lần nữa sau khi connectDb chạy
    throw new Error('Failed to establish database connection pool.');
  }
  return pool;
};

// Hàm tiện ích để thực thi query (sử dụng pool)
const query = async (sqlQuery, params = []) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    // Thêm tham số vào request nếu có
    params.forEach((param) => {
      request.input(param.name, param.type, param.value);
    });
    const result = await request.query(sqlQuery);
    return result;
  } catch (err) {
    console.error('SQL error:', err);
    // Ném lỗi ra ngoài để controller hoặc service có thể xử lý
    throw err;
  }
};

// --- HÀM MỚI ĐỂ RESET POOL ---
const resetPool = () => {
  if (pool && !pool.connected) {
    // Chỉ reset nếu pool tồn tại và đã đóng
    console.log('Resetting closed database connection pool reference.');
    pool = null;
  } else if (pool && pool.connected) {
    console.warn('Attempted to reset an active pool. Close it first.');
  } else {
    console.log('Pool reference is already null.');
  }
};

const closeMainPool = async () => {
  if (pool && pool.connected) {
    console.log('Closing main pool...');
    await pool.close();
    pool = null;
  }
};

const reconnectMainPool = async () => {
  console.log('Reconnecting main pool...');
  await getPool();
};

module.exports = {
  connectDb,
  getPool,
  query,
  sql, // Export cả module sql để có thể dùng các kiểu dữ liệu (sql.NVarChar, sql.Int, ...)
  resetPool,
  closeMainPool,
  reconnectMainPool,
};
