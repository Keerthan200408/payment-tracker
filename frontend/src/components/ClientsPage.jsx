import { useState, useEffect, useRef } from "react";
import axios from "axios";

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";

const ClientsPage = ({
  clientsData,
  setClientsData,
  setPage,
  setEditClient,
  fetchClients,
  fetchPayments,
  sessionToken,
  currentYear = new Date().getFullYear(),
  isImporting,
  importCsv,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState(""); // Add error message state
  const [successMessage, setSuccessMessage] = useState(""); // Add success message state
  const hasFetched = useRef(false);
  const clientsCsvFileInputRef = useRef(null); // Dedicated ref for ClientsPage
  const entriesPerPage = 10;
  const totalEntries = clientsData?.length || 0;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);

  useEffect(() => {
    const loadClientsData = async () => {
      if (hasFetched.current || clientsData?.length > 0) return;
      setIsLoading(true);
      setError(null);
      try {
        console.log("Fetching clients data...");
        await fetchClients(sessionToken);
        hasFetched.current = true;
      } catch (err) {
        console.error("Error fetching clients:", err);
        setError(err.response?.data?.error || "Failed to load clients data");
      } finally {
        setIsLoading(false);
      }
    };
    if (sessionToken) {
      loadClientsData();
    }
  }, [sessionToken, fetchClients]);

  useEffect(() => {
  console.log('ClientsPage.jsx: importCsv prop:', importCsv);
  if (!importCsv) {
    console.error('ClientsPage.jsx: importCsv prop is undefined on mount');
    setErrorMessage('Bulk import functionality is unavailable.');
  }
}, [importCsv, setErrorMessage]);

  // Modified importCsv to handle UI feedback
  const handleImportCsv = async (e) => {
  if (!importCsv) {
    console.error('ClientsPage.jsx: importCsv prop is undefined');
    setErrorMessage('Bulk import functionality is unavailable.');
    return;
  }
  try {
    await importCsv(e);
    setSuccessMessage("CSV imported successfully!");
    setErrorMessage("");
    if (clientsCsvFileInputRef.current) {
      clientsCsvFileInputRef.current.value = null;
    }
  } catch (err) {
    console.error("ClientsPage.jsx: CSV import error:", err);
    setErrorMessage(err.message || "Failed to import CSV.");
    setSuccessMessage("");
    if (clientsCsvFileInputRef.current) {
      clientsCsvFileInputRef.current.value = null;
    }
  }
};

  const filteredClients =
    clientsData?.filter(
      (client) =>
        !searchQuery ||
        client.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

 const handleDelete = async (client) => {
  if (!confirm(`Are you sure you want to delete ${client.Client_Name}?`)) {
    return;
  }

  setDeleteInProgress(true);
  try {
    console.log("Deleting client:", client.Client_Name);
    await axios.post(`${BASE_URL}/delete-client`, {
      Client_Name: client.Client_Name,
      Type: client.Type,
    }, {
      headers: {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
    }
});

    // Fetch updated clients with cache refresh
    const updatedClients = await fetchClients(sessionToken, true); // forceRefresh: true

    // Adjust current page
    const newTotalPages = Math.ceil((updatedClients?.length || 0) / entriesPerPage);
    if (currentPage > newTotalPages && newTotalPages > 0) {
      setCurrentPage(newTotalPages);
    }

    // Fetch payments for the current year with cache refresh
    await fetchPayments(sessionToken, currentYear, true); // forceRefresh: true

    setSearchQuery(""); // Clear search query to avoid stale filtered results
  } catch (error) {
    console.error(
      "Delete client error:",
      error.response?.data?.error || error.message
    );
    setErrorMessage(
      `Failed to delete client: ${error.response?.data?.error || error.message}`
    );
    await fetchClients(sessionToken, true); // Refresh even on error
  } finally {
    setDeleteInProgress(false);
  }
};

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
      {/* Add success/error message displays */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 text-green-800 rounded-lg text-center border border-green-200">
          <i className="fas fa-check-circle mr-2"></i>
          {successMessage}
          <button
            onClick={() => setSuccessMessage("")}
            className="ml-2 text-green-600 hover:text-green-800"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-lg text-center border border-red-200">
          <i className="fas fa-exclamation-circle mr-2"></i>
          {errorMessage}
          <button
            onClick={() => setErrorMessage("")}
            className="ml-2 text-red-600 hover:text-red-800"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div className="flex gap-3 mb-4 sm:mb-0">
          <button
            onClick={() => setPage("addClient")}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
            disabled={isLoading || deleteInProgress}
          >
            <i className="fas fa-plus mr-2"></i> Add Client
          </button>
          <input
            type="file"
            accept=".csv"
            ref={clientsCsvFileInputRef} // Use dedicated ref
            onChange={handleImportCsv} // Use wrapped handler
            className="hidden"
            id="csv-import-clients"
            disabled={isImporting}
          />
          <label
            htmlFor="csv-import-clients"
            className={`px-4 py-2 rounded-lg text-gray-700 bg-white border border-gray-300 flex items-center ${
              isImporting
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-gray-50 cursor-pointer"
            } transition duration-200`}
            disabled={isLoading || deleteInProgress}
          >
            <i className="fas fa-upload mr-2"></i>
            {isImporting ? "Importing..." : "Bulk Import"}
          </label>
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

      {deleteInProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500 mx-auto"></div>
            <p className="mt-3 text-center text-gray-700">Deleting client...</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monthly Amount
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone Number
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
              {paginatedClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    <div className="flex flex-col items-center">
                      <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                      <p className="text-lg font-medium text-gray-600">
                        {searchQuery
                          ? "No clients found matching your search."
                          : "No clients found."}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {!searchQuery &&
                          "Get started by adding your first client."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedClients.map((client, index) => (
                  <tr
                    key={`${client.Client_Name}-${client.Type}-${index}`}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                          <i className="fas fa-user text-gray-600"></i>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {client.Client_Name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{client.Type}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        ₹{(client.Amount_To_Be_Paid || 0).toLocaleString()}.00
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {client.Email || "N/A"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {client.Phone_Number || "N/A"}
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
      </div>

      {filteredClients.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-6 space-y-3 sm:space-y-0">
          <p className="text-sm sm:text-base text-gray-700">
            Showing {(currentPage - 1) * entriesPerPage + 1} to{" "}
            {Math.min(currentPage * entriesPerPage, filteredClients.length)} of{" "}
            {filteredClients.length} entries
          </p>
          <div className="flex flex-wrap justify-center gap-2 max-w-md">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 text-sm sm:text-base disabled:opacity-50 hover:bg-gray-50 transition duration-200"
            >
              Previous
            </button>
            {totalPages <= 5 ? (
              [...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`px-4 py-2 border border-gray-300 rounded-md text-sm sm:text-base ${
                    currentPage === i + 1
                      ? "bg-gray-800 text-white"
                      : "text-gray-700 hover:bg-gray-50"
                  } transition duration-200`}
                >
                  {i + 1}
                </button>
              ))
            ) : (
              <>
                {currentPage > 3 && (
                  <>
                    <button
                      onClick={() => setCurrentPage(1)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 text-sm sm:text-base hover:bg-gray-50 transition duration-200"
                    >
                      1
                    </button>
                    {currentPage > 4 && (
                      <span className="px-4 py-2 text-gray-700">...</span>
                    )}
                  </>
                )}
                {[...Array(5)].map((_, i) => {
                  const pageNum =
                    currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                  if (pageNum <= totalPages && pageNum > 0) {
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-4 py-2 border border-gray-300 rounded-md text-sm sm:text-base ${
                          currentPage === pageNum
                            ? "bg-gray-800 text-white"
                            : "text-gray-700 hover:bg-gray-50"
                        } transition duration-200`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                  return null;
                })}
                {currentPage < totalPages - 2 && (
                  <>
                    {currentPage < totalPages - 3 && (
                      <span className="px-4 py-2 text-gray-700">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 text-sm sm:text-base hover:bg-gray-50 transition duration-200"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </>
            )}
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 text-sm sm:text-base disabled:opacity-50 hover:bg-gray-50 transition duration-200"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientsPage;