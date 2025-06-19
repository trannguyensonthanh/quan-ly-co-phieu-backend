/**
 * autoMarketProcess.js
 * Tự động kiểm tra và chuyển trạng thái phiên giao dịch chứng khoán theo thời gian thực.
 * Xuất ra các hàm: startAutoProcess, stopAutoProcess
 */

const TradingService = require('./services/trading.service');
const CoPhieuModel = require('./models/CoPhieu.model');
const marketState = require('./marketState');
const AdminService = require('./services/admin.service');

const AUTO_PROCESS_INTERVAL = 10 * 1000;
let autoProcessIntervalId = null;
let isAutoProcessing = false;

/**
 * Hàm logic chính kiểm tra trạng thái và trigger các hành động tự động.
 */
const runAutoMarketProcess = async () => {
  if (marketState.getOperatingMode() !== 'AUTO') {
    stopAutoProcess();
    return;
  }

  if (isAutoProcessing) return;
  isAutoProcessing = true;

  const currentState = marketState.getMarketSessionState();
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  try {
    const isWeekday = true;

    if (currentState === 'CLOSED' && isWeekday && currentHour === 8) {
      console.log(
        '[Auto Process] Time for PREOPEN. Preparing next day prices...'
      );
      await AdminService.prepareNextDayPrices();
    } else if (
      currentState === 'PREOPEN' &&
      isWeekday &&
      currentHour === 9 &&
      now.getMinutes() < 15
    ) {
      console.log('[Auto Process] Time for ATO. Triggering ATO matching...');
      marketState.setMarketSessionState('ATO');
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
      if (marketState.getMarketSessionState() === 'ATO') {
        marketState.setMarketSessionState('CONTINUOUS');
      }
    } else if (
      currentState === 'CONTINUOUS' &&
      isWeekday &&
      ((currentHour >= 9 && now.getMinutes() >= 15) ||
        (currentHour > 9 && currentHour < 14) ||
        (currentHour === 14 && now.getMinutes() < 30))
    ) {
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
      currentState === 'CONTINUOUS' &&
      isWeekday &&
      currentHour === 14 &&
      now.getMinutes() >= 30
    ) {
      console.log('[Auto Process] Time for ATC. Triggering ATC matching...');
      marketState.setMarketSessionState('ATC');
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
      if (marketState.getMarketSessionState() === 'ATC') {
        marketState.setMarketSessionState('CLOSED');
      }
    } else if (currentState !== 'CLOSED' && (!isWeekday || currentHour >= 15)) {
      if (currentState !== 'PREOPEN' || !isWeekday || currentHour >= 9) {
        console.log(
          '[Auto Process] Outside trading hours/days. Setting state to CLOSED.'
        );
        marketState.setMarketSessionState('CLOSED');
      }
    }
  } catch (error) {
    console.error('[Auto Process] Unexpected error:', error);
    marketState.setOperatingMode('MANUAL');
    marketState.setMarketSessionState('CLOSED');
    stopAutoProcess();
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
    runAutoMarketProcess();
    autoProcessIntervalId = setInterval(
      runAutoMarketProcess,
      AUTO_PROCESS_INTERVAL
    );
  } else {
    console.log('Auto Market Process is already running.');
  }
};

/**
 * Dừng tiến trình kiểm tra và chạy tự động.
 */
const stopAutoProcess = () => {
  if (autoProcessIntervalId) {
    console.log('Stopping Auto Market Process.');
    clearInterval(autoProcessIntervalId);
    autoProcessIntervalId = null;
  } else {
    console.log('Auto Market Process is not running.');
  }
};

module.exports = {
  startAutoProcess,
  stopAutoProcess,
};
