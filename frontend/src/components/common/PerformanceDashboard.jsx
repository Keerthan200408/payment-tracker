import React, { useState, useEffect, useMemo } from 'react';
import apiService from '../../api';

const PerformanceDashboard = ({ isVisible = false, onClose }) => {
  const [stats, setStats] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isVisible) return;

    const updateStats = () => {
      const cacheStats = apiService.getStats();
      setStats(cacheStats);
    };

    updateStats();
    const interval = setInterval(updateStats, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [isVisible]);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatPercentage = (value, total) => {
    if (total === 0) return '0%';
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`bg-white rounded-lg shadow-lg border border-gray-200 transition-all duration-300 ${
        isExpanded ? 'w-80 h-96' : 'w-64 h-16'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-gray-700">Performance</span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-gray-100 rounded"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded"
              title="Close"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {isExpanded && stats && (
          <div className="p-4 space-y-4 overflow-y-auto h-80">
            {/* Cache Statistics */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Cache Statistics</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Total Entries:</span>
                  <span className="font-medium">{stats.totalSize}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Valid Entries:</span>
                  <span className="font-medium text-green-600">{stats.validEntries}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Expired Entries:</span>
                  <span className="font-medium text-red-600">{stats.expiredEntries}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Pending Requests:</span>
                  <span className="font-medium text-blue-600">{stats.pendingRequests}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Memory Usage:</span>
                  <span className="font-medium">{formatBytes(stats.memoryUsage)}</span>
                </div>
              </div>
            </div>

            {/* Cache Hit Rate */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Cache Hit Rate</h4>
              <div className="bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: formatPercentage(stats.validEntries, stats.totalSize),
                    minWidth: '0%'
                  }}
                ></div>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-600">Hit Rate</span>
                <span className="font-medium">{formatPercentage(stats.validEntries, stats.totalSize)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-900">Actions</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    apiService.clear();
                    setStats(apiService.getStats());
                  }}
                  className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                >
                  Clear Cache
                </button>
                <button
                  onClick={() => {
                    apiService.cleanup();
                    setStats(apiService.getStats());
                  }}
                  className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                >
                  Cleanup
                </button>
              </div>
            </div>

            {/* Performance Tips */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Performance Tips</h4>
              <div className="space-y-1 text-xs text-gray-600">
                <p>• Cache hit rate should be above 70%</p>
                <p>• Keep pending requests under 5</p>
                <p>• Memory usage should be under 10MB</p>
                <p>• Clear cache if performance degrades</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceDashboard; 