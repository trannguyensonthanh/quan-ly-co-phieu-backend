-- File: sp_matching_prices_ATO.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Creating/Altering Stored Procedure sp_ExecuteATOMatching (Final)...';
GO

CREATE OR ALTER PROCEDURE dbo.sp_ExecuteATOMatching
    @MaCP NVARCHAR(10),
    @NgayGiaoDich DATE,
    @GiaTC FLOAT,
    @GiaTran FLOAT,
    @GiaSan FLOAT,
    @GiaMoCua FLOAT OUTPUT,
    @TongKLKhopATO INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON; -- Ensure transaction rollback on error

    -- Initialize variables
    DECLARE @GiaATO FLOAT = NULL;
    DECLARE @MaxKLKhop BIGINT = 0;
    DECLARE @MinChenhLech BIGINT = -1; -- Use -1 to indicate not set
    DECLARE @BuocGia FLOAT = 100; -- Or get from config table
    DECLARE @TotalAtoBuy BIGINT = 0, @TotalAtoSell BIGINT = 0;
    DECLARE @MatchTime DATETIME = GETDATE(); -- Use a single timestamp for all matches in this session

    -- Temporary tables
    DECLARE @OrderBook TABLE ( MucGia FLOAT PRIMARY KEY, KLMuaTichLuy BIGINT DEFAULT 0, KLBanTichLuy BIGINT DEFAULT 0, KLKhopTaiMucGia BIGINT DEFAULT 0, ChenhLech BIGINT DEFAULT 0 );
    DECLARE @LệnhChoATO TABLE ( MaGD INT PRIMARY KEY, LoaiGD CHAR(1), LoaiLenh NCHAR(5), Gia FLOAT NULL, SoLuongConLai INT, MaTK NCHAR(20), MaNDT NCHAR(20), NgayGD DATETIME, RN_TimePriority BIGINT ); -- Added RN for time priority
    DECLARE @KhopTrongPhien TABLE (MaGD INT PRIMARY KEY, KLDaKhop INT DEFAULT 0);

    PRINT '[ATO ' + @MaCP + '] Starting... TC=' + CAST(@GiaTC AS VARCHAR) + ', Date=' + CONVERT(VARCHAR, @NgayGiaoDich);

    -- 1. Get Pending Orders into @LệnhChoATO
    -- Use CTE to calculate remaining quantity correctly
    WITH TongKhopTheoLenh AS (
        SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop
        FROM dbo.LENHKHOP
        WHERE MaGD IN (SELECT MaGD FROM dbo.LENHDAT WHERE MaCP = @MaCP AND CAST(NgayGD AS DATE) = @NgayGiaoDich)
        -- Consider adding date filter if LENHKHOP is very large and partitioned
        GROUP BY MaGD
    )
    INSERT INTO @LệnhChoATO (MaGD, LoaiGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT, NgayGD, RN_TimePriority)
    SELECT
        ld.MaGD, ld.LoaiGD, ld.LoaiLenh, ld.Gia,
        (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) AS SoLuongConLai,
        ld.MaTK, tk.MaNDT, ld.NgayGD,
        ROW_NUMBER() OVER (ORDER BY ld.NgayGD ASC, ld.MaGD ASC) -- Stable time priority
    FROM dbo.LENHDAT ld
    JOIN dbo.TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
    LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD
    WHERE ld.MaCP = @MaCP
      AND ld.TrangThai IN (N'Chờ', N'Một phần') -- Should ideally only be 'Chờ' before ATO
      AND (ld.LoaiLenh = 'ATO' OR ld.LoaiLenh = 'LO')
      AND CAST(ld.NgayGD AS DATE) = @NgayGiaoDich
      AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0;

    PRINT '[ATO ' + @MaCP + '] Found ' + CAST(@@ROWCOUNT AS VARCHAR) + ' pending orders.';

    -- 2. Build Virtual Order Book @OrderBook
    INSERT INTO @OrderBook (MucGia)
    SELECT DISTINCT Gia FROM @LệnhChoATO WHERE LoaiLenh = 'LO' AND Gia IS NOT NULL AND Gia BETWEEN @GiaSan AND @GiaTran
    UNION SELECT @GiaTC; -- Always include Reference Price
    IF NOT EXISTS (SELECT 1 FROM @OrderBook) INSERT INTO @OrderBook(MucGia) VALUES (@GiaTC); -- Ensure at least one price level

    SELECT @TotalAtoBuy = SUM(SoLuongConLai) FROM @LệnhChoATO WHERE LoaiLenh = 'ATO' AND LoaiGD = 'M'; SET @TotalAtoBuy = ISNULL(@TotalAtoBuy, 0);
    SELECT @TotalAtoSell = SUM(SoLuongConLai) FROM @LệnhChoATO WHERE LoaiLenh = 'ATO' AND LoaiGD = 'B'; SET @TotalAtoSell = ISNULL(@TotalAtoSell, 0);

    UPDATE ob SET KLMuaTichLuy = @TotalAtoBuy + ISNULL(MuaLO.TongKL_LO, 0) FROM @OrderBook ob LEFT JOIN (SELECT ob_inner.MucGia, SUM(lca.SoLuongConLai) AS TongKL_LO FROM @OrderBook ob_inner JOIN @LệnhChoATO lca ON lca.LoaiLenh = 'LO' AND lca.LoaiGD = 'M' AND lca.Gia >= ob_inner.MucGia GROUP BY ob_inner.MucGia) MuaLO ON ob.MucGia = MuaLO.MucGia;
    UPDATE ob SET KLBanTichLuy = @TotalAtoSell + ISNULL(BanLO.TongKL_LO, 0) FROM @OrderBook ob LEFT JOIN (SELECT ob_inner.MucGia, SUM(lca.SoLuongConLai) AS TongKL_LO FROM @OrderBook ob_inner JOIN @LệnhChoATO lca ON lca.LoaiLenh = 'LO' AND lca.LoaiGD = 'B' AND lca.Gia <= ob_inner.MucGia GROUP BY ob_inner.MucGia) BanLO ON ob.MucGia = BanLO.MucGia;
    UPDATE @OrderBook SET KLKhopTaiMucGia = IIF(KLMuaTichLuy < KLBanTichLuy, KLMuaTichLuy, KLBanTichLuy), ChenhLech = ABS(KLMuaTichLuy - KLBanTichLuy);
    PRINT '[ATO ' + @MaCP + '] Order book calculated.';

    -- 3. Determine ATO Price
    SELECT TOP 1 @GiaATO = MucGia, @MaxKLKhop = KLKhopTaiMucGia
    FROM @OrderBook WHERE KLKhopTaiMucGia > 0
    ORDER BY KLKhopTaiMucGia DESC, ChenhLech ASC, ABS(MucGia - @GiaTC) ASC, MucGia DESC;

    IF @GiaATO IS NULL AND @TotalAtoBuy > 0 AND @TotalAtoSell > 0
    BEGIN SET @GiaATO = @GiaTC; SET @MaxKLKhop = IIF(@TotalAtoBuy < @TotalAtoSell, @TotalAtoBuy, @TotalAtoSell); PRINT '[ATO ' + @MaCP + '] Only ATO orders match. Matching at TC: ' + CAST(@GiaATO AS VARCHAR); END

    -- 4. Execute Matching if Price Determined
    IF @GiaATO IS NOT NULL AND @MaxKLKhop > 0
    BEGIN
        SET @GiaMoCua = @GiaATO;
        SET @TongKLKhopATO = @MaxKLKhop;
        DECLARE @KLConLaiDeKhop BIGINT = @MaxKLKhop; -- Remaining volume to be matched

        PRINT '[ATO ' + @MaCP + '] Determined Price: ' + CAST(@GiaATO AS VARCHAR) + ', Max Volume: ' + CAST(@MaxKLKhop AS VARCHAR);

        BEGIN TRANSACTION;

        -- Create temporary tables for buy and sell orders eligible for matching at @GiaATO
        SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT, NgayGD, RN_TimePriority
        INTO #BuyOrdersATO
        FROM @LệnhChoATO
        WHERE LoaiGD = 'M' AND (LoaiLenh = 'ATO' OR (LoaiLenh = 'LO' AND Gia >= @GiaATO));

        SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT, NgayGD, RN_TimePriority
        INTO #SellOrdersATO
        FROM @LệnhChoATO
        WHERE LoaiGD = 'B' AND (LoaiLenh = 'ATO' OR (LoaiLenh = 'LO' AND Gia <= @GiaATO));

        -- Declare Cursors for matching with priorities
        -- Buy side: ATO first, then LO (Price DESC -> Time ASC)
        DECLARE curBuy CURSOR LOCAL FAST_FORWARD FOR
            SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT FROM #BuyOrdersATO
            ORDER BY CASE LoaiLenh WHEN 'ATO' THEN 1 ELSE 2 END, Gia DESC, RN_TimePriority ASC;

        -- Sell side: ATO first, then LO (Price ASC -> Time ASC)
        DECLARE curSell CURSOR LOCAL STATIC FOR -- STATIC needed to reopen if necessary
            SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT FROM #SellOrdersATO
            ORDER BY CASE LoaiLenh WHEN 'ATO' THEN 1 ELSE 2 END, Gia ASC, RN_TimePriority ASC;

        -- Cursor variables
        DECLARE @MaGD_M INT, @LoaiLenh_M NCHAR(5), @Gia_M FLOAT, @KLConLai_M INT, @MaTK_M NCHAR(20), @MaNDT_M NCHAR(20);
        DECLARE @MaGD_B INT, @LoaiLenh_B NCHAR(5), @Gia_B FLOAT, @KLConLai_B INT, @MaTK_B NCHAR(20), @MaNDT_B NCHAR(20);
        DECLARE @GiaLO_B FLOAT; -- Declare the missing variable
        DECLARE @KLKhopLanNay INT;

        OPEN curBuy;
        FETCH NEXT FROM curBuy INTO @MaGD_M, @LoaiLenh_M, @Gia_M, @KLConLai_M, @MaTK_M, @MaNDT_M;

        WHILE @@FETCH_STATUS = 0 AND @KLConLaiDeKhop > 0 AND @KLConLai_M > 0
        BEGIN
            -- Reopen or open sell cursor for each buy order
            IF CURSOR_STATUS('local', 'curSell') >= 0 CLOSE curSell; -- Close if open
            IF CURSOR_STATUS('local', 'curSell') >= -1 DEALLOCATE curSell; -- Deallocate if closed or doesn't exist
            DECLARE curSell CURSOR LOCAL STATIC FOR SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT FROM #SellOrdersATO ORDER BY CASE LoaiLenh WHEN 'ATO' THEN 1 ELSE 2 END, Gia ASC, RN_TimePriority ASC;
            OPEN curSell;
            FETCH NEXT FROM curSell INTO @MaGD_B, @LoaiLenh_B, @Gia_B, @KLConLai_B, @MaTK_B, @MaNDT_B;

            WHILE @@FETCH_STATUS = 0 AND @KLConLai_M > 0 AND @KLConLaiDeKhop > 0
            BEGIN

             -- *** THÊM KIỂM TRA TỰ KHỚP ***
                IF @MaNDT_M = @MaNDT_B -- Nếu Mã NĐT mua trùng Mã NĐT bán
                BEGIN
                    PRINT '[ATO ' + @MaCP + '] Self-trade detected. Skipping match between Buy MaGD=' + CAST(@MaGD_M AS VARCHAR) + ' and Sell MaGD=' + CAST(@MaGD_B AS VARCHAR);
                    -- Lấy lệnh bán tiếp theo để thử khớp với lệnh mua hiện tại
                    FETCH NEXT FROM curSell INTO @MaGD_B, @LoaiLenh_B, @Gia_B, @KLConLai_B, @MaTK_B, @MaNDT_B;
                    CONTINUE; -- Bỏ qua phần còn lại của vòng lặp này, xử lý lệnh bán tiếp theo
                END
                -- *** HẾT KIỂM TRA TỰ KHỚP ***
                
                -- Check if this sell order still has volume in the temp table (updated by previous buy orders)
                SELECT @KLConLai_B = SoLuongConLai FROM #SellOrdersATO WHERE MaGD = @MaGD_B;

                IF @KLConLai_B > 0 -- Only match if seller still has quantity
                BEGIN
                    SET @KLKhopLanNay = IIF(@KLConLai_M < @KLConLai_B, @KLConLai_M, @KLConLai_B);
                    SET @KLKhopLanNay = IIF(@KLKhopLanNay > @KLConLaiDeKhop, @KLConLaiDeKhop, @KLKhopLanNay);

                    IF @KLKhopLanNay > 0
                    BEGIN
                        PRINT '[ATO ' + @MaCP + '] Match: Buy(' + @LoaiLenh_M + ' ' + CAST(@MaGD_M AS VARCHAR) + ')[' + CAST(@KLKhopLanNay AS VARCHAR) + '] vs Sell(' + @LoaiLenh_B + ' ' + CAST(@MaGD_B AS VARCHAR) + ') @ ' + CAST(@GiaATO AS VARCHAR);
                        -- Insert LENHKHOP
                        INSERT INTO dbo.LENHKHOP (MaGD, NgayGioKhop, SoLuongKhop, GiaKhop, KieuKhop) VALUES (@MaGD_M, @MatchTime, @KLKhopLanNay, @GiaATO, N'Khớp ATO'), (@MaGD_B, @MatchTime, @KLKhopLanNay, @GiaATO, N'Khớp ATO');
                        -- Update SOHUU
                        MERGE dbo.SOHUU AS T USING (SELECT @MaNDT_M AS MaNDT, @MaCP AS MaCP) AS S ON T.MaNDT=S.MaNDT AND T.MaCP=S.MaCP WHEN MATCHED THEN UPDATE SET SoLuong=T.SoLuong+@KLKhopLanNay WHEN NOT MATCHED THEN INSERT (MaNDT, MaCP, SoLuong) VALUES (S.MaNDT, S.MaCP, @KLKhopLanNay);
                        UPDATE dbo.SOHUU SET SoLuong = SoLuong - @KLKhopLanNay WHERE MaNDT = @MaNDT_B AND MaCP = @MaCP; -- Assume seller has enough (checked when placing order)
                        -- Update TAIKHOAN (Credit seller, Refund buyer if LO and price diff)
                        UPDATE dbo.TAIKHOAN_NGANHANG SET SoTien = SoTien + (@KLKhopLanNay * @GiaATO) WHERE MaTK = @MaTK_B;
                        IF @LoaiLenh_M = 'LO' AND @Gia_M > @GiaATO BEGIN UPDATE dbo.TAIKHOAN_NGANHANG SET SoTien = SoTien + (@KLKhopLanNay * (@Gia_M - @GiaATO)) WHERE MaTK = @MaTK_M; END

                        -- Update remaining quantities in temp tables
                        SET @KLConLai_M = @KLConLai_M - @KLKhopLanNay;
                        UPDATE #SellOrdersATO SET SoLuongConLai = SoLuongConLai - @KLKhopLanNay WHERE MaGD = @MaGD_B;
                        SET @KLConLaiDeKhop = @KLConLaiDeKhop - @KLKhopLanNay;

                        -- Record matched volume
                        MERGE @KhopTrongPhien AS T USING (SELECT @MaGD_M AS MaGD UNION ALL SELECT @MaGD_B) AS S ON T.MaGD=S.MaGD WHEN MATCHED THEN UPDATE SET KLDaKhop=T.KLDaKhop+@KLKhopLanNay WHEN NOT MATCHED THEN INSERT (MaGD, KLDaKhop) VALUES (S.MaGD, @KLKhopLanNay);
                    END
                END

                FETCH NEXT FROM curSell INTO @MaGD_B, @LoaiLenh_B, @Gia_B, @KLConLai_B, @MaTK_B, @MaNDT_B; -- Get next potential seller
            END
            CLOSE curSell;
            -- DEALLOCATE curSell; -- Deallocate at the end of outer loop

            -- Update remaining quantity for the current buy order in temp table
            UPDATE #BuyOrdersATO SET SoLuongConLai = @KLConLai_M WHERE MaGD = @MaGD_M;
            FETCH NEXT FROM curBuy INTO @MaGD_M, @LoaiLenh_M, @Gia_M, @KLConLai_M, @MaTK_M, @MaNDT_M; -- Get next buyer
        END
        CLOSE curBuy;
        DEALLOCATE curBuy;
        IF CURSOR_STATUS('local', 'curSell') >= -1 DEALLOCATE curSell; -- Clean up sell cursor

        PRINT '[ATO ' + @MaCP + '] Finished matching loop. Total Matched in SP: ' + CAST((@MaxKLKhop - @KLConLaiDeKhop) AS VARCHAR);
        SET @TongKLKhopATO = @MaxKLKhop - @KLConLaiDeKhop; -- Update output parameter

        -- === Final Updates ===
        -- Update LENHDAT status based on matches
        UPDATE ld
        SET ld.TrangThai = CASE
                              WHEN ISNULL(ktp.KLDaKhop, 0) >= ld.SoLuong THEN N'Hết' -- If total matched >= original volume
                              WHEN ktp.KLDaKhop > 0 THEN N'Một phần'
                              ELSE ld.TrangThai -- Keep 'Chờ' if no match at all
                          END
        FROM dbo.LENHDAT ld 
        JOIN @LệnhChoATO lca ON ld.MaGD = lca.MaGD
        LEFT JOIN @KhopTrongPhien ktp ON ld.MaGD = ktp.MaGD
        WHERE CAST(ld.NgayGD AS DATE) = @NgayGiaoDich; -- Only update orders involved in this session

        -- Cancel unmatched ATO orders
        UPDATE dbo.LENHDAT
        SET TrangThai = N'Hủy'
        WHERE MaGD IN (SELECT MaGD FROM @LệnhChoATO WHERE LoaiLenh = 'ATO') -- Get original ATO orders
          AND MaGD NOT IN (SELECT MaGD FROM @KhopTrongPhien WHERE KLDaKhop > 0) -- That were not matched at all
          AND CAST(NgayGD AS DATE) = @NgayGiaoDich;
        -- Update LICHSUGIA (O, H, L, C)
        MERGE LICHSUGIA AS target
        USING (SELECT @MaCP AS MaCP, @NgayGiaoDich AS Ngay) AS source
        ON (target.MaCP = source.MaCP AND target.Ngay = source.Ngay)
        WHEN MATCHED THEN
            UPDATE SET GiaMoCua = @GiaATO, GiaCaoNhat = @GiaATO, GiaThapNhat = @GiaATO, GiaDongCua = @GiaATO -- Set initial OHLC with ATO price
        WHEN NOT MATCHED BY TARGET THEN -- Should not happen if price prep ran, but safe fallback
            INSERT (MaCP, Ngay, GiaTC, GiaTran, GiaSan, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua)
            VALUES (@MaCP, @NgayGiaoDich, @GiaTC, @GiaTran, @GiaSan, @GiaATO, @GiaATO, @GiaATO, @GiaATO);

        COMMIT TRANSACTION;
        PRINT '[ATO ' + @MaCP + '] Matching Transaction Committed.';

        -- Clean up temp tables
        DROP TABLE IF EXISTS #BuyOrdersATO;
        DROP TABLE IF EXISTS #SellOrdersATO;

    END
    ELSE -- Không có khớp ATO
    BEGIN
        SET @GiaMoCua = NULL; SET @TongKLKhopATO = 0;
        PRINT '[ATO ' + @MaCP + '] No match found.';
        -- Hủy lệnh ATO của ngày hôm nay
        UPDATE dbo.LENHDAT SET TrangThai = N'Hủy'
        WHERE MaCP = @MaCP AND LoaiLenh = 'ATO' AND TrangThai IN (N'Chờ', N'Một phần')
          AND CAST(NgayGD AS DATE) = @NgayGiaoDich; -- Chỉ hủy lệnh ATO của ngày này
    END


END;
GO

PRINT 'Stored Procedure sp_ExecuteATOMatching created/altered.';
GO
