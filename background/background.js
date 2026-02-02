importScripts("prompts.js");

// Background service worker for handling storage and communication
class BackgroundService {
  constructor() {
    // Storage operation lock to prevent TOCTOU race conditions
    this._storageLock = Promise.resolve();
    // Rate limiting for OpenAI API calls
    this._apiCallTimestamps = [];

    // Configuration constants (mirrors content/utils/constants.js for the service worker context)
    this.RATE_LIMIT_MAX = 5;
    this.RATE_LIMIT_WINDOW = 60000;
    this.MAX_HIGHLIGHTS = 1000;
    this.MAX_TEXT_LENGTH = 1000;
    this.MAX_URL_LENGTH = 500;
    this.MAX_TITLE_LENGTH = 200;
    this.MAX_DOMAIN_LENGTH = 100;
    this.SUMMARY_CACHE_TTL = 300000;
    this.MAX_SUMMARY_CACHE = 50;
    this.init();
  }

  /**
   * Acquire a lock for storage operations to prevent race conditions.
   * All storage read-modify-write operations go through this lock.
   */
  _withStorageLock(fn) {
    let release;
    const newLock = new Promise((resolve) => {
      release = resolve;
    });
    const previous = this._storageLock;
    this._storageLock = newLock;
    return previous.then(() => fn()).finally(release);
  }

  /**
   * Check rate limit before making an API call.
   * Throws if rate limit exceeded.
   */
  _checkRateLimit() {
    const now = Date.now();
    // Remove timestamps outside the window
    this._apiCallTimestamps = this._apiCallTimestamps.filter(
      (t) => now - t < this.RATE_LIMIT_WINDOW
    );
    if (this._apiCallTimestamps.length >= this.RATE_LIMIT_MAX) {
      const oldestCall = this._apiCallTimestamps[0];
      const waitTime = Math.ceil((this.RATE_LIMIT_WINDOW - (now - oldestCall)) / 1000);
      throw new Error(
        `Rate limit exceeded. Please wait ${waitTime} seconds before requesting another summary.`
      );
    }
    this._apiCallTimestamps.push(now);
  }

  init() {
    // Listen for messages from content scripts and popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case "saveHighlight": {
          const savedHighlight = await this.saveHighlight(request.highlight);
          sendResponse({ success: true, highlight: savedHighlight });
          break;
        }

        case "getHighlights": {
          const highlights = await this.getHighlights();
          sendResponse({ success: true, highlights });
          break;
        }

        case "deleteHighlight": {
          await this.deleteHighlight(request.id);
          sendResponse({ success: true });
          break;
        }

        case "clearAllHighlights": {
          await this.clearAllHighlights();
          sendResponse({ success: true });
          break;
        }

        case "exportHighlights": {
          const exportData = await this.exportHighlights();
          sendResponse({ success: true, data: exportData });
          break;
        }

        case "importHighlights": {
          const result = await this.importHighlights(request.highlights, request.merge);
          sendResponse({ success: true, ...result });
          break;
        }

        case "summarizeHighlight": {
          const summary = await this.summarizeHighlight(request);
          sendResponse({ success: true, summary });
          break;
        }

        case "saveConfig": {
          await chrome.storage.local.set({ aiConfig: request.config });
          sendResponse({ success: true });
          break;
        }

        case "getConfig": {
          const config = await this.getConfig();
          sendResponse({ success: true, config });
          break;
        }

        default:
          console.warn("Unknown action:", request.action);
          sendResponse({ success: false, error: "Unknown action" });
      }
    } catch (error) {
      console.error("Background service error:", error);
      sendResponse({
        success: false,
        error: error.message || "An unexpected error occurred",
      });
    }
  }

  async saveHighlight(highlight) {
    if (!highlight || !highlight.text || !highlight.url) {
      throw new Error("Invalid highlight data: missing required fields");
    }

    return this._withStorageLock(async () => {
      const result = await chrome.storage.local.get(["highlights"]);
      const highlights = result.highlights || [];

      if (!highlight.timestamp) {
        highlight.timestamp = Date.now();
      }

      highlights.unshift(highlight);

      if (highlights.length > this.MAX_HIGHLIGHTS) {
        highlights.splice(this.MAX_HIGHLIGHTS);
      }

      await chrome.storage.local.set({ highlights });
      this.notifyTabsAboutUpdate();
      return highlight;
    });
  }

  async getHighlights() {
    const result = await chrome.storage.local.get(["highlights"]);
    return result.highlights || [];
  }

  async deleteHighlight(id) {
    if (!id) {
      throw new Error("Highlight ID is required");
    }

    return this._withStorageLock(async () => {
      const result = await chrome.storage.local.get(["highlights"]);
      const highlights = result.highlights || [];
      const filtered = highlights.filter((h) => h.id !== id);
      await chrome.storage.local.set({ highlights: filtered });
      this.notifyTabsAboutUpdate();
      return true;
    });
  }

  async clearAllHighlights() {
    return this._withStorageLock(async () => {
      await chrome.storage.local.set({ highlights: [] });
      this.notifyTabsAboutUpdate();
      return true;
    });
  }

  async exportHighlights() {
    const highlights = await this.getHighlights();
    return {
      highlights,
      exportDate: new Date().toISOString(),
      version: "1.0.0",
    };
  }

  async importHighlights(importData, merge = false) {
    let incoming = [];

    if (Array.isArray(importData)) {
      incoming = importData;
    } else if (
      importData &&
      importData.highlights &&
      Array.isArray(importData.highlights)
    ) {
      incoming = importData.highlights;
    } else {
      throw new Error(
        "Invalid import format - expected array or object with highlights property"
      );
    }

    // Validate each highlight has required fields with correct types, non-empty values, and sane sizes
    const validHighlights = incoming.filter(
      (h) =>
        h &&
        typeof h === "object" &&
        typeof h.id === "string" &&
        h.id.length > 0 &&
        typeof h.text === "string" &&
        h.text.length > 0 &&
        h.text.length <= this.MAX_TEXT_LENGTH &&
        typeof h.url === "string" &&
        h.url.length > 0 &&
        h.url.length <= this.MAX_URL_LENGTH &&
        typeof h.timestamp === "number" &&
        h.timestamp > 0
    );

    const skipped = incoming.length - validHighlights.length;
    if (skipped > 0) {
      console.warn(`Filtered out ${skipped} invalid highlights during import`);
    }

    return this._withStorageLock(async () => {
      if (merge) {
        // Merge: add new highlights, skip duplicates by ID
        const result = await chrome.storage.local.get(["highlights"]);
        const existing = result.highlights || [];
        const existingIds = new Set(existing.map((h) => h.id));
        const newHighlights = validHighlights.filter(
          (h) => !existingIds.has(h.id)
        );
        const merged = [...newHighlights, ...existing];

        if (merged.length > this.MAX_HIGHLIGHTS) {
          merged.splice(this.MAX_HIGHLIGHTS);
        }

        await chrome.storage.local.set({ highlights: merged });
        this.notifyTabsAboutUpdate();
        return { imported: newHighlights.length, skippedDuplicates: validHighlights.length - newHighlights.length, skippedInvalid: skipped };
      } else {
        // Replace mode
        await chrome.storage.local.set({ highlights: validHighlights });
        this.notifyTabsAboutUpdate();
        return { imported: validHighlights.length, skippedInvalid: skipped };
      }
    });
  }

  notifyTabsAboutUpdate() {
    chrome.tabs.query({}, (tabs) => {
      if (!tabs) return;
      tabs.forEach((tab) => {
        if (!tab.id) return;
        chrome.tabs
          .sendMessage(tab.id, { action: "highlightsUpdated" })
          .catch(() => {
            // Ignore errors for tabs without content scripts
          });
      });
    });
  }

  handleInstallation(details) {
    if (details.reason === "install") {
      chrome.storage.local.set({ highlights: [] });
    } else if (details.reason === "update") {
      this.performMigrationIfNeeded();
    }
  }

  async performMigrationIfNeeded() {
    try {
      const result = await chrome.storage.local.get(["highlights", "version"]);
      const currentVersion = chrome.runtime.getManifest().version;

      if (!result.version || result.version !== currentVersion) {
        await chrome.storage.local.set({ version: currentVersion });
      }
    } catch (error) {
      console.error("Migration failed:", error);
    }
  }

  // Summarize highlight functionality
  async summarizeHighlight(request) {
    if (!request.requestId || !request.highlight || !request.cacheKey) {
      throw new Error("Invalid request: missing required fields");
    }

    // Check cache first
    const cachedSummary = await this.getCachedSummary(request.cacheKey);
    if (cachedSummary) {
      return cachedSummary;
    }

    // Rate limit check
    this._checkRateLimit();

    const sanitizedHighlight = this.sanitizeHighlight(request.highlight);
    const config = await this.getConfig();
    const summary = await this.callOpenAI(sanitizedHighlight, config);
    await this.cacheSummary(request.cacheKey, summary);

    return summary;
  }

  async getCachedSummary(cacheKey) {
    try {
      const result = await chrome.storage.local.get(["summaryCache"]);
      const cache = result.summaryCache || {};
      const cached = cache[cacheKey];
      if (cached && Date.now() - cached.timestamp < this.SUMMARY_CACHE_TTL) {
        return cached.summary;
      }
      return null;
    } catch (error) {
      console.error("Failed to get cached summary:", error);
      return null;
    }
  }

  async cacheSummary(cacheKey, summary) {
    try {
      const result = await chrome.storage.local.get(["summaryCache"]);
      const cache = result.summaryCache || {};

      const cacheKeys = Object.keys(cache);
      if (cacheKeys.length >= this.MAX_SUMMARY_CACHE) {
        const sortedKeys = cacheKeys.sort(
          (a, b) => (cache[a].timestamp || 0) - (cache[b].timestamp || 0)
        );
        const toDelete = sortedKeys.slice(0, cacheKeys.length - (this.MAX_SUMMARY_CACHE - 1));
        toDelete.forEach((key) => delete cache[key]);
      }

      cache[cacheKey] = {
        summary: summary,
        timestamp: Date.now(),
      };

      await chrome.storage.local.set({ summaryCache: cache });
    } catch (error) {
      console.error("Failed to cache summary:", error);
    }
  }

  sanitizeHighlight(highlight) {
    if (!highlight || typeof highlight !== "object") {
      throw new Error("Invalid highlight data");
    }

    return {
      text: String(highlight.text || "").substring(0, this.MAX_TEXT_LENGTH),
      url: String(highlight.url || "").substring(0, this.MAX_URL_LENGTH),
      title: String(highlight.title || "").substring(0, this.MAX_TITLE_LENGTH),
      domain: String(highlight.domain || "").substring(0, this.MAX_DOMAIN_LENGTH),
    };
  }

  async getConfig() {
    try {
      // Load config from chrome.storage.local (set via settings UI or initial setup)
      const result = await chrome.storage.local.get(["aiConfig"]);
      let config = result.aiConfig || {};

      // If storage is empty, try loading from .env.config bundled with the extension
      if (!config.OPENAI_API_KEY) {
        config = await this.loadConfigFromFile();
        if (config.OPENAI_API_KEY) {
          await chrome.storage.local.set({ aiConfig: config });
        }
      }

      if (!config.OPENAI_API_KEY) {
        throw new Error(
          "OpenAI API key not configured. Please set it in the extension settings."
        );
      }

      return config;
    } catch (error) {
      console.error("Failed to load config:", error);
      throw new Error("Configuration error: " + error.message);
    }
  }

  async loadConfigFromFile() {
    try {
      const url = chrome.runtime.getURL(".env.config");
      const response = await fetch(url);
      if (!response.ok) return {};

      const text = await response.text();
      const config = {};
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        if (key && value) config[key] = value;
      }
      return config;
    } catch (error) {
      console.error("Failed to load .env.config:", error);
      return {};
    }
  }

  async callOpenAI(highlight, config) {
    const highlightContent = [
      `Highlight: "${highlight.text}"`,
      `Page Title: "${highlight.title}"`,
      `Domain: "${highlight.domain}"`,
      `Context: "${highlight.pageText || ""}"`,
    ].join("\n");

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: config.AI_MODEL || "gpt-4o",
          messages: [
            { role: "system", content: PROMPTS.SYSTEM_SUMMARY },
            { role: "user", content: highlightContent },
          ],
          max_tokens: parseInt(config.AI_MAX_TOKENS) || 150,
          temperature: parseFloat(config.AI_TEMPERATURE) || 0.8,
        }),
      }
    );

    if (!response.ok) {
      // Log the full error internally but show a generic message to the user
      const errorData = await response.json().catch(() => ({}));
      console.error("OpenAI API error details:", response.status, errorData);
      throw new Error("Summarization service returned an error. Please try again later.");
    }

    const data = await response.json();

    if (
      !Array.isArray(data.choices) ||
      data.choices.length === 0 ||
      !data.choices[0].message ||
      typeof data.choices[0].message.content !== "string" ||
      data.choices[0].message.content.trim().length === 0
    ) {
      throw new Error("Invalid response from summarization service: unexpected response format.");
    }

    return data.choices[0].message.content.trim();
  }
}

// Initialize background service
new BackgroundService();