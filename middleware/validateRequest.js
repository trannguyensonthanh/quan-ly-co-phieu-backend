// middleware/validateRequest.js
const { validationResult } = require("express-validator");

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Có lỗi validate → trả về luôn
    return res.status(400).json({
      message: "Validation error",
      errors: errors.array(),
    });
  }
  next(); // Không có lỗi → đi tiếp
};

module.exports = validateRequest;
