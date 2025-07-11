import React from 'react';

const BatchStatus = ({ 
  isUpdating, 
  pendingCount, 
  lastUpdateTime, 
  hasUnsavedChanges,
  batchStatus = null
}) => {
  if (!isUpdating && pendingCount === 0 && !hasUnsavedChanges) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3">
        <div className="flex items-center space-x-2">
          {isUpdating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-700">
                {batchStatus ? `Processing batch ${batchStatus.currentBatch}/${batchStatus.totalBatches}...` : 'Saving changes...'}
              </span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-700">
                {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending
              </span>
            </>
          ) : hasUnsavedChanges ? (
            <>
              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Unsaved changes</span>
            </>
          ) : null}
          
          {lastUpdateTime && (
            <span className="text-xs text-gray-500 ml-2">
              Last saved: {new Date(lastUpdateTime).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchStatus; 