import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import SignInPage from "./components/SignInPage.jsx";
import HomePage from "./components/HomePage.jsx";
import AddClientPage from "./components/AddClientPage.jsx";
import ClientsPage from "./components/ClientsPage.jsx";
import PaymentsPage from "./components/PaymentsPage.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";

const App = () => {
  const [sessionToken, setSessionToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("signIn");
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
  const [currentYear, setCurrentYear] = useState("2025");
  const [errorMessage, setErrorMessage] = useState("");
  const csvFileInputRef = useRef(null);
  const profileMenuRef = useRef(null);
  const saveTimeouts = useRef({});
  const apiCacheRef = useRef({});

  // Set axios defaults
  useEffect(() => {
    axios.defaults.withCredentials = true;

    // Set up Axios interceptor
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 403 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const storedToken = localStorage.getItem("sessionToken");
            const response = await axios.post(
              `${BASE_URL}/refresh-token`,
              {},
              {
                headers: { Authorization: `Bearer ${storedToken}` },
                withCredentials: true,
              }
            );
            const { sessionToken: newToken } = response.data;
            localStorage.setItem("sessionToken", newToken);
            setSessionToken(newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return axios(originalRequest);
          } catch (refreshError) {
            console.error("Token refresh failed:", refreshError);
            logout();
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );

    // Cleanup interceptor on unmount
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  // Initialize session
  useEffect(() => {
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
      console.log("App.jsx: Setting sessionToken:", storedToken);
      console.log("App.jsx: Setting currentYear:", yearToSet);
      setCurrentYear(yearToSet);
      fetchClients(storedToken);
    } else {
      console.log("App.jsx: No stored user or token, setting page to signIn");
      setPage("signIn");
    }
  }, []);

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

  const fetchClients = async (token) => {
  try {
    console.log("Fetching clients with token:", token?.substring(0, 10) + "...");
    const response = await axios.get(`${BASE_URL}/get-clients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("Clients fetched:", response.data);
    setClientsData(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    console.error("Fetch clients error:", error.response?.data?.error || error.message);
    setClientsData([]);
    handleSessionError(error);
  }
};

  const CACHE_DURATION = 5 * 60 * 1000; // Add this constant
  const fetchPayments = async (token, year) => {
  const cacheKey = `payments_${year}_${token}`;
  if (apiCacheRef.current[cacheKey] && Date.now() - apiCacheRef.current[cacheKey].timestamp < CACHE_DURATION) {
    console.log(`App.jsx: Using cached payments for ${year}`);
    setPaymentsData(apiCacheRef.current[cacheKey].data);
    return;
  }

  try {
    console.log(`Fetching payments for ${year} with token:`, token?.substring(0, 10) + "...");
    const response = await axios.get(`${BASE_URL}/get-payments-by-year`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { year },
      timeout: 10000,
    });
    const data = Array.isArray(response.data) ? response.data : [];
    console.log(`Fetched payments for ${year}:`, data);
    setPaymentsData(data);
    apiCacheRef.current[cacheKey] = { data, timestamp: Date.now() };
  } catch (error) {
    console.error("Error fetching payments:", error);
    setPaymentsData([]);
    handleSessionError(error);
  }
};

  const handleSessionError = (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.log("Session invalid, logging out");
      logout();
    } else {
      console.log("Non-auth error:", error.message);
    }
  };

  const handleYearChange = async (year) => {
    console.log("Year changed to:", year);
    setCurrentYear(year);
    localStorage.setItem("currentYear", year);
    if (sessionToken) {
      await fetchPayments(sessionToken, year);
    }
  };

  const logout = () => {
    console.log("Logging out user:", currentUser);
    setCurrentUser(null);
    setSessionToken(null);
    localStorage.removeItem("currentUser");
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("currentPage");
    localStorage.removeItem("availableYears");
    localStorage.removeItem("currentYear");
    setClientsData([]);
    setPaymentsData([]);
    setPage("signIn");
    setIsProfileMenuOpen(false);
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
    await axios.delete(`${BASE_URL}/delete-client`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      data: { Client_Name: rowData.Client_Name, Type: rowData.Type },
    });
    // Optimistic updates after successful deletion
    setPaymentsData(paymentsData.filter((_, i) => i !== contextMenu.rowIndex));
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
    console.error("Delete row error:", error.response?.data?.error || error.message);
    handleSessionError(error);
    alert(`Failed to delete row: ${error.response?.data?.error || error.message}`);
  }
};

const importCsv = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setIsImporting(true);

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const text = event.target.result;
      const parseCSVLine = (line) => {
        const result = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === "," && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ""));
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current.trim().replace(/^"|"$/g, ""));
        return result.filter((col) => col !== "");
      };

      const rows = text
        .split("\n")
        .map((row) => row.trim())
        .filter((row) => row && row.length > 0);

      if (rows.length === 0) {
        alert("CSV file is empty.");
        csvFileInputRef.current.value = "";
        setIsImporting(false);
        return;
      }

      const detectColumns = (rows) => {
        const sampleSize = Math.min(10, rows.length);
        const columnData = [];

        for (let i = 0; i < sampleSize; i++) {
          const cols = parseCSVLine(rows[i]);
          for (let j = 0; j < cols.length; j++) {
            if (!columnData[j]) {
              columnData[j] = {
                values: [],
                isNumeric: 0,
                hasGST: 0,
                hasITReturn: 0,
                hasEmail: 0,
                hasPhone: 0, // Add phone detection
                avgLength: 0,
                containsNumbers: 0,
                isName: 0,
              };
            }
            columnData[j].values.push(cols[j]);
          }
        }

        columnData.forEach((col, index) => {
          let numericCount = 0;
          let gstCount = 0;
          let itReturnCount = 0;
          let emailCount = 0;
          let phoneCount = 0;
          let totalLength = 0;
          let numberCount = 0;
          let nameCount = 0;

          col.values.forEach((value) => {
            const val = value.toLowerCase().trim();
            totalLength += val.length;

            if (/^\d+(\.\d+)?$/.test(val) || /^\d+$/.test(val)) {
              numericCount++;
            }
            if (val.includes("gst") || val === "gst") {
              gstCount++;
            }
            if (
              val.includes("it return") ||
              val.includes("itreturn") ||
              val === "it return" ||
              val === "itreturn"
            ) {
              itReturnCount++;
            }
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
              emailCount++;
            }
            if (/^\+?[\d\s-]{10,15}$/.test(val)) {
              phoneCount++;
            }
            if (/\d/.test(val)) {
              numberCount++;
            }
            if (
              val.split(" ").length >= 2 &&
              !/^\d/.test(val) &&
              val.length > 5
            ) {
              nameCount++;
            }
          });

          col.isNumeric = numericCount / col.values.length;
          col.hasGST = gstCount / col.values.length;
          col.hasITReturn = itReturnCount / col.values.length;
          col.hasEmail = emailCount / col.values.length;
          col.hasPhone = phoneCount / col.values.length;
          col.avgLength = totalLength / col.values.length;
          col.containsNumbers = numberCount / col.values.length;
          col.isName = nameCount / col.values.length;
        });

        const columnTypes = {};
        let amountIndex = -1;
        let maxNumeric = 0;
        columnData.forEach((col, index) => {
          if (col.isNumeric > maxNumeric && col.isNumeric >= 0.7) {
            maxNumeric = col.isNumeric;
            amountIndex = index;
          }
        });
        if (amountIndex !== -1) columnTypes.Amount_To_Be_Paid = amountIndex;

        let typeIndex = -1;
        let maxTypeScore = 0;
        columnData.forEach((col, index) => {
          const typeScore = col.hasGST + col.hasITReturn;
          if (
            typeScore > maxTypeScore &&
            (col.hasGST > 0 || col.hasITReturn > 0)
          ) {
            maxTypeScore = typeScore;
            typeIndex = index;
          }
        });
        if (typeIndex !== -1) columnTypes.Type = typeIndex;

        let emailIndex = -1;
        let maxEmail = 0;
        columnData.forEach((col, index) => {
          if (col.hasEmail > maxEmail && col.hasEmail >= 0.3) {
            maxEmail = col.hasEmail;
            emailIndex = index;
          }
        });
        if (emailIndex !== -1) columnTypes.Email = emailIndex;

        let phoneIndex = -1;
        let maxPhone = 0;
        columnData.forEach((col, index) => {
          if (col.hasPhone > maxPhone && col.hasPhone >= 0.3) {
            maxPhone = col.hasPhone;
            phoneIndex = index;
          }
        });
        if (phoneIndex !== -1) columnTypes.Phone_Number = phoneIndex;

        let nameIndex = -1;
        let maxNameScore = 0;
        columnData.forEach((col, index) => {
          if (!Object.values(columnTypes).includes(index)) {
            const nameScore = col.isName + col.avgLength / 20;
            if (nameScore > maxNameScore) {
              maxNameScore = nameScore;
              nameIndex = index;
            }
          }
        });
        if (nameIndex !== -1) columnTypes.Client_Name = nameIndex;

        if (columnTypes.Client_Name === undefined) {
          for (let i = 0; i < columnData.length; i++) {
            if (!Object.values(columnTypes).includes(i)) {
              columnTypes.Client_Name = i;
              break;
            }
          }
        }

        return columnTypes;
      };

      console.log("Analyzing CSV structure...");
      const columnMapping = detectColumns(rows);
      console.log("Detected column mapping:", columnMapping);

      if (columnMapping.Client_Name === undefined) {
        alert(
          "Could not detect Client Name column. Please ensure your CSV has client names."
        );
        csvFileInputRef.current.value = "";
        setIsImporting(false);
        return;
      }

      if (columnMapping.Amount_To_Be_Paid === undefined) {
        alert(
          "Could not detect Amount column. Please ensure your CSV has numeric amounts."
        );
        csvFileInputRef.current.value = "";
        setIsImporting(false);
        return;
      }

      const processDataWithDelay = async (rows, batchSize = 10) => {
        const data = [];
        const delay = (ms) =>
          new Promise((resolve) => setTimeout(resolve, ms));

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.trim() === "") continue;

          const cols = parseCSVLine(row);
          if (cols.length < 2) continue;

          const clientName =
            columnMapping.Client_Name !== undefined
              ? (cols[columnMapping.Client_Name] || "").trim()
              : "";
          const rawType =
            columnMapping.Type !== undefined
              ? (cols[columnMapping.Type] || "").trim()
              : "";
          const email =
            columnMapping.Email !== undefined
              ? (cols[columnMapping.Email] || "").trim()
              : "";
          const phone =
            columnMapping.Phone_Number !== undefined
              ? (cols[columnMapping.Phone_Number] || "").trim()
              : "";
          const amountStr =
            columnMapping.Amount_To_Be_Paid !== undefined
              ? (cols[columnMapping.Amount_To_Be_Paid] || "0").trim()
              : "0";

          if (!clientName || clientName === "") continue;

          let type = "GST";
          if (rawType) {
            const lowerType = rawType.toLowerCase();
            if (
              lowerType.includes("it return") ||
              lowerType.includes("itreturn") ||
              lowerType === "it return"
            ) {
              type = "IT Return";
            } else if (lowerType.includes("gst") || lowerType === "gst") {
              type = "GST";
            }
          }

          const amount = parseFloat(amountStr.replace(/[^\d.-]/g, ""));
          if (isNaN(amount) || amount <= 0) continue;

          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            email = "";
          }

          if (phone && !/^\+?[\d\s-]{10,15}$/.test(phone)) {
            phone = "";
          }

          data.push({
            Client_Name: clientName,
            Type: type,
            Email: email,
            Phone_Number: phone,
            Amount_To_Be_Paid: amount,
            january: 0,
            february: 0,
            march: 0,
            april: 0,
            may: 0,
            june: 0,
            july: 0,
            august: 0,
            september: 0,
            october: 0,
            november: 0,
            december: 0,
            Due_Payment: amount,
          });

          if (data.length % batchSize === 0) {
            console.log(`Processed ${data.length} records...`);
            await delay(100);
          }
        }

        return data;
      };

      console.log("Processing CSV data...");
      const data = await processDataWithDelay(rows);

      if (data.length === 0) {
        alert(
          "No valid data found in CSV file. Please check your data format."
        );
        csvFileInputRef.current.value = "";
        setIsImporting(false);
        return;
      }

      console.log(`Importing ${data.length} records...`);

      const sendInBatches = async (data, batchSize = 50) => {
        const delay = (ms) =>
          new Promise((resolve) => setTimeout(resolve, ms));
        let successCount = 0;
        const maxRetries = 3;

        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(
                `Sending batch ${
                  Math.floor(i / batchSize) + 1
                }/${Math.ceil(data.length / batchSize)} (Attempt ${attempt})...`
              );
              const response = await axios.post(
                `${BASE_URL}/import-csv`,
                batch,
                {
                  headers: {
                    Authorization: `Bearer ${sessionToken}`,
                    "Content-Type": "application/json",
                  },
                  params: { year: currentYear },
                  timeout: 30000,
                }
              );
              successCount += batch.length;
              console.log(
                `Batch ${Math.floor(i / batchSize) + 1} completed successfully`
              );
              break;
            } catch (error) {
              console.error(
                `Error in batch ${
                  Math.floor(i / batchSize) + 1
                } (Attempt ${attempt}):`,
                error
              );
              if (
                (error.response?.status === 429 ||
                 error.code === "ECONNABORTED" ||
                 error.code === "ERR_NETWORK") &&
                attempt < maxRetries
              ) {
                const waitTime = 2000 * attempt;
                console.log(`Retrying after ${waitTime}ms...`);
                await delay(waitTime);
                continue;
              }
              throw error;
            }
          }
          if (i + batchSize < data.length) {
            await delay(500);
          }
        }
        return successCount;
      };

      const importedCount = await sendInBatches(data);

      await new Promise((resolve) => setTimeout(resolve, 2000));
      setErrorMessage(
        `CSV import completed successfully! ${importedCount} records imported. Reloading page...`
      );
      csvFileInputRef.current.value = "";
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error("Import CSV error:", error);
      let errorMessage = "Failed to import CSV data: ";
      if (error.response) {
        errorMessage +=
          error.response.data?.error || error.response.statusText;
      } else if (error.request) {
        errorMessage += "No response from server. Please check your connection.";
      } else {
        errorMessage += error.message;
      }
      setErrorMessage(errorMessage);
      handleSessionError(error);
      csvFileInputRef.current.value = "";
    } finally {
      setIsImporting(false);
    }
  };

  reader.onerror = () => {
    setErrorMessage("Error reading file. Please try again.");
    setIsImporting(false);
    csvFileInputRef.current.value = "";
  };

  reader.readAsText(file);
};

const updatePayment = async (rowIndex, month, value, year = currentYear) => {
  console.log("updatePayment called:", { rowIndex, month, value, year });
  if (!paymentsData[rowIndex]) {
    console.error("App.jsx: Invalid rowIndex:", rowIndex);
    return;
  }
  if (value && isNaN(parseFloat(value)) && value !== "") {
    alert("Please enter a valid number");
    return;
  }
  
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  
  const savePaymentWithRetry = async (payload, retries = 3, delayMs = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        console.log("App.jsx: Saving payment for:", payload.clientName, month, value, year);
        const response = await axios.post(`${BASE_URL}/save-payment`, payload, {
          headers: { Authorization: `Bearer ${sessionToken}` },
          params: { year },
          timeout: 10000,
        });
        console.log("App.jsx: Payment saved successfully:", response.data);
        return response.data;
      } catch (error) {
        console.error("App.jsx: Save payment error:", {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
          rowIndex,
          month,
          year,
          attempt: i + 1,
        });
        if ((error.response?.status === 429 || error.code === "ECONNABORTED") && i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2;
        } else {
          throw error;
        }
      }
    }
    throw new Error("Max retries reached for save payment");
  };
  
  const timeoutKey = `${rowIndex}-${month}-${Date.now()}`;
  if (saveTimeouts.current[timeoutKey]) {
    clearTimeout(saveTimeouts.current[timeoutKey]);
  }
  
  // Initialize updatedRowData with current row data
  let updatedRowData = { ...paymentsData[rowIndex] };
  
  saveTimeouts.current[timeoutKey] = setTimeout(async () => {
    try {
      // Optimistic update
      setPaymentsData((prev) => {
        const updatedPayments = [...prev];
        const rowData = { ...updatedPayments[rowIndex] };
        rowData[month] = value || "";
        
        const amountToBePaid = parseFloat(rowData.Amount_To_Be_Paid) || 0;
        const activeMonths = months.filter(
          (m) => rowData[m] && parseFloat(rowData[m]) >= 0
        ).length;
        const expectedPayment = amountToBePaid * activeMonths;
        const totalPayments = months.reduce(
          (sum, m) => sum + (parseFloat(rowData[m]) || 0),
          0
        );
        const currentYearDuePayment = Math.max(expectedPayment - totalPayments, 0);
        
        let prevYearCumulativeDue = 0;
        if (parseInt(year) > 2025) {
          const originalDuePayment = parseFloat(prev[rowIndex]?.Due_Payment) || 0;
          const originalAmountToBePaid = parseFloat(prev[rowIndex]?.Amount_To_Be_Paid) || 0;
          const originalActiveMonths = months.filter(
            (m) => prev[rowIndex]?.[m] && parseFloat(prev[rowIndex][m]) >= 0
          ).length;
          const originalExpectedPayment = originalAmountToBePaid * originalActiveMonths;
          const originalTotalPayments = months.reduce(
            (sum, m) => sum + (parseFloat(prev[rowIndex]?.[m]) || 0),
            0
          );
          const originalCurrentYearDue = Math.max(originalExpectedPayment - originalTotalPayments, 0);
          prevYearCumulativeDue = Math.max(originalDuePayment - originalCurrentYearDue, 0);
        }
        
        rowData.Due_Payment = (currentYearDuePayment + prevYearCumulativeDue).toFixed(2);
        updatedPayments[rowIndex] = rowData;
        updatedRowData = rowData; // Update the reference
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
          prev.map((row, idx) =>
            idx === rowIndex ? { ...row, ...response.updatedRow } : row
          )
        );
      }
    } catch (error) {
      setErrorMessage(
        `Failed to save payment for ${updatedRowData?.Client_Name || "unknown"}: ${error.response?.data?.error || error.message}`
      );
      // Revert optimistic update on error
      setPaymentsData((prev) => [...prev]);
    } finally {
      delete saveTimeouts.current[timeoutKey];
    }
  }, 500);
};

  return (
    <ErrorBoundary>
      {errorMessage && (
  <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-lg text-center border border-red-200">
    <i className="fas fa-exclamation-circle mr-2"></i>
    {errorMessage}
  </div>
)}
      <div className="min-h-screen bg-gray-50">
        {page === "signIn" && (
          <SignInPage
            setSessionToken={setSessionToken}
            setCurrentUser={setCurrentUser}
            setPage={setPage}
          />
        )}
        {page !== "signIn" && (
          <div className="flex flex-col sm:flex-row">
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
            <nav
              className={`bg-white shadow-lg w-full sm:w-64 p-4 fixed top-0 left-0 h-auto sm:h-full border-r border-gray-200 z-50 ${
                isSidebarOpen ? "block" : "hidden sm:block"
              }`}
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
              </ul>
            </nav>
            <main className="flex-1 p-6 overflow-y-auto sm:ml-64 mt-16 sm:mt-0 bg-gray-50">
              <header className="flex items-center justify-between mb-8 bg-white p-4 rounded-lg shadow-sm">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">
                    {page === "home"
                      ? "Dashboard"
                      : page.charAt(0).toUpperCase() + page.slice(1)}
                  </h1>
                  <p className="text-gray-600 text-sm">
                    {page === "home" && "Welcome to your payment tracking dashboard"}
                    {page === "clients" && "Manage your clients and their information"}
                    {page === "payments" && "Track and manage payment records"}
                    {page === "reports" && "View detailed reports and analytics"}
                  </p>
                </div>
                <div className="relative" ref={profileMenuRef}>
                  <button
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    className="focus:outline-none p-2 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <i className="fas fa-user-circle text-3xl text-gray-700"></i>
                  </button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                      <div className="p-4 border-b border-gray-100">
                        <p className="font-semibold text-gray-900">{currentUser}</p>
                      </div>
                      <button
                        onClick={logout}
                        className="w-full text-left p-4 text-red-600 hover:bg-red-50 flex items-center transition-colors"
                      >
                        <i className="fas fa-sign-out-alt mr-2"></i> Logout
                      </button>
                    </div>
                  )}
                </div>
              </header>
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
                  csvFileInputRef={csvFileInputRef}
                  importCsv={importCsv}
                  isImporting={isImporting}
                  sessionToken={sessionToken}
                  currentYear={currentYear}
                  setCurrentYear={setCurrentYear}
                  handleYearChange={handleYearChange}
                  setErrorMessage={setErrorMessage}
                  apiCacheRef={apiCacheRef}
                  onMount={() =>
                    console.log("App.jsx: HomePage mounted with sessionToken:", sessionToken?.substring(0, 10) + "...")
                  }
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
                  csvFileInputRef={csvFileInputRef}
                  importCsv={importCsv}
                  isReportsPage={true}
                  isImporting={isImporting}
                  sessionToken={sessionToken}
                  currentYear={currentYear}
                  setCurrentYear={setCurrentYear}
                  handleYearChange={handleYearChange}
                  setErrorMessage={setErrorMessage}
                  apiCacheRef={apiCacheRef}
                />
              )}
            </main>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;