import React, { useEffect, useState } from 'react';

const Toast = ({ 
  message, 
  type = 'info', 
  duration = 4000, 
  onClose, 
  position = 'top-right' 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(), 300); // Allow animation to complete
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getToastStyles = () => {
    const baseStyles = "relative p-4 rounded-lg shadow-lg transition-all duration-300 transform max-w-sm w-full";
    
    const typeStyles = {
      success: 'bg-green-500 text-white border-l-4 border-green-600',
      error: 'bg-red-500 text-white border-l-4 border-red-600',
      warning: 'bg-yellow-500 text-white border-l-4 border-yellow-600',
      info: 'bg-blue-500 text-white border-l-4 border-blue-600'
    };

    return `${baseStyles} ${typeStyles[type]} ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`;
  };

  const getIcon = () => {
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-exclamation-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle'
    };
    return icons[type];
  };

  return (
    <div className={getToastStyles()}>
      <div className="flex items-start gap-3">
        <i className={`${getIcon()} flex-shrink-0 mt-0.5`}></i>
        <span className="text-sm font-medium flex-1 break-words leading-relaxed">{message}</span>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => onClose(), 300);
          }}
          className="flex-shrink-0 text-white hover:text-gray-200 transition-colors p-1 -m-1"
          title="Close notification"
        >
          <i className="fas fa-times text-xs"></i>
        </button>
      </div>
    </div>
  );
};

export default Toast; 