import { useState, useCallback, useRef, useEffect } from 'react';

const useBatchOperations = (options = {}) => {
  const {
    maxBatchSize = 50,
    batchDelay = 1000,
    retryAttempts = 3,
    retryDelay = 2000,
    onBatchComplete,
    onBatchError
  } = options;

  const [batchStatus, setBatchStatus] = useState({
    isProcessing: false,
    pendingCount: 0,
    completedCount: 0,
    failedCount: 0,
    currentBatch: 0,
    totalBatches: 0
  });

  const [batchErrors, setBatchErrors] = useState([]);
  const pendingOperations = useRef(new Map());
  const batchTimeoutRef = useRef(null);
  const isProcessingRef = useRef(false);

  // Process batch operations
  const processBatch = useCallback(async (operations) => {
    if (isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    setBatchStatus(prev => ({
      ...prev,
      isProcessing: true,
      totalBatches: Math.ceil(operations.length / maxBatchSize)
    }));

    const batches = [];
    for (let i = 0; i < operations.length; i += maxBatchSize) {
      batches.push(operations.slice(i, i + maxBatchSize));
    }

    let completedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      setBatchStatus(prev => ({
        ...prev,
        currentBatch: batchIndex + 1
      }));

      // Process batch with retry logic
      for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        try {
          const batchResults = await Promise.allSettled(
            batch.map(operation => operation.execute())
          );

          const batchCompleted = batchResults.filter(result => result.status === 'fulfilled').length;
          const batchFailed = batchResults.filter(result => result.status === 'rejected').length;

          completedCount += batchCompleted;
          failedCount += batchFailed;

          // Collect errors
          batchResults.forEach((result, index) => {
            if (result.status === 'rejected') {
              errors.push({
                operation: batch[index],
                error: result.reason,
                batchIndex,
                attempt
              });
            }
          });

          // If batch was successful, break retry loop
          if (batchFailed === 0) break;

          // If this was the last attempt, don't retry
          if (attempt === retryAttempts) break;

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));

        } catch (error) {
          failedCount += batch.length;
          errors.push({
            operation: batch[0],
            error,
            batchIndex,
            attempt
          });
        }
      }

      // Small delay between batches to prevent overwhelming the server
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    setBatchStatus(prev => ({
      ...prev,
      isProcessing: false,
      completedCount,
      failedCount
    }));

    setBatchErrors(errors);
    isProcessingRef.current = false;

    // Call completion callbacks
    if (onBatchComplete) {
      onBatchComplete({ completedCount, failedCount, errors });
    }

    if (errors.length > 0 && onBatchError) {
      onBatchError(errors);
    }

    return { completedCount, failedCount, errors };
  }, [maxBatchSize, retryAttempts, retryDelay, onBatchComplete, onBatchError]);

  // Add operation to batch
  const addToBatch = useCallback((operation) => {
    const operationId = operation.id || Date.now() + Math.random();
    pendingOperations.current.set(operationId, operation);

    setBatchStatus(prev => ({
      ...prev,
      pendingCount: pendingOperations.current.size
    }));

    // Clear existing timeout
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }

    // Set new timeout to process batch
    batchTimeoutRef.current = setTimeout(() => {
      const operations = Array.from(pendingOperations.current.values());
      pendingOperations.current.clear();
      
      setBatchStatus(prev => ({
        ...prev,
        pendingCount: 0
      }));

      processBatch(operations);
    }, batchDelay);

    return operationId;
  }, [batchDelay, processBatch]);

  // Process batch immediately
  const processBatchNow = useCallback(() => {
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }

    const operations = Array.from(pendingOperations.current.values());
    pendingOperations.current.clear();
    
    setBatchStatus(prev => ({
      ...prev,
      pendingCount: 0
    }));

    return processBatch(operations);
  }, [processBatch]);

  // Clear pending operations
  const clearBatch = useCallback(() => {
    pendingOperations.current.clear();
    
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }

    setBatchStatus(prev => ({
      ...prev,
      pendingCount: 0
    }));
  }, []);

  // Reset batch status
  const resetBatch = useCallback(() => {
    clearBatch();
    setBatchStatus({
      isProcessing: false,
      pendingCount: 0,
      completedCount: 0,
      failedCount: 0,
      currentBatch: 0,
      totalBatches: 0
    });
    setBatchErrors([]);
  }, [clearBatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, []);

  return {
    batchStatus,
    batchErrors,
    addToBatch,
    processBatchNow,
    clearBatch,
    resetBatch,
    isProcessing: batchStatus.isProcessing,
    pendingCount: batchStatus.pendingCount
  };
};

export default useBatchOperations; 