import { useState, useEffect } from 'react';
import axios from 'axios';
const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

const PaymentsPage = ({ paymentsData, setPaymentsData, fetchClients, fetchPayments, sessionToken, isImporting, currentYear, setCurrentYear, handleYearChange }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 10;
  const totalEntries = paymentsData.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);

  const [availableYears, setAvailableYears] = useState(() => {
    const storedYears = localStorage.getItem('availableYears');
    console.log('PaymentsPage.jsx: Initializing availableYears from localStorage:', storedYears);
    return storedYears ? JSON.parse(storedYears) : ['2025'];
  });
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Sync selectedYear with currentYear on mount or when currentYear changes
  useEffect(() => {
    console.log('PaymentsPage.jsx: Syncing selectedYear to currentYear:', currentYear);
    setSelectedYear(currentYear);
  }, [currentYear]);

  // Function to search for user-specific years
  const searchUserYears = async (forceFetch = false) => {
    console.log('PaymentsPage.jsx: searchUserYears called with forceFetch:', forceFetch, 'sessionToken:', sessionToken);
    
    // Skip fetching if we have years in localStorage and not forcing a fetch
    if (!forceFetch && localStorage.getItem('availableYears')) {
      console.log('PaymentsPage.jsx: Using cached years from localStorage');
      const storedYears = JSON.parse(localStorage.getItem('availableYears')) || ['2025'];
      console.log('PaymentsPage.jsx: Stored years:', storedYears);
      setAvailableYears(storedYears);
      const storedYear = localStorage.getItem('currentYear') || '2025';
      console.log('PaymentsPage.jsx: Stored currentYear:', storedYear);
      if (storedYears.includes(storedYear) && storedYear !== currentYear) {
        console.log('PaymentsPage.jsx: Setting currentYear from storedYear:', storedYear);
        setCurrentYear(storedYear);
        if (typeof handleYearChange === 'function') {
          console.log('PaymentsPage.jsx: Calling handleYearChange with:', storedYear);
          handleYearChange(storedYear);
        }
      }
      return;
    }

    console.log('PaymentsPage.jsx: Fetching years from API with sessionToken:', sessionToken);
    try {
      const response = await axios.get(`${BASE_URL}/get-user-years`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      console.log('PaymentsPage.jsx: API response for user years:', response.data);
      
      const fetchedYears = (response.data || [])
        .filter(year => parseInt(year) >= 2025)
        .sort((a, b) => parseInt(a) - parseInt(b));
      
      // Always include 2025
      const yearsToSet = [...new Set(['2025', ...fetchedYears])]
        .filter(year => parseInt(year) >= 2025)
        .sort((a, b) => parseInt(a) - parseInt(b));
      
      console.log('PaymentsPage.jsx: Processed years for dropdown:', yearsToSet);
      setAvailableYears(yearsToSet);
      console.log('PaymentsPage.jsx: Saving availableYears to localStorage:', yearsToSet);
      localStorage.setItem('availableYears', JSON.stringify(yearsToSet));
      
      // Get stored year or default to 2025
      const storedYear = localStorage.getItem('currentYear');
      let yearToSet = storedYear && yearsToSet.includes(storedYear) ? storedYear : '2025';
      console.log('PaymentsPage.jsx: Selected year to set:', yearToSet);
      
      if (yearToSet !== currentYear) {
        console.log('PaymentsPage.jsx: Updating currentYear to:', yearToSet);
        setCurrentYear(yearToSet);
        localStorage.setItem('currentYear', yearToSet);
        if (typeof handleYearChange === 'function') {
          console.log('PaymentsPage.jsx: Calling handleYearChange with:', yearToSet);
          await handleYearChange(yearToSet);
        }
      }
    } catch (error) {
      console.error('PaymentsPage.jsx: Error searching user years:', error, 'Response:', error.response?.data);
      
      const storedYears = JSON.parse(localStorage.getItem('availableYears')) || ['2025'];
      console.log('PaymentsPage.jsx: Falling back to stored years:', storedYears);
      setAvailableYears(storedYears);
      
      const storedYear = localStorage.getItem('currentYear');
      const yearToSet = (storedYear && storedYears.includes(storedYear)) ? storedYear : '2025';
      console.log('PaymentsPage.jsx: Fallback year to set:', yearToSet);
      
      if (yearToSet !== currentYear) {
        console.log('PaymentsPage.jsx: Updating currentYear in fallback to:', yearToSet);
        setCurrentYear(yearToSet);
        localStorage.setItem('currentYear', yearToSet);
        if (typeof handleYearChange === 'function') {
          console.log('PaymentsPage.jsx: Calling handleYearChange in fallback with:', yearToSet);
          await handleYearChange(yearToSet);
        }
      }
    }
  };

  useEffect(() => {
    console.log('PaymentsPage.jsx: useEffect for sessionToken triggered. sessionToken:', sessionToken);
    if (sessionToken) {
      const storedToken = localStorage.getItem('sessionToken');
      console.log('PaymentsPage.jsx: Stored sessionToken:', storedToken);
      const isNewSession = sessionToken !== storedToken;
      console.log('PaymentsPage.jsx: Is new session?', isNewSession);
      searchUserYears(isNewSession);
    } else {
      console.log('PaymentsPage.jsx: No sessionToken, skipping searchUserYears');
    }
  }, [sessionToken]);

  useEffect(() => {
    const serializedYears = JSON.stringify(availableYears);
    const storedYears = localStorage.getItem('availableYears');
    if (serializedYears !== storedYears) {
      console.log('PaymentsPage.jsx: Saving availableYears to localStorage:', availableYears);
      localStorage.setItem('availableYears', serializedYears);
    }
  }, [availableYears]);

  useEffect(() => {
    if (paymentsData?.length) {
      console.log('PaymentsPage.jsx: Payments data updated:', paymentsData.length, 'items for year', selectedYear);
    }
  }, [paymentsData, selectedYear]);

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

  const paginatedData = paymentsData.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Payments</h1>
      <div className="max-h-[60vh] overflow-y-auto w-full rounded-lg shadow bg-white">
        <div className="mb-4">
          <select
            value={selectedYear}
            onChange={(e) => {
              const year = e.target.value;
              console.log('PaymentsPage.jsx: Dropdown year changed to:', year);
              setSelectedYear(year);
              handleYearChange(year);
            }}
            className="p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-full sm:w-auto text-sm sm:text-base"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <table className="min-w-[1200px] w-full">
          <thead>
            <tr className="bg-blue-100 text-left">
              <th className="p-2 text-center border-gray-200">Client</th>
              <th className="p-2 text-center border-gray-200">Type</th>
              <th className="p-2 text-center border-gray-200">Amount To Be Paid</th>
              {months.map((month) => (
                <th key={month} className="p-2 text-center border-gray-200">
                  {month.charAt(0).toUpperCase() + month.slice(1)}
                </th>
              ))}
              <th className="p-2 text-center border-gray-200">Total Due</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((payment, index) => (
              <tr key={index} className="border-t border-gray-200">
                <td className="p-2 flex items-center text-sm sm:text-base">
                  <i className="fas fa-user-circle mr-2"></i>
                  {payment.Client_Name}
                </td>
                <td className="p-2 text-center text-sm sm:text-base">{payment.Type || 'N/A'}</td>
                <td className="p-2 text-center text-sm sm:text-base">₹{payment.Amount_To_Be_Paid}</td>
                {months.map((month) => (
                  <td key={month} className="p-2 text-center text-sm sm:text-base">
                    {payment[month] || '—'}
                  </td>
                ))}
                <td className="p-2 text-center text-sm sm:text-base">₹{payment.Due_Payment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center mt-4 space-y-3 sm:space-y-0">
        <p className="text-sm sm:text-base">
          Showing {(currentPage - 1) * entriesPerPage + 1} to{' '}
          {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries}{' '}
          entries
        </p>
        <div className="flex flex-wrap justify-center sm:justify-end space-x-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 border rounded-md disabled:opacity-50 text-sm sm:text-base"
          >
            Previous
          </button>
          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              className={`px-3 py-1.5 border rounded-md text-sm sm:text-base ${
                currentPage === i + 1 ? 'bg-blue-500 text-white' : ''
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 border rounded-md disabled:opacity-50 text-sm sm:text-base"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentsPage;