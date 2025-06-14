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
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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
    
    setIsLoading(true);
    try {
      console.log("Deleting client:", client.Client_Name, client.Type);
      const response = await axios.delete(`${BASE_URL}/delete-client`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        data: { Client_Name: client.Client_Name, Type: client.Type },
      });

      console.log("Delete response:", response.data);

      // Update local state immediately
      const updatedClients = clientsData.filter(
        (c) => !(c.Client_Name === client.Client_Name && c.Type === client.Type)
      );
      setClientsData(updatedClients);

      // Refresh data to ensure consistency
      await fetchClients(sessionToken);
      await fetchPayments(sessionToken);
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
    } finally {
      setIsLoading(false);
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
    <div className="p-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
        <div className="flex flex-col sm:flex-row space-x-0 sm:space-x-3 space-y-3 sm:space-y-0 w-full sm:w-auto">
          <button
            onClick={() => setPage("addClient")}
            className="bg-blue-500 text-white px-3 py-1.5 rounded-md hover:bg-blue-600 transition duration-200 flex items-center w-full sm:w-auto"
            disabled={isLoading}
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
          className="p-2 border-gray-300 rounded-lg w-full sm:w-1/3 focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
          disabled={isLoading}
        />
      </div>

      {/* Loading overlay for delete operations */}
      {isLoading && clientsData && clientsData.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2 text-center">Processing...</p>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="flex justify-center">
        <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
          <table className="border-collapse">
            <thead>
              <tr className="bg-blue-100">
                <th className="border border-gray-200 p-3 text-left">
                  Client Name
                </th>
                <th className="border border-gray-200 p-3 text-left">Type</th>
                <th className="border border-gray-200 p-3 text-right">
                  Amount To Be Paid
                </th>
                <th className="border border-gray-200 p-3 text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="border border-gray-200 p-3 text-center text-gray-500"
                  >
                    {searchQuery ? "No clients found matching your search." : "No clients found."}
                  </td>
                </tr>
              ) : (
                filteredClients.map((client, index) => (
                  <tr key={`${client.Client_Name}-${client.Type}-${index}`} className="hover:bg-blue-50">
                    <td className="border border-gray-200 p-3">
                      {client.Client_Name}
                    </td>
                    <td className="border border-gray-200 p-3">
                      {client.Type}
                    </td>
                    <td className="border border-gray-200 p-3 text-right">
                      {(client.Amount_To_Be_Paid || 0).toFixed(2)}
                    </td>
                    <td className="border border-gray-200 p-3 text-center">
                      <button
                        onClick={() => {
                          setEditClient(client);
                          setPage("addClient");
                        }}
                        className="text-blue-500 hover:text-blue-700 mr-4 text-sm sm:text-base"
                        disabled={isLoading}
                      >
                        <i className="fas fa-edit"></i> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(client)}
                        className="text-red-500 hover:text-red-700 text-sm sm:text-base"
                        disabled={isLoading}
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
    </div>
  );
};

export default ClientsPage;