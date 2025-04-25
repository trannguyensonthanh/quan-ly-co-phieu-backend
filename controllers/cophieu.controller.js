// controllers/cophieu.controller.js
const StockService = require("../services/stock.service");
const TradingService = require("../services/trading.service");
const { validationResult } = require("express-validator"); // Sẽ dùng ở bước sau
const BadRequestError = require("../utils/errors/BadRequestError");

// Controller để tạo mới cổ phiếu
exports.create = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const performedBy = req.user?.id; // Lấy mã NV từ token nếu có

  try {
    // Vẫn nên giữ try-catch ở controller để bắt lỗi cuối cùng
    const newStock = await StockService.createStock(req.body, performedBy);
    res.status(201).send(newStock);
  } catch (error) {
    next(error); // Chuyển lỗi cho errorHandler
  }
};

// Controller để lấy tất cả cổ phiếu (cho NDT)
exports.findAll = async (req, res, next) => {
  try {
    const stocks = await StockService.getAllStocks(); // Gọi hàm đã lọc status
    res.status(200).send(stocks);
  } catch (error) {
    next(error);
  }
};

// Lấy tất cả cổ phiếu cho Admin (bao gồm các status)
exports.findAllForAdmin = async (req, res, next) => {
  try {
    const stocks = await StockService.getAllStocksForAdmin(); // Hàm mới lấy tất cả
    res.status(200).send(stocks);
  } catch (error) {
    next(error);
  }
};

// Controller để tìm một cổ phiếu theo MaCP
// Lấy chi tiết một cổ phiếu (bất kể status, cho admin xem)
exports.findOne = async (req, res, next) => {
  // Thêm validation cho param 'macp' ở route nếu chưa có
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maCP = req.params.macp;
  try {
    const stock = await StockService.getStockByMaCP(maCP); // Hàm này vẫn lấy đủ status
    res.status(200).send(stock);
  } catch (error) {
    next(error);
  }
};

// Controller để cập nhật cổ phiếu theo MaCP
exports.update = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maCP = req.params.macp;
  const performedBy = req.user?.id;
  const updateData = req.body; // Lấy dữ liệu cần cập nhật

  // Xóa các trường không được phép cập nhật trực tiếp qua API này
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
  // Thêm validation cho param 'macp'
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maCP = req.params.macp;
  const performedBy = req.user?.id;
  try {
    const result = await StockService.deleteStock(maCP, performedBy); // Service đã kiểm tra Status = 0
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

exports.listStock = async (req, res, next) => {
  // Thêm validation cho param 'macp' và body 'initialGiaTC'
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maCP = req.params.macp;
  const { initialGiaTC } = req.body; // Lấy giá TC ban đầu từ body
  const performedBy = req.user?.id;

  if (typeof initialGiaTC !== "number" || initialGiaTC <= 0) {
    return next(
      new BadRequestError(
        "Giá tham chiếu ban đầu (initialGiaTC) phải là số dương hợp lệ."
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

exports.delistStock = async (req, res, next) => {
  // Thêm validation cho param 'macp'
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
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

exports.undoLastAction = async (req, res, next) => {
  // Thêm validation cho param 'macp'
  console.log("Request body:", req.body || "No body provided");
  const performedBy = req.user?.id; // Có thể dùng để kiểm tra quyền undo
  console.log(`[CoPhieu Controller] Global Undo request by ${performedBy}`);
  try {
    // Gọi service mà không cần MaCP
    const result = await StockService.undoLastAction(performedBy);
    res.status(200).send(result);
  } catch (error) {
    // Nếu lỗi là BadRequest và có canRetryUndo=true, FE có thể tự động gọi lại Undo
    if (error instanceof BadRequestError && error.data?.canRetryUndo) {
      console.log(
        "Stale undo log detected and deleted, allowing potential retry."
      );
      // Trả về lỗi 400 để FE biết nhưng có thể thử lại
      return res
        .status(400)
        .json({ message: error.message, canRetryUndo: true });
    }
    next(error); // Chuyển lỗi khác cho errorHandler
  }
};

// --- Controller Lấy Sao Kê Lệnh Theo Mã Cổ Phiếu (cho Nhân Viên) ---
exports.getStockOrders = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maCP = req.params.macp;
  const { tuNgay, denNgay } = req.query;
  // --- Không cần try...catch ---
  const statement = await TradingService.getStockOrderStatement(
    maCP,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

// GET /api/cophieu/:macp/undo-info -> Lấy thông tin hành động có thể undo
exports.getLatestUndoInfo = async (req, res, next) => {
  // Dùng lại maCpParamValidationRules
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maCP = req.params.macp;
  console.log(`[CoPhieu Controller] Get Latest Undo Info request for ${maCP}`);

  try {
    const undoInfo = await StockService.getLatestUndoLog(maCP);
    if (!undoInfo) {
      // Trả về 404 nếu không có log nào để undo
      return res.status(404).send({
        message: `Không có hành động nào gần đây có thể hoàn tác cho mã CP '${maCP}'.`,
      });
    }
    // Kiểm tra thêm điều kiện có thể undo không (chưa có giá) - tùy chọn
    // const hasPrice = await LichSuGiaModel.checkIfPriceExists(maCP);
    // if (hasPrice) { ... return 400 ... }

    // Trả về thông tin log tìm thấy
    res.status(200).send(undoInfo);
  } catch (error) {
    next(error); // Chuyển lỗi cho errorHandler
  }
};

// --- THÊM CONTROLLER LẤY LỊCH SỬ GIÁ CP ---
// GET /api/cophieu/:macp/history?tuNgay=...&denNgay=...
exports.getStockPriceHistory = async (req, res, next) => {
  // Dùng validator kết hợp maCpParamValidation và dateRangeQueryValidation
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
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

// --- THÊM CONTROLLER LẤY LỊCH SỬ GIÁ GẦN ĐÂY ---
// GET /api/cophieu/:macp/history/recent?days=N
exports.getRecentStockPriceHistory = async (req, res, next) => {
  // Validator sẽ kiểm tra maCP (param) và days (query)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maCP = req.params.macp;
  const days = req.query.days; // Lấy số ngày từ query

  console.log(
    `[CoPhieu Controller] Get Recent Price History request for ${maCP}, last ${days} days`
  );
  try {
    const history = await StockService.getRecentStockPriceHistory(
      maCP,
      parseInt(days, 10)
    ); // Chuyển days sang số
    res.status(200).send(history);
  } catch (error) {
    next(error);
  }
};
