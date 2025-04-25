// middleware/validators/taikhoanNganHangValidator.js
const { body, param } = require("express-validator");

const maTkParamValidation = () => [
  param("maTK") // Lấy từ URL
    .trim()
    .notEmpty()
    .withMessage("Mã Tài khoản trong URL không được trống.")
    .isLength({ max: 20 })
    .withMessage("Mã Tài khoản tối đa 20 ký tự."),
];

const maNdtParamValidation = () => [
  // Reuse from nhadautuValidator or redefine
  param("mandt") // <<< BẮT BUỘC phải có MaNDT khi tạo từ Admin
    .trim()
    .notEmpty()
    .withMessage("Mã Nhà Đầu Tư không được trống.")
    .isLength({ max: 20 })
    .withMessage("Mã Nhà Đầu Tư tối đa 20 ký tự."),
];

const createTKNHValidation = () => [
  ...maNdtParamValidation(), // MaNDT from URL
  body("MaTK")
    .trim()
    .notEmpty()
    .withMessage("Mã Tài khoản không được trống.")
    .isLength({ max: 20 })
    .withMessage("Mã Tài khoản tối đa 20 ký tự."),
  body("SoTien")
    .notEmpty()
    .withMessage("Số tiền không được trống.")
    .isFloat({ min: 0 })
    .withMessage("Số tiền phải là số không âm.")
    .toFloat(), // Chuyển đổi sang số float
  body("MaNH")
    .trim()
    .notEmpty()
    .withMessage("Mã Ngân hàng không được trống.")
    .isLength({ max: 20 })
    .withMessage("Mã Ngân hàng tối đa 20 ký tự."),
];

const updateTKNHValidation = () => [
  ...maTkParamValidation(), // MaTK from URL
  // Chỉ validate các trường được phép update
  body("SoTien")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Số tiền phải là số không âm."),
  body("MaNH")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Mã ngân hàng không được trống.")
    .isLength({ max: 20 }),
];

const createBankAccountValidationRules = () => [
  body("MaTK")
    .trim()
    .notEmpty()
    .withMessage("Mã Tài khoản không được trống.")
    .isLength({ max: 20 })
    .withMessage("Mã Tài khoản tối đa 20 ký tự."),
  body("MaNDT") // <<< BẮT BUỘC phải có MaNDT khi tạo từ Admin
    .trim()
    .notEmpty()
    .withMessage("Mã Nhà Đầu Tư không được trống.")
    .isLength({ max: 20 })
    .withMessage("Mã Nhà Đầu Tư tối đa 20 ký tự."),
  body("SoTien")
    .notEmpty()
    .withMessage("Số tiền không được trống.")
    .isFloat({ min: 0 })
    .withMessage("Số tiền phải là số không âm.")
    .toFloat(), // Chuyển đổi sang số float
  body("MaNH")
    .trim()
    .notEmpty()
    .withMessage("Mã Ngân hàng không được trống.")
    .isLength({ max: 20 })
    .withMessage("Mã Ngân hàng tối đa 20 ký tự."),
];

const updateBankAccountValidationRules = () => [
  ...maTkParamValidation(), // Validate MaTK từ URL
  // Các trường trong body là optional
  // Không cho phép sửa MaNDT qua API này
  body("MaNDT")
    .not()
    .exists()
    .withMessage("Không được phép thay đổi Mã Nhà Đầu Tư."),
  body("SoTien")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Số tiền phải là số không âm.")
    .toFloat(),
  body("MaNH")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Mã Ngân hàng không được trống (nếu cập nhật).")
    .isLength({ max: 20 })
    .withMessage("Mã Ngân hàng tối đa 20 ký tự."),
];

module.exports = {
  maTkParamValidation,
  maNdtParamValidation, // Export if redefined here
  createTKNHValidation,
  updateTKNHValidation,
  updateBankAccountValidationRules,
  createBankAccountValidationRules,
};
