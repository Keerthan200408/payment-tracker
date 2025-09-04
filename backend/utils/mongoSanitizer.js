// utils/mongoSanitizer.js
const { ObjectId } = require('mongodb');

/**
 * Sanitizes MongoDB query objects to prevent NoSQL injection
 */
function sanitizeMongoQuery(query) {
  if (!query || typeof query !== 'object') {
    return {};
  }
  
  const sanitized = {};
  
  for (const [key, value] of Object.entries(query)) {
    // Prevent MongoDB operator injection by checking for $ prefix
    if (key.startsWith('$')) {
      continue; // Skip potentially dangerous operators
    }
    
    sanitized[key] = sanitizeMongoValue(value);
  }
  
  return sanitized;
}

/**
 * Sanitizes individual values for MongoDB queries
 */
function sanitizeMongoValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  
  // Handle arrays recursively
  if (Array.isArray(value)) {
    return value.map(sanitizeMongoValue);
  }
  
  // Handle objects recursively but prevent operator injection
  if (typeof value === 'object') {
    if (value instanceof Date || value instanceof ObjectId) {
      return value; // Allow legitimate MongoDB types
    }
    
    const sanitizedObj = {};
    for (const [k, v] of Object.entries(value)) {
      // Skip MongoDB operators in nested objects
      if (!k.startsWith('$')) {
        sanitizedObj[k] = sanitizeMongoValue(v);
      }
    }
    return sanitizedObj;
  }
  
  // For primitive types, ensure they're the expected type
  if (typeof value === 'string') {
    return value.toString(); // Ensure it's actually a string
  }
  
  if (typeof value === 'number') {
    return Number(value); // Ensure it's actually a number
  }
  
  if (typeof value === 'boolean') {
    return Boolean(value); // Ensure it's actually a boolean
  }
  
  return value;
}

/**
 * Creates safe MongoDB query objects with explicit type checking
 */
function createSafeQuery(clientName, type, year) {
  const query = {};
  
  if (clientName !== undefined && clientName !== null) {
    query.Client_Name = { $eq: String(clientName) };
  }
  
  if (type !== undefined && type !== null) {
    query.Type = { $eq: String(type) };
  }
  
  if (year !== undefined && year !== null) {
    const yearInt = parseInt(year);
    if (!isNaN(yearInt)) {
      query.Year = { $eq: yearInt };
    }
  }
  
  return query;
}

/**
 * Validates and sanitizes update objects for MongoDB
 */
function sanitizeUpdateObject(updateObj) {
  if (!updateObj || typeof updateObj !== 'object') {
    return {};
  }
  
  const sanitized = {};
  
  // Only allow safe update operators
  const allowedOperators = ['$set', '$unset', '$inc', '$push', '$pull'];
  
  for (const [key, value] of Object.entries(updateObj)) {
    if (key.startsWith('$')) {
      if (allowedOperators.includes(key)) {
        sanitized[key] = sanitizeMongoValue(value);
      }
    } else {
      // Direct field updates (convert to $set)
      if (!sanitized.$set) {
        sanitized.$set = {};
      }
      sanitized.$set[key] = sanitizeMongoValue(value);
    }
  }
  
  return sanitized;
}

module.exports = {
  sanitizeMongoQuery,
  sanitizeMongoValue,
  createSafeQuery,
  sanitizeUpdateObject
};