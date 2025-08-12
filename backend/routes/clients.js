const express = require("express");
const router = express.Router();

const database = require("../db/mongo");
const { authenticateToken } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { 
  sanitizeClientName, 
  sanitizeType, 
  sanitizeEmail, 
  sanitizePhone,
  validatePaymentAmount 
} = require("../utils/sanitize");
const { ValidationError, NotFoundError } = require("../middleware/errorHandler");

// Get Clients
router.get("/get-clients", authenticateToken, asyncHandler(async (req, res) => {
  console.log(`Fetching clients for user: ${req.user.username}`);
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
  
  console.log(`Returning ${processedClients.length} clients`);
  res.json(processedClients);
}));

// Add Client
router.post("/add-client", authenticateToken, asyncHandler(async (req, res) => {
  let { clientName, email, type, monthlyPayment, phoneNumber } = req.body;
  const username = req.user.username;
  const paymentValue = validatePaymentAmount(monthlyPayment);
  const createdAt = new Date().toISOString();
  
  if (!paymentValue) {
    throw new ValidationError("Monthly payment must be a positive number");
  }
  
  const sanitizedClientName = sanitizeClientName(clientName);
  const sanitizedType = sanitizeType(type);
  const sanitizedEmail = sanitizeEmail(email);
  const sanitizedPhone = sanitizePhone(phoneNumber);
  
  if (!sanitizedClientName || !sanitizedType) {
    throw new ValidationError("Client name and type are required");
  }
  
  try {
    const db = await database.getDb();
    const types = await database.getTypesCollection().find({ User: username }).toArray();
    const userTypes = types.map(t => t.Type);
    
    if (!userTypes.includes(sanitizedType)) {
      throw new ValidationError(`Type must be one of: ${userTypes.join(", ")}`);
    }
    
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);
    
    const existingClient = await clientsCollection.findOne({ 
      Client_Name: sanitizedClientName, 
      Type: sanitizedType 
    });
    
    if (existingClient) {
      throw new ValidationError("Client with this name and type already exists");
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
    
    // Get existing years and create payment records
    const existingYears = await paymentsCollection.distinct("Year");
    const yearsToCreate = existingYears.length > 0 ? existingYears : [2025];
    
    const paymentDocs = yearsToCreate.map(year => ({
      Client_Name: sanitizedClientName,
      Type: sanitizedType,
      Amount_To_Be_Paid: paymentValue,
      Year: year,
      Payments: {
        January: "", February: "", March: "", April: "", May: "", June: "",
        July: "", August: "", September: "", October: "", November: "", December: "",
      },
      Remarks: {
        January: "N/A", February: "N/A", March: "N/A", April: "N/A", May: "N/A", June: "N/A",
        July: "N/A", August: "N/A", September: "N/A", October: "N/A", November: "N/A", December: "N/A",
      },
      Due_Payment: 0,
      createdAt: createdAt,
    }));
    
    await paymentsCollection.insertMany(paymentDocs);
    
    console.log(`Client added successfully with payment records for years: ${yearsToCreate.join(', ')}`);
    res.status(201).json({ 
      message: "Client added successfully", 
      yearsCreated: yearsToCreate 
    });
  } catch (error) {
    console.error("Add client error:", error);
    throw error;
  }
}));

// Update Client
router.put("/update-client", authenticateToken, asyncHandler(async (req, res) => {
  const { oldClient, newClient } = req.body;
  const username = req.user.username;
  
  if (!oldClient || !newClient || !oldClient.Client_Name || !oldClient.Type || 
      !newClient.Client_Name || !newClient.Type || !newClient.Amount_To_Be_Paid) {
    throw new ValidationError("All required fields must be provided");
  }
  
  const oldClientName = sanitizeClientName(oldClient.Client_Name);
  const oldType = sanitizeType(oldClient.Type);
  const newClientName = sanitizeClientName(newClient.Client_Name);
  const newType = sanitizeType(newClient.Type);
  const newEmail = sanitizeEmail(newClient.Email);
  const newPhone = sanitizePhone(newClient.Phone_Number);
  const paymentValue = validatePaymentAmount(newClient.Amount_To_Be_Paid);
  
  if (!paymentValue) {
    throw new ValidationError("Amount to be paid must be a positive number");
  }
  
  if (!newClientName || !newType) {
    throw new ValidationError("Client name and type are required");
  }
  
  try {
    const db = await database.getDb();
    const types = await database.getTypesCollection().find({ User: username }).toArray();
    const userTypes = types.map(t => t.Type);
    
    if (!userTypes.includes(newType)) {
      throw new ValidationError(`Type must be one of: ${userTypes.join(", ")}`);
    }
    
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);
    
    const client = await clientsCollection.findOne({ Client_Name: oldClientName, Type: oldType });
    if (!client) {
      throw new NotFoundError("Client not found");
    }
    
    // Preserve createdAt from existing client
    await clientsCollection.updateOne(
      { Client_Name: oldClientName, Type: oldType },
      { $set: { 
        Client_Name: newClientName, 
        Type: newType, 
        Monthly_Payment: paymentValue, 
        Email: newEmail, 
        Phone_Number: newPhone, 
        createdAt: client.createdAt 
      }}
    );
    
    const paymentDocs = await paymentsCollection.find({ 
      Client_Name: oldClientName, 
      Type: oldType 
    }).toArray();
    
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
            Client_Name: newClientName,
            Type: newType,
            Amount_To_Be_Paid: paymentValue,
            Due_Payment: currentYearDuePayment + prevYearCumulativeDue,
            createdAt: doc.createdAt,
          },
        }
      );
    }
    
    res.json({ message: "Client updated successfully" });
  } catch (error) {
    console.error("Update client error:", error);
    throw error;
  }
}));

// Delete Client
router.post("/delete-client", authenticateToken, asyncHandler(async (req, res) => {
  let { Client_Name, Type } = req.body;
  
  if (!Client_Name || !Type) {
    throw new ValidationError("Client name and type are required");
  }
  
  const sanitizedClientName = sanitizeClientName(Client_Name);
  const sanitizedType = sanitizeType(Type);
  const username = req.user.username;
  
  try {
    const db = await database.getDb();
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);
    
    const client = await clientsCollection.findOne({ Client_Name: sanitizedClientName, Type: sanitizedType });
    if (!client) {
      throw new NotFoundError("Client not found");
    }
    
    await clientsCollection.deleteOne({ Client_Name: sanitizedClientName, Type: sanitizedType });
    await paymentsCollection.deleteMany({ Client_Name: sanitizedClientName, Type: sanitizedType });
    
    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    console.error("Delete client error:", error.message);
    throw error;
  }
}));

module.exports = router;
