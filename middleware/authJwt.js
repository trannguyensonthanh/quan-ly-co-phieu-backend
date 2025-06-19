/**
 * Middleware để xác thực JWT token từ header.
 * Nếu token hợp lệ, thông tin user (id, username, role) từ payload sẽ được gắn vào req.user.
 */
const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth.config.js');

const verifyToken = (req, res, next) => {
  let token = req.headers['x-access-token'];

  if (!token && req.headers.authorization) {
    const bearerHeader = req.headers.authorization;
    if (typeof bearerHeader !== 'undefined') {
      const bearer = bearerHeader.split(' ');
      if (bearer.length === 2 && bearer[0] === 'Bearer') {
        token = bearer[1];
      }
    }
  }

  if (!token) {
    return res.status(403).send({ message: 'No token provided!' });
  }

  jwt.verify(token, authConfig.secret, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res
          .status(401)
          .send({ message: 'Unauthorized! Token was expired!' });
      }
      console.error('JWT Verification Error:', err.message);
      return res.status(401).send({ message: 'Unauthorized! Invalid Token.' });
    }

    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };
    next();
  });
};

module.exports = {
  verifyToken,
};
