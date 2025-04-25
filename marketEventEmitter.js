// src/marketEventEmitter.js
const EventEmitter = require("events");

class MarketEmitter extends EventEmitter {}

// Tạo một instance duy nhất (singleton) để toàn bộ ứng dụng sử dụng
const marketEmitter = new MarketEmitter();

// (Tùy chọn) Tăng giới hạn số lượng listener nếu bạn dự kiến có nhiều kết nối SSE
// marketEmitter.setMaxListeners(50); // Ví dụ: tăng lên 50

console.log("Market Event Emitter initialized.");

module.exports = marketEmitter;
