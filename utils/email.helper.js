const nodemailer = require("nodemailer");

// Hàm gửi email
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    // Cấu hình transporter với Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER, // Email của bạn
        pass: process.env.GMAIL_PASSWORD, // Mật khẩu ứng dụng (App Password)
      },
    });

    // Cấu hình nội dung email
    const mailOptions = {
      from: process.env.GMAIL_USER, // Email người gửi
      to, // Email người nhận
      subject, // Tiêu đề email
      text, // Nội dung email dạng text
      html, // Nội dung email dạng HTML (nếu có)
    };

    // Gửi email
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.response}`);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Không thể gửi email. Vui lòng thử lại.");
  }
};

module.exports = sendEmail;
