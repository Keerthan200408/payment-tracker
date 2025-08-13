import { useCallback } from 'react';
import axios from 'axios';

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";

export const usePaymentOperations = (apiCache, setErrorMessage) => {
  const retryWithBackoff = useCallback(async (fn, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries - 1) throw err;
        console.warn(`Retry ${i + 1}/${retries} failed: ${err.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }, []);

  const updatePayment = useCallback(async (
    rowIndex,
    month,
    value,
    year,
    paymentsData,
    setPaymentsData,
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
          const response = await axios.post(
            `${BASE_URL}/save-payment`,
            payload,
            {
              headers: { Authorization: `Bearer ${sessionToken}` },
              params: { year },
              timeout: 10000,
            }
          );
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
        rowData[month] = value;

        const amountToBePaid = parseFloat(rowData.Amount_To_Be_Paid) || 0;
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december'];
        const activeMonths = months.filter(
          (m) => rowData[m] && rowData[m] !== "" && rowData[m] !== null && rowData[m] !== undefined
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
          const prevYearData = apiCache.getCachedData(cacheKey) || [];
          const prevRow = prevYearData.find(
            (row) => row.Client_Name === rowData.Client_Name && row.Type === rowData.Type
          );
          if (prevRow) {
            const prevAmountToBePaid = parseFloat(prevRow.Amount_To_Be_Paid) || 0;
            const prevActiveMonths = months.filter(
              (m) => prevRow[m] && prevRow[m] !== "" && prevRow[m] !== null && prevRow[m] !== undefined
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
        value: value,
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
  }, [apiCache, setErrorMessage]);

  const deleteRow = useCallback(async (contextMenu, paymentsData, setPaymentsData, clientsData, setClientsData, sessionToken, currentYear, apiCache, hideContextMenu) => {
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
      apiCache.invalidateCache(cacheKey);
      hideContextMenu();
      alert("Row deleted successfully.");
    } catch (error) {
      console.error(
        "Delete row error:",
        error.response?.data?.error || error.message
      );
      alert(
        `Failed to delete row: ${error.response?.data?.error || error.message}`
      );
    }
  }, []);

  const importCsv = useCallback(async (e, sessionToken, currentUser, currentYear, types, fetchTypes, apiCache) => {
    const file = e.target.files[0];
    if (!file) {
      setErrorMessage("No file selected. Please choose a CSV file to import.");
      return;
    }
    if (!sessionToken || !currentUser) {
      setErrorMessage("Please sign in to import CSV.");
      return;
    }
    
    let capitalizedTypes = [];
    let parseErrors = [];
    
    try {
      // Fetch types first
      if (!types.length) {
        console.log("Types not available, fetching...");
        await fetchTypes(sessionToken, currentUser);
        // Wait a bit for state to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Use the current types state
      capitalizedTypes = types.map((type) => type.toUpperCase());
      console.log(`usePaymentOperations: Valid types for ${currentUser}:`, capitalizedTypes);
      

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
          () =>
            axios.post(`${BASE_URL}/import-csv`, records, {
              headers: { Authorization: `Bearer ${sessionToken}` },
              params: { year: currentYear },
              timeout: 60000, // Increased timeout for large imports
            }),
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
        const cacheKeyClients = `clients_${currentUser}_${sessionToken}`;
        apiCache.invalidateCache(cacheKeyPayments);
        apiCache.invalidateCache(cacheKeyClients);
        
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
    }
  }, [retryWithBackoff, setErrorMessage]);

  return {
    updatePayment,
    deleteRow,
    importCsv,
    retryWithBackoff,
  };
}; 