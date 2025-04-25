// middleware/validators/coPhieuValidator.js
const { body, param, query } = require("express-validator");

const createCoPhieuValidationRules = () => {
  return [
    body("MaCP")
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage("Mã CP phải từ 1 đến 10 ký tự.")
      .matches(/^[A-Z0-9]+$/)
      .withMessage("Mã CP chỉ chứa chữ cái viết hoa và số."), // Ví dụ format
    body("TenCty")
      .trim()
      .notEmpty()
      .withMessage("Tên công ty không được để trống.")
      .isLength({ max: 50 })
      .withMessage("Tên công ty tối đa 50 ký tự."),
    body("DiaChi")
      .trim()
      .notEmpty()
      .withMessage("Địa chỉ không được để trống.")
      .isLength({ max: 100 })
      .withMessage("Địa chỉ tối đa 100 ký tự."),
    body("SoLuongPH")
      .isInt({ gt: 0 })
      .withMessage("Số lượng phát hành phải là số nguyên lớn hơn 0."),
  ];
};

const updateCoPhieuValidationRules = () => {
  return [
    param("macp") // Validate MaCP từ URL
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage("Mã CP trong URL không hợp lệ.")
      .matches(/^[A-Z0-9]+$/)
      .withMessage("Mã CP trong URL không hợp lệ."),
    // Body validations giống như create nhưng không cần check MaCP trong body
    body("TenCty")
      .trim()
      .notEmpty()
      .withMessage("Tên công ty không được để trống.")
      .isLength({ max: 50 })
      .withMessage("Tên công ty tối đa 50 ký tự."),
    body("DiaChi")
      .trim()
      .notEmpty()
      .withMessage("Địa chỉ không được để trống.")
      .isLength({ max: 100 })
      .withMessage("Địa chỉ tối đa 100 ký tự."),
    body("SoLuongPH")
      .isInt({ gt: 0 })
      .withMessage("Số lượng phát hành phải là số nguyên lớn hơn 0."),
  ];
};

const maCpParamValidationRules = (paramName = "macp") => {
  return [
    param(paramName)
      .trim()
      .notEmpty()
      .withMessage(`Param '${paramName}' không được trống.`)
      .isLength({ min: 1, max: 10 })
      .withMessage(`Param '${paramName}' phải từ 1-10 ký tự.`)
      .matches(/^[A-Z0-9]+$/)
      .withMessage(`Param '${paramName}' không hợp lệ (chỉ chữ hoa, số).`),
  ];
};

// Validator cho route lấy sao kê lệnh theo mã CP
const getStockOrdersValidationRules = () => [
  // Validate MaCP từ URL param
  param("macp")
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage("Mã CP trong URL không hợp lệ.")
    .matches(/^[A-Z0-9]+$/)
    .withMessage("Mã CP trong URL không hợp lệ."),
  // Validate tuNgay, denNgay từ query params
  query("tuNgay")
    .notEmpty()
    .withMessage("Phải cung cấp ngày bắt đầu (tuNgay).")
    .isISO8601()
    .withMessage("Ngày bắt đầu phải có định dạng YYYY-MM-DD."),
  query("denNgay")
    .notEmpty()
    .withMessage("Phải cung cấp ngày kết thúc (denNgay).")
    .isISO8601()
    .withMessage("Ngày kết thúc phải có định dạng YYYY-MM-DD.")
    .custom((value, { req }) => {
      if (new Date(value) < new Date(req.query.tuNgay)) {
        throw new Error("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.");
      }
      return true;
    }),
];

// Validator cho PUT /api/cophieu/:macp/list
const listStockValidationRules = () => [
  param("macp")
    .notEmpty()
    .withMessage("Mã cổ phiếu không được để trống")
    .isString()
    .withMessage("Mã cổ phiếu phải là chuỗi ký tự"),
  body("initialGiaTC")
    .notEmpty()
    .withMessage("Giá tham chiếu ban đầu không được để trống")
    .isFloat({ gt: 0 })
    .withMessage("Giá tham chiếu ban đầu phải là số lớn hơn 0"),
];
const getRecentHistoryValidationRules = () => [
  // Validate MaCP từ URL param (tái sử dụng)
  ...maCpParamValidationRules("macp"), // Đảm bảo hàm này nhận tên param

  // Validate 'days' từ query string
  query("days")
    .notEmpty()
    .withMessage("Tham số 'days' là bắt buộc.")
    .isInt({ min: 1, max: 365 * 5 })
    .withMessage("Số ngày ('days') phải là số nguyên dương (tối đa 5 năm).") // Giới hạn số ngày hợp lý
    .toInt(), // Chuyển đổi sang số nguyên
];

module.exports = {
  createCoPhieuValidationRules,
  updateCoPhieuValidationRules,
  maCpParamValidationRules,
  getStockOrdersValidationRules,
  listStockValidationRules,
  getRecentHistoryValidationRules,
};
