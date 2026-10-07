/**
 * GlazeBid AIQ - Vitest Setup Configuration
 * ==========================================
 * Sets up the testing environment with jsdom for DOM testing and fills the
 * browser APIs jsdom either omits or implements too thinly for this app.
 *
 * Two of these are load-bearing, and both were silently failing tests:
 *
 * 1. localStorage / sessionStorage used to be bare `vi.fn()` stubs with NO
 *    backing store, so a write followed by a read returned `undefined`. Any
 *    code that round-trips through storage — `useFrameTakeoffStore.receive()`
 *    filing a packet for a project that isn't open, then `open()` reading it
 *    back — could never work under test, however correct the app was. They are
 *    still `vi.fn()` spies (so `expect(localStorage.setItem).toHaveBeenCalled()`
 *    keeps working) but now backed by a real Map.
 *
 * 2. jsdom 24's `Blob` and `File` expose only `slice`, `size` and `type` — no
 *    `arrayBuffer()`, no `stream()`, no `text()`. Anything reading an uploaded
 *    file's bytes (`scheduleIntake.readScheduleFile`, the PartnerPak `.dat`
 *    unzip) threw `file.arrayBuffer is not a function`. Node's own Blob and
 *    File are spec-complete, so they stand in. Nothing in this suite feeds a
 *    Blob back into a jsdom API (no FileReader, no input.files), which is what
 *    makes the swap safe.
 */

import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// ── Storage: vi.fn() spies over a real backing store ────────────────────────

/**
 * A Storage mock that actually stores. Every method is a spy, so call
 * assertions and per-test `mockReturnValue` overrides still work; `reset()`
 * empties the store and reinstalls the real behaviour so no override leaks
 * into the next test.
 */
function createStorageMock() {
  const store = new Map();

  const mock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
  };

  const install = () => {
    // null, not undefined — that is what the Storage spec returns for a miss,
    // and what `JSON.parse(localStorage.getItem(k) ?? 'null')` style code expects
    mock.getItem.mockImplementation((k) => (store.has(String(k)) ? store.get(String(k)) : null));
    mock.setItem.mockImplementation((k, v) => { store.set(String(k), String(v)); });
    mock.removeItem.mockImplementation((k) => { store.delete(String(k)); });
    mock.clear.mockImplementation(() => { store.clear(); });
    mock.key.mockImplementation((i) => [...store.keys()][Number(i)] ?? null);
  };

  install();

  // `length` has to be live — a frozen 0 lies once anything is stored
  Object.defineProperty(mock, 'length', { get: () => store.size, configurable: true });

  mock.reset = () => {
    store.clear();
    for (const fn of [mock.getItem, mock.setItem, mock.removeItem, mock.clear, mock.key]) {
      fn.mockReset();
    }
    install();
  };

  return mock;
}

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock, configurable: true, writable: true,
});
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock, configurable: true, writable: true,
});

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks();
  localStorageMock.reset();
  sessionStorageMock.reset();
});

// ── Blob / File: jsdom 24 ships them without arrayBuffer() or stream() ──────

if (typeof new Blob(['probe']).arrayBuffer !== 'function') {
  // Node's Blob/File are spec-complete (arrayBuffer, stream, text, slice).
  globalThis.Blob = NodeBlob;
  window.Blob = NodeBlob;
  if (typeof NodeFile === 'function') {
    globalThis.File = NodeFile;
    window.File = NodeFile;
  }
}

// ── The rest of the browser surface ─────────────────────────────────────────

// Mock window.alert and window.confirm
window.alert = vi.fn();
window.confirm = vi.fn(() => true);

// Mock fetch globally. `globalThis`, not `global` — the latter is a Node-only
// alias that this app's ESLint config (browser globals) flags as undefined.
globalThis.fetch = vi.fn();

// Reset fetch mock after each test
afterEach(() => {
  globalThis.fetch.mockReset();
});

// Mock matchMedia for responsive tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
