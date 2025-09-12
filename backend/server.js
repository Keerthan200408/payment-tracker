/**
 * Payment Tracker Backend Server
 * 
 * A comprehensive Express.js server for managing payment tracking operations,
 * client management, and automated notifications with secure authentication.
 */

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

// Configuration and database
const config = require("./config");
const database = require("./db/mongo");

// Middleware imports
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const coopCoepMiddleware = require("./middleware/coopCoep");
const { globalLimiter, authLimiter } = require("./middleware/rateLimiter");

// Route handlers
const authRoutes = require("./routes/auth");
const clientRoutes = require("./routes/clients");
const paymentRoutes = require("./routes/payments");
const notificationRoutes = require("./routes/notificationRoutes");
const messageRoutes = require("./routes/messageRoutes");
const utilitiesRoutes = require("./routes/utilities");
const typesRoutes = require("./routes/types");

// Initialize Express application
const app = express();

// Middleware configuration
app.set("trust proxy", 1);
app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
app.options("*", cors());
app.use(coopCoepMiddleware);
app.use(cookieParser());
app.use(express.json());
app.use(globalLimiter);

// API route configuration
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/utilities", utilitiesRoutes);

// Health check endpoint
app.get("/", (req, res) => {
    res.json({ message: "Payment Tracker Backend is running!" });
});

// Handle undefined routes
app.use(notFoundHandler);

// Global error handling
app.use(errorHandler);

// Server startup configuration
const PORT = config.PORT || 5000;

/**
 * Initialize and start the server with database connection
 */
const startServer = async () => {
    try {
        await database.connect();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1);
    }
};

startServer();