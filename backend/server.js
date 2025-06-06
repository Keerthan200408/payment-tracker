const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const csv = require('csv-parse');
const { Readable } = require('stream');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');

const app = express();

app.use(cors({
  origin: 'https://reliable-eclair-abf03c.netlify.app',
  credentials: true,
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
});
app.use(limiter);

// Add root route for debugging
app.get('/', (req, res) => {
  res.send('Payment Tracker Backend is running!');
});

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const spreadsheetId = process.env.SPREADSHEET_ID || '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';

async function getSheetsClient() {
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// Helper to read data from a sheet
async function readSheet(sheetName, range) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${range}`,
  });
  return response.data.values || [];
}

// Helper to write data to a sheet
async function writeSheet(sheetName, range, values) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${range}`,
    valueInputOption: 'RAW',
    resource: { values },
  });
}

// Helper to append data to a sheet
async function appendSheet(sheetName, values) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetName,
    valueInputOption: 'RAW',
    resource: { values },
  });
}

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const token = req.cookies.sessionToken;
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Input sanitization helper
const sanitizeInput = (input) => {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
};

// Signup
app.post('/api/signup', async (req, res) => {
  let { username, password, gmailId } = req.body;
  if (!username || !password || !gmailId) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Sanitize inputs
  username = sanitizeInput(username);
  gmailId = sanitizeInput(gmailId);

  if (!gmailId.endsWith('@gmail.com')) {
    return res.status(400).json({ error: 'Please enter a valid Gmail ID' });
  }
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const users = await readSheet('Users', 'A2:C');
    if (users.some(user => user[0] === username || user[2] === gmailId)) {
      return res.status(400).json({ error: 'Username or Gmail ID already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await appendSheet('Users', [[username, hashedPassword, gmailId]]);
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Authenticate with Google Sheets
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: 'Users!A:B', // Adjust range if your sheet differs
    });

    const users = response.data.values || [];
    const user = users.find(u => u[0] === email && u[1] === password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Successful login (add session or token logic if needed)
    res.status(200).json({ message: 'Login successful', user: { email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('sessionToken');
  res.json({ message: 'Logged out successfully' });
});

// Get Clients
app.get('/api/get-clients', authenticateToken, async (req, res) => {
  try {
    const clients = await readSheet('Clients', 'A2:E');
    const userClients = clients.filter(client => client[0] === req.user.username);
    res.json(userClients.map(client => ({
      User: client[0],
      Client_Name: client[1],
      Email: client[2],
      Type: client[3],
      monthly_payment: client[4],
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

  // Sanitize inputs
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

  try {
    await appendSheet('Clients', [[req.user.username, clientName, email, type, paymentValue]]);
    await appendSheet('Payments', [[req.user.username, clientName, type, paymentValue, '', '', '', '', '', '', '', '', '', '', '', '', '0']]);
    res.status(201).json({ message: 'Client added successfully' });
  } catch (error) {
    console.error('Add client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Client
app.put('/api/update-client', authenticateToken, async (req, res) => {
  let { clientName, email, type, monthlyPayment, Old_Client_Name, Old_Type } = req.body;
  if (!clientName || !type || !monthlyPayment || !Old_Client_Name || !Old_Type) {
    return res.status(400).json({ error: 'All required fields must be provided' });
  }

  // Sanitize inputs
  clientName = sanitizeInput(clientName);
  type = sanitizeInput(type);
  Old_Client_Name = sanitizeInput(Old_Client_Name);
  Old_Type = sanitizeInput(Old_Type);
  email = email ? sanitizeInput(email) : '';

  const paymentValue = parseFloat(monthlyPayment);
  if (isNaN(paymentValue) || paymentValue <= 0) {
    return res.status(400).json({ error: 'Monthly payment must be a positive number' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    let clients = await readSheet('Clients', 'A2:E');
    let payments = await readSheet('Payments', 'A2:R');

    const clientIndex = clients.findIndex(client => client[0] === req.user.username && client[1] === Old_Client_Name && client[3] === Old_Type);
    const paymentIndex = payments.findIndex(payment => payment[0] === req.user.username && payment[1] === Old_Client_Name && payment[2] === Old_Type);

    if (clientIndex === -1 || paymentIndex === -1) {
      return res.status(404).json({ error: 'Client not found' });
    }

    clients[clientIndex] = [req.user.username, clientName, email, type, paymentValue];
    payments[paymentIndex][1] = clientName;
    payments[paymentIndex][2] = type;
    payments[paymentIndex][3] = paymentValue;

    await writeSheet('Clients', 'A2:E', clients);
    await writeSheet('Payments', 'A2:R', payments);
    res.json({ message: 'Client updated successfully' });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Client
app.delete('/api/delete-client', authenticateToken, async (req, res) => {
  let { Client_Name, Type } = req.body;
  if (!Client_Name || !Type) {
    return res.status(400).json({ error: 'Client name and type are required' });
  }

  // Sanitize inputs
  Client_Name = sanitizeInput(Client_Name);
  Type = sanitizeInput(Type);

  try {
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
    const payments = await readSheet('Payments', {});
    const userPayments = payments.filter(payment => payment[0] === req.user.username);
    res.json(userPayments.map(payment => ({
      User: payment[0],
      Client_Name: payment[1],
      Type: payment[2],
      Amount_To_Be_Paid: payment[3],
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
      Due_Payment: payment[16] || '0',
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
    let payments = await readSheet('Payments', 'A2:R');
    for (const data of paymentsData) {
      let { Client_Name, Type, Amount_To_Be_Paid, january, february, march, april, may, june, july, august, september, october, november, december, Due_Payment } = data;
      
      // Sanitize inputs
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
app.post('/api/import-csv', authenticateToken, async (req, res) => {
  const csvData = req.body;
  if (!Array.isArray(csvData)) {
    return res.status(400).json({ error: 'CSV data must be an array' });
  }

  try {
    for (const record of csvData) {
      let { Client_Name, Type, Amount_To_Be_Paid } = record;
      
      // Sanitize inputs
      Client_Name = sanitizeInput(Client_Name || 'Unknown Client');
      Type = sanitizeInput(Type || 'Unknown Type');
      Amount_To_Be_Paid = parseFloat(Amount_To_Be_Paid);

      if (isNaN(Amount_To_Be_Paid) || Amount_To_Be_Paid <= 0) {
        continue;
      }

      let clients = await readSheet('Clients', 'A2:E');
      const clientExists = clients.some(client => client[0] === req.user.username && client[1] === Client_Name && client[3] === Type);
      if (!clientExists) {
        await appendSheet('Clients', [[req.user.username, Client_Name, '', Type, Amount_To_Be_Paid]]);
      }

      let payments = await readSheet('Payments', 'A2:R');
      const paymentExists = payments.some(payment => payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type);
      if (!paymentExists) {
        await appendSheet('Payments', [[req.user.username, Client_Name, Type, Amount_To_Be_Paid, '', '', '', '', '', '', '', '', '', '', '', '', '0']]);
      }
    }
    res.status(200).json({ message: 'CSV data imported successfully' });
  } catch (error) {
    console.error('Import CSV error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));