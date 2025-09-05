import React from 'react';

const YearSelector = ({
    currentYear,
    availableYears,
    onYearChange,
    onAddNewYear,
    isLoadingYears
}) => {
    const handleYearSelection = (e) => {
        const newYear = e.target.value;
        if (newYear !== currentYear) {
            onYearChange(newYear);
        }
    };

    return (
        <div className="flex items-center space-x-2">
            <label htmlFor="year-select" className="text-sm font-medium text-gray-700">
                Year:
            </label>
            <select
                id="year-select"
                value={currentYear}
                onChange={handleYearSelection}
                disabled={isLoadingYears}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
                {(availableYears || [currentYear]).map((year) => (
                    <option key={year} value={year}>
                        {year}
                    </option>
                ))}
            </select>
            
            <button
                onClick={onAddNewYear}
                disabled={isLoadingYears}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                title="Add New Year"
            >
                {isLoadingYears ? (
                    <>
                        <i className="fas fa-spinner fa-spin mr-1"></i>
                        Adding...
                    </>
                ) : (
                    <>
                        <i className="fas fa-plus mr-1"></i>
                        Add Year
                    </>
                )}
            </button>
        </div>
    );
};

export default YearSelector;