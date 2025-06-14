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
  const [email, setEmail] = useState(''); // New state for email
  const [type, setType] = useState('');
  const [amountToBePaid, setAmountToBePaid] = useState('');
  const [error, setError] = useState('');

  // Pre-fill form if editing a client
  useEffect(() => {
    if (editClient) {
      setClientName(editClient.Client_Name);
      setEmail(editClient.Email); // Populate email if editing
      setType(editClient.Type);
      setAmountToBePaid(editClient.Amount_To_Be_Paid.toString());
    }
  }, [editClient]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clientName || !type || !amountToBePaid) {
      setError('Client name, type, and amount are required.');
      return;
    }
    const amount = parseFloat(amountToBePaid);
    if (isNaN(amount) || amount <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      if (editClient) {
        // Update existing client
        await axios.put(`${BASE_URL}/update-client`, {
          oldClient: { Client_Name: editClient.Client_Name, Type: editClient.Type },
          newClient: { Client_Name: clientName, Type: type, Amount_To_Be_Paid: amount, Email: email },
        }, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      } else {
        // Add new client
        await axios.post(`${BASE_URL}/add-client`, {
          clientName,
          email, // Not used in your app, but endpoint expects it
          type,
          monthlyPayment: amount,
        }, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      }
      fetchClients(sessionToken);
      fetchPayments(sessionToken, new Date().getFullYear().toString());
      setClientName('');
      setEmail(''); // Reset email field
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
    <div className="p-6 bg-gray-50 min-h-screen flex justify-center items-center">
      <div className="w-full max-w-md">
        <h2 className="text-xl font-medium text-gray-700 mb-6">
          {editClient ? 'Edit Client' : 'Add Client'}
        </h2>
        {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">Client Name</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base placeholder-gray-400"
              placeholder="Enter client name"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">Email (Optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base placeholder-gray-400"
              placeholder="Enter email (optional)"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base"
            >
              <option value="">Select Type</option>
              <option value="GST">GST</option>
              <option value="IT Return">IT Return</option>
            </select>
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-medium mb-2">Amount To Be Paid</label>
            <input
              type="number"
              value={amountToBePaid}
              onChange={(e) => setAmountToBePaid(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base placeholder-gray-400"
              placeholder="Enter amount"
              min="0"
              step="100"
            />
          </div>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
            <button
              onClick={handleSubmit}
              className="bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition duration-200 flex items-center justify-center w-full sm:w-auto"
            >
              <i className="fas fa-save mr-2"></i> {editClient ? 'Update' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditClient(null);
                setPage('clients');
              }}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-500 transition duration-200 flex items-center justify-center w-full sm:w-auto"
            >
              <i className="fas fa-times mr-2"></i> Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddClientPage;