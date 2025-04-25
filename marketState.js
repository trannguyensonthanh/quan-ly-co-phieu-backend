// src/marketState.js
/**
 * @typedef {'AUTO' | 'MANUAL'} MarketOperatingMode
 * @typedef {'PREOPEN' | 'ATO' | 'CONTINUOUS' | 'ATC' | 'CLOSED'} SessionStateType
 */

/** @type {MarketOperatingMode} */
let marketOperatingMode = "MANUAL"; // Mặc định là Thủ công

/** @type {SessionStateType} */
let currentMarketState = "CONTINUOUS"; // Mặc định là Đóng cửa

/**
 * Đặt chế độ hoạt động của thị trường.
 * @param {'AUTO' | 'MANUAL'} newMode
 * @returns {boolean} True nếu thành công.
 */
const setOperatingMode = (newMode) => {
  if (newMode === "AUTO" || newMode === "MANUAL") {
    if (marketOperatingMode !== newMode) {
      console.log(`[Market State] Operating mode changed to ${newMode}`);
      marketOperatingMode = newMode;
      // TODO: Có thể cần dừng/khởi động tiến trình tự động ở đây nếu có
    }
    return true;
  }
  console.error(`[Market State] Invalid operating mode: ${newMode}`);
  return false;
};

/**
 * Lấy chế độ hoạt động hiện tại.
 * @returns {MarketOperatingMode}
 */
const getOperatingMode = () => {
  return marketOperatingMode;
};

/**
 * Đặt trạng thái phiên giao dịch hiện tại.
 * @param {SessionStateType} newState
 * @returns {boolean} True nếu thành công.
 */
const setMarketSessionState = (newState) => {
  const validStates = ["PREOPEN", "ATO", "CONTINUOUS", "ATC", "CLOSED"];
  if (validStates.includes(newState)) {
    if (currentMarketState !== newState) {
      console.log(
        `[Market State] Session state changed from ${currentMarketState} to ${newState}`
      );
      currentMarketState = newState;
      // TODO: Phát sự kiện nếu cần thông báo cho các thành phần khác (ví dụ: WebSocket)
    }
    return true;
  }
  console.error(`[Market State] Invalid session state provided: ${newState}`);
  return false;
};

/**
 * Lấy trạng thái phiên giao dịch hiện tại.
 * @returns {SessionStateType}
 */
const getMarketSessionState = () => {
  return currentMarketState;
};

module.exports = {
  setOperatingMode,
  getOperatingMode,
  setMarketSessionState,
  getMarketSessionState,
  // SessionStateType // Export type nếu cần dùng ở file JS khác
};
