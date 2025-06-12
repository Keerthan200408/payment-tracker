

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

  setIsImporting(true); // Start loading state

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const text = event.target.result;
      
      // Better CSV parsing - handle quoted fields and commas within quotes
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        
        result.push(current.trim());
        return result;
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

      const fieldAliases = {
        Client_Name: ['client name', 'clientname', 'name', 'client'],
        Type: ['type', 'category', 'client type'],
        Email: ['email', 'e-mail', 'email address'],
        Amount_To_Be_Paid: ['amount to be paid', 'amount', 'monthly payment', 'payment', 'monthlypayment'],
      };

      // Parse the first row to check for headers
      const firstRowCols = parseCSVLine(rows[0]);
      const headers = firstRowCols.map(header => 
        header.trim().replace(/\s+/g, ' ').toLowerCase().replace(/"/g, '')
      );
      
      let dataRows = [];
      let headerMap = {};

      // Check if the first row contains headers
      const hasHeaders = Object.keys(fieldAliases).some(field =>
        headers.some(header => fieldAliases[field].includes(header))
      );

      if (hasHeaders) {
        // Map headers to fields if headers are present
        Object.keys(fieldAliases).forEach((field) => {
          const aliasIndex = headers.findIndex(header => fieldAliases[field].includes(header));
          headerMap[field] = aliasIndex !== -1 ? aliasIndex : -1;
        });

        const requiredFields = ['Client_Name', 'Type', 'Amount_To_Be_Paid'];
        const missingRequiredFields = requiredFields.filter(field => headerMap[field] === -1);
        
        if (missingRequiredFields.length > 0) {
          alert(`Missing required fields in CSV: ${missingRequiredFields.join(', ')}. Expected fields (or aliases): Client Name, Type, Amount To Be Paid. Email is optional.`);
          csvFileInputRef.current.value = '';
          setIsImporting(false);
          return;
        }

        dataRows = rows.slice(1); // Skip header row
      } else {
        // No headers, assume columns are in order: Client_Name, Type, Email (optional), Amount_To_Be_Paid
        const colCount = firstRowCols.length;
        if (colCount < 3) {
          alert('CSV must have at least 3 columns: Client Name, Type, Amount To Be Paid. Email is optional.');
          csvFileInputRef.current.value = '';
          setIsImporting(false);
          return;
        }
        
        headerMap = {
          Client_Name: 0,
          Type: 1,
          Email: colCount === 3 ? -1 : 2, // Email is optional
          Amount_To_Be_Paid: colCount === 3 ? 2 : 3, // Adjust based on column count
        };
        dataRows = rows; // All rows are data rows
      }

      const data = [];
      
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.trim() === '') continue;
        
        const cols = parseCSVLine(row).map(col => col.trim().replace(/"/g, ''));
        
        // Skip rows that don't have enough columns
        if (cols.length < 3) {
          console.warn(`Skipping row ${i + 1}: insufficient columns`);
          continue;
        }

        // Extract data based on header mapping
        const clientName = cols[headerMap.Client_Name] || '';
        const type = cols[headerMap.Type] || '';
        const email = headerMap.Email !== -1 ? (cols[headerMap.Email] || '') : '';
        const amountStr = cols[headerMap.Amount_To_Be_Paid] || '0';
        
        // Validate required fields
        if (!clientName || clientName.trim() === '') {
          console.warn(`Skipping row ${i + 1}: missing client name`);
          continue;
        }
        
        if (!type || type.trim() === '') {
          console.warn(`Skipping row ${i + 1}: missing type`);
          continue;
        }
        
        // Validate type
        if (!['GST', 'IT Return'].includes(type)) {
          console.warn(`Skipping row ${i + 1}: invalid type "${type}". Must be "GST" or "IT Return"`);
          continue;
        }
        
        // Parse and validate amount
        const amount = parseFloat(amountStr.replace(/[^\d.-]/g, '')); // Remove currency symbols
        if (isNaN(amount) || amount <= 0) {
          console.warn(`Skipping row ${i + 1}: invalid amount "${amountStr}"`);
          continue;
        }
        
        // Validate email if provided
        if (email && email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          console.warn(`Skipping row ${i + 1}: invalid email "${email}"`);
          continue;
        }
        
        data.push({
          Client_Name: clientName.trim(),
          Type: type.trim(),
          Email: email.trim(),
          Amount_To_Be_Paid: amount,
        });
      }

      if (data.length === 0) {
        alert('No valid data found in CSV file. Please check the format and required fields.');
        csvFileInputRef.current.value = '';
        setIsImporting(false);
        return;
      }

      console.log('Importing CSV data:', data);
      
      // Make the API call
      const response = await axios.post(`${BASE_URL}/import-csv`, data, {
        headers: { 
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
      });

      // Refresh data after successful import
      await Promise.all([
        fetchClients(sessionToken),
        fetchPayments(sessionToken)
      ]);
      
      alert(`CSV data imported successfully! ${data.length} records processed.`);
      
      // Clear the file input
      csvFileInputRef.current.value = '';
      
      // Optional: Reload page after delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error('Import CSV error:', error);
      
      // Handle different types of errors
      let errorMessage = 'Failed to import CSV data: ';
      
      if (error.response) {
        // Server responded with error status
        errorMessage += error.response.data?.error || error.response.statusText;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage += 'No response from server. Please check your connection.';
      } else {
        // Something else happened
        errorMessage += error.message;
      }
      
      alert(errorMessage);
      handleSessionError(error);
      csvFileInputRef.current.value = '';
    } finally {
      setIsImporting(false); // End loading state
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