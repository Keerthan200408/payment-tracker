const nodemailer = require("nodemailer");
const config = require("../config");
const { sanitizeHtmlContent } = require("./sanitize");

// Create transporter instance
const transporter = nodemailer.createTransporter({
  host: config.EMAIL_HOST,
  port: config.EMAIL_PORT,
  secure: config.EMAIL_SECURE,
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_PASS,
  },
  logger: config.NODE_ENV === 'development',
  debug: config.NODE_ENV === 'development',
});

/**
 * Verify email transporter configuration
 * @returns {Promise<boolean>} - True if verification successful
 */
async function verifyTransporter() {
  try {
    await transporter.verify();
    console.log("Email transporter is ready");
    return true;
  } catch (error) {
    console.error("Email transporter verification failed:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    return false;
  }
}

/**
 * Send email with proper error handling and validation
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML content
 * @param {string} options.from - Sender email (optional)
 * @returns {Promise<Object>} - Email send result
 */
async function sendEmail({ to, subject, html, from = null }) {
  // Validate required fields
  if (!to || !subject || !html) {
    throw new Error("Recipient email, subject, and HTML content are required");
  }

  // Validate email format
  if (!config.VALIDATION.EMAIL_REGEX.test(to)) {
    throw new Error("Invalid recipient email address");
  }

  // Validate sender email
  if (!config.EMAIL_FROM) {
    throw new Error("Server configuration error: Missing email sender address");
  }

  // Sanitize HTML content
  const sanitizedHtml = sanitizeHtmlContent(html);
  if (!sanitizedHtml.trim()) {
    throw new Error("HTML content is invalid or empty after sanitization");
  }

  try {
    const mailOptions = {
      from: from || `"Payment Tracker" <${config.EMAIL_FROM}>`,
      to: to.trim(),
      subject: subject.trim(),
      html: sanitizedHtml,
    };

    console.log("Attempting to send email:", {
      to,
      subject,
      htmlLength: sanitizedHtml.length,
      from: mailOptions.from,
    });

    const info = await transporter.sendMail(mailOptions);

    console.log("Email sent successfully:", {
      to,
      messageId: info.messageId,
      response: info.response,
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    console.error("Send email error:", {
      message: error.message,
      code: error.code,
      details: JSON.stringify(error.response || error, null, 2),
      to,
    });

    // Handle specific email errors
    if (error.code === 'EAUTH') {
      throw new Error("Email authentication failed. Please check server configuration.");
    } else if (error.code === 'ECONNECTION') {
      throw new Error("Email server connection failed. Please try again later.");
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error("Email server timeout. Please try again later.");
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Test email configuration
 * @returns {Promise<Object>} - Test result
 */
async function testEmailConfig() {
  try {
    const isVerified = await verifyTransporter();
    return {
      success: isVerified,
      message: isVerified ? "SMTP server is ready" : "SMTP verification failed",
    };
  } catch (error) {
    return {
      success: false,
      message: `SMTP verification failed: ${error.message}`,
      error: error.message,
    };
  }
}

// Initialize transporter verification on module load
verifyTransporter().catch(error => {
  console.error("Initial email transporter verification failed:", error.message);
});

module.exports = {
  sendEmail,
  testEmailConfig,
  verifyTransporter,
};
