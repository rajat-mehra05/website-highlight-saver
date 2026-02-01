// DOM manipulation and text finding utilities
// Used by content script for DOM operations

class DOMUtils {
  constructor() {
    // Text node cache removed — use CacheManager as single source of truth
  }

  /**
   * Find text nodes containing specific text with optimization
   */
  findTextNodesOptimized(searchText, body = document.body) {
    const textNodes = [];
    const searchLength = searchText.length;

    if (searchLength < CONSTANTS.SHORT_TEXT_THRESHOLD) {
      // For short text, use TreeWalker with early termination
      const walker = document.createTreeWalker(
        body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (node.textContent.length < searchLength) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        },
        false
      );

      let node;
      let foundCount = 0;
      const maxMatches = CONSTANTS.SHORT_TEXT_MAX_MATCHES;

      while ((node = walker.nextNode()) && foundCount < maxMatches) {
        if (node.textContent.includes(searchText)) {
          textNodes.push(node);
          foundCount++;
        }
      }
    } else {
      // For longer text, use targeted search
      const allTextNodes = this.getAllTextNodes(body);

      for (const textNode of allTextNodes) {
        if (textNode.textContent.includes(searchText)) {
          textNodes.push(textNode);
          if (textNodes.length >= CONSTANTS.LONG_TEXT_MAX_MATCHES) break;
        }
      }
    }

    return textNodes;
  }

  /**
   * Get all text nodes (no internal caching — CacheManager handles caching)
   */
  getAllTextNodes(container = document.body) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const trimmed = node.textContent.trim();
          if (trimmed.length < 2) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    return textNodes;
  }

  /**
   * Check if a node is valid and still in DOM
   */
  isValidNode(node) {
    return node && node.nodeType && node.parentNode && document.contains(node);
  }

  /**
   * Create highlight span element
   */
  createHighlightSpan(highlight) {
    const span = document.createElement("span");
    span.className = "highlight-saver-saved";
    span.dataset.highlightId = highlight.id;

    if (highlight.text && highlight.text.trim() !== "") {
      span.textContent = highlight.text;
    }

    span.title = "Saved highlight - Click to view in extension";
    // Styling handled entirely by .highlight-saver-saved CSS class (no conflicting inline styles)

    return span;
  }

  /**
   * Mark text in a specific node with highlighting
   */
  markTextInNode(textNode, text, index, highlight) {
    const content = textNode.textContent;
    const before = content.substring(0, index);
    const after = content.substring(index + text.length);

    const span = this.createHighlightSpan(highlight);
    const parent = textNode.parentNode;

    if (before) {
      const beforeNode = document.createTextNode(before);
      parent.insertBefore(beforeNode, textNode);
    }

    parent.insertBefore(span, textNode.nextSibling);

    if (after) {
      const afterNode = document.createTextNode(after);
      parent.insertBefore(afterNode, span.nextSibling);
    }

    parent.removeChild(textNode);
    return span;
  }

  /**
   * Remove existing highlights in batches for performance
   */
  removeExistingHighlightsBatch() {
    const existingHighlights = document.querySelectorAll(
      ".highlight-saver-saved"
    );
    const textNodes = [];

    // Collect all text nodes to be created
    existingHighlights.forEach((el) => {
      if (el && el.parentNode) {
        const textNode = document.createTextNode(el.textContent);
        textNodes.push({ element: el, textNode: textNode });
      }
    });

    // Batch replace elements with text nodes
    textNodes.forEach(({ element, textNode }) => {
      if (element.parentNode) {
        element.parentNode.replaceChild(textNode, element);
      }
    });

    // Normalize parent nodes in batches
    const parentsToNormalize = new Set();
    textNodes.forEach(({ element }) => {
      if (element.parentNode) {
        parentsToNormalize.add(element.parentNode);
      }
    });

    parentsToNormalize.forEach((parent) => {
      parent.normalize();
    });
  }

  /**
   * Find a Range for text that may span across multiple DOM elements.
   * Walks all text nodes, concatenates their content, locates the search
   * string, then maps the character offsets back to actual DOM nodes.
   */
  findTextRangeAcrossElements(searchText, root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let concat = "";

    while (walker.nextNode()) {
      const node = walker.currentNode;
      nodes.push({ node, start: concat.length });
      concat += node.textContent;
    }

    const index = concat.indexOf(searchText);
    if (index === -1) return null;

    const endIndex = index + searchText.length;
    let startNode, startOffset, endNode, endOffset;

    for (const { node, start } of nodes) {
      const nodeEnd = start + node.textContent.length;

      if (!startNode && index < nodeEnd) {
        startNode = node;
        startOffset = index - start;
      }

      if (startNode && endIndex <= nodeEnd) {
        endNode = node;
        endOffset = endIndex - start;
        break;
      }
    }

    if (!startNode || !endNode) return null;

    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    } catch {
      return null;
    }
  }

  /**
   * Get surrounding context for a node
   */
  getNodeContext(node, textIndex, textLength) {
    const content = node.textContent;
    const start = Math.max(0, textIndex - CONSTANTS.CONTEXT_CHARS);
    const end = Math.min(content.length, textIndex + textLength + CONSTANTS.CONTEXT_CHARS);
    return content.substring(start, end);
  }

}

window.__highlightSaver = window.__highlightSaver || {};
window.__highlightSaver.DOMUtils = DOMUtils;
