/quan-ly-co-phieu-backend
|
|-- config/ # Chứa các file cấu hình
| |-- db.config.js # Cấu hình kết nối SQL Server (user, pass, server, db name)
| |-- server.config.js # Cấu hình server (port, ...)
| |-- auth.config.js # Cấu hình liên quan đến xác thực (JWT secret key, ...)
| |-- index.js # (Tùy chọn) Export tập trung các config
|
|-- controllers/ # Logic xử lý request, gọi services và trả về response
| |-- auth.controller.js # Xử lý login, đổi mật khẩu
| |-- nhanvien.controller.js # Xử lý các chức năng của Nhân viên (cập nhật CP, NĐT, tạo user, backup/restore)
| |-- nhadautu.controller.js # Xử lý các chức năng của Nhà đầu tư (đặt lệnh, tra cứu, xem sao kê)
| |-- cophieu.controller.js # Xử lý liên quan đến Cổ phiếu (lấy thông tin, bảng giá)
| |-- lenhdat.controller.js # Xử lý liên quan đến Lệnh đặt
| |-- lenhkhop.controller.js # Xử lý liên quan đến Lệnh khớp
| |-- taikhoan.controller.js # Xử lý liên quan đến Tài khoản NH, sao kê tiền
| |-- admin.controller.js # Có thể tách riêng các chức năng quản trị (tạo login, backup/restore) ra đây
|
|-- models/ # Lớp truy cập dữ liệu, tương tác với DB
| |-- db.js # Khởi tạo và quản lý connection pool đến SQL Server
| |-- NhaDauTu.model.js
| |-- NhanVien.model.js
| |-- TaiKhoanNganHang.model.js
| |-- NganHang.model.js
| |-- CoPhieu.model.js
| |-- LenhDat.model.js
| |-- LenhKhop.model.js
| |-- SoHuu.model.js
| |-- LichSuGia.model.js
| |-- UserLogin.model.js # Có thể cần model riêng cho việc quản lý login/roles
| |-- BackupRestore.model.js # Model để thực thi các lệnh backup/restore
|
|-- middleware/ # Các hàm xử lý trung gian (authentication, authorization, validation, logging)
| |-- authJwt.js # Middleware kiểm tra JWT token, xác thực người dùng
| |-- verifyRole.js # Middleware kiểm tra quyền (Nhanvien, NhaDauTu)
| |-- validateRequest.js # Middleware kiểm tra dữ liệu đầu vào (sử dụng thư viện như Joi hoặc express-validator)
| |-- errorHandler.js # Middleware xử lý lỗi tập trung
| |-- logger.js # Middleware ghi log request (tùy chọn)
|
|-- routes/ # Định nghĩa các API endpoints
| |-- index.js # File tổng hợp các routes
| |-- auth.routes.js
| |-- nhanvien.routes.js
| |-- nhadautu.routes.js
| |-- cophieu.routes.js
| |-- lenh.routes.js # Có thể gộp Lệnh Đặt và Lệnh Khớp vào đây
| |-- taikhoan.routes.js
| |-- admin.routes.js # Routes cho chức năng quản trị
|
|-- services/ # Chứa business logic phức tạp, tái sử dụng (tách biệt khỏi controller)
| |-- auth.service.js # Logic đăng nhập, tạo token, đổi mật khẩu
| |-- trading.service.js # Logic đặt lệnh, kiểm tra điều kiện, (có thể cả khớp lệnh nếu logic phức tạp)
| |-- statement.service.js # Logic tạo các loại sao kê
| |-- user.service.js # Logic tạo/xóa login, quản lý người dùng
| |-- backup.service.js # Logic thực hiện backup, restore
| |-- stock.service.js # Logic nghiệp vụ liên quan cổ phiếu (vd: tính toán cho bảng giá)
|
|-- utils/ # Các hàm tiện ích dùng chung
| |-- passwordHasher.js # Hàm băm và so sánh mật khẩu
| |-- dateTimeFormatter.js # Hàm định dạng ngày giờ
| |-- constants.js # Chứa các hằng số (vd: tên role, loại lệnh, trạng thái)
| |-- sqlHelper.js # (Tùy chọn) Hàm hỗ trợ tạo câu lệnh SQL động an toàn
|
|-- sql/ # (Tùy chọn) Chứa các file script SQL phức tạp hoặc stored procedures
| |-- stored_procedures/
| |-- complex_queries/
|
|-- tests/ # Chứa các file unit test, integration test
|
|-- .env # File chứa biến môi trường (DB credentials, JWT secret, PORT, ...) - **KHÔNG commit lên Git**
|-- .gitignore # Chỉ định các file/folder bỏ qua khi commit (node_modules, .env, logs, ...)
|-- package.json # Thông tin dự án và các dependencies
|-- package-lock.json # Lock phiên bản của các dependencies
|-- server.js # Điểm khởi chạy ứng dụng (tạo server, lắng nghe port)
|-- app.js # Khởi tạo và cấu hình Express app (middleware, routes) - tách ra để dễ test
|-- README.md # Mô tả dự án, hướng dẫn cài đặt, sử dụng

ở StockService.delistStock trong stock.device => đang hạn chế thời gian hoạt động từ 9 -> 15h cho việc ngừng hoạt động cổ phiếu
ở AdminService.prepareNextDayPrices trong admin.service => đang hạn chế thời thứ 2 -> 6 nhma hiện tại hủy cái đó r
ở trong server.js có AUTO_PROCESS_INTERVAL ngay dòng 59 trong đó xử lý thời gian nên cần thời gian sẽ phải thay đổi nhá

ÑEÀ TAØI MOÂN HEÄ QUAÛN TRÒ CÔ SÔÛ DÖÕ LIEÄU
Ñeà 5. QUẢN LÝ CÁC GIAO DỊCH CỔ PHIẾU SÀN HÀ NỘI TRÊN THỊ TRƯỜNG CHỨNG KHOÁN  
I.CƠ SỞ DỮ LIỆU:

1. Bảng Nhà đầu tư
   NDT(MaNDT, HoTen, NgaySinh, MKGD, DiaChi, Phone, CMND, GioiTinh, Email)
   STT Thuộc tính Kiểu dữ liệu Độ dài Ràng buộc Ghi chú
   1 MaNDT Nchar 20 Khóa chính Mã Nhà đầu tư
   2 HoTen Nvarchar 50 Not Null Họ tên
   3 NgaySinh Date Ngày Sinh
   4 MKGD Nvarchar 50 Not Null Mật khẩu giao dịch
   5 DiaChi Nvarchar 100 Not Null Địa chỉ
   6 Phone Nvarchar 15 Not Null Số điện thoại
   7 CMND Nchar 10 Not Null, Unique Chứng minh nhân dân
   8 GioiTinh Nchar 5 Nam hoặc Nữ Giới Tính
   9 Email Nvarchar 50 Thư điện tử
   Baûng Nhanvien coù caáu truùc töông töï nhö Nhaø ñaàu tö, boû ñi field MKGD (thay vao do se la passwordHash
2. Bảng Tài khoản ngân hàng của nhà đầu tư
   TAIKHOAN_NGANHANG(MaTK, MaNDT, SoTien, MaNH)
   STT Thuộc tính Kiểu dữ liệu Độ dài Ràng buộc Ghi chú
   1 MaTK Nchar 20 Khóa chính Mã tài khoản
   2 MaNDT Nchar 20 Khóa ngoại Mã nhà đầu tư
   3 SoTien Float >=0 Số dư tiền
   4 MaNH Nchar 20 Khóa ngoại Mã ngân hàng

3.Bảng Danh sách ngân hàng
NGANHANG(MaNH, TenNH, DiaChi, Phone, Email)
STT Thuộc tính Kiểu dữ liệu Độ dài Ràng buộc Ghi chú
1 MaNH Nchar 20 Khóa chính Mã ngân hàng
2 TenNH Nvarchar 50 Not Null, Unique Tên ngân hàng
3 DiaChi Nvarchar 100 Địa chỉ
4 Phone Nchar 10 Điện thoại
5 Email Nvarchar 50 Thư điện tử

4. Bảng Thông tin cổ phiếu :
   COPHIEU (MACP, TenCTy, DiaChi, SoLuongPH)
   STT Thuộc tính Kiểu dữ liệu Độ dài Ràng buộc Ghi chú
   1 MaCP Nchar 10 Khóa chính Mã cổ phiếu
   2 TenCty Nvarchar 50 Not Null, Unique Tên công ty
   3 Diachi Nvarchar 100 Not Null Diachi
   4 SoLuongPH Int >0 Số lượng cổ phiếu phát hành
   5 Status TinyInt Not Null Trạng thái cổ phiếu: chưa niêm yết (0), đang giao dịch (1), ngừng giao dịch (2)

5. Bảng Lệnh Đặt
   LENHDAT (MaGD, NgayGD, LoaiLenh, PhuongThuc, SoLuong, MaCP, Gia, MaTK, TrangThai)
   STT Thuộc tính Kiểu dữ liệu Độ dài Ràng buộc Ghi chú
   1 MaGD Int Khóa chính, tự động tăng Mã giao dịch
   2 `NgayGD Datetime Default: GetDate() Ngày giờ giao dịch
   3 LoaiGD Char 1 M hoặc B Loại GD (M : lệnh mua, B: lệnh bán)
   4 LoaiLenh Nchar 5 LO: lệnh đặt theo phương thức khớp lệnh liên tục; ATO, ATC : lệnh đặt theo phương thức khớp lệnh mở cửa hoặc đóng cửa.
   5 SoLuong Int Số lượng cổ phiếu đặt
   6 MaCP Nchar 10 Mã Cổ phiếu đặt, khóa ngoại
   7 Gia Float Null Giá đặt
   8 MaTK Nchar 20 Mã tài khoản đặt lệnh
   9 TrangThai Nvarchar 20 Trạng thái của lệnh:

- Hủy: lệnh đã được hủy phần chưa khớp còn lại
- Chưa: lệnh chưa khớp
- Một phần : Lệnh mới khớp được 1 phần
- Hết : Lệnh dã khớp hết.
- Chờ : Lệnh đang chờ khớp.

6. Bảng Lệnh khớp
   LenhKhop(MaLK, MaGD, NgayGioKhop, SoLuongKhop, GiaKhop, KieuKhop)
   STT Thuộc tính Kiểu dữ liệu Độ dài Ràng buộc Ghi chú
   1 MaLK int Khóa chính, tự động tăng Mã lệnh khớp
   2 MaGD int Khóa ngoại Mã giao dịch
   3 NgayGioKhop Datetime Ngày giờ khớp
   4 SoLuongKhop Int Số lượng khớp
   5 GiaKhop float Giá khớp
   6 KieuKhop Nvarchar 50 Kiểu khớp: Khớp 1 phần, Khớp hết

7. Bảng Sở hữu : cho biết Nhà đầu tư đang sở hữu những cổ phiếu nào
   SOHUU (MaNDT,MaCP,SoLuong)
   STT Thuộc tính Kiểu dữ liệu Độ dài Ràng buộc Ghi chú
   1 MaNDT Nchar 20 Khóa chính Mã nhà đầu tư
   2 MaCP Nchar 10 Khóa chính Mã cổ phiếu
   3 SoLuong Int Số lượng sở hữu

8. Bảng Lịch sử giá
   LICHSUGIA(MaCP, Ngay, GiaTran,GiaSan,GiaTC)
   STT Thuộc tính Kiểu dữ liệu Độ dài Ràng buộc Ghi chú
   1 MaCP Nchar 10 Khóa chính Mã cổ phiếu
   2 Ngay Datetime Khóa chính Ngày
   3 GiaTran float Giá trần
   4 GiaSan float Giá sàn
   5 GiaTC float Giá tham chiếu
   6 GiaMoCua float Giá mở cửa
   7 GiaCaoNhat float Giá cao nhất
   8 GiaThapNhat float Giá thấp nhất
   9 GiaDongCua float Giá đóng cửa

9. COPHIEU_UndoLog
   STT Thuộc tính Kiểu dữ liệu Độ dài Ràng buộc Ghi chú
   1 UndoLogID PK not
   2 MaCP Nvarchar not
   3 ActionType varchar not
   4 Timestamp datetime not
   5 OldData Nvarchar max null
   6 PerformedBy nchar null

Khớp lệnh liên tục

- Hệ thống giao dịch thực hiện so khớp các lệnh mua và lệnh bán chứng khoán theo nguyên tắc thứ tự ưu tiên về giá và thời gian, cụ thể như sau:

* Ưu tiên về giá:
  Lệnh mua có mức giá cao hơn được ưu tiên thực hiện trước;
  Lệnh bán có mức giá thấp hơn được ưu tiên thực hiện trước
* Ưu tiên về thời gian:
   - Trường hợp lệnh mua và lệnh bán cùng thoả mãn nhau về giá thì mức giá khớp là mức giá của lệnh được nhập vào hệ thống trước.
  Lưu ý: - Các Table trên không cố định, sinh viên có thể thay đổi sao cho có thể giải quyết các vấn đề đặt ra.

Yêu cầu:
Tạo menu sao cho có thể thực hiện các mục sau
A. Cập nhật:

1. Cập nhật cổ phiếu: có các chức năng Thêm, Xóa, Ghi, Phục hồi, Reload , Tìm kiếm , Thoát (chỉ nhóm Nhanvien thực hiện)
2. Cập nhật nhà đầu tư, tài khoản ngân hàng của nhà đầu tư: trình bày form dưới dạng SubForm (chỉ nhóm Nhanvien thực hiện)
3. Tra cứu số dư tiền, cổ phiếu:

4. Sao kê giao dịch lệnh: trong 1 khoảng thời gian

Trang này dùng để thông báo cho NDT biết tất cả các giao dịch mà NDT đã thực hiện, bao gồm các lệnh khớp, chưa khớp, khớp một phần, giá mua, giá khớp, số lượng, mã giao dịch 5. Sao kê lệnh khớp: In ra tất cả lệnh khớp mà nhà đầu tư đã giao dịch thành công

6. Đặt lệnh MUA - BÁN
   a/ Đặt lệnh Mua

NĐT tiến hành đặt lệnh mua cổ phiếu. Đầu tiên ta phải cung cấp số tiền trong tài khoản được phép giao dịch cho nhà đầu tư biết, sau đó cho NDT chọn cổ phiếu và xem giá để biết được giá trần, giá sàn, giá tham chiếu trong ngày. Tiếp đó cho nhà đầu tư nhập số lượng, giá, và điền mật khẩu đặt lệnh.
Giá mua phải trong khoảng giá sàn đến giá trần, nếu không đúng thì yêu cầu NDT sửa lại giá, và phải có đủ tiền để đặt lệnh mua. Số lượng bán phải là bội số của 100; Giá phải là bội số của 100.
b/ Đặt lệnh Bán

Tương tự như lệnh mua, nhưng lệnh bán có một chút thay đổi là NĐT chỉ được phép bán những cổ phiếu mình sở hửu; Số lượng bán phải là bội số của 100, và số lượng bán phải nhỏ hơn số lượng đang sở hữu; Giá phải là bội số của 100... 7. Bảng Giá: theo dõi giá, tổng khối lượng đặt, tổng khối lượng khớp các cổ phiếu. Giá trần : màu tím, giá tăng: xanh lá cây; giá tham chiếu: vàng; giá giảm: đỏ; giá sàn: xanh biển;

B. Liệt kê - Thống kê

1. Sao kê danh sách các lệnh đặt của 1 mã cổ phiếu trong khoảng thời gian:  
   Ngày giờ, Loại GD , Loại lệnh, Số lượng, Giá đặt, số lượng khớp, giá khớp, ngày giờ khớp
2. Sao kê giao dịch tiền của nhà đầu tư trong khoảng thời gian:
   Ngày Số dư đầu kỳ Số tiền phát sinh Lý do Số dư cuối kỳ

C. Phân quyền : Chương trình có phân quyền cho 2 loại user :
Nhân viên: không được đặt lệnh
Nhà đầu tư: không được quyền tạo login và backup/restore cơ sở dữ liệu,  
Chương trình cho phép nhóm nhân viên tạo các login, password cho các nhân viên, và nhà đầu tư. Căn cứ vào quyền này, khi user login vào hệ thống, ta sẽ cho người đó được quyền thực thi các chức năng tương ứng.
1.Tạo Form cho phép ta tạo/xóa Login
Giả sử, trong server ta đã có 2 nhóm: Nhanvien , Nhà đầu tư

2. Backup và Restore Database: có các chức năng như trong hình dưới đây:

Chọn cơ sở dữ liệu cần thao tác trong danh sách bên trái;
Nút lệnh Tạo device sao lưu: Ta phải tạo device trước thì mới được Sao lưu và Phục hồi cơ sở dữ liệu. Chương trình sẽ tự động tạo device tên theo dạng sau: DEVICE_TENCSDL;
Nút lệnh Sao lưu : tạo 1 bản backup cơ sở dữ liệu ;
Phục hồi: có 2 dạng
Phục hồi cơ sở dữ liệu về bản backup mà ta đã sao lưu
Nếu ta chọn thêm checkbox Tham số phục hồi theo thời gian thì sẽ phục hồi cơ sở dữ liệu về thời điểm do ta nhập vào

3. Đổi mật mã: chỉ cho đổi mật mã với các nhân viên, nhà đầu tư đã được tạo tài khoản

Ghi chú: Sinh viên tự kiểm tra các ràng buộc có thể có khi viết chương trình.
