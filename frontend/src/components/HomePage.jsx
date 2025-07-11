import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { debounce } from "lodash";
import { 
  yearsAPI, 
  typesAPI, 
  paymentsAPI, 
  communicationAPI, 
  importAPI,
  handleAPIError 
} from '../utils/api';
const BATCH_DELAY = 1000;
const BATCH_SIZE = 5;
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
  const [isUpdating, setIsUpdating] = useState(false);
  const debounceTimersRef = useRef({});
  const updateQueueRef = useRef([]);
  const batchTimerRef = useRef(null);
  const activeRequestsRef = useRef(new Set());
  const tableRef = useRef(null);
  const csvFileInputRef = useRef(null);
  const [errorMessage, setLocalErrorMessage] = useState("");
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const mountedRef = useRef(true);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [lastRefreshTrigger, setLastRefreshTrigger] = useState(0);

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

  // Calculate total payments made
  const totalPaymentsMade = months.reduce((sum, month) => {
    const rawValue = sanitizedData[month];
    const payment = (rawValue === "" || rawValue === "0.00" || rawValue == null) ? 0 : parseFloat(rawValue);
    if (isNaN(payment) || payment < 0) {
      log(`HomePage.jsx: calculateDuePayment: Invalid payment for ${month}: ${rawValue}, treating as 0`);
      return sum;
    }
    log(`HomePage.jsx: calculateDuePayment: Month ${month} = ${payment}`);
    return sum + payment;
  }, 0);

  // Calculate active months (months with any value, not just positive payments)
  // This matches the backend logic
  const activeMonths = months.filter((month) => {
    const rawValue = sanitizedData[month];
    return rawValue !== "" && rawValue !== null && rawValue !== undefined;
  }).length;

  // Use active months for expected total (matches backend logic)
  const expectedTotal = activeMonths * amountToBePaid;
  const due = Math.max(expectedTotal - totalPaymentsMade, 0);
  
  log(`HomePage.jsx: calculateDuePayment: Expected = ${expectedTotal}, Total Paid = ${totalPaymentsMade}, Due_Payment = ${due}, Active Months = ${activeMonths}`);
  
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

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (rawValue == null || rawValue === "" || rawValue === "0.00" || isNaN(parseFloat(rawValue)) || parseFloat(rawValue) < 0) {
      log(`HomePage.jsx: Invalid payment for ${rowData.Client_Name || 'unknown'}, ${month}: ${rawValue}, defaulting to empty string for UI`);
      sanitizedData[month] = "";
    } else {
      sanitizedData[month] = parseFloat(rawValue).toString(); // Normalize to string for UI consistency
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
          const response = await yearsAPI.getUserYears();
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
          handleAPIError(error, setLocalErrorMessage);
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

    // Prevent multiple simultaneous requests
    if (isLoadingYears) {
      log("HomePage.jsx: Add new year request already in progress, skipping");
      return;
    }

    if (mountedRef.current) {
      setIsLoadingYears(true);
    }

    const controller = new AbortController();

    try {
      // Add a small delay to ensure any previous requests are completed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response = await yearsAPI.addNewYear({ year: newYear });
      log("HomePage.jsx: Add new year response:", response.data);

      const yearsCacheKey = getCacheKey("/get-user-years", { sessionToken });
      const paymentsCacheKey = getCacheKey("/get-payments-by-year", { year: newYear, sessionToken });
      delete apiCacheRef.current[yearsCacheKey];
      delete apiCacheRef.current[paymentsCacheKey];

      await searchUserYears(controller.signal);

      const clientsResponse = await clientsAPI.getClients();
      const expectedClientCount = clientsResponse.data.length;

      const paymentsResponse = await paymentsAPI.getPaymentsByYear(newYear);

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
      
      // Handle specific error cases
      if (errorMsg.includes("already exists")) {
        userMessage = `Year ${newYear} already exists. Switching to ${newYear}...`;
        // Automatically switch to the new year even if it already exists
        setCurrentYear(newYear);
        localStorage.setItem("currentYear", newYear);
        setLocalErrorMessage("");
        setErrorMessage("");
        alert(userMessage);
        return;
      } else if (errorMsg.includes("No clients found")) {
        userMessage = "No clients found. Please add clients before creating a new year.";
      } else if (errorMsg.includes("Database connection failed") || errorMsg.includes("Database collections not accessible")) {
        userMessage = "Database connection issue. Please try again in a few seconds.";
      } else if (errorMsg.includes("Failed to fetch clients") || errorMsg.includes("Failed to insert payment records")) {
        userMessage = "Database operation failed. Please try again.";
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

  const hasValidEmail = useCallback((clientData) => {
    const email = clientData?.Email || '';
    return email && email.trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }, []);

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

  const debugDuePayment = (rowIndex, stage, value) => {
    log(`Due Payment Debug - Row ${rowIndex} at ${stage}: ${value}`);
  };

  const processBatchUpdates = useCallback(
    async () => {
      if (!updateQueueRef.current.length) {
        log("HomePage.jsx: No updates to process");
        batchTimerRef.current = null;
        return;
      }

      const updates = [...updateQueueRef.current];
      updateQueueRef.current = [];
      batchTimerRef.current = null;
      
      log(`HomePage.jsx: Processing batch of ${updates.length} updates for year ${currentYear}`, updates);
      setIsUpdating(true);

      const rowDataCache = new Map();
      const localValuesCache = { ...localInputValues };
      const missingContactClients = [];

      updates.forEach(({ rowIndex }) => {
        if (!rowDataCache.has(rowIndex) && paymentsData[rowIndex]) {
          rowDataCache.set(rowIndex, paymentsData[rowIndex]);
        }
      });

      const updatesByRow = new Map();
      
      updates.forEach(({ rowIndex, month, value, year }) => {
        const rowData = rowDataCache.get(rowIndex);
        if (!rowData) {
          log(`HomePage.jsx: Invalid rowIndex ${rowIndex}`);
          return;
        }

        if (!updatesByRow.has(rowIndex)) {
          updatesByRow.set(rowIndex, {
            rowIndex,
            year,
            updates: [],
            clientName: rowData.Client_Name,
            type: rowData.Type,
            clientEmail: rowData.Email || "",
            clientPhone: rowData.Phone_Number || "",
            rowData,
          });
        }
        
        updatesByRow.get(rowIndex).updates.push({ 
          month: month.toLowerCase(),
          value 
        });
      });

      try {
        const updatePromises = Array.from(updatesByRow.values()).map(async (rowUpdate) => {
          const { rowIndex, year, updates, clientName, type, clientEmail, clientPhone, rowData } = rowUpdate;
          try {
            log(`HomePage.jsx: Sending batch update for ${clientName}, year ${year}`, updates);
            const response = await paymentsAPI.batchSavePayments({ 
              payments: updates.map(update => ({
                clientName,
                type,
                month: update.month,
                value: update.value
              })),
              year 
            });

const { updatedPayments } = response.data;

// Find the updated payment for this specific client and type
const updatedPayment = updatedPayments.find(payment => 
  payment.Client_Name === clientName && payment.Type === type
);

if (!updatedPayment) {
  throw new Error(`No updated payment found for ${clientName} (${type})`);
}

// Log for debugging
log(`HomePage.jsx: Backend response for ${clientName}`, {
  Backend_Due_Payment: updatedPayment.Due_Payment,
  Year: year,
  Updates: updates.map(u => `${u.month}: ${u.value}`)
});

// Use the backend's calculated due payment
const correctedRow = {
  ...updatedPayment,
  Due_Payment: updatedPayment.Due_Payment
};

const notifyStatuses = updates.map(({ month, value }) => {
  const paidAmount = parseFloat(value) || 0;
  const expectedAmount = parseFloat(rowData.Amount_To_Be_Paid) || 0;
  let status = "Unpaid";
  if (paidAmount >= expectedAmount && expectedAmount > 0) status = "Paid";
  else if (paidAmount > 0 && expectedAmount > 0) status = "PartiallyPaid";
  return {
    month: month.charAt(0).toUpperCase() + month.slice(1),
    status,
    paidAmount,
    expectedAmount,
  };
});

if (clientEmail || clientPhone) {
  await handleNotifications(
    clientName,
    clientEmail,
    clientPhone,
    type,
    year,
    notifyStatuses,
    updatedPayment.Due_Payment
  );
}

return {
  success: true,
  rowIndex,
  updatedRow: correctedRow,
  updates: rowUpdate.updates,
  hasNotificationContact: !!(clientEmail || clientPhone),
};

          } catch (error) {
            log(`HomePage.jsx: Failed to batch update row ${rowIndex}:`, error);
            return {
              success: false,
              rowIndex,
              error: error.response?.data?.error || error.message,
              updates: rowUpdate.updates,
            };
          }
        });

        const results = await Promise.allSettled(updatePromises);
        
        const failedUpdates = [];
        const successfulUpdates = [];

        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              successfulUpdates.push(result.value);
            } else {
              failedUpdates.push(result.value);
            }
          } else {
            log('HomePage.jsx: Promise rejected:', result.reason);
          }
        });

        if (successfulUpdates.length > 0) {
          setPaymentsData((prev) => {
            const updated = [...prev];
            
            successfulUpdates.forEach(({ rowIndex, updatedRow }) => {
              if (updatedRow && updated[rowIndex]) {
                log(`HomePage.jsx: Updating row ${rowIndex} with recalculated Due_Payment: ${updatedRow.Due_Payment} for year ${currentYear}`);
                
                const mappedRow = {
                  ...updated[rowIndex],
                  Client_Name: updatedRow.Client_Name,
                  Type: updatedRow.Type,
                  Amount_To_Be_Paid: updatedRow.Amount_To_Be_Paid,
                  Email: updatedRow.Email,
                  Phone_Number: updatedRow.Phone_Number,
                  January: updatedRow.January || "",
                  February: updatedRow.February || "",
                  March: updatedRow.March || "",
                  April: updatedRow.April || "",
                  May: updatedRow.May || "",
                  June: updatedRow.June || "",
                  July: updatedRow.July || "",
                  August: updatedRow.August || "",
                  September: updatedRow.September || "",
                  October: updatedRow.October || "",
                  November: updatedRow.November || "",
                  December: updatedRow.December || "",
                  Due_Payment: updatedRow.Due_Payment
                };
                
                updated[rowIndex] = mappedRow;
              }
            });
            
            log(`HomePage.jsx: Updated paymentsData with ${successfulUpdates.length} rows for year ${currentYear}`);
            return updated;
          });

          setPendingUpdates((prev) => {
            const newPending = { ...prev };
            successfulUpdates.forEach(({ updates, rowIndex }) => {
              updates.forEach(({ month }) => {
                const originalMonth = month.charAt(0).toUpperCase() + month.slice(1);
                delete newPending[`${rowIndex}-${originalMonth}`];
              });
            });
            return newPending;
          });

          setLocalInputValues((prev) => {
            const newValues = { ...prev };
            successfulUpdates.forEach(({ updates, rowIndex, updatedRow }) => {
              updates.forEach(({ month }) => {
                const originalMonth = month.charAt(0).toUpperCase() + month.slice(1);
                const key = `${rowIndex}-${originalMonth}`;
                newValues[key] = updatedRow[originalMonth] || "";
              });
            });
            return newValues;
          });

          try {
            const paymentsCacheKey = getCacheKey('/get-payments-by-year', {
              year: currentYear,
              sessionToken,
            });
            log(`HomePage.jsx: Clearing cache for ${paymentsCacheKey}`);
            delete apiCacheRef.current[paymentsCacheKey];
            await fetchPayments(sessionToken, currentYear, true);
            log("HomePage.jsx: Refreshed payments data after batch update");
          } catch (error) {
            log("HomePage.jsx: Failed to refresh payments data:", error);
            setLocalErrorMessage("Updated payments, but failed to refresh data. Please reload if issues persist.");
          }
        }

        if (failedUpdates.length > 0) {
          const retryUpdates = [];
          
          failedUpdates.forEach(({ rowIndex, updates, error }) => {
            const rowData = rowDataCache.get(rowIndex);
            const errorMsg = `Failed to update ${rowData?.Client_Name || "unknown"}: ${error}`;
            
            log(`HomePage.jsx: ${errorMsg}`);
            setLocalErrorMessage(errorMsg);
            setErrorMessage(errorMsg);

            setPaymentsData((prev) =>
              prev.map((row, idx) =>
                idx === rowIndex ? rowDataCache.get(rowIndex) || row : row
              )
            );

            updates.forEach((update) => {
              const originalMonth = update.month.charAt(0).toUpperCase() + update.month.slice(1);
              retryUpdates.push({ 
                ...update, 
                month: originalMonth, 
                rowIndex 
              });
            });
          });

          updateQueueRef.current.unshift(...retryUpdates);
        }
        
      } catch (error) {
        log("HomePage.jsx: Batch update error:", error);
        setLocalErrorMessage(`Batch update failed: ${error.message}`);
        setErrorMessage(`Batch update failed: ${error.message}`);
      } finally {
        setIsUpdating(false);
      }
    },
    [paymentsData, sessionToken, months, localInputValues, setErrorMessage, setLocalErrorMessage, fetchPayments, currentYear, getCacheKey]
  );

  const handleNotifications = useCallback(
    async (clientName, clientEmail, clientPhone, type, year, notifyStatuses, duePayment) => {
      log(`HomePage.jsx: Starting notification for ${clientName}`, {
        clientEmail,
        clientPhone,
        type,
        year,
        notifyStatuses,
      });

      const hasValidPhone = clientPhone && /^\+?[\d\s-]{10,15}$/.test(clientPhone.trim());
      const hasValidEmailAddress = hasValidEmail({ Email: clientEmail, email: clientEmail });

      log(`HomePage.jsx: Notification checks`, {
        hasValidPhone,
        hasValidEmailAddress,
        clientName,
      });

      let notificationSent = false;

      if (hasValidPhone) {
        let isValidWhatsApp = true;

        try {
          log(`HomePage.jsx: Verifying WhatsApp for ${clientPhone}`);
          const verifyResponse = await communicationAPI.verifyWhatsAppContact({
            phoneNumber: clientPhone.trim()
          });

          if (!verifyResponse.data.isValidWhatsApp) {
            log(`HomePage.jsx: ${clientPhone} is not registered with WhatsApp`);
            setLocalErrorMessage(
              `Cannot send WhatsApp message to ${clientName}: Phone number is not registered with WhatsApp.`
            );
            isValidWhatsApp = false;
          }
        } catch (verifyError) {
          log(`HomePage.jsx: WhatsApp verification failed for ${clientPhone} (${clientName})`, {
            message: verifyError.message,
            status: verifyError.response?.status,
            data: verifyError.response?.data,
          });
          setLocalErrorMessage(
            `Failed to verify WhatsApp status for ${clientName}: ${
              verifyError.response?.data?.error || verifyError.message
            }`
          );
          isValidWhatsApp = false;
        }

        if (isValidWhatsApp) {
          try {
            const duePaymentText = parseFloat(duePayment) > 0
              ? `\n\nTotal Due Payment: ₹${parseFloat(duePayment).toFixed(2)}`
              : "";
            const messageContent = `Dear ${clientName},\n\nYour payment status for ${type} (${year}) has been updated:\n\n${notifyStatuses
              .map(
                ({ month, status, paidAmount, expectedAmount }) =>
                  `- ${month.charAt(0).toUpperCase() + month.slice(1)}: ${status} (Paid: ₹${paidAmount.toFixed(2)}, Expected: ₹${expectedAmount.toFixed(2)})`
              )
              .join("\n")}${duePaymentText}\n\nPlease review your account or contact us for clarifications.\nBest regards,\nPayment Tracker Team`;

            log(`HomePage.jsx: Sending WhatsApp to ${clientPhone}`);
            const response = await communicationAPI.sendWhatsApp({
              to: clientPhone.trim(),
              message: messageContent,
            });

            log(`HomePage.jsx: WhatsApp sent successfully to ${clientPhone} for ${clientName}`, {
              messageId: response.data.messageId || "N/A",
            });
            notificationSent = true;
          } catch (whatsappError) {
            log(`HomePage.jsx: WhatsApp attempt failed for ${clientPhone} (${clientName})`, {
              message: whatsappError.message,
              status: whatsappError.response?.status,
              data: whatsappError.response?.data,
            });
            setLocalErrorMessage(
              `Failed to send WhatsApp message to ${clientName}: ${
                whatsappError.response?.data?.error || whatsappError.message
              }. Attempting email.`
            );
          }
        }
      } else {
        log(`HomePage.jsx: No valid phone number for ${clientName}, checking email`);
      }

      if (!notificationSent && hasValidEmailAddress) {
        try {
          const duePaymentText = parseFloat(duePayment) > 0
            ? `<p><strong>Total Due Payment:</strong> ₹${parseFloat(duePayment).toFixed(2)}</p>`
            : "";
          const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
                Payment Status Update
              </h2>
              <p>Dear <strong>${clientName}</strong>,</p>
              <p>Your payment status for <strong>${type}</strong> has been updated for <strong>${year}</strong>:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead>
                  <tr style="background-color: #f8f9fa;">
                    <th style="border: 1px solid #dee2e6; padding: 12px; text-align: left;">Month</th>
                    <th style="border: 1px solid #dee2e6; padding: 12px; text-align: left;">Status</th>
                    <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">Paid Amount</th>
                    <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">Expected Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${notifyStatuses
                    .map(
                      ({ month, status, paidAmount, expectedAmount }) => `
                      <tr>
                        <td style="border: 1px solid #dee2e6; padding: 12px;">${
                          month.charAt(0).toUpperCase() + month.slice(1)
                        }</td>
                        <td style="border: 1px solid #dee2e6; padding: 12px;">
                          <span style="padding: 4px 8px; border-radius: 4px; color: white; background-color: ${
                            status === "Unpaid" ? "#dc3545" : "#ffc107"
                          };">
                            ${status === "PartiallyPaid" ? "Partially Paid" : status}
                          </span>
                        </td>
                        <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">₹${paidAmount.toFixed(2)}</td>
                        <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">₹${expectedAmount.toFixed(2)}</td>
                      </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
              ${duePaymentText}
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Note:</strong> Please review your account or contact us for any clarifications.</p>
              </div>
              <p>Best regards,<br><strong>Payment Tracker Team</strong></p>
            </div>
          `;

          log(`HomePage.jsx: Sending email to ${clientEmail} for ${clientName}`);
          const response = await communicationAPI.sendEmail({
            to: clientEmail.trim(),
            subject: `Payment Status Update - ${clientName} (${type}) - ${year}`,
            html: emailContent,
          });

          log(`HomePage.jsx: Email sent successfully to ${clientEmail} for ${clientName}`, {
            messageId: response.data.messageId || "N/A",
          });
          notificationSent = true;
          setLocalErrorMessage(`Email notification sent successfully to ${clientName}`);
        } catch (emailError) {
          log(`HomePage.jsx: Email failed for ${clientEmail} (${clientName})`, {
            message: emailError.message,
            status: emailError.response?.status,
            data: emailError.response?.data,
          });
          setLocalErrorMessage(
            `Failed to send email notification to ${clientName}: ${
              emailError.response?.data?.error || emailError.message
            }`
          );
        }
      } else if (!hasValidPhone && !hasValidEmailAddress) {
        log(`HomePage.jsx: No valid contact for ${clientName}`);
        setLocalErrorMessage(
          `No notification sent for ${clientName}: No valid phone or email provided.`
        );
      } else if (!notificationSent) {
        log(`HomePage.jsx: Email not attempted for ${clientName} due to invalid email`);
        setLocalErrorMessage(
          `No notification sent for ${clientName}: Email address invalid or missing.`
        );
      }

      return notificationSent;
    },
    [sessionToken, hasValidEmail, setLocalErrorMessage, currentYear]
  );

  const debouncedUpdate = useCallback(
    (rowIndex, month, value, year) => {
      if (!paymentsData.length) {
        log("HomePage.jsx: Cannot queue update, paymentsData is empty");
        setErrorMessage("Please wait for data to load before making updates.");
        return;
      }
      
      if (!paymentsData[rowIndex]) {
        log("HomePage.jsx: Invalid rowIndex:", rowIndex);
        setErrorMessage("Invalid row index.");
        return;
      }

      const key = `${rowIndex}-${month}`;
      
      if (debounceTimersRef.current[key]) {
        clearTimeout(debounceTimersRef.current[key]);
      }

      setPendingUpdates((prev) => ({
        ...prev,
        [key]: true,
      }));

      debounceTimersRef.current[key] = setTimeout(() => {
        const existingIndex = updateQueueRef.current.findIndex(
          (update) => update.rowIndex === rowIndex && update.month === month
        );
        
        if (existingIndex !== -1) {
          updateQueueRef.current[existingIndex] = {
            rowIndex,
            month,
            value,
            year,
            timestamp: Date.now(),
          };
        } else {
          updateQueueRef.current.push({
            rowIndex,
            month,
            value,
            year,
            timestamp: Date.now(),
          });
        }

        log("HomePage.jsx: Queued update:", { rowIndex, month, value, year });

        if (!batchTimerRef.current) {
          const batchDelay = updateQueueRef.current.length > 5 ? 500 : 700;
          batchTimerRef.current = setTimeout(processBatchUpdates, batchDelay);
        }

        delete debounceTimersRef.current[key];
      }, 600);
    },
    [paymentsData, setErrorMessage, processBatchUpdates]
  );

 const handleYearChangeDebounced = useCallback(
  debounce(async (year) => {
    log("HomePage.jsx: Year change requested to:", year);
    
    // Clear existing states to prevent stale data
    setPaymentsData([]);
    setLocalInputValues({});
    setPendingUpdates({});
    updateQueueRef.current = []; // Clear pending updates queue
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
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

const handleInputChange = useCallback(
  (rowIndex, month, value) => {
    const trimmedValue = value.trim();
    const parsedValue = trimmedValue === "" || trimmedValue === "0.00" ? "0" : trimmedValue;

    if (trimmedValue !== "" && trimmedValue !== "0.00" && (isNaN(parseFloat(parsedValue)) || parseFloat(parsedValue) < 0)) {
      setErrorMessage("Please enter a valid non-negative number.");
      return;
    }

    const key = `${rowIndex}-${month}`;
    setLocalInputValues((prev) => ({
      ...prev,
      [key]: trimmedValue,
    }));

    // Create updated row with new value
    const updatedRow = { ...paymentsData[rowIndex], [month]: parsedValue };
    
    // Recalculate Due_Payment using the same logic as backend
    const recalculatedDue = calculateDuePayment(updatedRow, months, currentYear);

    // Update the frontend view immediately with new due payment
    setPaymentsData((prev) => {
      const newData = [...prev];
      newData[rowIndex] = {
        ...newData[rowIndex],
        [month]: trimmedValue, // Use trimmedValue for UI consistency
        Due_Payment: recalculatedDue.toFixed(2),
      };
      log(`HomePage.jsx: handleInputChange: Real-time update for ${newData[rowIndex].Client_Name || 'unknown'}, ${month} = ${trimmedValue}, Due_Payment = ${recalculatedDue}`);
      return newData;
    });

    // Queue backend update (debounced)
    debouncedUpdate(rowIndex, month, parsedValue, currentYear);
  },
  [debouncedUpdate, paymentsData, currentYear, setPaymentsData, setErrorMessage, months, calculateDuePayment]
);




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
    updateQueueRef.current = [];
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
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

      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }

      if (updateQueueRef.current.length > 0 && mountedRef.current) {
        const updates = [...updateQueueRef.current];
        updateQueueRef.current = [];
      }
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
        () => typesAPI.addType({ type: capitalizedType }),
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
                        {months.map((month, colIndex) => (
                          <td
                            key={colIndex}
                            className="px-6 py-4 whitespace-nowrap text-center"
                          >
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
                          </td>
                        ))}
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