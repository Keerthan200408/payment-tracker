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

// Get all clients
router.get("/", authenticateToken, asyncHandler(async (req, res) => {
  const username = req.user.username;
  const { year } = req.query;
  
  logger.info("Fetch clients request", username, { year });
  
  try {
    const db = await database.getDb();
    const clientsCollection = database.getClientsCollection(username);
    
    // Use aggregation pipeline for better performance and consistent ordering
    const pipeline = [
      {
        $lookup: {
          from: `payments_${username}`,
          let: { clientName: "$Client_Name" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$Client_Name", "$$clientName"] },
                    { $eq: ["$Year", parseInt(year)] }
                  ]
                }
              }
            }
          ],
          as: "payments"
        }
      },
      {
        $addFields: {
          hasPayments: { $gt: [{ $size: "$payments" }, 0] },
          lastPaymentDate: {
            $max: {
              $map: {
                input: "$payments",
                as: "payment",
                in: "$$payment.Last_Updated"
              }
            }
          }
        }
      },
      {
        $sort: {
          // First sort by whether they have payments (new clients without payments first)
          hasPayments: 1,
          // Then by creation date (newest first)
          createdAt: -1,
          // Finally by last payment date for clients with payments
          lastPaymentDate: -1
        }
      },
      {
        $project: {
          _id: 1,
          Client_Name: 1,
          Email: 1,
          Phone: 1,
          Address: 1,
          createdAt: 1,
          updatedAt: 1,
          hasPayments: 1,
          lastPaymentDate: 1
        }
      }
    ];
    
    const clients = await clientsCollection.aggregate(pipeline).toArray();
    
    logger.info("Clients fetched successfully", username, { count: clients.length, year });
    res.json(clients);
  } catch (error) {
    logger.error("Fetch clients error", error, { username, year });
    throw error;
  }
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
