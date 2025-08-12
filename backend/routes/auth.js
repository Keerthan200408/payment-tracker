const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const router = express.Router();

const config = require("../config");
const database = require("../db/mongo");
const { 
  authenticateToken, 
  generateToken, 
  setTokenCookie, 
  clearTokenCookie,
  refreshToken 
} = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { 
  sanitizeUsername, 
  sanitizeEmail 
} = require("../utils/sanitize");
const { ValidationError, AuthError } = require("../middleware/errorHandler");

const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

// Google Sign-In
router.post("/google-signin", asyncHandler(async (req, res) => {
  console.log("Received /api/google-signin request");
  const { googleToken } = req.body;
  
  if (!googleToken) {
    throw new ValidationError("Google token is required");
  }
  
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;

    const db = await database.getDb();
    const users = database.getUsersCollection();
    const user = await users.findOne({ 
      $or: [{ GoogleEmail: email }, { Username: email }] 
    });
    
    if (user) {
      const username = user.Username;
      const sessionToken = generateToken({ username });
      setTokenCookie(res, sessionToken);
      return res.json({ username, sessionToken });
    } else {
      return res.json({ needsUsername: true });
    }
  } catch (error) {
    console.error("Google sign-in error:", error.message);
    throw new AuthError("Invalid Google token");
  }
}));

// Google Signup
router.post("/google-signup", asyncHandler(async (req, res) => {
  console.log("Received /api/google-signup request");
  let { email, username } = req.body;
  
  if (!email || !username) {
    throw new ValidationError("Email and username are required");
  }
  
  const sanitizedUsername = sanitizeUsername(username);
  const sanitizedEmail = sanitizeEmail(email);
  
  if (!sanitizedUsername) {
    throw new ValidationError("Username must be between 3 and 50 characters");
  }
  
  try {
    const db = await database.getDb();
    const users = database.getUsersCollection();
    const existingUser = await users.findOne({ 
      $or: [{ Username: sanitizedUsername }, { GoogleEmail: sanitizedEmail }] 
    });
    
    if (existingUser) {
      const errorMessage = existingUser.Username === sanitizedUsername 
        ? "Username already exists" 
        : "Google account already linked";
      throw new ValidationError(errorMessage);
    }
    
    await users.insertOne({ 
      Username: sanitizedUsername, 
      Password: null, 
      GoogleEmail: sanitizedEmail 
    });
    
    const sessionToken = generateToken({ username: sanitizedUsername });
    setTokenCookie(res, sessionToken);
    res.json({ username: sanitizedUsername, sessionToken });
  } catch (error) {
    console.error("Google signup error:", error.message);
    throw error;
  }
}));

// Signup
router.post("/signup", asyncHandler(async (req, res) => {
  let { username, password } = req.body;
  
  if (!username || !password) {
    throw new ValidationError("All fields are required");
  }
  
  const sanitizedUsername = sanitizeUsername(username);
  
  if (!sanitizedUsername) {
    throw new ValidationError("Username must be between 3 and 50 characters");
  }
  
  if (password.length < config.VALIDATION.PASSWORD_MIN_LENGTH) {
    throw new ValidationError("Password must be at least 6 characters");
  }
  
  try {
    const db = await database.getDb();
    const users = database.getUsersCollection();
    const existingUser = await users.findOne({ Username: sanitizedUsername });
    
    if (existingUser) {
      throw new ValidationError("Username already exists");
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    await users.insertOne({ 
      Username: sanitizedUsername, 
      Password: hashedPassword, 
      GoogleEmail: null 
    });
    
    res.status(201).json({ message: "Account created successfully" });
  } catch (error) {
    console.error("Signup error:", error.message);
    throw error;
  }
}));

// Login
router.post("/login", asyncHandler(async (req, res) => {
  let { username, password } = req.body;
  
  if (!username || !password) {
    throw new ValidationError("Username and password are required");
  }
  
  const sanitizedUsername = sanitizeUsername(username);
  
  try {
    const db = await database.getDb();
    const users = database.getUsersCollection();
    const user = await users.findOne({ Username: sanitizedUsername });
    
    if (!user || !user.Password || !(await bcrypt.compare(password, user.Password))) {
      throw new AuthError("Invalid credentials");
    }
    
    const sessionToken = generateToken({ username: sanitizedUsername });
    setTokenCookie(res, sessionToken);
    res.json({ username: sanitizedUsername, sessionToken });
  } catch (error) {
    console.error("Login error:", error.message);
    throw error;
  }
}));

// Logout
router.post("/logout", (req, res) => {
  clearTokenCookie(res);
  res.json({ message: "Logged out successfully" });
});

// Refresh Token
router.post("/refresh-token", asyncHandler(async (req, res) => {
  const token = req.cookies?.sessionToken || 
                (req.headers.authorization?.startsWith("Bearer ") 
                  ? req.headers.authorization.substring(7) 
                  : null);
  
  if (!token) {
    throw new AuthError("No token provided");
  }
  
  try {
    let decoded;
    try {
      decoded = jwt.verify(token, config.SECRET_KEY);
    } catch (err) {
      decoded = jwt.decode(token);
      if (!decoded || !decoded.username) {
        throw new AuthError("Invalid token");
      }
    }
    
    const db = await database.getDb();
    const users = database.getUsersCollection();
    const user = await users.findOne({ Username: decoded.username });
    
    if (!user) {
      throw new AuthError("User not found");
    }
    
    const newToken = generateToken({ username: decoded.username });
    setTokenCookie(res, newToken);
    res.json({ username: decoded.username, sessionToken: newToken });
  } catch (error) {
    console.error("Refresh token error:", error.message);
    throw error;
  }
}));

module.exports = router;
