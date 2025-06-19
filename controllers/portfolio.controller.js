/**
 * controllers/portfolio.controller.js
 * Controller cho các thao tác danh mục đầu tư của nhà đầu tư.
 */
const { validationResult } = require('express-validator');
const NhaDauTuService = require('../services/nhadautu.service');
const PortfolioService = require('../services/portfolio.service');
const BadRequestError = require('../utils/errors/BadRequestError');

/**
 * Lấy số dư tiền của NĐT đang đăng nhập
 */
exports.getMyBalances = async (req, res, next) => {
  const maNDT = req.user.id;
  const balances = await NhaDauTuService.getBalancesByNDT(maNDT);
  res.status(200).send(balances);
};

/**
 * Lấy danh mục cổ phiếu của NĐT đang đăng nhập
 */
exports.getMyPortfolio = async (req, res, next) => {
  const maNDT = req.user.id;
  const portfolio = await NhaDauTuService.getPortfolioByNDT(maNDT);
  res.status(200).send(portfolio);
};

/**
 * NĐT tự rút tiền
 * POST /api/portfolio/withdraw
 */
exports.investorWithdraw = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }

  const maNDT = req.user.id;
  const { maTK, soTien, ghiChu } = req.body;

  if (!maTK || typeof soTien !== 'number' || soTien <= 0) {
    return next(
      new BadRequestError(
        'Mã tài khoản và số tiền rút (dương) hợp lệ là bắt buộc.'
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
      .send({ message: 'Rút tiền thành công.', transaction: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy số lượng cổ phiếu của NĐT theo mã cổ phiếu
 * GET /api/portfolio/stocks/:maCP/quantity
 */
exports.getStockQuantity = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }

  const maNDT = req.user.id;
  const maCP = req.params.maCP;

  console.log(
    `[Portfolio Controller] Get stock quantity request for NDT ${maNDT}, CP ${maCP}`
  );
  try {
    const result = await PortfolioService.getStockQuantity(maNDT, maCP);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};
