// services/trading.service.js
const sql = require('mssql');
const db = require('../models/db');
const LichSuGiaModel = require('../models/LichSuGia.model');
const TaiKhoanNganHangModel = require('../models/TaiKhoanNganHang.model');
const LenhDatModel = require('../models/LenhDat.model');
const CoPhieuModel = require('../models/CoPhieu.model'); // Để kiểm tra CP tồn tại
const NhaDauTuModel = require('../models/NhaDauTu.model'); // Để kiểm tra TKNH thuộc NDT
const LenhKhopModel = require('../models/LenhKhop.model'); // Import LenhKhopModel
const SoHuuModel = require('../models/SoHuu.model'); // Import SoHuuModel
const BadRequestError = require('../utils/errors/BadRequestError');
const NotFoundError = require('../utils/errors/NotFoundError');
const AppError = require('../utils/errors/AppError');
const AuthorizationError = require('../utils/errors/AuthorizationError');
const ConflictError = require('../utils/errors/ConflictError'); // Import ConflictError
const marketState = require('../marketState');
const passwordHasher = require('../utils/passwordHasher'); // <<< IMPORT HASHER
const AuthenticationError = require('../utils/errors/AuthenticationError'); // Import AuthenticationError
const marketEmitter = require('../marketEventEmitter');
const TradingService = {};

// --- Hàm tiện ích để phát sự kiện cập nhật thị trường ---
// Hàm này sẽ lấy dữ liệu mới nhất cho mã CP và gửi đi
// (Cách đơn giản là chỉ gửi mã CP, handler SSE sẽ tự query lại)
const emitMarketUpdate = async (maCP, eventType = 'marketUpdate') => {
  console.log(`[Emit Update] Event: ${eventType}, MaCP: ${maCP}`);
  try {
    // Cách 1: Chỉ gửi MaCP (Đơn giản nhất)
    marketEmitter.emit(eventType, { maCP });

    // Cách 2: Gửi dữ liệu thị trường mới nhất (Phức tạp hơn, cần query lại)
    // const marketData = await CoPhieuModel.getMarketDataByMaCP(maCP); // Gọi hàm lấy chi tiết
    // if (marketData) {
    //     marketEmitter.emit(eventType, { maCP: maCP, updateData: marketData });
    // } else {
    //      marketEmitter.emit(eventType, { maCP: maCP, error: 'Data not found after update' });
    // }
  } catch (error) {
    console.error(
      `[Emit Update] Error emitting market update for ${maCP}:`,
      error
    );
  }
};

// --- Service Đặt Lệnh Mua ---
TradingService.placeBuyOrder = async (maNDT, orderData) => {
  const { MaCP, SoLuong, Gia, LoaiLenh, MaTK, transactionPassword } = orderData;

  // --- Kiểm tra Trạng thái Phiên ---
  const currentState = marketState.getMarketSessionState();
  if (currentState === 'CLOSED') {
    throw new BadRequestError('Thị trường đã đóng cửa, không thể đặt lệnh.');
  }
  // Có thể thêm kiểm tra chi tiết hơn nếu lệnh ATO/ATC chỉ được đặt trong phiên nhất định
  if (
    (LoaiLenh === 'ATO' && !['PREOPEN', 'ATO'].includes(currentState)) ||
    (LoaiLenh === 'ATC' &&
      !['PREOPEN', 'ATO', 'CONTINUOUS', 'ATC'].includes(currentState))
  ) {
    throw new BadRequestError(
      `Lệnh ${LoaiLenh} không được phép đặt trong phiên ${currentState}.`
    );
  }

  // === BƯỚC 0: KIỂM TRA MẬT KHẨU GIAO DỊCH ===
  if (!transactionPassword)
    throw new BadRequestError('Vui lòng nhập mật khẩu giao dịch.');
  try {
    const investor = await NhaDauTuModel.findByMaNDT(maNDT); // Hàm này PHẢI trả về MKGD hash
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
    console.log(`[Place Buy Order ${maNDT}] Transaction password verified.`);
  } catch (authError) {
    console.error(
      `[Place Buy Order ${maNDT}] Transaction password check failed:`,
      authError
    );
    if (
      authError instanceof AuthenticationError ||
      authError instanceof AppError
    )
      throw authError;
    throw new AppError('Lỗi xác thực mật khẩu giao dịch.', 500);
  }

  // --- 1. Validation Nghiệp Vụ ---
  if (SoLuong <= 0 || SoLuong % 100 !== 0)
    throw new BadRequestError(
      'Số lượng đặt mua phải là số dương và là bội số của 100.'
    );

  let giaDatToSave = null;
  let requiredAmount = 0;
  let priceInfo; // Khai báo ở scope rộng hơn

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
    // ATO hoặc ATC
    if (Gia !== undefined && Gia !== null)
      throw new BadRequestError(`Không được nhập giá cho lệnh ${LoaiLenh}.`);
    if (!GiaTran)
      throw new AppError(
        `Không thể xác định giá trần để tạm giữ tiền cho lệnh ${LoaiLenh} của ${MaCP}.`,
        500
      );
    requiredAmount = SoLuong * GiaTran; // Giữ tiền theo giá trần
    giaDatToSave = null; // Giá là NULL cho ATO/ATC
    console.log(
      `[Place Buy ${LoaiLenh}] Holding amount based on Ceiling Price ${GiaTran}: ${requiredAmount}`
    );
  }

  const coPhieu = await CoPhieuModel.findByMaCP(MaCP); // Check CP tồn tại và Status
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

  // Kiểm tra Số dư (phải làm trước transaction)
  const currentBalance = tknh.SoTien; // Lấy từ tknh đã query
  if (currentBalance < requiredAmount) {
    throw new BadRequestError(
      `Số dư tài khoản ${MaTK} không đủ (${currentBalance.toLocaleString(
        'vi-VN'
      )}đ) để thực hiện giao dịch ${requiredAmount.toLocaleString('vi-VN')}đ.`
    );
  }

  // --- 2. Thực hiện giao dịch trong Database Transaction ---
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    // a. Giảm số dư
    await TaiKhoanNganHangModel.decreaseBalance(request, MaTK, requiredAmount);

    // b. Tạo lệnh đặt
    const newOrderData = {
      LoaiGD: 'M',
      LoaiLenh,
      SoLuong,
      MaCP,
      Gia: giaDatToSave,
      MaTK,
      TrangThai: 'Chờ',
    };
    const createdOrder = await LenhDatModel.create(request, newOrderData); // Model create cần trả về lệnh đã tạo

    await transaction.commit();
    console.log(
      `Transaction committed for buy order MaGD: ${createdOrder?.MaGD}`
    ); // Kiểm tra createdOrder có tồn tại
    if (!createdOrder)
      throw new AppError(
        'Tạo lệnh đặt thất bại, không nhận được thông tin lệnh.',
        500
      );
    // <<< PHÁT SỰ KIỆN CẬP NHẬT SỔ LỆNH (TOP 3 GIÁ) >>>
    if (createdOrder && createdOrder.LoaiLenh === 'LO') {
      // Chỉ ảnh hưởng sổ lệnh nếu là LO
      await emitMarketUpdate(createdOrder.MaCP, 'orderBookUpdate');
    }

    return createdOrder;
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    console.error('[Place Buy Order] Transaction Error:', error);
    // Ném lại lỗi cụ thể nếu có hoặc lỗi chung
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

// --- Service Đặt Lệnh Bán
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

  // === BƯỚC 0: KIỂM TRA MẬT KHẨU GIAO DỊCH ===
  if (!transactionPassword)
    throw new BadRequestError('Vui lòng nhập mật khẩu giao dịch.');
  try {
    const investor = await NhaDauTuModel.findByMaNDT(maNDT); // Hàm này PHẢI trả về MKGD hash
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
    console.log(`[Place Buy Order ${maNDT}] Transaction password verified.`);
  } catch (authError) {
    console.error(
      `[Place Buy Order ${maNDT}] Transaction password check failed:`,
      authError
    );
    if (
      authError instanceof AuthenticationError ||
      authError instanceof AppError
    )
      throw authError;
    throw new AppError('Lỗi xác thực mật khẩu giao dịch.', 500);
  }
  // --- 1. Validation Nghiệp Vụ ---
  if (SoLuong <= 0 || SoLuong % 100 !== 0)
    throw new BadRequestError(
      'Số lượng đặt bán phải là số dương và là bội số của 100.'
    );

  let giaDatToSave = null;
  let priceInfo; // Khai báo ở scope rộng hơn

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
    // ATO hoặc ATC
    if (Gia !== undefined && Gia !== null)
      throw new BadRequestError(`Không được nhập giá cho lệnh ${LoaiLenh}.`);
    giaDatToSave = null; // Giá là NULL cho ATO/ATC
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

  // Kiểm tra Số lượng sở hữu
  const ownedQuantity = await SoHuuModel.getSoLuong(maNDT, MaCP);
  // TODO: Cần kiểm tra thêm khối lượng đang chờ bán của các lệnh khác? (Phức tạp hơn)
  if (SoLuong > ownedQuantity) {
    throw new BadRequestError(
      `Số lượng sở hữu (${ownedQuantity}) không đủ để đặt bán ${SoLuong} CP ${MaCP}.`
    );
  }

  // === SỬA LOGIC KIỂM TRA SỞ HỮU ===
  try {
    // 1. Lấy số lượng đang sở hữu thực tế từ SOHUU
    const ownedQuantity = await SoHuuModel.getSoLuong(maNDT, MaCP);

    // 2. Lấy tổng số lượng đang chờ bán từ các lệnh khác
    const pendingSellQuantity = await LenhDatModel.getTotalPendingSellQuantity(
      maNDT,
      MaCP
    );

    // 3. Tính số lượng khả dụng thực tế
    const availableQuantity = ownedQuantity - pendingSellQuantity;

    console.log(
      `[Place Sell Order ${maNDT}-${MaCP}] Owned: ${ownedQuantity}, Pending Sell: ${pendingSellQuantity}, Available: ${availableQuantity}`
    );

    // 4. So sánh số lượng đặt bán với số lượng KHẢ DỤNG
    if (SoLuong > availableQuantity) {
      throw new BadRequestError(
        `Số lượng khả dụng (${availableQuantity}) không đủ để đặt bán ${SoLuong} CP ${MaCP} (Đang sở hữu: ${ownedQuantity}, Chờ bán: ${pendingSellQuantity}).`
      );
    }
  } catch (error) {
    // Bắt lỗi từ getSoLuong hoặc getTotalPendingSellQuantity
    console.error(
      `Error checking available quantity for ${maNDT}-${MaCP}:`,
      error
    );
    if (error instanceof AppError || error instanceof BadRequestError)
      throw error;
    throw new AppError(
      `Lỗi khi kiểm tra số lượng cổ phiếu khả dụng: ${error.message}`,
      500
    );
  }
  // === KẾT THÚC SỬA LOGIC KIỂM TRA SỞ HỮU ===

  // --- 2. Thực hiện tạo lệnh đặt trong Transaction ---
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    // a. Tạo lệnh đặt
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
    console.log(
      `Transaction committed for sell order MaGD: ${createdOrder?.MaGD}`
    );
    if (!createdOrder)
      throw new AppError(
        'Tạo lệnh đặt thất bại, không nhận được thông tin lệnh.',
        500
      );
    // <<< PHÁT SỰ KIỆN CẬP NHẬT SỔ LỆNH (TOP 3 GIÁ) >>>
    if (createdOrder && createdOrder.LoaiLenh === 'LO') {
      await emitMarketUpdate(createdOrder.MaCP, 'orderBookUpdate');
    }
    return createdOrder;
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    console.error('[Place Sell Order] Transaction Error:', error);
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

TradingService.getOrderStatement = async (maNDT, tuNgay, denNgay) => {
  // Kiểm tra tính hợp lệ của ngày tháng
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }

  // Gọi model để lấy dữ liệu
  const statementData = await LenhDatModel.findByMaNDTAndDateRange(
    maNDT,
    tuNgay,
    denNgay
  );

  // Có thể xử lý thêm dữ liệu ở đây nếu cần (ví dụ: định dạng lại)
  return statementData;
};

// Hàm tương tự cho Nhân viên xem của NDT khác (có thể gộp nếu logic giống hệt) => sao kê lệnh đặt của nhà đầu tư dựa vào mã
TradingService.getInvestorOrderStatement = async (maNDT, tuNgay, denNgay) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  // Kiểm tra NDT tồn tại nếu cần
  // const ndt = await NhaDauTuModel.findByMaNDT(maNDT);
  // if (!ndt) throw new Error(`Nhà đầu tư ${maNDT} không tồn tại.`);

  return await LenhDatModel.findByMaNDTAndDateRange(maNDT, tuNgay, denNgay);
};

// --- Service Lấy Sao Kê Lệnh Khớp ---
TradingService.getMatchedOrderStatement = async (maNDT, tuNgay, denNgay) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  return await LenhKhopModel.findByMaNDTAndDateRange(maNDT, tuNgay, denNgay);
};

// Hàm cho Nhân viên (có thể gộp nếu logic giống hệt)
TradingService.getInvestorMatchedOrderStatement = async (
  maNDT,
  tuNgay,
  denNgay
) => {
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  // Optional: Check if NDT exists
  return await LenhKhopModel.findByMaNDTAndDateRange(maNDT, tuNgay, denNgay);
};

// --- Service Lấy Sao Kê Lệnh đặt Theo Mã Cổ Phiếu ---
TradingService.getStockOrderStatement = async (maCP, tuNgay, denNgay) => {
  // a. Kiểm tra ngày hợp lệ
  if (!tuNgay || !denNgay || new Date(tuNgay) > new Date(denNgay)) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  // b. Kiểm tra MaCP tồn tại (tùy chọn nhưng nên có)
  const coPhieu = await CoPhieuModel.findByMaCP(maCP);
  if (!coPhieu) {
    throw new NotFoundError(`Mã cổ phiếu '${maCP}' không tồn tại.`);
  }

  // c. Gọi model để lấy dữ liệu
  const statementData = await LenhDatModel.findByMaCPAndDateRange(
    maCP,
    tuNgay,
    denNgay
  );
  return statementData;
};

// --- Service Hủy Lệnh Đặt ---
TradingService.cancelOrder = async (maNDTRequesting, maGD) => {
  const currentSessionState = marketState.getMarketSessionState(); // Lấy trạng thái từ module
  console.log(
    `[CANCEL ORDER] Request for MaGD: ${maGD}, User: ${maNDTRequesting}, Session: ${currentSessionState}`
  );
  // 1. Lấy thông tin lệnh cần hủy
  const order = await LenhDatModel.findOrderForCancellation(maGD);
  if (!order) {
    throw new NotFoundError(`Không tìm thấy lệnh đặt với mã ${maGD}.`);
  }

  // 2. Kiểm tra quyền sở hữu
  if (order.MaNDT !== maNDTRequesting) {
    throw new AuthorizationError(`Bạn không có quyền hủy lệnh đặt ${maGD}.`);
  }

  // 3. Kiểm tra trạng thái lệnh có cho phép hủy không
  if (order.TrangThai !== 'Chờ' && order.TrangThai !== 'Một phần') {
    throw new ConflictError(
      `Không thể hủy lệnh ${maGD} vì đang ở trạng thái '${order.TrangThai}'.`
    ); // 409 Conflict
  }
  console.log(order.NgayGD);

  // *** THÊM KIỂM TRA NGÀY GIAO DỊCH ***
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
  // *** HẾT KIỂM TRA NGÀY ***

  // 4. KIỂM TRA ĐIỀU KIỆN HỦY THEO LOẠI LỆNH VÀ PHIÊN GIAO DỊCH
  let canCancel = false;
  // const allowedCancelStatesLO = ["PREOPEN", "ATO", "CONTINUOUS"]; // LO có thể hủy trước và trong ATO, Liên tục
  // const allowedCancelStatesATO = ["PREOPEN"]; // ATO chỉ có thể hủy trước phiên ATO
  // const allowedCancelStatesATC = ["PREOPEN", "ATO", "CONTINUOUS"]; // ATC có thể hủy trước và trong ATO, Liên tục

  const allowedCancelStatesLO = ['PREOPEN', 'CONTINUOUS']; // LO được huỷ trước và trong phiên liên tục
  const allowedCancelStatesATO = ['PREOPEN']; // ATO chỉ huỷ được khi PREOPEN
  const allowedCancelStatesATC = ['PREOPEN']; // ATC cũng chỉ huỷ được khi PREOPEN
  console.log(
    order.LoaiLenh === 'LO',
    allowedCancelStatesLO.includes(currentSessionState)
  );
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

  console.log(
    `[CANCEL ORDER ${maGD}] Cancellation allowed for ${order.LoaiLenh} in ${currentSessionState} state.`
  );

  // 4. Tính toán số lượng chưa khớp và số tiền cần hoàn lại (nếu là lệnh Mua)
  const soLuongChuaKhop = order.SoLuong - order.TongSoLuongKhop;
  let amountToRefund = 0;
  if (order.LoaiGD === 'M' && soLuongChuaKhop > 0) {
    // Chỉ hoàn tiền cho phần chưa khớp của lệnh mua
    amountToRefund = soLuongChuaKhop * order.Gia;
    if (amountToRefund <= 0) {
      console.warn(
        `Calculated refund amount is zero or negative for buy order ${maGD}. UnmatchedQty: ${soLuongChuaKhop}, Price: ${order.Gia}`
      );
      // Có thể ném lỗi hoặc coi như không cần hoàn tiền
      amountToRefund = 0;
    }
  }

  // --- 5. Thực hiện hủy trong Database Transaction ---
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request(); // Request trong transaction

    // a. Cập nhật trạng thái lệnh thành 'Hủy'
    const updatedRows = await LenhDatModel.updateStatusToCancelled(
      request,
      maGD
    );
    if (updatedRows === 0) {
      // Lỗi này không nên xảy ra nếu đã check trạng thái, nhưng đề phòng race condition
      throw new ConflictError(
        `Không thể cập nhật trạng thái hủy cho lệnh ${maGD} (trạng thái có thể đã thay đổi).`
      );
    }
    console.log(`Order ${maGD} status updated to Cancelled.`);

    // b. Hoàn tiền nếu là lệnh Mua và có số tiền cần hoàn
    if (amountToRefund > 0) {
      await TaiKhoanNganHangModel.increaseBalance(
        request,
        order.MaTK,
        amountToRefund
      );
      console.log(
        `Refunded ${amountToRefund} to account ${order.MaTK} for cancelled buy order ${maGD}.`
      );
    }

    // c. Commit transaction
    await transaction.commit();
    // <<< PHÁT SỰ KIỆN CẬP NHẬT SỔ LỆNH (TOP 3 GIÁ) >>>
    if (order && order.LoaiLenh === 'LO') {
      // Chỉ ảnh hưởng nếu là LO
      await emitMarketUpdate(order.MaCP, 'orderBookUpdate');
    }
    console.log(`Transaction committed for cancelling order ${maGD}.`);

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
    console.error(`Transaction Error cancelling order ${maGD}:`, error.message);
    if (transaction && transaction.active) {
      try {
        await transaction.rollback();
        console.log('Transaction rolled back.');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
    // Ném lỗi ra ngoài
    throw error;
  }
};

/**
 * Thực hiện khớp lệnh liên tục cho một mã cổ phiếu.
 * @param {string} maCP Mã cổ phiếu cần khớp lệnh.
 * @returns {Promise<Array>} Danh sách các lệnh khớp (MaLK) đã được tạo trong lần chạy này.
 */
TradingService.executeContinuousMatching = async (maCP) => {
  console.log(
    `--- [${new Date().toISOString()}] Starting matching process for ${maCP.trim()} ---`
  );

  // Lấy kết nối từ pool
  const pool = await db.getPool();
  const request = pool.request();

  // Lấy ngày hiện tại từ SQL Server
  const result = await request.query(
    "SELECT FORMAT(SYSDATETIMEOFFSET(), 'yyyy-MM-dd') AS Today" // Trả về ngày dưới dạng chuỗi
  );
  const todaySQLDate = result.recordset[0].Today; // Kết quả: YYYY-MM-DD

  try {
    // Lấy danh sách các lệnh LO đang chờ mua và bán
    const allLoPendingBuy = await LenhDatModel.findPendingOrders(
      maCP.trim(),
      ['LO'],
      'ContinuousBuy'
    );
    const allLoPendingSell = await LenhDatModel.findPendingOrders(
      maCP.trim(),
      ['LO'],
      'ContinuousSell'
    );

    // Debug: In ra danh sách lệnh mua và bán đang chờ
    console.log(
      `[DEBUG ${maCP.trim()}] All pending buy orders:`,
      JSON.stringify(allLoPendingBuy, null, 2)
    );
    console.log(
      `[DEBUG ${maCP.trim()}] All pending sell orders:`,
      JSON.stringify(allLoPendingSell, null, 2)
    );

    console.log(
      `[${maCP.trim()}] Found ${
        allLoPendingBuy.length
      } pending buy orders and ${allLoPendingSell.length} pending sell orders.`
    );

    // Lọc các lệnh mua và bán trong ngày hiện tại
    const loBuyOrders = allLoPendingBuy.filter(
      (o) => o.NgayGD.toISOString().slice(0, 10) === todaySQLDate
    );
    const loSellOrders = allLoPendingSell.filter(
      (o) => o.NgayGD.toISOString().slice(0, 10) === todaySQLDate
    );

    // Debug: In ra danh sách lệnh mua và bán đã lọc theo ngày
    console.log(
      `[DEBUG ${maCP.trim()}] Filtered buy orders for today (${todaySQLDate}):`,
      JSON.stringify(loBuyOrders, null, 2)
    );
    console.log(
      `[DEBUG ${maCP.trim()}] Filtered sell orders for today (${todaySQLDate}):`,
      JSON.stringify(loSellOrders, null, 2)
    );

    // Nếu không có lệnh mua hoặc bán, không thực hiện khớp lệnh
    if (loBuyOrders.length === 0 || loSellOrders.length === 0) {
      console.log(`[CONTINUOUS ${maCP.trim()}] No potential LO matches found.`);
      return []; // Không có gì để khớp
    }

    console.log(
      `[${maCP.trim()}] Found ${loBuyOrders.length} pending buy orders and ${
        loSellOrders.length
      } pending sell orders.`
    );

    let matchesMadeInfo = []; // Lưu thông tin chi tiết các match thành công
    let buyIndex = 0; // Chỉ số cho danh sách lệnh mua
    let sellIndex = 0; // Chỉ số cho danh sách lệnh bán

    const pool = await db.getPool(); // Lấy pool một lần để dùng cho các transaction

    // 2. Vòng lặp khớp lệnh
    while (buyIndex < loBuyOrders.length && sellIndex < loSellOrders.length) {
      let currentBuyOrder = loBuyOrders[buyIndex];
      let currentSellOrder = loSellOrders[sellIndex];

      // Debug: In ra thông tin lệnh mua và bán hiện tại
      console.log(`[DEBUG] Current Buy Order:`, currentBuyOrder);
      console.log(`[DEBUG] Current Sell Order:`, currentSellOrder);

      // *** KIỂM TRA TỰ KHỚP (SELF-TRADE) ***
      if (currentBuyOrder.MaNDT.trim() === currentSellOrder.MaNDT.trim()) {
        console.log(
          `[CONTINUOUS ${maCP.trim()}] Self-trade detected: Buy ${
            currentBuyOrder.MaGD
          } / Sell ${currentSellOrder.MaGD}. Skipping sell order.`
        );
        if (buyIndex < loBuyOrders.length) {
          buyIndex++;
        }
        if (buyIndex === loBuyOrders.length) {
          sellIndex++;
        }
        continue; // Bỏ qua lệnh bán hiện tại
      }

      // Kiểm tra loại lệnh, chỉ xử lý lệnh LO
      if (
        currentBuyOrder.LoaiLenh.trim() !== 'LO' ||
        currentSellOrder.LoaiLenh.trim() !== 'LO'
      ) {
        if (currentBuyOrder.LoaiLenh.trim() !== 'LO') buyIndex++;
        if (currentSellOrder.LoaiLenh.trim() !== 'LO') sellIndex++;
        continue;
      }

      // Debug: So sánh giá và khối lượng của lệnh mua và bán
      console.log(
        `[DEBUG] Comparing Buy MaGD=${currentBuyOrder.MaGD} (Price=${currentBuyOrder.Gia}, Remain=${currentBuyOrder.SoLuongConLai}) vs Sell MaGD=${currentSellOrder.MaGD} (Price=${currentSellOrder.Gia}, Remain=${currentSellOrder.SoLuongConLai})`
      );

      // Kiểm tra điều kiện khớp lệnh
      if (currentBuyOrder.Gia >= currentSellOrder.Gia) {
        const khopPrice =
          currentBuyOrder.NgayGD <= currentSellOrder.NgayGD
            ? currentBuyOrder.Gia
            : currentSellOrder.Gia; // Giá khớp là giá của lệnh đặt trước
        const khopQuantity = Math.min(
          currentBuyOrder.SoLuongConLai,
          currentSellOrder.SoLuongConLai
        ); // Khối lượng khớp là khối lượng nhỏ hơn

        // Nếu khối lượng khớp <= 0, bỏ qua
        if (khopQuantity <= 0) {
          if (currentBuyOrder.SoLuongConLai <= 0) buyIndex++;
          if (currentSellOrder.SoLuongConLai <= 0) sellIndex++;
          continue;
        }

        let transaction;
        try {
          // Bắt đầu transaction
          transaction = new sql.Transaction(pool);
          await transaction.begin();

          const request = transaction.request();

          const matchTime = new Date(); // Thời gian khớp lệnh
          const khopDataBuy = {
            MaGD: currentBuyOrder.MaGD,
            NgayGioKhop: matchTime,
            SoLuongKhop: khopQuantity,
            GiaKhop: khopPrice,
            KieuKhop: 'Khớp',
          };
          const khopDataSell = {
            MaGD: currentSellOrder.MaGD,
            NgayGioKhop: matchTime,
            SoLuongKhop: khopQuantity,
            GiaKhop: khopPrice,
            KieuKhop: 'Khớp',
          };

          // Tạo bản ghi khớp lệnh cho lệnh mua và bán
          const createdKhopBuy = await LenhKhopModel.create(
            request,
            khopDataBuy
          );
          const createdKhopSell = await LenhKhopModel.create(
            request,
            khopDataSell
          );

          // Lưu thông tin khớp lệnh
          matchesMadeInfo.push({
            MaLK_Mua: createdKhopBuy.MaLK,
            MaLK_Ban: createdKhopSell.MaLK,
            MaGD_Mua: currentBuyOrder.MaGD,
            MaGD_Ban: currentSellOrder.MaGD,
            KhopQuantity: khopQuantity,
            KhopPrice: khopPrice,
          });

          // Cập nhật số lượng sở hữu
          await SoHuuModel.updateQuantity(
            request,
            currentBuyOrder.MaNDT.trim(),
            maCP.trim(),
            khopQuantity
          );
          await SoHuuModel.updateQuantity(
            request,
            currentSellOrder.MaNDT.trim(),
            maCP.trim(),
            -khopQuantity
          );

          // Cập nhật số dư tài khoản ngân hàng
          const amountEarned = khopQuantity * khopPrice;
          await TaiKhoanNganHangModel.increaseBalance(
            request,
            currentSellOrder.MaTK.trim(),
            amountEarned
          );

          // Hoàn tiền cho người mua nếu giá đặt mua cao hơn giá khớp
          const giaDatMua = currentBuyOrder.Gia;
          let refundAmountForBuyer = 0;
          if (giaDatMua > khopPrice) {
            refundAmountForBuyer = khopQuantity * (giaDatMua - khopPrice);
          }

          if (refundAmountForBuyer > 0) {
            await TaiKhoanNganHangModel.increaseBalance(
              request,
              currentBuyOrder.MaTK.trim(),
              refundAmountForBuyer
            );
          }

          // Cập nhật trạng thái lệnh sau khi khớp
          await LenhDatModel.updateStatusAfterMatch(
            request,
            currentBuyOrder.MaGD,
            currentBuyOrder.SoLuongConLai - khopQuantity === 0
              ? 'Hết'
              : 'Một phần'
          );
          await LenhDatModel.updateStatusAfterMatch(
            request,
            currentSellOrder.MaGD,
            currentSellOrder.SoLuongConLai - khopQuantity === 0
              ? 'Hết'
              : 'Một phần'
          );

          // Commit transaction
          await transaction.commit();

          // Phát sự kiện cập nhật thị trường
          await emitMarketUpdate(maCP, 'marketUpdate');

          // Cập nhật số lượng còn lại của lệnh mua và bán
          currentBuyOrder.SoLuongConLai -= khopQuantity;
          currentSellOrder.SoLuongConLai -= khopQuantity;
        } catch (error) {
          // Rollback transaction nếu có lỗi
          if (transaction && transaction.active) {
            await transaction.rollback();
          }
          throw new AppError(
            `Transaction error during matching: ${error.message}`,
            500
          );
        }

        // Di chuyển đến lệnh tiếp theo nếu số lượng còn lại bằng 0
        if (currentBuyOrder.SoLuongConLai === 0) {
          buyIndex++;
        }
        if (currentSellOrder.SoLuongConLai === 0) {
          sellIndex++;
        }
      } else {
        // Nếu giá mua nhỏ hơn giá bán, chuyển sang lệnh mua tiếp theo
        buyIndex++;
      }
    }

    // Kết thúc quá trình khớp lệnh
    console.log(
      `--- [${new Date().toISOString()}] Finished matching process for ${maCP.trim()}. Total successful matches created in this run: ${
        matchesMadeInfo.length
      } ---`
    );
    return matchesMadeInfo;
  } catch (error) {
    // Xử lý lỗi trong quá trình khớp lệnh
    console.error(
      `--- [${new Date().toISOString()}] Error during matching setup for ${maCP.trim()}: ${
        error.message
      } ---`
    );
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Lỗi trong quá trình khớp lệnh cho ${maCP.trim()}: ${error.message}`,
      500
    );
  }
};

// --- HÀM TRIGGER KHỚP LỆNH ATO (GỌI SP) --- => hiện tại không dùng nhma vẫn để đó
TradingService.triggerATOMatching = async (maCP) => {
  console.log(`[SERVICE TRIGGER ATO ${maCP.trim()}] Request received.`);
  try {
    const pool = await db.getPool();
    const request = pool.request();

    // Lấy thông tin giá TC/Trần/Sàn của ngày hiện tại để truyền vào SP
    const todayResult = await request.query(
      'SELECT CONVERT(DATE, GETDATE()) AS Today'
    );
    const todaySQLDate = todayResult.recordset[0].Today; // Lấy ngày từ SQL Server
    const priceInfo = await LichSuGiaModel.getCurrentPriceInfo(maCP.trim()); // Dùng lại hàm cũ
    if (!priceInfo) {
      throw new NotFoundError(
        `Không có dữ liệu giá tham chiếu cho ${maCP.trim()} hôm nay để chạy ATO.`
      );
    }

    // Khai báo output parameters cho SP
    request.input('MaCP', sql.NVarChar(10), maCP.trim());
    request.input('NgayGiaoDich', sql.Date, todaySQLDate);
    request.input('GiaTC', sql.Float, priceInfo.GiaTC);
    request.input('GiaTran', sql.Float, priceInfo.GiaTran);
    request.input('GiaSan', sql.Float, priceInfo.GiaSan);
    request.output('GiaMoCua', sql.Float);
    request.output('TongKLKhopATO', sql.Int);

    // Thực thi Stored Procedure
    const result = await request.execute('dbo.sp_ExecuteATOMatching');

    const giaMoCua = result.output.GiaMoCua;
    const tongKLKhop = result.output.TongKLKhopATO;

    console.log(
      `[SERVICE TRIGGER ATO ${maCP.trim()}] Completed. GiaMoCua: ${
        giaMoCua ?? 'N/A'
      }, TongKLKhop: ${tongKLKhop}`
    );
    return {
      maCP: maCP.trim(),
      giaMoCua: giaMoCua,
      tongKLKhop: tongKLKhop,
      message: `Phiên ATO cho ${maCP.trim()} đã thực hiện. KL khớp: ${tongKLKhop}.`,
    };
  } catch (error) {
    console.error(`Error executing ATO matching for ${maCP.trim()}:`, error);
    // Ném lỗi đã chuẩn hóa hoặc lỗi gốc
    if (error instanceof AppError || error instanceof NotFoundError)
      throw error;
    throw new AppError(
      `Lỗi khi thực hiện khớp lệnh ATO cho ${maCP.trim()}: ${error.message}`,
      500
    );
  }
};

// --- HÀM TRIGGER KHỚP LỆNH ATC (GỌI SP) --- => hiện tại không dùng nhma vẫn để đó
TradingService.triggerATCMatching = async (maCP) => {
  console.log(`[SERVICE TRIGGER ATC ${maCP.trim()}] Request received.`);
  if (marketState.getMarketSessionState() !== 'ATC') {
    console.warn(
      `[SERVICE ATC ${maCP.trim()}] Attempted to run ATC matching outside ATC session state.`
    );
    return { maCP: maCP.trim(), message: `Skipped: Not in ATC session.` };
  }
  try {
    const pool = await db.getPool();
    const request = pool.request();

    // Lấy ngày hiện tại từ SQL Server
    const todayResult = await request.query(
      'SELECT CONVERT(DATE, GETDATE()) AS Today'
    );
    const todaySQLDate = todayResult.recordset[0].Today; // Ngày từ SQL Server

    // Lấy giá khớp cuối cùng của phiên liên tục (từ GiaDongCua tạm thời)
    const priceInfoToday = await LichSuGiaModel.getOHLCPriceInfo(
      maCP.trim(),
      todaySQLDate
    ); // Cần hàm mới lấy OHLC
    if (!priceInfoToday) {
      throw new NotFoundError(
        `Không có dữ liệu giá trong ngày cho ${maCP.trim()} để chạy ATC.`
      );
    }
    const giaKhopCuoiLT = priceInfoToday.GiaDongCua; // Lấy giá đóng cửa tạm

    request.input('MaCP', sql.NVarChar(10), maCP.trim());
    request.input('NgayGiaoDich', sql.Date, todaySQLDate);
    request.input('GiaKhopCuoiPhienLienTuc', sql.Float, giaKhopCuoiLT); // Truyền giá khớp cuối LT
    request.output('GiaDongCua', sql.Float);
    request.output('TongKLKhopATC', sql.Int);

    const result = await request.execute('dbo.sp_ExecuteATCMatching');

    const giaDongCua = result.output.GiaDongCua;
    const tongKLKhop = result.output.TongKLKhopATC;

    console.log(
      `[SERVICE TRIGGER ATC ${maCP.trim()}] Completed. GiaDongCua: ${
        giaDongCua ?? 'N/A'
      }, TongKLKhop: ${tongKLKhop}`
    );
    return {
      maCP: maCP.trim(),
      giaDongCua: giaDongCua,
      tongKLKhop: tongKLKhop,
      message: `Phiên ATC cho ${maCP.trim()} đã thực hiện. KL khớp: ${tongKLKhop}.`,
    };
  } catch (error) {
    console.error(`Error executing ATC matching for ${maCP.trim()}:`, error);
    if (error instanceof AppError || error instanceof NotFoundError)
      throw error;
    throw new AppError(
      `Lỗi khi thực hiện khớp lệnh ATC cho ${maCP.trim()}: ${error.message}`,
      500
    );
  }
};

// --- HÀM TRIGGER KHỚP LỆNH ATO (KHÔNG CẦN maCP) ---
TradingService.triggerATOMatchingSession = async () => {
  console.log(`[SERVICE TRIGGER ATO SESSION] Request received.`);
  let successCount = 0;
  let errorCount = 0;
  const errors = []; // Lưu lại lỗi của từng mã

  try {
    const activeStocks = await CoPhieuModel.getActiveStocks();
    if (!activeStocks || activeStocks.length === 0) {
      console.log('[SERVICE TRIGGER ATO SESSION] No active stocks found.');
      return {
        successCount,
        errorCount,
        errors,
        message: 'Không có cổ phiếu nào đang hoạt động để khớp lệnh ATO.',
      };
    }
    console.log(
      `[SERVICE TRIGGER ATO SESSION] Found ${activeStocks.length} active stocks. Starting matching...`
    );

    const pool = await db.getPool(); // Lấy pool một lần
    const requestForDate = pool.request();
    const todayResult = await requestForDate.query(
      'SELECT CONVERT(DATE, GETDATE()) AS Today'
    );
    const todaySQLDate = todayResult.recordset[0].Today; // Ngày từ SQL Server

    for (const stock of activeStocks) {
      const maCP = stock.MaCP.trim(); // Sử dụng trim cho nchar
      console.log(`-- [ATO ${maCP}] Processing...`);
      try {
        const request = pool.request(); // Request mới cho mỗi SP call
        const priceInfo = await LichSuGiaModel.getCurrentPriceInfo(maCP); // Lấy giá cho mã này
        if (!priceInfo) {
          console.error(
            `-- [ATO ${maCP}] Skipping: No price data found for today.`
          );
          errorCount++;
          errors.push({
            maCP,
            error: `Không có dữ liệu giá ngày ${todaySQLDate
              .toISOString()
              .slice(0, 10)}`,
          });
          continue; // Bỏ qua mã này
        }

        request.input('MaCP', sql.NVarChar(10), maCP);
        request.input('NgayGiaoDich', sql.Date, todaySQLDate);
        request.input('GiaTC', sql.Float, priceInfo.GiaTC);
        request.input('GiaTran', sql.Float, priceInfo.GiaTran);
        request.input('GiaSan', sql.Float, priceInfo.GiaSan);
        request.output('GiaMoCua', sql.Float);
        request.output('TongKLKhopATO', sql.Int);

        const result = await request.execute('dbo.sp_ExecuteATOMatching');
        console.log(
          `-- [ATO ${maCP}] Completed. GiaMoCua: ${
            result.output.GiaMoCua ?? 'N/A'
          }, KLKhop: ${result.output.TongKLKhopATO}`
        );

        const giaMoCua = result.output.GiaMoCua;
        const tongKLKhop = result.output.TongKLKhopATO;

        // <<< PHÁT SỰ KIỆN NẾU CÓ KHỚP LỆNH >>>
        if (tongKLKhop > 0) {
          await emitMarketUpdate(maCP, 'marketUpdate');
        }
        successCount++;
      } catch (spError) {
        console.error(`-- [ATO ${maCP}] Error executing SP:`, spError.message);
        errorCount++;
        errors.push({ maCP, error: spError.message });
        // Không ném lỗi ra ngoài để tiếp tục xử lý các mã khác
      }
    } // end for loop

    console.log(
      `[SERVICE TRIGGER ATO SESSION] Finished. Success: ${successCount}, Errors: ${errorCount}`
    );
    return {
      successCount,
      errorCount,
      errors,
      message: `Phiên ATO hoàn tất. ${successCount} mã thành công, ${errorCount} mã lỗi.`,
    };
  } catch (error) {
    // Lỗi tổng quát (ví dụ: lấy danh sách CP lỗi)
    console.error(`Error in triggerATOMatchingSession service:`, error);
    throw new AppError(
      `Lỗi hệ thống khi thực hiện khớp lệnh ATO: ${error.message}`,
      500
    );
  }
};

// --- HÀM TRIGGER KHỚP LỆNH ATC (KHÔNG CẦN maCP) ---
TradingService.triggerATCMatchingSession = async () => {
  console.log(`[SERVICE TRIGGER ATC SESSION] Request received.`);
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    const pool = await db.getPool();
    const request = pool.request();

    // Lấy ngày hiện tại từ SQL Server
    const todayResult = await request.query(
      'SELECT CONVERT(DATE, GETDATE()) AS Today'
    );
    const todaySQLDate = todayResult.recordset[0].Today; // Ngày từ SQL Server

    const activeStocks = await CoPhieuModel.getActiveStocks();
    if (!activeStocks || activeStocks.length === 0) {
      console.log('[SERVICE TRIGGER ATC SESSION] No active stocks found.');
      return {
        successCount,
        errorCount,
        errors,
        message: 'Không có cổ phiếu nào đang hoạt động để khớp lệnh ATC.',
      };
    }
    console.log(
      `[SERVICE TRIGGER ATC SESSION] Found ${activeStocks.length} active stocks. Starting matching...`
    );

    for (const stock of activeStocks) {
      const maCP = stock.MaCP;
      console.log(`-- [ATC ${maCP}] Processing...`);
      try {
        const stockRequest = pool.request();
        // Lấy giá khớp cuối phiên liên tục (GiaDongCua tạm)
        const priceInfoToday = await LichSuGiaModel.getOHLCPriceInfo(
          maCP,
          todaySQLDate
        );
        const giaKhopCuoiLT = priceInfoToday?.GiaDongCua; // Có thể NULL

        stockRequest.input('MaCP', sql.NVarChar(10), maCP);
        stockRequest.input('NgayGiaoDich', sql.Date, todaySQLDate);
        stockRequest.input('GiaKhopCuoiPhienLienTuc', sql.Float, giaKhopCuoiLT);
        stockRequest.output('GiaDongCua', sql.Float);
        stockRequest.output('TongKLKhopATC', sql.Int);

        const result = await stockRequest.execute('dbo.sp_ExecuteATCMatching');
        console.log(
          `-- [ATC ${maCP}] Completed. GiaDongCua: ${
            result.output.GiaDongCua ?? 'N/A'
          }, KLKhop: ${result.output.TongKLKhopATC}`
        );

        const giaDongCua = result.output.GiaDongCua;
        const tongKLKhop = result.output.TongKLKhopATC;

        // <<< PHÁT SỰ KIỆN NẾU CÓ KHỚP LỆNH >>>
        if (tongKLKhop > 0) {
          await emitMarketUpdate(maCP, 'marketUpdate');
        }
        successCount++;
      } catch (spError) {
        console.error(`-- [ATC ${maCP}] Error executing SP:`, spError.message);
        errorCount++;
        errors.push({ maCP, error: spError.message });
      }
    } // end for loop

    console.log(
      `[SERVICE TRIGGER ATC SESSION] Finished. Success: ${successCount}, Errors: ${errorCount}`
    );
    return {
      successCount,
      errorCount,
      errors,
      message: `Phiên ATC hoàn tất. ${successCount} mã thành công, ${errorCount} mã lỗi.`,
    };
  } catch (error) {
    console.error(`Error in triggerATCMatchingSession service:`, error);
    throw new AppError(
      `Lỗi hệ thống khi thực hiện khớp lệnh ATC: ${error.message}`,
      500
    );
  }
};

// --- HÀM TRIGGER KHỚP LỆNH LIÊN TỤC (THỦ CÔNG) --- => sẽ lặp qua tất cả lệnh đặt để đưa vào hàm khớp
/**
 * Kích hoạt chạy một chu kỳ khớp lệnh liên tục cho TẤT CẢ các mã CP đang hoạt động.
 * Hàm này dành cho việc trigger thủ công (demo/test).
 * @returns {Promise<object>} Kết quả tổng hợp (số mã thành công/lỗi).
 */
TradingService.triggerContinuousMatchingSession = async () => {
  const currentState = marketState.getMarketSessionState();
  // Có thể cho phép trigger ngay cả khi state không phải CONTINUOUS để test
  // if (currentState !== 'CONTINUOUS') {
  //     throw new BadRequestError(`Thị trường không ở phiên Liên tục (Hiện tại: ${currentState}). Không thể trigger khớp lệnh thủ công.`);
  // }

  console.log(`[SERVICE TRIGGER CONTINUOUS SESSION] Manual trigger received.`);
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  let matchesFoundInCycle = 0; // Đếm tổng số lệnh khớp được trong chu kỳ này

  try {
    const activeStocks = await CoPhieuModel.getActiveStocks();
    if (!activeStocks || activeStocks.length === 0) {
      console.log(
        '[SERVICE TRIGGER CONTINUOUS SESSION] No active stocks found.'
      );
      return {
        successCount,
        errorCount,
        matchesFound: 0,
        errors,
        message: 'Không có cổ phiếu nào đang hoạt động để khớp lệnh.',
      };
    }
    console.log(
      `[SERVICE TRIGGER CONTINUOUS SESSION] Found ${activeStocks.length} active stocks. Starting matching...`
    );

    // Lặp qua từng mã và thực hiện khớp lệnh liên tục
    for (const stock of activeStocks) {
      const maCP = stock.MaCP;
      console.log(`-- [CONTINUOUS ${maCP}] Manual trigger processing...`);
      try {
        // Gọi hàm khớp lệnh liên tục cho từng mã
        const matches = await TradingService.executeContinuousMatching(maCP); // Gọi hàm đã có
        if (Array.isArray(matches)) {
          matchesFoundInCycle += matches.length; // Cộng dồn số lệnh khớp được
        }
        successCount++;
      } catch (matchError) {
        // Lỗi khớp lệnh cho 1 mã CP không nên dừng toàn bộ quá trình
        console.error(
          `-- [CONTINUOUS ${maCP}] Error during manual trigger matching:`,
          matchError.message
        );
        errorCount++;
        errors.push({ maCP, error: matchError.message });
      }
    } // end for loop

    console.log(
      `[SERVICE TRIGGER CONTINUOUS SESSION] Finished. Success Codes: ${successCount}, Error Codes: ${errorCount}, Matches Found: ${matchesFoundInCycle}`
    );
    return {
      successCount,
      errorCount,
      matchesFound: matchesFoundInCycle,
      errors,
      message: `Khớp lệnh liên tục thủ công hoàn tất. ${successCount} mã thành công, ${errorCount} mã lỗi. Tìm thấy ${matchesFoundInCycle} lượt khớp.`,
    };
  } catch (error) {
    // Lỗi tổng quát (ví dụ: lấy danh sách CP lỗi)
    console.error(`Error in triggerContinuousMatchingSession service:`, error);
    throw new AppError(
      `Lỗi hệ thống khi trigger khớp lệnh liên tục: ${error.message}`,
      500
    );
  }
};

// --- THÊM HÀM SỬA LỆNH ĐẶT ---
/**
 * Nhà đầu tư sửa Giá và/hoặc Số lượng của lệnh LO đang chờ/khớp một phần.
 * @param {string} maNDTRequesting Mã NĐT yêu cầu sửa.
 * @param {number} maGD Mã giao dịch cần sửa.
 * @param {number | null} newGia Giá mới (null nếu không đổi).
 * @param {number | null} newSoLuong Số lượng mới (null nếu không đổi).
 * @returns {Promise<object>} Thông tin lệnh sau khi sửa.
 */

TradingService.modifyOrder = async (
  maNDTRequesting,
  maGD,
  newGia,
  newSoLuong
) => {
  const currentSessionState = marketState.getMarketSessionState();
  console.log(
    `[MODIFY ORDER] Request for MaGD: ${maGD}, User: ${maNDTRequesting}, Session: ${currentSessionState}`
  );

  // 1. Validate đầu vào cơ bản
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

  // 2. Lấy thông tin lệnh hiện tại
  const order = await LenhDatModel.findOrderForCancellation(maGD); // Dùng lại hàm này (cần có LoaiLenh, Gia, SoLuong, TongSoLuongKhop)
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

  // 3. Kiểm tra điều kiện sửa theo Phiên
  const allowedModifyStates = ['PREOPEN', 'ATO', 'CONTINUOUS']; // Giống hủy lệnh LO
  if (!allowedModifyStates.includes(currentSessionState)) {
    throw new BadRequestError(
      `Không thể sửa lệnh LO trong phiên '${currentSessionState}'.`
    );
  }

  // 4. Kiểm tra Giá mới trong biên độ Trần/Sàn (nếu giá thay đổi)
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

  // 5. Kiểm tra Số lượng mới >= Số lượng đã khớp
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

  // 6. Tính toán lại Tiền tạm giữ (nếu là lệnh Mua và Giá/Số lượng tăng) hoặc Hoàn tiền (nếu Giá/Số lượng giảm)
  // Đây là phần phức tạp nếu muốn chính xác tuyệt đối, vì tiền đã trừ theo giá cũ.
  // Cách đơn giản hóa: Chỉ cho phép GIẢM số lượng hoặc GIẢM giá. Không cho phép tăng.
  // Hoặc: Thực hiện điều chỉnh số dư trong transaction.

  // === Cách tiếp cận đơn giản: Chỉ cho giảm SL/Giá hoặc giữ nguyên ===
  // if (order.LoaiGD === 'M') {
  //     if (newSoLuong !== null && newSoLuong > order.SoLuong) throw new BadRequestError("Không thể tăng số lượng lệnh mua đã đặt.");
  //     if (newGia !== null && newGia > order.Gia) throw new BadRequestError("Không thể tăng giá lệnh mua đã đặt.");
  // }
  // Nếu giảm SL/Giá lệnh mua -> Cần hoàn tiền phần chênh lệch ĐÃ TẠM GIỮ.

  // === Cách tiếp cận đầy đủ hơn: Điều chỉnh số dư ===
  let balanceAdjustment = 0; // Số tiền cần +/- vào tài khoản người mua
  if (order.LoaiGD === 'M') {
    const oldRequired = order.SoLuong * order.Gia;
    const newRequiredGia =
      newGia !== null && newGia !== undefined ? newGia : order.Gia;
    const newRequiredSL =
      newSoLuong !== null && newSoLuong !== undefined
        ? newSoLuong
        : order.SoLuong;
    // Chỉ tính SL chưa khớp để điều chỉnh tiền
    const oldUnmatchedQty = order.SoLuong - currentMatchedQty;
    const newUnmatchedQty =
      newSoLuong !== null && newSoLuong !== undefined
        ? newSoLuong - currentMatchedQty
        : oldUnmatchedQty;

    if (newUnmatchedQty < 0)
      throw new AppError('Logic lỗi: Số lượng chưa khớp mới bị âm.', 500); // Không nên xảy ra

    // Tiền cần giữ cho phần chưa khớp theo giá MỚI
    const newHoldForUnmatched = newUnmatchedQty * newRequiredGia;
    // Tiền ĐÃ giữ cho phần chưa khớp theo giá CŨ
    const oldHoldForUnmatched = oldUnmatchedQty * order.Gia;

    balanceAdjustment = oldHoldForUnmatched - newHoldForUnmatched; // > 0: Hoàn tiền; < 0: Trừ thêm tiền
  }

  // --- 7. Thực hiện sửa lệnh trong Transaction ---
  let transaction;
  try {
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = transaction.request();

    // a. Điều chỉnh số dư nếu cần (cho lệnh Mua)
    if (balanceAdjustment > 0) {
      // Hoàn tiền
      await TaiKhoanNganHangModel.increaseBalance(
        request,
        order.MaTK,
        balanceAdjustment
      );
      console.log(
        `[MODIFY ORDER ${maGD}] Refunding ${balanceAdjustment} due to modification.`
      );
    } else if (balanceAdjustment < 0) {
      // Trừ thêm tiền
      await TaiKhoanNganHangModel.decreaseBalance(
        request,
        order.MaTK,
        -balanceAdjustment
      ); // decrease nhận số dương
      console.log(
        `[MODIFY ORDER ${maGD}] Deducting additional ${-balanceAdjustment} due to modification.`
      );
    }

    // b. Cập nhật chi tiết lệnh đặt
    const updatedRows = await LenhDatModel.updateOrderDetails(
      request,
      maGD,
      newGia,
      newSoLuong,
      true
    );
    if (updatedRows === 0) {
      // Có thể do lệnh vừa bị khớp hết hoặc hủy bởi tiến trình khác
      throw new ConflictError(
        `Không thể sửa lệnh ${maGD} (có thể trạng thái đã thay đổi hoặc SL mới < SL đã khớp).`
      );
    }
    console.log(`[MODIFY ORDER ${maGD}] Order details updated.`);

    await transaction.commit();
    // --- PHÁT SỰ KIỆN SAU KHI COMMIT THÀNH CÔNG ---
    // Lấy lại MaCP từ order đã lấy ở trên
    if (order && order.MaCP) {
      await emitMarketUpdate(order.MaCP, 'orderBookUpdate'); // <<< GỌI EMIT
    }
    // Lấy lại thông tin lệnh đã sửa để trả về
    const modifiedOrder = await LenhDatModel.findOrderForCancellation(maGD); // Dùng tạm hàm này

    return modifiedOrder;
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    console.error(`[MODIFY ORDER ${maGD}] Transaction Error:`, error);
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError ||
      error instanceof AuthorizationError ||
      error instanceof AppError
    ) {
      throw error; // Ném lại lỗi đã biết
    }
    if (error.message && error.message.includes('không đủ')) {
      // Lỗi từ decreaseBalance
      throw new BadRequestError(error.message);
    }
    throw new AppError(`Lỗi khi sửa lệnh đặt ${maGD}: ${error.message}`, 500);
  }
};

module.exports = TradingService;

// --- Cần đảm bảo `LenhDat.model.js` có hàm trả về `LoaiLenh` ---
/*
// Trong LenhDat.model.js, sửa hàm findOrderForCancellation:
LenhDat.findOrderForCancellation = async (maGD) => {
  try {
    // ... (pool, request) ...
    request.input("MaGD", sql.Int, maGD);
    const query = `
          SELECT
              ld.MaGD, ld.LoaiGD, ld.SoLuong, ld.Gia, ld.MaTK, ld.TrangThai,
              ld.LoaiLenh, -- <<< THÊM LoaiLenh
              tk.MaNDT,
              ISNULL((SELECT SUM(lk.SoLuongKhop) FROM LENHKHOP lk WHERE lk.MaGD = ld.MaGD), 0) AS TongSoLuongKhop
          FROM LENHDAT ld
          JOIN TAIKHOAN_NGANHANG tk ON ld.MaTK = tk.MaTK
          WHERE ld.MaGD = @MaGD;
      `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (err) { /* ... error handling ... */
