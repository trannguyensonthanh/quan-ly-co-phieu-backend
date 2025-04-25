USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Altering DATETIME columns to DATETIME2(3)...';

-- Bảng LENHDAT
PRINT 'Processing LENHDAT...';
-- 1. Drop Default Constraint cũ
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_LENHDAT_NgayGD' AND parent_object_id = OBJECT_ID('dbo.LENHDAT'))
BEGIN
    ALTER TABLE dbo.LENHDAT DROP CONSTRAINT DF_LENHDAT_NgayGD;
    PRINT 'Dropped DF_LENHDAT_NgayGD constraint.';
END
GO
-- 2. Alter Column Type
ALTER TABLE dbo.LENHDAT ALTER COLUMN NgayGD DATETIME2(3) NOT NULL;
PRINT 'Altered LENHDAT.NgayGD to DATETIME2(3).';
GO
-- 3. Add Default Constraint mới
ALTER TABLE dbo.LENHDAT ADD CONSTRAINT DF_LENHDAT_NgayGD DEFAULT SYSDATETIME() FOR NgayGD; -- Dùng SYSDATETIME() cho DATETIME2
PRINT 'Added new DF_LENHDAT_NgayGD constraint using SYSDATETIME().';
GO


-- Bảng LENHKHOP
PRINT 'Processing LENHKHOP...';
-- 1. Drop Default Constraint cũ
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_LENHKHOP_NgayGioKhop' AND parent_object_id = OBJECT_ID('dbo.LENHKHOP'))
BEGIN
    ALTER TABLE dbo.LENHKHOP DROP CONSTRAINT DF_LENHKHOP_NgayGioKhop;
    PRINT 'Dropped DF_LENHKHOP_NgayGioKhop constraint.';
END
GO
-- 2. Alter Column Type
ALTER TABLE dbo.LENHKHOP ALTER COLUMN NgayGioKhop DATETIME2(3) NOT NULL;
PRINT 'Altered LENHKHOP.NgayGioKhop to DATETIME2(3).';
GO
-- 3. Add Default Constraint mới
ALTER TABLE dbo.LENHKHOP ADD CONSTRAINT DF_LENHKHOP_NgayGioKhop DEFAULT SYSDATETIME() FOR NgayGioKhop;
PRINT 'Added new DF_LENHKHOP_NgayGioKhop constraint using SYSDATETIME().';
GO


-- Bảng COPHIEU_UndoLog
PRINT 'Processing COPHIEU_UndoLog...';
-- 1. Drop Default Constraint cũ
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_UndoLog_Timestamp' AND parent_object_id = OBJECT_ID('dbo.COPHIEU_UndoLog'))
BEGIN
    ALTER TABLE dbo.COPHIEU_UndoLog DROP CONSTRAINT DF_UndoLog_Timestamp;
    PRINT 'Dropped DF_UndoLog_Timestamp constraint.';
END
GO
-- 2. Alter Column Type
ALTER TABLE dbo.COPHIEU_UndoLog ALTER COLUMN Timestamp DATETIME2(3) NOT NULL;
PRINT 'Altered COPHIEU_UndoLog.Timestamp to DATETIME2(3).';
GO
-- 3. Add Default Constraint mới
ALTER TABLE dbo.COPHIEU_UndoLog ADD CONSTRAINT DF_UndoLog_Timestamp DEFAULT SYSDATETIME() FOR Timestamp;
PRINT 'Added new DF_UndoLog_Timestamp constraint using SYSDATETIME().';
GO


-- Bảng GIAODICHTIEN
PRINT 'Processing GIAODICHTIEN...';
-- 1. Drop Default Constraint cũ
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_GIAODICHTIEN_NgayGD' AND parent_object_id = OBJECT_ID('dbo.GIAODICHTIEN'))
BEGIN
    ALTER TABLE dbo.GIAODICHTIEN DROP CONSTRAINT DF_GIAODICHTIEN_NgayGD;
    PRINT 'Dropped DF_GIAODICHTIEN_NgayGD constraint.';
END
GO
-- 2. Alter Column Type
ALTER TABLE dbo.GIAODICHTIEN ALTER COLUMN NgayGD DATETIME2(3) NOT NULL;
PRINT 'Altered GIAODICHTIEN.NgayGD to DATETIME2(3).';
GO
-- 3. Add Default Constraint mới
ALTER TABLE dbo.GIAODICHTIEN ADD CONSTRAINT DF_GIAODICHTIEN_NgayGD DEFAULT SYSDATETIME() FOR NgayGD;
PRINT 'Added new DF_GIAODICHTIEN_NgayGD constraint using SYSDATETIME().';
GO

-- Các bảng khác nếu có cột DATETIME cần đổi (ví dụ: LICHSUGIA.Ngay đã là DATE thì không cần)

PRINT 'Finished altering DATETIME columns to DATETIME2(3).';
GO