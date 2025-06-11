
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { google } = require('googleapis');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sanitizeHtml = require('sanitize-html');
require('dotenv').config();

const app = express();

// Trust Render's proxy
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: ['https://reliable-eclair-abf03c.netlify.app', 'http://localhost:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Handle preflight OPTIONS requests
app.options('*', cors({
  origin: ['https://reliable-eclair-abf03c.netlify.app', 'http://localhost:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Cookie parser
app.use(cookieParser());

// Parse JSON
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Payment Tracker Backend is running!' });
});

// Google Sheets setup
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);

const spreadsheetId = process.env.SHEET_ID;

// Helper to ensure sheet exists
async function ensureSheet(sheetName, headers) {
  const sheets = google.sheets({ version: 'v4', auth });
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets.some(sheet => sheet.properties.title === sheetName);
    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] },
      });
    }
  } catch (error) {
    console.error(`Error ensuring sheet ${sheetName}:`, error);
    throw error;
  }
}

// Helper to read data
async function readSheet(sheetName, range) {
  const sheets = google.sheets({ version: 'v4', auth });
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!${range}`,
    });
    return response.data.values || [];
  } catch (error) {
    console.error(`Error reading sheet ${sheetName}:`, error);
    throw error;
  }
}

// Helper to append data
// async function appendSheet(sheetName, values) {
//   const sheets = google.sheets({ version: 'v4', auth });
//   try {
//     await sheets.spreadsheets.values.append({
//       spreadsheetId,
//       range: sheetName,
//       valueInputOption: 'RAW',
//       resource: { values },
//     });
//   } catch (error) {
//     console.error(`Error appending to sheet ${sheetName}:`, error);
//     throw error;
//   }
// }

async function appendSheet(sheetName, values) {
  const sheets = google.sheets({ version: 'v4', auth });
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: sheetName,
        valueInputOption: 'RAW',
        resource: { values },
      });
      return; // Success, exit the function
    } catch (error) {
      if (error.status === 429 && retryCount < maxRetries) {
        // Rate limit exceeded, wait and retry
        const delayMs = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(`Rate limit exceeded for ${sheetName}, retrying after ${delayMs}ms...`);
        await delay(delayMs);
        retryCount++;
      } else {
        console.error(`Error appending to sheet ${sheetName}:`, error);
        throw error;
      }
    }
  }
}

// Helper to write data
// async function writeSheet(sheetName, range, values) {
//   const sheets = google.sheets({ version: 'v4', auth });
//   try {
//     await sheets.spreadsheets.values.update({
//       spreadsheetId,
//       range: `${sheetName}!${range}`,
//       valueInputOption: 'RAW',
//       resource: { values },
//     });
//   } catch (error) {
//     console.error(`Error writing to sheet ${sheetName}:`, error);
//     throw error;
//   }
// }

async function writeSheet(sheetName, range, values) {
  const sheets = google.sheets({ version: 'v4', auth });
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${range}`,
        valueInputOption: 'RAW',
        resource: { values },
      });
      return;
    } catch (error) {
      if (error.status === 429 && retryCount < maxRetries) {
        const delayMs = Math.pow(2, retryCount) * 1000;
        console.log(`Rate limit exceeded for ${sheetName}, retrying after ${delayMs}ms...`);
        await delay(delayMs);
        retryCount++;
      } else {
        console.error(`Error writing to sheet ${sheetName}:`, error);
        throw error;
      }
    }
  }
}

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  let token = req.cookies?.sessionToken;
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  if (!token) {
    console.log('No session token provided');
    return res.status(401).json({ error: 'Access denied: No token provided' });
  }
  try {
    const user = jwt.verify(token, process.env.SECRET_KEY);
    req.user = user;
    next();
  } catch (err) {
    console.log('Invalid token:', err.message);
    res.status(403).json({ error: 'Invalid token' });
  }
};

// Input sanitization
const sanitizeInput = (input) => {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
};

// Signup
app.post('/api/signup', async (req, res) => {
  let { username, password } = req.body;
  if (!username || !password ) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  username = sanitizeInput(username);
  // gmailId = sanitizeInput(gmailId);
  // if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(gmailId)) {
  //   return res.status(400).json({ error: 'Please enter a valid Gmail ID' });
  // }
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    await ensureSheet('Users', ['Username', 'Password']);
    const users = await readSheet('Users', 'A2:B');
    if (users.some(user => user[0] === username )) {
      return res.status(400).json({ error: 'Username or Gmail ID already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await appendSheet('Users', [[username, hashedPassword]]);
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  let { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  username = sanitizeInput(username);
  try {
    await ensureSheet('Users', ['Username', 'Password']);
    const users = await readSheet('Users', 'A2:B');
    const user = users.find(u => u[0] === username);
    if (!user || !(await bcrypt.compare(password, user[1]))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const sessionToken = jwt.sign({ username }, process.env.SECRET_KEY, { expiresIn: '24h' });
    res.cookie('sessionToken', sessionToken, {
      httpOnly: true,
      secure: true,
      maxAge: 3600000,
      sameSite: 'None',
      path: '/',
    });
    res.json({ username, sessionToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('sessionToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
  });
  res.json({ message: 'Logged out successfully' });
});


// Replace the entire /api/refresh-token endpoint with:
app.post('/api/refresh-token', async (req, res) => {
  let token = req.cookies?.sessionToken;
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    // Try to verify the token first
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY);
    } catch (err) {
      // If verification fails, try to decode without verification
      decoded = jwt.decode(token);
      if (!decoded || !decoded.username) {
        return res.status(403).json({ error: 'Invalid token' });
      }
    }
    
    await ensureSheet('Users', ['Username', 'Password']);
    const users = await readSheet('Users', 'A2:B');
    const user = users.find(u => u[0] === decoded.username);
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }
    const newToken = jwt.sign({ username: decoded.username }, process.env.SECRET_KEY, { expiresIn: '24h' });
    res.cookie('sessionToken', newToken, {
      httpOnly: true,
      secure: true,
      maxAge: 86400000,
      sameSite: 'None',
      path: '/',
    });
    res.json({ username: decoded.username, sessionToken: newToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(403).json({ error: 'Invalid token' });
  }
});

// Get Clients
app.get('/api/get-clients', authenticateToken, async (req, res) => {
  try {
    await ensureSheet('Clients', ['User', 'Client_Name', 'Email', 'Type', 'Monthly_Payment']);
    const clients = await readSheet('Clients', 'A2:E');
    const userClients = clients.filter(client => client[0] === req.user.username);
    res.json(userClients.map(client => ({
      User: client[0],
      Client_Name: client[1],
      Email: client[2] || '',
      Type: client[3],
      // monthly_payment: parseFloat(client[4]) || 0,
      // changed
      Amount_To_Be_Paid: parseFloat(client[4]) || 0,
    })));
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add Client
app.post('/api/add-client', authenticateToken, async (req, res) => {
  let { clientName, email, type, monthlyPayment } = req.body;
  if (!clientName || !type || !monthlyPayment) {
    return res.status(400).json({ error: 'Client name, type, and monthly payment are required' });
  }
  clientName = sanitizeInput(clientName);
  type = sanitizeInput(type);
  email = email ? sanitizeInput(email) : '';
  const paymentValue = parseFloat(monthlyPayment);
  if (isNaN(paymentValue) || paymentValue <= 0) {
    return res.status(400).json({ error: 'Monthly payment must be a positive number' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  // Validate Type
  if (!['GST', 'IT Return'].includes(type)) {
    return res.status(400).json({ error: 'Type must be either "GST" or "IT Return"' });
  }
  try {
    await ensureSheet('Clients', ['User', 'Client_Name', 'Email', 'Type', 'Monthly_Payment']);
    await ensureSheet('Payments', ['User', 'Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment']);
    await appendSheet('Clients', [[req.user.username, clientName, email, type, paymentValue]]);
    await appendSheet('Payments', [[req.user.username, clientName, type, paymentValue, '', '', '', '', '', '', '', '', '', '', '', '', '0']]);
    res.status(201).json({ message: 'Client added successfully' });
  } catch (error) {
    console.error('Add client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Client
app.delete('/api/delete-client', authenticateToken, async (req, res) => {
  let { Client_Name, Type } = req.body;
  if (!Client_Name || !Type) {
    return res.status(400).json({ error: 'Client name and type are required' });
  }
  Client_Name = sanitizeInput(Client_Name);
  Type = sanitizeInput(Type);
  try {
    await ensureSheet('Clients', ['User', 'Client_Name', 'Email', 'Type', 'Monthly_Payment']);
    await ensureSheet('Payments', ['User', 'Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment']);
    let clients = await readSheet('Clients', 'A2:E');
    let payments = await readSheet('Payments', 'A2:R');
    const clientExists = clients.some(client => client[0] === req.user.username && client[1] === Client_Name && client[3] === Type);
    if (!clientExists) {
      return res.status(404).json({ error: 'Client not found' });
    }
    clients = clients.filter(client => !(client[0] === req.user.username && client[1] === Client_Name && client[3] === Type));
    payments = payments.filter(payment => !(payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type));
    await writeSheet('Clients', 'A2:E', clients);
    await writeSheet('Payments', 'A2:R', payments);
    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Payments
app.get('/api/get-payments', authenticateToken, async (req, res) => {
  try {
    await ensureSheet('Payments', ['User', 'Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment']);
    const payments = await readSheet('Payments', 'A2:R');
    const userPayments = payments.filter(payment => payment[0] === req.user.username);
    res.json(userPayments.map(payment => ({
      User: payment[0],
      Client_Name: payment[1],
      Type: payment[2],
      Amount_To_Be_Paid: parseFloat(payment[3]) || 0,
      january: payment[4] || '',
      february: payment[5] || '',
      march: payment[6] || '',
      april: payment[7] || '',
      may: payment[8] || '',
      june: payment[9] || '',
      july: payment[10] || '',
      august: payment[11] || '',
      september: payment[12] || '',
      october: payment[13] || '',
      november: payment[14] || '',
      december: payment[15] || '',
      Due_Payment: parseFloat(payment[16]) || '0',
    })));
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save Payments
app.post('/api/save-payments', authenticateToken, async (req, res) => {
  const paymentsData = req.body;
  if (!Array.isArray(paymentsData)) {
    return res.status(400).json({ error: 'Payments data must be an array' });
  }
  try {
    await ensureSheet('Payments', ['User', 'Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment']);
    let payments = await readSheet('Payments', 'A2:R');
    for (const data of paymentsData) {
      let { Client_Name, Type, Amount_To_Be_Paid, january, february, march, april, may, june, july, august, september, october, november, december, Due_Payment } = data;
      Client_Name = sanitizeInput(Client_Name);
      Type = sanitizeInput(Type);
      Amount_To_Be_Paid = parseFloat(Amount_To_Be_Paid);
      Due_Payment = parseFloat(Due_Payment);
      const months = [january, february, march, april, may, june, july, august, september, october, november, december];
      const sanitizedMonths = months.map(month => month ? sanitizeInput(month.toString()) : '');
      if (isNaN(Amount_To_Be_Paid) || Amount_To_Be_Paid <= 0) {
        continue;
      }
      if (isNaN(Due_Payment)) {
        Due_Payment = 0;
      }
      const index = payments.findIndex(payment => payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type);
      if (index !== -1) {
        payments[index] = [
          req.user.username,
          Client_Name,
          Type,
          Amount_To_Be_Paid,
          ...sanitizedMonths,
          Due_Payment.toFixed(2)
        ];
      } else {
        payments.push([
          req.user.username,
          Client_Name,
          Type,
          Amount_To_Be_Paid,
          ...sanitizedMonths,
          Due_Payment.toFixed(2)
        ]);
      }
    }
    await writeSheet('Payments', 'A2:R', payments);
    res.status(200).json({ message: 'Payments saved successfully' });
  } catch (error) {
    console.error('Save payments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import CSV
// app.post('/api/import-csv', authenticateToken, async (req, res) => {
//   const csvData = req.body;
//   if (!Array.isArray(csvData)) {
//     return res.status(400).json({ error: 'CSV data must be an array' });
//   }
//   try {
//     await ensureSheet('Clients', ['User', 'Client_Name', 'Email', 'Type', 'Monthly_Payment']);
//     await ensureSheet('Payments', ['User', 'Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment']);
//     let clients = await readSheet('Clients', 'A2:E');
//     let payments = await readSheet('Payments', 'A2:R');
//     for (const record of csvData) {
//       let { Client_Name, Type, Amount_To_Be_Paid } = record;
//       Client_Name = sanitizeInput(Client_Name || 'Unknown Client');
//       Type = sanitizeInput(Type || 'Unknown Type');
//       Amount_To_Be_Paid = parseFloat(Amount_To_Be_Paid);
//       if (isNaN(Amount_To_Be_Paid) || Amount_To_Be_Paid <= 0) {
//         continue;
//       }
//       const clientExists = clients.some(client => client[0] === req.user.username && client[1] === Client_Name && client[3] === Type);
//       if (!clientExists) {
//         await appendSheet('Clients', [[req.user.username, Client_Name, '', Type, Amount_To_Be_Paid]]);
//         clients.push([req.user.username, Client_Name, '', Type, Amount_To_Be_Paid]);
//       }
//       const paymentExists = payments.some(payment => payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type);
//       if (!paymentExists) {
//         await appendSheet('Payments', [[req.user.username, Client_Name, Type, Amount_To_Be_Paid, '', '', '', '', '', '', '', '', '', '', '', '', '0']]);
//         payments.push([req.user.username, Client_Name, Type, Amount_To_Be_Paid, '', '', '', '', '', '', '', '', '', '', '', '', '0']);
//       }
//     }
//     res.status(200).json({ message: 'CSV data imported successfully' });
//   } catch (error) {
//     console.error('Import CSV error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// Import CSV

// Utility to add delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// app.post('/api/import-csv', authenticateToken, async (req, res) => {
//   const csvData = req.body;
//   if (!Array.isArray(csvData)) {
//     return res.status(400).json({ error: 'CSV data must be an array' });
//   }
//   try {
//     await ensureSheet('Clients', ['User', 'Client_Name', 'Email', 'Type', 'Monthly_Payment']);
//     await ensureSheet('Payments', ['User', 'Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment']);
//     let clients = await readSheet('Clients', 'A2:E');
//     let payments = await readSheet('Payments', 'A2:R');
//     for (const record of csvData) {
//       let { Client_Name, Type, Email, Amount_To_Be_Paid } = record;
//       Client_Name = sanitizeInput(Client_Name || 'Unknown Client');
//       Type = sanitizeInput(Type || 'Unknown Type');
//       Email = Email ? sanitizeInput(Email) : '';
//       Amount_To_Be_Paid = parseFloat(Amount_To_Be_Paid);
//       if (isNaN(Amount_To_Be_Paid) || Amount_To_Be_Paid <= 0) {
//         continue;
//       }
//       if (Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Email)) {
//         continue; // Skip rows with invalid email
//       }
//       const clientExists = clients.some(client => client[0] === req.user.username && client[1] === Client_Name && client[3] === Type);
//       if (!clientExists) {
//         await appendSheet('Clients', [[req.user.username, Client_Name, Email, Type, Amount_To_Be_Paid]]);
//         clients.push([req.user.username, Client_Name, Email, Type, Amount_To_Be_Paid]);
//         await delay(200); // Add 200ms delay between writes to avoid rate limits
//       }
//       const paymentExists = payments.some(payment => payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type);
//       if (!paymentExists) {
//         await appendSheet('Payments', [[req.user.username, Client_Name, Type, Amount_To_Be_Paid, '', '', '', '', '', '', '', '', '', '', '', '', '0']]);
//         payments.push([req.user.username, Client_Name, Type, Amount_To_Be_Paid, '', '', '', '', '', '', '', '', '', '', '', '', '0']);
//         await delay(200); // Add 200ms delay between writes
//       }
//     }
//     res.status(200).json({ message: 'CSV data imported successfully' });
//   } catch (error) {
//     console.error('Import CSV error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

app.post('/api/import-csv', authenticateToken, async (req, res) => {
  const csvData = req.body;
  if (!Array.isArray(csvData)) {
    return res.status(400).json({ error: 'CSV data must be an array' });
  }
  try {
    await ensureSheet('Clients', ['User', 'Client_Name', 'Email', 'Type', 'Monthly_Payment']);
    await ensureSheet('Payments', ['User', 'Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment']);
    let clients = await readSheet('Clients', 'A2:E');
    let payments = await readSheet('Payments', 'A2:R');

    // Prepare batches for Clients and Payments
    const clientsBatch = [];
    const paymentsBatch = [];

    for (const record of csvData) {
      let { Client_Name, Type, Email, Amount_To_Be_Paid } = record;
      Client_Name = sanitizeInput(Client_Name || 'Unknown Client');
      Type = sanitizeInput(Type || 'Unknown Type');
      Email = Email ? sanitizeInput(Email) : '';
      Amount_To_Be_Paid = parseFloat(Amount_To_Be_Paid);
      if (isNaN(Amount_To_Be_Paid) || Amount_To_Be_Paid <= 0) {
        continue;
      }
      if (Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Email)) {
        continue;
      }
      if (!['GST', 'IT Return'].includes(Type)) {
        continue; // Skip invalid Type values
      }
      const clientExists = clients.some(client => client[0] === req.user.username && client[1] === Client_Name && client[3] === Type);
      if (!clientExists) {
        clientsBatch.push([req.user.username, Client_Name, Email, Type, Amount_To_Be_Paid]);
        clients.push([req.user.username, Client_Name, Email, Type, Amount_To_Be_Paid]);
      }
      const paymentExists = payments.some(payment => payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type);
      if (!paymentExists) {
        paymentsBatch.push([req.user.username, Client_Name, Type, Amount_To_Be_Paid, '', '', '', '', '', '', '', '', '', '', '', '', '0']);
        payments.push([req.user.username, Client_Name, Type, Amount_To_Be_Paid, '', '', '', '', '', '', '', '', '', '', '', '', '0']);
      }
    }

    // Write batches in one go if there are any rows to write
    if (clientsBatch.length > 0) {
      await appendSheet('Clients', clientsBatch);
    }
    if (paymentsBatch.length > 0) {
      await appendSheet('Payments', paymentsBatch);
    }

    res.status(200).json({ message: 'CSV data imported successfully' });
  } catch (error) {
    console.error('Import CSV error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Client
app.put('/api/update-client', authenticateToken, async (req, res) => {
  const { oldClient, newClient } = req.body;
  if (!oldClient || !newClient || !oldClient.Client_Name || !oldClient.Type || !newClient.Client_Name || !newClient.Type || !newClient.Amount_To_Be_Paid) {
    return res.status(400).json({ error: 'All required fields must be provided' });
  }
  let { Client_Name: oldClientName, Type: oldType } = oldClient;
  let { Client_Name: newClientName, Type: newType, Amount_To_Be_Paid: newAmount } = newClient;
  oldClientName = sanitizeInput(oldClientName);
  oldType = sanitizeInput(oldType);
  newClientName = sanitizeInput(newClientName);
  newType = sanitizeInput(newType);
  const paymentValue = parseFloat(newAmount);
  if (isNaN(paymentValue) || paymentValue <= 0) {
    return res.status(400).json({ error: 'Amount to be paid must be a positive number' });
  }
  // Validate Type
  if (!['GST', 'IT Return'].includes(newType)) {
    return res.status(400).json({ error: 'Type must be either "GST" or "IT Return"' });
  }
  try {
    await ensureSheet('Clients', ['User', 'Client_Name', 'Email', 'Type', 'Monthly_Payment']);
    await ensureSheet('Payments', ['User', 'Client_Name', 'Type', 'Amount_To_Be_Paid', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Due_Payment']);
    let clients = await readSheet('Clients', 'A2:E');
    let payments = await readSheet('Payments', 'A2:R');
    const clientIndex = clients.findIndex(client => client[0] === req.user.username && client[1] === oldClientName && client[3] === oldType);
    const paymentIndex = payments.findIndex(payment => payment[0] === req.user.username && payment[1] === oldClientName && payment[2] === oldType);
    if (clientIndex === -1 || paymentIndex === -1) {
      return res.status(404).json({ error: 'Client not found' });
    }
    // Preserve email from existing client record
    const email = clients[clientIndex][2] || '';
    // Preserve monthly payment data
    const monthlyPayments = payments[paymentIndex].slice(4, 16); // January to December
    const duePayment = payments[paymentIndex][16] || '0'; // Due_Payment
    clients[clientIndex] = [req.user.username, newClientName, email, newType, paymentValue];
    payments[paymentIndex] = [req.user.username, newClientName, newType, paymentValue, ...monthlyPayments, duePayment];
    await writeSheet('Clients', 'A2:E', clients);
    await writeSheet('Payments', 'A2:R', payments);
    res.json({ message: 'Client updated successfully' });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));