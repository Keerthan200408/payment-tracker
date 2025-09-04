// =================================================================
// IMPORTS
// =================================================================
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

// --- Centralized Middleware & Config ---
const config = require("./config");
const database = require("./db/mongo");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const coopCoepMiddleware = require("./middleware/coopCoep");
const { globalLimiter, authLimiter } = require("./middleware/rateLimiter");

// --- Import All Route Handlers ---
const authRoutes = require("./routes/auth");
const clientRoutes = require("./routes/clients");
const paymentRoutes = require("./routes/payments");
const notificationRoutes = require("./routes/notificationRoutes");
const messageRoutes = require("./routes/messageRoutes");
const utilitiesRoutes = require("./routes/utilities");
const typesRoutes = require("./routes/types");

// =================================================================
// INITIALIZATION
// =================================================================
const app = express();

// =================================================================
// MIDDLEWARE CONFIGURATION
// =================================================================
app.set("trust proxy", 1);
app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
app.options("*", cors());
app.use(coopCoepMiddleware);
app.use(cookieParser());
app.use(express.json());
app.use(globalLimiter);

// =================================================================
// API ROUTES ("The Switchboard")
// =================================================================
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/utilities", utilitiesRoutes);

// =================================================================
// SERVER HEALTH CHECK & 404 HANDLER
// =================================================================
app.get("/", (req, res) => {
    res.json({ message: "Payment Tracker Backend is running!" });
});
app.use(notFoundHandler); // Handle any routes not defined above

// =================================================================
// GLOBAL ERROR HANDLER
// =================================================================
app.use(errorHandler);

// =================================================================
// START SERVER
// =================================================================
const PORT = config.PORT || 5000;
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