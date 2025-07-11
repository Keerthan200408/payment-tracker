import { useState, useEffect } from 'react';
import { yearsAPI, handleAPIError } from '../utils/api';

// PaymentsPage component displays payment data in a paginated table with a year dropdown
const PaymentsPage = ({
  paymentsData, // Array of payment objects
  setPaymentsData, // Function to update paymentsData
  fetchClients, // Function to fetch clients (unused here but passed from parent)
  fetchPayments, // Function to fetch payments for a year
  sessionToken, // Authentication token
  isImporting, // Boolean indicating if data is being imported
  currentYear, // Current selected year
  setCurrentYear, // Function to update currentYear
  handleYearChange, // Debounced function to handle year changes (from HomePage.jsx)
}) => {
  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 10;
  const totalEntries = paymentsData ? paymentsData.length : 0;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);

  // State for years dropdown
  const [availableYears, setAvailableYears] = useState(() => {
    const storedYears = localStorage.getItem('availableYears');
    console.log('PaymentsPage.jsx: Initializing availableYears from localStorage:', storedYears);
    return storedYears ? JSON.parse(storedYears) : ['2025'];
  });
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [error, setError] = useState(null); // Error message for UI
  const [isLoading, setIsLoading] = useState(false); // Loading state for payments/years

  // Define months for table columns
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];

  // Sync selectedYear with currentYear and fetch payments
  useEffect(() => {
    console.log('PaymentsPage.jsx: Syncing selectedYear to currentYear:', currentYear);
    setSelectedYear(currentYear);
    if (sessionToken && currentYear) {
      setIsLoading(true);
      console.log('PaymentsPage.jsx: Fetching payments for year:', currentYear);
      fetchPayments(sessionToken, currentYear)
        .then(() => setError(null))
        .catch((err) => {
          console.error('PaymentsPage.jsx: Error fetching payments:', err);
          setError('Failed to load payments. Please try again.');
        })
        .finally(() => setIsLoading(false));
    }
  }, [currentYear, sessionToken, fetchPayments]);

  // Fetch available years from API or localStorage
  const searchUserYears = async (forceFetch = true) => {
    console.log('PaymentsPage.jsx: searchUserYears called with forceFetch:', forceFetch, 'sessionToken:', sessionToken);
    
    // Clear stale localStorage to prevent duplicates
    if (forceFetch) {
      console.log('PaymentsPage.jsx: Clearing stale availableYears from localStorage');
      localStorage.removeItem('availableYears');
    }

    // Use cached years if available and not forcing a fetch
    if (!forceFetch && localStorage.getItem('availableYears')) {
      console.log('PaymentsPage.jsx: Using cached years from localStorage');
      const storedYears = JSON.parse(localStorage.getItem('availableYears')) || ['2025'];
      setAvailableYears(storedYears.map(String)); // Ensure string type
      return;
    }

    // Fetch years from API
    setIsLoading(true);
    console.log('PaymentsPage.jsx: Fetching years from API');
    try {
      const response = await yearsAPI.getUserYears();
      const fetchedYears = (response.data || [])
        .map(String) // Convert to strings to prevent duplicates
        .filter(year => parseInt(year) >= 2025)
        .sort((a, b) => parseInt(a) - parseInt(b));

      const yearsToSet = [...new Set(['2025', ...fetchedYears])]; // Ensure unique years
      console.log('PaymentsPage.jsx: Setting availableYears:', yearsToSet);
      setAvailableYears(yearsToSet);
      localStorage.setItem('availableYears', JSON.stringify(yearsToSet));
      setError(null);
    } catch (error) {
      console.error('PaymentsPage.jsx: Error fetching years:', error);
      setAvailableYears(['2025']);
      localStorage.setItem('availableYears', JSON.stringify(['2025']));
      setError('Failed to fetch available years. Defaulting to 2025.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch years when sessionToken changes
  useEffect(() => {
    if (sessionToken) {
      console.log('PaymentsPage.jsx: Fetching years on sessionToken change');
      searchUserYears(true); // Force API fetch to get 2025-2029
    }
  }, [sessionToken]);

  // Update localStorage when availableYears changes
  useEffect(() => {
    localStorage.setItem('availableYears', JSON.stringify(availableYears));
  }, [availableYears]);

  // Log payments data updates
  useEffect(() => {
    if (paymentsData?.length) {
      console.log('PaymentsPage.jsx: Payments data updated:', paymentsData.length, 'items for year', selectedYear);
    }
  }, [paymentsData, selectedYear]);

  // Handle year selection from dropdown
  const handleYearSelection = async (year) => {
    console.log('PaymentsPage.jsx: handleYearSelection called with year:', year);
    setSelectedYear(year);
    setCurrentYear(year);
    localStorage.setItem('currentYear', year);
    setIsLoading(true);
    if (typeof handleYearChange === 'function') {
      console.log('PaymentsPage.jsx: Calling handleYearChange with:', year);
      await handleYearChange(year);
    }
    if (sessionToken) {
      console.log('PaymentsPage.jsx: Fetching payments for year:', year);
      try {
        await fetchPayments(sessionToken, year);
        setError(null);
      } catch (err) {
        console.error('PaymentsPage.jsx: Error fetching payments for year:', year, err);
        setError('Failed to load payments for the selected year.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Validate paymentsData to prevent ReferenceError
  if (!paymentsData) {
    console.error('PaymentsPage.jsx: paymentsData is undefined or null');
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <h2 className="text-xl font-medium text-gray-700 mb-4">Payments</h2>
        <div className="text-red-600">Error: No payment data available.</div>
      </div>
    );
  }

  // Paginate data
  const paginatedData = paymentsData.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h2 className="text-xl font-medium text-gray-700 mb-4">Payments</h2>

      {/* Year selection dropdown */}
      <div className="mb-6">
        <select
          value={selectedYear}
          onChange={(e) => handleYearSelection(e.target.value)}
          disabled={isLoading}
          className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base disabled:opacity-50"
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* Display error message */}
      {error && (
        <div className="mb-4 text-red-600 text-sm">{error}</div>
      )}

      {/* Display loading state */}
      {isLoading && (
        <div className="mb-4 text-gray-600 text-sm">Loading payments...</div>
      )}

      {/* Payments table */}
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
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-6 py-12 text-center text-gray-500">
                    No payments found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((payment, index) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination controls */}
      {paginatedData.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-6 space-y-3 sm:space-y-0">
          <p className="text-sm sm:text-base text-gray-700">
            Showing {(currentPage - 1) * entriesPerPage + 1} to{' '}
            {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries} entries
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
      )}
    </div>
  );
};

export default PaymentsPage;