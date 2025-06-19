/**
 * middleware/validators/adminStockValidator.js
 * Validator middlewares for admin stock APIs.
 */
const { body, param } = require('express-validator');

/**
 * Validate maCP param (stock code) in URL.
 */
const maCpParamValidation = (paramName = 'maCP') => [
  param(paramName)
    .trim()
    .notEmpty()
    .withMessage(`Param '${paramName}' không được trống.`)
    .isLength({ min: 1, max: 10 })
    .withMessage(`Param '${paramName}' phải từ 1-10 ký tự.`)
    .matches(/^[A-Z0-9]+$/)
    .withMessage(`Param '${paramName}' không hợp lệ.`),
];

/**
 * Validator for stock distribution API.
 */
const distributeStockValidationRules = () => [
  ...maCpParamValidation('maCP'),
  body('distributionList')
    .isArray({ min: 1 })
    .withMessage('distributionList phải là một mảng chứa ít nhất một phần tử.'),
  body('distributionList.*.maNDT')
    .trim()
    .notEmpty()
    .withMessage('MaNDT trong danh sách phân bổ không được trống.')
    .isLength({ max: 20 })
    .withMessage('MaNDT trong danh sách phân bổ tối đa 20 ký tự.'),
  body('distributionList.*.soLuong')
    .notEmpty()
    .withMessage('Số lượng phân bổ không được trống.')
    .isInt({ gt: 0 })
    .withMessage('Số lượng phân bổ phải là số nguyên dương.')
    .toInt(),
  body('distributionList.*.gia')
    .notEmpty()
    .withMessage('Giá phân bổ (gia) là bắt buộc cho mỗi nhà đầu tư.')
    .isFloat({ min: 0 })
    .withMessage('Giá phân bổ phải là số không âm.')
    .toFloat(),
  body('distributionList.*.maTK')
    .trim()
    .notEmpty()
    .withMessage(
      'Mã Tài khoản (maTK) là bắt buộc cho mỗi nhà đầu tư trong danh sách phân bổ.'
    )
    .isLength({ max: 20 })
    .withMessage('Mã Tài khoản tối đa 20 ký tự.'),
];

/**
 * Validator for stock listing API.
 */
const listStockValidationRules = () => [
  ...maCpParamValidation('maCP'),
  body('initialGiaTC')
    .notEmpty()
    .withMessage('Giá tham chiếu ban đầu (initialGiaTC) là bắt buộc.')
    .isFloat({ gt: 0 })
    .withMessage('Giá tham chiếu ban đầu phải là số dương.')
    .custom((value) => value % 100 === 0)
    .withMessage('Giá tham chiếu ban đầu phải là bội số của 100.')
    .toFloat(),
];

/**
 * Validate maNDT param (investor code) in URL.
 */
const maNdtParamValidation = () => [
  param('maNDT')
    .trim()
    .notEmpty()
    .withMessage('Mã Nhà Đầu Tư trong URL không được trống.')
    .isLength({ max: 20 })
    .withMessage('Mã Nhà Đầu Tư tối đa 20 ký tự.'),
];

/**
 * Validator for updating stock distribution API.
 */
const updateDistributionValidationRules = () => [
  ...maCpParamValidation('maCP'),
  ...maNdtParamValidation(),
  body('newSoLuong')
    .notEmpty()
    .withMessage('Số lượng mới (newSoLuong) là bắt buộc.')
    .isInt({ min: 0 })
    .withMessage('Số lượng mới phải là số nguyên không âm.')
    .toInt(),
];

/**
 * Validator for relisting stock API.
 */
const relistStockValidationRules = () => [
  ...maCpParamValidation('maCP'),
  body('giaTC')
    .notEmpty()
    .withMessage('Giá tham chiếu (giaTC) là bắt buộc.')
    .isFloat({ gt: 0 })
    .withMessage('Giá tham chiếu phải là số dương.')
    .custom((value) => value % 100 === 0)
    .withMessage('Giá tham chiếu phải là bội số của 100.')
    .toFloat(),
];

module.exports = {
  maCpParamValidation,
  distributeStockValidationRules,
  listStockValidationRules,
  maNdtParamValidation,
  updateDistributionValidationRules,
  relistStockValidationRules,
};
