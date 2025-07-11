const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const axios = require("axios");

// Import modular components
const config = require("./config");
const database = require("./db/mongo");
const { authenticateToken, setTokenCookie, clearTokenCookie } = require("./middleware/auth");
const { errorHandler, asyncHandler, notFoundHandler } = require("./middleware/errorHandler");
const { sendEmail, testEmailConfig } = require("./utils/email");
const { retryUltraMsg } = require("./utils/retryWithBackoff");
const { 
  sanitizeInput, 
  sanitizeEmail, 
  sanitizePhone, 
  sanitizeClientName, 
  sanitizeType, 
  validatePaymentAmount,
  sanitizeHtmlContent,
  validateInput 
} = require("./utils/sanitize");
const logger = require("./utils/logger");
const {
  calculateDuePayment,
  processPaymentUpdate,
  createPaymentDocument,
  isValidPaymentAmount,
  getMonthKey
} = require("./utils/paymentCalculations");

const app = express();

// Trust proxy for rate limiting
app.set("trust proxy", 1);

// CORS configuration
app.use(cors({
  origin: config.CORS_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Type"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

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
const globalLimiter = rateLimit(config.RATE_LIMITS.GLOBAL);
const paymentLimiter = rateLimit(config.RATE_LIMITS.PAYMENT);
const whatsappLimiter = rateLimit(config.RATE_LIMITS.WHATSAPP);

app.use(globalLimiter);
app.use("/api/save-payment", paymentLimiter);
app.use("/api/batch-save-payments", paymentLimiter);
app.use("/api/send-whatsapp", whatsappLimiter);

// Middleware
app.use(cookieParser());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Payment Tracker Backend is running!" });
});

// Import route modules
const authRoutes = require("./routes/auth");

// Mount routes
app.use("/api", authRoutes);

// Get Clients
app.get("/api/get-clients", authenticateToken, asyncHandler(async (req, res) => {
  logger.client(`Fetching clients for user: ${req.user.username}`, req.user.username);
  const db = await database.getDb();
  const clients = await database.getClientsCollection(req.user.username).find({}).toArray();
  
  const processedClients = clients.map(client => ({
    Client_Name: client.Client_Name || "",
    Email: client.Email || "",
    Type: client.Type || "",
    Amount_To_Be_Paid: parseFloat(client.Monthly_Payment) || 0,
    Phone_Number: client.Phone_Number || "",
    createdAt: client.createdAt || new Date(0).toISOString(),
  }));
  
  logger.client(`Returning ${processedClients.length} clients`, req.user.username);
  res.json(processedClients);
}));

// Add Client
app.post("/api/add-client", authenticateToken, asyncHandler(async (req, res) => {
  let { clientName, email, type, monthlyPayment, phoneNumber } = req.body;
  const username = req.user.username;
  const paymentValue = validatePaymentAmount(monthlyPayment);
  const createdAt = new Date().toISOString();
  
  if (!paymentValue) {
    throw new Error("Monthly payment must be a positive number");
  }
  
  const sanitizedClientName = sanitizeClientName(clientName);
  const sanitizedType = sanitizeType(type);
  const sanitizedEmail = sanitizeEmail(email);
  const sanitizedPhone = sanitizePhone(phoneNumber);
  
  if (!sanitizedClientName || !sanitizedType) {
    throw new Error("Client name and type are required");
  }
  
  try {
    const db = await database.getDb();
    const types = await database.getTypesCollection().find({ User: username }).toArray();
    const userTypes = types.map(t => t.Type);
    
    if (!userTypes.includes(sanitizedType)) {
      throw new Error(`Type must be one of: ${userTypes.join(", ")}`);
    }
    
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);
    
    const existingClient = await clientsCollection.findOne({ 
      Client_Name: sanitizedClientName, 
      Type: sanitizedType 
    });
    
    if (existingClient) {
      throw new Error("Client with this name and type already exists");
    }
    
    // Add client
    await clientsCollection.insertOne({
      Client_Name: sanitizedClientName,
      Email: sanitizedEmail,
      Type: sanitizedType,
      Monthly_Payment: paymentValue,
      Phone_Number: sanitizedPhone,
      createdAt: createdAt,
    });
    
    // Get existing years and create payment records using utility
    const existingYears = await paymentsCollection.distinct("Year");
    const yearsToCreate = existingYears.length > 0 ? existingYears : [2025];
    
    const paymentDocs = yearsToCreate.map(year => 
      createPaymentDocument(sanitizedClientName, sanitizedType, paymentValue, year, createdAt)
    );
    
    await paymentsCollection.insertMany(paymentDocs);
    
    logger.client(`Client added successfully with payment records for years: ${yearsToCreate.join(', ')}`, username);
    res.status(config.statusCodes.CREATED).json({ 
      message: "Client added successfully", 
      yearsCreated: yearsToCreate 
    });
  } catch (error) {
    logger.error("Add client error", error, { username });
    throw error;
  }
}));

// Get Payments by Year
app.get("/api/get-payments-by-year", authenticateToken, asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year || isNaN(year)) {
    throw new Error("Valid year is required");
  }
  const username = req.user.username;
  
  try {
    const db = await database.getDb();
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);
    
    // Get clients and payments in parallel for better performance
    const [clients, payments] = await Promise.all([
      clientsCollection.find({}).toArray(),
      paymentsCollection.find({ Year: parseInt(year) }).toArray()
    ]);
    
    // Create client maps for email/phone lookup
    const clientEmailMap = new Map(clients.map(c => [`${c.Client_Name}_${c.Type}`, c.Email || ""]));
    const clientPhoneMap = new Map(clients.map(c => [`${c.Client_Name}_${c.Type}`, c.Phone_Number || ""]));
    
    let processedPayments = payments;
    
    // Handle previous year due payments
    if (parseInt(year) > 2025) {
      const prevYearPayments = await paymentsCollection.find({ Year: parseInt(year) - 1 }).toArray();
      const prevYearDueMap = new Map(prevYearPayments.map(p => [`${p.Client_Name}_${p.Type}`, parseFloat(p.Due_Payment) || 0]));
      
      processedPayments = payments.map(p => {
        const prevDue = prevYearDueMap.get(`${p.Client_Name}_${p.Type}`) || 0;
        return { ...p, Previous_Year_Due: prevDue };
      });
    }
    
    // Process payments using centralized calculation utility
    const finalPayments = processedPayments.map(payment => {
      const amountToBePaid = parseFloat(payment.Amount_To_Be_Paid) || 0;
      const previousYearDue = parseFloat(payment.Previous_Year_Due) || 0;
      
      // Use centralized due payment calculation
      const totalDuePayment = calculateDuePayment(payment, previousYearDue);
      
      return {
        Client_Name: payment.Client_Name || "",
        Type: payment.Type || "",
        Amount_To_Be_Paid: amountToBePaid,
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
        Due_Payment: totalDuePayment,
        Email: clientEmailMap.get(`${payment.Client_Name}_${payment.Type}`) || "",
        Phone_Number: clientPhoneMap.get(`${payment.Client_Name}_${payment.Type}`) || "",
        createdAt: payment.createdAt || new Date(0).toISOString(),
      };
    });
    
    logger.payment(`Fetched ${finalPayments.length} payments for ${year}`, username);
    res.json(finalPayments);
  } catch (error) {
    logger.error(`Get payments for year ${year} error`, error, { username, year });
    throw error;
  }
}));

// Save Payment
app.post("/api/save-payment", authenticateToken, paymentLimiter, asyncHandler(async (req, res) => {
  const { clientName, type, month, value } = req.body;
  const year = req.query.year || new Date().getFullYear().toString();
  const username = req.user.username;
  
  logger.payment("Save payment request", username, { clientName, type, month, value, year });

  if (!clientName || !type || !month) {
    throw new Error("Client name, type, and month are required");
  }

  const numericValue = value !== "" && value !== null && value !== undefined ? parseFloat(value) : 0;
  if (!isValidPaymentAmount(numericValue)) {
    throw new Error("Invalid payment value");
  }

  const monthKey = getMonthKey(month);
  if (!monthKey) {
    throw new Error("Invalid month");
  }

  try {
    const db = await database.getDb();
    const paymentsCollection = database.getPaymentsCollection(username);
    const payment = await paymentsCollection.findOne({ 
      Client_Name: clientName, 
      Type: type, 
      Year: parseInt(year) 
    });
    
    if (!payment) {
      throw new Error("Payment record not found");
    }

    const updatedPayments = { 
      ...payment.Payments, 
      [monthKey]: numericValue === 0 ? "" : numericValue.toString() 
    };

    // Get previous year payment for due calculation
    let prevYearPayment = null;
    if (parseInt(year) > 2025) {
      prevYearPayment = await paymentsCollection.findOne({
        Client_Name: clientName,
        Type: type,
        Year: parseInt(year) - 1,
      });
    }

    // Use centralized payment update utility
    const updatedPayment = processPaymentUpdate(payment, updatedPayments, parseInt(year), prevYearPayment);

    await paymentsCollection.updateOne(
      { Client_Name: clientName, Type: type, Year: parseInt(year) },
      { $set: { Payments: updatedPayments, Due_Payment: updatedPayment.Due_Payment, Last_Updated: new Date() } }
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
    };

    logger.payment("Payment updated successfully", username, { clientName, monthKey, numericValue, finalDuePayment: updatedPayment.Due_Payment });
    res.json({ message: "Payment updated successfully", updatedRow });
  } catch (error) {
    logger.error("Save payment error", error, { username, clientName, type, month, year });
    throw error;
  }
}));

// Send Email
app.post("/api/send-email", authenticateToken, asyncHandler(async (req, res) => {
  const { to, subject, html } = req.body;
  
  if (!to || !subject || !html) {
    throw new Error("Recipient email, subject, and HTML content are required");
  }
  
  if (!validateInput.email(to)) {
    throw new Error("Invalid recipient email address");
  }

  try {
    const result = await sendEmail({ to, subject, html });
    logger.email("Email sent successfully", { to, subject, messageId: result.messageId });
    res.json({ message: "Email sent successfully", messageId: result.messageId });
  } catch (error) {
    logger.error("Send email error", error, { to, subject });
    throw error;
  }
}));

// Send WhatsApp
app.post("/api/send-whatsapp", authenticateToken, whatsappLimiter, asyncHandler(async (req, res) => {
  const { to, message } = req.body;
  
  if (!to || !message) {
    throw new Error("Recipient phone number and message are required");
  }
  
  if (!validateInput.phone(to)) {
    throw new Error("Invalid recipient phone number");
  }
  
  try {
    let formattedPhone = to.trim().replace(/[\s-]/g, "");
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = `+91${formattedPhone.replace(/\D/g, "")}`;
    }
    
    const payload = {
      token: config.ULTRAMSG_TOKEN,
      to: formattedPhone,
      body: message,
    };
    
    const response = await retryUltraMsg(() =>
      axios.post(
        `${config.API.ULTRA_MSG_BASE_URL}/${config.ULTRAMSG_INSTANCE_ID}/messages/chat`,
        new URLSearchParams(payload).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: config.API.TIMEOUT,
        }
      )
    );
    
    logger.whatsapp("UltraMsg API response", {
      to: formattedPhone,
      status: response.status,
      data: response.data,
      user: req.user.username,
    });
    
    if (response.status === 200 && (response.data.status === "success" || response.data.sent === "true" || response.data.messageId)) {
      logger.whatsapp(`WhatsApp message sent successfully to ${formattedPhone}`, {
        messageId: response.data.messageId || "N/A",
        status: response.data.status || response.status,
        user: req.user.username,
      });
      return res.json({ message: "WhatsApp message sent successfully", messageId: response.data.messageId || "N/A" });
    } else {
      throw new Error(`Unexpected response from WhatsApp API: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    logger.error("Send WhatsApp error", error, { to, user: req.user.username });
    throw error;
  }
}));

// Test SMTP
app.get("/api/test-smtp", asyncHandler(async (req, res) => {
  const result = await testEmailConfig();
  res.json(result);
}));

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = config.PORT;
app.listen(PORT, async () => {
  try {
    await database.connect();
    logger.info(`Server running on port ${PORT}`);
  } catch (error) {
    logger.error("Failed to connect to MongoDB", error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await database.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await database.close();
  process.exit(0);
}); 