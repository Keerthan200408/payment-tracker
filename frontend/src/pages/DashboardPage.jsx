import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import api from '../api';
import DataTable from '../components/dashboard/DataTable';
import YearSelector from '../components/dashboard/YearSelector';
import NotificationModal from '../components/dashboard/NotificationModal';
import { debounce } from 'lodash';
import { months as monthList } from '../config'; // Assuming months are exported from config

const DashboardPage = ({ setPage }) => {
    const { sessionToken, currentUser } = useAuth();
    const { 
        paymentsData, 
        setPaymentsData, 
        fetchPayments, 
        types, 
        fetchTypes, 
        handleApiError,
        setErrorMessage
    } = useData();
    
    // Page-specific state
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

    // Notification Queue State & Logic
    const [notificationQueue, setNotificationQueue] = useState([]);
    const notificationQueueRef = useRef([]);
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);

    // Load queue on component mount
    useEffect(() => {
        const loadQueue = async () => {
            if (sessionToken) {
                try {
                    const response = await api.notifications.getQueue();
                    const queue = response.data.queue || [];
                    setNotificationQueue(queue);
                    notificationQueueRef.current = queue;
                } catch (error) { console.error("Failed to load notification queue", error); handleApiError(error); }
            }
        };
        loadQueue();
    }, [sessionToken, handleApiError]);

    // Save queue whenever it changes
    useEffect(() => {
        const saveQueue = debounce(async () => {
            if (sessionToken && JSON.stringify(notificationQueue) !== JSON.stringify(notificationQueueRef.current)) {
                try {
                    await api.notifications.saveQueue(notificationQueue);
                    notificationQueueRef.current = [...notificationQueue];
                } catch (error) { console.error("Failed to save notification queue", error); handleApiError(error); }
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
        } catch (error) { console.error("Failed to clear DB queue", error); }
    };
    
    const handleYearChange = (year) => {
        setCurrentYear(year);
        fetchPayments(year);
    };

    // All handlers from original HomePage.jsx go here, adapted to new structure
    const handleRemarkSaved = (clientName, type, month, newRemark) => {
         setPaymentsData(prevData => {
            return prevData.map(row => {
                if (row.Client_Name === clientName && row.Type === type) {
                    const monthKey = month.charAt(0).toUpperCase() + month.slice(1);
                    const newRemarks = { ...row.Remarks, [monthKey]: newRemark };
                    return { ...row, Remarks: newRemarks };
                }
                return row;
            });
        });
    };

    const handleInputChange = (rowIndex, month, value) => {
        const key = `${rowIndex}-${month}`;
        setLocalInputValues(prev => ({ ...prev, [key]: value }));

        if (saveTimeoutsRef.current[key]) {
            clearTimeout(saveTimeoutsRef.current[key]);
        }

        saveTimeoutsRef.current[key] = setTimeout(() => {
            const row = paymentsData[rowIndex];
            if (row) {
                savePayment(rowIndex, month, value);
            }
            delete saveTimeoutsRef.current[key];
        }, 1000);
    };
    
    const savePayment = async (rowIndex, month, value) => {
        const row = paymentsData[rowIndex];
        if (!row) return;

        setPendingUpdates(prev => ({ ...prev, [`${rowIndex}-${month}`]: true }));

        try {
            const response = await api.payments.savePayment({
                clientName: row.Client_Name,
                type: row.Type,
                month,
                value
            }, currentYear);

            if (response.data.updatedRow) {
                const updatedRowFromServer = response.data.updatedRow;
                // Add to notification queue
                const notificationData = {
                    id: `${row.Client_Name}-${row.Type}-${month}-${Date.now()}`,
                    clientName: row.Client_Name,
                    type: row.Type,
                    month, value,
                    duePayment: updatedRowFromServer.Due_Payment,
                    email: updatedRowFromServer.Email,
                    phone: updatedRowFromServer.Phone_Number,
                };
                setNotificationQueue(prev => {
                    const filtered = prev.filter(n => !(n.clientName === row.Client_Name && n.type === row.Type && n.month === month));
                    return [...filtered, notificationData];
                });
                
                // Update local state with confirmed data from server
                 setPaymentsData(prev => prev.map((item, idx) => idx === rowIndex ? {...item, [month]: value, Due_Payment: updatedRowFromServer.Due_Payment} : item));
            }

        } catch (error) {
            handleApiError(error);
            // Revert optimistic update on failure
            setLocalInputValues(prev => ({...prev, [`${rowIndex}-${month}`]: row[month] || ''}));
        } finally {
            setPendingUpdates(prev => {
                const newPending = { ...prev };
                delete newPending[`${rowIndex}-${month}`];
                return newPending;
            });
        }
    };
    
    // ... Implement other handlers like addNewYear, importCsv, getInputBackgroundColor
    
    const filteredData = useMemo(() => {
        return (paymentsData || []).filter((row) => {
            return !searchQuery ||
                row?.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                row?.Type?.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [paymentsData, searchQuery]);
    
    return (
        <div>
            {/* The complete JSX from your original HomePage.jsx goes here */}
            <YearSelector 
                currentYear={currentYear}
                availableYears={availableYears}
                onYearChange={handleYearChange}
                isLoadingYears={isLoadingYears}
                // onAddNewYear={...} // This logic needs to be added
            />
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                 {/* ... Your row of buttons (Add Client, Add Type, Import CSV) ... */}
            </div>

            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mb-6">
                <input
                    type="text"
                    placeholder="Search by client or type..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                />
                 {/* ... Your Month and Status filters ... */}
            </div>
            
            <button onClick={() => setIsNotificationModalOpen(true)} className="mb-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                Send Notifications ({notificationQueue.length})
            </button>

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
                    months={monthList.map(m => m.toLowerCase())}
                    currentYear={currentYear}
                    onRemarkSaved={handleRemarkSaved}
                    handleInputChange={handleInputChange}
                    localInputValues={localInputValues}
                    pendingUpdates={pendingUpdates}
                    // getInputBackgroundColor={...}
                />
            </div>
        </div>
    );
};

export default DashboardPage;