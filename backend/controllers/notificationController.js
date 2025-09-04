const database = require('../db/mongo');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @desc    Get the notification queue for the logged-in user
 * @route   GET /api/notifications/queue
 */
exports.getNotificationQueue = asyncHandler(async (req, res) => {
    const username = req.user.username;
    const notificationQueuesCollection = (await database.getDb()).collection('notification_queues');

    const notificationDoc = await notificationQueuesCollection.findOne({ username });

    if (!notificationDoc) {
        return res.json({ queue: [] });
    }

    res.json({ queue: notificationDoc.queue || [] });
});

/**
 * @desc    Save or update the notification queue for the logged-in user
 * @route   POST /api/notifications/queue
 */
exports.saveNotificationQueue = asyncHandler(async (req, res) => {
    const { queue } = req.body;
    const username = req.user.username;

    if (!Array.isArray(queue)) {
        return res.status(400).json({ error: 'Queue must be an array' });
    }

    const notificationQueuesCollection = (await database.getDb()).collection('notification_queues');

    await notificationQueuesCollection.updateOne(
        { username },
        {
            $set: {
                queue,
                updatedAt: new Date()
            }
        },
        { upsert: true }
    );

    res.status(200).json({ message: 'Queue saved successfully' });
});

/**
 * @desc    Clear the notification queue for the logged-in user
 * @route   DELETE /api/notifications/queue
 */
exports.clearNotificationQueue = asyncHandler(async (req, res) => {
    const username = req.user.username;
    const notificationQueuesCollection = (await database.getDb()).collection('notification_queues');

    // Update the queue to an empty array instead of deleting the document
    await notificationQueuesCollection.updateOne(
        { username },
        {
            $set: {
                queue: [],
                updatedAt: new Date()
            }
        }
    );

    res.status(200).json({ message: 'Queue cleared successfully' });
});