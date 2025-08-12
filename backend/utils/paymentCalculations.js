const config = require("../config");

/**
 * Calculate due payment for a client
 * @param {Object} payment - Payment document from database
 * @param {number} previousYearDue - Previous year's due payment
 * @returns {number} - Calculated due payment
 */
function calculateDuePayment(payment, previousYearDue = 0) {
  const amountToBePaid = parseFloat(payment.Amount_To_Be_Paid) || 0;
  const months = config.months;
  
  // Calculate current year due payment
  const activeMonths = months.filter(month => {
    const value = payment.Payments[month];
    return value !== "" && value !== null && value !== undefined;
  }).length;
  
  const totalPaymentsMade = months.reduce((sum, month) => {
    return sum + (parseFloat(payment.Payments[month]) || 0);
  }, 0);
  
  const expectedPayment = activeMonths * amountToBePaid;
  const currentYearDue = Math.max(expectedPayment - totalPaymentsMade, 0);
  const totalDuePayment = currentYearDue + previousYearDue;
  
  return Math.round(totalDuePayment * 100) / 100;
}

/**
 * Calculate due payment with previous year data
 * @param {Object} payment - Current year payment document
 * @param {Object} prevYearPayment - Previous year payment document
 * @returns {number} - Calculated due payment including previous year
 */
function calculateDuePaymentWithPreviousYear(payment, prevYearPayment = null) {
  const previousYearDue = prevYearPayment ? parseFloat(prevYearPayment.Due_Payment) || 0 : 0;
  return calculateDuePayment(payment, previousYearDue);
}

/**
 * Process payment updates and calculate new due payment
 * @param {Object} payment - Original payment document
 * @param {Object} updatedPayments - Updated payments object
 * @param {number} year - Current year
 * @param {Object} prevYearPayment - Previous year payment (optional)
 * @returns {Object} - Updated payment with new due payment
 */
function processPaymentUpdate(payment, updatedPayments, year, prevYearPayment = null) {
  const updatedPayment = {
    ...payment,
    Payments: updatedPayments,
    Last_Updated: new Date()
  };
  
  updatedPayment.Due_Payment = calculateDuePaymentWithPreviousYear(updatedPayment, prevYearPayment);
  
  return updatedPayment;
}

/**
 * Create payment document for a new client
 * @param {string} clientName - Client name
 * @param {string} type - Payment type
 * @param {number} amountToBePaid - Monthly payment amount
 * @param {number} year - Year
 * @param {string} createdAt - Creation timestamp
 * @returns {Object} - Payment document
 */
function createPaymentDocument(clientName, type, amountToBePaid, year, createdAt) {
  return {
    Client_Name: clientName,
    Type: type,
    Amount_To_Be_Paid: amountToBePaid,
    Year: year,
    Payments: Object.fromEntries(config.months.map(month => [month, ""])),
    Remarks: Object.fromEntries(config.months.map(month => [month, "N/A"])),
    Due_Payment: 0,
    createdAt: createdAt,
  };
}

/**
 * Validate payment amount
 * @param {number|string} amount - Payment amount to validate
 * @returns {boolean} - Whether amount is valid
 */
function isValidPaymentAmount(amount) {
  const numericAmount = parseFloat(amount);
  return !isNaN(numericAmount) && numericAmount >= 0 && numericAmount <= config.VALIDATION.MAX_PAYMENT_AMOUNT;
}

/**
 * Get month key from lowercase month name
 * @param {string} month - Month name (lowercase)
 * @returns {string|null} - Proper month key or null if invalid
 */
function getMonthKey(month) {
  const monthMap = {
    january: "January", february: "February", march: "March", april: "April", may: "May",
    june: "June", july: "July", august: "August", september: "September", october: "October",
    november: "November", december: "December",
  };
  return monthMap[month.toLowerCase()] || null;
}

module.exports = {
  calculateDuePayment,
  calculateDuePaymentWithPreviousYear,
  processPaymentUpdate,
  createPaymentDocument,
  isValidPaymentAmount,
  getMonthKey,
}; 