const sql = require("mssql");
const db = require("./db");
const AppError = require("../utils/errors/AppError");

const AdminModel = {};

// --- HÀM MỚI: Kiểm tra trùng lặp tổng quát ---
/**
 * Kiểm tra xem ID (MaNV/MaNDT), CMND, hoặc Email đã tồn tại trong cả hai bảng NhanVien và NDT chưa.
 * @param {string} idToCheck Mã NV hoặc Mã NDT cần kiểm tra.
 * @param {string} cmndToCheck CMND cần kiểm tra.
 * @param {string | null} emailToCheck Email cần kiểm tra (có thể null).
 * @returns {Promise<{ idExists: boolean, cmndExists: boolean, emailExists: boolean, existingRole: 'NhanVien' | 'NhaDauTu' | null }>}
 */

AdminModel.checkGlobalExistence = async (
  idToCheck,
  cmndToCheck,
  emailToCheck
) => {
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.input("IdParam", sql.NVarChar(20), idToCheck);
    request.input("CmndParam", sql.NChar(10), cmndToCheck);
    request.input("EmailParam", sql.NVarChar(50), emailToCheck);

    const query = `
      DECLARE @IdExists BIT = 0;
      DECLARE @CmndExists BIT = 0;
      DECLARE @EmailExists BIT = 0;
      DECLARE @ExistingRole NVARCHAR(10) = NULL;

      IF EXISTS (SELECT 1 FROM dbo.NhanVien WHERE MaNV = @IdParam) BEGIN SET @IdExists = 1; SET @ExistingRole = 'NhanVien'; END
      ELSE IF EXISTS (SELECT 1 FROM dbo.NDT WHERE MaNDT = @IdParam) BEGIN SET @IdExists = 1; SET @ExistingRole = 'NhaDauTu'; END

      IF EXISTS (SELECT 1 FROM dbo.NhanVien WHERE CMND = @CmndParam) SET @CmndExists = 1;
      IF EXISTS (SELECT 1 FROM dbo.NDT WHERE CMND = @CmndParam) SET @CmndExists = 1;

      IF @IdExists = 1 BEGIN
        IF @ExistingRole = 'NhanVien' AND EXISTS (SELECT 1 FROM dbo.NDT WHERE CMND = @CmndParam) SET @CmndExists = 1;
        IF @ExistingRole = 'NhaDauTu' AND EXISTS (SELECT 1 FROM dbo.NhanVien WHERE CMND = @CmndParam) SET @CmndExists = 1;
      END

      IF @EmailParam IS NOT NULL AND LTRIM(RTRIM(@EmailParam)) <> ''
      BEGIN
        IF EXISTS (SELECT 1 FROM dbo.NhanVien WHERE Email = @EmailParam) SET @EmailExists = 1;
        IF EXISTS (SELECT 1 FROM dbo.NDT WHERE Email = @EmailParam) SET @EmailExists = 1;

        IF @IdExists = 1 BEGIN
          IF @ExistingRole = 'NhanVien' AND EXISTS (SELECT 1 FROM dbo.NDT WHERE Email = @EmailParam) SET @EmailExists = 1;
          IF @ExistingRole = 'NhaDauTu' AND EXISTS (SELECT 1 FROM dbo.NhanVien WHERE Email = @EmailParam) SET @EmailExists = 1;
        END
      END

      SELECT @IdExists AS idExists, @CmndExists AS cmndExists, @EmailExists AS emailExists, @ExistingRole AS existingRole;
    `;

    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) {
    console.error("SQL error checking global existence:", err);
    throw new AppError("Lỗi khi kiểm tra thông tin tồn tại.", 500);
  }
};

module.exports = AdminModel;
