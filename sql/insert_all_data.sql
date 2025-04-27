-- =============================================
-- Script to Insert Consolidated Sample Data (Around 8 Stocks)
-- Database Name: QUAN_LY_GIAO_DICH_CO_PHIEU
-- =============================================

USE [QUAN_LY_GIAO_DICH_CO_PHIEU];
GO

-- =============================================
-- Optional: Clear Existing Data (BE CAREFUL!)
-- Uncomment the section below if you want to start fresh.
-- =============================================
/*
PRINT 'Clearing existing data...';
-- Delete in reverse order of foreign key dependencies
DELETE FROM dbo.LENHKHOP;
DELETE FROM dbo.LENHDAT;
DELETE FROM dbo.SOHUU;
DELETE FROM dbo.LICHSUGIA;
DELETE FROM dbo.TAIKHOAN_NGANHANG;
DELETE FROM dbo.COPHIEU;
DELETE FROM dbo.NGANHANG;
DELETE FROM dbo.NDT;
DELETE FROM dbo.NhanVien;
-- Reset identity counters if needed (use with caution)
-- DBCC CHECKIDENT ('dbo.LENHKHOP', RESEED, 0);
-- DBCC CHECKIDENT ('dbo.LENHDAT', RESEED, 0);
PRINT 'Existing data cleared.';
GO
*/

-- =============================================
-- Insert Sample Data
-- =============================================

-- 1. Bảng NGANHANG
PRINT 'Inserting into NGANHANG...';
INSERT INTO dbo.NGANHANG (MaNH, TenNH, DiaChi, Phone, Email) VALUES
(N'VCB', N'Vietcombank', N'198 Trần Quang Khải, Hoàn Kiếm, Hà Nội', N'1900545413', N'webmaster@vietcombank.com.vn'),
(N'TCB', N'Techcombank', N'191 Bà Triệu, Hai Bà Trưng, Hà Nội', N'1800588822', N'call_center@techcombank.com.vn'),
(N'ACB', N'Ngân hàng Á Châu', N'442 Nguyễn Thị Minh Khai, Q.3, TP.HCM', N'1900545486', N'acb@acb.com.vn');
GO

-- 2. Bảng COPHIEU (Around 8 stocks)
PRINT 'Inserting into COPHIEU...';
INSERT INTO dbo.COPHIEU (MaCP, TenCty, DiaChi, SoLuongPH, Status) VALUES
(N'FPT', N'Công ty Cổ phần FPT', N'Số 10 Phố Phạm Văn Bạch, Dịch Vọng, Cầu Giấy, Hà Nội', 120000000, 0),
(N'VIC', N'Tập đoàn Vingroup - Công ty CP', N'Số 7 Đường Bằng Lăng 1, KĐT Vinhomes Riverside, Long Biên, Hà Nội', 380000000, 0),
(N'MSN', N'Công ty Cổ phần Tập đoàn MaSan', N'Tầng 8, Central Plaza, 17 Lê Duẩn, P.Bến Nghé, Q.1, TP.HCM', 118000000, 0),
(N'VNM', N'Công ty Cổ phần Sữa Việt Nam', N'Số 10 Tân Trào, P.Tân Phú, Q.7, TP.HCM', 174100000, 0),
(N'HPG', N'Công ty Cổ phần Tập đoàn Hòa Phát', N'KCN Phố Nối A, xã Giai Phạm, huyện Yên Mỹ, Hưng Yên', 581000000, 0),
(N'TCB', N'Ngân hàng TMCP Kỹ Thương Việt Nam', N'191 Bà Triệu, Hai Bà Trưng, Hà Nội', 351000000, 0),
(N'MWG', N'Công ty Cổ phần Đầu tư Thế giới di động', N'Lô T2-1.2, Đường D1, KCN Cao, P.Tân Phú, Q.9, TP.HCM', 146000000, 0),
(N'VJC', N'Công ty Cổ phần Hàng không Vietjet', N'Sân bay Quốc tế Nội Bài, Phú Minh, Sóc Sơn, Hà Nội', 541000000, 0);
GO


-- -- 3. Bảng NDT (Nhà đầu tư)
-- PRINT 'Inserting into NDT...';
-- -- Mật khẩu ví dụ: 'PasswordNDT123!'
-- -- Hash bcrypt (salt=8): $2a$08$Yw7gX4.Vb./0wJpvl3s2e.iY1n/d8oVfL9/vK1i.jFvP7.w/b3GHS
-- INSERT INTO dbo.NDT (MaNDT, HoTen, NgaySinh, MKGD, DiaChi, Phone, CMND, GioiTinh, Email) VALUES
-- (N'NDT001', N'Nguyễn Văn An', '1990-05-15', N'$2a$08$Yw7gX4.Vb./0wJpvl3s2e.iY1n/d8oVfL9/vK1i.jFvP7.w/b3GHS', N'123 Đường ABC, Quận 1, TP.HCM', N'0901234567', N'123456789', N'Nam', N'an.nguyen@email.com'),
-- (N'NDT002', N'Trần Thị Bình', '1985-11-20', N'$2a$08$Yw7gX4.Vb./0wJpvl3s2e.iY1n/d8oVfL9/vK1i.jFvP7.w/b3GHS', N'456 Đường XYZ, Quận Hai Bà Trưng, Hà Nội', N'0918765432', N'987654321', N'Nữ', N'binh.tran@email.com');
-- GO

-- 4. Bảng NhanVien
PRINT 'Inserting into NhanVien...';
-- Mật khẩu ví dụ: 'PasswordNV123!'
-- Hash bcrypt (salt=8): $2a$08$q4/iN.s6.qVwL8H.jWqXJ.o5dFm4yPzXU5oF2k7zI3eG4mX.sR5/q
INSERT INTO dbo.NhanVien (MaNV, HoTen, NgaySinh, PasswordHash, DiaChi, Phone, CMND, GioiTinh, Email) VALUES
(N'NV001', N'Lê Văn Cường', '1988-02-10', N'$2a$08$yUqZCAaqv/t9J7br2Bfluu6UMH4adUmyRi7SlCZbI9rzzc.S7eHUy', N'789 Đường DEF, Quận 3, TP.HCM', N'0987111222', N'111222333', N'Nam', N'cuong.le@ctychungkhoan.com'),
(N'NV002', N'Phạm Thị Dung', '1992-09-25', N'$2a$08$yUqZCAaqv/t9J7br2Bfluu6UMH4adUmyRi7SlCZbI9rzzc.S7eHUy', N'101 Đường GHK, Quận Đống Đa, Hà Nội', N'0976333444', N'444555666', N'Nữ', N'dung.pham@ctychungkhoan.com');
GO

-- -- 5. Bảng TAIKHOAN_NGANHANG
-- PRINT 'Inserting into TAIKHOAN_NGANHANG...';
-- INSERT INTO dbo.TAIKHOAN_NGANHANG (MaTK, MaNDT, SoTien, MaNH) VALUES
-- (N'TKVCB001AN', N'NDT001', 500000000, N'VCB'),
-- (N'TKTCB001AN', N'NDT001', 200000000, N'TCB'),
-- (N'TKACB002BINH', N'NDT002', 1000000000, N'ACB');
-- GO

-- -- 6. Bảng SOHUU
-- PRINT 'Inserting into SOHUU...';
-- INSERT INTO dbo.SOHUU (MaNDT, MaCP, SoLuong) VALUES
-- (N'NDT001', N'FPT', 5000),
-- (N'NDT001', N'VIC', 2000),
-- (N'NDT002', N'VNM', 10000),
-- (N'NDT002', N'HPG', 8000); -- Bình sở hữu HPG
-- GO

-- -- 7. Bảng LICHSUGIA (Cho các mã CP đã chọn, 2 ngày gần nhất)
-- PRINT 'Inserting into LICHSUGIA...';
-- DECLARE @NgayHomNay DATE = GETDATE();
-- DECLARE @NgayHomQua DATE = DATEADD(day, -1, @NgayHomNay);

-- -- Giá FPT
-- INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC) VALUES
-- (N'FPT', @NgayHomQua, 115000, 101000, 108000),
-- (N'FPT', @NgayHomNay, 118000, 104000, 111000);

-- -- Giá VIC
-- INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC) VALUES
-- (N'VIC', @NgayHomQua, 45000, 39800, 42400),
-- (N'VIC', @NgayHomNay, 44500, 39300, 41900);

-- -- Giá MSN
-- INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC) VALUES
-- (N'MSN', @NgayHomQua, 82000, 72200, 77100),
-- (N'MSN', @NgayHomNay, 83500, 73500, 78500);

-- -- Giá VNM
-- INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC) VALUES
-- (N'VNM', @NgayHomQua, 68000, 60000, 64000),
-- (N'VNM', @NgayHomNay, 68000, 60000, 64000);

-- -- Giá HPG
-- INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC) VALUES
-- (N'HPG', @NgayHomQua, 28000, 24700, 26300),
-- (N'HPG', @NgayHomNay, 28500, 25100, 26800);

-- -- Giá TCB
-- INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC) VALUES
-- (N'TCB', @NgayHomQua, 38000, 33600, 35800),
-- (N'TCB', @NgayHomNay, 38500, 34000, 36200);

-- -- Giá MWG
-- INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC) VALUES
-- (N'MWG', @NgayHomQua, 43000, 38000, 40500),
-- (N'MWG', @NgayHomNay, 42000, 37000, 39500);

-- -- Giá VJC
-- INSERT INTO dbo.LICHSUGIA (MaCP, Ngay, GiaTran, GiaSan, GiaTC) VALUES
-- (N'VJC', @NgayHomQua, 105000, 92600, 98800),
-- (N'VJC', @NgayHomNay, 107000, 94400, 100700);
-- GO

-- 8. Bảng LENHDAT và LENHKHOP (Để trống ban đầu)
PRINT 'Tables LENHDAT and LENHKHOP are initially empty.';
GO

PRINT 'Consolidated sample data insertion finished.';
GO