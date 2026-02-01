// Storage and Chrome API utilities
// Used by content script for Chrome storage communication

class StorageUtils {
  constructor() {
    this.requestTimeout = 5000; // 5 second default timeout
  }

  /**
   * Send message to background script with timeout
   */
  async sendMessageToBackground(message, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Background script response timeout"));
      }, timeout);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeoutId);

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            reject(new Error("No response from background script"));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Save highlight to storage
   */
  async saveHighlight(highlight) {
    // Check if Chrome APIs are available
    if (typeof chrome === "undefined" || !chrome.runtime) {
      console.error("Chrome runtime not available");
      throw new Error("Chrome extension APIs not available");
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.error("Background script response timeout");
        reject(new Error("Response timeout"));
      }, this.requestTimeout);

      try {
        chrome.runtime.sendMessage(
          {
            action: "saveHighlight",
            highlight: highlight,
          },
          (response) => {
            clearTimeout(timeoutId);

            if (chrome.runtime.lastError) {
              console.error("Chrome runtime error:", chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          }
        );
      } catch (error) {
        clearTimeout(timeoutId);
        console.error("Error sending message:", error);
        reject(error);
      }
    });
  }

  /**
   * Load saved highlights from storage
   */
  async loadHighlights() {
    try {
      // Check if Chrome APIs are available
      if (typeof chrome === "undefined" || !chrome.runtime) {
        console.error("Chrome runtime not available");
        return [];
      }

      const response = await new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage(
            {
              action: "getHighlights",
            },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            }
          );
        } catch (error) {
          reject(error);
        }
      });

      return response.highlights || [];
    } catch (error) {
      console.error("Failed to load saved highlights:", error);
      return [];
    }
  }

  /**
   * Get page information for storing with highlights
   */
  getPageInfo() {
    return {
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
    };
  }

  /**
   * Generate unique ID for highlights using crypto.randomUUID
   */
  generateId() {
    return "highlight_" + crypto.randomUUID();
  }

  /**
   * Generate request ID for API calls
   */
  generateRequestId() {
    return "req_" + crypto.randomUUID();
  }

  /**
   * Sanitize highlight data before sending to background
   */
  sanitizeHighlight(highlight) {
    return {
      text: String(highlight.text || "").substring(0, 1000), // Limit text length
      url: String(highlight.url || "").substring(0, 500), // Limit URL length
      title: String(highlight.title || "").substring(0, 200), // Limit title length
      domain: String(highlight.domain || "").substring(0, 100), // Limit domain length
    };
  }

  /**
   * Create highlight object from selection data
   */
  createHighlightObject(pendingHighlight) {
    const pageInfo = this.getPageInfo();

    return {
      id: this.generateId(),
      text: pendingHighlight.text,
      url: pageInfo.url,
      title: pageInfo.title,
      domain: pageInfo.domain,
      timestamp: pendingHighlight.timestamp || Date.now(),
      pageText: pendingHighlight.surroundingText,
      textPosition: pendingHighlight.textPosition,
    };
  }

  /**
   * Perform AI summarization request
   */
  async performSummarizeRequest(highlight, cacheKey) {
    const requestId = this.generateRequestId();

    try {
      const response = await this.sendMessageToBackground({
        action: "summarizeHighlight",
        requestId: requestId,
        highlight: this.sanitizeHighlight(highlight),
        cacheKey: cacheKey,
      });

      if (response.success) {
        return response.summary;
      } else {
        throw new Error(response.error || "Background script returned error");
      }
    } catch (error) {
      console.error("Background script communication failed:", error);
      throw error;
    }
  }

  /**
   * Check if Chrome extension context is available
   */
  isChromeExtensionContext() {
    return typeof chrome !== "undefined" && chrome.runtime;
  }

}

window.__highlightSaver = window.__highlightSaver || {};
window.__highlightSaver.StorageUtils = StorageUtils;
