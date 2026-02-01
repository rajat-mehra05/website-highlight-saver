// Test the background service worker logic
const fs = require("fs");
const path = require("path");

// Load background.js, strip the auto-instantiation, and evaluate
const bgCode = fs.readFileSync(
  path.join(__dirname, "../background/background.js"),
  "utf-8"
);

const classOnly = bgCode.replace(
  /\/\/ Initialize background service\nnew BackgroundService\(\);/,
  "globalThis.BackgroundService = BackgroundService;"
);

// Use Function constructor to get class into global scope
new Function(classOnly)();
const BackgroundServiceClass = globalThis.BackgroundService;

describe("BackgroundService", () => {
  let service;

  beforeEach(() => {
    chrome.storage._reset();
    chrome.storage.local.get.mockClear();
    chrome.storage.local.set.mockClear();
    chrome.tabs.query.mockImplementation((_, cb) => cb([]));
    service = new BackgroundServiceClass();
  });

  describe("saveHighlight", () => {
    test("saves a highlight to storage", async () => {
      const highlight = {
        id: "h1",
        text: "test text",
        url: "https://example.com",
        timestamp: 123,
      };

      const result = await service.saveHighlight(highlight);
      expect(result).toEqual(highlight);

      const stored = await chrome.storage.local.get(["highlights"]);
      expect(stored.highlights).toHaveLength(1);
      expect(stored.highlights[0].text).toBe("test text");
    });

    test("rejects highlights without required fields", async () => {
      await expect(service.saveHighlight({ text: "no url" })).rejects.toThrow(
        "missing required fields"
      );
    });

    test("enforces max highlights limit", async () => {
      // Pre-populate storage with 1000 highlights
      const existing = Array.from({ length: 1000 }, (_, i) => ({
        id: `h${i}`,
        text: `text${i}`,
        url: "https://example.com",
        timestamp: i,
      }));
      await chrome.storage.local.set({ highlights: existing });

      const newHighlight = {
        id: "new",
        text: "new text",
        url: "https://example.com",
        timestamp: 9999,
      };

      await service.saveHighlight(newHighlight);

      const stored = await chrome.storage.local.get(["highlights"]);
      expect(stored.highlights).toHaveLength(1000);
      expect(stored.highlights[0].id).toBe("new");
    });
  });

  describe("deleteHighlight", () => {
    test("removes highlight by ID", async () => {
      await chrome.storage.local.set({
        highlights: [
          { id: "h1", text: "a", url: "u", timestamp: 1 },
          { id: "h2", text: "b", url: "u", timestamp: 2 },
        ],
      });

      await service.deleteHighlight("h1");

      const stored = await chrome.storage.local.get(["highlights"]);
      expect(stored.highlights).toHaveLength(1);
      expect(stored.highlights[0].id).toBe("h2");
    });

    test("rejects when no ID provided", async () => {
      await expect(service.deleteHighlight(null)).rejects.toThrow(
        "Highlight ID is required"
      );
    });
  });

  describe("importHighlights", () => {
    const validHighlights = [
      { id: "h1", text: "text1", url: "https://a.com", timestamp: 100 },
      { id: "h2", text: "text2", url: "https://b.com", timestamp: 200 },
    ];

    test("validates required fields", async () => {
      const mixed = [
        ...validHighlights,
        { id: 123, text: "bad id type" }, // invalid: non-string id
        { text: "no id", url: "u", timestamp: 1 }, // invalid: missing id
      ];

      const result = await service.importHighlights(mixed);
      expect(result.imported).toBe(2);
      expect(result.skippedInvalid).toBe(2);
    });

    test("replace mode overwrites existing", async () => {
      await chrome.storage.local.set({
        highlights: [{ id: "old", text: "old", url: "u", timestamp: 1 }],
      });

      await service.importHighlights(validHighlights, false);

      const stored = await chrome.storage.local.get(["highlights"]);
      expect(stored.highlights).toHaveLength(2);
      expect(stored.highlights.find((h) => h.id === "old")).toBeUndefined();
    });

    test("merge mode preserves existing and deduplicates", async () => {
      await chrome.storage.local.set({
        highlights: [
          { id: "h1", text: "original", url: "https://a.com", timestamp: 50 },
          { id: "h3", text: "existing", url: "https://c.com", timestamp: 300 },
        ],
      });

      const result = await service.importHighlights(validHighlights, true);

      expect(result.imported).toBe(1); // Only h2 is new
      expect(result.skippedDuplicates).toBe(1); // h1 already exists

      const stored = await chrome.storage.local.get(["highlights"]);
      expect(stored.highlights).toHaveLength(3);
      // h1 should keep original value (not overwritten)
      const h1 = stored.highlights.find((h) => h.id === "h1");
      expect(h1.text).toBe("original");
    });
  });

  describe("rate limiting", () => {
    test("allows requests within limit", () => {
      for (let i = 0; i < 5; i++) {
        expect(() => service._checkRateLimit()).not.toThrow();
      }
    });

    test("blocks requests exceeding limit", () => {
      for (let i = 0; i < 5; i++) {
        service._checkRateLimit();
      }
      expect(() => service._checkRateLimit()).toThrow("Rate limit exceeded");
    });
  });

  describe("storage locking", () => {
    test("serializes concurrent operations", async () => {
      await chrome.storage.local.set({ highlights: [] });

      const h1 = { id: "a", text: "a", url: "u", timestamp: 1 };
      const h2 = { id: "b", text: "b", url: "u", timestamp: 2 };

      // Start both saves concurrently
      const [r1, r2] = await Promise.all([
        service.saveHighlight(h1),
        service.saveHighlight(h2),
      ]);

      const stored = await chrome.storage.local.get(["highlights"]);
      // Both should be present because the lock serialized the operations
      expect(stored.highlights).toHaveLength(2);
    });
  });
});
