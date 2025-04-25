// middleware/verifyRole.js

/**
 * Middleware kiểm tra xem user đã được xác thực có phải là Nhân viên không.
 * Phải được sử dụng SAU middleware verifyToken.
 */
const isNhanVien = (req, res, next) => {
  // req.user được gắn bởi middleware verifyToken
  if (!req.user) {
    // Trường hợp này không nên xảy ra nếu verifyToken chạy đúng
    return res.status(403).send({ message: "Require Authentication!" });
  }

  if (req.user.role === "NhanVien") {
    next(); // User là Nhân viên, cho phép tiếp tục
    return;
  }

  res.status(403).send({ message: "Require NhanVien Role!" }); // Forbidden
};

/**
 * Middleware kiểm tra xem user đã được xác thực có phải là Nhà Đầu Tư không.
 * Phải được sử dụng SAU middleware verifyToken.
 */
const isNhaDauTu = (req, res, next) => {
  if (!req.user) {
    return res.status(403).send({ message: "Require Authentication!" });
  }

  if (req.user.role === "NhaDauTu") {
    next(); // User là Nhà Đầu Tư, cho phép tiếp tục
    return;
  }

  res.status(403).send({ message: "Require NhaDauTu Role!" }); // Forbidden
};

/**
 * Middleware kiểm tra xem user có phải là Nhân viên HOẶC Nhà Đầu Tư không
 * (Dùng cho các chức năng chung mà cả 2 đều truy cập được sau khi login).
 * Phải được sử dụng SAU middleware verifyToken.
 */
const isNhanVienOrNhaDauTu = (req, res, next) => {
  if (!req.user) {
    return res.status(403).send({ message: "Require Authentication!" });
  }

  if (req.user.role === "NhanVien" || req.user.role === "NhaDauTu") {
    next();
    return;
  }

  res.status(403).send({ message: "Require NhanVien or NhaDauTu Role!" });
};

module.exports = {
  isNhanVien,
  isNhaDauTu,
  isNhanVienOrNhaDauTu,
};
