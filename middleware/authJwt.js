// middleware/authJwt.js
const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth.config.js');

/**
 * Middleware để xác thực JWT token từ header.
 * Nếu token hợp lệ, thông tin user (id, username, role) từ payload sẽ được gắn vào req.user.
 */
const verifyToken = (req, res, next) => {
  // Lấy token từ header 'x-access-token' (hoặc 'Authorization: Bearer <token>')
  // Bạn có thể chọn 1 hoặc hỗ trợ cả 2
  let token = req.headers['x-access-token'];

  if (!token && req.headers.authorization) {
    // Check for Bearer token format
    const bearerHeader = req.headers.authorization;
    if (typeof bearerHeader !== 'undefined') {
      const bearer = bearerHeader.split(' ');
      if (bearer.length === 2 && bearer[0] === 'Bearer') {
        token = bearer[1];
      }
    }
  }

  if (!token) {
    return res.status(403).send({ message: 'No token provided!' }); // Forbidden
  }

  jwt.verify(token, authConfig.secret, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res
          .status(401)
          .send({ message: 'Unauthorized! Token was expired!' }); // Unauthorized
      }
      // Các lỗi khác (token không hợp lệ, ...)
      console.error('JWT Verification Error:', err.message);
      return res.status(401).send({ message: 'Unauthorized! Invalid Token.' }); // Unauthorized
    }

    // Token hợp lệ, lưu thông tin user vào request để các middleware/controller sau sử dụng
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };
    // console.log('Authenticated User:', req.user); // Debug log
    next(); // Chuyển sang middleware hoặc controller tiếp theo
  });
};

module.exports = {
  verifyToken,
};
