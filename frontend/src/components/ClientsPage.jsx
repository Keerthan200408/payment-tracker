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
    <div className="p-0">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 bg-white p-6 rounded-lg shadow-sm">
        <div className="mb-4 sm:mb-0">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Client Payment Tracker</h2>
        </div>
        <button
          onClick={() => setPage("addClient")}
          className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
          disabled={isLoading || deleteInProgress}
        >
          <i className="fas fa-plus mr-2"></i> Add Client
        </button>
      </div>

      {/* Search and Filter Section */}
      <div className="mb-6 bg-white p-6 rounded-lg shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
              disabled={isLoading || deleteInProgress}
            />
          </div>
          <div className="sm:w-48">
            <select className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500">
              <option>All Months</option>
              <option>January</option>
              <option>February</option>
              <option>March</option>
              <option>April</option>
              <option>May</option>
              <option>June</option>
              <option>July</option>
              <option>August</option>
              <option>September</option>
              <option>October</option>
              <option>November</option>
              <option>December</option>
            </select>
          </div>
          <div className="sm:w-48">
            <select className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500">
              <option>Payment Status</option>
              <option>Paid</option>
              <option>Pending</option>
              <option>Overdue</option>
            </select>
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
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Client
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Fixed Amount
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-gray-700">
                  Jan 2025
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-gray-700">
                  Feb 2025
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-gray-700">
                  Mar 2025
                </th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                  Total Due
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
                  <tr key={`${client.Client_Name}-${client.Type}-${index}`} className="hover:bg-gray-50 border-b border-gray-100">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                          <i className="fas fa-user text-gray-600 text-sm"></i>
                        </div>
                        <span className="font-medium text-gray-900">{client.Client_Name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">
                        ₹{(client.Amount_To_Be_Paid || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                        Paid
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">
                        Pending
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-gray-400">-</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-semibold text-gray-900">
                        ₹{(client.Amount_To_Be_Paid || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => {
                            setEditClient(client);
                            setPage("addClient");
                          }}
                          className="text-gray-600 hover:text-gray-800 p-1"
                          disabled={isLoading || deleteInProgress}
                          title="Edit Client"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(client)}
                          className="text-gray-600 hover:text-gray-800 p-1"
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
          <div className="bg-white px-6 py-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">
                Showing 1-10 of {filteredClients.length} entries
              </p>
              <div className="flex items-center space-x-1">
                <button className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300" disabled>
                  Previous
                </button>
                <button className="px-3 py-1 text-sm bg-gray-800 text-white rounded">1</button>
                <button className="px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded">2</button>
                <button className="px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded">3</button>
                <button className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700">
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