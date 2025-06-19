// marketEventEmitter.js - Singleton EventEmitter for market events

const EventEmitter = require('events');

class MarketEmitter extends EventEmitter {}

const marketEmitter = new MarketEmitter();

console.log('Market Event Emitter initialized.');

module.exports = marketEmitter;
