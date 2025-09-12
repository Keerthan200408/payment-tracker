# 💰 Payment Tracker

A comprehensive full-stack web application for managing client payments, tracking transaction history, and automating payment notifications. Built with modern technologies to streamline financial management for small to medium-sized businesses.

## 🌟 Features

### 📊 Dashboard & Analytics
- **Interactive Dashboard**: Real-time overview of payment statuses, pending amounts, and client metrics
- **Advanced Filtering**: Multi-parameter search and filter functionality for efficient data navigation
- **Visual Analytics**: Charts and graphs for payment trends and client insights
- **Performance Monitoring**: Built-in performance tracking for optimal user experience

### 👥 Client Management
- **Client Profiles**: Comprehensive client information management with contact details
- **Bulk Operations**: Import/export client data via CSV with validation
- **Search & Sort**: Advanced search capabilities with multiple sorting options
- **Client History**: Track complete payment history per client

### 💳 Payment Processing
- **Payment Tracking**: Record and monitor payments with detailed transaction logs
- **Multiple Payment Types**: Support for various payment categories and types
- **Payment Calculations**: Automated calculations with validation
- **Batch Processing**: Handle multiple payments efficiently with batch operations

### 🔔 Smart Notifications
- **Automated Reminders**: Customizable payment reminder templates
- **Multi-channel Delivery**: Email and WhatsApp integration for notifications
- **Queue Management**: Organized notification queue with status tracking
- **Template Customization**: Personalized message templates with dynamic data

### 🔐 Authentication & Security
- **Google OAuth Integration**: Secure sign-in with Google accounts
- **JWT Authentication**: Token-based authentication with session management
- **Rate Limiting**: Protection against abuse with configurable limits
- **Data Sanitization**: Input validation and XSS protection
- **CORS Configuration**: Secure cross-origin resource sharing

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern UI library with hooks and context API
- **Vite** - Fast build tool and development server
- **React Router Dom** - Client-side routing
- **Axios** - HTTP client for API communication
- **Tailwind CSS** - Utility-first CSS framework
- **Bootstrap** - Component styling and responsive design
- **PapaParse** - CSV parsing and processing
- **Lodash** - Utility library for data manipulation

### Backend
- **Node.js** - JavaScript runtime environment
- **Express.js** - Web application framework
- **MongoDB** - NoSQL database with Mongoose ODM
- **JWT** - JSON Web Tokens for authentication
- **Google Auth Library** - Google OAuth implementation
- **Nodemailer** - Email sending capabilities
- **bcryptjs** - Password hashing
- **Express Rate Limit** - API rate limiting
- **Sanitize HTML** - XSS protection
- **Cookie Parser** - Cookie handling middleware

### DevOps & Deployment
- **Netlify** - Frontend hosting and deployment
- **Render** - Backend hosting and deployment
- **MongoDB Atlas** - Cloud database service
- **Environment Variables** - Secure configuration management

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn package manager
- MongoDB database (local or Atlas)
- Google OAuth credentials

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/payment-tracker.git
   cd payment-tracker
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install frontend dependencies
   cd frontend
   npm install
   
   # Install backend dependencies
   cd ../backend
   npm install
   ```

3. **Environment Configuration**
   
   **Backend** - Create `backend/.env`:
   ```env
   # Database
   MONGODB_URI=your_mongodb_connection_string
   
   # Authentication
   JWT_SECRET=your_jwt_secret
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   
   # Email Service
   EMAIL_HOST=your_email_host
   EMAIL_PORT=587
   EMAIL_USER=your_email_username
   EMAIL_PASS=your_email_password
   
   # Server
   PORT=5000
   NODE_ENV=development
   ```
   
   **Frontend** - Create `frontend/.env.local`:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   VITE_API_BASE_URL=http://localhost:5000
   ```

4. **Start Development Servers**
   ```bash
   # Terminal 1: Backend
   cd backend
   npm run dev
   
   # Terminal 2: Frontend
   cd frontend
   npm run dev
   ```

5. **Build for Production**
   ```bash
   # Frontend build
   cd frontend
   npm run build
   
   # Backend is production-ready
   cd ../backend
   npm start
   ```

## 📁 Project Structure

```
payment-tracker/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── contexts/        # React context providers
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Main application pages
│   │   ├── utils/           # Utility functions
│   │   └── api/             # API integration layer
│   ├── public/              # Static assets
│   └── package.json
├── backend/                 # Node.js backend API
│   ├── config/              # Configuration files
│   ├── controllers/         # Route controllers
│   ├── middleware/          # Custom middleware
│   ├── routes/              # API routes
│   ├── utils/               # Utility functions
│   ├── db/                  # Database configuration
│   └── package.json
└── README.md
```

## 🔧 API Endpoints

### Authentication
- `POST /auth/google` - Google OAuth authentication
- `POST /auth/refresh` - Refresh JWT token
- `POST /auth/logout` - User logout

### Clients
- `GET /api/clients` - Get all clients
- `POST /api/clients` - Create new client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Payments
- `GET /api/payments` - Get all payments
- `POST /api/payments` - Record new payment
- `PUT /api/payments/:id` - Update payment
- `DELETE /api/payments/:id` - Delete payment

### Notifications
- `POST /api/notifications/send` - Send payment notifications
- `GET /api/notifications/queue` - Get notification queue
- `DELETE /api/notifications/queue` - Clear notification queue

## 🎨 Key Features Showcase

### Smart Dashboard
- Real-time payment status overview
- Interactive charts and analytics
- Quick action buttons for common tasks
- Responsive design for all devices

### Efficient Client Management
- Drag-and-drop CSV import
- Advanced search with multiple filters
- Bulk operations for productivity
- Contact information validation

### Automated Notifications
- Customizable message templates
- Multi-channel delivery (Email/WhatsApp)
- Queue management system
- Delivery status tracking

## 🔐 Security Features

- **Authentication**: Google OAuth 2.0 integration
- **Authorization**: JWT-based session management
- **Rate Limiting**: API abuse protection
- **Data Validation**: Input sanitization and validation
- **CORS**: Configured for secure cross-origin requests
- **Environment Variables**: Secure configuration management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Keerthan** - *Full Stack Developer*
- GitHub: [@Keerthan200408](https://github.com/Keerthan200408)
- Project Link: [Payment Tracker](https://github.com/Keerthan200408/payment-tracker)

## 🙏 Acknowledgments

- Google APIs for authentication services
- MongoDB for reliable database services
- React community for excellent documentation
- All contributors and supporters of this project

---

**Made with ❤️ for efficient payment management**