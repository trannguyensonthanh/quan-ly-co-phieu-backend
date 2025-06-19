/**
 * controllers/adminBankAccount.controller.js
 * Controller for admin bank account management.
 */

const AdminService = require('../services/admin.service');
const { validationResult } = require('express-validator');
const BadRequestError = require('../utils/errors/BadRequestError');
const NotFoundError = require('../utils/errors/NotFoundError');
const ConflictError = require('../utils/errors/ConflictError');
const AppError = require('../utils/errors/AppError');

/**
 * GET /api/admin/bank-accounts
 * Lấy tất cả TKNH
 */
exports.getAllBankAccounts = async (req, res, next) => {
  try {
    const accounts = await AdminService.getAllBankAccounts();
    res.status(200).send(accounts);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/bank-accounts/:maTK
 * Lấy chi tiết 1 TKNH
 */
exports.getBankAccountById = async (req, res, next) => {
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

  const maTK = req.params.maTK;
  try {
    const account = await AdminService.getBankAccountByMaTK(maTK);
    res.status(200).send(account);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/bank-accounts
 * Tạo TKNH mới
 */
exports.createBankAccount = async (req, res, next) => {
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

  try {
    const newAccount = await AdminService.createBankAccount(req.body);
    res.status(201).send(newAccount);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/bank-accounts/:maTK
 * Cập nhật TKNH
 */
exports.updateBankAccount = async (req, res, next) => {
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

  const maTK = req.params.maTK;
  const { SoTien, MaNH } = req.body;
  const updateData = {};
  if (SoTien !== undefined) updateData.SoTien = SoTien;
  if (MaNH !== undefined) updateData.MaNH = MaNH;

  if (Object.keys(updateData).length === 0) {
    return res
      .status(400)
      .send({ message: 'Không có dữ liệu hợp lệ để cập nhật.' });
  }

  try {
    const updatedAccount = await AdminService.updateBankAccount(
      maTK,
      updateData
    );
    res.status(200).send(updatedAccount);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/bank-accounts/:maTK
 * Xóa TKNH
 */
exports.deleteBankAccount = async (req, res, next) => {
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

  const maTK = req.params.maTK;
  try {
    const result = await AdminService.deleteBankAccount(maTK);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};
