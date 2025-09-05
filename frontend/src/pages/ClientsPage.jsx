import React, { useState, useMemo, useRef } from 'react';
import { useData } from '../contexts/DataContext';
import api from '../api';
import ClientsTable from '../components/clients/ClientsTable';

const ClientsPage = ({ setPage, setEditClient }) => {
    // --- STATE MANAGEMENT (Existing & New) ---
    const { clientsData, fetchClients, errorMessage, setErrorMessage } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteInProgress, setDeleteInProgress] = useState(false);
    
    // NEW: State for success messages, import loading, and pagination
    const [successMessage, setSuccessMessage] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const entriesPerPage = 10;
    const clientsCsvFileInputRef = useRef(null);

    // --- API HANDLERS (Updated for new UI) ---
    const handleEdit = (client) => {
        setEditClient(client);
        setPage('addClient');
    };

    const handleDelete = async (client) => {
        if (!window.confirm(`Are you sure you want to delete ${client.Client_Name}? This cannot be undone.`)) {
            return;
        }
        setDeleteInProgress(true);
        setSuccessMessage(''); // Clear previous success messages
        setErrorMessage('');  // Clear previous error messages
        try {
            await api.clients.deleteClient({ Client_Name: client.Client_Name, Type: client.Type });
            setSuccessMessage(`Client "${client.Client_Name}" was deleted successfully.`);
            await fetchClients(true); // Force refresh
        } catch (error) {
            setErrorMessage(error.response?.data?.error || "Failed to delete client.");
        } finally {
            setDeleteInProgress(false);
        }
    };
    
    // Placeholder for CSV import functionality
    const handleImportCsv = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        alert(`(Placeholder) Importing clients from: ${file.name}`);
        // Here you would add the logic to parse the CSV and send it to the API
        // For now, we just clear the input
        if(clientsCsvFileInputRef.current) clientsCsvFileInputRef.current.value = "";
    };

    // --- DATA FILTERING & PAGINATION (New Logic) ---
    const filteredClients = useMemo(() => 
        clientsData.filter(client => 
            client.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase())
        ), [clientsData, searchQuery]);

    const totalEntries = filteredClients.length;
    const totalPages = Math.ceil(totalEntries / entriesPerPage);

    const paginatedClients = useMemo(() => {
        const startIndex = (currentPage - 1) * entriesPerPage;
        return filteredClients.slice(startIndex, startIndex + entriesPerPage);
    }, [filteredClients, currentPage, entriesPerPage]);

    // Reset to page 1 whenever the filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);


    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* --- NEW: Success & Error Message Banners --- */}
            {successMessage && (
                <div className="mb-4 p-4 bg-green-50 text-green-800 rounded-lg text-center border border-green-200 flex justify-between items-center">
                    <span><i className="fas fa-check-circle mr-2"></i>{successMessage}</span>
                    <button onClick={() => setSuccessMessage("")} className="ml-2 text-green-600 hover:text-green-800"><i className="fas fa-times"></i></button>
                </div>
            )}
            {errorMessage && (
                <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-lg text-center border border-red-200 flex justify-between items-center">
                    <span><i className="fas fa-exclamation-circle mr-2"></i>{errorMessage}</span>
                    <button onClick={() => setErrorMessage("")} className="ml-2 text-red-600 hover:text-red-800"><i className="fas fa-times"></i></button>
                </div>
            )}

            {/* --- NEW: Top Control Bar (matches template) --- */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <div className="flex gap-3 mb-4 sm:mb-0">
                    <button onClick={() => setPage("addClient")} className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center" disabled={deleteInProgress}>
                        <i className="fas fa-plus mr-2"></i> Add Client
                    </button>
                    <input type="file" accept=".csv" ref={clientsCsvFileInputRef} onChange={handleImportCsv} className="hidden" id="csv-import-clients" disabled={isImporting} />
                    <label htmlFor="csv-import-clients" className={`px-4 py-2 rounded-lg text-gray-700 bg-white border border-gray-300 flex items-center ${isImporting ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer"} transition duration-200`} >
                        <i className="fas fa-upload mr-2"></i> {isImporting ? "Importing..." : "Bulk Import"}
                    </label>
                </div>
                <div className="relative flex-1 sm:flex-none sm:w-64">
                    <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" placeholder="Search clients..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500" disabled={deleteInProgress} />
                </div>
            </div>

            {/* --- NEW: Deleting Modal --- */}
            {deleteInProgress && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl flex items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500 mr-3"></div>
                        <p className="text-gray-700">Deleting client...</p>
                    </div>
                </div>
            )}

            {/* --- Table Container --- */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <ClientsTable 
                    clients={paginatedClients}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    deleteInProgress={deleteInProgress}
                />
            </div>

            {/* --- NEW: Pagination Controls --- */}
            {totalEntries > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-center mt-6 space-y-3 sm:space-y-0">
                    <p className="text-sm text-gray-700">
                        Showing {(currentPage - 1) * entriesPerPage + 1} to {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries} entries
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 border rounded-md disabled:opacity-50 hover:bg-gray-50">Previous</button>
                        {/* Add advanced pagination logic here if needed */}
                        <span className="p-2 text-sm">Page {currentPage} of {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 border rounded-md disabled:opacity-50 hover:bg-gray-50">Next</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientsPage;