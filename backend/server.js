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
app.use(globalLimiter);
app.use("/api/save-payment", paymentLimiter);

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
        const delayMs = Math.pow(2, retryCount) * 2000 + Math.random() * 100;
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
    console.log(`Fetching clients for user: ${req.user.username}`);
    
    const headers = ["User", "Client_Name", "Email", "Type", "Monthly_Payment"];
    await ensureSheet("Clients", headers);
    
    const clients = await readSheet("Clients", "A2:E");
    if (!clients) {
      return res.json([]);
    }
    
    const userClients = clients.filter((client) => 
      client && client[0] === req.user.username
    );

    const processedClients = userClients.map((client) => {
      if (!client || client.length < headers.length) {
        console.warn(`Invalid client row:`, client);
        return null;
      }
      return {
        User: client[0] || "",
        Client_Name: client[1] || "",
        Email: client[2] || "",
        Type: client[3] || "",
        Amount_To_Be_Paid: parseFloat(client[4]) || 0,
      };
    }).filter(Boolean);

    console.log(`Returning ${processedClients.length} clients`);
    res.json(processedClients);
    
  } catch (error) {
    console.error(`Get clients error:`, error);
    res.status(500).json({ 
      error: `Failed to fetch clients: ${error.message}`,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
// Add Client
app.post("/api/add-client", authenticateToken, async (req, res) => {
  let { clientName, email, type, monthlyPayment } = req.body;
  const year = new Date().getFullYear().toString();
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
  type = sanitizeInput(type);
  email = email ? sanitizeInput(email) : "";
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
    const clientIndex = clients.findIndex(
      (client) => client[0] === req.user.username && client[1] === Client_Name && client[3] === Type
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
                ranges: ["Clients"],
              })).data.sheets.find(s => s.properties.title === "Clients").properties.sheetId,
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
        (payment) => payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type
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

    let processedPayments = userPayments.map((payment) => {
      // Validate array length to prevent index errors
      if (!payment || payment.length < headers.length) {
        console.warn(`Invalid payment row for user ${req.user.username} in year ${year}:`, payment);
        return null;
      }
      return {
        User: payment[0] || "",
        Client_Name: payment[1] || "",
        Type: payment[2] || "",
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
      };
    }).filter((p) => p !== null); // Remove invalid rows

    if (parseInt(year) > 2025) {
      const calculateCumulativeDue = async (targetYear) => {
        if (parseInt(targetYear) <= 2025) {
          try {
            const payments = await readSheet(getPaymentSheetName(targetYear), "A2:R");
            const userPayments = payments.filter((p) => p[0] === req.user.username);
            const dueMap = new Map();
            userPayments.forEach((payment) => {
              if (payment.length < headers.length) return;
              const key = `${payment[1]}_${payment[2]}`;
              dueMap.set(key, parseFloat(payment[16]) || 0);
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
          const payments = await readSheet(getPaymentSheetName(targetYear), "A2:R");
          const userPayments = payments.filter((p) => p[0] === req.user.username);
          const cumulativeMap = new Map();
          userPayments.forEach((payment) => {
            if (payment.length < headers.length) return;
            const key = `${payment[1]}_${payment[2]}`;
            const currentDue = parseFloat(payment[16]) || 0;
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
        // Continue with current year's data instead of failing
      }
    }

    console.log(`Fetched ${processedPayments.length} payments for ${year} for user ${req.user.username}`);
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
  
  // Enhanced logging for debugging
  console.log("Save payment request:", {
    clientName,
    type,
    month,
    value,
    year,
    user: req.user?.username
  });

  // Improved validation
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

    const monthMap = {
      january: 4,
      february: 5,
      march: 6,
      april: 7,
      may: 8,
      june: 9,
      july: 10,
      august: 11,
      september: 12,
      october: 13,
      november: 14,
      december: 15,
    };

    const monthLower = month.toLowerCase();
    if (!monthMap[monthLower]) {
      console.error("Invalid month:", month);
      return res.status(400).json({ error: "Invalid month" });
    }

    // Ensure sheet exists
    await ensureSheet("Payments", headers, year);
    console.log("Sheet ensured for year:", year);

    // Read payments with error handling
    let payments;
    try {
      payments = await readSheet(getPaymentSheetName(year), "A2:R");
      console.log("Read payments, count:", payments?.length || 0);
    } catch (sheetError) {
      console.error("Error reading sheet:", sheetError.message);
      return res.status(500).json({ error: "Failed to read payment data" });
    }

    // Find payment record
    const paymentIndex = payments.findIndex(
      (p) => p[0] === req.user.username && p[1] === clientName && p[2] === type
    );

    if (paymentIndex === -1) {
      console.error("Payment record not found:", {
        user: req.user.username,
        clientName,
        type
      });
      return res.status(404).json({ error: "Payment record not found" });
    }

    console.log("Found payment at index:", paymentIndex);

    // Create a copy of the payment row
    const paymentRow = [...payments[paymentIndex]];
    
    // Ensure all array positions exist
    while (paymentRow.length < 17) {
      paymentRow.push("");
    }

    // Update the specific month value
    paymentRow[monthMap[monthLower]] = value || "";
    console.log("Updated row for month", month, "with value:", value);

    // Calculate due payment
    const amountToBePaid = parseFloat(paymentRow[3]) || 0;
if (isNaN(amountToBePaid)) {
  console.error("Invalid Amount_To_Be_Paid:", paymentRow[3]);
  return res.status(500).json({ error: "Invalid payment data in sheet" });
}
console.log("Payment row before update:", paymentRow);
    const activeMonths = paymentRow.slice(4, 16).filter((m) => m && parseFloat(m) >= 0).length;
    const expectedPayment = amountToBePaid * activeMonths;
    const totalPayments = paymentRow.slice(4, 16).reduce((sum, m) => sum + (parseFloat(m) || 0), 0);
    let currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);

    // Handle previous year cumulative due
    let prevYearCumulativeDue = 0;
if (parseInt(year) > 2025) {
  const prevYear = (parseInt(year) - 1).toString();
  try {
    console.log(`Fetching previous year data for ${prevYear}`);
    const prevPayments = await readSheet(getPaymentSheetName(prevYear), "A2:R");
    const prevPayment = prevPayments.find(
      (p) => p[0] === req.user.username && p[1] === clientName && p[2] === type
    );
    prevYearCumulativeDue = prevPayment && prevPayment[16] ? parseFloat(prevPayment[16]) || 0 : 0;
    console.log(`Previous year ${prevYear} cumulative due: ${prevYearCumulativeDue}`);
  } catch (error) {
    console.warn(`No data found for previous year ${prevYear}:`, error.message);
    prevYearCumulativeDue = 0;
  }
}

    paymentRow[16] = (currentYearDuePayment + prevYearCumulativeDue).toFixed(2);

    // Update the payments array
    payments[paymentIndex] = paymentRow;

    // Update the sheet
    const range = `${getPaymentSheetName(year)}!A${paymentIndex + 2}:R${paymentIndex + 2}`;
    
    try {
      await updateSheet(range, [paymentRow]);
      console.log("Successfully updated sheet range:", range);
    } catch (updateError) {
      console.error("Error updating sheet:", updateError.message);
      return res.status(500).json({ error: "Failed to update payment data" });
    }

    // Prepare response
    const updatedRow = {
      User: paymentRow[0],
      Client_Name: paymentRow[1],
      Type: paymentRow[2],
      Amount_To_Be_Paid: parseFloat(paymentRow[3]) || 0,
      january: paymentRow[4] || "",
      february: paymentRow[5] || "",
      march: paymentRow[6] || "",
      april: paymentRow[7] || "",
      may: paymentRow[8] || "",
      june: paymentRow[9] || "",
      july: paymentRow[10] || "",
      august: paymentRow[11] || "",
      september: paymentRow[12] || "",
      october: paymentRow[13] || "",
      november: paymentRow[14] || "",
      december: paymentRow[15] || "",
      Due_Payment: parseFloat(paymentRow[16]) || 0,
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
      user: req.user?.username
    });
    res.status(500).json({ error: `Failed to save payment: ${error.message}` });
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
  if (clientName.length > 100 || type.length > 50) {
  return res.status(400).json({ error: "Client name or type too long" });
}
if (paymentValue > 1e6) {
  return res.status(400).json({ error: "Payment value too large" });
}
  if (!Array.isArray(csvData)) {
    return res.status(400).json({ error: "Amount to be paid too large" });
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