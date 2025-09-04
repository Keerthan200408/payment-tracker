import React, { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

const AddClientPage = ({ setPage, editClient, setEditClient }) => {
    const { types, fetchTypes, fetchClients } = useData();
    const { currentUser } = useAuth();
    
    const [clientName, setClientName] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [type, setType] = useState('');
    const [monthlyPayment, setMonthlyPayment] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (editClient) {
            setClientName(editClient.Client_Name || '');
            setEmail(editClient.Email || '');
            setPhoneNumber(editClient.Phone_Number || '');
            setType(editClient.Type || '');
            setMonthlyPayment(editClient.Amount_To_Be_Paid?.toString() || '');
        } else {
            // Reset form for "Add" mode
            setClientName('');
            setEmail('');
            setPhoneNumber('');
            setType('');
            setMonthlyPayment('');
        }
    }, [editClient]);
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        // Basic validation
        if (!clientName || !type || !monthlyPayment) {
            setError('Client name, type, and monthly payment are required.');
            setIsSubmitting(false);
            return;
        }

        try {
            if (editClient) {
                const payload = {
                    oldClient: { Client_Name: editClient.Client_Name, Type: editClient.Type },
                    newClient: { Client_Name: clientName, Type: type, Amount_To_Be_Paid: parseFloat(monthlyPayment), Email: email, Phone_Number: phoneNumber }
                };
                await api.clients.updateClient(payload);
            } else {
                const payload = { clientName, email, type, monthlyPayment: parseFloat(monthlyPayment), phoneNumber };
                await api.clients.addClient(payload);
            }
            
            await fetchClients(true); // Force refresh client list
            setEditClient(null); // Clear edit state
            setPage('clients'); // Go back to clients list

        } catch (err) {
            setError(err.response?.data?.error || "Failed to save client.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="w-full max-w-md mx-auto">
            <h2 className="text-xl font-medium text-gray-700 mb-6">{editClient ? 'Edit Client' : 'Add Client'}</h2>
            {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm">
                {/* Your form JSX from the original AddClientPage.jsx goes here */}
                {/* Example input field */}
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-medium mb-2">Client Name</label>
                    <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
                        className="w-full p-2 border rounded-md" disabled={isSubmitting} />
                </div>
                 <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-medium mb-2">Type</label>
                    <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 border rounded-md" disabled={isSubmitting}>
                         <option value="">Select Type</option>
                         {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                 <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-medium mb-2">Monthly Payment</label>
                    <input type="number" value={monthlyPayment} onChange={(e) => setMonthlyPayment(e.target.value)}
                        className="w-full p-2 border rounded-md" disabled={isSubmitting} />
                </div>
                {/* ... other fields for email, phone ... */}
                <button type="submit" disabled={isSubmitting} className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    {isSubmitting ? 'Saving...' : (editClient ? 'Update Client' : 'Add Client')}
                </button>
            </form>
        </div>
    );
};

export default AddClientPage;