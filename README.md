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
