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
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
];

const DashboardPage = ({ setPage }) => {
    const csvFileInputRef = useRef(null);
    const { sessionToken } = useAuth();
    const { 
        paymentsData, 
        setPaymentsData, 
        fetchPayments, 
        fetchTypes, 
        handleApiError,
        fetchClients,
    } = useData();
    
    const [currentYear, setCurrentYear] = useState(() => localStorage.getItem("currentYear") || new Date().getFullYear().toString());
    const [availableYears, setAvailableYears] = useState([currentYear]);
    const [isLoadingYears, setIsLoadingYears] = useState(false);
    const [localInputValues, setLocalInputValues] = useState({});
    const [pendingUpdates, setPendingUpdates] = useState({});
    const saveTimeoutsRef = useRef({});
    const [remarkPopup, setRemarkPopup] = useState({ isOpen: false });

    const [isImporting, setIsImporting] = useState(false);
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
    const [newType, setNewType] = useState("");
    const [typeError, setTypeError] = useState("");

    const [notificationQueue, setNotificationQueue] = useState([]);
    const notificationQueueRef = useRef([]);
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
    
    // --- NEW: State for Filtering & Pagination ---
    const [searchQuery, setSearchQuery] = useState("");
    const [monthFilter, setMonthFilter] = useState(''); // <-- ADDED THIS LINE
    const [statusFilter, setStatusFilter] = useState(''); // <-- ADDED THIS LINE
    const [currentPage, setCurrentPage] = useState(1);
    const entriesPerPage = 10;
    
    // 👇 THIS IS THE FIX 👇
    // This hook runs when the page loads. It fetches the payment
    // data for the currently selected year, ensuring that after a
    // refresh, the data is re-loaded.
    useEffect(() => {
        if (sessionToken && currentYear) {
            fetchPayments(currentYear);
        }
    }, [sessionToken, currentYear, fetchPayments]);


    useEffect(() => {
        const fetchUserYears = async () => {
            if (sessionToken) {
                setIsLoadingYears(true);
                try {
                    const yearsData = await api.payments.getUserYears(); 
                    setAvailableYears(yearsData.length > 0 ? yearsData : [currentYear]);
                } catch (error) {
                    handleApiError(error);
                    setAvailableYears([currentYear]);
                } finally {
                    setIsLoadingYears(false);
                }
            }
        };
        fetchUserYears();
    }, [sessionToken, handleApiError]);

    useEffect(() => {
        const loadQueue = async () => {
            if (sessionToken) {
                try {
                    const response = await api.notifications.getQueue();
                    const queue = response.data.queue || [];
                    setNotificationQueue(queue);
                    notificationQueueRef.current = queue;
                } catch (error) { handleApiError(error); }
            }
        };
        loadQueue();
    }, [sessionToken, handleApiError]);

    useEffect(() => {
        const saveQueue = debounce(async () => {
            if (sessionToken && JSON.stringify(notificationQueue) !== JSON.stringify(notificationQueueRef.current)) {
                try {
                    await api.notifications.saveQueue(notificationQueue);
                    notificationQueueRef.current = [...notificationQueue];
                } catch (error) { handleApiError(error); }
            }
        }, 1000);
        saveQueue();
        return () => saveQueue.cancel();
    }, [notificationQueue, sessionToken, handleApiError]);
    
    useEffect(() => {
        const initialValues = {};
        if (Array.isArray(paymentsData)) {
            paymentsData.forEach((row, globalRowIndex) => {
                months.forEach((month) => {
                    const key = `${globalRowIndex}-${month}`;
                    if (localInputValues[key] === undefined) {
                        initialValues[key] = row[month] || "";
                    }
                });
            });
            setLocalInputValues(prev => ({ ...prev, ...initialValues }));
        }
    }, [paymentsData]);
    
    const clearQueueFromDB = async () => {
        try {
            await api.notifications.clearQueue();
            setNotificationQueue([]);
            notificationQueueRef.current = [];
        } catch (error) { handleApiError(error); }
    };

    // --- MEMOIZED CALCULATIONS for Filtering and Pagination ---
    const filteredData = useMemo(() => {
        return (paymentsData || [])
            .filter(row => {
                if (!searchQuery) return true;
                const query = searchQuery.toLowerCase();
                return row.Client_Name?.toLowerCase().includes(query) || row.Type?.toLowerCase().includes(query);
            })
            .filter(row => {
                if (!monthFilter || !statusFilter) return true;
                const amountToBePaid = parseFloat(row.Amount_To_Be_Paid || 0);
                if (amountToBePaid <= 0) return statusFilter === 'Paid';
                const paidInMonth = parseFloat(row[monthFilter] || 0);
                let currentStatus = "Unpaid";
                if (paidInMonth >= amountToBePaid) currentStatus = "Paid";
                else if (paidInMonth > 0) currentStatus = "PartiallyPaid";
                return currentStatus === statusFilter;
            });
    }, [paymentsData, searchQuery, monthFilter, statusFilter]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * entriesPerPage;
        return filteredData.slice(startIndex, startIndex + entriesPerPage);
    }, [filteredData, currentPage, entriesPerPage]);

    const totalEntries = filteredData.length;
    const totalPages = Math.ceil(totalEntries / entriesPerPage);

    const handleYearChange = (year) => {
        setCurrentYear(year);
        localStorage.setItem("currentYear", year);
        fetchPayments(year, true);
    };

    const handleAddNewYear = async () => {
        const latestYear = availableYears.sort((a,b) => b-a)[0] || currentYear;
        const newYear = (parseInt(latestYear) + 1).toString();
        setIsLoadingYears(true);
        try {
            await api.payments.addNewYear(newYear);
            const updatedYears = await api.payments.getUserYears(true);
            setAvailableYears(updatedYears);
            handleYearChange(newYear);
            alert(`Year ${newYear} added successfully!`);
        } catch (error) {
            handleApiError(error);
            alert(error.response?.data?.error || `Failed to add year ${newYear}.`);
        } finally {
            setIsLoadingYears(false);
        }
    };



    // --- THIS IS THE FINAL, CORRECTED FUNCTION ---
    const handleRemarkSaved = (clientName, type, month, newRemark) => {
        const monthKey = month.charAt(0).toUpperCase() + month.slice(1);

        // This function creates a new array with the updated data,
        // which guarantees React will re-render the dashboard.
        const newPaymentsData = paymentsData.map(row => {
            if (row.Client_Name === clientName && row.Type === type) {
                // Create a new Remarks object for immutability
                const updatedRemarks = { ...row.Remarks, [monthKey]: newRemark };
                // Return a new row object with the updated remarks
                return { ...row, Remarks: updatedRemarks };
            }
            return row; // Return all other rows unchanged
        });

        // Set the new array as the state
        setPaymentsData(newPaymentsData);
    };
    
    const savePayment = useCallback(async (rowIndex, month, value) => {
        const row = paymentsData[rowIndex];
        if (!row) return;

        setPendingUpdates(prev => ({ ...prev, [`${rowIndex}-${month}`]: true }));
        try {
            const response = await api.payments.savePayment({ clientName: row.Client_Name, type: row.Type, month, value }, currentYear);
            if (response.data.updatedRow) {
                const updatedRowFromServer = response.data.updatedRow;
                setPaymentsData(prev => prev.map((item, idx) => 
                    idx === rowIndex 
                        ? { ...item, [month]: value, Due_Payment: updatedRowFromServer.Due_Payment } 
                        : item
                ));
                setNotificationQueue(prev => {
                    const filtered = prev.filter(n => !(n.clientName === row.Client_Name && n.type === row.Type && n.month === month));
                    return [...filtered, {
                        id: `${row.Client_Name}-${row.Type}-${month}-${Date.now()}`,
                        clientName: row.Client_Name, type: row.Type, month, value,
                        duePayment: updatedRowFromServer.Due_Payment,
                        email: updatedRowFromServer.Email, phone: updatedRowFromServer.Phone_Number,
                    }];
                });
            }
        } catch (error) {
            handleApiError(error);
            setLocalInputValues(prev => ({...prev, [`${rowIndex}-${month}`]: row[month] || ''}));
        } finally {
            setPendingUpdates(prev => {
                const newPending = { ...prev };
                delete newPending[`${rowIndex}-${month}`];
                return newPending;
            });
        }
    }, [paymentsData, currentYear, setPaymentsData, handleApiError]);
    
    const handleInputChange = useCallback((rowIndex, month, value) => {
        const key = `${rowIndex}-${month}`;
        setLocalInputValues(prev => ({ ...prev, [key]: value }));
        if (saveTimeoutsRef.current[key]) clearTimeout(saveTimeoutsRef.current[key]);
        saveTimeoutsRef.current[key] = setTimeout(() => {
            if (paymentsData[rowIndex]) savePayment(rowIndex, month, value);
            delete saveTimeoutsRef.current[key];
        }, 1000);
    }, [paymentsData, savePayment]);

    const getInputBackgroundColor = useCallback((row, month, rowIndex) => {
        const key = `${rowIndex}-${month}`;
        const currentValue = localInputValues[key] !== undefined ? localInputValues[key] : (row?.[month] || "");
        const amountToBePaid = parseFloat(row?.Amount_To_Be_Paid || 0);
        const paidInMonth = parseFloat(currentValue) || 0;
        let status = "Unpaid";
        if (amountToBePaid > 0) {
            if (paidInMonth >= amountToBePaid) status = "Paid";
            else if (paidInMonth > 0) status = "PartiallyPaid";
        }
        const isPending = pendingUpdates[key];
        const baseColor = status === "Unpaid" ? "bg-red-200/50" : status === "PartiallyPaid" ? "bg-yellow-200/50" : "bg-green-200/50";
        return isPending ? `${baseColor} ring-2 ring-blue-300` : baseColor;
    }, [localInputValues, pendingUpdates]);
    
    

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, monthFilter, statusFilter, currentYear]);

    const handleAddType = async () => {
        if (!newType.trim()) { setTypeError("Type cannot be empty."); return; }
        try {
            await api.types.addType({ type: newType.trim() });
            await fetchTypes(true);
            setIsTypeModalOpen(false);
            setNewType("");
            setTypeError("");
            alert("Type added successfully!");
        } catch (error) { setTypeError(error.response?.data?.error || "Failed to add type."); }
    };
    
    const importCsv = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const text = await file.text();
            const rows = text.split("\n").filter(row => row.trim());
            const records = rows.map(row => row.split(",").map(cell => cell.trim()));
            await api.payments.importCsv(records, currentYear);
            alert("CSV import successful! Refreshing data...");
            await fetchClients(true);
            await fetchPayments(currentYear, true);
        } catch (error) {
            handleApiError(error);
            alert(error.response?.data?.error || "Failed to import CSV.");
        } finally {
            setIsImporting(false);
            if (csvFileInputRef.current) csvFileInputRef.current.value = "";
        }
    };
    
    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* --- Top action buttons and year selector --- */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <div className="flex flex-wrap gap-3 mb-4 sm:mb-0">
                    <button onClick={() => setPage("addClient")} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 flex items-center"><i className="fas fa-plus mr-2"></i> Add Client</button>
                    <button onClick={() => setIsTypeModalOpen(true)} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 flex items-center"><i className="fas fa-tags mr-2"></i> Add Type</button>
                    <input type="file" accept=".csv" ref={csvFileInputRef} onChange={importCsv} className="hidden" id="csv-import" disabled={isImporting} />
                    <label htmlFor="csv-import" className={`px-4 py-2 rounded-lg bg-white border flex items-center ${isImporting ? "opacity-50" : "hover:bg-gray-50 cursor-pointer"}`}><i className="fas fa-upload mr-2"></i>{isImporting ? "Importing..." : "Bulk Import"}</label>
                    <button onClick={handleAddNewYear} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 flex items-center" disabled={isLoadingYears}><i className="fas fa-calendar-plus mr-2"></i>{isLoadingYears ? "Adding..." : "Add New Year"}</button>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsNotificationModalOpen(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center" disabled={notificationQueue.length === 0}><i className="fas fa-paper-plane mr-2"></i>Send Messages ({notificationQueue.length})</button>
                    <YearSelector currentYear={currentYear} availableYears={availableYears} onYearChange={setCurrentYear} isLoadingYears={isLoadingYears} />
                </div>
            </div>

            {/* --- Search and filters bar --- */}
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mb-6">
                <div className="relative flex-1">
                    <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" placeholder="Search by client name or type..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg" />
                </div>
                <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="p-2 border rounded-lg w-full sm:w-auto">
                    <option value="">Filter by Month</option>
                    {months.map(month => <option key={month} value={month}>{month.charAt(0).toUpperCase() + month.slice(1)}</option>)}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="p-2 border rounded-lg w-full sm:w-auto" disabled={!monthFilter}>
                    <option value="">Filter by Status</option>
                    <option value="Paid">Paid</option>
                    <option value="PartiallyPaid">Partially Paid</option>
                    <option value="Unpaid">Unpaid</option>
                </select>
            </div>

            {/* --- Main table with horizontal scroll --- */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <DataTable data={paginatedData} paymentsData={paymentsData} months={months} localInputValues={localInputValues} handleInputChange={handleInputChange} getInputBackgroundColor={getInputBackgroundColor} onRemarkButtonClick={(info) => setRemarkPopup({ ...info, isOpen: true })} />
                </div>
            </div>

            {/* --- Pagination Controls --- */}
            {totalEntries > entriesPerPage && (
                <div className="flex justify-between items-center mt-6">
                    <p className="text-sm text-gray-700">Showing {(currentPage - 1) * entriesPerPage + 1} to {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries} entries</p>
                    <div className="flex gap-2">
                        <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 border rounded-md disabled:opacity-50">Previous</button>
                        <span className="p-2 text-sm">Page {currentPage} of {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 border rounded-md disabled:opacity-50">Next</button>
                    </div>
                </div>
            )}
            
            {/* --- Modals --- */}
            <RemarkPopup isOpen={remarkPopup.isOpen} onClose={() => setRemarkPopup({ isOpen: false })} onRemarkSaved={handleRemarkSaved} {...remarkPopup} />
            <NotificationModal isOpen={isNotificationModalOpen} onClose={() => setIsNotificationModalOpen(false)} queue={notificationQueue} setQueue={setNotificationQueue} />
            {isTypeModalOpen && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                     <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
                         <h2 className="text-lg font-semibold mb-4">Add New Type</h2>
                         <input type="text" value={newType} onChange={e => { setNewType(e.target.value); setTypeError(""); }}
                             placeholder="Enter type (e.g. GST)" className="w-full p-2 border border-gray-300 rounded mb-2" />
                         {typeError && <div className="text-sm text-red-600 mb-2">{typeError}</div>}
                         <div className="flex justify-end gap-2 mt-2">
                             <button onClick={() => setIsTypeModalOpen(false)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
                             <button onClick={handleAddType} className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700">Add Type</button>
                         </div>
                     </div>
                 </div>
            )}
        </div>
    );
};

export default DashboardPage;