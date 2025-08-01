import { useState, useEffect, useRef, useCallback } from "react";
import SignInPage from "./components/SignInPage.jsx";
import HomePage from "./components/HomePage.jsx";
import AddClientPage from "./components/AddClientPage.jsx";
import ClientsPage from "./components/ClientsPage.jsx";
import PaymentsPage from "./components/PaymentsPage.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import ToastManager from "./components/ToastManager.jsx";
import { 
  authAPI, 
  clientsAPI, 
  paymentsAPI, 
  typesAPI, 
  importAPI,
  handleAPIError 
} from './utils/api';

const AUTO_LOGOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

const App = () => {
  const [sessionToken, setSessionToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("signIn");
  const [refreshTrigger, setRefreshTrigger] = useState(Date.now());
  const [clientsData, setClientsData] = useState([]);
  const [paymentsData, setPaymentsData] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editClient, setEditClient] = useState(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentYear, setCurrentYear] = useState("2025");
  const [errorMessage, setErrorMessage] = useState("");
  const csvFileInputRef = useRef(null);
  const profileMenuRef = useRef(null);
  const saveTimeouts = useRef({});
  const apiCacheRef = useRef({});
  const [types, setTypes] = useState([]);
  const CACHE_DURATION = 5 * 60 * 1000;
  const logoutTimerRef = useRef(null);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const logout = () => {
  console.log("Logging out user:", currentUser);
  
  // Clear all pending requests
  Object.keys(apiCacheRef.current).forEach(key => {
    if (key.startsWith('request_')) {
      delete apiCacheRef.current[key];
    }
  });
  
  setCurrentUser(null);
  setSessionToken(null);
  localStorage.removeItem("currentUser");
  localStorage.removeItem("sessionToken");
  localStorage.removeItem("currentPage");
  localStorage.removeItem("availableYears");
  localStorage.removeItem("currentYear");
  setClientsData([]);
  setPaymentsData([]);
  setTypes([]);
  apiCacheRef.current = {}; // Clear cache
  setPage("signIn");
  setIsProfileMenuOpen(false);
  setIsInitialized(false); // Reset initialization flag
  
  // Invalidate token on backend (fire and forget)
  if (sessionToken) {
    authAPI.logout().catch(error => {
      console.error("Logout API error:", error.message);
    });
  }
};

const sortDataByCreatedAt = (data, sortOrder = 'desc') => {
  if (!Array.isArray(data)) return [];
  
  return [...data].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
    const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
    
    if (sortOrder === 'desc') {
      return dateB - dateA; // Newest first
    } else {
      return dateA - dateB; // Oldest first
    }
  });
};

  const handleSessionError = (error) => {
  if (error.response && (error.response.status === 401 || error.response.status === 403)) {
    console.log("Session invalid, logging out");
    logout();
  } else if (error.response?.status === 429) {
    console.log("Rate limit hit, backing off");
    setErrorMessage("Too many requests. Please wait a moment before trying again.");
  } else {
    console.log("Non-auth error:", error.message);
  }
};

const fetchTypes = async (token) => {
  if (!token || !currentUser) return;
  
  const cacheKey = `types_${currentUser}_${token}`;
  
  // Check cache first
  if (apiCacheRef.current[cacheKey] && 
      Date.now() - apiCacheRef.current[cacheKey].timestamp < CACHE_DURATION) {
    console.log(`App.jsx: Using cached types for ${currentUser}`);
    setTypes(apiCacheRef.current[cacheKey].data);
    return;
  }
  
  // Check if request is already in progress
  const requestKey = `request_${cacheKey}`;
  if (apiCacheRef.current[requestKey]) {
    console.log(`App.jsx: Request already in progress for ${currentUser}`);
    return apiCacheRef.current[requestKey];
  }
  
  // Mark request as in progress
  const requestPromise = (async () => {
    try {
      console.log(`App.jsx: Fetching types for ${currentUser} with token:`, token?.substring(0, 10) + "...");
      
      const response = await typesAPI.getTypes();
      
      const typesData = Array.isArray(response.data) ? response.data : [];
      console.log(`App.jsx: Types fetched for ${currentUser}:`, typesData);
      
      setTypes(typesData);
      apiCacheRef.current[cacheKey] = {
        data: typesData,
        timestamp: Date.now(),
      };
      
      return typesData;
    } catch (error) {
      console.error(`App.jsx: Fetch types error for ${currentUser}:`, error.response?.data?.error || error.message);
      setTypes([]);
      handleSessionError(error);
      throw error;
    } finally {
      // Clear the in-progress flag
      delete apiCacheRef.current[requestKey];
    }
  })();
  
  // Store the promise to prevent duplicate requests
  apiCacheRef.current[requestKey] = requestPromise;
  
  return requestPromise;
};

  useEffect(() => {
  const timeoutId = setTimeout(() => {
    if (sessionToken && currentUser) {
      fetchTypes(sessionToken);
    }
  }, 100); // Add debounce to prevent rapid calls
  
  return () => clearTimeout(timeoutId);
}, [sessionToken, currentUser]); // Add currentUser as dependency

  // Note: Axios interceptors are now handled in the centralized API configuration
  // No need for additional axios setup here

  useEffect(() => {
  return () => {
    // Cancel all pending requests on unmount
    Object.keys(apiCacheRef.current).forEach(key => {
      if (key.startsWith('request_')) {
        delete apiCacheRef.current[key];
      }
    });
    
    // Clear all timeouts
    Object.values(saveTimeouts.current).forEach(clearTimeout);
    saveTimeouts.current = {};
  };
}, []);

  // Initialize session
useEffect(() => {
  if (isInitialized) return; // Prevent re-initialization
  
  const storedUser = localStorage.getItem("currentUser");
  const storedToken = localStorage.getItem("sessionToken");
  const storedPage = localStorage.getItem("currentPage");
  const storedYear = localStorage.getItem("currentYear");

  console.log("App.jsx: Stored sessionToken on load:", storedToken);
  
  if (storedUser && storedToken) {
    console.log("Restoring session for user:", storedUser);
    setCurrentUser(storedUser);
    setSessionToken(storedToken);
    
    const validPages = ["home", "clients", "payments", "reports", "addClient"];
    setPage(validPages.includes(storedPage) ? storedPage : "home");
    
    const yearToSet = storedYear && parseInt(storedYear) >= 2025 ? storedYear : "2025";
    console.log("App.jsx: Setting currentYear:", yearToSet);
    setCurrentYear(yearToSet);
    
    // Always force refresh on initial load
    setTimeout(() => {
      fetchClients(storedToken, true); // forceRefresh = true
      fetchPayments(storedToken, yearToSet, true); // forceRefresh = true
    }, 200);
  } else {
    console.log("App.jsx: No stored user or token, setting page to signIn");
    setPage("signIn");
  }
  
  setIsInitialized(true);
}, []); // Remove dependencies to prevent re-runs


  // Save current page to localStorage
  useEffect(() => {
    if (page !== "signIn") {
      localStorage.setItem("currentPage", page);
    }
  }, [page]);

  // Fetch payments when year or token changes
  useEffect(() => {
    if (sessionToken && currentYear) {
      fetchPayments(sessionToken, currentYear);
    }
  }, [currentYear, sessionToken]);

  // Save current year to localStorage
  useEffect(() => {
    if (currentYear) {
      localStorage.setItem("currentYear", currentYear);
    }
  }, [currentYear]);

  // Handle clicks outside profile menu
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target)
      ) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(saveTimeouts.current).forEach(clearTimeout);
      saveTimeouts.current = {};
    };
  }, []);

const fetchClients = async (token, forceRefresh = false) => {
  if (!token) return;
  
  const cacheKey = `clients_${currentUser}_${token}`;
  
  // Invalidate cache if forceRefresh is true
  if (forceRefresh) {
    console.log(`App.jsx: Invalidating cache for clients_${currentUser} due to forceRefresh`);
    delete apiCacheRef.current[cacheKey];
  }
  
  // Check cache first
  if (apiCacheRef.current[cacheKey] && 
      Date.now() - apiCacheRef.current[cacheKey].timestamp < CACHE_DURATION &&
      !forceRefresh) {
    console.log(`App.jsx: Using cached clients for ${currentUser}`);
    setClientsData(apiCacheRef.current[cacheKey].data);
    return;
  }
  
  // Check if request is already in progress
  const requestKey = `request_${cacheKey}`;
  if (apiCacheRef.current[requestKey]) {
    console.log(`App.jsx: Clients request already in progress for ${currentUser}`);
    return apiCacheRef.current[requestKey];
  }
  
  // Mark request as in progress
  const requestPromise = (async () => {
    try {
      console.log("Fetching clients with token:", token?.substring(0, 10) + "...");
      const response = await clientsAPI.getClients();
      
      console.log("Clients fetched:", response.data);
      const clientsData = Array.isArray(response.data) ? response.data : [];
      
      // Sort clients by createdAt (newest first)
      const sortedClientsData = sortDataByCreatedAt(clientsData, 'desc');
      console.log("Clients sorted by createdAt (newest first)");
      
      setClientsData(sortedClientsData);
      
      // Cache the sorted result
      apiCacheRef.current[cacheKey] = {
        data: sortedClientsData,
        timestamp: Date.now(),
      };
      
      return sortedClientsData;
    } catch (error) {
      console.error("Fetch clients error:", error.response?.data?.error || error.message);
      setClientsData([]);
      handleSessionError(error);
      throw error;
    } finally {
      // Clear the in-progress flag
      delete apiCacheRef.current[requestKey];
    }
  })();
  
  // Store the promise to prevent duplicate requests
  apiCacheRef.current[requestKey] = requestPromise;
  
  return requestPromise;
};


const fetchPayments = async (token, year, forceRefresh = false) => {
  if (!token || !year) return;

  const cacheKey = `payments_${year}_${token}`;

  // Invalidate cache if forceRefresh is true or refreshTrigger indicates a change
  if (forceRefresh) {
    console.log(`App.jsx: Invalidating cache for payments_${year} due to ${forceRefresh ? 'forceRefresh' : 'refreshTrigger'}`);
    delete apiCacheRef.current[cacheKey];
  }

  // Check cache first
  if (apiCacheRef.current[cacheKey] &&
      Date.now() - apiCacheRef.current[cacheKey].timestamp < CACHE_DURATION &&
      !forceRefresh) {
    console.log(`App.jsx: Using cached payments for ${year}`);
    setPaymentsData(apiCacheRef.current[cacheKey].data);
    return;
  }

  // Check if request is already in progress
  const requestKey = `request_${cacheKey}`;
  if (apiCacheRef.current[requestKey]) {
    console.log(`App.jsx: Payments request already in progress for ${year}`);
    return apiCacheRef.current[requestKey];
  }

  // Mark request as in progress
  const requestPromise = (async () => {
    try {
      console.log(`Fetching payments for ${year} with token:`, token?.substring(0, 10) + "...");
      const response = await paymentsAPI.getPaymentsByYear(year);

      const data = Array.isArray(response.data) ? response.data : [];
      console.log(`Fetched payments for ${year}:`, data);

      // Sort payments by createdAt (newest first)
      const sortedPaymentsData = sortDataByCreatedAt(data, 'desc');
      console.log("Payments sorted by createdAt (newest first)");

      setPaymentsData(sortedPaymentsData);

      // Cache the sorted result
      apiCacheRef.current[cacheKey] = { 
        data: sortedPaymentsData, 
        timestamp: Date.now() 
      };

      return sortedPaymentsData;
    } catch (error) {
      console.error("Error fetching payments:", error);
      setPaymentsData([]);
      handleSessionError(error);
      throw error;
    } finally {
      // Clear the in-progress flag
      delete apiCacheRef.current[requestKey];
    }
  })();

  // Store the promise to prevent duplicate requests
  apiCacheRef.current[requestKey] = requestPromise;

  return requestPromise;
};



  const handleYearChange = async (year) => {
    console.log("Year changed to:", year);
    setCurrentYear(year);
    localStorage.setItem("currentYear", year);
    if (sessionToken) {
      await fetchPayments(sessionToken, year);
    }
  };



  const handleContextMenu = (e, rowIndex) => {
    e.preventDefault();
    const x = Math.min(e.pageX, window.innerWidth - 150);
    const y = Math.min(e.pageY, window.innerHeight - 100);
    setContextMenu({ rowIndex, x, y });
  };

  const hideContextMenu = () => {
    setContextMenu(null);
  };

  const deleteRow = async () => {
    if (!contextMenu) return;
    const rowData = paymentsData[contextMenu.rowIndex];
    if (!rowData) return;
    try {
      console.log("Deleting row:", rowData.Client_Name, rowData.Type);
      await clientsAPI.deleteClient({ 
        clientName: rowData.Client_Name, 
        type: rowData.Type 
      });
      // Optimistic updates after successful deletion
      setPaymentsData(
        paymentsData.filter((_, i) => i !== contextMenu.rowIndex)
      );
      setClientsData(
        clientsData.filter(
          (client) =>
            client.Client_Name !== rowData.Client_Name ||
            client.Type !== rowData.Type
        )
      );
      // Clear cache for current year
      const cacheKey = `payments_${currentYear}_${sessionToken}`;
      delete apiCacheRef.current[cacheKey];
      hideContextMenu();
      alert("Row deleted successfully.");
      await fetchPayments(sessionToken, currentYear);
    } catch (error) {
      console.error(
        "Delete row error:",
        error.response?.data?.error || error.message
      );
      handleSessionError(error);
      alert(
        `Failed to delete row: ${error.response?.data?.error || error.message}`
      );
    }
  };

// Add retryWithBackoff if not already defined
const retryWithBackoff = async (fn, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Retry ${i + 1}/${retries} failed: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

const importCsv = async (e) => {
  const file = e.target.files[0];
  if (!file) {
    setErrorMessage("No file selected. Please choose a CSV file to import.");
    return;
  }
  if (!sessionToken || !currentUser) {
    setErrorMessage("Please sign in to import CSV.");
    return;
  }
  
  setIsImporting(true);
  setErrorMessage("");
  let capitalizedTypes = [];
  let parseErrors = [];
  
  try {
    // Fetch types first
    if (!types.length) {
      console.log("Types not available, fetching...");
      await fetchTypes(sessionToken);
      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Use the current types state
    capitalizedTypes = types.map((type) => type.toUpperCase());
    console.log(`App.jsx: Valid types for ${currentUser}:`, capitalizedTypes);
    

    // Parse CSV
    const text = await file.text();
    const rows = text
      .split("\n")
      .filter((row) => row.trim())
      .map((row) => {
        const cols = row
          .split(",")
          .map((cell) => cell.trim().replace(/^"|"$/g, ""));
        return cols.filter((col) => col.trim());
      });
      
    if (rows.length === 0) {
      throw new Error("CSV file is empty.");
    }

    // Process rows into the format expected by backend: [amount, type, email, clientName, phone]
    const records = [];
    rows.forEach((row, index) => {
      let clientName = "",
        type = "",
        amount = 0,
        email = "",
        phone = "";
        
      // Parse each cell in the row
      row.forEach((cell) => {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell)) {
          email = cell;
        } else if (/^\+?[\d\s-]{10,15}$/.test(cell)) {
          phone = cell;
        } else if (capitalizedTypes.includes(cell.trim().toUpperCase())) {
          type = cell.trim().toUpperCase();
        } else if (!isNaN(parseFloat(cell)) && parseFloat(cell) > 0) {
          amount = parseFloat(cell);
        } else if (cell.trim()) {
          clientName = cell.trim();
        }
      });
      
      // Validate required fields
      if (!clientName || !type || !amount) {
        console.warn(`Skipping invalid row at index ${index + 1}:`, row);
        parseErrors.push(
          `Row ${index + 1}: Missing required fields (Client Name: "${clientName}", Type: "${type}", Amount: ${amount}). Valid types: ${capitalizedTypes.join(", ")}`
        );
        return;
      }
      
      console.log(`Parsed row ${index + 1}:`, { clientName, type, amount, email, phone });
      
      // Format as expected by backend: [amount, type, email, clientName, phone]
      records.push([
        amount,      // Amount_To_Be_Paid
        type,        // Type
        email,       // Email (can be empty)
        clientName,  // Client_Name
        phone        // Phone_Number (can be empty)
      ]);
    });

    // Check if we have valid types
    if (!capitalizedTypes.length) {
      const errorMsg = `No payment types defined for user ${currentUser}. Please navigate to the dashboard and click 'Add Type' to add types (e.g., GST, IT RETURN) before importing.${
        parseErrors.length > 0
          ? `\n\nAdditionally, the CSV contains ${parseErrors.length} invalid row(s):\n${parseErrors.join("\n")}`
          : ""
      }`;
      throw new Error(errorMsg);
    }

    if (records.length === 0) {
      throw new Error(
        `No valid rows found in CSV. All rows are missing required fields or contain invalid data.${
          parseErrors.length > 0 ? `\n\nParsing errors:\n${parseErrors.join("\n")}` : ""
        }`
      );
    }

    // Import records - send all at once to take advantage of optimized backend
    console.log(`Importing ${records.length} valid records for user ${currentUser}...`);
    console.log("Records to import:", records.slice(0, 3)); // Log first 3 for debugging
    
    try {
      const response = await retryWithBackoff(
        () => importAPI.importCSV({ records }),
        3,
        1000
      );
      
      console.log(`Import response:`, response.data);
      
      // Parse response
      const {
        message,
        imported = 0,
        summary = {},
        errors = [],
        duplicatesSkipped = []
      } = response.data;
      
      // Clear cache
      const cacheKeyPayments = `payments_${currentYear}_${sessionToken}`;
      const cacheKeyClients = `clients_${currentYear}_${sessionToken}`;
      delete apiCacheRef.current[cacheKeyPayments];
      delete apiCacheRef.current[cacheKeyClients];
      
      // Prepare user message
      let userMessage = message || `Import completed!`;
      let hasIssues = false;
      
      if (summary.totalRecords) {
        userMessage = `Import Summary:
• Total records processed: ${summary.totalRecords}
• Successfully imported: ${summary.clientsImported || imported}
• Payment records created: ${summary.paymentRecordsCreated || 0}
• Years processed: ${(summary.yearsCreated || []).join(', ')}`;
        
        if (summary.duplicateRecords > 0) {
          userMessage += `\n• Duplicates skipped: ${summary.duplicateRecords}`;
          hasIssues = true;
        }
        
        if (summary.errorRecords > 0) {
          userMessage += `\n• Records with errors: ${summary.errorRecords}`;
          hasIssues = true;
        }
      }
      
      // Add details if there are issues
      if (duplicatesSkipped.length > 0) {
        userMessage += `\n\nDuplicates skipped:\n${duplicatesSkipped.map(d => 
          `• Row ${d.index}: ${d.clientName} (${d.type}) - ${d.reason}`
        ).join('\n')}`;
      }
      
      if (errors.length > 0) {
        userMessage += `\n\nErrors:\n${errors.join('\n')}`;
      }
      
      // Add parsing errors if any
      if (parseErrors.length > 0) {
        userMessage += `\n\nCSV parsing issues:\n${parseErrors.join('\n')}`;
        hasIssues = true;
      }
      
      alert(userMessage);
      
      // Set error message only if there are issues
      if (hasIssues) {
        setErrorMessage(`Import completed with some issues. Check the details above.`);
      } else {
        setErrorMessage("");
      }
      
      // Reload page after successful import
      await new Promise((resolve) => setTimeout(resolve, 1000));
      window.location.reload();
      
    } catch (importError) {
      console.error(`Import request failed:`, {
        message: importError.message,
        response: importError.response?.data,
        status: importError.response?.status,
      });
      
      // Handle specific server errors
      const serverError = importError.response?.data;
      if (serverError) {
        let errorMessage = serverError.error || importError.message;
        
        // Add details from server response
        if (serverError.errors && serverError.errors.length > 0) {
          errorMessage += `\n\nServer validation errors:\n${serverError.errors.join('\n')}`;
        }
        
        if (serverError.duplicatesSkipped && serverError.duplicatesSkipped.length > 0) {
          errorMessage += `\n\nDuplicates found:\n${serverError.duplicatesSkipped.map(d => 
            `• ${d.clientName} (${d.type}) - ${d.reason}`
          ).join('\n')}`;
        }
        
        if (serverError.summary) {
          errorMessage += `\n\nSummary: ${serverError.summary.totalRecords || 0} records processed, ${serverError.summary.validRecords || 0} valid`;
        }
        
        throw new Error(errorMessage);
      } else {
        throw importError;
      }
    }

  } catch (err) {
    console.error("CSV import error:", {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
      user: currentUser,
    });
    
    let errorMessage = err.message;
    
    // Handle specific error types
    if (errorMessage.includes("No payment types defined")) {
      errorMessage = `${errorMessage}\n\nTo fix this: Navigate to the dashboard and click 'Add Type' to add payment types (e.g., GST, IT RETURN).`;
    } else if (err.message.includes("timeout")) {
      errorMessage = `Request timed out while importing CSV for user ${currentUser}. The file might be too large or the connection is slow. Try with a smaller file or check your internet connection.`;
    } else if (!errorMessage.includes("Server validation errors") && !errorMessage.includes("Summary:")) {
      // Only add generic advice if we don't already have detailed errors
      errorMessage = `Failed to import CSV for user ${currentUser}.\n\nPlease ensure:\n• Type values are one of: ${
        capitalizedTypes.length ? capitalizedTypes.join(", ") : "none (add types first)"
      }\n• Monthly Payment is a valid positive number\n• Client Name is provided\n\nOriginal error: ${errorMessage}`;
      
      if (parseErrors.length > 0) {
        errorMessage += `\n\nCSV parsing issues:\n${parseErrors.join("\n")}`;
      }
    }
    
    setErrorMessage(errorMessage);
    throw err;
  } finally {
    setIsImporting(false);
  }
};

const updatePayment = async (
  rowIndex,
  month,
  value,
  year,
  paymentsData,
  setPaymentsData,
  setErrorMessage,
  sessionToken,
  saveTimeouts
) => {
  if (!paymentsData[rowIndex]) {
    setErrorMessage("Invalid row index. Please refresh and try again.");
    return;
  }

  if (value && isNaN(parseFloat(value)) && value !== "") {
    setErrorMessage("Please enter a valid number for payment.");
    return;
  }

  const savePaymentWithRetry = async (payload, retries = 3, delayMs = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await paymentsAPI.savePayment(payload, year);
        return response.data;
      } catch (error) {
        if (
          (error.response?.status === 429 || error.code === "ECONNABORTED") &&
          i < retries - 1
        ) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2;
        } else {
          throw error;
        }
      }
    }
    throw new Error("Max retries reached for save payment");
  };

  const originalRowData = { ...paymentsData[rowIndex] };
  let updatedRowData = { ...originalRowData };

  try {
    // Optimistic update
    setPaymentsData((prev) => {
      const updatedPayments = [...prev];
      const rowData = { ...updatedPayments[rowIndex] };
      rowData[month] = value || "";

      const amountToBePaid = parseFloat(rowData.Amount_To_Be_Paid) || 0;
      
      // Calculate active months (months with any value, matching backend logic)
      const activeMonths = months.filter(
        (m) => rowData[m] !== "" && rowData[m] !== null && rowData[m] !== undefined
      ).length;
      
      const expectedPayment = activeMonths * amountToBePaid;
      const totalPayments = months.reduce(
        (sum, m) => sum + (parseFloat(rowData[m]) || 0),
        0
      );
      const currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);

      let prevYearCumulativeDue = 0;
      if (parseInt(year) > 2025) {
        // Fetch previous year's data
        const prevYear = (parseInt(year) - 1).toString();
        const cacheKey = `payments_${prevYear}_${sessionToken}`;
        const prevYearData = apiCacheRef.current[cacheKey]?.data || [];
        const prevRow = prevYearData.find(
          (row) => row.Client_Name === rowData.Client_Name && row.Type === rowData.Type
        );
        if (prevRow) {
          const prevAmountToBePaid = parseFloat(prevRow.Amount_To_Be_Paid) || 0;
          const prevActiveMonths = months.filter(
            (m) => prevRow[m] !== "" && prevRow[m] !== null && prevRow[m] !== undefined
          ).length;
          const prevExpectedPayment = prevActiveMonths * prevAmountToBePaid;
          const prevTotalPayments = months.reduce(
            (sum, m) => sum + (parseFloat(prevRow[m]) || 0),
            0
          );
          prevYearCumulativeDue = Math.max(prevExpectedPayment - prevTotalPayments, 0);
        }
      }

      rowData.Due_Payment = (currentYearDuePayment + prevYearCumulativeDue).toFixed(2);
      updatedPayments[rowIndex] = rowData;
      updatedRowData = rowData;
      return updatedPayments;
    });

    const payloadData = {
      clientName: updatedRowData.Client_Name,
      type: updatedRowData.Type,
      month,
      value: value || "",
    };

    const response = await savePaymentWithRetry(payloadData);

    if (response.updatedRow) {
      setPaymentsData((prev) =>
        prev.map((row, idx) => {
          if (idx !== rowIndex) return row;
          return {
            ...row,
            ...response.updatedRow,
            Email: row.Email || response.updatedRow.Email,
          };
        })
      );
    }
  } catch (error) {
    setErrorMessage(
      `Failed to save payment for ${updatedRowData?.Client_Name || "unknown"} in ${month}: ${error.response?.data?.error || error.message}`
    );
    setPaymentsData((prev) =>
      prev.map((row, idx) =>
        idx === rowIndex ? originalRowData : row
      )
    );
  }
};

  // Auto-logout logic
  const resetLogoutTimer = useCallback(() => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
    }
    logoutTimerRef.current = setTimeout(() => {
      logout();
      // Optionally, show a message to the user
      alert('You have been logged out due to inactivity.');
    }, AUTO_LOGOUT_MS);
  }, []);

  useEffect(() => {
    // Reset timer on any user activity
    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    activityEvents.forEach(event => {
      window.addEventListener(event, resetLogoutTimer);
    });
    // Reset timer on mount
    resetLogoutTimer();
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetLogoutTimer);
      });
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
      }
    };
  }, [resetLogoutTimer]);

  // Optionally, reset timer on API calls (if you want to treat API activity as activity)
  // You can wrap your API calls to call resetLogoutTimer()

  return (
    <ErrorBoundary>
      <ToastManager>
        {(toastContext) => (
          <div className="min-h-screen bg-gray-50">
            {page === "signIn" ? (
              <SignInPage
                setSessionToken={setSessionToken}
                setCurrentUser={setCurrentUser}
                setPage={setPage}
              />
            ) : (
              <>
                <nav className="bg-white shadow-sm w-full p-4 sm:hidden flex justify-between items-center border-b border-gray-200">
                  <div className="flex items-center">
                    <i className="fas fa-money-bill-wave text-2xl mr-2 text-gray-800"></i>
                    <h1 className="text-xl font-semibold text-gray-800">Payment Tracker</h1>
                  </div>
                  <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="text-gray-800 focus:outline-none"
                  >
                    <i className="fas fa-bars text-2xl"></i>
                  </button>
                </nav>
                <div className="flex flex-col sm:flex-row">
                  <nav
                    className={`bg-white shadow-lg w-full sm:w-64 p-4 fixed top-0 left-0 h-auto sm:h-full border-r border-gray-200 z-50 ${isSidebarOpen ? "block" : "hidden sm:block"}`}
                  >
                    <div className="flex items-center mb-6 pb-4 border-b border-gray-200">
                      <i className="fas fa-money-bill-wave text-2xl mr-2 text-gray-800"></i>
                      <h1 className="text-xl font-semibold text-gray-800">Payment Tracker</h1>
                    </div>
                    <ul className="space-y-1">
                      <li>
                        <button
                          onClick={() => {
                            setPage("home");
                            setIsSidebarOpen(false);
                          }}
                          className={`w-full text-left p-3 rounded-lg flex items-center transition-colors ${
                            page === "home"
                              ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <i className="fas fa-tachometer-alt mr-3 w-4"></i> Dashboard
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            setPage("clients");
                            setIsSidebarOpen(false);
                          }}
                          className={`w-full text-left p-3 rounded-lg flex items-center transition-colors ${
                            page === "clients"
                              ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <i className="fas fa-users mr-3 w-4"></i> Clients
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            setPage("payments");
                            setIsSidebarOpen(false);
                          }}
                          className={`w-full text-left p-3 rounded-lg flex items-center transition-colors ${
                            page === "payments"
                              ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <i className="fas fa-money-bill-wave mr-3 w-4"></i> Payments
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            setPage("reports");
                            setIsSidebarOpen(false);
                          }}
                          className={`w-full text-left p-3 rounded-lg flex items-center transition-colors ${
                            page === "reports"
                              ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <i className="fas fa-chart-line mr-3 w-4"></i> Reports
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            logout();
                            setIsSidebarOpen(false);
                          }}
                          className="w-full text-left p-3 rounded-lg flex items-center transition-colors text-red-600 hover:bg-red-50"
                        >
                          <i className="fas fa-sign-out-alt mr-3 w-4"></i> Logout
                        </button>
                      </li>
                    </ul>
                  </nav>
                  <main className="flex-1 p-6 overflow-y-auto sm:ml-64 mt-16 sm:mt-0 bg-gray-50">
                    {isImporting && (
                      <div className="mb-4 p-4 bg-yellow-50 text-yellow-800 rounded-lg text-center border border-yellow-200">
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Importing, please wait... Do not refresh the page.
                      </div>
                    )}
                    {page === "home" && (
                      <HomePage
                        paymentsData={paymentsData}
                        setPaymentsData={setPaymentsData}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        monthFilter={monthFilter}
                        setMonthFilter={setMonthFilter}
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        updatePayment={updatePayment}
                        handleContextMenu={handleContextMenu}
                        contextMenu={contextMenu}
                        hideContextMenu={hideContextMenu}
                        deleteRow={deleteRow}
                        setPage={setPage}
                        importCsv={importCsv}
                        isImporting={isImporting}
                        sessionToken={sessionToken}
                        currentYear={currentYear}
                        setCurrentYear={setCurrentYear}
                        handleYearChange={handleYearChange}
                        setErrorMessage={setErrorMessage}
                        apiCacheRef={apiCacheRef}
                        currentUser={currentUser}
                        onMount={() =>
                          console.log(
                            "App.jsx: HomePage mounted with sessionToken:",
                            sessionToken?.substring(0, 10) + "..."
                          )
                        }
                        fetchTypes={fetchTypes}
                        csvFileInputRef={csvFileInputRef}
                        refreshTrigger={refreshTrigger}
                        fetchPayments={fetchPayments}
                        saveTimeouts={saveTimeouts}
                        showToast={toastContext.showToast}
                      />
                    )}
                    {page === "addClient" && (
                      <AddClientPage
                        setPage={setPage}
                        fetchClients={fetchClients}
                        fetchPayments={fetchPayments}
                        sessionToken={sessionToken}
                        currentUser={currentUser}
                        editClient={editClient}
                        setEditClient={setEditClient}
                        types={types}
                        apiCacheRef={apiCacheRef}
                        fetchTypes={fetchTypes}
                        setRefreshTrigger={setRefreshTrigger}
                      />
                    )}
                    {page === "clients" && (
                      <ClientsPage
                        clientsData={clientsData}
                        setClientsData={setClientsData}
                        setPage={setPage}
                        setEditClient={setEditClient}
                        fetchClients={fetchClients}
                        fetchPayments={fetchPayments}
                        sessionToken={sessionToken}
                        currentYear={currentYear}
                        isImporting={isImporting}
                        importCsv={importCsv}
                      />
                    )}
                    {page === "payments" && (
                      <PaymentsPage
                        paymentsData={paymentsData}
                        setPaymentsData={setPaymentsData}
                        fetchClients={fetchClients}
                        fetchPayments={fetchPayments}
                        sessionToken={sessionToken}
                        isImporting={isImporting}
                        currentYear={currentYear}
                        setCurrentYear={setCurrentYear}
                        handleYearChange={handleYearChange}
                      />
                    )}
                    {page === "reports" && (
                      <HomePage
                        paymentsData={paymentsData}
                        setPaymentsData={setPaymentsData}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        monthFilter={monthFilter}
                        setMonthFilter={setMonthFilter}
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        updatePayment={updatePayment}
                        handleContextMenu={handleContextMenu}
                        contextMenu={contextMenu}
                        hideContextMenu={hideContextMenu}
                        deleteRow={deleteRow}
                        setPage={setPage}
                        importCsv={importCsv}
                        isReportsPage={true}
                        isImporting={isImporting}
                        sessionToken={sessionToken}
                        currentYear={currentYear}
                        setCurrentYear={setCurrentYear}
                        handleYearChange={handleYearChange}
                        setErrorMessage={setErrorMessage}
                        apiCacheRef={apiCacheRef}
                        saveTimeouts={saveTimeouts}
                        showToast={toastContext.showToast}
                      />
                    )}
                  </main>
                </div>
              </>
            )}
          </div>
        )}
      </ToastManager>
    </ErrorBoundary>
  );
};

export default App;