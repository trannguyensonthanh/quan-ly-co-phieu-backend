// src/autoMarketProcess.js
const TradingService = require("./services/trading.service");
const CoPhieuModel = require("./models/CoPhieu.model");
const marketState = require("./marketState");
const AdminService = require("./services/admin.service"); // Import AdminService để gọi preparePrices

const AUTO_PROCESS_INTERVAL = 10 * 1000; // Kiểm tra mỗi 10 giây
let autoProcessIntervalId = null; // ID của interval
let isAutoProcessing = false; // Cờ chống chạy chồng chéo

/**
 * Hàm logic chính kiểm tra trạng thái và trigger các hành động tự động.
 */
const runAutoMarketProcess = async () => {
  if (marketState.getOperatingMode() !== "AUTO") {
    // console.log('[Auto Process] Mode is MANUAL. Skipping.');
    stopAutoProcess(); // Tự động dừng nếu mode không còn là AUTO
    return;
  }

  if (isAutoProcessing) return;
  isAutoProcessing = true;
  // console.log('[Auto Process] Checking market state and time...');

  const currentState = marketState.getMarketSessionState();
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0=CN, 6=T7

  try {
    // const isWeekday = currentDay >= 1 && currentDay <= 5;
    const isWeekday = true;

    // --- Logic chuyển trạng thái và trigger tự động ---
    if (currentState === "CLOSED" && isWeekday && currentHour === 8) {
      // Ví dụ: 8h
      console.log(
        "[Auto Process] Time for PREOPEN. Preparing next day prices..."
      );
      await AdminService.prepareNextDayPrices(); // Hàm này tự set state PREOPEN
    } else if (
      currentState === "PREOPEN" &&
      isWeekday &&
      currentHour === 9 &&
      now.getMinutes() < 15
    ) {
      // Ví dụ: ATO 9h00-9h15
      console.log("[Auto Process] Time for ATO. Triggering ATO matching...");
      marketState.setMarketSessionState("ATO");
      const activeStocks = await CoPhieuModel.getActiveStocks();
      for (const stock of activeStocks) {
        try {
          await TradingService.executeATOMatching(stock.MaCP);
        } catch (err) {
          console.error(
            `[Auto Process] Error during ATO for ${stock.MaCP}: ${err.message}`
          );
        }
      }
      // Quan trọng: Kiểm tra lại state trước khi chuyển, phòng trường hợp Admin chuyển Manual giữa chừng
      if (marketState.getMarketSessionState() === "ATO") {
        marketState.setMarketSessionState("CONTINUOUS");
      }
    } else if (
      currentState === "CONTINUOUS" &&
      isWeekday &&
      ((currentHour >= 9 && now.getMinutes() >= 15) ||
        (currentHour > 9 && currentHour < 14) ||
        (currentHour === 14 && now.getMinutes() < 30))
    ) {
      // Ví dụ: Liên tục 9h15 - 14h30
      // console.log('[Auto Process] Time for CONTINUOUS. Running matching cycle...');
      const activeStocks = await CoPhieuModel.getActiveStocks();
      for (const stock of activeStocks) {
        try {
          await TradingService.executeContinuousMatching(stock.MaCP);
        } catch (err) {
          console.error(
            `[Auto Process] Error during Continuous matching for ${stock.MaCP}: ${err.message}`
          );
        }
      }
    } else if (
      currentState === "CONTINUOUS" &&
      isWeekday &&
      currentHour === 14 &&
      now.getMinutes() >= 30 /* && now.getMinutes() < 45 */
    ) {
      // Ví dụ: 14h30 (Bắt đầu ATC)
      console.log("[Auto Process] Time for ATC. Triggering ATC matching...");
      marketState.setMarketSessionState("ATC");
      const activeStocks = await CoPhieuModel.getActiveStocks();
      for (const stock of activeStocks) {
        try {
          await TradingService.executeATCMatching(stock.MaCP);
        } catch (err) {
          console.error(
            `[Auto Process] Error during ATC for ${stock.MaCP}: ${err.message}`
          );
        }
      }
      // Quan trọng: Kiểm tra lại state trước khi chuyển
      if (marketState.getMarketSessionState() === "ATC") {
        marketState.setMarketSessionState("CLOSED");
      }
    } else if (currentState !== "CLOSED" && (!isWeekday || currentHour >= 15)) {
      // Ngoài giờ/cuối tuần -> Đóng cửa
      // Chỉ đóng khi không phải đang PREOPEN chờ tới giờ ATO
      if (currentState !== "PREOPEN" || !isWeekday || currentHour >= 9) {
        console.log(
          "[Auto Process] Outside trading hours/days. Setting state to CLOSED."
        );
        marketState.setMarketSessionState("CLOSED");
      }
    }
    // --- Hết Logic tự động ---
  } catch (error) {
    console.error("[Auto Process] Unexpected error:", error);
    // Có thể đặt lại state về MANUAL/CLOSED khi có lỗi nghiêm trọng
    marketState.setOperatingMode("MANUAL"); // Chuyển về manual khi có lỗi
    marketState.setMarketSessionState("CLOSED");
    stopAutoProcess(); // Dừng hẳn tiến trình tự động
  } finally {
    isAutoProcessing = false;
  }
};

/**
 * Bắt đầu tiến trình kiểm tra và chạy tự động theo trạng thái/thời gian.
 */
const startAutoProcess = () => {
  if (!autoProcessIntervalId) {
    console.log(
      `Starting Auto Market Process checker every ${
        AUTO_PROCESS_INTERVAL / 1000
      } seconds.`
    );
    // Chạy ngay lần đầu để kiểm tra trạng thái
    runAutoMarketProcess();
    // Sau đó lặp lại
    autoProcessIntervalId = setInterval(
      runAutoMarketProcess,
      AUTO_PROCESS_INTERVAL
    );
  } else {
    console.log("Auto Market Process is already running.");
  }
};

/**
 * Dừng tiến trình kiểm tra và chạy tự động.
 */
const stopAutoProcess = () => {
  if (autoProcessIntervalId) {
    console.log("Stopping Auto Market Process.");
    clearInterval(autoProcessIntervalId);
    autoProcessIntervalId = null;
  } else {
    console.log("Auto Market Process is not running.");
  }
};

module.exports = {
  startAutoProcess,
  stopAutoProcess,
};
