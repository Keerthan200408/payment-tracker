import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import SignInPage from './SignInPage.jsx';
import HomePage from './HomePage.jsx';
import AddClientPage from './AddClientPage.jsx';
import ClientsPage from './ClientsPage.jsx';
import PaymentsPage from './PaymentsPage.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const App = () => {
  const [sessionToken, setSessionToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState('signIn');
  const [clientsData, setClientsData] = useState([]);
  const [paymentsData, setPaymentsData] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [contextTargetRow, setContextTargetRow] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editClient, setEditClient] = useState(null);
  const csvFileInputRef = useRef(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    const storedToken = localStorage.getItem('sessionToken');
    if (storedUser && storedToken) {
      setCurrentUser(storedUser);
      setSessionToken(storedToken);
      fetchClients(storedToken);
      fetchPayments(storedToken);
      setPage('home');
    }
  }, []);

  const fetchClients = async (token) => {
    try {
      const response = await axios.get(`${BASE_URL}/api/get-clients`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      setClientsData(response.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
      handleSessionError(error);
    }
  };

  const fetchPayments = async (token) => {
    try {
      const response = await axios.get(`${BASE_URL}/api/get-payments`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      setPaymentsData(response.data);
    } catch (error) {
      console.error('Error fetching payments:', error);
      handleSessionError(error);
    }
  };

  const handleSessionError = (error) => {
    if (error.response && error.response.status === 401) {
      logout();
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setSessionToken(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionToken');
    setClientsData([]);
    setPaymentsData([]);
    setPage('signIn');
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleContextMenu = (e, rowIndex) => {
    e.preventDefault();
    const x = Math.min(e.pageX, window.innerWidth - 150);
    const y = Math.min(e.pageY, window.innerHeight - 100);
    setContextTargetRow({ rowIndex, x, y });
  };

  const hideContextMenu = () => setContextTargetRow(null);

  const deleteRow = async () => {
    if (paymentsData.length <= 1) {
      alert('Cannot delete the last row.');
      hideContextMenu();
      return;
    }
    const rowData = paymentsData[contextTargetRow.rowIndex];
    try {
      await axios.delete(`${BASE_URL}/api/delete-client`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        withCredentials: true,
        data: { Client_Name: rowData.Client_Name, Type: rowData.Type },
      });
      setPaymentsData(paymentsData.filter((_, i) => i !== contextTargetRow.rowIndex));
      setClientsData(clientsData.filter(client => client.Client_Name !== rowData.Client_Name || client.Type !== rowData.Type));
      hideContextMenu();
    } catch (error) {
      console.error('Error deleting row:', error);
      handleSessionError(error);
    }
  };

  const importCsv = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const rows = text.split('\n').map(row => row.trim()).filter(row => row);
      if (rows.length === 0) {
        alert('CSV file is empty.');
        csvFileInputRef.current.value = '';
        return;
      }

      const headers = rows[0].split(',').map(header => header.trim().replace(/\s+/g, ' '));
      const expectedHeaders = ['Client Name', 'Type', 'Amount To Be Paid'];
      const headersMatch = expectedHeaders.every((header, index) => headers[index] === header);
      if (!headersMatch || headers.length !== expectedHeaders.length) {
        alert('CSV file must have headers: Client Name, Type, Amount To Be Paid');
        csvFileInputRef.current.value = '';
        return;
      }

      const data = rows.slice(1).map(row => {
        const cols = row.split(',').map(col => col.trim());
        if (cols.length < 3) return null;
        const amount = parseFloat(cols[2]);
        if (isNaN(amount) || amount <= 0) return null;
        return {
          Client_Name: cols[0],
          Type: cols[1],
          Amount_To_Be_Paid: amount,
        };
      }).filter(row => row);

      if (data.length === 0) {
        alert('No valid data found in CSV file.');
        csvFileInputRef.current.value = '';
        return;
      }

      try {
        await axios.post(`${BASE_URL}/api/import-csv`, data, {
          headers: { Authorization: `Bearer ${sessionToken}` },
          withCredentials: true,
        });
        fetchClients(sessionToken);
        fetchPayments(sessionToken);
        alert('CSV data imported successfully!');
        csvFileInputRef.current.value = '';
      } catch (error) {
        console.error('Error importing CSV:', error);
        handleSessionError(error);
        alert('Failed to import CSV data: ' + error.message);
        csvFileInputRef.current.value = '';
      }
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

    if (value.trim() !== '') {
      for (let i = 0; i < monthIndex; i++) {
        if (!rowData[months[i]] || rowData[months[i]].trim() === '') {
          rowData[months[i]] = '0';
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
      await axios.post(`${BASE_URL}/api/save-payments`, updatedPayments, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        withCredentials: true,
      });
    } catch (error) {
      console.error('Error saving payments:', error);
      handleSessionError(error);
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {page === 'signIn' && (
          <SignInPage
            setSessionToken={setSessionToken}
            setCurrentUser={setCurrentUser}
            setPage={setPage}
          />
        )}
        {page !== 'signIn' && (
          <div className="flex h-screen">
            <nav
              className={`bg-white w-64 p-4 fixed top-0 h-full transition-transform duration-300 border-r border-gray-200 z-50 ${
                isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            >
              <div className="flex items-center mb-6">
                <i className="fas fa-money-bill-wave text-2xl mr-2"></i>
                <h1 className="text-xl font-semibold">Payment Tracker</h1>
              </div>
              <ul className="space-y-2">
                <li>
                  <button
                    onClick={() => {
                      setPage('home');
                      setIsSidebarOpen(false);
                    }}
                    className="w-full text-left p-2 hover:bg-gray-100 rounded-lg flex items-center"
                  >
                    <i className="fas fa-tachometer-alt mr-2"></i> Dashboard
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setPage('clients');
                      setIsSidebarOpen(false);
                    }}
                    className="w-full text-left p-2 hover:bg-gray-100 rounded-lg flex items-center"
                  >
                    <i className="fas fa-users mr-2"></i> Clients
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setPage('payments');
                      setIsSidebarOpen(false);
                    }}
                    className="w-full text-left p-2 hover:bg-gray-100 rounded-lg flex items-center"
                  >
                    <i className="fas fa-money-bill-wave mr-2"></i> Payments
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      alert('Reports coming soon!');
                      setIsSidebarOpen(false);
                    }}
                    className="w-full text-left p-2 hover:bg-gray-100 rounded-lg flex items-center"
                  >
                    <i className="fas fa-chart-line mr-2"></i> Reports
                  </button>
                </li>
                <li>
                  <button
                    onClick={logout}
                    className="w-full text-left p-2 hover:bg-gray-100 rounded-lg text-red-500 flex items-center"
                  >
                    <i className="fas fa-sign-out-alt mr-2"></i> Logout
                  </button>
                </li>
              </ul>
            </nav>
            {isSidebarOpen && (
              <div
                className="fixed inset-0 bg-black bg-opacity-50 z-40"
                onClick={toggleSidebar}
              ></div>
            )}

            <main
              className="flex-1 p-6 overflow-y-auto transition-all duration-300"
              style={{ marginLeft: isSidebarOpen ? '16rem' : '0' }}
            >
              <header className="flex items-center justify-between mb-6">
                <button onClick={toggleSidebar} className="focus:outline-none">
                  <i
                    className={`fas fa-${isSidebarOpen ? 'times' : 'bars'} text-xl`}
                  ></i>
                </button>
                <div className="flex items-center space-x-4">
                  <i className="fas fa-bell"></i>
                  <i className="fas fa-user-circle text-2xl"></i>
                </div>
              </header>

              {page === 'home' && (
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
                  contextTargetRow={contextTargetRow}
                  hideContextMenu={hideContextMenu}
                  deleteRow={deleteRow}
                  setPage={setPage}
                  csvFileInputRef={csvFileInputRef}
                  importCsv={importCsv}
                />
              )}
              {page === 'addClient' && (
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
              {page === 'clients' && (
                <ClientsPage
                  clientsData={clientsData}
                  setPage={setPage}
                  setEditClient={setEditClient}
                  fetchClients={fetchClients}
                  fetchPayments={fetchPayments}
                  sessionToken={sessionToken}
                />
              )}
              {page === 'payments' && (
                <PaymentsPage
                  paymentsData={paymentsData}
                  fetchClients={fetchClients}
                  fetchPayments={fetchPayments}
                  sessionToken={sessionToken}
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