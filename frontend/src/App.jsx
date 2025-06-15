import { useState, useEffect, useRef } from "react";
import axios from "axios";
import SignInPage from "./components/SignInPage.jsx";
import HomePage from "./components/HomePage.jsx";
import AddClientPage from "./components/AddClientPage.jsx";
import ClientsPage from "./components/ClientsPage.jsx";
import PaymentsPage from "./components/PaymentsPage.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";

// Axios Interceptor for Token Refresh
axios.interceptors.response.use(
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
        const { sessionToken } = response.data;
        localStorage.setItem("sessionToken", sessionToken);
        setSessionToken(sessionToken); // Update state
        originalRequest.headers.Authorization = `Bearer ${sessionToken}`;
        return axios(originalRequest);
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);
        localStorage.removeItem("sessionToken");
        localStorage.removeItem("currentUser");
        // localStorage.removeItem('gmailId');
        window.location.href = "/";
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Add state for sidebar toggle
  const csvFileInputRef = useRef(null);
  const profileMenuRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false); // Add loading state for CSV import
  const [currentYear, setCurrentYear] = useState("2025");
  // Add this at the top of App.jsx with other useRef declarations
  const saveTimeouts = useRef({});

  axios.defaults.withCredentials = true;

  useEffect(() => {
    const storedUser = localStorage.getItem("currentUser");
    const storedToken = localStorage.getItem("sessionToken");
    const storedPage = localStorage.getItem("currentPage");
    const storedYear = localStorage.getItem("currentYear");
    const storedYears = localStorage.getItem("availableYears");

    console.log("App.jsx: Stored sessionToken on load:", storedToken);
    if (storedUser && storedToken) {
      console.log("Restoring session for user:", storedUser);
      setCurrentUser(storedUser);
      setSessionToken(storedToken);
      setPage(storedPage || "home");
      const yearToSet =
        storedYear && parseInt(storedYear) >= 2025 ? storedYear : "2025";
      console.log("App.jsx: Setting sessionToken:", storedToken);
      console.log("App.jsx: Setting currentYear:", yearToSet);
      setCurrentYear(yearToSet);
      fetchClients(storedToken);
      // Fetch payments will be handled by HomePage's useEffect
    } else {
      console.log(
        "App.jsx: No stored user or token, skipping session restoration"
      );
    }
  }, []);

  useEffect(() => {
    if (sessionToken && currentYear) {
      fetchPayments(sessionToken, currentYear);
    }
  }, [currentYear, sessionToken]);

  useEffect(() => {
    if (currentYear) {
      localStorage.setItem("currentYear", currentYear);
    }
  }, [currentYear]);

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

  const fetchClients = async (token) => {
    try {
      console.log(
        "Fetching clients with token:",
        token.substring(0, 10) + "..."
      );
      const response = await axios.get(`${BASE_URL}/get-clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("Clients fetched:", response.data);
      setClientsData(response.data);
    } catch (error) {
      console.error(
        "Fetch clients error:",
        error.response?.data?.error || error.message
      );
      handleSessionError(error);
    }
  };

  // Update fetchPayments to handle empty data
  const fetchPayments = async (token, year) => {
    try {
      const response = await axios.get(`${BASE_URL}/get-payments-by-year`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { year },
      });
      console.log(`Fetched payments for ${year}:`, response.data);
      setPaymentsData(response.data || []); // Ensure empty array if no data
    } catch (error) {
      console.error("Error fetching payments:", error);
      setPaymentsData([]); // Set empty table on error
    }
  };

  const handleSessionError = (error) => {
    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403)
    ) {
      console.log("Session invalid, logging out");
      logout();
    } else {
      console.log("Non-auth error:", error.message);
    }
  };

  // Add this handleYearChange function in your App.jsx
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
    localStorage.removeItem("availableYears"); // Add this line
    localStorage.removeItem("currentYear"); // Add this line
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
    const rowData = paymentsData[contextMenu.rowIndex];
    try {
      console.log(
        "Deleting row from Google Sheets:",
        rowData.Client_Name,
        rowData.Type
      );
      // Call the delete-client endpoint to remove the client from both worksheets
      await axios.delete(`${BASE_URL}/delete-client`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        data: { Client_Name: rowData.Client_Name, Type: rowData.Type },
      });
      // Update local state to reflect the deletion immediately
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
      hideContextMenu();
      alert("Row deleted successfully.");
      fetchPayments(sessionToken, currentYear); // Refresh payments for current year
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

  const importCsv = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;

        // Enhanced CSV parsing to handle quotes and commas
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
          return result.filter((col) => col !== ""); // Remove empty columns
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

        // Smart column detection function
        const detectColumns = (rows) => {
          const sampleSize = Math.min(10, rows.length); // Analyze first 10 rows
          const columnData = [];

          // Parse sample rows
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
                  avgLength: 0,
                  containsNumbers: 0,
                  isName: 0,
                };
              }
              columnData[j].values.push(cols[j]);
            }
          }

          // Analyze each column
          columnData.forEach((col, index) => {
            let numericCount = 0;
            let gstCount = 0;
            let itReturnCount = 0;
            let emailCount = 0;
            let totalLength = 0;
            let numberCount = 0;
            let nameCount = 0;

            col.values.forEach((value) => {
              const val = value.toLowerCase().trim();
              totalLength += val.length;

              // Check if numeric (amount)
              if (/^\d+(\.\d+)?$/.test(val) || /^\d+$/.test(val)) {
                numericCount++;
              }

              // Check for GST indicators
              if (val.includes("gst") || val === "gst") {
                gstCount++;
              }

              // Check for IT Return indicators
              if (
                val.includes("it return") ||
                val.includes("itreturn") ||
                val === "it return" ||
                val === "itreturn"
              ) {
                itReturnCount++;
              }

              // Check for email
              if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                emailCount++;
              }

              // Check if contains numbers (could be student ID or amount)
              if (/\d/.test(val)) {
                numberCount++;
              }

              // Check if looks like a name (multiple words, no numbers in first part)
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
            col.avgLength = totalLength / col.values.length;
            col.containsNumbers = numberCount / col.values.length;
            col.isName = nameCount / col.values.length;
          });

          // Determine column types
          const columnTypes = {};

          // Find Amount column (highest numeric score)
          let amountIndex = -1;
          let maxNumeric = 0;
          columnData.forEach((col, index) => {
            if (col.isNumeric > maxNumeric && col.isNumeric >= 0.7) {
              maxNumeric = col.isNumeric;
              amountIndex = index;
            }
          });
          if (amountIndex !== -1) columnTypes.Amount_To_Be_Paid = amountIndex;

          // Find Type column (has GST or IT Return)
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

          // Find Email column
          let emailIndex = -1;
          let maxEmail = 0;
          columnData.forEach((col, index) => {
            if (col.hasEmail > maxEmail && col.hasEmail >= 0.3) {
              maxEmail = col.hasEmail;
              emailIndex = index;
            }
          });
          if (emailIndex !== -1) columnTypes.Email = emailIndex;

          // Find Client Name column (remaining column with highest name score)
          let nameIndex = -1;
          let maxNameScore = 0;
          columnData.forEach((col, index) => {
            if (!Object.values(columnTypes).includes(index)) {
              const nameScore = col.isName + col.avgLength / 20; // Longer text likely to be names
              if (nameScore > maxNameScore) {
                maxNameScore = nameScore;
                nameIndex = index;
              }
            }
          });
          if (nameIndex !== -1) columnTypes.Client_Name = nameIndex;

          // If we couldn't detect client name, use the first non-assigned column
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

        // Validate that we found essential columns
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

        // Process data with delay to handle API rate limits
        const processDataWithDelay = async (rows, batchSize = 10) => {
          const data = [];
          const delay = (ms) =>
            new Promise((resolve) => setTimeout(resolve, ms));

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.trim() === "") continue;

            const cols = parseCSVLine(row);
            if (cols.length < 2) continue; // Need at least 2 columns

            // Extract data using detected column mapping
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

            const amountStr =
              columnMapping.Amount_To_Be_Paid !== undefined
                ? (cols[columnMapping.Amount_To_Be_Paid] || "0").trim()
                : "0";

            // Skip if no client name
            if (!clientName || clientName === "") continue;

            // Smart type detection and assignment
            let type = "GST"; // Default type
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

            // Parse amount
            const amount = parseFloat(amountStr.replace(/[^\d.-]/g, ""));
            if (isNaN(amount) || amount <= 0) continue;

            // Validate email if provided
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              // Skip invalid emails or clear them
              email = "";
            }

            data.push({
              Client_Name: clientName,
              Type: type,
              Email: email,
              Amount_To_Be_Paid: amount,
            });

            // Add delay every batchSize records to avoid API rate limits
            if (data.length % batchSize === 0) {
              console.log(`Processed ${data.length} records...`);
              await delay(100); // 100ms delay between batches
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

        // Send data in smaller batches to avoid API limits
        const sendInBatches = async (data, batchSize = 50) => {
          const delay = (ms) =>
            new Promise((resolve) => setTimeout(resolve, ms));
          let successCount = 0;

          for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);

            try {
              console.log(
                `Sending batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
                  data.length / batchSize
                )}...`
              );

              const response = await axios.post(
                `${BASE_URL}/import-csv`,
                batch,
                {
                  headers: {
                    Authorization: `Bearer ${sessionToken}`,
                    "Content-Type": "application/json",
                  },
                  params: { year: currentYear }, // Pass currentYear
                  timeout: 30000, // 30 second timeout
                }
              );

              successCount += batch.length;
              console.log(
                `Batch ${Math.floor(i / batchSize) + 1} completed successfully`
              );

              // Delay between batches to respect API limits
              if (i + batchSize < data.length) {
                await delay(500); // 500ms delay between batches
              }
            } catch (error) {
              console.error(
                `Error in batch ${Math.floor(i / batchSize) + 1}:`,
                error
              );

              // If it's a rate limit error, wait longer and retry
              if (
                error.response?.status === 429 ||
                error.code === "ECONNABORTED"
              ) {
                console.log(
                  "Rate limit hit, waiting 2 seconds before retry..."
                );
                await delay(2000);
                i -= batchSize; // Retry this batch
                continue;
              }

              throw error; // Re-throw other errors
            }
          }

          return successCount;
        };

        const importedCount = await sendInBatches(data);

        // Refresh data after successful import
        console.log("Refreshing client and payment data...");
        await Promise.all([
          fetchClients(sessionToken),
          fetchPayments(sessionToken, currentYear),
        ]);

        alert(
          `CSV import completed successfully! ${importedCount} records imported.`
        );

        // Clear the file input
        csvFileInputRef.current.value = "";

        // Optional: Reload page after delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch (error) {
        console.error("Import CSV error:", error);

        let errorMessage = "Failed to import CSV data: ";

        if (error.response) {
          errorMessage +=
            error.response.data?.error || error.response.statusText;
        } else if (error.request) {
          errorMessage +=
            "No response from server. Please check your connection.";
        } else {
          errorMessage += error.message;
        }

        alert(errorMessage);
        handleSessionError(error);
        csvFileInputRef.current.value = "";
      } finally {
        setIsImporting(false);
      }
    };

    reader.onerror = () => {
      alert("Error reading file. Please try again.");
      setIsImporting(false);
      csvFileInputRef.current.value = "";
    };

    reader.readAsText(file);
  };

  const updatePayment = async (rowIndex, month, value, year = currentYear) => {
    if (value && isNaN(parseFloat(value))) {
      alert("Please enter a valid number");
      return;
    }

    const updatedPayments = [...paymentsData];
    const rowData = updatedPayments[rowIndex];
    const months = [
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
    const monthIndex = months.indexOf(month);

    rowData[month] = value;

    if (value.trim() !== "") {
      for (let i = 0; i < monthIndex; i++) {
        if (!rowData[months[i]] || rowData[months[i]].trim() === "") {
          rowData[months[i]] = "0";
        }
      }
    } else {
      const hasLaterValues = months
        .slice(monthIndex + 1)
        .some((m) => rowData[m] && rowData[m].trim() !== "");
      if (!hasLaterValues) {
        for (let i = monthIndex - 1; i >= 0; i--) {
          if (rowData[months[i]] === "0") {
            rowData[months[i]] = "";
          } else {
            break;
          }
        }
      }
    }

    // Calculate current year's due payment only
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

    // Get previous year's cumulative due payment if not 2025
    let prevYearCumulativeDue = 0;
    if (parseInt(year) > 2025) {
      // The original Due_Payment from server already includes cumulative calculation
      // We need to extract just the current year portion for calculation
      const originalDuePayment = parseFloat(paymentsData[rowIndex].Due_Payment) || 0;
      
      // Calculate what the current year due payment should be
      const originalAmountToBePaid = parseFloat(paymentsData[rowIndex].Amount_To_Be_Paid) || 0;
      const originalActiveMonths = months.filter(
        m => paymentsData[rowIndex][m] && parseFloat(paymentsData[rowIndex][m]) >= 0
      ).length;
      const originalExpectedPayment = originalAmountToBePaid * originalActiveMonths;
      const originalTotalPayments = months.reduce(
        (sum, m) => sum + (parseFloat(paymentsData[rowIndex][m]) || 0), 0
      );
      const originalCurrentYearDue = Math.max(originalExpectedPayment - originalTotalPayments, 0);
      
      // Previous cumulative due = Total due - Current year due
      prevYearCumulativeDue = Math.max(originalDuePayment - originalCurrentYearDue, 0);
    }

    // Display cumulative due payment (current + previous years)
    rowData.Due_Payment = (currentYearDuePayment + prevYearCumulativeDue).toFixed(2);

    // Update UI immediately
    setPaymentsData(updatedPayments);

    // Debounce the API call
    const timeoutKey = `${rowIndex}-${month}`;
    if (saveTimeouts.current[timeoutKey]) {
      clearTimeout(saveTimeouts.current[timeoutKey]);
    }

    saveTimeouts.current[timeoutKey] = setTimeout(async () => {
      try {
        console.log(
          "Saving payment for:",
          rowData.Client_Name,
          month,
          value,
          year
        );

        // Send only the updated row data instead of entire array
        const payloadData = {
          rowIndex: rowIndex,
          updatedRow: {
            ...rowData,
            // Send only current year's due payment to server for storage
            Due_Payment: currentYearDuePayment.toFixed(2)
          },
          month: month,
          value: value,
        };

        await axios.post(`${BASE_URL}/save-payment`, payloadData, {
          headers: { Authorization: `Bearer ${sessionToken}` },
          params: { year },
        });

        console.log("Payment saved successfully");
        
        // Refresh the data to get accurate cumulative calculations
        await fetchPayments(sessionToken, year);
      } catch (error) {
        console.error(
          "Save payment error:",
          error.response?.data?.error || error.message
        );
        handleSessionError(error);
      }
      delete saveTimeouts.current[timeoutKey];
    }, 500);
  };


  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50"> {/* Changed from bg-gray-100 */}
        {page === "signIn" && (
          <SignInPage
            setSessionToken={setSessionToken}
            setCurrentUser={setCurrentUser}
            setPage={setPage}
          />
        )}
        {page !== "signIn" && (
          <div className="flex flex-col sm:flex-row">
            {/* Navbar for Mobile */}
            <nav className="bg-white shadow-sm w-full p-4 sm:hidden flex justify-between items-center border-b border-gray-200"> {/* Updated styling */}
              <div className="flex items-center">
                <i className="fas fa-money-bill-wave text-2xl mr-2 text-gray-800"></i> {/* Changed text color */}
                <h1 className="text-xl font-semibold text-gray-800"> {/* Changed text color */}
                  Payment Tracker
                </h1>
              </div>
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="text-gray-800 focus:outline-none" // Changed text color
              >
                <i className="fas fa-bars text-2xl"></i>
              </button>
            </nav>

            {/* Sidebar */}
            <nav
              className={`bg-white shadow-lg w-full sm:w-64 p-4 fixed top-0 left-0 h-auto sm:h-full border-r border-gray-200 z-50 ${
                isSidebarOpen ? "block" : "hidden sm:block"
              }`} // Changed from bg-blue-900 to bg-white with shadow
            >
              <div className="flex items-center mb-6 pb-4 border-b border-gray-200"> {/* Added border */}
                <i className="fas fa-money-bill-wave text-2xl mr-2 text-gray-800"></i> {/* Changed color */}
                <h1 className="text-xl font-semibold text-gray-800"> {/* Changed color */}
                  Payment Tracker
                </h1>
              </div>
              <ul className="space-y-1"> {/* Reduced space */}
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
                    }`} // Updated styling with active state
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
                <li className="pt-4 mt-4 border-t border-gray-200"> {/* Added separator */}
                  <button
                    onClick={logout}
                    className="w-full text-left p-3 hover:bg-red-50 rounded-lg text-red-600 flex items-center transition-colors" // Updated styling
                  >
                    <i className="fas fa-sign-out-alt mr-3 w-4"></i> Logout
                  </button>
                </li>
              </ul>
            </nav>

            {/* Main Content */}
            <main className="flex-1 p-6 overflow-y-auto sm:ml-64 mt-16 sm:mt-0 bg-gray-50"> {/* Added background */}
              <header className="flex items-center justify-between mb-8 bg-white p-4 rounded-lg shadow-sm"> {/* Updated header styling */}
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1"> {/* Updated typography */}
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
                    className="focus:outline-none p-2 rounded-full hover:bg-gray-100 transition-colors" // Added hover effect
                  >
                    <i className="fas fa-user-circle text-3xl text-gray-700"></i> {/* Updated color */}
                  </button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                      <div className="p-4 border-b border-gray-100"> {/* Added border */}
                        <p className="font-semibold text-gray-900">
                          {currentUser}
                        </p>
                        <p className="text-sm text-gray-500">Administrator</p> {/* Added role */}
                      </div>
                      <button
                        onClick={logout}
                        className="w-full text-left p-4 text-red-600 hover:bg-red-50 flex items-center transition-colors" // Updated styling
                      >
                        <i className="fas fa-sign-out-alt mr-2"></i> Logout
                      </button>
                    </div>
                  )}
                </div>
              </header>
              {isImporting && (
                <div className="mb-4 p-4 bg-yellow-50 text-yellow-800 rounded-lg text-center border border-yellow-200"> {/* Updated styling */}
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
                  onMount={() =>
                    console.log(
                      "App.jsx: HomePage mounted with sessionToken:",
                      sessionToken
                    )
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
                  setClientsData={setClientsData} // Pass setClientsData prop
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
