const config = require("../config");

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error class
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Authentication error class
 */
class AuthError extends AppError {
  constructor(message) {
    super(message, 401, 'AUTH_ERROR');
  }
}

/**
 * Authorization error class
 */
class AuthorizationError extends AppError {
  constructor(message) {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error class
 */
class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Rate limit error class
 */
class RateLimitError extends AppError {
  constructor(message) {
    super(message, 429, 'RATE_LIMIT');
  }
}

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  console.error("Error occurred:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    user: req.user?.username || 'anonymous',
    timestamp: new Date().toISOString(),
  });

  // Handle specific error types
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new NotFoundError(message);
  }

  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = new ValidationError(message);
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ValidationError(message);
  }

  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new AuthError(message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new AuthError(message);
  }

  // Handle rate limiting errors
  if (err.status === 429) {
    error = new RateLimitError('Too many requests. Please try again later.');
  }

  // Handle database connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    error = new AppError('Database connection failed', 503, 'DB_CONNECTION_ERROR');
  }

  // Handle timeout errors
  if (err.code === 'ETIMEDOUT') {
    error = new AppError('Request timeout', 408, 'TIMEOUT');
  }

  // Default error response
  const response = {
    error: error.message || 'Internal server error',
    ...(error.code && { code: error.code }),
    ...(config.NODE_ENV === 'development' && { stack: err.stack }),
  };

  // Add details for validation errors
  if (error.details) {
    response.details = error.details;
  }

  res.status(error.statusCode || 500).json(response);
}

/**
 * Async error wrapper to catch async errors
 * @param {Function} fn - Async function to wrap
 * @returns {Function} - Wrapped function with error handling
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found handler for undefined routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route ${req.originalUrl} not found`,
    code: 'NOT_FOUND',
  });
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
};
