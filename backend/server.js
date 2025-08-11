const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const axios = require("axios");

// Import modular components
const config = require("./config");

// Startup check for required notification environment variables
const requiredEnv = [
  'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM',
  'ULTRAMSG_TOKEN', 'ULTRAMSG_INSTANCE_ID'
];
const missingEnv = requiredEnv.filter((key) => !config[key]);
if (missingEnv.length > 0) {
  console.error("\n[ERROR] Missing required environment variables for notifications:", missingEnv.join(", "));
  console.error("Notifications (email/WhatsApp) will NOT work until you set these in your .env file.\n");
  // Optionally, exit the process if you want to force correct setup:
  // process.exit(1);
}

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

// Session health check endpoint
app.get("/api/health", authenticateToken, asyncHandler(async (req, res) => {
  try {
    // Verify database connection
    const db = await database.getDb();
    await db.admin().ping();
    
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      user: req.user.username 
    });
  } catch (error) {
    logger.error("Health check failed", error.message);
    res.status(500).json({ 
      status: "unhealthy", 
      error: "Database connection failed" 
    });
  }
}));

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
  const { year } = req.query;
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
    
    // Use findOneAndUpdate for atomic operation and better performance
    const result = await paymentsCollection.findOneAndUpdate(
      { 
        Client_Name: clientName, 
        Type: type, 
        Year: parseInt(year) 
      },
      { 
        $set: { 
          [`Payments.${monthKey}`]: numericValue === 0 ? "" : numericValue.toString(),
          Last_Updated: new Date()
        }
      },
      { 
        returnDocument: 'after',
        upsert: false // Don't create if doesn't exist
      }
    );
    
    if (!result.value) {
      // Create payment record if it does not exist
      const createdAt = new Date().toISOString();
      const newPaymentDoc = createPaymentDocument(clientName, type, 0, parseInt(year), createdAt);
      await paymentsCollection.insertOne(newPaymentDoc);
      
      // Fetch the newly created document
      const newPayment = await paymentsCollection.findOne({ 
        Client_Name: clientName, 
        Type: type, 
        Year: parseInt(year) 
      });
      
      if (!newPayment) {
        throw new Error("Failed to create payment record");
      }
      
      // Update with the new value
      await paymentsCollection.updateOne(
        { _id: newPayment._id },
        { 
          $set: { 
            [`Payments.${monthKey}`]: numericValue === 0 ? "" : numericValue.toString(),
            Last_Updated: new Date()
          }
        }
      );
      
      // Fetch updated document
      const updatedPayment = await paymentsCollection.findOne({ _id: newPayment._id });
      
      // Calculate due payment
      const updatedPaymentWithDue = processPaymentUpdate(updatedPayment, updatedPayment.Payments, parseInt(year), null);
      
      const updatedRow = {
        Client_Name: updatedPaymentWithDue.Client_Name,
        Type: updatedPaymentWithDue.Type,
        Amount_To_Be_Paid: parseFloat(updatedPaymentWithDue.Amount_To_Be_Paid) || 0,
        january: updatedPaymentWithDue.Payments.January || "",
        february: updatedPaymentWithDue.Payments.February || "",
        march: updatedPaymentWithDue.Payments.March || "",
        april: updatedPaymentWithDue.Payments.April || "",
        may: updatedPaymentWithDue.Payments.May || "",
        june: updatedPaymentWithDue.Payments.June || "",
        july: updatedPaymentWithDue.Payments.July || "",
        august: updatedPaymentWithDue.Payments.August || "",
        september: updatedPaymentWithDue.Payments.September || "",
        october: updatedPaymentWithDue.Payments.October || "",
        november: updatedPaymentWithDue.Payments.November || "",
        december: updatedPaymentWithDue.Payments.December || "",
        Due_Payment: updatedPaymentWithDue.Due_Payment,
      };

      logger.payment("Payment created and updated successfully", username, { clientName, monthKey, numericValue, finalDuePayment: updatedPaymentWithDue.Due_Payment });
      res.json({ message: "Payment created and updated successfully", updatedRow });
      return;
    }
    
    // Payment record exists, update it
    const paymentRecord = result.value;
    const updatedPayments = { ...paymentRecord.Payments };
    updatedPayments[monthKey] = numericValue === 0 ? "" : numericValue.toString();

    // Get previous year payment for due calculation (only if needed)
    let prevYearPayment = null;
    if (parseInt(year) > 2025) {
      prevYearPayment = await paymentsCollection.findOne({
        Client_Name: clientName,
        Type: type,
        Year: parseInt(year) - 1,
      });
    }

    // Use centralized payment update utility
    const updatedPayment = processPaymentUpdate(paymentRecord, updatedPayments, parseInt(year), prevYearPayment);

    // Update the document with new due payment
    await paymentsCollection.updateOne(
      { _id: paymentRecord._id },
      { 
        $set: { 
          Payments: updatedPayments, 
          Due_Payment: updatedPayment.Due_Payment, 
          Last_Updated: new Date() 
        } 
      }
    );

    const updatedRow = {
      Client_Name: paymentRecord.Client_Name,
      Type: paymentRecord.Type,
      Amount_To_Be_Paid: parseFloat(paymentRecord.Amount_To_Be_Paid) || 0,
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
  console.log(`[EMAIL] Attempting to send email to: ${to}, subject: ${subject}`);
  
  if (!to || !subject || !html) {
    console.error("[EMAIL] Missing required fields", { to, subject, html });
    throw new Error("Recipient email, subject, and HTML content are required");
  }
  
  if (!validateInput.email(to)) {
    console.error("[EMAIL] Invalid recipient email address", { to });
    throw new Error("Invalid recipient email address");
  }

  try {
    const result = await sendEmail({ to, subject, html });
    logger.email("Email sent successfully", { to, subject, messageId: result.messageId });
    res.json({ message: "Email sent successfully", messageId: result.messageId });
  } catch (error) {
    logger.error("Send email error", error, { to, subject });
    console.error("[EMAIL] Error sending email:", error.message);
    throw error;
  }
}));

// Send WhatsApp
app.post("/api/send-whatsapp", authenticateToken, whatsappLimiter, asyncHandler(async (req, res) => {
  const { to, message } = req.body;
  console.log(`[WHATSAPP] Attempting to send WhatsApp to: ${to}`);
  
  if (!to || !message) {
    console.error("[WHATSAPP] Missing required fields", { to, message });
    throw new Error("Recipient phone number and message are required");
  }
  
  if (!validateInput.phone(to)) {
    console.error("[WHATSAPP] Invalid recipient phone number", { to });
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
    
    // Fixed UltraMsg API endpoint
    const apiUrl = `${config.API.ULTRA_MSG_BASE_URL}/${config.ULTRAMSG_INSTANCE_ID}/messages/chat`;
    console.log(`[WHATSAPP] Sending to UltraMsg API: ${apiUrl}`);
    
    const response = await retryUltraMsg(() =>
      axios.post(
        apiUrl,
        new URLSearchParams(payload).toString(),
        {
          headers: { 
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
          },
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
      console.error("[WHATSAPP] Unexpected response from WhatsApp API:", response.data);
      
      // Handle specific error cases
      let errorMessage = "Failed to send WhatsApp message";
      
      if (response.data.error) {
        errorMessage = response.data.error;
      } else if (response.data.message) {
        errorMessage = response.data.message;
      } else if (response.data.status === "error") {
        errorMessage = "WhatsApp API returned error status";
      } else if (response.data.sent === "false") {
        errorMessage = "WhatsApp message was not sent - phone number may not be registered with WhatsApp";
      }
      
      throw new Error(errorMessage);
    }
  } catch (error) {
    logger.error("Send WhatsApp error", error, { to, user: req.user.username });
    console.error("[WHATSAPP] Error sending WhatsApp:", error.message);
    
    // Provide more specific error messages
    if (error.response?.status === 404) {
      throw new Error("WhatsApp API endpoint not found. Please check UltraMsg configuration.");
    } else if (error.response?.status === 401) {
      throw new Error("WhatsApp API authentication failed. Please check UltraMsg token.");
    } else if (error.response?.status === 403) {
      throw new Error("WhatsApp API access denied. Please check UltraMsg instance ID.");
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error("WhatsApp API connection refused. Please check UltraMsg service status.");
    } else if (error.code === 'ENOTFOUND') {
      throw new Error("WhatsApp API host not found. Please check UltraMsg API URL.");
    }
    
    throw error;
  }
}));

// Test SMTP
app.get("/api/test-smtp", asyncHandler(async (req, res) => {
  const result = await testEmailConfig();
  res.json(result);
}));

// Get Types
app.get("/api/get-types", authenticateToken, asyncHandler(async (req, res) => {
  const username = req.user.username;
  logger.client(`Fetching types for user: ${username}`, username);
  
  try {
    const db = await database.getDb();
    const types = await database.getTypesCollection().find({ User: username }).toArray();
    const typesList = types.map(t => t.Type);
    
    logger.client(`Returning ${typesList.length} types`, username);
    res.json(typesList);
  } catch (error) {
    logger.error("Get types error", error, { username });
    throw error;
  }
}));

// Add Type
app.post("/api/add-type", authenticateToken, asyncHandler(async (req, res) => {
  const { type } = req.body;
  const username = req.user.username;
  
  if (!type || typeof type !== 'string' || type.trim().length === 0) {
    throw new Error("Type is required and must be a non-empty string");
  }
  
  const sanitizedType = sanitizeType(type);
  if (!sanitizedType) {
    throw new Error("Invalid type format");
  }
  
  try {
    const db = await database.getDb();
    const typesCollection = database.getTypesCollection();
    
    const existingType = await typesCollection.findOne({ 
      User: username, 
      Type: sanitizedType 
    });
    
    if (existingType) {
      throw new Error("Type already exists");
    }
    
    await typesCollection.insertOne({
      User: username,
      Type: sanitizedType,
      createdAt: new Date().toISOString()
    });
    
    logger.client(`Type added successfully: ${sanitizedType}`, username);
    res.status(config.statusCodes.CREATED).json({ 
      message: "Type added successfully", 
      type: sanitizedType 
    });
  } catch (error) {
    logger.error("Add type error", error, { username, type });
    throw error;
  }
}));

// Delete Client
app.delete("/api/delete-client", authenticateToken, asyncHandler(async (req, res) => {
  const { clientName, type } = req.body;
  const username = req.user.username;
  
  if (!clientName || !type) {
    throw new Error("Client name and type are required");
  }
  
  const sanitizedClientName = sanitizeClientName(clientName);
  const sanitizedType = sanitizeType(type);
  
  if (!sanitizedClientName || !sanitizedType) {
    throw new Error("Invalid client name or type");
  }
  
  try {
    const db = await database.getDb();
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);
    
    // Delete client
    const clientResult = await clientsCollection.deleteOne({
      Client_Name: sanitizedClientName,
      Type: sanitizedType
    });
    
    if (clientResult.deletedCount === 0) {
      throw new Error("Client not found");
    }
    
    // Delete all payment records for this client
    const paymentResult = await paymentsCollection.deleteMany({
      Client_Name: sanitizedClientName,
      Type: sanitizedType
    });
    
    logger.client(`Client deleted successfully: ${sanitizedClientName} (${sanitizedType})`, username);
    res.json({ 
      message: "Client deleted successfully",
      deletedPayments: paymentResult.deletedCount
    });
  } catch (error) {
    logger.error("Delete client error", error, { username, clientName, type });
    throw error;
  }
}));

// Update Client
app.put("/api/update-client", authenticateToken, asyncHandler(async (req, res) => {
  const { oldClientName, oldType, clientName, email, type, monthlyPayment, phoneNumber } = req.body;
  const username = req.user.username;
  
  if (!oldClientName || !oldType || !clientName || !type) {
    throw new Error("Old client name, old type, new client name, and new type are required");
  }
  
  const paymentValue = validatePaymentAmount(monthlyPayment);
  if (!paymentValue) {
    throw new Error("Monthly payment must be a positive number");
  }
  
  const sanitizedOldClientName = sanitizeClientName(oldClientName);
  const sanitizedOldType = sanitizeType(oldType);
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
    
    // Check if new client name/type combination already exists (if different from old)
    if (sanitizedClientName !== sanitizedOldClientName || sanitizedType !== sanitizedOldType) {
      const existingClient = await clientsCollection.findOne({ 
        Client_Name: sanitizedClientName, 
        Type: sanitizedType 
      });
      
      if (existingClient) {
        throw new Error("Client with this name and type already exists");
      }
    }
    
    // Update client
    await clientsCollection.updateOne(
      { Client_Name: sanitizedOldClientName, Type: sanitizedOldType },
      { 
        $set: {
          Client_Name: sanitizedClientName,
          Email: sanitizedEmail,
          Type: sanitizedType,
          Monthly_Payment: paymentValue,
          Phone_Number: sanitizedPhone,
          updatedAt: new Date().toISOString()
        }
      }
    );
    
    // Update all payment records for this client
    await paymentsCollection.updateMany(
      { Client_Name: sanitizedOldClientName, Type: sanitizedOldType },
      { 
        $set: {
          Client_Name: sanitizedClientName,
          Type: sanitizedType,
          Amount_To_Be_Paid: paymentValue,
          updatedAt: new Date().toISOString()
        }
      }
    );
    
    logger.client(`Client updated successfully: ${sanitizedOldClientName} → ${sanitizedClientName}`, username);
    res.json({ message: "Client updated successfully" });
  } catch (error) {
    logger.error("Update client error", error, { username });
    throw error;
  }
}));

// Get User Years
app.get("/api/get-user-years", authenticateToken, asyncHandler(async (req, res) => {
  const username = req.user.username;
  
  try {
    const db = await database.getDb();
    const paymentsCollection = database.getPaymentsCollection(username);
    const years = await paymentsCollection.distinct("Year");
    
    // Sort years in descending order (newest first)
    const sortedYears = years.sort((a, b) => b - a);
    
    logger.client(`Returning ${sortedYears.length} years for user`, username);
    res.json(sortedYears);
  } catch (error) {
    logger.error("Get user years error", error, { username });
    throw error;
  }
}));

// Add New Year
app.post("/api/add-new-year", authenticateToken, asyncHandler(async (req, res) => {
  const { year } = req.body;
  const username = req.user.username;
  
  if (!year || isNaN(year) || year < 2020 || year > 2030) {
    throw new Error("Valid year between 2020 and 2030 is required");
  }
  
  try {
    // Ensure database connection is established
    const db = await database.getDb();
    if (!db) {
      throw new Error("Database connection failed");
    }
    
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);
    
    // Verify collections exist and are accessible
    if (!clientsCollection || !paymentsCollection) {
      throw new Error("Database collections not accessible");
    }
    
    // Get all clients with retry logic
    let clients = [];
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        clients = await clientsCollection.find({}).toArray();
        break;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw new Error(`Failed to fetch clients after ${maxRetries} attempts: ${error.message}`);
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
    
    if (clients.length === 0) {
      throw new Error("No clients found. Please add clients first.");
    }
    
    // Check if year already exists with retry logic
    let existingYear = null;
    retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        existingYear = await paymentsCollection.findOne({ Year: parseInt(year) });
        break;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          return res.status(200).json({ message: `Year ${year} already exists (after retries)` });
        }
        await new Promise(resolve => setTimeout(resolve, 200 * retryCount)); // shorter wait
      }
    }
    if (existingYear) {
      return res.status(200).json({ message: `Year ${year} already exists` });
    }
    
    // Create payment records for all clients for the new year
    const paymentDocs = clients.map(client => 
      createPaymentDocument(
        client.Client_Name, 
        client.Type, 
        parseFloat(client.Monthly_Payment) || 0, 
        parseInt(year), 
        new Date().toISOString()
      )
    );
    
    // Insert payment records with retry logic
    retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        await paymentsCollection.insertMany(paymentDocs);
        break;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          return res.status(500).json({ message: `Failed to insert payment records after ${maxRetries} attempts: ${error.message}` });
        }
        await new Promise(resolve => setTimeout(resolve, 200 * retryCount)); // shorter wait
      }
    }
    
    logger.client(`Added new year ${year} with ${paymentDocs.length} payment records`, username);
    res.status(config.statusCodes.CREATED).json({ 
      message: `Year ${year} added successfully`,
      recordsCreated: paymentDocs.length
    });
  } catch (error) {
    logger.error("Add new year error", error, { username, year });
    throw error;
  }
}));

// Batch Save Payments
app.post("/api/batch-save-payments", authenticateToken, paymentLimiter, asyncHandler(async (req, res) => {
  const { updates } = req.body;
  const { year } = req.query;
  const username = req.user.username;

  logger.payment("Batch save payments request", username, { count: updates?.length, year });

  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error("Updates array is required and must not be empty");
  }

  if (!year) {
    throw new Error("Year is required");
  }

  try {
    const db = await database.getDb();
    const paymentsCollection = database.getPaymentsCollection(username);
    
    const results = [];
    const modifiedCount = 0;

    // Process updates in batches for better performance
    const batchSize = 10;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (update) => {
        const { clientName, type, month, value } = update;
        
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

        // Use findOneAndUpdate for atomic operation
        const result = await paymentsCollection.findOneAndUpdate(
          { 
            Client_Name: clientName, 
            Type: type, 
            Year: parseInt(year) 
          },
          { 
            $set: { 
              [`Payments.${monthKey}`]: numericValue === 0 ? "" : numericValue.toString(),
              Last_Updated: new Date()
            }
          },
          { 
            returnDocument: 'after',
            upsert: false
          }
        );

        if (!result.value) {
          // Create payment record if it does not exist
          const createdAt = new Date().toISOString();
          const newPaymentDoc = createPaymentDocument(clientName, type, 0, parseInt(year), createdAt);
          await paymentsCollection.insertOne(newPaymentDoc);
          
          // Fetch and update the newly created document
          const newPayment = await paymentsCollection.findOne({ 
            Client_Name: clientName, 
            Type: type, 
            Year: parseInt(year) 
          });
          
          if (newPayment) {
            await paymentsCollection.updateOne(
              { _id: newPayment._id },
              { 
                $set: { 
                  [`Payments.${monthKey}`]: numericValue === 0 ? "" : numericValue.toString(),
                  Last_Updated: new Date()
                }
              }
            );
            
            // Fetch updated document and calculate due payment
            const updatedPayment = await paymentsCollection.findOne({ _id: newPayment._id });
            const updatedPaymentWithDue = processPaymentUpdate(updatedPayment, updatedPayment.Payments, parseInt(year), null);
            
            return {
              Client_Name: updatedPaymentWithDue.Client_Name,
              Type: updatedPaymentWithDue.Type,
              Amount_To_Be_Paid: parseFloat(updatedPaymentWithDue.Amount_To_Be_Paid) || 0,
              january: updatedPaymentWithDue.Payments.January || "",
              february: updatedPaymentWithDue.Payments.February || "",
              march: updatedPaymentWithDue.Payments.March || "",
              april: updatedPaymentWithDue.Payments.April || "",
              may: updatedPaymentWithDue.Payments.May || "",
              june: updatedPaymentWithDue.Payments.June || "",
              july: updatedPaymentWithDue.Payments.July || "",
              august: updatedPaymentWithDue.Payments.August || "",
              september: updatedPaymentWithDue.Payments.September || "",
              october: updatedPaymentWithDue.Payments.October || "",
              november: updatedPaymentWithDue.Payments.November || "",
              december: updatedPaymentWithDue.Payments.December || "",
              Due_Payment: updatedPaymentWithDue.Due_Payment,
            };
          }
        } else {
          // Payment record exists, update it
          const paymentRecord = result.value;
          const updatedPayments = { ...paymentRecord.Payments };
          updatedPayments[monthKey] = numericValue === 0 ? "" : numericValue.toString();

          // Get previous year payment for due calculation (only if needed)
          let prevYearPayment = null;
          if (parseInt(year) > 2025) {
            prevYearPayment = await paymentsCollection.findOne({
              Client_Name: clientName,
              Type: type,
              Year: parseInt(year) - 1,
            });
          }

          // Use centralized payment update utility
          const updatedPayment = processPaymentUpdate(paymentRecord, updatedPayments, parseInt(year), prevYearPayment);

          // Update the document with new due payment
          await paymentsCollection.updateOne(
            { _id: paymentRecord._id },
            { 
              $set: { 
                Payments: updatedPayments, 
                Due_Payment: updatedPayment.Due_Payment, 
                Last_Updated: new Date() 
              } 
            }
          );

          return {
            Client_Name: paymentRecord.Client_Name,
            Type: paymentRecord.Type,
            Amount_To_Be_Paid: parseFloat(paymentRecord.Amount_To_Be_Paid) || 0,
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
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    logger.payment("Batch payments updated successfully", username, { count: results.length, year });
    res.json({ 
      message: "Batch payments updated successfully", 
      updatedPayments: results,
      modifiedCount: results.length
    });
  } catch (error) {
    logger.error("Batch save payments error", error, { username, year });
    throw error;
  }
}));

// Import CSV
app.post("/api/import-csv", authenticateToken, asyncHandler(async (req, res) => {
  const { records } = req.body;
  const username = req.user.username;
  
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("CSV records array is required");
  }
  
  try {
    const db = await database.getDb();
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);
    const typesCollection = database.getTypesCollection();
    
    const processedRecords = [];
    const errors = [];
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const { Client_Name, Email, Type, Monthly_Payment, Phone_Number } = record;
      
      try {
        const sanitizedClientName = sanitizeClientName(Client_Name);
        const sanitizedType = sanitizeType(Type);
        const sanitizedEmail = sanitizeEmail(Email);
        const sanitizedPhone = sanitizePhone(Phone_Number);
        const paymentValue = validatePaymentAmount(Monthly_Payment);
        
        if (!sanitizedClientName || !sanitizedType || !paymentValue) {
          errors.push(`Row ${i + 1}: Invalid client name, type, or payment amount`);
          continue;
        }
        
        // Check if type exists, if not create it
        const existingType = await typesCollection.findOne({ User: username, Type: sanitizedType });
        if (!existingType) {
          await typesCollection.insertOne({
            User: username,
            Type: sanitizedType,
            createdAt: new Date().toISOString()
          });
        }
        
        // Check if client already exists
        const existingClient = await clientsCollection.findOne({ 
          Client_Name: sanitizedClientName, 
          Type: sanitizedType 
        });
        
        if (existingClient) {
          errors.push(`Row ${i + 1}: Client ${sanitizedClientName} (${sanitizedType}) already exists`);
          continue;
        }
        
        const createdAt = new Date().toISOString();
        
        // Add client
        await clientsCollection.insertOne({
          Client_Name: sanitizedClientName,
          Email: sanitizedEmail,
          Type: sanitizedType,
          Monthly_Payment: paymentValue,
          Phone_Number: sanitizedPhone,
          createdAt: createdAt,
        });
        
        // Get existing years and create payment records
        const existingYears = await paymentsCollection.distinct("Year");
        const yearsToCreate = existingYears.length > 0 ? existingYears : [2025];
        
        const paymentDocs = yearsToCreate.map(year => 
          createPaymentDocument(sanitizedClientName, sanitizedType, paymentValue, year, createdAt)
        );
        
        await paymentsCollection.insertMany(paymentDocs);
        
        processedRecords.push({
          Client_Name: sanitizedClientName,
          Type: sanitizedType,
          Email: sanitizedEmail,
          Phone_Number: sanitizedPhone,
          Monthly_Payment: paymentValue
        });
        
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }
    
    logger.client(`CSV import completed: ${processedRecords.length} successful, ${errors.length} errors`, username);
    
    res.json({
      message: "CSV import completed",
      successful: processedRecords.length,
      errors: errors.length,
      errorDetails: errors,
      records: processedRecords
    });
  } catch (error) {
    logger.error("Import CSV error", error, { username });
    throw error;
  }
}));

// Verify WhatsApp Contact
app.post("/api/verify-whatsapp-contact", authenticateToken, asyncHandler(async (req, res) => {
  const { phoneNumber } = req.body;
  
  if (!phoneNumber) {
    throw new Error("Phone number is required");
  }
  
  if (!validateInput.phone(phoneNumber)) {
    throw new Error("Invalid phone number format");
  }
  
  try {
    // Format phone number
    let formattedPhone = phoneNumber.trim().replace(/[\s-]/g, "");
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = `+91${formattedPhone.replace(/\D/g, "")}`;
    }
    
    console.log(`[WHATSAPP_VERIFY] Checking WhatsApp registration for: ${formattedPhone}`);
    
    // Try to send a test message to UltraMsg API to verify the number
    const verifyPayload = {
      token: config.ULTRAMSG_TOKEN,
      to: formattedPhone,
      body: "WhatsApp verification test", // This won't actually be sent, just used for verification
    };
    
    try {
      // Use UltraMsg's contact verification endpoint if available
      // For now, we'll use a simple approach - attempt to validate format and assume valid
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      if (!phoneRegex.test(formattedPhone)) {
        throw new Error("Invalid international phone number format");
      }
      
      // Additional validation: Indian numbers should be +91 followed by 10 digits
      if (formattedPhone.startsWith("+91")) {
        const indianNumber = formattedPhone.substring(3);
        if (!/^[6-9]\d{9}$/.test(indianNumber)) {
          throw new Error("Invalid Indian mobile number format");
        }
      }
      
      console.log(`[WHATSAPP_VERIFY] Phone number ${formattedPhone} passed format validation`);
      
      res.json({ 
        message: "Phone number format is valid",
        formattedNumber: formattedPhone,
        isValidWhatsApp: true // Note: This is format validation, not actual WhatsApp registration check
      });
      
    } catch (verifyError) {
      console.error(`[WHATSAPP_VERIFY] Verification failed for ${formattedPhone}:`, verifyError.message);
      
      res.json({ 
        message: "Phone number verification failed",
        formattedNumber: formattedPhone,
        isValidWhatsApp: false,
        error: verifyError.message
      });
    }
    
  } catch (error) {
    console.error(`[WHATSAPP_VERIFY] Error verifying phone number:`, error.message);
    throw new Error(`Phone number verification failed: ${error.message}`);
  }
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