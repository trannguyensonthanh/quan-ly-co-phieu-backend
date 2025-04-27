// middleware/validators/adminStockValidator.js (Ví dụ file mới)
const { body, param } = require("express-validator");

// Tái sử dụng validator MaCP từ coPhieuValidator hoặc định nghĩa lại
const maCpParamValidation = (paramName = "maCP") => [
  param(paramName)
    .trim()
    .notEmpty()
    .withMessage(`Param '${paramName}' không được trống.`)
    .isLength({ min: 1, max: 10 })
    .withMessage(`Param '${paramName}' phải từ 1-10 ký tự.`)
    .matches(/^[A-Z0-9]+$/)
    .withMessage(`Param '${paramName}' không hợp lệ.`),
];

// Validator cho API Phân bổ
const distributeStockValidationRules = () => [
  ...maCpParamValidation("maCP"), // Validate maCP từ URL

  // Validate distributionList trong body
  body("distributionList")
    .isArray({ min: 1 })
    .withMessage("distributionList phải là một mảng chứa ít nhất một phần tử."),
  // Validate từng phần tử trong distributionList
  body("distributionList.*.maNDT") // Dùng dấu * để validate từng phần tử trong mảng
    .trim()
    .notEmpty()
    .withMessage("MaNDT trong danh sách phân bổ không được trống.")
    .isLength({ max: 20 })
    .withMessage("MaNDT trong danh sách phân bổ tối đa 20 ký tự."),
  body("distributionList.*.soLuong")
    .notEmpty()
    .withMessage("Số lượng phân bổ không được trống.")
    .isInt({ gt: 0 })
    .withMessage("Số lượng phân bổ phải là số nguyên dương.")
    .toInt(),

  // --- VALIDATE GIÁ TRONG TỪNG PHẦN TỬ ---
  body("distributionList.*.gia")
    .notEmpty()
    .withMessage("Giá phân bổ (gia) là bắt buộc cho mỗi nhà đầu tư.") // Giờ là bắt buộc
    .isFloat({ min: 0 })
    .withMessage("Giá phân bổ phải là số không âm.") // Cho phép giá 0
    .toFloat(),
  body("distributionList.*.maTK")
    .trim()
    .notEmpty()
    .withMessage(
      "Mã Tài khoản (maTK) là bắt buộc cho mỗi nhà đầu tư trong danh sách phân bổ."
    )
    .isLength({ max: 20 })
    .withMessage("Mã Tài khoản tối đa 20 ký tự."),
];

// Validator cho API Niêm yết (listStock)
const listStockValidationRules = () => [
  ...maCpParamValidation("maCP"),
  body("initialGiaTC")
    .notEmpty()
    .withMessage("Giá tham chiếu ban đầu (initialGiaTC) là bắt buộc.")
    .isFloat({ gt: 0 })
    .withMessage("Giá tham chiếu ban đầu phải là số dương.")
    .custom((value) => value % 100 === 0)
    .withMessage("Giá tham chiếu ban đầu phải là bội số của 100.") // Thêm check bội số
    .toFloat(),
];

const maNdtParamValidation = () => [
  // Validator cho MaNDT trong param
  param("maNDT")
    .trim()
    .notEmpty()
    .withMessage("Mã Nhà Đầu Tư trong URL không được trống.")
    .isLength({ max: 20 })
    .withMessage("Mã Nhà Đầu Tư tối đa 20 ký tự."),
];

const updateDistributionValidationRules = () => [
  ...maCpParamValidation("maCP"),
  ...maNdtParamValidation(), // Thêm validate cho maNDT param
  body("newSoLuong")
    .notEmpty()
    .withMessage("Số lượng mới (newSoLuong) là bắt buộc.")
    .isInt({ min: 0 })
    .withMessage("Số lượng mới phải là số nguyên không âm.") // Cho phép về 0
    .toInt(),
];

// --- THÊM VALIDATOR CHO RELIST ---
const relistStockValidationRules = () => [
  ...maCpParamValidation("maCP"), // <<< Sửa tên param nếu cần
  body("giaTC")
    .notEmpty()
    .withMessage("Giá tham chiếu (giaTC) là bắt buộc.")
    .isFloat({ gt: 0 })
    .withMessage("Giá tham chiếu phải là số dương.")
    .custom((value) => value % 100 === 0)
    .withMessage("Giá tham chiếu phải là bội số của 100.")
    .toFloat(),
];

module.exports = {
  maCpParamValidation, // Export nếu định nghĩa lại ở đây
  distributeStockValidationRules,
  listStockValidationRules, // Export validator cho niêm yết
  maNdtParamValidation, // Export validator mới
  updateDistributionValidationRules, // Export validator mới
  relistStockValidationRules,
};
