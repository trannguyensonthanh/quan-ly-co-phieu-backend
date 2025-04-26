// src/autoMarketScheduler.js
const cron = require("node-cron");
const marketState = require("./marketState");
const AdminService = require("./services/admin.service"); // Cần cho preparePrices
const TradingService = require("./services/trading.service"); // Cần cho trigger ATO/ATC
const CoPhieuModel = require("./models/CoPhieu.model"); // Cần để lấy active stocks

let scheduledTasks = []; // Mảng để lưu các task cron đã được lập lịch
let isAutoSchedulerRunning = false; // Cờ trạng thái của bộ lập lịch

/**
 * Hàm thực hiện chuẩn bị giá cho ngày giao dịch tiếp theo.
 * Sẽ được gọi bởi cron job.
 */
const runPrepareNextDayPrices = async () => {
  // Chỉ chạy nếu đang ở mode AUTO và state là CLOSED (hoặc state phù hợp khác)
  if (
    marketState.getOperatingMode() !== "AUTO" ||
    marketState.getMarketSessionState() !== "CLOSED"
  ) {
    console.log(
      "[Cron Prepare Prices] Skipped: Mode is not AUTO or State is not CLOSED."
    );
    return;
  }
  console.log(
    "[Cron Prepare Prices] Task triggered. Running prepareNextDayPrices..."
  );
  try {
    // AdminService.prepareNextDayPrices sẽ tự đặt state thành PREOPEN nếu thành công
    await AdminService.prepareNextDayPrices();
  } catch (error) {
    console.error("[Cron Prepare Prices] Error:", error);
    // Có thể đặt lại state về MANUAL/CLOSED khi lỗi
    marketState.setOperatingMode("MANUAL");
    marketState.setMarketSessionState("CLOSED");
    stopAutoScheduler(); // Dừng hẳn nếu lỗi nghiêm trọng
  }
};

/**
 * Hàm thực hiện trigger phiên ATO.
 * Sẽ được gọi bởi cron job.
 */
const runTriggerATO = async () => {
  if (
    marketState.getOperatingMode() !== "AUTO" ||
    marketState.getMarketSessionState() !== "PREOPEN"
  ) {
    console.log(
      "[Cron Trigger ATO] Skipped: Mode is not AUTO or State is not PREOPEN."
    );
    return;
  }
  console.log(
    "[Cron Trigger ATO] Task triggered. Setting state to ATO and executing matching..."
  );
  marketState.setMarketSessionState("ATO");
  try {
    // Gọi hàm service xử lý cho tất cả các mã (đã sửa trong service)
    await TradingService.triggerATOMatchingSession();
    // Chuyển sang CONTINUOUS sau khi ATO xong (kiểm tra lại state phòng ngừa)
    if (marketState.getMarketSessionState() === "ATO") {
      marketState.setMarketSessionState("CONTINUOUS");
    }
  } catch (error) {
    console.error("[Cron Trigger ATO] Error:", error);
    marketState.setOperatingMode("MANUAL");
    marketState.setMarketSessionState("CLOSED");
    stopAutoScheduler();
  }
};

/**
 * Hàm thực hiện trigger phiên ATC.
 * Sẽ được gọi bởi cron job.
 */
const runTriggerATC = async () => {
  if (
    marketState.getOperatingMode() !== "AUTO" ||
    marketState.getMarketSessionState() !== "CONTINUOUS"
  ) {
    // ATC trigger khi đang CONTINUOUS
    console.log(
      "[Cron Trigger ATC] Skipped: Mode is not AUTO or State is not CONTINUOUS."
    );
    return;
  }
  console.log(
    "[Cron Trigger ATC] Task triggered. Setting state to ATC and executing matching..."
  );
  marketState.setMarketSessionState("ATC");
  try {
    await TradingService.triggerATCMatchingSession();
    // Chuyển sang CLOSED sau khi ATC xong (kiểm tra lại state)
    if (marketState.getMarketSessionState() === "ATC") {
      marketState.setMarketSessionState("CLOSED");
    }
  } catch (error) {
    console.error("[Cron Trigger ATC] Error:", error);
    marketState.setOperatingMode("MANUAL");
    marketState.setMarketSessionState("CLOSED");
    stopAutoScheduler();
  }
};

/**
 * Hàm thực hiện đóng cửa thị trường nếu hết giờ giao dịch.
 * Sẽ được gọi bởi cron job.
 */
const runCloseMarketIfNeeded = () => {
  if (marketState.getOperatingMode() !== "AUTO") return; // Chỉ chạy ở mode AUTO

  const currentState = marketState.getMarketSessionState();
  // Nếu đang trong các phiên giao dịch (ATO, CONTINUOUS, ATC) mà đã hết giờ -> Đóng cửa
  // (Kiểm tra giờ đơn giản, cần logic ngày làm việc chính xác hơn)
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();
  const isWeekday = currentDay >= 1 && currentDay <= 5; // Thứ 2 -> Thứ 6
  // const isWeekday = true; //  tất cả các ngay

  if (currentState !== "CLOSED" && (!isWeekday || currentHour >= 15)) {
    // Ví dụ: Đóng cửa lúc 15:00 hoặc cuối tuần
    console.log(
      `[Cron Close Market] Outside trading hours/days (State: ${currentState}). Setting state to CLOSED.`
    );
    marketState.setMarketSessionState("CLOSED");
  }
};

/**
 * Bắt đầu lập lịch các tác vụ tự động.
 */
const startAutoScheduler = () => {
  if (isAutoSchedulerRunning) {
    console.log("[Auto Scheduler] Already running.");
    return;
  }

  console.log("[Auto Scheduler] Starting scheduled tasks...");
  isAutoSchedulerRunning = true;

  // --- Định nghĩa Lịch trình Cron ---
  // Lưu ý: Cú pháp cron: 'Second Minute Hour DayOfMonth Month DayOfWeek'
  // '*' = bất kỳ giá trị nào
  // '1-5' = Các ngày trong tuần (Thứ 2 - Thứ 6)

  // 1. Chuẩn bị giá ngày mới (Ví dụ: 23:55 mỗi ngày Chủ Nhật đến Thứ 5)
  const prepJob = cron.schedule("55 23 * * 0-4", runPrepareNextDayPrices, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh", // Đặt múi giờ VN
  });
  scheduledTasks.push(prepJob);
  console.log(
    "[Auto Scheduler] Scheduled: Prepare Next Day Prices (Sun-Thu 23:55 VN time)."
  );

  // 2. Trigger ATO (Ví dụ: 9:00:05 sáng Thứ 2 - Thứ 6)
  const atoJob = cron.schedule("5 0 9 * * 1-5", runTriggerATO, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
  });
  scheduledTasks.push(atoJob);
  console.log(
    "[Auto Scheduler] Scheduled: Trigger ATO (Mon-Fri 09:00:05 VN time)."
  );

  // 3. Trigger ATC (Ví dụ: 14:30:05 chiều Thứ 2 - Thứ 6)
  const atcJob = cron.schedule("5 30 14 * * 1-5", runTriggerATC, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
  });
  scheduledTasks.push(atcJob);
  console.log(
    "[Auto Scheduler] Scheduled: Trigger ATC (Mon-Fri 14:30:05 VN time)."
  );

  // 4. Kiểm tra đóng cửa ngoài giờ (Ví dụ: Chạy mỗi 5 phút)
  const closeCheckJob = cron.schedule("*/5 * * * *", runCloseMarketIfNeeded, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
  });
  scheduledTasks.push(closeCheckJob);
  console.log("[Auto Scheduler] Scheduled: Close Market Check (Every 5 mins).");

  // Lưu ý: Khớp lệnh liên tục sẽ được trigger bởi EventEmitter, không cần cron job riêng ở đây.
};

/**
 * Dừng tất cả các tác vụ đã lập lịch.
 */
const stopAutoScheduler = () => {
  if (!isAutoSchedulerRunning) {
    console.log("[Auto Scheduler] Not running.");
    return;
  }
  console.log("[Auto Scheduler] Stopping scheduled tasks...");
  scheduledTasks.forEach((task) => task.stop());
  scheduledTasks = []; // Xóa danh sách task
  isAutoSchedulerRunning = false;
  console.log("[Auto Scheduler] All tasks stopped.");
};

module.exports = {
  startAutoScheduler,
  stopAutoScheduler,
};
