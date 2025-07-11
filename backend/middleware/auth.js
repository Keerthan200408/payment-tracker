const jwt = require("jsonwebtoken");
const config = require("../config");
const logger = require("../utils/logger");

/**
 * Extract JWT token from request headers or cookies
 * @param {Object} req - Express request object
 * @returns {string|null} - JWT token or null if not found
 */
function getToken(req) {
  // Check cookies first
  let token = req.cookies?.sessionToken;
  
  // Check Authorization header if no cookie
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }
  
  return token;
}

/**
 * Verify JWT token and attach user to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function authenticateToken(req, res, next) {
  const token = getToken(req);
  
  if (!token) {
    logger.auth("No session token provided");
    return res.status(config.statusCodes.UNAUTHORIZED).json({ error: "Access denied: No token provided" });
  }
  
  try {
    const user = jwt.verify(token, config.SECRET_KEY);
    req.user = user;
    next();
  } catch (err) {
    logger.auth("Invalid token", err.message);
    res.status(config.statusCodes.FORBIDDEN).json({ error: "Invalid token" });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function optionalAuth(req, res, next) {
  const token = getToken(req);
  
  if (token) {
    try {
      const user = jwt.verify(token, config.SECRET_KEY);
      req.user = user;
    } catch (err) {
      // Token is invalid, but we don't fail the request
      logger.auth("Optional auth: Invalid token", err.message);
    }
  }
  
  next();
}

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @returns {string} - JWT token
 */
function generateToken(user) {
  return jwt.sign(
    { username: user.username || user.Username },
    config.SECRET_KEY,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

/**
 * Set JWT token as HTTP-only cookie
 * @param {Object} res - Express response object
 * @param {string} token - JWT token
 */
function setTokenCookie(res, token) {
  res.cookie("sessionToken", token, {
    httpOnly: true,
    secure: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: "None",
    path: "/",
  });
}

/**
 * Clear JWT token cookie
 * @param {Object} res - Express response object
 */
function clearTokenCookie(res) {
  res.clearCookie("sessionToken", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
  });
}

/**
 * Refresh JWT token if it's expired but valid
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function refreshToken(req, res, next) {
  const token = getToken(req);
  
  if (!token) {
    return res.status(config.statusCodes.UNAUTHORIZED).json({ error: "No token provided" });
  }
  
  try {
    // Try to verify the token
    const decoded = jwt.verify(token, config.SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    // If token is expired, try to decode it and refresh
    if (err.name === 'TokenExpiredError') {
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.username) {
          const newToken = generateToken({ username: decoded.username });
          setTokenCookie(res, newToken);
          req.user = decoded;
          return next();
        }
      } catch (decodeError) {
        logger.auth("Failed to decode expired token", decodeError.message);
      }
    }
    
    logger.auth("Invalid token during refresh", err.message);
    res.status(config.statusCodes.FORBIDDEN).json({ error: "Invalid token" });
  }
}

module.exports = {
  authenticateToken,
  optionalAuth,
  generateToken,
  setTokenCookie,
  clearTokenCookie,
  refreshToken,
  getToken,
};
