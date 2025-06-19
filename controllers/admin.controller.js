/**
 * controllers/admin.controller.js
 * Controller cho các chức năng quản trị hệ thống (Admin).
 */

const AdminService = require('../services/admin.service');
const { validationResult } = require('express-validator');
const BadRequestError = require('../utils/errors/BadRequestError');
const AppError = require('../utils/errors/AppError');
const marketState = require('../marketState');
const TradingService = require('../services/trading.service');
const {
  startAutoScheduler,
  stopAutoScheduler,
} = require('../autoMarketScheduler');

/**
 * Controller tạo tài khoản NDT hoặc NV
 */
exports.createAccount = async (req, res, next) => {
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

  const {
    username,
    HoTen,
    password,
    Email,
    NgaySinh,
    DiaChi,
    Phone,
    CMND,
    GioiTinh,
    role,
  } = req.body;

  const performedBy = req.user?.id;

  try {
    let result;
    if (role === 'NhaDauTu') {
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
      result = await AdminService.createInvestorAccount(
        ndtData,
        password,
        performedBy
      );
    } else if (role === 'NhanVien') {
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
      result = await AdminService.createStaffAccount(
        nvData,
        password,
        performedBy
      );
    } else {
      throw new BadRequestError('Vai trò người dùng không hợp lệ.');
    }

    res.status(201).send({
      message: `Tài khoản ${role} '${username}' đã được tạo thành công.`,
      user: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller xóa login
 */
exports.deleteLogin = async (req, res, next) => {
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

  const loginName = req.params.loginname;
  const result = await AdminService.clearUserPassword(loginName);
  res.status(200).send(result);
};

/**
 * Tạo backup device
 */
exports.createDevice = async (req, res, next) => {
  try {
    const result = await AdminService.createBackupDevice();
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Thực hiện backup
 */
exports.backup = async (req, res, next) => {
  try {
    console.log(
      `[Admin Controller] Request to perform backup: ${JSON.stringify(
        req.body
      )}`
    );
    const { backupType, initDevice } = req.body;
    if (!backupType) {
      return next(
        new BadRequestError(
          'Vui lòng cung cấp "backupType" ("Full" hoặc "Log").'
        )
      );
    }
    const result = await AdminService.performBackup(backupType, !!initDevice);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Thực hiện restore
 */
exports.restore = async (req, res, next) => {
  try {
    const { positions, pointInTime } = req.body;

    if (!positions) {
      return next(
        new BadRequestError('Vui lòng cung cấp mảng "positions" để phục hồi.')
      );
    }

    const result = await AdminService.performRestore(positions, pointInTime);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy lịch sử backup từ device
 */
exports.getBackupHistory = async (req, res, next) => {
  try {
    const history = await AdminService.getBackupHistory();
    res.status(200).send(history);
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger phiên ATO
 */
exports.triggerATO = async (req, res, next) => {
  // const currentState = marketState.getMarketSessionState();
  // if (currentState !== 'PREOPEN') {

  // }

  try {
    marketState.setMarketSessionState('ATO');
    const result = await TradingService.triggerATOMatchingSession();
    // marketState.setMarketSessionState('CONTINUOUS'); // sonthanhuse
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger phiên ATC
 */
exports.triggerATC = async (req, res, next) => {
  // const currentState = marketState.getMarketSessionState();
  // if (currentState !== 'CONTINUOUS') {
  // }
  try {
    marketState.setMarketSessionState('ATC');
    const result = await TradingService.triggerATCMatchingSession();
    // marketState.setMarketSessionState('CLOSED'); // sonthanhuse
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Chuẩn bị giá cho ngày tiếp theo
 */
exports.prepareNextDayPrices = async (req, res, next) => {
  // const currentState = marketState.getMarketSessionState();
  try {
    const result = await AdminService.prepareNextDayPrices();
    marketState.setMarketSessionState('PREOPEN');
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Đặt chế độ thị trường AUTO
 */
exports.setModeAuto = (req, res, next) => {
  if (marketState.setOperatingMode('AUTO')) {
    startAutoScheduler();
    res.status(200).send({
      message:
        'Chế độ thị trường đã đặt thành Tự động. Tiến trình tự động đã được kích hoạt.',
    });
  } else {
    next(new AppError('Không thể đặt chế độ Tự động.', 500));
  }
};

/**
 * Đặt chế độ thị trường MANUAL
 */
exports.setModeManual = (req, res, next) => {
  if (marketState.setOperatingMode('MANUAL')) {
    stopAutoScheduler();
    res.status(200).send({
      message:
        'Chế độ thị trường đã đặt thành Thủ công. Tiến trình tự động đã dừng.',
    });
  } else {
    next(new AppError('Không thể đặt chế độ Thủ công.', 500));
  }
};

/**
 * Lấy trạng thái và chế độ thị trường hiện tại
 */
exports.getMarketStatus = (req, res, next) => {
  try {
    const mode = marketState.getOperatingMode();
    const state = marketState.getMarketSessionState();
    res.status(200).send({ operatingMode: mode, sessionState: state });
  } catch (error) {
    next(new AppError('Lỗi khi lấy trạng thái thị trường.', 500));
  }
};

/**
 * Lấy danh sách tất cả Nhân viên và Nhà đầu tư
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await AdminService.getAllUsers();
    res.status(200).send(users);
  } catch (error) {
    next(error);
  }
};

/**
 * Admin cập nhật tài khoản
 */
exports.updateAccount = async (req, res, next) => {
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

  const accountId = req.params.accountId;
  const { role, ...updateData } = req.body;

  delete updateData.MaNV;
  delete updateData.username;
  delete updateData.password;
  delete updateData.MKGD;
  delete updateData.PasswordHash;

  if (!role || (role !== 'NhaDauTu' && role !== 'NhanVien')) {
    return next(
      new BadRequestError(
        "Trường 'role' ('NhaDauTu' hoặc 'Nhanvien') là bắt buộc trong body."
      )
    );
  }
  if (Object.keys(updateData).length === 0) {
    return next(new BadRequestError('Không có dữ liệu hợp lệ để cập nhật.'));
  }

  try {
    const updatedUser = await AdminService.updateUserAccount(
      accountId,
      role,
      updateData
    );
    res.status(200).send(updatedUser);
  } catch (error) {
    next(error);
  }
};

/**
 * Admin xóa tài khoản
 */
exports.deleteAccount = async (req, res, next) => {
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

  const accountId = req.params.accountId;
  const role = req.query.role;

  if (!role || (role !== 'NhaDauTu' && role !== 'NhanVien')) {
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

/**
 * Lấy tất cả giao dịch tiền mặt
 */
exports.getAllCashTransactions = async (req, res, next) => {
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

  const { tuNgay, denNgay } = req.query;

  try {
    const history = await AdminService.getAllCashTransactions(tuNgay, denNgay);
    res.status(200).send(history);
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy tất cả undo log
 */
exports.getAllUndoLogs = async (req, res, next) => {
  const options = {
    limit: parseInt(req.query.limit) || 100,
    offset: parseInt(req.query.offset) || 0,
  };
  try {
    const logs = await AdminService.getAllUndoLogs(options);
    res.status(200).send(logs);
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger khớp lệnh liên tục
 */
exports.triggerContinuous = async (req, res, next) => {
  try {
    marketState.setMarketSessionState('CONTINUOUS');
    const result = await TradingService.triggerContinuousMatchingSession();
    marketState.setMarketSessionState('CONTINUOUS');
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy tất cả lệnh đặt trong khoảng ngày
 */
exports.getAllOrders = async (req, res, next) => {
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

  const { tuNgay, denNgay } = req.query;

  try {
    const orders = await AdminService.getAllOrders(tuNgay, denNgay);
    res.status(200).send(orders);
  } catch (error) {
    next(error);
  }
};

/**
 * Admin đặt lại mật khẩu tài khoản
 */
exports.resetPassword = async (req, res, next) => {
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

  const accountId = req.params.accountId;
  const { role, newPassword, confirmPassword } = req.body;
  const performedBy = req.user?.id;

  if (!role || (role !== 'NhaDauTu' && role !== 'NhanVien')) {
    return next(
      new BadRequestError(
        "Trường 'role' ('NhaDauTu' hoặc 'Nhanvien') là bắt buộc trong body."
      )
    );
  }
  if (!newPassword || newPassword !== confirmPassword) {
    return next(
      new BadRequestError(
        'Mật khẩu mới và xác nhận mật khẩu không khớp hoặc bị thiếu.'
      )
    );
  }

  try {
    const result = await AdminService.resetUserPassword(
      accountId,
      role,
      newPassword,
      performedBy
    );
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Phân bổ cổ phiếu cho NĐT
 */
exports.distributeStock = async (req, res, next) => {
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

  const maCP = req.params.maCP;
  const { distributionList } = req.body;
  const performedBy = req.user?.id;

  if (!Array.isArray(distributionList) || distributionList.length === 0) {
    return next(
      new BadRequestError(
        'Danh sách phân bổ (distributionList) không hợp lệ hoặc rỗng.'
      )
    );
  }

  try {
    const result = await AdminService.distributeStock(
      maCP,
      distributionList,
      performedBy
    );
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy danh sách phân bổ cổ phiếu
 */
exports.getDistributionList = async (req, res, next) => {
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

  const maCP = req.params.maCP;
  try {
    const list = await AdminService.getDistributionList(maCP);
    res.status(200).send(list);
  } catch (error) {
    next(error);
  }
};

/**
 * Sửa số lượng phân bổ cho 1 NĐT
 */
exports.updateInvestorDistribution = async (req, res, next) => {
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

  const { maCP, maNDT } = req.params;
  const { newSoLuong } = req.body;
  const performedBy = req.user.id;

  if (newSoLuong === undefined || newSoLuong === null)
    return next(new BadRequestError('Thiếu số lượng mới (newSoLuong).'));

  try {
    const result = await AdminService.updateDistributionForInvestor(
      maCP,
      maNDT,
      parseInt(newSoLuong, 10),
      performedBy
    );
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa phân bổ cho 1 NĐT
 */
exports.revokeInvestorDistribution = async (req, res, next) => {
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

  const { maCP, maNDT } = req.params;
  const performedBy = req.user.id;

  try {
    const result = await AdminService.revokeDistributionForInvestor(
      maCP,
      maNDT,
      performedBy
    );
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: Xử lý request chuẩn bị giá cho ngày hôm nay.
 */
exports.prepareTodayPrices = async (req, res, next) => {
  console.log(`[CONTROLLER] Prepare TODAY's prices request received.`);
  try {
    const result = await AdminService.prepareTodayPrices();
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};
