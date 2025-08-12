import { useState, useEffect } from 'react';
import { clientsAPI, handleAPIError } from '../utils/api';

const PINNED_KEY = 'pinned_clients_manual'; // localStorage key for manual-added clients

const AddClientPage = ({
  setPage,
  fetchClients,
  fetchPayments,
  sessionToken,
  currentUser,
  editClient,
  setEditClient,
  types,
  apiCacheRef,
  fetchTypes,
  setRefreshTrigger,
}) => {
  const [clientName, setClientName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [type, setType] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // Add loading state

  useEffect(() => {
    if (sessionToken && currentUser) {
      const cacheKey = `types_${currentUser}_${sessionToken}`;
      if (!types.length) {
        fetchTypes(sessionToken);
      }
    }
  }, [sessionToken, currentUser, types, fetchTypes]);

  useEffect(() => {
    if (editClient) {
      setClientName(editClient.Client_Name || '');
      setEmail(editClient.Email || '');
      setPhoneNumber(editClient.Phone_Number || '');
      setType(editClient.Type || '');
      setMonthlyPayment(editClient.Amount_To_Be_Paid?.toString() || '');
    }
  }, [editClient]);

  const pinClient = (clientNameVal, typeVal) => {
    try {
      const id = `${clientNameVal.trim()}|${typeVal.trim()}`;
      const raw = localStorage.getItem(PINNED_KEY);
      let arr = [];
      if (raw) {
        try {
          arr = JSON.parse(raw);
          if (!Array.isArray(arr)) arr = [];
        } catch {
          arr = [];
        }
      }
      // Avoid duplicates; put newest at front
      arr = arr.filter((x) => x !== id);
      arr.unshift(id);
      // keep a reasonable cap
      if (arr.length > 100) arr = arr.slice(0, 100);
      localStorage.setItem(PINNED_KEY, JSON.stringify(arr));
    } catch (err) {
      console.warn('Pin client failed', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;
    setIsSubmitting(true);

    setError('');
    setSuccess('');

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Try to read the actual input value if any formatting libs change it
    const monthlyPaymentInput = document.querySelector('input[inputMode="decimal"]');
    const actualMonthlyPayment = monthlyPaymentInput ? monthlyPaymentInput.value : monthlyPayment;
    const finalMonthlyPayment = actualMonthlyPayment || monthlyPayment;

    // Validate
    if (!clientName || !type || !finalMonthlyPayment) {
      setError('Client name, type, and monthly payment are required.');
      setIsSubmitting(false);
      return;
    }
    if (clientName.length > 100) {
      setError('Client name must be 100 characters or less.');
      setIsSubmitting(false);
      return;
    }
    if (!types.includes(type)) {
      setError(`Type must be one of: ${types.join(', ')}`);
      setIsSubmitting(false);
      return;
    }

    const paymentValue = parseFloat(finalMonthlyPayment);
    if (isNaN(paymentValue) || paymentValue <= 0) {
      setError('Monthly payment must be a positive number.');
      setIsSubmitting(false);
      return;
    }
    if (paymentValue > 1000000) {
      setError('Monthly payment exceeds maximum limit of 1,000,000.');
      setIsSubmitting(false);
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      setIsSubmitting(false);
      return;
    }
    if (phoneNumber && !/^\+?[\d\s-]{10,15}$/.test(phoneNumber)) {
      setError('Please enter a valid phone number (10-15 digits, optional + or -).');
      setIsSubmitting(false);
      return;
    }

    try {
      if (editClient) {
        // Update existing client
        const payload = {
          oldClientName: editClient.Client_Name,
          oldType: editClient.Type,
          clientName,
          type,
          monthlyPayment: paymentValue,
          email: email || '',
          phoneNumber: phoneNumber || '',
        };
        await clientsAPI.updateClient(payload);
        setSuccess('Client updated successfully! Redirecting to clients page...');
      } else {
        // Add new client (manual add) — pin this client so it remains at top
        const payload = {
          clientName,
          email: email || '',
          type,
          monthlyPayment: paymentValue,
          phoneNumber: phoneNumber || '',
        };
        await clientsAPI.addClient(payload);

        // Pin only for manual adds (not for CSV import)
        pinClient(clientName, type);

        setSuccess('Client added successfully! Redirecting to clients page...');
      }

      // Clear cache for clients and payments (use the project's cache key patterns)
      const clientsCacheKey = `clients_${currentUser}_${localStorage.getItem('sessionToken')}`;
      const paymentsCacheKey = `payments_${new Date().getFullYear()}_${localStorage.getItem('sessionToken')}`;
      if (apiCacheRef && apiCacheRef.current) {
        delete apiCacheRef.current[clientsCacheKey];
        delete apiCacheRef.current[paymentsCacheKey];
      }

      // Refresh clients + payments, force refresh so parent updates state
      await Promise.all([
        fetchClients(localStorage.getItem('sessionToken'), true),
        fetchPayments(localStorage.getItem('sessionToken'), new Date().getFullYear().toString(), true),
      ]);

      // Trigger anything listening for refresh
      setRefreshTrigger(Date.now());

      // Short wait so UI shows success briefly
      await new Promise((resolve) => setTimeout(resolve, 350));

      setEditClient(null);
      setPage('clients');
    } catch (err) {
      handleAPIError(err, setError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMonthlyPaymentChange = (e) => {
    const value = e.target.value;
    if (value === '' || (!isNaN(value) && parseFloat(value) >= 0)) {
      setMonthlyPayment(value);
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
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm">
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">Client Name</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base placeholder-gray-400"
              placeholder="Enter client name"
              disabled={isSubmitting}
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
              disabled={isSubmitting}
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
              disabled={isSubmitting}
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base"
              disabled={isSubmitting}
            >
              <option value="">Select Type</option>
              {types.map((typeOption) => (
                <option key={typeOption} value={typeOption}>
                  {typeOption}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-medium mb-2">Monthly Payment</label>
            <input
              type="text"
              inputMode="decimal"
              value={monthlyPayment}
              onChange={handleMonthlyPaymentChange}
              onBlur={(e) => {
                if (e.target.value !== monthlyPayment) {
                  setMonthlyPayment(e.target.value);
                }
              }}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base placeholder-gray-400"
              placeholder="Enter monthly payment"
              disabled={isSubmitting}
              pattern="[0-9]*\.?[0-9]*"
            />
          </div>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`${
                isSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gray-800 hover:bg-gray-700'
              } text-white px-4 py-2 rounded-md transition duration-200 flex items-center justify-center w-full sm:w-auto`}
            >
              <i className={`fas ${isSubmitting ? 'fa-spinner fa-spin' : 'fa-save'} mr-2`}></i>
              {isSubmitting ? 'Saving...' : (editClient ? 'Update' : 'Save')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditClient(null);
                setPage('clients');
              }}
              disabled={isSubmitting}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-500 transition duration-200 flex items-center justify-center w-full sm:w-auto disabled:opacity-50"
            >
              <i className="fas fa-times mr-2"></i> Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddClientPage;
