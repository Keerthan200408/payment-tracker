import { useState } from 'react';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const AddClientPage = ({
  setPage,
  fetchClients,
  fetchPayments,
  sessionToken,
  currentUser,
  editClient,
  setEditClient,
}) => {
  const [clientName, setClientName] = useState(editClient?.Client_Name || '');
  const [email, setEmail] = useState(editClient?.Email || '');
  const [type, setType] = useState(editClient?.Type || '');
  const [monthlyPayment, setMonthlyPayment] = useState(
    editClient?.monthly_payment || ''
  );

  const saveClient = async () => {
    if (!clientName || !email || !type || !monthlyPayment) {
      alert('All fields are required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Please enter a valid email address.');
      return;
    }
    const paymentValue = parseFloat(monthlyPayment);
    if (isNaN(paymentValue) || paymentValue <= 0) {
      alert('Monthly payment must be a positive number.');
      return;
    }

    try {
      if (editClient) {
        await axios.put(
          `${BASE_URL}/api/update-client`,
          {
            clientName,
            email,
            type,
            monthlyPayment: paymentValue,
            Old_Client_Name: editClient.Client_Name,
            Old_Type: editClient.Type,
          },
          {
            headers: { Authorization: `Bearer ${sessionToken}` },
            withCredentials: true,
          }
        );
        alert('Client updated successfully!');
      } else {
        await axios.post(
          `${BASE_URL}/api/add-client`,
          {
            clientName,
            email,
            type,
            monthlyPayment: paymentValue,
          },
          {
            headers: { Authorization: `Bearer ${sessionToken}` },
            withCredentials: true,
          }
        );
        alert('Client added successfully!');
      }
      fetchClients(sessionToken);
      fetchPayments(sessionToken);
      setEditClient(null);
      setPage('home');
    } catch (error) {
      console.error('Error saving client:', error);
      alert('Failed to save client: ' + error.message);
      setPage('home');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-xl font-semibold mb-4">
        {editClient ? 'Edit Client' : 'Add New Client'}
      </h2>
      <div className="mb-4">
        <label className="block mb-1">Client Name</label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="Enter client name"
          aria-label="Client name"
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Client Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="Enter client email"
          aria-label="Client email"
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Type</label>
        <input
          type="text"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="Enter type"
          aria-label="Client type"
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Monthly Payment Amount</label>
        <input
          type="text"
          value={monthlyPayment}
          onChange={(e) => setMonthlyPayment(e.target.value)}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="Enter amount"
          aria-label="Monthly payment amount"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => {
            setEditClient(null);
            setPage('home');
          }}
          className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
        >
          Cancel
        </button>
        <button
          onClick={saveClient}
          className="bg-blue-800 text-white px-4 py-2 rounded-lg hover:bg-blue-900"
        >
          {editClient ? 'Update Client' : 'Add Client'}
        </button>
      </div>
    </div>
  );
};

export default AddClientPage;