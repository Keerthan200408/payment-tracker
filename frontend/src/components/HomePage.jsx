// import { useState, useEffect } from 'react';
// import axios from 'axios';

// const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// const HomePage = () => {
//   const [clients, setClients] = useState([]);
//   const [payments, setPayments] = useState([]);
//   const [error, setError] = useState('');

//   useEffect(() => {
//     const fetchData = async () => {
//       try {
//         const [clientsRes, paymentsRes] = await Promise.all([
//           axios.get(`${BASE_URL}/api/get-clients`, { withCredentials: true }),
//           axios.get(`${BASE_URL}/api/get-payments`, { withCredentials: true }),
//         ]);
//         setClients(clientsRes.data);
//         setPayments(paymentsRes.data);
//       } catch (error) {
//         console.error('Fetch error:', error);
//         setError('Error fetching data. Please try again.');
//       }
//     };
//     fetchData();
//   }, []);

//   return (
//     <div className="p-6">
//       {error && <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-lg">{error}</div>}
//       <h2 className="text-2xl font-bold mb-4">Clients</h2>
//       <div className="overflow-x-auto">
//         <table className="min-w-full bg-white border">
//           <thead className="bg-gray-100 sticky top-16">
//             <tr>
//               <th className="p-2 border">Client Name</th>
//               <th className="p-2 border">Email</th>
//               <th className="p-2 border">Type</th>
//               <th className="p-2 border">Monthly Payment</th>
//             </tr>
//           </thead>
//           <tbody>
//             {clients.map((client, index) => (
//               <tr key={index}>
//                 <td className="p-2 border">{client.Client_Name}</td>
//                 <td className="p-2 border">{client.Email}</td>
//                 <td className="p-2 border">{client.Type}</td>
//                 <td className="p-2 border">{client.monthly_payment}</td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//       <h2 className="text-2xl font-bold mb-4 mt-6">Payments</h2>
//       <div className="overflow-x-auto">
//         <table className="min-w-full bg-white border">
//           <thead className="bg-gray-100 sticky top-16">
//             <tr>
//               <th className="p-2 border">Client Name</th>
//               <th className="p-2 border">Type</th>
//               <th className="p-2 border">Amount</th>
//               <th className="p-2 border">Jan</th>
//               <th className="p-2 border">Feb</th>
//               <th className="p-2 border">Mar</th>
//               <th className="p-2 border">Apr</th>
//               <th className="p-2 border">May</th>
//               <th className="p-2 border">Jun</th>
//               <th className="p-2 border">Jul</th>
//               <th className="p-2 border">Aug</th>
//               <th className="p-2 border">Sep</th>
//               <th className="p-2 border">Oct</th>
//               <th className="p-2 border">Nov</th>
//               <th className="p-2 border">Dec</th>
//               <th className="p-2 border">Due</th>
//             </tr>
//           </thead>
//           <tbody>
//             {payments.map((payment, index) => (
//               <tr key={index}>
//                 <td className="p-2 border">{payment.Client_Name}</td>
//                 <td className="p-2 border">{payment.Type}</td>
//                 <td className="p-2 border">{payment.Amount_To_Be_Paid}</td>
//                 <td className="p-2 border">{payment.january}</td>
//                 <td className="p-2 border">{payment.february}</td>
//                 <td className="p-2 border">{payment.march}</td>
//                 <td className="p-2 border">{payment.april}</td>
//                 <td className="p-2 border">{payment.may}</td>
//                 <td className="p-2 border">{payment.june}</td>
//                 <td className="p-2 border">{payment.july}</td>
//                 <td className="p-2 border">{payment.august}</td>
//                 <td className="p-2 border">{payment.september}</td>
//                 <td className="p-2 border">{payment.october}</td>
//                 <td className="p-2 border">{payment.november}</td>
//                 <td className="p-2 border">{payment.december}</td>
//                 <td className="p-2 border">{payment.Due_Payment}</td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
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

  const filteredData = paymentsData.filter((row) => {
    const matchesSearch =
      !searchQuery ||
      row.Client_Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.Type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMonth =
      !monthFilter ||
      months.some(
        (month) =>
          month === monthFilter.toLowerCase() &&
          row[month] &&
          row[month].trim() !== ''
      );
    const matchesStatus =
      !statusFilter ||
      (statusFilter === 'Paid' &&
        months.some((month) => parseFloat(row[month]) > 0)) ||
      (statusFilter === 'Pending' && parseFloat(row.Due_Payment) > 0);
    return matchesSearch && matchesMonth && matchesStatus;
  });

  return (
    <div className="p-6">
      {/* Header Section */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Dashboard</h2>
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
        >
          <option value="">All Statuses</option>
          <option value="Paid">Paid</option>
          <option value="Pending">Pending</option>
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
                    ${row.Amount_To_Be_Paid.toFixed(2)}
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
                    ${parseFloat(row.Due_Payment).toFixed(2)}
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
          className="absolute bg-white border rounded shadow-lg p-2 z-50"
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
    </div>
  );
};

export default HomePage;
