// // models/UserManagement.model.js
// const sql = require("mssql");
// const db = require("./db");
// const dbConfig = require("../config/db.config"); // Cần tên database

// const UserManagement = {};

// // Hàm tạo SQL Login, DB User và thêm vào Role
// UserManagement.createSqlLoginAndUser = async (
//   loginName,
//   password,
//   roleName
// ) => {
//   // RoleName phải là 'Nhanvien' hoặc 'Nhà đầu tư' (match tên role trong DB)
//   if (roleName !== "Nhanvien" && roleName !== "Nhà đầu tư") {
//     throw new Error(`Vai trò '${roleName}' không hợp lệ.`);
//   }

//   // Lưu ý: Câu lệnh SQL nhạy cảm với SQL Injection nếu không xử lý đúng.
//   // Tuy nhiên, mssql library thường xử lý các biến trong câu lệnh CREATE/ALTER nếu chúng không phải là tên đối tượng.
//   // Tên đối tượng (loginName, roleName) cần được kiểm tra cẩn thận.
//   // Biện pháp an toàn hơn là kiểm tra định dạng loginName nghiêm ngặt.
//   if (!/^[a-zA-Z0-9_]+$/.test(loginName)) {
//     throw new Error(
//       "Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới."
//     );
//   }

//   let transaction;
//   try {
//     const pool = await db.getPool();
//     transaction = new sql.Transaction(pool);
//     await transaction.begin();
//     const request = transaction.request();

//     // Sử dụng dynamic SQL một cách cẩn thận hoặc các lệnh riêng biệt
//     // 1. Tạo Login
//     // Lưu ý: Mật khẩu được truyền trực tiếp vào câu lệnh SQL. Cần đảm bảo password không chứa ký tự đặc biệt có thể gây lỗi SQL.
//     // SQL Server sẽ tự hash mật khẩu này.
//     const createLoginQuery = `CREATE LOGIN [${loginName}] WITH PASSWORD = N'${password.replace(
//       /'/g,
//       "''"
//     )}'`; // Thay ' thành '' để tránh lỗi SQL
//     await request.query(createLoginQuery);
//     console.log(`Created LOGIN [${loginName}]`);

//     // 2. Tạo User trong Database tương ứng
//     const createUserQuery = `USE [${dbConfig.database}]; CREATE USER [${loginName}] FOR LOGIN [${loginName}];`;
//     await request.query(createUserQuery);
//     console.log(
//       `Created USER [${loginName}] in database [${dbConfig.database}]`
//     );

//     // 3. Thêm User vào Role tương ứng
//     const addToRoleQuery = `USE [${dbConfig.database}]; ALTER ROLE [${roleName}] ADD MEMBER [${loginName}];`;
//     await request.query(addToRoleQuery);
//     console.log(`Added USER [${loginName}] to ROLE [${roleName}]`);

//     await transaction.commit();
//     return true;
//   } catch (err) {
//     if (transaction && transaction.active) {
//       await transaction.rollback();
//     }
//     console.error(`SQL error creating login/user ${loginName}:`, err);
//     // Phân tích lỗi cụ thể hơn
//     if (err.message.toLowerCase().includes("already exists")) {
//       throw new Error(`Login hoặc User '${loginName}' đã tồn tại.`);
//     }
//     if (err.message.toLowerCase().includes("permission denied")) {
//       throw new Error(
//         `Không có quyền thực hiện thao tác. Vui lòng kiểm tra quyền của tài khoản kết nối DB.`
//       );
//     }
//     if (err.message.toLowerCase().includes("password validation failed")) {
//       throw new Error(
//         `Mật khẩu không đáp ứng chính sách bảo mật của SQL Server.`
//       );
//     }
//     throw new Error(`Lỗi khi tạo login/user: ${err.message}`); // Ném lỗi chung nếu không xác định được
//   }
// };

// // Hàm xóa DB User và SQL Login
// UserManagement.dropSqlUserAndLogin = async (loginName) => {
//   if (!/^[a-zA-Z0-9_]+$/.test(loginName)) {
//     throw new Error("Tên đăng nhập không hợp lệ.");
//   }
//   let transaction;
//   try {
//     const pool = await db.getPool();
//     transaction = new sql.Transaction(pool);
//     await transaction.begin();
//     const request = transaction.request();

//     // 1. Xóa User khỏi Database
//     const dropUserQuery = `IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'${loginName}')
//                                 BEGIN
//                                     USE [${dbConfig.database}];
//                                     DROP USER [${loginName}];
//                                 END`;
//     await request.query(dropUserQuery);
//     console.log(`Dropped USER [${loginName}] if existed.`);

//     // 2. Xóa Login khỏi Server
//     const dropLoginQuery = `IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'${loginName}')
//                                  BEGIN
//                                      DROP LOGIN [${loginName}];
//                                  END`;
//     await request.query(dropLoginQuery);
//     console.log(`Dropped LOGIN [${loginName}] if existed.`);

//     await transaction.commit();
//     return true;
//   } catch (err) {
//     if (transaction && transaction.active) {
//       await transaction.rollback();
//     }
//     console.error(`SQL error dropping user/login ${loginName}:`, err);
//     if (err.message.toLowerCase().includes("permission denied")) {
//       throw new Error(
//         `Không có quyền thực hiện thao tác. Vui lòng kiểm tra quyền của tài khoản kết nối DB.`
//       );
//     }
//     if (
//       err.message
//         .toLowerCase()
//         .includes("cannot be dropped because it is currently in use") ||
//       err.message.toLowerCase().includes("owns a schema")
//     ) {
//       throw new Error(
//         `Không thể xóa user '${loginName}' vì đang được sử dụng hoặc sở hữu đối tượng.`
//       );
//     }
//     // Không ném lỗi nếu user/login không tồn tại vì mục đích là xóa nó
//     // throw new Error(`Lỗi khi xóa user/login: ${err.message}`);
//     return false; // Chỉ báo không có gì bị xóa hoặc có lỗi khác
//   }
// };

// // Hàm thay đổi mật khẩu của SQL Server Login
// UserManagement.changeSqlLoginPassword = async (loginName, newPassword) => {
//   // Kiểm tra loginName để phòng ngừa injection
//   if (!/^[a-zA-Z0-9_]+$/.test(loginName)) {
//     throw new Error("Tên đăng nhập không hợp lệ.");
//   }
//   try {
//     const pool = await db.getPool();
//     const request = pool.request();
//     // Lệnh ALTER LOGIN cần chạy trên master hoặc context server
//     // Không cần transaction cụ thể cho lệnh này
//     // Thay ' thành '' trong mật khẩu để tránh lỗi SQL
//     const alterLoginQuery = `ALTER LOGIN [${loginName}] WITH PASSWORD = N'${newPassword.replace(
//       /'/g,
//       "''"
//     )}'`;

//     console.log(
//       `Attempting to change password for SQL LOGIN [${loginName}]...`
//     );
//     await request.query(alterLoginQuery);
//     console.log(`Password changed successfully for SQL LOGIN [${loginName}].`);
//     return true;
//   } catch (err) {
//     console.error(`SQL error changing password for login ${loginName}:`, err);
//     if (err.message.toLowerCase().includes("permission denied")) {
//       throw new Error(
//         `Không có quyền ALTER LOGIN. Vui lòng kiểm tra quyền của tài khoản kết nối DB.`
//       );
//     }
//     if (err.message.toLowerCase().includes("password validation failed")) {
//       throw new Error(
//         `Mật khẩu mới không đáp ứng chính sách bảo mật của SQL Server.`
//       );
//     }
//     if (err.message.toLowerCase().includes("cannot find the login")) {
//       // Nếu login không tồn tại, có thể bỏ qua lỗi này hoặc báo lỗi nghiêm trọng hơn
//       console.warn(
//         `SQL Login [${loginName}] not found while trying to change password.`
//       );
//       // throw new Error(`Login '${loginName}' không tồn tại.`); // Hoặc chỉ log và tiếp tục
//       return false; // Chỉ báo không thay đổi được login
//     }
//     throw new Error(`Lỗi khi thay đổi mật khẩu login SQL: ${err.message}`);
//   }
// };

// module.exports = UserManagement;
