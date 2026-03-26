/**
 * electron.d.ts
 *
 * Shared return types for citation IPC calls.
 * The actual `window.electron` and `window.electronAPI` interfaces
 * are declared in vite-env.d.ts (Studio) and the Builder preload.
 *
 * Import these types when you need runtime type safety beyond what
 * the ambient Window interface provides.
 */

// ── Citation-related return types ────────────────────────────────────────────

export interface CitationWriteResult {
  ok:        boolean;
  citation?: unknown;
  error?:    string;
}

export interface CitationListResult {
  ok:        boolean;
  citations: unknown[];
  error?:    string;
}

export interface ImplicationSuggestionsResult {
  ok:          boolean;
  suggestions: unknown[];
  error?:      string;
}

export interface SimpleResult {
  ok:     boolean;
  error?: string;
}
