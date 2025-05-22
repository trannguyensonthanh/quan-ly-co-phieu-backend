-- File: sp_matching_prices_ATC.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Creating/Altering Stored Procedure sp_ExecuteATCMatching ..';
GO

CREATE OR ALTER PROCEDURE dbo.sp_ExecuteATCMatching
    @MaCP NVARCHAR(10),
    @NgayGiaoDich DATE,
    @GiaKhopCuoiPhienLienTuc FLOAT, -- Giá khớp cuối LT (có thể NULL)
    -- Output
    @GiaDongCua FLOAT OUTPUT,      -- Giá ATC xác định được (hoặc giá khớp cuối LT)
    @TongKLKhopATC INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON; -- Rollback transaction on error

   DECLARE @GiaATC FLOAT = NULL, @MaxKLKhop BIGINT = 0, @MinChenhLech BIGINT = -1;
    DECLARE @GiaTC FLOAT, @GiaTran FLOAT, @GiaSan FLOAT, @BuocGia FLOAT = 100;
    DECLARE @TotalAtcBuy BIGINT = 0, @TotalAtcSell BIGINT = 0;
    DECLARE @OrderBook TABLE ( MucGia FLOAT PRIMARY KEY, KLMuaTichLuy BIGINT DEFAULT 0, KLBanTichLuy BIGINT DEFAULT 0, KLKhopTaiMucGia BIGINT DEFAULT 0, ChenhLech BIGINT DEFAULT 0 );
    DECLARE @LệnhChoATC TABLE ( MaGD INT PRIMARY KEY, LoaiGD CHAR(1), LoaiLenh NCHAR(5), Gia FLOAT NULL, SoLuongConLai INT, MaTK NCHAR(20), MaNDT NCHAR(20), NgayGD DATETIME, RN_TimePriority BIGINT );
    DECLARE @KhopTrongPhienATC TABLE (MaGD INT PRIMARY KEY, KLDaKhop INT DEFAULT 0);

        PRINT '[ATC ' + @MaCP + '] Starting... Last Continuous Price=' + ISNULL(CAST(@GiaKhopCuoiPhienLienTuc AS VARCHAR), 'NULL') + ', Date=' + CONVERT(VARCHAR, @NgayGiaoDich);

    -- 0. Lấy Giá TC/Trần/Sàn
    SELECT TOP 1 @GiaTC = GiaTC, @GiaTran = GiaTran, @GiaSan = GiaSan FROM dbo.LICHSUGIA WHERE MaCP = @MaCP AND Ngay = @NgayGiaoDich;
    IF @GiaTC IS NULL 
    BEGIN 
        PRINT '[ATC ' + @MaCP + '] Error: No price data found for today.'; 
        SET @GiaDongCua = @GiaKhopCuoiPhienLienTuc; 
        SET @TongKLKhopATC = 0; 
        RETURN;
    END;

    -- CTE tính tổng khớp cho từng lệnh (Sẽ dùng lại ở dưới)
    ;WITH TongKhopTheoLenh AS (
        SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop
        FROM dbo.LENHKHOP
        WHERE MaGD IN (
            SELECT MaGD 
            FROM dbo.LENHDAT 
            WHERE MaCP = @MaCP AND CAST(NgayGD AS DATE) = @NgayGiaoDich
        )
        GROUP BY MaGD
    )


    -- 1. Lấy Lệnh Chờ vào @LệnhChoATC
    INSERT INTO @LệnhChoATC (MaGD, LoaiGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT, NgayGD, RN_TimePriority)
    SELECT ld.MaGD, ld.LoaiGD, ld.LoaiLenh, ld.Gia, (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)), ld.MaTK, tk.MaNDT, ld.NgayGD, ROW_NUMBER() OVER (ORDER BY ld.NgayGD ASC, ld.MaGD ASC)
    FROM dbo.LENHDAT ld JOIN dbo.TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD
    WHERE ld.MaCP = @MaCP AND ld.TrangThai IN (N'Chờ', N'Một phần') AND (ld.LoaiLenh = 'ATC' OR ld.LoaiLenh = 'LO') AND CAST(ld.NgayGD AS DATE) = @NgayGiaoDich AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0;
    PRINT '[ATC ' + @MaCP + '] Found ' + CAST(@@ROWCOUNT AS VARCHAR) + ' pending orders.';

    -- 2. Xây dựng Sổ Lệnh Ảo (Tương tự ATO, bao gồm @GiaKhopCuoiPhienLienTuc)
    INSERT INTO @OrderBook (MucGia) SELECT DISTINCT Gia FROM @LệnhChoATC WHERE LoaiLenh = 'LO' AND Gia IS NOT NULL AND Gia BETWEEN @GiaSan AND @GiaTran UNION SELECT @GiaKhopCuoiPhienLienTuc WHERE @GiaKhopCuoiPhienLienTuc IS NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM @OrderBook) INSERT INTO @OrderBook(MucGia) VALUES (@GiaTC);
    SELECT @TotalAtcBuy = SUM(SoLuongConLai) FROM @LệnhChoATC WHERE LoaiLenh = 'ATC' AND LoaiGD = 'M'; SET @TotalAtcBuy = ISNULL(@TotalAtcBuy, 0);
    SELECT @TotalAtcSell = SUM(SoLuongConLai) FROM @LệnhChoATC WHERE LoaiLenh = 'ATC' AND LoaiGD = 'B'; SET @TotalAtcSell = ISNULL(@TotalAtcSell, 0);
    UPDATE ob SET KLMuaTichLuy = @TotalAtcBuy + ISNULL(MuaLO.TongKL_LO, 0) FROM @OrderBook ob LEFT JOIN (SELECT ob_inner.MucGia, SUM(lca.SoLuongConLai) AS TongKL_LO FROM @OrderBook ob_inner JOIN @LệnhChoATC lca ON lca.LoaiLenh = 'LO' AND lca.LoaiGD = 'M' AND lca.Gia >= ob_inner.MucGia GROUP BY ob_inner.MucGia) MuaLO ON ob.MucGia = MuaLO.MucGia;
    UPDATE ob SET KLBanTichLuy = @TotalAtcSell + ISNULL(BanLO.TongKL_LO, 0) FROM @OrderBook ob LEFT JOIN (SELECT ob_inner.MucGia, SUM(lca.SoLuongConLai) AS TongKL_LO FROM @OrderBook ob_inner JOIN @LệnhChoATC lca ON lca.LoaiLenh = 'LO' AND lca.LoaiGD = 'B' AND lca.Gia <= ob_inner.MucGia GROUP BY ob_inner.MucGia) BanLO ON ob.MucGia = BanLO.MucGia;
    UPDATE @OrderBook SET KLKhopTaiMucGia = IIF(KLMuaTichLuy < KLBanTichLuy, KLMuaTichLuy, KLBanTichLuy), ChenhLech = ABS(KLMuaTichLuy - KLBanTichLuy);
    PRINT '[ATC ' + @MaCP + '] Order book calculated.';
 
    -- 3. Xác định Giá ATC
    SELECT TOP 1 @GiaATC = MucGia, @MaxKLKhop = KLKhopTaiMucGia FROM @OrderBook WHERE KLKhopTaiMucGia > 0 ORDER BY KLKhopTaiMucGia DESC, ChenhLech ASC, ABS(MucGia - ISNULL(@GiaKhopCuoiPhienLienTuc, @GiaTC)) ASC, MucGia DESC;
    IF @GiaATC IS NULL AND @TotalAtcBuy > 0 AND @TotalAtcSell > 0 AND @GiaKhopCuoiPhienLienTuc IS NOT NULL BEGIN SET @GiaATC = @GiaKhopCuoiPhienLienTuc; SET @MaxKLKhop = IIF(@TotalAtcBuy < @TotalAtcSell, @TotalAtcBuy, @TotalAtcSell); PRINT '[ATC ' + @MaCP + '] Only ATC orders match. Matching at Last Continuous Price: ' + CAST(@GiaATC AS VARCHAR); END

    -- 4. Thực hiện khớp lệnh nếu có
    IF @GiaATC IS NOT NULL AND @MaxKLKhop > 0
    BEGIN
        SET @GiaDongCua = @GiaATC;
        SET @TongKLKhopATC = @MaxKLKhop;
        DECLARE @KLConLaiDeKhop BIGINT = @MaxKLKhop;
        DECLARE @MatchTime DATETIME = GETDATE();

        PRINT '[ATC ' + @MaCP + '] Determined ATC Price: ' + CAST(@GiaATC AS VARCHAR) + ', Volume: ' + CAST(@MaxKLKhop AS VARCHAR);

        BEGIN TRANSACTION;

        -- Biến Cursor
        DECLARE @MaGD_M INT, @KLConLai_M INT, @MaTK_M NCHAR(20), @MaNDT_M NCHAR(20), @GiaLO_M FLOAT;
        DECLARE @MaGD_B INT, @KLConLai_B INT, @MaTK_B NCHAR(20), @MaNDT_B NCHAR(20), @GiaLO_B FLOAT;
        DECLARE @KLKhopLanNay INT;

        -- === Ưu tiên 1: Khớp ATC Mua ===
        PRINT '[ATC ' + @MaCP + '] Matching ATC Buy orders...';
        DECLARE curATC_M CURSOR LOCAL FAST_FORWARD FOR SELECT MaGD, SoLuongConLai, MaTK, MaNDT FROM @LệnhChoATC WHERE LoaiLenh = 'ATC' AND LoaiGD = 'M' AND SoLuongConLai > 0 ORDER BY NgayGD ASC;
        OPEN curATC_M; FETCH NEXT FROM curATC_M INTO @MaGD_M, @KLConLai_M, @MaTK_M, @MaNDT_M;
        WHILE @@FETCH_STATUS = 0 AND @KLConLaiDeKhop > 0 AND @KLConLai_M > 0
        BEGIN
            -- Tìm đối ứng: ATC Bán -> LO Bán <= GiaATC (Giá thấp -> Thời gian)
            DECLARE curDoiUng_B CURSOR LOCAL FAST_FORWARD FOR SELECT MaGD, SoLuongConLai, MaTK, MaNDT, Gia FROM @LệnhChoATC WHERE LoaiGD = 'B' AND SoLuongConLai > 0 AND (LoaiLenh = 'ATC' OR (LoaiLenh = 'LO' AND Gia <= @GiaATC)) ORDER BY CASE LoaiLenh WHEN 'ATC' THEN 1 ELSE 2 END, Gia ASC, NgayGD ASC;
            OPEN curDoiUng_B; FETCH NEXT FROM curDoiUng_B INTO @MaGD_B, @KLConLai_B, @MaTK_B, @MaNDT_B, @GiaLO_B;
            WHILE @@FETCH_STATUS = 0 AND @KLConLai_M > 0 AND @KLConLaiDeKhop > 0
            BEGIN
                            -- *** THÊM KIỂM TRA TỰ KHỚP ***
                IF @MaNDT_M = @MaNDT_B -- Nếu Mã NĐT mua trùng Mã NĐT bán
                BEGIN
                    PRINT '[ATC ' + @MaCP + '] Self-trade detected. Skipping match between Buy MaGD=' + CAST(@MaGD_M AS VARCHAR) + ' and Sell MaGD=' + CAST(@MaGD_B AS VARCHAR);
                    -- Lấy lệnh bán tiếp theo để thử khớp với lệnh mua hiện tại
                    FETCH NEXT FROM curDoiUng_B INTO @MaGD_B, @KLConLai_B, @MaTK_B, @MaNDT_B, @GiaLO_B;
                    CONTINUE; -- Bỏ qua phần còn lại của vòng lặp này, xử lý lệnh bán tiếp theo
                END
                -- *** HẾT KIỂM TRA TỰ KHỚP ***

                SET @KLKhopLanNay = IIF(@KLConLai_M < @KLConLai_B, @KLConLai_M, @KLConLai_B); SET @KLKhopLanNay = IIF(@KLKhopLanNay > @KLConLaiDeKhop, @KLConLaiDeKhop, @KLKhopLanNay);
                IF @KLKhopLanNay > 0
                BEGIN
                    -- Khớp... (INSERT LENHKHOP, UPDATE SOHUU, UPDATE TAIKHOAN Bán)
                    INSERT INTO dbo.LENHKHOP (MaGD, NgayGioKhop, SoLuongKhop, GiaKhop, KieuKhop) VALUES (@MaGD_M, @MatchTime, @KLKhopLanNay, @GiaATC, N'Khớp ATC'), (@MaGD_B, @MatchTime, @KLKhopLanNay, @GiaATC, N'Khớp ATC');
                    MERGE dbo.SOHUU AS T USING (SELECT @MaNDT_M AS MaNDT, @MaCP AS MaCP) AS S ON T.MaNDT=S.MaNDT AND T.MaCP=S.MaCP WHEN MATCHED THEN UPDATE SET SoLuong=T.SoLuong+@KLKhopLanNay WHEN NOT MATCHED THEN INSERT (MaNDT, MaCP, SoLuong) VALUES (S.MaNDT, S.MaCP, @KLKhopLanNay);
                    UPDATE dbo.SOHUU SET SoLuong = SoLuong - @KLKhopLanNay WHERE MaNDT = @MaNDT_B AND MaCP = @MaCP;
                    UPDATE dbo.TAIKHOAN_NGANHANG SET SoTien = SoTien + (@KLKhopLanNay * @GiaATC) WHERE MaTK = @MaTK_B;
                    -- Cập nhật KL
                    SET @KLConLai_M = @KLConLai_M - @KLKhopLanNay; UPDATE @LệnhChoATC SET SoLuongConLai = SoLuongConLai - @KLKhopLanNay WHERE MaGD = @MaGD_B; SET @KLConLaiDeKhop = @KLConLaiDeKhop - @KLKhopLanNay;
                    -- Ghi nhận khớp
                    MERGE @KhopTrongPhienATC AS T USING (SELECT @MaGD_M AS MaGD UNION ALL SELECT @MaGD_B) AS S ON T.MaGD=S.MaGD WHEN MATCHED THEN UPDATE SET KLDaKhop=T.KLDaKhop+@KLKhopLanNay WHEN NOT MATCHED THEN INSERT (MaGD, KLDaKhop) VALUES (S.MaGD, @KLKhopLanNay);
                END
                 IF @KLConLaiDeKhop > 0 AND (SELECT SoLuongConLai FROM @LệnhChoATC WHERE MaGD=@MaGD_B) <= 0 FETCH NEXT FROM curDoiUng_B INTO @MaGD_B, @KLConLai_B, @MaTK_B, @MaNDT_B, @GiaLO_B;
                 ELSE IF @KLConLaiDeKhop <= 0 OR @KLConLai_M <= 0 BREAK;
                 ELSE SELECT @KLConLai_B = SoLuongConLai FROM @LệnhChoATC WHERE MaGD=@MaGD_B;
            END
            CLOSE curDoiUng_B; DEALLOCATE curDoiUng_B;
            UPDATE @LệnhChoATC SET SoLuongConLai = @KLConLai_M WHERE MaGD = @MaGD_M;
            FETCH NEXT FROM curATC_M INTO @MaGD_M, @KLConLai_M, @MaTK_M, @MaNDT_M;
        END
        CLOSE curATC_M; DEALLOCATE curATC_M;
        PRINT '[ATC ' + @MaCP + '] Finished matching ATC Buy. Remaining KL: ' + CAST(@KLConLaiDeKhop AS VARCHAR);

        -- === Ưu tiên 2: Khớp ATC Bán ===
        IF @KLConLaiDeKhop > 0 BEGIN
            PRINT '[ATC ' + @MaCP + '] Matching ATC Sell orders...';
            DECLARE curATC_B CURSOR LOCAL FAST_FORWARD FOR SELECT MaGD, SoLuongConLai, MaTK, MaNDT FROM @LệnhChoATC WHERE LoaiLenh = 'ATC' AND LoaiGD = 'B' AND SoLuongConLai > 0 ORDER BY NgayGD ASC;
            OPEN curATC_B; FETCH NEXT FROM curATC_B INTO @MaGD_B, @KLConLai_B, @MaTK_B, @MaNDT_B;
            WHILE @@FETCH_STATUS = 0 AND @KLConLaiDeKhop > 0 AND @KLConLai_B > 0 BEGIN
                -- Tìm đối ứng: LO Mua >= GiaATC (Giá cao -> Thời gian)
                DECLARE curDoiUng_M CURSOR LOCAL FAST_FORWARD FOR SELECT MaGD, SoLuongConLai, MaTK, MaNDT, Gia FROM @LệnhChoATC WHERE LoaiGD = 'M' AND LoaiLenh = 'LO' AND Gia >= @GiaATC AND SoLuongConLai > 0 ORDER BY Gia DESC, NgayGD ASC;
                OPEN curDoiUng_M; FETCH NEXT FROM curDoiUng_M INTO @MaGD_M, @KLConLai_M, @MaTK_M, @MaNDT_M, @GiaLO_M;
                WHILE @@FETCH_STATUS = 0 AND @KLConLai_B > 0 AND @KLConLaiDeKhop > 0 BEGIN
                     SET @KLKhopLanNay = IIF(@KLConLai_B < @KLConLai_M, @KLConLai_B, @KLConLai_M); SET @KLKhopLanNay = IIF(@KLKhopLanNay > @KLConLaiDeKhop, @KLConLaiDeKhop, @KLKhopLanNay);
                    IF @KLKhopLanNay > 0 BEGIN
                        -- Khớp... (INSERT LENHKHOP, UPDATE SOHUU, UPDATE TAIKHOAN Bán, HOÀN TIỀN DƯ Mua LO)
                         INSERT INTO dbo.LENHKHOP (MaGD, NgayGioKhop, SoLuongKhop, GiaKhop, KieuKhop) VALUES (@MaGD_M, @MatchTime, @KLKhopLanNay, @GiaATC, N'Khớp ATC'), (@MaGD_B, @MatchTime, @KLKhopLanNay, @GiaATC, N'Khớp ATC');
                         MERGE dbo.SOHUU AS T USING (SELECT @MaNDT_M AS MaNDT, @MaCP AS MaCP) AS S ON T.MaNDT=S.MaNDT AND T.MaCP=S.MaCP WHEN MATCHED THEN UPDATE SET SoLuong=T.SoLuong+@KLKhopLanNay WHEN NOT MATCHED THEN INSERT (MaNDT, MaCP, SoLuong) VALUES (S.MaNDT, S.MaCP, @KLKhopLanNay);
                         UPDATE dbo.SOHUU SET SoLuong = SoLuong - @KLKhopLanNay WHERE MaNDT = @MaNDT_B AND MaCP = @MaCP;
                         UPDATE dbo.TAIKHOAN_NGANHANG SET SoTien = SoTien + (@KLKhopLanNay * @GiaATC) WHERE MaTK = @MaTK_B;
                         IF @GiaLO_M > @GiaATC BEGIN UPDATE dbo.TAIKHOAN_NGANHANG SET SoTien = SoTien + (@KLKhopLanNay * (@GiaLO_M - @GiaATC)) WHERE MaTK = @MaTK_M; END
                        -- Cập nhật KL
                        SET @KLConLai_B = @KLConLai_B - @KLKhopLanNay; UPDATE @LệnhChoATC SET SoLuongConLai = SoLuongConLai - @KLKhopLanNay WHERE MaGD = @MaGD_M; SET @KLConLaiDeKhop = @KLConLaiDeKhop - @KLKhopLanNay;
                        -- Ghi nhận khớp
                         MERGE @KhopTrongPhienATC AS T USING (SELECT @MaGD_M AS MaGD UNION ALL SELECT @MaGD_B) AS S ON T.MaGD=S.MaGD WHEN MATCHED THEN UPDATE SET KLDaKhop=T.KLDaKhop+@KLKhopLanNay WHEN NOT MATCHED THEN INSERT (MaGD, KLDaKhop) VALUES (S.MaGD, @KLKhopLanNay);
                    END
                    IF @KLConLaiDeKhop > 0 AND (SELECT SoLuongConLai FROM @LệnhChoATC WHERE MaGD=@MaGD_M) <= 0 FETCH NEXT FROM curDoiUng_M INTO @MaGD_M, @KLConLai_M, @MaTK_M, @MaNDT_M, @GiaLO_M;
                    ELSE IF @KLConLaiDeKhop <= 0 OR @KLConLai_B <= 0 BREAK;
                    ELSE SELECT @KLConLai_M = SoLuongConLai FROM @LệnhChoATC WHERE MaGD=@MaGD_M;
                END
                CLOSE curDoiUng_M; DEALLOCATE curDoiUng_M;
                UPDATE @LệnhChoATC SET SoLuongConLai = @KLConLai_B WHERE MaGD = @MaGD_B;
                FETCH NEXT FROM curATC_B INTO @MaGD_B, @KLConLai_B, @MaTK_B, @MaNDT_B;
            END
            CLOSE curATC_B; DEALLOCATE curATC_B;
             PRINT '[ATC ' + @MaCP + '] Finished matching ATC Sell. Remaining KL: ' + CAST(@KLConLaiDeKhop AS VARCHAR);
        END

        -- === Ưu tiên 3: Khớp LO Mua vs LO Bán (Tại giá ATC) ===
         IF @KLConLaiDeKhop > 0 BEGIN
             PRINT '[ATC ' + @MaCP + '] Matching LO Buy vs LO Sell orders at ATC price...';
            DECLARE curLO_M CURSOR LOCAL FAST_FORWARD FOR SELECT MaGD, SoLuongConLai, MaTK, MaNDT, Gia FROM @LệnhChoATC WHERE LoaiLenh = 'LO' AND LoaiGD = 'M' AND Gia >= @GiaATC AND SoLuongConLai > 0 ORDER BY Gia DESC, NgayGD ASC;
            OPEN curLO_M; FETCH NEXT FROM curLO_M INTO @MaGD_M, @KLConLai_M, @MaTK_M, @MaNDT_M, @GiaLO_M;
             WHILE @@FETCH_STATUS = 0 AND @KLConLaiDeKhop > 0 AND @KLConLai_M > 0 BEGIN
                 -- Tìm đối ứng: LO Bán <= GiaATC (Giá thấp -> Thời gian)
                DECLARE curLO_B CURSOR LOCAL FAST_FORWARD FOR SELECT MaGD, SoLuongConLai, MaTK, MaNDT FROM @LệnhChoATC WHERE LoaiLenh = 'LO' AND LoaiGD = 'B' AND Gia <= @GiaATC AND SoLuongConLai > 0 ORDER BY Gia ASC, NgayGD ASC;
                 OPEN curLO_B; FETCH NEXT FROM curLO_B INTO @MaGD_B, @KLConLai_B, @MaTK_B, @MaNDT_B;
                 WHILE @@FETCH_STATUS = 0 AND @KLConLai_M > 0 AND @KLConLaiDeKhop > 0 BEGIN
                     SET @KLKhopLanNay = IIF(@KLConLai_M < @KLConLai_B, @KLConLai_M, @KLConLai_B); SET @KLKhopLanNay = IIF(@KLKhopLanNay > @KLConLaiDeKhop, @KLConLaiDeKhop, @KLKhopLanNay);
                    IF @KLKhopLanNay > 0 BEGIN
                        -- Khớp... (INSERT LENHKHOP, UPDATE SOHUU, UPDATE TAIKHOAN Bán, HOÀN TIỀN DƯ Mua LO)
                        INSERT INTO dbo.LENHKHOP (MaGD, NgayGioKhop, SoLuongKhop, GiaKhop, KieuKhop) VALUES (@MaGD_M, @MatchTime, @KLKhopLanNay, @GiaATC, N'Khớp ATC'), (@MaGD_B, @MatchTime, @KLKhopLanNay, @GiaATC, N'Khớp ATC');
                        MERGE dbo.SOHUU AS T USING (SELECT @MaNDT_M AS MaNDT, @MaCP AS MaCP) AS S ON T.MaNDT=S.MaNDT AND T.MaCP=S.MaCP WHEN MATCHED THEN UPDATE SET SoLuong=T.SoLuong+@KLKhopLanNay WHEN NOT MATCHED THEN INSERT (MaNDT, MaCP, SoLuong) VALUES (S.MaNDT, S.MaCP, @KLKhopLanNay);
                        UPDATE dbo.SOHUU SET SoLuong = SoLuong - @KLKhopLanNay WHERE MaNDT = @MaNDT_B AND MaCP = @MaCP;
                        UPDATE dbo.TAIKHOAN_NGANHANG SET SoTien = SoTien + (@KLKhopLanNay * @GiaATC) WHERE MaTK = @MaTK_B;
                        IF @GiaLO_M > @GiaATC BEGIN UPDATE dbo.TAIKHOAN_NGANHANG SET SoTien = SoTien + (@KLKhopLanNay * (@GiaLO_M - @GiaATC)) WHERE MaTK = @MaTK_M; END
                        -- Cập nhật KL
                        SET @KLConLai_M = @KLConLai_M - @KLKhopLanNay; UPDATE @LệnhChoATC SET SoLuongConLai = SoLuongConLai - @KLKhopLanNay WHERE MaGD = @MaGD_B; SET @KLConLaiDeKhop = @KLConLaiDeKhop - @KLKhopLanNay;
                        -- Ghi nhận khớp
                        MERGE @KhopTrongPhienATC AS T USING (SELECT @MaGD_M AS MaGD UNION ALL SELECT @MaGD_B) AS S ON T.MaGD=S.MaGD WHEN MATCHED THEN UPDATE SET KLDaKhop=T.KLDaKhop+@KLKhopLanNay WHEN NOT MATCHED THEN INSERT (MaGD, KLDaKhop) VALUES (S.MaGD, @KLKhopLanNay);
                    END
                     IF @KLConLaiDeKhop > 0 AND (SELECT SoLuongConLai FROM @LệnhChoATC WHERE MaGD=@MaGD_B) <= 0 FETCH NEXT FROM curLO_B INTO @MaGD_B, @KLConLai_B, @MaTK_B, @MaNDT_B;
                     ELSE IF @KLConLaiDeKhop <= 0 OR @KLConLai_M <= 0 BREAK;
                     ELSE SELECT @KLConLai_B = SoLuongConLai FROM @LệnhChoATC WHERE MaGD=@MaGD_B;
                 END
                 CLOSE curLO_B; DEALLOCATE curLO_B;
                 UPDATE @LệnhChoATC SET SoLuongConLai = @KLConLai_M WHERE MaGD = @MaGD_M;
                 FETCH NEXT FROM curLO_M INTO @MaGD_M, @KLConLai_M, @MaTK_M, @MaNDT_M, @GiaLO_M;
             END
             CLOSE curLO_M; DEALLOCATE curLO_M;
             PRINT '[ATC ' + @MaCP + '] Finished matching LO vs LO orders.';
         END

        -- === Kết thúc Khớp lệnh ===

        -- Cập nhật trạng thái Hết cho lệnh đã khớp trong ATC
        UPDATE ld SET ld.TrangThai = N'Hết' FROM dbo.LENHDAT ld JOIN @LệnhChoATC lca ON ld.MaGD = lca.MaGD JOIN @KhopTrongPhienATC ktp ON ld.MaGD = ktp.MaGD WHERE ktp.KLDaKhop > 0 AND lca.SoLuongConLai <= 0 AND CAST(ld.NgayGD AS DATE) = @NgayGiaoDich;


        -- HOÀN TIỀN CHO PHẦN CÒN LẠI CỦA LỆNH MUA 'MỘT PHẦN' VÀ 'CHỜ' KHÔNG KHỚP TRONG ATC
        DECLARE @LenhMuaCanHoanTien TABLE (MaGD INT, MaTK NCHAR(20), SoTienHoan FLOAT, SoLuongConLai INT);
        WITH TongKhopTheoLenh AS ( SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop FROM dbo.LENHKHOP GROUP BY MaGD )
        INSERT INTO @LenhMuaCanHoanTien (MaGD, MaTK, SoLuongConLai, SoTienHoan)
        SELECT
            ld.MaGD, ld.MaTK,
            (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)), -- SL Còn Lại
            (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) * ISNULL(ld.Gia, @GiaTran) -- Tiền hoàn cho SL còn lại
        FROM dbo.LENHDAT ld
        LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD
        WHERE ld.MaCP = @MaCP
        AND ld.LoaiGD = 'M' -- Chỉ lệnh mua
        AND ld.TrangThai IN (N'Chờ', N'Một phần') -- Cả Chờ và Một Phần
        AND CAST(ld.NgayGD AS DATE) = @NgayGiaoDich
        AND ld.MaGD NOT IN (SELECT MaGD FROM @KhopTrongPhienATC WHERE KLDaKhop >= (SELECT SoLuongConLai FROM @LệnhChoATC WHERE MaGD = ld.MaGD)) -- Không khớp hết trong ATC
        AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0; -- Vẫn còn SL

        -- Thực hiện hoàn tiền
        UPDATE tk
        SET tk.SoTien = tk.SoTien + lmch.SoTienHoan
        FROM dbo.TAIKHOAN_NGANHANG tk
        JOIN @LenhMuaCanHoanTien lmch ON tk.MaTK = lmch.MaTK;
        IF @@ROWCOUNT > 0 PRINT '[ATC ' + @MaCP + '] Refunded money for buy orders (Pending/Partial) not fully matched in ATC.';

        -- Chuyển trạng thái 'Chờ' hoặc 'Một phần' còn lại (không khớp hết) thành 'Chưa'
        UPDATE dbo.LENHDAT
        SET TrangThai = N'Chưa'
        WHERE MaCP = @MaCP
        AND TrangThai IN (N'Chờ', N'Một phần') -- Áp dụng cho cả Chờ và Một Phần
        AND CAST(NgayGD AS DATE) = @NgayGiaoDich
        AND MaGD NOT IN (SELECT MaGD FROM @KhopTrongPhienATC WHERE KLDaKhop >= (SELECT lca.SoLuong FROM dbo.LENHDAT lca WHERE lca.MaGD = LENHDAT.MaGD)); -- Điều kiện này để chắc chắn là những lệnh không khớp HẾT
                                                                                                                                    -- Hoặc đơn giản hơn: MaGD NOT IN (SELECT MaGD FROM @KhopTrongPhienATC WHERE KLDaKhop > 0 AND (SELECT SoLuongConLai FROM @LệnhChoATC WHERE MaGD = LENHDAT.MaGD) <= 0)

        --  Cách đơn giản hơn để chuyển trạng thái cuối ngày:
        --  Sau khi cập nhật 'Hết' cho các lệnh khớp đủ trong ATC,
        --  Tất cả các lệnh Mua/Bán của ngày đó cho MaCP này mà TrangThai vẫn là 'Chờ' hoặc 'Một phần'
        --  thì đều chuyển thành 'Chưa'.
        UPDATE dbo.LENHDAT
        SET TrangThai = N'Chưa'
        WHERE MaCP = @MaCP
        AND TrangThai IN (N'Chờ', N'Một phần') -- Lấy những lệnh chưa hoàn thành
        AND CAST(NgayGD AS DATE) = @NgayGiaoDich; -- Chỉ lệnh của ngày này

        -- Cập nhật LICHSUGIA cuối cùng
        UPDATE dbo.LICHSUGIA SET GiaDongCua = @GiaATC, GiaCaoNhat = IIF(@GiaATC > ISNULL(GiaCaoNhat, 0), @GiaATC, ISNULL(GiaCaoNhat, @GiaATC)), GiaThapNhat = IIF(@GiaATC < ISNULL(GiaThapNhat, 999999999), @GiaATC, ISNULL(GiaThapNhat, @GiaATC)) WHERE MaCP = @MaCP AND Ngay = @NgayGiaoDich;

        COMMIT TRANSACTION;
         PRINT '[ATC ' + @MaCP + '] Matching Transaction Committed. Unmatched ''Chờ'' orders set to ''Chưa'' (refunded if buy order).';
    END
ELSE -- Trường hợp không có khớp lệnh nào xảy ra trong phiên ATC
    BEGIN
        -- Giữ nguyên giá đóng cửa là giá khớp cuối cùng của phiên liên tục
        SET @GiaDongCua = @GiaKhopCuoiPhienLienTuc;
        SET @TongKLKhopATC = 0; -- Không có KL khớp trong ATC
        PRINT '[ATC ' + @MaCP + '] No match found. Closing price remains Last Continuous Price: ' + ISNULL(CAST(@GiaDongCua AS VARCHAR),'N/A');

        -- *** CẬP NHẬT GiaDongCua TRONG LICHSUGIA (NẾU CẦN) ***
        -- Chỉ cập nhật nếu có giá khớp cuối phiên liên tục và nó khác với giá đóng cửa tạm thời đang lưu
        IF @GiaDongCua IS NOT NULL
        BEGIN
            -- Dùng transaction nhỏ ở đây để đảm bảo an toàn cho việc update đơn lẻ này
            BEGIN TRANSACTION UpdateClosePriceNoMatch;
            BEGIN TRY
                UPDATE dbo.LICHSUGIA
                SET GiaDongCua = @GiaDongCua
                WHERE MaCP = @MaCP
                  AND Ngay = @NgayGiaoDich
                  AND ISNULL(GiaDongCua, -1) <> @GiaDongCua; -- Chỉ update nếu giá trị khác hoặc đang NULL (dùng -1 để so sánh với NULL)

                IF @@ROWCOUNT > 0 PRINT '[ATC ' + @MaCP + '] Final Closing Price updated in LICHSUGIA based on last continuous match.';

                COMMIT TRANSACTION UpdateClosePriceNoMatch;
            END TRY
            BEGIN CATCH
                IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION UpdateClosePriceNoMatch;
                PRINT '*** ERROR Updating Closing Price when no ATC match: ' + ERROR_MESSAGE();
                -- Không nên RAISERROR ở đây để không dừng SP chỉ vì lỗi update giá này
            END CATCH
        END

           -- *** HOÀN TIỀN CHO TẤT CẢ LỆNH MUA CHỜ BỊ CHUYỂN THÀNH 'CHƯA' (SỬA LẠI) ***
        DECLARE @MuaChoBiChuaNoMatch TABLE (MaGD INT, MaTK NCHAR(20), SoTienHoan FLOAT);
        -- Sử dụng lại CTE TongKhopTheoLenh
        WITH TongKhopTheoLenh AS ( SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop FROM dbo.LENHKHOP GROUP BY MaGD )
        INSERT INTO @MuaChoBiChuaNoMatch (MaGD, MaTK, SoTienHoan)
        SELECT ld.MaGD, ld.MaTK, (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) * ISNULL(ld.Gia, @GiaTran)
        FROM dbo.LENHDAT ld
        LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD
        WHERE ld.MaCP = @MaCP AND ld.TrangThai = N'Chờ' AND ld.LoaiGD = 'M'
          AND CAST(ld.NgayGD AS DATE) = @NgayGiaoDich
          AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0;

   -- Thực hiện hoàn tiền và cập nhật trạng thái trong transaction nhỏ
        BEGIN TRANSACTION RefundNoMatch;
        BEGIN TRY
            UPDATE tk SET tk.SoTien = tk.SoTien + mcbc.SoTienHoan FROM dbo.TAIKHOAN_NGANHANG tk JOIN @MuaChoBiChuaNoMatch mcbc ON tk.MaTK = mcbc.MaTK;
            UPDATE dbo.LENHDAT SET TrangThai = N'Chưa' WHERE MaGD IN (SELECT MaGD FROM @MuaChoBiChuaNoMatch);
            UPDATE dbo.LENHDAT SET TrangThai = N'Chưa' WHERE MaCP = @MaCP AND TrangThai = N'Chờ' AND LoaiGD = 'B' AND CAST(NgayGD AS DATE) = @NgayGiaoDich;
            COMMIT TRANSACTION RefundNoMatch;
            PRINT '[ATC ' + @MaCP + '] Refunded money and set remaining ''Chờ'' orders to ''Chưa''.';
        END TRY
        BEGIN CATCH
             IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION RefundNoMatch;
             PRINT '*** ERROR Refunding/Updating status when no ATC match: ' + ERROR_MESSAGE();
             -- Có thể RAISERROR ở đây
        END CATCH

        -- Lệnh 'Một phần' vẫn giữ nguyên trạng thái

    END

END; -- Kết thúc SP
GO

PRINT 'Stored Procedure sp_ExecuteATCMatching created/altered.';
GO