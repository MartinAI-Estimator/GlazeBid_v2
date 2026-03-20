/**
 * useStudioStore.ts
 *
 * Zustand store for GlazeBid Studio.
 *
 * State domains:
 *   - Tool management (activeTool, objectSnap, showGrid)
 *   - Pages (PDF page list, active page)
 *   - Calibration (per-page pixel-to-inch mapping)
 *   - Shapes (all drawn takeoff shapes)
 *   - Camera display (zoom % for Toolbar — updated by canvas hook, not RAF)
 *   - Calibration modal (pendingCalibrationLine triggers the UI dialog)
 *
 * This store does NOT own the camera object (pan/zoom). The camera lives
 * in useCanvasEngine as a mutable ref to avoid React re-renders on every
 * mouse move. cameraScale is a Zustand "display mirror" updated after
 * zoom actions, solely so the Toolbar can show the current zoom %.
 */

import { create } from 'zustand';
import { DEFAULT_PDF_PPI, type PageCalibration, type PagePoint } from '../engine/coordinateSystem';
import { shapeToFrameBridge, type DrawnShape, type FrameBridgeData } from '../types/shapes';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default page (placeholder before a real PDF is loaded in Task 4.2). */
const DEFAULT_PAGE_ID = 'default-page';
/** ANSI C landscape: 22" × 17" at 72 DPI */
export const DEFAULT_PAGE_W  = 1584;
export const DEFAULT_PAGE_H  = 1224;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToolType =
  | 'select'
  | 'pan'
  | 'line'
  | 'rect'
  | 'polygon'
  | 'calibrate'
  | 'frame'   // Task 4.3: Parametric Frame Highlight tool
  | 'rake'    // Task 5.x: Raked Frame (4-point polygon)
  | 'count'   // Task 5.x: Count Marker (point-based takeoff)
  | 'wand'   // Task 5.x: Magic Wand auto-detect
  | 'ghost'; // Task 6.3: Ghost Highlighter ML detector

export type PageState = {
  id:           string;
  label:        string;    // e.g. "A-001"
  widthPx:      number;
  heightPx:     number;
  pdfPageIndex: number;    // zero-based index in the source PDF
  /** Thumbnail data URL — populated by Task 4.2 thumbnail generation. */
  thumbnailUrl?: string;
};

type State = {
  // ── Tool ──────────────────────────────────────────────────────────────────
  activeTool:    ToolType;
  objectSnap:    boolean;
  snapThreshold: number;   // screen pixels within which snap activates
  showGrid:      boolean;
  /** Mirror of Camera.scale — updated after zoom events, read by Toolbar. */
  cameraScale:   number;
  // ── PDF document ───────────────────────────────────────────────────────────────────
  /** File name of the loaded PDF, or null when no PDF is loaded. */
  pdfFileName:   string | null;
  /** True = all pages are displayed in a continuous vertical strip. */
  continuousScroll: boolean;

  // ── PDF Tabs (multi-document support) ──────────────────────────────────────
  /** All open PDF tabs. A tab is added when a PDF is (re)loaded or injected. */
  pdfTabs:       PdfTab[];
  /** ID of the currently-active tab, or null when no PDF is loaded. */
  activePdfTabId: string | null;

  // ── Pages ─────────────────────────────────────────────────────────────────
  pages:         PageState[];
  activePageId:  string;

  // ── Calibration ───────────────────────────────────────────────────────────
  calibrations:  Record<string, PageCalibration>;
  /**
   * Set by the canvas hook after the user finishes a calibration line.
   * CalibrationModal watches this to open itself.
   */
  pendingCalibrationLine: {
    start:  PagePoint;
    end:    PagePoint;
    distPx: number;
  } | null;
  // ── Task 4.3: Parametric Frame Builder ────────────────────────────────────
  /**
   * Set by useParametricTool after the user finishes drawing a frame rect.
   * QuickAssignMenu watches this to open itself.
   */
  pendingFrameBounds: {
    shapeId:      string;  // the RectShape that was just committed
    widthInches:  number;
    heightInches: number;
    screenX:      number;  // canvas-local px — for QuickAssignMenu positioning
    screenY:      number;
  } | null;  /**
   * Set by QuickAssignMenu after the user assigns a system to a frame.
   * GridEditor watches this to open itself.
   */
  pendingGridEdit: {
    shapeId:     string;   // the RectShape whose grid is being edited
    widthInches: number;
    heightInches: number;
  } | null;  // ── Shapes ────────────────────────────────────────────────────────────────
  shapes:          DrawnShape[];
  selectedShapeId: string | null;

  // ── Type Library — active type for the Click Counter ─────────────────────
  /** The FrameType.id selected in the Type Library sidebar for dot placement. */
  activeFrameTypeId: string | null;

  // ── Actions: Tool ─────────────────────────────────────────────────────────
  setActiveTool:    (tool: ToolType) => void;
  toggleObjectSnap: () => void;
  toggleGrid:       () => void;
  setCameraScale:   (scale: number) => void;
  // ── Actions: PDF ─────────────────────────────────────────────────────────────────────
  /**
   * Replace the page list with the pages extracted from a newly-loaded PDF.
   * Revokes the old thumbnail object-URLs to avoid memory leaks.
   */
  loadPdfPages:         (pages: PageState[], fileName: string) => void;
  /** Set the thumbnail URL for a single page after lazy background rendering. */
  updatePageThumbnail:  (pageId: string, url: string) => void;
  toggleContinuousScroll: () => void;

  // ── Actions: PDF Tabs ─────────────────────────────────────────────────────
  /**
   * Open (or focus) a PDF tab by role.
   * If a tab with the same role already exists it is replaced.
   * Does NOT load pages — call loadPdfPages() after the PDF.js parse completes.
   */
  openPdfTab:  (role: PdfTabRole, fileName: string, pages: PageState[]) => string; // returns tab id
  /** Switch the active tab. Swaps in the saved pages / calibrations for that tab. */
  switchPdfTab: (tabId: string) => void;
  /** Close a tab. If it was active, activates the next available tab (or clears). */
  closePdfTab:  (tabId: string) => void;

  // ── Actions: Pages ────────────────────────────────────────────────────────
  addPage:       (page: PageState) => void;
  removePage:    (id: string) => void;
  setActivePage: (id: string) => void;

  // ── Actions: Calibration ──────────────────────────────────────────────────
  setCalibration:            (cal: PageCalibration) => void;
  clearCalibration:          (pageId: string) => void;
  setPendingCalibrationLine: (line: State['pendingCalibrationLine']) => void;
  setPendingFrameBounds:     (bounds: State['pendingFrameBounds'])   => void;
  setPendingGridEdit:        (edit:   State['pendingGridEdit'])      => void;
  // ── Actions: Shapes ───────────────────────────────────────────────────────
  addShape:    (shape: DrawnShape) => void;
  updateShape: (id: string, patch: Partial<DrawnShape>) => void;
  removeShape: (id: string) => void;
  selectShape: (id: string | null) => void;

  // ── Actions: Type Library ─────────────────────────────────────────────────
  setActiveFrameTypeId: (id: string | null) => void;

  // ── Computed ──────────────────────────────────────────────────────────────

  /** Active page state object. */
  getActivePage: () => PageState;

  /**
   * Calibration for the active page.
   * Returns a synthetic calibration at DEFAULT_PDF_PPI when not yet set.
   */
  getActiveCalibration: () => PageCalibration;

  /**
   * All shapes on the active page projected to Builder-compatible FrameBridgeData.
   * Use this for the Studio → Builder IPC bridge (Task 5.4).
   */
  getFrameBridgeData: () => FrameBridgeData[];

  /** Shapes on the active page only. */
  getActivePageShapes: () => DrawnShape[];
};

// ── PDF Tab types ─────────────────────────────────────────────────────────────

/** Role of a PDF tab so the UI can label it appropriately. */
export type PdfTabRole = 'drawings' | 'specs' | 'manual';

/** Lightweight descriptor for one open PDF tab. */
export type PdfTab = {
  id:       string;      // UUID
  role:     PdfTabRole;
  fileName: string;
  /** Saved page list so we can restore when switching tabs. */
  pages:    PageState[];
  /** calibrations scoped to this tab */
  calibrations: Record<string, import('../engine/coordinateSystem').PageCalibration>;
};



const DEFAULT_PAGE: PageState = {
  id:           DEFAULT_PAGE_ID,
  label:        'Page 1',
  widthPx:      DEFAULT_PAGE_W,
  heightPx:     DEFAULT_PAGE_H,
  pdfPageIndex: 0,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useStudioStore = create<State>()((set, get) => ({
  // ── Initial state ─────────────────────────────────────────────────────────
  activeTool:             'select',
  objectSnap:             true,
  snapThreshold:          10,
  showGrid:               true,
  cameraScale:            1,
  pdfFileName:            null,
  continuousScroll:       false,
  pdfTabs:                [],
  activePdfTabId:         null,
  pages:                  [DEFAULT_PAGE],
  activePageId:           DEFAULT_PAGE_ID,
  calibrations:           {},
  pendingCalibrationLine: null,
  pendingFrameBounds:     null,
  pendingGridEdit:        null,
  shapes:                 [],
  selectedShapeId:        null,
  activeFrameTypeId:      null,

  // ── Tool actions ──────────────────────────────────────────────────────────
  setActiveTool: (tool) => set({ activeTool: tool }),
  toggleObjectSnap: () => set(s => ({ objectSnap: !s.objectSnap })),
  toggleGrid:       () => set(s => ({ showGrid: !s.showGrid })),
  setCameraScale:   (scale) => set({ cameraScale: scale }),

  // ── PDF actions ────────────────────────────────────────────────────────────────────
  loadPdfPages: (pages, fileName) =>
    set(s => {
      // Revoke old thumbnail object-URLs so the browser can reclaim memory.
      for (const old of s.pages) {
        if (old.thumbnailUrl) URL.revokeObjectURL(old.thumbnailUrl);
      }
      // Keep the active tab in sync with the new pages/fileName
      const updatedTabs = s.activePdfTabId
        ? s.pdfTabs.map(t =>
            t.id === s.activePdfTabId ? { ...t, pages, fileName } : t,
          )
        : s.pdfTabs;
      return {
        pages,
        activePageId:  pages[0]?.id ?? DEFAULT_PAGE_ID,
        pdfFileName:   fileName,
        pdfTabs:       updatedTabs,
        // Reset calibrations — they were for the previous document's page IDs.
        calibrations:  {},
        shapes:        [],
        selectedShapeId: null,
      };
    }),

  updatePageThumbnail: (pageId, url) =>
    set(s => ({
      pages: s.pages.map(p => p.id === pageId ? { ...p, thumbnailUrl: url } : p),
    })),

  toggleContinuousScroll: () => set(s => ({ continuousScroll: !s.continuousScroll })),

  // ── PDF Tab actions ────────────────────────────────────────────────────────
  openPdfTab: (role, fileName, pages) => {
    const id = crypto.randomUUID();
    set(s => {
      // If a tab for this role already exists, replace it (revoke old thumbs)
      const existing = s.pdfTabs.find(t => t.role === role);
      if (existing) {
        for (const p of existing.pages) {
          if (p.thumbnailUrl) URL.revokeObjectURL(p.thumbnailUrl);
        }
      }
      const newTab: PdfTab = { id, role, fileName, pages, calibrations: {} };
      const nextTabs = existing
        ? s.pdfTabs.map(t => t.role === role ? newTab : t)
        : [...s.pdfTabs, newTab];
      // Snapshot current pages/calibrations back into the previously-active tab
      const snapshotTabs = s.activePdfTabId
        ? nextTabs.map(t =>
            t.id === s.activePdfTabId
              ? { ...t, pages: s.pages, calibrations: s.calibrations }
              : t,
          )
        : nextTabs;
      // Activate the new/replaced tab
      const activeTab = snapshotTabs.find(t => t.id === id)!;
      return {
        pdfTabs:       snapshotTabs,
        activePdfTabId: id,
        pages:         activeTab.pages,
        activePageId:  activeTab.pages[0]?.id ?? DEFAULT_PAGE_ID,
        pdfFileName:   activeTab.fileName,
        calibrations:  activeTab.calibrations,
        shapes:        s.shapes, // shapes are global — not per tab
        selectedShapeId: null,
      };
    });
    return id;
  },

  switchPdfTab: (tabId) =>
    set(s => {
      if (s.activePdfTabId === tabId) return s;
      // Snapshot current pages/calibrations into the leaving tab
      const snapshotTabs = s.pdfTabs.map(t =>
        t.id === s.activePdfTabId
          ? { ...t, pages: s.pages, calibrations: s.calibrations }
          : t,
      );
      const target = snapshotTabs.find(t => t.id === tabId);
      if (!target) return s;
      return {
        pdfTabs:        snapshotTabs,
        activePdfTabId: tabId,
        pages:          target.pages,
        activePageId:   target.pages[0]?.id ?? DEFAULT_PAGE_ID,
        pdfFileName:    target.fileName,
        calibrations:   target.calibrations,
        selectedShapeId: null,
      };
    }),

  closePdfTab: (tabId) =>
    set(s => {
      for (const p of s.pdfTabs.find(t => t.id === tabId)?.pages ?? []) {
        if (p.thumbnailUrl) URL.revokeObjectURL(p.thumbnailUrl);
      }
      const nextTabs = s.pdfTabs.filter(t => t.id !== tabId);
      if (s.activePdfTabId !== tabId) {
        return { pdfTabs: nextTabs };
      }
      // Closing the active tab — switch to the first remaining tab or clear
      const next = nextTabs[0];
      if (!next) {
        return {
          pdfTabs:        [],
          activePdfTabId: null,
          pages:          [DEFAULT_PAGE],
          activePageId:   DEFAULT_PAGE_ID,
          pdfFileName:    null,
          calibrations:   {},
          selectedShapeId: null,
        };
      }
      return {
        pdfTabs:        nextTabs,
        activePdfTabId: next.id,
        pages:          next.pages,
        activePageId:   next.pages[0]?.id ?? DEFAULT_PAGE_ID,
        pdfFileName:    next.fileName,
        calibrations:   next.calibrations,
        selectedShapeId: null,
      };
    }),


  addPage: (page) =>
    set(s => ({ pages: [...s.pages, page], activePageId: page.id })),

  removePage: (id) =>
    set(s => {
      const pages = s.pages.filter(p => p.id !== id);
      const activePageId =
        s.activePageId === id ? (pages[0]?.id ?? DEFAULT_PAGE_ID) : s.activePageId;
      return { pages, activePageId };
    }),

  setActivePage: (id) => set({ activePageId: id }),

  // ── Calibration actions ───────────────────────────────────────────────────
  setCalibration: (cal) =>
    set(s => ({ calibrations: { ...s.calibrations, [cal.pageId]: cal } })),

  clearCalibration: (pageId) =>
    set(s => {
      const { [pageId]: _, ...rest } = s.calibrations;
      return { calibrations: rest };
    }),

  setPendingCalibrationLine: (line)   => set({ pendingCalibrationLine: line }),
  setPendingFrameBounds:     (bounds) => set({ pendingFrameBounds: bounds }),
  setPendingGridEdit:        (edit)   => set({ pendingGridEdit: edit }),

  // ── Shape actions ─────────────────────────────────────────────────────────
  addShape: (shape) =>
    set(s => ({ shapes: [...s.shapes, shape] })),

  updateShape: (id, patch) =>
    set(s => ({
      shapes: s.shapes.map(sh =>
        sh.id === id ? ({ ...sh, ...patch } as DrawnShape) : sh,
      ),
    })),

  removeShape: (id) =>
    set(s => ({
      shapes:          s.shapes.filter(sh => sh.id !== id),
      selectedShapeId: s.selectedShapeId === id ? null : s.selectedShapeId,
    })),

  selectShape: (id) => set({ selectedShapeId: id }),

  setActiveFrameTypeId: (id) => set({ activeFrameTypeId: id }),

  // ── Computed ──────────────────────────────────────────────────────────────
  getActivePage: () => {
    const { pages, activePageId } = get();
    return pages.find(p => p.id === activePageId) ?? DEFAULT_PAGE;
  },

  getActiveCalibration: () => {
    const { calibrations, activePageId } = get();
    return (
      calibrations[activePageId] ?? {
        pageId:        activePageId,
        pixelsPerInch: DEFAULT_PDF_PPI,
      }
    );
  },

  getFrameBridgeData: () => {
    const { shapes, activePageId } = get();
    return shapes
      .filter(s => s.pageId === activePageId)
      .map(shapeToFrameBridge)
      .filter((d): d is FrameBridgeData => d !== null);
  },

  getActivePageShapes: () => {
    const { shapes, activePageId } = get();
    return shapes.filter(s => s.pageId === activePageId);
  },
}));
