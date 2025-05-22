-- File: sp_matching_prices_ATO.sql
USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

PRINT 'Tạo hoặc cập nhật Stored Procedure sp_ExecuteATOMatching (Final)...';
GO

CREATE OR ALTER PROCEDURE dbo.sp_ExecuteATOMatching
    @MaCP NVARCHAR(10), -- Mã cổ phiếu
    @NgayGiaoDich DATE, -- Ngày giao dịch
    @GiaTC FLOAT, -- Giá tham chiếu
    @GiaTran FLOAT, -- Giá trần
    @GiaSan FLOAT, -- Giá sàn
    @GiaMoCua FLOAT OUTPUT, -- Giá mở cửa (kết quả đầu ra)
    @TongKLKhopATO INT OUTPUT -- Tổng khối lượng khớp ATO (kết quả đầu ra)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON; -- Đảm bảo giao dịch sẽ được hoàn tác khi xảy ra lỗi

    -- Khởi tạo các biến
    DECLARE @GiaATO FLOAT = NULL; -- Giá ATO
    DECLARE @MaxKLKhop BIGINT = 0; -- Khối lượng khớp tối đa
    DECLARE @MinChenhLech BIGINT = -1; -- Sử dụng -1 để chỉ ra rằng chưa được thiết lập
    DECLARE @BuocGia FLOAT = 100; -- Bước giá (hoặc lấy từ bảng cấu hình)
    DECLARE @TotalAtoBuy BIGINT = 0, @TotalAtoSell BIGINT = 0; -- Tổng khối lượng mua/bán ATO
    DECLARE @MatchTime DATETIME = GETDATE(); -- Thời gian khớp lệnh duy nhất cho tất cả các khớp trong phiên này

    -- Bảng tạm
    DECLARE @OrderBook TABLE ( 
        MucGia FLOAT PRIMARY KEY, -- Mức giá
        KLMuaTichLuy BIGINT DEFAULT 0, -- Khối lượng mua tích lũy
        KLBanTichLuy BIGINT DEFAULT 0, -- Khối lượng bán tích lũy
        KLKhopTaiMucGia BIGINT DEFAULT 0, -- Khối lượng khớp tại mức giá
        ChenhLech BIGINT DEFAULT 0 -- Chênh lệch giữa khối lượng mua và bán
    );
    DECLARE @LệnhChoATO TABLE ( 
        MaGD INT PRIMARY KEY, -- Mã giao dịch
        LoaiGD CHAR(1), -- Loại giao dịch (Mua/Bán)
        LoaiLenh NCHAR(5), -- Loại lệnh (ATO/LO)
        Gia FLOAT NULL, -- Giá
        SoLuongConLai INT, -- Số lượng còn lại
        MaTK NCHAR(20), -- Mã tài khoản
        MaNDT NCHAR(20), -- Mã nhà đầu tư
        NgayGD DATETIME, -- Ngày giao dịch
        RN_TimePriority BIGINT -- Thứ tự ưu tiên theo thời gian
    ); 
    DECLARE @KhopTrongPhien TABLE (MaGD INT PRIMARY KEY, KLDaKhop INT DEFAULT 0); -- Bảng lưu khối lượng đã khớp trong phiên

    PRINT '[ATO ' + @MaCP + '] Bắt đầu... TC=' + CAST(@GiaTC AS VARCHAR) + ', Ngày=' + CONVERT(VARCHAR, @NgayGiaoDich);

    -- 1. Lấy các lệnh đang chờ vào bảng @LệnhChoATO
    -- Sử dụng CTE để tính toán số lượng còn lại một cách chính xác
    WITH TongKhopTheoLenh AS (
        SELECT MaGD, SUM(ISNULL(SoLuongKhop, 0)) AS TongDaKhop -- Tổng số lượng đã khớp
        FROM dbo.LENHKHOP
        WHERE MaGD IN (SELECT MaGD FROM dbo.LENHDAT WHERE MaCP = @MaCP AND CAST(NgayGD AS DATE) = @NgayGiaoDich)
        -- Cân nhắc thêm bộ lọc ngày nếu bảng LENHKHOP rất lớn và được phân vùng
        GROUP BY MaGD
    )
    INSERT INTO @LệnhChoATO (MaGD, LoaiGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT, NgayGD, RN_TimePriority)
    SELECT
        ld.MaGD, ld.LoaiGD, ld.LoaiLenh, ld.Gia,
        (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) AS SoLuongConLai, -- Số lượng còn lại
        ld.MaTK, tk.MaNDT, ld.NgayGD,
        ROW_NUMBER() OVER (ORDER BY ld.NgayGD ASC, ld.MaGD ASC) -- Thứ tự ưu tiên theo thời gian
    FROM dbo.LENHDAT ld
    JOIN dbo.TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
    LEFT JOIN TongKhopTheoLenh tkl ON ld.MaGD = tkl.MaGD
    WHERE ld.MaCP = @MaCP
      AND ld.TrangThai IN (N'Chờ', N'Một phần') -- Chỉ lấy các lệnh đang chờ hoặc khớp một phần
      AND (ld.LoaiLenh = 'ATO' OR ld.LoaiLenh = 'LO') -- Chỉ lấy lệnh ATO hoặc LO
      AND CAST(ld.NgayGD AS DATE) = @NgayGiaoDich
      AND (ld.SoLuong - ISNULL(tkl.TongDaKhop, 0)) > 0; -- Chỉ lấy các lệnh còn khối lượng

    PRINT '[ATO ' + @MaCP + '] Tìm thấy ' + CAST(@@ROWCOUNT AS VARCHAR) + ' lệnh đang chờ.';

    -- 2. Xây dựng sổ lệnh ảo @OrderBook
    INSERT INTO @OrderBook (MucGia)
    SELECT DISTINCT Gia FROM @LệnhChoATO WHERE LoaiLenh = 'LO' AND Gia IS NOT NULL AND Gia BETWEEN @GiaSan AND @GiaTran
    UNION SELECT @GiaTC; -- Luôn bao gồm giá tham chiếu
    IF NOT EXISTS (SELECT 1 FROM @OrderBook) INSERT INTO @OrderBook(MucGia) VALUES (@GiaTC); -- Đảm bảo ít nhất có một mức giá

    -- Tính tổng khối lượng mua/bán ATO
    SELECT @TotalAtoBuy = SUM(SoLuongConLai) FROM @LệnhChoATO WHERE LoaiLenh = 'ATO' AND LoaiGD = 'M'; 
    SET @TotalAtoBuy = ISNULL(@TotalAtoBuy, 0);
    SELECT @TotalAtoSell = SUM(SoLuongConLai) FROM @LệnhChoATO WHERE LoaiLenh = 'ATO' AND LoaiGD = 'B'; 
    SET @TotalAtoSell = ISNULL(@TotalAtoSell, 0);

    -- Cập nhật khối lượng mua/bán tích lũy trong sổ lệnh
    UPDATE ob 
    SET KLMuaTichLuy = @TotalAtoBuy + ISNULL(MuaLO.TongKL_LO, 0) 
    FROM @OrderBook ob 
    LEFT JOIN (
        SELECT ob_inner.MucGia, SUM(lca.SoLuongConLai) AS TongKL_LO 
        FROM @OrderBook ob_inner 
        JOIN @LệnhChoATO lca ON lca.LoaiLenh = 'LO' AND lca.LoaiGD = 'M' AND lca.Gia >= ob_inner.MucGia 
        GROUP BY ob_inner.MucGia
    ) MuaLO ON ob.MucGia = MuaLO.MucGia;

    UPDATE ob 
    SET KLBanTichLuy = @TotalAtoSell + ISNULL(BanLO.TongKL_LO, 0) 
    FROM @OrderBook ob 
    LEFT JOIN (
        SELECT ob_inner.MucGia, SUM(lca.SoLuongConLai) AS TongKL_LO 
        FROM @OrderBook ob_inner 
        JOIN @LệnhChoATO lca ON lca.LoaiLenh = 'LO' AND lca.LoaiGD = 'B' AND lca.Gia <= ob_inner.MucGia 
        GROUP BY ob_inner.MucGia
    ) BanLO ON ob.MucGia = BanLO.MucGia;

    -- Tính khối lượng khớp tại mỗi mức giá và chênh lệch
    UPDATE @OrderBook 
    SET KLKhopTaiMucGia = IIF(KLMuaTichLuy < KLBanTichLuy, KLMuaTichLuy, KLBanTichLuy), 
        ChenhLech = ABS(KLMuaTichLuy - KLBanTichLuy);

    PRINT '[ATO ' + @MaCP + '] Sổ lệnh đã được tính toán.';
    -- 3. Xác định giá ATO
    SELECT TOP 1 @GiaATO = MucGia, @MaxKLKhop = KLKhopTaiMucGia
    FROM @OrderBook 
    WHERE KLKhopTaiMucGia > 0
    ORDER BY KLKhopTaiMucGia DESC, -- Ưu tiên khối lượng khớp lớn nhất
             ChenhLech ASC, -- Nếu khối lượng khớp bằng nhau, ưu tiên chênh lệch nhỏ nhất
             ABS(MucGia - @GiaTC) ASC, -- Nếu chênh lệch bằng nhau, ưu tiên giá gần giá tham chiếu nhất
             MucGia DESC; -- Nếu vẫn bằng nhau, ưu tiên giá cao hơn

    -- Nếu không xác định được giá ATO nhưng có lệnh mua và bán ATO
    IF @GiaATO IS NULL AND @TotalAtoBuy > 0 AND @TotalAtoSell > 0
    BEGIN 
        SET @GiaATO = @GiaTC; -- Sử dụng giá tham chiếu làm giá ATO
        SET @MaxKLKhop = IIF(@TotalAtoBuy < @TotalAtoSell, @TotalAtoBuy, @TotalAtoSell); -- Khối lượng khớp là khối lượng nhỏ hơn giữa mua và bán
        PRINT '[ATO ' + @MaCP + '] Chỉ có lệnh ATO khớp. Khớp tại giá tham chiếu: ' + CAST(@GiaATO AS VARCHAR); 
    END

    -- 4. Thực hiện khớp lệnh nếu xác định được giá
    IF @GiaATO IS NOT NULL AND @MaxKLKhop > 0
    BEGIN
        SET @GiaMoCua = @GiaATO; -- Cập nhật giá mở cửa
        SET @TongKLKhopATO = @MaxKLKhop; -- Cập nhật tổng khối lượng khớp ATO
        DECLARE @KLConLaiDeKhop BIGINT = @MaxKLKhop; -- Khối lượng còn lại để khớp

        PRINT '[ATO ' + @MaCP + '] Giá xác định: ' + CAST(@GiaATO AS VARCHAR) + ', Khối lượng tối đa: ' + CAST(@MaxKLKhop AS VARCHAR);

        BEGIN TRANSACTION; -- Bắt đầu giao dịch

        -- Tạo bảng tạm cho các lệnh mua đủ điều kiện khớp tại giá ATO
        SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT, NgayGD, RN_TimePriority
        INTO #BuyOrdersATO
        FROM @LệnhChoATO
        WHERE LoaiGD = 'M' AND (LoaiLenh = 'ATO' OR (LoaiLenh = 'LO' AND Gia >= @GiaATO));

        -- Tạo bảng tạm cho các lệnh bán đủ điều kiện khớp tại giá ATO
        SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT, NgayGD, RN_TimePriority
        INTO #SellOrdersATO
        FROM @LệnhChoATO
        WHERE LoaiGD = 'B' AND (LoaiLenh = 'ATO' OR (LoaiLenh = 'LO' AND Gia <= @GiaATO));

        -- Khai báo con trỏ cho các lệnh mua, ưu tiên ATO trước, sau đó LO (giá giảm dần -> thời gian tăng dần)
        DECLARE curBuy CURSOR LOCAL FAST_FORWARD FOR
            SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT 
            FROM #BuyOrdersATO
            ORDER BY CASE LoaiLenh WHEN 'ATO' THEN 1 ELSE 2 END, Gia DESC, RN_TimePriority ASC;

        -- Khai báo con trỏ cho các lệnh bán, ưu tiên ATO trước, sau đó LO (giá tăng dần -> thời gian tăng dần)
        DECLARE curSell CURSOR LOCAL STATIC FOR
            SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT 
            FROM #SellOrdersATO
            ORDER BY CASE LoaiLenh WHEN 'ATO' THEN 1 ELSE 2 END, Gia ASC, RN_TimePriority ASC;

        -- Biến con trỏ
        DECLARE @MaGD_M INT, @LoaiLenh_M NCHAR(5), @Gia_M FLOAT, @KLConLai_M INT, @MaTK_M NCHAR(20), @MaNDT_M NCHAR(20);
        DECLARE @MaGD_B INT, @LoaiLenh_B NCHAR(5), @Gia_B FLOAT, @KLConLai_B INT, @MaTK_B NCHAR(20), @MaNDT_B NCHAR(20);
        DECLARE @KLKhopLanNay INT; -- Khối lượng khớp trong lần này

        OPEN curBuy; -- Mở con trỏ mua
        FETCH NEXT FROM curBuy INTO @MaGD_M, @LoaiLenh_M, @Gia_M, @KLConLai_M, @MaTK_M, @MaNDT_M;

        -- Vòng lặp khớp lệnh mua và bán
        WHILE @@FETCH_STATUS = 0 AND @KLConLaiDeKhop > 0 AND @KLConLai_M > 0
        BEGIN
            -- Mở lại hoặc mở con trỏ bán cho mỗi lệnh mua
            IF CURSOR_STATUS('local', 'curSell') >= 0 CLOSE curSell; -- Đóng nếu đang mở
            IF CURSOR_STATUS('local', 'curSell') >= -1 DEALLOCATE curSell; -- Giải phóng nếu đã đóng hoặc không tồn tại
            DECLARE curSell CURSOR LOCAL STATIC FOR 
                SELECT MaGD, LoaiLenh, Gia, SoLuongConLai, MaTK, MaNDT 
                FROM #SellOrdersATO
                ORDER BY CASE LoaiLenh WHEN 'ATO' THEN 1 ELSE 2 END, Gia ASC, RN_TimePriority ASC;
            OPEN curSell; -- Mở con trỏ bán
            FETCH NEXT FROM curSell INTO @MaGD_B, @LoaiLenh_B, @Gia_B, @KLConLai_B, @MaTK_B, @MaNDT_B;

            -- Vòng lặp khớp lệnh bán với lệnh mua hiện tại
            WHILE @@FETCH_STATUS = 0 AND @KLConLai_M > 0 AND @KLConLaiDeKhop > 0
            BEGIN
                -- *** KIỂM TRA TỰ KHỚP ***
                IF @MaNDT_M = @MaNDT_B -- Nếu mã nhà đầu tư mua trùng với mã nhà đầu tư bán
                BEGIN
                    PRINT '[ATO ' + @MaCP + '] Phát hiện tự khớp. Bỏ qua khớp giữa Mua MaGD=' + CAST(@MaGD_M AS VARCHAR) + ' và Bán MaGD=' + CAST(@MaGD_B AS VARCHAR);
                    FETCH NEXT FROM curSell INTO @MaGD_B, @LoaiLenh_B, @Gia_B, @KLConLai_B, @MaTK_B, @MaNDT_B; -- Lấy lệnh bán tiếp theo
                    CONTINUE; -- Bỏ qua phần còn lại của vòng lặp này
                END
                -- *** KẾT THÚC KIỂM TRA TỰ KHỚP ***

                -- Kiểm tra nếu lệnh bán này vẫn còn khối lượng trong bảng tạm
                SELECT @KLConLai_B = SoLuongConLai FROM #SellOrdersATO WHERE MaGD = @MaGD_B;

                IF @KLConLai_B > 0 -- Chỉ khớp nếu lệnh bán vẫn còn khối lượng
                BEGIN
                    -- Tính khối lượng khớp trong lần này
                    SET @KLKhopLanNay = IIF(@KLConLai_M < @KLConLai_B, @KLConLai_M, @KLConLai_B);
                    SET @KLKhopLanNay = IIF(@KLKhopLanNay > @KLConLaiDeKhop, @KLConLaiDeKhop, @KLKhopLanNay);

                    IF @KLKhopLanNay > 0
                    BEGIN
                        PRINT '[ATO ' + @MaCP + '] Khớp: Mua(' + @LoaiLenh_M + ' ' + CAST(@MaGD_M AS VARCHAR) + ')[' + CAST(@KLKhopLanNay AS VARCHAR) + '] vs Bán(' + @LoaiLenh_B + ' ' + CAST(@MaGD_B AS VARCHAR) + ') @ ' + CAST(@GiaATO AS VARCHAR);
                        -- Thêm vào bảng LENHKHOP
                        INSERT INTO dbo.LENHKHOP (MaGD, NgayGioKhop, SoLuongKhop, GiaKhop, KieuKhop) 
                        VALUES (@MaGD_M, @MatchTime, @KLKhopLanNay, @GiaATO, N'Khớp ATO'), 
                               (@MaGD_B, @MatchTime, @KLKhopLanNay, @GiaATO, N'Khớp ATO');

                        -- Cập nhật bảng SOHUU
                        MERGE dbo.SOHUU AS T 
                        USING (SELECT @MaNDT_M AS MaNDT, @MaCP AS MaCP) AS S 
                        ON T.MaNDT = S.MaNDT AND T.MaCP = S.MaCP 
                        WHEN MATCHED THEN UPDATE SET SoLuong = T.SoLuong + @KLKhopLanNay 
                        WHEN NOT MATCHED THEN INSERT (MaNDT, MaCP, SoLuong) VALUES (S.MaNDT, S.MaCP, @KLKhopLanNay);

                        UPDATE dbo.SOHUU 
                        SET SoLuong = SoLuong - @KLKhopLanNay 
                        WHERE MaNDT = @MaNDT_B AND MaCP = @MaCP; -- Giảm số lượng của người bán
                        
                        -- Cập nhật tài khoản ngân hàng (Cộng tiền cho người bán, hoàn tiền cho người mua nếu là lệnh LO và có chênh lệch giá)
                        UPDATE dbo.TAIKHOAN_NGANHANG SET SoTien = SoTien + (@KLKhopLanNay * @GiaATO) WHERE MaTK = @MaTK_B;
                        IF @LoaiLenh_M = 'LO' AND @Gia_M > @GiaATO 
                        BEGIN 
                            UPDATE dbo.TAIKHOAN_NGANHANG SET SoTien = SoTien + (@KLKhopLanNay * (@Gia_M - @GiaATO)) WHERE MaTK = @MaTK_M; 
                        END

                        -- Cập nhật số lượng còn lại trong các bảng tạm
                        SET @KLConLai_M = @KLConLai_M - @KLKhopLanNay;
                        UPDATE #SellOrdersATO SET SoLuongConLai = SoLuongConLai - @KLKhopLanNay WHERE MaGD = @MaGD_B;
                        SET @KLConLaiDeKhop = @KLConLaiDeKhop - @KLKhopLanNay;

                        -- Ghi lại khối lượng đã khớp
                        MERGE @KhopTrongPhien AS T 
                        USING (SELECT @MaGD_M AS MaGD UNION ALL SELECT @MaGD_B) AS S 
                        ON T.MaGD = S.MaGD 
                        WHEN MATCHED THEN UPDATE SET KLDaKhop = T.KLDaKhop + @KLKhopLanNay 
                        WHEN NOT MATCHED THEN INSERT (MaGD, KLDaKhop) VALUES (S.MaGD, @KLKhopLanNay);PRINT 'Stored Procedure sp_ExecuteATOMatching completed.';
                    END
                END

                FETCH NEXT FROM curSell INTO @MaGD_B, @LoaiLenh_B, @Gia_B, @KLConLai_B, @MaTK_B, @MaNDT_B; -- Lấy lệnh bán tiếp theo để khớp
            END
            CLOSE curSell; -- Đóng con trỏ bán
            -- DEALLOCATE curSell; -- Giải phóng con trỏ bán (sau khi kết thúc vòng lặp ngoài)

            -- Cập nhật số lượng còn lại cho lệnh mua hiện tại trong bảng tạm
            UPDATE #BuyOrdersATO SET SoLuongConLai = @KLConLai_M WHERE MaGD = @MaGD_M;
            FETCH NEXT FROM curBuy INTO @MaGD_M, @LoaiLenh_M, @Gia_M, @KLConLai_M, @MaTK_M, @MaNDT_M; -- Lấy lệnh mua tiếp theo để khớp
        END
        CLOSE curBuy; -- Đóng con trỏ mua
        DEALLOCATE curBuy; -- Giải phóng con trỏ mua
        IF CURSOR_STATUS('local', 'curSell') >= -1 DEALLOCATE curSell; -- Dọn dẹp con trỏ bán nếu còn tồn tại

        PRINT '[ATO ' + @MaCP + '] Hoàn thành vòng lặp khớp lệnh. Tổng khớp trong SP: ' + CAST((@MaxKLKhop - @KLConLaiDeKhop) AS VARCHAR);
        SET @TongKLKhopATO = @MaxKLKhop - @KLConLaiDeKhop; -- Cập nhật tham số đầu ra

        -- === Cập nhật cuối cùng ===
        -- Cập nhật trạng thái của các lệnh trong bảng LENHDAT dựa trên kết quả khớp
        UPDATE ld
        SET ld.TrangThai = CASE
                              WHEN ISNULL(ktp.KLDaKhop, 0) >= ld.SoLuong THEN N'Hết' -- Nếu tổng khớp >= khối lượng ban đầu
                              WHEN ktp.KLDaKhop > 0 THEN N'Một phần' -- Nếu khớp một phần
                              ELSE ld.TrangThai -- Giữ nguyên trạng thái "Chờ" nếu không khớp
                          END
        FROM dbo.LENHDAT ld 
        JOIN @LệnhChoATO lca ON ld.MaGD = lca.MaGD
        LEFT JOIN @KhopTrongPhien ktp ON ld.MaGD = ktp.MaGD
        WHERE CAST(ld.NgayGD AS DATE) = @NgayGiaoDich; -- Chỉ cập nhật các lệnh trong phiên giao dịch này

        -- Hủy các lệnh ATO không khớp
        UPDATE dbo.LENHDAT
        SET TrangThai = N'Hủy'
        WHERE MaGD IN (SELECT MaGD FROM @LệnhChoATO WHERE LoaiLenh = 'ATO') -- Lấy các lệnh ATO ban đầu
          AND MaGD NOT IN (SELECT MaGD FROM @KhopTrongPhien WHERE KLDaKhop > 0) -- Không khớp lệnh nào
          AND CAST(NgayGD AS DATE) = @NgayGiaoDich;

        -- Cập nhật bảng LICHSUGIA (Giá mở cửa, cao nhất, thấp nhất, đóng cửa)
        MERGE LICHSUGIA AS target
        USING (SELECT @MaCP AS MaCP, @NgayGiaoDich AS Ngay) AS source
        ON (target.MaCP = source.MaCP AND target.Ngay = source.Ngay)
        WHEN MATCHED THEN
            UPDATE SET GiaMoCua = @GiaATO, GiaCaoNhat = @GiaATO, GiaThapNhat = @GiaATO, GiaDongCua = @GiaATO -- Thiết lập giá OHLC ban đầu bằng giá ATO
        WHEN NOT MATCHED BY TARGET THEN -- Trường hợp không tồn tại, thêm mới
            INSERT (MaCP, Ngay, GiaTC, GiaTran, GiaSan, GiaMoCua, GiaCaoNhat, GiaThapNhat, GiaDongCua)
            VALUES (@MaCP, @NgayGiaoDich, @GiaTC, @GiaTran, @GiaSan, @GiaATO, @GiaATO, @GiaATO, @GiaATO);

        COMMIT TRANSACTION; -- Cam kết giao dịch
        PRINT '[ATO ' + @MaCP + '] Giao dịch khớp lệnh đã được cam kết.';

        -- Dọn dẹp các bảng tạm
        DROP TABLE IF EXISTS #BuyOrdersATO;
        DROP TABLE IF EXISTS #SellOrdersATO;

    END
    ELSE -- Không có khớp ATO
    BEGIN
        SET @GiaMoCua = NULL; SET @TongKLKhopATO = 0;
        PRINT '[ATO ' + @MaCP + '] Không tìm thấy khớp lệnh.';
        -- Hủy các lệnh ATO của ngày hôm nay
        UPDATE dbo.LENHDAT SET TrangThai = N'Hủy'
        WHERE MaCP = @MaCP AND LoaiLenh = 'ATO' AND TrangThai IN (N'Chờ', N'Một phần')
          AND CAST(NgayGD AS DATE) = @NgayGiaoDich; -- Chỉ hủy các lệnh ATO của ngày này
    END


END;
GO

PRINT 'Stored Procedure sp_ExecuteATOMatching đã được tạo/cập nhật.';
GO