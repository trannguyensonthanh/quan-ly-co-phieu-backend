-- File: alter_lenhdat_allow_null_gia.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Altering LENHDAT.Gia column to allow NULLs...';

-- Trước tiên, có thể cần xóa Default Constraint hoặc Check Constraint liên quan đến Gia > 0 nếu có
-- (Script tạo bảng gốc của chúng ta có CHECK (Gia > 0))
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_LENHDAT_Gia' AND parent_object_id = OBJECT_ID('dbo.LENHDAT'))
BEGIN
    ALTER TABLE dbo.LENHDAT DROP CONSTRAINT CK_LENHDAT_Gia;
    PRINT 'Dropped CK_LENHDAT_Gia constraint.';
END
GO

-- Thay đổi cột Gia để cho phép NULL
ALTER TABLE dbo.LENHDAT
ALTER COLUMN Gia FLOAT NULL; -- Cho phép NULL

PRINT 'Altered LENHDAT.Gia to allow NULLs.';
GO

-- Thêm lại Check Constraint nếu muốn (chỉ kiểm tra > 0 nếu không phải NULL)
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_LENHDAT_Gia_NotNull' AND parent_object_id = OBJECT_ID('dbo.LENHDAT'))
BEGIN
    ALTER TABLE dbo.LENHDAT WITH CHECK
    ADD CONSTRAINT CK_LENHDAT_Gia_NotNull CHECK (Gia IS NULL OR Gia > 0); -- Chỉ check > 0 nếu Gia không NULL
    PRINT 'Added CK_LENHDAT_Gia_NotNull constraint.';
END
GO

PRINT 'LENHDAT table altered successfully.';
GO