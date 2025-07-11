import { useRef, useCallback } from 'react';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useApiCache = () => {
  const apiCacheRef = useRef({});
  const saveTimeoutsRef = useRef({});

  const clearCache = useCallback(() => {
    apiCacheRef.current = {};
  }, []);

  const clearTimeouts = useCallback(() => {
    Object.values(saveTimeoutsRef.current).forEach(clearTimeout);
    saveTimeoutsRef.current = {};
  }, []);

  const invalidateCache = useCallback((pattern) => {
    Object.keys(apiCacheRef.current).forEach(key => {
      if (key.includes(pattern)) {
        delete apiCacheRef.current[key];
      }
    });
  }, []);

  const getCachedData = useCallback((cacheKey) => {
    const cached = apiCacheRef.current[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedData = useCallback((cacheKey, data) => {
    apiCacheRef.current[cacheKey] = {
      data,
      timestamp: Date.now(),
    };
  }, []);

  const isRequestInProgress = useCallback((requestKey) => {
    return !!apiCacheRef.current[requestKey];
  }, []);

  const setRequestInProgress = useCallback((requestKey, promise) => {
    apiCacheRef.current[requestKey] = promise;
  }, []);

  const clearRequestInProgress = useCallback((requestKey) => {
    delete apiCacheRef.current[requestKey];
  }, []);

  const addTimeout = useCallback((key, timeoutId) => {
    saveTimeoutsRef.current[key] = timeoutId;
  }, []);

  const clearTimeout = useCallback((key) => {
    if (saveTimeoutsRef.current[key]) {
      clearTimeout(saveTimeoutsRef.current[key]);
      delete saveTimeoutsRef.current[key];
    }
  }, []);

  return {
    getCachedData,
    setCachedData,
    isRequestInProgress,
    setRequestInProgress,
    clearRequestInProgress,
    invalidateCache,
    clearCache,
    addTimeout,
    clearTimeout,
    clearTimeouts,
  };
}; 