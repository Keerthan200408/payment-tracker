const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getNotificationQueue,
  saveNotificationQueue,
  clearNotificationQueue
} = require('../controllers/notificationController'); // This line connects to your controller

// Apply authentication to all routes in this file
router.use(authenticateToken);

// GET /api/notifications/queue
router.get('/queue', getNotificationQueue);

// POST /api/notifications/queue
router.post('/queue', saveNotificationQueue);

// DELETE /api/notifications/queue
router.delete('/queue', clearNotificationQueue);

module.exports = router;