/**
 * controllers/nganHang.controller.js
 * Controller for bank management APIs.
 */

const NganHangService = require('../services/nganHang.service');
const { validationResult } = require('express-validator');
const AppError = require('../utils/errors/AppError');

/**
 * Lấy danh sách tất cả ngân hàng
 */
exports.getAllBanks = async (req, res, next) => {
  console.log('[Bank Controller] Request to get all banks.');
  try {
    const banks = await NganHangService.getAllBanks();
    res.status(200).send(banks);
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy chi tiết một ngân hàng
 */
exports.getBankById = async (req, res, next) => {
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
  const maNH = req.params.maNH;
  console.log(`[Bank Controller] Request to get bank: ${maNH}`);
  try {
    const bank = await NganHangService.getBankByMaNH(maNH);
    res.status(200).send(bank);
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo mới ngân hàng
 */
exports.createBank = async (req, res, next) => {
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
  console.log('[Bank Controller] Request to create bank:', req.body);
  try {
    const newBank = await NganHangService.createBank(req.body);
    res.status(201).send(newBank);
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật ngân hàng
 */
exports.updateBank = async (req, res, next) => {
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
  const maNH = req.params.maNH;
  const { MaNH, ...updateData } = req.body;
  console.log(
    `[Bank Controller] Request to update bank ${maNH} with data:`,
    updateData
  );

  try {
    const updatedBank = await NganHangService.updateBank(maNH, updateData);
    res.status(200).send(updatedBank);
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa ngân hàng
 */
exports.deleteBank = async (req, res, next) => {
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
  const maNH = req.params.maNH;
  console.log(`[Bank Controller] Request to delete bank: ${maNH}`);
  try {
    const result = await NganHangService.deleteBank(maNH);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};
