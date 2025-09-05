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
        <table className="min-w-full divide-y divide-gray-200 border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-20">
                <tr>
                    {/* Sticky Columns */}
                    <th scope="col" className="sticky left-0 z-30 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50 w-48 min-w-[12rem]">Client</th>
                    <th scope="col" className="sticky left-[192px] z-30 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50 w-40 min-w-[10rem]">Type</th>
                    <th scope="col" className="sticky left-[352px] z-30 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-gray-50 w-40 min-w-[10rem]">Amount To Be Paid</th>
                    
                    {/* Scrollable Columns */}
                    {months.map((month) => (
                        <th key={month} scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase w-32 min-w-[8rem]">
                            {month.charAt(0).toUpperCase() + month.slice(1)}
                        </th>
                    ))}
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase w-40 min-w-[10rem]">Total Due</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {memoizedData.map((row) => {
                    // Find the original index from the full dataset for correct data binding
                    const globalRowIndex = paymentsData.findIndex(p => p.Client_Name === row.Client_Name && p.Type === row.Type);

                    return (
                        <tr key={row.key} className="hover:bg-gray-50">
                            {/* Sticky Cells */}
                            <td className="sticky left-0 z-10 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 bg-white hover:bg-gray-50 w-48 min-w-[12rem]">{row.Client_Name}</td>
                            <td className="sticky left-[192px] z-10 px-6 py-4 whitespace-nowrap text-sm text-gray-500 bg-white hover:bg-gray-50 w-40 min-w-[10rem]">{row.Type}</td>
                            <td className="sticky left-[352px] z-10 px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right bg-white hover:bg-gray-50 w-40 min-w-[10rem]">
                                ₹{parseFloat(row.Amount_To_Be_Paid || 0).toLocaleString('en-IN')}
                            </td>

                            {/* Scrollable Cells */}
                            {months.map((month) => {
                                const hasRemark = row.Remarks?.[month.charAt(0).toUpperCase() + month.slice(1)] && row.Remarks?.[month.charAt(0).toUpperCase() + month.slice(1)] !== "N/A";
                                return (
                                    <td key={month} className="px-6 py-4 whitespace-nowrap text-center relative group">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={localInputValues[`${globalRowIndex}-${month}`] ?? row[month] ?? ""}
                                                onChange={(e) => handleInputChange(globalRowIndex, month, e.target.value)}
                                                className={`w-24 p-1 border rounded text-right text-sm ${getInputBackgroundColor(row, month, globalRowIndex)}`}
                                                placeholder="0.00"
                                            />
                                            <button
                                                onClick={() => onRemarkButtonClick({
                                                    clientName: row.Client_Name,
                                                    type: row.Type,
                                                    month: month,
                                                    currentRemark: row.Remarks?.[month.charAt(0).toUpperCase() + month.slice(1)] || ""
                                                })}
                                                className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs transition-opacity ${hasRemark ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600 opacity-0 group-hover:opacity-100'}`}
                                                title="Edit Remark"
                                            >
                                               <i className={`fas ${hasRemark ? 'fa-comment' : 'fa-plus'}`}></i>
                                            </button>
                                        </div>
                                    </td>
                                );
                            })}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right w-40 min-w-[10rem]">
                                ₹{parseFloat(row.Due_Payment || 0).toLocaleString('en-IN')}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
});

DataTable.displayName = 'DataTable';
export default DataTable;