const rateLimit = require("express-rate-limit");

/**
 * Global rate limiter for all requests
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP, please try again later.",
    code: "RATE_LIMIT_EXCEEDED"
  }
});

/**
 * Payment operations rate limiter
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many payment requests, please slow down.",
    code: "PAYMENT_RATE_LIMIT"
  }
});

/**
 * WhatsApp/Email rate limiter
 */
const whatsappLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many WhatsApp/Email requests, please try again later.",
    code: "WHATSAPP_RATE_LIMIT"
  }
});

/**
 * Authentication rate limiter
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts, please try again later.",
    code: "AUTH_RATE_LIMIT"
  }
});

module.exports = {
  globalLimiter,
  paymentLimiter,
  whatsappLimiter,
  authLimiter,
};