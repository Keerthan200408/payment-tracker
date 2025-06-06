/* import { useState, useRef } from 'react';

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
  contextTargetRow,
  hideContextMenu,
  deleteRow,
  setPage,
  csvFileInputRef,
  importCsv,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [filterOptionsVisible, setFilterOptionsVisible] = useState(false);
  const entriesPerPage = 10;
  const tableRef = useRef(null);

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

  const filteredData = paymentsData.filter((row) => {
    const clientName = row.Client_Name.toLowerCase();
    const nameMatches = clientName.includes(searchQuery.toLowerCase());
    let filterMatches = true;

    if (monthFilter && statusFilter) {
      const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
      const paymentValue = parseFloat(row[monthFilter]) || 0;
      if (statusFilter === 'paid') {
        filterMatches = paymentValue >= amountToBePaid && amountToBePaid > 0;
      } else if (statusFilter === 'unpaid') {
        filterMatches = paymentValue === 0 || !row[monthFilter];
      } else if (statusFilter === 'partially-paid') {
        filterMatches = paymentValue > 0 && paymentValue < amountToBePaid;
      }
    }

    return nameMatches && filterMatches;
  });

  const totalEntries = filteredData.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

  const getPaymentStatusClass = (row, month) => {
    const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
    const enteredValue = parseFloat(row[month]) || 0;

    if (enteredValue === 0 || !row[month]) {
      return 'bg-red-100';
    } else if (enteredValue >= amountToBePaid && amountToBePaid > 0) {
      return 'bg-green-100';
    } else if (enteredValue > 0 && enteredValue < amountToBePaid) {
      return 'bg-orange-100';
    }
    return '';
  };

  const handleKeyDown = (e, rowIndex, monthIndex) => {
    const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!arrowKeys.includes(e.key)) return;

    const inputs = Array.from(document.querySelectorAll('.month-input'));
    const currentInput = e.target;
    const currentIndex = inputs.indexOf(currentInput);
    if (currentIndex === -1) return;

    e.preventDefault();

    const inputsPerRow = 12;
    const totalInputs = inputs.length;

    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = currentIndex + 1;
        if (nextIndex >= totalInputs) nextIndex = 0;
        break;
      case 'ArrowLeft':
        nextIndex = currentIndex - 1;
        if (nextIndex < 0) nextIndex = totalInputs - 1;
        break;
      case 'ArrowDown':
        nextIndex = currentIndex + inputsPerRow;
        if (nextIndex >= totalInputs) nextIndex = currentIndex % inputsPerRow;
        break;
      case 'ArrowUp':
        nextIndex = currentIndex - inputsPerRow;
        if (nextIndex < 0) {
          const rowsCount = Math.floor(totalInputs / inputsPerRow);
          nextIndex = currentIndex + inputsPerRow * (rowsCount - 1);
          if (nextIndex >= totalInputs) nextIndex = totalInputs - 1;
        }
        break;
    }

    inputs[nextIndex].focus();
    inputs[nextIndex].select();
  };

  const handleContextKeyDown = (e, rowIndex) => {
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault();
      const rect = e.target.getBoundingClientRect();
      setContextTargetRow({ rowIndex, x: rect.left, y: rect.bottom });
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Client Payment Tracker</h1>
      <div className="flex justify-between items-center mb-4">
        <div className="flex space-x-2">
          <button
            onClick={() => setPage('addClient')}
            className="bg-blue-800 text-white px-4 py-2 rounded-lg hover:bg-blue-900 flex items-center"
          >
            <i className="fas fa-user-plus mr-2"></i> Add Client
          </button>
          <button
            onClick={() => csvFileInputRef.current.click()}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center"
          >
            <i className="fas fa-file-import mr-2"></i> Import-CSV
          </button>
          <input
            type="file"
            ref={csvFileInputRef}
            accept=".csv"
            className="hidden"
            onChange={importCsv}
          />
        </div>
        <div className="flex space-x-2 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearchQuery(searchQuery)}
            placeholder="Search clients..."
            className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            aria-label="Search clients"
          />
          <button
            onClick={() => setSearchQuery(searchQuery)}
            className="bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600"
          >
            <i className="fas fa-search"></i>
          </button>
          <button
            onClick={() => setSearchQuery('')}
            className="bg-gray-500 text-white px-3 py-2 rounded-lg hover:bg-gray-600"
          >
            ×
          </button>
          <div className="relative">
            <button
              onClick={() => setFilterOptionsVisible(!filterOptionsVisible)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
            >
              <i className="fas fa-filter mr-2"></i> Filter
            </button>
            {filterOptionsVisible && (
              <div className="absolute right-0 mt-2 bg-white border rounded-lg shadow-lg p-4 z-50 min-w-[300px]">
                <div className="mb-4">
                  <label className="block mb-1">Month</label>
                  <select
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    className="w-full p-2 border rounded-lg"
                    aria-label="Select month"
                  >
                    <option value="">Select Month</option>
                    {months.map((month) => (
                      <option key={month} value={month}>
                        {month.charAt(0).toUpperCase() + month.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block mb-1">Payment Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full p-2 border rounded-lg"
                    aria-label="Select payment status"
                  >
                    <option value="">Select Status</option>
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="partially-paid">Partially Paid</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setMonthFilter('');
                      setStatusFilter('');
                      setFilterOptionsVisible(false);
                      setSearchQuery('');
                    }}
                    className="bg-gray-500 text-white px-3 py-2 rounded-lg hover:bg-gray-600"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setFilterOptionsVisible(false)}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="max-h-[60vh] overflow-y-auto w-full rounded-lg shadow bg-white"
        ref={tableRef}
      >
        <table className="min-w-[1200px] w-full">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th rowSpan="2" className="p-2 text-center">
                Sr.
              </th>
              <th rowSpan="2" className="p-2 text-center">
                Client
              </th>
              <th rowSpan="2" className="p-2 text-center">
                Type
              </th>
              <th rowSpan="2" className="p-2 text-center">
                Amount To Be Paid
              </th>
              <th colSpan="12" className="p-2 text-center">
                Jan - Dec
              </th>
              <th rowSpan="2" className="p-2 text-center">
                Total Due
              </th>
              <th rowSpan="2" className="p-2 text-center">
                Actions
              </th>
            </tr>
            <tr className="bg-gray-100">
              {months.map((month, index) => (
                <th
                  key={month}
                  className={`p-2 text-center ${index < 6 ? 'bg-blue-50' : ''}`}
                >
                  {month.charAt(0).toUpperCase() + month.slice(1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, index) => (
              <tr
                key={index}
                onContextMenu={(e) => handleContextMenu(e, index)}
                className="border-t"
              >
                <td className="p-2 text-center">
                  {(currentPage - 1) * entriesPerPage + index + 1}
                </td>
                <td className="p-2 flex items-center">
                  <i className="fas fa-user-circle mr-2"></i>
                  {row.Client_Name}
                </td>
                <td className="p-2 text-center">{row.Type || 'N/A'}</td>
                <td className="p-2 text-center">${row.Amount_To_Be_Paid}</td>
                {months.map((month, monthIndex) => (
                  <td
                    key={month}
                    className={`p-2 text-center ${monthIndex < 6 ? 'bg-blue-50' : ''}`}
                  >
                    <input
                      type="text"
                      className={`month-input w-full p-1 border rounded-lg text-center ${getPaymentStatusClass(
                        row,
                        month
                      )}`}
                      value={row[month] || ''}
                      onChange={(e) => updatePayment(index, month, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, monthIndex)}
                      onContextMenu={(e) => handleContextMenu(e, index)}
                      onKeyDownCapture={(e) => handleContextKeyDown(e, index)}
                      aria-label={`Payment for ${month} for ${row.Client_Name}`}
                    />
                  </td>
                ))}
                <td className="p-2 text-center">${row.Due_Payment}</td>
                <td className="p-2 text-center">
                  <button
                    onClick={() => {
                      setEditClient(row);
                      setPage('addClient');
                    }}
                    className="text-gray-500 hover:text-gray-700 mr-2"
                    aria-label={`Edit ${row.Client_Name}`}
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  <button
                    onClick={() => {
                      setContextTargetRow({ rowIndex: index });
                      deleteRow();
                    }}
                    className="text-gray-500 hover:text-gray-700"
                    aria-label={`Delete ${row.Client_Name}`}
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <p>
          Showing {(currentPage - 1) * entriesPerPage + 1} to{' '}
          {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries}{' '}
          entries
        </p>
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              className={`px-4 py-2 border rounded-lg ${
                currentPage === i + 1 ? 'bg-blue-800 text-white' : ''
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {contextTargetRow && (
        <div
          className="absolute bg-white border rounded-lg shadow-lg z-50"
          style={{ left: contextTargetRow.x, top: contextTargetRow.y }}
        >
          <button
            onClick={deleteRow}
            className="w-full text-left p-2 hover:bg-gray-200"
          >
            Delete This Row
          </button>
        </div>
      )}
    </div>
  );
};

export default HomePage; */


import { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const HomePage = () => {
  const [clients, setClients] = useState([]);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientsRes, paymentsRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/get-clients`, { withCredentials: true }),
          axios.get(`${BASE_URL}/api/get-payments`, { withCredentials: true }),
        ]);
        setClients(clientsRes.data);
        setPayments(paymentsRes.data);
      } catch (error) {
        console.error('Fetch error:', error);
        setError('Error fetching data. Please try again.');
      }
    };
    fetchData();
  }, []);

  return (
    <div className="p-6">
      {error && <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-lg">{error}</div>}
      <h2 className="text-2xl font-bold mb-4">Clients</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead className="bg-gray-100 sticky top-16">
            <tr>
              <th className="p-2 border">Client Name</th>
              <th className="p-2 border">Email</th>
              <th className="p-2 border">Type</th>
              <th className="p-2 border">Monthly Payment</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client, index) => (
              <tr key={index}>
                <td className="p-2 border">{client.Client_Name}</td>
                <td className="p-2 border">{client.Email}</td>
                <td className="p-2 border">{client.Type}</td>
                <td className="p-2 border">{client.monthly_payment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="text-2xl font-bold mb-4 mt-6">Payments</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead className="bg-gray-100 sticky top-16">
            <tr>
              <th className="p-2 border">Client Name</th>
              <th className="p-2 border">Type</th>
              <th className="p-2 border">Amount</th>
              <th className="p-2 border">Jan</th>
              <th className="p-2 border">Feb</th>
              <th className="p-2 border">Mar</th>
              <th className="p-2 border">Apr</th>
              <th className="p-2 border">May</th>
              <th className="p-2 border">Jun</th>
              <th className="p-2 border">Jul</th>
              <th className="p-2 border">Aug</th>
              <th className="p-2 border">Sep</th>
              <th className="p-2 border">Oct</th>
              <th className="p-2 border">Nov</th>
              <th className="p-2 border">Dec</th>
              <th className="p-2 border">Due</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment, index) => (
              <tr key={index}>
                <td className="p-2 border">{payment.Client_Name}</td>
                <td className="p-2 border">{payment.Type}</td>
                <td className="p-2 border">{payment.Amount_To_Be_Paid}</td>
                <td className="p-2 border">{payment.january}</td>
                <td className="p-2 border">{payment.february}</td>
                <td className="p-2 border">{payment.march}</td>
                <td className="p-2 border">{payment.april}</td>
                <td className="p-2 border">{payment.may}</td>
                <td className="p-2 border">{payment.june}</td>
                <td className="p-2 border">{payment.july}</td>
                <td className="p-2 border">{payment.august}</td>
                <td className="p-2 border">{payment.september}</td>
                <td className="p-2 border">{payment.october}</td>
                <td className="p-2 border">{payment.november}</td>
                <td className="p-2 border">{payment.december}</td>
                <td className="p-2 border">{payment.Due_Payment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HomePage;
