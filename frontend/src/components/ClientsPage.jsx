// import { useState } from 'react';
// import axios from 'axios';

// const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// const ClientsPage = ({
//   clientsData,
//   setPage,
//   setEditClient,
//   fetchClients,
//   fetchPayments,
//   sessionToken,
// }) => {
//   const [currentPage, setCurrentPage] = useState(1);
//   const entriesPerPage = 10;
//   const totalEntries = clientsData.length;
//   const totalPages = Math.ceil(totalEntries / entriesPerPage);

//   const paginatedData = clientsData.slice(
//     (currentPage - 1) * entriesPerPage,
//     currentPage * entriesPerPage
//   );

//   const deleteClient = async (client) => {
//     if (!confirm(`Are you sure you want to delete ${client.Client_Name} (${client.Type})?`))
//       return;
//     try {
//       await axios.delete(`${BASE_URL}/api/delete-client`, {
//         headers: { Authorization: `Bearer ${sessionToken}` },
//         withCredentials: true,
//         data: { Client_Name: client.Client_Name, Type: client.Type },
//       });
//       fetchClients(sessionToken);
//       fetchPayments(sessionToken);
//       alert('Client deleted successfully!');
//     } catch (error) {
//       console.error('Error deleting client:', error);
//       alert('Failed to delete client: ' + error.message);
//     }
//   };

//   return (
//     <div>
//       <h1 className="text-2xl font-semibold mb-4">Clients</h1>
//       <div className="flex justify-between items-center mb-4">
//         <div className="flex space-x-2">
//           <button
//             onClick={() => setPage('addClient')}
//             className="bg-blue-800 text-white px-4 py-2 rounded-lg hover:bg-blue-900 flex items-center"
//           >
//             <i className="fas fa-user-plus mr-2"></i> Add Client
//           </button>
//           <button
//             onClick={() => alert('Bulk Import coming soon!')}
//             className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center"
//           >
//             <i className="fas fa-file-import mr-2"></i> Bulk Import
//           </button>
//         </div>
//         <div className="flex space-x-2">
//           <input
//             type="text"
//             placeholder="Search clients..."
//             className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
//             aria-label="Search clients"
//           />
//           <button
//             onClick={() => alert('Filters coming soon!')}
//             className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
//           >
//             <i className="fas fa-filter mr-2"></i> Filters
//           </button>
//         </div>
//       </div>

//       <div className="bg-white rounded-lg shadow">
//         <table className="w-full">
//           <thead>
//             <tr className="bg-gray-100 text-left">
//               <th className="p-2">
//                 <input type="checkbox" aria-label="Select all clients" />
//               </th>
//               <th className="p-2">Client</th>
//               <th className="p-2">Email</th>
//               <th className="p-2">Monthly Amount</th>
//               <th className="p-2">Status</th>
//               <th className="p-2">Actions</th>
//             </tr>
//           </thead>
//           <tbody>
//             {paginatedData.map((client, index) => (
//               <tr key={index} className="border-t">
//                 <td className="p-2">
//                   <input type="checkbox" aria-label={`Select ${client.Client_Name}`} />
//                 </td>
//                 <td className="p-2 flex items-center">
//                   <i className="fas fa-user-circle mr-2"></i>
//                   {client.Client_Name}
//                   <br />
//                   <span className="text-sm text-gray-500">
//                     Client ID: #{client.Client_Name.slice(-4)}
//                   </span>
//                 </td>
//                 <td className="p-2">{client.Email || 'N/A'}</td>
//                 <td className="p-2">${client.monthly_payment}</td>
//                 <td className="p-2">Active</td>
//                 <td className="p-2">
//                   <button
//                     onClick={() => {
//                       setEditClient(client);
//                       setPage('addClient');
//                     }}
//                     className="text-gray-500 hover:text-gray-700 mr-2"
//                     aria-label={`Edit ${client.Client_Name}`}
//                   >
//                     <i className="fas fa-edit"></i>
//                   </button>
//                   <button
//                     onClick={() => deleteClient(client)}
//                     className="text-gray-500 hover:text-gray-700"
//                     aria-label={`Delete ${client.Client_Name}`}
//                   >
//                     <i className="fas fa-trash-alt"></i>
//                   </button>
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>

//       <div className="flex justify-between items-center mt-4">
//         <p>
//           Showing {(currentPage - 1) * entriesPerPage + 1} to{' '}
//           {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries}{' '}
//           entries
//         </p>
//         <div className="flex space-x-2">
//           <button
//             onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
//             disabled={currentPage === 1}
//             className="px-4 py-2 border rounded-lg disabled:opacity-50"
//           >
//             Previous
//           </button>
//           {[...Array(totalPages)].map((_, i) => (
//             <button
//               key={i}
//               onClick={() => setCurrentPage(i + 1)}
//               className={`px-4 py-2 border rounded-lg ${
//                 currentPage === i + 1 ? 'bg-blue-800 text-white' : ''
//               }`}
//             >
//               {i + 1}
//             </button>
//           ))}
//           <button
//             onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
//             disabled={currentPage === totalPages}
//             className="px-4 py-2 border rounded-lg disabled:opacity-50"
//           >
//             Next
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default ClientsPage;

import { useState } from 'react';

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
      <div className="flex justify-between items-center mb-6">
        <div className="flex space-x-3">
          <button
            onClick={() => setPage('addClient')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200 flex items-center"
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
          className="p-2 border rounded-lg w-1/3 focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table Section */}
      <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
        <table className="min-w-full border-collapse">
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
                    {client.Amount_To_Be_Paid.toFixed(2)}
                  </td>
                  <td className="border p-3 text-center">
                    <button
                      onClick={() => {
                        setEditClient(client);
                        setPage('addClient');
                      }}
                      className="text-blue-500 hover:text-blue-700 mr-4"
                    >
                      <i className="fas fa-edit"></i> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(client)}
                      className="text-red-500 hover:text-red-700"
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