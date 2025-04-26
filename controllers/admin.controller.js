// controllers/admin.controller.js
const AdminService = require("../services/admin.service");
const { validationResult } = require("express-validator");
const dbConfig = require("../config/db.config");
const BadRequestError = require("../utils/errors/BadRequestError");
const AppError = require("../utils/errors/AppError");
const marketState = require("../marketState"); // <<< Import module trạng thái
const TradingService = require("../services/trading.service");
const { startAutoProcess, stopAutoProcess } = require("../autoMarketProcess");
const {
  startAutoScheduler,
  stopAutoScheduler,
} = require("../autoMarketScheduler");
// Controller tạo login
// exports.createLogin = async (req, res, next) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ errors: errors.array() });
//   }
//   const { targetUserId, password, role } = req.body; // targetUserId là MaNV/MaNDT
//   const result = await AdminService.createApplicationUser(
//     targetUserId,
//     password,
//     role
//   );
//   res.status(201).send(result);
// };

// Controller tạo tài khoản NDT hoặc NV (thay thế createLogin cũ)
exports.createAccount = async (req, res, next) => {
  // --- Thêm Validator cho Route này ---
  // Cần validator mới kiểm tra tất cả các trường:
  // username (MaNDT/MaNV), HoTen, password, Email (optional), NgaySinh (optional),
  // DiaChi, Phone, CMND, GioiTinh, role ('NhaDauTu' hoặc 'Nhanvien')
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Dữ liệu đầu vào không hợp lệ.",
      errors: errors.array(),
    });
  }

  const {
    username, // Thực tế là MaNDT hoặc MaNV
    HoTen,
    password, // Mật khẩu gốc
    Email,
    NgaySinh,
    DiaChi,
    Phone,
    CMND,
    GioiTinh,
    role, // 'NhaDauTu' hoặc 'Nhanvien'
  } = req.body;

  const performedBy = req.user?.id; // Admin đang thực hiện

  try {
    let result;
    // Dựa vào role để gọi service tương ứng
    if (role === "NhaDauTu") {
      console.log(`[Admin Create] Request to create NhaDauTu: ${username}`);
      const ndtData = {
        MaNDT: username,
        HoTen,
        MKGD: password,
        Email,
        NgaySinh,
        DiaChi,
        Phone,
        CMND,
        GioiTinh,
      };
      // Gọi service tạo NDT (cần đảm bảo service này hash MKGD)
      // InvestorService hiện có createNDT, nhưng nó nhận MKGD đã hash? Cần kiểm tra lại.
      // TỐT NHẤT: Tạo hàm mới trong AdminService để xử lý cả tạo NDT/NV và hash password.
      result = await AdminService.createInvestorAccount(
        ndtData,
        password,
        performedBy
      );
    } else if (role === "NhanVien") {
      console.log(`[Admin Create] Request to create NhanVien: ${username}`);
      const nvData = {
        MaNV: username,
        HoTen,
        Email,
        NgaySinh,
        DiaChi,
        Phone,
        CMND,
        GioiTinh,
      };
      // Gọi service tạo NhanVien (cần tạo service này)
      // TỐT NHẤT: Tạo hàm mới trong AdminService.
      result = await AdminService.createStaffAccount(
        nvData,
        password,
        performedBy
      );
    } else {
      // Trường hợp role không hợp lệ (dù validator đã check)
      throw new BadRequestError("Vai trò người dùng không hợp lệ.");
    }

    res.status(201).send({
      message: `Tài khoản ${role} '${username}' đã được tạo thành công.`,
      user: result,
    });
  } catch (error) {
    next(error); // Chuyển lỗi cho errorHandler
  }
};

// Controller xóa login
exports.deleteLogin = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const loginName = req.params.loginname; // loginName là MaNV/MaNDT
  const result = await AdminService.clearUserPassword(loginName); // Gọi hàm service đã sửa
  res.status(200).send(result);
};

// Controller TẠO DEVICE (MỚI)
exports.createDevice = async (req, res, next) => {
  // Thêm next
  console.log("Create backup device request received.");
  // --- Không cần try...catch ---
  const result = await AdminService.createBackupDevice();
  res.status(200).send(result);
};

// Controller thực hiện backup (Sửa để gọi hàm mới)
exports.backup = async (req, res, next) => {
  // Thêm next
  const deleteAllOld = req.body.deleteAllOld === true;
  console.log(`Backup request received. Delete old backups: ${deleteAllOld}`);
  // --- Không cần try...catch ---
  const result = await AdminService.performBackup(deleteAllOld); // Truyền trạng thái checkbox
  res.status(200).send(result); // Trả về thông tin backup mới
};

// Controller thực hiện restore (Sửa để nhận backupFileName và pointInTime)
exports.restore = async (req, res, next) => {
  // Thêm next
  // Lấy tên file backup và thời điểm từ body
  const { backupFileName, pointInTime } = req.body;

  // Validation cơ bản
  if (!backupFileName) {
    return next(
      new BadRequestError(
        "Vui lòng cung cấp tên file sao lưu (backupFileName) để phục hồi."
      )
    );
  }

  console.log(
    `Restore request received for file [${backupFileName}]${
      pointInTime ? ` to time [${pointInTime}]` : " (Full Restore)"
    }`
  );
  // --- Không cần try...catch ---
  const result = await AdminService.performRestore(backupFileName, pointInTime); // Truyền cả 2 tham số
  res.status(200).send(result);
};

// Controller Lấy Lịch sử Sao lưu (MỚI)
exports.getBackupHistory = async (req, res, next) => {
  // Thêm next
  // --- Không cần try...catch ---
  const history = await AdminService.getBackupHistory();
  res.status(200).send(history); // Trả về mảng lịch sử
};

// --- THÊM CONTROLLERS CHO TRIGGER PHIÊN VÀ CHUẨN BỊ GIÁ ---

// POST /api/admin/market/trigger-ato
exports.triggerATO = async (req, res, next) => {
  // Body có thể chứa danh sách MaCP cần trigger hoặc để trống (trigger tất cả)
  console.log(`[CONTROLLER] Trigger ATO SESSION request received.`);

  const currentState = marketState.getMarketSessionState();
  if (currentState !== "PREOPEN") {
    // Chỉ nên trigger ATO từ PREOPEN
    console.warn(
      `[CONTROLLER] ATO trigger attempted in wrong state: ${currentState}`
    );
    // return next(new BadRequestError(`Không thể trigger ATO khi phiên đang ở trạng thái ${currentState}. Yêu cầu PREOPEN.`));
    // Hoặc cho phép trigger bất cứ lúc nào để test
  }

  try {
    // Chuyển trạng thái sang ATO TRƯỚC KHI chạy khớp lệnh
    marketState.setMarketSessionState("ATO");

    // TODO: Nếu trigger ALL, cần lặp qua danh sách MaCP đang Status=1 và gọi service cho từng mã
    // const result = await TradingService.triggerATOMatching(maCP); => nếu gọi theo maCP
    const result = await TradingService.triggerATOMatchingSession();
    // Sau khi ATO xong, tự động chuyển sang Liên tục
    marketState.setMarketSessionState("CONTINUOUS");
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/market/trigger-atc
exports.triggerATC = async (req, res, next) => {
  console.log(`[CONTROLLER] Trigger ATC SESSION request received.`);

  const currentState = marketState.getMarketSessionState();
  if (currentState !== "CONTINUOUS") {
    // Chỉ nên trigger ATC từ CONTINUOUS
    console.warn(
      `[CONTROLLER] ATC trigger attempted in wrong state: ${currentState}`
    );
    // return next(new BadRequestError(`Không thể trigger ATC khi phiên đang ở trạng thái ${currentState}. Yêu cầu CONTINUOUS.`));
  }
  try {
    // Chuyển trạng thái sang ATC TRƯỚC KHI chạy khớp lệnh
    marketState.setMarketSessionState("ATC");

    // const result = await TradingService.triggerATCMatching(maCP); // => nếu gọi theo maCP
    const result = await TradingService.triggerATCMatchingSession(); // => nếu gọi theo session
    marketState.setMarketSessionState("CLOSED");
    console.log(`[CONTROLLER] Market state set to CLOSED after ATC `);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/market/prepare-prices
exports.prepareNextDayPrices = async (req, res, next) => {
  console.log(`[CONTROLLER] Prepare next day prices request received.`);
  const currentState = marketState.getMarketSessionState(); // Retrieve the current market state
  // Chỉ nên cho chuẩn bị giá khi thị trường đã đóng cửa
  // if (currentState !== "CLOSED") {
  //   console.warn(
  //     `[CONTROLLER] Prepare prices attempted in wrong state: ${currentState}`
  //   );
  //   return next(
  //     new BadRequestError(
  //       `Chỉ có thể chuẩn bị giá khi thị trường đã đóng cửa (CLOSED).`
  //     )
  //   );
  // }
  try {
    const result = await AdminService.prepareNextDayPrices();
    // Sau khi chuẩn bị giá xong, chuyển trạng thái sang PREOPEN cho ngày mới
    marketState.setMarketSessionState("PREOPEN");
    console.log(
      `[CONTROLLER] Market state set to PREOPEN after preparing prices.`
    );
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

// --- THÊM CONTROLLERS ĐIỀU KHIỂN CHẾ ĐỘ ---

// POST /api/admin/market/mode/auto
exports.setModeAuto = (req, res, next) => {
  console.log("[CONTROLLER] Setting market mode to AUTO.");
  if (marketState.setOperatingMode("AUTO")) {
    startAutoScheduler(); // <<< Gọi hàm start khi bật AUTO
    res.status(200).send({
      message:
        "Chế độ thị trường đã đặt thành Tự động. Tiến trình tự động đã được kích hoạt.",
    });
  } else {
    next(new AppError("Không thể đặt chế độ Tự động.", 500));
  }
};

// POST /api/admin/market/mode/manual
exports.setModeManual = (req, res, next) => {
  console.log("[CONTROLLER] Setting market mode to MANUAL.");
  if (marketState.setOperatingMode("MANUAL")) {
    stopAutoScheduler(); // <<< Gọi hàm stop khi bật MANUAL
    res
      .status(200)
      .send({
        message:
          "Chế độ thị trường đã đặt thành Thủ công. Tiến trình tự động đã dừng.",
      });
  } else {
    next(new AppError("Không thể đặt chế độ Thủ công.", 500));
  }
};

// GET /api/admin/market/status -> Lấy trạng thái và chế độ hiện tại
exports.getMarketStatus = (req, res, next) => {
  try {
    const mode = marketState.getOperatingMode();
    const state = marketState.getMarketSessionState();
    res.status(200).send({ operatingMode: mode, sessionState: state });
  } catch (error) {
    next(new AppError("Lỗi khi lấy trạng thái thị trường.", 500));
  }
};

/**
 * Controller lấy danh sách tất cả Nhân viên và Nhà đầu tư.
 */
exports.getAllUsers = async (req, res, next) => {
  console.log("[CONTROLLER] Get all users request received.");
  try {
    const users = await AdminService.getAllUsers();
    res.status(200).send(users);
  } catch (error) {
    next(error); // Chuyển lỗi cho errorHandler
  }
};

// --- THÊM CONTROLLER MỚI: Admin cập nhật tài khoản ---
// PUT /api/admin/accounts/:accountId
exports.updateAccount = async (req, res, next) => {
  // Thêm validator cho route này để kiểm tra accountId và các trường trong body
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const accountId = req.params.accountId;
  const { role, ...updateData } = req.body; // Lấy role và dữ liệu cập nhật

  console.log(role);

  // Xóa các trường không được phép sửa đổi qua API này
  delete updateData.MaNV;
  delete updateData.username;
  delete updateData.password; // Không sửa password ở đây
  delete updateData.MKGD;
  delete updateData.PasswordHash;

  if (!role || (role !== "NhaDauTu" && role !== "NhanVien")) {
    return next(
      new BadRequestError(
        "Trường 'role' ('NhaDauTu' hoặc 'Nhanvien') là bắt buộc trong body."
      )
    );
  }
  if (Object.keys(updateData).length === 0) {
    return next(new BadRequestError("Không có dữ liệu hợp lệ để cập nhật."));
  }

  try {
    const updatedUser = await AdminService.updateUserAccount(
      accountId,
      role,
      updateData
    );
    res.status(200).send(updatedUser);
  } catch (error) {
    next(error); // Chuyển lỗi cho errorHandler
  }
};

// --- THÊM CONTROLLER MỚI: Admin xóa tài khoản ---
// DELETE /api/admin/accounts/:accountId?role=NhaDauTu|Nhanvien
exports.deleteAccount = async (req, res, next) => {
  // Thêm validator cho route này để kiểm tra accountId (param) và role (query)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Nếu có lỗi validation, trả về 400 và dừng lại ngay
    return res.status(400).json({ errors: errors.array() });
  }

  const accountId = req.params.accountId;
  const role = req.query.role; // Lấy role từ query param

  if (!role || (role !== "NhaDauTu" && role !== "NhanVien")) {
    return next(
      new BadRequestError(
        "Tham số 'role' ('NhaDauTu' hoặc 'NhanVien') trong query string là bắt buộc."
      )
    );
  }

  try {
    const result = await AdminService.deleteUserAccount(accountId, role);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/cash-transactions?tuNgay=...&denNgay=...
exports.getAllCashTransactions = async (req, res, next) => {
  // Dùng lại dateRangeQueryValidation từ statementValidator
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { tuNgay, denNgay } = req.query;

  console.log(
    `[Admin Controller] Get All Cash Transactions request: ${tuNgay} - ${denNgay}`
  );
  try {
    const history = await AdminService.getAllCashTransactions(tuNgay, denNgay);
    res.status(200).send(history);
  } catch (error) {
    next(error);
  }
};

// --- THÊM CONTROLLER LẤY TẤT CẢ UNDO LOG ---
// GET /api/admin/undo-logs
exports.getAllUndoLogs = async (req, res, next) => {
  // Có thể lấy tham số phân trang từ req.query nếu cần
  const options = {
    limit: parseInt(req.query.limit) || 100, // Mặc định 100 logs
    offset: parseInt(req.query.offset) || 0,
  };
  console.log(
    "[Admin Controller] Get All Undo Logs request, options:",
    options
  );
  try {
    const logs = await AdminService.getAllUndoLogs(options);
    res.status(200).send(logs);
  } catch (error) {
    next(error);
  }
};

// --- THÊM CONTROLLER TRIGGER KHỚP LỆNH LIÊN TỤC ---
// POST /api/admin/market/trigger-continuous
exports.triggerContinuous = async (req, res, next) => {
  console.log(`[CONTROLLER] Trigger Continuous Matching request received.`);

  // (Tùy chọn) Kiểm tra trạng thái phiên nếu muốn giới hạn
  // const currentState = marketState.getMarketSessionState();
  // if (currentState !== 'CONTINUOUS') {
  //     return next(new BadRequestError(`Khớp lệnh liên tục chỉ nên được trigger trong phiên CONTINUOUS (Hiện tại: ${currentState})`));
  // }

  try {
    // --- QUAN TRỌNG: Xử lý xung đột với tiến trình tự động ---
    // Cách 1: Tạm dừng tiến trình tự động (nếu đang chạy AUTO)
    // const { stopAutoProcess, startAutoProcess } = require('../autoMarketProcess'); // Cần import đúng
    // const originalMode = marketState.getOperatingMode();
    // let stopped = false;
    // if (originalMode === 'AUTO') {
    //     stopAutoProcess();
    //     stopped = true;
    //     console.log('[CONTROLLER TRIGGER CONTINUOUS] Temporarily stopped auto process.');
    // }

    // Gọi service thực hiện khớp lệnh
    const result = await TradingService.triggerContinuousMatchingSession();

    // Cách 1 (tiếp): Khởi động lại tiến trình tự động nếu đã dừng
    // if (stopped) {
    //     startAutoProcess();
    //     console.log('[CONTROLLER TRIGGER CONTINUOUS] Resumed auto process.');
    // }

    // Cách 2: Không dừng/bật mà dựa vào cờ isAutoProcessing (đơn giản hơn)
    // Service khớp lệnh có thể tự check cờ này, nhưng trigger thủ công
    // có thể vẫn chạy song song nếu không đợi. Cách 1 an toàn hơn.

    res.status(200).send(result); // Trả về kết quả tổng hợp
  } catch (error) {
    // Xử lý lỗi nếu có và đảm bảo tiến trình tự động được bật lại nếu đã tắt (Cách 1)
    // if (stopped) { startAutoProcess(); }
    next(error);
  }
};

// GET /api/admin/orders/all?tuNgay=...&denNgay=...
exports.getAllOrders = async (req, res, next) => {
  // Dùng lại dateRangeQueryValidation
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { tuNgay, denNgay } = req.query;

  console.log(
    `[Admin Controller] Get All Orders request: ${tuNgay} - ${denNgay}`
  );
  try {
    const orders = await AdminService.getAllOrders(tuNgay, denNgay);
    res.status(200).send(orders);
  } catch (error) {
    next(error);
  }
};

// --- THÊM CONTROLLER ADMIN ĐẶT LẠI MẬT KHẨU ---
// PUT /api/admin/accounts/:accountId/reset-password
exports.resetPassword = async (req, res, next) => {
  // Thêm validator cho route này
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const accountId = req.params.accountId;
  const { role, newPassword, confirmPassword } = req.body; // Lấy role và mật khẩu mới từ body
  const performedBy = req.user?.id;

  // Kiểm tra role hợp lệ (dù validator đã làm)
  if (!role || (role !== "NhaDauTu" && role !== "NhanVien")) {
    return next(
      new BadRequestError(
        "Trường 'role' ('NhaDauTu' hoặc 'Nhanvien') là bắt buộc trong body."
      )
    );
  }
  // Kiểm tra mật khẩu khớp
  if (!newPassword || newPassword !== confirmPassword) {
    return next(
      new BadRequestError(
        "Mật khẩu mới và xác nhận mật khẩu không khớp hoặc bị thiếu."
      )
    );
  }
  // Kiểm tra độ dài/phức tạp mật khẩu mới (validator đã làm)

  console.log(
    `[Admin Controller] Reset password request for ${role} ${accountId}`
  );
  try {
    const result = await AdminService.resetUserPassword(
      accountId,
      role,
      newPassword,
      performedBy
    );
    res.status(200).send(result);
  } catch (error) {
    next(error); // Chuyển lỗi cho errorHandler
  }
};
