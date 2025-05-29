const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'paymenttracker-461218-b6147a7a3f80.json');

async function getSheetsClient() {
  const auth = new GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SCOPES,
  });
  return google.sheets({ version: 'v4', auth });
}

// Get clients from Clients worksheet
app.get('/api/get-clients', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A2:B',
    });
    const data = response.data.values
      ? response.data.values.map(row => ({
          client_name: row[0] || '',
          type: row[1] || '',
        }))
      : [];
    res.json(data);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get payments from Payments worksheet
app.get('/api/get-payments', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Payments!A2:P',
    });
    const data = response.data.values
      ? response.data.values.map(row => ({
          client_name: row[0] || '',
          type: row[1] || '',
          amount_to_be_paid: row[2] || '',
          january: row[3] || '',
          february: row[4] || '',
          march: row[5] || '',
          april: row[6] || '',
          may: row[7] || '',
          june: row[8] || '',
          july: row[9] || '',
          august: row[10] || '',
          september: row[11] || '',
          october: row[12] || '',
          november: row[13] || '',
          december: row[14] || '',
          due_payment: row[15] || '',
        }))
      : [];
    res.json(data);
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
      row.client_name || '',
      row.type || '',
      row.amount_to_be_paid || '',
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
      row.due_payment || '',
    ]);
    // Clear existing data (excluding headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Payments!A2:P',
    });
    // Write new data
    await sheets.spreadsheets.values.update({
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
app.get('/', (req, res) => {
  res.send('Backend is running. Use /api/get-clients or /api/get-payments');
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});