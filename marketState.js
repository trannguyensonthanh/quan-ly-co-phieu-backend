// marketState.js - Quản lý trạng thái thị trường và phiên giao dịch

/**
 * @typedef {'AUTO' | 'MANUAL'} MarketOperatingMode
 * @typedef {'PREOPEN' | 'ATO' | 'CONTINUOUS' | 'ATC' | 'CLOSED'} SessionStateType
 */

/** @type {MarketOperatingMode} */
let marketOperatingMode = 'MANUAL';

/** @type {SessionStateType} */
let currentMarketState = 'CLOSED';

/**
 * Đặt chế độ hoạt động của thị trường.
 * @param {'AUTO' | 'MANUAL'} newMode
 * @returns {boolean} True nếu thành công.
 */
const setOperatingMode = (newMode) => {
  if (newMode === 'AUTO' || newMode === 'MANUAL') {
    if (marketOperatingMode !== newMode) {
      console.log(`[Market State] Operating mode changed to ${newMode}`);
      marketOperatingMode = newMode;
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
  const validStates = ['PREOPEN', 'ATO', 'CONTINUOUS', 'ATC', 'CLOSED'];
  if (validStates.includes(newState)) {
    if (currentMarketState !== newState) {
      console.log(
        `[Market State] Session state changed from ${currentMarketState} to ${newState}`
      );
      currentMarketState = newState;
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
};
