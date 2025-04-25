// middleware/validators/statementValidator.js
const { query, param } = require("express-validator");

const dateRangeQueryValidation = () => [
  query("tuNgay")
    .trim() // Thêm trim
    .notEmpty()
    .withMessage("Phải cung cấp ngày bắt đầu (tuNgay).")
    .isISO8601()
    .withMessage("Ngày bắt đầu phải có định dạng YYYY-MM-DD."),
  // .toDate(), // Chuyển đổi thành Date nếu cần xử lý ngay ở validator
  query("denNgay")
    .trim() // Thêm trim
    .notEmpty()
    .withMessage("Phải cung cấp ngày kết thúc (denNgay).")
    .isISO8601()
    .withMessage("Ngày kết thúc phải có định dạng YYYY-MM-DD.")
    // .toDate()
    .custom((value, { req }) => {
      // Kiểm tra denNgay >= tuNgay
      if (new Date(value) < new Date(req.query.tuNgay)) {
        throw new Error("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.");
      }
      return true;
    }),
];

// Validator cho MaNDT từ param (có thể import từ nhadautuValidator)
const maNdtParamValidation = () => [
  param("mandt")
    .trim()
    .notEmpty()
    .withMessage("Mã NDT trong URL không được trống.") // Thêm notEmpty
    .isLength({ max: 20 })
    .withMessage("Mã NDT tối đa 20 ký tự."), // Bỏ min nếu cần
];

const maTkParamValidation = () => [
  // Thêm validator này
  param("maTK")
    .trim()
    .notEmpty()
    .withMessage("Mã Tài khoản trong URL không được trống.")
    .isLength({ max: 20 })
    .withMessage("Mã Tài khoản tối đa 20 ký tự."),
];

module.exports = {
  dateRangeQueryValidation,
  maNdtParamValidation,
  maTkParamValidation,
};
