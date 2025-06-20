/**
 * Middleware: Validators for authentication-related routes.
 * File: /middleware/validators/authValidator.js
 */

const { body } = require('express-validator');

/**
 * Validation rules for changing password.
 */
const changePasswordValidationRules = () => [
  body('oldPassword').notEmpty().withMessage('Mật khẩu cũ không được trống.'),
  body('newPassword')
    .notEmpty()
    .withMessage('Mật khẩu mới không được trống.')
    .isLength({ min: 6 })
    .withMessage('Mật khẩu mới phải có ít nhất 6 ký tự.'),
];

/**
 * Validation rules for user signup.
 */
const signUpValidationRules = () => [
  body('MaNDT')
    .trim()
    .notEmpty()
    .withMessage('Mã NDT không được trống.')
    .isLength({ max: 20 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Mã NDT chỉ chứa chữ, số, gạch dưới.'),
  body('password')
    .notEmpty()
    .withMessage('Vui lòng nhập mật khẩu.')
    .isLength({ min: 6 })
    .withMessage('Mật khẩu phải có ít nhất 6 ký tự.')
    .isLength({ max: 20 })
    .withMessage('Mật khẩu không được vượt quá 20 ký tự.'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Xác nhận mật khẩu không được trống.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Xác nhận mật khẩu không khớp.');
      }
      return true;
    }),
  body('HoTen')
    .trim()
    .notEmpty()
    .withMessage('Họ tên không được trống.')
    .isLength({ max: 50 }),
  body('NgaySinh')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Ngày sinh không hợp lệ (YYYY-MM-DD).'),
  body('DiaChi')
    .trim()
    .notEmpty()
    .withMessage('Địa chỉ không được trống.')
    .isLength({ max: 100 }),
  body('Phone')
    .trim()
    .notEmpty()
    .withMessage('Số điện thoại không được trống.')
    .isLength({ max: 15 })
    .matches(/^[0-9+()-.\s]+$/)
    .withMessage('Số điện thoại không hợp lệ.'),
  body('CMND')
    .trim()
    .notEmpty()
    .withMessage('CMND không được trống.')
    .isLength({ min: 9, max: 10 })
    .withMessage('CMND phải đúng 9 ký tự.')
    .matches(/^[0-9]+$/)
    .withMessage('CMND chỉ chứa số.'),
  body('GioiTinh')
    .isIn(['Nam', 'Nữ'])
    .withMessage('Giới tính phải là Nam hoặc Nữ.'),
  body('Email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Email không hợp lệ.')
    .isLength({ max: 50 }),
];

/**
 * Validation rules for forgot password.
 */
const forgotPasswordValidationRules = () => [
  body('Email')
    .notEmpty()
    .withMessage('Email không được trống.')
    .isEmail()
    .withMessage('Email không hợp lệ.')
    .isLength({ max: 50 })
    .withMessage('Email không được vượt quá 50 ký tự.'),
];

/**
 * Validation rules for resetting password.
 */
const resetPasswordValidationRules = () => [
  body('token').notEmpty().withMessage('Token không được trống.'),
  body('newPassword')
    .notEmpty()
    .withMessage('Mật khẩu mới không được trống.')
    .isLength({ min: 6 })
    .withMessage('Mật khẩu mới phải có ít nhất 6 ký tự.')
    .isLength({ max: 20 })
    .withMessage('Mật khẩu mới không được vượt quá 20 ký tự.'),
];

module.exports = {
  changePasswordValidationRules,
  signUpValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
};
