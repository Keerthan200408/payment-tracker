const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');
const { GoogleAuth, OAuth2Client } = require('google-auth-library');
const rateLimit = require('express-rate-limit'); // Added for rate limiting

const app = express();
app.use(cors());
app.use(express.json());

// Added rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Using on Render, Parse the GOOGLE_CREDENTIALS environment variable with error handling
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

// Added OAuth2Client for verifying Google ID tokens
const oAuth2Client = new OAuth2Client('848204323516-p15s9a090fqjtrfclco6rbocp9sov0t5.apps.googleusercontent.com'); // Replace with your actual client ID

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    console.log('Received Authorization header:', authHeader); // Debug log
    console.log('Received gmailid header:', req.headers.gmailid); // Debug log
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const ticket = await oAuth2Client.verifyIdToken({
            idToken: token,
            audience: '848204323516-p15s9a090fqjtrfclco6rbocp9sov0t5.apps.googleusercontent.com',
        });
        const payload = ticket.getPayload();
        req.userEmail = payload['email'];
        if (!req.userEmail) {
            throw new Error('No email found in token');
        }
        console.log('Verified user email:', req.userEmail); // Debug log
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        if (error.message.includes('Token used too late') || error.message.includes('jwt expired')) {
            return res.status(401).json({ error: 'Token has expired. Please sign in again.' });
        }
        return res.status(401).json({ error: 'Invalid token. Please sign in again.' });
    }
};

// Modified: Improved error handling in the verify-token endpoint
app.post('/api/verify-token', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({ error: 'ID token is required' });
        }
        const ticket = await oAuth2Client.verifyIdToken({
            idToken,
            audience: '848204323516-p15s9a090fqjtrfclco6rbocp9sov0t5.apps.googleusercontent.com',
        });
        const payload = ticket.getPayload();
        const email = payload['email'];
        if (!email) {
            return res.status(400).json({ error: 'No email found in token' });
        }
        res.json({ email });
    } catch (error) {
        console.error('Error verifying token:', error);
        // Modified: Provide a more specific error message for token expiration
        if (error.message.includes('Token used too late') || error.message.includes('jwt expired')) {
            return res.status(401).json({ error: 'Token has expired. Please sign in again.' });
        }
        return res.status(401).json({ error: 'Invalid token. Please sign in again.' });
    }
});

// Get clients from Clients worksheet (filtered by GmailID)
app.get('/api/get-clients', verifyToken, async (req, res) => {
    try {
        const sheets = await getSheetsClient();
        const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Clients!A2:E',
        });
        const rows = response.data.values || [];
        const clients = rows.map(row => ({
            GmailID: row[0] || '',
            Client_Name: row[1] || '',
            Email: row[2] || '',
            Type: row[3] || '',
            monthly_payment: row[4] || '',
        }));
        const gmailid = req.headers.gmailid || '';
        if (gmailid !== req.userEmail) {
            return res.status(403).json({ error: 'Unauthorized access' });
        }
        const userClients = clients.filter(client => client.GmailID === gmailid);
        res.json(userClients);
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

// Get payments from Payments worksheet (filtered by GmailID)
app.get('/api/get-payments', verifyToken, async (req, res) => {
    try {
        const sheets = await getSheetsClient();
        const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Payments!A2:Q',
        });
        const rows = response.data.values || [];
        const payments = rows.map(row => ({
            GmailID: row[0] || '',
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
        const gmailid = req.headers.gmailid || '';
        if (gmailid !== req.userEmail) {
            return res.status(403).json({ error: 'Unauthorized access' });
        }
        const userPayments = payments.filter(payment => payment.GmailID === gmailid);
        res.json(userPayments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// Save payments to Payments worksheet
app.post('/api/save-payments', verifyToken, async (req, res) => {
    try {
        const sheets = await getSheetsClient();
        const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
        const data = req.body;
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ error: 'Invalid payment data' });
        }

        const gmailid = req.headers.gmailid || data[0]?.GmailID || ''; // Fixed: Use gmailid consistently
        if (gmailid !== req.userEmail) {
            return res.status(403).json({ error: 'Unauthorized access' });
        }

        // Validate payment data
        for (const row of data) {
            if (!row.Client_Name || !row.Type || !row.Amount_To_Be_Paid) {
                return res.status(400).json({ error: 'Client Name, Type, and Amount To Be Paid are required' });
            }
            const amount = parseFloat(row.Amount_To_Be_Paid);
            if (isNaN(amount) || amount <= 0) {
                return res.status(400).json({ error: 'Amount To Be Paid must be a positive number' });
            }
        }

        const values = data.map(row => [
            row.GmailID || '',
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

        // Fetch existing data
        const existingDataResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Payments!A2:Q',
        });
        const existingData = existingDataResponse.data.values || [];
        const nonUserData = existingData.filter(row => row[0] !== gmailid);

        // Prepare all data to write (non-user data + new user data)
        const allData = [...nonUserData, ...values];

        // Clear and update in one step to minimize data loss risk
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: 'Payments!A2:Q',
        });

        if (allData.length > 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'Payments!A2',
                valueInputOption: 'RAW',
                requestBody: { values: allData },
            });
        }

        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error saving to sheets:', error);
        res.status(500).json({ error: `Failed to save to sheets: ${error.message}` });
    }
});

// Add a new client to Clients worksheet
app.post('/api/add-client', verifyToken, async (req, res) => {
    try {
        const sheets = await getSheetsClient();
        const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
        const newClient = req.body;

        // Validate client data
        if (!newClient.GmailID || !newClient.Client_Name || !newClient.Email || !newClient.Type || !newClient.monthly_payment) {
            return res.status(400).json({ error: 'All client fields are required' });
        }
        if (newClient.GmailID !== req.userEmail) {
            return res.status(403).json({ error: 'Unauthorized access' });
        }
        const monthlyPayment = parseFloat(newClient.monthly_payment);
        if (isNaN(monthlyPayment) || monthlyPayment <= 0) {
            return res.status(400).json({ error: 'Monthly payment must be a positive number' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newClient.Email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const values = [[
            newClient.GmailID,
            newClient.Client_Name,
            newClient.Email,
            newClient.Type,
            newClient.monthly_payment,
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
        res.status(500).json({ error: `Failed to add client: ${error.message}` });
    }
});

app.put('/api/update-client', verifyToken, async (req, res) => {
    try {
        const sheets = await getSheetsClient();
        const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
        const clientData = req.body;

        // Validate client data
        if (!clientData.GmailID || !clientData.Client_Name || !clientData.Email || !clientData.Type || !clientData.monthly_payment) {
            return res.status(400).json({ error: 'All client fields are required' });
        }
        if (clientData.GmailID !== req.userEmail) {
            return res.status(403).json({ error: 'Unauthorized access' });
        }
        const monthlyPayment = parseFloat(clientData.monthly_payment);
        if (isNaN(monthlyPayment) || monthlyPayment <= 0) {
            return res.status(400).json({ error: 'Monthly payment must be a positive number' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(clientData.Email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Clients!A2:E',
        });
        const rows = response.data.values || [];
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === clientData.GmailID && rows[i][1] === clientData.Old_Client_Name && rows[i][3] === clientData.Old_Type) {
                rowIndex = i + 2;
                break;
            }
        }

        if (rowIndex === -1) {
            throw new Error('Client not found');
        }

        const updatedRow = [
            clientData.GmailID,
            clientData.Client_Name,
            clientData.Email,
            clientData.Type,
            clientData.monthly_payment,
        ];

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Clients!A${rowIndex}:E${rowIndex}`,
            valueInputOption: 'RAW',
            requestBody: { values: [updatedRow] },
        });

        const paymentsResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Payments!A2:Q',
        });
        const paymentRows = paymentsResponse.data.values || [];
        const updatedPayments = paymentRows.map(row => {
            if (row[0] === clientData.GmailID && row[1] === clientData.Old_Client_Name && row[2] === clientData.Old_Type) {
                return [
                    row[0],
                    clientData.Client_Name,
                    clientData.Type,
                    clientData.monthly_payment,
                    ...row.slice(4),
                ];
            }
            return row;
        });

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
        console.error('Error updating client:', error);
        res.status(500).json({ error: `Failed to update client: ${error.message}` });
    }
});

app.delete('/api/delete-client', verifyToken, async (req, res) => {
    try {
        const sheets = await getSheetsClient();
        const spreadsheetId = '1SaIzjVREoK3wbwR24vxx4FWwR1Ekdu3YT9-ryCjm2x8';
        const { GmailID, Client_Name, Type } = req.body;

        if (!GmailID || !Client_Name || !Type) {
            return res.status(400).json({ error: 'GmailID, Client Name, and Type are required' });
        }
        if (GmailID !== req.userEmail) {
            return res.status(403).json({ error: 'Unauthorized access' });
        }

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Clients!A2:E',
        });
        const rows = response.data.values || [];
        const filteredRows = rows.filter(row => !(row[0] === GmailID && row[1] === Client_Name && row[3] === Type));

        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: 'Clients!A2:E',
        });

        if (filteredRows.length > 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'Clients!A2',
                valueInputOption: 'RAW',
                requestBody: { values: filteredRows },
            });
        }

        const paymentsResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Payments!A2:Q',
        });
        const paymentRows = paymentsResponse.data.values || [];
        const filteredPayments = paymentRows.filter(row => !(row[0] === GmailID && row[1] === Client_Name && row[2] === Type));

        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: 'Payments!A2:Q',
        });

        if (filteredPayments.length > 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'Payments!A2',
                valueInputOption: 'RAW',
                requestBody: { values: filteredPayments },
            });
        }

        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ error: `Failed to delete client: ${error.message}` });
    }
});

app.get('/', (req, res) => {
    res.send('Backend is running. Use /api/get-clients, /api/get-payments, /api/add-client, /api/update-client, or /api/delete-client');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});