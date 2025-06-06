// import { useEffect, useRef } from 'react';

// const HomePage = ({
//   paymentsData,
//   setPaymentsData,
//   searchQuery,
//   setSearchQuery,
//   monthFilter,
//   setMonthFilter,
//   statusFilter,
//   setStatusFilter,
//   updatePayment,
//   handleContextMenu,
//   contextMenu,
//   hideContextMenu,
//   deleteRow,
//   setPage,
//   csvFileInputRef,
//   importCsv,
//   isReportsPage = false,
// }) => {
//   const months = [
//     'january',
//     'february',
//     'march',
//     'april',
//     'may',
//     'june',
//     'july',
//     'august',
//     'september',
//     'october',
//     'november',
//     'december',
//   ];

//   const tableRef = useRef(null);

//   useEffect(() => {
//     const handleClickOutside = (e) => {
//       if (tableRef.current && !tableRef.current.contains(e.target)) {
//         hideContextMenu();
//       }
//     };
//     document.addEventListener('click', handleClickOutside);
//     return () => document.removeEventListener('click', handleClickOutside);
//   }, [hideContextMenu]);

//   const getPaymentStatus = (row) => {
//     const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 1; // Avoid division by zero
//     const totalPaid = months.reduce((sum, month) => sum + (parseFloat(row[month]) || 0), 0);
//     if (totalPaid === 0) return 'Unpaid';
//     if (totalPaid >= amountToBePaid) return 'Paid';
//     return 'Partially Paid';
//   };

//   const getMonthlyStatus = (row, month) => {
//     const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
//     const paidInMonth = parseFloat(row[month]) || 0;
//     if (paidInMonth === 0) return 'Unpaid';
//     if (paidInMonth >= amountToBePaid) return 'Paid';
//     return 'Partially Paid';
//   };

//   const filteredData = paymentsData.filter((row) => {
//     const matchesSearch =
//       !searchQuery ||
//       row.Client_Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       row.Type.toLowerCase().includes(searchQuery.toLowerCase());
//     const matchesMonth =
//       !monthFilter ||
//       months.some(
//         (month) =>
//           month === monthFilter.toLowerCase() &&
//           row[month] &&
//           row[month].trim() !== ''
//       );
//     const totalPaid = months.reduce((sum, month) => sum + (parseFloat(row[month]) || 0), 0);
//     const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 1; // Avoid division by zero
//     const matchesStatus =
//       !statusFilter ||
//       (statusFilter === 'Paid' && totalPaid >= amountToBePaid) ||
//       (statusFilter === 'PartiallyPaid' && totalPaid > 0 && totalPaid < amountToBePaid) ||
//       (statusFilter === 'Unpaid' && totalPaid === 0);
//     return matchesSearch && matchesMonth && matchesStatus;
//   });

//   const renderDashboard = () => (
//     <>
//       {/* Header Section */}
//       <div className="flex justify-between items-center mb-6">
//         <div className="flex space-x-3">
//           <button
//             onClick={() => setPage('addClient')}
//             className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200 flex items-center"
//           >
//             <i className="fas fa-plus mr-2"></i> Add Client
//           </button>
//           <input
//             type="file"
//             accept=".csv"
//             ref={csvFileInputRef}
//             onChange={importCsv}
//             className="hidden"
//             id="csv-import"
//           />
//           <label
//             htmlFor="csv-import"
//             className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition duration-200 flex items-center cursor-pointer"
//           >
//             <i className="fas fa-upload mr-2"></i> Bulk Import
//           </label>
//         </div>
//       </div>

//       {/* Filters Section */}
//       <div className="flex space-x-4 mb-6">
//         <input
//           type="text"
//           placeholder="Search by client or type..."
//           value={searchQuery}
//           onChange={(e) => setSearchQuery(e.target.value)}
//           className="p-2 border rounded-lg w-1/3 focus:ring-2 focus:ring-blue-500"
//         />
//         <select
//           value={monthFilter}
//           onChange={(e) => setMonthFilter(e.target.value)}
//           className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
//         >
//           <option value="">All Months</option>
//           {months.map((month, index) => (
//             <option key={index} value={month}>
//               {month.charAt(0).toUpperCase() + month.slice(1)}
//             </option>
//           ))}
//         </select>
//         <select
//           value={statusFilter}
//           onChange={(e) => setStatusFilter(e.target.value)}
//           className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
//         >
//           <option value="">Status</option>
//           <option value="Paid">Paid</option>
//           <option value="PartiallyPaid">Partially Paid</option>
//           <option value="Unpaid">Unpaid</option>
//         </select>
//       </div>

//       {/* Table Section */}
//       <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
//         <table className="min-w-full border-collapse" ref={tableRef}>
//           <thead>
//             <tr className="bg-gray-100">
//               <th className="border p-3 text-left">Client Name</th>
//               <th className="border p-3 text-left">Type</th>
//               <th className="border p-3 text-right">Amount To Be Paid</th>
//               {months.map((month, index) => (
//                 <th key={index} className="border p-3 text-right">
//                   {month.charAt(0).toUpperCase() + month.slice(1)}
//                 </th>
//               ))}
//               <th className="border p-3 text-right">Due Payment</th>
//             </tr>
//           </thead>
//           <tbody>
//             {filteredData.length === 0 ? (
//               <tr>
//                 <td colSpan={15} className="border p-3 text-center text-gray-500">
//                   No payments found.
//                 </td>
//               </tr>
//             ) : (
//               filteredData.map((row, rowIndex) => (
//                 <tr
//                   key={rowIndex}
//                   onContextMenu={(e) => handleContextMenu(e, rowIndex)}
//                   className="hover:bg-gray-50"
//                 >
//                   <td className="border p-3">{row.Client_Name}</td>
//                   <td className="border p-3">{row.Type}</td>
//                   <td className="border p-3 text-right">
//                     {row.Amount_To_Be_Paid.toFixed(2)}
//                   </td>
//                   {months.map((month, colIndex) => (
//                     <td key={colIndex} className="border p-1 text-right">
//                       <input
//                         type="text"
//                         value={row[month] || ''}
//                         onChange={(e) =>
//                           updatePayment(rowIndex, month, e.target.value)
//                         }
//                         className="w-20 p-1 border rounded text-right focus:ring-2 focus:ring-blue-500"
//                         placeholder="0.00"
//                       />
//                     </td>
//                   ))}
//                   <td className="border p-3 text-right">
//                     {parseFloat(row.Due_Payment).toFixed(2)}
//                   </td>
//                 </tr>
//               ))
//             )}
//           </tbody>
//         </table>
//       </div>

//       {/* Context Menu */}
//       {contextMenu && (
//         <div
//           className="absolute bg-white border rounded-lg shadow-lg p-2 z-50"
//           style={{ top: contextMenu.y, left: contextMenu.x }}
//         >
//           <button
//             onClick={deleteRow}
//             className="w-full text-left px-4 py-2 hover:bg-gray-100 text-red-500 flex items-center"
//           >
//             <i className="fas fa-trash mr-2"></i> Delete
//           </button>
//         </div>
//       )}
//     </>
//   );

//   const renderReports = () => {
//     const monthStatus = paymentsData.reduce((acc, row) => {
//       if (!acc[row.Client_Name]) {
//         acc[row.Client_Name] = {};
//       }
//       months.forEach((month) => {
//         acc[row.Client_Name][month] = getMonthlyStatus(row, month);
//       });
//       return acc;
//     }, {});

//     return (
//       <>
//         <h2 className="text-2xl font-semibold mb-6">Monthly Client Status Report</h2>
//         <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
//           <table className="min-w-full border-collapse">
//             <thead>
//               <tr className="bg-gray-100">
//                 <th className="border p-3 text-left font-semibold">Client Name</th>
//                 {months.map((month, index) => (
//                   <th key={index} className="border p-3 text-center font-semibold">
//                     {month.charAt(0).toUpperCase() + month.slice(1)}
//                   </th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody>
//               {Object.keys(monthStatus).length === 0 ? (
//                 <tr>
//                   <td colSpan={13} className="border p-3 text-center text-gray-500">
//                     No data available.
//                   </td>
//                 </tr>
//               ) : (
//                 Object.keys(monthStatus).map((client, idx) => (
//                   <tr key={idx} className="hover:bg-gray-50">
//                     <td className="border p-3">{client}</td>
//                     {months.map((month, mIdx) => (
//                       <td key={mIdx} className="border p-3 text-center">
//                         <span
//                           className={`px-2 py-1 rounded-full text-sm ${
//                             monthStatus[client][month] === 'Paid'
//                               ? 'bg-green-100 text-green-800'
//                               : monthStatus[client][month] === 'PartiallyPaid'
//                               ? 'bg-yellow-100 text-yellow-800'
//                               : 'bg-red-100 text-red-800'
//                           }`}
//                         >
//                           {monthStatus[client][month] || 'Unpaid'}
//                         </span>
//                       </td>
//                     ))}
//                   </tr>
//                 ))
//               )}
//             </tbody>
//           </table>
//         </div>
//       </>
//     );
//   };

//   return (
//     <div className="p-6">
//       {isReportsPage ? renderReports() : renderDashboard()}
//     </div>
//   );
// };

// export default HomePage;

import { useEffect, useRef } from 'react';

const HomePage = ({
  paymentsData,
  setPaymentsData,
  searchQuery,
  setSearchQuery,
  monthFilter,
  setMonthFilter,
  statusFilter,
  setStatusFilter,
  updatePayment,
  handleContextMenu,
  contextMenu,
  hideContextMenu,
  deleteRow,
  setPage,
  csvFileInputRef,
  importCsv,
  isReportsPage = false,
}) => {
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];

  const tableRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        hideContextMenu();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [hideContextMenu]);

  const getPaymentStatusForMonth = (row, month) => {
    const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
    const paidInMonth = parseFloat(row[month]) || 0;
    if (paidInMonth === 0) return 'Unpaid';
    if (paidInMonth >= amountToBePaid) return 'Paid';
    return 'PartiallyPaid';
  };

  const getMonthlyStatus = (row, month) => {
    const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
    const paidInMonth = parseFloat(row[month]) || 0;
    if (paidInMonth === 0) return 'Unpaid';
    if (paidInMonth >= amountToBePaid) return 'Paid';
    return 'PartiallyPaid';
  };

  const filteredData = paymentsData.filter((row) => {
    const matchesSearch =
      !searchQuery ||
      row.Client_Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.Type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesMonth =
      !monthFilter ||
      (row[monthFilter.toLowerCase()] !== undefined &&
       row[monthFilter.toLowerCase()] !== null);

    const matchesStatus = !monthFilter
      ? true // If no month is selected, don't filter by status
      : !statusFilter ||
        (statusFilter === 'Paid' &&
         getPaymentStatusForMonth(row, monthFilter.toLowerCase()) === 'Paid') ||
        (statusFilter === 'PartiallyPaid' &&
         getPaymentStatusForMonth(row, monthFilter.toLowerCase()) === 'PartiallyPaid') ||
        (statusFilter === 'Unpaid' &&
         getPaymentStatusForMonth(row, monthFilter.toLowerCase()) === 'Unpaid');

    return matchesSearch && matchesMonth && matchesStatus;
  });

  const renderDashboard = () => (
    <>
      {/* Header Section */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex space-x-3">
          <button
            onClick={() => setPage('addClient')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200 flex items-center"
          >
            <i className="fas fa-plus mr-2"></i> Add Client
          </button>
          <input
            type="file"
            accept=".csv"
            ref={csvFileInputRef}
            onChange={importCsv}
            className="hidden"
            id="csv-import"
          />
          <label
            htmlFor="csv-import"
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition duration-200 flex items-center cursor-pointer"
          >
            <i className="fas fa-upload mr-2"></i> Bulk Import
          </label>
        </div>
      </div>

      {/* Filters Section */}
      <div className="flex space-x-4 mb-6">
        <input
          type="text"
          placeholder="Search by client or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="p-2 border rounded-lg w-1/3 focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Months</option>
          {months.map((month, index) => (
            <option key={index} value={month}>
              {month.charAt(0).toUpperCase() + month.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          disabled={!monthFilter} // Disable status filter if no month is selected
        >
          <option value="">Status</option>
          <option value="Paid">Paid</option>
          <option value="PartiallyPaid">Partially Paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>
      </div>

      {/* Table Section */}
      <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
        <table className="min-w-full border-collapse" ref={tableRef}>
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-3 text-left">Client Name</th>
              <th className="border p-3 text-left">Type</th>
              <th className="border p-3 text-right">Amount To Be Paid</th>
              {months.map((month, index) => (
                <th key={index} className="border p-3 text-right">
                  {month.charAt(0).toUpperCase() + month.slice(1)}
                </th>
              ))}
              <th className="border p-3 text-right">Due Payment</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={15} className="border p-3 text-center text-gray-500">
                  No payments found.
                </td>
              </tr>
            ) : (
              filteredData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  onContextMenu={(e) => handleContextMenu(e, rowIndex)}
                  className="hover:bg-gray-50"
                >
                  <td className="border p-3">{row.Client_Name}</td>
                  <td className="border p-3">{row.Type}</td>
                  <td className="border p-3 text-right">
                    {row.Amount_To_Be_Paid.toFixed(2)}
                  </td>
                  {months.map((month, colIndex) => (
                    <td key={colIndex} className="border p-1 text-right">
                      <input
                        type="text"
                        value={row[month] || ''}
                        onChange={(e) =>
                          updatePayment(rowIndex, month, e.target.value)
                        }
                        className="w-20 p-1 border rounded text-right focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </td>
                  ))}
                  <td className="border p-3 text-right">
                    {parseFloat(row.Due_Payment).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="absolute bg-white border rounded-lg shadow-lg p-2 z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={deleteRow}
            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-red-500 flex items-center"
          >
            <i className="fas fa-trash mr-2"></i> Delete
          </button>
        </div>
      )}
    </>
  );

  const renderReports = () => {
    const monthStatus = paymentsData.reduce((acc, row) => {
      if (!acc[row.Client_Name]) {
        acc[row.Client_Name] = {};
      }
      months.forEach((month) => {
        acc[row.Client_Name][month] = getMonthlyStatus(row, month);
      });
      return acc;
    }, {});

    return (
      <>
        <h2 className="text-2xl font-semibold mb-6">Monthly Client Status Report</h2>
        <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-3 text-left font-semibold">Client Name</th>
                {months.map((month, index) => (
                  <th key={index} className="border p-3 text-center font-semibold">
                    {month.charAt(0).toUpperCase() + month.slice(1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(monthStatus).length === 0 ? (
                <tr>
                  <td colSpan={13} className="border p-3 text-center text-gray-500">
                    No data available.
                  </td>
                </tr>
              ) : (
                Object.keys(monthStatus).map((client, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="border p-3">{client}</td>
                    {months.map((month, mIdx) => (
                      <td key={mIdx} className="border p-3 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-sm ${
                            monthStatus[client][month] === 'Paid'
                              ? 'bg-green-100 text-green-800'
                              : monthStatus[client][month] === 'PartiallyPaid'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {monthStatus[client][month] || 'Unpaid'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  return (
    <div className="p-6">
      {isReportsPage ? renderReports() : renderDashboard()}
    </div>
  );
};

export default HomePage;