const config = require("../config");

const logger = {
  info: (message, metadata = {}) => {
    console.log(`[INFO] ${new Date().toISOString()}: ${message}`, metadata);
  },
  
  error: (message, error = null, metadata = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, {
      ...metadata,
      error: error?.message || error,
      stack: error?.stack,
    });
  },
  
  warn: (message, metadata = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, metadata);
  },
  
  debug: (message, metadata = {}) => {
    if (config.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${new Date().toISOString()}: ${message}`, metadata);
    }
  },
  
  // Specific loggers for different operations
  auth: (message, username = 'unknown', metadata = {}) => {
    logger.info(`[AUTH] ${message}`, { username, ...metadata });
  },
  
  payment: (message, username = 'unknown', metadata = {}) => {
    logger.info(`[PAYMENT] ${message}`, { username, ...metadata });
  },
  
  client: (message, username = 'unknown', metadata = {}) => {
    logger.info(`[CLIENT] ${message}`, { username, ...metadata });
  },
  
  email: (message, metadata = {}) => {
    logger.info(`[EMAIL] ${message}`, metadata);
  },
  
  whatsapp: (message, metadata = {}) => {
    logger.info(`[WHATSAPP] ${message}`, metadata);
  },
  
  db: (message, metadata = {}) => {
    logger.info(`[DB] ${message}`, metadata);
  },
};

module.exports = logger; 