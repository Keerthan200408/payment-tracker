const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const database = require("../db/mongo");
const logger = require("../utils/logger");

// Health check endpoint for session validation
router.get("/health", authenticateToken, asyncHandler(async (req, res) => {
  try {
    // Verify database connection
    const db = await database.getDb();
    await db.admin().ping();
    
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      user: req.user.username 
    });
  } catch (error) {
    logger.error("Health check failed", error.message);
    res.status(500).json({ 
      status: "unhealthy", 
      error: "Database connection failed" 
    });
  }
}));

module.exports = router;



