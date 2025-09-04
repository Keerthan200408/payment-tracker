import React from 'react';

const YearSelector = ({
    currentYear,
    availableYears,
    onYearChange,
    onAddNewYear, // This function is now passed from the parent page
    isLoadingYears
}) => {

    const handleYearSelection = (e) => {
        const newYear = e.target.value;
        if (newYear !== currentYear) {
            onYearChange(newYear);
        }
    };

    return (
        <div className="flex items-center space-x-4 mb-6">
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
            </div>
            
            <button
                onClick={onAddNewYear} // This now calls the function passed down from the parent
                disabled={isLoadingYears}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
                {isLoadingYears ? (
                    <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
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