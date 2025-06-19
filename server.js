/**
 * server.js
 * Entry point for starting the Express server and initializing background processes.
 */

const app = require('./app');
const serverConfig = require('./config/server.config');
const { startAutoProcess, stopAutoProcess } = require('./autoMarketProcess');
const {
  startAutoScheduler,
  stopAutoScheduler,
} = require('./autoMarketScheduler');
const matchingWorker = require('./matchingWorker');
const db = require('./models/db');

const PORT = process.env.PORT || serverConfig.PORT || 3000;

const server = app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}.`);
  try {
    const CoPhieuUndoLogModel = require('./models/CoPhieuUndoLog.model');
    await CoPhieuUndoLogModel.clearAllLogs();
    console.log('Cleared previous Undo Logs on server start.');
  } catch (clearErr) {
    console.error('Error clearing Undo Logs on server start:', clearErr);
  }
  startAutoScheduler();
});

server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

process.on('SIGINT', async () => {
  console.log('Server is shutting down...');
  stopAutoScheduler();
  matchingWorker.removeListener();
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      const pool = await db.getPool();
      if (pool && pool.connected) {
        await pool.close();
        console.log('Database connection pool closed.');
      }
    } catch (err) {
      console.error('Error closing database pool:', err);
    } finally {
      process.exit(0);
    }
  });
});
