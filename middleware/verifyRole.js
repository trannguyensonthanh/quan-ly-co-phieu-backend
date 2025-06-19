// middleware/verifyRole.js

/**
 * Middleware kiểm tra role của user đã xác thực.
 * Phải được sử dụng SAU middleware verifyToken.
 */

const isNhanVien = (req, res, next) => {
  // Middleware kiểm tra xem user đã được xác thực có phải là Nhân viên không.
  if (!req.user) {
    return res.status(403).send({ message: 'Require Authentication!' });
  }

  if (req.user.role === 'NhanVien') {
    next();
    return;
  }

  res.status(403).send({ message: 'Require NhanVien Role!' });
};

const isNhaDauTu = (req, res, next) => {
  // Middleware kiểm tra xem user đã được xác thực có phải là Nhà Đầu Tư không.
  if (!req.user) {
    return res.status(403).send({ message: 'Require Authentication!' });
  }

  if (req.user.role === 'NhaDauTu') {
    next();
    return;
  }

  res.status(403).send({ message: 'Require NhaDauTu Role!' });
};

const isNhanVienOrNhaDauTu = (req, res, next) => {
  // Middleware kiểm tra xem user có phải là Nhân viên HOẶC Nhà Đầu Tư không
  if (!req.user) {
    return res.status(403).send({ message: 'Require Authentication!' });
  }

  if (req.user.role === 'NhanVien' || req.user.role === 'NhaDauTu') {
    next();
    return;
  }

  res.status(403).send({ message: 'Require NhanVien or NhaDauTu Role!' });
};

module.exports = {
  isNhanVien,
  isNhaDauTu,
  isNhanVienOrNhaDauTu,
};
