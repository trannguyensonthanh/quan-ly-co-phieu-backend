/**
 * middleware/validators/nhadautuValidator.js
 * Validator middleware for Nha Dau Tu (Investor) APIs.
 */
const { body, param } = require('express-validator');

/**
 * Validate MaNDT param in URL.
 */
const maNdtParamValidation = () => [
  param('mandt')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Mã NDT không hợp lệ.'),
];

/**
 * Validate body for creating a new Nha Dau Tu.
 */
const createNdtValidation = () => [
  body('MaNDT')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Mã NDT phải từ 1-20 ký tự.'),
  body('HoTen')
    .trim()
    .notEmpty()
    .withMessage('Họ tên không được trống.')
    .isLength({ max: 50 }),
  body('NgaySinh')
    .optional({ checkFalsy: true })
    .isISO8601()
    .toDate()
    .withMessage('Ngày sinh không hợp lệ (YYYY-MM-DD).'),
  body('MKGD')
    .notEmpty()
    .withMessage('Mật khẩu giao dịch không được trống.')
    .isLength({ min: 6 })
    .withMessage('Mật khẩu phải ít nhất 6 ký tự.'),
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
    .withMessage('CMND phải 9 hoặc 10 ký tự.')
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
 * Validate param and body for updating a Nha Dau Tu.
 */
const updateNdtValidation = () => [
  ...maNdtParamValidation(),
  body('HoTen')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Họ tên không được trống.')
    .isLength({ max: 50 }),
  body('NgaySinh')
    .optional({ checkFalsy: true })
    .isISO8601()
    .toDate()
    .withMessage('Ngày sinh không hợp lệ (YYYY-MM-DD).'),
  body('DiaChi')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Địa chỉ không được trống.')
    .isLength({ max: 100 }),
  body('Phone')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Số điện thoại không được trống.')
    .isLength({ max: 15 })
    .matches(/^[0-9+()-.\s]+$/)
    .withMessage('Số điện thoại không hợp lệ.'),
  body('GioiTinh')
    .optional()
    .isIn(['Nam', 'Nữ'])
    .withMessage('Giới tính phải là Nam hoặc Nữ.'),
  body('Email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Email không hợp lệ.')
    .isLength({ max: 50 }),
];

module.exports = {
  maNdtParamValidation,
  createNdtValidation,
  updateNdtValidation,
};
