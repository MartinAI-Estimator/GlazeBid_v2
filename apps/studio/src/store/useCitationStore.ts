/**
 * useCitationStore.ts
 *
 * Lightweight Zustand store — manages the pending citation shape state
 * and the list of saved citations for the current sheet.
 *
 * Completely isolated from useStudioStore. If citation breaks, canvas
 * still works. That's the right failure boundary.
 */

import { create } from 'zustand';
import {
  writeCitation,
  getCitationsBySheet,
  recordImplicationUsage,
  type Citation,
} from '../db/citationStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingShape {
  shapeId:      string;
  pageId:       string;
  sheetNumber:  string;
  widthInches:  number;
  heightInches: number;
  /** Page-space bounding box — used by CitationCaptureLayer to derive screen position. */
  boundingBox:  { x: number; y: number; width: number; height: number };
}

interface CitationStoreState {
  // ── Pending — shape just drawn, modal not yet shown ───────────────────────
  pendingShape:    PendingShape | null;
  setPendingShape: (shape: PendingShape | null) => void;
  dismissPending:  () => void;

  // ── Saved citations for the active sheet ──────────────────────────────────
  sheetCitations:     Citation[];
  loadSheetCitations: (projectId: string, sheetNumber: string) => Promise<void>;
  addCitation:        (raw: unknown) => Promise<Citation>;

  // ── Hover state for VisualCitationOverlay ─────────────────────────────────
  hoveredCitationId:    string | null;
  setHoveredCitationId: (id: string | null) => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCitationStore = create<CitationStoreState>((set) => ({
  pendingShape:      null,
  sheetCitations:    [],
  hoveredCitationId: null,

  setPendingShape: (shape) => set({ pendingShape: shape }),

  dismissPending: () => set({ pendingShape: null }),

  setHoveredCitationId: (id) => set({ hoveredCitationId: id }),

  loadSheetCitations: async (projectId, sheetNumber) => {
    try {
      const citations = await getCitationsBySheet(projectId, sheetNumber);
      set({ sheetCitations: citations });
    } catch (err) {
      console.warn('[CitationStore] loadSheetCitations failed:', err);
      set({ sheetCitations: [] });
    }
  },

  addCitation: async (raw) => {
    const citation = await writeCitation(raw);
    set(state => ({
      sheetCitations: [...state.sheetCitations, citation],
      pendingShape:   null,
    }));
    return citation;
  },
}));

// Re-export for convenience
export { recordImplicationUsage };
