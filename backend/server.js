const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sanitizeHtml = require("sanitize-html");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");
const axios = require("axios");
const { MongoClient } = require("mongodb");
require("dotenv").config();

// Configuration
const config = {
  cors: {
    origins: [
      "https://reliable-eclair-abf03c.netlify.app",
      "http://localhost:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  },
  rateLimit: {
    global: { windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false },
    payment: { windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false },
    whatsapp: { windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false },
  },
  sanitize: {
    allowedTags: [
      "div", "h1", "h2", "p", "table", "thead", "tbody", "tr", "th", "td",
      "strong", "em", "ul", "ol", "li", "a", "span", "br", "style",
    ],
    allowedAttributes: { "*": ["style", "class", "href", "target"] },
    allowedStyles: {
      "*": {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
        "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
        "font-size": [/^\d+(?:px|em|rem|%)$/],
        "font-family": [/^[\w\s,'"-]+$/],
        "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
        padding: [/^\d+(?:px|em|rem)$/],
        margin: [/^\d+(?:px|em|rem)$/],
        border: [/^\d+px\s+(solid|dashed|dotted)\s+#(0x)?[0-9a-f]+$/i],
      },
    },
  },
  months: {
    january: "January", february: "February", march: "March", april: "April",
    may: "May", june: "June", july: "July", august: "August",
    september: "September", october: "October", november: "November", december: "December",
  },
  statusCodes: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
  },
};

// Initialize clients
const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
let db; // Cache database connection

// Initialize nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_PORT === "465",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  logger: true,
  debug: true,
});

// Cache for user types
const typeCache = new Map();

// Utilities
const logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || {}),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || {}),
};

const sanitizeInput = (input) => typeof input === "string" ? sanitizeHtml(input.trim(), config.sanitize) : "";

const validateInput = {
  username: (username) => typeof username === "string" && username.length >= 3 && username.length <= 50,
  email: (email) => !email || /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email),
  phone: (phone) => !phone || /^\+?[\d\s-]{10,15}$/.test(phone),
  payment: (value) => !isNaN(value) && value > 0 && value <= 1e6,
  clientName: (name) => typeof name === "string" && name.length > 0 && name.length <= 100,
  type: (type) => typeof type === "string" && type.length > 0 && type.length <= 50,
};

const getToken = (req) => {
  let token = req.cookies?.sessionToken;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.substring(7);
  }
  return token;
};

const calculateDuePayment = async (paymentData, paymentsCollection, year) => {
  const amountToBePaid = parseFloat(paymentData.Amount_To_Be_Paid) || 0;
  const months = Object.values(config.months);
  const totalPaymentsMade = months.reduce((sum, month) => sum + (parseFloat(paymentData.Payments[month]) || 0), 0);
  const expectedPayment = amountToBePaid * 12;
  const currentYearDue = Math.max(expectedPayment - totalPaymentsMade, 0);
  let prevYearDue = 0;
  if (parseInt(year) > 2025) {
    const prevPayment = await paymentsCollection.findOne({
      Client_Name: paymentData.Client_Name,
      Type: paymentData.Type,
      Year: parseInt(year) - 1,
    });
    prevYearDue = parseFloat(prevPayment?.Due_Payment) || 0;
  }
  return Math.round((currentYearDue + prevYearDue) * 100) / 100;
};

const retryWithBackoff = async (fn, retries = 3, delay = 500) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429 && i < retries - 1) {
        logger.info(`Rate limit hit, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
};

// Middleware
app.set("trust proxy", 1);
app.use(cors(config.cors));
app.options("*", cors(config.cors));

app.use((req, res, next) => {
  if (["/api/google-signin", "/api/google-signup"].includes(req.path)) {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  } else {
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  }
  next();
});

app.use(config.rateLimit.global);
app.use("/api/save-payment", config.rateLimit.payment);
app.use("/api/batch-save-payments", config.rateLimit.payment);
app.use("/api/send-whatsapp", config.rateLimit.whatsapp);

app.use(cookieParser());
app.use(express.json());

// Global error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error", { message: err.message, stack: err.stack });
  res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Internal server error: ${err.message}` });
});

// MongoDB connection
const connectMongo = async () => {
  if (!db) {
    await mongoClient.connect();
    db = mongoClient.db("payment_tracker");
    logger.info("Connected to MongoDB");
  }
  return db;
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const token = getToken(req);
  if (!token) {
    return res.status(config.statusCodes.UNAUTHORIZED).json({ error: "Access denied: No token provided" });
  }
  try {
    const user = jwt.verify(token, process.env.SECRET_KEY);
    req.user = user;
    next();
  } catch (err) {
    logger.error("Invalid token", { message: err.message });
    res.status(config.statusCodes.FORBIDDEN).json({ error: "Invalid token" });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Payment Tracker Backend is running!" });
});

// Google Sign-In
app.post("/api/google-signin", async (req, res) => {
  const { googleToken } = req.body;
  if (!googleToken) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Google token is required" });
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email } = ticket.getPayload();
    const db = await connectMongo();
    const users = db.collection("users");
    const user = await users.findOne({ $or: [{ GoogleEmail: email }, { Username: email }] });
    if (user) {
      const sessionToken = jwt.sign({ username: user.Username }, process.env.SECRET_KEY, { expiresIn: "24h" });
      res.cookie("sessionToken", sessionToken, {
        httpOnly: true,
        secure: true,
        maxAge: 86400000,
        sameSite: "None",
        path: "/",
      });
      return res.json({ username: user.Username, sessionToken });
    }
    res.json({ needsUsername: true });
  } catch (error) {
    logger.error("Google sign-in error", { message: error.message });
    res.status(config.statusCodes.UNAUTHORIZED).json({ error: "Invalid Google token" });
  }
});

// Google Signup
app.post("/api/google-signup", async (req, res) => {
  let { email, username } = req.body;
  if (!email || !validateInput.username(username)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid email and username (3-50 chars) required" });
  }
  username = sanitizeInput(username);
  email = sanitizeInput(email);
  try {
    const db = await connectMongo();
    const users = db.collection("users");
    const existingUser = await users.findOne({ $or: [{ Username: username }, { GoogleEmail: email }] });
    if (existingUser) {
      return res.status(config.statusCodes.BAD_REQUEST).json({
        error: existingUser.Username === username ? "Username already exists" : "Google account already linked",
      });
    }
    await users.insertOne({ Username: username, Password: null, GoogleEmail: email });
    const sessionToken = jwt.sign({ username }, process.env.SECRET_KEY, { expiresIn: "24h" });
    res.cookie("sessionToken", sessionToken, {
      httpOnly: true,
      secure: true,
      maxAge: 86400000,
      sameSite: "None",
      path: "/",
    });
    res.json({ username, sessionToken });
  } catch (error) {
    logger.error("Google signup error", { message: error.message });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
});

// Signup
app.post("/api/signup", async (req, res) => {
  let { username, password } = req.body;
  if (!validateInput.username(username) || !password || password.length < 6) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid username (3-50 chars) and password (6+ chars) required" });
  }
  username = sanitizeInput(username);
  try {
    const db = await connectMongo();
    const users = db.collection("users");
    if (await users.findOne({ Username: username })) {
      return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Username already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await users.insertOne({ Username: username, Password: hashedPassword, GoogleEmail: null });
    res.status(config.statusCodes.CREATED).json({ message: "Account created successfully" });
  } catch (error) {
    logger.error("Signup error", { message: error.message });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  let { username, password } = req.body;
  if (!username || !password) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Username and password required" });
  }
  username = sanitizeInput(username);
  try {
    const db = await connectMongo();
    const users = db.collection("users");
    const user = await users.findOne({ Username: username });
    if (!user || !user.Password || !(await bcrypt.compare(password, user.Password))) {
      return res.status(config.statusCodes.UNAUTHORIZED).json({ error: "Invalid credentials" });
    }
    const sessionToken = jwt.sign({ username }, process.env.SECRET_KEY, { expiresIn: "24h" });
    res.cookie("sessionToken", sessionToken, {
      httpOnly: true,
      secure: true,
      maxAge: 86400000,
      sameSite: "None",
      path: "/",
    });
    res.json({ username, sessionToken });
  } catch (error) {
    logger.error("Login error", { message: error.message });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
});

// Logout
app.post("/api/logout", (req, res) => {
  res.clearCookie("sessionToken", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
  });
  res.json({ message: "Logged out successfully" });
});

// Refresh Token
app.post("/api/refresh-token", async (req, res) => {
  const token = getToken(req);
  if (!token) {
    return res.status(config.statusCodes.UNAUTHORIZED).json({ error: "No token provided" });
  }
  try {
    let decoded = jwt.decode(token);
    if (!decoded || !decoded.username) {
      return res.status(config.statusCodes.FORBIDDEN).json({ error: "Invalid token" });
    }
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY);
    } catch (err) {
      // Allow expired token for refresh
    }
    const db = await connectMongo();
    const users = db.collection("users");
    const user = await users.findOne({ Username: decoded.username });
    if (!user) {
      return res.status(config.statusCodes.FORBIDDEN).json({ error: "User not found" });
    }
    const newToken = jwt.sign({ username: decoded.username }, process.env.SECRET_KEY, { expiresIn: "24h" });
    res.cookie("sessionToken", newToken, {
      httpOnly: true,
      secure: true,
      maxAge: 86400000,
      sameSite: "None",
      path: "/",
    });
    res.json({ username: decoded.username, sessionToken: newToken });
  } catch (error) {
    logger.error("Refresh token error", { message: error.message });
    res.status(config.statusCodes.FORBIDDEN).json({ error: "Invalid token" });
  }
});

// Get Clients
app.get("/api/get-clients", authenticateToken, async (req, res) => {
  try {
    const db = await connectMongo();
    const clients = await db.collection(`clients_${req.user.username}`).find({}).toArray();
    const processedClients = clients.map(client => ({
      Client_Name: client.Client_Name || "",
      Email: client.Email || "",
      Type: client.Type || "",
      Amount_To_Be_Paid: parseFloat(client.Monthly_Payment) || 0,
      Phone_Number: client.Phone_Number || "",
      createdAt: client.createdAt || new Date(0).toISOString(),
    }));
    logger.info(`Fetched ${processedClients.length} clients for user ${req.user.username}`);
    res.json(processedClients);
  } catch (error) {
    logger.error("Get clients error", { message: error.message });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to fetch clients: ${error.message}` });
  }
});

// Add Client
app.post("/api/add-client", authenticateToken, async (req, res) => {
  let { clientName, email, type, monthlyPayment, phoneNumber } = req.body;
  const username = req.user.username;
  const paymentValue = parseFloat(monthlyPayment);
  const createdAt = new Date().toISOString();

  if (!validateInput.clientName(clientName) || !validateInput.type(type) || !validateInput.payment(paymentValue)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Invalid client name, type, or payment" });
  }
  if (!validateInput.email(email) || !validateInput.phone(phoneNumber)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Invalid email or phone number" });
  }

  clientName = sanitizeInput(clientName);
  type = sanitizeInput(type.trim().toUpperCase());
  email = email ? sanitizeInput(email) : "";
  phoneNumber = phoneNumber ? sanitizeInput(phoneNumber) : "";

  try {
    const db = await connectMongo();
    let userTypes = typeCache.get(username);
    if (!userTypes) {
      const types = await db.collection("types").find({ User: username }).toArray();
      userTypes = types.map(t => t.Type);
      typeCache.set(username, userTypes);
    }
    if (!userTypes.includes(type)) {
      return res.status(config.statusCodes.BAD_REQUEST).json({ error: `Type must be one of: ${userTypes.join(", ")}` });
    }

    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);

    if (await clientsCollection.findOne({ Client_Name: clientName, Type: type })) {
      return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Client with this name and type already exists" });
    }

    await clientsCollection.insertOne({
      Client_Name: clientName,
      Email: email,
      Type: type,
      Monthly_Payment: paymentValue,
      Phone_Number: phoneNumber,
      createdAt,
    });

    const existingYears = await paymentsCollection.distinct("Year");
    const yearsToCreate = existingYears.length > 0 ? existingYears : [2025];

    const paymentDocs = yearsToCreate.map(year => ({
      Client_Name: clientName,
      Type: type,
      Amount_To_Be_Paid: paymentValue,
      Year: year,
      Payments: Object.fromEntries(Object.values(config.months).map(m => [m, ""])),
      Due_Payment: 0,
      createdAt,
    }));

    await paymentsCollection.insertMany(paymentDocs);
    logger.info(`Client ${clientName} added with payments for years: ${yearsToCreate.join(", ")}`, { username });
    res.status(config.statusCodes.CREATED).json({ message: "Client added successfully", yearsCreated });
  } catch (error) {
    logger.error("Add client error", { message: error.message, clientName, type, username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to add client: ${error.message}` });
  }
});

// Update Client
app.put("/api/update-client", authenticateToken, async (req, res) => {
  const { oldClient, newClient } = req.body;
  const username = req.user.username;
  if (!oldClient?.Client_Name || !oldClient?.Type || !newClient?.Client_Name || !newClient?.Type || !newClient?.Amount_To_Be_Paid) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "All required fields must be provided" });
  }

  let { Client_Name: oldClientName, Type: oldType } = oldClient;
  let { Client_Name, Type, Amount_To_Be_Paid, Email, Phone_Number } = newClient;
  oldClientName = sanitizeInput(oldClientName);
  oldType = sanitizeInput(oldType.trim().toUpperCase());
  Client_Name = sanitizeInput(Client_Name);
  Type = sanitizeInput(Type.trim().toUpperCase());
  Email = Email && validateInput.email(Email) ? sanitizeInput(Email) : "";
  Phone_Number = Phone_Number && validateInput.phone(Phone_Number) ? sanitizeInput(Phone_Number) : "";
  const paymentValue = parseFloat(Amount_To_Be_Paid);

  if (!validateInput.payment(paymentValue) || !validateInput.clientName(Client_Name) || !validateInput.type(Type)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Invalid client name, type, or payment amount" });
  }

  try {
    const db = await connectMongo();
    let userTypes = typeCache.get(username);
    if (!userTypes) {
      const types = await db.collection("types").find({ User: username }).toArray();
      userTypes = types.map(t => t.Type);
      typeCache.set(username, userTypes);
    }
    if (!userTypes.includes(Type)) {
      return res.status(config.statusCodes.BAD_REQUEST).json({ error: `Type must be one of: ${userTypes.join(", ")}` });
    }

    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);
    const client = await clientsCollection.findOne({ Client_Name: oldClientName, Type: oldType });
    if (!client) {
      return res.status(config.statusCodes.NOT_FOUND).json({ error: "Client not found" });
    }

    await clientsCollection.updateOne(
      { Client_Name: oldClientName, Type: oldType },
      { $set: { Client_Name, Type, Monthly_Payment: paymentValue, Email, Phone_Number, createdAt: client.createdAt } }
    );

    const paymentDocs = await paymentsCollection.find({ Client_Name: oldClientName, Type: oldType }).toArray();
    const updatePromises = paymentDocs.map(async doc => {
      const activeMonths = Object.values(doc.Payments).filter(m => m >= 0).length;
      const expectedPayment = paymentValue * activeMonths;
      const totalPayments = Object.values(doc.Payments).reduce((sum, m) => sum + (parseFloat(m) || 0), 0);
      const currentYearDue = Math.max(expectedPayment - totalPayments, 0);
      let prevYearDue = 0;
      if (doc.Year > 2025) {
        const prevDoc = await paymentsCollection.findOne({ Client_Name: oldClientName, Type: oldType, Year: doc.Year - 1 });
        prevYearDue = parseFloat(prevDoc?.Due_Payment) || 0;
      }
      return paymentsCollection.updateOne(
        { _id: doc._id },
        { $set: { Client_Name, Type, Amount_To_Be_Paid: paymentValue, Due_Payment: currentYearDue + prevYearDue, createdAt: doc.createdAt } }
      );
    });

    await Promise.all(updatePromises);
    res.json({ message: "Client updated successfully" });
  } catch (error) {
    logger.error("Update client error", { message: error.message, oldClient, newClient, username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to update client: ${error.message}` });
  }
});

// Delete Client
app.post("/api/delete-client", authenticateToken, async (req, res) => {
  let { Client_Name, Type } = req.body;
  if (!validateInput.clientName(Client_Name) || !validateInput.type(Type)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid client name and type required" });
  }
  Client_Name = sanitizeInput(Client_Name);
  Type = sanitizeInput(Type.trim().toUpperCase());
  const username = req.user.username;

  try {
    const db = await connectMongo();
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);
    const client = await clientsCollection.findOne({ Client_Name, Type });
    if (!client) {
      return res.status(config.statusCodes.NOT_FOUND).json({ error: "Client not found" });
    }
    await Promise.all([
      clientsCollection.deleteOne({ Client_Name, Type }),
      paymentsCollection.deleteMany({ Client_Name, Type }),
    ]);
    logger.info(`Client ${Client_Name} deleted`, { username, Type });
    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    logger.error("Delete client error", { message: error.message, Client_Name, Type, username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
});

// Get Payments by Year
app.get("/api/get-payments-by-year", authenticateToken, async (req, res) => {
  const { year } = req.query;
  if (!year || isNaN(year)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid year required" });
  }
  const username = req.user.username;

  try {
    const db = await connectMongo();
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);

    const [clients, payments] = await Promise.all([
      clientsCollection.find({}).toArray(),
      paymentsCollection.find({ Year: parseInt(year) }).toArray(),
    ]);

    const clientEmailMap = new Map(clients.map(c => [`${c.Client_Name}_${c.Type}`, c.Email || ""]));
    const clientPhoneMap = new Map(clients.map(c => [`${c.Client_Name}_${c.Type}`, c.Phone_Number || ""]));

    let prevYearDueMap = new Map();
    if (parseInt(year) > 2025) {
      const prevYearPayments = await paymentsCollection.find({ Year: parseInt(year) - 1 }).toArray();
      prevYearDueMap = new Map(prevYearPayments.map(p => [`${p.Client_Name}_${p.Type}`, parseFloat(p.Due_Payment) || 0]));
    }

    const processedPayments = payments.map(payment => {
      const amountToBePaid = parseFloat(payment.Amount_To_Be_Paid) || 0;
      const previousYearDue = prevYearDueMap.get(`${payment.Client_Name}_${payment.Type}`) || 0;
      const activeMonths = Object.values(config.months).filter(month => payment.Payments[month] !== "" && payment.Payments[month] !== null).length;
      const totalPaymentsMade = Object.values(config.months).reduce((sum, month) => sum + (parseFloat(payment.Payments[month]) || 0), 0);
      const expectedPayment = activeMonths * amountToBePaid;
      const currentYearDue = Math.max(expectedPayment - totalPaymentsMade, 0);
      const totalDuePayment = Math.round((currentYearDue + previousYearDue) * 100) / 100;

      return {
        Client_Name: payment.Client_Name || "",
        Type: payment.Type || "",
        Amount_To_Be_Paid: amountToBePaid,
        ...Object.fromEntries(Object.entries(config.months).map(([key, month]) => [key, payment.Payments[month] || ""])),
        Due_Payment: totalDuePayment,
        Email: clientEmailMap.get(`${payment.Client_Name}_${payment.Type}`) || "",
        Phone_Number: clientPhoneMap.get(`${payment.Client_Name}_${payment.Type}`) || "",
        createdAt: payment.createdAt || new Date(0).toISOString(),
      };
    });

    logger.info(`Fetched ${processedPayments.length} payments for year ${year}`, { username });
    res.json(processedPayments);
  } catch (error) {
    logger.error(`Get payments for year ${year} error`, { message: error.message, username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to fetch payments: ${error.message}` });
  }
});

// Save Payment
app.post("/api/save-payment", authenticateToken, config.rateLimit.payment, async (req, res) => {
  const { clientName, type, month, value } = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  const username = req.user.username;

  if (!validateInput.clientName(clientName) || !validateInput.type(type) || !config.months[month.toLowerCase()]) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid client name, type, and month required" });
  }
  const numericValue = value !== "" && value !== null && value !== undefined ? parseFloat(value) : 0;
  if (!validateInput.payment(numericValue)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Invalid payment value" });
  }

  const monthKey = config.months[month.toLowerCase()];
  try {
    const db = await connectMongo();
    const paymentsCollection = db.collection(`payments_${username}`);
    const payment = await paymentsCollection.findOne({ Client_Name: clientName, Type: type, Year: parseInt(year) });
    if (!payment) {
      return res.status(config.statusCodes.NOT_FOUND).json({ error: "Payment record not found" });
    }

    const updatedPayments = { ...payment.Payments, [monthKey]: numericValue === 0 ? "" : numericValue.toString() };
    const finalDuePayment = await calculateDuePayment({ ...payment, Payments: updatedPayments }, paymentsCollection, year);

    await paymentsCollection.updateOne(
      { Client_Name: clientName, Type: type, Year: parseInt(year) },
      { $set: { Payments: updatedPayments, Due_Payment: finalDuePayment, Last_Updated: new Date() } }
    );

    const updatedRow = {
      Client_Name: payment.Client_Name,
      Type: payment.Type,
      Amount_To_Be_Paid: parseFloat(payment.Amount_To_Be_Paid) || 0,
      ...Object.fromEntries(Object.entries(config.months).map(([key, month]) => [key, updatedPayments[month] || ""])),
      Due_Payment: finalDuePayment,
    };

    logger.info(`Payment updated for ${clientName}, ${monthKey}, ${year}`, { value: numericValue, username });
    res.json({ message: "Payment updated successfully", updatedRow });
  } catch (error) {
    logger.error("Save payment error", { message: error.message, clientName, type, month, year, username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to save payment: ${error.message}` });
  }
});

// Batch Save Payments
app.post("/api/batch-save-payments", authenticateToken, config.rateLimit.payment, async (req, res) => {
  const { clientName, type, updates } = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  const username = req.user.username;

  if (!validateInput.clientName(clientName) || !validateInput.type(type) || !Array.isArray(updates) || updates.length === 0) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid client name, type, and non-empty updates array required" });
  }

  const validationErrors = [];
  const processedUpdates = updates.map(({ month, value }, i) => {
    if (!config.months[month.toLowerCase()]) {
      validationErrors.push(`Invalid month at index ${i}: ${month}`);
      return null;
    }
    const numericValue = value !== "" && value !== null && value !== undefined ? parseFloat(value) : 0;
    if (!validateInput.payment(numericValue)) {
      validationErrors.push(`Invalid payment value at index ${i} for ${month}: ${value}`);
      return null;
    }
    return { month: config.months[month.toLowerCase()], value: numericValue };
  }).filter(Boolean);

  if (validationErrors.length > 0) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Validation failed", details: validationErrors });
  }

  try {
    const db = await connectMongo();
    const paymentsCollection = db.collection(`payments_${username}`);
    const paymentData = await paymentsCollection.findOne({ Client_Name: clientName, Type: type, Year: parseInt(year) });
    if (!paymentData) {
      return res.status(config.statusCodes.NOT_FOUND).json({ error: "Payment record not found" });
    }

    const updatedPayments = {
      ...paymentData.Payments,
      ...Object.fromEntries(processedUpdates.map(({ month, value }) => [month, value === 0 ? "" : value.toString()])),
    };

    const finalDuePayment = await calculateDuePayment({ ...paymentData, Payments: updatedPayments }, paymentsCollection, year);

    await paymentsCollection.updateOne(
      { Client_Name: clientName, Type: type, Year: parseInt(year) },
      { $set: { Payments: updatedPayments, Due_Payment: finalDuePayment, Last_Updated: new Date() } }
    );

    const updatedRow = {
      Client_Name: paymentData.Client_Name,
      Type: paymentData.Type,
      Amount_To_Be_Paid: parseFloat(paymentData.Amount_To_Be_Paid) || 0,
      ...Object.fromEntries(Object.entries(config.months).map(([key, month]) => [key, updatedPayments[month] || ""])),
      Due_Payment: finalDuePayment,
      Email: paymentData.Email || "",
      Phone_Number: paymentData.Phone_Number || "",
    };

    logger.info(`Batch payment updated for ${clientName}, ${processedUpdates.length} updates`, { year, username });
    res.json({ message: "Batch payment updated successfully", updatedRow, updatesProcessed: processedUpdates.length });
  } catch (error) {
    logger.error("Batch save payment error", { message: error.message, clientName, type, year, username });
    let errorMessage = "Failed to save batch payments";
    let statusCode = config.statusCodes.INTERNAL_SERVER_ERROR;
    if (error.message.includes("No document matched")) {
      errorMessage = "Payment record not found";
      statusCode = config.statusCodes.NOT_FOUND;
    } else if (error.message.includes("timeout")) {
      errorMessage = "Database operation timed out";
      statusCode = config.statusCodes.REQUEST_TIMEOUT;
    } else if (error.message.includes("duplicate")) {
      errorMessage = "Duplicate payment entry detected";
      statusCode = config.statusCodes.CONFLICT;
    }
    res.status(statusCode).json({ error: `${errorMessage}: ${error.message}` });
  }
});

// Get User Years
app.get("/api/get-user-years", authenticateToken, async (req, res) => {
  try {
    const db = await connectMongo();
    const paymentsCollection = db.collection(`payments_${req.user.username}`);
    const years = await paymentsCollection.distinct("Year");
    const validYears = years.filter(y => y >= 2025).sort((a, b) => a - b);
    if (!validYears.includes(2025)) validYears.push(2025);
    res.json(validYears);
  } catch (error) {
    logger.error("Get user years error", { message: error.message, username: req.user.username });
    res.json([2025]);
  }
});

// Add New Year
app.post("/api/add-new-year", authenticateToken, async (req, res) => {
  const { year } = req.body;
  const username = req.user.username;
  if (!year || isNaN(year) || parseInt(year) <= 2025) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid year > 2025 required" });
  }
  try {
    const db = await connectMongo();
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);
    const clients = await clientsCollection.find({}).toArray();
    if (!clients.length) {
      return res.status(config.statusCodes.BAD_REQUEST).json({ error: `No clients found for user ${username}` });
    }
    await paymentsCollection.deleteMany({ Year: parseInt(year) });
    const paymentDocs = clients.map(client => ({
      Client_Name: client.Client_Name || "",
      Type: client.Type || "",
      Amount_To_Be_Paid: parseFloat(client.Monthly_Payment) || 0,
      Year: parseInt(year),
      Payments: Object.fromEntries(Object.values(config.months).map(m => [m, 0])),
      Due_Payment: parseFloat(client.Monthly_Payment) || 0,
      createdAt: client.createdAt || new Date(0).toISOString(),
    }));
    await paymentsCollection.insertMany(paymentDocs);
    logger.info(`Added ${paymentDocs.length} clients for year ${year}`, { username });
    res.json({ message: `Year ${year} added successfully with ${paymentDocs.length} clients` });
  } catch (error) {
    logger.error(`Add new year ${year} error`, { message: error.message, username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to add new year: ${error.message}` });
  }
});

// Import CSV
app.post("/api/import-csv", authenticateToken, async (req, res) => {
  const csvData = req.body;
  const username = req.user.username;
  if (!Array.isArray(csvData) || csvData.length === 0) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "CSV data must be a non-empty array" });
  }

  try {
    const db = await connectMongo();
    const typesCollection = db.collection("types");
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);

    let userTypes = typeCache.get(username);
    if (!userTypes) {
      const types = await typesCollection.find({ User: username }).toArray();
      userTypes = types.map(t => t.Type.toUpperCase());
      typeCache.set(username, userTypes);
    }
    if (!userTypes.length) {
      return res.status(config.statusCodes.BAD_REQUEST).json({ error: "No payment types defined. Add types in dashboard." });
    }

    const existingYears = await paymentsCollection.distinct("Year");
    const yearsToCreate = existingYears.length > 0 ? existingYears : [2025];
    const existingClients = await clientsCollection.find({}, { projection: { Client_Name: 1, Type: 1 } }).toArray();
    const existingClientsSet = new Set(existingClients.map(c => `${c.Client_Name.toLowerCase()}|${c.Type.toUpperCase()}`));

    const baseTimestamp = new Date().getTime();
    const validClients = [];
    const validPayments = [];
    const errors = [];
    const skippedDuplicates = [];
    const processedInBatch = new Set();

    for (let i = 0; i < csvData.length; i++) {
      const record = csvData[i];
      if (!Array.isArray(record) || record.length < 4) {
        errors.push(`Record at index ${i + 1}: Must have at least [Amount, Type, Email, Client_Name, Phone]`);
        continue;
      }
      const [amountToBePaid, type, email = "", clientName, phoneNumber = ""] = record;
      const createdAt = new Date(baseTimestamp + (csvData.length - 1 - i)).toISOString();

      if (!validateInput.clientName(clientName) || !validateInput.type(type) || !validateInput.payment(parseFloat(amountToBePaid))) {
        errors.push(`Record at index ${i + 1}: Invalid client name, type, or amount`);
        continue;
      }
      const typeUpper = type.trim().toUpperCase();
      if (!userTypes.includes(typeUpper)) {
        errors.push(`Record at index ${i + 1}: Type "${type}" must be one of: ${userTypes.join(", ")}`);
        continue;
      }

      const sanitizedClientName = sanitizeInput(clientName);
      const clientKey = `${sanitizedClientName.toLowerCase()}|${typeUpper}`;
      if (existingClientsSet.has(clientKey) || processedInBatch.has(clientKey)) {
        skippedDuplicates.push({ index: i + 1, clientName: sanitizedClientName, type: typeUpper, reason: "Duplicate" });
        continue;
      }
      processedInBatch.add(clientKey);

      const sanitizedEmail = email && validateInput.email(email) ? sanitizeInput(email) : "";
      const sanitizedPhoneNumber = phoneNumber && validateInput.phone(phoneNumber) ? sanitizeInput(phoneNumber) : "";

      validClients.push({
        Client_Name: sanitizedClientName,
        Type: typeUpper,
        Email: sanitizedEmail,
        Monthly_Payment: parseFloat(amountToBePaid),
        Phone_Number: sanitizedPhoneNumber,
        createdAt,
      });

      validPayments.push(...yearsToCreate.map(year => ({
        Client_Name: sanitizedClientName,
        Type: typeUpper,
        Amount_To_Be_Paid: parseFloat(amountToBePaid),
        Year: year,
        Payments: Object.fromEntries(Object.values(config.months).map(m => [m, 0])),
        Due_Payment: parseFloat(amountToBePaid),
        createdAt,
      })));
    }

    if (!validClients.length) {
      return res.status(config.statusCodes.BAD_REQUEST).json({
        error: "No valid records found in CSV",
        summary: { totalRecords: csvData.length, validRecords: 0, errorRecords: errors.length, duplicateRecords: skippedDuplicates.length },
        errors,
        duplicatesSkipped: skippedDuplicates,
      });
    }

    const [clientResult, paymentResult] = await Promise.all([
      validClients.length ? clientsCollection.insertMany(validClients, { ordered: false }) : { insertedCount: 0 },
      validPayments.length ? paymentsCollection.insertMany(validPayments, { ordered: false }) : { insertedCount: 0 },
    ]);

    const response = {
      message: `Imported ${clientResult.insertedCount} clients and ${paymentResult.insertedCount} payments`,
      imported: clientResult.insertedCount,
      summary: {
        totalRecords: csvData.length,
        validRecords: validClients.length,
        errorRecords: errors.length,
        duplicateRecords: skippedDuplicates.length,
        clientsImported: clientResult.insertedCount,
        paymentRecordsCreated: paymentResult.insertedCount,
        yearsProcessed: yearsToCreate.length,
        yearsCreated,
      },
      ...(errors.length > 0 && { errors }),
      ...(skippedDuplicates.length > 0 && { duplicatesSkipped }),
    };

    logger.info("CSV import completed", { username, ...response.summary });
    res.status(config.statusCodes.OK).json(response);
  } catch (error) {
    logger.error("Import CSV error", { message: error.message, username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({
      error: `Failed to import CSV: ${error.message}`,
      summary: { totalRecords: csvData.length, validRecords: 0, errorRecords: errors.length, duplicateRecords: skippedDuplicates.length },
      errors,
      duplicatesSkipped: skippedDuplicates,
    });
  }
});

// Debug Routes
app.get("/api/debug-routes", (req, res) => {
  const routes = app._router.stack
    .filter(r => r.route?.path?.startsWith("/api"))
    .map(r => ({ method: Object.keys(r.route.methods)[0].toUpperCase(), path: r.route.path }));
  res.json({ message: "Available API routes", routes, timestamp: new Date().toISOString() });
});

// Add Type
app.post("/api/add-type", authenticateToken, async (req, res) => {
  let { type } = req.body;
  const username = req.user.username;
  if (!validateInput.type(type)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid type (1-50 chars) required" });
  }
  type = sanitizeInput(type.trim().toUpperCase());
  try {
    const db = await connectMongo();
    const typesCollection = db.collection("types");
    if (await typesCollection.findOne({ Type: { $regex: `^${type}$`, $options: "i" }, User: username })) {
      return res.status(config.statusCodes.BAD_REQUEST).json({ error: `Type "${type}" already exists` });
    }
    await typesCollection.insertOne({ Type: type, User: username });
    typeCache.delete(username); // Invalidate cache
    logger.info(`Type ${type} added`, { username });
    res.status(config.statusCodes.CREATED).json({ message: "Type added successfully" });
  } catch (error) {
    logger.error("Add type error", { message: error.message, type, username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to add type: ${error.message}` });
  }
});

// Get Types
app.get("/api/get-types", authenticateToken, async (req, res) => {
  const username = req.user.username;
  try {
    let userTypes = typeCache.get(username);
    if (!userTypes) {
      const db = await connectMongo();
      const types = await db.collection("types").find({ User: username }).toArray();
      userTypes = types.map(t => t.Type).filter(Boolean);
      typeCache.set(username, userTypes);
    }
    logger.info(`Fetched ${userTypes.length} types`, { username });
    res.json(userTypes);
  } catch (error) {
    logger.error("Get types error", { message: error.message, username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to fetch types: ${error.message}` });
  }
});

// Test SMTP
app.get("/api/test-smtp", async (req, res) => {
  try {
    await transporter.verify();
    logger.info("SMTP server verified");
    res.json({ message: "SMTP server is ready" });
  } catch (error) {
    logger.error("SMTP verification error", { message: error.message });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `SMTP verification failed: ${error.message}` });
  }
});

// Send Email
app.post("/api/send-email", authenticateToken, async (req, res) => {
  const { to, subject, html } = req.body;
  if (!to || !subject || !html || !validateInput.email(to)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid recipient email, subject, and HTML content required" });
  }
  if (!process.env.EMAIL_FROM) {
    return res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server configuration error: Missing email sender address" });
  }

  try {
    const sanitizedHtml = sanitizeInput(html);
    if (!sanitizedHtml.trim()) {
      return res.status(config.statusCodes.BAD_REQUEST).json({ error: "HTML content invalid or empty after sanitization" });
    }
    const info = await transporter.sendMail({
      from: `"Payment Tracker" <${process.env.EMAIL_FROM}>`,
      to: to.trim(),
      subject,
      html: sanitizedHtml,
    });
    logger.info("Email sent", { to, messageId: info.messageId, username: req.user.username });
    res.json({ message: "Email sent successfully", messageId: info.messageId });
  } catch (error) {
    logger.error("Send email error", { message: error.message, to, username: req.user.username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to send email: ${error.message}` });
  }
});

// Verify WhatsApp Contact
app.post("/api/verify-whatsapp-contact", authenticateToken, async (req, res) => {
  const { phone } = req.body;
  if (!validateInput.phone(phone)) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid phone number required" });
  }
  if (!process.env.ULTRAMSG_TOKEN || !process.env.ULTRAMSG_INSTANCE_ID) {
    return res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server configuration error: Missing WhatsApp API credentials" });
  }

  try {
    let formattedPhone = phone.trim().replace(/[\s-]/g, "");
    if (!formattedPhone.startsWith("+")) formattedPhone = `+91${formattedPhone.replace(/\D/g, "")}`;
    const chatId = `${formattedPhone}@c.us`;
    const response = await retryWithBackoff(() =>
      axios.get(`https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE_ID}/contacts/check`, {
        params: { token: process.env.ULTRAMSG_TOKEN, chatId },
        timeout: 5000,
      })
    );
    const isValidWhatsApp = response.data.status === "valid";
    logger.info("WhatsApp contact verified", { phone: formattedPhone, isValidWhatsApp, username: req.user.username });
    res.json({ isValidWhatsApp });
  } catch (error) {
    logger.error("Verify WhatsApp contact error", { message: error.message, phone, username: req.user.username });
    if (error.response?.status === 429) {
      return res.status(config.statusCodes.TOO_MANY_REQUESTS).json({ error: "Rate limit exceeded for WhatsApp API" });
    }
    if (error.response?.data?.error?.code === 1006) {
      return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Phone number not registered with WhatsApp", isValidWhatsApp: false });
    }
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to verify WhatsApp contact: ${error.message}` });
  }
});

// Send WhatsApp
app.post("/api/send-whatsapp", authenticateToken, config.rateLimit.whatsapp, async (req, res) => {
  const { to, message } = req.body;
  if (!validateInput.phone(to) || !message) {
    return res.status(config.statusCodes.BAD_REQUEST).json({ error: "Valid phone number and message required" });
  }
  try {
    let formattedPhone = to.trim().replace(/[\s-]/g, "");
    if (!formattedPhone.startsWith("+")) formattedPhone = `+91${formattedPhone.replace(/\D/g, "")}`;
    const response = await retryWithBackoff(() =>
      axios.post(
        `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE_ID}/messages/chat`,
        new URLSearchParams({ token: process.env.ULTRAMSG_TOKEN, to: formattedPhone, body: message }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
      )
    );
    if (response.status === 200 && (response.data.status === "success" || response.data.sent === "true" || response.data.messageId)) {
      logger.info("WhatsApp message sent", { to: formattedPhone, messageId: response.data.messageId || "N/A", username: req.user.username });
      return res.json({ message: "WhatsApp message sent successfully", messageId: response.data.messageId || "N/A" });
    }
    logger.error("Unexpected WhatsApp API response", { response: response.data, to: formattedPhone, username: req.user.username });
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Unexpected response from WhatsApp API: ${JSON.stringify(response.data)}` });
  } catch (error) {
    logger.error("Send WhatsApp error", { message: error.message, to, username: req.user.username });
    if (error.response?.status === 429) {
      return res.status(config.statusCodes.TOO_MANY_REQUESTS).json({ error: "Rate limit exceeded for WhatsApp API" });
    }
    res.status(config.statusCodes.INTERNAL_SERVER_ERROR).json({ error: `Failed to send WhatsApp message: ${error.message}` });
  }
});

// Start server
const PORT = process.env.PORT || 5173;
app.listen(PORT, async () => {
  try {
    await connectMongo();
    await transporter.verify();
    logger.info(`Server running on port ${PORT}`);
  } catch (error) {
    logger.error("Startup error", { message: error.message });
    process.exit(1);
  }
});