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
    
    WITH TongKhopTheoLenhChua AS (SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop FROM dbo.LENHKHOP GROUP BY MaGD)
INSERT INTO @CashEventsFromStartDate (ThoiGian, SoTienPhatSinh)
SELECT
    ld.NgayGD, -- Thời điểm hoàn tiền thực tế là cuối ngày, nhưng dùng NgayGD để tính toán
    (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) * ISNULL(ld.Gia, (SELECT TOP 1 GiaTran FROM LICHSUGIA WHERE MaCP=ld.MaCP AND Ngay=CAST(ld.NgayGD AS DATE)))
FROM dbo.LENHDAT ld
LEFT JOIN TongKhopTheoLenhChua tkl ON ld.MaGD = tkl.MaGD
WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND ld.TrangThai = N'Chưa' -- Lệnh có trạng thái 'Chưa'
  AND ld.NgayGD >= @TuNgay -- Lệnh được đặt từ đầu kỳ trở đi
  AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0;
    
  -- *** 7. THÊM MỚI: Trừ tiền Tạm Giữ khi ĐẶT LỆNH MUA (Chỉ tính các lệnh đặt >= @TuNgay) ***
    -- Số tiền bị tạm giữ = SoLuong * Gia (hoặc GiaTran nếu ATO/ATC)
    INSERT INTO @CashEventsFromStartDate (ThoiGian, SoTienPhatSinh)
    SELECT
        ld.NgayGD,
        -(ld.SoLuong * ISNULL(ld.Gia, (SELECT TOP 1 GiaTran FROM LICHSUGIA WHERE MaCP=ld.MaCP AND Ngay=CAST(ld.NgayGD AS DATE))))
    FROM dbo.LENHDAT ld
    WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M'
      AND ld.NgayGD >= @TuNgay; -- Chỉ tính các lệnh đặt từ đầu kỳ trở đi

    -- Tính số dư đầu kỳ ước lượng
    DECLARE @TongPhatSinhTuTuNgay FLOAT = 0; SELECT @TongPhatSinhTuTuNgay = ISNULL(SUM(SoTienPhatSinh), 0) FROM @CashEventsFromStartDate;
    SET @SoDuDauKy = @SoDuHienTai - @TongPhatSinhTuTuNgay;
    PRINT '[Cash Statement SP] Calculated Opening Balance (Approx.): ' + CAST(@SoDuDauKy AS VARCHAR);


    -- === BƯỚC 2: Thu thập sự kiện TRONG KHOẢNG THỜI GIAN (@TuNgay đến @DenNgay) ===
    DECLARE @CashEventsInRange TABLE ( ThoiGian DATETIME, LoaiGiaoDich NVARCHAR(50), SoTienPhatSinh FLOAT, MaCP NCHAR(10) NULL, SoLuong INT NULL, DonGia FLOAT NULL, MaGD INT NULL, MaLK INT NULL, MaGDTien INT NULL, GhiChu NVARCHAR(255) NULL, SortOrderKey BIGINT );
    DECLARE @EventCounter BIGINT = 0;

    -- Lấy Nạp/Rút (Không đổi)
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaGDTien, GhiChu, SortOrderKey) SELECT gdt.NgayGD, gdt.LoaiGDTien, CASE WHEN gdt.LoaiGDTien = N'Nạp tiền' THEN gdt.SoTien ELSE -gdt.SoTien END, gdt.MaGDTien, gdt.GhiChu, ROW_NUMBER() OVER (ORDER BY gdt.NgayGD, gdt.MaGDTien) + @EventCounter FROM dbo.GIAODICHTIEN gdt WHERE gdt.MaTK = @MaTK AND gdt.NgayGD BETWEEN @TuNgay AND @DenNgay; SET @EventCounter = @EventCounter + @@ROWCOUNT;
    -- Lấy Khớp Mua (-) (Không đổi)
    -- INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaCP, SoLuong, DonGia, MaGD, MaLK, GhiChu, SortOrderKey) SELECT lk.NgayGioKhop, N'Mua CP', -(lk.SoLuongKhop * lk.GiaKhop), ld.MaCP, lk.SoLuongKhop, lk.GiaKhop, ld.MaGD, lk.MaLK, N'Khớp mua ' + CAST(lk.SoLuongKhop AS VARCHAR) + N' ' + ld.MaCP + N' giá ' + CAST(lk.GiaKhop AS VARCHAR), ROW_NUMBER() OVER (ORDER BY lk.NgayGioKhop, lk.MaLK) + @EventCounter FROM dbo.LENHKHOP lk JOIN dbo.LENHDAT ld ON lk.MaGD = ld.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND lk.NgayGioKhop BETWEEN @TuNgay AND @DenNgay; SET @EventCounter = @EventCounter + @@ROWCOUNT;
    -- Lấy Khớp Bán (+) (Không đổi)
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaCP, SoLuong, DonGia, MaGD, MaLK, GhiChu, SortOrderKey) SELECT lk.NgayGioKhop, N'Bán CP', (lk.SoLuongKhop * lk.GiaKhop), ld.MaCP, lk.SoLuongKhop, lk.GiaKhop, ld.MaGD, lk.MaLK, N'Khớp bán ' + CAST(lk.SoLuongKhop AS VARCHAR) + N' ' + ld.MaCP + N' giá ' + CAST(lk.GiaKhop AS VARCHAR), ROW_NUMBER() OVER (ORDER BY lk.NgayGioKhop, lk.MaLK) + @EventCounter FROM dbo.LENHKHOP lk JOIN dbo.LENHDAT ld ON lk.MaGD = ld.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'B' AND lk.NgayGioKhop BETWEEN @TuNgay AND @DenNgay; SET @EventCounter = @EventCounter + @@ROWCOUNT;
    -- Lấy Hoàn tiền dư Mua (+) (Không đổi)
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaCP, SoLuong, DonGia, MaGD, MaLK, GhiChu, SortOrderKey) SELECT lk.NgayGioKhop, N'Hoàn tiền mua', lk.SoLuongKhop * (ld.Gia - lk.GiaKhop), ld.MaCP, lk.SoLuongKhop, ld.Gia - lk.GiaKhop, ld.MaGD, lk.MaLK, N'Hoàn tiền chênh lệch giá mua ' + ld.MaCP + N' (Đặt ' + CAST(ld.Gia AS VARCHAR) + N', Khớp ' + CAST(lk.GiaKhop AS VARCHAR) + N')', ROW_NUMBER() OVER (ORDER BY lk.NgayGioKhop, lk.MaLK) + @EventCounter FROM dbo.LENHKHOP lk JOIN dbo.LENHDAT ld ON lk.MaGD = ld.MaGD WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND ld.LoaiLenh = 'LO' AND lk.NgayGioKhop BETWEEN @TuNgay AND @DenNgay AND ld.Gia > lk.GiaKhop; SET @EventCounter = @EventCounter + @@ROWCOUNT;

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
  -- *** 6. THÊM MỚI: Lấy Hoàn tiền lệnh Mua chuyển sang 'Chưa' (+) ***
    WITH TongKhopTheoLenhChua AS (SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop FROM dbo.LENHKHOP GROUP BY MaGD)
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaCP, SoLuong, DonGia, MaGD, GhiChu, SortOrderKey)
    SELECT
        -- Thời gian hoàn tiền này thực chất xảy ra vào cuối ngày (khi chạy ATC xong)
        -- Để đơn giản, vẫn dùng NgayGD gốc, nhưng GhiChu nên nói rõ
        ld.NgayGD AS ThoiGian,
        N'Hoàn tiền (Chưa khớp)', -- Loại giao dịch mới
        (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) * ISNULL(ld.Gia, (SELECT TOP 1 GiaTran FROM LICHSUGIA WHERE MaCP=ld.MaCP AND Ngay=CAST(ld.NgayGD AS DATE))) AS SoTienPhatSinh, -- Hoàn tiền theo giá đặt hoặc giá trần (nếu ATO)
        ld.MaCP,
        (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) AS SoLuongChuaKhop, -- Số lượng chưa khớp
        ISNULL(ld.Gia, (SELECT TOP 1 GiaTran FROM LICHSUGIA WHERE MaCP=ld.MaCP AND Ngay=CAST(ld.NgayGD AS DATE))) AS GiaThamChieuHoan, -- Giá dùng để tính hoàn tiền
        ld.MaGD,
        N'Hoàn tiền lệnh mua ' + ld.MaCP + N' không khớp cuối ngày (SL còn lại: ' + CAST((ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) AS VARCHAR) + N')',
        -- Sắp xếp theo NgayGD gốc
        ROW_NUMBER() OVER (ORDER BY ld.NgayGD, ld.MaGD) + @EventCounter
    FROM dbo.LENHDAT ld
    LEFT JOIN TongKhopTheoLenhChua tkl ON ld.MaGD = tkl.MaGD
    WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M' AND ld.TrangThai = N'Chưa' -- <<< LỌC THEO TRẠNG THÁI 'Chưa'
      -- Lọc theo ngày đặt lệnh nằm trong khoảng thời gian báo cáo
      -- (Vì trạng thái 'Chưa' được gán vào cuối ngày khớp lệnh của ngày đó)
      AND CAST(ld.NgayGD AS DATE) BETWEEN CAST(@TuNgay AS DATE) AND CAST(@DenNgay AS DATE)
      AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0; -- Chỉ khi có phần chưa khớp
     SET @EventCounter = @EventCounter + @@ROWCOUNT;

   -- *** 7. THÊM MỚI: Lấy sự kiện Tạm giữ tiền khi ĐẶT LỆNH MUA ***
    INSERT INTO @CashEventsInRange (ThoiGian, LoaiGiaoDich, SoTienPhatSinh, MaCP, SoLuong, DonGia, MaGD, GhiChu, SortOrderKey)
    SELECT
        ld.NgayGD,
        N'Tạm giữ mua', -- Loại giao dịch
        -(ld.SoLuong * ISNULL(ld.Gia, (SELECT TOP 1 GiaTran FROM LICHSUGIA WHERE MaCP=ld.MaCP AND Ngay=CAST(ld.NgayGD AS DATE)))), -- Số tiền bị trừ tạm giữ
        ld.MaCP,
        ld.SoLuong,
        ISNULL(ld.Gia, (SELECT TOP 1 GiaTran FROM LICHSUGIA WHERE MaCP=ld.MaCP AND Ngay=CAST(ld.NgayGD AS DATE))), -- Giá dùng để tạm giữ
        ld.MaGD,
        N'Tạm giữ tiền đặt lệnh mua ' + CAST(ld.SoLuong AS VARCHAR) + N' ' + ld.MaCP + N' (GD: ' + CAST(ld.MaGD AS VARCHAR) + N')',
        ROW_NUMBER() OVER (ORDER BY ld.NgayGD, ld.MaGD) + @EventCounter
    FROM dbo.LENHDAT ld
    WHERE ld.MaTK = @MaTK AND ld.LoaiGD = 'M'
      AND ld.NgayGD BETWEEN @TuNgay AND @DenNgay;
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