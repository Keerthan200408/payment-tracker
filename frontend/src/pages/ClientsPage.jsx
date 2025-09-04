import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import api from '../api';
import ClientsTable from '../components/clients/ClientsTable';

const ClientsPage = ({ setPage, setEditClient }) => {
    const { clientsData, fetchClients, setErrorMessage } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteInProgress, setDeleteInProgress] = useState(false);
    
    const handleEdit = (client) => {
        setEditClient(client);
        setPage('addClient');
    };

    const handleDelete = async (client) => {
        if (!window.confirm(`Are you sure you want to delete ${client.Client_Name}? This action cannot be undone.`)) {
            return;
        }
        setDeleteInProgress(true);
        try {
            await api.clients.deleteClient({ Client_Name: client.Client_Name, Type: client.Type });
            await fetchClients(true); // Force refresh
        } catch (error) {
            setErrorMessage(error.response?.data?.error || "Failed to delete client.");
        } finally {
            setDeleteInProgress(false);
        }
    };

    const filteredClients = clientsData.filter(client => 
        client.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div>
             <div className="flex justify-between items-center mb-6">
                <input
                    type="text"
                    placeholder="Search clients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-1/3 pl-4 pr-4 py-2 border rounded-lg"
                />
                 <button onClick={() => setPage('addClient')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Add Client
                </button>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <ClientsTable 
                    clients={filteredClients}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    deleteInProgress={deleteInProgress}
                />
            </div>
        </div>
    );
};

export default ClientsPage;