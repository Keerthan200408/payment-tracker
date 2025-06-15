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
  currentYear = new Date().getFullYear(),
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
      client.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleDelete = async (client) => {
    if (
      !confirm(
        `Are you sure you want to delete ${client.Client_Name}?`
      )
    ) {
      return;
    }
    
    setDeleteInProgress(true);
    try {
      console.log("Deleting client:", client.Client_Name);
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-500 mx-auto"></div>
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
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div className="flex gap-3 mb-4 sm:mb-0">
          <button
            onClick={() => setPage("addClient")}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
            disabled={isLoading || deleteInProgress}
          >
            <i className="fas fa-plus mr-2"></i> Add Client
          </button>
          <button
            className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition duration-200 flex items-center"
            disabled={isLoading || deleteInProgress}
          >
            <i className="fas fa-upload mr-2"></i> Bulk Import
          </button>
        </div>
        
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="flex-1 sm:w-64">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                disabled={isLoading || deleteInProgress}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Loading overlay for delete operations */}
      {deleteInProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500 mx-auto"></div>
            <p className="mt-3 text-center text-gray-700">Deleting client...</p>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monthly Amount
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    <div className="flex flex-col items-center">
                      <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                      <p className="text-lg font-medium text-gray-600">
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
                  <tr key={`${client.Client_Name}-${client.Type}-${index}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                          <i className="fas fa-user text-gray-600"></i>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{client.Client_Name}</div>
                          <div className="text-sm text-gray-500">Client ID: #{index + 1234}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {client.email || `${client.Client_Name.toLowerCase().replace(' ', '')}@example.com`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        ₹{(client.Amount_To_Be_Paid || 0).toLocaleString()}.00
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => {
                            setEditClient(client);
                            setPage("addClient");
                          }}
                          className="text-gray-600 hover:text-gray-900"
                          disabled={isLoading || deleteInProgress}
                          title="Edit Client"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(client)}
                          className="text-gray-600 hover:text-gray-900"
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
        
        {/* Table Footer with Pagination */}
        {filteredClients.length > 0 && (
          <div className="bg-white px-6 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing 1 to 10 of {filteredClients.length} entries
            </div>
            <div className="flex items-center space-x-2">
              <button className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-500 bg-white hover:bg-gray-50 disabled:opacity-50" disabled>
                Previous
              </button>
              <button className="px-3 py-1 text-sm bg-gray-800 text-white rounded">
                1
              </button>
              <button className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50">
                2
              </button>
              <button className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50">
                3
              </button>
              <button className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientsPage;