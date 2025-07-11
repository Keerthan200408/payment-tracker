import { useEffect, useRef, useCallback } from 'react';

const usePerformanceMonitor = (componentName, options = {}) => {
  const {
    trackRenders = true,
    trackApiCalls = true,
    trackMemoryUsage = false,
    logToConsole = process.env.NODE_ENV === 'development'
  } = options;

  const renderCount = useRef(0);
  const lastRenderTime = useRef(performance.now());
  const apiCallTimes = useRef(new Map());
  const memoryUsage = useRef(null);

  // Track component renders
  useEffect(() => {
    if (trackRenders) {
      renderCount.current += 1;
      const currentTime = performance.now();
      const timeSinceLastRender = currentTime - lastRenderTime.current;
      
      if (logToConsole) {
        console.log(`[Performance] ${componentName} render #${renderCount.current} (${timeSinceLastRender.toFixed(2)}ms since last render)`);
      }
      
      lastRenderTime.current = currentTime;
    }
  });

  // Track API call performance
  const trackApiCall = useCallback((apiName, startTime) => {
    if (!trackApiCalls) return;
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    if (!apiCallTimes.current.has(apiName)) {
      apiCallTimes.current.set(apiName, []);
    }
    
    apiCallTimes.current.get(apiName).push(duration);
    
    if (logToConsole) {
      console.log(`[Performance] ${componentName} API call: ${apiName} (${duration.toFixed(2)}ms)`);
    }
  }, [componentName, trackApiCalls, logToConsole]);

  // Track memory usage (if available)
  useEffect(() => {
    if (trackMemoryUsage && 'memory' in performance) {
      const updateMemoryUsage = () => {
        memoryUsage.current = {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        };
      };
      
      updateMemoryUsage();
      const interval = setInterval(updateMemoryUsage, 5000); // Check every 5 seconds
      
      return () => clearInterval(interval);
    }
  }, [trackMemoryUsage]);

  // Get performance statistics
  const getStats = useCallback(() => {
    const stats = {
      componentName,
      renderCount: renderCount.current,
      apiCalls: {}
    };

    // Calculate API call statistics
    for (const [apiName, times] of apiCallTimes.current.entries()) {
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      stats.apiCalls[apiName] = {
        count: times.length,
        averageTime: avgTime,
        minTime,
        maxTime,
        totalTime: times.reduce((sum, time) => sum + time, 0)
      };
    }

    if (memoryUsage.current) {
      stats.memoryUsage = memoryUsage.current;
    }

    return stats;
  }, [componentName]);

  // Reset performance tracking
  const resetStats = useCallback(() => {
    renderCount.current = 0;
    apiCallTimes.current.clear();
    lastRenderTime.current = performance.now();
  }, []);

  return {
    trackApiCall,
    getStats,
    resetStats,
    renderCount: renderCount.current
  };
};

export default usePerformanceMonitor; 