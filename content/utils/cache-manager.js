// Cache and memory management utilities
// Used by content script for optimized caching and memory cleanup

class CacheManager {
  constructor() {
    this.textNodeCache = new Map();
    this.summaryCache = new Map();
    this.apiRequestQueue = new Map();
    this.domCache = {
      body: null,
      existingHighlights: null,
      lastCacheTime: 0,
    };

    // Configuration
    this.cacheValidityDuration = 30000; // 30 seconds
    this.maxTextNodesCache = 50;
    this.maxSummaryCacheSize = 20;
    this.maxCacheSize = 100;

    this.memoryUsage = {
      cacheSize: 0,
      lastCleanup: Date.now(),
    };

    this.cleanupInterval = null;
  }

  /**
   * Start periodic memory cleanup
   */
  startMemoryCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Run cleanup every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, 120000);
  }

  /**
   * Perform comprehensive memory cleanup
   */
  performMemoryCleanup() {
    const now = Date.now();

    // Clean up expired caches
    this.cleanupExpiredCaches(now);

    // Limit cache sizes
    this.limitCacheSizes();

    // Clear old DOM references
    this.cleanupDomReferences();

    // Update memory usage tracking
    this.memoryUsage.lastCleanup = now;
    this.memoryUsage.cacheSize =
      this.textNodeCache.size + this.summaryCache.size;

    // Force garbage collection hint (if available)
    if (window.gc) {
      window.gc();
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpiredCaches(now) {
    // Clean up expired text node caches
    for (const [key, value] of this.textNodeCache.entries()) {
      if (
        value.timestamp &&
        now - value.timestamp > this.cacheValidityDuration
      ) {
        this.textNodeCache.delete(key);
      }
    }

    // Clean up expired summary caches
    for (const [key, value] of this.summaryCache.entries()) {
      if (value.timestamp && now - value.timestamp > 300000) {
        // 5 minutes for summaries
        this.summaryCache.delete(key);
      }
    }

    // Clear old DOM cache if expired
    if (now - this.domCache.lastCacheTime > this.cacheValidityDuration) {
      this.domCache.body = null;
      this.domCache.existingHighlights = null;
    }
  }

  /**
   * Limit cache sizes to prevent memory leaks
   */
  limitCacheSizes() {
    this.limitCacheSize(this.textNodeCache, this.maxTextNodesCache);
    this.limitCacheSize(this.summaryCache, this.maxSummaryCacheSize);
  }

  /**
   * Limit specific cache size by removing oldest entries
   */
  limitCacheSize(cache, maxSize) {
    if (cache.size <= maxSize) {
      return;
    }

    const entriesToDelete = cache.size - maxSize;
    const oldestEntries = this.findOldestEntries(cache, entriesToDelete);

    oldestEntries.forEach((key) => {
      cache.delete(key);
    });
  }

  /**
   * Find oldest cache entries for deletion
   */
  findOldestEntries(cache, count) {
    const oldestKeys = [];
    let oldestTimestamp = Infinity;

    // First pass: find the oldest timestamp
    for (const [key, value] of cache.entries()) {
      const timestamp = value.timestamp || 0;
      if (timestamp < oldestTimestamp) {
        oldestTimestamp = timestamp;
      }
    }

    // Second pass: collect entries with the oldest timestamp
    for (const [key, value] of cache.entries()) {
      const timestamp = value.timestamp || 0;
      if (timestamp === oldestTimestamp) {
        oldestKeys.push(key);
        if (oldestKeys.length >= count) {
          break;
        }
      }
    }

    // If we need more entries, find the next oldest timestamp
    if (oldestKeys.length < count) {
      let nextOldestTimestamp = Infinity;

      for (const [key, value] of cache.entries()) {
        const timestamp = value.timestamp || 0;
        if (timestamp > oldestTimestamp && timestamp < nextOldestTimestamp) {
          nextOldestTimestamp = timestamp;
        }
      }

      for (const [key, value] of cache.entries()) {
        const timestamp = value.timestamp || 0;
        if (timestamp === nextOldestTimestamp) {
          oldestKeys.push(key);
          if (oldestKeys.length >= count) {
            break;
          }
        }
      }
    }

    return oldestKeys.slice(0, count);
  }

  /**
   * Clean up DOM references that are no longer valid
   */
  cleanupDomReferences() {
    // This will be used by the main script to clean up saved highlights
    // that are no longer in the DOM
  }

  /**
   * Update DOM cache with fresh data
   */
  updateDomCache() {
    const now = Date.now();
    if (now - this.domCache.lastCacheTime > this.cacheValidityDuration) {
      this.domCache.body = document.body;
      this.domCache.existingHighlights = document.querySelectorAll(
        ".highlight-saver-saved"
      );
      this.domCache.lastCacheTime = now;
    }
  }

  /**
   * Get cached text nodes
   */
  getCachedTextNodes(cacheKey) {
    if (this.textNodeCache.has(cacheKey)) {
      const cached = this.textNodeCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheValidityDuration) {
        return cached.nodes;
      }
    }
    return null;
  }

  /**
   * Cache text nodes
   */
  cacheTextNodes(cacheKey, nodes) {
    this.textNodeCache.set(cacheKey, {
      nodes: nodes,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached summary
   */
  getCachedSummary(cacheKey) {
    if (this.summaryCache.has(cacheKey)) {
      const cached = this.summaryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) {
        // 5 minutes cache
        return cached.summary;
      }
    }
    return null;
  }

  /**
   * Cache summary
   */
  cacheSummary(cacheKey, summary) {
    this.summaryCache.set(cacheKey, {
      summary: summary,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if API request is in progress
   */
  isApiRequestInProgress(cacheKey) {
    return this.apiRequestQueue.has(cacheKey);
  }

  /**
   * Get API request promise
   */
  getApiRequestPromise(cacheKey) {
    return this.apiRequestQueue.get(cacheKey);
  }

  /**
   * Set API request promise
   */
  setApiRequestPromise(cacheKey, promise) {
    this.apiRequestQueue.set(cacheKey, promise);
  }

  /**
   * Remove API request promise
   */
  removeApiRequestPromise(cacheKey) {
    this.apiRequestQueue.delete(cacheKey);
  }

  /**
   * Generate cache key for summaries
   */
  generateSummaryCacheKey(highlight) {
    const text = highlight.text.substring(0, 100);
    return `${text}_${highlight.url}_${highlight.title}`.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    );
  }

  /**
   * Complete cleanup - clear all caches
   */
  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.textNodeCache.clear();
    this.summaryCache.clear();
    this.apiRequestQueue.clear();

    this.domCache = {
      body: null,
      existingHighlights: null,
      lastCacheTime: 0,
    };
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    return {
      textNodeCacheSize: this.textNodeCache.size,
      summaryCacheSize: this.summaryCache.size,
      apiRequestQueueSize: this.apiRequestQueue.size,
      lastCleanup: this.memoryUsage.lastCleanup,
      totalCacheSize: this.memoryUsage.cacheSize,
    };
  }
}

// Namespaced under __highlightSaver — no direct window.ClassName export
window.__highlightSaver = window.__highlightSaver || {};
window.__highlightSaver.CacheManager = CacheManager;
