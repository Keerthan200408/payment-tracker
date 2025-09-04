const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/mongo');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Get notification queue for the current user
router.get('/queue', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const username = req.user.username;
    
    const notificationDoc = await db.collection('notification_queues').findOne({ username });
    
    if (!notificationDoc) {
      return res.json({ queue: [] });
    }
    
    res.json({ queue: notificationDoc.queue });
  } catch (error) {
    console.error('Error fetching notification queue:', error);
    res.status(500).json({ error: 'Failed to fetch notification queue' });
  }
});

// Save notification queue for the current user
router.post('/queue', authenticateToken, async (req, res) => {
  try {
    const { queue } = req.body;
    
    if (!Array.isArray(queue)) {
      return res.status(400).json({ error: 'Queue must be an array' });
    }
    
    const db = getDb();
    const username = req.user.username;
    
    await db.collection('notification_queues').updateOne(
      { username },
      { 
        $set: { 
          username,
          queue,
          updatedAt: new Date() 
        } 
      },
      { upsert: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving notification queue:', error);
    res.status(500).json({ error: 'Failed to save notification queue' });
  }
});

// Clear notification queue for the current user
router.delete('/queue', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const username = req.user.username;
    
    await db.collection('notification_queues').deleteOne({ username });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing notification queue:', error);
    res.status(500).json({ error: 'Failed to clear notification queue' });
  }
});

module.exports = router;
