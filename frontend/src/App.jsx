

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import SignInPage from './components/SignInPage.jsx';
import HomePage from './components/HomePage.jsx';
import AddClientPage from './components/AddClientPage.jsx';
import ClientsPage from './components/ClientsPage.jsx';
import PaymentsPage from './components/PaymentsPage.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

// Axios Interceptor for Token Refresh
axios.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (error.response?.status === 403 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const storedToken = localStorage.getItem('sessionToken');
        const response = await axios.post(`${BASE_URL}/refresh-token`, {}, {
          headers: { Authorization: `Bearer ${storedToken}` },
          withCredentials: true,
        });
        const { sessionToken } = response.data;
        localStorage.setItem('sessionToken', sessionToken);
        setSessionToken(sessionToken); // Update state
        originalRequest.headers.Authorization = `Bearer ${sessionToken}`;
        return axios(originalRequest);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('currentUser');
        // localStorage.removeItem('gmailId');
        window.location.href = '/';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

const App = () => {
  const [sessionToken, setSessionToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState('signIn');
  const [clientsData, setClientsData] = useState([]);
  const [paymentsData, setPaymentsData] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editClient, setEditClient] = useState(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Add state for sidebar toggle
  const csvFileInputRef = useRef(null);
  const profileMenuRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false); // Add loading state for CSV import

  axios.defaults.withCredentials = true;

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    const storedToken = localStorage.getItem('sessionToken');
    const storedPage = localStorage.getItem('currentPage');
    if (storedUser && storedToken) {
      console.log('Restoring session for user:', storedUser);
      setCurrentUser(storedUser);
      setSessionToken(storedToken);
      setPage(storedPage || 'home'); //changes for restoring last page after reload
      fetchClients(storedToken);
      fetchPayments(storedToken);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('currentPage', page); // Save the current page to localStorage whenever it changes
  }, [page]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchClients = async (token) => {
    try {
      console.log('Fetching clients with token:', token.substring(0, 10) + '...');
      const response = await axios.get(`${BASE_URL}/get-clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Clients fetched:', response.data);
      setClientsData(response.data);
    } catch (error) {
      console.error('Fetch clients error:', error.response?.data?.error || error.message);
      handleSessionError(error);
    }
  };

  const fetchPayments = async (token) => {
    try {
      console.log('Fetching payments with token:', token.substring(0, 10) + '...');
      const response = await axios.get(`${BASE_URL}/get-payments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Payments fetched:', response.data);
      setPaymentsData(response.data);
    } catch (error) {
      console.error('Fetch payments error:', error.response?.data?.error || error.message);
      handleSessionError(error);
    }
  };

  const handleSessionError = (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.log('Session invalid, logging out');
      logout();
    } else {
      console.log('Non-auth error:', error.message);
    }
  };

  const logout = () => {
    console.log('Logging out user:', currentUser);
    setCurrentUser(null);
    setSessionToken(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('currentPage');
    setClientsData([]);
    setPaymentsData([]);
    setPage('signIn');
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
      console.log('Deleting row from Google Sheets:', rowData.Client_Name, rowData.Type);
      // Call the delete-client endpoint to remove the client from both worksheets
      await axios.delete(`${BASE_URL}/delete-client`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        data: { Client_Name: rowData.Client_Name, Type: rowData.Type },
      });
      // Update local state to reflect the deletion immediately
      setPaymentsData(paymentsData.filter((_, i) => i !== contextMenu.rowIndex));
      setClientsData(clientsData.filter(client => client.Client_Name !== rowData.Client_Name || client.Type !== rowData.Type));
      hideContextMenu();
      alert('Row deleted successfully.');
    } catch (error) {
      console.error('Delete row error:', error.response?.data?.error || error.message);
      handleSessionError(error);
      alert(`Failed to delete row: ${error.response?.data?.error || error.message}`);
    }
  };

  // const importCsv = async (e) => {
  //   const file = e.target.files[0];
  //   if (!file) return;

  //   const reader = new FileReader();
  //   reader.onload = async (event) => {
  //     const text = event.target.result;
  //     const rows = text.split('\n').map(row => row.trim()).filter(row => row);
  //     if (rows.length === 0) {
  //       alert('CSV file is empty.');
  //       csvFileInputRef.current.value = '';
  //       return;
  //     }

  //     const headers = rows[0].split(',').map(header => header.trim().replace(/\s+/g, ' '));
  //     const expectedHeaders = ['Client Name', 'Type', 'Amount To Be Paid'];
  //     const headersMatch = expectedHeaders.every((header, index) => headers[index] === header);
  //     if (!headersMatch || headers.length !== expectedHeaders.length) {
  //       alert('CSV file must have headers: Client Name, Type, Amount To Be Paid');
  //       csvFileInputRef.current.value = '';
  //       return;
  //     }

  //     const data = rows.slice(1).map(row => {
  //       const cols = row.split(',').map(col => col.trim());
  //       if (cols.length < 3) return null;
  //       const amount = parseFloat(cols[2]);
  //       if (isNaN(amount) || amount <= 0) return null;
  //       return {
  //         Client_Name: cols[0],
  //         Type: cols[1],
  //         Amount_To_Be_Paid: amount,
  //       };
  //     }).filter(row => row);

  //     if (data.length === 0) {
  //       alert('No valid data found in CSV file.');
  //       csvFileInputRef.current.value = '';
  //       return;
  //     }

  //     try {
  //       console.log('Importing CSV data:', data);
  //       await axios.post(`${BASE_URL}/import-csv`, data, {
  //         headers: { Authorization: `Bearer ${sessionToken}` },
  //       });
  //       fetchClients(sessionToken);
  //       fetchPayments(sessionToken);
  //       alert('CSV data imported successfully!');
  //       csvFileInputRef.current.value = '';
  //     } catch (error) {
  //       console.error('Import CSV error:', error.response?.data?.error || error.message);
  //       handleSessionError(error);
  //       alert('Failed to import CSV data: ' + error.message);
  //       csvFileInputRef.current.value = '';
  //     }
  //   };
  //   reader.readAsText(file);
  // };
  // changed
//   const importCsv = async (e) => {
//   const file = e.target.files[0];
//   if (!file) return;

//   setIsImporting(true); // Start loading state

//   const reader = new FileReader();
//   reader.onload = async (event) => {
//     const text = event.target.result;
//     const rows = text.split('\n').map(row => row.trim()).filter(row => row);
//     if (rows.length === 0) {
//       alert('CSV file is empty.');
//       csvFileInputRef.current.value = '';
//       return;
//     }

//     const fieldAliases = {
//       Client_Name: ['client name', 'clientname', 'name', 'client'],
//       Type: ['type', 'category', 'client type'],
//       Email: ['email', 'e-mail', 'email address'],
//       Amount_To_Be_Paid: ['amount to be paid', 'amount', 'monthly payment', 'payment', 'monthlypayment'],
//     };

//     const headers = rows[0].split(',').map(header => header.trim().replace(/\s+/g, ' ').toLowerCase());
//     let dataRows = [];
//     let headerMap = {};

//     // Check if the first row contains headers by looking for any known alias
//     const hasHeaders = Object.keys(fieldAliases).some(field =>
//       headers.some(header => fieldAliases[field].includes(header))
//     );

//     if (hasHeaders) {
//       // Map headers to fields if headers are present
//       Object.keys(fieldAliases).forEach((field) => {
//         const aliasIndex = headers.findIndex(header => fieldAliases[field].includes(header));
//         headerMap[field] = aliasIndex !== -1 ? aliasIndex : -1;
//       });

//       const requiredFields = ['Client_Name', 'Type', 'Amount_To_Be_Paid'];
//       const missingRequiredFields = requiredFields.filter(field => headerMap[field] === -1);
//       if (missingRequiredFields.length > 0) {
//         alert(`Missing required fields in CSV: ${missingRequiredFields.join(', ')}. Expected fields (or aliases): Client Name, Type, Amount To Be Paid. Email is optional.`);
//         csvFileInputRef.current.value = '';
//         return;
//       }

//       dataRows = rows.slice(1); // Skip header row
//     } else {
//       // No headers, assume columns are in order: Client_Name, Type, Email (optional), Amount_To_Be_Paid
//       headerMap = {
//         Client_Name: 0,
//         Type: 1,
//         Email: rows[0].split(',').length === 3 ? -1 : 2, // Email is optional
//         Amount_To_Be_Paid: rows[0].split(',').length === 3 ? 2 : 3, // Adjust based on column count
//       };
//       dataRows = rows; // All rows are data rows
//     }

//     const data = dataRows.map(row => {
//       const cols = row.split(',').map(col => col.trim());
//       if (cols.length < 3) return null; // Need at least Client_Name, Type, Amount_To_Be_Paid
//       const amount = parseFloat(cols[headerMap.Amount_To_Be_Paid] || 0);
//       if (isNaN(amount) || amount <= 0) return null;
//       const email = headerMap.Email !== -1 ? (cols[headerMap.Email] || '') : '';
//       if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
//       return {
//         Client_Name: cols[headerMap.Client_Name] || 'Unknown Client',
//         Type: cols[headerMap.Type] || 'Unknown Type',
//         Email: email,
//         Amount_To_Be_Paid: amount,
//       };
//     }).filter(row => row);

//     if (data.length === 0) {
//       alert('No valid data found in CSV file.');
//       csvFileInputRef.current.value = '';
//       return;
//     }

//     try {
//       console.log('Importing CSV data:', data);
//       await axios.post(`${BASE_URL}/import-csv`, data, {
//         headers: { Authorization: `Bearer ${sessionToken}` },
//       });
//       fetchClients(sessionToken);
//       fetchPayments(sessionToken);
//       alert('CSV data imported successfully!');
//       setTimeout(() => {
//         window.location.reload();
//       }, 5000)
//       csvFileInputRef.current.value = '';
//     } catch (error) {
//       console.error('Import CSV error:', error.response?.data?.error || error.message);
//       handleSessionError(error);
//       alert('Failed to import CSV data: ' + (error.response?.data?.error || error.message));
//       csvFileInputRef.current.value = '';
//     } finally {
//       setIsImporting(false); // End loading state
//     }
//   };
//   reader.readAsText(file);
// };
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
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
          } else {
            current += char;
          }
        }
        
        result.push(current.trim().replace(/^"|"$/g, ''));
        return result.filter(col => col !== ''); // Remove empty columns
      };

      const rows = text.split('\n')
        .map(row => row.trim())
        .filter(row => row && row.length > 0);
        
      if (rows.length === 0) {
        alert('CSV file is empty.');
        csvFileInputRef.current.value = '';
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
                isName: 0
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

          col.values.forEach(value => {
            const val = value.toLowerCase().trim();
            totalLength += val.length;

            // Check if numeric (amount)
            if (/^\d+(\.\d+)?$/.test(val) || /^\d+$/.test(val)) {
              numericCount++;
            }

            // Check for GST indicators
            if (val.includes('gst') || val === 'gst') {
              gstCount++;
            }

            // Check for IT Return indicators
            if (val.includes('it return') || val.includes('itreturn') || val === 'it return' || val === 'itreturn') {
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
            if (val.split(' ').length >= 2 && !/^\d/.test(val) && val.length > 5) {
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
          if (typeScore > maxTypeScore && (col.hasGST > 0 || col.hasITReturn > 0)) {
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
            const nameScore = col.isName + (col.avgLength / 20); // Longer text likely to be names
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

      console.log('Analyzing CSV structure...');
      const columnMapping = detectColumns(rows);
      console.log('Detected column mapping:', columnMapping);

      // Validate that we found essential columns
      if (columnMapping.Client_Name === undefined) {
        alert('Could not detect Client Name column. Please ensure your CSV has client names.');
        csvFileInputRef.current.value = '';
        setIsImporting(false);
        return;
      }

      if (columnMapping.Amount_To_Be_Paid === undefined) {
        alert('Could not detect Amount column. Please ensure your CSV has numeric amounts.');
        csvFileInputRef.current.value = '';
        setIsImporting(false);
        return;
      }

      // Process data with delay to handle API rate limits
      const processDataWithDelay = async (rows, batchSize = 10) => {
        const data = [];
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.trim() === '') continue;
          
          const cols = parseCSVLine(row);
          if (cols.length < 2) continue; // Need at least 2 columns

          // Extract data using detected column mapping
          const clientName = columnMapping.Client_Name !== undefined 
            ? (cols[columnMapping.Client_Name] || '').trim() 
            : '';
          
          const rawType = columnMapping.Type !== undefined 
            ? (cols[columnMapping.Type] || '').trim() 
            : '';
          
          const email = columnMapping.Email !== undefined 
            ? (cols[columnMapping.Email] || '').trim() 
            : '';
          
          const amountStr = columnMapping.Amount_To_Be_Paid !== undefined 
            ? (cols[columnMapping.Amount_To_Be_Paid] || '0').trim() 
            : '0';

          // Skip if no client name
          if (!clientName || clientName === '') continue;

          // Smart type detection and assignment
          let type = 'GST'; // Default type
          if (rawType) {
            const lowerType = rawType.toLowerCase();
            if (lowerType.includes('it return') || lowerType.includes('itreturn') || lowerType === 'it return') {
              type = 'IT Return';
            } else if (lowerType.includes('gst') || lowerType === 'gst') {
              type = 'GST';
            }
          }

          // Parse amount
          const amount = parseFloat(amountStr.replace(/[^\d.-]/g, ''));
          if (isNaN(amount) || amount <= 0) continue;

          // Validate email if provided
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            // Skip invalid emails or clear them
            email = '';
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

      console.log('Processing CSV data...');
      const data = await processDataWithDelay(rows);

      if (data.length === 0) {
        alert('No valid data found in CSV file. Please check your data format.');
        csvFileInputRef.current.value = '';
        setIsImporting(false);
        return;
      }

      console.log(`Importing ${data.length} records...`);

      // Send data in smaller batches to avoid API limits
      const sendInBatches = async (data, batchSize = 50) => {
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        let successCount = 0;
        
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          
          try {
            console.log(`Sending batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(data.length/batchSize)}...`);
            
            const response = await axios.post(`${BASE_URL}/import-csv`, batch, {
              headers: { 
                Authorization: `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000 // 30 second timeout
            });
            
            successCount += batch.length;
            console.log(`Batch ${Math.floor(i/batchSize) + 1} completed successfully`);
            
            // Delay between batches to respect API limits
            if (i + batchSize < data.length) {
              await delay(500); // 500ms delay between batches
            }
            
          } catch (error) {
            console.error(`Error in batch ${Math.floor(i/batchSize) + 1}:`, error);
            
            // If it's a rate limit error, wait longer and retry
            if (error.response?.status === 429 || error.code === 'ECONNABORTED') {
              console.log('Rate limit hit, waiting 2 seconds before retry...');
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
      console.log('Refreshing client and payment data...');
      await Promise.all([
        fetchClients(sessionToken),
        fetchPayments(sessionToken)
      ]);
      
      alert(`CSV import completed successfully! ${importedCount} records imported.`);
      
      // Clear the file input
      csvFileInputRef.current.value = '';
      
      // Optional: Reload page after delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error('Import CSV error:', error);
      
      let errorMessage = 'Failed to import CSV data: ';
      
      if (error.response) {
        errorMessage += error.response.data?.error || error.response.statusText;
      } else if (error.request) {
        errorMessage += 'No response from server. Please check your connection.';
      } else {
        errorMessage += error.message;
      }
      
      alert(errorMessage);
      handleSessionError(error);
      csvFileInputRef.current.value = '';
    } finally {
      setIsImporting(false);
    }
  };
  
  reader.onerror = () => {
    alert('Error reading file. Please try again.');
    setIsImporting(false);
    csvFileInputRef.current.value = '';
  };
  
  reader.readAsText(file);
};

  const updatePayment = async (rowIndex, month, value) => {
  if (value && isNaN(parseFloat(value))) {
    alert('Please enter a valid number');
    return;
  }
  const updatedPayments = [...paymentsData];
  const rowData = updatedPayments[rowIndex];
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = months.indexOf(month);

  rowData[month] = value;

  // If a value is entered, set earlier empty months to '0'
  if (value.trim() !== '') {
    for (let i = 0; i < monthIndex; i++) {
      if (!rowData[months[i]] || rowData[months[i]].trim() === '') {
        rowData[months[i]] = '0';
      }
    }
  } else {
    // If the value is cleared, check if any later months have values
    const hasLaterValues = months.slice(monthIndex + 1).some(m => rowData[m] && rowData[m].trim() !== '');
    if (!hasLaterValues) {
      // Clear zeros in earlier months if no later months have values
      for (let i = 0; i < monthIndex; i++) {
        if (rowData[months[i]] === '0') {
          rowData[months[i]] = '';
        }
      }
    }
  }

  const amountToBePaid = parseFloat(rowData.Amount_To_Be_Paid) || 0;
  const activeMonths = months.filter(m => rowData[m] && parseFloat(rowData[m]) >= 0).length;
  const expectedPayment = amountToBePaid * activeMonths;
  const totalPayments = months.reduce((sum, m) => sum + (parseFloat(rowData[m]) || 0), 0);
  rowData.Due_Payment = Math.max(expectedPayment - totalPayments, 0).toFixed(2);

  setPaymentsData(updatedPayments);
  try {
    console.log('Saving payments for:', rowData.Client_Name, month, value);
    await axios.post(`${BASE_URL}/save-payments`, updatedPayments, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
  } catch (error) {
    console.error('Save payments error:', error.response?.data?.error || error.message);
    handleSessionError(error);
  }
};

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100">
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
            <nav className="bg-gray-800 w-full p-4 sm:hidden flex justify-between items-center">
              <div className="flex items-center">
                <i className="fas fa-money-bill-wave text-2xl mr-2 text-white"></i>
                <h1 className="text-xl font-semibold text-white">
                  Payment Tracker
                </h1>
              </div>
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="text-white focus:outline-none"
              >
                <i className="fas fa-bars text-2xl"></i>
              </button>
            </nav>

            {/* Sidebar */}
            <nav
              className={`bg-blue-900 w-full sm:w-64 p-4 fixed top-0 left-0 h-auto sm:h-full border-r border-gray-200 z-50 ${
                isSidebarOpen ? "block" : "hidden sm:block"
              }`}
            >
              <div className="flex items-center mb-6">
                <i className="fas fa-money-bill-wave text-2xl mr-2 text-white"></i>
                <h1 className="text-xl font-semibold text-white">
                  Payment Tracker
                </h1>
              </div>
              <ul className="space-y-2">
                <li>
                  <button
                    onClick={() => {
                      setPage("home");
                      setIsSidebarOpen(false);
                    }}
                    className="w-full text-left p-2 hover:bg-blue-800 rounded-lg flex items-center text-white"
                  >
                    <i className="fas fa-tachometer-alt mr-2"></i> Dashboard
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setPage("clients");
                      setIsSidebarOpen(false);
                    }}
                    className="w-full text-left p-2 hover:bg-blue-800 rounded-lg flex items-center text-white"
                  >
                    <i className="fas fa-users mr-2"></i> Clients
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setPage("payments");
                      setIsSidebarOpen(false);
                    }}
                    className="w-full text-left p-2 hover:bg-blue-800 rounded-lg flex items-center text-white"
                  >
                    <i className="fas fa-money-bill-wave mr-2"></i> Payments
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setPage("reports");
                      setIsSidebarOpen(false);
                    }}
                    className="w-full text-left p-2 hover:bg-blue-800 rounded-lg flex items-center text-white"
                  >
                    <i className="fas fa-chart-line mr-2"></i> Reports
                  </button>
                </li>
                <li>
                  <button
                    onClick={logout}
                    className="w-full text-left p-2 hover:bg-blue-800 rounded-lg text-red-500 flex items-center"
                  >
                    <i className="fas fa-sign-out-alt mr-2"></i> Logout
                  </button>
                </li>
              </ul>
            </nav>

            {/* Main Content */}
            <main className="flex-1 p-6 overflow-y-auto sm:ml-64 mt-16 sm:mt-0">
              <header className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-semibold text-gray-900">
                  {page === "home"
                    ? "Dashboard"
                    : page.charAt(0).toUpperCase() + page.slice(1)}
                </h1>
                <div className="relative" ref={profileMenuRef}>
                  <button
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    className="focus:outline-none"
                  >
                    <i className="fas fa-user-circle text-3xl text-gray-900"></i>
                  </button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                      <div className="p-4">
                        <p className="font-semibold text-gray-900">
                          {currentUser}
                        </p>
                      </div>
                      <hr className="border-gray-200" />
                      <button
                        onClick={logout}
                        className="w-full text-left p-4 text-red-500 hover:bg-gray-50 flex items-center"
                      >
                        <i className="fas fa-sign-out-alt mr-2"></i> Logout
                      </button>
                    </div>
                  )}
                </div>
              </header>
              {isImporting && (
                <div className="mb-4 p-3 bg-yellow-100 text-yellow-700 rounded-lg text-center">
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
                  fetchClients={fetchClients}
                  fetchPayments={fetchPayments}
                  sessionToken={sessionToken}
                  isImporting={isImporting}
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