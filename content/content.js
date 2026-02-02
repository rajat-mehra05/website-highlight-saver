// Content script for text highlighting functionality
// Refactored to use modular utilities

class HighlightSaver {
  constructor() {
    // Resolve utility classes from namespace to avoid global pollution
    const ns = window.__highlightSaver;
    this.cacheManager = new ns.CacheManager();
    this.domUtils = new ns.DOMUtils();
    this.rangeUtils = new ns.RangeUtils();
    this.eventUtils = new ns.EventUtils();
    this.uiUtils = new ns.UIUtils();
    this.storageUtils = new ns.StorageUtils();
    this.aiUtils = new ns.AIUtils(this.cacheManager, this.storageUtils);

    // State management
    this.savedHighlights = new Map();
    this.pendingHighlight = null;
    this.savedHighlightsData = [];
    this.isSummarizing = false;

    this.init();
  }

  async init() {
    try {
      this.bindEvents();

      // Check if we're in a valid context for Chrome extension
      if (this.storageUtils.isChromeExtensionContext()) {
        await this.loadSavedHighlights();
        this.markExistingHighlights();
      } else {
        console.warn(
          "Chrome extension APIs not available, running in limited mode"
        );
        this.savedHighlightsData = [];
      }

      // Start periodic memory cleanup
      this.cacheManager.startMemoryCleanup();
    } catch (error) {
      console.error("Error during initialization:", error);
      this.savedHighlightsData = [];
    }
  }

  bindEvents() {
    // Create event handlers
    const handlers = {
      onTextSelection: (event) => this.handleTextSelection(event),
      onOutsideClick: this.eventUtils.createOutsideClickHandler(this.uiUtils),
      onVisibilityChange: this.eventUtils.createVisibilityChangeHandler(() => {
        this.markExistingHighlights();
      }),
      onUrlFragment: () => this.handleUrlFragment(),
      onCleanup: () => this.cleanup(),
      onMessage: this.eventUtils.createMessageHandler({
        cleanup: () => this.cleanup(),
        highlightsUpdated: () => this.refreshHighlights(),
        scrollToHighlight: (text, textPosition, highlightId) =>
          this.scrollToAndHighlightText(text, textPosition, highlightId),
      }),
    };

    // Bind all events using EventUtils
    this.eventUtils.bindHighlightEvents(handlers);
  }

  handleTextSelection(event) {
    this.eventUtils.handleTextSelection(
      event,
      (selection, selectedText, event) => {
        // Don't recreate the popup while summarization is in progress
        if (this.isSummarizing) return;

        // Remove existing popup
        this.uiUtils.removePopup();

        if (selectedText.length > 0 && selectedText.length < CONSTANTS.MAX_TEXT_LENGTH) {
          // Store the selection data immediately before it gets cleared
          this.storeSelectionData(selection, selectedText);
          // Add small delay to ensure DOM is ready
          setTimeout(() => {
            this.showSavePopup(selectedText, event);
          }, 50);
        } else if (selectedText.length === 0) {
          this.pendingHighlight = null;
        }
      }
    );
  }

  storeSelectionData(selection, selectedText) {
    const pageInfo = this.storageUtils.getPageInfo();
    const selectionData = this.rangeUtils.storeSelectionData(
      selection,
      selectedText
    );

    this.pendingHighlight = {
      ...selectionData,
      pageInfo: pageInfo,
    };
  }

  showSavePopup(selectedText, event) {
    const handlers = {
      save: () => this.handleSaveClick(),
      cancel: () => this.handleCancelClick(),
      summarize: () => this.handleSummarizeClick(),
    };

    this.uiUtils.showSavePopup(selectedText, event, handlers);
  }

  handleSaveClick() {
    if (this.pendingHighlight) {
      this.saveHighlightFromPending();
    } else {
      console.error("No pending highlight data to save");
      this.uiUtils.showErrorFeedback("No highlight data found");
    }
  }

  handleCancelClick() {
    this.pendingHighlight = null;
    this.uiUtils.removePopup();

    // Clear text selection
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }

  async handleSummarizeClick() {
    this.isSummarizing = true;
    try {
      await this.aiUtils.handleSummarizeRequest(
        this.pendingHighlight,
        this.uiUtils
      );
    } finally {
      this.isSummarizing = false;
    }
  }

  async saveHighlightFromPending() {
    if (!this.pendingHighlight) {
      console.error("No pending highlight data");
      this.uiUtils.showErrorFeedback("No highlight data found");
      return;
    }

    try {
      // Create highlight object from stored data
      const highlight = this.storageUtils.createHighlightObject(
        this.pendingHighlight
      );

      // Save to storage
      const result = await this.storageUtils.saveHighlight(highlight);

      if (result && result.success) {
        // Mark text as saved using stored range data
        this.markTextAsSavedFromPending(highlight.id);

        // Clear pending data and selection
        this.pendingHighlight = null;
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }

        // Remove popup and show success
        this.uiUtils.removePopup();
        this.uiUtils.showSuccessFeedback();
      } else {
        throw new Error(result?.error || "Unknown storage error");
      }
    } catch (error) {
      console.error("Failed to save highlight:", error);
      this.uiUtils.showErrorFeedback("Failed to save: " + error.message);
    }
  }

  markTextAsSavedFromPending(highlightId) {
    if (!this.pendingHighlight || !this.pendingHighlight.range) {
      console.error("No pending range data to mark");
      return;
    }

    try {
      // Use RangeUtils to recreate and mark the range
      const range = this.rangeUtils.createValidRangeFromData(
        this.pendingHighlight.range
      );

      if (!range) {
        // Fallback to text-based marking
        this.markTextByContent(this.pendingHighlight.text, highlightId);
        return;
      }

      // Mark the range with a span
      const span = this.rangeUtils.markRangeWithSpan(
        range,
        highlightId,
        this.domUtils
      );
      if (span) {
        this.savedHighlights.set(highlightId, span);
      }
    } catch (error) {
      console.error("Error marking text as saved:", error);
      // Fallback: try text-based marking
      this.markTextByContent(this.pendingHighlight.text, highlightId);
    }
  }

  markTextByContent(text, highlightId) {
    // Use CacheManager to avoid full DOM walks on repeated lookups
    const cacheKey = `${text}_${window.location.href}`;
    let textNodes = this.cacheManager.getCachedTextNodes(cacheKey);
    if (!textNodes) {
      textNodes = this.domUtils.findTextNodesOptimized(text);
      this.cacheManager.cacheTextNodes(cacheKey, textNodes);
    }

    if (textNodes.length === 0) {
      return;
    }

    // Find the best matching text node using RangeUtils
    const bestNode = this.rangeUtils.findBestTextNode(
      textNodes,
      text,
      this.pendingHighlight?.surroundingText,
      this.pendingHighlight?.textPosition
    );

    if (bestNode) {
      const content = bestNode.textContent;
      const index = content.indexOf(text);

      if (index !== -1) {
        const span = this.domUtils.markTextInNode(bestNode, text, index, {
          id: highlightId,
          text: text,
        });
        if (span) {
          this.savedHighlights.set(highlightId, span);
        }
      }
    }
  }

  async loadSavedHighlights() {
    try {
      this.savedHighlightsData = await this.storageUtils.loadHighlights();
    } catch (error) {
      console.error("Failed to load saved highlights:", error);
      this.savedHighlightsData = [];
    }
  }

  /**
   * Refresh highlights from storage and re-mark them on the page.
   * Called when the background script notifies about storage changes.
   */
  async refreshHighlights() {
    await this.loadSavedHighlights();
    this.markExistingHighlights();
  }

  markExistingHighlights() {
    try {
      // Update DOM cache and remove existing highlights
      this.cacheManager.updateDomCache();
      this.domUtils.removeExistingHighlightsBatch();
      this.savedHighlights.clear();

      // Mark highlights for current page
      const currentUrl = window.location.href;
      const pageHighlights = this.savedHighlightsData.filter(
        (h) => h.url === currentUrl
      );

      // Process highlights in chunks using EventUtils
      this.eventUtils.processInChunks(pageHighlights, (highlight) => {
        this.findAndMarkTextOptimized(highlight);
      });
    } catch (error) {
      console.error("Error marking existing highlights:", error);
    }
  }

  findAndMarkTextOptimized(highlight) {
    const text = highlight.text;

    // Check cache first
    const cacheKey = `${text}_${window.location.href}`;
    const cachedNodes = this.cacheManager.getCachedTextNodes(cacheKey);

    if (cachedNodes) {
      this.markTextInNodes(cachedNodes, highlight);
      return;
    }

    // Find text nodes using DOMUtils
    const textNodes = this.domUtils.findTextNodesOptimized(text);

    // Cache the results
    this.cacheManager.cacheTextNodes(cacheKey, textNodes);

    // Mark text in found nodes
    this.markTextInNodes(textNodes, highlight);
  }

  markTextInNodes(textNodes, highlight) {
    const text = highlight.text;

    textNodes.forEach((textNode) => {
      const content = textNode.textContent;
      const index = content.indexOf(text);

      if (index !== -1) {
        const span = this.domUtils.markTextInNode(
          textNode,
          text,
          index,
          highlight
        );
        if (span) {
          this.savedHighlights.set(highlight.id, span);
        }
      }
    });
  }

  handleUrlFragment() {
    this.eventUtils.handleUrlFragmentWithRetry(
      (highlightText, positionData) => {
        this.scrollToAndHighlightText(highlightText, positionData);
      }
    );
  }

  scrollToAndHighlightText(text, positionData, highlightId) {
    try {
      // 1. Try to find the already-rendered saved highlight span by ID
      const escapedId = highlightId
        ? (typeof CSS !== "undefined" && CSS.escape
          ? CSS.escape(highlightId)
          : highlightId.replace(/([^\w-])/g, "\\$1"))
        : null;
      const savedSpan = escapedId
        ? document.querySelector(`.highlight-saver-saved[data-highlight-id="${escapedId}"]`)
        : null;

      if (savedSpan) {
        savedSpan.scrollIntoView({ behavior: "smooth", block: "center" });
        this.uiUtils.temporarilyBorderSavedHighlight(savedSpan);
        this.uiUtils.showFeedback("Scrolled to saved highlight", "#f59e0b");
        return;
      }

      // Parse position for disambiguation
      const position = positionData
        ? (typeof positionData === "string"
          ? JSON.parse(decodeURIComponent(positionData))
          : positionData)
        : null;

      // 2. Try single-node text search
      const textNodes = this.domUtils.findTextNodesOptimized(text);
      if (textNodes.length > 0) {
        const success = this.eventUtils.scrollToText(
          textNodes,
          text,
          (range) => {
            this.uiUtils.temporarilyHighlightSavedText(range, text);
          },
          position
        );
        if (success) {
          this.uiUtils.showFeedback("Scrolled to saved highlight", "#f59e0b");
          return;
        }
      }

      // 3. Try cross-element text search (text spanning multiple DOM nodes)
      const range = this.domUtils.findTextRangeAcrossElements(text, document.body, position);
      if (range) {
        const scrollTarget = range.startContainer.parentElement || range.startContainer;
        scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          this.uiUtils.createPerLineHighlight(range);
        }, CONSTANTS.SCROLL_CALLBACK_DELAY);
        this.uiUtils.showFeedback("Scrolled to saved highlight", "#f59e0b");
        return;
      }

      // 4. Last resort: scroll to saved position only
      this.scrollToPosition(positionData);
    } catch (error) {
      console.error("Failed to scroll to text:", error);
      this.scrollToPosition(positionData);
    }
  }

  scrollToPosition(positionData) {
    if (positionData) {
      try {
        const position =
          typeof positionData === "string"
            ? JSON.parse(decodeURIComponent(positionData))
            : positionData;
        window.scrollTo({
          top: position.top - CONSTANTS.SCROLL_OFFSET,
          behavior: "smooth",
        });
        this.uiUtils.showFeedback("Scrolled to saved highlight", "#f59e0b");
      } catch (e) {
        this.uiUtils.showFeedback("Failed to scroll to saved highlight", "#ef4444");
      }
    } else {
      this.uiUtils.showFeedback("Failed to scroll to saved highlight", "#ef4444");
    }
  }

  cleanup() {
    // Clear any pending timeouts and intervals
    this.eventUtils.cleanup();
    this.cacheManager.cleanup();
    this.uiUtils.cleanup();

    // Clear pending highlight data
    this.pendingHighlight = null;

    // Clear saved highlights map
    this.savedHighlights.clear();
  }
}

// Initialize the highlight saver when DOM is ready
try {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      new HighlightSaver();
    });
  } else {
    new HighlightSaver();
  }
} catch (error) {
  console.error("Failed to initialize Highlight Saver:", error);
}
