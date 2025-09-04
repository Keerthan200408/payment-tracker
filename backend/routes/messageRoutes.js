const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { whatsappLimiter } = require("../middleware/rateLimiter");
const messageController = require("../controllers/messageController");

// Apply authentication to all message routes
router.use(authenticateToken);

// --- MESSAGE SENDING ROUTES ---

// Send an email
router.post("/send-email", asyncHandler(messageController.sendEmailHandler));

// Send a WhatsApp message (with its own rate limiter)
router.post("/send-whatsapp", whatsappLimiter, asyncHandler(messageController.sendWhatsAppHandler));

// --- UTILITY ROUTES ---

// Verify a WhatsApp contact
router.post("/verify-whatsapp", asyncHandler(messageController.verifyWhatsAppContact));

// Test SMTP server configuration
router.get("/test-smtp", asyncHandler(messageController.testSmtpHandler));


module.exports = router;
