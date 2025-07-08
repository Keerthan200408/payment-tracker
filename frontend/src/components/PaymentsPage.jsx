import { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

const PaymentsPage = ({
  paymentsData,
  setPaymentsData,
  fetchClients,
  fetchPayments,
  sessionToken,
  isImporting,
  currentYear,
  setCurrentYear,
  handleYearChange,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 10;
  const totalEntries = paymentsData ? paymentsData.length : 0;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);

  const [availableYears, setAvailableYears] = useState(() => {
    const storedYears = localStorage.getItem('availableYears');
    return storedYears ? JSON.parse(storedYears) : ['2025'];
  });
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [error, setError] = useState(null);

  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];

  // Sync currentYear and selectedYear
  useEffect(() => {
    setSelectedYear(currentYear);
    if (sessionToken && currentYear) {
      const fetchData = async () => {
        try {
          await fetchPayments(sessionToken, currentYear);
          setError(null);
        } catch (err) {
          console.error('PaymentsPage.jsx: Error fetching payments:', err);
          setError('Failed to load payments. Please try again.');
        }
      };
      fetchData();
    }
  }, [currentYear, sessionToken, fetchPayments]);

  const searchUserYears = async (forceFetch = false) => {
    if (!forceFetch && localStorage.getItem('availableYears')) {
      setAvailableYears(JSON.parse(localStorage.getItem('availableYears')));
      return;
    }

    try {
      const response = await axios.get(`${BASE_URL}/get-user-years`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        timeout: 10000,
      });

      const fetchedYears = (response.data || [])
        .filter(year => parseInt(year) >= 2025)
        .sort((a, b) => parseInt(a) - parseInt(b));

      const yearsToSet = [...new Set(['2025', ...fetchedYears])]
        .filter(year => parseInt(year) >= 2025)
        .sort((a, b) => parseInt(a) - parseInt(b));

      setAvailableYears(yearsToSet);
      localStorage.setItem('availableYears', JSON.stringify(yearsToSet));
      setError(null);
    } catch (error) {
      console.error('PaymentsPage.jsx: Error fetching user years:', error);
      setAvailableYears(['2025']);
      localStorage.setItem('availableYears', JSON.stringify(['2025']));
      setError('Failed to fetch available years. Defaulting to 2025.');
    }
  };

  useEffect(() => {
    if (sessionToken) {
      searchUserYears();
    }
  }, [sessionToken]);

  useEffect(() => {
    localStorage.setItem('availableYears', JSON.stringify(availableYears));
  }, [availableYears]);

  const handleYearSelection = async (year) => {
    console.log('PaymentsPage.jsx: handleYearSelection called with year:', year);
    setSelectedYear(year);
    setCurrentYear(year);
    localStorage.setItem('currentYear', year);
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
        setError('Failed to load payments for the selected year. Please try again.');
      }
    }
  };

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
          onChange={(e) => handleYearSelection(e.target.value)}
          className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Amount To Be Paid</th>
                {months.map((month) => (
                  <th key={month} className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">
                    {month.charAt(0).toUpperCase() + month.slice(1)}
                  </th>
                ))}
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Total Due</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-6 py-12 text-center text-gray-500">No payments found.</td>
                </tr>
              ) : (
                paginatedData.map((payment, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <i className="fas fa-user-circle mr-2 text-gray-400"></i>
                      {payment.Client_Name}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900">{payment.Type || 'N/A'}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900">₹{payment.Amount_To_Be_Paid}</td>
                    {months.map((month) => (
                      <td key={month} className="px-6 py-4 text-right text-sm text-gray-900">
                        {payment[month] || '—'}
                      </td>
                    ))}
                    <td className="px-6 py-4 text-right text-sm text-gray-900">₹{payment.Due_Payment}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {paginatedData.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-6 space-y-3 sm:space-y-0">
          <p className="text-sm text-gray-700">
            Showing {(currentPage - 1) * entriesPerPage + 1} to {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries} entries
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              Previous
            </button>
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`px-4 py-2 border border-gray-300 rounded-md text-sm ${
                  currentPage === i + 1 ? 'bg-gray-800 text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
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