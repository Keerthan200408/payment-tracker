require("dotenv").config();

const statusCodes = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const config = {
  PORT: process.env.PORT || 5173,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI,
  SECRET_KEY: process.env.SECRET_KEY,
  JWT_EXPIRES_IN: "24h",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT),
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_SECURE: process.env.EMAIL_PORT === "465",
  ULTRAMSG_TOKEN: process.env.ULTRAMSG_TOKEN,
  ULTRAMSG_INSTANCE_ID: process.env.ULTRAMSG_INSTANCE_ID,
  CORS_ORIGINS: [
    "https://reliable-eclair-abf03c.netlify.app",
    "http://localhost:5173",
  ],
  RATE_LIMITS: {
    GLOBAL: { windowMs: 15 * 60 * 1000, max: 500 },
    PAYMENT: { windowMs: 60 * 1000, max: 100 },
    WHATSAPP: { windowMs: 15 * 60 * 1000, max: 100 },
  },
  VALIDATION: {
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 50,
    PASSWORD_MIN_LENGTH: 6,
    CLIENT_NAME_MAX_LENGTH: 100,
    TYPE_MAX_LENGTH: 50,
    MAX_PAYMENT_AMOUNT: 1e6,
    PHONE_REGEX: /^(\+91|91)?[6-9]\d{9}$/,
    EMAIL_REGEX: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
  },
  SANITIZE_OPTIONS: {
    allowedTags: [
      "div", "h1", "h2", "p", "table", "thead", "tbody", "tr", "th", "td",
      "strong", "em", "ul", "ol", "li", "a", "span", "br"
    ],
    allowedAttributes: { "*": ["style", "class", "href", "target"] },
    allowedStyles: {
      "*": {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
        "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
        "font-size": [/^\d+(?:px|em|rem|%)$/],
        "font-family": [/^[\w\s,'"-]+$/],
        "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
        padding: [/^\d+(?:px|em|rem)$/],
        margin: [/^\d+(?:px|em|rem)$/],
        border: [/^\d+px\s+(solid|dashed|dotted)\s+#(0x)?[0-9a-f]+$/i],
      },
    },
  },
  API: {
    BASE_URL: "https://payment-tracker-aswa.onrender.com/api",
    ULTRA_MSG_BASE_URL: "https://api.ultramsg.com",
    TIMEOUT: 10000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 500,
  },
  months,
  statusCodes,
};

module.exports = config;
