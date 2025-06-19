/**
 * autoMarketScheduler.js
 * Tự động lập lịch các tác vụ thị trường chứng khoán: chuẩn bị giá, trigger ATO/ATC, kiểm tra đóng cửa.
 */

const cron = require('node-cron');
const marketState = require('./marketState');
const AdminService = require('./services/admin.service');
const TradingService = require('./services/trading.service');

let scheduledTasks = [];
let isAutoSchedulerRunning = false;

/**
 * Hàm thực hiện chuẩn bị giá cho ngày giao dịch tiếp theo.
 * Sẽ được gọi bởi cron job.
 */
const runPrepareNextDayPrices = async () => {
  if (
    marketState.getOperatingMode() !== 'AUTO' ||
    marketState.getMarketSessionState() !== 'CLOSED'
  ) {
    return;
  }
  try {
    await AdminService.prepareNextDayPrices();
  } catch (error) {
    console.error('Error preparing next day prices:', error);
    marketState.setOperatingMode('MANUAL');
    marketState.setMarketSessionState('CLOSED');
    stopAutoScheduler();
  }
};

/**
 * Hàm thực hiện trigger phiên ATO.
 * Sẽ được gọi bởi cron job.
 */
const runTriggerATO = async () => {
  if (
    marketState.getOperatingMode() !== 'AUTO' ||
    marketState.getMarketSessionState() !== 'PREOPEN'
  ) {
    return;
  }
  marketState.setMarketSessionState('ATO');
  try {
    await TradingService.triggerATOMatchingSession();
    if (marketState.getMarketSessionState() === 'ATO') {
      marketState.setMarketSessionState('CONTINUOUS');
    }
  } catch (error) {
    marketState.setOperatingMode('MANUAL');
    marketState.setMarketSessionState('CLOSED');
    stopAutoScheduler();
  }
};

/**
 * Hàm thực hiện trigger phiên ATC.
 * Sẽ được gọi bởi cron job.
 */
const runTriggerATC = async () => {
  if (
    marketState.getOperatingMode() !== 'AUTO' ||
    marketState.getMarketSessionState() !== 'CONTINUOUS'
  ) {
    return;
  }
  marketState.setMarketSessionState('ATC');
  try {
    await TradingService.triggerATCMatchingSession();
    if (marketState.getMarketSessionState() === 'ATC') {
      marketState.setMarketSessionState('CLOSED');
    }
  } catch (error) {
    marketState.setOperatingMode('MANUAL');
    marketState.setMarketSessionState('CLOSED');
    stopAutoScheduler();
  }
};

/**
 * Hàm thực hiện đóng cửa thị trường nếu hết giờ giao dịch.
 * Sẽ được gọi bởi cron job.
 */
const runCloseMarketIfNeeded = () => {
  if (marketState.getOperatingMode() !== 'AUTO') return;
  const currentState = marketState.getMarketSessionState();
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();
  const isWeekday = currentDay >= 1 && currentDay <= 5;
  if (currentState !== 'CLOSED' && (!isWeekday || currentHour >= 15)) {
    marketState.setMarketSessionState('CLOSED');
  }
};

/**
 * Bắt đầu lập lịch các tác vụ tự động.
 */
const startAutoScheduler = () => {
  if (isAutoSchedulerRunning) {
    return;
  }
  isAutoSchedulerRunning = true;
  const prepJob = cron.schedule('55 23 * * 0-4', runPrepareNextDayPrices, {
    scheduled: true,
    timezone: 'Asia/Ho_Chi_Minh',
  });
  scheduledTasks.push(prepJob);

  const atoJob = cron.schedule('5 0 9 * * 1-5', runTriggerATO, {
    scheduled: true,
    timezone: 'Asia/Ho_Chi_Minh',
  });
  scheduledTasks.push(atoJob);

  const atcJob = cron.schedule('5 30 14 * * 1-5', runTriggerATC, {
    scheduled: true,
    timezone: 'Asia/Ho_Chi_Minh',
  });
  scheduledTasks.push(atcJob);

  const closeCheckJob = cron.schedule('*/5 * * * *', runCloseMarketIfNeeded, {
    scheduled: true,
    timezone: 'Asia/Ho_Chi_Minh',
  });
  scheduledTasks.push(closeCheckJob);
};

/**
 * Dừng tất cả các tác vụ đã lập lịch.
 */
const stopAutoScheduler = () => {
  if (!isAutoSchedulerRunning) {
    return;
  }
  scheduledTasks.forEach((task) => task.stop());
  scheduledTasks = [];
  isAutoSchedulerRunning = false;
};

module.exports = {
  startAutoScheduler,
  stopAutoScheduler,
};
