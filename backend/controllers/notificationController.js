const { MongoClient } = require('mongodb');
const { MONGODB_URI, DB_NAME } = require('../config');

// Initialize MongoDB client
const client = new MongoClient(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Get notification queue for the current user
const getNotificationQueue = async (req, res) => {
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const username = req.user.username;
    
    const notificationDoc = await db.collection('notification_queues').findOne({ username });
    
    if (!notificationDoc) {
      return res.status(200).json({ queue: [] });
    }
    
    res.status(200).json({ queue: notificationDoc.queue || [] });
  } catch (error) {
    console.error('Error getting notification queue:', error);
    res.status(500).json({ error: 'Failed to fetch notification queue' });
  } finally {
    await client.close();
  }
};

// Save notification queue for the current user
const saveNotificationQueue = async (req, res) => {
  try {
    const { queue } = req.body;
    
    if (!Array.isArray(queue)) {
      return res.status(400).json({ error: 'Queue must be an array' });
    }
    
    await client.connect();
    const db = client.db(DB_NAME);
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
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving notification queue:', error);
    res.status(500).json({ error: 'Failed to save notification queue' });
  } finally {
    await client.close();
  }
};

// Clear notification queue for the current user
const clearNotificationQueue = async (req, res) => {
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const username = req.user.username;
    
    await db.collection('notification_queues').deleteOne({ username });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error clearing notification queue:', error);
    res.status(500).json({ error: 'Failed to clear notification queue' });
  } finally {
    await client.close();
  }
};

module.exports = {
  getNotificationQueue,
  saveNotificationQueue,
  clearNotificationQueue
};
