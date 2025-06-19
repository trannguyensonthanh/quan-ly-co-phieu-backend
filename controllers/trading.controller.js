/**
 * controllers/trading.controller.js
 * Controller xử lý các API giao dịch chứng khoán: đặt lệnh mua, bán, hủy, sửa lệnh.
 */
const TradingService = require('../services/trading.service');
const { validationResult } = require('express-validator');
const BadRequestError = require('../utils/errors/BadRequestError');
const AppError = require('../utils/errors/AppError');

const validSessionStates = ['PREOPEN', 'ATO', 'CONTINUOUS', 'ATC', 'CLOSED'];

/**
 * Controller đặt lệnh mua
 */
exports.placeBuyOrder = async (req, res, next) => {
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
  const orderData = req.body;
  const createdOrder = await TradingService.placeBuyOrder(maNDT, orderData);
  res
    .status(201)
    .send({ message: 'Đặt lệnh mua thành công.', order: createdOrder });
};

/**
 * Controller đặt lệnh bán
 */
exports.placeSellOrder = async (req, res, next) => {
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
  const orderData = req.body;
  const createdOrder = await TradingService.placeSellOrder(maNDT, orderData);
  res
    .status(201)
    .send({ message: 'Đặt lệnh bán thành công.', order: createdOrder });
};

/**
 * Controller hủy lệnh đặt
 */
exports.cancelOrder = async (req, res, next) => {
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
  const maNDTRequesting = req.user.id;
  const maGD = parseInt(req.params.magd, 10);
  const currentSessionState = req.query.sessionState;

  if (
    !currentSessionState ||
    !validSessionStates.includes(currentSessionState)
  ) {
    return next(
      new BadRequestError(
        `Trạng thái phiên không hợp lệ hoặc bị thiếu. Trạng thái hợp lệ: ${validSessionStates.join(
          ', '
        )}`
      )
    );
  }

  if (isNaN(maGD) || maGD <= 0) {
    return next(new BadRequestError('Mã giao dịch không hợp lệ.'));
  }

  if (!maNDTRequesting) {
    return next(new AppError('Không thể xác định người dùng yêu cầu.', 401));
  }

  try {
    const result = await TradingService.cancelOrder(
      maNDTRequesting,
      maGD,
      currentSessionState
    );
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Controller sửa lệnh đặt
 */
exports.modifyOrder = async (req, res, next) => {
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

  const maNDTRequesting = req.user.id;
  const maGD = parseInt(req.params.maGD, 10);
  const { newGia, newSoLuong } = req.body;

  if (
    (newGia === undefined || newGia === null) &&
    (newSoLuong === undefined || newSoLuong === null)
  ) {
    return next(
      new BadRequestError('Cần cung cấp giá mới hoặc số lượng mới để sửa lệnh.')
    );
  }

  const parsedGia =
    newGia !== undefined && newGia !== null ? parseFloat(newGia) : null;
  const parsedSoLuong =
    newSoLuong !== undefined && newSoLuong !== null
      ? parseInt(newSoLuong, 10)
      : null;

  if (parsedGia !== null && isNaN(parsedGia))
    return next(new BadRequestError('Giá mới không hợp lệ.'));
  if (parsedSoLuong !== null && isNaN(parsedSoLuong))
    return next(new BadRequestError('Số lượng mới không hợp lệ.'));

  try {
    const modifiedOrder = await TradingService.modifyOrder(
      maNDTRequesting,
      maGD,
      parsedGia,
      parsedSoLuong
    );
    res
      .status(200)
      .send({ message: `Sửa lệnh ${maGD} thành công.`, order: modifiedOrder });
  } catch (error) {
    next(error);
  }
};
