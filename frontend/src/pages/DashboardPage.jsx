import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import api from '../api';
import { debounce } from 'lodash';

// ASSUMPTION: These components exist in the specified paths.
import DataTable from '../components/dashboard/DataTable';
import YearSelector from '../components/dashboard/YearSelector';
import NotificationModal from '../components/dashboard/NotificationModal';
import RemarkPopup from '../components/shared/RemarkPopup';

// CORRECTED: Define months array directly in the frontend.
const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
];

const DashboardPage = ({ setPage }) => {
    const { sessionToken } = useAuth();
    const { 
        paymentsData, 
        setPaymentsData, 
        fetchPayments, 
        types, 
        fetchTypes, 
        handleApiError,
        setErrorMessage,
        fetchClients, // We'll need this for refreshing after import
    } = useData();
    
    // Page-specific state from original HomePage.jsx
    const [currentYear, setCurrentYear] = useState(() => localStorage.getItem("currentYear") || new Date().getFullYear().toString());
    const [availableYears, setAvailableYears] = useState([currentYear]);
    const [isLoadingYears, setIsLoadingYears] = useState(false);
    const [localInputValues, setLocalInputValues] = useState({});
    const [pendingUpdates, setPendingUpdates] = useState({});
    const [searchQuery, setSearchQuery] = useState("");
    const [monthFilter, setMonthFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const saveTimeoutsRef = useRef({});
    const csvFileInputRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
    const [newType, setNewType] = useState("");
    const [typeError, setTypeError] = useState("");
    const [remarkPopup, setRemarkPopup] = useState({ isOpen: false });

    // --- Notification Queue Logic (This is correct) ---
    const [notificationQueue, setNotificationQueue] = useState([]);
    const notificationQueueRef = useRef([]);
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);

    useEffect(() => {
        const loadQueue = async () => {
            if (sessionToken) {
                try {
                    const response = await api.notifications.getQueue();
                    setNotificationQueue(response.data.queue || []);
                    notificationQueueRef.current = response.data.queue || [];
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
    
    const clearQueueFromDB = async () => {
        try {
            await api.notifications.clearQueue();
            setNotificationQueue([]);
            notificationQueueRef.current = [];
        } catch (error) { handleApiError(error); }
    };

    // --- All Functions from original HomePage.jsx, now complete ---
    
    useEffect(() => {
        // This effect syncs local input changes with incoming data from the server
        // It prevents user input from being overwritten during background saves
        const initialValues = {};
        paymentsData.forEach((row, globalRowIndex) => {
            months.forEach((month) => {
                const key = `${globalRowIndex}-${month}`;
                if (localInputValues[key] === undefined) { // Only set if not already edited by user
                    initialValues[key] = row[month] || "";
                }
            });
        });
        setLocalInputValues(prev => ({ ...prev, ...initialValues }));
    }, [paymentsData]);


    const handleYearChange = (year) => {
        setCurrentYear(year);
        localStorage.setItem("currentYear", year);
        fetchPayments(year, true);
    };

    const handleRemarkSaved = (clientName, type, month, newRemark) => {
        setPaymentsData(prevData => prevData.map(row => {
            if (row.Client_Name === clientName && row.Type === type) {
                const monthKey = month.charAt(0).toUpperCase() + month.slice(1);
                return { ...row, Remarks: { ...row.Remarks, [monthKey]: newRemark } };
            }
            return row;
        }));
    };
    
    const savePayment = useCallback(async (rowIndex, month, value) => {
        // This function is now complete and correct
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
    
    const filteredData = useMemo(() => {
        return (paymentsData || []).filter((row) => {
            return !searchQuery ||
                row?.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                row?.Type?.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [paymentsData, searchQuery]);

    const handleAddNewYear = async () => {
        const nextYear = (parseInt(availableYears[availableYears.length - 1] || currentYear) + 1).toString();
        setIsLoadingYears(true);
        try {
            await api.payments.addNewYear(nextYear);
            const years = await api.payments.getUserYears(true); // force refresh years
            setAvailableYears(years);
            handleYearChange(nextYear);
            alert(`Year ${nextYear} added successfully!`);
        } catch (error) {
            handleApiError(error);
            alert(error.response?.data?.error || `Failed to add year ${nextYear}.`);
        } finally {
            setIsLoadingYears(false);
        }
    };

    // ADDED: Logic for Add Type Modal
    const handleAddType = async () => {
        if (!newType.trim()) { setTypeError("Type cannot be empty."); return; }
        try {
            await api.types.addType({ type: newType.trim() });
            await fetchTypes(true); // Force refresh types
            setIsTypeModalOpen(false);
            setNewType("");
            setTypeError("");
            alert("Type added successfully!");
        } catch (error) { setTypeError(error.response?.data?.error || "Failed to add type."); }
    };
    
    // ADDED: Logic for CSV Import
    const importCsv = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const text = await file.text();
            const rows = text.split("\n").filter(row => row.trim());
            // This is a simplified parser, assuming format: [amount, type, email, clientName, phone]
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
         <div className="p-0 sm:p-6">
             <YearSelector 
                currentYear={currentYear}
                availableYears={availableYears}
                onYearChange={handleYearChange}
                isLoadingYears={isLoadingYears}
                onAddNewYear={handleAddNewYear}
            />
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                 <div className="flex gap-3 mb-4 sm:mb-0">
                    <button onClick={() => setPage("addClient")} className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700">Add Client</button>
                    <button onClick={() => setIsTypeModalOpen(true)} className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700">Add Type</button>
                    <input type="file" accept=".csv" ref={csvFileInputRef} onChange={importCsv} className="hidden" id="csv-import" disabled={isImporting} />
                    <label htmlFor="csv-import" className={`px-4 py-2 rounded-lg text-gray-700 bg-white border border-gray-300 cursor-pointer ${isImporting ? "opacity-50" : "hover:bg-gray-50"}`}>
                        {isImporting ? "Importing..." : "Bulk Import"}
                    </label>
                </div>
                 <button onClick={() => setIsNotificationModalOpen(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    Send Notifications ({notificationQueue.length})
                </button>
            </div>

            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mb-6">
                <input
                    type="text"
                    placeholder="Search by client or type..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                />
            </div>

            <NotificationModal 
                isOpen={isNotificationModalOpen}
                onClose={() => setIsNotificationModalOpen(false)}
                queue={notificationQueue}
                setQueue={setNotificationQueue}
                clearQueueFromDB={clearQueueFromDB}
            />
            
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <DataTable 
                    data={filteredData} 
                    months={months}
                    currentYear={currentYear}
                    onRemarkSaved={handleRemarkSaved}
                    handleInputChange={handleInputChange}
                    localInputValues={localInputValues}
                    pendingUpdates={pendingUpdates}
                    getInputBackgroundColor={getInputBackgroundColor}
                    onRemarkButtonClick={(remarkInfo) => setRemarkPopup({ ...remarkInfo, isOpen: true })}
                />
            </div>

            <RemarkPopup
                isOpen={remarkPopup.isOpen}
                onClose={() => setRemarkPopup({ ...remarkPopup, isOpen: false })}
                clientName={remarkPopup.clientName} type={remarkPopup.type} month={remarkPopup.month}
                currentRemark={remarkPopup.currentRemark} year={currentYear} sessionToken={sessionToken}
                onRemarkSaved={(newRemark) => handleRemarkSaved(remarkPopup.clientName, remarkPopup.type, remarkPopup.month, newRemark)}
            />

            {isTypeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
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