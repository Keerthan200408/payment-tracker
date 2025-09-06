import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import api from '../api';

const months = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const monthLabels = {
  january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr',
  may: 'May', june: 'Jun', july: 'Jul', august: 'Aug',
  september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec'
};

const ReportsPage = ({ setPage }) => {
  const { sessionToken } = useAuth();
  const { paymentsData, fetchPayments, handleApiError } = useData();
 
  // State management
  const [currentYear, setCurrentYear] = useState(() =>
    localStorage.getItem('currentYear') || new Date().getFullYear().toString()
  );
  const [availableYears, setAvailableYears] = useState([]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage, setEntriesPerPage] = useState(10);

  // Fetch available years
  const fetchUserYears = useCallback(async (forceRefresh = false) => {
    if (!sessionToken) return;
   
    setIsLoadingYears(true);
    try {
      const years = await api.payments.getUserYears(forceRefresh);
      setAvailableYears(years);
     
      // If current year is not in available years, set to the latest year
      if (!years.includes(parseInt(currentYear))) {
        const latestYear = Math.max(...years);
        setCurrentYear(latestYear.toString());
        localStorage.setItem('currentYear', latestYear.toString());
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsLoadingYears(false);
    }
  }, [sessionToken, currentYear, handleApiError]);

  // Fetch payments data
  const fetchPaymentsData = useCallback(async (forceRefresh = false) => {
    if (!sessionToken || !currentYear) return;
   
    try {
      await fetchPayments(currentYear, forceRefresh);
    } catch (error) {
      handleApiError(error);
    }
  }, [sessionToken, currentYear, fetchPayments, handleApiError]);

  // Load data on component mount
  useEffect(() => {
    fetchUserYears();
  }, [fetchUserYears]);

  useEffect(() => {
    fetchPaymentsData();
  }, [fetchPaymentsData]);

  // Calculate payment status for a client in a specific month
  const getPaymentStatus = useCallback((client, month) => {
    const amountToBePaid = parseFloat(client.Amount_To_Be_Paid) || 0;
    const paidAmount = parseFloat(client[month]) || 0;
   
    if (amountToBePaid <= 0) {
      return { status: 'No Payment Required', amount: 0, color: 'text-gray-500' };
    }
   
    if (paidAmount === 0) {
      return {
        status: 'Unpaid',
        amount: amountToBePaid,
        color: 'text-red-600'
      };
    }
   
    if (paidAmount >= amountToBePaid) {
      const overpaid = paidAmount - amountToBePaid;
      return {
        status: overpaid > 0 ? `Overpaid (+${overpaid.toLocaleString()})` : 'Paid',
        amount: overpaid,
        color: overpaid > 0 ? 'text-green-600' : 'text-blue-600'
      };
    } else {
      const remaining = amountToBePaid - paidAmount;
      return {
        status: `Underpaid (-${remaining.toLocaleString()})`,
        amount: remaining,
        color: 'text-orange-600'
      };
    }
  }, []);

  // Filter and process data
  const processedData = useMemo(() => {
    if (!paymentsData || !Array.isArray(paymentsData)) return [];
   
    return paymentsData.map(client => {
      const clientData = { ...client };
     
      // Add status for each month
      months.forEach(month => {
        clientData[`${month}_status`] = getPaymentStatus(client, month);
      });
     
      return clientData;
    });
  }, [paymentsData, getPaymentStatus]);

  // Filter data based on search and month selection
  const filteredData = useMemo(() => {
    let filtered = processedData;
   
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(client =>
        client.Client_Name?.toLowerCase().includes(query) ||
        client.Type?.toLowerCase().includes(query) ||
        client.Email?.toLowerCase().includes(query)
      );
    }
   
    // Filter by month selection
    if (selectedMonth !== 'all') {
      filtered = filtered.filter(client => {
        const status = client[`${selectedMonth}_status`];
        return status && status.status !== 'No Payment Required';
      });
    }
   
    return filtered;
  }, [processedData, searchQuery, selectedMonth]);

  // Pagination
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * entriesPerPage;
    return filteredData.slice(startIndex, startIndex + entriesPerPage);
  }, [filteredData, currentPage, entriesPerPage]);

  const totalEntries = filteredData.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedMonth, currentYear]);

  // Handle year change
  const handleYearChange = async (newYear) => {
    setCurrentYear(newYear);
    localStorage.setItem('currentYear', newYear);
    await fetchPaymentsData(true);
  };

  // Handle refresh
  const handleRefresh = async () => {
    await fetchUserYears(true);
    await fetchPaymentsData(true);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-gray-800">Reports</h1>
          <button
            onClick={handleRefresh}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200 flex items-center"
          >
            <i className="fas fa-sync-alt mr-2"></i>
            Refresh
          </button>
        </div>
       
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Year Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Year:</label>
            <select
              value={currentYear}
              onChange={(e) => handleYearChange(e.target.value)}
              disabled={isLoadingYears}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
         
          {/* Month Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Months</option>
              {months.map(month => (
                <option key={month} value={month}>
                  {monthLabels[month]}
                </option>
              ))}
            </select>
          </div>
         
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
       
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total Clients</div>
            <div className="text-2xl font-bold text-gray-800">{totalEntries}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Paid Clients</div>
            <div className="text-2xl font-bold text-green-600">
              {processedData.filter(client =>
                months.some(month => {
                  const status = client[`${month}_status`];
                  return status && (status.status === 'Paid' || status.status.includes('Overpaid'));
                })
              ).length}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Unpaid Clients</div>
            <div className="text-2xl font-bold text-red-600">
              {processedData.filter(client =>
                months.some(month => {
                  const status = client[`${month}_status`];
                  return status && status.status === 'Unpaid';
                })
              ).length}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Underpaid Clients</div>
            <div className="text-2xl font-bold text-orange-600">
              {processedData.filter(client =>
                months.some(month => {
                  const status = client[`${month}_status`];
                  return status && status.status.includes('Underpaid');
                })
              ).length}
            </div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount Due
                </th>
                {months.map(month => (
                  <th key={month} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {monthLabels[month]}
                  </th>
                ))}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.map((client, index) => (
                <tr key={`${client.Client_Name}_${client.Type}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {client.Client_Name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                      {client.Type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      ₹{parseFloat(client.Amount_To_Be_Paid || 0).toLocaleString()}
                    </div>
                  </td>
                  {months.map(month => {
                    const status = client[`${month}_status`];
                    return (
                      <td key={month} className="px-3 py-4 whitespace-nowrap text-center">
                        <div className={`text-xs font-medium ${status?.color || 'text-gray-500'}`}>
                          {status?.status || 'N/A'}
                        </div>
                        {status?.amount > 0 && (
                          <div className="text-xs text-gray-500">
                            ₹{status.amount.toLocaleString()}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {client.Email && (
                        <div className="text-blue-600">{client.Email}</div>
                      )}
                      {client.Phone_Number && (
                        <div className="text-gray-600">{client.Phone_Number}</div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
       
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{(currentPage - 1) * entriesPerPage + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * entriesPerPage, totalEntries)}
                  </span>{' '}
                  of <span className="font-medium">{totalEntries}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <i className="fas fa-chevron-left"></i>
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <i className="fas fa-chevron-right"></i>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
     
      {/* Navigation */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={() => setPage('dashboard')}
          className="bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition duration-200"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default ReportsPage;