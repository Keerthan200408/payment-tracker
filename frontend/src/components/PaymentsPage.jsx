import { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

const PaymentsPage = ({ paymentsData, setPaymentsData, fetchClients, fetchPayments, sessionToken, isImporting, currentYear, setCurrentYear, handleYearChange }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 10;
  const totalEntries = paymentsData ? paymentsData.length : 0;
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
        await handleYearChange(storedYear);
      }
    }
    return;
  }

  console.log('PaymentsPage.jsx: Fetching years from API with sessionToken:', sessionToken);
  try {
    const response = await axios.get(`${BASE_URL}/get-user-years`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      timeout: 10000, // Add timeout
    });
    console.log('PaymentsPage.jsx: API response for user years:', response.data);
    
    const fetchedYears = (response.data || [])
      .filter(year => parseInt(year) >= 2025)
      .sort((a, b) => parseInt(a) - parseInt(b));
    
    const yearsToSet = [...new Set(['2025', ...fetchedYears])]
      .filter(year => parseInt(year) >= 2025)
      .sort((a, b) => parseInt(a) - parseInt(b));
    
    console.log('PaymentsPage.jsx: Processed years for dropdown:', yearsToSet);
    setAvailableYears(yearsToSet);
    console.log('PaymentsPage.jsx: Saving availableYears to localStorage:', yearsToSet);
    localStorage.setItem('availableYears', JSON.stringify(yearsToSet));
    
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
    let userMessage = 'Failed to fetch available years. Defaulting to 2025.';
    if (error.response?.data?.error?.includes('Sheet not found')) {
      userMessage = 'No payment data found for your account. Defaulting to 2025.';
    } else if (error.response?.data?.error?.includes('Quota exceeded')) {
      userMessage = 'Server is busy. Please try again later.';
    }
    console.log('PaymentsPage.jsx: Setting error message:', userMessage);
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

  // Check if paymentsData is defined
  if (!paymentsData) {
    console.error('PaymentsPage.jsx: paymentsData is undefined or null');
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <h2 className="text-xl font-medium text-gray-700 mb-4">Payments</h2>
        <div className="text-red-600">Error: No payment data available.</div>
      </div>
    );
  }

  const paginatedData = paymentsData.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h2 className="text-xl font-medium text-gray-700 mb-4">Payments</h2>
      <div className="mb-6">
        <select
          value={selectedYear}
          onChange={(e) => {
            const year = e.target.value;
            console.log('PaymentsPage.jsx: Dropdown year changed to:', year);
            setSelectedYear(year);
            handleYearChange(year);
          }}
          className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount To Be Paid
                </th>
                {months.map((month) => (
                  <th
                    key={month}
                    className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
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
              {paginatedData.map((payment, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm sm:text-base text-gray-900">
                    <i className="fas fa-user-circle mr-2 text-gray-400"></i>
                    {payment.Client_Name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm sm:text-base text-gray-900">
                    {payment.Type || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm sm:text-base text-gray-900">
                    ₹{payment.Amount_To_Be_Paid}
                  </td>
                  {months.map((month) => (
                    <td
                      key={month}
                      className="px-6 py-4 whitespace-nowrap text-right text-sm sm:text-base text-gray-900"
                    >
                      {payment[month] || '—'}
                    </td>
                  ))}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm sm:text-base text-gray-900">
                    ₹{payment.Due_Payment}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row justify-between items-center mt-6 space-y-3 sm:space-y-0">
  <p className="text-sm sm:text-base text-gray-700">
    Showing {(currentPage - 1) * entriesPerPage + 1} to{' '}
    {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries}{' '}
    entries
  </p>
  <div className="flex flex-wrap justify-center gap-2 max-w-md">
    <button
      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
      disabled={currentPage === 1}
      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 text-sm sm:text-base disabled:opacity-50 hover:bg-gray-50 transition duration-200"
    >
      Previous
    </button>
    {totalPages <= 5 ? (
      [...Array(totalPages)].map((_, i) => (
        <button
          key={i}
          onClick={() => setCurrentPage(i + 1)}
          className={`px-4 py-2 border border-gray-300 rounded-md text-sm sm:text-base ${
            currentPage === i + 1 ? 'bg-gray-800 text-white' : 'text-gray-700 hover:bg-gray-50'
          } transition duration-200`}
        >
          {i + 1}
        </button>
      ))
    ) : (
      <>
        {currentPage > 3 && (
          <>
            <button
              onClick={() => setCurrentPage(1)}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 text-sm sm:text-base hover:bg-gray-50 transition duration-200"
            >
              1
            </button>
            {currentPage > 4 && (
              <span className="px-4 py-2 text-gray-700">...</span>
            )}
          </>
        )}
        {[...Array(5)].map((_, i) => {
          const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
          if (pageNum <= totalPages && pageNum > 0) {
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`px-4 py-2 border border-gray-300 rounded-md text-sm sm:text-base ${
                  currentPage === pageNum ? 'bg-gray-800 text-white' : 'text-gray-700 hover:bg-gray-50'
                } transition duration-200`}
              >
                {pageNum}
              </button>
            );
          }
          return null;
        })}
        {currentPage < totalPages - 2 && (
          <>
            {currentPage < totalPages - 3 && (
              <span className="px-4 py-2 text-gray-700">...</span>
            )}
            <button
              onClick={() => setCurrentPage(totalPages)}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 text-sm sm:text-base hover:bg-gray-50 transition duration-200"
            >
              {totalPages}
            </button>
          </>
        )}
      </>
    )}
    <button
      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
      disabled={currentPage === totalPages}
      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 text-sm sm:text-base disabled:opacity-50 hover:bg-gray-50 transition duration-200"
    >
      Next
    </button>
  </div>
</div>
    </div>
  );
};

export default PaymentsPage;