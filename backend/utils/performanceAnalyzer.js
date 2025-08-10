const logger = require('./logger');

class PerformanceAnalyzer {
  constructor() {
    this.metrics = {
      dbQueries: [],
      apiCalls: [],
      slowQueries: [],
      errorRates: new Map(),
    };
  }

  /**
   * Track database query performance
   */
  async trackDbQuery(operation, collection, query, callback) {
    const startTime = Date.now();
    const queryId = `${operation}_${collection}_${Date.now()}`;
    
    try {
      const result = await callback();
      const duration = Date.now() - startTime;
      
      const queryMetric = {
        id: queryId,
        operation,
        collection,
        duration,
        timestamp: new Date().toISOString(),
        success: true,
        querySize: JSON.stringify(query).length,
      };
      
      this.metrics.dbQueries.push(queryMetric);
      
      // Flag slow queries (>500ms)
      if (duration > 500) {
        this.metrics.slowQueries.push({
          ...queryMetric,
          query: JSON.stringify(query, null, 2),
        });
        logger.warn(`Slow query detected: ${operation} on ${collection} took ${duration}ms`);
      }
      
      // Keep only last 1000 queries
      if (this.metrics.dbQueries.length > 1000) {
        this.metrics.dbQueries.shift();
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.dbQueries.push({
        id: queryId,
        operation,
        collection,
        duration,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Track API endpoint performance
   */
  trackApiCall(req, res, next) {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(data) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      
      const apiMetric = {
        method: req.method,
        endpoint: req.route?.path || req.path,
        statusCode,
        duration,
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        success: statusCode < 400,
      };

      performanceAnalyzer.metrics.apiCalls.push(apiMetric);
      
      // Track error rates
      const endpointKey = `${req.method}_${req.route?.path || req.path}`;
      if (!performanceAnalyzer.metrics.errorRates.has(endpointKey)) {
        performanceAnalyzer.metrics.errorRates.set(endpointKey, { total: 0, errors: 0 });
      }
      const errorStat = performanceAnalyzer.metrics.errorRates.get(endpointKey);
      errorStat.total++;
      if (statusCode >= 400) errorStat.errors++;
      
      // Flag slow API calls (>2000ms)
      if (duration > 2000) {
        logger.warn(`Slow API call detected: ${req.method} ${req.path} took ${duration}ms`);
      }
      
      // Keep only last 1000 API calls
      if (performanceAnalyzer.metrics.apiCalls.length > 1000) {
        performanceAnalyzer.metrics.apiCalls.shift();
      }
      
      originalSend.call(this, data);
    };
    
    next();
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Recent DB queries (last hour)
    const recentDbQueries = this.metrics.dbQueries.filter(
      q => new Date(q.timestamp).getTime() > oneHourAgo
    );
    
    // Recent API calls (last hour)
    const recentApiCalls = this.metrics.apiCalls.filter(
      a => new Date(a.timestamp).getTime() > oneHourAgo
    );
    
    // Calculate averages
    const avgDbQueryTime = recentDbQueries.length > 0 
      ? recentDbQueries.reduce((sum, q) => sum + q.duration, 0) / recentDbQueries.length
      : 0;
      
    const avgApiResponseTime = recentApiCalls.length > 0
      ? recentApiCalls.reduce((sum, a) => sum + a.duration, 0) / recentApiCalls.length
      : 0;
    
    // Top slow queries
    const topSlowQueries = this.metrics.slowQueries
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
    
    // Error rates
    const errorRateStats = {};
    for (const [endpoint, stats] of this.metrics.errorRates.entries()) {
      errorRateStats[endpoint] = {
        total: stats.total,
        errors: stats.errors,
        errorRate: stats.total > 0 ? (stats.errors / stats.total * 100).toFixed(2) + '%' : '0%',
      };
    }
    
    return {
      summary: {
        totalDbQueries: recentDbQueries.length,
        totalApiCalls: recentApiCalls.length,
        avgDbQueryTime: Math.round(avgDbQueryTime),
        avgApiResponseTime: Math.round(avgApiResponseTime),
        slowQueriesCount: this.metrics.slowQueries.length,
      },
      recentStats: {
        dbQueries: recentDbQueries.slice(-20), // Last 20 DB queries
        apiCalls: recentApiCalls.slice(-20),   // Last 20 API calls
      },
      slowQueries: topSlowQueries,
      errorRates: errorRateStats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clear old metrics to prevent memory leaks
   */
  cleanup() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    this.metrics.dbQueries = this.metrics.dbQueries.filter(
      q => new Date(q.timestamp).getTime() > oneWeekAgo
    );
    
    this.metrics.apiCalls = this.metrics.apiCalls.filter(
      a => new Date(a.timestamp).getTime() > oneWeekAgo
    );
    
    this.metrics.slowQueries = this.metrics.slowQueries.filter(
      q => new Date(q.timestamp).getTime() > oneWeekAgo
    );
    
    logger.info('Performance metrics cleaned up');
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const stats = this.getStats();
    
    return {
      performanceReport: {
        generatedAt: stats.timestamp,
        summary: stats.summary,
        recommendations: this.generateRecommendations(stats),
        criticalIssues: this.identifyCriticalIssues(stats),
        trends: this.analyzeTrends(),
      }
    };
  }

  generateRecommendations(stats) {
    const recommendations = [];
    
    if (stats.summary.avgDbQueryTime > 300) {
      recommendations.push({
        type: 'database',
        priority: 'high',
        issue: 'High average database query time',
        suggestion: 'Consider adding database indexes on frequently queried fields',
        currentValue: `${stats.summary.avgDbQueryTime}ms`,
        targetValue: '<300ms'
      });
    }
    
    if (stats.summary.avgApiResponseTime > 1500) {
      recommendations.push({
        type: 'api',
        priority: 'medium',
        issue: 'High API response time',
        suggestion: 'Optimize endpoint logic and consider caching',
        currentValue: `${stats.summary.avgApiResponseTime}ms`,
        targetValue: '<1500ms'
      });
    }
    
    if (stats.summary.slowQueriesCount > 10) {
      recommendations.push({
        type: 'database',
        priority: 'high',
        issue: 'Multiple slow queries detected',
        suggestion: 'Review and optimize the slowest queries listed in the report',
        currentValue: `${stats.summary.slowQueriesCount} slow queries`,
        targetValue: '<5 slow queries'
      });
    }
    
    // Check error rates
    for (const [endpoint, errorStats] of Object.entries(stats.errorRates)) {
      const errorRate = parseFloat(errorStats.errorRate);
      if (errorRate > 5) {
        recommendations.push({
          type: 'reliability',
          priority: 'high',
          issue: `High error rate on ${endpoint}`,
          suggestion: 'Investigate and fix the root cause of errors',
          currentValue: errorStats.errorRate,
          targetValue: '<5%'
        });
      }
    }
    
    return recommendations;
  }

  identifyCriticalIssues(stats) {
    const issues = [];
    
    // Critical response time
    if (stats.summary.avgApiResponseTime > 3000) {
      issues.push({
        type: 'critical_performance',
        message: 'Average API response time exceeds 3 seconds',
        impact: 'Severe user experience degradation',
        urgency: 'immediate'
      });
    }
    
    // Critical error rate
    for (const [endpoint, errorStats] of Object.entries(stats.errorRates)) {
      const errorRate = parseFloat(errorStats.errorRate);
      if (errorRate > 15) {
        issues.push({
          type: 'critical_reliability',
          message: `${endpoint} has error rate above 15%`,
          impact: 'Service reliability compromised',
          urgency: 'immediate'
        });
      }
    }
    
    return issues;
  }

  analyzeTrends() {
    // Simple trend analysis over the collected data
    const recentCalls = this.metrics.apiCalls.slice(-100);
    if (recentCalls.length < 50) return { insufficient_data: true };
    
    const firstHalf = recentCalls.slice(0, Math.floor(recentCalls.length / 2));
    const secondHalf = recentCalls.slice(Math.floor(recentCalls.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((sum, call) => sum + call.duration, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, call) => sum + call.duration, 0) / secondHalf.length;
    
    const trend = secondHalfAvg > firstHalfAvg ? 'increasing' : 'decreasing';
    const changePercent = Math.abs((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(1);
    
    return {
      responseTime: {
        trend,
        changePercent: `${changePercent}%`,
        direction: secondHalfAvg > firstHalfAvg ? 'worse' : 'better'
      }
    };
  }
}

// Singleton instance
const performanceAnalyzer = new PerformanceAnalyzer();

// Auto cleanup every hour
setInterval(() => {
  performanceAnalyzer.cleanup();
}, 60 * 60 * 1000);

module.exports = performanceAnalyzer;
