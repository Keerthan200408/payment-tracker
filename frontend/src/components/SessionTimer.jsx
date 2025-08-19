import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

const SESSION_DURATION = 8 * 60 * 60; // 8 hours in seconds

const SessionTimer = () => {
  const { sessionToken, currentUser, logout } = useAuth();
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (!sessionToken || !currentUser) {
      setTimeLeft(SESSION_DURATION);
      setShowWarning(false);
      return;
    }

    setTimeLeft(SESSION_DURATION); // Reset timer on login

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          logout();
          window.location.href = "/"; // Redirect to login
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionToken, currentUser, logout]);

  useEffect(() => {
    setShowWarning(timeLeft <= 30 * 60); // Show warning at 30 min
  }, [timeLeft]);

  if (!sessionToken || !currentUser) return null;

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const formatTime = (value) => value.toString().padStart(2, '0');

  
};

export default SessionTimer;