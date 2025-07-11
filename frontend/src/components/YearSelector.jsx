import React, { useState, useCallback } from 'react';
import { yearsAPI } from '../utils/api';

const YearSelector = ({ 
  currentYear, 
  availableYears, 
  onYearChange, 
  onAddNewYear,
  hasUnsavedChanges,
  onFlushChanges,
  isLoadingYears,
  showToast
}) => {
  const [isChangingYear, setIsChangingYear] = useState(false);

  const handleYearChange = useCallback(async (newYear) => {
    if (newYear === currentYear) return;

    // If there are unsaved changes, flush them first
    if (hasUnsavedChanges) {
      showToast('Saving changes before switching year...', 'info', 2000);
      try {
        await onFlushChanges();
        showToast('Changes saved successfully!', 'success', 2000);
      } catch (error) {
        showToast('Failed to save changes. Please try again.', 'error', 4000);
        return;
      }
    }

    setIsChangingYear(true);
    try {
      await onYearChange(newYear);
      showToast(`Switched to year ${newYear}`, 'success', 2000);
    } catch (error) {
      showToast(`Failed to switch to year ${newYear}`, 'error', 4000);
    } finally {
      setIsChangingYear(false);
    }
  }, [currentYear, hasUnsavedChanges, onFlushChanges, onYearChange, showToast]);

  const handleAddNewYear = useCallback(async () => {
    if (hasUnsavedChanges) {
      showToast('Saving changes before adding new year...', 'info', 2000);
      try {
        await onFlushChanges();
        showToast('Changes saved successfully!', 'success', 2000);
      } catch (error) {
        showToast('Failed to save changes. Please try again.', 'error', 4000);
        return;
      }
    }

    try {
      await onAddNewYear();
    } catch (error) {
      // Error handling is done in the parent component
    }
  }, [hasUnsavedChanges, onFlushChanges, onAddNewYear, showToast]);

  return (
    <div className="flex items-center space-x-4 mb-6">
      <div className="flex items-center space-x-2">
        <label htmlFor="year-select" className="text-sm font-medium text-gray-700">
          Year:
        </label>
        <select
          id="year-select"
          value={currentYear}
          onChange={(e) => handleYearChange(e.target.value)}
          disabled={isChangingYear || isLoadingYears}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        {isChangingYear && (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        )}
      </div>
      
      <button
        onClick={handleAddNewYear}
        disabled={isLoadingYears || isChangingYear}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {isLoadingYears ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
            Loading...
          </>
        ) : (
          'Add New Year'
        )}
      </button>
    </div>
  );
};

export default YearSelector; 