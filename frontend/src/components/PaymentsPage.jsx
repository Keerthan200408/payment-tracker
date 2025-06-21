import React, { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { debounce } from "lodash";

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";
const CACHE_DURATION = 5 * 60 * 1000;

const PaymentsPage = ({
  paymentsData = [],
  setPaymentsData = () => {},
  searchQuery = "",
  setSearchQuery = () => {},
  monthFilter = "",
  setMonthFilter = () => {},
  statusFilter = "",
  setStatusFilter = () => {},
  updatePayment = () => {},
  handleContextMenu = () => {},
  contextMenu = null,
  hideContextMenu = () => {},
  deleteRow = () => {},
  setPage = () => {},
  sessionToken = "",
  currentYear = "2025",
  setCurrentYear = () => {},
  setErrorMessage = () => {},
  apiCacheRef = { current: {} },
  currentUser = null,
  onMount = () => {},
  fetchPayments = () => {}, // New prop for fetching payments
}) => {
  // State and Refs
  const [availableYears, setAvailableYears] = useState(["2025"]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const tableRef = useRef(null);
  const mountedRef = useRef(true);
  const activeRequestsRef = useRef(new Set());

  const MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const months = MONTHS;

  // Utility functions
  const getCacheKey = useCallback((url, params = {}) => {
    return `${url}_${JSON.stringify(params)}`;
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
      timestamp: Date.now(),
    };
  }, []);

  const createDedupedRequest = useCallback(
    async (requestKey, requestFn) => {
      if (activeRequestsRef.current.has(requestKey)) {
        while (activeRequestsRef.current.has(requestKey)) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return getCachedData(requestKey);
      }
      activeRequestsRef.current.add(requestKey);
      try {
        const result = await requestFn();
        setCachedData(requestKey, result);
        return result;
      } finally {
        activeRequestsRef.current.delete(requestKey);
      }
    },
    [getCachedData, setCachedData]
  );

  // Fetch available years
  const searchUserYears = useCallback(
    async (abortSignal) => {
      if (!sessionToken) {
        console.log("PaymentsPage.jsx: No sessionToken");
        return;
      }
      if (!isOnline) {
        console.log("PaymentsPage.jsx: Offline, using cached years if available");
        const cacheKey = getCacheKey("/get-user-years", { sessionToken });
        const cachedYears = getCachedData(cacheKey);
        if (cachedYears) {
          setAvailableYears(cachedYears);
        } else {
          setErrorMessage("Offline and no cached years available. Showing default year.");
          setAvailableYears(["2025"]);
        }
        return;
      }
      const cacheKey = getCacheKey("/get-user-years", { sessionToken });
      const cachedYears = getCachedData(cacheKey);
      if (cachedYears) {
        console.log("PaymentsPage.jsx: Using cached years data");
        setAvailableYears(cachedYears);
        return;
      }
      const requestKey = `years_${sessionToken}`;
      return createDedupedRequest(requestKey, async () => {
        setIsLoadingYears(true);
        console.log("PaymentsPage.jsx: Fetching user-specific years from API");
        try {
          const response = await axios.get(`${BASE_URL}/get-user-years`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
            timeout: 10000,
            signal: abortSignal,
          });
          const years = Array.isArray(response.data) ? response.data : ["2025"];
          setAvailableYears(years);
          setCachedData(cacheKey, years);
          console.log("PaymentsPage.jsx: Fetched years:", years);
        } catch (error) {
          if (error.name === "AbortError") {
            console.log("PaymentsPage.jsx: Year fetch aborted");
            return;
          }
          console.error("PaymentsPage.jsx: Error fetching user years:", {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
          });
          setErrorMessage("Failed to fetch available years. Showing default year.");
          setAvailableYears(["2025"]);
        } finally {
          if (mountedRef.current) {
            setIsLoadingYears(false);
          }
        }
      });
    },
    [sessionToken, isOnline, getCacheKey, getCachedData, setCachedData, createDedupedRequest, setErrorMessage]
  );

  const debouncedSearchUserYears = useCallback(
    debounce((signal) => searchUserYears(signal), 300),
    [searchUserYears]
  );

  // Fetch payments for the selected year
  const fetchPaymentsForYear = useCallback(
    async (year, abortSignal) => {
      if (!sessionToken) {
        console.log("PaymentsPage.jsx: No sessionToken for fetching payments");
        return;
      }
      if (!isOnline) {
        console.log("PaymentsPage.jsx: Offline, using cached payments if available");
        const cacheKey = getCacheKey("/get-payments", { sessionToken, year });
        const cachedPayments = getCachedData(cacheKey);
        if (cachedPayments) {
          setPaymentsData(cachedPayments);
        } else {
          setErrorMessage("Offline and no cached payments available.");
        }
        return;
      }
      const cacheKey = getCacheKey("/get-payments", { sessionToken, year });
      const cachedPayments = getCachedData(cacheKey);
      if (cachedPayments) {
        console.log("PaymentsPage.jsx: Using cached payments data for year", year);
        setPaymentsData(cachedPayments);
        return;
      }
      const requestKey = `payments_${sessionToken}_${year}`;
      return createDedupedRequest(requestKey, async () => {
        setIsLoadingPayments(true);
        console.log("PaymentsPage.jsx: Fetching payments for year", year);
        try {
          const response = await axios.get(`${BASE_URL}/get-payments`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
            params: { year },
            timeout: 10000,
            signal: abortSignal,
          });
          const payments = Array.isArray(response.data) ? response.data : [];
          setPaymentsData(payments);
          setCachedData(cacheKey, payments);
          console.log("PaymentsPage.jsx: Fetched payments for", year, ":", payments.length);
        } catch (error) {
          if (error.name === "AbortError") {
            console.log("PaymentsPage.jsx: Payments fetch aborted");
            return;
          }
          console.error("PaymentsPage.jsx: Error fetching payments:", {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
          });
          setErrorMessage("Failed to fetch payments for the selected year.");
          setPaymentsData([]);
        } finally {
          if (mountedRef.current) {
            setIsLoadingPayments(false);
          }
        }
      });
    },
    [sessionToken, isOnline, getCacheKey, getCachedData, setCachedData, createDedupedRequest, setPaymentsData, setErrorMessage]
  );

  // Handle year change
  const handleYearChangeDebounced = useCallback(
    debounce((year) => {
      console.log("PaymentsPage.jsx: Year change requested to:", year);
      localStorage.setItem("currentYear", year);
      setCurrentYear(year);
      const controller = new AbortController();
      fetchPaymentsForYear(year, controller.signal);
      return () => controller.abort();
    }, 300),
    [setCurrentYear, fetchPaymentsForYear]
  );

  // Initialize and cleanup
  useEffect(() => {
    onMount();
    const controller = new AbortController();
    if (sessionToken) {
      console.log("PaymentsPage.jsx: SessionToken available, fetching years");
      debouncedSearchUserYears(controller.signal);
      fetchPaymentsForYear(currentYear, controller.signal);
    }
    return () => {
      controller.abort();
      debouncedSearchUserYears.cancel();
      mountedRef.current = false;
      activeRequestsRef.current.clear();
    };
  }, [sessionToken, currentYear, debouncedSearchUserYears, fetchPaymentsForYear, onMount]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        hideContextMenu();
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [hideContextMenu]);

  // Render
  const renderPayments = () => (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div className="flex gap-3 mb-4 sm:mb-0">
          {/* No Add New Year button */}
        </div>
        <select
          value={currentYear}
          onChange={(e) => handleYearChangeDebounced(e.target.value)}
          className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
          disabled={isLoadingYears || isLoadingPayments}
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

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
          {months.map((month, index) => (
            <option key={index} value={month}>
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

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          {isLoadingPayments ? (
            <div className="p-4 text-center text-gray-500">
              Loading payments...
            </div>
          ) : (
            <table className="w-full" ref={tableRef}>
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    Client Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    Type
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    Amount To Be Paid
                  </th>
                  {months.map((month, index) => (
                    <th
                      key={index}
                      className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50"
                    >
                      {month.charAt(0).toUpperCase() + month.slice(1)}
                    </th>
                  ))}
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    Due Payment
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paymentsData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={15}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      No payments found.
                    </td>
                  </tr>
                ) : (
                  paymentsData.map((row, rowIndex) => (
                    <tr
                      key={`${row?.Client_Name || "unknown"}-${rowIndex}`}
                      onContextMenu={(e) => handleContextMenu(e, rowIndex)}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        {row?.Client_Name || "N/A"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {row?.Type || "N/A"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {parseFloat(row?.Amount_To_Be_Paid || 0).toFixed(2)}
                      </td>
                      {months.map((month, colIndex) => (
                        <td
                          key={colIndex}
                          className="px-6 py-4 whitespace-nowrap text-right"
                        >
                          {parseFloat(row?.[month] || 0).toFixed(2)}
                        </td>
                      ))}
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {parseFloat(row?.Due_Payment || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="absolute bg-white border border-gray-300 rounded-lg shadow-sm p-2 z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={deleteRow}
            className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex items-center"
          >
            <i className="fas fa-trash mr-2"></i> Delete
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {!isOnline && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <div className="ml-3">
              <p className="text-sm">
                You're currently offline. Changes will be saved when connection is restored.
              </p>
            </div>
          </div>
        </div>
      )}
      {renderPayments()}
    </div>
  );
};

export default PaymentsPage;