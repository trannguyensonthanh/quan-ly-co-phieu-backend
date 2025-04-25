const { body } = require("express-validator");

const validateDepositOrWithdraw = [
  body("maTK")
    .trim()
    .notEmpty()
    .withMessage("Mã tài khoản (MaTK) là bắt buộc.")
    .isLength({ min: 3, max: 20 })
    .withMessage("MaTK phải có độ dài từ 3 đến 20 ký tự."),

  body("maNDT")
    .trim()
    .notEmpty()
    .withMessage("Mã nhà đầu tư (MaNDT) là bắt buộc.")
    .isLength({ min: 3, max: 20 })
    .withMessage("MaNDT phải có độ dài từ 3 đến 20 ký tự."),

  body("soTien")
    .notEmpty()
    .withMessage("Số tiền (SoTien) không được để trống.")
    .isFloat({ gt: 0 })
    .withMessage("SoTien phải là số và lớn hơn 0."),
];

module.exports = {
  validateDepositOrWithdraw,
};
