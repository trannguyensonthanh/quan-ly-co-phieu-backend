-- File: sp_GetCashStatementByAccount_Complete_v2.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Creating/Altering Stored Procedure sp_GetCashStatementByAccount (Complete v2 - No NgayCapNhatTrangThai)...';
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCashStatementByAccount
    @MaTK NCHAR(20),
    @TuNgay DATETIME,
    @DenNgay DATETIME
AS
BEGIN
    SET NOCOUNT ON;

    -- === BƯỚC 1: Tính Số dư Đầu kỳ (Ước lượng) ===
    DECLARE @SoDuDauKy FLOAT = 0;
    DECLARE @SoDuHienTai FLOAT = ISNULL((SELECT SoTien FROM dbo.TAIKHOAN_NGANHANG WHERE MaTK = @MaTK), 0);
    DECLARE @CashEventsFromStartDate TABLE ( ThoiGian DATETIME, SoTienPhatSinh FLOAT );
    -- Insert các sự kiện >= @TuNgay vào @CashEventsFromStartDate (logic như trước, nhưng bỏ NgayCapNhatTrangThai)
    -- 1. Nạp/Rút
    INSERT INTO @CashEventsFromStartDate (ThoiGian, SoTienPhatSinh) SELECT gdt.NgayGD, CASE WHEN gdt.LoaiGDTien = N'Nạp tiền' THEN gdt.SoTien ELSE -gdt.SoTien END FROM dbo.GIAODICHTIEN gdt WHERE gdt.MaTK = @MaTK AND gdt.NgayGD >= @TuNgay;
    -- 2. Khớp Mua (-)
    INSERT INTO @CashEventsFromStartDate (ThoiGian, SoTienPhatSinh) SELECT lk.NgayGioKhop, -(lk.SoLuongKhop * lk.GiaKhop) FROM dbo.LENHKHOP lk JOIN dbo.LENHDAT ld ON lk.MaGD = ld.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND lk.NgayGioKhop >= @TuNgay;
    -- 3. Khớp Bán (+)
    INSERT INTO @CashEventsFromStartDate (ThoiGian, SoTienPhatSinh) SELECT lk.NgayGioKhop, (lk.SoLuongKhop * lk.GiaKhop) FROM dbo.LENHKHOP lk JOIN dbo.LENHDAT ld ON lk.MaGD = ld.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'B' AND lk.NgayGioKhop >= @TuNgay;
    -- 4. Hoàn tiền dư Mua (+)
    INSERT INTO @CashEventsFromStartDate (ThoiGian, SoTienPhatSinh) SELECT lk.NgayGioKhop, lk.SoLuongKhop * (ld.Gia - lk.GiaKhop) FROM dbo.LENHKHOP lk JOIN dbo.LENHDAT ld ON lk.MaGD = ld.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND lk.NgayGioKhop >= @TuNgay AND ld.Gia > lk.GiaKhop;
    -- 5. Hoàn tiền hủy Mua (+) -- Dùng NgayGD thay vì NgayCapNhatTrangThai
    WITH TongKhopTheoLenhHuy AS (SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop FROM dbo.LENHKHOP GROUP BY MaGD)
    INSERT INTO @CashEventsFromStartDate (ThoiGian, SoTienPhatSinh) SELECT ld.NgayGD, (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) * ld.Gia FROM dbo.LENHDAT ld LEFT JOIN TongKhopTheoLenhHuy tkl ON ld.MaGD = tkl.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND ld.TrangThai = N'Hủy' AND ld.NgayGD >= @TuNgay AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0;
    -- Tính số dư đầu kỳ
    DECLARE @TongPhatSinhTuTuNgay FLOAT = 0; SELECT @TongPhatSinhTuTuNgay = ISNULL(SUM(SoTienPhatSinh), 0) FROM @CashEventsFromStartDate; SET @SoDuDauKy = @SoDuHienTai - @TongPhatSinhTuTuNgay;
    PRINT '[Cash Statement SP] Calculated Opening Balance (Approx.): ' + CAST(@SoDuDauKy AS VARCHAR);


    -- === BƯỚC 2: Thu thập sự kiện TRONG KHOẢNG THỜI GIAN (@TuNgay đến @DenNgay) ===
    DECLARE @CashEventsInRange TABLE ( ThoiGian DATETIME, LoaiGiaoDich NVARCHAR(50), SoTienPhatSinh FLOAT, MaCP NCHAR(10) NULL, SoLuong INT NULL, DonGia FLOAT NULL, MaGD INT NULL, MaLK INT NULL, MaGDTien INT NULL, GhiChu NVARCHAR(255) NULL, SortOrderKey BIGINT );
    DECLARE @EventCounter BIGINT = 0;

    -- Lấy Nạp/Rút (Không đổi)
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaGDTien, GhiChu, SortOrderKey) SELECT gdt.NgayGD, gdt.LoaiGDTien, CASE WHEN gdt.LoaiGDTien = N'Nạp tiền' THEN gdt.SoTien ELSE -gdt.SoTien END, gdt.MaGDTien, gdt.GhiChu, ROW_NUMBER() OVER (ORDER BY gdt.NgayGD, gdt.MaGDTien) + @EventCounter FROM dbo.GIAODICHTIEN gdt WHERE gdt.MaTK = @MaTK AND gdt.NgayGD BETWEEN @TuNgay AND @DenNgay; SET @EventCounter = @EventCounter + @@ROWCOUNT;
    -- Lấy Khớp Mua (-) (Không đổi)
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaCP, SoLuong, DonGia, MaGD, MaLK, GhiChu, SortOrderKey) SELECT lk.NgayGioKhop, N'Mua CP', -(lk.SoLuongKhop * lk.GiaKhop), ld.MaCP, lk.SoLuongKhop, lk.GiaKhop, ld.MaGD, lk.MaLK, N'Khớp mua ' + CAST(lk.SoLuongKhop AS VARCHAR) + N' ' + ld.MaCP + N' giá ' + CAST(lk.GiaKhop AS VARCHAR), ROW_NUMBER() OVER (ORDER BY lk.NgayGioKhop, lk.MaLK) + @EventCounter FROM dbo.LENHKHOP lk JOIN dbo.LENHDAT ld ON lk.MaGD = ld.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND lk.NgayGioKhop BETWEEN @TuNgay AND @DenNgay; SET @EventCounter = @EventCounter + @@ROWCOUNT;
    -- Lấy Khớp Bán (+) (Không đổi)
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaCP, SoLuong, DonGia, MaGD, MaLK, GhiChu, SortOrderKey) SELECT lk.NgayGioKhop, N'Bán CP', (lk.SoLuongKhop * lk.GiaKhop), ld.MaCP, lk.SoLuongKhop, lk.GiaKhop, ld.MaGD, lk.MaLK, N'Khớp bán ' + CAST(lk.SoLuongKhop AS VARCHAR) + N' ' + ld.MaCP + N' giá ' + CAST(lk.GiaKhop AS VARCHAR), ROW_NUMBER() OVER (ORDER BY lk.NgayGioKhop, lk.MaLK) + @EventCounter FROM dbo.LENHKHOP lk JOIN dbo.LENHDAT ld ON lk.MaGD = ld.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'B' AND lk.NgayGioKhop BETWEEN @TuNgay AND @DenNgay; SET @EventCounter = @EventCounter + @@ROWCOUNT;
    -- Lấy Hoàn tiền dư Mua (+) (Không đổi)
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaCP, SoLuong, DonGia, MaGD, MaLK, GhiChu, SortOrderKey) SELECT lk.NgayGioKhop, N'Hoàn tiền mua', lk.SoLuongKhop * (ld.Gia - lk.GiaKhop), ld.MaCP, lk.SoLuongKhop, ld.Gia - lk.GiaKhop, ld.MaGD, lk.MaLK, N'Hoàn tiền chênh lệch giá mua ' + ld.MaCP + N' (Đặt ' + CAST(ld.Gia AS VARCHAR) + N', Khớp ' + CAST(lk.GiaKhop AS VARCHAR) + N')', ROW_NUMBER() OVER (ORDER BY lk.NgayGioKhop, lk.MaLK) + @EventCounter FROM dbo.LENHKHOP lk JOIN dbo.LENHDAT ld ON lk.MaGD = ld.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND lk.NgayGioKhop BETWEEN @TuNgay AND @DenNgay AND ld.Gia > lk.GiaKhop; SET @EventCounter = @EventCounter + @@ROWCOUNT;

    -- Lấy Hoàn tiền hủy Mua (+) (SỬA LẠI NGÀY VÀ SẮP XẾP)
    WITH TongKhopTheoLenhHuy AS (SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop FROM dbo.LENHKHOP GROUP BY MaGD)
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaCP, SoLuong, DonGia, MaGD, GhiChu, SortOrderKey)
    SELECT
        ld.NgayGD AS ThoiGian, -- <<< Dùng NgayGD làm thời gian sự kiện hoàn hủy
        N'Hoàn tiền hủy',
        (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) * ld.Gia,
        ld.MaCP,
        (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)),
        ld.Gia,
        ld.MaGD,
        N'Hoàn tiền hủy lệnh mua ' + ld.MaCP + N' (SL hủy: ' + CAST((ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) AS VARCHAR) + N')',
        -- Sắp xếp theo NgayGD gốc
        ROW_NUMBER() OVER (ORDER BY ld.NgayGD, ld.MaGD) + @EventCounter
    FROM dbo.LENHDAT ld
    LEFT JOIN TongKhopTheoLenhHuy tkl ON ld.MaGD = tkl.MaGD
    WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND ld.TrangThai = N'Hủy'
      -- Lọc theo NgayGD nằm trong khoảng thời gian báo cáo
      AND ld.NgayGD BETWEEN @TuNgay AND @DenNgay
      AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0;
     SET @EventCounter = @EventCounter + @@ROWCOUNT;


    -- === BƯỚC 3: Tính toán và trả về kết quả ===
    SELECT
        ThoiGian AS Ngay,
        LAG(SoDuCuoiKy_Calc, 1, @SoDuDauKy) OVER (ORDER BY ThoiGian ASC, SortOrderKey ASC) AS SoDuDauKy_GD,
        SoTienPhatSinh,
        GhiChu AS LyDo,
        SoDuCuoiKy_Calc AS SoDuCuoiKy_GD,
        LoaiGiaoDich, MaCP, SoLuong, DonGia, MaGD, MaLK, MaGDTien -- Trả về các cột chi tiết
    FROM (
        SELECT *, @SoDuDauKy + SUM(SoTienPhatSinh) OVER (ORDER BY ThoiGian ASC, SortOrderKey ASC) AS SoDuCuoiKy_Calc
        FROM @CashEventsInRange
    ) AS FinalResult
    ORDER BY ThoiGian ASC, SortOrderKey ASC;

END;
GO

PRINT 'Stored Procedure sp_GetCashStatementByAccount created/altered.';
GO