import React, { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import api from '../api';

const AddClientPage = ({ setPage, editClient, setEditClient }) => {
    const { types, fetchTypes, fetchClients } = useData();
    
    const [clientName, setClientName] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [type, setType] = useState('');
    const [monthlyPayment, setMonthlyPayment] = useState('');
    
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
    const [newType, setNewType] = useState("");
    const [typeError, setTypeError] = useState("");

    useEffect(() => {
        fetchTypes();
    }, [fetchTypes]);

    useEffect(() => {
        if (editClient) {
            setClientName(editClient.Client_Name || '');
            setEmail(editClient.Email || '');
            setPhoneNumber(editClient.Phone_Number || '');
            setType(editClient.Type || '');
            setMonthlyPayment(editClient.Amount_To_Be_Paid?.toString() || '');
        } else {
            setClientName('');
            setEmail('');
            setPhoneNumber('');
            setType('');
            setMonthlyPayment('');
        }
    }, [editClient]);
    
    const handleAddType = async () => {
        const trimmedNewType = newType.trim();
        if (!trimmedNewType) {
            setTypeError("Type cannot be empty.");
            return;
        }
        try {
            await api.types.addType({ type: trimmedNewType });
            await fetchTypes(true);
            
            // CHANGE 1: Auto-select the new type in the main form's dropdown
            setType(trimmedNewType);
            
            // CHANGE 2: Clear the modal's input field for the next entry
            setNewType(""); 
            
            setTypeError("");
            alert("Type added successfully!");
            setIsTypeModalOpen(false); // Close the modal on success
        } catch (err) {
            setTypeError(err.response?.data?.error || "Failed to add type.");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setError('');
        setSuccess('');

        if (!clientName || !type || !monthlyPayment) {
            setError('Client name, type, and monthly payment are required.');
            setIsSubmitting(false);
            return;
        }
        if (!email.trim() && !phoneNumber.trim()) {
            setError('Please provide either an Email or a Phone Number.');
            setIsSubmitting(false);
            return;
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('Please enter a valid email address.');
            setIsSubmitting(false);
            return;
        }
        if (phoneNumber && !/^\+?[\d\s-]{10,15}$/.test(phoneNumber)) {
            setError('Please enter a valid phone number (10-15 digits).');
            setIsSubmitting(false);
            return;
        }

        try {
            if (editClient) {
                const payload = {
                    oldClient: { Client_Name: editClient.Client_Name, Type: editClient.Type },
                    newClient: { 
                        Client_Name: clientName.trim(), 
                        Type: type.trim(), 
                        Amount_To_Be_Paid: parseFloat(monthlyPayment), 
                        Email: email.trim(), 
                        Phone_Number: phoneNumber.trim() 
                    }
                };
                await api.clients.updateClient(payload);
                setSuccess('Client updated successfully!');
            } else {
                const payload = { 
                    clientName: clientName.trim(), 
                    email: email.trim(), 
                    type: type.trim(), 
                    monthlyPayment: parseFloat(monthlyPayment), 
                    phoneNumber: phoneNumber.trim() 
                };
                await api.clients.addClient(payload);
                setSuccess('Client added successfully!');
            }
            
            await fetchClients(true);
            
            setTimeout(() => {
                setEditClient(null);
                setPage('clients');
            }, 700);

        } catch (err) {
            setError(err.response?.data?.error || "Failed to save client. The client may already exist.");
            setIsSubmitting(false);
        }
    };

    // CHANGE 3: New handler to allow only numbers and one decimal in payment field
    const handleMonthlyPaymentChange = (e) => {
        const value = e.target.value;
        // This regex allows numbers and at most one decimal point
        if (/^\d*\.?\d*$/.test(value)) {
            setMonthlyPayment(value);
        }
    };
    
    return (
        <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
            <div className="w-full max-w-md">
                <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">
                    {editClient ? 'Edit Client' : 'Add New Client'}
                </h2>
                <p className="text-sm text-gray-500 mb-6 text-center">
                    Please provide at least one contact method.
                </p>
                
                {error && <p className="p-3 bg-red-100 text-red-700 rounded-lg mb-4 text-center text-sm">{error}</p>}
                {success && <p className="p-3 bg-green-100 text-green-700 rounded-lg mb-4 text-center text-sm">{success}</p>}
                
                <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md">
                    {/* Form fields */}
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-medium mb-2">Client Name</label>
                        <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" placeholder="Enter client name" disabled={isSubmitting} />
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-medium mb-2">Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" placeholder="Enter email address" disabled={isSubmitting} />
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-medium mb-2">Phone Number</label>
                        <input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" placeholder="Enter phone number" disabled={isSubmitting} />
                    </div>
                    <div className="mb-4">
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-gray-700 text-sm font-medium">Type</label>
                            <button type="button" onClick={() => setIsTypeModalOpen(true)} className="bg-gray-800 text-white px-2 py-1 rounded text-xs hover:bg-gray-700 disabled:opacity-50" disabled={isSubmitting}>
                                Add Type
                            </button>
                        </div>
                        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" disabled={isSubmitting}>
                            <option value="">Select Type</option>
                            {Array.isArray(types) && types.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-medium mb-2">Monthly Payment (₹)</label>
                        {/* CHANGE 3: Updated input type to remove steppers */}
                        <input 
                            type="text"
                            inputMode="decimal" 
                            value={monthlyPayment} 
                            onChange={handleMonthlyPaymentChange} 
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter monthly payment amount" 
                            disabled={isSubmitting}
                        />
                    </div>
                    {/* Form buttons */}
                    <div className="flex space-x-3">
                        <button type="submit" disabled={isSubmitting} className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition">
                            {isSubmitting ? 'Saving...' : (editClient ? 'Update Client' : 'Save Client')}
                        </button>
                        <button type="button" onClick={() => setPage('clients')} disabled={isSubmitting} className="flex-1 py-2 px-4 bg-gray-600 text-white rounded-md hover:bg-gray-500 disabled:opacity-50 transition">
                            Cancel
                        </button>
                    </div>
                </form>

                {/* Add Type Modal */}
                {isTypeModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                        <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
                            <h2 className="text-lg font-semibold mb-4">Add New Type</h2>
                            <input type="text" value={newType} onChange={e => { setNewType(e.target.value); setTypeError(""); }} placeholder="Enter type (e.g. GST)" className="w-full p-2 border border-gray-300 rounded mb-2" />
                            {typeError && <div className="text-sm text-red-600 mb-2">{typeError}</div>}
                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setIsTypeModalOpen(false)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">
                                    Cancel
                                </button>
                                <button onClick={handleAddType} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
                                    Add Type
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AddClientPage;