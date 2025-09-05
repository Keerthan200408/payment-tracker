const database = require("../db/mongo");
const {
    calculateDuePaymentWithPreviousYear,
    createPaymentDocument,
    getMonthKey,
    processPaymentUpdate
} = require("../utils/paymentCalculations");
const { createSafeQuery } = require("../utils/mongoSanitizer");
const { sanitizeInput } = require("../utils/sanitize");
const { ValidationError, NotFoundError } = require("../middleware/errorHandler");
const config = require("../config");

// =================================================================
// GET PAYMENT DATA
// =================================================================

/**
 * @desc    Get all payment records for a specific year
 * @route   GET /api/payments/get-by-year
 */
exports.getPaymentsByYear = async (req, res) => {
    const { year } = req.query;
    if (!year || isNaN(year)) {
        throw new ValidationError("A valid year is required in the query parameters.");
    }

    const username = req.user.username;
    const paymentsCollection = database.getPaymentsCollection(username);
    const clientsCollection = database.getClientsCollection(username);

    const clients = await clientsCollection.find({}).toArray();
    const clientContactMap = new Map(clients.map(c => [`${c.Client_Name}_${c.Type}`, {
        Email: c.Email || "",
        Phone_Number: c.Phone_Number || ""
    }]));

    let payments = await paymentsCollection.find({ Year: parseInt(year) }).toArray();

    if (parseInt(year) > 2025) {
        const prevYearPayments = await paymentsCollection.find({ Year: parseInt(year) - 1 }).toArray();
        const prevYearDueMap = new Map(prevYearPayments.map(p => [`${p.Client_Name}_${p.Type}`, parseFloat(p.Due_Payment) || 0]));
        payments = payments.map(p => ({
            ...p,
            Previous_Year_Due: prevYearDueMap.get(`${p.Client_Name}_${p.Type}`) || 0
        }));
    }

    const processedPayments = payments.map(payment => {
        const contactInfo = clientContactMap.get(`${payment.Client_Name}_${payment.Type}`) || {};
        const duePayment = calculateDuePaymentWithPreviousYear(payment, payment.Previous_Year_Due ? { Due_Payment: payment.Previous_Year_Due } : null);

        return {
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
            Due_Payment: duePayment,
            Email: contactInfo.Email,
            Phone_Number: contactInfo.Phone_Number,
            Remarks: payment.Remarks || {},
            createdAt: payment.createdAt,
        };
    });

    res.json(processedPayments);
};

/**
 * @desc    Get all distinct years for which the user has data
 * @route   GET /api/payments/get-user-years
 */
// --- REPLACE your old getUserYears function with this one ---
exports.getUserYears = async (req, res) => {
    const paymentsCollection = database.getPaymentsCollection(req.user.username);
    
    // 1. Get all distinct non-null years from the database.
    const yearsFromDb = await paymentsCollection.distinct("Year", { Year: { $ne: null } });

    // 2. Use a Set to ensure all years are unique and 2025 is always included.
    //    We also parse every year as an integer to handle mixed data types (e.g., "2026" and 2026).
    const yearSet = new Set(yearsFromDb.map(y => parseInt(y)));
    yearSet.add(2025);

    // 3. Convert the Set back to an array, filter out any potential NaN values, and sort numerically.
    const allYears = Array.from(yearSet)
        .filter(year => !isNaN(year))
        .sort((a, b) => a - b);

console.log(`[getUserYears] Sending years for user ${req.user.username}:`, allYears);

    res.json(allYears);
};

// =================================================================
// MODIFY PAYMENT DATA
// =================================================================

/**
 * @desc    Save a single payment value for a specific month
 * @route   POST /api/payments/save-payment
 */
exports.savePayment = async (req, res) => {
    const { clientName, type, month, value } = req.body;
    const year = req.query.year || new Date().getFullYear().toString();
    const username = req.user.username;

    if (!clientName || !type || !month) {
        throw new ValidationError("Client name, type, and month are required.");
    }

    let numericValue = 0;
    if (value !== "" && value !== null && value !== undefined) {
        numericValue = parseFloat(value);
        if (isNaN(numericValue) || numericValue < 0) {
            throw new ValidationError("Invalid payment value; must be a non-negative number.");
        }
    }

    const monthKey = getMonthKey(month);
    if (!monthKey) {
        throw new ValidationError("Invalid month provided.");
    }
    
    const paymentsCollection = database.getPaymentsCollection(username);
    const payment = await paymentsCollection.findOne(createSafeQuery(clientName, type, parseInt(year)));

    if (!payment) {
        throw new NotFoundError("Payment record not found.");
    }
    
    const finalValue = (value === "" || value === null || value === undefined) ? "" : numericValue.toString();
    let updatedPayments = { ...payment.Payments, [monthKey]: finalValue };

    if (finalValue !== "") {
        const currentMonthIndex = config.months.indexOf(monthKey);
        let hasStarted = false;
        for (let i = 0; i < config.months.length; i++) {
            const m = config.months[i];
            const hasValue = updatedPayments[m] !== "" && updatedPayments[m] !== null && updatedPayments[m] !== undefined;
            if (hasValue || i === currentMonthIndex) hasStarted = true;
            if (hasStarted && !hasValue && i < currentMonthIndex) updatedPayments[m] = "0";
        }
    }

    let prevYearPayment = null;
    if (parseInt(year) > 2025) {
        prevYearPayment = await paymentsCollection.findOne(createSafeQuery(clientName, type, parseInt(year) - 1));
    }
    
    const { Due_Payment } = processPaymentUpdate(payment, updatedPayments, parseInt(year), prevYearPayment);

    await paymentsCollection.updateOne(
        createSafeQuery(clientName, type, parseInt(year)),
        { $set: { "Payments": updatedPayments, "Due_Payment": Due_Payment } }
    );
    
    const updatedRow = { ...payment, Payments: updatedPayments, Due_Payment };
    res.json({ message: "Payment updated successfully", updatedRow });
};

/**
 * @desc    Save a remark for a specific month
 * @route   POST /api/payments/save-remark
 */
exports.saveRemark = async (req, res) => {
    const { clientName, type, month, remark } = req.body;
    const year = req.query.year || new Date().getFullYear().toString();

    if (!clientName || !type || !month) {
        throw new ValidationError("Client name, type, and month are required.");
    }

    const monthKey = getMonthKey(month);
    if (!monthKey) {
        throw new ValidationError("Invalid month provided.");
    }
    
    const paymentsCollection = database.getPaymentsCollection(req.user.username);
    const updateResult = await paymentsCollection.updateOne(
        createSafeQuery(clientName, type, parseInt(year)),
        { $set: { [`Remarks.${monthKey}`]: remark || "N/A", Last_Updated: new Date() } }
    );

    if (updateResult.matchedCount === 0) {
        throw new NotFoundError("Payment record not found to save remark.");
    }

    res.json({ message: "Remark saved successfully", remark });
};

/**
 * @desc    Save multiple payment updates in a batch for a single client
 * @route   POST /api/payments/batch-save
 */
exports.batchSavePayments = async (req, res) => {
    const { clientName, type, updates } = req.body;
    const year = req.query.year || new Date().getFullYear().toString();
    const username = req.user.username;

    if (!clientName || !type || !Array.isArray(updates) || updates.length === 0) {
        throw new ValidationError("Client name, type, and a non-empty updates array are required.");
    }

    const paymentsCollection = database.getPaymentsCollection(username);
    const payment = await paymentsCollection.findOne(createSafeQuery(clientName, type, parseInt(year)));
    if (!payment) {
        throw new NotFoundError("Payment record not found.");
    }

    let updatedPayments = { ...payment.Payments };
    for (const update of updates) {
        const monthKey = getMonthKey(update.month);
        if (monthKey) {
            const numericValue = parseFloat(update.value);
            updatedPayments[monthKey] = (isNaN(numericValue) || numericValue < 0) ? "" : numericValue.toString();
        }
    }

    let prevYearPayment = null;
    if (parseInt(year) > 2025) {
        prevYearPayment = await paymentsCollection.findOne(createSafeQuery(clientName, type, parseInt(year) - 1));
    }

    const { Due_Payment } = processPaymentUpdate(payment, updatedPayments, parseInt(year), prevYearPayment);

    await paymentsCollection.updateOne(
        createSafeQuery(clientName, type, parseInt(year)),
        { $set: { Payments: updatedPayments, Due_Payment } }
    );
    
    res.json({ message: "Batch update successful", updatedRow: { ...payment, Payments: updatedPayments, Due_Payment } });
};


// =================================================================
// YEAR AND IMPORT OPERATIONS
// =================================================================

/**
 * @desc    Add a new year for all existing clients
 * @route   POST /api/payments/add-new-year
 */
exports.addNewYear = async (req, res) => {
    const { year } = req.body;
    const username = req.user.username;

    if (!year || isNaN(year) || parseInt(year) <= 2025) {
        throw new ValidationError("A valid year greater than 2025 is required.");
    }
    
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);

    const clients = await clientsCollection.find({}).toArray();
    if (clients.length === 0) {
        throw new NotFoundError("No clients found. Please add clients before adding a new year.");
    }
    
    const existingYear = await paymentsCollection.findOne({ Year: parseInt(year) });
    if (existingYear) {
        throw new ValidationError(`Year ${year} already exists.`);
    }

    const paymentDocs = clients.map(client => createPaymentDocument(
        client.Client_Name,
        client.Type,
        client.Monthly_Payment,
        parseInt(year),
        client.createdAt
    ));
    
    if (paymentDocs.length > 0) {
        await paymentsCollection.insertMany(paymentDocs);
    }
    
    res.status(201).json({ message: `Year ${year} added successfully with ${paymentDocs.length} clients.` });
};

/**
 * @desc    Bulk import clients and payments from CSV data
 * @route   POST /api/payments/import-csv
 */
exports.importCsv = async (req, res) => {
    const csvData = req.body;
    const username = req.user.username;

    if (!Array.isArray(csvData) || csvData.length === 0) {
        throw new ValidationError("CSV data must be a non-empty array of records.");
    }

    const typesCollection = database.getTypesCollection();
    const clientsCollection = database.getClientsCollection(username);
    const paymentsCollection = database.getPaymentsCollection(username);
    
    const userTypesData = await typesCollection.find({ User: username }).toArray();
    const userTypes = userTypesData.map(t => t.Type.toUpperCase());
    if (userTypes.length === 0) {
        throw new ValidationError("No payment types defined. Please add types before importing.");
    }

    const existingClients = await clientsCollection.find({}, { projection: { Client_Name: 1, Type: 1, _id: 0 } }).toArray();
    const existingClientsSet = new Set(existingClients.map(c => `${c.Client_Name.toLowerCase()}|${c.Type.toUpperCase()}`));
    
    const existingYears = await paymentsCollection.distinct("Year");
    const yearsToCreate = existingYears.length > 0 ? existingYears : [2025];
    
    const validClients = [];
    const validPayments = [];
    const errors = [];
    const skippedDuplicates = [];
    const processedInBatch = new Set();

    for (let i = 0; i < csvData.length; i++) {
        const record = csvData[i];
        if (!Array.isArray(record) || record.length < 4) {
            errors.push(`Record at index ${i + 1}: Invalid format.`);
            continue;
        }
        
        const [amount, type, email = "", clientName, phone = ""] = record;
        
        const sanitizedClientName = sanitizeInput(clientName || '').trim();
        const sanitizedType = sanitizeInput(type || '').trim().toUpperCase();

        if (!sanitizedClientName || !sanitizedType) {
            errors.push(`Record at index ${i + 1}: Client Name and Type are required.`);
            continue;
        }
        
        const clientKey = `${sanitizedClientName.toLowerCase()}|${sanitizedType}`;
        if (existingClientsSet.has(clientKey) || processedInBatch.has(clientKey)) {
            skippedDuplicates.push({ clientName: sanitizedClientName, type: sanitizedType, reason: "Duplicate" });
            continue;
        }

        if (!userTypes.includes(sanitizedType)) {
            errors.push({ clientName: sanitizedClientName, reason: `Type "${type}" is not a valid type for your account.` });
            continue;
        }

        const paymentValue = parseFloat(amount);
        if (isNaN(paymentValue) || paymentValue <= 0) {
            errors.push({ clientName: sanitizedClientName, reason: `Invalid payment amount "${amount}".` });
            continue;
        }

        processedInBatch.add(clientKey);
        
        validClients.push({
            Client_Name: sanitizedClientName,
            Type: sanitizedType,
            Email: sanitizeInput(email).trim(),
            Phone_Number: sanitizeInput(phone).trim(),
            Monthly_Payment: paymentValue,
            createdAt: new Date().toISOString()
        });
        
        const paymentDocs = yearsToCreate.map(year => createPaymentDocument(sanitizedClientName, sanitizedType, paymentValue, year, new Date().toISOString()));
        validPayments.push(...paymentDocs);
    }
    
    if (validClients.length > 0) {
        await clientsCollection.insertMany(validClients, { ordered: false }).catch(err => console.error("Error inserting clients:", err));
    }
    if (validPayments.length > 0) {
        await paymentsCollection.insertMany(validPayments, { ordered: false }).catch(err => console.error("Error inserting payments:", err));
    }

    res.status(201).json({
        message: "Import completed.",
        summary: {
            totalRecords: csvData.length,
            successfulImports: validClients.length,
            skippedDuplicates: skippedDuplicates.length,
            errors: errors.length,
        },
        details: {
            duplicates: skippedDuplicates,
            errors: errors
        }
    });
};