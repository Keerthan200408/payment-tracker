const sanitizeHtml = require("sanitize-html");
const config = require("../config");

const validateInput = {
  username: (username) => typeof username === 'string' && username.length >= config.VALIDATION.USERNAME_MIN_LENGTH && username.length <= config.VALIDATION.USERNAME_MAX_LENGTH,
  email: (email) => typeof email === 'string' && config.VALIDATION.EMAIL_REGEX.test(email),
  phone: (phone) => typeof phone === 'string' && config.VALIDATION.PHONE_REGEX.test(phone),
  clientName: (name) => typeof name === 'string' && name.length > 0 && name.length <= config.VALIDATION.CLIENT_NAME_MAX_LENGTH,
  type: (type) => typeof type === 'string' && type.length > 0 && type.length <= config.VALIDATION.TYPE_MAX_LENGTH,
  paymentAmount: (amount) => !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && parseFloat(amount) <= config.VALIDATION.MAX_PAYMENT_AMOUNT,
};

/**
 * Sanitize user input to prevent XSS attacks
 * @param {string} input - The input to sanitize
 * @returns {string} - Sanitized input
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, config.SANITIZE_OPTIONS);
}

/**
 * Sanitize and validate email address
 * @param {string} email - Email to validate and sanitize
 * @returns {string} - Sanitized email or empty string if invalid
 */
function sanitizeEmail(email) {
  if (!validateInput.email(email)) return '';
  return sanitizeInput(email.trim());
}

/**
 * Sanitize and validate phone number
 * @param {string} phone - Phone number to validate and sanitize
 * @returns {string} - Sanitized phone number or empty string if invalid
 */
function sanitizePhone(phone) {
  if (!validateInput.phone(phone)) return '';
  return sanitizeInput(phone.trim());
}

/**
 * Sanitize and validate username
 * @param {string} username - Username to validate and sanitize
 * @returns {string} - Sanitized username or empty string if invalid
 */
function sanitizeUsername(username) {
  if (!validateInput.username(username)) return '';
  return sanitizeInput(username.trim());
}

/**
 * Sanitize and validate client name
 * @param {string} clientName - Client name to validate and sanitize
 * @returns {string} - Sanitized client name or empty string if invalid
 */
function sanitizeClientName(clientName) {
  if (!validateInput.clientName(clientName)) return '';
  return sanitizeInput(clientName.trim());
}

/**
 * Sanitize and validate payment type
 * @param {string} type - Payment type to validate and sanitize
 * @returns {string} - Sanitized and uppercase type or empty string if invalid
 */
function sanitizeType(type) {
  if (!validateInput.type(type)) return '';
  return sanitizeInput(type.trim().toUpperCase());
}

/**
 * Validate and sanitize payment amount
 * @param {number|string} amount - Payment amount to validate
 * @returns {number|null} - Validated amount or null if invalid
 */
function validatePaymentAmount(amount) {
  return validateInput.paymentAmount(amount) ? parseFloat(amount) : null;
}

/**
 * Sanitize HTML content for email/WhatsApp
 * @param {string} html - HTML content to sanitize
 * @returns {string} - Sanitized HTML content
 */
function sanitizeHtmlContent(html) {
  if (!html || typeof html !== 'string') return '';
  const sanitized = sanitizeInput(html);
  return sanitized.trim() || '';
}

module.exports = {
  sanitizeInput,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUsername,
  sanitizeClientName,
  sanitizeType,
  validatePaymentAmount,
  sanitizeHtmlContent,
  validateInput,
};
