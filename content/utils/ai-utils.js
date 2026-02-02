// AI and summarization utilities
// Used by content script for AI-powered text summarization

class AIUtils {
  constructor(cacheManager, storageUtils) {
    this.cacheManager = cacheManager;
    this.storageUtils = storageUtils;
  }

  /**
   * Perform AI summarization with caching and request deduplication
   */
  async summarizeHighlight(highlight) {
    try {
      // Generate cache key
      const cacheKey = this.cacheManager.generateSummaryCacheKey(highlight);

      // Check cache first
      const cachedSummary = this.cacheManager.getCachedSummary(cacheKey);
      if (cachedSummary) {
        return cachedSummary;
      }

      // Check if there's already a request in progress for this text
      if (this.cacheManager.isApiRequestInProgress(cacheKey)) {
        return await this.cacheManager.getApiRequestPromise(cacheKey);
      }

      // Create new request promise
      const requestPromise = this.performSummarizeRequest(highlight, cacheKey);
      this.cacheManager.setApiRequestPromise(cacheKey, requestPromise);

      try {
        const summary = await requestPromise;

        // Cache the result
        this.cacheManager.cacheSummary(cacheKey, summary);

        return summary;
      } finally {
        // Clean up the request queue
        this.cacheManager.removeApiRequestPromise(cacheKey);
      }
    } catch (error) {
      console.error("AI summarization failed:", error);
      throw error;
    }
  }

  /**
   * Perform the actual summarization request via background script
   */
  async performSummarizeRequest(highlight, cacheKey) {
    return await this.storageUtils.performSummarizeRequest(highlight, cacheKey);
  }

  /**
   * Create highlight object for AI processing
   */
  createHighlightForAI(pendingHighlight, pageInfo) {
    return {
      text: pendingHighlight.text,
      url: pageInfo.url,
      title: pageInfo.title,
      domain: pageInfo.domain,
      pageText: pendingHighlight.surroundingText,
    };
  }

  /**
   * Handle summarize button click with UI updates
   */
  async handleSummarizeRequest(pendingHighlight, uiUtils) {
    if (!pendingHighlight) {
      console.error("No pending highlight data to summarize");
      uiUtils.showErrorFeedback("No highlight data found");
      return;
    }

    try {
      // Update button state to show loading
      uiUtils.updateButtonState(
        "highlight-summarize-btn-unique",
        "Summarizing...",
        true
      );

      // Create highlight object for AI service
      const pageInfo = this.storageUtils.getPageInfo();
      const highlight = this.createHighlightForAI(pendingHighlight, pageInfo);

      // Perform summarization
      const summary = await this.summarizeHighlight(highlight);

      // Show summary in popup
      uiUtils.showSummaryPopup(summary);
    } catch (error) {
      console.error("Failed to summarize highlight:", error);
      uiUtils.showErrorFeedback("Failed to summarize: " + error.message);

      // Re-enable the summarize button
      uiUtils.updateButtonState(
        "highlight-summarize-btn-unique",
        "Summarize",
        false
      );
    }
  }

}

window.__highlightSaver = window.__highlightSaver || {};
window.__highlightSaver.AIUtils = AIUtils;
