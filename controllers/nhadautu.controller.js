// controllers/nhadautu.controller.js
// Controller cho Nhà Đầu Tư và các chức năng liên quan

exports.createNDT = async (req, res, next) => {
  // Tạo mới Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const newNDT = await NhaDauTuService.createNDT(req.body);
  res.status(201).send(newNDT);
};

exports.findAllNDT = async (req, res, next) => {
  // Lấy tất cả Nhà Đầu Tư
  const ndts = await NhaDauTuService.getAllNDT();
  res.status(200).send(ndts);
};

exports.findOneNDT = async (req, res, next) => {
  // Tìm một Nhà Đầu Tư theo MaNDT
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;

  const ndt = await NhaDauTuService.getNDTDetails(maNDT);
  res.status(200).send(ndt);
};

exports.updateNDT = async (req, res, next) => {
  // Cập nhật thông tin Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;
  const { MaNDT, CMND, MKGD, ...updateData } = req.body;

  const updatedNDT = await NhaDauTuService.updateNDT(maNDT, updateData);
  res.status(200).send(updatedNDT);
};

exports.deleteNDT = async (req, res, next) => {
  // Xóa Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;
  const result = await NhaDauTuService.deleteNDT(maNDT);
  res.status(200).send(result);
};

exports.findTKNHByNDT = async (req, res, next) => {
  // Lấy danh sách tài khoản ngân hàng của Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;
  const tknhList = await NhaDauTuService.getTKNHByNDT(maNDT);
  res.status(200).send(tknhList);
};

exports.addTKNH = async (req, res, next) => {
  // Thêm tài khoản ngân hàng cho Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;
  const newTKNH = await NhaDauTuService.addTKNH(maNDT, req.body);
  res.status(201).send(newTKNH);
};

exports.getNDTBalances = async (req, res, next) => {
  // Lấy số dư tiền của Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;
  const balances = await NhaDauTuService.getBalancesByNDT(maNDT);
  res.status(200).send(balances);
};

exports.getNDTPortfolio = async (req, res, next) => {
  // Lấy danh mục cổ phiếu của Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;
  const portfolio = await NhaDauTuService.getPortfolioByNDT(maNDT);
  res.status(200).send(portfolio);
};

exports.getInvestorOrderStatement = async (req, res, next) => {
  // Lấy sao kê giao dịch lệnh đặt của Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;
  const { tuNgay, denNgay } = req.query;
  const statement = await TradingService.getInvestorOrderStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

exports.getInvestorMatchedOrderStatement = async (req, res, next) => {
  // Lấy sao kê lệnh khớp của Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;
  const { tuNgay, denNgay } = req.query;
  const statement = await TradingService.getInvestorMatchedOrderStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

exports.getInvestorCashStatement = async (req, res, next) => {
  // Lấy sao kê tiền mặt của Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNDT = req.params.mandt;
  const { tuNgay, denNgay } = req.query;
  const statement = await StatementService.getInvestorCashStatement(
    maNDT,
    tuNgay,
    denNgay
  );
  res.status(200).send(statement);
};

exports.adminDeposit = async (req, res, next) => {
  // Admin nạp tiền vào tài khoản Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }
  const maNVThucHien = req.user.id;
  const { maTK, soTien, ghiChu } = req.body;

  if (!maTK || typeof soTien !== 'number' || soTien <= 0) {
    return next(
      new BadRequestError(
        'Mã tài khoản và số tiền nạp (dương) hợp lệ là bắt buộc.'
      )
    );
  }

  try {
    const result = await InvestorService.depositByAdmin(
      maNVThucHien,
      maTK,
      soTien,
      ghiChu
    );
    res
      .status(200)
      .send({ message: 'Nạp tiền thành công.', transaction: result });
  } catch (error) {
    next(error);
  }
};

exports.adminWithdraw = async (req, res, next) => {
  // Admin rút tiền khỏi tài khoản Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }

  const maNVThucHien = req.user.id;
  const { maTK, soTien, ghiChu } = req.body;

  if (!maTK || typeof soTien !== 'number' || soTien <= 0) {
    return next(
      new BadRequestError(
        'Mã tài khoản và số tiền rút (dương) hợp lệ là bắt buộc.'
      )
    );
  }

  try {
    const result = await InvestorService.withdrawByAdmin(
      maNVThucHien,
      maTK,
      soTien,
      ghiChu
    );
    res
      .status(200)
      .send({ message: 'Rút tiền thành công.', transaction: result });
  } catch (error) {
    next(error);
  }
};

exports.getInvestorDepositWithdrawHistory = async (req, res, next) => {
  // Lấy lịch sử nạp/rút tiền của Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }

  const maNDT = req.params.mandt;
  const { tuNgay, denNgay } = req.query;

  try {
    const history = await StatementService.getDepositWithdrawHistory(
      maNDT,
      tuNgay,
      denNgay
    );
    res.status(200).send(history);
  } catch (error) {
    next(error);
  }
};

exports.getInvestorAccountCashStatementDetail = async (req, res, next) => {
  // Lấy chi tiết sao kê tiền mặt của tài khoản Nhà Đầu Tư
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error) => error.msg)
      .join(', ');

    return res.status(400).json({
      message: `${errorMessages}`,
      errors: errors.array(),
    });
  }

  const maNDT = req.params.mandt;
  const maTK = req.params.maTK;
  const { tuNgay, denNgay } = req.query;
  const role = req.user.role;
  try {
    const statement = await StatementService.getAccountCashStatementDetail(
      maNDT,
      maTK,
      tuNgay,
      denNgay,
      role
    );
    res.status(200).send(statement);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return next(error);
    }
    next(error);
  }
};
