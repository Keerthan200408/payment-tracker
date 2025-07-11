# Payment Tracker Backend - Optimized Version

This is the optimized version of the Payment Tracker backend with improved architecture, better error handling, and modular structure while maintaining all existing functionality.

## 🏗️ Project Structure

```
backend/
├── config/
│   └── index.js              # Centralized configuration
├── db/
│   └── mongo.js              # Database connection and operations
├── middleware/
│   ├── auth.js               # Authentication middleware
│   └── errorHandler.js       # Error handling middleware
├── routes/
│   ├── auth.js               # Authentication routes
│   └── clients.js            # Client management routes
├── utils/
│   ├── sanitize.js           # Input sanitization utilities
│   ├── retryWithBackoff.js   # Retry logic for external APIs
│   └── email.js              # Email functionality
├── server-optimized.js       # Main optimized server file
├── server.js                 # Original server file (backup)
└── README.md                 # This file
```

## 🚀 Key Improvements

### 1. **Modular Architecture**
- **Separation of Concerns**: Each feature has its own module
- **Reusable Components**: Shared utilities and middleware
- **Better Maintainability**: Easier to find and modify specific functionality

### 2. **Enhanced Error Handling**
- **Custom Error Classes**: Specific error types for different scenarios
- **Centralized Error Processing**: Consistent error responses
- **Better Logging**: Detailed error information for debugging

### 3. **Improved Security**
- **Input Sanitization**: All user inputs are properly sanitized
- **Validation**: Comprehensive input validation
- **Rate Limiting**: Protection against abuse

### 4. **Better Performance**
- **Database Connection Pooling**: Efficient MongoDB connections
- **Retry Logic**: Automatic retry for external API calls
- **Caching**: Optimized data fetching

### 5. **Code Quality**
- **Async/Await**: Modern JavaScript patterns
- **Type Safety**: Better error handling and validation
- **Documentation**: Comprehensive JSDoc comments

## 📋 Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
# Server Configuration
PORT=5173
NODE_ENV=development

# Database
MONGODB_URI=your_mongodb_connection_string

# JWT
SECRET_KEY=your_jwt_secret_key

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id

# Email Configuration
EMAIL_HOST=your_smtp_host
EMAIL_PORT=587
EMAIL_USER=your_email_username
EMAIL_PASS=your_email_password
EMAIL_FROM=your_sender_email

# WhatsApp Configuration
ULTRAMSG_TOKEN=your_ultramsg_token
ULTRAMSG_INSTANCE_ID=your_ultramsg_instance_id
```

## 🔧 Installation & Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Copy the environment variables above to `.env`
   - Update with your actual values

3. **Start the Server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 📚 API Documentation

### Authentication Endpoints

#### POST `/api/google-signin`
Google OAuth sign-in endpoint.

**Request Body:**
```json
{
  "googleToken": "google_id_token"
}
```

**Response:**
```json
{
  "username": "user123",
  "sessionToken": "jwt_token"
}
```

#### POST `/api/google-signup`
Google OAuth sign-up endpoint.

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "user123"
}
```

#### POST `/api/signup`
Regular user registration.

**Request Body:**
```json
{
  "username": "user123",
  "password": "password123"
}
```

#### POST `/api/login`
User login.

**Request Body:**
```json
{
  "username": "user123",
  "password": "password123"
}
```

### Client Management Endpoints

#### GET `/api/get-clients`
Get all clients for the authenticated user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

#### POST `/api/add-client`
Add a new client.

**Request Body:**
```json
{
  "clientName": "Client Name",
  "email": "client@example.com",
  "type": "GST",
  "monthlyPayment": 1000,
  "phoneNumber": "+1234567890"
}
```

#### PUT `/api/update-client`
Update an existing client.

**Request Body:**
```json
{
  "oldClient": {
    "Client_Name": "Old Name",
    "Type": "GST"
  },
  "newClient": {
    "Client_Name": "New Name",
    "Type": "GST",
    "Amount_To_Be_Paid": 1500,
    "Email": "new@example.com",
    "Phone_Number": "+1234567890"
  }
}
```

#### POST `/api/delete-client`
Delete a client.

**Request Body:**
```json
{
  "Client_Name": "Client Name",
  "Type": "GST"
}
```

### Payment Management Endpoints

#### GET `/api/get-payments-by-year?year=2025`
Get payments for a specific year.

#### POST `/api/save-payment?year=2025`
Save a single payment.

**Request Body:**
```json
{
  "clientName": "Client Name",
  "type": "GST",
  "month": "january",
  "value": 1000
}
```

#### POST `/api/batch-save-payments?year=2025`
Save multiple payments in batch.

**Request Body:**
```json
{
  "clientName": "Client Name",
  "type": "GST",
  "updates": [
    { "month": "january", "value": 1000 },
    { "month": "february", "value": 1200 }
  ]
}
```

### Communication Endpoints

#### POST `/api/send-email`
Send email to clients.

**Request Body:**
```json
{
  "to": "client@example.com",
  "subject": "Payment Reminder",
  "html": "<h1>Payment Due</h1>"
}
```

#### POST `/api/send-whatsapp`
Send WhatsApp message.

**Request Body:**
```json
{
  "to": "+1234567890",
  "message": "Payment reminder"
}
```

## 🔒 Security Features

### Input Sanitization
- All user inputs are sanitized to prevent XSS attacks
- HTML content is cleaned before sending emails
- Special characters are properly handled

### Authentication
- JWT-based authentication
- HTTP-only cookies for session management
- Token refresh mechanism

### Rate Limiting
- Global rate limiting: 500 requests per 15 minutes
- Payment endpoints: 100 requests per minute
- WhatsApp endpoints: 100 requests per 15 minutes

### Validation
- Comprehensive input validation
- Email format validation
- Phone number format validation
- Payment amount validation

## 🛠️ Error Handling

The application uses custom error classes for different scenarios:

- `ValidationError`: Input validation errors (400)
- `AuthError`: Authentication errors (401)
- `AuthorizationError`: Authorization errors (403)
- `NotFoundError`: Resource not found (404)
- `RateLimitError`: Rate limiting errors (429)
- `AppError`: General application errors (500)

## 📊 Database Schema

### Users Collection
```javascript
{
  Username: "string",
  Password: "string (hashed)",
  GoogleEmail: "string (optional)"
}
```

### Types Collection
```javascript
{
  Type: "string",
  User: "string"
}
```

### Clients Collection (per user)
```javascript
{
  Client_Name: "string",
  Email: "string",
  Type: "string",
  Monthly_Payment: "number",
  Phone_Number: "string",
  createdAt: "date"
}
```

### Payments Collection (per user)
```javascript
{
  Client_Name: "string",
  Type: "string",
  Amount_To_Be_Paid: "number",
  Year: "number",
  Payments: {
    January: "string",
    February: "string",
    // ... all months
  },
  Due_Payment: "number",
  createdAt: "date"
}
```

## 🚀 Performance Optimizations

### Database
- Connection pooling for MongoDB
- Efficient queries with proper indexing
- Batch operations for bulk data

### External APIs
- Retry logic with exponential backoff
- Timeout handling
- Rate limit management

### Caching
- Response caching for frequently accessed data
- Database query optimization

## 🔧 Development

### Running in Development Mode
```bash
npm run dev
```

### Running Tests
```bash
npm test
```

### Code Linting
```bash
npm run lint
```

## 📝 Migration from Original

The optimized version maintains full backward compatibility with the original API. To migrate:

1. Replace `server.js` with `server-optimized.js`
2. Update environment variables if needed
3. Test all existing functionality
4. Deploy with confidence

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Check the API documentation above
- Review error logs for debugging
- Contact the development team

---

**Note**: This optimized version maintains all existing functionality while providing better structure, security, and maintainability. All API endpoints remain the same, ensuring seamless integration with existing frontend applications. 