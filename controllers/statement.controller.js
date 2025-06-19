/**
 * controllers/statement.controller.js
 * Controller for handling statement-related endpoints.
 */

const TradingService = require('../services/trading.service');
const StatementService = require('../services/statement.service');
const { validationResult } = require('express-validator');

/**
 * Controller lấy sao kê giao dịch lệnh cho NDT đang đăng nhập
 */
exports.getMyOrderStatement = async (req, res, next) => {
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
  const { tuNgay, denNgay } = req.query;
  const statement = await TradingService.getOrderStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

/**
 * Controller lấy sao kê lệnh khớp cho NDT đang đăng nhập
 */
exports.getMyMatchedOrderStatement = async (req, res, next) => {
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
  const { tuNgay, denNgay } = req.query;
  const statement = await TradingService.getMatchedOrderStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

/**
 * Controller lấy sao kê tiền mặt cho NDT đang đăng nhập
 */
exports.getMyCashStatement = async (req, res, next) => {
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
  const { tuNgay, denNgay } = req.query;
  const statement = await StatementService.getCashStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

/**
 * GET /api/statement/deposits-withdrawals?tuNgay=...&denNgay=...
 */
exports.getMyDepositWithdrawHistory = async (req, res, next) => {
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
  const { tuNgay, denNgay } = req.query;

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

/**
 * GET /api/statement/orders/today
 */
exports.getMyOrdersToday = async (req, res, next) => {
  const maNDT = req.user.id;
  try {
    const orders = await StatementService.getMyOrdersToday(maNDT);
    res.status(200).send(orders);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/statement/matched-orders/today
 */
exports.getMyMatchedOrdersToday = async (req, res, next) => {
  const maNDT = req.user.id;
  try {
    const orders = await StatementService.getMyMatchedOrdersToday(maNDT);
    res.status(200).send(orders);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/statement/accounts/:maTK/cash-statement-detail?tuNgay=...&denNgay=...
 */
exports.getMyAccountCashStatementDetail = async (req, res, next) => {
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
  const maTK = req.params.maTK;
  const { tuNgay, denNgay } = req.query;
  try {
    const statement = await StatementService.getAccountCashStatementDetail(
      maNDT,
      maTK,
      tuNgay,
      denNgay
    );
    res.status(200).send(statement);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/statement/bank-accounts
 */
exports.getMyBankAccounts = async (req, res, next) => {
  const maNDT = req.user.id;
  try {
    const bankAccounts = await StatementService.getMyBankAccounts(maNDT);
    res.status(200).send(bankAccounts);
  } catch (error) {
    next(error);
  }
};
