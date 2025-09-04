import React from 'react';

const LoadingSkeleton = ({ type = 'table', rows = 5, columns = 12 }) => {
  const renderTableSkeleton = () => (
    <div className="animate-pulse">
      <div className="bg-gray-200 h-8 rounded-t-lg mb-2"></div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex space-x-2 mb-2">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={colIndex}
              className={`h-6 bg-gray-200 rounded ${
                colIndex === 0 ? 'w-32' : 
                colIndex === 1 ? 'w-24' : 
                colIndex === 2 ? 'w-20' : 'w-16'
              }`}
            ></div>
          ))}
        </div>
      ))}
    </div>
  );

  const renderCardSkeleton = () => (
    <div className="animate-pulse">
      <div className="bg-gray-200 h-4 rounded w-3/4 mb-2"></div>
      <div className="bg-gray-200 h-4 rounded w-1/2 mb-2"></div>
      <div className="bg-gray-200 h-4 rounded w-2/3"></div>
    </div>
  );

  const renderSpinner = () => (
    <div className="flex justify-center items-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span className="ml-3 text-gray-600">Loading...</span>
    </div>
  );

  switch (type) {
    case 'table':
      return renderTableSkeleton();
    case 'card':
      return renderCardSkeleton();
    case 'spinner':
      return renderSpinner();
    default:
      return renderSpinner();
  }
};

export default LoadingSkeleton; 