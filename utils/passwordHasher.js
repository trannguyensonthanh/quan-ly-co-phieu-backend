// utils/passwordHasher.js
// Cung cấp các hàm băm và so sánh mật khẩu sử dụng bcryptjs

const bcrypt = require('bcryptjs');

const saltRounds = 8;

/**
 * Băm mật khẩu thuần thành mật khẩu đã mã hóa
 * @param {string} plainPassword
 * @returns {Promise<string>} hashedPassword
 */
const hashPassword = async (plainPassword) => {
  try {
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw error;
  }
};

/**
 * So sánh mật khẩu thuần với mật khẩu đã mã hóa
 * @param {string} plainPassword
 * @param {string} hashedPassword
 * @returns {Promise<boolean>} isMatch
 */
const comparePassword = async (plainPassword, hashedPassword) => {
  try {
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    console.error('Error comparing password:', error);
    return false;
  }
};

module.exports = {
  hashPassword,
  comparePassword,
};
