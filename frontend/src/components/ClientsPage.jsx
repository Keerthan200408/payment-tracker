import { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

const ClientsPage = ({
  clientsData,
  setClientsData,
  setPage,
  setEditClient,
  fetchClients,
  fetchPayments,
  sessionToken,
  currentYear = new Date().getFullYear(), // Add currentYear prop with default
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  // Ensure data is loaded when component mounts
  useEffect(() => {
    const loadClientsData = async () => {
      // Only fetch if clientsData is empty or null
      if (!clientsData || clientsData.length === 0) {
        setIsLoading(true);
        setError(null);
        try {
          console.log("Fetching clients data...");
          await fetchClients(sessionToken);
        } catch (err) {
          console.error("Error fetching clients:", err);
          setError("Failed to load clients data");
        } finally {
          setIsLoading(false);
        }
      }
    };

    if (sessionToken) {
      loadClientsData();
    }
  }, [sessionToken, clientsData, fetchClients]);

  const filteredClients = clientsData?.filter(
    (client) =>
      !searchQuery ||
      client.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.Type?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleDelete = async (client) => {
    if (
      !confirm(
        `Are you sure you want to delete ${client.Client_Name} (${client.Type})?`
      )
    ) {
      return;
    }
    
    setDeleteInProgress(true);
    try {
      console.log("Deleting client:", client.Client_Name, client.Type);
      const response = await axios.delete(`${BASE_URL}/delete-client`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        data: { Client_Name: client.Client_Name, Type: client.Type },
      });

      console.log("Delete response:", response.data);

      // Update local state immediately for better UX
      const updatedClients = clientsData.filter(
        (c) => !(c.Client_Name === client.Client_Name && c.Type === client.Type)
      );
      setClientsData(updatedClients);

      // Refresh data with proper year parameter
      const refreshPromises = [fetchClients(sessionToken)];
      
      // Only refresh payments if fetchPayments function expects year parameter
      if (fetchPayments.length >= 2) {
        refreshPromises.push(fetchPayments(sessionToken, currentYear));
      } else {
        refreshPromises.push(fetchPayments(sessionToken));
      }
      
      await Promise.all(refreshPromises);
      
    } catch (error) {
      console.error(
        "Delete client error:",
        error.response?.data?.error || error.message
      );
      alert(
        `Failed to delete client: ${
          error.response?.data?.error || error.message
        }`
      );
      
      // Revert local state on error
      await fetchClients(sessionToken);
    } finally {
      setDeleteInProgress(false);
    }
  };

  // Loading state
  if (isLoading && (!clientsData || clientsData.length === 0)) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading clients...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="text-red-500 text-xl mb-4">⚠️</div>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-0"> {/* Removed padding since header now has it */}
  {/* Header Section */}
  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 bg-white p-6 rounded-lg shadow-sm"> {/* Updated styling */}
    <div className="mb-4 sm:mb-0">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Client Management</h2>
      <p className="text-gray-600 text-sm">Add, edit, and manage your client information</p>
    </div>
    <button
      onClick={() => setPage("addClient")}
      className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition duration-200 flex items-center shadow-sm" // Updated to match template
      disabled={isLoading || deleteInProgress}
    >
      <i className="fas fa-plus mr-2"></i> Add Client
    </button>
  </div>

  {/* Search Section */}
  <div className="mb-6 bg-white p-6 rounded-lg shadow-sm"> {/* Added container */}
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 mb-2">Search Clients</label>
        <input
          type="text"
          placeholder="Search by client name or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" // Updated styling
          disabled={isLoading || deleteInProgress}
        />
      </div>
      <div className="sm:w-48">
        <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Type</label>
        <select className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
          <option>All Types</option>
          <option>IT Return</option>
          <option>GST</option>
        </select>
      </div>
    </div>
  </div>

  {/* Loading overlay for delete operations */}
  {deleteInProgress && (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-3 text-center text-gray-700">Deleting client...</p>
      </div>
    </div>
  )}

  {/* Table Section */}
  <div className="bg-white rounded-lg shadow-sm overflow-hidden"> {/* Updated container */}
    <div className="overflow-x-auto">
      <table className="w-full"> {/* Simplified table classes */}
        <thead className="bg-gray-50 border-b border-gray-200"> {/* Updated header styling */}
          <tr>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Client Name
            </th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Type
            </th>
            <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Monthly Amount
            </th>
            <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Status
            </th>
            <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200"> {/* Updated body styling */}
          {filteredClients.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="px-6 py-12 text-center text-gray-500"
              >
                <div className="flex flex-col items-center">
                  <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                  <p className="text-lg font-medium">
                    {searchQuery ? "No clients found matching your search." : "No clients found."}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {!searchQuery && "Get started by adding your first client."}
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            filteredClients.map((client, index) => (
              <tr key={`${client.Client_Name}-${client.Type}-${index}`} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                      <i className="fas fa-user text-blue-600"></i>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{client.Client_Name}</p>
                      <p className="text-sm text-gray-500">Client ID: #{index + 1}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                    client.Type === 'IT Return' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {client.Type}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="font-semibold text-gray-900">
                    ${(client.Amount_To_Be_Paid || 0).toFixed(2)}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                    Active
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center space-x-3">
                    <button
                      onClick={() => {
                        setEditClient(client);
                        setPage("addClient");
                      }}
                      className="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition-colors" // Updated styling
                      disabled={isLoading || deleteInProgress}
                      title="Edit Client"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(client)}
                      className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition-colors" // Updated styling
                      disabled={isLoading || deleteInProgress}
                      title="Delete Client"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    {/* Table Footer with Pagination Info */}
    {filteredClients.length > 0 && (
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">1</span> to <span className="font-medium">{filteredClients.length}</span> of{' '}
            <span className="font-medium">{filteredClients.length}</span> clients
          </p>
          <div className="flex items-center space-x-2">
            <button className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300" disabled>
              Previous
            </button>
            <span className="px-3 py-1 text-sm bg-blue-600 text-white rounded">1</span>
            <button className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300" disabled>
              Next
            </button>
          </div>
        </div>
      </div>
    )}
      </div>
    </div>
  );
};

export default ClientsPage;