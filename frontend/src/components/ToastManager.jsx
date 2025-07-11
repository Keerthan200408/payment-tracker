import React, { useState, useCallback } from 'react';
import Toast from './Toast';

const ToastManager = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ message, type = 'info', duration = 4000, position = 'top-right' }) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, duration, position }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Provide toast function to children via context or props
  const toastContext = {
    showToast: addToast,
    showSuccess: (message, duration) => addToast({ message, type: 'success', duration }),
    showError: (message, duration) => addToast({ message, type: 'error', duration }),
    showWarning: (message, duration) => addToast({ message, type: 'warning', duration }),
    showInfo: (message, duration) => addToast({ message, type: 'info', duration })
  };

  return (
    <>
      {children(toastContext)}
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          position={toast.position}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </>
  );
};

export default ToastManager; 