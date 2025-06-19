/**
 * middleware/validators/taikhoanNganHangValidator.js
 * Định nghĩa các hàm validate cho tài khoản ngân hàng.
 */
const { body, param } = require('express-validator');

/**
 * Validate tham số maTK từ URL.
 */
const maTkParamValidation = () => [
  param('maTK')
    .trim()
    .notEmpty()
    .withMessage('Mã Tài khoản trong URL không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã Tài khoản tối đa 20 ký tự.'),
];

/**
 * Validate tham số mandt từ URL.
 */
const maNdtParamValidation = () => [
  param('mandt')
    .trim()
    .notEmpty()
    .withMessage('Mã Nhà Đầu Tư không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã Nhà Đầu Tư tối đa 20 ký tự.'),
];

/**
 * Validate khi tạo tài khoản ngân hàng (từ Admin, MaNDT từ URL).
 */
const createTKNHValidation = () => [
  ...maNdtParamValidation(),
  body('MaTK')
    .trim()
    .notEmpty()
    .withMessage('Mã Tài khoản không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã Tài khoản tối đa 20 ký tự.'),
  body('SoTien')
    .notEmpty()
    .withMessage('Số tiền không được trống.')
    .isFloat({ min: 0 })
    .withMessage('Số tiền phải là số không âm.')
    .toFloat(),
  body('MaNH')
    .trim()
    .notEmpty()
    .withMessage('Mã Ngân hàng không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã Ngân hàng tối đa 20 ký tự.'),
];

/**
 * Validate khi cập nhật tài khoản ngân hàng.
 */
const updateTKNHValidation = () => [
  ...maTkParamValidation(),
  body('SoTien')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Số tiền phải là số không âm.'),
  body('MaNH')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Mã ngân hàng không được trống.')
    .isLength({ max: 20 }),
];

/**
 * Validate khi tạo tài khoản ngân hàng (từ Admin, MaNDT từ body).
 */
const createBankAccountValidationRules = () => [
  body('MaTK')
    .trim()
    .notEmpty()
    .withMessage('Mã Tài khoản không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã Tài khoản tối đa 20 ký tự.'),
  body('MaNDT')
    .trim()
    .notEmpty()
    .withMessage('Mã Nhà Đầu Tư không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã Nhà Đầu Tư tối đa 20 ký tự.'),
  body('SoTien')
    .notEmpty()
    .withMessage('Số tiền không được trống.')
    .isFloat({ min: 0 })
    .withMessage('Số tiền phải là số không âm.')
    .toFloat(),
  body('MaNH')
    .trim()
    .notEmpty()
    .withMessage('Mã Ngân hàng không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã Ngân hàng tối đa 20 ký tự.'),
];

/**
 * Validate khi cập nhật tài khoản ngân hàng (không cho phép sửa MaNDT).
 */
const updateBankAccountValidationRules = () => [
  ...maTkParamValidation(),
  body('MaNDT')
    .not()
    .exists()
    .withMessage('Không được phép thay đổi Mã Nhà Đầu Tư.'),
  body('SoTien')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Số tiền phải là số không âm.')
    .toFloat(),
  body('MaNH')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Mã Ngân hàng không được trống (nếu cập nhật).')
    .isLength({ max: 20 })
    .withMessage('Mã Ngân hàng tối đa 20 ký tự.'),
];

module.exports = {
  maTkParamValidation,
  maNdtParamValidation,
  createTKNHValidation,
  updateTKNHValidation,
  updateBankAccountValidationRules,
  createBankAccountValidationRules,
};
