import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const SESSION_DURATION = 8 * 60 * 60; // 8 hours in seconds

const SessionTimer = () => {
  const { sessionToken, currentUser, logout } = useAuth();
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION);

  useEffect(() => {
    if (!sessionToken || !currentUser) {
      return;
    }

    setTimeLeft(SESSION_DURATION); // Reset timer on login

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          logout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionToken, currentUser, logout]);

  return null;
};

export default SessionTimer;