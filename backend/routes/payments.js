// routes/payments.js
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { paymentLimiter } = require("../middleware/rateLimiter");
const paymentController = require("../controllers/paymentController"); // We will create this next

// Apply authentication to all routes in this file
router.use(authenticateToken);

// Apply specific rate limiter for payment operations
router.use(paymentLimiter);

// GET routes
router.get("/get-by-year", asyncHandler(paymentController.getPaymentsByYear));
router.get("/get-user-years", asyncHandler(paymentController.getUserYears));

// POST routes
router.post("/save-payment", asyncHandler(paymentController.savePayment));
router.post("/save-remark", asyncHandler(paymentController.saveRemark));
router.post("/batch-save", asyncHandler(paymentController.batchSavePayments));
router.post("/add-new-year", asyncHandler(paymentController.addNewYear));
router.post("/import-csv", asyncHandler(paymentController.importCsv));

module.exports = router;