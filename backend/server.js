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

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.set("trust proxy", 1);

// CORS configuration
app.use(
  cors({
    origin: [
      "https://reliable-eclair-abf03c.netlify.app",
      "http://localhost:5174",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.options("*", cors());

// COOP/COEP headers for Google Sign-In
app.use((req, res, next) => {
  if (req.path === "/api/google-signin" || req.path === "/api/google-signup") {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  } else {
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  }
  next();
});

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
const whatsappLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);
app.use("/api/save-payment", paymentLimiter);
app.use("/api/batch-save-payments", paymentLimiter);
app.use("/api/send-whatsapp", whatsappLimiter);

// Cookie parser and JSON parsing
app.use(cookieParser());
app.use(express.json());

// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_PORT === "465",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  logger: true,
  debug: true,
});

transporter.verify((error, success) => {
  if (error) {
    console.error("Email transporter verification failed:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
  } else {
    console.log("Email transporter is ready");
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Payment Tracker Backend is running!" });
});

// Helper: Retry with backoff (for UltraMsg API or MongoDB transient errors)
const retryWithBackoff = async (fn, retries = 3, delay = 500) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429 && i < retries - 1) {
        console.log(`Rate limit hit, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
};

// Sanitization options
const sanitizeOptions = {
  allowedTags: [
    "div", "h1", "h2", "p", "table", "thead", "tbody", "tr", "th", "td",
    "strong", "em", "ul", "ol", "li", "a", "span", "br", "style",
  ],
  allowedAttributes: {
    "*": ["style", "class", "href", "target"],
  },
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
};

function sanitizeInput(input) {
  return sanitizeHtml(input, sanitizeOptions);
}

// Middleware: Verify JWT
const authenticateToken = (req, res, next) => {
  let token = req.cookies?.sessionToken;
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }
  if (!token) {
    console.log("No session token provided");
    return res.status(401).json({ error: "Access denied: No token provided" });
  }
  try {
    const user = jwt.verify(token, process.env.SECRET_KEY);
    req.user = user;
    next();
  } catch (err) {
    console.log("Invalid token:", err.message);
    res.status(403).json({ error: "Invalid token" });
  }
};

// MongoDB connection helper
async function connectMongo() {
  if (!mongoClient.topology || !mongoClient.topology.isConnected()) {
    await mongoClient.connect();
  }
  return mongoClient.db("payment_tracker");
}

// Google Sign-In
app.post("/api/google-signin", async (req, res) => {
  console.log("Received /api/google-signin request");
  const { googleToken } = req.body;
  if (!googleToken) {
    return res.status(400).json({ error: "Google token is required" });
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;

    const db = await connectMongo();
    const users = db.collection("users");
    const user = await users.findOne({ $or: [{ GoogleEmail: email }, { Username: email }] });
    if (user) {
      const username = user.Username;
      const sessionToken = jwt.sign({ username }, process.env.SECRET_KEY, {
        expiresIn: "24h",
      });
      res.cookie("sessionToken", sessionToken, {
        httpOnly: true,
        secure: true,
        maxAge: 86400000,
        sameSite: "None",
        path: "/",
      });
      return res.json({ username, sessionToken });
    } else {
      return res.json({ needsUsername: true });
    }
  } catch (error) {
    console.error("Google sign-in error:", error.message);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// Google Signup
app.post("/api/google-signup", async (req, res) => {
  console.log("Received /api/google-signup request");
  let { email, username } = req.body;
  if (!email || !username) {
    return res.status(400).json({ error: "Email and username are required" });
  }
  username = sanitizeInput(username);
  email = sanitizeInput(email);
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: "Username must be between 3 and 50 characters" });
  }
  try {
    const db = await connectMongo();
    const users = db.collection("users");
    const existingUser = await users.findOne({ $or: [{ Username: username }, { GoogleEmail: email }] });
    if (existingUser) {
      return res.status(400).json({
        error: existingUser.Username === username ? "Username already exists" : "Google account already linked",
      });
    }
    await users.insertOne({ Username: username, Password: null, GoogleEmail: email });
    const sessionToken = jwt.sign({ username }, process.env.SECRET_KEY, {
      expiresIn: "24h",
    });
    res.cookie("sessionToken", sessionToken, {
      httpOnly: true,
      secure: true,
      maxAge: 86400000,
      sameSite: "None",
      path: "/",
    });
    res.json({ username, sessionToken });
  } catch (error) {
    console.error("Google signup error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Signup
app.post("/api/signup", async (req, res) => {
  let { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  username = sanitizeInput(username);
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: "Username must be between 3 and 50 characters" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  try {
    const db = await connectMongo();
    const users = db.collection("users");
    const existingUser = await users.findOne({ Username: username });
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await users.insertOne({ Username: username, Password: hashedPassword, GoogleEmail: null });
    res.status(201).json({ message: "Account created successfully" });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  let { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  username = sanitizeInput(username);
  try {
    const db = await connectMongo();
    const users = db.collection("users");
    const user = await users.findOne({ Username: username });
    if (!user || !user.Password || !(await bcrypt.compare(password, user.Password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const sessionToken = jwt.sign({ username }, process.env.SECRET_KEY, {
      expiresIn: "24h",
    });
    res.cookie("sessionToken", sessionToken, {
      httpOnly: true,
      secure: true,
      maxAge: 86400000,
      sameSite: "None",
      path: "/",
    });
    res.json({ username, sessionToken });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Internal server error" });
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
  let token = req.cookies?.sessionToken;
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY);
    } catch (err) {
      decoded = jwt.decode(token);
      if (!decoded || !decoded.username) {
        return res.status(403).json({ error: "Invalid token" });
      }
    }
    const db = await connectMongo();
    const users = db.collection("users");
    const user = await users.findOne({ Username: decoded.username });
    if (!user) {
      return res.status(403).json({ error: "User not found" });
    }
    const newToken = jwt.sign({ username: decoded.username }, process.env.SECRET_KEY, {
      expiresIn: "24h",
    });
    res.cookie("sessionToken", newToken, {
      httpOnly: true,
      secure: true,
      maxAge: 86400000,
      sameSite: "None",
      path: "/",
    });
    res.json({ username: decoded.username, sessionToken: newToken });
  } catch (error) {
    console.error("Refresh token error:", error.message);
    res.status(403).json({ error: "Invalid token" });
  }
});

// Get Clients
app.get("/api/get-clients", authenticateToken, async (req, res) => {
  try {
    console.log(`Fetching clients for user: ${req.user.username}`);
    const db = await connectMongo();
    const clients = await db.collection(`clients_${req.user.username}`).find({}).toArray();
    const processedClients = clients.map(client => ({
      Client_Name: client.Client_Name || "",
      Email: client.Email || "",
      Type: client.Type || "",
      Amount_To_Be_Paid: parseFloat(client.Monthly_Payment) || 0,
      Phone_Number: client.Phone_Number || "",
    }));
    console.log(`Returning ${processedClients.length} clients`);
    res.json(processedClients);
  } catch (error) {
    console.error("Get clients error:", error.message);
    res.status(500).json({ error: `Failed to fetch clients: ${error.message}` });
  }
});

// Add Client (Modified to create payments for all existing years)
app.post("/api/add-client", authenticateToken, async (req, res) => {
  let { clientName, email, type, monthlyPayment, phoneNumber } = req.body;
  const username = req.user.username;
  const paymentValue = parseFloat(monthlyPayment);
  
  if (clientName.length > 100 || type.length > 50) {
    return res.status(400).json({ error: "Client name or type too long" });
  }
  if (paymentValue > 1e6) {
    return res.status(400).json({ error: "Monthly payment exceeds maximum limit" });
  }
  if (!clientName || !type || !monthlyPayment) {
    return res.status(400).json({ error: "Client name, type, and monthly payment are required" });
  }
  
  clientName = sanitizeInput(clientName);
  type = sanitizeInput(type.trim().toUpperCase());
  email = email ? sanitizeInput(email) : "";
  phoneNumber = phoneNumber ? sanitizeInput(phoneNumber) : "";
  
  if (isNaN(paymentValue) || paymentValue <= 0) {
    return res.status(400).json({ error: "Monthly payment must be a positive number" });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }
  if (phoneNumber && !/^\+?[\d\s-]{10,15}$/.test(phoneNumber)) {
    return res.status(400).json({ error: "Invalid phone number format" });
  }
  
  try {
    const db = await connectMongo();
    const types = await db.collection("types").find({ User: username }).toArray();
    const userTypes = types.map(t => t.Type);
    
    if (!userTypes.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${userTypes.join(", ")}` });
    }
    
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);
    
    const existingClient = await clientsCollection.findOne({ Client_Name: clientName, Type: type });
    if (existingClient) {
      return res.status(400).json({ error: "Client with this name and type already exists" });
    }
    
    // Add client to clients collection
    await clientsCollection.insertOne({
      Client_Name: clientName,
      Email: email,
      Type: type,
      Monthly_Payment: paymentValue,
      Phone_Number: phoneNumber,
    });
    
    // Get all existing years for this user
    const existingYears = await paymentsCollection.distinct("Year");
    
    // If no years exist, default to 2025
    const yearsToCreate = existingYears.length > 0 ? existingYears : [2025];
    
    // Create payment records for all existing years
    const paymentDocs = yearsToCreate.map(year => ({
      Client_Name: clientName,
      Type: type,
      Amount_To_Be_Paid: paymentValue,
      Year: year,
      Payments: {
        January: 0, February: 0, March: 0, April: 0, May: 0, June: 0,
        July: 0, August: 0, September: 0, October: 0, November: 0, December: 0,
      },
      Due_Payment: paymentValue,
    }));
    
    await paymentsCollection.insertMany(paymentDocs);
    
    console.log(`Client added successfully with payment records for years: ${yearsToCreate.join(', ')}`);
    res.status(201).json({ 
      message: "Client added successfully", 
      yearsCreated: yearsToCreate 
    });
  } catch (error) {
    console.error("Add client error:", {
      message: error.message,
      stack: error.stack,
      username,
    });
    res.status(500).json({ error: `Failed to add client: ${error.message}` });
  }
});

// Update Client
app.put("/api/update-client", authenticateToken, async (req, res) => {
  const { oldClient, newClient } = req.body;
  const username = req.user.username;
  if (!oldClient || !newClient || !oldClient.Client_Name || !oldClient.Type || !newClient.Client_Name || !newClient.Type || !newClient.Amount_To_Be_Paid) {
    return res.status(400).json({ error: "All required fields must be provided" });
  }
  let { Client_Name: oldClientName, Type: oldType } = oldClient;
  let { Client_Name, Type, Amount_To_Be_Paid, Email, Phone_Number } = newClient;
  oldClientName = sanitizeInput(oldClientName);
  oldType = sanitizeInput(oldType.trim().toUpperCase());
  Client_Name = sanitizeInput(Client_Name);
  Type = sanitizeInput(Type.trim().toUpperCase());
  Email = Email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Email) ? sanitizeInput(Email) : "";
  Phone_Number = Phone_Number && /^\+?[\d\s-]{10,15}$/.test(Phone_Number) ? sanitizeInput(Phone_Number) : "";
  const paymentValue = parseFloat(Amount_To_Be_Paid);
  if (isNaN(paymentValue) || paymentValue <= 0) {
    return res.status(400).json({ error: "Amount to be paid must be a positive number" });
  }
  if (paymentValue > 1000000) {
    return res.status(400).json({ error: "Amount to be paid exceeds maximum limit of 1,000,000" });
  }
  if (Client_Name.length > 100 || Type.length > 50) {
    return res.status(400).json({ error: "Client name or type too long" });
  }
  try {
    const db = await connectMongo();
    const types = await db.collection("types").find({ User: username }).toArray();
    const userTypes = types.map(t => t.Type);
    if (!userTypes.includes(Type)) {
      return res.status(400).json({ error: `Type must be one of: ${userTypes.join(", ")}` });
    }
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);
    const client = await clientsCollection.findOne({ Client_Name: oldClientName, Type: oldType });
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    await clientsCollection.updateOne(
      { Client_Name: oldClientName, Type: oldType },
      { $set: { Client_Name, Type, Monthly_Payment: paymentValue, Email, Phone_Number } }
    );
    const paymentDocs = await paymentsCollection.find({ Client_Name: oldClientName, Type: oldType }).toArray();
    for (const doc of paymentDocs) {
      const monthlyPayments = doc.Payments;
      const activeMonths = Object.values(monthlyPayments).filter(m => m >= 0).length;
      const expectedPayment = paymentValue * activeMonths;
      const totalPayments = Object.values(monthlyPayments).reduce((sum, m) => sum + (m || 0), 0);
      let currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);
      let prevYearCumulativeDue = 0;
      if (doc.Year > 2025) {
        const prevDoc = await paymentsCollection.findOne({
          Client_Name: oldClientName,
          Type: oldType,
          Year: doc.Year - 1,
        });
        prevYearCumulativeDue = prevDoc?.Due_Payment || 0;
      }
      await paymentsCollection.updateOne(
        { _id: doc._id },
        {
          $set: {
            Client_Name,
            Type,
            Amount_To_Be_Paid: paymentValue,
            Due_Payment: currentYearDuePayment + prevYearCumulativeDue,
          },
        }
      );
    }
    res.json({ message: "Client updated successfully" });
  } catch (error) {
    console.error("Update client error:", {
      message: error.message,
      stack: error.stack,
      oldClient,
      newClient,
      user: username,
    });
    res.status(500).json({ error: `Failed to update client: ${error.message}` });
  }
});

// Delete Client
app.delete("/api/delete-client", authenticateToken, async (req, res) => {
  let { Client_Name, Type } = req.body;
  if (!Client_Name || !Type) {
    return res.status(400).json({ error: "Client name and type are required" });
  }
  Client_Name = sanitizeInput(Client_Name);
  Type = sanitizeInput(Type);
  const username = req.user.username;
  try {
    const db = await connectMongo();
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);
    const client = await clientsCollection.findOne({ Client_Name, Type });
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    await clientsCollection.deleteOne({ Client_Name, Type });
    await paymentsCollection.deleteMany({ Client_Name, Type });
    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    console.error("Delete client error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get Payments by Year
app.get("/api/get-payments-by-year", authenticateToken, async (req, res) => {
  const { year } = req.query;
  if (!year || isNaN(year)) {
    return res.status(400).json({ error: "Valid year is required" });
  }
  const username = req.user.username;
  try {
    const db = await connectMongo();
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);
    const clients = await clientsCollection.find({}).toArray();
    const clientEmailMap = new Map(clients.map(c => [`${c.Client_Name}_${c.Type}`, c.Email || ""]));
    const clientPhoneMap = new Map(clients.map(c => [`${c.Client_Name}_${c.Type}`, c.Phone_Number || ""]));
    let payments = await paymentsCollection.find({ Year: parseInt(year) }).toArray();
    if (parseInt(year) > 2025) {
      const prevYearPayments = await paymentsCollection.find({ Year: parseInt(year) - 1 }).toArray();
      const prevYearDueMap = new Map(prevYearPayments.map(p => [`${p.Client_Name}_${p.Type}`, p.Due_Payment || 0]));
      payments = payments.map(p => ({
        ...p,
        Due_Payment: p.Due_Payment + (prevYearDueMap.get(`${p.Client_Name}_${p.Type}`) || 0),
      }));
    }
    const processedPayments = payments.map(payment => ({
      Client_Name: payment.Client_Name || "",
      Type: payment.Type || "",
      Amount_To_Be_Paid: parseFloat(payment.Amount_To_Be_Paid) || 0,
      january: payment.Payments.January || "",
      february: payment.Payments.February || "",
      march: payment.Payments.March || "",
      april: payment.Payments.April || "",
      may: payment.Payments.May || "",
      june: payment.Payments.June || "",
      july: payment.Payments.July || "",
      august: payment.Payments.August || "",
      september: payment.Payments.September || "",
      october: payment.Payments.October || "",
      november: payment.Payments.November || "",
      december: payment.Payments.December || "",
      Due_Payment: parseFloat(payment.Due_Payment) || 0,
      Email: clientEmailMap.get(`${payment.Client_Name}_${payment.Type}`) || "",
      Phone_Number: clientPhoneMap.get(`${payment.Client_Name}_${payment.Type}`) || "",
    }));
    console.log(`Fetched ${processedPayments.length} payments for ${year} for user ${username}`);
    res.json(processedPayments);
  } catch (error) {
    console.error(`Get payments for year ${year} error:`, {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: `Failed to fetch payments for year ${year}: ${error.message}` });
  }
});

// Save Payment
app.post("/api/save-payment", authenticateToken, paymentLimiter, async (req, res) => {
  const { clientName, type, month, value } = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  const username = req.user.username;
  console.log("Save payment request:", { clientName, type, month, value, year, user: username });
  if (!clientName || !type || !month) {
    console.error("Missing required fields:", { clientName, type, month });
    return res.status(400).json({ error: "Client name, type, and month are required" });
  }
  const numericValue = value !== "" && value !== null && value !== undefined ? parseFloat(value) : null;
  if (numericValue !== null && (isNaN(numericValue) || numericValue < 0)) {
    console.error("Invalid payment value:", value);
    return res.status(400).json({ error: "Invalid payment value" });
  }
  try {
    const monthMap = {
      january: "January", february: "February", march: "March", april: "April", may: "May",
      june: "June", july: "July", august: "August", september: "September", october: "October",
      november: "November", december: "December",
    };
    const monthKey = monthMap[month.toLowerCase()];
    if (!monthKey) {
      console.error("Invalid month:", month);
      return res.status(400).json({ error: "Invalid month" });
    }
    const db = await connectMongo();
    const paymentsCollection = db.collection(`payments_${username}`);
    const payment = await paymentsCollection.findOne({ Client_Name: clientName, Type: type, Year: parseInt(year) });
    if (!payment) {
      console.error("Payment record not found:", { user: username, clientName, type, year });
      return res.status(404).json({ error: "Payment record not found" });
    }
    const updatedPayments = { ...payment.Payments, [monthKey]: numericValue || 0 };
    const activeMonths = Object.values(updatedPayments).filter(m => m >= 0).length;
    const expectedPayment = payment.Amount_To_Be_Paid * activeMonths;
    const totalPayments = Object.values(updatedPayments).reduce((sum, m) => sum + (m || 0), 0);
    let currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);
    let prevYearCumulativeDue = 0;
    if (parseInt(year) > 2025) {
      const prevPayment = await paymentsCollection.findOne({
        Client_Name: clientName,
        Type: type,
        Year: parseInt(year) - 1,
      });
      prevYearCumulativeDue = prevPayment?.Due_Payment || 0;
    }
    await paymentsCollection.updateOne(
      { Client_Name: clientName, Type: type, Year: parseInt(year) },
      { $set: { Payments: updatedPayments, Due_Payment: currentYearDuePayment + prevYearCumulativeDue } }
    );
    const updatedPayment = await paymentsCollection.findOne({ Client_Name: clientName, Type: type, Year: parseInt(year) });
    const updatedRow = {
      Client_Name: updatedPayment.Client_Name,
      Type: updatedPayment.Type,
      Amount_To_Be_Paid: parseFloat(updatedPayment.Amount_To_Be_Paid) || 0,
      january: updatedPayment.Payments.January || "",
      february: updatedPayment.Payments.February || "",
      march: updatedPayment.Payments.March || "",
      april: updatedPayment.Payments.April || "",
      may: updatedPayment.Payments.May || "",
      june: updatedPayment.Payments.June || "",
      july: updatedPayment.Payments.July || "",
      august: updatedPayment.Payments.August || "",
      september: updatedPayment.Payments.September || "",
      october: updatedPayment.Payments.October || "",
      november: updatedPayment.Payments.November || "",
      december: updatedPayment.Payments.December || "",
      Due_Payment: parseFloat(updatedPayment.Due_Payment) || 0,
    };
    console.log("Payment updated successfully for:", clientName, month, value);
    res.json({ message: "Payment updated successfully", updatedRow });
  } catch (error) {
    console.error("Save payment error:", {
      message: error.message,
      stack: error.stack,
      clientName,
      type,
      month,
      year,
      user: username,
    });
    res.status(500).json({ error: `Failed to save payment: ${error.message}` });
  }
});

// Batch Save Payments
app.post("/api/batch-save-payments", authenticateToken, paymentLimiter, async (req, res) => {
  const { clientName, type, updates } = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  const username = req.user.username;
  console.log("Batch save payment request:", { clientName, type, updates, year, user: username });
  if (!clientName || !type || !Array.isArray(updates) || updates.length === 0) {
    console.error("Missing required fields:", { clientName, type, updates });
    return res.status(400).json({ error: "Client name, type, and non-empty updates array are required" });
  }
  const monthMap = {
    january: "January", february: "February", march: "March", april: "April", may: "May",
    june: "June", july: "July", august: "August", september: "September", october: "October",
    november: "November", december: "December",
  };
  for (const { month, value } of updates) {
    if (!month || !monthMap[month.toLowerCase()]) {
      console.error("Invalid month:", month);
      return res.status(400).json({ error: `Invalid month: ${month}` });
    }
    const numericValue = value !== "" && value !== null && value !== undefined ? parseFloat(value) : null;
    if (numericValue !== null && (isNaN(numericValue) || numericValue < 0)) {
      console.error("Invalid payment value:", value);
      return res.status(400).json({ error: `Invalid payment value for ${month}` });
    }
  }
  try {
    const db = await connectMongo();
    const paymentsCollection = db.collection(`payments_${username}`);
    const payment = await paymentsCollection.findOne({ Client_Name: clientName, Type: type, Year: parseInt(year) });
    if (!payment) {
      console.error("Payment record not found:", { user: username, clientName, type, year });
      return res.status(404).json({ error: "Payment record not found" });
    }
    const updatedPayments = { ...payment.Payments };
    updates.forEach(({ month, value }) => {
      updatedPayments[monthMap[month.toLowerCase()]] = value !== "" && value !== null && value !== undefined ? parseFloat(value) : 0;
    });
    const activeMonths = Object.values(updatedPayments).filter(m => m >= 0).length;
    const expectedPayment = payment.Amount_To_Be_Paid * activeMonths;
    const totalPayments = Object.values(updatedPayments).reduce((sum, m) => sum + (m || 0), 0);
    let currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);
    let prevYearCumulativeDue = 0;
    if (parseInt(year) > 2025) {
      const prevPayment = await paymentsCollection.findOne({
        Client_Name: clientName,
        Type: type,
        Year: parseInt(year) - 1,
      });
      prevYearCumulativeDue = prevPayment?.Due_Payment || 0;
    }
    await paymentsCollection.updateOne(
      { Client_Name: clientName, Type: type, Year: parseInt(year) },
      { $set: { Payments: updatedPayments, Due_Payment: currentYearDuePayment + prevYearCumulativeDue } }
    );
    const updatedPayment = await paymentsCollection.findOne({ Client_Name: clientName, Type: type, Year: parseInt(year) });
    const updatedRow = {
      Client_Name: updatedPayment.Client_Name,
      Type: updatedPayment.Type,
      Amount_To_Be_Paid: parseFloat(updatedPayment.Amount_To_Be_Paid) || 0,
      january: updatedPayment.Payments.January || "",
      february: updatedPayment.Payments.February || "",
      march: updatedPayment.Payments.March || "",
      april: updatedPayment.Payments.April || "",
      may: updatedPayment.Payments.May || "",
      june: updatedPayment.Payments.June || "",
      july: updatedPayment.Payments.July || "",
      august: updatedPayment.Payments.August || "",
      september: updatedPayment.Payments.September || "",
      october: updatedPayment.Payments.October || "",
      november: updatedPayment.Payments.November || "",
      december: updatedPayment.Payments.December || "",
      Due_Payment: parseFloat(updatedPayment.Due_Payment) || 0,
    };
    console.log("Batch payment updated successfully for:", clientName, updates);
    res.json({ message: "Batch payment updated successfully", updatedRow });
  } catch (error) {
    console.error("Batch save payment error:", {
      message: error.message,
      stack: error.stack,
      clientName,
      type,
      updates,
      year,
      user: username,
    });
    res.status(500).json({ error: `Failed to save batch payments: ${error.message}` });
  }
});

// Simply duplicate the handler for uppercase route
app.post("/api/BATCH-SAVE-PAYMENTS", authenticateToken, paymentLimiter, async (req, res) => {
  return app._router.handle({ ...req, url: "/api/batch-save-payments" }, res);
});

// Get User Years
app.get("/api/get-user-years", authenticateToken, async (req, res) => {
  try {
    const db = await connectMongo();
    const paymentsCollection = db.collection(`payments_${req.user.username}`);
    const years = await paymentsCollection.distinct("Year");
    const validYears = years.filter(y => y >= 2025).sort((a, b) => a - b);
    if (!validYears.includes(2025)) {
      validYears.push(2025);
    }
    res.json(validYears);
  } catch (error) {
    console.error("Get user years error:", error.message);
    res.json([2025]);
  }
});

// Add New Year
app.post("/api/add-new-year", authenticateToken, async (req, res) => {
  const { year } = req.body;
  const username = req.user.username;
  if (!year || isNaN(year) || parseInt(year) <= 2025) {
    console.error(`Invalid year provided: ${year}, user: ${username}`);
    return res.status(400).json({ error: "Valid year > 2025 is required" });
  }
  try {
    const db = await connectMongo();
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);
    const clients = await clientsCollection.find({}).toArray();
    if (!clients || clients.length === 0) {
      console.error(`No clients found for user ${username}`);
      return res.status(400).json({ error: `No clients found for user ${username}` });
    }
    const existingPayments = await paymentsCollection.find({ Year: parseInt(year) }).toArray();
    if (existingPayments.length > 0) {
      await paymentsCollection.deleteMany({ Year: parseInt(year) });
      console.log(`Deleted ${existingPayments.length} existing payments for year ${year}`);
    }
    const paymentDocs = clients.map(client => ({
      Client_Name: client.Client_Name || "",
      Type: client.Type || "",
      Amount_To_Be_Paid: parseFloat(client.Monthly_Payment) || 0,
      Year: parseInt(year),
      Payments: {
        January: 0, February: 0, March: 0, April: 0, May: 0, June: 0,
        July: 0, August: 0, September: 0, October: 0, November: 0, December: 0,
      },
      Due_Payment: parseFloat(client.Monthly_Payment) || 0,
    }));
    await paymentsCollection.insertMany(paymentDocs);
    console.log(`Successfully added ${paymentDocs.length} clients for year ${year} for user ${username}`);
    res.json({ message: `Year ${year} added successfully with ${paymentDocs.length} clients` });
  } catch (error) {
    console.error(`Error adding new year ${year} for user ${username}:`, {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: `Failed to add new year: ${error.message}` });
  }
});

// Import CSV
app.post("/api/import-csv", authenticateToken, async (req, res) => {
  const csvData = req.body;
  const username = req.user.username;
  console.log(`Importing CSV for user: ${username}, records: ${csvData?.length || 0}`);

  // Validate input
  if (!Array.isArray(csvData) || csvData.length === 0) {
    console.error("Invalid CSV data: not an array or empty", { csvData, username });
    return res.status(400).json({ error: "CSV data must be a non-empty array of records" });
  }

  // Sanitize input function
  const sanitizeInput = (input) => {
    if (typeof input !== 'string') return '';
    return input.trim().replace(/[<>]/g, '');
  };

  try {
    const db = await connectMongo();
    const typesCollection = db.collection("types");
    const clientsCollection = db.collection(`clients_${username}`);
    const paymentsCollection = db.collection(`payments_${username}`);

    // Fetch user types
    const userTypesData = await typesCollection.find({ User: username }).toArray();
    const userTypes = userTypesData.map(t => t.Type.toUpperCase());
    if (!userTypes.length) {
      console.error("No types found for user", { username });
      return res.status(400).json({ 
        error: `No payment types defined for user ${username}. Please navigate to the dashboard and click 'Add Type' to add types (e.g., GST, IT RETURN) before importing.` 
      });
    }
    console.log("Available user types:", userTypes);

    // Get all existing years for this user
    const existingYears = await paymentsCollection.distinct("Year");
    const yearsToCreate = existingYears.length > 0 ? existingYears : [2025];
    console.log(`Will create payment records for years: ${yearsToCreate.join(', ')}`);

    // Validate and map records
    const clientsBatch = [];
    const paymentsBatch = [];
    const errors = [];
    
    for (let i = 0; i < csvData.length; i++) {
      const record = csvData[i];
      console.log(`Validating record ${i + 1}/${csvData.length}`, { record });

      if (!Array.isArray(record) || record.length < 4) {
        errors.push(`Record at index ${i} must be an array with at least Amount, Type, Email, and Client_Name`);
        continue;
      }

      const [amountToBePaid, type, email = "", clientName, phoneNumber = ""] = record;

      // Validate Client_Name
      if (typeof clientName !== "string" || clientName.length > 100 || !clientName.trim()) {
        errors.push(`Client_Name at index ${i} must be a non-empty string with up to 100 characters`);
        continue;
      }

      // Validate Type
      if (typeof type !== "string" || !type.trim()) {
        errors.push(`Type at index ${i} must be a non-empty string`);
        continue;
      }

      const typeUpper = type.trim().toUpperCase();
      if (!userTypes.includes(typeUpper)) {
        errors.push(`Type "${type}" at index ${i} must be one of: ${userTypes.join(", ")}`);
        continue;
      }

      // Validate Amount_To_Be_Paid
      const amount = parseFloat(amountToBePaid);
      if (isNaN(amount) || amount <= 0 || amount > 1e6) {
        errors.push(`Amount_To_Be_Paid at index ${i} must be a positive number up to 1,000,000`);
        continue;
      }

      // Validate optional fields
      let sanitizedEmail = "";
      if (email && typeof email === "string") {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          sanitizedEmail = sanitizeInput(email);
        }
      }

      let sanitizedPhoneNumber = "";
      if (phoneNumber && typeof phoneNumber === "string") {
        if (/^\+?[\d\s-]{10,15}$/.test(phoneNumber)) {
          sanitizedPhoneNumber = sanitizeInput(phoneNumber);
        }
      }

      // Add to clients batch
      const sanitizedClientName = sanitizeInput(clientName);
      clientsBatch.push({
        Client_Name: sanitizedClientName,
        Type: typeUpper,
        Email: sanitizedEmail,
        Monthly_Payment: amount,
        Phone_Number: sanitizedPhoneNumber,
      });

      // Create payment records for all existing years
      const clientPaymentDocs = yearsToCreate.map(year => ({
        Client_Name: sanitizedClientName,
        Type: typeUpper,
        Amount_To_Be_Paid: amount,
        Year: year,
        Payments: {
          January: 0, February: 0, March: 0, April: 0, May: 0, June: 0,
          July: 0, August: 0, September: 0, October: 0, November: 0, December: 0,
        },
        Due_Payment: amount,
      }));

      // Add all payment documents for this client to the batch
      paymentsBatch.push(...clientPaymentDocs);
    }

    if (clientsBatch.length === 0) {
      console.error("No valid records to import", { username, errors });
      return res.status(400).json({
        error: "No valid records found in CSV",
        errors,
      });
    }

    console.log(`Prepared ${clientsBatch.length} clients and ${paymentsBatch.length} payments for import across ${yearsToCreate.length} years`, { username });

    // Insert batches
    try {
      // Check for duplicates
      const existingClients = await clientsCollection.find({
        $or: clientsBatch.map(c => ({ Client_Name: c.Client_Name, Type: c.Type })),
      }).toArray();

      if (existingClients.length > 0) {
        const duplicates = existingClients.map(c => ({ Client_Name: c.Client_Name, Type: c.Type }));
        console.error("Duplicate clients found", { duplicates, username });
        errors.push(`Duplicate clients found: ${JSON.stringify(duplicates)}`);
      }

      // Insert valid clients
      let insertedClients = 0;
      if (clientsBatch.length > 0) {
        const result = await clientsCollection.insertMany(clientsBatch, { ordered: false });
        insertedClients = result.insertedCount;
        console.log(`Inserted ${insertedClients} clients for user ${username}`);
      }

      // Insert valid payments
      let insertedPayments = 0;
      if (paymentsBatch.length > 0) {
        const result = await paymentsCollection.insertMany(paymentsBatch, { ordered: false });
        insertedPayments = result.insertedCount;
        console.log(`Inserted ${insertedPayments} payments across years ${yearsToCreate.join(', ')} for user ${username}`);
      }

      // Return response
      const response = {
        message: `Imported ${insertedClients} clients and ${insertedPayments} payments successfully across ${yearsToCreate.length} years (${yearsToCreate.join(', ')})`,
        imported: insertedClients,
        yearsCreated: yearsToCreate,
        paymentRecordsCreated: insertedPayments,
        errors: errors.length > 0 ? errors : undefined,
      };
      console.log("Import response:", response);
      return res.status(200).json(response);

    } catch (dbError) {
      console.error("Database operation failed", {
        error: dbError.message,
        code: dbError.code,
        details: dbError.writeErrors || dbError.result || dbError,
        username,
      });
      if (dbError.code === 11000) {
        errors.push(`Duplicate key error: some clients already exist: ${dbError.message}`);
        return res.status(400).json({
          error: "Import partially failed due to duplicate clients",
          errors,
        });
      }
      return res.status(500).json({
        error: "Database operation failed",
        errors: [...errors, dbError.message],
      });
    }

  } catch (error) {
    console.error("Import CSV error:", {
      message: error.message,
      stack: error.stack,
      user: username,
      csvDataSummary: csvData.slice(0, 2).map(r => Array.isArray(r) ? { record: r } : r),
    });
    return res.status(500).json({ error: `Failed to import CSV: ${error.message}`, errors });
  }
});

// Debug Collections
app.get("/api/debug-sheets", authenticateToken, async (req, res) => {
  try {
    const db = await connectMongo();
    const collections = await db.listCollections().toArray();
    const paymentsCollection = collections.find(c => c.name === `payments_${req.user.username}`);
    const result = {
      database: "payment_tracker",
      availableCollections: collections.map(c => c.name),
      paymentsExists: !!paymentsCollection,
      user: req.user.username,
      timestamp: new Date().toISOString(),
    };
    if (paymentsCollection) {
      const testRead = await db.collection(`payments_${req.user.username}`).find({ Year: 2025 }).limit(2).toArray();
      result.testReadSuccess = true;
      result.testReadRows = testRead.length;
    }
    res.json(result);
  } catch (error) {
    console.error("Debug collections error:", error.message);
    res.status(500).json({ error: "Debug failed", message: error.message });
  }
});

// Debug Routes
app.get("/api/debug-routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach(r => {
    if (r.route && r.route.path) {
      routes.push({
        method: Object.keys(r.route.methods)[0].toUpperCase(),
        path: r.route.path,
      });
    }
  });
  res.json({
    message: "Available API routes",
    routes: routes.filter(r => r.path.startsWith("/api")),
    timestamp: new Date().toISOString(),
  });
});

// Add Type
app.post("/api/add-type", authenticateToken, async (req, res) => {
  let { type } = req.body;
  const username = req.user.username;
  if (!type) {
    console.error("No type provided");
    return res.status(400).json({ error: "Type is required" });
  }
  type = sanitizeInput(type.trim().toUpperCase());
  if (type.length < 1 || type.length > 50) {
    console.error("Invalid type length:", type.length);
    return res.status(400).json({ error: "Type must be between 1 and 50 characters" });
  }
  try {
    const db = await connectMongo();
    const typesCollection = db.collection("types");
    // Case-insensitive check for existing type
    const existingType = await typesCollection.findOne({
      Type: { $regex: `^${type}$`, $options: "i" },
      User: username,
    });
    if (existingType) {
      console.warn(`Type already exists for user: ${type}, ${username}`);
      return res.status(400).json({ error: `Type "${type}" already exists for this user` });
    }
    await typesCollection.insertOne({ Type: type, User: username });
    console.log(`Type ${type} added successfully for user ${username}`);
    return res.status(201).json({ message: "Type added successfully" });
  } catch (error) {
    console.error("Add type error:", {
      message: error.message,
      stack: error.stack,
      inputType: type,
      username,
    });
    return res.status(500).json({ error: `Failed to add type: ${error.message}` });
  }
});

// Get Types
app.get("/api/get-types", authenticateToken, async (req, res) => {
  const username = req.user.username;
  try {
    const db = await connectMongo();
    const types = await db.collection("types").find({ User: username }).toArray();
    const processedTypes = types.map(t => t.Type).filter(Boolean);
    console.log(`Fetched ${processedTypes.length} types for user ${username}`);
    res.json(processedTypes);
  } catch (error) {
    console.error("Get types error:", {
      message: error.message,
      stack: error.stack,
      username,
    });
    res.status(500).json({ error: `Failed to fetch types: ${error.message}` });
  }
});

// Test SMTP
app.get("/api/test-smtp", async (req, res) => {
  try {
    await transporter.verify();
    console.log("SMTP server is ready");
    res.json({ message: "SMTP server is ready" });
  } catch (error) {
    console.error("SMTP verification failed:", error);
    res.status(500).json({ error: `SMTP verification failed: ${error.message}` });
  }
});

// Send Email
app.post("/api/send-email", authenticateToken, async (req, res) => {
  const { to, subject, html } = req.body;
  if (!to || !subject || !html) {
    console.error("Missing required fields for email:", {
      to,
      subject,
      htmlProvided: !!html,
      user: req.user?.username || "unknown",
    });
    return res.status(400).json({ error: "Recipient email, subject, and HTML content are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error("Invalid email address:", { to, user: req.user?.username || "unknown" });
    return res.status(400).json({ error: "Invalid recipient email address" });
  }

  // Verify environment variables
  if (!process.env.EMAIL_FROM) {
    console.error("Missing EMAIL_FROM environment variable", {
      user: req.user?.username || "unknown",
    });
    return res.status(500).json({ error: "Server configuration error: Missing email sender address" });
  }

  try {
    const sanitizedHtml = sanitizeInput(html);
    if (!sanitizedHtml.trim()) {
      console.error("Sanitized HTML is empty:", {
        originalHtmlLength: html.length,
        user: req.user?.username || "unknown",
      });
      return res.status(400).json({ error: "HTML content is invalid or empty after sanitization" });
    }

    console.log("Attempting to send email:", {
      to,
      subject,
      htmlLength: sanitizedHtml.length,
      from: process.env.EMAIL_FROM,
      user: req.user?.username || "unknown",
    });

    const info = await transporter.sendMail({
      from: `"Payment Tracker" <${process.env.EMAIL_FROM}>`,
      to: to.trim(),
      subject,
      html: sanitizedHtml,
    });

    console.log("Email sent successfully:", {
      to,
      messageId: info.messageId,
      response: info.response,
      user: req.user?.username || "unknown",
    });
    return res.json({ message: "Email sent successfully", messageId: info.messageId });
  } catch (error) {
    console.error("Send email error:", {
      message: error.message,
      code: error.code,
      details: JSON.stringify(error.response || error, null, 2),
      to,
      user: req.user?.username || "unknown",
    });
    return res.status(500).json({ error: `Failed to send email: ${error.message}` });
  }
});

app.post("/api/verify-whatsapp-contact", authenticateToken, async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\+?[\d\s-]{10,15}$/.test(phone)) {
    console.error("Invalid phone number for verification:", {
      phone,
      user: req.user?.username || "unknown",
    });
    return res.status(400).json({ error: "Invalid phone number" });
  }

  // Verify environment variables
  if (!process.env.ULTRAMSG_TOKEN || !process.env.ULTRAMSG_INSTANCE_ID) {
    console.error("Missing UltraMsg environment variables:", {
      token: process.env.ULTRAMSG_TOKEN ? "Set" : "Missing",
      instanceId: process.env.ULTRAMSG_INSTANCE_ID ? "Set" : "Missing",
      user: req.user?.username || "unknown",
    });
    return res.status(500).json({ error: "Server configuration error: Missing WhatsApp API credentials" });
  }

  try {
    let formattedPhone = phone.trim().replace(/[\s-]/g, "");
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = `+91${formattedPhone.replace(/\D/g, "")}`;
    }
    const chatId = `${formattedPhone}@c.us`;
    const payload = {
      token: process.env.ULTRAMSG_TOKEN,
      chatId,
    };

    console.log("Attempting UltraMsg contact check:", {
      phone: formattedPhone,
      chatId,
      user: req.user?.username || "unknown",
    });

    const response = await axios.get(
      `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE_ID}/contacts/check`,
      {
        params: payload,
        timeout: 5000,
      }
    );

    console.log("UltraMsg contact check response:", {
      phone: formattedPhone,
      status: response.status,
      data: response.data,
      user: req.user?.username || "unknown",
    });

    const isValidWhatsApp = response.data.status === "valid";
    return res.json({ isValidWhatsApp });
  } catch (error) {
    console.error("Verify WhatsApp contact error:", {
      message: error.message,
      code: error.response?.data?.error?.code || error.code,
      details: JSON.stringify(error.response?.data || error, null, 2),
      phone,
      user: req.user?.username || "unknown",
    });

    if (error.response?.status === 429) {
      return res.status(429).json({ error: "Rate limit exceeded for WhatsApp API. Please try again later." });
    }
    if (error.response?.data?.error?.code === 1006) {
      return res.status(400).json({ error: "Phone number is not registered with WhatsApp", isValidWhatsApp: false });
    }
    return res.status(500).json({ error: `Failed to verify WhatsApp contact: ${error.message}` });
  }
});

// Send WhatsApp
app.post("/api/send-whatsapp", authenticateToken, whatsappLimiter, async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) {
    console.error("Missing required fields:", { to, message, user: req.user.username });
    return res.status(400).json({ error: "Recipient phone number and message are required" });
  }
  if (!/^\+?[\d\s-]{10,15}$/.test(to)) {
    console.error("Invalid phone number:", { to, user: req.user.username });
    return res.status(400).json({ error: "Invalid recipient phone number" });
  }
  try {
    let formattedPhone = to.trim().replace(/[\s-]/g, "");
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = `+91${formattedPhone.replace(/\D/g, "")}`;
    }
    const payload = {
      token: process.env.ULTRAMSG_TOKEN,
      to: formattedPhone,
      body: message,
    };
    const response = await retryWithBackoff(() =>
      axios.post(
        `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE_ID}/messages/chat`,
        new URLSearchParams(payload).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000, // Added timeout to prevent hanging
        }
      )
    );
    // Log the full response for debugging
    console.log("UltraMsg API response:", {
      to: formattedPhone,
      status: response.status,
      data: response.data,
      user: req.user.username,
    });
    // Check for successful message delivery more flexibly
    if (response.status === 200 && (response.data.status === "success" || response.data.sent === "true" || response.data.messageId)) {
      console.log(`WhatsApp message sent successfully to ${formattedPhone}:`, {
        messageId: response.data.messageId || "N/A",
        status: response.data.status || response.status,
        user: req.user.username,
      });
      return res.json({ message: "WhatsApp message sent successfully", messageId: response.data.messageId || "N/A" });
    } else {
      console.error("UltraMsg API unexpected response:", {
        response: response.data,
        to: formattedPhone,
        user: req.user.username,
      });
      return res.status(500).json({ error: `Unexpected response from WhatsApp API: ${JSON.stringify(response.data)}` });
    }
  } catch (error) {
    console.error("Send WhatsApp error:", {
      message: error.message,
      code: error.response?.data?.error?.code || error.code,
      details: error.response?.data || error,
      to,
      user: req.user.username,
    });
    // Handle specific UltraMsg errors
    if (error.response?.status === 429) {
      return res.status(429).json({ error: "Rate limit exceeded for WhatsApp API. Please try again later." });
    }
    return res.status(500).json({ error: `Failed to send WhatsApp message: ${error.message}` });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");
    console.log(`Server running on port ${PORT}`);
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }
});