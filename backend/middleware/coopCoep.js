/**
 * Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy middleware
 * Required for Google Sign-In to work properly with third-party cookies
 */
function coopCoepMiddleware(req, res, next) {
  // Set permissive COOP/COEP headers for Google Sign-In compatibility
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  
  // Additional headers for better compatibility
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  
  next();
}

module.exports = coopCoepMiddleware;