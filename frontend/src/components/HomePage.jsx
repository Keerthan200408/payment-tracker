import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import axios from "axios";
import { debounce } from "lodash";

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";
const BATCH_DELAY = 1000;
const BATCH_SIZE = 5;
const CACHE_DURATION = 5 * 60 * 1000;

const HomePage = ({
  paymentsData = [], // Default to empty array
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
  csvFileInputRef = { current: null },
  importCsv = () => {},
  isReportsPage = false,
  isImporting = false,
  sessionToken = "",
  currentYear = "2025",
  setCurrentYear = () => {},
  handleYearChange = () => {},
  setErrorMessage = () => {},
  apiCacheRef = useRef({}), // Default to new ref if not provided
  currentUser = null,
  onMount = () => {},
  fetchTypes = () => {},
}) => {
  // State and Refs
  const [availableYears, setAvailableYears] = useState(["2025"]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [localInputValues, setLocalInputValues] = useState({});
  const [pendingUpdates, setPendingUpdates] = useState({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isUpdating, setIsUpdating] = useState(false);
  const debounceTimersRef = useRef({});
  const updateQueueRef = useRef([]);
  const batchTimerRef = useRef(null);
  const activeRequestsRef = useRef(new Set());
  const tableRef = useRef(null);
  const [errorMessage, setLocalErrorMessage] = useState("");
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const mountedRef = useRef(true);

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

  // Remove useMemo and use MONTHS directly
  const months = MONTHS;

  // Replace both functions with a single one
  const getPaymentStatus = useCallback((row, month) => {
    const amountToBePaid = parseFloat(row?.Amount_To_Be_Paid || 0);
    const paidInMonth = parseFloat(row?.[month] || 0);
    if (paidInMonth === 0) return "Unpaid";
    if (paidInMonth >= amountToBePaid) return "Paid";
    return "PartiallyPaid";
  }, []);

  const getInputBackgroundColor = useCallback(
    (row, month, rowIndex) => {
      const key = `${rowIndex}-${month}`;
      const currentValue =
        localInputValues[key] !== undefined
          ? localInputValues[key]
          : row?.[month] || "";
      const amountToBePaid = parseFloat(row?.Amount_To_Be_Paid || 0);
      const paidInMonth = parseFloat(currentValue) || 0;

      let status;
      if (paidInMonth === 0) status = "Unpaid";
      else if (paidInMonth >= amountToBePaid) status = "Paid";
      else status = "PartiallyPaid";

      const isPending = pendingUpdates[key];
      const baseColor =
        status === "Unpaid"
          ? "bg-red-200/50"
          : status === "PartiallyPaid"
          ? "bg-yellow-200/50"
          : "bg-green-200/50";

      return isPending ? `${baseColor} ring-2 ring-blue-300` : baseColor;
    },
    [localInputValues, pendingUpdates]
  );

  // Update filteredData to use getPaymentStatus
  const filteredData = useMemo(() => {
    return (paymentsData || []).filter((row) => {
      const matchesSearch =
        !searchQuery ||
        row?.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row?.Type?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesMonth =
        !monthFilter ||
        (row?.[monthFilter.toLowerCase()] !== undefined &&
          row?.[monthFilter.toLowerCase()] !== null);

      const matchesStatus = !monthFilter
        ? true
        : !statusFilter ||
          (statusFilter === "Paid" &&
            getPaymentStatus(row, monthFilter.toLowerCase()) === "Paid") ||
          (statusFilter === "PartiallyPaid" &&
            getPaymentStatus(row, monthFilter.toLowerCase()) ===
              "PartiallyPaid") ||
          (statusFilter === "Unpaid" &&
            getPaymentStatus(row, monthFilter.toLowerCase()) === "Unpaid");

      return matchesSearch && matchesMonth && matchesStatus;
    });
  }, [paymentsData, searchQuery, monthFilter, statusFilter, getPaymentStatus]);

  // Utility functions
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const retryWithBackoff = async (fn, retries = 3, delay = 500) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (error.response?.status === 429 && i < retries - 1) {
          console.log(
            `HomePage.jsx: Rate limit hit, retrying in ${delay}ms...`
          );
          await sleep(delay);
          delay *= 2; // Exponential backoff
        } else {
          throw error;
        }
      }
    }
  };

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

  const searchUserYears = useCallback(
    async (abortSignal) => {
      if (!sessionToken) {
        console.log("HomePage.jsx: No sessionToken");
        return;
      }

      const cacheKey = getCacheKey("/get-user-years", { sessionToken });
      const cachedYears = getCachedData(cacheKey);
      if (cachedYears) {
        console.log("HomePage.jsx: Using cached years data");
        setAvailableYears(cachedYears);
        return;
      }

      const requestKey = `years_${sessionToken}`;
      return createDedupedRequest(requestKey, async () => {
        setIsLoadingYears(true);
        console.log("HomePage.jsx: Fetching user-specific years from API");

        try {
          const response = await axios.get(`${BASE_URL}/get-user-years`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
            timeout: 10000,
            signal: abortSignal,
          });

          const years = Array.isArray(response.data) ? response.data : ["2025"];
          setAvailableYears(years);
          setCachedData(cacheKey, years);
          console.log("HomePage.jsx: Fetched years:", years);
        } catch (error) {
          if (error.name === "AbortError") {
            console.log("HomePage.jsx: Year fetch aborted");
            return; // Ignore abort errors
          }
          console.error("HomePage.jsx: Error fetching user years:", error);
          setLocalErrorMessage(
            "Failed to fetch available years. Showing default year."
          );
          setAvailableYears(["2025"]);
        } finally {
          if (mountedRef.current) {
            setIsLoadingYears(false);
          }
        }
      });
    },
    [
      sessionToken,
      getCacheKey,
      getCachedData,
      setCachedData,
      createDedupedRequest,
    ]
  );

  // Debounced version of searchUserYears
  const debouncedSearchUserYears = useCallback(
    debounce((signal) => searchUserYears(signal), 300),
    [searchUserYears]
  );

  const handleAddNewYear = useCallback(async () => {
    const newYear = (parseInt(currentYear) + 1).toString();
    console.log(`HomePage.jsx: Attempting to add new year: ${newYear}`);

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
      console.log("HomePage.jsx: Add new year response:", response.data);

      alert(response.data.message);

      // ✅ Force reload with the new year set in localStorage
      localStorage.setItem("currentYear", newYear);
      window.location.reload(); // ✅ this reloads the page and pulls new data
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("HomePage.jsx: Add new year request cancelled");
        return;
      }
      console.error("HomePage.jsx: Error adding new year:", error);
      alert(
        `Failed to add new year: ${
          error.response?.data?.error || "An unknown error occurred"
        }`
      );
    } finally {
      if (mountedRef.current) {
        setIsLoadingYears(false);
      }
    }
  }, [currentYear, sessionToken]);

  const processBatchUpdates = useCallback(async () => {
    if (!updateQueueRef.current.length) {
      console.log("HomePage.jsx: No updates to process");
      batchTimerRef.current = null;
      return;
    }

    const updates = [...updateQueueRef.current];
    updateQueueRef.current = []; // Clear queue immediately
    batchTimerRef.current = null;
    console.log(
      `HomePage.jsx: Processing batch of ${updates.length} updates`,
      updates
    );
    setIsUpdating(true);

    const updatedLocalValues = { ...localInputValues };

    try {
      for (const update of updates) {
        const { rowIndex, month, value, year } = update;
        const rowData = paymentsData[rowIndex];
        if (!rowData) {
          console.warn(`HomePage.jsx: Invalid rowIndex ${rowIndex}`);
          continue;
        }
        if (typeof updatePayment !== "function") {
          console.error("HomePage.jsx: updatePayment is not a function");
          setLocalErrorMessage("Update failed: Invalid update function");
          updateQueueRef.current.push(update);
          continue;
        }
        try {
          await updatePayment(rowIndex, month, value, year);
          const key = `${rowIndex}-${month}`;
          updatedLocalValues[key] = value;
          setPendingUpdates((prev) => {
            const newPending = { ...prev };
            delete newPending[key];
            return newPending;
          });
        } catch (error) {
          console.error(
            `HomePage.jsx: Failed to update ${month} for row ${rowIndex}:`,
            error
          );
          setLocalErrorMessage(
            `Failed to update ${month} for ${rowData.Client_Name}: ${error.message}`
          );
          setErrorMessage(
            `Failed to update ${month} for ${rowData.Client_Name}: ${error.message}`
          );
          updateQueueRef.current.push(update);
        }
      }
      setLocalInputValues(updatedLocalValues);
      if (updateQueueRef.current.length > 0) {
        console.log("HomePage.jsx: Scheduling retry for failed updates");
        batchTimerRef.current = setTimeout(processBatchUpdates, BATCH_DELAY);
      }
    } catch (error) {
      console.error("HomePage.jsx: Batch update error:", error);
      setLocalErrorMessage(`Batch update failed: ${error.message}`);
      setErrorMessage(`Batch update failed: ${error.message}`);
      updateQueueRef.current = [...updates, ...updateQueueRef.current];
      batchTimerRef.current = setTimeout(processBatchUpdates, BATCH_DELAY * 2);
    } finally {
      setIsUpdating(false);
    }
  }, [updatePayment, paymentsData, localInputValues, setErrorMessage]);

  const debouncedUpdate = useCallback(
    (rowIndex, month, value, year) => {
      if (!paymentsData.length) {
        console.warn(
          "HomePage.jsx: Cannot queue update, paymentsData is empty"
        );
        alert("Please wait for data to load before making updates.");
        return;
      }
      if (!paymentsData[rowIndex]) {
        console.warn("HomePage.jsx: Invalid rowIndex:", rowIndex);
        return;
      }
      if (typeof updatePayment !== "function") {
        console.error("HomePage.jsx: updatePayment is not a function");
        alert("Update failed: Invalid update function");
        return;
      }
      const key = `${rowIndex}-${month}`;
      setLocalInputValues((prev) => ({
        ...prev,
        [key]: value,
      }));
      if (debounceTimersRef.current[key]) {
        clearTimeout(debounceTimersRef.current[key]);
      }
      setPendingUpdates((prev) => ({
        ...prev,
        [key]: true,
      }));
      debounceTimersRef.current[key] = setTimeout(() => {
        updateQueueRef.current = updateQueueRef.current.filter(
          (update) => !(update.rowIndex === rowIndex && update.month === month)
        );
        updateQueueRef.current.push({
          rowIndex,
          month,
          value,
          year,
          timestamp: Date.now(),
        });
        console.log("HomePage.jsx: Queued update:", {
          rowIndex,
          month,
          value,
          year,
        });
        if (!batchTimerRef.current) {
          batchTimerRef.current = setTimeout(processBatchUpdates, BATCH_DELAY);
        }
        delete debounceTimersRef.current[key];
      }, 1000);
    },
    [paymentsData, updatePayment]
  );

  const handleYearChangeDebounced = useCallback(
    (year) => {
      console.log("HomePage.jsx: Year change requested to:", year);
      localStorage.setItem("currentYear", year);
      setCurrentYear(year);
      window.location.reload(); // <-- force page reload after setting year
    },
    [setCurrentYear]
  );

  const handleInputChange = useCallback(
    (rowIndex, month, value) => {
      const parsedValue = value.trim() === "" ? "" : parseFloat(value);
      if (value !== "" && (isNaN(parsedValue) || parsedValue < 0)) {
        alert("Please enter a valid non-negative number.");
        return;
      }

      const key = `${rowIndex}-${month}`;
      setLocalInputValues((prev) => ({
        ...prev,
        [key]: value,
      }));
      debouncedUpdate(rowIndex, month, value, currentYear);
    },
    [debouncedUpdate, currentYear]
  );

  // Initialize component
  useEffect(() => {
    onMount();
  }, [onMount]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const initialValues = {};
    paymentsData.forEach((row, rowIndex) => {
      months.forEach((month) => {
        const key = `${rowIndex}-${month}`;
        // Only set the value if it hasn't been modified by the user
        if (localInputValues[key] === undefined) {
          initialValues[key] = row?.[month] || "";
        } else {
          initialValues[key] = localInputValues[key];
        }
      });
    });
    setLocalInputValues((prev) => ({ ...prev, ...initialValues }));
  }, [paymentsData, months]);

  useEffect(() => {
    if (paymentsData?.length) {
      const timeoutId = setTimeout(() => {
        console.log(
          "HomePage.jsx: Payments data updated:",
          paymentsData.length,
          "items for year",
          currentYear,
          "on",
          isReportsPage ? "Reports" : "Dashboard"
        );
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [paymentsData?.length, currentYear, isReportsPage]);

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
    return () => {
      // Clear all timers
      Object.values(debounceTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      debounceTimersRef.current = {};

      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }

      // Process remaining updates only if component is still mounted
      if (updateQueueRef.current.length > 0 && mountedRef.current) {
        // Force immediate processing without setTimeout
        const updates = [...updateQueueRef.current];
        updateQueueRef.current = [];
        // Process synchronously if possible
      }
    };
  }, []);

const handleAddType = async () => {
  console.log(`HomePage.jsx: type: ${newType}, user: ${currentUser}`);
  if (!newType.trim()) {
    setLocalErrorMessage("Type name cannot be empty.");
    return;
  }
  if (newType.trim().length > 50) {
    setLocalErrorMessage("Type name too long.");
    return;
  }
  const capitalizedType = newType.trim().toUpperCase();
  try {
    const response = await axios.post(
      `${BASE_URL}/add-type`,
      { type: capitalizedType },
      {
        headers: { Authorization: `Bearer ${sessionToken}` },
        timeout: 2000,
      }
    );
    console.log(`HomePage.jsx: Added ${capitalizedType} for ${currentUser}`, response.data);
    setIsTypeModalOpen(false);
    setNewType("");
    setSearchQuery("");
    setLocalErrorMessage("");
    const cacheKey = `types_${currentUser}_${sessionToken}`; // Updated cache key
    delete apiCacheRef.current[cacheKey];
    await fetchTypes();
    alert(`Type ${capitalizedType} added successfully.`);
  } catch (error) {
    console.error(`HomePage.jsx: Error adding type for ${currentUser}:`, error);
    const errorMsg = error.response?.data?.error || error.message;
    setLocalErrorMessage(errorMsg === "Type already exists for this user" ? "This type already exists." : `Failed to add type: ${errorMsg}`);
    if (error.response?.status === 401 || errorMsg.includes("Invalid token")) {
      setPage("signIn");
    }
  }
};

  // Updated useEffect for fetching years
  useEffect(() => {
    const controller = new AbortController();
    if (sessionToken) {
      console.log("HomePage.jsx: SessionToken available, fetching years");
      debouncedSearchUserYears(controller.signal);
    }
    return () => {
      controller.abort();
      debouncedSearchUserYears.cancel(); // Cancel debounced calls on cleanup
    };
  }, [sessionToken, debouncedSearchUserYears]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        hideContextMenu();
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [hideContextMenu]);

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
                  <button
                    onClick={() => {
                      console.log("HomePage.jsx: Add Type button clicked");
                      setIsTypeModalOpen(true);
                    }}
                    className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                    title="Add New Type"
                  >
                    <span className="inline-flex items-center">
                      {typeof window !== "undefined" && window.FontAwesome ? (
                        <i className="fas fa-plus-circle mr-1"></i>
                      ) : (
                        <span className="mr-1">+</span>
                      )}
                      Add Type
                    </span>
                  </button>
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
                        <input
                          type="text"
                          value={
                            localInputValues[`${rowIndex}-${month}`] !==
                            undefined
                              ? localInputValues[`${rowIndex}-${month}`]
                              : row?.[month] || ""
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
                      {parseFloat(row?.Due_Payment || 0).toFixed(2)}
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
      return (paymentsData || []).reduce((acc, row) => {
        if (!acc[row?.Client_Name]) {
          acc[row?.Client_Name] = {};
        }
        months.forEach((month) => {
          acc[row?.Client_Name][month] = getPaymentStatus(row, month);
        });
        return acc;
      }, {});
    }, [paymentsData, months, getPaymentStatus]);

    const getStatusBackgroundColor = (status) => {
      if (status === "Unpaid") return "bg-red-200/50 text-red-800";
      if (status === "PartiallyPaid") return "bg-yellow-200/50 text-yellow-800";
      if (status === "Paid") return "bg-green-200/50 text-green-800";
      return "bg-gray-100 text-gray-800";
    };

    const entriesPerPage = 10;
    const totalEntries = Object.keys(monthStatus).length;
    const totalPages = Math.ceil(totalEntries / entriesPerPage);
    const [currentPage, setCurrentPage] = useState(1);

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
                      {month.charAt(0).toUpperCase() + month.slice(1)}{" "}
                      {currentYear}
                    </th>
                  ))}
                </tr>
              </thead>
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
                        <td
                          key={mIdx}
                          className="px-6 py-4 whitespace-nowrap text-center"
                        >
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBackgroundColor(
                              monthStatus[client]?.[month] || "Unpaid"
                            )}`}
                          >
                            {monthStatus[client]?.[month] || "Unpaid"}
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
            Showing {(currentPage - 1) * entriesPerPage + 1} to{" "}
            {Math.min(currentPage * entriesPerPage, totalEntries)} of{" "}
            {totalEntries} entries
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
                    currentPage === i + 1
                      ? "bg-gray-800 text-white"
                      : "text-gray-700 hover:bg-gray-50"
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
                  const pageNum =
                    currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                  if (pageNum <= totalPages && pageNum > 0) {
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-4 py-2 border border-gray-300 rounded-md text-sm sm:text-base ${
                          currentPage === pageNum
                            ? "bg-gray-800 text-white"
                            : "text-gray-700 hover:bg-gray-50"
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
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
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
      {!isOnline && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <div className="ml-3">
              <p className="text-sm">
                You're currently offline. Changes will be saved when connection
                is restored.
              </p>
            </div>
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-lg text-center border border-red-200">
          <i className="fas fa-exclamation-circle mr-2"></i>
          {errorMessage}
          <button
            onClick={() => setLocalErrorMessage("")}
            className="ml-2 text-red-600 hover:text-red-800"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}
      {isUpdating && (
        <div className="mb-4 p-4 bg-yellow-50 text-yellow-800 rounded-lg text-center border border-yellow-200">
          <i className="fas fa-spinner fa-spin mr-2"></i>
          Saving updates, please wait...
        </div>
      )}
      {isReportsPage ? renderReports() : renderDashboard()}
      {isTypeModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => console.log("HomePage.jsx: Modal background rendered")}
        >
          <div
            className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">Add New Type</h2>
            {errorMessage && (
              <p className="text-red-500 mb-4 text-sm">{errorMessage}</p>
            )}
            <input
              type="text"
              value={newType}
              onChange={(e) => {
                console.log(
                  "HomePage.jsx: Typing in newType input:",
                  e.target.value
                );
                setNewType(e.target.value);
              }}
              placeholder="Enter new type"
              className="w-full p-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  console.log("HomePage.jsx: Cancel button clicked");
                  setIsTypeModalOpen(false);
                  setNewType("");
                  setLocalErrorMessage("");
                }}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  console.log("HomePage.jsx: Add Type submit button clicked");
                  handleAddType();
                }}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
              >
                Add Type
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
