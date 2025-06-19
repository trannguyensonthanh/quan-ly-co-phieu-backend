/**
 * middleware/validators/adminValidator.js
 * Validation rules for admin-related operations (login, account CRUD, password reset)
 */

const { body, param, query } = require('express-validator');

/**
 * Validation rules for creating login
 */
const createLoginValidationRules = () => [
  body('targetUserId')
    .trim()
    .notEmpty()
    .withMessage('Mã người dùng (MaNV/MaNDT) không được trống.')
    .isLength({ min: 1, max: 20 })
    .withMessage('Mã người dùng không hợp lệ.')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Mã người dùng chỉ chứa chữ cái, số, gạch dưới.'),
  body('password')
    .notEmpty()
    .withMessage('Mật khẩu không được trống.')
    .isLength({ min: 6 })
    .withMessage('Mật khẩu phải có ít nhất 6 ký tự.'),
  body('role')
    .isIn(['Nhanvien', 'Nhà đầu tư'])
    .withMessage("Vai trò phải là 'Nhanvien' hoặc 'Nhà đầu tư'."),
];

/**
 * Validation rules for deleting login
 */
const deleteLoginValidationRules = () => [
  param('loginname')
    .trim()
    .notEmpty()
    .withMessage('Tên login cần xóa không được trống.')
    .isLength({ min: 1, max: 20 })
    .withMessage('Tên login không hợp lệ.')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Tên login không hợp lệ.'),
];

/**
 * Validation rules for creating account
 */
const createAccountValidationRules = () => [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Mã định danh (MaNV/MaNDT) không được trống.')
    .isLength({ min: 3, max: 20 })
    .withMessage('Mã định danh phải từ 3-20 ký tự.')
    .matches(/^[a-zA-Z0-9]+$/)
    .withMessage('Mã định danh chỉ chứa chữ cái và số.'),
  body('HoTen')
    .trim()
    .notEmpty()
    .withMessage('Họ tên không được trống.')
    .isLength({ max: 50 })
    .withMessage('Họ tên tối đa 50 ký tự.'),
  body('password')
    .notEmpty()
    .withMessage('Mật khẩu không được trống.')
    .isLength({ min: 6 })
    .withMessage('Mật khẩu phải có ít nhất 6 ký tự.'),
  body('Email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Email không hợp lệ.')
    .isLength({ max: 50 })
    .withMessage('Email tối đa 50 ký tự.')
    .normalizeEmail(),
  body('NgaySinh')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Ngày sinh không hợp lệ (YYYY-MM-DD).')
    .toDate(),
  body('DiaChi')
    .trim()
    .notEmpty()
    .withMessage('Địa chỉ không được trống.')
    .isLength({ max: 100 })
    .withMessage('Địa chỉ tối đa 100 ký tự.'),
  body('Phone')
    .trim()
    .notEmpty()
    .withMessage('Số điện thoại không được trống.')
    .isLength({ min: 9, max: 15 })
    .withMessage('Số điện thoại phải từ 9-15 ký tự.')
    .matches(/^[0-9+()-\s]+$/)
    .withMessage('Số điện thoại không hợp lệ.'),
  body('CMND')
    .trim()
    .notEmpty()
    .withMessage('CMND/CCCD không được trống.')
    .isLength({ min: 9, max: 10 })
    .withMessage('CMND/CCCD phải từ 9-10 ký tự.')
    .matches(/^[0-9]+$/)
    .withMessage('CMND chỉ được chứa số.'),
  body('GioiTinh')
    .isIn(['Nam', 'Nữ'])
    .withMessage("Giới tính phải là 'Nam' hoặc 'Nữ'."),
  body('role')
    .isIn(['NhaDauTu', 'NhanVien'])
    .withMessage("Vai trò phải là 'NhaDauTu' hoặc 'NhanVien'."),
];

/**
 * Validation rules for updating account
 */
const updateAccountValidationRules = () => [
  param('accountId')
    .trim()
    .notEmpty()
    .withMessage(
      'Mã định danh tài khoản (MaNV/MaNDT) trong URL không được trống.'
    )
    .isLength({ min: 3, max: 20 })
    .withMessage('Mã định danh tài khoản trong URL phải từ 3-20 ký tự.'),
  body('role')
    .isIn(['NhaDauTu', 'NhanVien'])
    .withMessage(
      "Vai trò ('role') phải là 'NhaDauTu' hoặc 'NhanVien' và là bắt buộc."
    ),
  body('HoTen')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Họ tên không được để trống (nếu có cập nhật).')
    .isLength({ max: 50 })
    .withMessage('Họ tên tối đa 50 ký tự.'),
  body('Email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Email không hợp lệ.')
    .isLength({ max: 50 })
    .withMessage('Email tối đa 50 ký tự.')
    .normalizeEmail(),
  body('NgaySinh')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Ngày sinh không hợp lệ (YYYY-MM-DD).')
    .toDate(),
  body('DiaChi')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Địa chỉ không được để trống (nếu có cập nhật).')
    .isLength({ max: 100 })
    .withMessage('Địa chỉ tối đa 100 ký tự.'),
  body('Phone')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Số điện thoại không được để trống (nếu có cập nhật).')
    .isLength({ min: 9, max: 15 })
    .withMessage('Số điện thoại phải từ 9-15 ký tự.')
    .matches(/^[0-9+()-\s]+$/)
    .withMessage('Số điện thoại không hợp lệ.'),
  body('CMND')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('CMND/CCCD không được để trống (nếu có cập nhật).')
    .isLength({ min: 9, max: 12 })
    .withMessage('CMND/CCCD phải từ 9-12 ký tự.')
    .matches(/^[0-9]+$/)
    .withMessage('CMND/CCCD chỉ được chứa số.'),
  body('GioiTinh')
    .optional()
    .isIn(['Nam', 'Nữ'])
    .withMessage("Giới tính phải là 'Nam' hoặc 'Nữ'."),
];

/**
 * Validation rules for deleting account
 */
const deleteAccountValidationRules = () => [
  param('accountId')
    .trim()
    .notEmpty()
    .withMessage(
      'Mã định danh tài khoản (MaNV/MaNDT) trong URL không được trống.'
    )
    .isLength({ min: 3, max: 20 })
    .withMessage('Mã định danh tài khoản trong URL phải từ 3-20 ký tự.'),
  query('role')
    .trim()
    .notEmpty()
    .withMessage("Tham số 'role' trong query string là bắt buộc.")
    .isIn(['NhaDauTu', 'NhanVien'])
    .withMessage(
      "Giá trị 'role' trong query string phải là 'NhaDauTu' hoặc 'NhanVien'."
    ),
];

/**
 * Validation rules for admin reset password
 */
const adminResetPasswordValidationRules = () => [
  param('accountId')
    .trim()
    .notEmpty()
    .withMessage('Mã định danh tài khoản trong URL không được trống.')
    .isLength({ min: 3, max: 20 })
    .withMessage('Mã định danh tài khoản trong URL phải từ 3-20 ký tự.'),
  body('role')
    .isIn(['NhaDauTu', 'NhanVien'])
    .withMessage(
      "Vai trò ('role') phải là 'NhaDauTu' hoặc 'NhanVien' và là bắt buộc."
    ),
  body('newPassword')
    .notEmpty()
    .withMessage('Mật khẩu mới không được trống.')
    .isLength({ min: 6 })
    .withMessage('Mật khẩu mới phải có ít nhất 6 ký tự.'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Xác nhận mật khẩu mới không được trống.')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Xác nhận mật khẩu mới không khớp.');
      }
      return true;
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
