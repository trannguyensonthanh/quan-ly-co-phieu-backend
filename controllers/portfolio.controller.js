// controllers/portfolio.controller.js
const { validationResult } = require("express-validator");
const NhaDauTuService = require("../services/nhadautu.service"); // Sử dụng lại service
const PortfolioService = require("../services/portfolio.service");

// Lấy số dư tiền của NDT đang đăng nhập
exports.getMyBalances = async (req, res, next) => {
  // Thêm next
  const maNDT = req.user.id;
  // --- Không cần try...catch ---
  const balances = await NhaDauTuService.getBalancesByNDT(maNDT);
  res.status(200).send(balances);
};

// Lấy danh mục cổ phiếu của NDT đang đăng nhập
exports.getMyPortfolio = async (req, res, next) => {
  // Thêm next
  const maNDT = req.user.id;
  // --- Không cần try...catch ---
  const portfolio = await NhaDauTuService.getPortfolioByNDT(maNDT);
  res.status(200).send(portfolio);
};

// --- THÊM CONTROLLER CHO NĐT TỰ RÚT TIỀN ---
// POST /api/portfolio/withdraw (Ví dụ endpoint)
exports.investorWithdraw = async (req, res, next) => {
  // Thêm validation cho body (maTK, soTien)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maNDT = req.user.id; // Lấy mã NĐT từ token
  const { maTK, soTien, ghiChu } = req.body;

  if (!maTK || typeof soTien !== "number" || soTien <= 0) {
    return next(
      new BadRequestError(
        "Mã tài khoản và số tiền rút (dương) hợp lệ là bắt buộc."
      )
    );
  }

  try {
    const result = await PortfolioService.withdrawByInvestor(
      maNDT,
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

// GET /api/portfolio/stocks/:maCP/quantity
exports.getStockQuantity = async (req, res, next) => {
  // Dùng maCpParamValidationRules
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maNDT = req.user.id; // Lấy từ token
  const maCP = req.params.maCP; // Lấy từ URL

  console.log(
    `[Portfolio Controller] Get stock quantity request for NDT ${maNDT}, CP ${maCP}`
  );
  try {
    const result = await PortfolioService.getStockQuantity(maNDT, maCP);
    res.status(200).send(result); // Trả về { maCP: '...', soLuong: ... }
  } catch (error) {
    next(error); // Chuyển lỗi cho errorHandler
  }
};
