const express = require('express');
require('dotenv').config();
const { google } = require('googleapis');
// CHANGE: Added bcrypt for secure password hashing
const bcrypt = require('bcryptjs');
// CHANGE: Added jsonwebtoken for creating and verifying session tokens
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
// CHANGE: Added GoogleAuth for simplified Google API authentication
const { GoogleAuth } = require('google-auth-library');

const app = express();
// Enable CORS to allow cross-origin requests from the frontend
const allowedOrigins = ['https://payment-tracker-aswa.onrender.com', 'http://localhost:8080'];
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
// Parse incoming JSON requests
app.use(express.json());

// Apply rate limiting to prevent abuse (100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Define the required Google Sheets API scope
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Load Google API credentials from environment variable
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (error) {
  console.error('Error parsing GOOGLE_CREDENTIALS:', error);
  credentials = null;
}

// CHANGE: Simplified Google Sheets client setup using GoogleAuth (replaced oAuth2Client)
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

// CHANGE: Added a secret key for JWT (used for session tokens)
const SECRET_KEY = process.env.JWT_SECRET || 'your-fallback-secret-key';

// CHANGE: Added middleware to verify session tokens in requests
const verifySessionToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  // Check if the Authorization header exists and starts with 'Bearer '
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No session token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    // Verify the JWT token and extract the username
    const decoded = jwt.verify(token, SECRET_KEY);
    req.username = decoded.username;
    next();
  } catch (error) {
    console.error('Error verifying session token:', error);
    return res.status(401).json({ error: 'Invalid session token. Please sign in again.' });
  }
};

// CHANGE: Added signup endpoint to create a new user account
app.post('/api/signup', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { username, password, gmailId } = req.body;

    // Validate that all required fields are provided
    if (!username || !password || !gmailId) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate Gmail ID format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(gmailId) || !gmailId.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Please provide a valid Gmail ID' });
    }

    // Fetch existing users from the 'Users' sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Users!A2:C',
    });
    const users = response.data.values || [];

    // Check if the username already exists
    const userExists = users.find(row => row[0] === username);
    if (userExists) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);
    const values = [[username, hashedPassword, gmailId]];

    // Append the new user to the 'Users' sheet
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

// CHANGE: Added login endpoint to authenticate users
app.post('/api/login', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { username, password } = req.body;

    // Validate that both username and password are provided
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Fetch users from the 'Users' sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Users!A2:C',
    });
    const users = response.data.values || [];

    // Find the user by username
    const user = users.find(row => row[0] === username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Compare the provided password with the stored hashed password
    const passwordMatch = await bcrypt.compare(password, user[1]);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate a JWT session token
    const sessionToken = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });

    res.json({ username, sessionToken });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// CHANGE: Updated get-clients endpoint to filter by authenticated user and require session token
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
    // Filter clients by the authenticated user
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

// CHANGE: Updated get-payments endpoint to filter by authenticated user and require session token
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
    // Filter payments by the authenticated user
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

// CHANGE: Updated save-payments endpoint to include user and require session token
app.post('/api/save-payments', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const data = req.body;

    // Fetch existing payments
    const existingDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });
    const existingRows = existingDataResponse.data.values || [];

    // Filter out payments for other users (keep only rows not belonging to the current user)
    const rowsToKeep = existingRows.filter(row => row[0] !== req.username);

    // Prepare new rows for the current user
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

    // Combine rows to keep (other users' data) with the current user's updated data
    const updatedValues = [...rowsToKeep, ...values];

    // Clear the Payments sheet (excluding headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });

    // Write the updated data back to the sheet
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

// CHANGE: Updated add-client endpoint to include user and require session token
app.post('/api/add-client', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { Client_Name, Email, Type, monthly_payment } = req.body;

    // Validate required fields
    if (!Client_Name || !Email || !Type || !monthly_payment) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const values = [[req.username, Client_Name, Email, Type, monthly_payment]];

    // Append the new client to the Clients sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Clients!A2',
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error adding client:', error);
    res.status(500).json({ error: 'Failed to add client' });
  }
});

// CHANGE: Added update-client endpoint to modify existing clients (requires session token)
app.put('/api/update-client', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { Client_Name, Email, Type, monthly_payment, Old_Client_Name, Old_Type } = req.body;

    if (!Client_Name || !Email || !Type || !monthly_payment || !Old_Client_Name || !Old_Type) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Fetch existing clients
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A2:E',
    });
    const rows = response.data.values || [];

    // Find the index of the client to update
    const clientIndex = rows.findIndex(row => row[0] === req.username && row[1] === Old_Client_Name && row[3] === Old_Type);
    if (clientIndex === -1) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Update the client's data
    rows[clientIndex] = [req.username, Client_Name, Email, Type, monthly_payment];

    // Write the updated data back to the sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Clients!A2',
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });

    // Also update the Payments sheet if the client name or type has changed
    const paymentsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });
    const paymentRows = paymentsResponse.data.values || [];

    const updatedPaymentRows = paymentRows.map(row => {
      if (row[0] === req.username && row[1] === Old_Client_Name && row[2] === Old_Type) {
        return [req.username, Client_Name, Type, ...row.slice(3)];
      }
      return row;
    });

    // Clear the Payments sheet (excluding headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });

    // Write the updated payments back to the sheet
    if (updatedPaymentRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Payments!A2',
        valueInputOption: 'RAW',
        requestBody: { values: updatedPaymentRows },
      });
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// CHANGE: Added delete-client endpoint to remove a client (requires session token)
app.delete('/api/delete-client', verifySessionToken, async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const { Client_Name, Type } = req.body;

    if (!Client_Name || !Type) {
      return res.status(400).json({ error: 'Client Name and Type are required' });
    }

    // Fetch existing clients
    const clientsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A2:E',
    });
    const clientRows = clientsResponse.data.values || [];

    // Filter out the client to delete
    const updatedClientRows = clientRows.filter(row => !(row[0] === req.username && row[1] === Client_Name && row[3] === Type));

    // Clear the Clients sheet (excluding headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Clients!A2:E',
    });

    // Write the updated clients back to the sheet
    if (updatedClientRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Clients!A2',
        valueInputOption: 'RAW',
        requestBody: { values: updatedClientRows },
      });
    }

    // Also remove associated payments
    const paymentsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });
    const paymentRows = paymentsResponse.data.values || [];

    const updatedPaymentRows = paymentRows.filter(row => !(row[0] === req.username && row[1] === Client_Name && row[2] === Type));

    // Clear the Payments sheet (excluding headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });

    // Write the updated payments back to the sheet
    if (updatedPaymentRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Payments!A2',
        valueInputOption: 'RAW',
        requestBody: { values: updatedPaymentRows },
      });
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// CHANGE: Removed Google OAuth endpoints (/api/verify-token) and related code (oAuth2Client, token verification)

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});