/**
 * app.js - Entry point for the Stock Trading Management API backend.
 * Sets up Express app, middleware, database connection, and routes.
 */

const express = require('express');
const cors = require('cors');
const db = require('./models/db');
const errorHandler = require('./middleware/errorHandler');
const cookieParser = require('cookie-parser');
const app = express();
const matchingWorker = require('./matchingWorker');

app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:8081',
      'http://192.168.56.1:8081',
      'http://10.241.4.99:8081/',
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

db.connectDb()
  .then(() => {
    matchingWorker.setupListener();
  })
  .catch((err) => {
    console.error(
      'Failed to connect to the database. Application cannot start.',
      err
    );
    process.exit(1);
  });

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const coPhieuRoutes = require('./routes/cophieu.routes');
const nhaDauTuRoutes = require('./routes/nhadautu.routes');
const portfolioRoutes = require('./routes/portfolio.routes');
const tradingRoutes = require('./routes/trading.routes');
const statementRoutes = require('./routes/statement.routes');
const adminRoutes = require('./routes/admin.routes');
const marketRoutes = require('./routes/market.routes');
const nganHangRoutes = require('./routes/nganHang.routes');
const adminBankAccountRoutes = require('./routes/adminBankAccount.routes');

app.get('/', (req, res) => {
  res.json({
    message: 'Chào mừng bạn đến với API Quản lý Giao dịch Cổ phiếu!',
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/cophieu', coPhieuRoutes);
app.use('/api/nhadautu', nhaDauTuRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/statement', statementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/banks', nganHangRoutes);
app.use('/api/admin/bank-accounts', adminBankAccountRoutes);

app.use(errorHandler);

module.exports = app;
