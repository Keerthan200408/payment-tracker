import React from 'react';

const ClientsTable = ({ 
    clients, 
    onEdit, 
    onDelete, 
    deleteInProgress,
    // NEW: Props for bulk selection
    selectedClients,
    onToggleSelect,
    onToggleSelectAll,
    isClientSelected,
    isAllSelected
}) => {
    // If the data is still loading but the array is empty
    if (!clients) {
        return <div className="text-center p-8">Loading clients...</div>;
    }

    // If loading is finished and there are no clients
    if (clients.length === 0) {
        return (
            <div className="px-6 py-12 text-center text-gray-500">
                <div className="flex flex-col items-center">
                    <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                    <p className="text-lg font-medium text-gray-600">No clients found.</p>
                    <p className="text-sm text-gray-400 mt-1">Try clearing your search or adding a new client.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        {/* NEW: Select All Checkbox */}
                        <th className="px-3 py-4 text-left">
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={onToggleSelectAll}
                                disabled={deleteInProgress}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer disabled:cursor-not-allowed"
                                title="Select all on this page"
                            />
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Amount</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {clients.map((client, index) => {
                        const isSelected = isClientSelected(client);
                        return (
                            <tr 
                                key={`${client.Client_Name}-${client.Type}-${index}`} 
                                className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                            >
                                {/* NEW: Individual Checkbox */}
                                <td className="px-3 py-4 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => onToggleSelect(client)}
                                        disabled={deleteInProgress}
                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                </td>
                                {/* Client Cell with Icon */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                                            <i className="fas fa-user text-gray-600"></i>
                                        </div>
                                        <div className="text-sm font-medium text-gray-900">{client.Client_Name}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.Type}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₹{(client.Amount_To_Be_Paid || 0).toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.Email || 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.Phone_Number || 'N/A'}</td>
                                {/* Status Cell with Badge */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Active</span>
                                </td>
                                {/* Actions with Icons */}
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center space-x-4">
                                        <button 
                                            onClick={() => onEdit(client)} 
                                            className="text-gray-600 hover:text-gray-900 transition-colors" 
                                            disabled={deleteInProgress} 
                                            title="Edit Client"
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                        <button 
                                            onClick={() => onDelete(client)} 
                                            className="text-gray-600 hover:text-red-600 transition-colors" 
                                            disabled={deleteInProgress} 
                                            title="Delete Client"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default ClientsTable;