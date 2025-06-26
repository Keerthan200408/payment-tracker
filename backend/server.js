const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { google } = require("googleapis");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sanitizeHtml = require("sanitize-html");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");
const axios = require('axios');

require("dotenv").config();

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.set("trust proxy", 1); // Trust the first proxy (Render)


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

// Add this middleware BEFORE your routes
app.use((req, res, next) => {
  // Remove or relax COOP policy for Google Sign-in
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  // OR try this alternative:
  // res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  
  // Also set these for compatibility
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to 500
  standardHeaders: true,
  legacyHeaders: false,
});
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Allow 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});

const retryWithBackoff = async (fn, retries = 3, delay = 500) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429 && i < retries - 1) {
        console.log(`Rate limit hit, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
};

app.use(globalLimiter);
app.use("/api/save-payment", paymentLimiter);

// Cookie parser
app.use(cookieParser());

// Parse JSON
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


// Verify transporter on server start
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

// Google Sheets setup
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const spreadsheetId = process.env.SHEET_ID;

// Helper to get year-specific sheet name
const getPaymentSheetName = (username, year) => `Payments_${username}_${year}`;
const getClientSheetName = (username) => `Clients_${username}`;

// Helper: Delay function for retry logic
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureSheet(sheetName, headers, username = null, year = null) {
  const sheets = google.sheets({ version: "v4", auth });
  try {
    const actualSheetName = username && year ? getPaymentSheetName(username, year) : username ? getClientSheetName(username) : sheetName;
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets.some(
      (sheet) => sheet.properties.title === actualSheetName
    );
    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: actualSheetName } } }],
        },
      });
      const sheetHeaders = sheetName === "Clients"
        ? ["Client_Name", "Email", "Type", "Monthly_Payment", "Phone_Number"]
        : sheetName === "Types"
        ? ["Type", "User"]
        : sheetName === "Users"
        ? ["Username", "Password", "GoogleEmail"]
        : headers;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${actualSheetName}!A1`,
        valueInputOption: "RAW",
        resource: { values: [sheetHeaders] },
      });
    } else if (sheetName === "Users") {
      const existingHeaders = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:C1`,
      });
      if (!existingHeaders.data.values[0].includes("GoogleEmail")) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: "RAW",
          resource: { values: [["Username", "Password", "GoogleEmail"]] },
        });
      }
    } else if (sheetName === "Types") {
      const existingHeaders = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:B1`,
      });
      if (!existingHeaders.data.values || existingHeaders.data.values[0][1] !== "User") {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1:B1`,
          valueInputOption: "RAW",
          resource: { values: [["Type", "User"]] },
        });
      }
    }
  } catch (error) {
    console.error(`Error ensuring sheet ${actualSheetName}:`, error.message);
    throw error;
  }
}

// Helper: Ensure sheet exists with headers
async function ensureTypesSheet() {
  const sheets = google.sheets({ version: "v4", auth });
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets.some(
      (sheet) => sheet.properties.title === "Types"
    );
    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: "Types" } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Types!A1:B1",
        valueInputOption: "RAW",
        resource: { values: [["Type", "User"]] },
      });
    } else {
      // Ensure headers include User column
      const existingHeaders = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "Types!A1:B1",
      });
      if (!existingHeaders.data.values || existingHeaders.data.values[0][1] !== "User") {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: "Types!A1:B1",
          valueInputOption: "RAW",
          resource: { values: [["Type", "User"]] },
        });
      }
    }
  } catch (error) {
    console.error("Error ensuring Types sheet:", error.message);
    throw error;
  }
}

// Helper: Read data from sheet
async function readSheet(sheetNames, range) {
  const sheets = google.sheets({ version: "v4", auth });
  try {
    const ranges = Array.isArray(sheetNames)
      ? sheetNames.map((sheet) => `${sheet}!${range}`)
      : [`${sheetNames}!${range}`];
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });
    return Array.isArray(sheetNames)
      ? response.data.valueRanges.map((vr) => vr.values || [])
      : response.data.valueRanges[0].values || [];
  } catch (error) {
    console.error(`Error reading sheet(s) ${sheetNames} range ${range}:`, {
      message: error.message,
      code: error.code,
      details: error.errors,
    });
    throw new Error(`Failed to read sheet(s) ${sheetNames}`);
  }
}

// Helper: Append data to sheet
async function appendSheet(sheetName, values) {
  const sheets = google.sheets({ version: "v4", auth });
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: sheetName,
        valueInputOption: "RAW",
        resource: { values },
      });
      console.log(`Successfully appended ${values.length} rows to ${sheetName}`);
      return;
    } catch (error) {
      if (error.status === 429 && retryCount < maxRetries) {
        const delayMs = Math.pow(2, retryCount) * 1000;
        console.log(`Rate limit exceeded for ${sheetName}, retrying after ${delayMs}ms...`);
        await delay(delayMs);
        retryCount++;
      } else {
        console.error(`Error appending to sheet ${sheetName}:`, {
          message: error.message,
          code: error.code,
          details: error.errors,
        });
        throw new Error(`Failed to append to sheet ${sheetName}`);
      }
    }
  }
}

// Helper: Write data to sheet
async function writeSheet(sheetName, range, values) {
  const sheets = google.sheets({ version: "v4", auth });
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${range}`,
        valueInputOption: "RAW",
        resource: { values },
      });
      console.log(`Successfully wrote to ${sheetName} range ${range}`);
      return;
    } catch (error) {
      if (error.status === 429 && retryCount < maxRetries) {
        const delayMs = Math.pow(2, retryCount) * 1000;
        console.log(`Rate limit exceeded for ${sheetName}, retrying after ${delayMs}ms...`);
        await delay(delayMs);
        retryCount++;
      } else {
        console.error(`Error writing to sheet ${sheetName}:`, {
          message: error.message,
          code: error.code,
          details: error.errors,
        });
        throw new Error(`Failed to write to sheet ${sheetName}`);
      }
    }
  }
}

// Helper: Update specific range in sheet
async function updateSheet(range, values) {
  const sheets = google.sheets({ version: "v4", auth });
  const maxRetries = 5;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      console.log(`Updating range ${range} with values:`, values);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        resource: { values },
      });
      console.log(`Successfully updated range ${range}`);
      return;
    } catch (error) {
      if (error.status === 429 && retryCount < maxRetries) {
        const delayMs = Math.pow(2, retryCount) * 1000 + Math.random() * 100;
        console.log(`Rate limit exceeded for ${range}, retrying after ${delayMs}ms...`);
        await delay(delayMs);
        retryCount++;
      } else {
        console.error(`Error updating range ${range}:`, {
          message: error.message,
          code: error.code,
          details: error.errors,
          values,
        });
        throw new Error(`Failed to update range ${range}: ${error.message}`);
      }
    }
  }
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
      "color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
      "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
      "font-size": [/^\d+(?:px|em|rem|%)$/],
      "font-family": [/^[\w\s,'"-]+$/],
      "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
      "padding": [/^\d+(?:px|em|rem)$/],
      "margin": [/^\d+(?:px|em|rem)$/],
      "border": [/^\d+px\s+(solid|dashed|dotted)\s+#(0x)?[0-9a-f]+$/i],
    },
  },
};

function sanitizeInput(input) {
  return sanitizeHtml(input, sanitizeOptions);
}

// Google Sign-In endpoint
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

    await ensureSheet("Users", ["Username", "Password", "GoogleEmail"]);
    const users = await readSheet("Users", "A2:C");

    const user = users.find((u) => u[2] === email || u[0] === email);
    if (user) {
      const username = user[0];
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

// Google Signup endpoint
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
    await ensureSheet("Users", ["Username", "Password", "GoogleEmail"]);
    const users = await readSheet("Users", "A2:C");
    if (users.some((u) => u[0] === username)) {
      return res.status(400).json({ error: "Username already exists" });
    }
    if (users.some((u) => u[2] === email)) {
      return res.status(400).json({ error: "Google account already linked" });
    }
    await appendSheet("Users", [[username, null, email]]);
    // Create user-specific sheets
    await ensureSheet("Clients", ["Client_Name", "Email", "Type", "Monthly_Payment", "Phone_Number"], username);
    await ensureSheet(
      "Payments",
      [
        "Client_Name",
        "Type",
        "Amount_To_Be_Paid",
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
        "Due_Payment",
      ],
      username,
      new Date().getFullYear().toString()
    );
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

// Batch writes for multiple updates
async function batchUpdateSheet(sheetName, updates) {
  const sheets = google.sheets({ version: "v4", auth });
  const batchSize = 50;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const requests = batch.map(({ range, values }) => ({
      updateCells: {
        range,
        values,
        fields: "*",
      },
    }));
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
      console.log(`Batch updated ${batch.length} rows in ${sheetName}`);
    } catch (error) {
      console.error(`Batch update error in ${sheetName}:`, error.message);
      throw error;
    }
    await delay(100); // Prevent rate limiting
  }
}

// Helper: Calculate total due payment across years
async function calculateTotalDuePayment(username, clientName, type) {
  const sheets = google.sheets({ version: "v4", auth });
  let totalDue = 0;
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const paymentSheets = spreadsheet.data.sheets
      .filter((sheet) => sheet.properties.title.startsWith("Payments_"))
      .map((sheet) => sheet.properties.title);

    for (const sheetName of paymentSheets) {
      const payments = await readSheet(sheetName, "A2:R");
      const payment = payments.find(
        (p) => p[0] === username && p[1] === clientName && p[2] === type
      );
      if (payment && payment[16]) {
        totalDue += parseFloat(payment[16]) || 0;
      }
    }
  } catch (error) {
    console.error("Error calculating total due payment:", error.message);
  }
  return totalDue;
}

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
    await ensureSheet("Users", ["Username", "Password", "GoogleEmail"]);
    const users = await readSheet("Users", "A2:C");
    if (users.some((user) => user[0] === username)) {
      return res.status(400).json({ error: "Username already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await appendSheet("Users", [[username, hashedPassword, null]]);
    // Create user-specific sheets
    await ensureSheet("Clients", ["Client_Name", "Email", "Type", "Monthly_Payment", "Phone_Number"], username);
    await ensureSheet(
      "Payments",
      [
        "Client_Name",
        "Type",
        "Amount_To_Be_Paid",
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
        "Due_Payment",
      ],
      username,
      new Date().getFullYear().toString()
    );
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
    await ensureSheet("Users", ["Username", "Password", "GoogleEmail"]);
    const users = await readSheet("Users", "A2:C");
    const user = users.find((u) => u[0] === username);
    if (!user || !user[1] || !(await bcrypt.compare(password, user[1]))) {
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
    await ensureSheet("Users", ["Username", "Password", "GoogleEmail"]);
    const users = await readSheet("Users", "A2:C");
    const user = users.find((u) => u[0] === decoded.username);
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
app.get('/api/get-clients', authenticateToken, async (req, res) => {
  try {
    console.log(`Fetching clients for user: ${req.user.username}`);
    const headers = ['Client_Name', 'Email', 'Type', 'Monthly_Payment', 'Phone_Number'];
    await retryWithBackoff(() => ensureSheet('Clients', headers, req.user.username));
    const clients = await retryWithBackoff(() => readSheet(getClientSheetName(req.user.username), 'A2:E'));
    const processedClients = clients.map(client => {
      const paddedClient = [...client, ...Array(headers.length - client.length).fill('')];
      return {
        Client_Name: paddedClient[0] || '',
        Email: paddedClient[1] || '',
        Type: paddedClient[2] || '',
        Amount_To_Be_Paid: parseFloat(paddedClient[3]) || 0,
        Phone_Number: paddedClient[4] || '',
      };
    }).filter(Boolean);
    console.log(`Returning ${processedClients.length} clients`);
    res.json(processedClients);
  } catch (error) {
    console.error('Get clients error:', error.message);
    res.status(500).json({ error: `Failed to fetch clients: ${error.message}` });
  }
});

// Add Client
app.post("/api/add-client", authenticateToken, async (req, res) => {
  let { clientName, email, type, monthlyPayment, phoneNumber } = req.body;
  const year = new Date().getFullYear().toString();
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
    await ensureTypesSheet();
    const validTypes = await readSheet("Types", "A2:B");
    const userTypes = validTypes.filter(t => t[1] === username).map(t => t[0]);
    if (!userTypes.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${userTypes.join(", ")}` });
    }
    await ensureSheet("Clients", ["Client_Name", "Email", "Type", "Monthly_Payment", "Phone_Number"], username);
    await ensureSheet(
      "Payments",
      [
        "Client_Name",
        "Type",
        "Amount_To_Be_Paid",
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
        "Due_Payment",
      ],
      username,
      year
    );
    await appendSheet(getClientSheetName(username), [[clientName, email, type, paymentValue, phoneNumber]]);
    await appendSheet(getPaymentSheetName(username, year), [
      [clientName, type, paymentValue, "", "", "", "", "", "", "", "", "", "", "", "", paymentValue],
    ]);
    res.status(201).json({ message: "Client added successfully" });
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
app.put('/api/update-client', authenticateToken, async (req, res) => {
  const { oldClient, newClient } = req.body;
  const year = new Date().getFullYear().toString();
  const username = req.user.username;
  if (!oldClient || !newClient || !oldClient.Client_Name || !oldClient.Type || !newClient.Client_Name || !newClient.Type || !newClient.Amount_To_Be_Paid) {
    return res.status(400).json({ error: 'All required fields must be provided' });
  }
  let { Client_Name: oldClientName, Type: oldType } = oldClient;
  let { Client_Name, Type, Amount_To_Be_Paid, Email, Phone_Number } = newClient;
  oldClientName = sanitizeInput(oldClientName);
  oldType = sanitizeInput(oldType.trim().toUpperCase());
  Client_Name = sanitizeInput(Client_Name);
  Type = sanitizeInput(Type.trim().toUpperCase());
  Email = Email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Email) ? sanitizeInput(Email) : '';
  Phone_Number = Phone_Number && /^\+?[\d\s-]{10,15}$/.test(Phone_Number) ? sanitizeInput(Phone_Number) : '';
  const paymentValue = parseFloat(Amount_To_Be_Paid);
  if (isNaN(paymentValue) || paymentValue <= 0) {
    return res.status(400).json({ error: 'Amount to be paid must be a positive number' });
  }
  if (paymentValue > 1000000) {
    return res.status(400).json({ error: 'Amount to be paid exceeds maximum limit of 1,000,000' });
  }
  if (Client_Name.length > 100 || Type.length > 50) {
    return res.status(400).json({ error: 'Client name or type too long' });
  }
  try {
    await ensureTypesSheet();
    const validTypes = await readSheet("Types", "A2:B");
    const userTypes = validTypes.filter(t => t[1] === username).map(t => t[0]);
    if (!userTypes.includes(Type)) {
      return res.status(400).json({ error: `Type must be one of: ${userTypes.join(", ")}` });
    }
    await retryWithBackoff(() => ensureSheet('Clients', ['Client_Name', 'Email', 'Type', 'Monthly_Payment', 'Phone_Number'], username));
    let clients = await retryWithBackoff(() => readSheet(getClientSheetName(username), 'A2:E'));
    if (!Array.isArray(clients)) {
      console.error('Invalid clients data structure:', clients);
      return res.status(500).json({ error: 'Invalid client data in sheet' });
    }
    const clientIndex = clients.findIndex(client => client && Array.isArray(client) && client[0] === oldClientName && client[2] === oldType);
    if (clientIndex === -1) {
      return res.status(404).json({ error: 'Client not found' });
    }
    clients[clientIndex] = [Client_Name, Email, Type, paymentValue, Phone_Number];
    console.log(`Updating Clients sheet with ${clients.length} rows`);
    await retryWithBackoff(() => writeSheet(getClientSheetName(username), 'A2:E', clients));
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const paymentSheets = spreadsheet.data.sheets
      .filter(sheet => sheet.properties.title.startsWith(`Payments_${username}_`))
      .map(sheet => sheet.properties.title);
    for (const sheetName of paymentSheets) {
      const sheetYear = sheetName.split('_')[2];
      await retryWithBackoff(() => ensureSheet('Payments', ['Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment'], username, sheetYear));
      let payments = await retryWithBackoff(() => readSheet(sheetName, 'A2:Q'));
      if (!Array.isArray(payments)) {
        console.error(`Invalid payments data structure for ${sheetName}:`, payments);
        continue;
      }
      const paymentIndex = payments.findIndex(payment => payment && Array.isArray(payment) && payment[0] === oldClientName && payment[1] === oldType);
      if (paymentIndex !== -1) {
        const monthlyPayments = payments[paymentIndex].slice(3, 15);
        const amountToBePaid = paymentValue;
        const activeMonths = monthlyPayments.filter(m => m && parseFloat(m) >= 0).length;
        const expectedPayment = amountToBePaid * activeMonths;
        const totalPayments = monthlyPayments.reduce((sum, m) => sum + (parseFloat(m) || 0), 0);
        let currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);
        let prevYearCumulativeDue = 0;
        if (parseInt(sheetYear) > 2025) {
          const prevYear = (parseInt(sheetYear) - 1).toString();
          try {
            const prevPayments = await readSheet(getPaymentSheetName(username, prevYear), 'A2:Q');
            const prevPayment = prevPayments.find(p => p && Array.isArray(p) && p[0] === oldClientName && p[1] === oldType);
            prevYearCumulativeDue = prevPayment && prevPayment[15] ? parseFloat(prevPayment[15]) || 0 : 0;
          } catch (error) {
            console.warn(`No data found for previous year ${prevYear}:`, error.message);
          }
        }
        payments[paymentIndex] = [
          Client_Name,
          Type,
          paymentValue,
          ...monthlyPayments,
          (currentYearDuePayment + prevYearCumulativeDue).toFixed(2)
        ];
        console.log(`Updating ${sheetName} with ${payments.length} rows`);
        await retryWithBackoff(() => writeSheet(sheetName, 'A2:Q', payments));
      }
    }
    res.json({ message: 'Client updated successfully' });
  } catch (error) {
    console.error('Update client error:', {
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
    await ensureSheet("Clients", ["Client_Name", "Email", "Type", "Monthly_Payment", "Phone_Number"], username);
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const paymentSheets = spreadsheet.data.sheets
      .filter((sheet) => sheet.properties.title.startsWith(`Payments_${username}_`))
      .map((sheet) => sheet.properties.title);
    let clients = await readSheet(getClientSheetName(username), "A2:E");
    const clientIndex = clients.findIndex(
      (client) => client[0] === Client_Name && client[2] === Type
    );
    if (clientIndex === -1) {
      return res.status(404).json({ error: "Client not found" });
    }
    const rowNumber = clientIndex + 2;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: (await sheets.spreadsheets.get({
                spreadsheetId,
                ranges: [getClientSheetName(username)],
              })).data.sheets.find(s => s.properties.title === getClientSheetName(username)).properties.sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        }],
      },
    });
    for (const sheetName of paymentSheets) {
      await ensureSheet(
        "Payments",
        [
          "Client_Name",
          "Type",
          "Amount_To_Be_Paid",
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
          "Due_Payment",
        ],
        username,
        sheetName.split("_")[2]
      );
      let payments = await readSheet(sheetName, "A2:Q");
      const paymentIndex = payments.findIndex(
        (payment) => payment[0] === Client_Name && payment[1] === Type
      );
      if (paymentIndex !== -1) {
        const paymentRowNumber = paymentIndex + 2;
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: (await sheets.spreadsheets.get({
                    spreadsheetId,
                    ranges: [sheetName],
                  })).data.sheets.find(s => s.properties.title === sheetName).properties.sheetId,
                  dimension: "ROWS",
                  startIndex: paymentRowNumber - 1,
                  endIndex: paymentRowNumber,
                },
              },
            }],
          },
        });
      }
    }
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
    const headers = [
      "Client_Name",
      "Type",
      "Amount_To_Be_Paid",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
      "Due_Payment",
    ];
    await ensureSheet("Payments", headers, username, year);
    const payments = await readSheet(getPaymentSheetName(username, year), "A2:Q");
    const clients = await readSheet(getClientSheetName(username), "A2:E");
    const clientEmailMap = new Map();
    const clientPhoneMap = new Map();
    clients.forEach((client) => {
      const key = `${client[0]}_${client[2]}`;
      clientEmailMap.set(key, client[1] || "");
      clientPhoneMap.set(key, client[4] || "");
    });
    let processedPayments = payments.map((payment) => {
      if (!payment || payment.length < headers.length) {
        console.warn(`Invalid payment row for user ${username} in year ${year}:`, payment);
        return null;
      }
      const key = `${payment[0]}_${payment[1]}`;
      const email = clientEmailMap.get(key) || "";
      const phone = clientPhoneMap.get(key) || "";
      return {
        Client_Name: payment[0] || "",
        Type: payment[1] || "",
        Amount_To_Be_Paid: parseFloat(payment[2]) || 0,
        january: payment[3] || "",
        february: payment[4] || "",
        march: payment[5] || "",
        april: payment[6] || "",
        may: payment[7] || "",
        june: payment[8] || "",
        july: payment[9] || "",
        august: payment[10] || "",
        september: payment[11] || "",
        october: payment[12] || "",
        november: payment[13] || "",
        december: payment[14] || "",
        Due_Payment: parseFloat(payment[15]) || 0,
        Email: email,
        Phone_Number: phone,
      };
    }).filter((p) => p !== null);
    if (parseInt(year) > 2025) {
      const calculateCumulativeDue = async (targetYear) => {
        if (parseInt(targetYear) <= 2025) {
          try {
            const payments = await readSheet(getPaymentSheetName(username, targetYear), "A2:Q");
            const dueMap = new Map();
            payments.forEach((payment) => {
              if (payment.length < headers.length) return;
              const key = `${payment[0]}_${payment[1]}`;
              dueMap.set(key, parseFloat(payment[15]) || 0);
            });
            return dueMap;
          } catch (error) {
            console.warn(`Failed to fetch payments for ${targetYear}:`, error.message);
            return new Map();
          }
        }
        const prevYear = (parseInt(targetYear) - 1).toString();
        const prevCumulativeDue = await calculateCumulativeDue(prevYear);
        try {
          const payments = await readSheet(getPaymentSheetName(username, targetYear), "A2:Q");
          const cumulativeMap = new Map();
          payments.forEach((payment) => {
            if (payment.length < headers.length) return;
            const key = `${payment[0]}_${payment[1]}`;
            const currentDue = parseFloat(payment[15]) || 0;
            const prevCumulative = prevCumulativeDue.get(key) || 0;
            cumulativeMap.set(key, currentDue + prevCumulative);
          });
          return cumulativeMap;
        } catch (error) {
          console.warn(`Failed to fetch payments for ${targetYear}:`, error.message);
          return prevCumulativeDue;
        }
      };
      try {
        const prevYear = (parseInt(year) - 1).toString();
        const prevYearCumulativeDue = await calculateCumulativeDue(prevYear);
        processedPayments = processedPayments.map((payment) => {
          const key = `${payment.Client_Name}_${payment.Type}`;
          const prevCumulativeDue = prevYearCumulativeDue.get(key) || 0;
          return { ...payment, Due_Payment: payment.Due_Payment + prevCumulativeDue };
        });
      } catch (error) {
        console.error(`Error calculating cumulative due for ${year}:`, error.message);
      }
    }
    console.log(`Fetched ${processedPayments.length} payments for ${year} for user ${username}`);
    res.json(processedPayments);
  } catch (error) {
    console.error(`Get payments for year ${year} error:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data,
    });
    res.status(500).json({ error: `Failed to fetch payments for year ${year}: ${error.message}` });
  }
});

// Save Payment
app.post("/api/save-payment", authenticateToken, async (req, res) => {
  const { clientName, type, month, value } = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  const username = req.user.username;
  console.log("Save payment request:", {
    clientName,
    type,
    month,
    value,
    year,
    user: username
  });
  if (!clientName || !type || !month) {
    console.error("Missing required fields:", { clientName, type, month });
    return res.status(400).json({ error: "Client name, type, and month are required" });
  }
  if (value !== "" && value !== null && value !== undefined) {
    const numericValue = parseFloat(value);
    if (isNaN(numericValue) || numericValue < 0) {
      console.error("Invalid payment value:", value);
      return res.status(400).json({ error: "Invalid payment value" });
    }
  }
  try {
    const headers = [
      "Client_Name",
      "Type",
      "Amount_To_Be_Paid",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
      "Due_Payment",
    ];
    const monthMap = {
      january: 3,
      february: 4,
      march: 5,
      april: 6,
      may: 7,
      june: 8,
      july: 9,
      august: 10,
      september: 11,
      october: 12,
      november: 13,
      december: 14,
    };
    const monthLower = month.toLowerCase();
    if (!monthMap[monthLower]) {
      console.error("Invalid month:", month);
      return res.status(400).json({ error: "Invalid month" });
    }
    await ensureSheet("Payments", headers, username, year);
    console.log("Sheet ensured for year:", year);
    let payments;
    try {
      payments = await readSheet(getPaymentSheetName(username, year), "A2:Q");
      console.log("Read payments, count:", payments?.length || 0);
    } catch (sheetError) {
      console.error("Error reading sheet:", sheetError.message);
      return res.status(500).json({ error: "Failed to read payment data" });
    }
    const paymentIndex = payments.findIndex(
      (p) => p[0] === clientName && p[1] === type
    );
    if (paymentIndex === -1) {
      console.error("Payment record not found:", {
        user: username,
        clientName,
        type
      });
      return res.status(404).json({ error: "Payment record not found" });
    }
    console.log("Found payment at index:", paymentIndex);
    const paymentRow = [...payments[paymentIndex]];
    while (paymentRow.length < 16) {
      paymentRow.push("");
    }
    paymentRow[monthMap[monthLower]] = value || "";
    console.log("Updated row for month", month, "with value:", value);
    const amountToBePaid = parseFloat(paymentRow[2]) || 0;
    if (isNaN(amountToBePaid)) {
      console.error("Invalid Amount_To_Be_Paid:", paymentRow[2]);
      return res.status(500).json({ error: "Invalid payment data in sheet" });
    }
    console.log("Payment row before update:", paymentRow);
    const activeMonths = paymentRow.slice(3, 15).filter((m) => m && parseFloat(m) >= 0).length;
    const expectedPayment = amountToBePaid * activeMonths;
    const totalPayments = paymentRow.slice(3, 15).reduce((sum, m) => sum + (parseFloat(m) || 0), 0);
    let currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);
    let prevYearCumulativeDue = 0;
    if (parseInt(year) > 2025) {
      const prevYear = (parseInt(year) - 1).toString();
      try {
        console.log(`Fetching previous year data for ${prevYear}`);
        const prevPayments = await readSheet(getPaymentSheetName(username, prevYear), "A2:Q");
        const prevPayment = prevPayments.find(
          (p) => p[0] === clientName && p[1] === type
        );
        prevYearCumulativeDue = prevPayment && prevPayment[15] ? parseFloat(prevPayment[15]) || 0 : 0;
        console.log(`Previous year ${prevYear} cumulative due: ${prevYearCumulativeDue}`);
      } catch (error) {
        console.warn(`No data found for previous year ${prevYear}:`, error.message);
        prevYearCumulativeDue = 0;
      }
    }
    paymentRow[15] = (currentYearDuePayment + prevYearCumulativeDue).toFixed(2);
    payments[paymentIndex] = paymentRow;
    const range = `${getPaymentSheetName(username, year)}!A${paymentIndex + 2}:Q${paymentIndex + 2}`;
    try {
      await updateSheet(range, [paymentRow]);
      console.log("Successfully updated sheet range:", range);
    } catch (updateError) {
      console.error("Error updating sheet:", updateError.message);
      return res.status(500).json({ error: "Failed to update payment data" });
    }
    const updatedRow = {
      Client_Name: paymentRow[0],
      Type: paymentRow[1],
      Amount_To_Be_Paid: parseFloat(paymentRow[2]) || 0,
      january: paymentRow[3] || "",
      february: paymentRow[4] || "",
      march: paymentRow[5] || "",
      april: paymentRow[6] || "",
      may: paymentRow[7] || "",
      june: paymentRow[8] || "",
      july: paymentRow[9] || "",
      august: paymentRow[10] || "",
      september: paymentRow[11] || "",
      october: paymentRow[12] || "",
      november: paymentRow[13] || "",
      december: paymentRow[14] || "",
      Due_Payment: parseFloat(paymentRow[15]) || 0,
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
      user: username
    });
    res.status(500).json({ error: `Failed to save payment: ${error.message}` });
  }
});

app.post("/api/batch-save-payments", authenticateToken, paymentLimiter, async (req, res) => {
  const { clientName, type, updates } = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  const username = req.user.username;
  console.log("Batch save payment request:", {
    clientName,
    type,
    updates,
    year,
    user: username,
  });
  if (!clientName || !type || !Array.isArray(updates) || updates.length === 0) {
    console.error("Missing required fields:", { clientName, type, updates });
    return res.status(400).json({ error: "Client name, type, and non-empty updates array are required" });
  }
  for (const { month, value } of updates) {
    if (!month) {
      console.error("Missing month in update:", { month, value });
      return res.status(400).json({ error: "Month is required for each update" });
    }
    if (value !== "" && value !== null && value !== undefined) {
      const numericValue = parseFloat(value);
      if (isNaN(numericValue) || numericValue < 0) {
        console.error("Invalid payment value:", value);
        return res.status(400).json({ error: `Invalid payment value for ${month}` });
      }
    }
  }
  try {
    const headers = [
      "Client_Name",
      "Type",
      "Amount_To_Be_Paid",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
      "Due_Payment",
    ];
    const monthMap = {
      january: 3,
      february: 4,
      march: 5,
      april: 6,
      may: 7,
      june: 8,
      july: 9,
      august: 10,
      september: 11,
      october: 12,
      november: 13,
      december: 14,
    };
    const invalidMonth = updates.find(({ month }) => !monthMap[month.toLowerCase()]);
    if (invalidMonth) {
      console.error("Invalid month:", invalidMonth.month);
      return res.status(400).json({ error: `Invalid month: ${invalidMonth.month}` });
    }
    await retryWithBackoff(() => ensureSheet("Payments", headers, username, year));
    console.log("Sheet ensured for year:", year);
    let payments;
    try {
      payments = await retryWithBackoff(() => readSheet(getPaymentSheetName(username, year), "A2:Q"));
      console.log("Read payments, count:", payments?.length || 0);
    } catch (sheetError) {
      console.error("Error reading sheet:", sheetError.message);
      return res.status(500).json({ error: "Failed to read payment data" });
    }
    const paymentIndex = payments.findIndex(
      (p) => p[0] === clientName && p[1] === type
    );
    if (paymentIndex === -1) {
      console.error("Payment record not found:", {
        user: username,
        clientName,
        type,
      });
      return res.status(404).json({ error: "Payment record not found" });
    }
    console.log("Found payment at index:", paymentIndex);
    const paymentRow = [...payments[paymentIndex]];
    while (paymentRow.length < 16) {
      paymentRow.push("");
    }
    updates.forEach(({ month, value }) => {
      paymentRow[monthMap[month.toLowerCase()]] = value || "";
      console.log("Updated row for month", month, "with value:", value);
    });
    const amountToBePaid = parseFloat(paymentRow[2]) || 0;
    if (isNaN(amountToBePaid)) {
      console.error("Invalid Amount_To_Be_Paid:", paymentRow[2]);
      return res.status(500).json({ error: "Invalid payment data in sheet" });
    }
    const activeMonths = paymentRow.slice(3, 15).filter((m) => m && parseFloat(m) >= 0).length;
    const expectedPayment = amountToBePaid * activeMonths;
    const totalPayments = paymentRow.slice(3, 15).reduce((sum, m) => sum + (parseFloat(m) || 0), 0);
    let currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);
    let prevYearCumulativeDue = 0;
    if (parseInt(year) > 2025) {
      const prevYear = (parseInt(year) - 1).toString();
      try {
        console.log(`Fetching previous year data for ${prevYear}`);
        const prevPayments = await readSheet(getPaymentSheetName(username, prevYear), "A2:Q");
        const prevPayment = prevPayments.find(
          (p) => p[0] === clientName && p[1] === type
        );
        prevYearCumulativeDue = prevPayment && prevPayment[15] ? parseFloat(prevPayment[15]) || 0 : 0;
        console.log(`Previous year ${prevYear} cumulative due: ${prevYearCumulativeDue}`);
      } catch (error) {
        console.warn(`No data found for previous year ${prevYear}:`, error.message);
        prevYearCumulativeDue = 0;
      }
    }
    paymentRow[15] = (currentYearDuePayment + prevYearCumulativeDue).toFixed(2);
    payments[paymentIndex] = paymentRow;
    const range = `${getPaymentSheetName(username, year)}!A${paymentIndex + 2}:Q${paymentIndex + 2}`;
    try {
      await retryWithBackoff(() => updateSheet(range, [paymentRow]));
      console.log("Successfully updated sheet range:", range);
    } catch (updateError) {
      console.error("Error updating sheet:", updateError.message);
      return res.status(500).json({ error: "Failed to update payment data" });
    }
    const updatedRow = {
      Client_Name: paymentRow[0],
      Type: paymentRow[1],
      Amount_To_Be_Paid: parseFloat(paymentRow[2]) || 0,
      january: paymentRow[3] || "",
      february: paymentRow[4] || "",
      march: paymentRow[5] || "",
      april: paymentRow[6] || "",
      may: paymentRow[7] || "",
      june: paymentRow[8] || "",
      july: paymentRow[9] || "",
      august: paymentRow[10] || "",
      september: paymentRow[11] || "",
      october: paymentRow[12] || "",
      november: paymentRow[13] || "",
      december: paymentRow[14] || "",
      Due_Payment: parseFloat(paymentRow[15]) || 0,
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
  // Call the same logic as lowercase route
  return app._router.handle({...req, url: '/api/batch-save-payments'}, res);
});

// Get User Years
app.get("/api/get-user-years", authenticateToken, async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const username = req.user.username;
    const paymentSheets = spreadsheet.data.sheets
      .filter((sheet) => sheet.properties.title.startsWith(`Payments_${username}_`))
      .map((sheet) => sheet.properties.title);
    const userYears = [];
    for (const sheetName of paymentSheets) {
      const year = sheetName.split("_")[2];
      if (parseInt(year) < 2025) continue;
      try {
        const payments = await readSheet(sheetName, "A2:Q");
        const userHasData = payments.some((row) => {
          if (!row || row.length === 0 || !row[0]) return false;
          const hasClientData = row[0] && row[0].toString().trim() !== "";
          const hasAmountData = row[2] && !isNaN(parseFloat(row[2])) && parseFloat(row[2]) > 0;
          const hasMonthlyData = row
            .slice(3, 15)
            .some((cell) => cell && cell.toString().trim() !== "" && cell.toString().trim() !== "0");
          return hasClientData || hasAmountData || hasMonthlyData;
        });
        if (userHasData) {
          userYears.push(year);
        }
        if (year === "2025" && !userYears.includes("2025")) {
          userYears.push(year);
        }
      } catch (sheetError) {
        if (year === "2025" && !userYears.includes("2025")) {
          userYears.push(year);
        }
      }
    }
    if (!userYears.includes("2025")) {
      userYears.push("2025");
    }
    const uniqueYears = [...new Set(userYears)].sort((a, b) => parseInt(a) - parseInt(b));
    res.json(uniqueYears);
  } catch (error) {
    console.error("Get user years error:", error.message);
    res.json(["2025"]);
  }
});

// Add New Year
app.post("/api/add-new-year", authenticateToken, async (req, res) => {
  const { year } = req.body;
  if (!year || isNaN(year) || parseInt(year) < 2025) {
    return res.status(400).json({ error: "Valid year >= 2025 is required" });
  }
  const username = req.user.username;
  try {
    const headers = [
      "Client_Name",
      "Type",
      "Amount_To_Be_Paid",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
      "Due_Payment",
    ];
    const sheetName = getPaymentSheetName(username, year);
    const currentYear = new Date().getFullYear().toString();
    const currentSheetName = getPaymentSheetName(username, currentYear);
    await ensureSheet("Payments", headers, username, currentYear);
    const currentPayments = await readSheet(currentSheetName, "A2:Q");
    const hasCurrentData = currentPayments.some(
      (payment) => payment[0] && payment[2] && parseFloat(payment[2]) > 0
    );
    if (!hasCurrentData) {
      return res.status(400).json({
        error: "Please add or import payment data for the current year before creating a new year",
      });
    }
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets.some(
      (sheet) => sheet.properties.title === sheetName
    );
    if (sheetExists) {
      const payments = await readSheet(sheetName, "A2:Q");
      const hasUserData = payments.some((payment) => payment[0]);
      if (hasUserData) {
        return res.status(200).json({ message: "Sheet already exists with user data" });
      }
    }
    await ensureSheet("Payments", headers, username, year);
    await ensureSheet("Clients", ["Client_Name", "Email", "Type", "Monthly_Payment", "Phone_Number"], username);
    const clients = await readSheet(getClientSheetName(username), "A2:E");
    const newPayments = clients.map((client) => [
      client[0],
      client[2],
      parseFloat(client[3]) || 0,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "0",
    ]);
    if (newPayments.length > 0) {
      await appendSheet(sheetName, newPayments);
    }
    res.json({ message: `New year ${year} added successfully` });
  } catch (error) {
    console.error(`Error adding new year ${year}:`, error.message);
    res.status(500).json({ error: "Failed to add new year" });
  }
});

// Import CSV
app.post('/api/import-csv', authenticateToken, async (req, res) => {
  const csvData = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  const username = req.user.username;
  console.log(`Importing CSV for user: ${username}, year: ${year}, records: ${csvData?.length || 0}`);
  if (!Array.isArray(csvData) || csvData.length === 0) {
    console.error('CSV import error: Invalid CSV data: not an array or empty');
    return res.status(400).json({ error: 'CSV data must be a non-empty array of records' });
  }
  try {
    await ensureTypesSheet();
    const validTypes = await readSheet("Types", "A2:B");
    const userTypes = validTypes.filter(t => t[1] === username).map(t => t[0]);
    for (let i = 0; i < csvData.length; i++) {
      const record = csvData[i];
      if (!record.Client_Name || !record.Type || record.Amount_To_Be_Paid == null) {
        console.error(`Invalid record at index ${i}: missing required fields`, record);
        return res.status(400).json({ error: `Missing required fields (Client_Name, Type, or Amount_To_Be_Paid) in record at index ${i}` });
      }
      if (typeof record.Client_Name !== 'string' || record.Client_Name.length > 100) {
        console.error(`Invalid Client_Name at index ${i}:`, record.Client_Name);
        return res.status(400).json({ error: `Client_Name at index ${i} must be a valid string with up to 100 characters` });
      }
      const typeUpper = record.Type.trim().toUpperCase();
      if (typeof record.Type !== 'string' || !userTypes.includes(typeUpper)) {
        console.error(`Invalid Type at index ${i}:`, record.Type);
        return res.status(400).json({ error: `Type at index ${i} must be one of: ${userTypes.join(", ")}` });
      }
      const amount = parseFloat(record.Amount_To_Be_Paid);
      console.log(`Parsed Amount_To_Be_Paid at index ${i}:`, amount);
      if (isNaN(amount) || amount <= 0 || amount > 1e6) {
        console.error(`Invalid Amount_To_Be_Paid at index ${i}:`, record.Amount_To_Be_Paid);
        return res.status(400).json({ error: `Amount_To_Be_Paid at index ${i} must be a positive number up to 1,000,000` });
      }
      if (record.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.Email)) {
        console.warn(`Invalid Email at index ${i}, setting to empty:`, record.Email);
        record.Email = '';
      }
      if (record.Phone_Number && !/^\+?[\d\s-]{10,15}$/.test(record.Phone_Number)) {
        console.warn(`Invalid Phone_Number at index ${i}, setting to empty:`, record.Phone_Number);
        record.Phone_Number = '';
      }
    }
    console.log('Ensuring sheets...');
    await retryWithBackoff(() => ensureSheet('Clients', ['Client_Name', 'Email', 'Type', 'Monthly_Payment', 'Phone_Number'], username));
    await retryWithBackoff(() => ensureSheet('Payments', ['Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment'], username, year));
    console.log('Reading existing data...');
    let clients = await retryWithBackoff(() => readSheet(getClientSheetName(username), 'A2:E')) || [];
    let payments = await retryWithBackoff(() => readSheet(getPaymentSheetName(username, year), 'A2:Q')) || [];
    const clientsBatch = [];
    const paymentsBatch = [];
    for (let i = 0; i < csvData.length; i++) {
      const record = csvData[i];
      let { Client_Name, Type, Email, Amount_To_Be_Paid, Phone_Number } = record;
      console.log(`Processing record ${i}:`, { Client_Name, Type, Amount_To_Be_Paid });
      Client_Name = sanitizeInput(Client_Name);
      Type = sanitizeInput(Type.trim().toUpperCase());
      Email = Email ? sanitizeInput(Email) : '';
      Phone_Number = Phone_Number ? sanitizeInput(Phone_Number) : '';
      Amount_To_Be_Paid = parseFloat(Amount_To_Be_Paid);
      console.log(`Writing Amount_To_Be_Paid for record ${i}:`, Amount_To_Be_Paid);
      const clientRow = [Client_Name, Email, Type, Amount_To_Be_Paid, Phone_Number];
      clientsBatch.push(clientRow);
      clients.push(clientRow);
      console.log(`Appending client row ${i}:`, clientRow);
      const paymentRow = [Client_Name, Type, Amount_To_Be_Paid, '', '', '', '', '', '', '', '', '', '', '', '', Amount_To_Be_Paid.toFixed(2)];
      paymentsBatch.push(paymentRow);
      payments.push(paymentRow);
      console.log(`Appending payment row ${i}:`, paymentRow);
    }
    if (clientsBatch.length > 0) {
      console.log(`Appending ${clientsBatch.length} clients to Clients sheet...`);
      await retryWithBackoff(() => appendSheet(getClientSheetName(username), clientsBatch));
    }
    if (paymentsBatch.length > 0) {
      console.log(`Appending ${paymentsBatch.length} payments to Payments_${year} sheet...`);
      await retryWithBackoff(() => appendSheet(getPaymentSheetName(username, year), paymentsBatch));
    }
    console.log('CSV import completed successfully');
    res.status(200).json({ message: 'Clients and payments imported successfully', imported: csvData.length });
  } catch (error) {
    console.error('Import CSV error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data,
      user: username,
      year,
    });
    res.status(500).json({ error: `Failed to import CSV: ${error.message}` });
  }
});


// Debug Sheets
app.get("/api/debug-sheets", authenticateToken, async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const paymentsSheet = spreadsheet.data.sheets.find((s) => s.properties.title === "Payments_2025");
    const result = {
      spreadsheetTitle: spreadsheet.data.properties.title,
      availableSheets: spreadsheet.data.sheets.map((s) => s.properties.title),
      payments2025Exists: !!paymentsSheet,
      user: req.user.username,
      timestamp: new Date().toISOString(),
    };
    if (paymentsSheet) {
      try {
        const testRead = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: "Payments_2025!A1:B2",
        });
        result.testReadSuccess = true;
        result.testReadRows = testRead.data.values?.length || 0;
      } catch (readError) {
        result.testReadSuccess = false;
        result.testReadError = readError.message;
      }
    }
    res.json(result);
  } catch (error) {
    console.error("Debug sheets error:", error.message);
    res.status(500).json({ error: "Debug failed", message: error.message });
  }
});

// Debug Routes
app.get("/api/debug-routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((r) => {
    if (r.route && r.route.path) {
      routes.push({
        method: Object.keys(r.route.methods)[0].toUpperCase(),
        path: r.route.path,
      });
    }
  });
  res.json({
    message: "Available API routes",
    routes: routes.filter((r) => r.path.startsWith("/api")),
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/logout", authenticateToken, async (req, res) => {
  const username = req.user.username;
  try {
    // Invalidate token (e.g., add to a blacklist or clear from storage)
    console.log(`Logging out user ${username}`);
    // If using a token blacklist, store the token in a database or cache
    // For simplicity, we'll assume the client clears the token
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ error: "Failed to logout" });
  }
});

app.post('/api/add-type', authenticateToken, async (req, res) => {
  let { type } = req.body;
  const username = req.user.username;
  if (!type) {
    console.error('No type provided');
    return res.status(400).json({ error: 'Type is required' });
  }
  type = sanitizeInput(type.trim().toUpperCase()); // Capitalize type
  if (type.length < 1 || type.length > 50) {
    console.error('Invalid type length:', type.length);
    return res.status(400).json({ error: 'Type must be between 1 and 50 characters' });
  }
  try {
    await ensureTypesSheet();
    const existingTypes = await readSheet('Types', 'A2:B');
    if (existingTypes.some(t => t[0] === type && t[1] === username)) {
      console.warn(`Type already exists for user: ${type}, ${username}`);
      return res.status(400).json({ error: 'Type already exists for this user' });
    }
    await appendSheet('Types', [[type, username]]);
    console.log(`Type ${type} added successfully for user ${username}`);
    return res.status(201).json({ message: 'Type added successfully' });
  } catch (error) {
    console.error('Add type error:', {
      message: error.message,
      stack: error.stack,
      inputType: type,
      username,
    });
    return res.status(500).json({ error: `Failed to add type: ${error.message}` });
  }
});

app.get("/api/get-types", authenticateToken, async (req, res) => {
  const username = req.user.username;
  try {
    await ensureTypesSheet();
    const typesData = await readSheet("Types", "A2:B");
    const processedTypes = typesData.filter(t => t[1] === username).map(t => t[0]).filter(Boolean);
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
    console.error("Missing required fields:", { to, subject, html, user: req.user.username });
    return res.status(400).json({ error: "Recipient email, subject, and HTML content are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error("Invalid email address:", { to, user: req.user.username });
    return res.status(400).json({ error: "Invalid recipient email address" });
  }
  try {
    const sanitizedHtml = sanitizeInput(html);
    if (!sanitizedHtml.trim()) {
      console.error("Sanitized HTML is empty:", { originalHtml: html, user: req.user.username });
      return res.status(400).json({ error: "HTML content is invalid or empty after sanitization" });
    }
    const info = await transporter.sendMail({
      from: `"Payment Tracker" <${process.env.EMAIL_FROM}>`,
      to: to.trim(),
      subject,
      html: sanitizedHtml,
    });
    console.log(`Email sent successfully to ${to}:`, {
      messageId: info.messageId,
      response: info.response,
      user: req.user.username,
    });
    res.json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Send email error:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
      to,
      user: req.user.username,
    });
    res.status(500).json({ error: `Failed to send email: ${error.message}` });
  }
});

// Before /api/send-whatsapp
const whatsappLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Allow 100 WhatsApp messages per window
  standardHeaders: true,
  legacyHeaders: false,
});

// Replace the existing /api/send-whatsapp endpoint with:
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
    // Format phone number to E.164 without spaces or dashes
    let formattedPhone = to.trim().replace(/[\s-]/g, "");
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = `+91${formattedPhone.replace(/\D/g, "")}`; // Default to +91
    }
    // UltraMsg API payload
    const payload = {
      token: process.env.ULTRAMSG_TOKEN,
      to: formattedPhone,
      body: message,
    };
    // Retry logic
    const maxRetries = 3;
    let attempt = 0;
    let response;
    while (attempt < maxRetries) {
      try {
        response = await axios.post(
          `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE_ID}/messages/chat`,
          new URLSearchParams(payload).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
        break;
      } catch (error) {
        attempt++;
        if (attempt === maxRetries || !error.response || error.response.status !== 429) {
          throw error;
        }
        console.log(`UltraMsg retry ${attempt}/${maxRetries} for ${formattedPhone}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    if (response.data.status === "success") {
      console.log(`WhatsApp message sent successfully to ${formattedPhone}:`, {
        messageId: response.data.messageId,
        status: response.data.status,
        user: req.user.username,
      });
      res.json({ message: "WhatsApp message sent successfully" });
    } else {
      console.error("UltraMsg API error:", {
        response: response.data,
        to: formattedPhone,
        user: req.user.username,
      });
      res.status(500).json({ error: `Failed to send WhatsApp message: ${response.data.error}` });
    }
  } catch (error) {
    console.error("Send WhatsApp error:", {
      message: error.message,
      code: error.response?.data?.error?.code,
      details: error.response?.data,
      to: formattedPhone,
      user: req.user.username,
    });
    res.status(500).json({ error: `Failed to send WhatsApp message: ${error.message}` });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));