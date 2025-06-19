/**
 * middleware/validators/tradingValidator.js
 * Validator middleware for trading-related endpoints.
 */

const { body, param } = require('express-validator');

/**
 * Validation rules for placing an order.
 */
const placeOrderValidationRules = () => {
  return [
    body('MaTK')
      .trim()
      .notEmpty()
      .withMessage('Mã tài khoản đặt lệnh không được trống.')
      .isLength({ max: 20 }),
    body('MaCP')
      .trim()
      .notEmpty()
      .withMessage('Mã cổ phiếu không được trống.')
      .isLength({ max: 10 })
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Mã CP không hợp lệ.'),
    body('SoLuong')
      .isInt({ gt: 0 })
      .withMessage('Số lượng phải là số nguyên dương.'),
    body('Gia')
      .if(body('LoaiLenh').equals('LO'))
      .notEmpty()
      .withMessage('Giá đặt là bắt buộc đối với lệnh LO.')
      .isFloat({ gt: 0 })
      .withMessage('Giá đặt LO phải là số dương.')
      .toFloat(),
    body('Gia')
      .if(body('LoaiLenh').not().equals('LO'))
      .custom((value) => {
        if (value !== undefined && value !== null && value !== '') {
          throw new Error('Không được nhập giá cho lệnh ATO/ATC.');
        }
        return true;
      }),
    body('LoaiLenh')
      .trim()
      .notEmpty()
      .withMessage('Loại lệnh không được trống.')
      .isIn(['LO', 'ATO', 'ATC'])
      .withMessage('Loại lệnh không hợp lệ (chỉ LO, ATO, ATC).'),
    body('transactionPassword')
      .trim()
      .notEmpty()
      .withMessage('Mật khẩu giao dịch không được trống.'),
  ];
};

/**
 * Validation rules for canceling an order.
 */
const cancelOrderValidationRules = () => [
  param('magd')
    .trim()
    .isInt({ gt: 0 })
    .withMessage('Mã giao dịch phải là một số nguyên dương.'),
];

/**
 * Validation rules for modifying an order.
 */
const modifyOrderValidationRules = () => [
  param('maGD')
    .isInt({ gt: 0 })
    .withMessage('Mã giao dịch phải là số nguyên dương.')
    .toInt(),
  body('newGia')
    .optional({ values: 'null' })
    .isFloat({ gt: 0 })
    .withMessage('Giá mới phải là số dương (nếu có).')
    .toFloat(),
  body('newSoLuong')
    .optional({ values: 'null' })
    .isInt({ gt: 0 })
    .withMessage('Số lượng mới phải là số nguyên dương (nếu có).')
    .toInt(),
];

module.exports = {
  placeOrderValidationRules,
  cancelOrderValidationRules,
  modifyOrderValidationRules,
};
