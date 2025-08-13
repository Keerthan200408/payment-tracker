import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { debounce } from 'lodash';
import RemarkPopup from './RemarkPopup';

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";
const CACHE_DURATION = 5 * 60 * 1000;

// Conditional logging for production
const log = process.env.NODE_ENV !== 'production' ? console.log : () => {};

const HomePage = ({
  paymentsData = [],
  setPaymentsData = () => {},
  searchQuery = "",
  setSearchQuery = () => {},
  monthFilter = "",
  setMonthFilter = () => {},
  statusFilter = "",
  setStatusFilter = () => {},
  sessionToken = "",
  currentYear = "2025",
  setCurrentYear = () => {},
  setPage = () => {},
  importCsv = () => {},
  isImporting = false,
  isReportsPage = false,
  currentUser = null,
  setErrorMessage = () => {},
  apiCacheRef = { current: {} },
  fetchTypes = () => {},
  handleYearChange = () => {}
}) => {
  // State management with enhanced functionality
  const [localInputValues, setLocalInputValues] = useState({});
  const [pendingUpdates, setPendingUpdates] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [availableYears, setAvailableYears] = useState(["2025"]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [errorMessage, setLocalErrorMessage] = useState("");
  const [remarkPopup, setRemarkPopup] = useState({
    isOpen: false,
    clientName: '',
    type: '',
    month: '',
    currentRemark: 'N/A'
  });

  // Refs
  const csvFileInputRef = useRef(null);
  const mountedRef = useRef(true);

  // Utility functions
  const getCacheKey = useCallback((endpoint, params) => {
    return `${endpoint}_${JSON.stringify(params)}`;
  }, []);

  const getCachedData = useCallback((key) => {
    const cached = apiCacheRef.current[key];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedData = useCallback((key, data) => {
    apiCacheRef.current[key] = {
      data,
      timestamp: Date.now()
    };
  }, []);

  // Search user years functionality
  const searchUserYears = useCallback(
    async (abortSignal) => {
      if (!sessionToken) {
        log("HomePage.jsx: No sessionToken");
        return;
      }

      const cacheKey = getCacheKey("/get-user-years", { sessionToken });
      const cachedYears = getCachedData(cacheKey);
      if (cachedYears) {
        log("HomePage.jsx: Using cached years data");
        setAvailableYears(cachedYears);
        return;
      }

      setIsLoadingYears(true);
      log("HomePage.jsx: Fetching user-specific years from API");

      try {
        const response = await axios.get(`${BASE_URL}/get-user-years`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
          timeout: 10000,
          signal: abortSignal,
        });

        const years = Array.isArray(response.data) ? response.data : ["2025"];
        setAvailableYears(years);
        setCachedData(cacheKey, years);
        log("HomePage.jsx: Fetched years:", years);
      } catch (error) {
        if (error.name === 'AbortError') {
          log('HomePage.jsx: Year fetch aborted');
          return;
        }
        log('HomePage.jsx: Error fetching user years:', error);
        const errorMsg = error.response?.data?.error || error.message;
        let userMessage = 'Failed to fetch available years. Defaulting to current year.';
        if (errorMsg.includes('Sheet not found')) {
          userMessage = 'No payment data found. Defaulting to current year.';
        } else if (errorMsg.includes('Quota exceeded')) {
          userMessage = 'Server is busy. Defaulting to current year.';
        }
        setLocalErrorMessage(userMessage);
        setAvailableYears([new Date().getFullYear().toString()]);
      } finally {
        if (mountedRef.current) {
          setIsLoadingYears(false);
        }
      }
    },
    [
      sessionToken,
      getCacheKey,
      getCachedData,
      setCachedData,
    ]
  );

  const debouncedSearchUserYears = useCallback(
    debounce((signal) => searchUserYears(signal), 300),
    [searchUserYears]
  );

  // Handle Add New Year
  const handleAddNewYear = useCallback(async () => {
    const newYear = (parseInt(currentYear) + 1).toString();
    log(`HomePage.jsx: Attempting to add new year: ${newYear}`);

    if (mountedRef.current) {
      setIsLoadingYears(true);
    }

    const controller = new AbortController();

    try {
      const response = await axios.post(
        `${BASE_URL}/add-new-year`,
        { year: newYear },
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
          timeout: 10000,
          signal: controller.signal,
        }
      );
      log("HomePage.jsx: Add new year response:", response.data);

      const yearsCacheKey = getCacheKey("/get-user-years", { sessionToken });
      const paymentsCacheKey = getCacheKey("/get-payments-by-year", { year: newYear, sessionToken });
      delete apiCacheRef.current[yearsCacheKey];
      delete apiCacheRef.current[paymentsCacheKey];

      await searchUserYears(controller.signal);

      const clientsResponse = await axios.get(`${BASE_URL}/get-clients`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        timeout: 10000,
        signal: controller.signal,
      });
      const expectedClientCount = clientsResponse.data.length;

      const paymentsResponse = await axios.get(`${BASE_URL}/get-payments-by-year`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        params: { year: newYear },
        timeout: 10000,
        signal: controller.signal,
      });

      const paymentsData = paymentsResponse.data || [];
      setPaymentsData(paymentsData);
      const correctedPaymentsData = paymentsData.map((row) => ({
        ...row,
        Due_Payment: "0.00"
      }));
      setPaymentsData(correctedPaymentsData);
      setCurrentYear(newYear);
      localStorage.setItem("currentYear", newYear);

      if (paymentsData.length === 0 && expectedClientCount > 0) {
        const errorMsg = `No clients found for ${newYear}. Please check the Clients sheet.`;
        setLocalErrorMessage(errorMsg);
        setErrorMessage(errorMsg);
        alert(errorMsg);
      } else if (paymentsData.length < expectedClientCount) {
        const errorMsg = `Warning: Only ${paymentsData.length} client(s) found for ${newYear}. Expected ${expectedClientCount} clients from the Clients sheet.`;
        setLocalErrorMessage(errorMsg);
        setErrorMessage(errorMsg);
        alert(errorMsg);
      } else {
        setLocalErrorMessage("");
        setErrorMessage("");
        alert(`Year ${newYear} added successfully with ${paymentsData.length} clients.`);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        log("HomePage.jsx: Add new year request cancelled");
        return;
      }
      log("HomePage.jsx: Error adding new year:", error);
      let errorMsg = error.response?.data?.error || "An unknown error occurred";
      let userMessage = `Failed to add new year: ${errorMsg}`;
      if (errorMsg.includes("Please add or import payment data")) {
        userMessage = "Please add or import payment data for the current year before adding a new year.";
      } else if (errorMsg.includes("Sheet already exists")) {
        userMessage = "This year already exists for your account.";
      } else if (errorMsg.includes("No clients found")) {
        userMessage = "No clients found in the Clients sheet. Please add clients before creating a new year.";
      }
      setLocalErrorMessage(userMessage);
      setErrorMessage(userMessage);
      alert(userMessage);
    } finally {
      if (mountedRef.current) {
        setIsLoadingYears(false);
      }
    }
  }, [currentYear, sessionToken, getCacheKey, searchUserYears, setPaymentsData, setCurrentYear, setErrorMessage]);

  // Handle year change
  const handleYearChangeDebounced = useCallback(
    debounce((year) => {
      if (handleYearChange) {
        handleYearChange(year);
      }
    }, 300),
    [handleYearChange]
  );

  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];

  // Simplified payment status calculation
  const getPaymentStatus = useCallback((row, month) => {
    const globalRowIndex = paymentsData.findIndex(
      (r) => r.Client_Name === row.Client_Name && r.Type === row.Type
    );

    const rawValue = localInputValues[`${globalRowIndex}-${month}`];
    const paid = parseFloat(rawValue !== undefined ? rawValue : row?.[month] ?? 0) || 0;
    const due = parseFloat(row?.Amount_To_Be_Paid) || 0;

    if (due <= 0) return "Unpaid";
    if (paid >= due) return "Paid";
    if (paid > 0 && paid < due) return "PartiallyPaid";
    return "Unpaid";
  }, [localInputValues, paymentsData]);

  // Simplified input background color
  const getInputBackgroundColor = useCallback((row, month, rowIndex) => {
    const key = `${rowIndex}-${month}`;
    const currentValue = localInputValues[key] !== undefined ? localInputValues[key] : row?.[month] || "";
    const amountToBePaid = parseFloat(row?.Amount_To_Be_Paid || 0);
    const paidInMonth = parseFloat(currentValue) || 0;

    let status;
    if (paidInMonth === 0) status = "Unpaid";
    else if (paidInMonth >= amountToBePaid) status = "Paid";
    else status = "PartiallyPaid";

    const isPending = pendingUpdates[key];
    const baseColor = status === "Unpaid" ? "bg-red-200/50" : status === "PartiallyPaid" ? "bg-yellow-200/50" : "bg-green-200/50";

    return isPending ? `${baseColor} ring-2 ring-blue-300` : baseColor;
  }, [localInputValues, pendingUpdates]);

  // Simplified filtered data
  const filteredData = useMemo(() => {
    return (paymentsData || []).filter((row) => {
      const matchesSearch = !searchQuery ||
        row?.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row?.Type?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSearch;
    });
  }, [paymentsData, searchQuery]);

  // Simplified input change handler
  const handleInputChange = useCallback(async (rowIndex, month, value) => {
    const trimmedValue = value.trim();
    const key = `${rowIndex}-${month}`;

    // Update local input values immediately
    setLocalInputValues(prev => ({ ...prev, [key]: trimmedValue }));
    
    // Mark as pending
    setPendingUpdates(prev => ({ ...prev, [key]: true }));

    try {
      // Save to backend
      const response = await axios.post(
        `${BASE_URL}/save-payment`,
        {
          clientName: paymentsData[rowIndex].Client_Name,
          type: paymentsData[rowIndex].Type,
          month,
          value: trimmedValue // Send empty string as-is for de-entering values
        },
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
          params: { year: currentYear }
        }
      );

      // Update the payments data with the response
      if (response.data.updatedRow) {
        setPaymentsData(prev => {
          const newData = [...prev];
          newData[rowIndex] = {
            ...newData[rowIndex],
            [month]: trimmedValue,
            Due_Payment: response.data.updatedRow.Due_Payment
          };
          return newData;
        });
      }

      // Clear pending status
      setPendingUpdates(prev => {
        const newPending = { ...prev };
        delete newPending[key];
        return newPending;
      });

    } catch (error) {
      console.error('Failed to save payment:', error);
      setErrorMessage(error.response?.data?.error || 'Failed to save payment');
      
      // Clear pending status
      setPendingUpdates(prev => {
        const newPending = { ...prev };
        delete newPending[key];
        return newPending;
      });
    }
  }, [paymentsData, sessionToken, currentYear, setPaymentsData, setErrorMessage]);

  // Simplified remark save handler
  const handleRemarkSaved = useCallback((newRemark) => {
    console.log('Saving remark:', {
      clientName: remarkPopup.clientName,
      type: remarkPopup.type,
      month: remarkPopup.month,
      newRemark
    });

    // Update the payments data immediately with the new remark
    setPaymentsData(prev => {
      const newData = prev.map(row => {
        if (row.Client_Name === remarkPopup.clientName && row.Type === remarkPopup.type) {
          const monthKey = remarkPopup.month.charAt(0).toUpperCase() + remarkPopup.month.slice(1);
          console.log('Updating row with new remark:', {
            clientName: row.Client_Name,
            type: row.Type,
            monthKey,
            newRemark,
            currentRemarks: row.Remarks
          });
          
          return {
            ...row,
            Remarks: {
              ...row.Remarks,
              [monthKey]: newRemark
            }
          };
        }
        return row;
      });
      
      console.log('Updated payments data:', newData);
      return newData;
    });

    // Update the popup state
    setRemarkPopup(prev => ({
      ...prev,
      currentRemark: newRemark
    }));
  }, [remarkPopup, setPaymentsData]);

  // Initialize local input values when payments data changes
  useEffect(() => {
    const initialValues = {};
    paymentsData.forEach((row, rowIndex) => {
      months.forEach((month) => {
        const key = `${rowIndex}-${month}`;
        // Always update values when paymentsData changes (including year changes)
        initialValues[key] = row?.[month] || "";
      });
    });
    // Reset all local input values when payments data changes (year change)
    setLocalInputValues(initialValues);
    
    // Also clear any pending updates when data changes
    setPendingUpdates({});
  }, [paymentsData, months]);

  // Fetch years when sessionToken is available
  useEffect(() => {
    const controller = new AbortController();
    if (sessionToken) {
      log("HomePage.jsx: SessionToken available, fetching years");
      debouncedSearchUserYears(controller.signal);
    }
    return () => {
      controller.abort();
      debouncedSearchUserYears.cancel();
    };
  }, [sessionToken, debouncedSearchUserYears]);

  // Reset pagination when year or data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [currentYear, paymentsData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Error message component
  const ErrorMessageDisplay = ({ message, onDismiss, type = "error" }) => {
    if (!message) return null;

    const bgColor =
      type === "warning"
        ? "bg-yellow-50 border-yellow-200 text-yellow-800"
        : type === "success"
        ? "bg-green-50 border-green-200 text-green-800"
        : "bg-red-50 border-red-200 text-red-800";
    const icon =
      type === "warning"
        ? "fas fa-exclamation-triangle"
        : type === "success"
        ? "fas fa-check-circle"
        : "fas fa-exclamation-circle";

    return (
      <div className={`mb-4 p-4 rounded-lg border ${bgColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <i className={`${icon} mr-2`}></i>
            <span className="text-sm font-medium">{message}</span>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="ml-4 text-current hover:opacity-75 transition-opacity"
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
      </div>
    );
  };

  // Pagination
  const entriesPerPage = 10;
  const totalEntries = filteredData.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Error Message Display */}
      <ErrorMessageDisplay 
        message={errorMessage} 
        onDismiss={() => setLocalErrorMessage("")} 
      />
      
      {/* Top action buttons and year selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div className="flex gap-3 mb-4 sm:mb-0">
          <button
            onClick={() => setPage("addClient")}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
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
            className={`px-4 py-2 rounded-lg text-gray-700 bg-white border border-gray-300 flex items-center ${
              isImporting
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-gray-50 cursor-pointer"
            } transition duration-200`}
          >
            <i className="fas fa-upload mr-2"></i>
            {isImporting ? "Importing..." : "Bulk Import(in CSV format)"}
          </label>
          <button
            onClick={handleAddNewYear}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
            disabled={isLoadingYears}
          >
            <i className="fas fa-calendar-plus mr-2"></i>
            {isLoadingYears ? "Loading..." : "Add New Year"}
          </button>
        </div>
        <select
          value={currentYear}
          onChange={(e) => handleYearChangeDebounced(e.target.value)}
          className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
          disabled={isLoadingYears}
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mb-6">
        <div className="relative flex-1 sm:w-1/3">
          <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="Search by client or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base"
          />
        </div>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
        >
          <option value="">All Months</option>
          {months.map((month) => (
            <option key={month} value={month.toLowerCase()}>
              {month.charAt(0).toUpperCase() + month.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
          disabled={!monthFilter}
        >
          <option value="">Status</option>
          <option value="Paid">Paid</option>
          <option value="PartiallyPaid">Partially Paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>
      </div>

      {/* Main table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount To Be Paid
                </th>
                {months.map((month, index) => (
                  <th
                    key={index}
                    className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
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
                    <div className="flex flex-col items-center">
                      <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                      <p className="text-lg font-medium text-gray-600">
                        {searchQuery ? "No clients found matching your search." : "No payments found."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, localRowIndex) => {
                  const globalRowIndex = paymentsData.findIndex((r) => r.Client_Name === row.Client_Name);
                  return (
                    <tr key={`${row?.Client_Name || "unknown"}-${localRowIndex}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap flex items-center text-sm text-gray-900">
                        <i className="fas fa-user-circle mr-2 text-gray-400"></i>
                        {row?.Client_Name || "N/A"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                        {row?.Type || "N/A"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        ₹{(parseFloat(row?.Amount_To_Be_Paid) || 0).toLocaleString()}.00
                      </td>
                      {months.map((month, colIndex) => {
                        const monthKey = month.charAt(0).toUpperCase() + month.slice(1);
                        const currentRemark = row?.Remarks?.[monthKey] || "N/A";
                        const hasRemark = currentRemark !== "N/A" && currentRemark !== "";
                        
                        console.log(`Rendering cell for ${row.Client_Name} ${month}:`, {
                          monthKey,
                          currentRemark,
                          hasRemark,
                          remarks: row?.Remarks
                        });
                        
                        return (
                          <td key={colIndex} className="px-6 py-4 whitespace-nowrap text-center relative group">
                            <div className="relative">
                              <input
                                type="text"
                                value={
                                  localInputValues[`${globalRowIndex}-${month}`] !== undefined
                                    ? localInputValues[`${globalRowIndex}-${month}`]
                                    : row?.[month] || ""
                                }
                                onChange={(e) => handleInputChange(globalRowIndex, month, e.target.value)}
                                className={`w-20 p-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm ${getInputBackgroundColor(row, month, globalRowIndex)}`}
                                placeholder="0.00"
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRemarkPopup({
                                    isOpen: true,
                                    clientName: row?.Client_Name || '',
                                    type: row?.Type || '',
                                    month: month,
                                    currentRemark: currentRemark
                                  });
                                }}
                                className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all duration-200 ${
                                  hasRemark 
                                    ? 'bg-blue-500 text-white hover:bg-blue-600' 
                                    : 'bg-gray-300 text-gray-600 hover:bg-gray-400 opacity-0 group-hover:opacity-100'
                                }`}
                                title={hasRemark ? `Remark: ${currentRemark}` : 'Add remark'}
                              >
                                <i className={`fas ${hasRemark ? 'fa-comment' : 'fa-plus'}`}></i>
                              </button>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        ₹{(parseFloat(row?.Due_Payment) || 0).toLocaleString()}.00
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remark Popup */}
      <RemarkPopup
        isOpen={remarkPopup.isOpen}
        onClose={() => setRemarkPopup({ ...remarkPopup, isOpen: false })}
        clientName={remarkPopup.clientName}
        type={remarkPopup.type}
        month={remarkPopup.month}
        currentRemark={remarkPopup.currentRemark}
        year={currentYear}
        sessionToken={sessionToken}
        onRemarkSaved={handleRemarkSaved}
      />

      {/* Pagination */}
      {paginatedData.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <p className="text-sm text-gray-700">
            Showing {(currentPage - 1) * entriesPerPage + 1} to{" "}
            {Math.min(currentPage * entriesPerPage, totalEntries)} of{" "}
            {totalEntries} entries
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 disabled:opacity-50 hover:bg-gray-50"
            >
              Previous
            </button>
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`px-4 py-2 border border-gray-300 rounded-md ${
                  currentPage === i + 1 ? "bg-gray-800 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 disabled:opacity-50 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
