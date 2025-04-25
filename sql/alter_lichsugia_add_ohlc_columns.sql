-- File: alter_lichsugia_add_ohlc_columns.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Altering Table LICHSUGIA to add OHLC columns...';

-- Thêm cột GiaMoCua
IF COL_LENGTH('dbo.LICHSUGIA', 'GiaMoCua') IS NULL
BEGIN
    ALTER TABLE dbo.LICHSUGIA
    ADD GiaMoCua FLOAT NULL; -- Cho phép NULL ban đầu
    PRINT 'Added GiaMoCua column.';
END
ELSE
BEGIN
    PRINT 'Column GiaMoCua already exists.';
END
GO

-- Thêm cột GiaCaoNhat
IF COL_LENGTH('dbo.LICHSUGIA', 'GiaCaoNhat') IS NULL
BEGIN
    ALTER TABLE dbo.LICHSUGIA
    ADD GiaCaoNhat FLOAT NULL; -- Cho phép NULL ban đầu
    PRINT 'Added GiaCaoNhat column.';
END
ELSE
BEGIN
    PRINT 'Column GiaCaoNhat already exists.';
END
GO

-- Thêm cột GiaThapNhat
IF COL_LENGTH('dbo.LICHSUGIA', 'GiaThapNhat') IS NULL
BEGIN
    ALTER TABLE dbo.LICHSUGIA
    ADD GiaThapNhat FLOAT NULL; -- Cho phép NULL ban đầu
    PRINT 'Added GiaThapNhat column.';
END
ELSE
BEGIN
    PRINT 'Column GiaThapNhat already exists.';
END
GO

-- Thêm cột GiaDongCua
IF COL_LENGTH('dbo.LICHSUGIA', 'GiaDongCua') IS NULL
BEGIN
    ALTER TABLE dbo.LICHSUGIA
    ADD GiaDongCua FLOAT NULL; -- Cho phép NULL ban đầu
    PRINT 'Added GiaDongCua column.';
END
ELSE
BEGIN
    PRINT 'Column GiaDongCua already exists.';
END
GO

PRINT 'Finished altering LICHSUGIA table.';
GO

-- Optional: Cập nhật giá trị ban đầu cho dữ liệu cũ (nếu có)
-- Ví dụ: Đặt giá OHLC bằng giá TC cho các ngày cũ chưa có

PRINT 'Updating existing NULL OHLC values in LICHSUGIA...';
UPDATE dbo.LICHSUGIA
SET GiaMoCua = ISNULL(GiaMoCua, GiaTC),
    GiaCaoNhat = ISNULL(GiaCaoNhat, GiaTC),
    GiaThapNhat = ISNULL(GiaThapNhat, GiaTC),
    GiaDongCua = ISNULL(GiaDongCua, GiaTC)
WHERE GiaMoCua IS NULL OR GiaCaoNhat IS NULL OR GiaThapNhat IS NULL OR GiaDongCua IS NULL;
PRINT 'Existing NULL OHLC values updated (Optional).';
GO