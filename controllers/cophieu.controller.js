/**
 * controllers/cophieu.controller.js
 * Controller cho các API quản lý cổ phiếu
 */
const StockService = require('../services/stock.service');
const TradingService = require('../services/trading.service');
const { validationResult } = require('express-validator');
const BadRequestError = require('../utils/errors/BadRequestError');

// Controller để tạo mới cổ phiếu
exports.create = async (req, res, next) => {
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
  const performedBy = req.user?.id;

  try {
    const newStock = await StockService.createStock(req.body, performedBy);
    res.status(201).send(newStock);
  } catch (error) {
    next(error);
  }
};

// Controller để lấy tất cả cổ phiếu (cho NDT)
exports.findAll = async (req, res, next) => {
  try {
    const stocks = await StockService.getAllStocks();
    res.status(200).send(stocks);
  } catch (error) {
    next(error);
  }
};

// Lấy tất cả cổ phiếu cho Admin (bao gồm các status)
exports.findAllForAdmin = async (req, res, next) => {
  try {
    const stocks = await StockService.getAllStocksForAdmin();
    res.status(200).send(stocks);
  } catch (error) {
    next(error);
  }
};

// Controller để lấy tất cả cổ phiếu dựa vào status
exports.findByStatus = async (req, res, next) => {
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

  const status = req.params.status;

  try {
    const stocks = await StockService.getStocksByStatus(status);
    res.status(200).send(stocks);
  } catch (error) {
    next(error);
  }
};

// Controller để tìm một cổ phiếu theo MaCP
exports.findOne = async (req, res, next) => {
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
  const maCP = req.params.macp;
  try {
    const stock = await StockService.getStockByMaCP(maCP);
    res.status(200).send(stock);
  } catch (error) {
    next(error);
  }
};

// Controller để cập nhật cổ phiếu theo MaCP
exports.update = async (req, res, next) => {
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
  const maCP = req.params.macp;
  const performedBy = req.user?.id;
  const updateData = req.body;

  delete updateData.MaCP;
  delete updateData.Status;

  try {
    const updatedStock = await StockService.updateStock(
      maCP,
      updateData,
      performedBy
    );
    res.status(200).send(updatedStock);
  } catch (error) {
    next(error);
  }
};

// Controller để xóa cổ phiếu theo MaCP
exports.delete = async (req, res, next) => {
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
  const maCP = req.params.macp;
  const performedBy = req.user?.id;
  try {
    const result = await StockService.deleteStock(maCP, performedBy);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

// Controller để niêm yết cổ phiếu
exports.listStock = async (req, res, next) => {
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
  const maCP = req.params.macp;
  const { initialGiaTC } = req.body;
  const performedBy = req.user?.id;

  if (typeof initialGiaTC !== 'number' || initialGiaTC <= 0) {
    return next(
      new BadRequestError(
        'Giá tham chiếu ban đầu (initialGiaTC) phải là số dương hợp lệ.'
      )
    );
  }

  try {
    const result = await StockService.listStock(
      maCP,
      initialGiaTC,
      performedBy
    );
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

// Controller để hủy niêm yết cổ phiếu
exports.delistStock = async (req, res, next) => {
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
  const maCP = req.params.macp;
  const performedBy = req.user?.id;

  try {
    const result = await StockService.delistStock(maCP, performedBy);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

// Controller cho phép giao dịch trở lại
exports.relistStock = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maCP = req.params.maCP;
  const { giaTC } = req.body;
  const performedBy = req.user?.id;

  if (giaTC === undefined || giaTC === null) {
    return next(new BadRequestError('Giá tham chiếu mới (giaTC) là bắt buộc.'));
  }

  console.log(
    `[CoPhieu Controller] Relist Stock request for ${maCP} by ${performedBy}`
  );
  try {
    const result = await StockService.relistStock(
      maCP,
      parseFloat(giaTC),
      performedBy
    );
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

// Controller hoàn tác hành động gần nhất
exports.undoLastAction = async (req, res, next) => {
  console.log('Request body:', req.body || 'No body provided');
  const performedBy = req.user?.id;
  console.log(`[CoPhieu Controller] Global Undo request by ${performedBy}`);
  try {
    const result = await StockService.undoLastAction(performedBy);
    res.status(200).send(result);
  } catch (error) {
    if (error instanceof BadRequestError && error.data?.canRetryUndo) {
      console.log(
        'Stale undo log detected and deleted, allowing potential retry.'
      );
      return res
        .status(400)
        .json({ message: error.message, canRetryUndo: true });
    }
    next(error);
  }
};

// Controller lấy sao kê lệnh đặt theo mã cổ phiếu (cho Nhân Viên)
exports.getStockOrders = async (req, res, next) => {
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
  const maCP = req.params.macp;
  const { tuNgay, denNgay } = req.query;
  const statement = await TradingService.getStockOrderStatement(
    maCP,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

// Controller lấy thông tin hành động có thể undo
exports.getLatestUndoInfo = async (req, res, next) => {
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
  const maCP = req.params.macp;
  console.log(`[CoPhieu Controller] Get Latest Undo Info request for ${maCP}`);

  try {
    const undoInfo = await StockService.getLatestUndoLog(maCP);
    if (!undoInfo) {
      return res.status(404).send({
        message: `Không có hành động nào gần đây có thể hoàn tác cho mã CP '${maCP}'.`,
      });
    }
    res.status(200).send(undoInfo);
  } catch (error) {
    next(error);
  }
};

// Controller lấy lịch sử giá cổ phiếu
exports.getStockPriceHistory = async (req, res, next) => {
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

  const maCP = req.params.macp;
  const { tuNgay, denNgay } = req.query;

  console.log(
    `[CoPhieu Controller] Get Price History request for ${maCP}: ${tuNgay} - ${denNgay}`
  );
  try {
    const history = await StockService.getStockPriceHistory(
      maCP,
      tuNgay,
      denNgay
    );
    res.status(200).send(history);
  } catch (error) {
    next(error);
  }
};

// Controller lấy lịch sử giá gần đây
exports.getRecentStockPriceHistory = async (req, res, next) => {
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

  const maCP = req.params.macp;
  const days = req.query.days;

  console.log(
    `[CoPhieu Controller] Get Recent Price History request for ${maCP}, last ${days} days`
  );
  try {
    const history = await StockService.getRecentStockPriceHistory(
      maCP,
      parseInt(days, 10)
    );
    res.status(200).send(history);
  } catch (error) {
    next(error);
  }
};

// Controller lấy tổng số lượng đã phân bổ
exports.getTotalDistributedQuantity = async (req, res, next) => {
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
  const maCP = req.params.macp;
  console.log(
    `[CoPhieu Controller] Get Total Distributed Quantity request for ${maCP}`
  );
  try {
    const result = await StockService.getTotalDistributedQuantity(maCP);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

// Controller lấy danh sách cổ đông
exports.getShareholders = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maCP = req.params.macp;
  console.log(`[CoPhieu Controller] Get Shareholders request for ${maCP}`);
  try {
    const shareholders = await StockService.getShareholders(maCP);
    res.status(200).send(shareholders);
  } catch (error) {
    next(error);
  }
};
