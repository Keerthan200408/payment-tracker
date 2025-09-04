const { sanitizeMongoQuery, createSafeQuery, sanitizeUpdateObject } = require('./utils/mongoSanitizer');

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");
const axios = require("axios");
const { MongoClient } = require("mongodb");

// Import centralized utilities and middleware
const config = require("./config");
const { authenticateToken, generateToken, setTokenCookie, clearTokenCookie } = require("./middleware/auth");
const { errorHandler, asyncHandler, AppError, ValidationError } = require("./middleware/errorHandler");
const coopCoepMiddleware = require("./middleware/coopCoep");
const { globalLimiter, paymentLimiter, whatsappLimiter, authLimiter } = require("./middleware/rateLimiter");
const { sanitizeInput, sanitizeEmail, sanitizeUsername, sanitizeClientName, sanitizeType, validatePaymentAmount } = require("./utils/sanitize");
const { calculateDuePaymentWithPreviousYear, processPaymentUpdate, createPaymentDocument, getMonthKey } = require("./utils/paymentCalculations");
const { retryWithBackoff } = require("./utils/retryWithBackoff");
const notificationsRouter = require("./routes/notifications");

require("dotenv").config();

const app = express();
const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);
const mongoClient = new MongoClient(config.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.set("trust proxy", 1);

// CORS configuration using centralized config
app.use(
  cors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.options("*", cors());

// Use centralized COOP/COEP middleware
app.use(coopCoepMiddleware);

// Use centralized rate limiting
app.use(globalLimiter);
app.use("/api/save-payment", paymentLimiter);
app.use("/api/batch-save-payments", paymentLimiter);
app.use("/api/send-whatsapp", whatsappLimiter);
app.use("/api/google-signin", authLimiter);
app.use("/api/google-signup", authLimiter);
app.use("/api/login", authLimiter);
app.use("/api/signup", authLimiter);

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/clients", require("./routes/clients"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/utilities", require("./routes/utilities"));
app.use("/api/notifications", notificationsRouter);

// Cookie parser and JSON parsing
app.use(cookieParser());
app.use(express.json());

// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: config.EMAIL_HOST,
  port: config.EMAIL_PORT,
  secure: config.EMAIL_SECURE,
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_PASS,
  },
  logger: true,
  debug: config.NODE_ENV === 'development',
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

// MongoDB connection helper
async function connectMongo() {
  if (!mongoClient.topology || !mongoClient.topology.isConnected()) {
    await mongoClient.connect();
  }
  return mongoClient.db("payment_tracker");
}

// Google Sign-In
app.post("/api/google-signin", asyncHandler(async (req, res) => {
  console.log("Received /api/google-signin request");
  const { googleToken } = req.body;
  
  if (!googleToken) {
    throw new ValidationError("Google token is required");
  }
  
  const ticket = await googleClient.verifyIdToken({
    idToken: googleToken,
    audience: config.GOOGLE_CLIENT_ID,
  });
  
  const payload = ticket.getPayload();
  const email = payload.email;

  const db = await connectMongo();
  const users = db.collection("users");
  const user = await users.findOne({ $or: [{ GoogleEmail: email }, { Username: email }] });
  
  if (user) {
    const username = user.Username;
    const sessionToken = generateToken({ username });
    setTokenCookie(res, sessionToken);
    return res.json({ username, sessionToken });
  } else {
    return res.json({ needsUsername: true });
  }
}));

// Google Signup
app.post("/api/google-signup", asyncHandler(async (req, res) => {
  console.log("Received /api/google-signup request");
  let { email, username } = req.body;
  
  if (!email || !username) {
    throw new ValidationError("Email and username are required");
  }
  
  username = sanitizeUsername(username);
  email = sanitizeEmail(email);
  
  if (!username) {
    throw new ValidationError("Username must be between 3 and 50 characters");
  }
  
  const db = await connectMongo();
  const users = db.collection("users");
  const existingUser = await users.findOne({ $or: [{ Username: username }, { GoogleEmail: email }] });
  
  if (existingUser) {
    throw new ValidationError(
      existingUser.Username === username ? "Username already exists" : "Google account already linked"
    );
  }
  
  await users.insertOne({ Username: username, Password: null, GoogleEmail: email });
  const sessionToken = generateToken({ username });
  setTokenCookie(res, sessionToken);
  res.json({ username, sessionToken });
}));

// Signup
app.post("/api/signup", asyncHandler(async (req, res) => {
  let { username, password } = req.body;
  
  if (!username || !password) {
    throw new ValidationError("All fields are required");
  }
  
  username = sanitizeUsername(username);
  if (!username) {
    throw new ValidationError("Username must be between 3 and 50 characters");
  }
  
  if (password.length < config.VALIDATION.PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Password must be at least ${config.VALIDATION.PASSWORD_MIN_LENGTH} characters`);
  }
  
  const db = await connectMongo();
  const users = db.collection("users");
  const existingUser = await users.findOne({ Username: username });
  
  if (existingUser) {
    throw new ValidationError("Username already exists");
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  await users.insertOne({ Username: username, Password: hashedPassword, GoogleEmail: null });
  res.status(config.statusCodes.CREATED).json({ message: "Account created successfully" });
}));

// Login
app.post("/api/login", asyncHandler(async (req, res) => {
  let { username, password } = req.body;
  
  if (!username || !password) {
    throw new ValidationError("Username and password are required");
  }
  
  username = sanitizeUsername(username);
  
  const db = await connectMongo();
  const users = db.collection("users");
  const user = await users.findOne({ Username: username });
  
  if (!user || !user.Password || !(await bcrypt.compare(password, user.Password))) {
    throw new AppError("Invalid credentials", config.statusCodes.UNAUTHORIZED);
  }
  
  const sessionToken = generateToken({ username });
  setTokenCookie(res, sessionToken);
  res.json({ username, sessionToken });
}));

// Logout
app.post("/api/logout", (req, res) => {
  clearTokenCookie(res);
  res.json({ message: "Logged out successfully" });
});

// Refresh Token
app.post("/api/refresh-token", asyncHandler(async (req, res) => {
  let token = req.cookies?.sessionToken;
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }
  
  if (!token) {
    throw new AppError("No token provided", config.statusCodes.UNAUTHORIZED);
  }
  
  let decoded;
  try {
    decoded = jwt.verify(token, config.SECRET_KEY);
  } catch (err) {
    decoded = jwt.decode(token);
    if (!decoded || !decoded.username) {
      throw new AppError("Invalid token", config.statusCodes.FORBIDDEN);
    }
  }
  
  const db = await connectMongo();
  const users = db.collection("users");
  const user = await users.findOne({ Username: decoded.username });
  
  if (!user) {
    throw new AppError("User not found", config.statusCodes.FORBIDDEN);
  }
  
  const newToken = generateToken({ username: decoded.username });
  setTokenCookie(res, newToken);
  res.json({ username: decoded.username, sessionToken: newToken });
}));

// Get Clients
app.get("/api/get-clients", authenticateToken, asyncHandler(async (req, res) => {
  console.log(`Fetching clients for user: ${req.user.username}`);
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
  
  console.log(`Returning ${processedClients.length} clients`);
  res.json(processedClients);
}));

// Add Client
app.post("/api/add-client", authenticateToken, asyncHandler(async (req, res) => {
  let { clientName, email, type, monthlyPayment, phoneNumber } = req.body;
  const username = req.user.username;
  const paymentValue = validatePaymentAmount(monthlyPayment);
  const createdAt = new Date().toISOString();
  
  if (!clientName || !type || !monthlyPayment) {
    throw new ValidationError("Client name, type, and monthly payment are required");
  }
  
  if (!paymentValue) {
    throw new ValidationError("Monthly payment must be a positive number within allowed limits");
  }
  
  clientName = sanitizeClientName(clientName);
  type = sanitizeType(type);
  email = email ? sanitizeEmail(email) : "";
  phoneNumber = phoneNumber ? sanitizeInput(phoneNumber) : "";
  
  if (!clientName) {
    throw new ValidationError("Invalid client name");
  }
  
  if (!type) {
    throw new ValidationError("Invalid type");
  }
  
  const db = await connectMongo();
  const types = await db.collection("types").find({ User: username }).toArray();
  const userTypes = types.map(t => t.Type);
  
  if (!userTypes.includes(type)) {
    throw new ValidationError(`Type must be one of: ${userTypes.join(", ")}`);
  }
  
  const clientsCollection = db.collection(`clients_${username}`);
  const paymentsCollection = db.collection(`payments_${username}`);
  
  const existingClient = await clientsCollection.findOne(createSafeQuery(clientName, type, parseInt(year)));
  if (existingClient) {
    throw new ValidationError("Client with this name and type already exists");
  }
  
  // Add client to clients collection
  await clientsCollection.insertOne({
    Client_Name: clientName,
    Email: email,
    Type: type,
    Monthly_Payment: paymentValue,
    Phone_Number: phoneNumber,
    createdAt: createdAt,
  });
  
  // Get all existing years
  const existingYears = await paymentsCollection.distinct("Year");
  const yearsToCreate = existingYears.length > 0 ? existingYears : [2025];
  
  // Create payment records using centralized utility
  const paymentDocs = yearsToCreate.map(year => 
    createPaymentDocument(clientName, type, paymentValue, year, createdAt)
  );
  
  await paymentsCollection.insertMany(paymentDocs);
  
  console.log(`Client added successfully with payment records for years: ${yearsToCreate.join(', ')}`);
  res.status(config.statusCodes.CREATED).json({ 
    message: "Client added successfully", 
    yearsCreated: yearsToCreate 
  });
}));

// Get Payments by Year
app.get("/api/get-payments-by-year", authenticateToken, asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year || isNaN(year)) {
    throw new ValidationError("Valid year is required");
  }
  
  const username = req.user.username;
  const db = await connectMongo();
  const clientsCollection = db.collection(`clients_${username}`);
  const paymentsCollection = db.collection(`payments_${username}`);
  
  // Get clients for email/phone mapping
  const clients = await clientsCollection.find({}).toArray();
  const clientEmailMap = new Map(clients.map(c => [`${c.Client_Name}_${c.Type}`, c.Email || ""]));
  const clientPhoneMap = new Map(clients.map(c => [`${c.Client_Name}_${c.Type}`, c.Phone_Number || ""]));
  
  // Get payments for the year
  const yearInt = parseInt(year);
if (isNaN(yearInt)) {
  throw new ValidationError("Invalid year parameter");
}
let payments = await paymentsCollection.find({ Year: yearInt }).toArray();
  
  // Handle previous year due payments
  if (parseInt(year) > 2025) {
    const prevYearPayments = await paymentsCollection.find({ Year: parseInt(year) - 1 }).toArray();
    const prevYearDueMap = new Map(prevYearPayments.map(p => [`${p.Client_Name}_${p.Type}`, parseFloat(p.Due_Payment) || 0]));
    
    payments = payments.map(p => {
      const prevDue = prevYearDueMap.get(`${p.Client_Name}_${p.Type}`) || 0;
      return { ...p, Previous_Year_Due: prevDue };
    });
  }
  
  // Process payments with centralized calculation
  const processedPayments = payments.map(payment => {
    const amountToBePaid = parseFloat(payment.Amount_To_Be_Paid) || 0;
    const duePayment = calculateDuePaymentWithPreviousYear(payment, 
      payment.Previous_Year_Due ? { Due_Payment: payment.Previous_Year_Due } : null
    );
    
    // Find client data
    const client = clients.find(c => c.Client_Name === payment.Client_Name);
    
    return {
      Client_Name: payment.Client_Name || "",
      Type: payment.Type || "",
      Amount_To_Be_Paid: amountToBePaid,
      Email: client?.Email || "",
      Phone_Number: client?.Phone_Number || "",
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
      Due_Payment: duePayment,
      Email: clientEmailMap.get(`${payment.Client_Name}_${payment.Type}`) || "",
      Phone_Number: clientPhoneMap.get(`${payment.Client_Name}_${payment.Type}`) || "",
      Remarks: payment.Remarks || {},
      createdAt: payment.createdAt || new Date(0).toISOString(),
    };
  });
  
  console.log(`Fetched ${processedPayments.length} payments for ${year} for user ${username}`);
  res.json(processedPayments);
}));

// Save Payment
app.post("/api/save-payment", authenticateToken, asyncHandler(async (req, res) => {
  console.log("=== SAVE PAYMENT ENDPOINT HIT ===");
  const { clientName, type, month, value } = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  const username = req.user.username;
  
  console.log("Save payment request:", { clientName, type, month, value, year, user: username });

  if (!clientName || !type || !month) {
    throw new ValidationError("Client name, type, and month are required");
  }

  // Validate payment amount if provided
  let numericValue = 0;
  if (value !== "" && value !== null && value !== undefined) {
    numericValue = parseFloat(value);
    if (isNaN(numericValue) || numericValue < 0) {
      throw new ValidationError("Payment value must be a non-negative number");
    }
  }

  const monthKey = getMonthKey(month);
  if (!monthKey) {
    throw new ValidationError("Invalid month");
  }

  const db = await connectMongo();
  const paymentsCollection = db.collection(`payments_${username}`);
  const clientsCollection = db.collection(`clients_${username}`);
  
  const [payment, client] = await Promise.all([
    paymentsCollection.findOne(createSafeQuery(clientName, type, parseInt(year))),
    clientsCollection.findOne({ 
      Client_Name: clientName
    })
  ]);
  
  console.log("Client lookup result:", {
    clientName,
    clientFound: !!client,
    clientData: client,
    email: client?.Email,
    phone: client?.Phone_Number
  });
  
  if (!payment) {
    throw new AppError("Payment record not found", config.statusCodes.NOT_FOUND);
  }

  // Handle empty value (de-entering)
  const finalValue = value === "" || value === null || value === undefined ? "" : numericValue.toString();
  let updatedPayments = { ...payment.Payments, [monthKey]: finalValue };
  
  // Sequential month filling logic
  if (finalValue !== "") {
    const currentMonthIndex = config.months.indexOf(monthKey);
    
    let hasStarted = false;
    for (let i = 0; i < config.months.length; i++) {
      const monthValue = updatedPayments[config.months[i]];
      const hasValue = monthValue !== "" && monthValue !== null && monthValue !== undefined;
      
      if (hasValue || i === currentMonthIndex) {
        hasStarted = true;
      }
      
      if (hasStarted && !hasValue && i < currentMonthIndex) {
        updatedPayments[config.months[i]] = "0";
      }
    }
  }
  
  // Get previous year payment for due calculation
  let prevYearPayment = null;
  if (parseInt(year) > 2025) {
    prevYearPayment = await paymentsCollection.findOne(createSafeQuery(clientName, type, parseInt(year)) - 1);
  }
  
  // Use centralized payment processing
  const updatedPayment = processPaymentUpdate(payment, updatedPayments, parseInt(year), prevYearPayment);
  
  await paymentsCollection.updateOne(
    createSafeQuery(clientName, type, parseInt(year)),
    { $set: { 
      Payments: updatedPayment.Payments, 
      Due_Payment: updatedPayment.Due_Payment, 
      Last_Updated: updatedPayment.Last_Updated 
    }}
  );

  const updatedRow = {
    Client_Name: payment.Client_Name,
    Type: payment.Type,
    Amount_To_Be_Paid: parseFloat(payment.Amount_To_Be_Paid) || 0,
    january: updatedPayments.January || "",
    february: updatedPayments.February || "",
    march: updatedPayments.March || "",
    april: updatedPayments.April || "",
    may: updatedPayments.May || "",
    june: updatedPayments.June || "",
    july: updatedPayments.July || "",
    august: updatedPayments.August || "",
    september: updatedPayments.September || "",
    october: updatedPayments.October || "",
    november: updatedPayments.November || "",
    december: updatedPayments.December || "",
    Due_Payment: updatedPayment.Due_Payment,
    Email: client?.Email || "",
    Phone_Number: client?.Phone_Number || ""
  };

  console.log("Final response being sent:", {
    hasClient: !!client,
    email: client?.Email,
    phone: client?.Phone_Number,
    updatedRowEmail: updatedRow.Email,
    updatedRowPhone: updatedRow.Phone_Number
  });
  console.log("Payment saved successfully:", updatedRow);
  res.json({ updatedRow });
}));

// Global error handler
app.use(errorHandler);

// Start server
const PORT = config.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
