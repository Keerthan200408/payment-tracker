import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import api from '../api';
import { debounce } from 'lodash';

import DataTable from '../components/dashboard/DataTable';
import YearSelector from '../components/dashboard/YearSelector';
import NotificationModal from '../components/dashboard/NotificationModal';
import RemarkPopup from '../components/shared/RemarkPopup';

const months = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const DashboardPage = ({ setPage }) => {
  // --- STATE MANAGEMENT ---
  const csvFileInputRef = useRef(null);
  const { sessionToken } = useAuth();
  const { paymentsData, setPaymentsData, fetchPayments, fetchTypes, handleApiError } = useData();

  // Year State
  const [currentYear, setCurrentYear] = useState(() =>
    localStorage.getItem('currentYear') || new Date().getFullYear().toString()
  );
  const [availableYears, setAvailableYears] = useState([]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);

  // Table Interaction State
  const [localInputValues, setLocalInputValues] = useState({});
  const [pendingUpdates, setPendingUpdates] = useState({});
  const saveTimeoutsRef = useRef({});

  // Modal & UI State
  const [remarkPopup, setRemarkPopup] = useState({ isOpen: false });
  const [isImporting, setIsImporting] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [newType, setNewType] = useState('');
  const [typeError, setTypeError] = useState('');
  const [notificationQueue, setNotificationQueue] = useState([]);
  const notificationQueueRef = useRef([]);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [showImportTooltip, setShowImportTooltip] = useState(false);

  // Filtering & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 10;

  // Helper to pick first non-empty candidate (for contact normalization)
  const pickFirst = (...cands) => {
    for (const v of cands) {
      if (v !== undefined && v !== null) {
        const s = (typeof v === 'string' ? v : String(v)).trim();
        if (s) return s;
      }
    }
    return null;
  };

  // --- CORE DATA FETCHING FUNCTIONS ---

  // Fetch available years from the server
  const fetchUserYears = useCallback(async (forceRefresh = false) => {
    if (!sessionToken) return;

    setIsLoadingYears(true);
    try {
      console.log('[fetchUserYears] Starting fetch...');
      const yearsData = await api.payments.getUserYears(forceRefresh);
      const sortedYears = (yearsData || [])
        .map(String)
        .sort((a, b) => b.localeCompare(a)); // Desc order

      console.log('[fetchUserYears] Received years:', sortedYears);
      setAvailableYears(sortedYears);

      // Validate current year selection
      if (sortedYears.length > 0) {
        const storedYear = localStorage.getItem('currentYear');
        if (!sortedYears.includes(storedYear)) {
          const newYear = sortedYears[0];
          console.log('[fetchUserYears] Switching to valid year:', newYear);
          setCurrentYear(newYear);
          localStorage.setItem('currentYear', newYear);
        }
      }
    } catch (error) {
      console.error('[fetchUserYears] Error:', error);
      handleApiError(error);
    } finally {
      setIsLoadingYears(false);
    }
  }, [sessionToken, handleApiError]);

  // Handle year change from dropdown
  const handleYearChange = useCallback((year) => {
    const yearString = year.toString();
    console.log('[handleYearChange] Changing year to:', yearString);

    if (yearString && yearString !== currentYear) {
      setCurrentYear(yearString);
      localStorage.setItem('currentYear', yearString);
      // fetchPayments will be triggered by the useEffect below
    }
  }, [currentYear]);

  // Handle adding a new year
  const handleAddNewYear = useCallback(async () => {
    if (availableYears.length === 0) {
      alert('Please wait for years to load before adding a new year.');
      return;
    }

    const latestYear = Math.max(...availableYears.map(y => parseInt(y, 10))) || new Date().getFullYear();
    const newYear = (latestYear + 1).toString();

    setIsLoadingYears(true);
    try {
      console.log('[handleAddNewYear] Adding year:', newYear);
      await api.payments.addNewYear(newYear);

      // Success - refresh years and switch to the new year
      await fetchUserYears(true);
      setCurrentYear(newYear);
      localStorage.setItem('currentYear', newYear);

      alert(`Year ${newYear} added successfully!`);
    } catch (error) {
      console.error('[handleAddNewYear] Error:', error);
      const errorMessage = error?.response?.data?.error || `Failed to add year ${newYear}.`;

      if (errorMessage.includes('already exists')) {
        await fetchUserYears(true);
        setCurrentYear(newYear);
        localStorage.setItem('currentYear', newYear);
        alert(`Year ${newYear} already exists. Switched to that year.`);
      } else {
        alert(errorMessage);
      }
    } finally {
      setIsLoadingYears(false);
    }
  }, [availableYears, fetchUserYears]);

  // --- USEEFFECT HOOKS FOR DATA FETCHING ---

  // 1. Initial load: Fetch years when user logs in
  useEffect(() => {
    if (sessionToken) {
      console.log('[useEffect] Initial years fetch on login');
      fetchUserYears(true);
    }
  }, [sessionToken, fetchUserYears]);

  // 2. Fetch payments when current year changes
  useEffect(() => {
    if (sessionToken && currentYear) {
      console.log('[useEffect] Fetching payments for year:', currentYear);
      fetchPayments(currentYear, true);
    }
  }, [currentYear, sessionToken, fetchPayments]);

  // 3. Load notification queue
  useEffect(() => {
    const loadQueue = async () => {
      if (sessionToken) {
        try {
          const response = await api.notifications.getQueue();
          const queue = response?.data?.queue || [];
          setNotificationQueue(queue);
          notificationQueueRef.current = queue;
        } catch (error) {
          handleApiError(error);
        }
      }
    };
    loadQueue();
  }, [sessionToken, handleApiError]);

  // 4. Save notification queue when it changes
  useEffect(() => {
    const saveQueue = debounce(async () => {
      if (sessionToken && JSON.stringify(notificationQueue) !== JSON.stringify(notificationQueueRef.current)) {
        try {
          await api.notifications.saveQueue(notificationQueue);
          notificationQueueRef.current = [...notificationQueue];
        } catch (error) {
          handleApiError(error);
        }
      }
    }, 1000);

    saveQueue();
    return () => saveQueue.cancel();
  }, [notificationQueue, sessionToken, handleApiError]);

  // 5. Initialize local input values when payments data changes
  useEffect(() => {
    if (Array.isArray(paymentsData)) {
      console.log('[useEffect] Payments data changed, clearing local values for new year');
      // Clear all local input values when switching years to avoid stale data
      setLocalInputValues({});

      const initialValues = {};
      paymentsData.forEach((row, globalRowIndex) => {
        months.forEach((month) => {
          const key = `${globalRowIndex}-${month}`;
          initialValues[key] = row[month] || '';
        });
      });
      setLocalInputValues(initialValues);
    }
  }, [paymentsData]);

  // Cleanup any pending save timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimeoutsRef.current || {}).forEach((t) => clearTimeout(t));
      saveTimeoutsRef.current = {};
    };
  }, []);

  // --- OTHER HANDLER FUNCTIONS ---

  const clearQueueFromDB = async () => {
    try {
      await api.notifications.clearQueue();
      setNotificationQueue([]);
      notificationQueueRef.current = [];
    } catch (error) {
      handleApiError(error);
    }
  };

  const handleRemarkSaved = (clientName, type, month, newRemark) => {
    const monthKey = month.charAt(0).toUpperCase() + month.slice(1);
    const newPaymentsData = paymentsData.map(row => {
      if (row.Client_Name === clientName && row.Type === type) {
        const updatedRemarks = { ...row.Remarks, [monthKey]: newRemark };
        return { ...row, Remarks: updatedRemarks };
      }
      return row;
    });
    setPaymentsData(newPaymentsData);
  };

  const savePayment = useCallback(async (rowIndex, month, value) => {
    const row = paymentsData[rowIndex];
    if (!row) return;

    const key = `${rowIndex}-${month}`;
    setPendingUpdates(prev => ({ ...prev, [key]: true }));
    try {
      const response = await api.payments.savePayment(
        { clientName: row.Client_Name, type: row.Type, month, value },
        currentYear
      );

      if (response?.data?.updatedRow) {
        const u = response.data.updatedRow;

        // reflect server-calculated due
        setPaymentsData(prev => prev.map((item, idx) =>
          idx === rowIndex
            ? { ...item, [month]: value, Due_Payment: u.Due_Payment }
            : item
        ));

        // Normalize contact fields for queue item (server row first, then table row)
        const email = pickFirst(
          u?.email, u?.Email, u?.['E-mail'], u?.Email_Address, u?.['Email Address'], u?.Mail,
          row?.email, row?.Email, row?.['E-mail'], row?.Email_Address, row?.['Email Address'], row?.Mail
        );
        const phone = pickFirst(
          u?.phone, u?.Phone, u?.Phone_Number, u?.['Phone Number'], u?.whatsapp, u?.WhatsApp, u?.contactPhone, u?.Mobile, u?.Mobile_Number, u?.['Mobile Number'],
          row?.phone, row?.Phone, row?.Phone_Number, row?.['Phone Number'], row?.whatsapp, row?.WhatsApp, row?.contactPhone, row?.Mobile, row?.Mobile_Number, row?.['Mobile Number']
        );

        setNotificationQueue(prev => {
          const filtered = prev.filter(n =>
            !(n.clientName === row.Client_Name && n.type === row.Type && n.month === month)
          );
          return [
            ...filtered,
            {
              id: `${row.Client_Name}-${row.Type}-${month}-${Date.now()}`,
              clientName: row.Client_Name,
              type: row.Type,
              month,
              value,
              duePayment: u.Due_Payment,
              email: email || null,
              phone: phone || null,
            }
          ];
        });
      }
    } catch (error) {
      handleApiError(error);
      setLocalInputValues(prev => ({
        ...prev,
        [key]: row[month] || ''
      }));
    } finally {
      setPendingUpdates(prev => {
        const newPending = { ...prev };
        delete newPending[key];
        return newPending;
      });
    }
  }, [paymentsData, currentYear, setPaymentsData, handleApiError]);

  const handleInputChange = useCallback((rowIndex, month, value) => {
    const key = `${rowIndex}-${month}`;
    setLocalInputValues(prev => ({ ...prev, [key]: value }));

    if (saveTimeoutsRef.current[key]) {
      clearTimeout(saveTimeoutsRef.current[key]);
    }

    saveTimeoutsRef.current[key] = setTimeout(() => {
      if (paymentsData[rowIndex]) {
        savePayment(rowIndex, month, value);
      }
      delete saveTimeoutsRef.current[key];
    }, 1000);
  }, [paymentsData, savePayment]);

  const getInputBackgroundColor = useCallback((row, month, rowIndex) => {
    const key = `${rowIndex}-${month}`;
    const currentValue = localInputValues[key] !== undefined
      ? localInputValues[key]
      : (row?.[month] || '');
    const amountToBePaid = parseFloat(row?.Amount_To_Be_Paid || 0);
    const paidInMonth = parseFloat(currentValue) || 0;

    let status = 'Unpaid';
    if (amountToBePaid > 0) {
      if (paidInMonth >= amountToBePaid) status = 'Paid';
      else if (paidInMonth > 0) status = 'PartiallyPaid';
    }

    const isPending = pendingUpdates[key];
    const baseColor = status === 'Unpaid'
      ? 'bg-red-100 border-red-200'
      : status === 'PartiallyPaid'
        ? 'bg-yellow-100 border-yellow-200'
        : 'bg-green-100 border-green-200';

    return isPending ? `${baseColor} ring-2 ring-blue-300` : baseColor;
  }, [localInputValues, pendingUpdates]);

  const handleAddType = async () => {
    if (!newType.trim()) {
      setTypeError('Type cannot be empty.');
      return;
    }

    try {
      await api.types.addType({ type: newType.trim() });
      await fetchTypes(true);
      setIsTypeModalOpen(false);
      setNewType('');
      setTypeError('');
      alert('Type added successfully!');
    } catch (error) {
      setTypeError(error?.response?.data?.error || 'Failed to add type.');
    }
  };

  const importCsv = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const rows = text
        .split('\n')
        .filter(row => row.trim())
        .map(row => {
          const cols = row
            .split(',')
            .map(cell => cell.trim().replace(/^"|"$/g, ''));
          return cols.filter(col => col.trim());
        });

      if (rows.length === 0) {
        throw new Error('CSV file is empty.');
      }

      // Get current types for validation
      const typesResponse = await api.types.getTypes(true);
      let types = typesResponse.types || [];
      let capitalizedTypes = types.map(type => type.toUpperCase());

      // First row should be headers
      const headers = rows[0].map(header => header.trim().toLowerCase());
      const dataRows = rows.slice(1); // Skip header row
     
      // Find column indices
      const clientNameIndex = headers.findIndex(h => h.includes('client') && h.includes('name'));
      const typeIndex = headers.findIndex(h => h.includes('type') && !h.includes('client'));
      const amountIndex = headers.findIndex(h => h.includes('payment') || h.includes('amount'));
      const emailIndex = headers.findIndex(h => h.includes('email'));
      const phoneIndex = headers.findIndex(h => h.includes('phone'));
     
      // Validate required columns exist
      if (clientNameIndex === -1) {
        throw new Error('CSV must have a "Client_Name" column');
      }
      if (typeIndex === -1) {
        throw new Error('CSV must have a "Type" column');
      }
      if (amountIndex === -1) {
        throw new Error('CSV must have a "Monthly_Payment" or "Amount" column');
      }

      // First pass: collect all unique types from CSV
      const csvTypes = new Set();
      const newTypesToAdd = [];

      dataRows.forEach((row) => {
        const type = row[typeIndex]?.trim().toUpperCase() || "";
        if (type) {
          csvTypes.add(type);
          if (!capitalizedTypes.includes(type)) {
            newTypesToAdd.push(type);
          }
        }
      });

      // Add new types to the system if any are found
      if (newTypesToAdd.length > 0) {
        console.log('[importCsv] Adding new types:', newTypesToAdd);
        
        // Add each new type
        for (const newType of newTypesToAdd) {
          try {
            await api.types.addType({ type: newType });
            capitalizedTypes.push(newType);
          } catch (error) {
            console.warn(`[importCsv] Failed to add type "${newType}":`, error);
            // Continue with other types even if one fails
          }
        }

        // Refresh types list after adding new ones
        try {
          const updatedTypesResponse = await api.types.getTypes(true);
          types = updatedTypesResponse.types || [];
          capitalizedTypes = types.map(type => type.toUpperCase());
        } catch (error) {
          console.warn('[importCsv] Failed to refresh types list:', error);
        }
      }
     
      // Process data rows
      const records = [];
      const parseErrors = [];

      dataRows.forEach((row, index) => {
        const clientName = row[clientNameIndex]?.trim() || "";
        const type = row[typeIndex]?.trim().toUpperCase() || "";
        const amountStr = row[amountIndex]?.trim() || "";
        const email = row[emailIndex]?.trim() || "";
        const phone = row[phoneIndex]?.trim() || "";
       
        // Validate required fields
        if (!clientName) {
          parseErrors.push(`Row ${index + 2}: Client Name is required`);
          return;
        }
       
        if (!type) {
          parseErrors.push(`Row ${index + 2}: Type is required`);
          return;
        }
       
        // Since we've added new types above, this check should now pass for all valid types
        if (!capitalizedTypes.includes(type)) {
          parseErrors.push(`Row ${index + 2}: Type "${type}" could not be processed`);
          return;
        }
       
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          parseErrors.push(`Row ${index + 2}: Monthly Payment must be a positive number (got: "${amountStr}")`);
          return;
        }
       
        // Format as expected by backend: [amount, type, email, clientName, phone]
        records.push([amount, type, email, clientName, phone]);
      });

      if (records.length === 0) {
        throw new Error(`No valid records found. Errors:\n${parseErrors.join('\n')}`);
      }

      const response = await api.payments.importCsv(records, currentYear);
     
      // Show detailed success message
      const summary = response.data?.summary || response.summary;
      let message = `CSV import completed!\n\n`;
      message += `• Total records: ${summary?.totalRecords || 'Unknown'}\n`;
      message += `• Successfully imported: ${summary?.successfulImports || 'Unknown'}\n`;
      message += `• Duplicates skipped: ${summary?.skippedDuplicates || 'Unknown'}\n`;
      message += `• Errors: ${summary?.errors || 'Unknown'}`;
     
      if (parseErrors.length > 0) {
        message += `\n\nParse errors:\n${parseErrors.join('\n')}`;
      }
     
      alert(message);

      // Refresh both years and payments, and also refresh types
      await fetchUserYears(true);
      await fetchPayments(currentYear, true);
      if (newTypesToAdd.length > 0) {
        await fetchTypes(true);
      }
    } catch (error) {
      handleApiError(error);
     
      // Show detailed error message
      let errorMessage = error?.response?.data?.error || error.message || 'Failed to import CSV.';
     
      const errorData = error?.response?.data;
      if (errorData?.details?.errors?.length > 0) {
        errorMessage += '\n\nServer validation errors:\n' +
          errorData.details.errors.join('\n');
      }
     
      if (errorData?.details?.duplicates?.length > 0) {
        errorMessage += '\n\nDuplicates found:\n' +
          errorData.details.duplicates.map(d =>
            `• ${d.clientName} (${d.type}) - ${d.reason}`
          ).join('\n');
      }
     
      alert(errorMessage);
    } finally {
      setIsImporting(false);
      if (csvFileInputRef.current) {
        csvFileInputRef.current.value = '';
      }
    }
  };

  // --- FILTERING AND PAGINATION ---

  const filteredData = useMemo(() => {
    return (paymentsData || [])
      .filter(row => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return row.Client_Name?.toLowerCase().includes(query) ||
               row.Type?.toLowerCase().includes(query);
      })
      .filter(row => {
        if (!monthFilter || !statusFilter) return true;
        const amountToBePaid = parseFloat(row.Amount_To_Be_Paid || 0);
        if (amountToBePaid <= 0) return statusFilter === 'Paid';

        const paidInMonth = parseFloat(row[monthFilter] || 0);
        let currentStatus = 'Unpaid';
        if (paidInMonth >= amountToBePaid) currentStatus = 'Paid';
        else if (paidInMonth > 0) currentStatus = 'PartiallyPaid';

        return currentStatus === statusFilter;
      });
  }, [paymentsData, searchQuery, monthFilter, statusFilter]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * entriesPerPage;
    return filteredData.slice(startIndex, startIndex + entriesPerPage);
  }, [filteredData, currentPage, entriesPerPage]);

  const totalEntries = filteredData.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, monthFilter, statusFilter, currentYear]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
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
          <div className="relative">
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
              } transition duration-200 relative`}
            >
              <i className="fas fa-upload mr-2"></i>
              {isImporting ? "Importing..." : "Bulk Import"}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowImportTooltip(!showImportTooltip);
                }}
                className="ml-2 w-5 h-5 rounded-full bg-gray-600 text-white text-xs flex items-center justify-center hover:bg-gray-700"
              >
                i
              </button>
            </label>
            {showImportTooltip && (
              <div className="absolute top-full mt-2 left-0 z-50 bg-gray-800 text-white p-3 rounded-lg shadow-lg text-sm w-72">
                <div className="font-semibold mb-2">CSV File Requirements:</div>
                <div className="space-y-1">
                  <div>Required columns:</div>
                  <ul className="list-disc list-inside ml-2">
                    <li><strong>Client_Name</strong> - Client's name</li>
                    <li><strong>Type</strong> - Service type (e.g., GST, IT)</li>
                    <li><strong>Monthly_Payment</strong> - Payment amount</li>
                  </ul>
                  <div className="mt-2">Optional columns:</div>
                  <ul className="list-disc list-inside ml-2">
                    <li><strong>Phone_Number</strong> - Contact number</li>
                    <li><strong>Email</strong> - Email address</li>
                  </ul>
                </div>
                <div className="mt-2 text-xs text-gray-300">
                  Note: New types found in CSV will be automatically added to your types list.
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowImportTooltip(false);
                  }}
                  className="absolute top-1 right-1 text-gray-400 hover:text-white"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
          </div>
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
          <select
            value={currentYear}
            onChange={(e) => handleYearChange(e.target.value)}
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
      </div>

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
            <option key={month} value={month}>
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
          <DataTable
            data={paginatedData}
            paymentsData={paymentsData}
            months={months}
            localInputValues={localInputValues}
            handleInputChange={handleInputChange}
            getInputBackgroundColor={getInputBackgroundColor}
            onRemarkButtonClick={(info) =>
              setRemarkPopup({ ...info, isOpen: true })
            }
          />
        </div>
      </div>

      {/* Pagination */}
      {totalEntries > entriesPerPage && (
        <div className="flex justify-between items-center mt-6">
          <p className="text-sm text-gray-700">
            Showing {(currentPage - 1) * entriesPerPage + 1} to{" "}
            {Math.min(currentPage * entriesPerPage, totalEntries)} of{" "}
            {totalEntries} entries
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
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
                  currentPage === i + 1
                    ? "bg-gray-800 text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 disabled:opacity-50 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <RemarkPopup
        isOpen={remarkPopup.isOpen}
        onClose={() => setRemarkPopup({ isOpen: false })}
        onRemarkSaved={handleRemarkSaved}
        {...remarkPopup}
      />

      <NotificationModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        queue={notificationQueue}
        setQueue={setNotificationQueue}
        clearQueueFromDB={clearQueueFromDB} // pass clear
        paymentsData={paymentsData} // pass for enrichment
      />

      {/* Add Type Modal */}
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
              onChange={(e) => {
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
    </div>
  );
};

export default DashboardPage;