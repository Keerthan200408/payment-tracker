import React, { memo, useMemo } from 'react';

const DataTable = memo(({ 
    data, 
    months,
    paymentsData, // The full, unfiltered data for finding the correct index
    localInputValues,
    handleInputChange, 
    getInputBackgroundColor,
    onRemarkButtonClick
}) => {

    if (!Array.isArray(data) || data.length === 0) {
        return (
            <div className="text-center py-16 text-gray-500">
                <p className="text-lg">No data available.</p>
                <p className="text-sm mt-1">Try changing the year or clearing your search filter.</p>
            </div>
        );
    }
    
    // Use a memoized version of data to prevent re-mapping on every render
    const memoizedData = useMemo(() => data.map(row => ({
        ...row,
        key: `${row.Client_Name}-${row.Type}`
    })), [data]);

    return (
        <div className="relative">
            {/* Horizontal scrollbar with custom styling */}
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
                <table className="min-w-full divide-y divide-gray-200 border-collapse" style={{ minWidth: '1400px' }}>
                    <thead className="bg-gray-50 sticky top-0 z-20">
                        <tr>
                            {/* Sticky Columns - Reduced widths for better space utilization */}
                            <th scope="col" className="sticky left-0 z-30 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50 border-r border-gray-200 shadow-sm" style={{ width: '160px', minWidth: '160px' }}>
                                Client Name
                            </th>
                            <th scope="col" className="sticky left-[160px] z-30 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50 border-r border-gray-200 shadow-sm" style={{ width: '100px', minWidth: '100px' }}>
                                Type
                            </th>
                            <th scope="col" className="sticky left-[260px] z-30 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-gray-50 border-r border-gray-200 shadow-sm" style={{ width: '120px', minWidth: '120px' }}>
                                Amount To Be Paid
                            </th>
                            
                            {/* Scrollable Month Columns - Compact size */}
                            {months.map((month) => (
                                <th key={month} scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-100" style={{ width: '90px', minWidth: '90px' }}>
                                    {month.charAt(0).toUpperCase() + month.slice(1)}
                                </th>
                            ))}
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase" style={{ width: '120px', minWidth: '120px' }}>
                                Total Due
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {memoizedData.map((row) => {
                            // Find the original index from the full dataset for correct data binding
                            const globalRowIndex = paymentsData.findIndex(p => p.Client_Name === row.Client_Name && p.Type === row.Type);

                            return (
                                <tr key={row.key} className="hover:bg-gray-50 transition-colors">
                                    {/* Sticky Cells */}
                                    <td className="sticky left-0 z-10 px-4 py-3 text-sm font-medium text-gray-900 bg-white hover:bg-gray-50 border-r border-gray-200 shadow-sm truncate" style={{ width: '160px', minWidth: '160px' }} title={row.Client_Name}>
                                        {row.Client_Name}
                                    </td>
                                    <td className="sticky left-[160px] z-10 px-4 py-3 text-sm text-gray-700 bg-white hover:bg-gray-50 border-r border-gray-200 shadow-sm" style={{ width: '100px', minWidth: '100px' }}>
                                        {row.Type}
                                    </td>
                                    <td className="sticky left-[260px] z-10 px-4 py-3 text-sm text-gray-900 text-right bg-white hover:bg-gray-50 border-r border-gray-200 shadow-sm font-medium" style={{ width: '120px', minWidth: '120px' }}>
                                        ₹{parseFloat(row.Amount_To_Be_Paid || 0).toLocaleString('en-IN')}
                                    </td>

                                    {/* Scrollable Month Cells - Compact layout */}
                                    {months.map((month) => {
                                        const hasRemark = row.Remarks?.[month.charAt(0).toUpperCase() + month.slice(1)] && row.Remarks?.[month.charAt(0).toUpperCase() + month.slice(1)] !== "N/A";
                                        return (
                                            <td key={month} className="px-2 py-3 text-center relative group border-r border-gray-100" style={{ width: '90px', minWidth: '90px' }}>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={localInputValues[`${globalRowIndex}-${month}`] ?? row[month] ?? ""}
                                                        onChange={(e) => handleInputChange(globalRowIndex, month, e.target.value)}
                                                        className={`w-full p-1.5 border rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${getInputBackgroundColor(row, month, globalRowIndex)}`}
                                                        placeholder="0"
                                                    />
                                                    <button
                                                        onClick={() => onRemarkButtonClick({
                                                            clientName: row.Client_Name,
                                                            type: row.Type,
                                                            month: month,
                                                            currentRemark: row.Remarks?.[month.charAt(0).toUpperCase() + month.slice(1)] || ""
                                                        })}
                                                        className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs transition-all duration-200 ${hasRemark ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-300 text-gray-600 opacity-0 group-hover:opacity-100'}`}
                                                        title={hasRemark ? `Remark: ${row.Remarks?.[month.charAt(0).toUpperCase() + month.slice(1)]}` : 'Add remark'}
                                                    >
                                                        <i className={`fas ${hasRemark ? 'fa-comment' : 'fa-plus'} text-xs`}></i>
                                                    </button>
                                                </div>
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium" style={{ width: '120px', minWidth: '120px' }}>
                                        ₹{parseFloat(row.Due_Payment || 0).toLocaleString('en-IN')}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            
            {/* Scroll indicators */}
            <div className="absolute top-0 right-0 bg-gradient-to-l from-white via-white to-transparent w-8 h-full pointer-events-none opacity-50"></div>
        </div>
    );
});

DataTable.displayName = 'DataTable';
export default DataTable;