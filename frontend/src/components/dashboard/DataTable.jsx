import React from 'react';

const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
];

const DataTable = ({ 
    data, 
    paymentsData, 
    localInputValues, 
    handleInputChange, 
    getInputBackgroundColor, 
    onRemarkButtonClick 
}) => {
    return (
        <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount To Be Paid
                    </th>
                    {months.map((month, index) => (
                        <th
                            key={index}
                            className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                            {month.charAt(0).toUpperCase() + month.slice(1)}
                        </th>
                    ))}
                    <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Due
                    </th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.length === 0 ? (
                    <tr>
                        <td colSpan={15} className="px-6 py-12 text-center text-gray-500">
                            <div className="flex flex-col items-center">
                                <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                                <p className="text-lg font-medium text-gray-600">
                                    No payments found.
                                </p>
                            </div>
                        </td>
                    </tr>
                ) : (
                    data.map((row, localRowIndex) => {
                        const globalRowIndex = paymentsData.findIndex((r) => 
                            r.Client_Name === row.Client_Name && r.Type === row.Type
                        );
                        
                        return (
                            <tr key={`${row?.Client_Name || "unknown"}-${localRowIndex}`} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap flex items-center text-sm text-gray-900">
                                    <i className="fas fa-user-circle mr-2 text-gray-400"></i>
                                    {row?.Client_Name || "N/A"}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                    {row?.Type || "N/A"}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                                    ₹{(parseFloat(row?.Amount_To_Be_Paid) || 0).toLocaleString()}.00
                                </td>
                                {months.map((month, colIndex) => {
                                    const monthKey = month.charAt(0).toUpperCase() + month.slice(1);
                                    const currentRemark = row?.Remarks?.[monthKey] || "N/A";
                                    const hasRemark = currentRemark !== "N/A" && currentRemark !== "";
                                    
                                    return (
                                        <td key={colIndex} className="px-6 py-4 whitespace-nowrap text-center relative group">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={
                                                        localInputValues[`${globalRowIndex}-${month}`] !== undefined
                                                            ? localInputValues[`${globalRowIndex}-${month}`]
                                                            : row?.[month] || ""
                                                    }
                                                    onChange={(e) => handleInputChange(globalRowIndex, month, e.target.value)}
                                                    className={`w-20 p-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm ${getInputBackgroundColor(row, month, globalRowIndex)}`}
                                                />
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRemarkButtonClick({
                                                            clientName: row?.Client_Name || '',
                                                            type: row?.Type || '',
                                                            month: month,
                                                            currentRemark: currentRemark
                                                        });
                                                    }}
                                                    className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all duration-200 ${
                                                        hasRemark
                                                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                                                            : 'bg-gray-300 text-gray-600 hover:bg-gray-400 opacity-0 group-hover:opacity-100'
                                                    }`}
                                                    title={hasRemark ? `Remark: ${currentRemark}` : 'Add remark'}
                                                >
                                                    <i className={`fas ${hasRemark ? 'fa-comment' : 'fa-plus'}`}></i>
                                                </button>
                                            </div>
                                        </td>
                                    );
                                })}
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                                    ₹{(parseFloat(row?.Due_Payment) || 0).toLocaleString()}.00
                                </td>
                            </tr>
                        );
                    })
                )}
            </tbody>
        </table>
    );
};

DataTable.displayName = 'DataTable';
export default DataTable;