import { useState, useEffect, useCallback } from 'react';

export const useAuth = () => {
  const [sessionToken, setSessionToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const logout = useCallback(() => {
    console.log("Logging out user:", currentUser);
    
    // Clear all localStorage
    localStorage.removeItem("currentUser");
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("currentPage");
    localStorage.removeItem("availableYears");
    localStorage.removeItem("currentYear");
    
    // Reset state
    setCurrentUser(null);
    setSessionToken(null);
    setIsInitialized(false);
    
    // Invalidate token on backend (fire and forget)
    if (sessionToken) {
      fetch('https://payment-tracker-aswa.onrender.com/api/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      }).catch(error => {
        console.error("Logout API error:", error.message);
      });
    }
  }, [sessionToken, currentUser]);

  const initializeAuth = useCallback(() => {
    if (isInitialized) return;
    
    const storedUser = localStorage.getItem("currentUser");
    const storedToken = localStorage.getItem("sessionToken");
    
    console.log("useAuth: Stored sessionToken on load:", storedToken);
    
    if (storedUser && storedToken) {
      console.log("Restoring session for user:", storedUser);
      setCurrentUser(storedUser);
      setSessionToken(storedToken);
    }
    
    setIsInitialized(true);
  }, [isInitialized]);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return {
    sessionToken,
    setSessionToken,
    currentUser,
    setCurrentUser,
    isInitialized,
    logout,
  };
}; 