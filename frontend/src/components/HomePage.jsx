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
  const [typeError, setTypeError] = useState("");
  const [errorMessage, setLocalErrorMessage] = useState("");
  const [remarkPopup, setRemarkPopup] = useState({
    isOpen: false,
    clientName: '',
    type: '',
    month: '',
    currentRemark: 'N/A'
  });
  const [notificationQueue, setNotificationQueue] = useState([]);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('');
  const [isSendingNotifications, setIsSendingNotifications] = useState(false);

  // Refs
  const csvFileInputRef = useRef(null);
  const mountedRef = useRef(true);
  const saveTimeoutsRef = useRef({});
  const currentDataRef = useRef(paymentsData);
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

    const handleAddType = async () => {
    if (!newType.trim()) {
      setTypeError("Type cannot be empty.");
      return;
    }
    try {
      const response = await axios.post(
        `${BASE_URL}/add-type`,
        { type: newType.trim() },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      alert(response.data.message || "Type added successfully!");
      setIsTypeModalOpen(false);
      setNewType("");
      setTypeError("");
      // Refresh types immediately to update dropdowns
      if (fetchTypes) {
        await fetchTypes(sessionToken);
      }
    } catch (error) {
      setTypeError(error.response?.data?.error || "Failed to add type.");
    }
  };

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

  // Simplified save function with direct client/type reference instead of row indices
  const savePayment = useCallback(async (clientName, type, month, value, rowIndex) => {
    const key = `${rowIndex}-${month}`;
    
    console.log(`Attempting to save payment for ${clientName} (${type}), ${month}:`, { value });
    
    try {
      // Mark as pending immediately
      setPendingUpdates(prev => ({ ...prev, [key]: true }));
      
      // Save to backend using client name and type directly (not row index)
      const response = await axios.post(
        `${BASE_URL}/save-payment`,
        {
          clientName: clientName,
          type: type,
          month,
          value: value.trim() // Always trim value
        },
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
          params: { year: currentYear },
          timeout: 10000
        }
      );

      console.log('API response received:', response.data);

      // Update the payments data with the response
      if (response.data) {
        setPaymentsData(prev => {
          return prev.map(row => {
            // Match by client name and type instead of index
            if (row.Client_Name === clientName && row.Type === type) {
              return {
                ...row,
                [month]: value,
                Due_Payment: response.data.Due_Payment
              };
            }
            return row;
          });
        });
        console.log(`Updated ${clientName} (${type}) with Due_Payment: ${response.data.Due_Payment}`);
        
        // Add to notification queue instead of sending immediately
        const notificationData = {
          id: `${clientName}-${type}-${month}-${Date.now()}`,
          clientName,
          type,
          month,
          value,
          duePayment: response.data.Due_Payment,
          timestamp: new Date().toISOString(),
          email: response.data.Email || '',
          phone: response.data.Phone_Number || ''
        };
        
        setNotificationQueue(prev => {
          // Remove any existing notification for the same client/type/month
          const filtered = prev.filter(n => 
            !(n.clientName === clientName && n.type === type && n.month === month)
          );
          return [...filtered, notificationData];
        });
      }

      // Clear pending status
      setPendingUpdates(prev => {
        const newPending = { ...prev };
        delete newPending[key];
        console.log(`Cleared pending status for ${key}`);
        return newPending;
      });

    } catch (error) {
      console.error('Failed to save payment:', error);
      console.error('Error details:', error.response?.data);
      setErrorMessage(error.response?.data?.error || 'Failed to save payment');
      
      // Clear pending status even on error
      setPendingUpdates(prev => {
        const newPending = { ...prev };
        delete newPending[key];
        return newPending;
      });
      
      // Revert the local input value on error by finding the row with matching client/type
      const matchingRow = paymentsData.find(row => row.Client_Name === clientName && row.Type === type);
      if (matchingRow) {
        const originalValue = matchingRow[month] || "";
        setLocalInputValues(prev => ({ ...prev, [key]: originalValue }));
        console.log(`Reverted ${key} to original value: ${originalValue}`);
      }
    }
  }, [sessionToken, currentYear, setPaymentsData, setErrorMessage, paymentsData]);

  // Simplified input change handler with immediate save after timeout
  const handleInputChange = useCallback((rowIndex, month, value) => {
    const key = `${rowIndex}-${month}`;

    console.log(`Input changed for ${key}:`, value);

    // Update local input values immediately for responsive UI
    setLocalInputValues(prev => ({ ...prev, [key]: value }));
    
    // Clear any existing timeout for this key
    if (saveTimeoutsRef.current[key]) {
      clearTimeout(saveTimeoutsRef.current[key]);
      console.log(`Cleared existing timeout for ${key}`);
    }
    
    // Set new timeout for debounced save - reduced delay for faster response
    saveTimeoutsRef.current[key] = setTimeout(() => {
      if (mountedRef.current) {
        // Find the client name and type for this row index
        const currentRow = paymentsData[rowIndex];
        if (currentRow) {
          console.log(`Triggering save for ${key} with value: ${value.trim()}`);
          savePayment(currentRow.Client_Name, currentRow.Type, month, value, rowIndex);
        } else {
          console.warn(`No row found at index ${rowIndex}`);
        }
      }
      // Clean up the timeout reference
      delete saveTimeoutsRef.current[key];
    }, 1000); // Increased to 1 second to avoid too frequent API calls
  }, [savePayment, paymentsData]);

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

  // Update the current data ref whenever paymentsData changes
  useEffect(() => {
    currentDataRef.current = paymentsData;
  }, [paymentsData]);

  // Initialize default message template
  useEffect(() => {
    if (!messageTemplate) {
      setMessageTemplate(`Dear {clientName},

This is a payment reminder for your {type} service.

Payment Details:
- Service Type: {type}
- Month: {month}
- Amount Paid: ₹{paidAmount}
- Total Due Payment: ₹{duePayment}

Thank you for your business!

Best regards,
Payment Tracker Team`);
    }
  }, [messageTemplate]);

  // Handle sending notifications
  const handleSendNotifications = async (template) => {
    setIsSendingNotifications(true);
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      for (const notification of notificationQueue) {
        try {
          // Replace template variables
          const personalizedMessage = template
            .replace(/{clientName}/g, notification.clientName)
            .replace(/{type}/g, notification.type)
            .replace(/{month}/g, notification.month.charAt(0).toUpperCase() + notification.month.slice(1))
            .replace(/{paidAmount}/g, notification.value || '0.00')
            .replace(/{duePayment}/g, notification.duePayment || '0.00');

          let notificationSent = false;

          // Try WhatsApp first if phone number exists
          if (notification.phone && notification.phone.trim()) {
            try {
              const whatsappResponse = await axios.post(
                `${BASE_URL}/send-whatsapp`,
                {
                  to: notification.phone,
                  message: personalizedMessage
                },
                {
                  headers: { Authorization: `Bearer ${sessionToken}` },
                  timeout: 10000
                }
              );
              console.log(`WhatsApp sent to ${notification.clientName}:`, whatsappResponse.data);
              notificationSent = true;
              successCount++;
            } catch (whatsappError) {
              console.log(`WhatsApp failed for ${notification.clientName}, trying email...`);
            }
          }

          // Try Email if WhatsApp failed or no phone number
          if (!notificationSent && notification.email && notification.email.trim()) {
            try {
              const emailResponse = await axios.post(
                `${BASE_URL}/send-email`,
                {
                  to: notification.email,
                  subject: `Payment Reminder - ${notification.type}`,
                  html: personalizedMessage.replace(/\n/g, '<br>')
                },
                {
                  headers: { Authorization: `Bearer ${sessionToken}` },
                  timeout: 10000
                }
              );
              console.log(`Email sent to ${notification.clientName}:`, emailResponse.data);
              notificationSent = true;
              successCount++;
            } catch (emailError) {
              console.log(`Email failed for ${notification.clientName}`);
            }
          }

          if (!notificationSent) {
            errorCount++;
            errors.push(`${notification.clientName}: No valid contact method available`);
          }

          // Small delay between notifications to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          errorCount++;
          errors.push(`${notification.clientName}: ${error.message}`);
        }
      }

      // Clear notification queue after sending
      setNotificationQueue([]);
      setIsNotificationModalOpen(false);

      // Show results
      if (successCount > 0) {
        setLocalErrorMessage(`Successfully sent ${successCount} notifications. ${errorCount > 0 ? `${errorCount} failed.` : ''}`);
      }
      if (errors.length > 0) {
        console.log('Notification errors:', errors);
      }

    } catch (error) {
      console.error('Error sending notifications:', error);
      setLocalErrorMessage('Failed to send notifications: ' + error.message);
    } finally {
      setIsSendingNotifications(false);
    }
  };

  // Initialize local input values when payments data changes (smart reset)
  useEffect(() => {
    // Only reset if it's a major change (like year change) or initial load
    const isInitialLoad = Object.keys(localInputValues).length === 0;
    const isYearChange = paymentsData.length > 0 && Object.keys(localInputValues).length > 0 && 
      !Object.keys(localInputValues).some(key => {
        const [rowIdx] = key.split('-');
        return parseInt(rowIdx) < paymentsData.length;
      });
    
    // For initial load or year change, reset everything
    if (isInitialLoad || isYearChange) {
      console.log(`HomePage.jsx: ${isInitialLoad ? 'Initial load' : 'Year change'} detected, resetting localInputValues`);
      
      // Clear any pending timeouts when doing a full reset
      Object.keys(saveTimeoutsRef.current).forEach(key => {
        clearTimeout(saveTimeoutsRef.current[key]);
        delete saveTimeoutsRef.current[key];
      });
      
      const initialValues = {};
      paymentsData.forEach((row, arrayIndex) => {
        // Use the same logic as in the table render
        const globalRowIndex = paymentsData.findIndex((r) => r.Client_Name === row.Client_Name && r.Type === row.Type);
        console.log(`UseEffect initializing values for ${row.Client_Name} (${row.Type}): arrayIndex=${arrayIndex}, globalRowIndex=${globalRowIndex}`);
        
        months.forEach((month) => {
          const key = `${globalRowIndex}-${month}`;
          initialValues[key] = row?.[month] || "";
        });
      });
      setLocalInputValues(initialValues);
      setPendingUpdates({});
    } else {
      // For normal data updates (like successful saves), only update specific fields
      // but preserve any pending user input
      const updatedValues = { ...localInputValues };
      let hasChanges = false;
      
      paymentsData.forEach((row, arrayIndex) => {
        const globalRowIndex = paymentsData.findIndex((r) => r.Client_Name === row.Client_Name && r.Type === row.Type);
        
        months.forEach((month) => {
          const key = `${globalRowIndex}-${month}`;
          const hasPendingUpdate = pendingUpdates[key];
          const hasActiveTimeout = saveTimeoutsRef.current[key];
          
          // Skip updates if:
          // 1. There's a pending update (user is actively typing)
          // 2. There's an active timeout (save is in progress)
          if (hasPendingUpdate || hasActiveTimeout) {
            console.log(`Skipping update for ${key} - pending: ${hasPendingUpdate}, timeout: ${!!hasActiveTimeout}`);
            return;
          }
          
          // Only update if the field exists and the value is different
          if (updatedValues[key] !== undefined) {
            const newValue = row?.[month] || "";
            if (updatedValues[key] !== newValue) {
              console.log(`Updating ${key} from server data: "${updatedValues[key]}" -> "${newValue}"`);
              updatedValues[key] = newValue;
              hasChanges = true;
            }
          } else {
            // Initialize missing keys
            updatedValues[key] = row?.[month] || "";
            hasChanges = true;
          }
        });
      });
      
      if (hasChanges) {
        console.log('Applying server updates to localInputValues');
        setLocalInputValues(updatedValues);
      }
    }
  }, [paymentsData, months, pendingUpdates]);

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
      // Clear all pending timeouts on unmount
      Object.keys(saveTimeoutsRef.current).forEach(key => {
        clearTimeout(saveTimeoutsRef.current[key]);
        delete saveTimeoutsRef.current[key];
      });
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
          <button
            onClick={() => setIsTypeModalOpen(true)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
          >
            <i className="fas fa-plus mr-2"></i> Add Type
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
        <div className="flex items-center gap-3">
          {notificationQueue.length > 0 && (
            <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center">
              <i className="fas fa-bell mr-1"></i>
              {notificationQueue.length} pending
            </div>
          )}
          <button
            onClick={() => setIsNotificationModalOpen(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition duration-200 flex items-center"
            disabled={notificationQueue.length === 0}
          >
            <i className="fas fa-paper-plane mr-2"></i>
            Send Messages ({notificationQueue.length})
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

      {isTypeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <i className="fas fa-tags mr-2 text-indigo-700"></i>
              Add New Type
            </h2>
            <input
              type="text"
              value={newType}
              onChange={e => {
                setNewType(e.target.value);
                setTypeError("");
              }}
              placeholder="Enter type (e.g. GST, IT RETURN)"
              className="w-full p-2 border border-gray-300 rounded mb-2"
              maxLength={50}
            />
            {typeError && (
              <div className="text-sm text-red-600 mb-2">{typeError}</div>
            )}
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setIsTypeModalOpen(false)}
                className="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleAddType}
                className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700"
              >
                Add Type
              </button>
            </div>
          </div>
        </div>
      )}

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
                  const globalRowIndex = paymentsData.findIndex((r) => r.Client_Name === row.Client_Name && r.Type === row.Type);
                  
                  // Debug logging
                  console.log(`Row mapping debug:`, {
                    localRowIndex,
                    globalRowIndex,
                    clientName: row.Client_Name,
                    type: row.Type,
                    paymentsDataLength: paymentsData.length
                  });
                  
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

      {/* Notification Modal */}
      {isNotificationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <i className="fas fa-paper-plane mr-2 text-green-600"></i>
              Send Notifications ({notificationQueue.length} pending)
            </h2>
            
            {/* Notification List */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3">Pending Notifications:</h3>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {notificationQueue.map((notification, index) => (
                  <div key={notification.id} className="p-3 border-b border-gray-100 last:border-b-0 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{notification.clientName}</div>
                      <div className="text-sm text-gray-600">
                        {notification.type} - {notification.month.charAt(0).toUpperCase() + notification.month.slice(1)} 
                        - Paid: ₹{notification.value} - Due: ₹{notification.duePayment}
                      </div>
                      <div className="text-xs text-gray-500">
                        {notification.phone ? `📱 ${notification.phone}` : ''} 
                        {notification.email ? ` 📧 ${notification.email}` : ''}
                        {!notification.phone && !notification.email ? '❌ No contact info' : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setNotificationQueue(prev => prev.filter(n => n.id !== notification.id));
                      }}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Remove from queue"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Message Template */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3">Message Template:</h3>
              <div className="text-sm text-gray-600 mb-2">
                Available variables: {'{clientName}'}, {'{type}'}, {'{month}'}, {'{paidAmount}'}, {'{duePayment}'}
              </div>
              <textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                className="w-full h-48 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Enter your message template..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsNotificationModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition duration-200"
                disabled={isSendingNotifications}
              >
                Cancel
              </button>
              <button
                onClick={() => setNotificationQueue([])}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-200"
                disabled={isSendingNotifications || notificationQueue.length === 0}
              >
                Clear Queue
              </button>
              <button
                onClick={() => handleSendNotifications(messageTemplate)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200 flex items-center"
                disabled={isSendingNotifications || notificationQueue.length === 0 || !messageTemplate.trim()}
              >
                {isSendingNotifications ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane mr-2"></i>
                    Send All Notifications
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
