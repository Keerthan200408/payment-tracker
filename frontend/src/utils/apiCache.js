class APICacheManager {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes default
    this.maxCacheSize = 100;
  }

  generateKey(endpoint, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${endpoint}${sortedParams ? `|${sortedParams}` : ''}`;
  }

  isExpired(timestamp) {
    return Date.now() - timestamp > this.cacheDuration;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheDuration) {
        this.cache.delete(key);
      }
    }

    // If cache is still too large, remove oldest entries
    if (this.cache.size > this.maxCacheSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toDelete = entries.slice(0, entries.length - this.maxCacheSize);
      toDelete.forEach(([key]) => this.cache.delete(key));
    }
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (this.isExpired(cached.timestamp)) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Cleanup periodically
    if (this.cache.size > this.maxCacheSize * 0.8) {
      this.cleanup();
    }
  }

  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  async executeWithCache(key, apiCall, options = {}) {
    const { 
      forceRefresh = false, 
      cacheDuration = this.cacheDuration,
      retries = 3,
      retryDelay = 1000 
    } = options;

    // Check if request is already in progress
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        return cached;
      }
    }

    // Create the request promise
    const requestPromise = this.executeWithRetry(apiCall, retries, retryDelay);
    
    // Store the promise to prevent duplicate requests
    this.pendingRequests.set(key, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache the result
      this.cache.set(key, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    } finally {
      // Clean up the pending request
      this.pendingRequests.delete(key);
    }
  }

  async executeWithRetry(apiCall, retries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }
        
        if (attempt < retries) {
          const backoffDelay = delay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }
    
    throw lastError;
  }

  // Batch operations
  async batchExecute(operations) {
    const results = [];
    const errors = [];
    
    // Execute all operations concurrently
    const promises = operations.map(async (operation, index) => {
      try {
        const result = await this.executeWithCache(
          operation.key,
          operation.apiCall,
          operation.options
        );
        return { index, result, success: true };
      } catch (error) {
        return { index, error, success: false };
      }
    });
    
    const batchResults = await Promise.allSettled(promises);
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          results[result.value.index] = result.value.result;
        } else {
          errors[result.value.index] = result.value.error;
        }
      } else {
        errors[index] = result.reason;
      }
    });
    
    return { results, errors };
  }

  // Prefetch data
  async prefetch(keys) {
    const prefetchPromises = keys.map(key => {
      if (!this.cache.has(key)) {
        return this.executeWithCache(key, () => Promise.resolve(null), { cacheDuration: 0 });
      }
      return Promise.resolve();
    });
    
    await Promise.allSettled(prefetchPromises);
  }

  // Get cache statistics
  getStats() {
    const now = Date.now();
    let expiredCount = 0;
    let validCount = 0;
    
    for (const value of this.cache.values()) {
      if (this.isExpired(value.timestamp)) {
        expiredCount++;
      } else {
        validCount++;
      }
    }
    
    return {
      totalSize: this.cache.size,
      validEntries: validCount,
      expiredEntries: expiredCount,
      pendingRequests: this.pendingRequests.size,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  estimateMemoryUsage() {
    let size = 0;
    for (const [key, value] of this.cache.entries()) {
      size += key.length;
      size += JSON.stringify(value.data).length;
    }
    return size;
  }
}

// Create a singleton instance
const apiCacheManager = new APICacheManager();

export default apiCacheManager; 