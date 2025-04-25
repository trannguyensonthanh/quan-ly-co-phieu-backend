// middleware/validators/tradingValidator.js
const { body, param } = require("express-validator");

const placeOrderValidationRules = () => {
  return [
    body("MaTK")
      .trim()
      .notEmpty()
      .withMessage("Mã tài khoản đặt lệnh không được trống.")
      .isLength({ max: 20 }),
    body("MaCP")
      .trim()
      .notEmpty()
      .withMessage("Mã cổ phiếu không được trống.")
      .isLength({ max: 10 })
      .matches(/^[A-Z0-9]+$/)
      .withMessage("Mã CP không hợp lệ."),
    body("SoLuong")
      .isInt({ gt: 0 })
      .withMessage("Số lượng phải là số nguyên dương."),
    // Kiểm tra bội số 100 sẽ thực hiện trong service vì nó là logic nghiệp vụ
    // .custom(value => {
    //     if (value % 100 !== 0) {
    //         throw new Error('Số lượng phải là bội số của 100.');
    //     }
    //     return true;
    // }),
    // Trường hợp nếu là lệnh LO
    body("Gia")
      .if(body("LoaiLenh").equals("LO"))
      .notEmpty()
      .withMessage("Giá đặt là bắt buộc đối với lệnh LO.")
      .isFloat({ gt: 0 })
      .withMessage("Giá đặt LO phải là số dương.")
      .toFloat(),

    // Trường hợp nếu KHÔNG phải là LO (tức là ATO/ATC)
    body("Gia")
      .if(body("LoaiLenh").not().equals("LO")) // Ngược lại
      .custom((value) => {
        if (value !== undefined && value !== null && value !== "") {
          throw new Error("Không được nhập giá cho lệnh ATO/ATC.");
        }
        return true;
      }),
    body("LoaiLenh")
      .trim()
      .notEmpty()
      .withMessage("Loại lệnh không được trống.")
      .isIn(["LO", "ATO", "ATC"])
      .withMessage("Loại lệnh không hợp lệ (chỉ LO, ATO, ATC)."),
    body("transactionPassword")
      .trim()
      .notEmpty()
      .withMessage("Mật khẩu giao dịch không được trống."),
    // Không cần check độ dài/phức tạp ở đây, chỉ cần check tồn tại
  ];
};

const cancelOrderValidationRules = () => [
  param("magd")
    .isInt({ gt: 0 })
    .withMessage("Mã giao dịch phải là một số nguyên dương."),
  // .toInt() // Chuyển đổi sang Int nếu cần
];

module.exports = {
  placeOrderValidationRules,
  cancelOrderValidationRules,
};
