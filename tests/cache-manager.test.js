// Load the source file
require("../content/utils/constants.js");
require("../content/utils/cache-manager.js");

const CacheManager = window.__highlightSaver.CacheManager;

describe("CacheManager", () => {
  let cacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  afterEach(() => {
    cacheManager.cleanup();
  });

  describe("text node caching", () => {
    test("caches and retrieves text nodes", () => {
      const nodes = [document.createTextNode("test")];
      cacheManager.cacheTextNodes("key1", nodes);
      const cached = cacheManager.getCachedTextNodes("key1");
      expect(cached).toBe(nodes);
    });

    test("returns null for expired cache", () => {
      const nodes = [document.createTextNode("test")];
      cacheManager.cacheTextNodes("key1", nodes);

      // Manually expire the cache entry
      const entry = cacheManager.textNodeCache.get("key1");
      entry.timestamp = Date.now() - 31000; // Older than 30s TTL

      const cached = cacheManager.getCachedTextNodes("key1");
      expect(cached).toBeNull();
    });

    test("returns null for missing cache key", () => {
      const cached = cacheManager.getCachedTextNodes("nonexistent");
      expect(cached).toBeNull();
    });
  });

  describe("summary caching", () => {
    test("caches and retrieves summaries", () => {
      cacheManager.cacheSummary("sum1", "This is a summary");
      const cached = cacheManager.getCachedSummary("sum1");
      expect(cached).toBe("This is a summary");
    });

    test("returns null for expired summary", () => {
      cacheManager.cacheSummary("sum1", "old summary");
      const entry = cacheManager.summaryCache.get("sum1");
      entry.timestamp = Date.now() - 310000; // Older than 5min TTL

      const cached = cacheManager.getCachedSummary("sum1");
      expect(cached).toBeNull();
    });
  });

  describe("API request deduplication", () => {
    test("tracks in-progress API requests", () => {
      const promise = Promise.resolve("result");
      cacheManager.setApiRequestPromise("req1", promise);

      expect(cacheManager.isApiRequestInProgress("req1")).toBe(true);
      expect(cacheManager.getApiRequestPromise("req1")).toBe(promise);
    });

    test("removes completed API requests", () => {
      cacheManager.setApiRequestPromise("req1", Promise.resolve());
      cacheManager.removeApiRequestPromise("req1");

      expect(cacheManager.isApiRequestInProgress("req1")).toBe(false);
    });
  });

  describe("generateSummaryCacheKey", () => {
    test("generates deterministic keys", () => {
      const highlight = { text: "hello world", url: "https://example.com", title: "Test" };
      const key1 = cacheManager.generateSummaryCacheKey(highlight);
      const key2 = cacheManager.generateSummaryCacheKey(highlight);
      expect(key1).toBe(key2);
    });

    test("generates different keys for different highlights", () => {
      const h1 = { text: "hello", url: "https://a.com", title: "A" };
      const h2 = { text: "world", url: "https://b.com", title: "B" };
      const key1 = cacheManager.generateSummaryCacheKey(h1);
      const key2 = cacheManager.generateSummaryCacheKey(h2);
      expect(key1).not.toBe(key2);
    });
  });

  describe("memory cleanup", () => {
    test("cleanup clears all caches", () => {
      cacheManager.cacheTextNodes("key1", []);
      cacheManager.cacheSummary("sum1", "test");
      cacheManager.setApiRequestPromise("req1", Promise.resolve());

      cacheManager.cleanup();

      expect(cacheManager.textNodeCache.size).toBe(0);
      expect(cacheManager.summaryCache.size).toBe(0);
      expect(cacheManager.apiRequestQueue.size).toBe(0);
    });

    test("performMemoryCleanup removes expired entries", () => {
      cacheManager.cacheTextNodes("old_key", []);
      const entry = cacheManager.textNodeCache.get("old_key");
      entry.timestamp = Date.now() - 60000; // Make it old

      cacheManager.cacheTextNodes("new_key", []);

      cacheManager.performMemoryCleanup();

      expect(cacheManager.textNodeCache.has("old_key")).toBe(false);
      expect(cacheManager.textNodeCache.has("new_key")).toBe(true);
    });
  });
});
