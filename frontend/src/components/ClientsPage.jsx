
import { useState } from 'react';
import axios from 'axios'; // Added axios import

const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api'; // Added BASE_URL

const ClientsPage = ({
  clientsData,
  setPage,
  setEditClient,
  fetchClients,
  fetchPayments,
  sessionToken,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredClients = clientsData.filter(
    (client) =>
      !searchQuery ||
      client.Client_Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.Type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (client) => {
    if (!confirm(`Are you sure you want to delete ${client.Client_Name} (${client.Type})?`)) {
      return;
    }
    try {
      await axios.delete(`${BASE_URL}/delete-client`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        data: { Client_Name: client.Client_Name, Type: client.Type },
      });
      fetchClients(sessionToken);
      fetchPayments(sessionToken);
    } catch (error) {
      console.error('Delete client error:', error);
      alert('Failed to delete client.');
    }
  };

  return (
    <div className="p-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
        <div className="flex flex-col sm:flex-row space-x-0 sm:space-x-3 space-y-3 sm:space-y-0 w-full sm:w-auto">
          <button
            onClick={() => setPage('addClient')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200 flex items-center w-full sm:w-auto"
          >
            <i className="fas fa-plus mr-2"></i> Add Client
          </button>
        </div>
      </div>

      {/* Search Section */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by client or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="p-2 border rounded-lg w-full sm:w-1/3 focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
        />
      </div>

      {/* Table Section */}
      <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
        <table className="min-w-[800px] border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-3 text-left">Client Name</th>
              <th className="border p-3 text-left">Type</th>
              <th className="border p-3 text-right">Amount To Be Paid</th>
              <th className="border p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan={4} className="border p-3 text-center text-gray-500">
                  No clients found.
                </td>
              </tr>
            ) : (
              filteredClients.map((client, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border p-3">{client.Client_Name}</td>
                  <td className="border p-3">{client.Type}</td>
                  <td className="border p-3 text-right">
                    {(client.Amount_To_Be_Paid || 0).toFixed(2)}
                  </td>
                  <td className="border p-3 text-center">
                    <button
                      onClick={() => {
                        setEditClient(client);
                        setPage('addClient');
                      }}
                      className="text-blue-500 hover:text-blue-700 mr-4 text-sm sm:text-base"
                    >
                      <i className="fas fa-edit"></i> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(client)}
                      className="text-red-500 hover:text-red-700 text-sm sm:text-base"
                    >
                      <i className="fas fa-trash"></i> Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClientsPage;