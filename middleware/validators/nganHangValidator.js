/**
 * middleware/validators/nganHangValidator.js
 * Validator middleware for Ngân Hàng (Bank) APIs.
 */
const { body, param } = require('express-validator');

/**
 * Validate maNH param in URL.
 */
const maNHParamValidation = () => [
  param('maNH')
    .trim()
    .notEmpty()
    .withMessage('Mã Ngân hàng trong URL không được trống.')
    .isLength({ min: 1, max: 20 })
    .withMessage('Mã Ngân hàng phải từ 1-20 ký tự.'),
];

/**
 * Validation rules for creating a new Ngân Hàng.
 */
const createNganHangValidationRules = () => [
  body('MaNH')
    .trim()
    .notEmpty()
    .withMessage('Mã Ngân hàng không được trống.')
    .isLength({ min: 1, max: 20 })
    .withMessage('Mã Ngân hàng phải từ 1-20 ký tự.'),
  body('TenNH')
    .trim()
    .notEmpty()
    .withMessage('Tên Ngân hàng không được trống.')
    .isLength({ max: 50 })
    .withMessage('Tên Ngân hàng tối đa 50 ký tự.'),
  body('DiaChi')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Địa chỉ tối đa 100 ký tự.'),
  body('Phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 9, max: 10 })
    .withMessage('Số điện thoại phải 9 hoặc 10 ký tự.')
    .matches(/^[0-9]+$/)
    .withMessage('Số điện thoại chỉ chứa số.'),
  body('Email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Email không hợp lệ.')
    .isLength({ max: 50 })
    .withMessage('Email tối đa 50 ký tự.')
    .normalizeEmail(),
];

/**
 * Validation rules for updating an existing Ngân Hàng.
 */
const updateNganHangValidationRules = () => [
  ...maNHParamValidation(),
  body('TenNH')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Tên Ngân hàng không được trống (nếu cập nhật).')
    .isLength({ max: 50 })
    .withMessage('Tên Ngân hàng tối đa 50 ký tự.'),
  body('DiaChi')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Địa chỉ tối đa 100 ký tự.'),
  body('Phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 9, max: 10 })
    .withMessage('Số điện thoại phải 9 hoặc 10 ký tự.')
    .matches(/^[0-9]*$/)
    .withMessage('Số điện thoại chỉ chứa số.'),
  body('Email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Email không hợp lệ.')
    .isLength({ max: 50 })
    .withMessage('Email tối đa 50 ký tự.')
    .normalizeEmail(),
];

module.exports = {
  maNHParamValidation,
  createNganHangValidationRules,
  updateNganHangValidationRules,
};
