import React, { useState, useCallback } from 'react';
import Toast from './Toast';

const ToastManager = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((messageOrOptions, type = 'info', duration = 4000, position = 'top-right') => {
    const id = Date.now() + Math.random();
    
    // Handle both object-style and parameter-style calls
    let toastConfig;
    if (typeof messageOrOptions === 'object' && messageOrOptions !== null) {
      // Object-style call: { message, type, duration, position }
      toastConfig = {
        message: messageOrOptions.message,
        type: messageOrOptions.type || 'info',
        duration: messageOrOptions.duration || 4000,
        position: messageOrOptions.position || 'top-right'
      };
    } else {
      // Parameter-style call: (message, type, duration, position)
      toastConfig = {
        message: messageOrOptions,
        type: type,
        duration: duration,
        position: position
      };
    }
    
    setToasts(prev => [...prev, { id, ...toastConfig }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Provide toast function to children via context or props
  const toastContext = {
    showToast: addToast,
    showSuccess: (message, duration) => addToast(message, 'success', duration || 4000),
    showError: (message, duration) => addToast(message, 'error', duration || 4000),
    showWarning: (message, duration) => addToast(message, 'warning', duration || 4000),
    showInfo: (message, duration) => addToast(message, 'info', duration || 4000)
  };

  return (
    <>
      {children(toastContext)}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((toast, index) => (
          <div 
            key={toast.id} 
            className="pointer-events-auto"
            style={{ transform: `translateY(${index * 70}px)` }}
          >
            <Toast
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              position={toast.position}
              onClose={() => removeToast(toast.id)}
            />
          </div>
        ))}
      </div>
    </>
  );
};

export default ToastManager; 