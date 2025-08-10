import { useState, useEffect } from 'react';

const SessionTimer = ({ sessionToken, currentUser, resetLogoutTimer }) => {
  const [timeLeft, setTimeLeft] = useState(4 * 60 * 60); // 4 hours in seconds
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (!sessionToken || !currentUser) {
      setTimeLeft(4 * 60 * 60);
      setShowWarning(false);
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionToken, currentUser]);

  useEffect(() => {
    // Show warning when less than 30 minutes left
    setShowWarning(timeLeft <= 30 * 60);
  }, [timeLeft]);

  useEffect(() => {
    // Reset timer when resetLogoutTimer is called
    if (sessionToken && currentUser) {
      setTimeLeft(4 * 60 * 60);
    }
  }, [sessionToken, currentUser, resetLogoutTimer]);

  if (!sessionToken || !currentUser) return null;

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const formatTime = (value) => value.toString().padStart(2, '0');

  return (
    <div className={`fixed top-4 right-4 z-50 p-3 rounded-lg shadow-lg transition-all duration-300 ${
      showWarning 
        ? 'bg-red-100 border border-red-300 text-red-800' 
        : 'bg-blue-100 border border-blue-300 text-blue-800'
    }`}>
      <div className="flex items-center space-x-2">
        <i className={`fas ${showWarning ? 'fa-exclamation-triangle' : 'fa-clock'} text-sm`}></i>
        <div className="text-sm font-medium">
          Session expires in: {formatTime(hours)}:{formatTime(minutes)}:{formatTime(seconds)}
        </div>
      </div>
      {showWarning && (
        <div className="text-xs mt-1 text-red-600">
          Please save your work - you'll be logged out soon!
        </div>
      )}
    </div>
  );
};

export default SessionTimer;
