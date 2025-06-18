import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import axios from "axios";

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";

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
  isImporting,
  sessionToken,
  currentYear,
  setCurrentYear,
  handleYearChange,
  onMount,
}) => {
  // Prevent infinite re-renders by using useCallback for onMount
  const stableOnMount = useCallback(() => {
    if (onMount && typeof onMount === 'function') {
      onMount();
    }
  }, [onMount]);

  // Only call onMount once when component first mounts
  useEffect(() => {
    stableOnMount();
  }, [stableOnMount]);

  const months = useMemo(() => [
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
  ], []);

  const [availableYears, setAvailableYears] = useState(["2025"]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isLoadingYears, setIsLoadingYears] = useState(false);

  const [localInputValues, setLocalInputValues] = useState({});
const [pendingUpdates, setPendingUpdates] = useState({});
const debounceTimersRef = useRef({});
// Add this state for batching
const [batchUpdateQueue, setBatchUpdateQueue] = useState({});
const batchTimerRef = useRef(null);

const isUpdatingRef = useRef(false);
const [currentPage, setCurrentPage] = useState(1);

  

  // Sync selectedYear with currentYear for Reports view
  useEffect(() => {
    if (isReportsPage && currentYear !== selectedYear) {
      console.log("HomePage.jsx: Syncing selectedYear to currentYear:", currentYear, "for Reports");
      setSelectedYear(currentYear);
    }
  }, [currentYear, isReportsPage, selectedYear]);

  // Log payments data updates (with debouncing to prevent spam)
  useEffect(() => {
    if (paymentsData?.length) {
      const timeoutId = setTimeout(() => {
        console.log(
          "HomePage.jsx: Payments data updated:",
          paymentsData.length,
          "items for year",
          isReportsPage ? selectedYear : currentYear,
          "on",
          isReportsPage ? "Reports" : "Dashboard"
        );
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [paymentsData?.length, currentYear, selectedYear, isReportsPage]);

  const mountedRef = useRef(true);

useEffect(() => {
  mountedRef.current = true;
  return () => {
    mountedRef.current = false;
  };
}, []);

useEffect(() => {
  const initialValues = {};
  paymentsData.forEach((row, rowIndex) => {
    months.forEach(month => {
      const key = `${rowIndex}-${month}`;
      initialValues[key] = row[month] || "";
    });
  });
  setLocalInputValues(initialValues);
}, [paymentsData, months]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryWithBackoff = async (fn, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429 && i < retries - 1) {
        console.log(`HomePage.jsx: Rate limit hit, retrying in ${delay}ms...`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
};

useEffect(() => {
  return () => {
    // Clear debounce timers
    Object.values(debounceTimersRef.current).forEach(timer => {
      if (timer) clearTimeout(timer);
    });
    
    // Clear batch timer
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
    }
    
    // Cancel pending requests
    Object.values(cancelTokensRef.current).forEach(cancelToken => {
      if (cancelToken) cancelToken.cancel('Component unmounting');
    });
  };
}, []);

const yearsFetchedRef = useRef(false);

const searchUserYears = useCallback(async (cancelToken) => {
  if (!sessionToken || yearsFetchedRef.current) {
    console.log("HomePage.jsx: No sessionToken or already loading years");
    return;
  }

  yearsFetchedRef.current = true;
  setIsLoadingYears(true);
  console.log("HomePage.jsx: Fetching user-specific years from API");

  try {
    const response = await axios.get(`${BASE_URL}/get-user-years`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      timeout: 10000,
      cancelToken,
    });

    console.log("HomePage.jsx: API response for user years:", response.data);

    const fetchedYears = (response.data || [])
      .filter((year) => parseInt(year) >= 2025)
      .sort((a, b) => parseInt(a) - parseInt(b));

    const yearsToSet = fetchedYears.length > 0 ? fetchedYears : ["2025"];
    console.log("HomePage.jsx: Setting availableYears to:", yearsToSet);

    if (mountedRef.current) {
      setAvailableYears(yearsToSet);
      localStorage.setItem("availableYears", JSON.stringify(yearsToSet));

      const storedYear = localStorage.getItem("currentYear");
      let yearToSet;

      if (storedYear && yearsToSet.includes(storedYear)) {
        yearToSet = storedYear;
      } else {
        yearToSet = yearsToSet[yearsToSet.length - 1] || "2025";
      }

      if (yearToSet !== currentYear) {
        console.log("HomePage.jsx: Setting currentYear to:", yearToSet);
        setCurrentYear(yearToSet);
        localStorage.setItem("currentYear", yearToSet);

        if (typeof handleYearChange === "function") {
          console.log("HomePage.jsx: Calling handleYearChange with:", yearToSet);
          await handleYearChange(yearToSet);
        }
      }
    }
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log("HomePage.jsx: Fetch years request cancelled");
      return;
    }
    console.error("HomePage.jsx: Error fetching user years:", error);

    const cachedYears = localStorage.getItem("availableYears");
    const fallbackYears = cachedYears ? JSON.parse(cachedYears) : ["2025"];
    console.log("HomePage.jsx: Using fallback years:", fallbackYears);

    if (mountedRef.current) {
      setAvailableYears(fallbackYears);

      const storedYear = localStorage.getItem("currentYear");
      const yearToSet = storedYear && fallbackYears.includes(storedYear) ? storedYear : "2025";

      if (yearToSet !== currentYear) {
        setCurrentYear(yearToSet);
        localStorage.setItem("currentYear", yearToSet);

        if (typeof handleYearChange === "function") {
          await handleYearChange(yearToSet);
        }
      }
    }
  } finally {
    if (mountedRef.current) {
      setIsLoadingYears(false);
    }
  }
}, [sessionToken, currentYear, handleYearChange, setCurrentYear]);

useEffect(() => {
  const controller = axios.CancelToken.source();

  if (sessionToken) {
    console.log("HomePage.jsx: SessionToken available, fetching years");
    searchUserYears(controller.token);
  }

  return () => {
    controller.cancel("Component unmounted or sessionToken changed");
  };
}, [sessionToken]);

  // Memoized function to handle adding new year
const handleAddNewYear = useCallback(async () => {
  const newYear = (parseInt(currentYear) + 1).toString();
  console.log(`HomePage.jsx: Attempting to add new year: ${newYear}`);

  if (mountedRef.current) {
    setIsLoadingYears(true);
  }

  const controller = axios.CancelToken.source();

  try {
    const response = await axios.post(
      `${BASE_URL}/add-new-year`,
      { year: newYear },
      {
        headers: { Authorization: `Bearer ${sessionToken}` },
        timeout: 10000,
        cancelToken: controller.token,
      }
    );
    console.log("HomePage.jsx: Add new year response:", response.data);

    await searchUserYears(controller.token);

    if (mountedRef.current) {
      setCurrentYear(newYear);
      localStorage.setItem("currentYear", newYear);

      if (typeof handleYearChange === "function") {
        await handleYearChange(newYear);
      }

      alert(response.data.message);
    }
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log("HomePage.jsx: Add new year request cancelled");
      return;
    }
    console.error("HomePage.jsx: Error adding new year:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    alert(
      `Failed to add new year: ${
        error.response?.data?.error || "An unknown error occurred. Please try again."
      }`
    );
  } finally {
    if (mountedRef.current) {
      setIsLoadingYears(false);
    }
  }
}, [currentYear, sessionToken, handleYearChange, searchUserYears]);

  const tableRef = useRef(null);

  // Move this outside the component or memoize it
const handleClickOutside = useCallback((e) => {
  if (tableRef.current && !tableRef.current.contains(e.target)) {
    hideContextMenu();
  }
}, [hideContextMenu]);

useEffect(() => {
  if (contextMenu) {
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }
}, [contextMenu, handleClickOutside]); // Only add/remove when contextMenu changes

  // Memoized helper functions
  const getPaymentStatusForMonth = useCallback((row, month) => {
    const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
    const paidInMonth = parseFloat(row[month]) || 0;
    if (paidInMonth === 0) return "Unpaid";
    if (paidInMonth >= amountToBePaid) return "Paid";
    return "PartiallyPaid";
  }, []);

  const getMonthlyStatus = useCallback((row, month) => {
    const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
    const paidInMonth = parseFloat(row[month]) || 0;
    if (paidInMonth === 0) return "Unpaid";
    if (paidInMonth >= amountToBePaid) return "Paid";
    return "PartiallyPaid";
  }, []);

const getInputBackgroundColor = useCallback((row, month, rowIndex) => {
  const key = `${rowIndex}-${month}`;
  const currentValue = localInputValues[key] !== undefined ? localInputValues[key] : (row[month] || "");
  const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
  const paidInMonth = parseFloat(currentValue) || 0;
  
  let status;
  if (paidInMonth === 0) status = "Unpaid";
  else if (paidInMonth >= amountToBePaid) status = "Paid";
  else status = "PartiallyPaid";
  
  // Add visual indicator for pending updates
  const isPending = pendingUpdates[key];
  const baseColor = status === "Unpaid" ? "bg-red-200/50" : 
                   status === "PartiallyPaid" ? "bg-yellow-200/50" : "bg-green-200/50";
  
  return isPending ? `${baseColor} ring-2 ring-blue-300` : baseColor;
}, [localInputValues, pendingUpdates]);

  // Memoized filtered data to prevent unnecessary re-calculations
  const filteredData = useMemo(() => {

    if (!paymentsData?.length) return [];
    return paymentsData.filter((row) => {
      const matchesSearch =
        !searchQuery ||
        row.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.Type?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesMonth =
        !monthFilter ||
        (row[monthFilter.toLowerCase()] !== undefined &&
          row[monthFilter.toLowerCase()] !== null);

      const matchesStatus = !monthFilter
        ? true
        : !statusFilter ||
          (statusFilter === "Paid" &&
            getPaymentStatusForMonth(row, monthFilter.toLowerCase()) === "Paid") ||
          (statusFilter === "PartiallyPaid" &&
            getPaymentStatusForMonth(row, monthFilter.toLowerCase()) === "PartiallyPaid") ||
          (statusFilter === "Unpaid" &&
            getPaymentStatusForMonth(row, monthFilter.toLowerCase()) === "Unpaid");

      return matchesSearch && matchesMonth && matchesStatus;
    });
  }, [paymentsData, searchQuery, monthFilter, statusFilter]);

  // Memoized year change handler
  const handleYearChangeDebounced = useCallback((year) => {
  console.log("HomePage.jsx: Year change requested to:", year);
  
  setCurrentYear(year);
  localStorage.setItem("currentYear", year);
  
  if (typeof handleYearChange === "function") {
    handleYearChange(year);
  } else {
    console.warn("HomePage.jsx: handleYearChange is not a function");
  }
}, [handleYearChange, setCurrentYear]);

//helper function
const processBatch = useCallback(async (queueData) => {
  const updates = Object.entries(queueData);
  
  try {
    if (updates.length > 1) {
      // Batch update for multiple changes
      console.log(`Processing batch update for ${updates.length} items`);
      await updateMultiplePayments(queueData);
    } else {
      // Single update
      const [, updateValue] = updates[0];
      await updatePayment(
        updateValue.rowIndex,
        updateValue.month,
        updateValue.newValue,
        updateValue.year
      );
    }
    
    // Clear successful updates from pending state
    setPendingUpdates(prev => {
      const newState = { ...prev };
      Object.keys(queueData).forEach(k => {
        delete newState[k];
      });
      return newState;
    });
    
  } catch (error) {
    console.error('Batch update failed:', error);
    
    // Revert failed updates in local state
    setLocalInputValues(prev => {
      const reverted = { ...prev };
      Object.entries(queueData).forEach(([k, update]) => {
        const originalValue = paymentsData[update.rowIndex]?.[update.month] || "";
        reverted[k] = originalValue;
      });
      return reverted;
    });
    
    // Clear pending states
    setPendingUpdates(prev => {
      const newState = { ...prev };
      Object.keys(queueData).forEach(k => {
        delete newState[k];
      });
      return newState;
    });
  }
}, [updatePayment, updateMultiplePayments, paymentsData]);

const cancelTokensRef = useRef({});


const debouncedUpdate = useCallback((rowIndex, month, value, year) => {
  const key = `${rowIndex}-${month}`;
  
  // Set pending state immediately
  setPendingUpdates(prev => ({
    ...prev,
    [key]: true
  }));
  
  // Add to batch queue using functional update to avoid stale closure
  setBatchUpdateQueue(prev => ({
    ...prev,
    [key]: {
      rowIndex,
      month,
      newValue: value,
      year,
      timestamp: Date.now()
    }
  }));
  
  // Clear existing batch timer
  if (batchTimerRef.current) {
    clearTimeout(batchTimerRef.current);
  }
  
  // Set new batch timer
  batchTimerRef.current = setTimeout(() => {
    // Use functional update to get current queue state
    setBatchUpdateQueue(currentQueue => {
      const queueEntries = Object.entries(currentQueue);
      
      if (queueEntries.length === 0) return {};
      
      // Process the batch
      processBatch(currentQueue);
      
      // Clear the queue
      return {};
    });
  }, 1000); // 1 second batch window
  
}, [updatePayment]); // Remove batchUpdateQueue from dependencies


// // Modify your debouncedUpdate to use batching
// const batchedUpdate = useCallback((updates) => {
//   // Clear existing batch timer
//   if (batchTimerRef.current) {
//     clearTimeout(batchTimerRef.current);
//   }

//   batchTimerRef.current = setTimeout(async () => {
//     if (Object.keys(updates).length > 1) {
//       // Send all updates in a single API call
//       await updateMultiplePayments(updates); // You'd need to create this API endpoint
//     } else {
//       // Single update as before
//       const [key, value] = Object.entries(updates)[0];
//       const [rowIndex, month] = key.split('-');
//       await updatePayment(parseInt(rowIndex), month, value.newValue, value.year);
//     }
//   }, 1000);
// }, [updatePayment]);
// Handle input changes
const handleInputChange = useCallback((rowIndex, month, value) => {
  const key = `${rowIndex}-${month}`;
  
  // Update local state immediately for responsive UI
  setLocalInputValues(prev => ({
    ...prev,
    [key]: value
  }));

  // Trigger debounced API update
  debouncedUpdate(rowIndex, month, value, currentYear);
}, [debouncedUpdate, currentYear]);

const apiCacheRef = useRef({});

const cachedApiCall = useCallback(async (key, apiFunction) => {
  if (apiCacheRef.current[key]) {
    return apiCacheRef.current[key];
  }
  
  const result = await apiFunction();
  apiCacheRef.current[key] = result;
  
  // Clear cache after 5 minutes
  setTimeout(() => {
    delete apiCacheRef.current[key];
  }, 5 * 60 * 1000);
  
  return result;
}, []);

const updateMultiplePayments = useCallback(async (updates) => {
  try {
    const response = await axios.post(
      `${BASE_URL}/update-multiple-payments`,
      { updates },
      {
        headers: { Authorization: `Bearer ${sessionToken}` },
        timeout: 15000,
      }
    );
    return response.data;
  } catch (error) {
    console.error('Batch update failed:', error);
    throw error;
  }
}, [sessionToken]);


  const renderDashboard = () => (
    <>
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
          onChange={(e) => {
            const year = e.target.value;
            console.log(
              "HomePage.jsx: Dashboard dropdown year changed to:",
              year
            );
            handleYearChangeDebounced(year);
          }}
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
              {filteredData.length === 0 ? (
                <tr>
                  <td
                    colSpan={15}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    No payments found.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, rowIndex) => (
                  <tr
                    key={`${row.Client_Name}-${rowIndex}`}
                    onContextMenu={(e) => handleContextMenu(e, rowIndex)}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.Client_Name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{row.Type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {parseFloat(row.Amount_To_Be_Paid || 0).toFixed(2)}
                    </td>
                    {months.map((month, colIndex) => (
                      <td
                        key={colIndex}
                        className="px-6 py-4 whitespace-nowrap text-right"
                      >
                        <input
                          type="text"
                          value={
                            localInputValues[`${rowIndex}-${month}`] !==
                            undefined
                              ? localInputValues[`${rowIndex}-${month}`]
                              : row[month] || ""
                          }
                          onChange={(e) =>
                            handleInputChange(rowIndex, month, e.target.value)
                          }
                          className={`w-20 p-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base ${getInputBackgroundColor(
                            row,
                            month,
                            rowIndex
                          )}`}
                          placeholder="0.00"
                          title={
                            pendingUpdates[`${rowIndex}-${month}`]
                              ? "Saving..."
                              : ""
                          }
                        />
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {parseFloat(row.Due_Payment || 0).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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

  const renderReports = () => {
  const monthStatus = useMemo(() => {
    return paymentsData.reduce((acc, row) => {
      if (!acc[row.Client_Name]) {
        acc[row.Client_Name] = {};
      }
      months.forEach((month) => {
        acc[row.Client_Name][month] = getMonthlyStatus(row, month);
      });
      return acc;
    }, {});
  }, [paymentsData, months, getMonthlyStatus]);

  const getStatusBackgroundColor = (status) => {
    if (status === "Unpaid") return "bg-red-200/50 text-red-800";
    if (status === "PartiallyPaid") return "bg-yellow-200/50 text-yellow-800";
    if (status === "Paid") return "bg-green-200/50 text-green-800";
    return "bg-gray-100 text-gray-800";
  };

  const entriesPerPage = 10;
  const totalEntries = Object.keys(monthStatus).length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  

  const paginatedClients = Object.keys(monthStatus).slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mb-6">
        <div className="relative flex-1 sm:w-1/3">
          <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="Search by client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base"
          />
        </div>
        <select
          value={selectedYear}
          onChange={(e) => {
            const year = e.target.value;
            console.log("HomePage.jsx: Reports dropdown year changed to:", year);
            setSelectedYear(year);
            if (typeof handleYearChange === "function") {
              handleYearChange(year);
            }
          }}
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
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
  <div className="max-h-96 overflow-y-auto">
    <table className="w-full">
      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
        <tr>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
            Client
          </th>
          {months.map((month, index) => (
            <th
              key={index}
              className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50"
            >
              {month.charAt(0).toUpperCase() + month.slice(1)} {selectedYear}
            </th>
          ))}
        </tr>
      </thead>
      {/* Rest of tbody remains the same */}
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    No data available.
                  </td>
                </tr>
              ) : (
                paginatedClients.map((client, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap flex items-center text-sm sm:text-base text-gray-900">
                      <i className="fas fa-user-circle mr-2 text-gray-400"></i>
                      {client}
                    </td>
                    {months.map((month, mIdx) => (
                      <td key={mIdx} className="px-6 py-4 whitespace-nowrap text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBackgroundColor(monthStatus[client][month] || "Unpaid")}`}
                        >
                          {monthStatus[client][month] || "Unpaid"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              )}
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
    </>
  );
};
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {isReportsPage ? renderReports() : renderDashboard()}
    </div>
  );
};

export default HomePage;