const config = require("../config");

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} retries - Number of retry attempts
 * @param {number} delay - Initial delay in milliseconds
 * @returns {Promise} - Promise that resolves with function result
 */
async function retryWithBackoff(fn, retries = config.API.RETRY_ATTEMPTS, delay = config.API.RETRY_DELAY) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
        throw error;
      }
      
      // Don't retry on server errors (5xx) if it's the last attempt
      if (i === retries - 1) {
        throw error;
      }
      
      // Log retry attempt
      console.log(`Retry ${i + 1}/${retries} failed: ${error.message}`);
      
      // Wait before next attempt with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

/**
 * Retry function with custom error handling
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} - Promise that resolves with function result
 */
async function retryWithCustomBackoff(fn, options = {}) {
  const {
    retries = config.API.RETRY_ATTEMPTS,
    delay = config.API.RETRY_DELAY,
    maxDelay = 10000,
    shouldRetry = (error) => {
      // Retry on network errors, timeouts, and rate limits
      return !error.response || 
             error.response.status === 429 || 
             error.code === 'ECONNRESET' ||
             error.code === 'ETIMEDOUT';
    }
  } = options;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!shouldRetry(error) || i === retries - 1) {
        throw error;
      }
      
      console.log(`Retry ${i + 1}/${retries} failed: ${error.message}`);
      
      // Calculate delay with exponential backoff and max limit
      const currentDelay = Math.min(delay * Math.pow(2, i), maxDelay);
      await new Promise(resolve => setTimeout(resolve, currentDelay));
    }
  }
}

/**
 * Retry function specifically for UltraMsg API
 * @param {Function} fn - Function to retry
 * @returns {Promise} - Promise that resolves with function result
 */
async function retryUltraMsg(fn) {
  return retryWithCustomBackoff(fn, {
    retries: 3,
    delay: 1000,
    maxDelay: 5000,
    shouldRetry: (error) => {
      // Retry on rate limits and network issues
      return error.response?.status === 429 || 
             error.code === 'ECONNRESET' ||
             error.code === 'ETIMEDOUT' ||
             !error.response;
    }
  });
}

module.exports = {
  retryWithBackoff,
  retryWithCustomBackoff,
  retryUltraMsg,
};
