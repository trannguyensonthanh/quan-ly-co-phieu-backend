// services/stock.service.js
const CoPhieuModel = require("../models/CoPhieu.model");
const BadRequestError = require("../utils/errors/BadRequestError");
const ConflictError = require("../utils/errors/ConflictError");
const NotFoundError = require("../utils/errors/NotFoundError");
const LichSuGiaModel = require("../models/LichSuGia.model"); // Model đã thêm hàm

const CoPhieuUndoLogModel = require("../models/CoPhieuUndoLog.model"); // Model mới
const db = require("../models/db"); // Có thể cần cho giờ server
const AppError = require("../utils/errors/AppError");
const sql = require("mssql"); // Cần cho transaction request nếu model yêu cầu
const StockService = {};

StockService.createStock = async (stockData, performedBy) => {
  // Kiểm tra nghiệp vụ (ví dụ: MaCP đã tồn tại chưa?)
  const existingStock = await CoPhieuModel.findByMaCP(stockData.MaCP);
  if (existingStock) {
    throw new ConflictError(`Mã cổ phiếu '${stockData.MaCP}' đã tồn tại.`);
  }
  // Kiểm tra ràng buộc khác nếu cần (vd: SoLuongPH > 0 đã có trong DB constraint nhưng có thể check thêm ở đây)
  if (stockData.SoLuongPH <= 0) {
    throw new BadRequestError("Số lượng phát hành phải lớn hơn 0.");
  }
  try {
    // Model.create có thể ném lỗi DB nếu có vấn đề khác
    // Bước 1: Tạo bản ghi cổ phiếu
    const newStock = await CoPhieuModel.create(stockData);
    if (!newStock) {
      throw new AppError("Không thể tạo bản ghi cổ phiếu.", 500);
    }

    // Bước 2: Ghi Undo Log cho hành động INSERT
    try {
      await CoPhieuUndoLogModel.create(
        newStock.MaCP,
        "INSERT",
        null,
        performedBy
      );
    } catch (logErr) {
      // Lỗi ghi log không nên rollback việc tạo CP, chỉ cảnh báo
      console.error(
        `WARNING: Failed to create UNDO log for INSERT on ${newStock.MaCP}: ${logErr.message}`
      );
    }

    return newStock; // Trả về cổ phiếu đã tạo
  } catch (error) {
    // Lỗi từ CoPhieuModel.create (vd: trùng key) đã được chuẩn hóa tương đối
    if (error.message.includes("đã tồn tại")) {
      throw new ConflictError(error.message);
    }
    console.error("Error in createStock service:", error);
    throw error; // Ném lại lỗi khác
  }
};

// --- Hàm lấy dữ liệu (Đảm bảo gọi đúng model đã lọc Status) ---
StockService.getAllStocks = async () => {
  // Trả về các mã đang giao dịch cho mục đích công khai
  return await CoPhieuModel.getActiveStocks();
};

StockService.getAllStocksForAdmin = async () => {
  // Trả về tất cả mã cho Admin
  console.log("Fetching all stocks for admin view.");
  return await CoPhieuModel.getAllForAdmin();
};

StockService.getStockByMaCP = async (maCP) => {
  const stock = await CoPhieuModel.findByMaCP(maCP);
  if (!stock) {
    throw new NotFoundError(`Không tìm thấy cổ phiếu với mã '${maCP}'.`);
  }
  return stock;
};

StockService.getStockByMaCP = async (maCP) => {
  const stock = await CoPhieuModel.findByMaCP(maCP);
  if (!stock) {
    throw new NotFoundError(`Không tìm thấy cổ phiếu với mã '${maCP}'.`);
  }
  return stock;
};

StockService.updateStock = async (maCP, stockData, performedBy) => {
  try {
    // Bước 1: Lấy thông tin hiện tại (bao gồm Status)
    const currentStock = await CoPhieuModel.findByMaCP(maCP);
    if (!currentStock) {
      throw new NotFoundError(`Không tìm thấy cổ phiếu với mã '${maCP}'.`);
    }

    // Bước 2: Ghi Undo Log (CHỈ KHI Status = 0)
    if (currentStock.Status === 0) {
      // Chỉ lưu những trường có thể bị thay đổi vào OldData
      const oldDataToLog = {
        TenCty: currentStock.TenCty,
        DiaChi: currentStock.DiaChi,
        SoLuongPH: currentStock.SoLuongPH,
        // Không cần lưu Status cũ vì chỉ undo khi status = 0
      };
      try {
        await CoPhieuUndoLogModel.create(
          maCP,
          "UPDATE",
          oldDataToLog,
          performedBy
        );
      } catch (logErr) {
        console.error(
          `WARNING: Failed to create UNDO log for UPDATE on ${maCP}: ${logErr.message}`
        );
      }
    } else {
      console.log(
        `Stock ${maCP} has Status ${currentStock.Status}, UNDO log for UPDATE will not be created.`
      );
    }

    // Bước 3: Thực hiện cập nhật chi tiết
    const affectedRows = await CoPhieuModel.updateDetails(maCP, stockData);
    // Có thể không có dòng nào bị ảnh hưởng nếu dữ liệu gửi lên giống hệt dữ liệu cũ
    // if (affectedRows === 0 && Object.keys(stockData).length > 0) {
    //     console.warn(`Stock ${maCP} details update resulted in 0 affected rows.`);
    // }

    // Trả về thông tin mới nhất sau khi cập nhật
    const updatedStock = await CoPhieuModel.findByMaCP(maCP);
    return updatedStock;
  } catch (error) {
    if (error.message.includes("đã tồn tại")) {
      // Lỗi unique TenCty từ updateDetails
      throw new ConflictError(error.message);
    }
    if (error instanceof NotFoundError) throw error; // Ném lại NotFoundError
    console.error(`Error in updateStock service for ${maCP}:`, error);
    throw new AppError(
      `Lỗi khi cập nhật cổ phiếu ${maCP}: ${error.message}`,
      500
    );
  }
};

StockService.deleteStock = async (maCP, performedBy) => {
  try {
    const currentStock = await CoPhieuModel.findByMaCP(maCP);
    if (!currentStock) {
      throw new NotFoundError(`Không tìm thấy cổ phiếu với mã '${maCP}'.`);
    }

    // Kiểm tra Status
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

    // Chỉ tiếp tục nếu Status === 0
    console.log(`Attempting to hard delete stock ${maCP} with Status 0.`);

    // Ghi Undo Log trước khi xóa
    const oldDataToLog = {
      MaCP: currentStock.MaCP,
      TenCty: currentStock.TenCty,
      DiaChi: currentStock.DiaChi,
      SoLuongPH: currentStock.SoLuongPH,
      Status: currentStock.Status, // Lưu cả status 0
    };
    try {
      await CoPhieuUndoLogModel.create(
        maCP,
        "DELETE",
        oldDataToLog,
        performedBy
      );
    } catch (logErr) {
      console.error(
        `WARNING: Failed to create UNDO log for DELETE on ${maCP}: ${logErr.message}`
      );
      // Có thể cân nhắc dừng lại nếu không ghi được log ? -> Tạm thời vẫn tiếp tục xóa
    }

    // Thực hiện xóa cứng
    const affectedRows = await CoPhieuModel.hardDelete(maCP);

    if (affectedRows === 0) {
      // Có thể do race condition hoặc Status không phải là 0
      console.warn(
        `Hard delete for ${maCP} affected 0 rows. Status might have changed or FK constraint violation.`
      );
      // Kiểm tra lại status để đưa ra lỗi rõ hơn
      const checkStock = await CoPhieuModel.findByMaCP(maCP);
      if (checkStock && checkStock.Status !== 0) {
        throw new ConflictError(
          `Không thể xóa cổ phiếu ${maCP} vì trạng thái không hợp lệ (Status=${checkStock.Status}).`
        );
      }
      // Nếu vẫn không xóa được có thể do FK ngầm nào đó?
      throw new AppError(`Xóa cổ phiếu '${maCP}' thất bại.`, 500);
    }

    return { message: `Đã xóa cổ phiếu chờ niêm yết '${maCP}' thành công.` };
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError ||
      error instanceof ConflictError
    ) {
      throw error; // Ném lại các lỗi đã biết
    }
    console.error(`Error in deleteStock service for ${maCP}:`, error);
    throw new AppError(`Lỗi khi xóa cổ phiếu ${maCP}: ${error.message}`, 500);
  }
};

/** Niêm yết cổ phiếu (chuyển Status từ 0 sang 1) */
StockService.listStock = async (maCP, initialGiaTC) => {
  if (typeof initialGiaTC !== "number" || initialGiaTC <= 0) {
    throw new BadRequestError(
      "Giá tham chiếu ban đầu phải là số dương hợp lệ."
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

    // Chèn giá ban đầu vào LICHSUGIA (Model tự tính Trần/Sàn)
    await LichSuGiaModel.insertInitialPrice(maCP, initialGiaTC);

    // Cập nhật Status thành 1 (Đang giao dịch)
    const updatedRows = await CoPhieuModel.updateStatus(maCP, 1);
    if (updatedRows === 0)
      throw new AppError(
        `Không thể cập nhật trạng thái niêm yết cho ${maCP}.`,
        500
      );

    // Hàm này có thể chạy độc lập hoặc nhận trans request
    await CoPhieuUndoLogModel.deleteLogsByMaCP(maCP); // <<< GỌI HÀM MỚI

    // Commit transaction tổng
    const pool = await db.getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    await transaction.commit();

    return { message: `Cổ phiếu '${maCP}' đã được niêm yết thành công.` };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError)
      throw error;
    if (
      error.message.includes("Mã cổ phiếu") &&
      error.message.includes("không tồn tại")
    ) {
      // Lỗi FK từ insertInitialPrice
      throw new BadRequestError(error.message); // Nên là 400 Bad Request
    }
    console.error(`Error in listStock service for ${maCP}:`, error);
    throw new AppError(
      `Lỗi khi niêm yết cổ phiếu ${maCP}: ${error.message}`,
      500
    );
  }
};

/** Ngừng giao dịch cổ phiếu (chuyển Status từ 1 sang 2) */
StockService.delistStock = async (maCP, performedBy) => {
  try {
    // TODO: Kiểm tra giờ giao dịch của server
    const pool = await db.getPool();
    const timeResult = await pool
      .request()
      .query(
        "SELECT GETDATE() as CurrentDateTime, DATEPART(weekday, GETDATE()) as WeekDay, DATEPART(hour, GETDATE()) as Hour"
      );
    const serverTime = timeResult.recordset[0];
    // Đơn giản: Thứ 2-6 (WeekDay 2-6 theo SQL Server), ngoài giờ 9-15
    // const isTradingHours = serverTime.WeekDay >= 2 && serverTime.WeekDay <= 6 && serverTime.Hour >= 9 && serverTime.Hour < 15;
    // if (isTradingHours) {
    //     throw new BadRequestError("Chỉ có thể ngừng giao dịch ngoài giờ thị trường (Trước 9h hoặc từ 15h, T2-T6).");
    // }
    const isTradingHours = serverTime.Hour >= 9 && serverTime.Hour < 15;
    if (isTradingHours) {
      throw new BadRequestError(
        "Chỉ có thể ngừng giao dịch ngoài giờ thị trường (Trước 9h hoặc từ 15h)."
      );
    }

    const currentStock = await CoPhieuModel.findByMaCP(maCP);
    if (!currentStock)
      throw new NotFoundError(`Không tìm thấy cổ phiếu '${maCP}'.`);
    if (currentStock.Status !== 1)
      throw new BadRequestError(
        `Cổ phiếu '${maCP}' không ở trạng thái 'Đang giao dịch' (Status hiện tại: ${currentStock.Status}).`
      );

    // Cập nhật Status thành 2 (Ngừng giao dịch)
    const updatedRows = await CoPhieuModel.updateStatus(maCP, 2);
    if (updatedRows === 0)
      throw new AppError(
        `Không thể cập nhật trạng thái ngừng giao dịch cho ${maCP}.`,
        500
      );

    // Không ghi UndoLog cho hành động này

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

/** Hoàn tác hành động cuối cùng (chỉ khi Status = 0 và chưa có giá) */
StockService.undoLastAction = async (performedBy) => {
  // Bỏ tham số maCP
  try {
    // 1. Tìm log undo gần nhất TRÊN TOÀN CỤC
    const latestLog = await CoPhieuUndoLogModel.findLatestGlobal(); // Gọi hàm mới
    if (!latestLog) {
      throw new NotFoundError(`Không có hành động nào gần đây để hoàn tác.`);
    }

    const maCPToUndo = latestLog.MaCP; // <<< Lấy MaCP từ log
    console.log(
      `[GLOBAL UNDO] Found log ID ${latestLog.UndoLogID} for MaCP ${maCPToUndo}, Action: ${latestLog.ActionType}`
    );

    // 2. Kiểm tra điều kiện Undo cho MaCP trong log
    const hasPriceHistory = await LichSuGiaModel.checkIfPriceExists(maCPToUndo);
    if (hasPriceHistory) {
      console.warn(
        `[GLOBAL UNDO] Cannot undo log ID ${latestLog.UndoLogID} for ${maCPToUndo} (has price history). Deleting stale log.`
      );
      await CoPhieuUndoLogModel.deleteLog(latestLog.UndoLogID);
      throw new BadRequestError(
        `Hành động gần nhất (${latestLog.ActionType} trên ${maCPToUndo}) không thể hoàn tác vì cổ phiếu đã có lịch sử giá.`,
        { canRetryUndo: true }
      );
    }

    const currentStock = await CoPhieuModel.findByMaCP(maCPToUndo);

    // Kiểm tra Status (nếu CP còn tồn tại và hành động không phải là DELETE)
    if (
      currentStock &&
      currentStock.Status !== 0 &&
      latestLog.ActionType !== "DELETE"
    ) {
      console.warn(
        `[GLOBAL UNDO] Cannot undo log ID ${latestLog.UndoLogID} for ${maCPToUndo} (Status is ${currentStock.Status}). Deleting stale log.`
      );
      await CoPhieuUndoLogModel.deleteLog(latestLog.UndoLogID);
      throw new BadRequestError(
        `Hành động gần nhất (${latestLog.ActionType} trên ${maCPToUndo}) không thể hoàn tác vì trạng thái cổ phiếu không phải 'Chờ niêm yết'.`,
        { canRetryUndo: true }
      );
    }

    // 3. Thực hiện hành động Undo
    let undoMessage = "";
    let transaction; // Khai báo transaction ở scope ngoài
    const pool = await db.getPool();
    transaction = new sql.Transaction(pool); // Tạo transaction

    try {
      // Bắt đầu khối try cho transaction
      await transaction.begin();
      // Tạo request dùng trong transaction (nếu các hàm model cần)
      // const request = transaction.request();

      if (latestLog.ActionType === "INSERT") {
        if (!currentStock) {
          console.warn(
            `[UNDO INSERT ${maCPToUndo}] Stock already deleted? Proceeding.`
          );
        }
        // Không cần check status nữa vì đã check ở ngoài transaction
        else {
          // Gọi hàm hardDelete của model
          // Giả sử hàm hardDelete không cần transaction request (tự tạo nếu cần)
          const deletedRows = await CoPhieuModel.hardDelete(maCPToUndo);
          // Kiểm tra lại deletedRows nếu cần
          if (
            deletedRows === 0 &&
            (await CoPhieuModel.findByMaCP(maCPToUndo))
          ) {
            // Check lại nếu xóa 0 dòng mà CP vẫn còn
            throw new AppError(
              `Hoàn tác INSERT thất bại (DELETE), không thể xóa ${maCPToUndo}.`,
              500
            );
          }
        }
        undoMessage = `Hoàn tác: Đã xóa cổ phiếu '${maCPToUndo}' vừa thêm.`;
      } else if (latestLog.ActionType === "DELETE") {
        if (currentStock)
          throw new ConflictError(
            `Hoàn tác DELETE: Cổ phiếu '${maCPToUndo}' vẫn tồn tại.`
          );
        if (!latestLog.OldData)
          throw new AppError(`Lỗi hoàn tác DELETE: Thiếu dữ liệu cũ.`);
        const oldStockData = JSON.parse(latestLog.OldData);
        // Gọi hàm create của model
        // Giả sử hàm create không cần transaction request
        const reinsertedStock = await CoPhieuModel.create({
          MaCP: oldStockData.MaCP, // Đảm bảo dùng đúng MaCP từ oldData
          TenCty: oldStockData.TenCty,
          DiaChi: oldStockData.DiaChi,
          SoLuongPH: oldStockData.SoLuongPH,
        });
        if (!reinsertedStock)
          throw new AppError(`Hoàn tác DELETE thất bại (INSERT).`, 500);
        undoMessage = `Hoàn tác: Đã khôi phục cổ phiếu '${maCPToUndo}'.`;
      } else if (latestLog.ActionType === "UPDATE") {
        if (!currentStock)
          throw new NotFoundError(
            `Hoàn tác UPDATE: Cổ phiếu '${maCPToUndo}' không tồn tại.`
          );
        // Không cần check status nữa
        if (!latestLog.OldData)
          throw new AppError(`Lỗi hoàn tác UPDATE: Thiếu dữ liệu cũ.`);
        const oldStockData = JSON.parse(latestLog.OldData);
        // Gọi hàm updateDetails của model
        // Giả sử hàm updateDetails không cần transaction request
        const updatedRows = await CoPhieuModel.updateDetails(maCPToUndo, {
          TenCty: oldStockData.TenCty,
          DiaChi: oldStockData.DiaChi,
          SoLuongPH: oldStockData.SoLuongPH,
        });
        // if (updatedRows === 0) console.warn(`Undo UPDATE for ${maCPToUndo} affected 0 rows.`);
        undoMessage = `Hoàn tác: Đã khôi phục thông tin trước đó của '${maCPToUndo}'.`;
      } else {
        throw new AppError(
          `Loại hành động '${latestLog.ActionType}' không hỗ trợ hoàn tác.`
        );
      }

      // 4. Xóa log đã undo thành công (Nằm trong transaction)
      // Giả sử deleteLog không cần transaction request
      const logDeleted = await CoPhieuUndoLogModel.deleteLog(
        latestLog.UndoLogID
      );
      if (!logDeleted) {
        console.warn(
          `[UNDO ${maCPToUndo}] Failed to delete the used undo log ID: ${latestLog.UndoLogID}. Continuing commit...`
        );
        // Có thể quyết định rollback nếu xóa log thất bại, nhưng thường thì không cần thiết
      }

      // 5. Commit transaction Undo
      await transaction.commit();
      console.log(
        `[GLOBAL UNDO] Transaction committed for log ID ${latestLog.UndoLogID}.`
      );
      // Sửa lại message để dùng biến đúng
      undoMessage = `Hoàn tác thành công hành động '${latestLog.ActionType}' trên mã CP '${maCPToUndo}'.`;
      return { message: undoMessage };
    } catch (innerError) {
      // Bắt lỗi trong transaction Undo
      console.error(`[UNDO ${maCPToUndo}] Transaction failed:`, innerError);
      if (transaction && transaction.active) await transaction.rollback(); // Rollback transaction
      throw innerError; // Ném lại lỗi để catch bên ngoài xử lý
    }
  } catch (error) {
    // Catch lỗi tổng quát (tìm log, check giá...)
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

// --- THÊM HÀM KIỂM TRA UNDO LOG ---
/**
 * Lấy thông tin về hành động cuối cùng có thể hoàn tác cho một mã CP.
 * Chỉ trả về thông tin log, không thực hiện undo.
 * @param {string} maCP Mã cổ phiếu.
 * @returns {Promise<object|null>} Thông tin log gần nhất hoặc null nếu không có.
 */
StockService.getLatestUndoLog = async (maCP) => {
  console.log(`[Stock Service] Getting latest undo log for ${maCP}`);
  try {
    const latestLog = await CoPhieuUndoLogModel.findLatestByMaCP(maCP);
    // Không cần throw NotFoundError ở đây, trả về null nếu không có log là hợp lý
    return latestLog;
  } catch (error) {
    console.error(`Error getting latest undo log for ${maCP}:`, error);
    // Ném lỗi AppError nếu có lỗi DB
    throw new AppError(
      `Lỗi khi lấy thông tin hoàn tác cho ${maCP}: ${error.message}`,
      500
    );
  }
};

// Service lấy dữ liệu Bảng Giá
StockService.getMarketBoard = async () => {
  try {
    const boardData = await CoPhieuModel.getMarketBoardData();
    // Có thể thêm logic xử lý/định dạng ở đây nếu cần
    return boardData;
  } catch (error) {
    console.error("Service error getting market board data:", error);
    throw error;
  }
};

// --- THÊM HÀM LẤY LỊCH SỬ GIÁ ---
/**
 * Lấy lịch sử giá chi tiết của một mã cổ phiếu.
 * @param {string} maCP Mã cổ phiếu.
 * @param {string | Date} tuNgay Ngày bắt đầu.
 * @param {string | Date} denNgay Ngày kết thúc.
 */
StockService.getStockPriceHistory = async (maCP, tuNgay, denNgay) => {
  console.log(
    `[Stock Service] Getting price history for ${maCP} from ${tuNgay} to ${denNgay}`
  );
  const startDate = new Date(tuNgay);
  const endDate = new Date(denNgay);

  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new BadRequestError("Khoảng thời gian cung cấp không hợp lệ.");
  }

  // Kiểm tra CP tồn tại trước khi lấy lịch sử (tùy chọn)
  // const stockExists = await CoPhieuModel.findByMaCP(maCP);
  // if (!stockExists) throw new NotFoundError(...);

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
  const numberOfDays = parseInt(days, 10); // Chuyển sang số nguyên
  if (isNaN(numberOfDays) || numberOfDays <= 0) {
    throw new BadRequestError("Số ngày ('days') phải là một số nguyên dương.");
  }
  console.log(
    `[Stock Service] Getting recent ${numberOfDays} days price history for ${maCP}`
  );

  // Kiểm tra CP tồn tại (tùy chọn)
  // ...

  try {
    const history = await LichSuGiaModel.getRecentHistoryByMaCP(
      maCP,
      numberOfDays
    ); // Gọi hàm model mới
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

module.exports = StockService;
