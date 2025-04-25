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
    .trim()
    .isInt({ gt: 0 })
    .withMessage("Mã giao dịch phải là một số nguyên dương."),
  // .toInt() // Chuyển đổi sang Int nếu cần
];

// --- THÊM VALIDATOR CHO SỬA LỆNH ---
const modifyOrderValidationRules = () => [
  // Validate maGD từ URL param (tái sử dụng hoặc tạo mới)
  param("maGD") // Đổi tên param thành maGD cho nhất quán
    .isInt({ gt: 0 })
    .withMessage("Mã giao dịch phải là số nguyên dương.")
    .toInt(),

  // Validate các trường trong body (đều là optional, nhưng ít nhất 1 phải có)
  // .custom((value, { req }) => { // Kiểm tra ít nhất 1 trường có giá trị
  //     if ((req.body.newGia === undefined || req.body.newGia === null) &&
  //         (req.body.newSoLuong === undefined || req.body.newSoLuong === null)) {
  //         throw new Error('Phải cung cấp giá mới hoặc số lượng mới.');
  //     }
  //     return true;
  // }), // Bỏ check này, controller sẽ check dễ hơn

  body("newGia")
    .optional({ values: "null" }) // Cho phép null hoặc không gửi
    .isFloat({ gt: 0 })
    .withMessage("Giá mới phải là số dương (nếu có).")
    // Kiểm tra bội số 100 trong service
    .toFloat(),

  body("newSoLuong")
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("Số lượng mới phải là số nguyên dương (nếu có).")
    // Kiểm tra bội số 100 trong service
    // Kiểm tra >= đã khớp trong service
    .toInt(),
];

module.exports = {
  placeOrderValidationRules,
  cancelOrderValidationRules,
  modifyOrderValidationRules,
};
