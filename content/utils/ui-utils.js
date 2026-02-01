// UI and popup management utilities
// Used by content script for creating and managing UI elements

class UIUtils {
  constructor() {
    this.currentPopup = null;
  }

  /**
   * Show save popup with buttons
   */
  showSavePopup(selectedText, event, handlers) {
    // Create popup element
    const popup = document.createElement("div");
    popup.id = "highlight-saver-popup-unique";
    popup.className = "highlight-saver-popup";

    // Position popup below the highlighted text
    this.positionPopup(popup);

    // Create and add buttons
    this.addPopupButtons(popup, handlers);

    document.body.appendChild(popup);
    this.currentPopup = popup;

    // Auto-remove as failsafe
    setTimeout(() => {
      if (this.currentPopup === popup) {
        this.removePopup();
      }
    }, CONSTANTS.POPUP_AUTO_DISMISS);
  }

  /**
   * Position popup relative to text selection
   */
  positionPopup(popup) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Calculate position below the selection
      const top = rect.bottom + window.scrollY + 8; // 8px gap
      const left = rect.left + window.scrollX;

      // Ensure popup doesn't go off-screen
      const popupWidth = 200; // Estimated width
      const viewportWidth = window.innerWidth;
      const adjustedLeft = Math.min(left, viewportWidth - popupWidth - 20);

      Object.assign(popup.style, {
        position: "absolute",
        top: `${top}px`,
        left: `${Math.max(20, adjustedLeft)}px`,
        zIndex: String(CONSTANTS.Z_INDEX_MAX),
      });
    } else {
      // Fallback positioning
      Object.assign(popup.style, {
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: String(CONSTANTS.Z_INDEX_MAX),
      });
    }
  }

  /**
   * Add buttons to popup with event handlers
   */
  addPopupButtons(popup, handlers) {
    // Create save button
    const saveButton = this.createButton({
      id: "highlight-save-btn-unique",
      text: "Save",
      className: "highlight-save-btn",
      handler: handlers.save,
    });

    // Create cancel button
    const cancelButton = this.createButton({
      id: "highlight-cancel-btn-unique",
      text: "Cancel",
      className: "highlight-cancel-btn",
      handler: handlers.cancel,
    });

    // Create summarize button
    const summarizeButton = this.createButton({
      id: "highlight-summarize-btn-unique",
      text: "Summarize",
      className: "highlight-summarize-btn",
      handler: handlers.summarize,
    });

    // Assemble popup with 3 buttons
    popup.appendChild(summarizeButton);
    popup.appendChild(saveButton);
    popup.appendChild(cancelButton);
  }

  /**
   * Create button with event handlers
   */
  createButton({ id, text, className, handler }) {
    const button = document.createElement("button");
    button.id = id;
    button.textContent = text;
    button.className = className;

    const eventHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handler();
    };

    // Only use click listener — mousedown + click causes double-fire
    button.addEventListener("click", eventHandler, true);

    // Store handler for cleanup
    button._highlightHandler = eventHandler;

    return button;
  }

  /**
   * Show summary popup
   */
  showSummaryPopup(summary) {
    this.removePopup();

    const summaryPopup = document.createElement("div");
    summaryPopup.id = "highlight-summary-popup-unique";
    summaryPopup.className = "highlight-saver-popup highlight-summary-popup";

    // Position it in the same location as the original popup
    this.positionSummaryPopup(summaryPopup);

    // Create summary content using safe DOM construction (no innerHTML with external data)
    const summaryContent = document.createElement("div");
    summaryContent.className = "summary-content";

    const summaryLabel = document.createElement("div");
    Object.assign(summaryLabel.style, {
      fontWeight: "600",
      marginBottom: "8px",
      color: "#374151",
    });
    summaryLabel.textContent = "AI Summary:";

    const summaryText = document.createElement("div");
    Object.assign(summaryText.style, {
      fontSize: "12px",
      lineHeight: "1.4",
      color: "#6b7280",
    });
    summaryText.textContent = summary;

    summaryContent.appendChild(summaryLabel);
    summaryContent.appendChild(summaryText);

    // Create close button
    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.className = "highlight-cancel-btn";
    closeButton.style.marginTop = "8px";
    closeButton.onclick = () => {
      summaryPopup.remove();
    };

    // Assemble summary popup
    summaryPopup.appendChild(summaryContent);
    summaryPopup.appendChild(closeButton);

    document.body.appendChild(summaryPopup);
    this.currentPopup = summaryPopup;

    // Auto-remove after timeout
    setTimeout(() => {
      if (this.currentPopup === summaryPopup) {
        summaryPopup.remove();
        this.currentPopup = null;
      }
    }, CONSTANTS.SUMMARY_AUTO_DISMISS);
  }

  /**
   * Position summary popup
   */
  positionSummaryPopup(summaryPopup) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      const top = rect.bottom + window.scrollY + 8;
      const left = rect.left + window.scrollX;

      const popupWidth = 300; // Wider for summary
      const viewportWidth = window.innerWidth;
      const adjustedLeft = Math.min(left, viewportWidth - popupWidth - 20);

      Object.assign(summaryPopup.style, {
        position: "absolute",
        top: `${top}px`,
        left: `${Math.max(20, adjustedLeft)}px`,
        zIndex: String(CONSTANTS.Z_INDEX_MAX),
        maxWidth: "300px",
        minWidth: "250px",
      });
    } else {
      // Fallback positioning when selection is cleared
      Object.assign(summaryPopup.style, {
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: String(CONSTANTS.Z_INDEX_MAX),
        maxWidth: "300px",
        minWidth: "250px",
      });
    }
  }

  /**
   * Remove current popup
   */
  removePopup() {
    if (this.currentPopup) {
      // Clean up event listeners more efficiently
      const buttons = [
        this.currentPopup.querySelector("#highlight-save-btn-unique"),
        this.currentPopup.querySelector("#highlight-cancel-btn-unique"),
        this.currentPopup.querySelector("#highlight-summarize-btn-unique"),
      ];

      buttons.forEach((btn) => {
        if (btn && btn._highlightHandler) {
          btn.removeEventListener("click", btn._highlightHandler, true);
          // Clear the stored handler reference
          btn._highlightHandler = null;
        }
        // Clean up any potential inline handlers
        if (btn) btn.onclick = null;
      });

      this.currentPopup.remove();
      this.currentPopup = null;
    }

    // Fallback: also try to remove by ID in case reference is lost
    const popupElement = document.getElementById(
      "highlight-saver-popup-unique"
    );
    if (popupElement) {
      popupElement.remove();
    }
  }

  /**
   * Show feedback message
   */
  showFeedback(message, backgroundColor) {
    // Remove any existing feedback
    const existing = document.querySelector(".highlight-feedback");
    if (existing) {
      existing.remove();
    }

    // Create new feedback element
    const feedback = document.createElement("div");
    feedback.className = "highlight-feedback";
    Object.assign(feedback.style, {
      position: "fixed",
      top: "80px", // Below the popup
      right: "20px",
      background: backgroundColor,
      color: "white",
      padding: "8px 12px",
      borderRadius: "6px",
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      fontWeight: "bold",
      zIndex: String(CONSTANTS.Z_INDEX_HIGH),
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    });
    feedback.textContent = message;

    document.body.appendChild(feedback);

    // Auto-remove after timeout
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.remove();
      }
    }, CONSTANTS.FEEDBACK_DISMISS);
  }

  /**
   * Show success feedback
   */
  showSuccessFeedback() {
    this.showFeedback("Highlight saved!", "#10b981");
  }

  /**
   * Show error feedback
   */
  showErrorFeedback(message = "Failed to save highlight") {
    this.showFeedback(message, "#ef4444");
  }

  /**
   * Update button state (for loading states)
   */
  updateButtonState(buttonId, text, disabled = false) {
    const button = this.currentPopup?.querySelector(`#${buttonId}`);
    if (button) {
      button.disabled = disabled;
      button.textContent = text;
    }
  }

  /**
   * Remove all temporary scroll-to highlights
   */
  removeTemporaryHighlights() {
    document
      .querySelectorAll(".highlight-saver-scroll-target")
      .forEach((el) => this.unwrapMark(el));
    document
      .querySelectorAll(".highlight-saver-line-highlight")
      .forEach((el) => el.remove());
  }

  /**
   * Unwrap a <mark> element, restoring original DOM structure
   */
  unwrapMark(mark) {
    if (mark && mark.parentNode) {
      const parent = mark.parentNode;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize();
    }
  }

  /**
   * Create temporary inline highlight for scroll-to functionality.
   * Wraps matched text in a <mark> element for precise inline highlighting,
   * similar to the browser's native Find-on-page feature.
   * Falls back to per-line overlay divs if the range spans multiple elements.
   */
  temporarilyHighlightSavedText(range, text, duration = 4000) {
    try {
      this.removeTemporaryHighlights();

      // Try to wrap the range in a <mark> for inline highlighting
      let mark = null;
      try {
        mark = document.createElement("mark");
        mark.className = "highlight-saver-scroll-target";
        range.surroundContents(mark);
      } catch {
        // surroundContents fails on cross-element ranges
        mark = null;
      }

      if (mark) {
        // Inline mark succeeded — schedule fade-out and DOM restoration
        setTimeout(() => {
          if (mark.parentNode) {
            mark.classList.add("highlight-saver-scroll-target-fade");
            setTimeout(() => this.unwrapMark(mark), 500);
          }
        }, duration);
      } else {
        // Fallback: create per-line overlay divs using getClientRects
        this.createPerLineHighlight(range, duration);
      }
    } catch (error) {
      console.error("Failed to create temporary highlight:", error);
    }
  }

  /**
   * Temporarily add a green border to an existing saved highlight span.
   * Used when scrolling to a highlight that is already rendered on the page.
   */
  temporarilyBorderSavedHighlight(element, duration = 4000) {
    element.classList.add("highlight-saver-scroll-border");
    setTimeout(() => {
      element.classList.remove("highlight-saver-scroll-border");
    }, duration);
  }

  /**
   * Create per-line highlight overlays using getClientRects.
   * Unlike getBoundingClientRect (one big box), getClientRects returns
   * individual rectangles per line, producing a precise highlight.
   */
  createPerLineHighlight(range, duration = 4000) {
    try {
      const rects = range.getClientRects();
      const highlights = [];

      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (rect.width === 0 || rect.height === 0) continue;

        const div = document.createElement("div");
        div.className = "highlight-saver-line-highlight";
        Object.assign(div.style, {
          position: "absolute",
          top: `${rect.top + window.scrollY}px`,
          left: `${rect.left + window.scrollX}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
        document.body.appendChild(div);
        highlights.push(div);
      }

      // Schedule fade-out and removal
      setTimeout(() => {
        highlights.forEach((div) => {
          if (div.parentNode) {
            div.classList.add("highlight-saver-line-highlight-fade");
            setTimeout(() => {
              if (div.parentNode) div.remove();
            }, 500);
          }
        });
      }, duration);
    } catch (error) {
      console.error("Per-line highlight failed:", error);
    }
  }

  /**
   * Check if click is outside popup
   */
  isOutsideClick(event) {
    return this.currentPopup && !this.currentPopup.contains(event.target);
  }

  /**
   * Get current popup reference
   */
  getCurrentPopup() {
    return this.currentPopup;
  }

  /**
   * Cleanup method
   */
  cleanup() {
    this.removePopup();
    this.currentPopup = null;
  }
}

window.__highlightSaver = window.__highlightSaver || {};
window.__highlightSaver.UIUtils = UIUtils;
