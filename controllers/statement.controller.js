// controllers/statement.controller.js
const TradingService = require("../services/trading.service"); // Sử dụng trading service
const StatementService = require("../services/statement.service"); // Đổi tên service nếu đã đổi
const { validationResult } = require("express-validator");

// Controller lấy sao kê giao dịch lệnh cho NDT đang đăng nhập
exports.getMyOrderStatement = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.user.id;
  const { tuNgay, denNgay } = req.query;
  // --- Không cần try...catch ---
  const statement = await TradingService.getOrderStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

// Controller lấy sao kê lệnh khớp (A.5) sẽ thêm vào đây sau
// Controller lấy sao kê lệnh khớp cho NDT đang đăng nhập
exports.getMyMatchedOrderStatement = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.user.id;
  const { tuNgay, denNgay } = req.query;
  // --- Không cần try...catch ---
  const statement = await TradingService.getMatchedOrderStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

// Controller lấy sao kê tiền mặt cho NDT đang đăng nhập
exports.getMyCashStatement = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.user.id;
  const { tuNgay, denNgay } = req.query;
  // --- Không cần try...catch ---
  const statement = await StatementService.getCashStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

// GET /api/statement/deposits-withdrawals?tuNgay=...&denNgay=...
exports.getMyDepositWithdrawHistory = async (req, res, next) => {
  // Dùng lại dateRangeQueryValidation
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maNDT = req.user.id; // Lấy từ token
  const { tuNgay, denNgay } = req.query;

  // Chuyển đổi kiểu hoặc để service xử lý
  // if (!tuNgay || !denNgay) {
  //     return next(new BadRequestError("Thiếu ngày bắt đầu hoặc kết thúc."));
  // }

  console.log(
    `[Statement Controller] Get My Deposit/Withdraw History request for NDT ${maNDT}`
  );
  try {
    const history = await StatementService.getDepositWithdrawHistory(
      maNDT,
      tuNgay,
      denNgay
    );
    res.status(200).send(history);
  } catch (error) {
    next(error);
  }
};

// GET /api/statement/orders/today
exports.getMyOrdersToday = async (req, res, next) => {
  const maNDT = req.user.id; // Lấy từ token
  console.log(
    `[Statement Controller] Get My Orders Today request for NDT ${maNDT}`
  );
  try {
    const orders = await StatementService.getMyOrdersToday(maNDT);
    res.status(200).send(orders);
  } catch (error) {
    next(error);
  }
};

// GET /api/statement/matched-orders/today => Lấy lệnh khớp hôm nay
exports.getMyMatchedOrdersToday = async (req, res, next) => {
  const maNDT = req.user.id; // Lấy từ token
  console.log(
    `[Statement Controller] Get My Matched Orders Today request for NDT ${maNDT}`
  );
  try {
    const orders = await StatementService.getMyMatchedOrdersToday(maNDT);
    res.status(200).send(orders);
  } catch (error) {
    next(error);
  }
};

// GET /api/statement/accounts/:maTK/cash-statement-detail?tuNgay=...&denNgay=...
exports.getMyAccountCashStatementDetail = async (req, res, next) => {
  // Validator sẽ kiểm tra maTK (param) và tuNgay/denNgay (query)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maNDT = req.user.id; // Lấy từ token
  const maTK = req.params.maTK; // Lấy từ URL
  const { tuNgay, denNgay } = req.query;
  console.log(
    `[Statement Controller] Get My Account Cash Statement Detail request for NDT ${maNDT}, Account ${maTK}`
  );
  try {
    // Gọi hàm service mới
    const statement = await StatementService.getAccountCashStatementDetail(
      maNDT,
      maTK,
      tuNgay,
      denNgay
    );
    res.status(200).send(statement); // Trả về mảng các dòng sao kê
  } catch (error) {
    next(error); // Chuyển lỗi cho errorHandler
  }
};
