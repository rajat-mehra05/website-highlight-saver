// Shared constants for the Website Highlight Saver extension
// Centralizes all magic numbers and configuration values

const CONSTANTS = {
  // Text limits
  MAX_TEXT_LENGTH: 1000,
  MAX_URL_LENGTH: 500,
  MAX_TITLE_LENGTH: 200,
  MAX_DOMAIN_LENGTH: 100,

  // Storage limits
  MAX_HIGHLIGHTS: 1000,
  MAX_SUMMARY_CACHE_SIZE: 50,
  MAX_TEXT_NODE_CACHE_SIZE: 50,
  MAX_SUMMARY_DISPLAY_CACHE: 20,
  MAX_CACHE_SIZE: 100,

  // Timeouts (ms)
  MESSAGE_TIMEOUT: 5000,
  SUMMARIZE_TIMEOUT: 30000,
  POPUP_AUTO_DISMISS: 10000,
  SUMMARY_AUTO_DISMISS: 15000,
  FEEDBACK_DISMISS: 3000,
  TEMPORARY_HIGHLIGHT_DURATION: 4000,
  FALLBACK_HIGHLIGHT_DURATION: 4000,
  SCROLL_SETTLE_DELAY: 500,
  SCROLL_CALLBACK_DELAY: 300,
  POPUP_SHOW_DELAY: 50,
  FADE_OUT_DURATION: 300,
  INSTANT_FEEDBACK_DISMISS: 3000,

  // Cache TTLs (ms)
  TEXT_NODE_CACHE_TTL: 30000,
  SUMMARY_CACHE_TTL: 300000, // 5 minutes
  MEMORY_CLEANUP_INTERVAL: 120000, // 2 minutes

  // Event handling (ms)
  SELECTION_DEBOUNCE: 150,
  SELECTION_THROTTLE: 100,

  // URL fragment retry
  FRAGMENT_MAX_ATTEMPTS: 5,
  FRAGMENT_RETRY_DELAY: 500,

  // Chunk processing
  HIGHLIGHT_CHUNK_SIZE: 5,
  IDLE_CALLBACK_TIMEOUT: 100,
  CHUNK_FALLBACK_DELAY: 10,

  // Scroll
  SCROLL_OFFSET: 100,

  // Z-index values
  Z_INDEX_MAX: 2147483647,
  Z_INDEX_HIGH: 2147483646,
  Z_INDEX_OVERLAY: 2147483645,

  // Context matching
  CONTEXT_CHARS: 50,
  SHORT_TEXT_THRESHOLD: 3,
  SHORT_TEXT_MAX_MATCHES: 10,
  LONG_TEXT_MAX_MATCHES: 5,

  // Cleanup
  CLEANUP_RETENTION_DAYS: 365,

  // Rate limiting
  RATE_LIMIT_MAX_REQUESTS: 5,
  RATE_LIMIT_WINDOW_MS: 60000, // 1 minute

  // Popup pagination
  POPUP_PAGE_SIZE: 50,

  // AI config defaults
  AI_MODEL_DEFAULT: "gpt-4",
  AI_MAX_TOKENS_DEFAULT: 150,
  AI_TEMPERATURE_DEFAULT: 0.8,
};

// All extension classes are namespaced under __highlightSaver to avoid
// polluting the global window namespace and colliding with page scripts.
// MV3 content scripts don't support ES modules in the manifest content_scripts
// field without a bundler, so we use a namespace object as the pragmatic alternative.
if (typeof window !== "undefined") {
  window.__highlightSaver = window.__highlightSaver || {};
  window.__highlightSaver.CONSTANTS = CONSTANTS;
  // Direct reference kept for convenience within our own scripts
  window.CONSTANTS = CONSTANTS;
}
