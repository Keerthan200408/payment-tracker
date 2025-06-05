const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const csv = require('csv-parse');
const { Readable } = require('stream');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors({
  origin: 'https://reliable-eclair-abf03c.netlify.app',
}));
app.use(express.json());

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

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

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

// Signup
app.post('/api/signup', async (req, res) => {
  const { username, password, gmailId } = req.body;
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
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const users = await readSheet('Users', 'A2:C');
    const user = users.find(u => u[0] === username);
    if (!user || !(await bcrypt.compare(password, user[1]))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ username }, 'your-secret-key', { expiresIn: '1h' });
    res.json({ username, sessionToken: token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

// Import CSV (Flexible Mapping)
app.post('/api/import-csv', authenticateToken, async (req, res) => {
  try {
    const csvData = req.body;
    const buffer = Buffer.from(JSON.stringify(csvData));
    const readable = Readable.from(buffer);

    const parser = readable.pipe(csv.parse({ columns: true, trim: true }));
    const records = [];

    for await (const record of parser) {
      records.push(record);
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    for (const record of records) {
      const clientName = record['Client Name'] || record['Client_Name'] || record['client_name'] || Object.values(record)[0] || 'Unknown Client';
      const type = record['Type'] || record['type'] || Object.values(record)[1] || 'Unknown Type';
      const amountToBePaid = parseFloat(record['Amount To Be Paid'] || record['Amount_To_Be_Paid'] || Object.values(record)[2] || 0);

      if (isNaN(amountToBePaid) || amountToBePaid <= 0) continue;

      let clients = await readSheet('Clients', 'A2:E');
      const clientExists = clients.some(client => client[0] === req.user.username && client[1] === clientName && client[3] === type);
      if (!clientExists) {
        await appendSheet('Clients', [[req.user.username, clientName, '', type, amountToBePaid]]);
      }

      let payments = await readSheet('Payments', 'A2:R');
      const paymentExists = payments.some(payment => payment[0] === req.user.username && payment[1] === clientName && payment[2] === type);
      if (!paymentExists) {
        await appendSheet('Payments', [[req.user.username, clientName, type, amountToBePaid, '', '', '', '', '', '', '', '', '', '', '', '', '0']]);
      }
    }

    res.status(200).json({ message: 'CSV data imported successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));