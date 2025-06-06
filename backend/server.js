const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const csv = require('csv-parse');
const { Readable } = require('stream');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors({
  origin: ['https://reliable-eclair-abf03c.netlify.app', 'http://localhost:8000', 'http://127.0.0.1:8000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Add root route for debugging
app.get('/', (req, res) => {
  res.send('Payment Tracker Backend is running!');
});

// Validate environment variables
if (!process.env.GOOGLE_CREDENTIALS || !process.env.SPREADSHEET_ID) {
  console.error('Missing required environment variables: GOOGLE_CREDENTIALS or SPREADSHEET_ID');
  process.exit(1);
}

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const spreadsheetId = process.env.SPREADSHEET_ID || '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';

async function getSheetsClient() {
  try {
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
  } catch (error) {
    console.error('Error initializing Google Sheets client:', error.message);
    throw error;
  }
}

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied: No token provided' });

  jwt.verify(token, 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Helper to read data from a sheet
async function readSheet(sheetName, range) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!${range}`,
    });
    return response.data.values || [];
  } catch (error) {
    console.error(`Error reading sheet ${sheetName} range ${range}:`, error.message);
    throw error;
  }
}

// Helper to write data to a sheet
async function writeSheet(sheetName, range, values) {
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!${range}`,
      valueInputOption: 'RAW',
      resource: { values },
    });
  } catch (error) {
    console.error(`Error writing to sheet ${sheetName} range ${range}:`, error.message);
    throw error;
  }
}

// Helper to append data to a sheet
async function appendSheet(sheetName, values) {
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: 'RAW',
      resource: { values },
    });
  } catch (error) {
    console.error(`Error appending to sheet ${sheetName}:`, error.message);
    throw error;
  }
}

// Signup
app.post('/api/signup', async (req, res) => {
  const { username, password, gmailId } = req.body;
  console.log('Signup request:', { username, gmailId }); // Debug log

  if (!username || !password || !gmailId) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!gmailId.endsWith('@gmail.com')) {
    return res.status(400).json({ error: 'Please enter a valid Gmail ID' });
  }

  try {
    const users = await readSheet('Users', 'A2:C');
    if (users.some(user => user[0] === username || user[2] === gmailId)) {
      return res.status(400).json({ error: 'Username or Gmail ID already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await appendSheet('Users', [[username, hashedPassword, gmailId]]);
    console.log('User signed up successfully:', username);
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).json({ error: `Failed to sign up: ${error.message}` });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login request:', { username });

  if (!username?.trim() || !password?.trim()) {
    console.log('Missing or empty credentials:', { username });
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const users = await readSheet('Users', 'A2:C');
    console.log('Users fetched:', { userCount: users.length });

    if (!users || users.length === 0) {
      console.log('Users sheet is empty or inaccessible');
      return res.status(500).json({ error: 'No users found in database. Contact support.' });
    }

    const user = users.find(u => u[0] === username.trim());
    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!user[1] || !user[1].startsWith('$2a$')) {
      console.log('Invalid password hash for user:', username);
      return res.status(500).json({ error: 'Corrupted user data. Contact support.' });
    }

    const passwordMatch = await bcrypt.compare(password.trim(), user[1]);
    if (!passwordMatch) {
      console.log('Password mismatch for user:', username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ username: username.trim() }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
    console.log('Login successful:', username);
    res.json({ username: username.trim(), sessionToken: token });
  } catch (error) {
    console.error('Login error:', {
      message: error.message,
      stack: error.stack,
      username
    });
    res.status(500).json({ error: `Failed to log in: ${error.message}` });
  }
});

// [Rest of your server.js code remains unchanged: /api/get-clients, /api/add-client, /api/update-client, /api/delete-client, /api/get-payments, /api/save-payments, /api/import-csv]

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));

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
    res.status(500).json({ error: error.message });
  }
});

// Add Client
app.post('/api/add-client', authenticateToken, async (req, res) => {
  const { clientName, email, type, monthlyPayment } = req.body;
  try {
    await appendSheet('Clients', [[req.user.username, clientName, email, type, monthlyPayment]]);
    await appendSheet('Payments', [[req.user.username, clientName, type, monthlyPayment, '', '', '', '', '', '', '', '', '', '', '', '', '0']]);
    res.status(201).json({ message: 'Client added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Client
app.put('/api/update-client', authenticateToken, async (req, res) => {
  const { clientName, email, type, monthlyPayment, Old_Client_Name, Old_Type } = req.body;
  try {
    let clients = await readSheet('Clients', 'A2:E');
    let payments = await readSheet('Payments', 'A2:R');

    const clientIndex = clients.findIndex(client => client[0] === req.user.username && client[1] === Old_Client_Name && client[3] === Old_Type);
    const paymentIndex = payments.findIndex(payment => payment[0] === req.user.username && payment[1] === Old_Client_Name && payment[2] === Old_Type);

    if (clientIndex !== -1) {
      clients[clientIndex] = [req.user.username, clientName, email, type, monthlyPayment];
      await writeSheet('Clients', 'A2:E', clients);
    }

    if (paymentIndex !== -1) {
      payments[paymentIndex][1] = clientName;
      payments[paymentIndex][2] = type;
      payments[paymentIndex][3] = monthlyPayment;
      await writeSheet('Payments', 'A2:R', payments);
    }

    res.json({ message: 'Client updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Client
app.delete('/api/delete-client', authenticateToken, async (req, res) => {
  const { Client_Name, Type } = req.body;
  try {
    let clients = await readSheet('Clients', 'A2:E');
    let payments = await readSheet('Payments', 'A2:R');

    clients = clients.filter(client => !(client[0] === req.user.username && client[1] === Client_Name && client[3] === Type));
    payments = payments.filter(payment => !(payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type));

    await writeSheet('Clients', 'A2:E', clients);
    await writeSheet('Payments', 'A2:R', payments);
    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Payments
app.get('/api/get-payments', authenticateToken, async (req, res) => {
  try {
    const payments = await readSheet('Payments', 'A2:R');
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
    res.status(500).json({ error: error.message });
  }
});

// Save Payments
app.post('/api/save-payments', authenticateToken, async (req, res) => {
  try {
    const paymentsData = req.body;
    let payments = await readSheet('Payments', 'A2:R');
    for (const data of paymentsData) {
      const { Client_Name, Type, Amount_To_Be_Paid, january, february, march, april, may, june, july, august, september, october, november, december, Due_Payment } = data;
      const index = payments.findIndex(payment => payment[0] === req.user.username && payment[1] === Client_Name && payment[2] === Type);
      if (index !== -1) {
        payments[index] = [
          req.user.username, Client_Name, Type, Amount_To_Be_Paid,
          january, february, march, april, may, june, july, august, september, october, november, december,
          Due_Payment
        ];
      }
    }
    await writeSheet('Payments', 'A2:R', payments);
    res.status(200).json({ message: 'Payments saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import CSV (Flexible Mapping with Auto-Correction)
app.post('/api/import-csv', authenticateToken, async (req, res) => {
  try {
    const csvData = req.body; // Expecting an array of objects from the frontend
    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      return res.status(400).json({ error: 'No valid CSV data provided' });
    }

    const records = csvData;
    const processedRecords = [];

    // Define possible column name variations for mapping
    const clientNameAliases = ['client name', 'client_name', 'client', 'name', 'customer'];
    const typeAliases = ['type', 'category', 'service', 'product'];
    const amountAliases = ['amount to be paid', 'amount_to_be_paid', 'amount', 'payment', 'monthly payment', 'monthly_payment', 'price'];

    for (const record of records) {
      // Convert all keys to lowercase for case-insensitive matching
      const normalizedRecord = Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/\s+/g, '_'), value])
      );

      // Find matching keys for each field
      const clientNameKey = Object.keys(normalizedRecord).find(key =>
        clientNameAliases.some(alias => key.includes(alias.toLowerCase().replace(/\s+/g, '_')))
      ) || Object.keys(normalizedRecord)[0]; // Fallback to first column
      const typeKey = Object.keys(normalizedRecord).find(key =>
        typeAliases.some(alias => key.includes(alias.toLowerCase().replace(/\s+/g, '_')))
      ) || Object.keys(normalizedRecord)[1] || 'Unknown_Type'; // Fallback to second column or default
      const amountKey = Object.keys(normalizedRecord).find(key =>
        amountAliases.some(alias => key.includes(alias.toLowerCase().replace(/\s+/g, '_')))
      ) || Object.keys(normalizedRecord)[2]; // Fallback to third column

      // Extract and clean values
      let clientName = normalizedRecord[clientNameKey] || 'Unknown_Client_' + Math.random().toString(36).substr(2, 5);
      let type = normalizedRecord[typeKey] || 'Unknown_Type';
      let amountToBePaid = parseFloat(normalizedRecord[amountKey] || '0');

      // Data validation and auto-correction
      clientName = clientName.trim().replace(/[^a-zA-Z0-9\s]/g, ''); // Remove special characters
      if (!clientName) clientName = 'Unknown_Client_' + Math.random().toString(36).substr(2, 5);
      type = type.trim().replace(/[^a-zA-Z0-9\s]/g, ''); // Remove special characters
      if (!type) type = 'Unknown_Type';

      // Validate and correct amount
      if (isNaN(amountToBePaid) || amountToBePaid <= 0) {
        console.warn(`Invalid amount for record: ${JSON.stringify(record)}. Setting to 0.`);
        amountToBePaid = 0; // Default to 0 for invalid amounts
        continue; // Skip records with invalid amounts
      } else {
        amountToBePaid = Math.round(amountToBePaid * 100) / 100; // Round to 2 decimal places
      }

      processedRecords.push({
        User: req.user.username,
        Client_Name: clientName,
        Type: type,
        Amount_To_Be_Paid: amountToBePaid,
        january: '',
        february: '',
        march: '',
        april: '',
        may: '',
        june: '',
        july: '',
        august: '',
        september: '',
        october: '',
        november: '',
        december: '',
        Due_Payment: '0'
      });
    }

    if (processedRecords.length === 0) {
      return res.status(400).json({ error: 'No valid records found in CSV data' });
    }

    // Update Clients and Payments sheets
    let clients = await readSheet('Clients', 'A2:E');
    let payments = await readSheet('Payments', 'A2:R');

    for (const record of processedRecords) {
      const { Client_Name, Type, Amount_To_Be_Paid } = record;

      // Check if client exists
      const clientExists = clients.some(client => 
        client[0] === req.user.username && 
        client[1].toLowerCase() === Client_Name.toLowerCase() && 
        client[3].toLowerCase() === Type.toLowerCase()
      );
      if (!clientExists) {
        await appendSheet('Clients', [[req.user.username, Client_Name, '', Type, Amount_To_Be_Paid]]);
      }

      // Check if payment exists
      const paymentExists = payments.some(payment => 
        payment[0] === req.user.username && 
        payment[1].toLowerCase() === Client_Name.toLowerCase() && 
        payment[2].toLowerCase() === Type.toLowerCase()
      );
      if (!paymentExists) {
        await appendSheet('Payments', [[
          req.user.username, Client_Name, Type, Amount_To_Be_Paid,
          '', '', '', '', '', '', '', '', '', '', '', '', '0'
        ]]);
      }
    }

    res.status(200).json({ message: 'CSV data imported successfully' });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Failed to import CSV: ' + error.message });
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));