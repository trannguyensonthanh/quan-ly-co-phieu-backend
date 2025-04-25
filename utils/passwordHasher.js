// utils/passwordHasher.js
const bcrypt = require("bcryptjs"); // Hoặc require('bcrypt') nếu dùng bcrypt

const saltRounds = 8; // Số vòng lặp băm, tăng lên để an toàn hơn (vd: 10, 12) nhưng tốn hiệu năng hơn

const hashPassword = async (plainPassword) => {
  try {
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);
    return hashedPassword;
  } catch (error) {
    console.error("Error hashing password:", error);
    throw error; // Ném lỗi để xử lý ở tầng gọi
  }
};

const comparePassword = async (plainPassword, hashedPassword) => {
  try {
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    console.error("Error comparing password:", error);
    // Thường trả về false khi có lỗi so sánh thay vì ném lỗi
    return false;
  }
};

module.exports = {
  hashPassword,
  comparePassword,
};
