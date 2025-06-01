const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

//If directly running it on terminal Use This
//const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'paymenttracker-461218-b6147a7a3f80.json');

// Using on Render, Parse the GOOGLE_CREDENTIALS environment variable with error handling
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (error) {
  console.error('Error parsing GOOGLE_CREDENTIALS:', error);
  process.exit(1); 
}

async function getSheetsClient() {
  //If directly running it on terminal use this
  // const auth = new GoogleAuth({
  //   keyFile: CREDENTIALS_PATH,
  //   scopes: SCOPES,
  // });
  // If running it on Render use this
  const auth = new GoogleAuth({
  credentials,
  scopes: SCOPES,
  });
  return google.sheets({ version: 'v4', auth });
}

// Get clients from Clients worksheet (filtered by User)
app.get('/api/get-clients', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A2:D', // Updated range to include User, Client Name, Type, Monthly Payment
    });
    const rows = response.data.values || [];
    const clients = rows.map(row => ({
      User: row[0] || '',
      Client_Name: row[1] || '',
      Type: row[2] || '',
      monthly_payment: row[3] || '',
    }));
    // Filter clients by User from the request header
    const User = req.headers.User || '';
    const UserClients = clients.filter(client => client.User === User);
    res.json(UserClients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get payments from Payments worksheet (filtered by User)
app.get('/api/get-payments', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:Q', // Updated range to include User column
    });
    const rows = response.data.values || [];
    const payments = rows.map(row => ({
      User: row[0] || '',
      Client_Name: row[1] || '',
      Type: row[2] || '',
      Amount_To_Be_Paid: row[3] || '',
      january: row[4] || '',
      february: row[5] || '',
      march: row[6] || '',
      april: row[7] || '',
      may: row[8] || '',
      june: row[9] || '',
      july: row[10] || '',
      august: row[11] || '',
      september: row[12] || '',
      october: row[13] || '',
      november: row[14] || '',
      december: row[15] || '',
      Due_Payment: row[16] || '',
    }));
    // Filter payments by User from the request header
    const User = req.headers.User || '';
    const UserPayments = payments.filter(payment => payment.User === User);
    res.json(UserPayments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Save payments to Payments worksheet
app.post('/api/save-payments', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8'; 
    const data = req.body;
    const values = data.map(row => [
      row.User || '',
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
    // Clear existing data for the User
    const existingDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });
    const existingData = existingDataResponse.data.values || [];
    const User = req.body[0]?.User || '';
    const nonUserData = existingData.filter(row => row[0] !== User);
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Payments!A2:Q',
    });
    // Append non-User data back
    if (nonUserData.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Payments!A2',
        valueInputOption: 'RAW',
        requestBody: { values: nonUserData },
      });
    }
    // Append new User data
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Payments!A2',
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error saving to sheets:', error);
    res.status(500).json({ error: 'Failed to save to sheets' });
  }
});

// Add a new client to Clients worksheet
app.post('/api/add-client', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const newClient = req.body;
    const values = [[
      newClient.User || '',
      newClient.Client_Name || '',
      newClient.Type || '',
      newClient.monthly_payment || '',
    ]];
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

app.get('/', (req, res) => {
  res.send('Backend is running. Use /api/get-clients, /api/get-payments, or /api/add-client');
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});