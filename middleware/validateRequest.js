/**
 * middleware/validateRequest.js
 * Middleware kiểm tra kết quả validate từ express-validator
 */
const { validationResult } = require('express-validator');

/**
 * Kiểm tra request có lỗi validate không
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  next();
};

module.exports = validateRequest;
