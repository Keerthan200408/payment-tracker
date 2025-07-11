import React, { memo, useCallback, useMemo } from 'react';
import { formatCurrency } from '../utils/formatters';

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
  isReportsPage = false
}) => {
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
                {months.map((month, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-6 py-4 whitespace-nowrap text-center"
                  >
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
                  </td>
                ))}
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm sm:text-base text-gray-900">
                  ₹{(parseFloat(row?.Due_Payment) || 0).toLocaleString()}.00
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

DataTable.displayName = 'DataTable';

export default DataTable; 