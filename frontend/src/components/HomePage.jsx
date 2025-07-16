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
import BatchStatus from './BatchStatus.jsx';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import DataTable from './DataTable.jsx';
import usePerformanceMonitor from '../hooks/usePerformanceMonitor';
import apiCacheManager from '../utils/apiCache';
import PerformanceDashboard from './PerformanceDashboard.jsx';
const BATCH_DELAY = 3000; // Increased from 1000 to 3000ms
const BATCH_SIZE = 3; // Reduced from 5 to 3
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
  showToast = () => {},
}) => {
  const [availableYears, setAvailableYears] = useState(["2025"]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [localInputValues, setLocalInputValues] = useState({});
  const [pendingUpdates, setPendingUpdates] = useState({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isUpdating, setIsUpdating] = useState(false);
  const debounceTimersRef = useRef({});
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
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const pendingUpdatesRef = useRef({}); // Track in-flight updates by key
  const [showPerformanceDashboard, setShowPerformanceDashboard] = useState(false);
  const [previousYearDueMap, setPreviousYearDueMap] = useState({});

  // Performance monitoring
  const performanceMonitor = usePerformanceMonitor('HomePage', {
    trackRenders: true,
    trackApiCalls: true,
    logToConsole: process.env.NODE_ENV === 'development'
  });

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

  // Helper to build previous year due map
  const buildPreviousYearDueMap = useCallback((prevYearPayments) => {
    const map = {};
    prevYearPayments.forEach(row => {
      const key = `${row.Client_Name}|||${row.Type}`;
      map[key] = parseFloat(row.Due_Payment) || 0;
    });
    return map;
  }, []);

  // Load previous year's payments if currentYear > 2025
  useEffect(() => {
    const loadPrevYearDue = async () => {
      if (parseInt(currentYear) > 2025 && sessionToken) {
        const prevYear = (parseInt(currentYear) - 1).toString();
        try {
          const response = await paymentsAPI.getPaymentsByYear(prevYear);
          const prevYearPayments = Array.isArray(response.data) ? response.data : [];
          setPreviousYearDueMap(buildPreviousYearDueMap(prevYearPayments));
        } catch (err) {
          setPreviousYearDueMap({});
        }
      } else {
        setPreviousYearDueMap({});
      }
    };
    loadPrevYearDue();
  }, [currentYear, sessionToken, buildPreviousYearDueMap]);

  // Updated calculateDuePayment to accept previousYearsDue
  const calculateDuePayment = (rowData, months, currentYear, previousYearsDue = 0) => {
    log(`HomePage.jsx: calculateDuePayment for ${rowData.Client_Name || 'unknown'}, Year = ${currentYear}`);
    const sanitizedData = validateRowData(rowData, currentYear);
    const amountToBePaid = parseFloat(sanitizedData.Amount_To_Be_Paid) || 0;
    if (amountToBePaid <= 0) {
      log(`HomePage.jsx: calculateDuePayment: Returning 0 due to invalid Amount_To_Be_Paid: ${amountToBePaid}`);
      return 0;
    }
    const totalPaymentsMade = months.reduce((sum, month) => {
      const rawValue = sanitizedData[month];
      const payment = (rawValue === "" || rawValue === "0.00" || rawValue == null) ? 0 : parseFloat(rawValue);
      if (isNaN(payment) || payment < 0) {
        log(`HomePage.jsx: calculateDuePayment: Invalid payment for ${month}: ${rawValue}, treating as 0`);
        return sum;
      }
      return sum + payment;
    }, 0);
    const activeMonths = months.filter((month) => {
      const rawValue = sanitizedData[month];
      return rawValue !== "" && rawValue !== null && rawValue !== undefined;
    }).length;
    const expectedTotal = activeMonths * amountToBePaid;
    const currentYearDue = Math.max(expectedTotal - totalPaymentsMade, 0);
    let totalDue = currentYearDue;
    if (parseInt(currentYear) > 2025) {
      totalDue = previousYearsDue + currentYearDue;
    }
    return Math.round(totalDue * 100) / 100;
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
        showToast(errorMsg, 'error', 5000);
      } else if (paymentsData.length < expectedClientCount) {
        const errorMsg = `Warning: Only ${paymentsData.length} client(s) found for ${newYear}. Expected ${expectedClientCount} clients from the Clients sheet.`;
        setLocalErrorMessage(errorMsg);
        setErrorMessage(errorMsg);
        showToast(errorMsg, 'warning', 5000);
      } else {
        setLocalErrorMessage("");
        setErrorMessage("");
        showToast(`Year ${newYear} added successfully with ${paymentsData.length} clients.`, 'success', 3000);
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
        showToast(userMessage, 'info', 3000);
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
      showToast(userMessage, 'error', 5000);
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

  // Patch all due payment calculations to use previousYearDueMap
  const getPreviousYearsDue = (row) => {
    if (parseInt(currentYear) > 2025) {
      const key = `${row.Client_Name}|||${row.Type}`;
      return previousYearDueMap[key] || 0;
    }
    return 0;
  };

  // Patch debouncedUpdate
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
      debounceTimersRef.current[key] = setTimeout(async () => {
        try {
          const originalRow = paymentsData[rowIndex];
          log(`HomePage.jsx: Saving payment for ${originalRow.Client_Name}, month: ${month}, value: ${value}, year: ${currentYear}`);
          if (!currentYear || currentYear === 'undefined' || currentYear === 'null') {
            log(`HomePage.jsx: Invalid currentYear: ${currentYear}, type: ${typeof currentYear}`);
            throw new Error(`Invalid year: ${currentYear}`);
          }
          const response = await paymentsAPI.savePayment({
            clientName: originalRow.Client_Name,
            type: originalRow.Type,
            month: month.toLowerCase(),
            value: value || ""
          }, currentYear);
          if (response.data.updatedRow) {
            setPaymentsData((prev) =>
              prev.map((row, idx) => {
                if (idx !== rowIndex) return row;
                const updatedRow = {
                  ...row,
                  ...response.data.updatedRow,
                  Email: row.Email || response.data.updatedRow.Email,
                };
                // Use previousYearsDue from map
                const previousYearsDue = getPreviousYearsDue(updatedRow);
                const recalculatedDue = calculateDuePayment(updatedRow, months, currentYear, previousYearsDue);
                updatedRow.Due_Payment = recalculatedDue.toFixed(2);
                log(`HomePage.jsx: debouncedUpdate: Updated due payment for ${updatedRow.Client_Name || 'unknown'} to ${recalculatedDue}`);
                return updatedRow;
              })
            );
          }
          setPendingUpdates((prev) => {
            const newPending = { ...prev };
            delete newPending[key];
            return newPending;
          });
          setLastUpdateTime(Date.now());
          log("HomePage.jsx: Payment saved successfully");
        } catch (error) {
          log(`HomePage.jsx: Error saving payment:`, error);
          log(`HomePage.jsx: Error details - status: ${error.response?.status}, data:`, error.response?.data);
          setPendingUpdates((prev) => {
            const newPending = { ...prev };
            delete newPending[key];
            return newPending;
          });
          setErrorMessage(`Failed to save payment: ${error.response?.data?.error || error.message}`);
        }
        delete debounceTimersRef.current[key];
      }, 1000);
    },
    [paymentsData, setErrorMessage, setPaymentsData, currentYear, months, calculateDuePayment, getPreviousYearsDue]
  );

  // Patch handleInputChange
  const handleInputChange = useCallback(
    (rowIndex, month, value) => {
      const trimmedValue = value.trim();
      // If cleared, set to empty string
      const parsedValue = trimmedValue === "" ? "" : (trimmedValue === "0.00" ? "0" : trimmedValue);
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
      // Use previousYearsDue from map
      const previousYearsDue = getPreviousYearsDue(updatedRow);
      const recalculatedDue = calculateDuePayment(updatedRow, months, currentYear, previousYearsDue);
      setPaymentsData((prev) => {
        const newData = [...prev];
        newData[rowIndex] = {
          ...newData[rowIndex],
          [month]: trimmedValue, // Use trimmedValue for UI consistency
          Due_Payment: recalculatedDue.toFixed(2),
        };
        return newData;
      });
      // Queue backend update (debounced) - only if value actually changed
      const currentValue = paymentsData[rowIndex]?.[month] || "";
      if (trimmedValue !== currentValue) {
        debouncedUpdate(rowIndex, month, parsedValue, currentYear);
      }
    },
    [debouncedUpdate, paymentsData, currentYear, setPaymentsData, setErrorMessage, months, calculateDuePayment, getPreviousYearsDue]
  );




  useEffect(() => {
  const loadPaymentsData = async () => {
    if (!sessionToken || !currentYear) return;

    // Prevent multiple simultaneous loads
    if (isLoadingPayments) {
      log("HomePage.jsx: Already loading payments, skipping");
      return;
    }

    setIsLoadingPayments(true);
    log(`HomePage.jsx: Fetching payments for year ${currentYear} due to refreshTrigger: ${refreshTrigger}`);
    
    const cacheKey = apiCacheManager.generateKey('payments', { year: currentYear, user: currentUser });
    const startTime = performance.now();

    // Clear stale states
    setLocalInputValues({});
    setPendingUpdates({});
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    // Invalidate cache if refreshTrigger changes
    if (refreshTrigger && refreshTrigger !== lastRefreshTrigger) {
      log(`HomePage.jsx: Invalidating cache for payments_${currentYear} due to refreshTrigger change`);
      apiCacheManager.invalidate(`payments|year:${currentYear}`);
      setLastRefreshTrigger(refreshTrigger);
    }

    try {
      const forceRefresh = refreshTrigger && refreshTrigger !== lastRefreshTrigger;
      
      const result = await apiCacheManager.executeWithCache(
        cacheKey,
        () => fetchPayments(sessionToken, currentYear, forceRefresh),
        {
          forceRefresh,
          cacheDuration: 5 * 60 * 1000, // 5 minutes
          retries: 2, // Reduced from 3 to 2
          retryDelay: 2000 // Increased from 1000 to 2000ms
        }
      );

      performanceMonitor.trackApiCall('fetchPayments', startTime);
      log(`HomePage.jsx: Payments fetched for year ${currentYear}: ${paymentsData.length} items`);

      if (paymentsData.length > 0) {
        log("🔍 Sample Row for Debug:", paymentsData[0]);
      }
    } catch (error) {
      log('HomePage.jsx: Error fetching payments:', error);
      setLocalErrorMessage(
        error.response?.data?.error || 'Failed to load payments data.'
      );
      
      // Try to get cached data as fallback
      const cachedData = apiCacheManager.get(cacheKey);
      if (cachedData && !refreshTrigger) {
        setPaymentsData(cachedData);
        log(`HomePage.jsx: Using cached payments for ${currentYear}: ${cachedData.length} items`);
      }
    } finally {
      setIsLoadingPayments(false);
    }
  };

  // Add a small delay to prevent rapid successive calls
  const timeoutId = setTimeout(() => {
    loadPaymentsData();
  }, 100);

  return () => clearTimeout(timeoutId);
}, [sessionToken, currentYear, fetchPayments, setPaymentsData, refreshTrigger, lastRefreshTrigger, setLocalErrorMessage, currentUser, performanceMonitor, isLoadingPayments]);

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

  // Clear local states when paymentsData changes (e.g., when year changes)
  useEffect(() => {
    if (paymentsData.length > 0) {
      setLocalInputValues({});
      setPendingUpdates({});
      log(`HomePage.jsx: Cleared local states for new paymentsData with ${paymentsData.length} items`);
    }
  }, [paymentsData]);

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
        <BatchStatus
          isUpdating={Object.keys(pendingUpdates).length > 0}
          pendingCount={Object.keys(pendingUpdates).length}
          lastUpdateTime={lastUpdateTime}
          hasUnsavedChanges={Object.keys(pendingUpdates).length > 0}
          batchStatus={null}
        />
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
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Payment Data</h3>
              <button
                onClick={() => {
                  log("HomePage.jsx: Add Type button clicked");
                  setIsTypeModalOpen(true);
                }}
                className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
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
            </div>
            <DataTable
              data={paginatedData}
              months={months}
              onCellEdit={handleInputChange}
              onContextMenu={handleContextMenu}
              isLoading={isLoadingPayments}
              currentYear={currentYear}
              showToast={showToast}
              localInputValues={localInputValues}
              handleInputChange={handleInputChange}
              getInputBackgroundColor={getInputBackgroundColor}
              pendingUpdates={pendingUpdates}
              isReportsPage={isReportsPage}
            />
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

  // Restore handleYearChangeDebounced
  const handleYearChangeDebounced = useCallback(
    debounce(async (year) => {
      log("HomePage.jsx: Year change requested to:", year);
      setLocalInputValues({});
      setPendingUpdates({});
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      if (handleYearChange) {
        await handleYearChange(year);
      } else {
        localStorage.setItem("currentYear", year);
        setCurrentYear(year);
      }
      log("HomePage.jsx: Year change completed");
    }, 1000),
    [setCurrentYear, handleYearChange, setLocalInputValues, setPendingUpdates]
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
      
      {/* Performance Dashboard Toggle */}
      <button
        onClick={() => setShowPerformanceDashboard(!showPerformanceDashboard)}
        className="fixed bottom-4 left-4 z-40 bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-colors"
        title="Performance Dashboard"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </button>

      {/* Performance Dashboard */}
      <PerformanceDashboard
        isVisible={showPerformanceDashboard}
        onClose={() => setShowPerformanceDashboard(false)}
      />

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