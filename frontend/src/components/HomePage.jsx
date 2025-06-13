
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';
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
  isImporting, // Add isImporting to the destructured props
  sessionToken,
  currentYear,
  setCurrentYear,
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

  const [availableYears, setAvailableYears] = useState([currentYear]);
  const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

  

useEffect(() => {
  const fetchYears = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/get-user-years`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      console.log('Fetched user-specific years:', response.data);
      const filteredYears = (response.data || [])
        .filter(year => parseInt(year) >= 2025)
        .sort((a, b) => parseInt(a) - parseInt(b));
      
      // Always ensure 2025 is included and set as available years
      const yearsToSet = [...new Set(['2025', ...filteredYears])].sort((a, b) => parseInt(a) - parseInt(b));
      setAvailableYears(yearsToSet);
      
      // Get stored year from localStorage for reload persistence
      const storedYear = localStorage.getItem('currentYear');
      
      // Use stored year if valid and exists in available years, otherwise default to 2025
      const defaultYear = (storedYear && yearsToSet.includes(storedYear)) ? storedYear : '2025';
      
      setCurrentYear(defaultYear);
      localStorage.setItem('currentYear', defaultYear);
      handleYearChange(defaultYear); // Fetch payments for the selected year
    } catch (error) {
      console.error('Error fetching user years:', error);
      setAvailableYears(['2025']);
      setCurrentYear('2025');
      localStorage.setItem('currentYear', '2025');
      handleYearChange('2025');
    }
  };
  if (sessionToken) fetchYears();
}, [sessionToken]);

const handleAddNewYear = async () => {
  const newYear = (parseInt(currentYear) + 1).toString();
  
  // Check if year already exists in dropdown
  if (availableYears.includes(newYear)) {
    alert(`Year ${newYear} already exists in your account.`);
    return;
  }
  
  console.log(`Attempting to add new year: ${newYear}`);
  try {
    const response = await axios.post(
      `${BASE_URL}/add-new-year`,
      { year: newYear },
      { headers: { Authorization: `Bearer ${sessionToken}` } }
    );
    console.log('Add new year response:', response.data);
    
    // Add year to dropdown and switch to it
    setAvailableYears(prev => {
      const updatedYears = [...new Set([...prev, newYear])].sort((a, b) => parseInt(a) - parseInt(b));
      return updatedYears;
    });
    setCurrentYear(newYear);
    setPaymentsData([]);
    console.log(`New year ${newYear} added with empty table`);
    alert(`New year ${newYear} created successfully.`);
  } catch (error) {
    console.error('Error adding new year:', error);
    alert(`Failed to add new year: ${error.response?.data?.error || 'Unknown error occurred'}`);
  }
};
const handleYearChange = async (year) => {
  setCurrentYear(year);
  console.log(`Fetching payments for year: ${year}`);
  try {
    const response = await axios.get(`${BASE_URL}/get-payments-by-year`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      params: { year },
    });
    console.log(`Payments for ${year}:`, response.data); // Debug
    setPaymentsData(response.data || []);
  } catch (error) {
    console.error(`Error fetching payments for year ${year}:`, error.response?.data || error.message);
    setPaymentsData([]); // Set empty table on error
    alert(`Failed to fetch payments for ${year}: ${error.response?.data?.error || 'Unknown error'}`);
  }
};
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

  const getInputBackgroundColor = (row, month) => {
    const status = getPaymentStatusForMonth(row, month);
    if (status === 'Unpaid') return 'bg-red-100/60';
    if (status === 'PartiallyPaid') return 'bg-yellow-100/60';
    if (status === 'Paid') return 'bg-green-100/60';
    return 'bg-white'; // Default for empty or invalid
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
        (statusFilter === "Paid" &&
          getPaymentStatusForMonth(row, monthFilter.toLowerCase()) ===
            "Paid") ||
        (statusFilter === "PartiallyPaid" &&
          getPaymentStatusForMonth(row, monthFilter.toLowerCase()) ===
            "PartiallyPaid") ||
        (statusFilter === "Unpaid" &&
          getPaymentStatusForMonth(row, monthFilter.toLowerCase()) ===
            "Unpaid");

    return matchesSearch && matchesMonth && matchesStatus;
  });

  const renderDashboard = () => (
    <>
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-3 sm:space-y-0">
  <div className="flex flex-col sm:flex-row space-x-0 sm:space-x-3 space-y-3 sm:space-y-0 w-full sm:w-auto">
    <button
      onClick={() => setPage("addClient")}
      className="bg-blue-500 text-white px-3 py-1.5 rounded-md hover:bg-blue-600 transition duration-200 flex items-center w-full sm:w-auto"
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
      disabled={isImporting}
    />
    <label
      htmlFor="csv-import"
      className={`px-4 py-2 rounded-lg text-white flex items-center w-full sm:w-auto ${
        isImporting
          ? "bg-gray-400 cursor-not-allowed"
          : "bg-green-600 hover:bg-green-700 cursor-pointer"
      } transition duration-200`}
    >
      <i className="fas fa-upload mr-2"></i>
      {isImporting ? "Importing..." : "Bulk Import(in CSV format)"}
    </label>
    <button
      onClick={handleAddNewYear}
      className="bg-purple-500 text-white px-3 py-1.5 rounded-md hover:bg-purple-600 transition duration-200 flex items-center w-full sm:w-auto"
    >
      <i className="fas fa-calendar-plus mr-2"></i> Add New Year
    </button>
  </div>
  <select
    value={currentYear}
    onChange={(e) => handleYearChange(e.target.value)}
    className="p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-full sm:w-auto text-sm sm:text-base"
  >
    {availableYears.map((year) => (
      <option key={year} value={year}>
        {year}
      </option>
    ))}
  </select>
</div>

      {/* Filters Section */}
      <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mb-6">
        <input
          type="text"
          placeholder="Search by client or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="p-2 border-gray-300 rounded-lg w-full sm:w-1/3 focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
        />
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-full sm:w-auto text-sm sm:text-base"
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
          className="p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-full sm:w-auto text-sm sm:text-base"
          disabled={!monthFilter}
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
            <tr className="bg-blue-100">
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
                <td
                  colSpan={15}
                  className="border p-3 text-center text-gray-500"
                >
                  No payments found.
                </td>
              </tr>
            ) : (
              filteredData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  onContextMenu={(e) => handleContextMenu(e, rowIndex)}
                  className="hover:bg-blue-50"
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
                        value={row[month] || ""}
                        onChange={(e) =>
                          updatePayment(rowIndex, month, e.target.value, currentYear)
                        }
                        className={`w-20 p-1 border-gray-300 rounded text-right focus:ring-2 focus:ring-blue-500 text-sm sm:text-base ${getInputBackgroundColor(row, month)}`}
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
    console.log('Payments data in HomePage:', paymentsData);
    return acc;
  }, {});

    return (
    <>
      <h2 className="text-2xl font-semibold mb-2">Monthly Client Status Report ({currentYear})</h2>
      <div className="flex mb-4">
        <select
          value={currentYear}
          onChange={(e) => handleYearChange(e.target.value)}
          className="p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-full sm:w-auto text-sm sm:text-base"
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
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