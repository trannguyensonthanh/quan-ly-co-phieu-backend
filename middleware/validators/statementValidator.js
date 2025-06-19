/**
 * middleware/validators/statementValidator.js
 * Validators for statement-related routes.
 */

const { query, param } = require('express-validator');

// Validate date range query parameters
const dateRangeQueryValidation = () => [
  query('tuNgay')
    .trim()
    .notEmpty()
    .withMessage('Phải cung cấp ngày bắt đầu (tuNgay).')
    .isISO8601()
    .withMessage('Ngày bắt đầu phải có định dạng YYYY-MM-DD.'),
  query('denNgay')
    .trim()
    .notEmpty()
    .withMessage('Phải cung cấp ngày kết thúc (denNgay).')
    .isISO8601()
    .withMessage('Ngày kết thúc phải có định dạng YYYY-MM-DD.')
    .custom((value, { req }) => {
      if (new Date(value) < new Date(req.query.tuNgay)) {
        throw new Error('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.');
      }
      return true;
    }),
];

// Validate MaNDT from param
const maNdtParamValidation = () => [
  param('mandt')
    .trim()
    .notEmpty()
    .withMessage('Mã NDT trong URL không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã NDT tối đa 20 ký tự.'),
];

// Validate maTK from param
const maTkParamValidation = () => [
  param('maTK')
    .trim()
    .notEmpty()
    .withMessage('Mã Tài khoản trong URL không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã Tài khoản tối đa 20 ký tự.'),
];

module.exports = {
  dateRangeQueryValidation,
  maNdtParamValidation,
  maTkParamValidation,
};
