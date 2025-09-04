import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../api';

const DataContext = createContext(null);

// Helper function to sort data by creation date (newest first)
const sortDataByCreatedAt = (data) => Array.isArray(data) ? [...data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];

export const DataProvider = ({ children }) => {
    const { logout } = useAuth();
    const [clientsData, setClientsData] = useState([]);
    const [paymentsData, setPaymentsData] = useState([]);
    const [types, setTypes] = useState([]);
    const [errorMessage, setErrorMessage] = useState("");

    // Centralized API error handler that logs the user out on session failure
    const handleApiError = useCallback((error) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
            console.error("Session error detected, logging out.");
            logout();
        } else {
            setErrorMessage(error.response?.data?.error || error.message || "An unknown error occurred.");
        }
    }, [logout]);

    const fetchTypes = useCallback(async (forceRefresh = false) => {
        try {
            const data = await api.types.getTypes(forceRefresh);
            setTypes(data || []);
        } catch (error) { handleApiError(error); }
    }, [handleApiError]);
    
    const fetchClients = useCallback(async (forceRefresh = false) => {
        try {
            const data = await api.clients.getClients(forceRefresh);
            setClientsData(sortDataByCreatedAt(data));
        } catch (error) { handleApiError(error); }
    }, [handleApiError]);

    const fetchPayments = useCallback(async (year, forceRefresh = false) => {
        if (!year) return;
        try {
            const data = await api.payments.getPaymentsByYear(year, forceRefresh);
            setPaymentsData(sortDataByCreatedAt(data));
        } catch (error) { handleApiError(error); }
    }, [handleApiError]);

    const value = {
        clientsData, paymentsData, types, errorMessage,
        setClientsData, setPaymentsData, setTypes, setErrorMessage,
        fetchClients, fetchPayments, fetchTypes, handleApiError
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

// Custom hook to easily access data context from any component
export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error("useData must be used within a DataProvider");
    }
    return context;
};