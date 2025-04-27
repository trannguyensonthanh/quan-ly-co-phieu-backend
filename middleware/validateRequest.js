// middleware/validateRequest.js
const { validationResult } = require("express-validator");

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(", ");

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(), // Giữ danh sách lỗi chi tiết
    });
  }
  next(); // Không có lỗi → đi tiếp
};

module.exports = validateRequest;
