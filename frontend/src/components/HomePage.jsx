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
  const [currentPage, setCurrentPage] = useState(1); // Added for pagination
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

  const months = MONTHS;

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

const filteredData = useMemo(() => {
  return (paymentsData || [])
    .filter((row) => {
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
            getPaymentStatus(row, monthFilter.toLowerCase()) === "PartiallyPaid") ||
          (statusFilter === "Unpaid" &&
            getPaymentStatus(row, monthFilter.toLowerCase()) === "Unpaid");

      return matchesSearch && matchesMonth && matchesStatus;
    });
    // Removed .sort() - data is already sorted from App.jsx
}, [paymentsData, searchQuery, monthFilter, statusFilter, getPaymentStatus]);


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
  if (error.name === 'AbortError') {
    console.log('HomePage.jsx: Year fetch aborted');
    return;
  }
  console.error('HomePage.jsx: Error fetching user years:', error);
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
  console.log(`HomePage.jsx: Attempting to add new year: ${newYear}`);

  if (mountedRef.current) {
    setIsLoadingYears(true);
  }

  const controller = new AbortController();

  try {
    // Add new year
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

    // Clear cache for years and payments
    const yearsCacheKey = getCacheKey("/get-user-years", { sessionToken });
    const paymentsCacheKey = getCacheKey("/get-payments-by-year", { year: newYear, sessionToken });
    delete apiCacheRef.current[yearsCacheKey];
    delete apiCacheRef.current[paymentsCacheKey];

    // Fetch updated years
    await searchUserYears(controller.signal);

    // Fetch clients to get expected count
    const clientsResponse = await axios.get(`${BASE_URL}/get-clients`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      timeout: 10000,
      signal: controller.signal,
    });
    const expectedClientCount = clientsResponse.data.length;

    // Fetch payments for the new year
    const paymentsResponse = await axios.get(`${BASE_URL}/get-payments-by-year`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      params: { year: newYear },
      timeout: 10000,
      signal: controller.signal,
    });

    const paymentsData = paymentsResponse.data || [];
    setPaymentsData(paymentsData);
    setCurrentYear(newYear);
    localStorage.setItem("currentYear", newYear);

    // Validate client count
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
      console.log("HomePage.jsx: Add new year request cancelled");
      return;
    }
    console.error("HomePage.jsx: Error adding new year:", error);
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

const processBatchUpdates = useCallback(
  async () => {
    if (!updateQueueRef.current.length) {
      console.log("HomePage.jsx: No updates to process");
      batchTimerRef.current = null;
      return;
    }

    const updates = [...updateQueueRef.current];
    updateQueueRef.current = [];
    batchTimerRef.current = null;
    
    console.log(`HomePage.jsx: Processing batch of ${updates.length} updates`, updates);
    setIsUpdating(true);

    // Pre-build caches for performance
    const rowDataCache = new Map();
    const localValuesCache = { ...localInputValues };
    const missingContactClients = [];

    // Single pass to build row data cache
    updates.forEach(({ rowIndex }) => {
      if (!rowDataCache.has(rowIndex) && paymentsData[rowIndex]) {
        rowDataCache.set(rowIndex, paymentsData[rowIndex]);
      }
    });

    // Optimized grouping by row with reduced object creation
    const updatesByRow = new Map();
    
    updates.forEach(({ rowIndex, month, value, year }) => {
      const rowData = rowDataCache.get(rowIndex);
      if (!rowData) {
        console.warn(`HomePage.jsx: Invalid rowIndex ${rowIndex}`);
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
          duePayment: rowData.Due_Payment || "0.00",
          rowData,
        });
      }
      
      updatesByRow.get(rowIndex).updates.push({ month, value });
    });

    // Prepare batch state updates
    const stateUpdates = {
      paymentsDataUpdates: new Map(),
      pendingUpdatesToClear: new Set(),
      localValuesToUpdate: { ...localValuesCache },
    };

    try {
      // Process updates with optimized parallel execution
      const updatePromises = Array.from(updatesByRow.values()).map(async (rowUpdate) => {
        const { rowIndex, year, updates, clientName, type, clientEmail, clientPhone, duePayment, rowData } = rowUpdate;

        // Pre-calculate optimistic updates
        const optimisticRowData = { ...rowData };
        const statusCalculations = [];
        const amountToBePaid = parseFloat(rowData.Amount_To_Be_Paid) || 0;

        updates.forEach(({ month, value }) => {
          optimisticRowData[month] = value || "";
          
          // Pre-calculate status for notifications
          const paidInMonth = parseFloat(value) || 0;
          let status;
          if (paidInMonth === 0) status = "Unpaid";
          else if (paidInMonth >= amountToBePaid) status = "Paid";
          else status = "PartiallyPaid";
          
          statusCalculations.push({ 
            month, 
            status, 
            paidAmount: paidInMonth, 
            expectedAmount: amountToBePaid 
          });
        });

        // Efficient due payment calculation
        const activeMonths = months.filter(
          (m) => optimisticRowData[m] && parseFloat(optimisticRowData[m]) >= 0
        ).length;
        
        const expectedPayment = amountToBePaid * activeMonths;
        const totalPayments = months.reduce(
          (sum, m) => sum + (parseFloat(optimisticRowData[m]) || 0),
          0
        );
        
        optimisticRowData.Due_Payment = Math.max(expectedPayment - totalPayments, 0).toFixed(2);

        // Store optimistic update
        stateUpdates.paymentsDataUpdates.set(rowIndex, optimisticRowData);

        try {
          // API call with optimized timeout and retry logic
          const response = await axios.post(
            `${BASE_URL}/batch-save-payments`,
            { clientName, type, updates },
            {
              headers: { 
                Authorization: `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
              },
              params: { year },
              timeout: 8000, // Balanced timeout for reliability
              validateStatus: (status) => status < 500, // Don't retry on client errors
            }
          );

          const { updatedRow } = response.data;

          // Prepare local values update efficiently
          updates.forEach(({ month }) => {
            const key = `${rowIndex}-${month}`;
            stateUpdates.localValuesToUpdate[key] = updatedRow[month] || "";
            stateUpdates.pendingUpdatesToClear.add(key);
          });

          // Handle notifications asynchronously for performance
          const notifyStatuses = statusCalculations.filter(
            ({ status }) => status === "PartiallyPaid" || status === "Unpaid"
          );

          if (notifyStatuses.length > 0 && (clientEmail || clientPhone)) {
            // Non-blocking notification handling
            handleNotifications(
              clientName,
              clientEmail,
              clientPhone,
              type,
              year,
              notifyStatuses,
              duePayment
            ).then((notificationSent) => {
              if (!notificationSent) {
                missingContactClients.push(clientName);
              }
            }).catch(() => {
              missingContactClients.push(clientName);
            });
          }

          return {
            success: true,
            rowIndex,
            updatedRow,
            updates,
            hasNotificationContact: !!(clientEmail || clientPhone),
          };
        } catch (error) {
          console.error(`HomePage.jsx: Failed to batch update row ${rowIndex}:`, error);
          return {
            success: false,
            rowIndex,
            error: error.response?.data?.error || error.message,
            updates,
          };
        }
      });

      // Wait for all updates with better error handling
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
          // Handle rejected promises
          console.error('Promise rejected:', result.reason);
        }
      });

      // Optimized batch state updates
      if (successfulUpdates.length > 0) {
        // Single payments data update
        setPaymentsData((prev) => {
          const updated = [...prev];
          successfulUpdates.forEach(({ rowIndex, updatedRow }) => {
            if (updatedRow && updated[rowIndex]) {
              updated[rowIndex] = { ...updated[rowIndex], ...updatedRow };
            }
          });
          return updated;
        });

        // Single pending updates cleanup
        setPendingUpdates((prev) => {
          const newPending = { ...prev };
          successfulUpdates.forEach(({ updates, rowIndex }) => {
            updates.forEach(({ month }) => {
              delete newPending[`${rowIndex}-${month}`];
            });
          });
          return newPending;
        });

        // Single local input values update
        setLocalInputValues((prev) => {
          const newValues = { ...prev };
          successfulUpdates.forEach(({ updates, rowIndex, updatedRow }) => {
            updates.forEach(({ month }) => {
              const key = `${rowIndex}-${month}`;
              newValues[key] = updatedRow[month] || "";
            });
          });
          return newValues;
        });
      }

      // Handle failures efficiently
      if (failedUpdates.length > 0) {
        const retryUpdates = [];
        
        failedUpdates.forEach(({ rowIndex, updates, error }) => {
          const rowData = rowDataCache.get(rowIndex);
          const errorMsg = `Failed to update ${rowData?.Client_Name || "unknown"}: ${error}`;
          
          setLocalErrorMessage(errorMsg);
          setErrorMessage(errorMsg);

          // Revert optimistic updates for failed rows
          setPaymentsData((prev) =>
            prev.map((row, idx) =>
              idx === rowIndex ? rowDataCache.get(rowIndex) || row : row
            )
          );

          // Queue retries
          updates.forEach((update) => retryUpdates.push({ ...update, rowIndex }));
        });

        // Add retries to queue
        updateQueueRef.current.unshift(...retryUpdates);
      }

      // Handle missing contact notifications
      if (missingContactClients.length > 0) {
        const errorMsg = `Payments updated, but notifications could not be sent to: ${missingContactClients.join(
          ", "
        )} (missing valid phone number or email address).`;
        setLocalErrorMessage(errorMsg);
        setErrorMessage(errorMsg);
      } else if (failedUpdates.length === 0) {
        setLocalErrorMessage("");
        setErrorMessage("");
      }

      // Schedule retry with exponential backoff
      if (updateQueueRef.current.length > 0) {
        console.log("HomePage.jsx: Scheduling retry for failed updates");
        const retryDelay = Math.min(1000 * Math.pow(2, failedUpdates.length), 5000);
        batchTimerRef.current = setTimeout(processBatchUpdates, retryDelay);
      }

    } catch (error) {
      console.error("HomePage.jsx: Batch update error:", error);
      
      // Enhanced error handling
      const errorMsg = error.response?.data?.error || error.message;
      let userMessage = "Batch update failed. Please try again.";

      if (errorMsg.includes("Sheet not found")) {
        userMessage = "Payment data not found. Please refresh and try again.";
      } else if (errorMsg.includes("Quota exceeded")) {
        userMessage = "Server is busy. Please try again in a few minutes.";
      } else if (errorMsg.includes("Payment record not found")) {
        userMessage = "Client payment data not found. Please add the client first.";
      } else if (errorMsg.includes("timeout")) {
        userMessage = "Request timed out. Please check your connection and try again.";
      }

      setLocalErrorMessage(userMessage);
      setErrorMessage(userMessage);
      
      // Re-queue failed updates
      updateQueueRef.current = [...updates, ...updateQueueRef.current];
      batchTimerRef.current = setTimeout(processBatchUpdates, 2000);
    } finally {
      setIsUpdating(false);
    }
  },
  [paymentsData, sessionToken, months, localInputValues, hasValidEmail, setErrorMessage, setLocalErrorMessage]
);

// Separate notification handler to avoid blocking main updates
const handleNotifications = useCallback(
  async (clientName, clientEmail, clientPhone, type, year, notifyStatuses, duePayment) => {
    console.log(`HomePage.jsx: Starting notification for ${clientName}`, {
      clientEmail,
      clientPhone,
      type,
      year,
      notifyStatuses,
    });

    const hasValidPhone = clientPhone && /^\+?[\d\s-]{10,15}$/.test(clientPhone.trim());
    const hasValidEmailAddress = hasValidEmail({ Email: clientEmail, email: clientEmail });

    console.log(`HomePage.jsx: Notification checks`, {
      hasValidPhone,
      hasValidEmailAddress,
      clientName,
    });

    let notificationSent = false;

    // Try WhatsApp first
    if (hasValidPhone) {
      let isValidWhatsApp = true;

      try {
        console.log(`HomePage.jsx: Verifying WhatsApp for ${clientPhone}`);
        const verifyResponse = await axios.post(
          `${BASE_URL}/verify-whatsapp-contact`,
          { phone: clientPhone.trim() },
          {
            headers: { Authorization: `Bearer ${sessionToken}` },
            timeout: 5000,
          }
        );

        if (!verifyResponse.data.isValidWhatsApp) {
          console.log(`HomePage.jsx: ${clientPhone} is not registered with WhatsApp`);
          setLocalErrorMessage(
            `Cannot send WhatsApp message to ${clientName}: Phone number is not registered with WhatsApp.`
          );
          isValidWhatsApp = false;
        }
      } catch (verifyError) {
        console.error(`HomePage.jsx: WhatsApp verification failed for ${clientPhone} (${clientName})`, {
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

          console.log(`HomePage.jsx: Sending WhatsApp to ${clientPhone}`);
          const response = await axios.post(
            `${BASE_URL}/send-whatsapp`,
            {
              to: clientPhone.trim(),
              message: messageContent,
            },
            {
              headers: { Authorization: `Bearer ${sessionToken}` },
              timeout: 10000,
            }
          );

          console.log(`HomePage.jsx: WhatsApp sent successfully to ${clientPhone} for ${clientName}`, {
            messageId: response.data.messageId || "N/A",
          });
          notificationSent = true;
        } catch (whatsappError) {
          console.error(`HomePage.jsx: WhatsApp attempt failed for ${clientPhone} (${clientName})`, {
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
      console.log(`HomePage.jsx: No valid phone number for ${clientName}, checking email`);
    }

    // Fallback to email if WhatsApp fails or no valid phone
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

        console.log(`HomePage.jsx: Sending email to ${clientEmail} for ${clientName}`);
        const response = await axios.post(
          `${BASE_URL}/send-email`,
          {
            to: clientEmail.trim(),
            subject: `Payment Status Update - ${clientName} (${type}) - ${year}`,
            html: emailContent,
          },
          {
            headers: { Authorization: `Bearer ${sessionToken}` },
            timeout: 10000,
          }
        );

        console.log(`HomePage.jsx: Email sent successfully to ${clientEmail} for ${clientName}`, {
          messageId: response.data.messageId || "N/A",
        });
        notificationSent = true;
        setLocalErrorMessage(`Email notification sent successfully to ${clientName}`);
      } catch (emailError) {
        console.error(`HomePage.jsx: Email failed for ${clientEmail} (${clientName})`, {
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
      console.log(`HomePage.jsx: No valid contact for ${clientName}`);
      setLocalErrorMessage(
        `No notification sent for ${clientName}: No valid phone or email provided.`
      );
    } else if (!notificationSent) {
      console.log(`HomePage.jsx: Email not attempted for ${clientName} due to invalid email`);
      setLocalErrorMessage(
        `No notification sent for ${clientName}: Email address invalid or missing.`
      );
    }

    return notificationSent;
  },
  [sessionToken, hasValidEmail, setLocalErrorMessage]
);


const debouncedUpdate = useCallback(
  (rowIndex, month, value, year) => {
    // Early validation checks
    if (!paymentsData.length) {
      console.warn("HomePage.jsx: Cannot queue update, paymentsData is empty");
      setErrorMessage("Please wait for data to load before making updates.");
      return;
    }
    
    if (!paymentsData[rowIndex]) {
      console.warn("HomePage.jsx: Invalid rowIndex:", rowIndex);
      setErrorMessage("Invalid row index.");
      return;
    }

    const key = `${rowIndex}-${month}`;
    
    // Clear existing timer to prevent duplicate operations
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key]);
    }

    // Mark as pending immediately for UI feedback
    setPendingUpdates((prev) => ({
      ...prev,
      [key]: true,
    }));

    // Optimized debounce with reduced timer
    debounceTimersRef.current[key] = setTimeout(() => {
      // Efficient queue management - remove duplicates in one pass
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

      console.log("HomePage.jsx: Queued update:", { rowIndex, month, value, year });

      // Start batch processing with adaptive timing
      if (!batchTimerRef.current) {
        const batchDelay = updateQueueRef.current.length > 5 ? 500 : 700; // Faster for larger batches
        batchTimerRef.current = setTimeout(processBatchUpdates, batchDelay);
      }

      delete debounceTimersRef.current[key];
    }, 600); // Reduced debounce time for faster response
  },
  [paymentsData, setErrorMessage]
);

  const handleYearChangeDebounced = useCallback(
    (year) => {
      console.log("HomePage.jsx: Year change requested to:", year);
      localStorage.setItem("currentYear", year);
      setCurrentYear(year);
      window.location.reload();
    },
    [setCurrentYear]
  );

const handleInputChange = useCallback(
  (rowIndex, month, value) => {
    // Input validation with early return
    const trimmedValue = value.trim();
    const parsedValue = trimmedValue === "" ? "" : parseFloat(trimmedValue);
    
    if (trimmedValue !== "" && (isNaN(parsedValue) || parsedValue < 0)) {
      setErrorMessage("Please enter a valid non-negative number.");
      return;
    }

    const key = `${rowIndex}-${month}`;
    
    // Batch state update to reduce re-renders
    setLocalInputValues((prev) => ({
      ...prev,
      [key]: trimmedValue,
    }));

    // Optimized intermediate month filling logic
    const rowData = paymentsData[rowIndex];
    if (rowData && trimmedValue !== "") {
      const currentMonthIndex = months.indexOf(month);
      
      // Find last paid month more efficiently
      let lastPaidMonthIndex = -1;
      for (let i = 0; i < months.length; i++) {
        const monthValue = parseFloat(rowData[months[i]] || 0);
        if (monthValue > 0) {
          lastPaidMonthIndex = i;
        }
      }

      // Fill intermediate months if needed
      if (lastPaidMonthIndex >= 0 && currentMonthIndex > lastPaidMonthIndex + 1) {
        const intermediateUpdates = {};
        
        for (let i = lastPaidMonthIndex + 1; i < currentMonthIndex; i++) {
          const intermediateMonth = months[i];
          const intermediateKey = `${rowIndex}-${intermediateMonth}`;
          
          // Only update if not already modified by user
          if (
            localInputValues[intermediateKey] === undefined ||
            localInputValues[intermediateKey] === rowData[intermediateMonth]
          ) {
            intermediateUpdates[intermediateKey] = "0";
            // Queue update for intermediate month
            debouncedUpdate(rowIndex, intermediateMonth, "0", currentYear);
          }
        }
        
        // Batch update intermediate months
        if (Object.keys(intermediateUpdates).length > 0) {
          setLocalInputValues((prev) => ({
            ...prev,
            ...intermediateUpdates,
          }));
        }
      }
    }

    // Queue the main update
    debouncedUpdate(rowIndex, month, trimmedValue, currentYear);
  },
  [debouncedUpdate, currentYear, paymentsData, localInputValues, months, setErrorMessage]
);

useEffect(() => {
  const loadPaymentsData = async () => {
    if (!sessionToken || !currentYear) return;

    const paymentsCacheKey = getCacheKey("/get-payments-by-year", {
      year: currentYear,
      sessionToken,
    });

    // Always fetch fresh data if refreshTrigger changes
    console.log(`HomePage.jsx: Fetching payments for year ${currentYear} due to refreshTrigger`);
    try {
      const response = await axios.get(`${BASE_URL}/get-payments-by-year`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        params: { year: currentYear },
        timeout: 10000,
      });
      setPaymentsData(response.data || []);
      setCachedData(paymentsCacheKey, response.data || []);
    } catch (error) {
      console.error("HomePage.jsx: Error fetching payments:", error);
      setLocalErrorMessage(
        error.response?.data?.error || "Failed to load payments data."
      );
    }
  };

  loadPaymentsData();
}, [sessionToken, currentYear, refreshTrigger, getCacheKey, getCachedData, setCachedData, setPaymentsData]);

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
      }
    }, 5000);
    return () => clearTimeout(timer);
  }
}, [errorMessage]);

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
    const response = await retryWithBackoff(
      () =>
        axios.post(
          `${BASE_URL}/add-type`,
          { type: capitalizedType },
          {
            headers: { Authorization: `Bearer ${sessionToken}` },
            timeout: 5000, // Increased timeout
          }
        ),
      3,
      1000
    );
    console.log(`HomePage.jsx: Added ${capitalizedType} for ${currentUser}`, response.data);
    setIsTypeModalOpen(false);
    setNewType("");
    setSearchQuery("");
    setLocalErrorMessage("");
    const cacheKey = `types_${currentUser}_${sessionToken}`;
    delete apiCacheRef.current[cacheKey];
    await fetchTypes();
    alert(`Type ${capitalizedType} added successfully.`);
  } catch (error) {
    console.error(`HomePage.jsx: Error adding type for ${currentUser}:`, error);
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
      console.log("HomePage.jsx: SessionToken available, fetching years");
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

useEffect(() => {
  if (errorMessage) {
    const timer = setTimeout(() => {
      setLocalErrorMessage("");
      setErrorMessage(""); // Clear parent error state
    }, 5000);
    return () => clearTimeout(timer);
  }
}, [errorMessage, setErrorMessage]);


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
                        {!searchQuery && "Get started by adding a payment."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, rowIndex) => (
                  <tr
                    key={`${row?.Client_Name || "unknown"}-${rowIndex}`}
                    onContextMenu={(e) => handleContextMenu(e, (currentPage - 1) * entriesPerPage + rowIndex)}
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
                            localInputValues[`${(currentPage - 1) * entriesPerPage + rowIndex}-${month}`] !== undefined
                              ? localInputValues[`${(currentPage - 1) * entriesPerPage + rowIndex}-${month}`]
                              : row?.[month] || ""
                          }
                          onChange={(e) =>
                            handleInputChange((currentPage - 1) * entriesPerPage + rowIndex, month, e.target.value)
                          }
                          className={`w-20 p-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base ${getInputBackgroundColor(
                            row,
                            month,
                            (currentPage - 1) * entriesPerPage + rowIndex
                          )}`}
                          placeholder="0.00"
                          title={
                            pendingUpdates[`${(currentPage - 1) * entriesPerPage + rowIndex}-${month}`]
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
                ))
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
};


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
    if (status === "Unpaid") return "bg-red-100 text-red-800";
    if (status === "PartiallyPaid") return "bg-yellow-100 text-yellow-800";
    if (status === "Paid") return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-800";
  };

  const entriesPerPage = 10;
  
  const paginatedClients = Object.keys(monthStatus).slice(
  (currentPage - 1) * entriesPerPage,
  currentPage * entriesPerPage
);
const totalEntries = Object.keys(monthStatus).length;
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
                  <td
                    colSpan={14}
                    className="px-6 py-12 text-center text-gray-500"
                  >
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
                  // Find the corresponding payment data for this client
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
                      {months.map((month, mIdx) => (
                        <td
                          key={mIdx}
                          className="px-6 py-4 whitespace-nowrap text-center"
                        >
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusBackgroundColor(
                              monthStatus[client]?.[month] || "Unpaid"
                            )}`}
                          >
                            {monthStatus[client]?.[month] || "Unpaid"}
                          </span>
                        </td>
                      ))}
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