import React, { memo, useCallback, useMemo, useState } from 'react';
import { formatCurrency } from '../utils/formatters';
import RemarkPopup from './RemarkPopup';

const DataTable = memo(({ 
  data, 
  months, 
  onCellEdit, 
  onContextMenu, 
  isLoading,
  currentYear,
  showToast,
  localInputValues = {},
  handleInputChange,
  getInputBackgroundColor,
  pendingUpdates = {},
  isReportsPage = false,
  sessionToken,
  onRemarkSaved
}) => {
  const [remarkPopup, setRemarkPopup] = useState({
    isOpen: false,
    clientName: '',
    type: '',
    month: '',
    currentRemark: 'N/A'
  });
  const handleCellClick = useCallback((rowIndex, month) => {
    if (isLoading) return;
    onCellEdit(rowIndex, month);
  }, [isLoading, onCellEdit]);

  const handleContextMenu = useCallback((e, rowIndex) => {
    e.preventDefault();
    onContextMenu(e, rowIndex);
  }, [onContextMenu]);

  const memoizedData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.map((row, index) => ({
      ...row,
      key: `${row.Client_Name || index}_${currentYear}`,
    }));
  }, [data, currentYear]);

  if (!Array.isArray(memoizedData) || memoizedData.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="flex flex-col items-center">
          <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
          <p className="text-lg font-medium text-gray-600">
            No data available for {currentYear}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            No payment data found. Try refreshing or check the Clients sheet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
              Client
            </th>
            <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
              Type
            </th>
            <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
              Amount To Be Paid
            </th>
            {months.map((month, index) => (
              <th
                key={index}
                className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50"
              >
                {month.charAt(0).toUpperCase() + month.slice(1)}
              </th>
            ))}
            <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
              Total Due
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {memoizedData.map((row, localRowIndex) => {
            const globalRowIndex = data.findIndex(
              (r) => r.Client_Name === row.Client_Name
            );
            return (
              <tr
                key={row.key}
                onContextMenu={(e) => handleContextMenu(e, globalRowIndex)}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 whitespace-nowrap flex items-center text-sm sm:text-base text-gray-900">
                  <i className="fas fa-user-circle mr-2 text-gray-400"></i>
                  {row?.Client_Name || "N/A"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-sm sm:text-base text-gray-900">
                  {row?.Type || "N/A"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm sm:text-base text-gray-900">
                  ₹{(parseFloat(row?.Amount_To_Be_Paid) || 0).toLocaleString()}.00
                </td>
                {months.map((month, colIndex) => {
                  const monthKey = month.charAt(0).toUpperCase() + month.slice(1);
                  const currentRemark = row?.Remarks?.[monthKey] || "N/A";
                  const hasRemark = currentRemark !== "N/A";
                  
                  return (
                    <td
                      key={colIndex}
                      className="px-6 py-4 whitespace-nowrap text-center relative group"
                    >
                      <div className="relative">
                        <input
                          type="text"
                          value={
                            localInputValues[`${globalRowIndex}-${month}`] !== undefined
                              ? localInputValues[`${globalRowIndex}-${month}`]
                              : row?.[month] || ""
                          }
                          onChange={(e) =>
                            handleInputChange(globalRowIndex, month, e.target.value)
                          }
                          className={`w-20 p-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base ${getInputBackgroundColor(
                            row,
                            month,
                            globalRowIndex
                          )}`}
                          placeholder="0.00"
                          title={
                            pendingUpdates[`${globalRowIndex}-${month}`]
                              ? "Saving..."
                              : ""
                          }
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRemarkPopup({
                              isOpen: true,
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
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm sm:text-base text-gray-900">
                  ₹{(parseFloat(row?.Due_Payment) || 0).toLocaleString()}.00
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      <RemarkPopup
        isOpen={remarkPopup.isOpen}
        onClose={() => setRemarkPopup({ ...remarkPopup, isOpen: false })}
        clientName={remarkPopup.clientName}
        type={remarkPopup.type}
        month={remarkPopup.month}
        currentRemark={remarkPopup.currentRemark}
        year={currentYear}
        sessionToken={sessionToken}
        onRemarkSaved={(newRemark) => {
          onRemarkSaved && onRemarkSaved(remarkPopup.clientName, remarkPopup.type, remarkPopup.month, newRemark);
        }}
      />
    </div>
  );
});

DataTable.displayName = 'DataTable';

export default DataTable; 