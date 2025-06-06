// import { useState } from 'react';
// import axios from 'axios';

// const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// const AddClient = () => {
//   const [clientName, setClientName] = useState('');
//   const [email, setEmail] = useState('');
//   const [type, setType] = useState('');
//   const [monthlyPayment, setMonthlyPayment] = useState('');
//   const [error, setError] = useState('');
//   const [isLoading, setIsLoading] = useState(false);

//   const handleSubmit = async () => {
//     if (!clientName || !type || !monthlyPayment) {
//       setError('Client name, type, and monthly payment are required.');
//       return;
//     }
//     setError('');
//     setIsLoading(true);
//     try {
//       await axios.post(`${BASE_URL}/api/add-client`, { clientName, email, type, monthlyPayment }, {
//         withCredentials: true,
//       });
//       setClientName('');
//       setEmail('');
//       setType('');
//       setMonthlyPayment('');
//       alert('Client added successfully!');
//     } catch (error) {
//       console.error('Add client error:', error);
//       setError(error.response?.data?.error || 'Error adding client. Please try again.');
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   return (
//     <div className="p-6 max-w-md mx-auto">
//       <h2 className="text-2xl font-bold mb-4">Add Client</h2>
//       {error && <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-lg">{error}</div>}
//       <div className="mb-4">
//         <label className="block mb-1">Client Name</label>
//         <input
//           type="text"
//           className="w-full p-2 border rounded-lg"
//           value={clientName}
//           onChange={(e) => setClientName(e.target.value)}
//           placeholder="Enter Client Name"
//           disabled={isLoading}
//         />
//       </div>
//       <div className="mb-4">
//         <label className="block mb-1">Email (Optional)</label>
//         <input
//           type="email"
//           className="w-full p-2 border rounded-lg"
//           value={email}
//           onChange={(e) => setEmail(e.target.value)}
//           placeholder="Enter Email"
//           disabled={isLoading}
//         />
//       </div>
//       <div className="mb-4">
//         <label className="block mb-1">Type</label>
//         <input
//           type="text"
//           className="w-full p-2 border rounded-lg"
//           value={type}
//           onChange={(e) => setType(e.target.value)}
//           placeholder="Enter Type"
//           disabled={isLoading}
//         />
//       </div>
//       <div className="mb-4">
//         <label className="block mb-1">Monthly Payment</label>
//         <input
//           type="number"
//           className="w-full p-2 border rounded-lg"
//           value={monthlyPayment}
//           onChange={(e) => setMonthlyPayment(e.target.value)}
//           placeholder="Enter Monthly Payment"
//           disabled={isLoading}
//         />
//       </div>
//       <button
//         onClick={handleSubmit}
//         className="w-full p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
//         disabled={isLoading}
//       >
//         {isLoading ? 'Adding...' : 'Add Client'}
//       </button>
//     </div>
//   );
// };

// export default AddClient;


import { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

const AddClientPage = ({
  setPage,
  fetchClients,
  fetchPayments,
  sessionToken,
  currentUser,
  editClient,
  setEditClient,
}) => {
  const [clientName, setClientName] = useState('');
  const [type, setType] = useState('');
  const [amountToBePaid, setAmountToBePaid] = useState('');
  const [error, setError] = useState('');

  // Pre-fill form if editing a client
  useEffect(() => {
    if (editClient) {
      setClientName(editClient.Client_Name);
      setType(editClient.Type);
      setAmountToBePaid(editClient.Amount_To_Be_Paid.toString());
    }
  }, [editClient]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clientName || !type || !amountToBePaid) {
      setError('All fields are required.');
      return;
    }
    const amount = parseFloat(amountToBePaid);
    if (isNaN(amount) || amount <= 0) {
      setError('Amount must be a positive number.');
      return;
    }

    try {
      if (editClient) {
        // Update existing client
        await axios.put(`${BASE_URL}/update-client`, {
          oldClient: { Client_Name: editClient.Client_Name, Type: editClient.Type },
          newClient: { Client_Name: clientName, Type: type, Amount_To_Be_Paid: amount },
        }, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      } else {
        // Add new client
        await axios.post(`${BASE_URL}/add-client`, {
          clientName,
          email: '', // Not used in your app, but endpoint expects it
          type,
          monthlyPayment: amount,
        }, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      }
      fetchClients(sessionToken);
      fetchPayments(sessionToken);
      setClientName('');
      setType('');
      setAmountToBePaid('');
      setError('');
      setEditClient(null);
      setPage('clients');
    } catch (err) {
      console.error('Add/Edit client error:', err);
      setError(err.response?.data?.error || 'Failed to save client.');
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-6">
        {editClient ? 'Edit Client' : 'Add Client'}
      </h2>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Client Name</label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter client name"
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Type</label>
          <input
            type="text"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter type"
          />
        </div>
        <div className="mb-6">
          <label className="block text-gray-700 mb-2">Amount To Be Paid</label>
          <input
            type="number"
            value={amountToBePaid}
            onChange={(e) => setAmountToBePaid(e.target.value)}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter amount"
            min="0"
            step="0.01"
          />
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200 flex items-center"
          >
            <i className="fas fa-save mr-2"></i> {editClient ? 'Update' : 'Save'}
          </button>
          <button
            onClick={() => {
              setEditClient(null);
              setPage('clients');
            }}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
          >
            <i className="fas fa-times mr-2"></i> Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddClientPage;