-- File: sp_CleanOldPriceHistory.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Creating/Altering Stored Procedure sp_CleanOldPriceHistory...';
GO

CREATE OR ALTER PROCEDURE dbo.sp_CleanOldPriceHistory
    @DaysToKeep INT -- Số ngày dữ liệu muốn giữ lại (ví dụ: 365 cho 1 năm)
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra tham số đầu vào
    IF @DaysToKeep <= 0
    BEGIN
        PRINT 'Error: Số ngày cần giữ lại (@DaysToKeep) phải là số dương.';
        RAISERROR('Số ngày cần giữ lại (@DaysToKeep) phải là số dương.', 16, 1);
        RETURN;
    END

    -- Xác định ngày cắt (Cut-off Date)
    -- Tất cả bản ghi CÓ NGÀY < ngày cắt sẽ bị xóa
    -- Ví dụ: Nếu DaysToKeep = 30, ngày hiện tại là 2023-10-27
    -- Ngày cắt sẽ là 2023-09-27 (CAST('2023-10-27' AS DATE) - 30)
    -- Những bản ghi có Ngay < '2023-09-27' sẽ bị xóa.
    DECLARE @CutoffDate DATE = DATEADD(day, -@DaysToKeep, CAST(GETDATE() AS DATE));

    PRINT N'Attempting to delete price history older than ' + CONVERT(VARCHAR, @CutoffDate) + N' (Keeping last ' + CAST(@DaysToKeep AS VARCHAR) + N' days)...';

    -- Biến đếm số dòng bị xóa
    DECLARE @DeletedRowCount INT = 0;
    DECLARE @BatchSize INT = 5000; -- Xóa theo lô nhỏ để tránh khóa bảng quá lâu
    DECLARE @TotalDeleted INT = 0;

    -- Vòng lặp xóa theo lô
    WHILE 1=1
    BEGIN
        BEGIN TRANSACTION;
        BEGIN TRY
            DELETE TOP (@BatchSize) -- Xóa từng lô nhỏ
            FROM dbo.LICHSUGIA
            WHERE Ngay < @CutoffDate;

            SET @DeletedRowCount = @@ROWCOUNT; -- Lấy số dòng vừa xóa
            SET @TotalDeleted = @TotalDeleted + @DeletedRowCount;

            COMMIT TRANSACTION;

            PRINT N'Deleted ' + CAST(@DeletedRowCount AS VARCHAR) + N' rows in this batch...';

            -- Nếu không còn dòng nào bị xóa trong lô này -> Kết thúc
            IF @DeletedRowCount < @BatchSize BREAK;

            -- Tạm dừng một chút giữa các lô để giảm tải (tùy chọn)
            WAITFOR DELAY '00:00:01'; -- Chờ 1 giây

        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            PRINT N'*** ERROR DURING DELETION BATCH ***';
            DECLARE @ErrorMessage NVARCHAR(MAX) = ERROR_MESSAGE(), @ErrorSeverity INT = ERROR_SEVERITY(), @ErrorState INT = ERROR_STATE();
            PRINT N'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR); PRINT N'Error Message: ' + @ErrorMessage; PRINT N'Error Line: ' + CAST(ERROR_LINE() AS VARCHAR);
            RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
            RETURN; -- Dừng SP nếu có lỗi
        END CATCH
    END

    PRINT N'Finished cleaning old price history. Total rows deleted: ' + CAST(@TotalDeleted AS VARCHAR);

END;
GO

PRINT 'Stored Procedure sp_CleanOldPriceHistory created/altered.';
GO

-- Ví dụ cách gọi SP để xóa dữ liệu cũ hơn 365 ngày (giữ lại 1 năm)
/*
EXEC dbo.sp_CleanOldPriceHistory @DaysToKeep = 365;
GO
*/

-- Ví dụ cách gọi SP để xóa dữ liệu cũ hơn 90 ngày (giữ lại 3 tháng)
/*
EXEC dbo.sp_CleanOldPriceHistory @DaysToKeep = 90;
GO
*/