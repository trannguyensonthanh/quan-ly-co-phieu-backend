/**
 * matchingWorker.js
 * Worker xử lý khớp lệnh liên tục dựa trên sự kiện thay đổi lệnh LO.
 */
const marketEmitter = require('./marketEventEmitter');
const TradingService = require('./services/trading.service');
const marketState = require('./marketState');

const matchingQueue = new Set();
let isProcessingQueue = false;
const DEBOUNCE_DELAY = 100;
let debounceTimeout = null;

/**
 * Xử lý queue khớp lệnh
 */
const processMatchingQueue = async () => {
  if (isProcessingQueue || matchingQueue.size === 0) return;

  isProcessingQueue = true;
  const maCPsToProcess = Array.from(matchingQueue);
  matchingQueue.clear();
  console.log(
    `[Matching Worker] Processing queue for MaCPs: ${maCPsToProcess.join(', ')}`
  );

  if (
    marketState.getOperatingMode() === 'AUTO' &&
    marketState.getMarketSessionState() === 'CONTINUOUS'
  ) {
    console.log(
      '[Matching Worker] State is AUTO & CONTINUOUS. Executing matching...'
    );
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

  if (matchingQueue.size > 0) {
    console.log(
      '[Matching Worker] Re-triggering queue processing due to new events.'
    );
    setImmediate(processMatchingQueue);
  }
};

/**
 * Xử lý sự kiện khi có lệnh LO thay đổi
 */
const handleLoOrderChange = (data) => {
  if (!data || !data.maCP) return;

  const maCP = data.maCP;
  matchingQueue.add(maCP);

  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }
  debounceTimeout = setTimeout(() => {
    processMatchingQueue();
    debounceTimeout = null;
  }, DEBOUNCE_DELAY);
};

/**
 * Đăng ký listener khi module được load
 */
const setupListener = () => {
  marketEmitter.off('loOrderChanged', handleLoOrderChange);
  marketEmitter.on('loOrderChanged', handleLoOrderChange);
  console.log(
    '[Matching Worker] Registered listener for loOrderChanged event.'
  );
};

/**
 * Hủy đăng ký listener (có thể gọi khi server tắt)
 */
const removeListener = () => {
  marketEmitter.off('loOrderChanged', handleLoOrderChange);
  if (debounceTimeout) clearTimeout(debounceTimeout);
  console.log('[Matching Worker] Removed listener for loOrderChanged event.');
};

module.exports = {
  setupListener,
  removeListener,
};
