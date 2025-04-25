-- File: sp_PrepareNextDayPrices_Complete_v4.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Creating/Altering Stored Procedure sp_PrepareNextDayPrices (Complete v4)...';
GO

CREATE OR ALTER PROCEDURE dbo.sp_PrepareNextDayPrices
    @NgayHienTai DATE,
    @NgayTiepTheo DATE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @BienDoTran FLOAT = 0.10;
    DECLARE @BienDoSan FLOAT = 0.10;
    DECLARE @BuocGia FLOAT = 100;
    DECLARE @GiaTCDefault FLOAT = 10000;

    PRINT N'Preparing prices for ' + CONVERT(VARCHAR, @NgayTiepTheo) + N' based on closing prices of ' + CONVERT(VARCHAR, @NgayHienTai);

    IF @NgayTiepTheo <= @NgayHienTai BEGIN RAISERROR('Ngày tiếp theo phải lớn hơn ngày hiện tại.', 16, 1); RETURN; END
    IF EXISTS (SELECT 1 FROM dbo.LICHSUGIA WHERE Ngay = @NgayTiepTheo) BEGIN PRINT N'Warning: Overwriting existing price data for ' + CONVERT(VARCHAR, @NgayTiepTheo); END

    -- *** SỬA LỖI SUBQUERY v3: Dùng Bảng tạm thực tế #GiaNgayMai ***
    -- Tạo bảng tạm thực tế
    IF OBJECT_ID('tempdb..#GiaNgayMai') IS NOT NULL DROP TABLE #GiaNgayMai;
    CREATE TABLE #GiaNgayMai (
        MaCP NVARCHAR(10) PRIMARY KEY,
        GiaTC_Moi FLOAT NOT NULL,
        GiaTran_Moi FLOAT NULL, -- Cho phép NULL ban đầu
        GiaSan_Moi FLOAT NULL   -- Cho phép NULL ban đầu
    );

    -- CTE để lấy giá hôm nay
    WITH GiaHomNay AS (
        SELECT MaCP, GiaTC, GiaDongCua
        FROM dbo.LICHSUGIA
        WHERE Ngay = @NgayHienTai
    )
    -- Bước 1: INSERT MaCP và GiaTC_Moi vào bảng tạm
    INSERT INTO #GiaNgayMai (MaCP, GiaTC_Moi)
    SELECT
        cp.MaCP,
        ISNULL(gn.GiaDongCua, ISNULL(gn.GiaTC, @GiaTCDefault)) AS GiaTC_Moi_Calc
    FROM
        dbo.COPHIEU cp
    LEFT JOIN
        GiaHomNay gn ON cp.MaCP = gn.MaCP
    WHERE
        cp.Status = 1;

    PRINT N'Calculated TC prices for ' + CAST(@@ROWCOUNT AS VARCHAR) + N' active stocks for ' + CONVERT(VARCHAR, @NgayTiepTheo);

    -- Bước 2: UPDATE giá Trần/Sàn trong bảng tạm dựa trên GiaTC_Moi đã có
    UPDATE #GiaNgayMai
    SET
        GiaTran_Moi = FLOOR( (GiaTC_Moi * (1 + @BienDoTran)) / @BuocGia ) * @BuocGia,
        GiaSan_Moi = CEILING( (GiaTC_Moi * (1 - @BienDoSan)) / @BuocGia ) * @BuocGia;

    PRINT N'Calculated Floor/Ceiling prices for ' + CAST(@@ROWCOUNT AS VARCHAR) + N' active stocks.';


    -- Bắt đầu Transaction để INSERT/DELETE
    BEGIN TRANSACTION;
    BEGIN TRY
        -- Xóa giá cũ của ngày tiếp theo
        DELETE FROM dbo.LICHSUGIA WHERE Ngay = @NgayTiepTheo AND MaCP IN (SELECT MaCP FROM #GiaNgayMai);
        PRINT N'Deleted existing price data (if any) for relevant stocks on ' + CONVERT(VARCHAR, @NgayTiepTheo);

        -- Chèn giá mới từ bảng tạm
        INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua)
        SELECT MaCP, @NgayTiepTheo, GiaTran_Moi, GiaSan_Moi, GiaTC_Moi, NULL, NULL, NULL, NULL
        FROM #GiaNgayMai;

        DECLARE @RowCount INT = @@ROWCOUNT;
        PRINT N'Inserted prices for ' + CAST(@RowCount AS VARCHAR) + N' active stocks for ' + CONVERT(VARCHAR, @NgayTiepTheo);

        COMMIT TRANSACTION;
        PRINT N'Price preparation completed successfully.';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT N'*** ERROR DURING PRICE PREPARATION ***';
        DECLARE @ErrorMessage NVARCHAR(MAX) = ERROR_MESSAGE(), @ErrorSeverity INT = ERROR_SEVERITY(), @ErrorState INT = ERROR_STATE();
        PRINT N'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR); PRINT N'Error Message: ' + @ErrorMessage; PRINT N'Error Line: ' + CAST(ERROR_LINE() AS VARCHAR);
        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
        -- Dọn dẹp bảng tạm nếu lỗi
        IF OBJECT_ID('tempdb..#GiaNgayMai') IS NOT NULL DROP TABLE #GiaNgayMai;
        RETURN;
    END CATCH

    -- Dọn dẹp bảng tạm sau khi thành công
    IF OBJECT_ID('tempdb..#GiaNgayMai') IS NOT NULL DROP TABLE #GiaNgayMai;

END;
GO

PRINT 'Stored Procedure sp_PrepareNextDayPrices created/altered.';
GO

-- Ví dụ cách gọi SP này (thường gọi từ Node.js Service)
/*
DECLARE @HomNay DATE = CAST(GETDATE() AS DATE);
DECLARE @NgayMai DATE;

-- Logic xác định ngày giao dịch tiếp theo (ví dụ đơn giản: +1 ngày)
-- Cần logic phức tạp hơn để bỏ qua T7, CN, ngày lễ
SET @NgayMai = DATEADD(day, 1, @HomNay);
IF DATEPART(weekday, @NgayMai) = 1 SET @NgayMai = DATEADD(day, 1, @NgayMai); -- Nếu là CN -> Thứ 2
IF DATEPART(weekday, @NgayMai) = 7 SET @NgayMai = DATEADD(day, 2, @NgayMai); -- Nếu là T7 -> Thứ 2

EXEC dbo.sp_PrepareNextDayPrices @NgayHienTai = @HomNay, @NgayTiepTheo = @NgayMai;

-- Kiểm tra kết quả
SELECT * FROM dbo.LICHSUGIA WHERE Ngay = @NgayMai;
*/

/*
-- Ví dụ gọi Stored Procedure không bỏ qua T7, CN, ngày lễ
DECLARE @NgayHienTai DATE = CAST(GETDATE() AS DATE); -- hoặc truyền vào 1 ngày bất kỳ
DECLARE @NgayTiepTheo DATE;

-- Không cần kiểm tra thứ, chỉ +1 ngày đơn giản
SET @NgayTiepTheo = DATEADD(DAY, 1, @NgayHienTai);

-- Gọi stored procedure
EXEC dbo.sp_PrepareNextDayPrices 
    @NgayHienTai = @NgayHienTai,
    @NgayTiepTheo = @NgayTiepTheo;

-- Kiểm tra kết quả giá ngày mai
SELECT * 
FROM dbo.LICHSUGIA 
WHERE Ngay = @NgayTiepTheo;
*/

