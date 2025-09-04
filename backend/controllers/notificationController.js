const { MongoClient } = require("mongodb");
const { asyncHandler } = require('../middleware/errorHandler');

// Reusable MongoDB connection function (consistent with your server)
async function connectMongo() {
    // Note: Ensure MONGODB_URI is correctly set in your .env file
    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    if (!mongoClient.topology || !mongoClient.topology.isConnected()) {
        await mongoClient.connect();
    }
    return mongoClient.db("payment_tracker");
}

// @desc    Get the notification queue for the logged-in user
exports.getNotificationQueue = asyncHandler(async (req, res) => {
    const db = await connectMongo();
    const username = req.user.username;

    const notificationDoc = await db.collection('notification_queues').findOne({ username });

    res.json({ queue: notificationDoc?.queue || [] });
});

// @desc    Save or update the notification queue
exports.saveNotificationQueue = asyncHandler(async (req, res) => {
    const { queue } = req.body;
    const username = req.user.username;

    if (!Array.isArray(queue)) {
        return res.status(400).json({ error: 'Queue must be an array' });
    }

    const db = await connectMongo();

    await db.collection('notification_queues').updateOne(
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

// @desc    Clear the notification queue
exports.clearNotificationQueue = asyncHandler(async (req, res) => {
    const db = await connectMongo();
    const username = req.user.username;

    // We update the queue to an empty array instead of deleting the document
    await db.collection('notification_queues').updateOne(
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