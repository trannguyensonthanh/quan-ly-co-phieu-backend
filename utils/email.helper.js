/**
 * utils/email.helper.js
 * Hàm gửi email sử dụng Nodemailer với Gmail SMTP
 */
const nodemailer = require('nodemailer');

/**
 * Gửi email
 * @param {Object} param0 - Thông tin email
 * @param {string} param0.to - Email người nhận
 * @param {string} param0.subject - Tiêu đề email
 * @param {string} param0.text - Nội dung email dạng text
 * @param {string} [param0.html] - Nội dung email dạng HTML (nếu có)
 */
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.response}`);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Không thể gửi email. Vui lòng thử lại.');
  }
};

module.exports = sendEmail;
