const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { google } = require("googleapis");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sanitizeHtml = require("sanitize-html");
const { OAuth2Client } = require("google-auth-library");
require("dotenv").config();

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Trust Render's proxy
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
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);
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
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Cookie parser
app.use(cookieParser());

// Parse JSON
app.use(express.json());

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
const getPaymentSheetName = (year) => `Payments_${year}`;

// Helper: Delay function for retry logic
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Ensure sheet exists with headers
async function ensureSheet(sheetName, headers, year = null) {
  const sheets = google.sheets({ version: "v4", auth });
  try {
    const actualSheetName = year ? getPaymentSheetName(year) : sheetName;
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
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${actualSheetName}!A1`,
        valueInputOption: "RAW",
        resource: { values: [headers] },
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
    }
  } catch (error) {
    console.error(`Error ensuring sheet ${sheetName}${year ? "_" + year : ""}:`, error.message);
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
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
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
        const delayMs = Math.pow(2, retryCount) * 1000;
        console.log(`Rate limit exceeded for ${range}, retrying after ${delayMs}ms...`);
        await delay(delayMs);
        retryCount++;
      } else {
        console.error(`Error updating range ${range}:`, {
          message: error.message,
          code: error.code,
          details: error.errors,
        });
        throw new Error(`Failed to update range ${range}`);
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

// Helper: Sanitize input
const sanitizeInput = (input) => {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
};

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
app.get("/api/get-clients", authenticateToken, async (req, res) => {
  try {
    await ensureSheet("Clients", ["User", "Client_Name", "Email", "Type", "Monthly_Payment"]);
    const clients = await readSheet("Clients", "A2:E");
    const userClients = clients.filter((client) => client[0] === req.user.username);
    res.json(
      userClients.map((client) => ({
        User: client[0],
        Client_Name: client[1],
        Email: client[2] || "",
        Type: client[3],
        Amount_To_Be_Paid: parseFloat(client[4]) || 0,
      }))
    );
  } catch (error) {
    console.error("Get clients error:", error.message);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// Add Client
app.post("/api/add-client", authenticateToken, async (req, res) => {
  let { clientName, email, type, monthlyPayment } = req.body;
  const year = new Date().getFullYear().toString();
  if (!clientName || !type || !monthlyPayment) {
    return res.status(400).json({ error: "Client name, type, and monthly payment are required" });
  }
  clientName = sanitizeInput(clientName);
  type = sanitizeInput(type);
  email = email ? sanitizeInput(email) : "";
  const paymentValue = parseFloat(monthlyPayment);
  if (isNaN(paymentValue) || paymentValue <= 0) {
    return res.status(400).json({ error: "Monthly payment must be a positive number" });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }
  if (!["GST", "IT Return"].includes(type)) {
    return res.status(400).json({ error: 'Type must be either "GST" or "IT Return"' });
  }
  try {
    await ensureSheet("Clients", ["User", "Client_Name", "Email", "Type", "Monthly_Payment"]);
    await ensureSheet(
      "Payments",
      [
        "User",
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
      year
    );
    await appendSheet("Clients", [[req.user.username, clientName, email, type, paymentValue]]);
    await appendSheet(getPaymentSheetName(year), [
      [req.user.username, clientName, type, paymentValue, "", "", "", "", "", "", "", "", "", "", "", "", "0"],
    ]);
    res.status(201).json({ message: "Client added successfully" });
  } catch (error) {
    console.error("Add client error:", error.message);
    res.status(500).json({ error: "Internal server error" });
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
  try {
    await ensureSheet("Clients", ["User", "Client_Name", "Email", "Type", "Monthly_Payment"]);
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const paymentSheets = spreadsheet.data.sheets
      .filter((sheet) => sheet.properties.title.startsWith("Payments_"))
      .map((sheet) => sheet.properties.title);

    let clients = await readSheet("Clients", "A2:E");
    const clientExists = clients.some(
      (client) => client[0] === req.user.username && client[1] === Client_Name && client[3] === Type
    );
    if (!clientExists) {
      return res.status(404).json({ error: "Client not found" });
    }

    const filteredClients = clients.filter(
      (client) => !(client[0] === req.user.username && client[1] === Client_Name && client[3] === Type)
    );

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: "Clients!A2:E" });
    if (filteredClients.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Clients!A2",
        valueInputOption: "RAW",
        resource: { values: filteredClients },
      });
    }

    for (const sheetName of paymentSheets) {
      await ensureSheet(
        "Payments",
        [
          "User",
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
        sheetName.split("_")[1]
      );
      let payments = await readSheet(sheetName, "A2:R");
      const filteredPayments = payments.filter(
        (payment) => !(payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type)
      );

      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetName}!A2:R` });
      if (filteredPayments.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A2`,
          valueInputOption: "RAW",
          resource: { values: filteredPayments },
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
  try {
    const headers = [
      "User",
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
    await ensureSheet("Payments", headers, year);
    const payments = await readSheet(getPaymentSheetName(year), "A2:R");
    const userPayments = payments.filter((payment) => payment[0] === req.user.username);

    let processedPayments = userPayments.map((payment) => ({
      User: payment[0],
      Client_Name: payment[1],
      Type: payment[2],
      Amount_To_Be_Paid: parseFloat(payment[3]) || 0,
      january: payment[4] || "",
      february: payment[5] || "",
      march: payment[6] || "",
      april: payment[7] || "",
      may: payment[8] || "",
      june: payment[9] || "",
      july: payment[10] || "",
      august: payment[11] || "",
      september: payment[12] || "",
      october: payment[13] || "",
      november: payment[14] || "",
      december: payment[15] || "",
      Due_Payment: parseFloat(payment[16]) || 0,
    }));

    if (parseInt(year) > 2025) {
      const calculateCumulativeDue = async (targetYear) => {
        if (parseInt(targetYear) <= 2025) {
          const payments = await readSheet(getPaymentSheetName(targetYear), "A2:R");
          const userPayments = payments.filter((p) => p[0] === req.user.username);
          const dueMap = new Map();
          userPayments.forEach((payment) => {
            const key = `${payment[1]}_${payment[2]}`;
            dueMap.set(key, parseFloat(payment[16]) || 0);
          });
          return dueMap;
        }
        const prevYear = (parseInt(targetYear) - 1).toString();
        const prevCumulativeDue = await calculateCumulativeDue(prevYear);
        const payments = await readSheet(getPaymentSheetName(targetYear), "A2:R");
        const userPayments = payments.filter((p) => p[0] === req.user.username);
        const cumulativeMap = new Map();
        userPayments.forEach((payment) => {
          const key = `${payment[1]}_${payment[2]}`;
          const currentDue = parseFloat(payment[16]) || 0;
          const prevCumulative = prevCumulativeDue.get(key) || 0;
          cumulativeMap.set(key, currentDue + prevCumulative);
        });
        return cumulativeMap;
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
        console.warn(`Could not calculate cumulative due for previous years:`, error.message);
      }
    }

    console.log(`Fetched ${processedPayments.length} payments for ${year} for user ${req.user.username}`);
    res.json(processedPayments);
  } catch (error) {
    console.error(`Get payments for year ${year} error:`, error.message);
    res.status(500).json({ error: `Failed to fetch payments for year ${year}` });
  }
});

// Route: POST /api/update-multiple-payments
app.post("/api/update-multiple-payments", authenticateToken, async (req, res) => {
  console.log("Received /api/update-multiple-payments request");
  
  try {
    const { updates } = req.body;
    const username = req.user.username;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid updates format" 
      });
    }

    const updateEntries = Object.entries(updates);
    
    if (updateEntries.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "No updates provided" 
      });
    }

    console.log(`Processing batch update for user ${username} with ${updateEntries.length} changes`);

    // Get user's current payment data
    const sheetName = `${username}_payments`;
    
    // Check if sheet exists
    try {
      await readSheet(sheetName, "A1:A1");
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: "User payment sheet not found"
      });
    }

    // Process each update
    const results = [];
    const errors = [];

    for (const [key, updateData] of updateEntries) {
      try {
        const { rowIndex, month, newValue, year } = updateData;
        
        // Validate the update data
        if (typeof rowIndex !== 'number' || !month || !year) {
          errors.push({ key, error: "Invalid update data format" });
          continue;
        }

        // Sanitize the new value
        const sanitizedValue = sanitizeInput(newValue.toString());
        const numericValue = parseFloat(sanitizedValue) || 0;

        // Validate month
        const validMonths = [
          'january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december'
        ];
        
        if (!validMonths.includes(month.toLowerCase())) {
          errors.push({ key, error: "Invalid month" });
          continue;
        }

        // Get current row data to calculate the column position
        const currentRowData = await readSheet(sheetName, `A${rowIndex + 2}:O${rowIndex + 2}`);
        
        if (!currentRowData || currentRowData.length === 0) {
          errors.push({ key, error: "Payment record not found" });
          continue;
        }

        const rowData = currentRowData[0];
        
        // Calculate column position for the month (D=january, E=february, etc.)
        const monthIndex = validMonths.indexOf(month.toLowerCase());
        const columnLetter = String.fromCharCode(68 + monthIndex); // D=68 in ASCII
        const cellRange = `${columnLetter}${rowIndex + 2}`;

        // Update the specific cell
        await updateSheet(sheetName, cellRange, [[numericValue]]);

        // Calculate new due payment
        const amountToBePaid = parseFloat(rowData[2]) || 0; // Column C (Amount_To_Be_Paid)
        
        // Get all month values to calculate total paid
        const monthlyData = await readSheet(sheetName, `D${rowIndex + 2}:O${rowIndex + 2}`);
        const monthValues = monthlyData[0] || [];
        
        // Update the month value in our calculation
        monthValues[monthIndex] = numericValue;
        
        const totalPaid = monthValues.reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        const newDuePayment = Math.max(0, amountToBePaid - totalPaid);

        // Update Due_Payment column (Column P)
        await updateSheet(sheetName, `P${rowIndex + 2}`, [[newDuePayment]]);

        results.push({
          key,
          success: true,
          rowIndex,
          month,
          newValue: numericValue,
          newDuePayment
        });

        console.log(`Updated ${key}: ${month} = ${numericValue}, due = ${newDuePayment}`);

      } catch (updateError) {
        console.error(`Error updating ${key}:`, updateError);
        errors.push({ 
          key, 
          error: updateError.message || "Update failed" 
        });
      }
    }

    // Return response with results and any errors
    const response = {
      success: results.length > 0,
      message: `Processed ${results.length} updates successfully`,
      results,
      totalUpdates: updateEntries.length,
      successfulUpdates: results.length,
      failedUpdates: errors.length
    };

    if (errors.length > 0) {
      response.errors = errors;
      response.message += `, ${errors.length} failed`;
    }

    console.log("Batch update completed:", response.message);
    res.json(response);

  } catch (error) {
    console.error("Batch update error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error during batch update",
      details: error.message 
    });
  }
});

// Save Payment (Merged Logic)
app.post("/api/save-payment", authenticateToken, async (req, res) => {
  const { rowIndex, updatedRow, month, value } = req.body;
  const year = req.query.year || new Date().getFullYear().toString();

  if (!updatedRow || typeof rowIndex !== "number") {
    return res.status(400).json({ error: "Invalid payment data" });
  }

  try {
    const headers = [
      "User",
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
    await ensureSheet("Payments", headers, year);
    let payments = await readSheet(getPaymentSheetName(year), "A2:R");

    let { Client_Name, Type, Amount_To_Be_Paid, january, february, march, april, may, june, july, august, september, october, november, december, Due_Payment } = updatedRow;

    Client_Name = sanitizeInput(Client_Name);
    Type = sanitizeInput(Type);
    Amount_To_Be_Paid = parseFloat(Amount_To_Be_Paid);
    Due_Payment = parseFloat(Due_Payment);

    const months = [january, february, march, april, may, june, july, august, september, october, november, december];
    const sanitizedMonths = months.map((month) => (month ? sanitizeInput(month.toString()) : ""));

    if (isNaN(Amount_To_Be_Paid) || Amount_To_Be_Paid <= 0) {
      return res.status(400).json({ error: `Invalid Amount_To_Be_Paid for ${Client_Name}` });
    }

    const amountToBePaid = Amount_To_Be_Paid;
    const activeMonths = sanitizedMonths.filter((m) => m && parseFloat(m) >= 0).length;
    const expectedPayment = amountToBePaid * activeMonths;
    const totalPayments = sanitizedMonths.reduce((sum, m) => sum + (parseFloat(m) || 0), 0);
    const currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);

    const updatedRowData = [
      req.user.username,
      Client_Name,
      Type,
      amountToBePaid,
      ...sanitizedMonths,
      currentYearDuePayment.toFixed(2),
    ];

    const existingIndex = payments.findIndex(
      (payment) => payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type
    );

    if (existingIndex !== -1) {
      payments[existingIndex] = updatedRowData;
      const range = `${getPaymentSheetName(year)}!A${existingIndex + 2}:R${existingIndex + 2}`;
      await updateSheet(range, [updatedRowData]);
    } else {
      payments.push(updatedRowData);
      await appendSheet(getPaymentSheetName(year), [updatedRowData]);
    }

    res.status(200).json({ message: "Payment updated successfully", updatedRow: updatedRowData });
  } catch (error) {
    console.error("Save payment error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get User Years
app.get("/api/get-user-years", authenticateToken, async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const paymentSheets = spreadsheet.data.sheets
      .filter((sheet) => sheet.properties.title.startsWith("Payments_"))
      .map((sheet) => sheet.properties.title);

    const userYears = [];

    for (const sheetName of paymentSheets) {
      const year = sheetName.split("_")[1];
      if (parseInt(year) < 2025) continue;

      try {
        const payments = await readSheet(sheetName, "A2:R");
        const userHasData = payments.some((row) => {
          if (!row || row.length === 0 || !row[0]) return false;
          const isUserRow = row[0].toString().trim() === req.user.username;
          if (!isUserRow) return false;
          const hasClientData = row[1] && row[1].toString().trim() !== "";
          const hasAmountData = row[3] && !isNaN(parseFloat(row[3])) && parseFloat(row[3]) > 0;
          const hasMonthlyData = row
            .slice(4, 16)
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
  try {
    const headers = [
      "User",
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
    const sheetName = getPaymentSheetName(year);
    const currentYear = new Date().getFullYear().toString();
    const currentSheetName = getPaymentSheetName(currentYear);

    await ensureSheet("Payments", headers, currentYear);
    const currentPayments = await readSheet(currentSheetName, "A2:R");
    const hasCurrentData = currentPayments.some(
      (payment) => payment[0] === req.user.username && payment[1] && payment[3] && parseFloat(payment[3]) > 0
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
      const payments = await readSheet(sheetName, "A2:R");
      const hasUserData = payments.some((payment) => payment[0] === req.user.username);
      if (hasUserData) {
        return res.status(200).json({ message: "Sheet already exists with user data" });
      }
    }

    await ensureSheet("Payments", headers, year);
    await ensureSheet("Clients", ["User", "Client_Name", "Email", "Type", "Monthly_Payment"]);
    const clients = await readSheet("Clients", "A2:E");
    const userClients = clients.filter((client) => client[0] === req.user.username);

    const newPayments = userClients.map((client) => [
      req.user.username,
      client[1],
      client[3],
      parseFloat(client[4]) || 0,
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
app.post("/api/import-csv", authenticateToken, async (req, res) => {
  const csvData = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  if (!Array.isArray(csvData)) {
    return res.status(400).json({ error: "CSV data must be an array" });
  }
  try {
    await ensureSheet("Clients", ["User", "Client_Name", "Email", "Type", "Monthly_Payment"]);
    await ensureSheet(
      "Payments",
      [
        "User",
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
      year
    );
    let clients = await readSheet("Clients", "A2:E");
    let payments = await readSheet(getPaymentSheetName(year), "A2:R");

    const clientsBatch = [];
    const paymentsBatch = [];

    for (const record of csvData) {
      let { Client_Name, Type, Email, Amount_To_Be_Paid } = record;
      Client_Name = sanitizeInput(Client_Name || "Unknown Client");
      Type = sanitizeInput(Type || "Unknown Type");
      Email = Email ? sanitizeInput(Email) : "";
      Amount_To_Be_Paid = parseFloat(Amount_To_Be_Paid);
      if (isNaN(Amount_To_Be_Paid) || Amount_To_Be_Paid <= 0) {
        continue;
      }
      if (Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Email)) {
        continue;
      }
      if (!["GST", "IT Return"].includes(Type)) {
        continue;
      }
      const clientExists = clients.some(
        (client) => client[0] === req.user.username && client[1] === Client_Name && client[3] === Type
      );
      if (!clientExists) {
        clientsBatch.push([req.user.username, Client_Name, Email, Type, Amount_To_Be_Paid]);
        clients.push([req.user.username, Client_Name, Email, Type, Amount_To_Be_Paid]);
      }
      const paymentExists = payments.some(
        (payment) => payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type
      );
      if (!paymentExists) {
        paymentsBatch.push([
          req.user.username,
          Client_Name,
          Type,
          Amount_To_Be_Paid,
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
        payments.push([
          req.user.username,
          Client_Name,
          Type,
          Amount_To_Be_Paid,
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
      }
    }

    if (clientsBatch.length > 0) {
      await appendSheet("Clients", clientsBatch);
    }
    if (paymentsBatch.length > 0) {
      await appendSheet(getPaymentSheetName(year), paymentsBatch);
    }

    res.status(200).json({ message: "CSV data imported successfully" });
  } catch (error) {
    console.error("Import CSV error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update Client
app.put("/api/update-client", authenticateToken, async (req, res) => {
  const { oldClient, newClient } = req.body;
  if (!oldClient || !newClient || !oldClient.Client_Name || !oldClient.Type || !newClient.Client_Name || !newClient.Type || !newClient.Amount_To_Be_Paid) {
    return res.status(400).json({ error: "All required fields must be provided" });
  }
  let { Client_Name: oldClientName, Type: oldType } = oldClient;
  let { Client_Name: newClientName, Type: newType, Amount_To_Be_Paid: newAmount } = newClient;
  oldClientName = sanitizeInput(oldClientName);
  oldType = sanitizeInput(oldType);
  newClientName = sanitizeInput(newClientName);
  newType = sanitizeInput(newType);
  const paymentValue = parseFloat(newAmount);
  if (isNaN(paymentValue) || paymentValue <= 0) {
    return res.status(400).json({ error: "Amount to be paid must be a positive number" });
  }
  if (!["GST", "IT Return"].includes(newType)) {
    return res.status(400).json({ error: 'Type must be either "GST" or "IT Return"' });
  }
  try {
    await ensureSheet("Clients", ["User", "Client_Name", "Email", "Type", "Monthly_Payment"]);
    let clients = await readSheet("Clients", "A2:E");
    const clientIndex = clients.findIndex(
      (client) => client[0] === req.user.username && client[1] === oldClientName && client[3] === oldType
    );
    if (clientIndex === -1) {
      return res.status(404).json({ error: "Client not found" });
    }

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const paymentSheets = spreadsheet.data.sheets
      .filter((sheet) => sheet.properties.title.startsWith("Payments_"))
      .map((sheet) => sheet.properties.title);

    const email = clients[clientIndex][2] || "";
    clients[clientIndex] = [req.user.username, newClientName, email, newType, paymentValue];
    await writeSheet("Clients", "A2:E", clients);

    for (const sheetName of paymentSheets) {
      await ensureSheet(
        "Payments",
        [
          "User",
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
        sheetName.split("_")[1]
      );
      let payments = await readSheet(sheetName, "A2:R");
      const paymentIndex = payments.findIndex(
        (payment) => payment[0] === req.user.username && payment[1] === oldClientName && payment[2] === oldType
      );
      if (paymentIndex !== -1) {
        const monthlyPayments = payments[paymentIndex].slice(4, 16);
        const duePayment = payments[paymentIndex][16] || "0";
        payments[paymentIndex] = [req.user.username, newClientName, newType, paymentValue, ...monthlyPayments, duePayment];
        await writeSheet(sheetName, "A2:R", payments);
      }
    }

    res.json({ message: "Client updated successfully" });
  } catch (error) {
    console.error("Update client error:", error.message);
    res.status(500).json({ error: "Internal server error" });
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));