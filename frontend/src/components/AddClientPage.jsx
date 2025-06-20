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
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [type, setType] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (editClient) {
      console.log('Populating edit client data:', editClient);
      setClientName(editClient.Client_Name || '');
      setEmail(editClient.Email || '');
      setPhoneNumber(editClient.Phone_Number || '');
      setType(editClient.Type || '');
      setMonthlyPayment(editClient.Amount_To_Be_Paid?.toString() || '');
    }
  }, [editClient]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate required fields
    if (!clientName || !type || !monthlyPayment) {
      setError('Client name, type, and monthly payment are required.');
      return;
    }
    if (clientName.length > 100) {
      setError('Client name must be 100 characters or less.');
      return;
    }
    if (type.length > 50) {
      setError('Type must be 50 characters or less.');
      return;
    }
    if (!['GST', 'IT Return'].includes(type)) {
      setError('Type must be either "GST" or "IT Return".');
      return;
    }
    const paymentValue = parseFloat(monthlyPayment);
    if (isNaN(paymentValue) || paymentValue <= 0) {
      setError('Monthly payment must be a positive number.');
      return;
    }
    if (paymentValue > 1000000) {
      setError('Monthly payment exceeds maximum limit of 1,000,000.');
      return;
    }
    // Validate optional email
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    // Validate optional phone number
    if (phoneNumber && !/^\+?[\d\s-]{10,15}$/.test(phoneNumber)) {
      setError('Please enter a valid phone number (10-15 digits, optional + or -).');
      return;
    }

    try {
      if (editClient) {
        const payload = {
          oldClient: { Client_Name: editClient.Client_Name, Type: editClient.Type },
          newClient: {
            Client_Name: clientName,
            Type: type,
            Amount_To_Be_Paid: paymentValue,
            Email: email || '',
            Phone_Number: phoneNumber || '',
          },
        };
        console.log('Update client payload:', payload);
        await axios.put(`${BASE_URL}/update-client`, payload, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      } else {
        await axios.post(`${BASE_URL}/add-client`, {
          clientName,
          email: email || '',
          type,
          monthlyPayment: paymentValue,
          phoneNumber: phoneNumber || '',
        }, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      }
      setSuccess(`${editClient ? 'Client updated' : 'Client added'} successfully! Redirecting to clients page...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await Promise.all([
        fetchClients(sessionToken),
        fetchPayments(sessionToken, new Date().getFullYear())
      ]);
      setEditClient(null);
      setPage('clients');
    } catch (err) {
      console.error('Add/Edit client error:', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
        fullError: err,
      });
      setError(err.response?.data?.error || err.message || 'Failed to save client.');
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen flex justify-center items-center">
      <div className="w-full max-w-md">
        <h2 className="text-xl font-medium text-gray-700 mb-6">
          {editClient ? 'Edit Client' : 'Add Client'}
        </h2>
        {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
        {success && <p className="text-green-500 mb-4 text-sm">{success}</p>}
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
            <label className="block text-gray-700 text-sm font-medium mb-2">Phone Number (Optional)</label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base placeholder-gray-400"
              placeholder="Enter phone number (e.g., +1234567890)"
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
            <label className="block text-gray-700 text-sm font-medium mb-2">Monthly Payment</label>
            <input
              type="number"
              value={monthlyPayment}
              onChange={(e) => setMonthlyPayment(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base placeholder-gray-400"
              placeholder="Enter monthly payment"
              min="0"
              step="100"
              max="1000000"
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