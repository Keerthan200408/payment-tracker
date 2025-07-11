import { useState, useCallback } from 'react';
import axios from 'axios';

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";

export const useDataFetching = (apiCache) => {
  const [clientsData, setClientsData] = useState([]);
  const [paymentsData, setPaymentsData] = useState([]);
  const [types, setTypes] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSessionError = useCallback((error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.log("Session invalid, logging out");
      return { shouldLogout: true };
    } else if (error.response?.status === 429) {
      console.log("Rate limit hit, backing off");
      setErrorMessage("Too many requests. Please wait a moment before trying again.");
    } else {
      console.log("Non-auth error:", error.message);
    }
    return { shouldLogout: false };
  }, []);

  const sortDataByCreatedAt = useCallback((data, sortOrder = 'desc') => {
    if (!Array.isArray(data)) return [];
    
    return [...data].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
      
      if (sortOrder === 'desc') {
        return dateB - dateA; // Newest first
      } else {
        return dateA - dateB; // Oldest first
      }
    });
  }, []);

  const fetchTypes = useCallback(async (token, currentUser) => {
    if (!token || !currentUser) return;
    
    const cacheKey = `types_${currentUser}_${token}`;
    
    // Check cache first
    const cachedData = apiCache.getCachedData(cacheKey);
    if (cachedData) {
      console.log(`useDataFetching: Using cached types for ${currentUser}`);
      setTypes(cachedData);
      return;
    }
    
    // Check if request is already in progress
    const requestKey = `request_${cacheKey}`;
    if (apiCache.isRequestInProgress(requestKey)) {
      console.log(`useDataFetching: Request already in progress for ${currentUser}`);
      return apiCache.getRequestInProgress(requestKey);
    }
    
    // Mark request as in progress
    const requestPromise = (async () => {
      try {
        console.log(`useDataFetching: Fetching types for ${currentUser} with token:`, token?.substring(0, 10) + "...");
        
        const response = await axios.get(`${BASE_URL}/get-types`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        });
        
        const typesData = Array.isArray(response.data) ? response.data : [];
        console.log(`useDataFetching: Types fetched for ${currentUser}:`, typesData);
        
        setTypes(typesData);
        apiCache.setCachedData(cacheKey, typesData);
        
        return typesData;
      } catch (error) {
        console.error(`useDataFetching: Fetch types error for ${currentUser}:`, error.response?.data?.error || error.message);
        setTypes([]);
        const sessionError = handleSessionError(error);
        if (sessionError.shouldLogout) {
          throw new Error('LOGOUT_REQUIRED');
        }
        throw error;
      } finally {
        // Clear the in-progress flag
        apiCache.clearRequestInProgress(requestKey);
      }
    })();
    
    // Store the promise to prevent duplicate requests
    apiCache.setRequestInProgress(requestKey, requestPromise);
    
    return requestPromise;
  }, [apiCache, handleSessionError]);

  const fetchClients = useCallback(async (token, currentUser, forceRefresh = false) => {
    if (!token) return;
    
    const cacheKey = `clients_${currentUser}_${token}`;
    
    // Invalidate cache if forceRefresh is true
    if (forceRefresh) {
      console.log(`useDataFetching: Invalidating cache for clients_${currentUser} due to forceRefresh`);
      apiCache.invalidateCache(cacheKey);
    }
    
    // Check cache first
    const cachedData = apiCache.getCachedData(cacheKey);
    if (cachedData && !forceRefresh) {
      console.log(`useDataFetching: Using cached clients for ${currentUser}`);
      setClientsData(cachedData);
      return;
    }
    
    // Check if request is already in progress
    const requestKey = `request_${cacheKey}`;
    if (apiCache.isRequestInProgress(requestKey)) {
      console.log(`useDataFetching: Clients request already in progress for ${currentUser}`);
      return apiCache.getRequestInProgress(requestKey);
    }
    
    // Mark request as in progress
    const requestPromise = (async () => {
      try {
        console.log("useDataFetching: Fetching clients with token:", token?.substring(0, 10) + "...");
        const response = await axios.get(`${BASE_URL}/get-clients`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        });
        
        console.log("useDataFetching: Clients fetched:", response.data);
        const clientsData = Array.isArray(response.data) ? response.data : [];
        
        // Sort clients by createdAt (newest first)
        const sortedClientsData = sortDataByCreatedAt(clientsData, 'desc');
        console.log("useDataFetching: Clients sorted by createdAt (newest first)");
        
        setClientsData(sortedClientsData);
        
        // Cache the sorted result
        apiCache.setCachedData(cacheKey, sortedClientsData);
        
        return sortedClientsData;
      } catch (error) {
        console.error("useDataFetching: Fetch clients error:", error.response?.data?.error || error.message);
        setClientsData([]);
        const sessionError = handleSessionError(error);
        if (sessionError.shouldLogout) {
          throw new Error('LOGOUT_REQUIRED');
        }
        throw error;
      } finally {
        // Clear the in-progress flag
        apiCache.clearRequestInProgress(requestKey);
      }
    })();
    
    // Store the promise to prevent duplicate requests
    apiCache.setRequestInProgress(requestKey, requestPromise);
    
    return requestPromise;
  }, [apiCache, handleSessionError, sortDataByCreatedAt]);

  const fetchPayments = useCallback(async (token, year, currentUser, forceRefresh = false) => {
    if (!token || !year) return;

    const cacheKey = `payments_${year}_${token}`;

    // Invalidate cache if forceRefresh is true
    if (forceRefresh) {
      console.log(`useDataFetching: Invalidating cache for payments_${year} due to forceRefresh`);
      apiCache.invalidateCache(cacheKey);
    }

    // Check cache first
    const cachedData = apiCache.getCachedData(cacheKey);
    if (cachedData && !forceRefresh) {
      console.log(`useDataFetching: Using cached payments for ${year}`);
      setPaymentsData(cachedData);
      return;
    }

    // Check if request is already in progress
    const requestKey = `request_${cacheKey}`;
    if (apiCache.isRequestInProgress(requestKey)) {
      console.log(`useDataFetching: Payments request already in progress for ${year}`);
      return apiCache.getRequestInProgress(requestKey);
    }

    // Mark request as in progress
    const requestPromise = (async () => {
      try {
        console.log(`useDataFetching: Fetching payments for ${year} with token:`, token?.substring(0, 10) + "...");
        const response = await axios.get(`${BASE_URL}/get-payments-by-year`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { year },
          timeout: 10000,
        });

        const data = Array.isArray(response.data) ? response.data : [];
        console.log(`useDataFetching: Fetched payments for ${year}:`, data);

        // Sort payments by createdAt (newest first)
        const sortedPaymentsData = sortDataByCreatedAt(data, 'desc');
        console.log("useDataFetching: Payments sorted by createdAt (newest first)");

        setPaymentsData(sortedPaymentsData);

        // Cache the sorted result
        apiCache.setCachedData(cacheKey, sortedPaymentsData);

        return sortedPaymentsData;
      } catch (error) {
        console.error("useDataFetching: Error fetching payments:", error);
        setPaymentsData([]);
        const sessionError = handleSessionError(error);
        if (sessionError.shouldLogout) {
          throw new Error('LOGOUT_REQUIRED');
        }
        throw error;
      } finally {
        // Clear the in-progress flag
        apiCache.clearRequestInProgress(requestKey);
      }
    })();

    // Store the promise to prevent duplicate requests
    apiCache.setRequestInProgress(requestKey, requestPromise);

    return requestPromise;
  }, [apiCache, handleSessionError, sortDataByCreatedAt]);

  return {
    clientsData,
    setClientsData,
    paymentsData,
    setPaymentsData,
    types,
    setTypes,
    errorMessage,
    setErrorMessage,
    fetchTypes,
    fetchClients,
    fetchPayments,
    handleSessionError,
  };
}; 