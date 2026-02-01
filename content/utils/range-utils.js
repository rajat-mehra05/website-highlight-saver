// Range and text selection utilities
// Used by content script for text selection and range management

class RangeUtils {
  /**
   * Validate range data before creating range
   */
  isValidRangeData(rangeData) {
    return (
      rangeData &&
      rangeData.startContainer &&
      rangeData.endContainer &&
      typeof rangeData.startOffset === "number" &&
      typeof rangeData.endOffset === "number" &&
      rangeData.startOffset >= 0 &&
      rangeData.endOffset >= 0
    );
  }

  /**
   * Create a valid range from stored range data
   */
  createValidRangeFromData(rangeData) {
    try {
      if (!this.isValidRangeData(rangeData)) {
        return null;
      }

      // Additional validation: check offset ordering for same container
      if (rangeData.startContainer === rangeData.endContainer) {
        if (rangeData.startOffset > rangeData.endOffset) {
          console.warn(
            "Invalid range: startOffset > endOffset for same container"
          );
          return null;
        }
      }

      const range = document.createRange();

      // Set start with validation
      if (this.isValidNode(rangeData.startContainer)) {
        range.setStart(rangeData.startContainer, rangeData.startOffset);
      } else {
        return null;
      }

      // Set end with validation
      if (this.isValidNode(rangeData.endContainer)) {
        range.setEnd(rangeData.endContainer, rangeData.endOffset);
      } else {
        return null;
      }

      // Validate the created range
      if (range.collapsed) {
        return null;
      }

      return range;
    } catch (error) {
      console.error("Error creating range from data:", error);
      return null;
    }
  }

  /**
   * Check if node is valid for range operations
   */
  isValidNode(node) {
    return node && node.nodeType && node.parentNode && document.contains(node);
  }

  /**
   * Check if range is valid for marking
   */
  isValidRangeForMarking(range) {
    try {
      return (
        range &&
        !range.collapsed &&
        range.startContainer &&
        range.endContainer &&
        range.startContainer.parentNode &&
        range.endContainer.parentNode &&
        document.contains(range.startContainer) &&
        document.contains(range.endContainer)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Mark range with span element
   */
  markRangeWithSpan(range, highlightId, domUtils) {
    try {
      if (!this.isValidRangeForMarking(range)) {
        throw new Error("Invalid range for marking");
      }

      // Check if range can be safely surrounded
      if (!this.canSurroundRange(range)) {
        return this.markRangeWithFallback(range, highlightId, domUtils);
      }

      // Create span without text content to avoid duplication
      const span = domUtils.createHighlightSpan({
        id: highlightId,
        text: "", // Empty text to prevent duplication
      });

      // Let DOM move the original nodes into the span
      range.surroundContents(span);

      // Set attributes after the DOM manipulation
      span.title = "Saved highlight - Click to view in extension";

      return span;
    } catch {
      return this.markRangeWithFallback(range, highlightId, domUtils);
    }
  }

  /**
   * Check if range can be safely surrounded
   */
  canSurroundRange(range) {
    try {
      // Check if the range partially selects any element nodes
      const startContainer = range.startContainer;
      const endContainer = range.endContainer;

      // If containers are different and one is not a text node, it might be problematic
      if (startContainer !== endContainer) {
        if (
          startContainer.nodeType !== Node.TEXT_NODE ||
          endContainer.nodeType !== Node.TEXT_NODE
        ) {
          return false;
        }
      }

      // Check if we're trying to select across element boundaries
      const commonAncestor = range.commonAncestorContainer;
      if (commonAncestor.nodeType !== Node.TEXT_NODE) {
        const contents = range.cloneContents();
        const hasElementNodes = contents.querySelector("*") !== null;
        if (hasElementNodes) {
          // This means we're crossing element boundaries
          return false;
        }
      }

      return true;
    } catch (error) {
      console.warn("Error checking range safety:", error);
      return false;
    }
  }

  /**
   * Fallback method for marking ranges
   */
  markRangeWithFallback(range, highlightId, domUtils) {
    try {
      if (!this.isValidRangeForMarking(range)) {
        throw new Error("Range invalid for fallback marking");
      }

      // Capture text before extracting (extractContents collapses the range)
      const textContent = range.toString();
      const contents = range.extractContents();

      // Create the span wrapper
      const span = domUtils.createHighlightSpan({
        id: highlightId,
        text: textContent,
      });

      // Put the extracted content into the span
      span.appendChild(contents);

      // Insert the span at the start of the range
      range.insertNode(span);

      // Collapse the range to remove the selection
      range.collapse(true);

      return span;
    } catch (fallbackError) {
      console.error("Fallback marking also failed:", fallbackError);
      return null;
    }
  }

  /**
   * Get surrounding text from a range
   */
  getSurroundingTextFromRange(range) {
    const container = range.commonAncestorContainer;

    // Get text from the containing element
    if (container.nodeType === Node.TEXT_NODE) {
      return container.parentElement.textContent.substring(0, 200) + "...";
    } else {
      return container.textContent.substring(0, 200) + "...";
    }
  }

  /**
   * Store selection data for later use
   */
  storeSelectionData(selection, selectedText) {
    const range = selection.getRangeAt(0);

    // Get text position for scroll-to functionality
    const rect = range.getBoundingClientRect();
    const textPosition = {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    };

    return {
      text: selectedText,
      range: {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
        // clonedContents removed: deep-clones DOM fragment but is never read, wastes memory
      },
      surroundingText: this.getSurroundingTextFromRange(range),
      textPosition: textPosition,
      timestamp: Date.now(),
    };
  }

  /**
   * Find best text node from multiple candidates
   */
  findBestTextNode(textNodes, text, surroundingText, textPosition) {
    if (textNodes.length === 1) {
      return textNodes[0];
    }

    // If we have surrounding text, use it to find the best match
    if (surroundingText) {
      return this.findNodeByContext(textNodes, text, surroundingText);
    }

    // If we have position data, use it to find the closest match
    if (textPosition) {
      return this.findNodeByPosition(textNodes, text, textPosition);
    }

    // Fallback: return the first node that contains the exact text
    return (
      textNodes.find((node) => {
        const content = node.textContent;
        return content.includes(text);
      }) || textNodes[0]
    );
  }

  /**
   * Find node by context similarity
   */
  findNodeByContext(textNodes, text, surroundingText) {
    let bestNode = null;
    let bestScore = 0;

    textNodes.forEach((node) => {
      const content = node.textContent;
      const index = content.indexOf(text);

      if (index !== -1) {
        // Get surrounding context from this node
        const nodeContext = this.getNodeContext(node, index, text.length);

        // Calculate similarity score with the original surrounding text
        const score = this.calculateContextSimilarity(
          surroundingText,
          nodeContext
        );

        if (score > bestScore) {
          bestScore = score;
          bestNode = node;
        }
      }
    });

    return bestNode || textNodes[0];
  }

  /**
   * Find node by position proximity
   */
  findNodeByPosition(textNodes, text, targetPosition) {
    let bestNode = null;
    let bestDistance = Infinity;

    textNodes.forEach((node) => {
      const content = node.textContent;
      const index = content.indexOf(text);

      if (index !== -1) {
        try {
          // Create a temporary range to get position
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + text.length);

          const rect = range.getBoundingClientRect();
          const nodePosition = {
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
          };

          // Calculate distance from target position
          const distance = Math.sqrt(
            Math.pow(nodePosition.top - targetPosition.top, 2) +
              Math.pow(nodePosition.left - targetPosition.left, 2)
          );

          if (distance < bestDistance) {
            bestDistance = distance;
            bestNode = node;
          }
        } catch (error) {
          console.warn("Failed to get position for text node:", error);
        }
      }
    });

    return bestNode || textNodes[0];
  }

  /**
   * Get node context for similarity calculation
   */
  getNodeContext(node, textIndex, textLength) {
    const content = node.textContent;
    const start = Math.max(0, textIndex - CONSTANTS.CONTEXT_CHARS);
    const end = Math.min(content.length, textIndex + textLength + CONSTANTS.CONTEXT_CHARS);
    return content.substring(start, end);
  }

  /**
   * Calculate context similarity between two text strings
   */
  calculateContextSimilarity(originalContext, nodeContext) {
    const originalWords = originalContext.toLowerCase().split(/\s+/);
    const nodeWords = nodeContext.toLowerCase().split(/\s+/);

    let commonWords = 0;
    originalWords.forEach((word) => {
      if (nodeWords.includes(word)) {
        commonWords++;
      }
    });

    return commonWords / Math.max(originalWords.length, nodeWords.length);
  }
}

window.__highlightSaver = window.__highlightSaver || {};
window.__highlightSaver.RangeUtils = RangeUtils;
