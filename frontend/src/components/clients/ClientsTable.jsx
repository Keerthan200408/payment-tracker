import React from 'react';

const ClientsTable = ({ clients, onEdit, onDelete, isLoading, deleteInProgress }) => {
    if (isLoading && clients.length === 0) {
        return <div className="text-center p-8">Loading clients...</div>;
    }

    if (clients.length === 0) {
        return (
            <div className="px-6 py-12 text-center text-gray-500">
                <div className="flex flex-col items-center">
                    <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                    <p className="text-lg font-medium text-gray-600">No clients found.</p>
                    <p className="text-sm text-gray-400 mt-1">Get started by adding your first client.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Amount</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {clients.map((client, index) => (
                        <tr key={`${client.Client_Name}-${client.Type}-${index}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{client.Client_Name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.Type}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₹{(client.Amount_To_Be_Paid || 0).toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.Email || 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.Phone_Number || 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center space-x-4">
                                    <button onClick={() => onEdit(client)} className="text-blue-600 hover:text-blue-900" disabled={deleteInProgress} title="Edit Client">
                                        <i className="fas fa-edit"></i>
                                    </button>
                                    <button onClick={() => onDelete(client)} className="text-red-600 hover:text-red-900" disabled={deleteInProgress} title="Delete Client">
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ClientsTable;
