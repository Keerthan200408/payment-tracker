import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import axios from "axios";
import { debounce } from "lodash";
import RemarkPopup from "./RemarkPopup";

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
  updatePayment = () => {},
  handleContextMenu = () => {},
  contextMenu = null,
  hideContextMenu = () => {},
  deleteRow = () => {},
  setPage = () => {},
  importCsv = () => {},
  isReportsPage = false,
  isImporting = false,
  sessionToken = "",
  currentYear = "2025",
  setCurrentYear = () => {},
  handleYearChange = () => {},
  setErrorMessage = () => {},
  apiCacheRef = { current: {} },
  currentUser = null,
  onMount = () => {},
  fetchTypes = () => {},
  refreshTrigger,
  fetchPayments = () => {},
  saveTimeouts = { current: {} },
}) => {
  const [availableYears, setAvailableYears] = useState(["2025"]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [localInputValues, setLocalInputValues] = useState({});
  const [pendingUpdates, setPendingUpdates] = useState({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [errorMessage, setLocalErrorMessage] = useState("");
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [lastRefreshTrigger, setLastRefreshTrigger] = useState(0);
  const [remarkPopup, setRemarkPopup] = useState({
    isOpen: false,
    clientName: '',
    type: '',
    month: '',
    currentRemark: 'N/A'
  });
  const mountedRef = useRef(true);
  const tableRef = useRef(null);
  const csvFileInputRef = useRef(null);
  const debounceTimersRef = useRef({});

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

  const calculateDuePayment = (rowData, months, currentYear) => {
    log(`HomePage.jsx: calculateDuePayment for ${rowData.Client_Name || 'unknown'}, Year = ${currentYear}`);

    const sanitizedData = validateRowData(rowData, currentYear);
    const amountToBePaid = parseFloat(sanitizedData.Amount_To_Be_Paid) || 0;
    
    if (amountToBePaid <= 0) {
      log(`HomePage.jsx: calculateDuePayment: Returning 0 due to invalid Amount_To_Be_Paid: ${amountToBePaid}`);
      return 0;
    }

    const totalPaymentsMade = months.reduce((sum, month) => {
      const rawValue = sanitizedData[month];
      const payment = (rawValue === "" || rawValue == null) ? 0 : parseFloat(rawValue);
      if (isNaN(payment) || payment < 0) {
        log(`HomePage.jsx: calculateDuePayment: Invalid payment for ${month}: ${rawValue}, treating as 0`);
        return sum;
      }
      log(`HomePage.jsx: calculateDuePayment: Month ${month} = ${payment}`);
      return sum + payment;
    }, 0);

    // Calculate active months (months with non-zero payments)
    const activeMonths = months.filter((month) => {
      const rawValue = sanitizedData[month];
      const payment = (rawValue === "" || rawValue == null) ? 0 : parseFloat(rawValue);
      return !isNaN(payment) && payment > 0;
    }).length;

    // Use active months for expected total
    const expectedTotal = activeMonths > 0 ? amountToBePaid * activeMonths : 0;
    const due = Math.max(expectedTotal - totalPaymentsMade, 0);
    
    log(`HomePage.jsx: calculateDuePayment: Expected = ${expectedTotal}, Total Paid = ${totalPaymentsMade}, Due_Payment = ${due}`);
    
    return Math.round(due * 100) / 100;
  };

  const getPaymentStatus = useCallback((row, month) => {
    const globalRowIndex = paymentsData.findIndex(
      (r) => r.Client_Name === row.Client_Name && r.Type === row.Type
    );

    const rawValue = localInputValues[`${globalRowIndex}-${month}`];
    const paid = parseFloat(
      rawValue !== undefined ? rawValue : row?.[month] ?? 0
    ) || 0;

    const due = parseFloat(row?.Amount_To_Be_Paid) || 0;

    if (due <= 0) return "Unpaid";
    if (paid >= due) return "Paid";
    if (paid > 0 && paid < due) return "PartiallyPaid";
    return "Unpaid";
  }, [localInputValues, paymentsData]);

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

  const filteredData = useMemo(() => {
    return (paymentsData || []).filter((row) => {
      const monthKey = monthFilter?.toLowerCase?.() || "";
      const status = getPaymentStatus(row, monthKey);

      const matchesSearch =
        !searchQuery ||
        row?.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row?.Type?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesMonth =
        !monthFilter || (row?.[monthKey] !== undefined && row?.[monthKey] !== null);

      const matchesStatus =
        !monthFilter || !statusFilter || status === statusFilter;

      return matchesSearch && matchesMonth && matchesStatus;
    });
  }, [paymentsData, searchQuery, monthFilter, statusFilter, getPaymentStatus, localInputValues]);

  const validateRowData = (rowData, currentYear) => {
    log(`HomePage.jsx: Validating rowData for ${rowData.Client_Name || 'unknown'}, Year = ${currentYear}`);
    
    const sanitizedData = { ...rowData, Year: rowData.Year || currentYear };
    const amountToBePaid = parseFloat(sanitizedData.Amount_To_Be_Paid) || 0;
    
    if (isNaN(amountToBePaid) || amountToBePaid < 0) {
      log(`HomePage.jsx: Invalid Amount_To_Be_Paid for ${rowData.Client_Name || 'unknown'}: ${rowData.Amount_To_Be_Paid}, defaulting to 0`);
      sanitizedData.Amount_To_Be_Paid = 0;
    }
    
    MONTHS.forEach((month) => {
      const rawValue = rowData[month];
      if (rawValue == null || rawValue === "" || isNaN(parseFloat(rawValue)) || parseFloat(rawValue) < 0) {
        log(`HomePage.jsx: Invalid payment for ${rowData.Client_Name || 'unknown'}, ${month}: ${rawValue}, defaulting to empty string for UI`);
        sanitizedData[month] = "";
      } else {
        // Handle zero values properly - convert "0", "0.00", etc. to "0"
        const parsedValue = parseFloat(rawValue);
        if (parsedValue === 0) {
          sanitizedData[month] = "0";
        } else {
          sanitizedData[month] = parsedValue.toString(); // Normalize to string for UI consistency
        }
      }
    });
    
    if (sanitizedData.Year !== currentYear) {
      log(`HomePage.jsx: Year mismatch for ${rowData.Client_Name || 'unknown'}: Expected ${currentYear}, Got ${sanitizedData.Year}`);
    }
    
    return sanitizedData;
  };

  const retryWithBackoff = async (fn, retries = 3, delay = 500) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (error.response?.status === 429 && i < retries - 1) {
          log(`HomePage.jsx: Rate limit hit, retrying in ${delay}ms...`);
          await sleep(delay);
          delay *= 2;
        } else {
          throw error;
        }
      }
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

      const requestKey = `years_${sessionToken}`;
      return createDedupedRequest(requestKey, async () => {
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

  const debouncedSearchUserYears = useCallback(
    debounce((signal) => searchUserYears(signal), 300),
    [searchUserYears]
  );

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
            <span className="text-sm">{message}</span>
          </div>
          <button
            onClick={onDismiss}
            className="ml-2 hover:opacity-75 transition-opacity"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>
    );
  };

  const handleYearChangeDebounced = useCallback(
    debounce(async (year) => {
      log("HomePage.jsx: Year change requested to:", year);
      
      // Clear existing states to prevent stale data
      setPaymentsData([]);
      setLocalInputValues({});
      setPendingUpdates({});
      if (debounceTimersRef.current) {
        Object.values(debounceTimersRef.current).forEach(clearTimeout);
        debounceTimersRef.current = {};
      }

      // Update currentYear and store in localStorage
      localStorage.setItem("currentYear", year);
      setCurrentYear(year);

      if (sessionToken) {
        setIsLoadingPayments(true);
        log("HomePage.jsx: Fetching payments for year:", year);
        
        // Clear cache for the new year to ensure fresh data
        const paymentsCacheKey = getCacheKey('/get-payments-by-year', {
          year,
          sessionToken,
        });
        delete apiCacheRef.current[paymentsCacheKey];

        try {
          await fetchPayments(sessionToken, year, true); // Force fetch to bypass cache
          log(`HomePage.jsx: Payments fetched for year ${year}: ${paymentsData.length} items`);
        } catch (error) {
          log('HomePage.jsx: Error fetching payments for year:', year, error);
          setLocalErrorMessage(
            error.response?.data?.error || 'Failed to load payments data for the selected year.'
          );
        } finally {
          setIsLoadingPayments(false);
        }
      }
    }, 300),
    [setCurrentYear, sessionToken, fetchPayments, getCacheKey, setPaymentsData, setLocalErrorMessage]
  );

  const handleInputChange = useCallback(async (rowIndex, month, value) => {
    const trimmedValue = value.trim();
    const parsedValue = trimmedValue === "" || trimmedValue === "0.00" ? "0" : trimmedValue;
    const key = `${rowIndex}-${month}`;

    if (trimmedValue !== "" && trimmedValue !== "0.00" && (isNaN(parseFloat(parsedValue)) || parseFloat(parsedValue) < 0)) {
      setErrorMessage("Please enter a valid non-negative number.");
      return;
    }

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
          value: parsedValue
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

  useEffect(() => {
    const loadPaymentsData = async () => {
      if (!sessionToken || !currentYear) return;

      setIsLoadingPayments(true);
      log(`HomePage.jsx: Fetching payments for year ${currentYear} due to refreshTrigger: ${refreshTrigger}`);
      
      const paymentsCacheKey = getCacheKey('/get-payments-by-year', {
        year: currentYear,
        sessionToken,
      });

      // Clear stale states
      setLocalInputValues({});
      setPendingUpdates({});
      if (debounceTimersRef.current) {
        Object.values(debounceTimersRef.current).forEach(clearTimeout);
        debounceTimersRef.current = {};
      }

      // Invalidate cache if refreshTrigger changes
      if (refreshTrigger && refreshTrigger !== lastRefreshTrigger) {
        log(`HomePage.jsx: Invalidating cache for payments_${currentYear} due to refreshTrigger change`);
        delete apiCacheRef.current[paymentsCacheKey];
        setLastRefreshTrigger(refreshTrigger);
      }

      try {
        await fetchPayments(sessionToken, currentYear, refreshTrigger && refreshTrigger !== lastRefreshTrigger);
        log(`HomePage.jsx: Payments fetched for year ${currentYear}: ${paymentsData.length} items`);

        if (paymentsData.length > 0) {
          log("🔍 Sample Row for Debug:", paymentsData[0]);
        }
      } catch (error) {
        log('HomePage.jsx: Error fetching payments:', error);
        setLocalErrorMessage(
          error.response?.data?.error || 'Failed to load payments data.'
        );
        const cachedData = getCachedData(paymentsCacheKey);
        if (cachedData && !refreshTrigger) {
          setPaymentsData(cachedData);
          log(`HomePage.jsx: Using cached payments for ${currentYear}: ${cachedData.length} items`);
        }
      } finally {
        setIsLoadingPayments(false);
      }
    };

    loadPaymentsData();
  }, [sessionToken, currentYear, fetchPayments, getCacheKey, getCachedData, setPaymentsData, refreshTrigger, lastRefreshTrigger, setLocalErrorMessage]);

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
        log(
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
      Object.values(debounceTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      debounceTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          setLocalErrorMessage("");
          setErrorMessage("");
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage, setErrorMessage]);

  const handleAddType = async () => {
    log(`HomePage.jsx: type: ${newType}, user: ${currentUser}`);
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
      const response = await retryWithBackoff(
        () =>
          axios.post(
            `${BASE_URL}/add-type`,
            { type: capitalizedType },
            {
              headers: { Authorization: `Bearer ${sessionToken}` },
              timeout: 5000,
            }
          ),
        3,
        1000
      );
      log(`HomePage.jsx: Added ${capitalizedType} for ${currentUser}`, response.data);
      setIsTypeModalOpen(false);
      setNewType("");
      setSearchQuery("");
      setLocalErrorMessage("");
      const cacheKey = `types_${currentUser}_${sessionToken}`;
      delete apiCacheRef.current[cacheKey];
      await fetchTypes(sessionToken);
      alert(`Type ${capitalizedType} added successfully.`);
    } catch (error) {
      log(`HomePage.jsx: Error adding type for ${currentUser}:`, error);
      const errorMsg = error.response?.data?.error || error.message;
      let userMessage = errorMsg;
      if (errorMsg.includes("Type already exists")) {
        userMessage = `The type "${capitalizedType}" already exists.`;
      } else if (error.message.includes("timeout")) {
        userMessage = "Request timed out. Please check your connection and try again.";
      }
      setLocalErrorMessage(userMessage);
      if (error.response?.status === 401 || errorMsg.includes("Invalid token")) {
        setPage("signIn");
      }
    }
  };

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

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        hideContextMenu();
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [hideContextMenu]);

  const renderDashboard = () => {
    const entriesPerPage = 10;
    const totalEntries = filteredData.length;
    const totalPages = Math.ceil(totalEntries / entriesPerPage);
    const paginatedData = filteredData.slice(
      (currentPage - 1) * entriesPerPage,
      currentPage * entriesPerPage
    );

    return (
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

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" ref={tableRef}>
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    Client
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    Type
                    <button
                      onClick={() => {
                        log("HomePage.jsx: Add Type button clicked");
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
                      className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50"
                    >
                      {month.charAt(0).toUpperCase() + month.slice(1)}
                    </th>
                  ))}
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    Total Due
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={15}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      <div className="flex flex-col items-center">
                        <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                        <p className="text-lg font-medium text-gray-600">
                          {searchQuery
                            ? "No clients found matching your search."
                            : "No payments found."}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {!searchQuery && "No payment data found. Try refreshing or check the Clients sheet."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row, localRowIndex) => {
                    const globalRowIndex = paymentsData.findIndex(
                      (r) => r.Client_Name === row.Client_Name
                    );
                    return (
                      <tr
                        key={`${row?.Client_Name || "unknown"}-${localRowIndex}`}
                        onContextMenu={(e) => handleContextMenu(e, globalRowIndex)}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-6 py-4 whitespace-nowrap flex items-center text-sm sm:text-base text-gray-900">
                          <i className="fas fa-user-circle mr-2 text-gray-400"></i>
                          {row?.Client_Name || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm sm:text-base text-gray-900">
                          {row?.Type || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm sm:text-base text-gray-900">
                          ₹{(parseFloat(row?.Amount_To_Be_Paid) || 0).toLocaleString()}.00
                        </td>
                        {months.map((month, colIndex) => {
                          const monthKey = month.charAt(0).toUpperCase() + month.slice(1);
                          const currentRemark = row?.Remarks?.[monthKey] || "N/A";
                          const hasRemark = currentRemark !== "N/A";
                          
                          return (
                            <td
                              key={colIndex}
                              className="px-6 py-4 whitespace-nowrap text-center relative group"
                            >
                              <div className="relative">
                                <input
                                  type="text"
                                  value={
                                    localInputValues[`${globalRowIndex}-${month}`] !== undefined
                                      ? localInputValues[`${globalRowIndex}-${month}`]
                                      : row?.[month] || ""
                                  }
                                  onChange={(e) =>
                                    handleInputChange(globalRowIndex, month, e.target.value)
                                  }
                                  className={`w-20 p-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base ${getInputBackgroundColor(
                                    row,
                                    month,
                                    globalRowIndex
                                  )}`}
                                  placeholder="0.00"
                                  title={
                                    pendingUpdates[`${globalRowIndex}-${month}`]
                                      ? "Saving..."
                                      : ""
                                  }
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
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm sm:text-base text-gray-900">
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

        {paginatedData.length > 0 && (
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
        )}

        <div className="relative">
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
        </div>
      </>
    );
  };

  const renderReports = () => {
    const monthStatus = useMemo(() => {
      return (paymentsData || []).reduce((acc, row) => {
        if (!acc[row?.Client_Name]) {
          acc[row?.Client_Name] = {};
        }
        months.forEach((month) => {
          const amountToBePaid = parseFloat(row?.Amount_To_Be_Paid || 0);
          const paid = parseFloat(row?.[month] || 0);
          let status = "Unpaid";
          if (paid >= amountToBePaid) status = "Paid";
          else if (paid > 0) status = "PartiallyPaid";
          acc[row?.Client_Name][month.toLowerCase()] = status;
        });
        return acc;
      }, {});
    }, [paymentsData, months]);

    const getStatusBackgroundColor = (status) => {
      if (status === "Unpaid") return "bg-red-100 text-red-800";
      if (status === "PartiallyPaid") return "bg-yellow-100 text-yellow-800";
      if (status === "Paid") return "bg-green-100 text-green-800";
      return "bg-gray-100 text-gray-800";
    };

    const entriesPerPage = 10;

    const filteredClients = useMemo(() => {
      let filtered = Object.keys(monthStatus);

      if (searchQuery) {
        filtered = filtered.filter((client) =>
          client.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      if (monthFilter && statusFilter) {
        filtered = filtered.filter((client) => {
          const status = monthStatus[client]?.[monthFilter.toLowerCase()];
          return status === statusFilter;
        });
      }

      return filtered;
    }, [monthStatus, searchQuery, monthFilter, statusFilter]);

    const paginatedClients = filteredClients.slice(
      (currentPage - 1) * entriesPerPage,
      currentPage * entriesPerPage
    );
    const totalEntries = filteredClients.length;
    const totalPages = Math.ceil(totalEntries / entriesPerPage);

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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    Client
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    Type
                  </th>
                  {months.map((month, index) => (
                    <th
                      key={index}
                      className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50"
                    >
                      {month.charAt(0).toUpperCase() + month.slice(1)} {currentYear}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedClients.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                        <p className="text-lg font-medium text-gray-600">
                          {searchQuery
                            ? "No clients found matching your search."
                            : "No data available."}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {!searchQuery && "No payment data found for this year."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedClients.map((client, idx) => {
                    const paymentData = paymentsData.find(
                      (row) => row.Client_Name === client
                    );
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap flex items-center text-sm sm:text-base text-gray-900">
                          <i className="fas fa-user-circle mr-2 text-gray-400"></i>
                          {client}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm sm:text-base text-gray-900">
                          {paymentData?.Type || "N/A"}
                        </td>
                        {months.map((month, mIdx) => {
                          const status = monthStatus[client]?.[month.toLowerCase()] || "Unpaid";
                          return (
                            <td
                              key={mIdx}
                              className="px-6 py-4 whitespace-nowrap text-center"
                            >
                              <span
                                className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusBackgroundColor(
                                  status
                                )}`}
                              >
                                {status}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {paginatedClients.length > 0 && (
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
              {[...Array(totalPages)].map((_, i) => (
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
              ))}
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
        )}
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
        <ErrorMessageDisplay
          message={errorMessage}
          onDismiss={() => setLocalErrorMessage("")}
          type="error"
        />
      )}
      {isReportsPage ? renderReports() : renderDashboard()}
      {isTypeModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => log("HomePage.jsx: Modal background rendered")}
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
                log("HomePage.jsx: Typing in newType input:", e.target.value);
                setNewType(e.target.value);
              }}
              placeholder="Enter new type"
              className="w-full p-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  log("HomePage.jsx: Cancel button clicked");
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
                  log("HomePage.jsx: Add Type submit button clicked");
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