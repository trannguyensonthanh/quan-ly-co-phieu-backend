// src/matchingWorker.js
const marketEmitter = require("./marketEventEmitter");
const TradingService = require("./services/trading.service"); // Cần để gọi khớp lệnh
const marketState = require("./marketState"); // Cần để check state

// --- Cơ chế Debounce / Queue đơn giản ---
const matchingQueue = new Set(); // Dùng Set để lưu các MaCP đang chờ khớp (tránh trùng lặp)
let isProcessingQueue = false; // Cờ báo hiệu đang xử lý queue
const DEBOUNCE_DELAY = 100; // Chờ 100ms không có event mới thì mới xử lý (ms)
let debounceTimeout = null;

/** Xử lý queue khớp lệnh */
const processMatchingQueue = async () => {
  if (isProcessingQueue || matchingQueue.size === 0) return; // Đang xử lý hoặc queue rỗng

  isProcessingQueue = true;
  const maCPsToProcess = Array.from(matchingQueue); // Copy và xóa queue
  matchingQueue.clear();
  console.log(
    `[Matching Worker] Processing queue for MaCPs: ${maCPsToProcess.join(", ")}`
  );

  // Kiểm tra trạng thái trước khi chạy khớp lệnh
  if (
    marketState.getOperatingMode() === "AUTO" &&
    marketState.getMarketSessionState() === "CONTINUOUS"
  ) {
    console.log(
      "[Matching Worker] State is AUTO & CONTINUOUS. Executing matching..."
    );
    // Chạy khớp lệnh tuần tự cho các mã trong queue
    for (const maCP of maCPsToProcess) {
      try {
        await TradingService.executeContinuousMatching(maCP);
      } catch (error) {
        console.error(
          `[Matching Worker] Error matching ${maCP}:`,
          error.message
        );
      }
    }
  } else {
    console.log(
      `[Matching Worker] Skipped processing queue. Mode: ${marketState.getOperatingMode()}, State: ${marketState.getMarketSessionState()}`
    );
  }

  isProcessingQueue = false;

  // Kiểm tra lại queue ngay sau khi xử lý xong, phòng trường hợp có event mới vào lúc đang xử lý
  if (matchingQueue.size > 0) {
    console.log(
      "[Matching Worker] Re-triggering queue processing due to new events."
    );
    // Dùng setImmediate để tránh đệ quy sâu nếu event vào liên tục
    setImmediate(processMatchingQueue);
  }
};

/** Hàm xử lý sự kiện khi có lệnh LO thay đổi */
const handleLoOrderChange = (data) => {
  if (!data || !data.maCP) return;

  const maCP = data.maCP;
  // console.log(`[Matching Worker] Received loOrderChanged event for ${maCP}`);

  // Thêm MaCP vào queue (Set sẽ tự xử lý trùng lặp)
  matchingQueue.add(maCP);

  // Sử dụng debounce: Đặt lại timeout mỗi khi có event mới
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }
  debounceTimeout = setTimeout(() => {
    processMatchingQueue(); // Chỉ gọi xử lý queue sau khi hết delay
    debounceTimeout = null; // Reset timeout ID
  }, DEBOUNCE_DELAY);
};

/** Đăng ký listener khi module được load */
const setupListener = () => {
  // Xóa listener cũ nếu có (phòng trường hợp hot-reload)
  marketEmitter.off("loOrderChanged", handleLoOrderChange);
  // Đăng ký listener mới
  marketEmitter.on("loOrderChanged", handleLoOrderChange);
  console.log(
    "[Matching Worker] Registered listener for loOrderChanged event."
  );
};

/** Hủy đăng ký listener (có thể gọi khi server tắt) */
const removeListener = () => {
  marketEmitter.off("loOrderChanged", handleLoOrderChange);
  if (debounceTimeout) clearTimeout(debounceTimeout); // Hủy timeout đang chờ
  console.log("[Matching Worker] Removed listener for loOrderChanged event.");
};

module.exports = {
  setupListener,
  removeListener,
};
