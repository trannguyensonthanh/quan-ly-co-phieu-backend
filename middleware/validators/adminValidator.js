// middleware/validators/adminValidator.js
const { body, param, query } = require("express-validator");

const createLoginValidationRules = () => [
  body("targetUserId")
    .trim()
    .notEmpty()
    .withMessage("Mã người dùng (MaNV/MaNDT) không được trống.")
    .isLength({ min: 1, max: 20 })
    .withMessage("Mã người dùng không hợp lệ.")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Mã người dùng chỉ chứa chữ cái, số, gạch dưới."), // Quan trọng cho tên login/user SQL
  body("password")
    .notEmpty()
    .withMessage("Mật khẩu không được trống.")
    .isLength({ min: 6 })
    .withMessage("Mật khẩu phải có ít nhất 6 ký tự."),
  // Thêm các quy tắc phức tạp hơn nếu chính sách SQL Server yêu cầu
  // .matches(
  //   /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
  // )
  // .withMessage(
  //   "Password must contain uppercase, lowercase, number, special char, min 8 chars"
  // ),
  body("role")
    .isIn(["Nhanvien", "Nhà đầu tư"])
    .withMessage("Vai trò phải là 'Nhanvien' hoặc 'Nhà đầu tư'."), // Khớp tên Role trong DB
];

const deleteLoginValidationRules = () => [
  param("loginname")
    .trim()
    .notEmpty()
    .withMessage("Tên login cần xóa không được trống.")
    .isLength({ min: 1, max: 20 })
    .withMessage("Tên login không hợp lệ.")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Tên login không hợp lệ."),
];

// --- THÊM VALIDATOR MỚI CHO TẠO TÀI KHOẢN ---
const createAccountValidationRules = () => [
  // Validate trường định danh (MaNDT hoặc MaNV)
  body("username") // Frontend gửi lên field tên là 'username'
    .trim()
    .notEmpty()
    .withMessage("Mã định danh (MaNV/MaNDT) không được trống.")
    .isLength({ min: 3, max: 20 })
    .withMessage("Mã định danh phải từ 3-20 ký tự.")
    .matches(/^[a-zA-Z0-9]+$/)
    .withMessage("Mã định danh chỉ chứa chữ cái và số."),
  body("HoTen")
    .trim()
    .notEmpty()
    .withMessage("Họ tên không được trống.")
    .isLength({ max: 50 })
    .withMessage("Họ tên tối đa 50 ký tự."),
  body("password")
    .notEmpty()
    .withMessage("Mật khẩu không được trống.")
    .isLength({ min: 6 })
    .withMessage("Mật khẩu phải có ít nhất 6 ký tự."),
  // Thêm luật phức tạp nếu muốn (khác với policy SQL Server trước đây nếu cần)
  // .matches(/^(?=.*[A-Z])(?=.*\d).{6,}$/)
  // .withMessage("Mật khẩu cần ít nhất 1 chữ hoa, 1 số."),
  body("Email")
    .optional({ checkFalsy: true }) // Cho phép trống hoặc null
    .isEmail()
    .withMessage("Email không hợp lệ.")
    .isLength({ max: 50 })
    .withMessage("Email tối đa 50 ký tự.")
    .normalizeEmail(), // Chuẩn hóa email

  body("NgaySinh")
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage("Ngày sinh không hợp lệ (YYYY-MM-DD).")
    .toDate(), // Chuyển thành đối tượng Date

  body("DiaChi")
    .trim()
    .notEmpty()
    .withMessage("Địa chỉ không được trống.")
    .isLength({ max: 100 })
    .withMessage("Địa chỉ tối đa 100 ký tự."),

  body("Phone")
    .trim()
    .notEmpty()
    .withMessage("Số điện thoại không được trống.")
    .isLength({ min: 9, max: 15 })
    .withMessage("Số điện thoại phải từ 9-15 ký tự.")
    .matches(/^[0-9+()-\s]+$/)
    .withMessage("Số điện thoại không hợp lệ."), // Cho phép số, +, (), -, khoảng trắng

  body("CMND")
    .trim()
    .notEmpty()
    .withMessage("CMND/CCCD không được trống.")
    .isLength({ min: 9, max: 10 })
    .withMessage("CMND/CCCD phải từ 9-10 ký tự.")
    .matches(/^[0-9]+$/)
    .withMessage("CMND chỉ được chứa số."),

  body("GioiTinh")
    .isIn(["Nam", "Nữ"])
    .withMessage("Giới tính phải là 'Nam' hoặc 'Nữ'."),

  body("role")
    .isIn(["NhaDauTu", "NhanVien"]) // Khớp với giá trị backend kiểm tra
    .withMessage("Vai trò phải là 'NhaDauTu' hoặc 'NhanVien'."),
];

// --- THÊM VALIDATOR MỚI CHO UPDATE TÀI KHOẢN ---
const updateAccountValidationRules = () => [
  // Validate accountId từ URL param
  param("accountId")
    .trim()
    .notEmpty()
    .withMessage(
      "Mã định danh tài khoản (MaNV/MaNDT) trong URL không được trống."
    )
    .isLength({ min: 3, max: 20 })
    .withMessage("Mã định danh tài khoản trong URL phải từ 3-20 ký tự."),
  // Thêm regex nếu cần

  // Validate role trong body (bắt buộc)
  body("role")
    .isIn(["NhaDauTu", "NhanVien"])
    .withMessage(
      "Vai trò ('role') phải là 'NhaDauTu' hoặc 'NhanVien' và là bắt buộc."
    ),

  // Validate các trường thông tin khác trong body (đều là optional khi update)
  body("HoTen")
    .optional() // Cho phép không có hoặc có giá trị
    .trim()
    .notEmpty()
    .withMessage("Họ tên không được để trống (nếu có cập nhật).") // Chỉ báo lỗi nếu gửi lên mà trống
    .isLength({ max: 50 })
    .withMessage("Họ tên tối đa 50 ký tự."),

  body("Email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Email không hợp lệ.")
    .isLength({ max: 50 })
    .withMessage("Email tối đa 50 ký tự.")
    .normalizeEmail(),

  body("NgaySinh")
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage("Ngày sinh không hợp lệ (YYYY-MM-DD).")
    .toDate(),

  body("DiaChi")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Địa chỉ không được để trống (nếu có cập nhật).")
    .isLength({ max: 100 })
    .withMessage("Địa chỉ tối đa 100 ký tự."),

  body("Phone")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Số điện thoại không được để trống (nếu có cập nhật).")
    .isLength({ min: 9, max: 15 })
    .withMessage("Số điện thoại phải từ 9-15 ký tự.")
    .matches(/^[0-9+()-\s]+$/)
    .withMessage("Số điện thoại không hợp lệ."),

  body("CMND")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("CMND/CCCD không được để trống (nếu có cập nhật).")
    .isLength({ min: 9, max: 12 })
    .withMessage("CMND/CCCD phải từ 9-12 ký tự.")
    .matches(/^[0-9]+$/)
    .withMessage("CMND/CCCD chỉ được chứa số."),

  body("GioiTinh")
    .optional()
    .isIn(["Nam", "Nữ"])
    .withMessage("Giới tính phải là 'Nam' hoặc 'Nữ'."),

  // Ngăn chặn việc gửi các trường không mong muốn trong body (ví dụ)
  // body('password').not().exists().withMessage('Không được cập nhật mật khẩu qua API này.'),
  // body('Status').not().exists().withMessage('Không được cập nhật Status qua API này.'),
];

// --- THÊM VALIDATOR MỚI CHO DELETE TÀI KHOẢN ---
const deleteAccountValidationRules = () => [
  // Validate accountId từ URL param
  param("accountId")
    .trim()
    .notEmpty()
    .withMessage(
      "Mã định danh tài khoản (MaNV/MaNDT) trong URL không được trống."
    )
    .isLength({ min: 3, max: 20 })
    .withMessage("Mã định danh tài khoản trong URL phải từ 3-20 ký tự."),
  // Thêm regex nếu cần

  // Validate role từ Query String
  query("role") // <<< Sử dụng query() thay vì body()
    .trim() // Trim để loại bỏ khoảng trắng thừa
    .notEmpty()
    .withMessage("Tham số 'role' trong query string là bắt buộc.") // Đảm bảo có gửi lên
    .isIn(["NhaDauTu", "NhanVien"]) // <<< Kiểm tra giá trị hợp lệ
    .withMessage(
      "Giá trị 'role' trong query string phải là 'NhaDauTu' hoặc 'NhanVien'."
    ),
];

// --- THÊM VALIDATOR CHO ADMIN RESET PASSWORD ---
const adminResetPasswordValidationRules = () => [
  // Validate accountId từ URL param
  param("accountId")
    .trim()
    .notEmpty()
    .withMessage("Mã định danh tài khoản trong URL không được trống.")
    .isLength({ min: 3, max: 20 })
    .withMessage("Mã định danh tài khoản trong URL phải từ 3-20 ký tự."),

  // Validate role trong body (bắt buộc)
  body("role")
    .isIn(["NhaDauTu", "NhanVien"]) // <<< Dùng chuẩn NhanVien
    .withMessage(
      "Vai trò ('role') phải là 'NhaDauTu' hoặc 'NhanVien' và là bắt buộc."
    ),

  // Validate mật khẩu mới
  body("newPassword")
    .notEmpty()
    .withMessage("Mật khẩu mới không được trống.")
    .isLength({ min: 6 })
    .withMessage("Mật khẩu mới phải có ít nhất 6 ký tự."),
  // Thêm luật phức tạp nếu muốn

  // Validate xác nhận mật khẩu
  body("confirmPassword")
    .notEmpty()
    .withMessage("Xác nhận mật khẩu mới không được trống.")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Xác nhận mật khẩu mới không khớp.");
      }
      return true; // Phải return true nếu thành công
    }),
];

module.exports = {
  createLoginValidationRules,
  deleteLoginValidationRules,
  createAccountValidationRules,
  updateAccountValidationRules,
  deleteAccountValidationRules,
  adminResetPasswordValidationRules,
};
