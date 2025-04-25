// controllers/nhadautu.controller.js
const NhaDauTuService = require("../services/nhadautu.service");
const { validationResult } = require("express-validator");
const StatementService = require("../services/statement.service"); // Import StatementService
const BadRequestError = require("../utils/errors/BadRequestError");
const InvestorService = require("../services/investor.service");
const GiaoDichTien = require("../models/GiaoDichTien.model");
const AuthorizationError = require("../utils/errors/AuthorizationError");
// --- Controller cho Nhà Đầu Tư ---
// => dùng để tạo mới
exports.createNDT = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // --- Không cần try...catch ---
  const newNDT = await NhaDauTuService.createNDT(req.body);
  res.status(201).send(newNDT);
};

// => dùng để lấy tất cả NDT
exports.findAllNDT = async (req, res, next) => {
  const ndts = await NhaDauTuService.getAllNDT();
  res.status(200).send(ndts);
};

// => dùng để tìm một NDT theo MaNDT
exports.findOneNDT = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;

  const ndt = await NhaDauTuService.getNDTDetails(maNDT);
  res.status(200).send(ndt);
};

exports.updateNDT = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;
  const { MaNDT, CMND, MKGD, ...updateData } = req.body;

  const updatedNDT = await NhaDauTuService.updateNDT(maNDT, updateData);
  res.status(200).send(updatedNDT);
};

exports.deleteNDT = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;
  // --- Không cần try...catch ---
  const result = await NhaDauTuService.deleteNDT(maNDT);
  res.status(200).send(result);
};

// --- Controller cho Tài Khoản Ngân Hàng ---
exports.findTKNHByNDT = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;
  // --- Không cần try...catch ---
  const tknhList = await NhaDauTuService.getTKNHByNDT(maNDT);
  res.status(200).send(tknhList);
};

exports.addTKNH = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;
  // --- Không cần try...catch ---
  const newTKNH = await NhaDauTuService.addTKNH(maNDT, req.body);
  res.status(201).send(newTKNH);
};

// exports.updateTKNH = async (req, res, next) => {
//   // Thêm next
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ errors: errors.array() });
//   }
//   const maTK = req.params.matk;
//   const { SoTien, MaNH } = req.body;
//   const updateData = {};
//   if (SoTien !== undefined) updateData.SoTien = SoTien;
//   if (MaNH !== undefined) updateData.MaNH = MaNH;

//   if (Object.keys(updateData).length === 0) {
//     // Validation đơn giản
//     return next(new BadRequestError("Không có dữ liệu hợp lệ để cập nhật."));
//   }
//   // --- Không cần try...catch ---
//   const updatedTKNH = await NhaDauTuService.updateTKNH(maTK, updateData);
//   res.status(200).send(updatedTKNH);
// };

// exports.deleteTKNH = async (req, res, next) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ errors: errors.array() });
//   }
//   const maTK = req.params.matk;
//   const result = await NhaDauTuService.deleteTKNH(maTK);
//   res.status(200).send(result);
// };

// --- Controller Tra cứu cho Nhân Viên ---

// Lấy số dư tiền của NDT (cho Nhân viên)
exports.getNDTBalances = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;
  // --- Không cần try...catch ---
  const balances = await NhaDauTuService.getBalancesByNDT(maNDT);
  res.status(200).send(balances);
};

// Lấy danh mục cổ phiếu của NDT (cho Nhân viên)
exports.getNDTPortfolio = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;
  // --- Không cần try...catch ---
  const portfolio = await NhaDauTuService.getPortfolioByNDT(maNDT);
  res.status(200).send(portfolio);
};

// Controller lấy sao kê giao dịch lệnh của một NDT (cho Nhân Viên)
exports.getInvestorOrderStatement = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;
  const { tuNgay, denNgay } = req.query;
  // --- Không cần try...catch ---
  const statement = await TradingService.getInvestorOrderStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

// Controller lấy sao kê lệnh khớp của một NDT (cho Nhân Viên)
exports.getInvestorMatchedOrderStatement = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;
  const { tuNgay, denNgay } = req.query;
  // --- Không cần try...catch ---
  const statement = await TradingService.getInvestorMatchedOrderStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

// Controller lấy sao kê tiền mặt của một NDT (cho Nhân Viên)
exports.getInvestorCashStatement = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.params.mandt;
  const { tuNgay, denNgay } = req.query;
  // --- Không cần try...catch ---
  const statement = await StatementService.getInvestorCashStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

// POST /api/nhadautu/accounts/deposit (Ví dụ endpoint)
exports.adminDeposit = async (req, res, next) => {
  // Thêm validation cho body nếu cần (maTK, soTien required, soTien > 0)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  console.log("Admin deposit request:", req.body); // Debug log
  const maNVThucHien = req.user.id; // Lấy mã NV từ token
  const { maTK, soTien, ghiChu } = req.body;

  // Validate lại ở controller (phòng trường hợp validator chưa đủ)
  if (!maTK || typeof soTien !== "number" || soTien <= 0) {
    return next(
      new BadRequestError(
        "Mã tài khoản và số tiền nạp (dương) hợp lệ là bắt buộc."
      )
    );
  }

  try {
    const result = await InvestorService.depositByAdmin(
      maNVThucHien,
      maTK,
      soTien,
      ghiChu
    );
    res
      .status(200)
      .send({ message: "Nạp tiền thành công.", transaction: result });
  } catch (error) {
    next(error); // Chuyển lỗi cho errorHandler xử lý
  }
};

// POST /api/nhadautu/accounts/withdraw (Ví dụ endpoint)
exports.adminWithdraw = async (req, res, next) => {
  // Thêm validation cho body
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maNVThucHien = req.user.id;
  const { maTK, soTien, ghiChu } = req.body;

  if (!maTK || typeof soTien !== "number" || soTien <= 0) {
    return next(
      new BadRequestError(
        "Mã tài khoản và số tiền rút (dương) hợp lệ là bắt buộc."
      )
    );
  }

  try {
    const result = await InvestorService.withdrawByAdmin(
      maNVThucHien,
      maTK,
      soTien,
      ghiChu
    );
    res
      .status(200)
      .send({ message: "Rút tiền thành công.", transaction: result });
  } catch (error) {
    next(error);
  }
};

// GET /api/nhadautu/:mandt/statement/deposits-withdrawals?tuNgay=...&denNgay=...
exports.getInvestorDepositWithdrawHistory = async (req, res, next) => {
  // Dùng validator kết hợp maNdtParamValidation và dateRangeQueryValidation
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maNDT = req.params.mandt;
  const { tuNgay, denNgay } = req.query;

  console.log(
    `[NDT Controller] Get Deposit/Withdraw History request for NDT ${maNDT} by Admin`
  );
  try {
    // Gọi cùng hàm service như NĐT tự xem
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

// GET /api/nhadautu/:mandt/accounts/:maTK/cash-statement-detail?tuNgay=...&denNgay=...
exports.getInvestorAccountCashStatementDetail = async (req, res, next) => {
  // Validator sẽ kiểm tra mandt, maTK (param) và tuNgay/denNgay (query)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maNDT = req.params.mandt; // Mã NĐT cần xem
  const maTK = req.params.maTK; // Mã TK cần xem
  const { tuNgay, denNgay } = req.query;
  const role = req.user.role; // Lấy role từ token (Admin hay NĐT)
  console.log(
    `[NDT Controller] Get Account Cash Statement Detail request for NDT ${maNDT}, Account ${maTK} by Admin`
  );
  try {
    // Gọi cùng hàm service, truyền MaNDT từ param vào để check quyền sở hữu (dù Admin có thể xem mọi TK)
    // Hoặc tạo hàm service riêng cho Admin không cần check quyền sở hữu maTK/maNDT
    const statement = await StatementService.getAccountCashStatementDetail(
      maNDT,
      maTK,
      tuNgay,
      denNgay,
      role
    );
    res.status(200).send(statement);
  } catch (error) {
    // Nếu lỗi AuthorizationError từ service (do maTK ko thuộc maNDT), có thể bỏ qua lỗi này cho Admin
    if (error instanceof AuthorizationError) {
      console.warn(
        `Authorization bypassed for Admin viewing account ${maTK} of NDT ${maNDT}`
      );
      // Có thể gọi lại service hoặc model trực tiếp bỏ qua check quyền
      // Tạm thời vẫn trả lỗi để đơn giản
      return next(error);
    }
    next(error);
  }
};
