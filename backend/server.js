const express = require('express');
require('dotenv').config();
const { google } = require('googleapis');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { GoogleAuth } = require('google-auth-library');

const app = express();

const allowedOrigins = [
  'https://reliable-eclair-abf03c.netlify.app',
  'http://localhost:8080',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (error) {
  console.error('Error parsing GOOGLE_CREDENTIALS:', error);
  credentials = null;
}

async function getSheetsClient() {
  if (!credentials) {
    throw new Error('Google Sheets API credentials are not configured properly. Please set GOOGLE_CREDENTIALS environment variable.');
  }
  const auth = new GoogleAuth({
    credentials,
    scopes: SCOPES,
  });
  return google.sheets({ version: 'v4', auth });
}

const SECRET_KEY = process.env.JWT_SECRET || 'your-fallback-secret-key';

const verifySessionToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No session token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.username = decoded.username;
    next();
  } catch (error) {
    console.error('Error verifying session token:', error);
    return res.status(401).json({ error: 'Invalid session token. Please sign in again.' });
  }
};

app.post('/api/signup', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { username, password, gmailId } = req.body;

    if (!username || !password || !gmailId) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(gmailId) || !gmailId.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Please provide a valid Gmail ID' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Users!A2:C',
    });
    const users = response.data.values || [];

    const userExists = users.find(row => row[0] === username);
    if (userExists) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const values = [[username, hashedPassword, gmailId]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Users!A2',
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error signing up:', error);
    res.status(500).json({ error: 'Failed to sign up' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Users!A2:C',
    });
    const users = response.data.values || [];

    const user = users.find(row => row[0] === username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user[1]);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const sessionToken = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });

    res.json({ username, sessionToken });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Payment Tracker Backend is running!' });
});

app.get('/api/get-clients', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const range = 'Clients!A2:E';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];
    const data = rows
      .filter(row => row[0] === req.username)
      .map(row => ({
        User: row[0],
        Client_Name: row[1],
        Email: row[2],
        Type: row[3],
        monthly_payment: row[4],
      }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

app.get('/api/get-payments', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const range = 'Payments!A2:Q';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];
    const data = rows
      .filter(row => row[0] === req.username)
      .map(row => ({
        User: row[0],
        Client_Name: row[1],
        Type: row[2],
        Amount_To_Be_Paid: row[3],
        january: row[4],
        february: row[5],
        march: row[6],
        april: row[7],
        may: row[8],
        june: row[9],
        july: row[10],
        august: row[11],
        september: row[12],
        october: row[13],
        november: row[14],
        december: row[15],
        Due_Payment: row[16],
      }));

    res.json(data);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

app.post('/api/save-payments', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const data = req.body;

    const existingDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });
    const existingRows = existingDataResponse.data.values || [];

    const rowsToKeep = existingRows.filter(row => row[0] !== req.username);

    const values = data.map(row => [
      row.User || req.username,
      row.Client_Name || '',
      row.Type || '',
      row.Amount_To_Be_Paid || '',
      row.january || '',
      row.february || '',
      row.march || '',
      row.april || '',
      row.may || '',
      row.june || '',
      row.july || '',
      row.august || '',
      row.september || '',
      row.october || '',
      row.november || '',
      row.december || '',
      row.Due_Payment || '',
    ]);

    const updatedValues = [...rowsToKeep, ...values];

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });

    if (updatedValues.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Payments!A2',
        valueInputOption: 'RAW',
        requestBody: { values: updatedValues },
      });
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error saving payments:', error);
    res.status(500).json({ error: 'Failed to save payments' });
  }
});

app.post('/api/add-client', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { User, Client_Name, Email, Type, monthly_payment } = req.body;

    if (!User || !Client_Name || !Email || !Type || !monthly_payment) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(Email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const paymentValue = parseFloat(monthly_payment);
    if (isNaN(paymentValue) || paymentValue <= 0) {
      return res.status(400).json({ error: 'Monthly payment must be a positive number' });
    }

    const clientResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A2:E',
    });
    const clients = clientResponse.data.values || [];

    const clientExists = clients.find(row => row[0] === User && row[1] === Client_Name && row[3] === Type);
    if (clientExists) {
      return res.status(400).json({ error: 'Client with this name and type already exists for this user' });
    }

    const clientValues = [[User, Client_Name, Email, Type, monthly_payment]];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Clients!A2',
      valueInputOption: 'RAW',
      requestBody: { values: clientValues },
    });

    const paymentValues = [[
      User,
      Client_Name,
      Type,
      monthly_payment,
      '', '', '', '', '', '', '', '', '', '', '', '', '0.00'
    ]];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Payments!A2',
      valueInputOption: 'RAW',
      requestBody: { values: paymentValues },
    });

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error adding client:', error);
    res.status(500).json({ error: 'Failed to add client' });
  }
});

app.put('/api/update-client', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { User, Client_Name, Email, Type, monthly_payment, Old_Client_Name, Old_Type } = req.body;

    if (!User || !Client_Name || !Email || !Type || !monthly_payment || !Old_Client_Name || !Old_Type) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(Email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const paymentValue = parseFloat(monthly_payment);
    if (isNaN(paymentValue) || paymentValue <= 0) {
      return res.status(400).json({ error: 'Monthly payment must be a positive number' });
    }

    const clientResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A2:E',
    });
    let clients = clientResponse.data.values || [];

    const clientIndex = clients.findIndex(row => row[0] === User && row[1] === Old_Client_Name && row[3] === Old_Type);
    if (clientIndex === -1) {
      return res.status(404).json({ error: 'Client not found' });
    }

    clients[clientIndex] = [User, Client_Name, Email, Type, monthly_payment];

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Clients!A2:E',
    });

    if (clients.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Clients!A2',
        valueInputOption: 'RAW',
        requestBody: { values: clients },
      });
    }

    const paymentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });
    let payments = paymentResponse.data.values || [];

    const paymentIndex = payments.findIndex(row => row[0] === User && row[1] === Old_Client_Name && row[2] === Old_Type);
    if (paymentIndex !== -1) {
      payments[paymentIndex][1] = Client_Name;
      payments[paymentIndex][2] = Type;
      payments[paymentIndex][3] = monthly_payment;

      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Payments!A2:Q',
      });

      if (payments.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Payments!A2',
          valueInputOption: 'RAW',
          requestBody: { values: payments },
        });
      }
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

app.delete('/api/delete-client', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { User, Client_Name, Type } = req.body;

    if (!User || !Client_Name || !Type) {
      return res.status(400).json({ error: 'User, Client Name, and Type are required' });
    }

    const clientResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A2:E',
    });
    let clients = clientResponse.data.values || [];

    const updatedClients = clients.filter(row => !(row[0] === User && row[1] === Client_Name && row[3] === Type));

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Clients!A2:E',
    });

    if (updatedClients.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Clients!A2',
        valueInputOption: 'RAW',
        requestBody: { values: updatedClients },
      });
    }

    const paymentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });
    let payments = paymentResponse.data.values || [];

    const updatedPayments = payments.filter(row => !(row[0] === User && row[1] === Client_Name && row[2] === Type));

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });

    if (updatedPayments.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Payments!A2',
        valueInputOption: 'RAW',
        requestBody: { values: updatedPayments },
      });
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

app.post('/api/import-csv', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const data = req.body;

    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'No data provided' });
    }

    const clientResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A2:E',
    });
    let clients = clientResponse.data.values || [];

    const paymentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });
    let payments = paymentResponse.data.values || [];

    const rowsToKeepClients = clients.filter(row => row[0] !== req.username);
    const rowsToKeepPayments = payments.filter(row => row[0] !== req.username);

    const clientValues = [];
    const paymentValues = [];

    for (const row of data) {
      const { User, Client_Name, Type, Amount_To_Be_Paid } = row;
      if (!User || !Client_Name || !Type || !Amount_To_Be_Paid) {
        continue;
      }

      const paymentValue = parseFloat(Amount_To_Be_Paid);
      if (isNaN(paymentValue) || paymentValue <= 0) {
        continue;
      }

      const clientExists = clients.find(c => c[0] === User && c[1] === Client_Name && c[3] === Type);
      if (!clientExists) {
        clientValues.push([User, Client_Name, '', Type, Amount_To_Be_Paid]);
      }

      paymentValues.push([
        User,
        Client_Name,
        Type,
        Amount_To_Be_Paid,
        row.january || '',
        row.february || '',
        row.march || '',
        row.april || '',
        row.may || '',
        row.june || '',
        row.july || '',
        row.august || '',
        row.september || '',
        row.october || '',
        row.november || '',
        row.december || '',
        row.Due_Payment || '0.00',
      ]);
    }

    const updatedClients = [...rowsToKeepClients, ...clientValues];
    const updatedPayments = [...rowsToKeepPayments, ...paymentValues];

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Clients!A2:E',
    });

    if (updatedClients.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Clients!A2',
        valueInputOption: 'RAW',
        requestBody: { values: updatedClients },
      });
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });

    if (updatedPayments.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Payments!A2',
        valueInputOption: 'RAW',
        requestBody: { values: updatedPayments },
      });
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Failed to import CSV data' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});