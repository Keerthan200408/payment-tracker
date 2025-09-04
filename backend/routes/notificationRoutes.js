const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getNotificationQueue,
  saveNotificationQueue,
  clearNotificationQueue
} = require('../controllers/notificationController');

// Apply authentication middleware to all notification routes
router.use(authenticateToken);

// Get notification queue
router.get('/queue', getNotificationQueue);

// Save notification queue
router.post('/queue', saveNotificationQueue);

// Clear notification queue
router.delete('/queue', clearNotificationQueue);

module.exports = router;
