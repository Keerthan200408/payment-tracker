/**
 * Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy middleware
 * Required for Google Sign-In to work properly with third-party cookies
 */
function coopCoepMiddleware(req, res, next) {
  // For Google Sign-In to work, we need to allow same-origin-allow-popups
  // This allows the popup to communicate back to the parent window
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  
  // Additional headers for better compatibility
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  next();
}

module.exports = coopCoepMiddleware;