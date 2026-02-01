// Storage management — all mutations routed through background script to prevent TOCTOU races
class HighlightStorage {
  static async getAll() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "getHighlights" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.success) {
          resolve(response.highlights || []);
        } else {
          reject(new Error(response?.error || "Failed to get highlights"));
        }
      });
    });
  }

  static async delete(id) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "deleteHighlight", id },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response?.error || "Failed to delete highlight"));
          }
        }
      );
    });
  }

  static async clearAll() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "clearAllHighlights" },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response?.error || "Failed to clear highlights"));
          }
        }
      );
    });
  }

  static async export() {
    const highlights = await this.getAll();
    const dataStr = JSON.stringify(highlights, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `highlights-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Validate a single highlight object has required fields and correct types
   */
  static validateHighlight(h) {
    return (
      h &&
      typeof h === "object" &&
      typeof h.id === "string" &&
      h.id.length > 0 &&
      typeof h.text === "string" &&
      h.text.length > 0 &&
      h.text.length <= 10000 &&
      typeof h.url === "string" &&
      h.url.length > 0 &&
      h.url.length <= 2048 &&
      typeof h.timestamp === "number" &&
      h.timestamp > 0
    );
  }

  static async import(file, merge = false) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          let parsed;
          try {
            parsed = JSON.parse(e.target.result);
          } catch {
            reject(new Error("Invalid JSON file"));
            return;
          }

          // Accept either raw array or { highlights: [...] } format
          let highlights;
          if (Array.isArray(parsed)) {
            highlights = parsed;
          } else if (parsed && Array.isArray(parsed.highlights)) {
            highlights = parsed.highlights;
          } else {
            reject(new Error("Invalid file format: expected array of highlights"));
            return;
          }

          // Validate each highlight
          const valid = highlights.filter((h) => HighlightStorage.validateHighlight(h));
          const invalid = highlights.length - valid.length;

          if (valid.length === 0) {
            reject(new Error("No valid highlights found in file"));
            return;
          }

          // Route through background for atomic operation
          chrome.runtime.sendMessage(
            { action: "importHighlights", highlights: valid, merge },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else if (response && response.success) {
                resolve({ imported: response.imported, skippedInvalid: invalid });
              } else {
                reject(new Error(response?.error || "Import failed"));
              }
            }
          );
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsText(file);
    });
  }
}

// Popup pagination constant
const PAGE_SIZE = 50;

// UI management
class PopupUI {
  constructor() {
    this.highlightsList = document.getElementById("highlightsList");
    this.emptyState = document.getElementById("emptyState");
    this.searchInput = document.getElementById("searchInput");
    this.highlightCount = document.getElementById("highlightCount");
    this.exportBtn = document.getElementById("exportBtn");
    this.importBtn = document.getElementById("importBtn");
    this.fileInput = document.getElementById("fileInput");
    this.clearAllBtn = document.getElementById("clearAllBtn");

    this.highlights = [];
    this.filteredHighlights = [];
    this.displayedCount = 0;

    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadHighlights();
  }

  bindEvents() {
    this.searchInput.addEventListener("input", () => this.filterHighlights());
    this.exportBtn.addEventListener("click", () => this.handleExport());
    this.importBtn.addEventListener("click", () => this.handleImport());
    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e));
    this.clearAllBtn.addEventListener("click", () => this.handleClearAll());
  }

  async loadHighlights() {
    this.highlights = await HighlightStorage.getAll();
    this.filteredHighlights = [...this.highlights];
    this.displayedCount = 0;
    this.render();
  }

  filterHighlights() {
    const query = this.searchInput.value.toLowerCase().trim();

    if (!query) {
      this.filteredHighlights = [...this.highlights];
    } else {
      this.filteredHighlights = this.highlights.filter(
        (highlight) =>
          highlight.text.toLowerCase().includes(query) ||
          (highlight.title && highlight.title.toLowerCase().includes(query)) ||
          (highlight.domain && highlight.domain.toLowerCase().includes(query))
      );
    }

    this.displayedCount = 0;
    this.render();
  }

  render() {
    this.updateCount();
    this.toggleEmptyState();
    this.renderHighlights();
  }

  updateCount() {
    const count = this.filteredHighlights.length;
    this.highlightCount.textContent = `${count} highlight${
      count !== 1 ? "s" : ""
    }`;
  }

  toggleEmptyState() {
    const hasHighlights = this.filteredHighlights.length > 0;
    this.highlightsList.style.display = hasHighlights ? "block" : "none";
    this.emptyState.style.display = hasHighlights ? "none" : "flex";
  }

  renderHighlights() {
    this.highlightsList.innerHTML = "";
    this.displayedCount = 0;
    this.renderNextPage();
  }

  renderNextPage() {
    const start = this.displayedCount;
    const end = Math.min(start + PAGE_SIZE, this.filteredHighlights.length);
    const page = this.filteredHighlights.slice(start, end);

    page.forEach((highlight) => {
      const element = this.createHighlightElement(highlight);
      this.highlightsList.appendChild(element);
    });

    this.displayedCount = end;

    // Remove existing load-more button if present
    const existingBtn = this.highlightsList.querySelector(".load-more-btn");
    if (existingBtn) {
      existingBtn.remove();
    }

    // Add "Load More" button if there are more items
    if (this.displayedCount < this.filteredHighlights.length) {
      const loadMoreBtn = document.createElement("button");
      loadMoreBtn.className = "btn load-more-btn";
      loadMoreBtn.textContent = `Load more (${this.filteredHighlights.length - this.displayedCount} remaining)`;
      Object.assign(loadMoreBtn.style, {
        display: "block",
        width: "calc(100% - 40px)",
        margin: "12px 20px",
        padding: "10px",
        textAlign: "center",
        background: "#f3f4f6",
        border: "1px solid #d1d5db",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "13px",
        color: "#374151",
      });
      loadMoreBtn.addEventListener("click", () => {
        loadMoreBtn.remove();
        this.renderNextPage();
      });
      this.highlightsList.appendChild(loadMoreBtn);
    }
  }

  createHighlightElement(highlight) {
    const div = document.createElement("div");
    div.className = "highlight-item";
    div.dataset.id = highlight.id;

    const text = document.createElement("div");
    text.className = "highlight-text";
    text.textContent = highlight.text;

    const meta = document.createElement("div");
    meta.className = "highlight-meta";

    const domain = document.createElement("a");
    domain.className = "highlight-domain";
    domain.href = highlight.url;
    domain.target = "_blank";
    domain.textContent = highlight.domain || new URL(highlight.url).hostname;

    const date = document.createElement("span");
    date.className = "highlight-date";
    date.textContent = this.formatDate(highlight.timestamp);

    meta.appendChild(domain);
    meta.appendChild(date);

    const actions = document.createElement("div");
    actions.className = "highlight-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.handleDelete(highlight.id);
    });

    actions.appendChild(deleteBtn);

    div.appendChild(text);
    div.appendChild(meta);
    div.appendChild(actions);

    // Click to navigate to the highlight on the page
    div.addEventListener("click", (e) => {
      if (e.target.closest(".highlight-actions")) return;
      this.navigateToHighlight(highlight);
    });

    return div;
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return "Today";
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  navigateToHighlight(highlight) {
    const highlightUrl = highlight.url.split("#")[0];

    // Only check the active tab in the current window — no broad tab scanning.
    // host_permissions grant access to tab.url for matching HTTPS origins,
    // so this works without the "tabs" permission.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      const activeUrl = (activeTab?.url || "").split("#")[0];

      if (activeTab && activeUrl === highlightUrl) {
        // Active tab already has the page — scroll to the highlight in-place
        chrome.tabs.sendMessage(activeTab.id, {
          action: "scrollToHighlight",
          text: highlight.text,
          textPosition: highlight.textPosition,
          highlightId: highlight.id,
        });
        window.close();
      } else {
        // Different page — open a new tab with URL fragment for scroll-to
        let url = highlight.url;
        if (highlight.textPosition) {
          const separator = url.includes("#") ? "&" : "#";
          const highlightParams = `highlight=${encodeURIComponent(
            highlight.text
          )}&pos=${encodeURIComponent(JSON.stringify(highlight.textPosition))}`;
          url = `${url}${separator}${highlightParams}`;
        }
        chrome.tabs.create({ url });
      }
    });
  }

  async handleDelete(id) {
    if (confirm("Are you sure you want to delete this highlight?")) {
      await HighlightStorage.delete(id);
      await this.loadHighlights();
    }
  }

  async handleExport() {
    try {
      await HighlightStorage.export();
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export highlights");
    }
  }

  handleImport() {
    this.fileInput.click();
  }

  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Ask user whether to merge or replace (with safe abort path)
      const existingCount = this.highlights.length;
      let merge = false;

      if (existingCount > 0) {
        // First dialog: merge or something else?
        const wantsMerge = confirm(
          `You have ${existingCount} existing highlights.\n\n` +
            `Click OK to MERGE (keep existing + add new).\n` +
            `Click Cancel to choose REPLACE or abort.`
        );

        if (wantsMerge) {
          merge = true;
        } else {
          // Second dialog: confirm the destructive replace, or abort entirely
          const confirmReplace = confirm(
            `WARNING: This will permanently DELETE all ${existingCount} existing highlights ` +
              `and replace them with the imported file.\n\n` +
              `Click OK to REPLACE ALL.\n` +
              `Click Cancel to ABORT the import.`
          );
          if (!confirmReplace) {
            event.target.value = "";
            return; // User chose to abort — do nothing
          }
          merge = false;
        }
      }

      const result = await HighlightStorage.import(file, merge);
      await this.loadHighlights();

      let message = `Successfully imported ${result.imported} highlights.`;
      if (result.skippedInvalid > 0) {
        message += `\n${result.skippedInvalid} invalid entries were skipped.`;
      }
      alert(message);
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import highlights: " + error.message);
    }

    // Reset file input
    event.target.value = "";
  }

  async handleClearAll() {
    if (
      confirm(
        "Are you sure you want to delete all highlights? This action cannot be undone."
      )
    ) {
      await HighlightStorage.clearAll();
      await this.loadHighlights();
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupUI();
});
