// Chrome API mock for testing
const storageMock = (() => {
  let store = {};
  return {
    local: {
      get: jest.fn((keys) => {
        if (keys === null) return Promise.resolve({ ...store });
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach((key) => {
          if (store[key] !== undefined) result[key] = store[key];
        });
        return Promise.resolve(result);
      }),
      set: jest.fn((items) => {
        Object.assign(store, items);
        return Promise.resolve();
      }),
      remove: jest.fn((keys) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach((key) => delete store[key]);
        return Promise.resolve();
      }),
    },
    _reset: () => {
      store = {};
    },
  };
})();

const chromeMock = {
  storage: storageMock,
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
    getManifest: jest.fn(() => ({ version: "1.0.0" })),
    lastError: null,
    getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
  },
  tabs: {
    query: jest.fn((_, callback) => callback([])),
    sendMessage: jest.fn(() => Promise.resolve()),
    create: jest.fn(),
  },
};

global.chrome = chromeMock;

// Initialize the namespace so require()'d utility files can register into it
global.window = global.window || globalThis;
global.window.__highlightSaver = global.window.__highlightSaver || {};

// Make CONSTANTS available for tests
global.CONSTANTS = {
  MAX_TEXT_LENGTH: 1000,
  MAX_URL_LENGTH: 500,
  MAX_TITLE_LENGTH: 200,
  MAX_DOMAIN_LENGTH: 100,
  MAX_HIGHLIGHTS: 1000,
  MAX_SUMMARY_CACHE_SIZE: 50,
  MAX_TEXT_NODE_CACHE_SIZE: 50,
  MAX_SUMMARY_DISPLAY_CACHE: 20,
  MAX_CACHE_SIZE: 100,
  MESSAGE_TIMEOUT: 5000,
  SUMMARIZE_TIMEOUT: 30000,
  POPUP_AUTO_DISMISS: 10000,
  SUMMARY_AUTO_DISMISS: 15000,
  FEEDBACK_DISMISS: 3000,
  TEMPORARY_HIGHLIGHT_DURATION: 4000,
  TEXT_NODE_CACHE_TTL: 30000,
  SUMMARY_CACHE_TTL: 300000,
  MEMORY_CLEANUP_INTERVAL: 120000,
  SELECTION_DEBOUNCE: 150,
  SELECTION_THROTTLE: 100,
  FRAGMENT_MAX_ATTEMPTS: 5,
  FRAGMENT_RETRY_DELAY: 500,
  HIGHLIGHT_CHUNK_SIZE: 5,
  IDLE_CALLBACK_TIMEOUT: 100,
  CHUNK_FALLBACK_DELAY: 10,
  SCROLL_OFFSET: 100,
  Z_INDEX_MAX: 2147483647,
  Z_INDEX_HIGH: 2147483646,
  Z_INDEX_OVERLAY: 2147483645,
  CONTEXT_CHARS: 50,
  SHORT_TEXT_THRESHOLD: 3,
  SHORT_TEXT_MAX_MATCHES: 10,
  LONG_TEXT_MAX_MATCHES: 5,
  CLEANUP_RETENTION_DAYS: 365,
  RATE_LIMIT_MAX_REQUESTS: 5,
  RATE_LIMIT_WINDOW_MS: 60000,
  POPUP_PAGE_SIZE: 50,
  AI_MODEL_DEFAULT: "gpt-4",
  AI_MAX_TOKENS_DEFAULT: 150,
  AI_TEMPERATURE_DEFAULT: 0.8,
};
