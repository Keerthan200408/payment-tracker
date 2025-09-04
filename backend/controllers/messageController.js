const { sendEmail, testEmailConfig } = require('../utils/email');
const { sendWhatsApp, verifyContact } = require(require('path').join(__dirname, '../utils/whatsapp'));
const { ValidationError } = require("../middleware/errorHandler");

/**
 * @desc    Send an email
 * @route   POST /api/messages/send-email
 */
exports.sendEmailHandler = async (req, res) => {
    const { to, subject, html } = req.body;
    const result = await sendEmail({ to, subject, html });
    res.json({ message: "Email sent successfully", ...result });
};

/**
 * @desc    Send a WhatsApp message
 * @route   POST /api/messages/send-whatsapp
 */
exports.sendWhatsAppHandler = async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        throw new ValidationError("Recipient phone number and message are required.");
    }
    const result = await sendWhatsApp(to, message);
    res.json({ message: "WhatsApp message sent successfully", ...result });
};

/**
 * @desc    Verify if a phone number is on WhatsApp
 * @route   POST /api/messages/verify-whatsapp
 */
exports.verifyWhatsAppContact = async (req, res) => {
    const { phone } = req.body;
    if(!phone) {
        throw new ValidationError("Phone number is required.");
    }
    const result = await verifyContact(phone);
    res.json(result);
};

/**
 * @desc    Test the SMTP email configuration
 * @route   GET /api/messages/test-smtp
 */
exports.testSmtpHandler = async (req, res) => {
    const result = await testEmailConfig();
    if (!result.success) {
        return res.status(500).json(result);
    }
    res.json(result);
};
