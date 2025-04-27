-- File: clear_all_data_delete.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Starting data deletion process...';

BEGIN TRANSACTION;

BEGIN TRY

    -- Xóa các bảng có khóa ngoại trỏ đến bảng khác trước

    -- 1. Lệnh Khớp (phụ thuộc LENHDAT)
    DELETE FROM dbo.LENHKHOP;
    PRINT 'Deleted data from LENHKHOP.';

    -- 2. Lệnh Đặt (phụ thuộc COPHIEU, TAIKHOAN_NGANHANG)
    DELETE FROM dbo.LENHDAT;
    PRINT 'Deleted data from LENHDAT.';

    -- 3. Sở Hữu (phụ thuộc NDT, COPHIEU)
    DELETE FROM dbo.SOHUU;
    PRINT 'Deleted data from SOHUU.';

    -- 4. Lịch Sử Giá (phụ thuộc COPHIEU)
    DELETE FROM dbo.LICHSUGIA;
    PRINT 'Deleted data from LICHSUGIA.';

    -- 5. Giao Dịch Tiền (phụ thuộc TAIKHOAN_NGANHANG, NhanVien)
    DELETE FROM dbo.GIAODICHTIEN;
    PRINT 'Deleted data from GIAODICHTIEN.';

    -- 6. Tài Khoản Ngân Hàng (phụ thuộc NDT, NGANHANG)
    DELETE FROM dbo.TAIKHOAN_NGANHANG;
    PRINT 'Deleted data from TAIKHOAN_NGANHANG.';

     -- 7. Cổ phiếu Undo Log (phụ thuộc COPHIEU - logic, không FK)
     -- Nên xóa trước khi xóa COPHIEU
    DELETE FROM dbo.COPHIEU_UndoLog;
    PRINT 'Deleted data from COPHIEU_UndoLog.';

    -- 8. Cổ Phiếu (bảng gốc)
    DELETE FROM dbo.COPHIEU;
    PRINT 'Deleted data from COPHIEU.';

    -- 9. Ngân Hàng (bảng gốc)
    DELETE FROM dbo.NGANHANG;
    PRINT 'Deleted data from NGANHANG.';

    -- 10. Nhà Đầu Tư (bảng gốc)
    DELETE FROM dbo.NDT;
    PRINT 'Deleted data from NDT.';

    -- 11. Nhân Viên (bảng gốc)
    DELETE FROM dbo.NhanVien;
    PRINT 'Deleted data from NhanVien.';

    -- (Optional) Reset cột IDENTITY nếu muốn ID bắt đầu lại từ 1
    -- DBCC CHECKIDENT ('dbo.LENHKHOP', RESEED, 0);
    -- DBCC CHECKIDENT ('dbo.LENHDAT', RESEED, 0);
    -- DBCC CHECKIDENT ('dbo.GIAODICHTIEN', RESEED, 0);
    -- DBCC CHECKIDENT ('dbo.COPHIEU_UndoLog', RESEED, 0);
    -- PRINT 'Identity columns reseeded (Optional).';

    COMMIT TRANSACTION;
    PRINT 'Data deletion completed successfully.';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    PRINT '*** ERROR DURING DATA DELETION ***';
    DECLARE @ErrorMessage NVARCHAR(MAX) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    PRINT N'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR);
    PRINT N'Error Message: ' + @ErrorMessage;
    PRINT N'Error Line: ' + CAST(ERROR_LINE() AS VARCHAR);
    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
    PRINT 'Data deletion failed. Transaction Rolled Back.';
END CATCH
GO