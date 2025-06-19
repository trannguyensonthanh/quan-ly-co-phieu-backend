/**
 * services/stock.service.js
 * Service xử lý nghiệp vụ liên quan đến cổ phiếu.
 */
const CoPhieuModel = require('../models/CoPhieu.model');
const BadRequestError = require('../utils/errors/BadRequestError');
const ConflictError = require('../utils/errors/ConflictError');
const NotFoundError = require('../utils/errors/NotFoundError');
const LichSuGiaModel = require('../models/LichSuGia.model');
const SoHuuModel = require('../models/SoHuu.model');
const CoPhieuUndoLogModel = require('../models/CoPhieuUndoLog.model');
const db = require('../models/db');
const AppError = require('../utils/errors/AppError');
const sql = require('mssql');
const StockService = {};

/**
 * Tạo cổ phiếu mới.
 */
StockService.createStock = async (stockData, performedBy) => {
  const existingStock = await CoPhieuModel.findByMaCP(stockData.MaCP);
  if (existingStock) {
    throw new ConflictError(`Mã cổ phiếu '${stockData.MaCP}' đã tồn tại.`);
  }
  if (stockData.SoLuongPH <= 0) {
    throw new BadRequestError('Số lượng phát hành phải lớn hơn 0.');
  }
  try {
    const newStock = await CoPhieuModel.create(stockData);
    if (!newStock) {
      throw new AppError('Không thể tạo bản ghi cổ phiếu.', 500);
    }
    try {
      await CoPhieuUndoLogModel.create(
        newStock.MaCP,
        'INSERT',
        null,
        performedBy
      );
    } catch (logErr) {
      console.error(
        `WARNING: Failed to create UNDO log for INSERT on ${newStock.MaCP}: ${logErr.message}`
      );
    }
    return newStock;
  } catch (error) {
    if (error.message.includes('đã tồn tại')) {
      throw new ConflictError(error.message);
    }
    console.error('Error in createStock service:', error);
    throw error;
  }
};

/**
 * Lấy tất cả cổ phiếu đang giao dịch.
 */
StockService.getAllStocks = async () => {
  return await CoPhieuModel.getActiveStocks();
};

/**
 * Lấy tất cả cổ phiếu (cho admin).
 */
StockService.getAllStocksForAdmin = async () => {
  return await CoPhieuModel.getAllForAdmin();
};

/**
 * Lấy danh sách cổ phiếu theo trạng thái.
 * @param {number} status Trạng thái của cổ phiếu (0, 1, 2, ...).
 * @returns {Promise<Array>} Danh sách cổ phiếu theo trạng thái.
 */
StockService.getStocksByStatus = async (status) => {
  status = Number(status);
  if (isNaN(status) || status < 0) {
    throw new BadRequestError('Trạng thái phải là một số nguyên không âm.');
  }
  try {
    const stocks = await CoPhieuModel.findByStatus(status);
    return stocks;
  } catch (error) {
    console.error(
      `Error in getStocksByStatus service for status ${status}:`,
      error
    );
    throw new AppError(
      `Lỗi khi lấy danh sách cổ phiếu theo trạng thái ${status}: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy cổ phiếu theo mã.
 */
StockService.getStockByMaCP = async (maCP) => {
  const stock = await CoPhieuModel.findByMaCP(maCP);
  if (!stock) {
    throw new NotFoundError(`Không tìm thấy cổ phiếu với mã '${maCP}'.`);
  }
  return stock;
};

/**
 * Cập nhật thông tin cổ phiếu.
 */
StockService.updateStock = async (maCP, stockData, performedBy) => {
  try {
    const currentStock = await CoPhieuModel.findByMaCP(maCP);
    if (!currentStock) {
      throw new NotFoundError(`Không tìm thấy cổ phiếu với mã '${maCP}'.`);
    }
    if (currentStock.Status === 0) {
      const oldDataToLog = {
        TenCty: currentStock.TenCty,
        DiaChi: currentStock.DiaChi,
        SoLuongPH: currentStock.SoLuongPH,
      };
      try {
        await CoPhieuUndoLogModel.create(
          maCP,
          'UPDATE',
          oldDataToLog,
          performedBy
        );
      } catch (logErr) {
        console.error(
          `WARNING: Failed to create UNDO log for UPDATE on ${maCP}: ${logErr.message}`
        );
      }
    }
    const affectedRows = await CoPhieuModel.updateDetails(maCP, stockData);
    const updatedStock = await CoPhieuModel.findByMaCP(maCP);
    return updatedStock;
  } catch (error) {
    if (error.message.includes('đã tồn tại')) {
      throw new ConflictError(error.message);
    }
    if (error instanceof NotFoundError) throw error;
    console.error(`Error in updateStock service for ${maCP}:`, error);
    throw new AppError(
      `Lỗi khi cập nhật cổ phiếu ${maCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Xóa cổ phiếu (hard delete).
 */
StockService.deleteStock = async (maCP, performedBy) => {
  try {
    const currentStock = await CoPhieuModel.findByMaCP(maCP);
    if (!currentStock) {
      throw new NotFoundError(`Không tìm thấy cổ phiếu với mã '${maCP}'.`);
    }
    if (currentStock.Status === 1) {
      throw new BadRequestError(
        `Cổ phiếu '${maCP}' đang giao dịch. Vui lòng sử dụng chức năng 'Ngừng giao dịch' trước.`
      );
    }
    if (currentStock.Status === 2) {
      throw new BadRequestError(
        `Cổ phiếu '${maCP}' đã ngừng giao dịch và không thể xóa vĩnh viễn.`
      );
    }
    const distributedQty = await CoPhieuModel.getTotalDistributedQuantity(maCP);
    if (distributedQty > 0) {
      throw new BadRequestError(
        `Không thể xóa cổ phiếu '${maCP}' vì đã được phân bổ (${distributedQty} CP). Hãy thu hồi phân bổ trước.`
      );
    }
    const oldDataToLog = {
      MaCP: currentStock.MaCP,
      TenCty: currentStock.TenCty,
      DiaChi: currentStock.DiaChi,
      SoLuongPH: currentStock.SoLuongPH,
      Status: currentStock.Status,
    };
    try {
      await CoPhieuUndoLogModel.create(
        maCP,
        'DELETE',
        oldDataToLog,
        performedBy
      );
    } catch (logErr) {
      console.error(
        `WARNING: Failed to create UNDO log for DELETE on ${maCP}: ${logErr.message}`
      );
    }
    const affectedRows = await CoPhieuModel.hardDelete(maCP);
    if (affectedRows === 0) {
      const checkStock = await CoPhieuModel.findByMaCP(maCP);
      if (checkStock && checkStock.Status !== 0) {
        throw new ConflictError(
          `Không thể xóa cổ phiếu ${maCP} vì trạng thái không hợp lệ (Status=${checkStock.Status}).`
        );
      }
      throw new AppError(`Xóa cổ phiếu '${maCP}' thất bại.`, 500);
    }
    return { message: `Đã xóa cổ phiếu chờ niêm yết '${maCP}' thành công.` };
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    console.error(`Error in deleteStock service for ${maCP}:`, error);
    throw new AppError(`Lỗi khi xóa cổ phiếu ${maCP}: ${error.message}`, 500);
  }
};

/**
 * Niêm yết cổ phiếu (chuyển Status từ 0 sang 1).
 */
StockService.listStock = async (maCP, initialGiaTC) => {
  if (typeof initialGiaTC !== 'number' || initialGiaTC <= 0) {
    throw new BadRequestError(
      'Giá tham chiếu ban đầu phải là số dương hợp lệ.'
    );
  }
  try {
    const currentStock = await CoPhieuModel.findByMaCP(maCP);
    if (!currentStock)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (currentStock.Status !== 0)
      throw new BadRequestError(
        `Cổ phiếu '${maCP}' không ở trạng thái 'Chờ niêm yết' (Status hiện tại: ${currentStock.Status}).`
      );
    await LichSuGiaModel.insertInitialPrice(maCP, initialGiaTC);
    const updatedRows = await CoPhieuModel.updateStatus(maCP, 1);
    if (updatedRows === 0)
      throw new AppError(
        `Không thể cập nhật trạng thái niêm yết cho ${maCP}.`,
        500
      );
    await CoPhieuUndoLogModel.deleteLogsByMaCP(maCP);
    const pool = await db.getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    await transaction.commit();
    return { message: `Cổ phiếu '${maCP}' đã được niêm yết thành công.` };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError)
      throw error;
    if (
      error.message.includes('Mã cổ phiếu') &&
      error.message.includes('không tồn tại')
    ) {
      throw new BadRequestError(error.message);
    }
    console.error(`Error in listStock service for ${maCP}:`, error);
    throw new AppError(
      `Lỗi khi niêm yết cổ phiếu ${maCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Ngừng giao dịch cổ phiếu (chuyển Status từ 1 sang 2).
 */
StockService.delistStock = async (maCP, performedBy) => {
  try {
    const pool = await db.getPool();
    const timeResult = await pool
      .request()
      .query(
        'SELECT GETDATE() as CurrentDateTime, DATEPART(weekday, GETDATE()) as WeekDay, DATEPART(hour, GETDATE()) as Hour'
      );
    const serverTime = timeResult.recordset[0];
    const isTradingHours = serverTime.Hour >= 9 && serverTime.Hour < 15;
    if (isTradingHours) {
      throw new BadRequestError(
        'Chỉ có thể ngừng giao dịch ngoài giờ thị trường (Trước 9h hoặc từ 15h).'
      );
    }
    const currentStock = await CoPhieuModel.findByMaCP(maCP);
    if (!currentStock)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (currentStock.Status !== 1)
      throw new BadRequestError(
        `Cổ phiếu '${maCP}' không ở trạng thái 'Đang giao dịch' (Status hiện tại: ${currentStock.Status}).`
      );
    const updatedRows = await CoPhieuModel.updateStatus(maCP, 2);
    if (updatedRows === 0)
      throw new AppError(
        `Không thể cập nhật trạng thái ngừng giao dịch cho ${maCP}.`,
        500
      );
    return {
      message: `Cổ phiếu '${maCP}' đã được chuyển sang trạng thái ngừng giao dịch.`,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError)
      throw error;
    console.error(`Error in delistStock service for ${maCP}:`, error);
    throw new AppError(
      `Lỗi khi ngừng giao dịch cổ phiếu ${maCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Cho phép cổ phiếu giao dịch trở lại (chuyển Status từ 2 sang 1).
 * Cần cung cấp giá TC/Trần/Sàn mới cho ngày giao dịch trở lại.
 * @param {string} maCP Mã cổ phiếu.
 * @param {number} giaTC Giá tham chiếu cho ngày giao dịch trở lại.
 * @param {string} performedBy Mã Admin thực hiện.
 * @returns {Promise<{message: string}>}
 */
StockService.relistStock = async (maCP, giaTC, performedBy) => {
  if (typeof giaTC !== 'number' || giaTC <= 0 || giaTC % 100 !== 0) {
    throw new BadRequestError(
      'Giá tham chiếu phải là số dương hợp lệ và là bội số của 100.'
    );
  }
  const ngayGiaoDichTroLai = new Date();
  ngayGiaoDichTroLai.setHours(0, 0, 0, 0);
  const todaySQL = ngayGiaoDichTroLai.toISOString().slice(0, 10);
  let transaction;
  const pool = await db.getPool();
  transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = transaction.request();
    const currentStock = await CoPhieuModel.findByMaCP(maCP);
    if (!currentStock)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (currentStock.Status !== 2)
      throw new BadRequestError(
        `Cổ phiếu '${maCP}' không ở trạng thái 'Ngừng giao dịch' (Status hiện tại: ${currentStock.Status}). Không thể niêm yết lại.`
      );
    await LichSuGiaModel.insertInitialPrice(maCP, giaTC);
    const updatedRows = await CoPhieuModel.updateStatus(maCP, 1);
    if (updatedRows === 0)
      throw new AppError(
        `Không thể cập nhật trạng thái giao dịch lại cho ${maCP}.`,
        500
      );
    const latestLog = await CoPhieuUndoLogModel.findLatestByMaCP(maCP);
    if (latestLog) {
      await CoPhieuUndoLogModel.deleteLog(latestLog.UndoLogID);
    }
    await transaction.commit();
    return {
      message: `Cổ phiếu '${maCP}' đã được cho phép giao dịch trở lại từ ngày ${todaySQL}.`,
    };
  } catch (error) {
    if (transaction && transaction.active) await transaction.rollback();
    console.error(`Error in relistStock service for ${maCP}:`, error);
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof AppError
    )
      throw error;
    if (error.message && error.message.includes('không tồn tại')) {
      throw new BadRequestError(error.message);
    }
    throw new AppError(
      `Lỗi khi cho phép giao dịch lại CP ${maCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Hoàn tác hành động cuối cùng (chỉ khi Status = 0 và chưa có giá).
 */
StockService.undoLastAction = async (performedBy) => {
  try {
    const latestLog = await CoPhieuUndoLogModel.findLatestGlobal();
    if (!latestLog) {
      throw new NotFoundError(`Không có hành động nào gần đây để hoàn tác.`);
    }
    const maCPToUndo = latestLog.MaCP;
    const hasPriceHistory = await LichSuGiaModel.checkIfPriceExists(maCPToUndo);
    if (hasPriceHistory) {
      await CoPhieuUndoLogModel.deleteLog(latestLog.UndoLogID);
      throw new BadRequestError(
        `Hành động gần nhất (${latestLog.ActionType} trên ${maCPToUndo}) không thể hoàn tác vì cổ phiếu đã có lịch sử giá.`,
        { canRetryUndo: true }
      );
    }
    const distributedQty = await CoPhieuModel.getTotalDistributedQuantity(
      maCPToUndo
    );
    if (distributedQty > 0) {
      await CoPhieuUndoLogModel.deleteLog(latestLog.UndoLogID);
      throw new BadRequestError(
        `Hành động gần nhất (${latestLog.ActionType} trên ${maCPToUndo}) không thể hoàn tác vì cổ phiếu đã được phân bổ.`,
        { canRetryUndo: true }
      );
    }
    const currentStock = await CoPhieuModel.findByMaCP(maCPToUndo);
    if (
      currentStock &&
      currentStock.Status !== 0 &&
      latestLog.ActionType !== 'DELETE'
    ) {
      await CoPhieuUndoLogModel.deleteLog(latestLog.UndoLogID);
      throw new BadRequestError(
        `Hành động gần nhất (${latestLog.ActionType} trên ${maCPToUndo}) không thể hoàn tác vì trạng thái cổ phiếu không phải 'Chờ niêm yết'.`,
        { canRetryUndo: true }
      );
    }
    let undoMessage = '';
    let transaction;
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();
      if (latestLog.ActionType === 'INSERT') {
        if (!currentStock) {
        } else {
          const deletedRows = await CoPhieuModel.hardDelete(maCPToUndo);
          if (
            deletedRows === 0 &&
            (await CoPhieuModel.findByMaCP(maCPToUndo))
          ) {
            throw new AppError(
              `Hoàn tác INSERT thất bại (DELETE), không thể xóa ${maCPToUndo}.`,
              500
            );
          }
        }
        undoMessage = `Hoàn tác: Đã xóa cổ phiếu '${maCPToUndo}' vừa thêm.`;
      } else if (latestLog.ActionType === 'DELETE') {
        if (currentStock)
          throw new ConflictError(
            `Hoàn tác DELETE: Cổ phiếu '${maCPToUndo}' vẫn tồn tại.`
          );
        if (!latestLog.OldData)
          throw new AppError(`Lỗi hoàn tác DELETE: Thiếu dữ liệu cũ.`);
        const oldStockData = JSON.parse(latestLog.OldData);
        const reinsertedStock = await CoPhieuModel.create({
          MaCP: oldStockData.MaCP,
          TenCty: oldStockData.TenCty,
          DiaChi: oldStockData.DiaChi,
          SoLuongPH: oldStockData.SoLuongPH,
        });
        if (!reinsertedStock)
          throw new AppError(`Hoàn tác DELETE thất bại (INSERT).`, 500);
        undoMessage = `Hoàn tác: Đã khôi phục cổ phiếu '${maCPToUndo}'.`;
      } else if (latestLog.ActionType === 'UPDATE') {
        if (!currentStock)
          throw new NotFoundError(
            `Hoàn tác UPDATE: Cổ phiếu '${maCPToUndo}' không tồn tại.`
          );
        if (!latestLog.OldData)
          throw new AppError(`Lỗi hoàn tác UPDATE: Thiếu dữ liệu cũ.`);
        const oldStockData = JSON.parse(latestLog.OldData);
        const updatedRows = await CoPhieuModel.updateDetails(maCPToUndo, {
          TenCty: oldStockData.TenCty,
          DiaChi: oldStockData.DiaChi,
          SoLuongPH: oldStockData.SoLuongPH,
        });
        undoMessage = `Hoàn tác: Đã khôi phục thông tin trước đó của '${maCPToUndo}'.`;
      } else {
        throw new AppError(
          `Loại hành động '${latestLog.ActionType}' không hỗ trợ hoàn tác.`
        );
      }
      const logDeleted = await CoPhieuUndoLogModel.deleteLog(
        latestLog.UndoLogID
      );
      await transaction.commit();
      undoMessage = `Hoàn tác thành công hành động '${latestLog.ActionType}' trên mã CP '${maCPToUndo}'.`;
      return { message: undoMessage };
    } catch (innerError) {
      if (transaction && transaction.active) await transaction.rollback();
      throw innerError;
    }
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError ||
      error instanceof AppError
    ) {
      throw error;
    }
    console.error(`Error in global undoLastAction service:`, error);
    throw new AppError(
      `Lỗi khi hoàn tác hành động cuối cùng: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy thông tin về hành động cuối cùng có thể hoàn tác cho một mã CP.
 * Chỉ trả về thông tin log, không thực hiện undo.
 * @param {string} maCP Mã cổ phiếu.
 * @returns {Promise<object|null>} Thông tin log gần nhất hoặc null nếu không có log.
 */
StockService.getLatestUndoLog = async (maCP) => {
  try {
    const latestLog = await CoPhieuUndoLogModel.findLatestByMaCP(maCP);
    return latestLog;
  } catch (error) {
    console.error(`Error getting latest undo log for ${maCP}:`, error);
    throw new AppError(
      `Lỗi khi lấy thông tin hoàn tác cho ${maCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy dữ liệu bảng giá.
 */
StockService.getMarketBoard = async () => {
  try {
    const boardData = await CoPhieuModel.getMarketBoardData();
    return boardData;
  } catch (error) {
    console.error('Service error getting market board data:', error);
    throw error;
  }
};

/**
 * Lấy lịch sử giá chi tiết của một mã cổ phiếu.
 * @param {string} maCP Mã cổ phiếu.
 * @param {string | Date} tuNgay Ngày bắt đầu.
 * @param {string | Date} denNgay Ngày kết thúc.
 */
StockService.getStockPriceHistory = async (maCP, tuNgay, denNgay) => {
  const startDate = new Date(tuNgay);
  const endDate = new Date(denNgay);
  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new BadRequestError('Khoảng thời gian cung cấp không hợp lệ.');
  }
  try {
    const history = await LichSuGiaModel.getHistoryByMaCP(
      maCP,
      startDate,
      endDate
    );
    return history;
  } catch (error) {
    console.error(`Error in getStockPriceHistory service for ${maCP}:`, error);
    if (error instanceof AppError || error instanceof BadRequestError)
      throw error;
    throw new AppError(
      `Lỗi khi lấy lịch sử giá CP ${maCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy lịch sử giá chi tiết của một mã cổ phiếu trong N ngày gần nhất.
 * @param {string} maCP Mã cổ phiếu.
 * @param {number} days Số ngày gần nhất cần lấy.
 */
StockService.getRecentStockPriceHistory = async (maCP, days) => {
  const numberOfDays = parseInt(days, 10);
  if (isNaN(numberOfDays) || numberOfDays <= 0) {
    throw new BadRequestError("Số ngày ('days') phải là một số nguyên dương.");
  }
  try {
    const history = await LichSuGiaModel.getRecentHistoryByMaCP(
      maCP,
      numberOfDays
    );
    return history;
  } catch (error) {
    console.error(
      `Error in getRecentStockPriceHistory service for ${maCP}:`,
      error
    );
    if (error instanceof AppError || error instanceof BadRequestError) {
      throw error;
    }
    throw new AppError(
      `Lỗi khi lấy lịch sử giá gần đây của CP ${maCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy tổng số lượng cổ phiếu của một mã đang được nắm giữ bởi tất cả NĐT.
 * @param {string} maCP Mã cổ phiếu.
 * @returns {Promise<{maCP: string, totalDistributed: number}>}
 */
StockService.getTotalDistributedQuantity = async (maCP) => {
  try {
    const quantity = await CoPhieuModel.getTotalDistributedQuantity(maCP);
    return { maCP: maCP, totalDistributed: quantity };
  } catch (error) {
    console.error(
      `Error getting total distributed quantity for ${maCP}:`,
      error
    );
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Lỗi khi lấy tổng số lượng phân bổ cho ${maCP}: ${error.message}`,
      500
    );
  }
};

/**
 * Lấy danh sách cổ đông đang nắm giữ một mã cổ phiếu.
 * @param {string} maCP Mã cổ phiếu.
 * @returns {Promise<Array<object>>}
 */
StockService.getShareholders = async (maCP) => {
  const stockExists = await CoPhieuModel.findByMaCP(maCP);
  if (!stockExists) {
    throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
  }
  try {
    const shareholders = await SoHuuModel.findShareholdersByMaCP(maCP);
    return shareholders;
  } catch (error) {
    console.error(`Error in getShareholders service for ${maCP}:`, error);
    if (error instanceof AppError || error instanceof NotFoundError)
      throw error;
    throw new AppError(
      `Lỗi khi lấy danh sách cổ đông cho ${maCP}: ${error.message}`,
      500
    );
  }
};

module.exports = StockService;
