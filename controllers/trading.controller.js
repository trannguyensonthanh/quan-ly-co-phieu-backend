// controllers/trading.controller.js
const TradingService = require("../services/trading.service");
const { validationResult } = require("express-validator");
const BadRequestError = require("../utils/errors/BadRequestError"); // Import nếu cần

// Định nghĩa kiểu cho trạng thái phiên hợp lệ

const validSessionStates = ["PREOPEN", "ATO", "CONTINUOUS", "ATC", "CLOSED"];

// Controller đặt lệnh mua
exports.placeBuyOrder = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.user.id;
  const orderData = req.body;
  const createdOrder = await TradingService.placeBuyOrder(maNDT, orderData);
  res
    .status(201)
    .send({ message: "Đặt lệnh mua thành công.", order: createdOrder });
};

// Controller đặt lệnh bán
exports.placeSellOrder = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDT = req.user.id;
  const orderData = req.body;
  // --- Không cần try...catch ---
  const createdOrder = await TradingService.placeSellOrder(maNDT, orderData);
  res
    .status(201)
    .send({ message: "Đặt lệnh bán thành công.", order: createdOrder });
};

// Controller hủy lệnh đặt
exports.cancelOrder = async (req, res, next) => {
  // Thêm next
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const maNDTRequesting = req.user.id;
  const maGD = parseInt(req.params.magd, 10);
  // --- Lấy Trạng thái Phiên từ Query Parameter (Ví dụ) ---
  // Client sẽ gọi ví dụ: DELETE /api/trading/orders/123?sessionState=CONTINUOUS
  const currentSessionState = req.query.sessionState;

  // Kiểm tra xem sessionState có hợp lệ không
  if (
    !currentSessionState ||
    !validSessionStates.includes(currentSessionState)
  ) {
    return next(
      new BadRequestError(
        `Trạng thái phiên không hợp lệ hoặc bị thiếu. Trạng thái hợp lệ: ${validSessionStates.join(
          ", "
        )}`
      )
    );
  }

  // Kiểm tra lại maGD (dù validator đã check)
  if (isNaN(maGD) || maGD <= 0) {
    return next(new BadRequestError("Mã giao dịch không hợp lệ."));
  }

  // Đảm bảo có maNDT từ token
  if (!maNDTRequesting) {
    return next(new ApiError("Không thể xác định người dùng yêu cầu.", 401)); // Hoặc 403
  }

  try {
    // <<< GIỮ LẠI TRY...CATCH Ở CONTROLLER LÀ TỐT NHẤT >>>
    // Gọi service và truyền cả currentSessionState
    const result = await TradingService.cancelOrder(
      maNDTRequesting,
      maGD,
      currentSessionState
    );
    res.status(200).send(result); // Gửi kết quả thành công
  } catch (error) {
    // Chuyển lỗi (NotFound, BadRequest, Conflict, AppError từ service) cho errorHandler
    next(error);
  }
};

// --- THÊM CONTROLLER SỬA LỆNH ĐẶT ---
// PUT /api/trading/orders/:maGD
exports.modifyOrder = async (req, res, next) => {
  // Validator sẽ kiểm tra maGD (param) và newGia/newSoLuong (body)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const maNDTRequesting = req.user.id;
  const maGD = parseInt(req.params.maGD, 10); // Lấy từ param (đã sửa tên param)
  const { newGia, newSoLuong } = req.body; // Lấy giá và/hoặc số lượng mới

  // Kiểm tra xem có ít nhất một giá trị được gửi lên không
  if (
    (newGia === undefined || newGia === null) &&
    (newSoLuong === undefined || newSoLuong === null)
  ) {
    return next(
      new BadRequestError("Cần cung cấp giá mới hoặc số lượng mới để sửa lệnh.")
    );
  }

  // Chuyển đổi giá trị nếu cần (validator có thể đã làm)
  const parsedGia =
    newGia !== undefined && newGia !== null ? parseFloat(newGia) : null;
  const parsedSoLuong =
    newSoLuong !== undefined && newSoLuong !== null
      ? parseInt(newSoLuong, 10)
      : null;

  if (parsedGia !== null && isNaN(parsedGia))
    return next(new BadRequestError("Giá mới không hợp lệ."));
  if (parsedSoLuong !== null && isNaN(parsedSoLuong))
    return next(new BadRequestError("Số lượng mới không hợp lệ."));

  console.log(
    `[Trading Controller] Modify Order request for MaGD ${maGD} by NDT ${maNDTRequesting}`
  );
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
    next(error); // Chuyển lỗi cho errorHandler
  }
};
