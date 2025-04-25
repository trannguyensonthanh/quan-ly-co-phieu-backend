require("dotenv").config(); // Để lấy JWT_SECRET từ .env

module.exports = {
  secret:
    process.env.JWT_SECRET || "default-very-secret-key-change-in-production", // Khóa bí mật cho JWT
  jwtExpiration: 3600, // Token hết hạn sau 1 giờ (3600 giây)
  // jwtRefreshExpiration: 86400, // Refresh token hết hạn sau 1 ngày (86400 giây) - Tùy chọn
  // --- THÊM CẤU HÌNH CHO REFRESH TOKEN ---
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET || "default-refresh-secret-key",
  // Cách 2: Dùng chuỗi dễ đọc hơn cho Refresh Token expiry (ví dụ: '7d', '30d')
  // Lưu ý: Giá trị này dùng cho thư viện jsonwebtoken, không phải số giây thuần
  jwtRefreshExpirationString: "7d", // Ví dụ: Refresh token hết hạn sau 7 ngày
  // Thời gian sống của cookie (tính bằng mili giây) - nên khớp hoặc dài hơn một chút so với jwtRefreshExpirationString
  jwtRefreshCookieExpirationMs: 7 * 24 * 60 * 60 * 1000, // 7 ngày bằng ms
};
