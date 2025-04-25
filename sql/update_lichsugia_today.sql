-- File: update_lichsugia_today_v2.sql
-- Mục đích: Cập nhật giá Tham chiếu, Trần, Sàn cho ngày hiện tại
--          CHỈ cho các cổ phiếu đang ở trạng thái Giao dịch (Status = 1).
--          Dựa trên giá Tham chiếu của ngày hôm trước.
-- Cách dùng: Chạy script này thủ công trong SSMS mỗi khi cần dữ liệu giá mới.

USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

DECLARE @NgayHomNay DATE = CAST(GETDATE() AS DATE);
DECLARE @NgayHomQua DATE = DATEADD(day, -1, @NgayHomNay);
DECLARE @BienDoTran FLOAT = 0.1; -- Biên độ trần (ví dụ: 10% HNX)
DECLARE @BienDoSan FLOAT = 0.1;  -- Biên độ sàn (ví dụ: 10% HNX)
DECLARE @BuocGia FLOAT = 100;   -- Bước giá (ví dụ: làm tròn đến 100 đồng)
DECLARE @GiaTCDefault FLOAT = 10000; -- Giá tham chiếu mặc định nếu CP chưa có giá hôm qua

PRINT N'Ngày hôm nay: ' + CONVERT(VARCHAR, @NgayHomNay);
PRINT N'Ngày hôm qua: ' + CONVERT(VARCHAR, @NgayHomQua);

-- Bắt đầu Transaction để đảm bảo an toàn
BEGIN TRANSACTION;

BEGIN TRY
    -- Xóa dữ liệu giá của ngày hôm nay nếu đã tồn tại (chỉ xóa cho CP Status = 1 để tránh ảnh hưởng CP khác nếu có)
    DELETE FROM dbo.LICHSUGIA
    WHERE Ngay = @NgayHomNay
      AND MaCP IN (SELECT MaCP FROM dbo.COPHIEU WHERE Status = 1); -- Chỉ xóa giá của CP đang giao dịch
    PRINT N'Đã xóa dữ liệu giá cũ (nếu có) cho các CP đang giao dịch vào ngày ' + CONVERT(VARCHAR, @NgayHomNay);

    -- Chèn giá mới cho ngày hôm nay CHỈ CHO CÁC CP CÓ STATUS = 1
    INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC)
    SELECT
        cp.MaCP,
        @NgayHomNay AS Ngay,
        -- Tính Giá Trần mới và làm tròn theo bước giá
        FLOOR( (ISNULL(lg_qua.GiaTC, @GiaTCDefault) * (1 + @BienDoTran)) / @BuocGia ) * @BuocGia AS GiaTran,
        -- Tính Giá Sàn mới và làm tròn theo bước giá
        CEILING( (ISNULL(lg_qua.GiaTC, @GiaTCDefault) * (1 - @BienDoSan)) / @BuocGia ) * @BuocGia AS GiaSan,
        -- Giá Tham chiếu mới = Giá TC hôm qua (hoặc giá mặc định nếu là ngày đầu giao dịch)
        ISNULL(lg_qua.GiaTC, @GiaTCDefault) AS GiaTC
    FROM
        dbo.COPHIEU cp -- Lấy các mã CP
    LEFT JOIN -- Dùng LEFT JOIN để lấy giá hôm qua
        (SELECT MaCP, GiaTC FROM dbo.LICHSUGIA WHERE Ngay = @NgayHomQua) lg_qua
        ON cp.MaCP = lg_qua.MaCP
    WHERE
        cp.Status = 1; -- <<< ĐIỀU KIỆN QUAN TRỌNG: Chỉ chèn giá cho CP đang giao dịch

    DECLARE @RowCount INT = @@ROWCOUNT;
    PRINT N'Đã chèn giá cho ' + CAST(@RowCount AS VARCHAR) + N' mã cổ phiếu đang giao dịch vào ngày ' + CONVERT(VARCHAR, @NgayHomNay);

    -- Commit Transaction nếu không có lỗi
    COMMIT TRANSACTION;
    PRINT N'Cập nhật giá thành công.';

END TRY
BEGIN CATCH
    -- Rollback Transaction nếu có lỗi
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    PRINT N'*** LỖI KHI CẬP NHẬT GIÁ ***';
    -- In thông tin lỗi chi tiết
    PRINT N'Lỗi số: ' + CAST(ERROR_NUMBER() AS VARCHAR);
    PRINT N'Thông báo lỗi: ' + ERROR_MESSAGE();
    PRINT N'Dòng lỗi: ' + CAST(ERROR_LINE() AS VARCHAR);
    -- THROW; -- Uncomment nếu muốn dừng hẳn script khi có lỗi
END CATCH
GO