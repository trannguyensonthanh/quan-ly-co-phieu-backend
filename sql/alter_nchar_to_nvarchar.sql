-- File: alter_nchar_to_nvarchar.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT '=== STARTING CONVERSION FROM NCHAR TO NVARCHAR ===';
GO

-- *** Lưu ý: Script này giả định tên các ràng buộc theo quy ước phổ biến.
-- *** Hãy kiểm tra lại tên thực tế trong DB của bạn nếu gặp lỗi DROP CONSTRAINT.
-- *** LUÔN BACKUP DATABASE TRƯỚC KHI CHẠY!

BEGIN TRANSACTION; -- Chạy toàn bộ trong một transaction lớn

BEGIN TRY

    -- === Bảng NDT ===
    PRINT 'Processing Table: NDT';
    -- Drop FKs referencing NDT (từ TAIKHOAN_NGANHANG, SOHUU)
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_TAIKHOAN_NGANHANG_NDT') ALTER TABLE dbo.TAIKHOAN_NGANHANG DROP CONSTRAINT FK_TAIKHOAN_NGANHANG_NDT;
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_SOHUU_NDT') ALTER TABLE dbo.SOHUU DROP CONSTRAINT FK_SOHUU_NDT;
    -- Drop PK, Unique Constraints, Check Constraints liên quan đến NCHAR
    IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'PK_NDT') ALTER TABLE dbo.NDT DROP CONSTRAINT PK_NDT;
    IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'UQ_NDT_CMND') ALTER TABLE dbo.NDT DROP CONSTRAINT UQ_NDT_CMND;
    IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_NDT_GioiTinh') ALTER TABLE dbo.NDT DROP CONSTRAINT CK_NDT_GioiTinh;
    PRINT 'NDT: Dropped related constraints.';
    -- Alter Columns
    ALTER TABLE dbo.NDT ALTER COLUMN MaNDT NVARCHAR(20) NOT NULL; -- MaNDT
    ALTER TABLE dbo.NDT ALTER COLUMN CMND NVARCHAR(10) NOT NULL; -- CMND
    ALTER TABLE dbo.NDT ALTER COLUMN GioiTinh NVARCHAR(5) NOT NULL; -- GioiTinh
    PRINT 'NDT: Altered NCHAR columns to NVARCHAR.';
    -- Add Constraints Back
    ALTER TABLE dbo.NDT ADD CONSTRAINT PK_NDT PRIMARY KEY (MaNDT);
    ALTER TABLE dbo.NDT ADD CONSTRAINT UQ_NDT_CMND UNIQUE (CMND);
    ALTER TABLE dbo.NDT ADD CONSTRAINT CK_NDT_GioiTinh CHECK (GioiTinh IN (N'Nam', N'Nữ'));
    -- Add FKs Back
    ALTER TABLE dbo.TAIKHOAN_NGANHANG ADD CONSTRAINT FK_TAIKHOAN_NGANHANG_NDT FOREIGN KEY (MaNDT) REFERENCES dbo.NDT (MaNDT);
    ALTER TABLE dbo.SOHUU ADD CONSTRAINT FK_SOHUU_NDT FOREIGN KEY (MaNDT) REFERENCES dbo.NDT (MaNDT);
    PRINT 'NDT: Re-added constraints.';
    GO

    -- === Bảng NhanVien ===
    PRINT 'Processing Table: NhanVien';
     -- Drop FKs referencing NhanVien (từ GIAODICHTIEN)
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_GIAODICHTIEN_NV') ALTER TABLE dbo.GIAODICHTIEN DROP CONSTRAINT FK_GIAODICHTIEN_NV;
    -- Drop PK, Unique, Check
    IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'PK_NhanVien') ALTER TABLE dbo.NhanVien DROP CONSTRAINT PK_NhanVien;
    IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'UQ_NhanVien_CMND') ALTER TABLE dbo.NhanVien DROP CONSTRAINT UQ_NhanVien_CMND;
    IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_NhanVien_GioiTinh') ALTER TABLE dbo.NhanVien DROP CONSTRAINT CK_NhanVien_GioiTinh;
     PRINT 'NhanVien: Dropped related constraints.';
    -- Alter Columns
    ALTER TABLE dbo.NhanVien ALTER COLUMN MaNV NVARCHAR(20) NOT NULL; -- MaNV
    ALTER TABLE dbo.NhanVien ALTER COLUMN CMND NVARCHAR(10) NOT NULL; -- CMND
    ALTER TABLE dbo.NhanVien ALTER COLUMN GioiTinh NVARCHAR(5) NOT NULL; -- GioiTinh
    PRINT 'NhanVien: Altered NCHAR columns to NVARCHAR.';
    -- Add Constraints Back
    ALTER TABLE dbo.NhanVien ADD CONSTRAINT PK_NhanVien PRIMARY KEY (MaNV);
    ALTER TABLE dbo.NhanVien ADD CONSTRAINT UQ_NhanVien_CMND UNIQUE (CMND);
    ALTER TABLE dbo.NhanVien ADD CONSTRAINT CK_NhanVien_GioiTinh CHECK (GioiTinh IN (N'Nam', N'Nữ'));
     -- Add FKs Back
    ALTER TABLE dbo.GIAODICHTIEN ADD CONSTRAINT FK_GIAODICHTIEN_NV FOREIGN KEY (MaNVThucHien) REFERENCES dbo.NhanVien (MaNV);
    PRINT 'NhanVien: Re-added constraints.';
    GO

    -- === Bảng NGANHANG ===
    PRINT 'Processing Table: NGANHANG';
    -- Drop FKs referencing NGANHANG (từ TAIKHOAN_NGANHANG)
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_TAIKHOAN_NGANHANG_NH') ALTER TABLE dbo.TAIKHOAN_NGANHANG DROP CONSTRAINT FK_TAIKHOAN_NGANHANG_NH;
    -- Drop PK, Unique
    IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'PK_NGANHANG') ALTER TABLE dbo.NGANHANG DROP CONSTRAINT PK_NGANHANG;
    IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'UQ_NGANHANG_TenNH') ALTER TABLE dbo.NGANHANG DROP CONSTRAINT UQ_NGANHANG_TenNH; -- Tên NH là NVARCHAR sẵn rồi
     PRINT 'NGANHANG: Dropped related constraints.';
    -- Alter Columns
    ALTER TABLE dbo.NGANHANG ALTER COLUMN MaNH NVARCHAR(20) NOT NULL; -- MaNH
    ALTER TABLE dbo.NGANHANG ALTER COLUMN Phone NVARCHAR(10) NULL; -- Phone (Cho phép NULL)
    PRINT 'NGANHANG: Altered NCHAR columns to NVARCHAR.';
    -- Add Constraints Back
    ALTER TABLE dbo.NGANHANG ADD CONSTRAINT PK_NGANHANG PRIMARY KEY (MaNH);
    ALTER TABLE dbo.NGANHANG ADD CONSTRAINT UQ_NGANHANG_TenNH UNIQUE (TenNH);
     -- Add FKs Back
    ALTER TABLE dbo.TAIKHOAN_NGANHANG ADD CONSTRAINT FK_TAIKHOAN_NGANHANG_NH FOREIGN KEY (MaNH) REFERENCES dbo.NGANHANG (MaNH);
    PRINT 'NGANHANG: Re-added constraints.';
    GO

     -- === Bảng TAIKHOAN_NGANHANG ===
    PRINT 'Processing Table: TAIKHOAN_NGANHANG';
    -- Drop FKs referencing TAIKHOAN_NGANHANG (từ LENHDAT, GIAODICHTIEN)
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_LENHDAT_TK') ALTER TABLE dbo.LENHDAT DROP CONSTRAINT FK_LENHDAT_TK;
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_GIAODICHTIEN_TK') ALTER TABLE dbo.GIAODICHTIEN DROP CONSTRAINT FK_GIAODICHTIEN_TK;
     -- Drop PK
    IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'PK_TAIKHOAN_NGANHANG') ALTER TABLE dbo.TAIKHOAN_NGANHANG DROP CONSTRAINT PK_TAIKHOAN_NGANHANG;
     PRINT 'TAIKHOAN_NGANHANG: Dropped related constraints.';
     -- Alter Columns
    ALTER TABLE dbo.TAIKHOAN_NGANHANG ALTER COLUMN MaTK NVARCHAR(20) NOT NULL; -- MaTK
    ALTER TABLE dbo.TAIKHOAN_NGANHANG ALTER COLUMN MaNDT NVARCHAR(20) NOT NULL; -- MaNDT (Phải khớp với NDT.MaNDT)
    ALTER TABLE dbo.TAIKHOAN_NGANHANG ALTER COLUMN MaNH NVARCHAR(20) NOT NULL; -- MaNH (Phải khớp với NGANHANG.MaNH)
    PRINT 'TAIKHOAN_NGANHANG: Altered NCHAR columns to NVARCHAR.';
    -- Add Constraints Back
    ALTER TABLE dbo.TAIKHOAN_NGANHANG ADD CONSTRAINT PK_TAIKHOAN_NGANHANG PRIMARY KEY (MaTK);
    -- Add FKs Back (bao gồm cả FK đã drop ở các bảng khác)
    ALTER TABLE dbo.LENHDAT ADD CONSTRAINT FK_LENHDAT_TK FOREIGN KEY (MaTK) REFERENCES dbo.TAIKHOAN_NGANHANG(MaTK);
    ALTER TABLE dbo.GIAODICHTIEN ADD CONSTRAINT FK_GIAODICHTIEN_TK FOREIGN KEY (MaTK) REFERENCES dbo.TAIKHOAN_NGANHANG(MaTK);
    -- FK tới NDT và NGANHANG đã được add lại ở phần xử lý bảng NDT và NGANHANG
    PRINT 'TAIKHOAN_NGANHANG: Re-added constraints.';
    GO

    -- === Bảng COPHIEU ===
    -- MaCP đã được đổi thành NVARCHAR(10) ở lần sửa trước, kiểm tra lại
    PRINT 'Checking Table: COPHIEU';
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'COPHIEU' AND COLUMN_NAME = 'MaCP' AND DATA_TYPE = 'nchar')
    BEGIN
        PRINT 'COPHIEU.MaCP is still NCHAR, attempting to alter...';
        -- Cần Drop các FK và PK liên quan (LICHSUGIA, SOHUU, LENHDAT)
        IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_LICHSUGIA_CP') ALTER TABLE dbo.LICHSUGIA DROP CONSTRAINT FK_LICHSUGIA_CP;
        IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_SOHUU_CP') ALTER TABLE dbo.SOHUU DROP CONSTRAINT FK_SOHUU_CP;
        IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_LENHDAT_CP') ALTER TABLE dbo.LENHDAT DROP CONSTRAINT FK_LENHDAT_CP;
        IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'PK_COPHIEU') ALTER TABLE dbo.COPHIEU DROP CONSTRAINT PK_COPHIEU;
        -- Alter
        ALTER TABLE dbo.COPHIEU ALTER COLUMN MaCP NVARCHAR(10) NOT NULL;
        PRINT 'Altered COPHIEU.MaCP to NVARCHAR(10).';
        -- Add PK back
        ALTER TABLE dbo.COPHIEU ADD CONSTRAINT PK_COPHIEU PRIMARY KEY (MaCP);
        -- Add FKs back (Các bảng khác cũng cần alter MaCP)
        PRINT 'Remember to alter MaCP in LICHSUGIA, SOHUU, LENHDAT and re-add FKs!';
        -- Tốt nhất nên chạy script alter MaCP riêng biệt đã làm trước đó.
    END
    ELSE
    BEGIN
        PRINT 'COPHIEU.MaCP is already NVARCHAR or VARCHAR.';
    END
    GO

    -- === Bảng LENHDAT ===
    PRINT 'Processing Table: LENHDAT';
    -- Drop FKs, Checks liên quan NCHAR
    -- FK_LENHDAT_CP, FK_LENHDAT_TK đã xử lý ở bảng khác
    IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_LENHDAT_LoaiGD') ALTER TABLE dbo.LENHDAT DROP CONSTRAINT CK_LENHDAT_LoaiGD; -- CHAR(1) -> VARCHAR(1)
    IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_LENHDAT_LoaiLenh') ALTER TABLE dbo.LENHDAT DROP CONSTRAINT CK_LENHDAT_LoaiLenh;
    PRINT 'LENHDAT: Dropped related constraints.';
    -- Alter Columns
    ALTER TABLE dbo.LENHDAT ALTER COLUMN LoaiGD VARCHAR(1) NOT NULL; -- Dùng VARCHAR(1) thay cho CHAR(1)
    ALTER TABLE dbo.LENHDAT ALTER COLUMN LoaiLenh NVARCHAR(5) NOT NULL; -- LoaiLenh NCHAR(5) -> NVARCHAR(5)
    ALTER TABLE dbo.LENHDAT ALTER COLUMN MaCP NVARCHAR(10) NOT NULL; -- MaCP (nếu chưa đổi)
    ALTER TABLE dbo.LENHDAT ALTER COLUMN MaTK NVARCHAR(20) NOT NULL; -- MaTK (khớp TAIKHOAN_NGANHANG)
    PRINT 'LENHDAT: Altered CHAR/NCHAR columns to VARCHAR/NVARCHAR.';
    -- Add Constraints Back
    ALTER TABLE dbo.LENHDAT ADD CONSTRAINT CK_LENHDAT_LoaiGD CHECK (LoaiGD IN ('M', 'B'));
    ALTER TABLE dbo.LENHDAT ADD CONSTRAINT CK_LENHDAT_LoaiLenh CHECK (LoaiLenh IN (N'LO', N'ATO', N'ATC'));
    -- FK_LENHDAT_CP, FK_LENHDAT_TK đã được add lại ở bảng khác
    PRINT 'LENHDAT: Re-added constraints.';
    GO

     -- === Bảng SOHUU ===
     -- MaCP, MaNDT đã được xử lý ở bảng COPHIEU, NDT
     -- Chỉ cần kiểm tra lại
     PRINT 'Checking Table: SOHUU';
     GO

     -- === Bảng COPHIEU_UndoLog ===
     -- MaCP đã là NVARCHAR, PerformedBy nên là NVARCHAR
     PRINT 'Processing Table: COPHIEU_UndoLog';
     -- Drop FK (nếu có, nhưng ko nên có)
     -- Alter Columns
     ALTER TABLE dbo.COPHIEU_UndoLog ALTER COLUMN PerformedBy NVARCHAR(20) NULL; -- NCHAR(20) -> NVARCHAR(20)
     PRINT 'COPHIEU_UndoLog: Altered PerformedBy to NVARCHAR(20).';
     GO

      -- === Bảng GIAODICHTIEN ===
      -- MaTK, MaNVThucHien đã được xử lý
      PRINT 'Checking Table: GIAODICHTIEN';
      GO


    -- Commit transaction nếu mọi thứ thành công
    COMMIT TRANSACTION;
    PRINT '=== NCHAR to NVARCHAR Conversion Completed Successfully ===';

END TRY
BEGIN CATCH
    -- Rollback nếu có lỗi
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    PRINT '*** ERROR DURING NCHAR to NVARCHAR Conversion ***';
    -- In thông tin lỗi chi tiết
    DECLARE @ErrorMessage_Conv NVARCHAR(MAX) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity_Conv INT = ERROR_SEVERITY();
    DECLARE @ErrorState_Conv INT = ERROR_STATE();
    PRINT N'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR);
    PRINT N'Error Message: ' + @ErrorMessage_Conv;
    PRINT N'Error Line: ' + CAST(ERROR_LINE() AS VARCHAR);

    RAISERROR(@ErrorMessage_Conv, @ErrorSeverity_Conv, @ErrorState_Conv);
    PRINT '=== Conversion Failed. Transaction Rolled Back ===';
END CATCH
GO