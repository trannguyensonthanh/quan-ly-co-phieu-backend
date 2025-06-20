/**
 * trading.service.js - Service xử lý nghiệp vụ giao dịch chứng khoán.
 * Bao gồm các hàm đặt lệnh, hủy lệnh, sửa lệnh, khớp lệnh, lấy sao kê...
 */

const sql = require('mssql');
const db = require('../models/db');
const LichSuGiaModel = require('../models/LichSuGia.model');
const TaiKhoanNganHangModel = require('../models/TaiKhoanNganHang.model');
const LenhDatModel = require('../models/LenhDat.model');
const CoPhieuModel = require('../models/CoPhieu.model');
const NhaDauTuModel = require('../models/NhaDauTu.model');
const LenhKhopModel = require('../models/LenhKhop.model');
const SoHuuModel = require('../models/SoHuu.model');
const BadRequestError = require('../utils/errors/BadRequestError');
const NotFoundError = require('../utils/errors/NotFoundError');
const AppError = require('../utils/errors/AppError');
const AuthorizationError = require('../utils/errors/AuthorizationError');
const ConflictError = require('../utils/errors/ConflictError');
const marketState = require('../marketState');
const passwordHasher = require('../utils/passwordHasher');
const AuthenticationError = require('../utils/errors/AuthenticationError');
const marketEmitter = require('../marketEventEmitter');
const TradingService = {};

/**
 * Phát sự kiện cập nhật thị trường cho mã cổ phiếu.
 */
const emitMarketUpdate = async (maCP, eventType = 'marketUpdate') => {
  try {
    marketEmitter.emit(eventType, { maCP });
  } catch (error) {
    console.error(
      `[Emit Update] Error emitting market update for ${maCP}:`,
      error
    );
  }
};

/**
 * Đặt lệnh mua cổ phiếu.
 */
TradingService.placeBuyOrder = async (maNDT, orderData) => {
  const { MaCP, SoLuong, Gia, LoaiLenh, MaTK, transactionPassword } = orderData;
  const currentState = marketState.getMarketSessionState();
  if (currentState === 'CLOSED') {
    throw new BadRequestError('Thị trường đã đóng cửa, không thể đặt lệnh.');
  }
  if (
    (LoaiLenh === 'ATO' && !['PREOPEN', 'ATO'].includes(currentState)) ||
    (LoaiLenh === 'ATC' &&
      !['PREOPEN', 'ATO', 'CONTINUOUS', 'ATC'].includes(currentState))
  ) {
    throw new BadRequestError(
      `Lệnh ${LoaiLenh} không được phép đặt trong phiên ${currentState}.`
    );
  }
  if (!transactionPassword)
    throw new BadRequestError('Vui lòng nhập mật khẩu giao dịch.');
  try {
    const investor = await NhaDauTuModel.findByMaNDT(maNDT);
    if (!investor || !investor.MKGD)
      throw new AppError(
        'Lỗi xác thực tài khoản (Không tìm thấy NDT hoặc Hash).',
        500
      );
    const isPasswordValid = await passwordHasher.comparePassword(
      transactionPassword,
      investor.MKGD
    );
    if (!isPasswordValid)
      throw new AuthenticationError('Mật khẩu giao dịch không chính xác.');
  } catch (authError) {
    if (
      authError instanceof AuthenticationError ||
      authError instanceof AppError
    )
      throw authError;
    throw new AppError('Lỗi xác thực mật khẩu giao dịch.', 500);
  }
  if (SoLuong <= 0 || SoLuong % 100 !== 0)
    throw new BadRequestError(
      'Số lượng đặt mua phải là số dương và là bội số của 100.'
    );
  let giaDatToSave = null;
  let requiredAmount = 0;
  let priceInfo;
  try {
    priceInfo = await LichSuGiaModel.getCurrentPriceInfo(MaCP);
  } catch (error) {
    if (error.message.includes('Không tìm thấy dữ liệu giá'))
      throw new NotFoundError(error.message);
    throw error;
  }
  if (!priceInfo)
    throw new NotFoundError(`Không có dữ liệu giá cho ${MaCP} hôm nay.`);
  const { GiaTran, GiaSan } = priceInfo;
  if (LoaiLenh === 'LO') {
    if (Gia === undefined || Gia === null || Gia <= 0)
      throw new BadRequestError(
        'Giá đặt là bắt buộc và phải dương cho lệnh LO.'
      );
    if (Gia % 100 !== 0)
      throw new BadRequestError('Giá đặt LO phải là bội số của 100.');
    if (Gia < GiaSan || Gia > GiaTran)
      throw new BadRequestError(
        `Giá đặt LO ${Gia.toLocaleString(
          'vi-VN'
        )}đ phải trong khoảng Sàn(${GiaSan.toLocaleString(
          'vi-VN'
        )}) - Trần(${GiaTran.toLocaleString('vi-VN')}).`
      );
    giaDatToSave = Gia;
    requiredAmount = SoLuong * giaDatToSave;
  } else {
    if (Gia !== undefined && Gia !== null)
      throw new BadRequestError(`Không được nhập giá cho lệnh ${LoaiLenh}.`);
    if (!GiaTran)
      throw new AppError(
        `Không thể xác định giá trần để tạm giữ tiền cho lệnh ${LoaiLenh} của ${MaCP}.`,
        500
      );
    requiredAmount = SoLuong * GiaTran;
    giaDatToSave = null;
  }
  const coPhieu = await CoPhieuModel.findByMaCP(MaCP);
  if (!coPhieu) throw new NotFoundError(`Mã cổ phiếu '${MaCP}' không tồn tại.`);
  if (coPhieu.Status !== 1)
    throw new BadRequestError(
      `Cổ phiếu '${MaCP}' không đang trong trạng thái giao dịch (Status=${coPhieu.Status}).`
    );
  const tknh = await TaiKhoanNganHangModel.findByMaTK(MaTK);
  if (!tknh)
    throw new NotFoundError(`Mã tài khoản ngân hàng '${MaTK}' không tồn tại.`);
  if (tknh.MaNDT !== maNDT)
    throw new AuthorizationError(
      `Tài khoản '${MaTK}' không thuộc về nhà đầu tư này.`
    );
  const currentBalance = tknh.SoTien;
  if (currentBalance < requiredAmount) {
    throw new BadRequestError(
      `Số dư tài khoản ${MaTK} không đủ (${currentBalance.toLocaleString(
        'vi-VN'
      )}đ) để thực hiện giao dịch ${requiredAmount.toLocaleString('vi-VN')}đ.`
    );
  }
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();
    await TaiKhoanNganHangModel.decreaseBalance(request, MaTK, requiredAmount);
    const newOrderData = {
      LoaiGD: 'M',
      LoaiLenh,
      SoLuong,
      MaCP,
      Gia: giaDatToSave,
      MaTK,
      TrangThai: 'Chờ',
    };
    const createdOrder = await LenhDatModel.create(request, newOrderData);
    await transaction.commit();
    if (!createdOrder)
      throw new AppError(
        'Tạo lệnh đặt thất bại, không nhận được thông tin lệnh.',
        500
      );
    if (createdOrder && createdOrder.LoaiLenh === 'LO') {
      await emitMarketUpdate(createdOrder.MaCP, 'orderBookUpdate');
    }
    return createdOrder;
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    if (
      error instanceof AppError ||
      error instanceof BadRequestError ||
      error instanceof NotFoundError ||
      error instanceof AuthorizationError
    )
      throw error;
    throw new AppError(`Lỗi hệ thống khi đặt lệnh mua: ${error.message}`, 500);
  }
};

/**
 * Đặt lệnh bán cổ phiếu.
 */
TradingService.placeSellOrder = async (maNDT, orderData) => {
  const { MaCP, SoLuong, Gia, LoaiLenh, MaTK, transactionPassword } = orderData;
  const currentState = marketState.getMarketSessionState();
  if (currentState === 'CLOSED')
    throw new BadRequestError('Thị trường đã đóng cửa, không thể đặt lệnh.');
  if (
    (LoaiLenh === 'ATO' && !['PREOPEN', 'ATO'].includes(currentState)) ||
    (LoaiLenh === 'ATC' &&
      !['PREOPEN', 'ATO', 'CONTINUOUS', 'ATC'].includes(currentState))
  ) {
    throw new BadRequestError(
      `Lệnh ${LoaiLenh} không được phép đặt trong phiên ${currentState}.`
    );
  }
  if (!transactionPassword)
    throw new BadRequestError('Vui lòng nhập mật khẩu giao dịch.');
  try {
    const investor = await NhaDauTuModel.findByMaNDT(maNDT);
    if (!investor || !investor.MKGD)
      throw new AppError(
        'Lỗi xác thực tài khoản (Không tìm thấy NDT hoặc Hash).',
        500
      );
    const isPasswordValid = await passwordHasher.comparePassword(
      transactionPassword,
      investor.MKGD
    );
    if (!isPasswordValid)
      throw new AuthenticationError('Mật khẩu giao dịch không chính xác.');
  } catch (authError) {
    if (
      authError instanceof AuthenticationError ||
      authError instanceof AppError
    )
      throw authError;
    throw new AppError('Lỗi xác thực mật khẩu giao dịch.', 500);
  }
  if (SoLuong <= 0 || SoLuong % 100 !== 0)
    throw new BadRequestError(
      'Số lượng đặt bán phải là số dương và là bội số của 100.'
    );
  let giaDatToSave = null;
  let priceInfo;
  try {
    priceInfo = await LichSuGiaModel.getCurrentPriceInfo(MaCP);
  } catch (error) {
    if (error.message.includes('Không tìm thấy dữ liệu giá'))
      throw new NotFoundError(error.message);
    throw error;
  }
  if (!priceInfo)
    throw new NotFoundError(`Không có dữ liệu giá cho ${MaCP} hôm nay.`);
  const { GiaTran, GiaSan } = priceInfo;
  if (LoaiLenh === 'LO') {
    if (Gia === undefined || Gia === null || Gia <= 0)
      throw new BadRequestError(
        'Giá đặt là bắt buộc và phải dương cho lệnh LO.'
      );
    if (Gia % 100 !== 0)
      throw new BadRequestError('Giá đặt LO phải là bội số của 100.');
    if (Gia < GiaSan || Gia > GiaTran)
      throw new BadRequestError(
        `Giá đặt LO ${Gia.toLocaleString(
          'vi-VN'
        )}đ phải trong khoảng Sàn(${GiaSan.toLocaleString(
          'vi-VN'
        )}) - Trần(${GiaTran.toLocaleString('vi-VN')}).`
      );
    giaDatToSave = Gia;
  } else {
    if (Gia !== undefined && Gia !== null)
      throw new BadRequestError(`Không được nhập giá cho lệnh ${LoaiLenh}.`);
    giaDatToSave = null;
  }
  const coPhieu = await CoPhieuModel.findByMaCP(MaCP);
  if (!coPhieu) throw new NotFoundError(`Mã cổ phiếu '${MaCP}' không tồn tại.`);
  if (coPhieu.Status !== 1)
    throw new BadRequestError(
      `Cổ phiếu '${MaCP}' không đang trong trạng thái giao dịch (Status=${coPhieu.Status}).`
    );
  const tknh = await TaiKhoanNganHangModel.findByMaTK(MaTK);
  if (!tknh)
    throw new NotFoundError(`Mã tài khoản ngân hàng '${MaTK}' không tồn tại.`);
  if (tknh.MaNDT !== maNDT)
    throw new AuthorizationError(
      `Tài khoản '${MaTK}' không thuộc về nhà đầu tư này.`
    );
  const ownedQuantity = await SoHuuModel.getSoLuong(maNDT, MaCP);
  if (SoLuong > ownedQuantity) {
    throw new BadRequestError(
      `Số lượng sở hữu (${ownedQuantity}) không đủ để đặt bán ${SoLuong} CP ${MaCP}.`
    );
  }
  try {
    const ownedQuantity = await SoHuuModel.getSoLuong(maNDT, MaCP);
    const pendingSellQuantity = await LenhDatModel.getTotalPendingSellQuantity(
      maNDT,
      MaCP
    );
    const availableQuantity = ownedQuantity - pendingSellQuantity;
    if (SoLuong > availableQuantity) {
      throw new BadRequestError(
        `Số lượng khả dụng (${availableQuantity}) không đủ để đặt bán ${SoLuong} CP ${MaCP} (Đang sở hữu: ${ownedQuantity}, Chờ bán: ${pendingSellQuantity}).`
      );
    }
  } catch (error) {
    if (error instanceof AppError || error instanceof BadRequestError)
      throw error;
    throw new AppError(
      `Lỗi khi kiểm tra số lượng cổ phiếu khả dụng: ${error.message}`,
      500
    );
  }
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();
    const newOrderData = {
      LoaiGD: 'B',
      LoaiLenh,
      SoLuong,
      MaCP,
      Gia: giaDatToSave,
      MaTK,
      TrangThai: 'Chờ',
    };
    const createdOrder = await LenhDatModel.create(request, newOrderData);
    await transaction.commit();
    if (!createdOrder)
      throw new AppError(
        'Tạo lệnh đặt thất bại, không nhận được thông tin lệnh.',
        500
      );
    if (createdOrder && createdOrder.LoaiLenh === 'LO') {
      await emitMarketUpdate(createdOrder.MaCP, 'orderBookUpdate');
    }
    return createdOrder;
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    if (
      error instanceof AppError ||
      error instanceof BadRequestError ||
      error instanceof NotFoundError ||
      error instanceof AuthorizationError
    )
      throw error;
    throw new AppError(`Lỗi hệ thống khi đặt lệnh bán: ${error.message}`, 500);
  }
};

/**
 * Lấy sao kê lệnh đặt của nhà đầu tư trong khoảng thời gian.
 */
TradingService.getOrderStatement = async (maNDT, tuNgay, denNgay) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  const statementData = await LenhDatModel.findByMaNDTAndDateRange(
    maNDT,
    tuNgay,
    denNgay
  );
  return statementData;
};

/**
 * Lấy sao kê lệnh đặt của nhà đầu tư (dành cho nhân viên).
 */
TradingService.getInvestorOrderStatement = async (maNDT, tuNgay, denNgay) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  return await LenhDatModel.findByMaNDTAndDateRange(maNDT, tuNgay, denNgay);
};

/**
 * Lấy sao kê lệnh khớp của nhà đầu tư trong khoảng thời gian.
 */
TradingService.getMatchedOrderStatement = async (maNDT, tuNgay, denNgay) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  return await LenhKhopModel.findByMaNDTAndDateRange(maNDT, tuNgay, denNgay);
};

/**
 * Lấy sao kê lệnh khớp của nhà đầu tư (dành cho nhân viên).
 */
TradingService.getInvestorMatchedOrderStatement = async (
  maNDT,
  tuNgay,
  denNgay
) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  return await LenhKhopModel.findByMaNDTAndDateRange(maNDT, tuNgay, denNgay);
};

/**
 * Lấy sao kê lệnh đặt theo mã cổ phiếu.
 */
TradingService.getStockOrderStatement = async (maCP, tuNgay, denNgay) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  const coPhieu = await CoPhieuModel.findByMaCP(maCP);
  if (!coPhieu) {
    throw new NotFoundError(`Mã cổ phiếu '${maCP}' không tồn tại.`);
  }
  const statementData = await LenhDatModel.findByMaCPAndDateRange(
    maCP,
    tuNgay,
    denNgay
  );
  return statementData;
};

/**
 * Hủy lệnh đặt.
 */
TradingService.cancelOrder = async (maNDTRequesting, maGD) => {
  const currentSessionState = marketState.getMarketSessionState();
  const order = await LenhDatModel.findOrderForCancellation(maGD);
  if (!order) {
    throw new NotFoundError(`Không tìm thấy lệnh đặt với mã ${maGD}.`);
  }
  if (order.MaNDT !== maNDTRequesting) {
    throw new AuthorizationError(`Bạn không có quyền hủy lệnh đặt ${maGD}.`);
  }
  if (order.TrangThai !== 'Chờ' && order.TrangThai !== 'Một phần') {
    throw new ConflictError(
      `Không thể hủy lệnh ${maGD} vì đang ở trạng thái '${order.TrangThai}'.`
    );
  }
  if (!order.NgayGD || isNaN(new Date(order.NgayGD).getTime())) {
    throw new BadRequestError(
      'Ngày giao dịch không hợp lệ hoặc không tồn tại.'
    );
  }
  const orderDate = new Date(order.NgayGD);
  orderDate.setHours(0, 0, 0, 0);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  if (orderDate.getTime() !== todayDate.getTime()) {
    throw new BadRequestError(
      `Không thể hủy lệnh của ngày trước (${orderDate
        .toISOString()
        .slice(0, 10)}).`
    );
  }
  let canCancel = false;
  const allowedCancelStatesLO = ['PREOPEN', 'CONTINUOUS'];
  const allowedCancelStatesATO = ['PREOPEN'];
  const allowedCancelStatesATC = ['PREOPEN'];
  if (
    order.LoaiLenh === 'LO' &&
    allowedCancelStatesLO.includes(currentSessionState)
  ) {
    canCancel = true;
  } else if (
    order.LoaiLenh === 'ATO' &&
    allowedCancelStatesATO.includes(currentSessionState)
  ) {
    canCancel = true;
  } else if (
    order.LoaiLenh === 'ATC' &&
    allowedCancelStatesATC.includes(currentSessionState)
  ) {
    canCancel = true;
  }
  if (!canCancel) {
    throw new BadRequestError(
      `Không thể hủy lệnh loại '${order.LoaiLenh}' trong phiên '${currentSessionState}'.`
    );
  }
  const soLuongChuaKhop = order.SoLuong - order.TongSoLuongKhop;
  let amountToRefund = 0;
  if (order.LoaiGD === 'M' && soLuongChuaKhop > 0) {
    amountToRefund = soLuongChuaKhop * order.Gia;
    if (amountToRefund <= 0) {
      amountToRefund = 0;
    }
  }
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();
    const updatedRows = await LenhDatModel.updateStatusToCancelled(
      request,
      maGD
    );
    if (updatedRows === 0) {
      throw new ConflictError(
        `Không thể cập nhật trạng thái hủy cho lệnh ${maGD} (trạng thái có thể đã thay đổi).`
      );
    }
    if (amountToRefund > 0) {
      await TaiKhoanNganHangModel.increaseBalance(
        request,
        order.MaTK,
        amountToRefund
      );
    }
    await transaction.commit();
    if (order && order.LoaiLenh === 'LO') {
      await emitMarketUpdate(order.MaCP, 'orderBookUpdate');
    }
    return {
      message: `Hủy lệnh đặt ${maGD} thành công.${
        amountToRefund > 0
          ? ` Đã hoàn lại ${amountToRefund.toLocaleString(
              'vi-VN'
            )}đ vào tài khoản ${order.MaTK}.`
          : ''
      }`,
    };
  } catch (error) {
    if (transaction && transaction.active) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(`[CancelOrder] Rollback failed:`, rollbackError);
      }
    }
    throw error;
  }
};

// /**
//  * Thực hiện khớp lệnh liên tục cho một mã cổ phiếu.
//  * @param {string} maCP Mã cổ phiếu cần khớp lệnh.
//  * @returns {Promise<Array>} Danh sách các lệnh khớp (MaLK) đã được tạo trong lần chạy này.
//  */
// TradingService.executeContinuousMatching = async (maCP) => {
//   console.log(
//     `--- [${new Date().toISOString()}] Starting matching process for ${maCP.trim()} ---`
//   );

//   // Lấy kết nối từ pool
//   const pool = await db.getPool();
//   const request = pool.request();

//   // Lấy ngày hiện tại từ SQL Server
//   const result = await request.query(
//     "SELECT FORMAT(SYSDATETIMEOFFSET(), 'yyyy-MM-dd') AS Today" // Trả về ngày dưới dạng chuỗi
//   );
//   const todaySQLDate = result.recordset[0].Today; // Kết quả: YYYY-MM-DD

//   try {
//     // Lấy danh sách các lệnh LO đang chờ mua và bán
//     const allLoPendingBuy = await LenhDatModel.findPendingOrders(
//       maCP.trim(),
//       ['LO'],
//       'ContinuousBuy'
//     );
//     const allLoPendingSell = await LenhDatModel.findPendingOrders(
//       maCP.trim(),
//       ['LO'],
//       'ContinuousSell'
//     );

//     // Debug: In ra danh sách lệnh mua và bán đang chờ
//     console.log(
//       `[DEBUG ${maCP.trim()}] All pending buy orders:`,
//       JSON.stringify(allLoPendingBuy, null, 2)
//     );
//     console.log(
//       `[DEBUG ${maCP.trim()}] All pending sell orders:`,
//       JSON.stringify(allLoPendingSell, null, 2)
//     );

//     console.log(
//       `[${maCP.trim()}] Found ${
//         allLoPendingBuy.length
//       } pending buy orders and ${allLoPendingSell.length} pending sell orders.`
//     );

//     // Lọc các lệnh mua và bán trong ngày hiện tại
//     const loBuyOrders = allLoPendingBuy.filter(
//       (o) => o.NgayGD.toISOString().slice(0, 10) === todaySQLDate
//     );
//     const loSellOrders = allLoPendingSell.filter(
//       (o) => o.NgayGD.toISOString().slice(0, 10) === todaySQLDate
//     );

//     // Debug: In ra danh sách lệnh mua và bán đã lọc theo ngày
//     console.log(
//       `[DEBUG ${maCP.trim()}] Filtered buy orders for today (${todaySQLDate}):`,
//       JSON.stringify(loBuyOrders, null, 2)
//     );
//     console.log(
//       `[DEBUG ${maCP.trim()}] Filtered sell orders for today (${todaySQLDate}):`,
//       JSON.stringify(loSellOrders, null, 2)
//     );

//     // Nếu không có lệnh mua hoặc bán, không thực hiện khớp lệnh
//     if (loBuyOrders.length === 0 || loSellOrders.length === 0) {
//       console.log(`[CONTINUOUS ${maCP.trim()}] No potential LO matches found.`);
//       return []; // Không có gì để khớp
//     }

//     console.log(
//       `[${maCP.trim()}] Found ${loBuyOrders.length} pending buy orders and ${
//         loSellOrders.length
//       } pending sell orders.`
//     );

//     let matchesMadeInfo = []; // Lưu thông tin chi tiết các match thành công
//     let buyIndex = 0; // Chỉ số cho danh sách lệnh mua
//     let sellIndex = 0; // Chỉ số cho danh sách lệnh bán

//     const pool = await db.getPool(); // Lấy pool một lần để dùng cho các transaction

//     // 2. Vòng lặp khớp lệnh
//     while (buyIndex < loBuyOrders.length && sellIndex < loSellOrders.length) {
//       let currentBuyOrder = loBuyOrders[buyIndex];
//       let currentSellOrder = loSellOrders[sellIndex];

//       // Debug: In ra thông tin lệnh mua và bán hiện tại
//       console.log(`[DEBUG] Current Buy Order:`, currentBuyOrder);
//       console.log(`[DEBUG] Current Sell Order:`, currentSellOrder);

//       // *** KIỂM TRA TỰ KHỚP (SELF-TRADE) ***
//       if (currentBuyOrder.MaNDT.trim() === currentSellOrder.MaNDT.trim()) {
//         console.log(
//           `[CONTINUOUS ${maCP.trim()}] Self-trade detected: Buy ${
//             currentBuyOrder.MaGD
//           } / Sell ${currentSellOrder.MaGD}. Skipping sell order.`
//         );
//         if (buyIndex < loBuyOrders.length) {
//           buyIndex++;
//         }
//         if (buyIndex === loBuyOrders.length) {
//           sellIndex++;
//         }
//         continue; // Bỏ qua lệnh bán hiện tại
//       }

//       // Kiểm tra loại lệnh, chỉ xử lý lệnh LO
//       if (
//         currentBuyOrder.LoaiLenh.trim() !== 'LO' ||
//         currentSellOrder.LoaiLenh.trim() !== 'LO'
//       ) {
//         if (currentBuyOrder.LoaiLenh.trim() !== 'LO') buyIndex++;
//         if (currentSellOrder.LoaiLenh.trim() !== 'LO') sellIndex++;
//         continue;
//       }

//       // Debug: So sánh giá và khối lượng của lệnh mua và bán
//       console.log(
//         `[DEBUG] Comparing Buy MaGD=${currentBuyOrder.MaGD} (Price=${currentBuyOrder.Gia}, Remain=${currentBuyOrder.SoLuongConLai}) vs Sell MaGD=${currentSellOrder.MaGD} (Price=${currentSellOrder.Gia}, Remain=${currentSellOrder.SoLuongConLai})`
//       );

//       // Kiểm tra điều kiện khớp lệnh
//       if (currentBuyOrder.Gia >= currentSellOrder.Gia) {
//         const khopPrice =
//           currentBuyOrder.NgayGD <= currentSellOrder.NgayGD
//             ? currentBuyOrder.Gia
//             : currentSellOrder.Gia; // Giá khớp là giá của lệnh đặt trước
//         const khopQuantity = Math.min(
//           currentBuyOrder.SoLuongConLai,
//           currentSellOrder.SoLuongConLai
//         ); // Khối lượng khớp là khối lượng nhỏ hơn

//         // Nếu khối lượng khớp <= 0, bỏ qua
//         if (khopQuantity <= 0) {
//           if (currentBuyOrder.SoLuongConLai <= 0) buyIndex++;
//           if (currentSellOrder.SoLuongConLai <= 0) sellIndex++;
//           continue;
//         }

//         let transaction;
//         try {
//           // Bắt đầu transaction
//           transaction = new sql.Transaction(pool);
//           await transaction.begin();

//           const request = transaction.request();

//           const matchTime = new Date(); // Thời gian khớp lệnh
//           const khopDataBuy = {
//             MaGD: currentBuyOrder.MaGD,
//             NgayGioKhop: matchTime,
//             SoLuongKhop: khopQuantity,
//             GiaKhop: khopPrice,
//             KieuKhop: 'Khớp',
//           };
//           const khopDataSell = {
//             MaGD: currentSellOrder.MaGD,
//             NgayGioKhop: matchTime,
//             SoLuongKhop: khopQuantity,
//             GiaKhop: khopPrice,
//             KieuKhop: 'Khớp',
//           };

//           // Tạo bản ghi khớp lệnh cho lệnh mua và bán
//           const createdKhopBuy = await LenhKhopModel.create(
//             request,
//             khopDataBuy
//           );
//           const createdKhopSell = await LenhKhopModel.create(
//             request,
//             khopDataSell
//           );

//           // Lưu thông tin khớp lệnh
//           matchesMadeInfo.push({
//             MaLK_Mua: createdKhopBuy.MaLK,
//             MaLK_Ban: createdKhopSell.MaLK,
//             MaGD_Mua: currentBuyOrder.MaGD,
//             MaGD_Ban: currentSellOrder.MaGD,
//             KhopQuantity: khopQuantity,
//             KhopPrice: khopPrice,
//           });

//           // Cập nhật số lượng sở hữu
//           await SoHuuModel.updateQuantity(
//             request,
//             currentBuyOrder.MaNDT.trim(),
//             maCP.trim(),
//             khopQuantity
//           );
//           await SoHuuModel.updateQuantity(
//             request,
//             currentSellOrder.MaNDT.trim(),
//             maCP.trim(),
//             -khopQuantity
//           );

//           // Cập nhật số dư tài khoản ngân hàng
//           const amountEarned = khopQuantity * khopPrice;
//           await TaiKhoanNganHangModel.increaseBalance(
//             request,
//             currentSellOrder.MaTK.trim(),
//             amountEarned
//           );

//           // Hoàn tiền cho người mua nếu giá đặt mua cao hơn giá khớp
//           const giaDatMua = currentBuyOrder.Gia;
//           let refundAmountForBuyer = 0;
//           if (giaDatMua > khopPrice) {
//             refundAmountForBuyer = khopQuantity * (giaDatMua - khopPrice);
//           }

//           if (refundAmountForBuyer > 0) {
//             await TaiKhoanNganHangModel.increaseBalance(
//               request,
//               currentBuyOrder.MaTK.trim(),
//               refundAmountForBuyer
//             );
//           }

//           // Cập nhật trạng thái lệnh sau khi khớp
//           await LenhDatModel.updateStatusAfterMatch(
//             request,
//             currentBuyOrder.MaGD,
//             currentBuyOrder.SoLuongConLai - khopQuantity === 0
//               ? 'Hết'
//               : 'Một phần'
//           );
//           await LenhDatModel.updateStatusAfterMatch(
//             request,
//             currentSellOrder.MaGD,
//             currentSellOrder.SoLuongConLai - khopQuantity === 0
//               ? 'Hết'
//               : 'Một phần'
//           );

//           // Commit transaction
//           await transaction.commit();

//           // Phát sự kiện cập nhật thị trường
//           await emitMarketUpdate(maCP, 'marketUpdate');

//           // Cập nhật số lượng còn lại của lệnh mua và bán
//           currentBuyOrder.SoLuongConLai -= khopQuantity;
//           currentSellOrder.SoLuongConLai -= khopQuantity;
//         } catch (error) {
//           // Rollback transaction nếu có lỗi
//           if (transaction && transaction.active) {
//             await transaction.rollback();
//           }
//           throw new AppError(
//             `Transaction error during matching: ${error.message}`,
//             500
//           );
//         }

//         // Di chuyển đến lệnh tiếp theo nếu số lượng còn lại bằng 0
//         if (currentBuyOrder.SoLuongConLai === 0) {
//           buyIndex++;
//         }
//         if (currentSellOrder.SoLuongConLai === 0) {
//           sellIndex++;
//         }
//       } else {
//         // Nếu giá mua nhỏ hơn giá bán, chuyển sang lệnh mua tiếp theo
//         buyIndex++;
//       }
//     }

//     // Kết thúc quá trình khớp lệnh
//     console.log(
//       `--- [${new Date().toISOString()}] Finished matching process for ${maCP.trim()}. Total successful matches created in this run: ${
//         matchesMadeInfo.length
//       } ---`
//     );
//     return matchesMadeInfo;
//   } catch (error) {
//     // Xử lý lỗi trong quá trình khớp lệnh
//     console.error(
//       `--- [${new Date().toISOString()}] Error during matching setup for ${maCP.trim()}: ${
//         error.message
//       } ---`
//     );
//     if (error instanceof AppError) throw error;
//     throw new AppError(
//       `Lỗi trong quá trình khớp lệnh cho ${maCP.trim()}: ${error.message}`,
//       500
//     );
//   }
// };

/**
 * Thực hiện khớp lệnh liên tục cho một mã cổ phiếu.
 */
TradingService.executeContinuousMatching = async (maCP) => {
  console.log(`[TradingService] Executing continuous matching for ${maCP}`);

  const trimmedMaCP = maCP.trim();
  try {
    const pool = await db.getPool();
    const request = pool.request();
    request.timeout = 60000;
    request.input('MaCP', sql.NVarChar(10), trimmedMaCP);
    const result = await request.execute('dbo.sp_ExecuteContinuousMatching');
    console.log(
      `[TradingService] Continuous matching result for ${trimmedMaCP}:`,
      result
    );

    const matchedOrders = result.recordset;
    if (matchedOrders.length > 0) {
      await emitMarketUpdate(trimmedMaCP, 'marketUpdate');
      await emitMarketUpdate(trimmedMaCP, 'orderBookUpdate');
    }
    return matchedOrders;
  } catch (error) {
    throw new AppError(
      `Lỗi hệ thống khi khớp lệnh cho ${trimmedMaCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Khớp lệnh ATO cho toàn bộ các mã cổ phiếu đang hoạt động.
 */
TradingService.triggerATOMatchingSession = async () => {
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  try {
    const activeStocks = await CoPhieuModel.getActiveStocks();
    if (!activeStocks || activeStocks.length === 0) {
      return {
        successCount,
        errorCount,
        errors,
        message: 'Không có cổ phiếu nào đang hoạt động để khớp lệnh ATO.',
      };
    }
    const pool = await db.getPool();
    const requestForDate = pool.request();
    const todayResult = await requestForDate.query(
      'SELECT CONVERT(DATE, GETDATE()) AS Today'
    );
    const todaySQLDate = todayResult.recordset[0].Today;
    for (const stock of activeStocks) {
      const maCP = stock.MaCP.trim();
      try {
        const request = pool.request();
        const priceInfo = await LichSuGiaModel.getCurrentPriceInfo(maCP);
        if (!priceInfo) {
          errorCount++;
          errors.push({
            maCP,
            error: `Không có dữ liệu giá ngày ${todaySQLDate
              .toISOString()
              .slice(0, 10)}`,
          });
          continue;
        }
        request.input('MaCP', sql.NVarChar(10), maCP);
        request.input('NgayGiaoDich', sql.Date, todaySQLDate);
        request.input('GiaTC', sql.Float, priceInfo.GiaTC);
        request.input('GiaTran', sql.Float, priceInfo.GiaTran);
        request.input('GiaSan', sql.Float, priceInfo.GiaSan);
        request.output('GiaMoCua', sql.Float);
        request.output('TongKLKhopATO', sql.Int);
        const result = await request.execute('dbo.sp_ExecuteATOMatching');
        const tongKLKhop = result.output.TongKLKhopATO;
        if (tongKLKhop > 0) {
          await emitMarketUpdate(maCP, 'marketUpdate');
        }
        successCount++;
      } catch (spError) {
        errorCount++;
        errors.push({ maCP, error: spError.message });
      }
    }
    return {
      successCount,
      errorCount,
      errors,
      message: `Phiên ATO hoàn tất. ${successCount} mã thành công, ${errorCount} mã lỗi.`,
    };
  } catch (error) {
    throw new AppError(
      `Lỗi hệ thống khi thực hiện khớp lệnh ATO: ${error.message}`,
      500
    );
  }
};

/**
 * Khớp lệnh ATC cho toàn bộ các mã cổ phiếu đang hoạt động.
 */
TradingService.triggerATCMatchingSession = async () => {
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  try {
    const pool = await db.getPool();
    const request = pool.request();
    const todayResult = await request.query(
      'SELECT CONVERT(DATE, GETDATE()) AS Today'
    );
    const todaySQLDate = todayResult.recordset[0].Today;
    const activeStocks = await CoPhieuModel.getActiveStocks();
    if (!activeStocks || activeStocks.length === 0) {
      return {
        successCount,
        errorCount,
        errors,
        message: 'Không có cổ phiếu nào đang hoạt động để khớp lệnh ATC.',
      };
    }
    for (const stock of activeStocks) {
      const maCP = stock.MaCP;
      try {
        const stockRequest = pool.request();
        const priceInfoToday = await LichSuGiaModel.getOHLCPriceInfo(
          maCP,
          todaySQLDate
        );
        const giaKhopCuoiLT = priceInfoToday?.GiaDongCua;
        stockRequest.input('MaCP', sql.NVarChar(10), maCP);
        stockRequest.input('NgayGiaoDich', sql.Date, todaySQLDate);
        stockRequest.input('GiaKhopCuoiPhienLienTuc', sql.Float, giaKhopCuoiLT);
        stockRequest.output('GiaDongCua', sql.Float);
        stockRequest.output('TongKLKhopATC', sql.Int);
        const result = await stockRequest.execute('dbo.sp_ExecuteATCMatching');
        const tongKLKhop = result.output.TongKLKhopATC;
        if (tongKLKhop > 0) {
          await emitMarketUpdate(maCP, 'marketUpdate');
        }
        successCount++;
      } catch (spError) {
        errorCount++;
        errors.push({ maCP, error: spError.message });
      }
    }
    return {
      successCount,
      errorCount,
      errors,
      message: `Phiên ATC hoàn tất. ${successCount} mã thành công, ${errorCount} mã lỗi.`,
    };
  } catch (error) {
    throw new AppError(
      `Lỗi hệ thống khi thực hiện khớp lệnh ATC: ${error.message}`,
      500
    );
  }
};

/**
 * Kích hoạt chạy một chu kỳ khớp lệnh liên tục cho tất cả các mã cổ phiếu đang hoạt động.
 */
TradingService.triggerContinuousMatchingSession = async () => {
  const currentState = marketState.getMarketSessionState();
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  let matchesFoundInCycle = 0;
  try {
    const activeStocks = await CoPhieuModel.getActiveStocks();
    if (!activeStocks || activeStocks.length === 0) {
      return {
        successCount,
        errorCount,
        matchesFound: 0,
        errors,
        message: 'Không có cổ phiếu nào đang hoạt động để khớp lệnh.',
      };
    }
    for (const stock of activeStocks) {
      const maCP = stock.MaCP;
      try {
        const matches = await TradingService.executeContinuousMatching(maCP);
        if (Array.isArray(matches)) {
          matchesFoundInCycle += matches.length;
        }
        successCount++;
      } catch (matchError) {
        errorCount++;
        errors.push({ maCP, error: matchError.message });
      }
    }
    return {
      successCount,
      errorCount,
      matchesFound: matchesFoundInCycle,
      errors,
      message: `Khớp lệnh liên tục thủ công hoàn tất. ${successCount} mã thành công, ${errorCount} mã lỗi. Tìm thấy ${matchesFoundInCycle} lượt khớp.`,
    };
  } catch (error) {
    throw new AppError(
      `Lỗi hệ thống khi trigger khớp lệnh liên tục: ${error.message}`,
      500
    );
  }
};

/**
 * Sửa lệnh đặt (chỉ áp dụng cho lệnh LO đang chờ/khớp một phần).
 */
TradingService.modifyOrder = async (
  maNDTRequesting,
  maGD,
  newGia,
  newSoLuong
) => {
  const currentSessionState = marketState.getMarketSessionState();
  if (
    (newGia === null || newGia === undefined) &&
    (newSoLuong === null || newSoLuong === undefined)
  ) {
    throw new BadRequestError(
      'Phải cung cấp giá mới hoặc số lượng mới để sửa lệnh.'
    );
  }
  if (
    newGia !== null &&
    newGia !== undefined &&
    (typeof newGia !== 'number' || newGia <= 0 || newGia % 100 !== 0)
  ) {
    throw new BadRequestError('Giá mới phải là số dương và là bội số của 100.');
  }
  if (
    newSoLuong !== null &&
    newSoLuong !== undefined &&
    (typeof newSoLuong !== 'number' ||
      newSoLuong <= 0 ||
      newSoLuong % 100 !== 0)
  ) {
    throw new BadRequestError(
      'Số lượng mới phải là số nguyên dương và là bội số của 100.'
    );
  }
  const order = await LenhDatModel.findOrderForCancellation(maGD);
  if (!order) throw new NotFoundError(`Không tìm thấy lệnh đặt ${maGD}.`);
  if (order.MaNDT !== maNDTRequesting)
    throw new AuthorizationError(`Bạn không có quyền sửa lệnh ${maGD}.`);
  if (order.LoaiLenh !== 'LO')
    throw new BadRequestError(
      `Chỉ có thể sửa lệnh LO, không thể sửa lệnh ${order.LoaiLenh}.`
    );
  if (order.TrangThai !== 'Chờ' && order.TrangThai !== 'Một phần') {
    throw new ConflictError(
      `Không thể sửa lệnh ${maGD} vì đang ở trạng thái '${order.TrangThai}'.`
    );
  }
  const allowedModifyStates = ['PREOPEN', 'ATO', 'CONTINUOUS'];
  if (!allowedModifyStates.includes(currentSessionState)) {
    throw new BadRequestError(
      `Không thể sửa lệnh LO trong phiên '${currentSessionState}'.`
    );
  }
  let priceInfo = null;
  if (newGia !== null && newGia !== undefined) {
    try {
      priceInfo = await LichSuGiaModel.getCurrentPriceInfo(order.MaCP);
    } catch (e) {
      throw e;
    }
    if (!priceInfo)
      throw new NotFoundError(
        `Không có dữ liệu giá cho ${order.MaCP} hôm nay.`
      );
    if (newGia < priceInfo.GiaSan || newGia > priceInfo.GiaTran) {
      throw new BadRequestError(
        `Giá mới ${newGia.toLocaleString(
          'vi-VN'
        )}đ phải trong khoảng Sàn(${priceInfo.GiaSan.toLocaleString(
          'vi-VN'
        )}) - Trần(${priceInfo.GiaTran.toLocaleString('vi-VN')}).`
      );
    }
  }
  const currentMatchedQty = order.TongSoLuongKhop || 0;
  if (
    newSoLuong !== null &&
    newSoLuong !== undefined &&
    newSoLuong < currentMatchedQty
  ) {
    throw new BadRequestError(
      `Số lượng mới (${newSoLuong}) không được nhỏ hơn số lượng đã khớp (${currentMatchedQty}).`
    );
  }
  let balanceAdjustment = 0;
  if (order.LoaiGD === 'M') {
    const oldRequired = order.SoLuong * order.Gia;
    const newRequiredGia =
      newGia !== null && newGia !== undefined ? newGia : order.Gia;
    const newRequiredSL =
      newSoLuong !== null && newSoLuong !== undefined
        ? newSoLuong
        : order.SoLuong;
    const oldUnmatchedQty = order.SoLuong - currentMatchedQty;
    const newUnmatchedQty =
      newSoLuong !== null && newSoLuong !== undefined
        ? newSoLuong - currentMatchedQty
        : oldUnmatchedQty;
    if (newUnmatchedQty < 0)
      throw new AppError('Logic lỗi: Số lượng chưa khớp mới bị âm.', 500);
    const newHoldForUnmatched = newUnmatchedQty * newRequiredGia;
    const oldHoldForUnmatched = oldUnmatchedQty * order.Gia;
    balanceAdjustment = oldHoldForUnmatched - newHoldForUnmatched;
  }
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();
    if (balanceAdjustment > 0) {
      await TaiKhoanNganHangModel.increaseBalance(
        request,
        order.MaTK,
        balanceAdjustment
      );
    } else if (balanceAdjustment < 0) {
      await TaiKhoanNganHangModel.decreaseBalance(
        request,
        order.MaTK,
        -balanceAdjustment
      );
    }
    const updatedRows = await LenhDatModel.updateOrderDetails(
      request,
      maGD,
      newGia,
      newSoLuong,
      true
    );
    if (updatedRows === 0) {
      throw new ConflictError(
        `Không thể sửa lệnh ${maGD} (có thể trạng thái đã thay đổi hoặc SL mới < SL đã khớp).`
      );
    }
    await transaction.commit();
    if (order && order.MaCP) {
      await emitMarketUpdate(order.MaCP, 'orderBookUpdate');
    }
    const modifiedOrder = await LenhDatModel.findOrderForCancellation(maGD);
    return modifiedOrder;
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError ||
      error instanceof AuthorizationError ||
      error instanceof AppError
    ) {
      throw error;
    }
    if (error.message && error.message.includes('không đủ')) {
      throw new BadRequestError(error.message);
    }
    throw new AppError(`Lỗi khi sửa lệnh đặt ${maGD}: ${error.message}`, 500);
  }
};

module.exports = TradingService;
