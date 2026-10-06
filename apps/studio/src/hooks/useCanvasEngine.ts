/**
 * useCanvasEngine.ts
 *
 * Core canvas engine hook. Manages the Camera, render loop, and all input
 * events (zoom, pan, drawing tools). Does NOT use React state for camera
 * or drawing state — all mutable data lives in refs to prevent re-renders
 * on every mouse move or wheel event.
 *
 * Pattern:
 *   - Zustand → stateRef (via subscribe, outside React lifecycle)
 *   - Camera → cameraRef (never in React state)
 *   - Draw loop → dirty-flag + rAF (single frame per "dirty" cycle)
 *
 * The hook returns a stable API object (same reference every render).
 */

import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { Camera } from '../engine/Camera';
import { renderFrame, virtualCanvasSize, computePageLayout } from '../engine/renderEngine';
import { findSnap, type SnapResult } from '../engine/snapEngine';
import {
  parsePdfSnapPoints,
  getCachedPdfSnapPoints,
  clearPdfSnapCache,
} from '../engine/pdfSnapParser';
import { distancePx, DEFAULT_PDF_PPI, type PagePoint } from '../engine/coordinateSystem';
import { calibrateFromLine } from '../engine/coordinateSystem';
import { PdfTileManager } from '../engine/pdfTileManager';
import { loadPdfFromBuffer, THUMB_SCALE } from '../engine/pdfLoader';
import type { InProgressShape, DrawnShape, RectShape, LineShape, PolygonShape, PolylineShape, MarkerShape, TextShape } from '../types/shapes';
import type { ToolChestItem } from '../constants/toolChest';
import {
  hitHandle, applyHandleDrag, translate, hitEdge, insertVertex, removeVertex, polylineLengthPx, type Handle,
} from '../engine/shapeGeometry';
import type { ContextMenuTarget } from '../components/canvas/ShapeContextMenu';
import { getClipboard, setClipboard } from '../utils/clipboard';
import {
  useStudioStore,
  DEFAULT_PAGE_W,
  DEFAULT_PAGE_H,
  type ToolType,
  type PageState,
} from '../store/useStudioStore';
import type { PageCalibration } from '../engine/coordinateSystem';
import { useProjectStore } from '../store/useProjectStore';
import { useNavStore, type SheetLink } from '../store/useNavStore';

// ── Engine-internal state (keeps render function pure) ────────────────────────

type EngineState = {
  activeTool:       ToolType;
  objectSnap:       boolean;
  snapThreshold:    number;
  showGrid:         boolean;
  shapes:           DrawnShape[];
  selectedId:       string | null;
  calibrations:     Record<string, PageCalibration>;
  activePageId:     string;
  pages:            PageState[];
  continuousScroll: boolean;
  activeSubject:    ToolChestItem | null;
};

const SNAP_NONE: SnapResult = { snapped: false, point: { x: 0, y: 0 }, snapType: 'none' };

const CURSOR: Record<ToolType | 'panning', string> = {
  select:    'default',
  pan:       'grab',
  panning:   'grabbing',
  line:      'crosshair',
  rect:      'crosshair',
  polygon:   'crosshair',
  polyline:  'crosshair',
  tcount:    'cell',
  text:      'text',
  callout:   'crosshair',
  cloud:     'crosshair',
  arrow:     'crosshair',
  calibrate: 'crosshair',
  frame:     'crosshair',
  rake:      'crosshair',
  count:     'cell',
  wand:      'copy',
  ghost:     'crosshair',
  boxsnap:   'crosshair',
};

// ── Public API ────────────────────────────────────────────────────────────────

export type CanvasEngineAPI = {
  fitToPage:    () => void;
  zoomIn:       () => void;
  zoomOut:      () => void;
  openPdf:      () => Promise<void>;
  /**
   * Load a PDF from an already-read buffer (used by IPC inject from Builder).
   * role distinguishes 'drawings' vs 'specs' tabs.
   */
  loadPdfBuffer: (buffer: Uint8Array, fileName: string, role: import('../store/useStudioStore').PdfTabRole) => Promise<void>;
  /**
   * Convert a canvas-local CSS pixel coordinate to page-space coordinates.
   * Exposed for plugin hooks (e.g. useParametricTool) so they can map mouse
   * positions to PDF page coordinates without direct camera access.
   */
  screenToPage: (sx: number, sy: number) => PagePoint;
  /**
   * Inverse of screenToPage: convert a page-space coordinate to a canvas-local
   * CSS pixel coordinate.  Used by HTML overlays (GridEditor, CountOverlay) to
   * position elements over specific page points.
   */
  pageToScreen: (px: number, py: number) => { x: number; y: number };
  /**
   * Run snap detection from plugin tool hooks.  Writes the result into the
   * engine’s internal snapRef and schedules a canvas repaint so the visual
   * indicator appears immediately.  Safe to call on every mousemove.
   */
  getSnap: (pagePt: PagePoint) => SnapResult;
  /** Return the last loaded PDF buffer (for sidecar scan). */
  getPdfBuffer: () => Uint8Array | null;
  /** Go to a markup: switch to its page, zoom to it and select it. */
  focusShape: (id: string) => void;
  /** Paint PDF annotations into the page image (true) or leave them to Studio (false). */
  setBakeAnnotations: (bake: boolean) => void;
  /** Go to a region of a page (search hits, change boxes). */
  focusRect: (pageId: string, rect: [number, number, number, number], fill?: number) => void;
  /** Render a whole page to a bitmap (split view). */
  renderPageBitmap: (pageId: string, scale: number) => Promise<ImageBitmap | null>;
  /** Tool cursors for new plugin tools. */
  rake:  never; count: never; wand: never; ghost: never;  // presence check only, not used directly
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCanvasEngine(
  containerRef:    RefObject<HTMLDivElement>,
  canvasRef:       RefObject<HTMLCanvasElement>,
  onContextMenu?:  (target: ContextMenuTarget) => void,
): CanvasEngineAPI {
  const cameraRef      = useRef(new Camera());
  const pdfBufferRef   = useRef<Uint8Array | null>(null);
  const tileManagerRef = useRef(new PdfTileManager());
  const stateRef       = useRef<EngineState>({
    activeTool:       'select',
    objectSnap:       true,
    snapThreshold:    10,
    showGrid:         true,
    shapes:           [],
    selectedId:       null,
    calibrations:     {},
    activePageId:     'default-page',
    pages:            [],
    continuousScroll: false,
    activeSubject:    null,
  });
  const inProgressRef      = useRef<InProgressShape | null>(null);
  // Select-tool drag: move a whole shape, or drag one handle (corner / edge / vertex)
  const dragRef = useRef<{
    mode: 'move' | 'handle';
    shapeId: string;
    handle: Handle | null;
    start: PagePoint;
    orig: DrawnShape;
    started: boolean;
  } | null>(null);
  const snapRef             = useRef<SnapResult>(SNAP_NONE);
  const rafRef              = useRef(0);
  // Keep latest onContextMenu in a ref to avoid stale closure inside the useEffect
  const onContextMenuRef    = useRef(onContextMenu);
  useEffect(() => { onContextMenuRef.current = onContextMenu; }, [onContextMenu]);
  // Pointer state (pan + drawing)
  const ptrRef = useRef({
    isPanning:   false,
    spaceHeld:   false,
    hasMoved:    false,   // used to distinguish click vs drag on rect
    downX:       0,
    downY:       0,
    lastX:       0,       // last clientX for pan delta (movementX/Y unreliable in Electron)
    lastY:       0,
  });

  // ── Render loop ────────────────────────────────────────────────────────────

  const scheduleRedraw = useCallback(() => {
    // Cancel any pending frame so the latest state (including a freshly
    // cached tile) always triggers a new draw rather than being dropped.
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const canvas = canvasRef.current;
      const ctx    = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const s    = stateRef.current;
      const pg   = s.pages.find(p => p.id === s.activePageId);
      const cal  = s.calibrations[s.activePageId] ?? null;
      const dpr  = window.devicePixelRatio || 1;
      const cam  = cameraRef.current;

      // Visible page-space region — passed to getTile so it can switch to a
      // viewport tile at high zoom for pixel-perfect quality at any scale.
      const viewport = {
        x: -cam.tx / cam.scale,
        y: -cam.ty / cam.scale,
        w: (canvas.width  / dpr) / cam.scale,
        h: (canvas.height / dpr) / cam.scale,
      };

      const tile = tileManagerRef.current.getTile(
        s.activePageId,
        cam.scale,
        dpr,
        viewport,
      );

      const nav = useNavStore.getState();
      const hl  = nav.hoverLink;
      renderFrame({
        ctx,
        canvas,
        camera:     cam,
        dpr,
        pageWidth:  pg?.widthPx  ?? DEFAULT_PAGE_W,
        pageHeight: pg?.heightPx ?? DEFAULT_PAGE_H,
        shapes:     visibleShapes(s.shapes),   // renderEngine filters by pageId in continuous mode
        hoverLinkRect: hl && pg && hl.page === pg.pdfPageIndex ? hl.rect : null,
        searchRects: pg ? nav.searchHits.filter(h => h.page === pg.pdfPageIndex).map(h => h.rect) : [],
        activeSearchRect: pg && nav.activeHit >= 0 && nav.searchHits[nav.activeHit]?.page === pg.pdfPageIndex ? nav.searchHits[nav.activeHit].rect : null,
        overlay: nav.overlay && nav.overlay.pageId === s.activePageId ? nav.overlay : null,
        selectedId: s.selectedId,
        inProgress: inProgressRef.current,
        snapResult: snapRef.current,
        showGrid:   s.showGrid,
        calibration: cal,
        // ── PDF additions ──────────────────────────────────────────────────────────
        pdfTile:          tile,
        continuousScroll: s.continuousScroll,
        allPages:         s.pages,
        // vp = per-page viewport; renderEngine computes page-local Y in its loop
        getTileForPage:   (pid, vp) => tileManagerRef.current.getTile(pid, cam.scale, dpr, vp),
        calibrations:     s.calibrations,
        activePageId:     s.activePageId,
        // ── TypeCountDots ──────────────────────────────────────────────────────────────────
        ...(() => {
          const ps = useProjectStore.getState();
          const ftColors: Record<string, string> = {};
          const ftMarks:  Record<string, string> = {};
          for (const ft of ps.frameTypes) { ftColors[ft.id] = ft.color; ftMarks[ft.id] = ft.mark; }
          return { typeDots: ps.typeDots, frameTypeColors: ftColors, frameTypeMarks: ftMarks };
        })(),
      });
    });
  }, [canvasRef]);

  // ── Fit / Zoom helpers ─────────────────────────────────────────────────────

  const fitToPage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s  = stateRef.current;

    if (s.continuousScroll && s.pages.length > 1) {
      // Fit to the virtual canvas (all pages stacked)
      const { w, h } = virtualCanvasSize(s.pages);
      cameraRef.current.fitToPage(w, h, canvas.clientWidth, canvas.clientHeight);
    } else {
      const pg = s.pages.find(p => p.id === s.activePageId);
      cameraRef.current.fitToPage(
        pg?.widthPx  ?? DEFAULT_PAGE_W,
        pg?.heightPx ?? DEFAULT_PAGE_H,
        canvas.clientWidth,
        canvas.clientHeight,
      );
    }
    useStudioStore.getState().setCameraScale(cameraRef.current.scale);
    scheduleRedraw();
  }, [canvasRef, scheduleRedraw]);

  const zoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cameraRef.current.zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1);
    useStudioStore.getState().setCameraScale(cameraRef.current.scale);
    scheduleRedraw();
  }, [canvasRef, scheduleRedraw]);

  const zoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cameraRef.current.zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, -1);
    useStudioStore.getState().setCameraScale(cameraRef.current.scale);
    scheduleRedraw();
  }, [canvasRef, scheduleRedraw]);

  // ── Return stable API ──────────────────────────────────────────────────────

  const openPdf = useCallback(async () => {
    if (!window.electron?.openPdf) return;
    const result = await window.electron.openPdf();
    if (!result.success) return;
    await loadPdfBuffer(result.buffer, result.fileName, 'manual');
  }, []);   // loadPdfBuffer defined below — stable ref, no deps needed here

  // Shared inner loader — does not touch the IPC dialog. Called by both
  // openPdf (user-initiated) and loadPdfBuffer (IPC inject from Builder).
  // IMPORTANT: do not change the tile/thumbnail/snap logic below.
  const loadPdfBuffer = useCallback(async (
    buffer:   Uint8Array,
    fileName: string,
    role:     import('../store/useStudioStore').PdfTabRole,
  ) => {
    // Copy the buffer immediately — Electron IPC may detach the original
    // ArrayBuffer after structured-clone transfer, making it unreadable later.
    pdfBufferRef.current = new Uint8Array(buffer);
    const loaded = await loadPdfFromBuffer(buffer, fileName);

    // Register page proxies with the tile manager
    const tm = tileManagerRef.current;
    clearPdfSnapCache();   // drop any snap data from the previous PDF
    tm.clearAll();
    for (let i = 0; i < loaded.pageProxies.length; i++) {
      tm.setPageProxy(loaded.pages[i].id, loaded.pageProxies[i]);
    }

    // 1. Open/replace the tab for this role, then sync store pages
    useStudioStore.getState().openPdfTab(role, fileName, loaded.pages);
    // loadPdfPages keeps calibrations/shapes reset and syncs pdfFileName
    useStudioStore.getState().loadPdfPages(loaded.pages, fileName);

    // 2. Fit camera using containerRef — always has correct layout dimensions
    const container = containerRef.current;
    if (container && loaded.pages.length > 0) {
      const p = loaded.pages[0];
      cameraRef.current.fitToPage(p.widthPx, p.heightPx, container.clientWidth, container.clientHeight);
      useStudioStore.getState().setCameraScale(cameraRef.current.scale);
    }

    // 3. Await page-0 tile BEFORE starting thumbnail loop so the PDF.js worker
    //    handles it uncontested. Log if it fails so we can diagnose.
    if (loaded.pages.length > 0) {
      try {
        await tm.preWarm(loaded.pages[0].id);
        console.log('[loadPdfBuffer] preWarm complete — tile cached for', loaded.pages[0].id);
      } catch (err) {
        console.error('[loadPdfBuffer] preWarm FAILED:', err);
      }
    }

    // 4. Tile is now cached — this frame will paint the PDF immediately.
    // Also kick off snap-point parsing for page 0 in the background.
    if (loaded.pages.length > 0) {
      void parsePdfSnapPoints(loaded.pages[0].id, loaded.pageProxies[0]);
    }
    scheduleRedraw();

    // 5. Generate thumbnails sequentially in the background.
    void (async () => {
      for (let i = 0; i < loaded.pages.length; i++) {
        const proxy = loaded.pageProxies[i];
        const page  = loaded.pages[i];
        try {
          const thumbVp     = proxy.getViewport({ scale: THUMB_SCALE });
          const thumbCanvas = document.createElement('canvas');
          thumbCanvas.width  = Math.round(thumbVp.width);
          thumbCanvas.height = Math.round(thumbVp.height);
          const ctx = thumbCanvas.getContext('2d')!;
          await proxy.render({ canvasContext: ctx, viewport: thumbVp }).promise;
          const blob = await new Promise<Blob>((resolve, reject) => {
            thumbCanvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.65);
          });
          useStudioStore.getState().updatePageThumbnail(page.id, URL.createObjectURL(blob));
          void parsePdfSnapPoints(page.id, proxy);
        } catch (err) {
          console.warn('[loadPdfBuffer] thumbnail failed page', i, err);
        }
      }
    })();
  }, [containerRef, scheduleRedraw]);

  // Coordinate helper for plugin hooks — wraps the private cameraRef
  const screenToPage = useCallback((sx: number, sy: number): PagePoint => {
    return cameraRef.current.screenToPage(sx, sy);
  }, []);

  const pageToScreen = useCallback((px: number, py: number): { x: number; y: number } => {
    const cam = cameraRef.current;
    return { x: px * cam.scale + cam.tx, y: py * cam.scale + cam.ty };
  }, []);

  const getSnap = useCallback((pagePt: PagePoint): SnapResult => {
    const s      = stateRef.current;
    const thr    = s.snapThreshold / cameraRef.current.scale;
    const pdfPts = getCachedPdfSnapPoints(s.activePageId);
    const res    = findSnap(pagePt, s.shapes, s.activePageId, s.objectSnap, thr, pdfPts);
    snapRef.current = res;
    scheduleRedraw();
    return res;
  }, [scheduleRedraw]);

  const focusShape = useCallback((id: string) => {
    const st = useStudioStore.getState();
    const sh = st.shapes.find(x => x.id === id);
    const canvas = canvasRef.current;
    if (!sh || !canvas) return;
    if (st.activePageId !== sh.pageId) st.setActivePage(sh.pageId);
    st.selectShape(id);
    const b = shapeBounds(sh);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const cam = cameraRef.current;
    // fit the markup into ~45% of the view, never zooming out past the current page fit
    const target = Math.min((cw * 0.45) / Math.max(b.w, 24), (ch * 0.45) / Math.max(b.h, 24), 6);
    cam.scale = Math.max(target, 0.05);
    let oy = 0;
    if (st.continuousScroll && st.pages.length > 1) {
      oy = computePageLayout(st.pages).find(l => l.page.id === sh.pageId)?.yOffset ?? 0;
    }
    cam.tx = cw / 2 - (b.x + b.w / 2) * cam.scale;
    cam.ty = ch / 2 - (b.y + b.h / 2 + oy) * cam.scale;
    st.setCameraScale(cam.scale);
    scheduleRedraw();
  }, [canvasRef, scheduleRedraw]);

  const focusRect = useCallback((pageId: string, rect: [number, number, number, number], fill = 0.35) => {
    const st = useStudioStore.getState();
    const canvas = canvasRef.current;
    if (!canvas) return;
    useNavStore.getState().pushView({ pageId: st.activePageId, scale: cameraRef.current.scale, tx: cameraRef.current.tx, ty: cameraRef.current.ty });
    if (st.activePageId !== pageId) st.setActivePage(pageId);
    const [x0, y0, x1, y1] = rect;
    const cw = canvas.clientWidth, ch = canvas.clientHeight, cam = cameraRef.current;
    cam.scale = Math.max(0.05, Math.min((cw * fill) / Math.max(x1 - x0, 30), (ch * fill) / Math.max(y1 - y0, 30), 6));
    let oy = 0;
    if (st.continuousScroll && st.pages.length > 1) oy = computePageLayout(st.pages).find(l => l.page.id === pageId)?.yOffset ?? 0;
    cam.tx = cw / 2 - ((x0 + x1) / 2) * cam.scale;
    cam.ty = ch / 2 - ((y0 + y1) / 2 + oy) * cam.scale;
    st.setCameraScale(cam.scale);
    scheduleRedraw();
  }, [canvasRef, scheduleRedraw]);

  const renderPageBitmap = useCallback((pageId: string, scale: number) => tileManagerRef.current.renderPageBitmap(pageId, scale), []);

  const setBakeAnnotations = useCallback((bake: boolean) => {
    tileManagerRef.current.setBakeAnnotations(bake);
    scheduleRedraw();
  }, [scheduleRedraw]);

  const api = useMemo<CanvasEngineAPI>(
    () => ({ fitToPage, zoomIn, zoomOut, openPdf, loadPdfBuffer, screenToPage, pageToScreen, getSnap, getPdfBuffer: () => pdfBufferRef.current, focusShape, setBakeAnnotations, focusRect, renderPageBitmap, rake: undefined as never, count: undefined as never, wand: undefined as never, ghost: undefined as never }),
    [fitToPage, zoomIn, zoomOut, openPdf, loadPdfBuffer, screenToPage, pageToScreen, getSnap, focusShape, setBakeAnnotations, focusRect, renderPageBitmap],
  );

  // ── Safety kick: re-draw when active page changes (e.g. PDF just loaded) ─────
  // Fires synchronously to show the white placeholder, then again 150 ms later
  // to catch the tile if it lands just after the first frame.
  const activePageId = useStudioStore(s => s.activePageId);
  useEffect(() => {
    scheduleRedraw();
    const t = setTimeout(scheduleRedraw, 150);
    return () => clearTimeout(t);
  }, [activePageId, scheduleRedraw]);

  // ── Main effect: subscribe to store + wire all events ─────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !canvasRef.current) return;
    // Rebind with a non-null type so TypeScript CFA persists into inner function closures.
    const canvas: HTMLCanvasElement = canvasRef.current;

    // ── Sync stateRef from actual store state on mount ───────────────────────
    // subscribe() only fires on changes; without this the stateRef has stale
    // hardcoded defaults until the first mutation.
    {
      const s = useStudioStore.getState();
      stateRef.current = {
        activeTool:       s.activeTool,
        objectSnap:       s.objectSnap,
        snapThreshold:    s.snapThreshold,
        showGrid:         s.showGrid,
        shapes:           s.shapes,
        selectedId:       s.selectedShapeId,
        calibrations:     s.calibrations,
        activePageId:     s.activePageId,
        pages:            s.pages,
        continuousScroll: s.continuousScroll,
        activeSubject:    s.activeSubject,
      };
    }

    // Wire tile-manager callback so background renders trigger a redraw
    tileManagerRef.current.setOnTileReady(scheduleRedraw);

    // ── Subscribe to Zustand (bypasses React render cycle) ──────────────────
    const unsubStore = useStudioStore.subscribe((s) => {
      stateRef.current = {
        activeTool:       s.activeTool,
        objectSnap:       s.objectSnap,
        snapThreshold:    s.snapThreshold,
        showGrid:         s.showGrid,
        shapes:           s.shapes,
        selectedId:       s.selectedShapeId,
        calibrations:     s.calibrations,
        activePageId:     s.activePageId,
        pages:            s.pages,
        continuousScroll: s.continuousScroll,
        activeSubject:    s.activeSubject,
      };
      scheduleRedraw();
    });

    // Subscribe to project store so TypeCountDot changes also trigger a redraw
    const unsubProjectStore = useProjectStore.subscribe(() => {
      scheduleRedraw();
    });
    const unsubNav = useNavStore.subscribe((n, o) => {
      if (n.hoverLink !== o.hoverLink || n.showExternal !== o.showExternal || n.searchHits !== o.searchHits ||
          n.activeHit !== o.activeHit || n.overlay !== o.overlay) scheduleRedraw();
    });

    // ── ResizeObserver: keep canvas buffer in sync with CSS size ─────────────
    let fittedOnce = container.clientWidth > 0 && container.clientHeight > 0;
    const resizeObserver = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(container.clientWidth  * dpr);
      canvas.height = Math.round(container.clientHeight * dpr);
      // On the first resize after valid dimensions appear (e.g. after Toolbar
      // mounts and causes a layout shift), refit the page to the new size.
      if (!fittedOnce && container.clientWidth > 0 && container.clientHeight > 0) {
        fittedOnce = true;
        cameraRef.current.fitToPage(DEFAULT_PAGE_W, DEFAULT_PAGE_H, container.clientWidth, container.clientHeight);
        useStudioStore.getState().setCameraScale(cameraRef.current.scale);
      }
      scheduleRedraw();
    });
    resizeObserver.observe(container);

    // Initial size + fit — guard against 0-dim container (e.g. before CSS layout)
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(container.clientWidth  * dpr);
    canvas.height = Math.round(container.clientHeight * dpr);
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      cameraRef.current.fitToPage(DEFAULT_PAGE_W, DEFAULT_PAGE_H, container.clientWidth, container.clientHeight);
      useStudioStore.getState().setCameraScale(cameraRef.current.scale);
    }

    // Focus canvas so keyboard shortcuts work without a manual click
    canvas.focus();

    // ── Helper: get page coordinates from mouse event ─────────────────────
    function pageXY(e: MouseEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      return cameraRef.current.screenToPage(e.clientX - rect.left, e.clientY - rect.top);
    }

    function screenXY(e: MouseEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    /**
     * In continuous-scroll mode the camera maps to a virtual canvas.
     * This helper converts a virtual-space coordinate to local page-space
     * and, if the click fell on a different page, switches the active page.
     *
     * In single-page mode it's a no-op (returns the coord unchanged).
     */
    function resolveLocalPageXY(
      virtualPt: { x: number; y: number },
    ): { x: number; y: number } {
      const s = stateRef.current;
      if (!s.continuousScroll || s.pages.length <= 1) return virtualPt;

      const layouts = computePageLayout(s.pages);
      for (const { page, yOffset } of layouts) {
        if (
          virtualPt.y >= yOffset &&
          virtualPt.y < yOffset + page.heightPx
        ) {
          // Switch active page if needed (side-effect via store)
          if (page.id !== s.activePageId) {
            useStudioStore.getState().setActivePage(page.id);
          }
          return { x: virtualPt.x, y: virtualPt.y - yOffset };
        }
      }
      return virtualPt; // outside all pages — fallback
    }

    function getSnappedPage(e: MouseEvent): { x: number; y: number } {
      const s      = stateRef.current;
      const raw    = resolveLocalPageXY(pageXY(e));
      const thr    = s.snapThreshold / cameraRef.current.scale;
      const pdfPts = getCachedPdfSnapPoints(s.activePageId);
      const res    = findSnap(raw, s.shapes, s.activePageId, s.objectSnap, thr, pdfPts);
      snapRef.current = res;
      return res.snapped ? res.point : raw;
    }

    /**
     * Constrain a point to 0°/45°/90° from a starting point (Shift-lock).
     * Used for straight-line drawing in calibrate and line tools.
     */
    function constrainAngle(start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number } {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      // Determine dominant axis for snap direction
      if (adx > ady * 2) {
        // Horizontal (0°)
        return { x: end.x, y: start.y };
      } else if (ady > adx * 2) {
        // Vertical (90°)
        return { x: start.x, y: end.y };
      } else {
        // 45° diagonal — project onto nearest 45° line
        const dist = Math.max(adx, ady);
        return {
          x: start.x + dist * Math.sign(dx),
          y: start.y + dist * Math.sign(dy),
        };
      }
    }

    // ── Views + hyperlinks ───────────────────────────────────────────────────
    function currentView() {
      const cam = cameraRef.current;
      return { pageId: stateRef.current.activePageId, scale: cam.scale, tx: cam.tx, ty: cam.ty };
    }
    function restoreView(v: { pageId: string; scale: number; tx: number; ty: number }) {
      const st = useStudioStore.getState();
      if (st.activePageId !== v.pageId) st.setActivePage(v.pageId);
      const cam = cameraRef.current;
      cam.scale = v.scale; cam.tx = v.tx; cam.ty = v.ty;
      st.setCameraScale(cam.scale);
      scheduleRedraw();
    }
    function linkAt(pt: { x: number; y: number }): SheetLink | null {
      const s = stateRef.current;
      const pg = s.pages.find(p => p.id === s.activePageId);
      if (!pg) return null;
      const pad = 2 / cameraRef.current.scale;
      for (const l of useNavStore.getState().links) {
        if (l.page !== pg.pdfPageIndex) continue;
        const [x0, y0, x1, y1] = l.rect;
        if (pt.x >= x0 - pad && pt.x <= x1 + pad && pt.y >= y0 - pad && pt.y <= y1 + pad) return l;
      }
      return null;
    }
    function followLink(l: SheetLink) {
      const s = stateRef.current;
      const tgt = s.pages.find(p => p.pdfPageIndex === l.target_page);
      if (!tgt) return;
      useNavStore.getState().pushView(currentView());
      useNavStore.getState().setHoverLink(null);
      const st = useStudioStore.getState();
      if (st.activePageId !== tgt.id) st.setActivePage(tgt.id);
      const cam = cameraRef.current;
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (l.target_rect) {
        // centre the detail (number bubble / title) with its drawing above it in view
        const [x0, y0, x1, y1] = l.target_rect;
        cam.scale = Math.min(cw / 900, ch / 650);
        cam.tx = cw / 2 - ((x0 + x1) / 2 + 180) * cam.scale;
        cam.ty = ch * 0.75 - ((y0 + y1) / 2) * cam.scale;
        st.setCameraScale(cam.scale);
        scheduleRedraw();
      } else {
        cam.fitToPage(tgt.widthPx, tgt.heightPx, cw, ch);
        st.setCameraScale(cam.scale);
        scheduleRedraw();
      }
    }

    function updateCursor(): void {
      const s = stateRef.current;
      canvas.style.cursor = ptrRef.current.isPanning
        ? CURSOR.panning
        : CURSOR[s.activeTool];
    }

    // ── Wheel (zoom) ─────────────────────────────────────────────────────────
    function handleWheel(e: WheelEvent): void {
      e.preventDefault();
      console.log('[wheel] fired, deltaY:', e.deltaY);
      const sc = screenXY(e as unknown as MouseEvent);
      if (e.ctrlKey) {
        // Trackpad pinch
        cameraRef.current.zoomBy(sc.x, sc.y, 1 - e.deltaY * 0.003);
      } else {
        cameraRef.current.zoomAt(sc.x, sc.y, e.deltaY > 0 ? -1 : 1);
      }
      useStudioStore.getState().setCameraScale(cameraRef.current.scale);
      scheduleRedraw();
    }

    // ── Mouse Down ────────────────────────────────────────────────────────────
    function handleMouseDown(e: MouseEvent): void {
      canvas.focus();
      const s = stateRef.current;

      // Middle-click or space+left = pan (always)
      // Left-click with Pan tool = pan too
      if (
        e.button === 1 ||
        (e.button === 0 && ptrRef.current.spaceHeld) ||
        (e.button === 0 && s.activeTool === 'pan')
      ) {
        ptrRef.current.isPanning = true;
        ptrRef.current.lastX     = e.clientX;
        ptrRef.current.lastY     = e.clientY;
        updateCursor();
        return;
      }

      if (e.button !== 0) return;
      ptrRef.current.hasMoved = false;
      ptrRef.current.downX    = e.clientX;
      ptrRef.current.downY    = e.clientY;
      ptrRef.current.lastX    = e.clientX;
      ptrRef.current.lastY    = e.clientY;

      const pt = getSnappedPage(e);

      switch (s.activeTool) {
        case 'select': {
          const raw  = resolveLocalPageXY(pageXY(e));
          const tol  = 7 / cameraRef.current.scale;
          const ppi  = getPpi(s);
          const sel  = s.selectedId ? s.shapes.find(sh => sh.id === s.selectedId && sh.pageId === s.activePageId) : undefined;
          // 1. a handle of the selected shape (Alt-click a vertex removes it)
          if (sel && !sel.locked) {
            const h = hitHandle(sel, raw, tol);
            if (h) {
              if (e.altKey && h.kind === 'vertex') {
                useStudioStore.getState().updateShape(sel.id, removeVertex(sel, h.index, ppi));
                break;
              }
              dragRef.current = { mode: 'handle', shapeId: sel.id, handle: h, start: raw, orig: sel, started: false };
              break;
            }
          }
          // 2. a shape body → select it and get ready to move it
          const hit = hitTest(raw, visibleShapes(s.shapes).filter(sh => sh.pageId === s.activePageId), tol);
          if (!hit) {
            const l = linkAt(raw);
            if (l) { followLink(l); break; }
          }
          useStudioStore.getState().selectShape(hit?.id ?? null);
          if (hit && !hit.locked) {
            dragRef.current = { mode: 'move', shapeId: hit.id, handle: null, start: raw, orig: hit, started: false };
          }
          break;
        }
        case 'polyline': {
          const ip = inProgressRef.current;
          if (!ip || ip.type !== 'polyline') {
            inProgressRef.current = { type: 'polyline', points: [pt], cursor: pt };
          } else {
            const last = ip.points[ip.points.length - 1];
            const next = e.shiftKey ? constrainAngle(last, pt) : pt;
            inProgressRef.current = { type: 'polyline', points: [...ip.points, next], cursor: next };
          }
          break;
        }
        case 'tcount': {
          commitMarker(pt, s);
          break;
        }
        case 'text': {
          inProgressRef.current = { type: 'text', start: pt, cursor: pt, leader: null };
          break;
        }
        case 'callout': {
          const ip = inProgressRef.current;
          if (!ip || ip.type !== 'text' || !ip.leader) {
            // first click: the point the callout points at
            inProgressRef.current = { type: 'text', start: null, cursor: pt, leader: pt };
          } else if (!ip.start) {
            // then press-drag the text box
            inProgressRef.current = { ...ip, start: pt, cursor: pt };
          }
          break;
        }
        case 'line':
        case 'arrow': {
          const ip = inProgressRef.current;
          if (!ip || ip.type !== 'line' || !ip.start) {
            inProgressRef.current = { type: 'line', start: pt, cursor: pt };
          } else {
            // Second click → commit (shift-constrain to 0°/45°/90°)
            const finalPt = e.shiftKey ? constrainAngle(ip.start, pt) : pt;
            commitLine(ip.start, finalPt, s);
            inProgressRef.current = null;
            snapRef.current = SNAP_NONE;
          }
          break;
        }
        case 'rect': {
          inProgressRef.current = { type: 'rect', start: pt, cursor: pt };
          break;
        }
        case 'polygon':
        case 'cloud': {
          const ip = inProgressRef.current;
          if (!ip || ip.type !== 'polygon') {
            inProgressRef.current = { type: 'polygon', points: [pt], cursor: pt };
          } else {
            // Check if clicking near first vertex → close
            const first = ip.points[0];
            if (ip.points.length >= 3) {
              const distToFirst = distancePx(pt, first) * cameraRef.current.scale;
              if (distToFirst < s.snapThreshold * 1.5) {
                commitPolygon(ip.points, s);
                inProgressRef.current = null;
                snapRef.current = SNAP_NONE;
                break;
              }
            }
            inProgressRef.current = { type: 'polygon', points: [...ip.points, pt], cursor: pt };
          }
          break;
        }
        case 'calibrate': {
          const ip = inProgressRef.current;
          if (!ip || ip.type !== 'calibrate' || !ip.start) {
            inProgressRef.current = { type: 'calibrate', start: pt, cursor: pt };
          }
          break;
        }
      }

      scheduleRedraw();
    }

    // ── Mouse Move ────────────────────────────────────────────────────────────
    function handleMouseMove(e: MouseEvent): void {
      if (ptrRef.current.isPanning) {
        // Use stored lastX/Y delta — movementX/Y is unreliable in Electron
        const dx = e.clientX - ptrRef.current.lastX;
        const dy = e.clientY - ptrRef.current.lastY;
        ptrRef.current.lastX = e.clientX;
        ptrRef.current.lastY = e.clientY;
        cameraRef.current.pan(dx, dy);
        scheduleRedraw();
        return;
      }

      // Select-tool drag (move / reshape) — one undo step per drag
      const dr = dragRef.current;
      if (dr) {
        const s0  = stateRef.current;
        const raw = resolveLocalPageXY(pageXY(e));
        const movedPx = Math.hypot(e.clientX - ptrRef.current.downX, e.clientY - ptrRef.current.downY);
        if (!dr.started && movedPx < 3) return;
        const store = useStudioStore.getState();
        if (!dr.started) { store.beginEdit(); dr.started = true; }
        const ppi = getPpi(s0);
        let next: DrawnShape;
        if (dr.mode === 'move') {
          next = translate(dr.orig, raw.x - dr.start.x, raw.y - dr.start.y, ppi);
        } else {
          const tgt = getSnappedPage(e);
          next = applyHandleDrag(dr.orig, dr.handle!, tgt, ppi);
        }
        store.replaceShapeLive(next);
        scheduleRedraw();
        return;
      }

      if (stateRef.current.activeTool === 'select' && !inProgressRef.current) {
        const l = linkAt(resolveLocalPageXY(pageXY(e)));
        useNavStore.getState().setHoverLink(l);
        canvas.style.cursor = l ? 'pointer' : CURSOR.select;
      }

      const pt = getSnappedPage(e);

      const ip = inProgressRef.current;
      if (ip) {
        if (ip.type === 'line'      && ip.start)         ip.cursor = e.shiftKey ? constrainAngle(ip.start, pt) : pt;
        if (ip.type === 'rect'      && ip.start)         ip.cursor = pt;
        if (ip.type === 'text')                          ip.cursor = pt;
        if (ip.type === 'polygon')                       ip.cursor = pt;
        if (ip.type === 'polyline') {
          const last = ip.points[ip.points.length - 1];
          ip.cursor = e.shiftKey && last ? constrainAngle(last, pt) : pt;
        }
        if (ip.type === 'calibrate' && ip.start)         ip.cursor = e.shiftKey ? constrainAngle(ip.start, pt) : pt;
      }

      ptrRef.current.hasMoved =
        Math.abs(e.clientX - ptrRef.current.downX) > 2 ||
        Math.abs(e.clientY - ptrRef.current.downY) > 2;

      scheduleRedraw();
    }

    // ── Mouse Up ──────────────────────────────────────────────────────────────
    function handleMouseUp(e: MouseEvent): void {
      if (ptrRef.current.isPanning) {
        ptrRef.current.isPanning = false;
        updateCursor();
        return;
      }

      if (e.button !== 0) return;
      if (dragRef.current) {
        if (dragRef.current.started) useStudioStore.getState().endEdit();
        dragRef.current = null;
        snapRef.current = SNAP_NONE;
        scheduleRedraw();
        return;
      }
      const s  = stateRef.current;
      const pt = getSnappedPage(e);

      // Text box / callout box
      if (s.activeTool === 'text' || s.activeTool === 'callout') {
        const ip = inProgressRef.current;
        if (ip?.type === 'text' && ip.start) {
          const sc = cameraRef.current.scale;
          const a = ip.start;
          let b = pt;
          if (!ptrRef.current.hasMoved || (Math.abs(b.x - a.x) * sc < 6 && Math.abs(b.y - a.y) * sc < 6)) {
            b = { x: a.x + 180 / sc, y: a.y + 40 / sc };    // a click makes a default-size box
          }
          const id = commitText(a, b, ip.leader ?? null, s, sc);
          inProgressRef.current = null;
          snapRef.current = SNAP_NONE;
          useStudioStore.getState().setPendingTextEdit(id);
          scheduleRedraw();
          return;
        }
      }

      // Area tool: press-drag-release draws a rectangle area (clicks still draw a polygon)
      if (s.activeTool === 'polygon' || s.activeTool === 'cloud') {
        const ip = inProgressRef.current;
        if (ip?.type === 'polygon' && ip.points.length === 1 && ptrRef.current.hasMoved) {
          const a = ip.points[0];
          if (Math.abs(pt.x - a.x) * cameraRef.current.scale > 4 && Math.abs(pt.y - a.y) * cameraRef.current.scale > 4) {
            commitPolygon([a, { x: pt.x, y: a.y }, pt, { x: a.x, y: pt.y }], s);
            inProgressRef.current = null;
            snapRef.current = SNAP_NONE;
            scheduleRedraw();
            return;
          }
        }
      }

      if (s.activeTool === 'rect') {
        const ip = inProgressRef.current;
        if (ip?.type === 'rect' && ip.start && ptrRef.current.hasMoved) {
          commitRect(ip.start, pt, s);
          inProgressRef.current = null;
          snapRef.current = SNAP_NONE;
        } else {
          inProgressRef.current = null;
        }
        scheduleRedraw();
      }

      if (s.activeTool === 'calibrate') {
        const ip = inProgressRef.current;
        if (ip?.type === 'calibrate' && ip.start && ptrRef.current.hasMoved) {
          const finalPt = e.shiftKey ? constrainAngle(ip.start, pt) : pt;
          const dist = distancePx(ip.start, finalPt);
          useStudioStore.getState().setPendingCalibrationLine({
            start:  ip.start,
            end:    finalPt,
            distPx: dist,
          });
          inProgressRef.current = null;
          snapRef.current = SNAP_NONE;
          scheduleRedraw();
        }
      }
    }

    // ── Double Click (close polygon) ──────────────────────────────────────────
    function handleDblClick(e: MouseEvent): void {
      const ip = inProgressRef.current;
      const s  = stateRef.current;
      if (ip?.type === 'polyline') {
        // the dblclick's second mousedown already added a duplicate final point
        const pts = dedupeTail(ip.points);
        if (pts.length >= 2) commitPolyline(pts, s);
        inProgressRef.current = null;
        snapRef.current = SNAP_NONE;
        scheduleRedraw();
        return;
      }
      if (s.activeTool === 'select' && s.selectedId) {
        // double-click an edge of the selected polygon / polylength → add a vertex there
        const sel = s.shapes.find(sh => sh.id === s.selectedId);
        if (sel && !sel.locked) {
          const raw = resolveLocalPageXY(pageXY(e));
          const ed  = hitEdge(sel, raw, 7 / cameraRef.current.scale);
          if (ed) {
            useStudioStore.getState().updateShape(sel.id, insertVertex(sel, ed.index, ed.at, getPpi(s)));
            return;
          }
        }
      }
      if (s.activeTool === 'select') {
        // double-click a markup → type its quantity (Bluebeam: edit the measurement label)
        const raw = resolveLocalPageXY(pageXY(e));
        const hit = hitTest(raw, visibleShapes(s.shapes).filter(sh => sh.pageId === s.activePageId), 7 / cameraRef.current.scale);
        if (hit && !hit.locked && hit.type === 'text') {
          useStudioStore.getState().selectShape(hit.id);
          useStudioStore.getState().setPendingTextEdit(hit.id);
          return;
        }
        if (hit && !hit.locked && (hit.subject || hit.type === 'polyline')) {
          useStudioStore.getState().selectShape(hit.id);
          useStudioStore.getState().setPendingQtyEdit({ shapeId: hit.id, screenX: e.clientX, screenY: e.clientY });
          return;
        }
      }
      if (ip?.type === 'polygon' && ip.points.length >= 3) {
        commitPolygon(ip.points, s);
        inProgressRef.current = null;
        snapRef.current = SNAP_NONE;
        scheduleRedraw();
      }
    }

    // ── Keyboard ──────────────────────────────────────────────────────────────
    function handleKeyDown(e: KeyboardEvent): void {
      const store = useStudioStore.getState();

      // Space = temporary pan mode
      if (e.code === 'Space' && !e.repeat) {
        ptrRef.current.spaceHeld = true;
        canvas.style.cursor = CURSOR.pan;
        e.preventDefault();
        return;
      }

      // Ignore typing in inputs (Tool Chest search, properties, …)
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

      // Ctrl+F — search the set
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        useNavStore.getState().setShowSearch(true); e.preventDefault(); return;
      }

      // Undo / redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        store.undo(); e.preventDefault(); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        store.redo(); e.preventDefault(); return;
      }

      // Polylength in progress: Enter finishes, Backspace drops the last point
      const ipk = inProgressRef.current;
      if (ipk?.type === 'polyline') {
        if (e.key === 'Enter') {
          if (ipk.points.length >= 2) commitPolyline(ipk.points, stateRef.current);
          inProgressRef.current = null; snapRef.current = SNAP_NONE; scheduleRedraw(); e.preventDefault(); return;
        }
        if (e.key === 'Backspace') {
          const pts = ipk.points.slice(0, -1);
          inProgressRef.current = pts.length ? { ...ipk, points: pts } : null;
          scheduleRedraw(); e.preventDefault(); return;
        }
      }
      if (ipk?.type === 'polygon' && e.key === 'Enter' && ipk.points.length >= 3) {
        commitPolygon(ipk.points, stateRef.current);
        inProgressRef.current = null; snapRef.current = SNAP_NONE; scheduleRedraw(); e.preventDefault(); return;
      }

      // Arrow keys nudge the selected markup (Shift = 10×)
      if (e.key.startsWith('Arrow') && stateRef.current.selectedId && !inProgressRef.current) {
        const sel = stateRef.current.shapes.find(x => x.id === stateRef.current.selectedId);
        if (sel && !sel.locked) {
          const step = (e.shiftKey ? 10 : 1) / cameraRef.current.scale;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          store.updateShape(sel.id, translate(sel, dx, dy, getPpi(stateRef.current)));
          e.preventDefault(); return;
        }
      }

      // Previous / next view (Bluebeam Alt+Left / Alt+Right)
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const v = e.key === 'ArrowLeft' ? useNavStore.getState().popBack(currentView()) : useNavStore.getState().popForward(currentView());
        if (v) restoreView(v);
        e.preventDefault(); return;
      }
      // Next / previous page
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        const st0 = stateRef.current;
        const i = st0.pages.findIndex(p => p.id === st0.activePageId);
        const j = e.key === 'PageDown' ? i + 1 : i - 1;
        if (j >= 0 && j < st0.pages.length) {
          useNavStore.getState().pushView(currentView());
          store.setActivePage(st0.pages[j].id);
          setTimeout(() => fitToPage(), 0);
        }
        e.preventDefault(); return;
      }
      // Bluebeam measurement shortcuts: Shift+Alt+L length, N polylength, A area, C count
      if (e.shiftKey && e.altKey && !e.ctrlKey) {
        const mt: Record<string, ToolType> = { l: 'line', n: 'polyline', a: 'polygon', c: 'tcount' };
        const t = mt[e.key.toLowerCase()] ?? mt[e.code.replace('Key', '').toLowerCase()];
        if (t) { store.setActiveSubject(null); store.setActiveTool(t); e.preventDefault(); return; }
      }

      // Escape = cancel current drawing
      if (e.key === 'Escape') {
        if (!inProgressRef.current && !stateRef.current.selectedId && stateRef.current.activeTool !== 'select') {
          // nothing in progress: Esc puts the tool down (Bluebeam behaviour)
          store.setActiveSubject(null);
          store.setActiveTool('select');
        }
        inProgressRef.current = null;
        dragRef.current = null;
        snapRef.current = SNAP_NONE;
        store.selectShape(null);
        scheduleRedraw();
        return;
      }

      // Delete / Backspace = remove selected shape
      if ((e.key === 'Delete' || e.key === 'Backspace') && stateRef.current.selectedId) {
        store.removeShape(stateRef.current.selectedId);
        return;
      }

      // ── Ctrl+C = Copy selected shape ─────────────────────────────────
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        const selId = stateRef.current.selectedId;
        if (selId) {
          const shape = stateRef.current.shapes.find(s => s.id === selId);
          if (shape) setClipboard({ ...shape });
        }
        e.preventDefault();
        return;
      }

      // ── Ctrl+V = Paste from clipboard ────────────────────────────────
      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        const clip = getClipboard();
        if (clip && (clip.type === 'rect' || clip.type === 'polygon')) {
          const cloned = { ...clip, id: crypto.randomUUID(), pageId: stateRef.current.activePageId } as typeof clip;
          if (cloned.type === 'rect') {
            cloned.origin = { x: cloned.origin.x + 20, y: cloned.origin.y + 20 };
          } else if (cloned.type === 'polygon') {
            cloned.points = cloned.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
          }
          store.addShape(cloned);
          store.selectShape(cloned.id);
          scheduleRedraw();
        }
        e.preventDefault();
        return;
      }

      // ── Ctrl+D = Duplicate selected shape ────────────────────────────
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        const selId = stateRef.current.selectedId;
        if (selId) {
          const shape = stateRef.current.shapes.find(s => s.id === selId);
          if (shape && (shape.type === 'rect' || shape.type === 'polygon')) {
            const cloned = { ...shape, id: crypto.randomUUID() } as typeof shape;
            if (cloned.type === 'rect') {
              cloned.origin = { x: cloned.origin.x + 20, y: cloned.origin.y + 20 };
            } else if (cloned.type === 'polygon') {
              cloned.points = cloned.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
            }
            store.addShape(cloned);
            store.selectShape(cloned.id);
            scheduleRedraw();
          }
        }
        e.preventDefault();
        return;
      }

      // Tool shortcuts
      // Note: 'r'→rake, 'c'→count, 'w'→wand take priority over old rect/calibrate.
      // Rect is now 'b' (box), calibrate is 'a'.
      // Bluebeam single-key tools: V select, L line, A arrow, R rectangle, P polygon, N polyline,
      // C cloud, T text box, Q callout.  (Toolbox counts: Shift+Alt+C.  Calibrate: K.)
      const shortcuts: Record<string, ToolType> = {
        v: 'select',  h: 'pan',   l: 'line',  a: 'arrow',
        r: 'rect',    b: 'rect',  p: 'polygon', n: 'polyline',
        c: 'cloud',   t: 'text',  q: 'callout',
        k: 'calibrate', f: 'frame',
      };
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() in shortcuts) {
        // a plain tool shortcut drops the Tool Chest subject (back to plain markups)
        store.setActiveSubject(null);
        store.setActiveTool(shortcuts[e.key.toLowerCase()]);
      }

      // Zoom shortcuts
      if ((e.key === '+' || e.key === '=') && !e.ctrlKey) { zoomIn();  e.preventDefault(); }
      if  (e.key === '-'                   && !e.ctrlKey) { zoomOut(); e.preventDefault(); }
      if  (e.key === '0'                   && !e.ctrlKey) { fitToPage(); e.preventDefault(); }

      // Ctrl+O = Open PDF
      if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void openPdf();
      }
    }

    function handleKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') {
        ptrRef.current.spaceHeld = false;
        updateCursor();
      }
    }

    // ── Attach events ─────────────────────────────────────────────────────────
    canvas.addEventListener('wheel',       handleWheel,   { passive: false });
    canvas.addEventListener('mousedown',   handleMouseDown);
    canvas.addEventListener('dblclick',    handleDblClick);
    function handleContextMenu(e: MouseEvent): void {
      e.preventDefault();
      const cb = onContextMenuRef.current;
      const rect    = canvas.getBoundingClientRect();
      const pagePt  = cameraRef.current.screenToPage(e.clientX - rect.left, e.clientY - rect.top);
      const hit     = hitTest(pagePt, visibleShapes(stateRef.current.shapes), 7 / cameraRef.current.scale);
      console.log('[contextMenu] right-click at', { clientX: e.clientX, clientY: e.clientY, pagePt }, 'hit:', hit?.id, hit?.type, 'callback:', !!cb);
      if (!cb) return;
      if (hit && (hit.type === 'rect' || hit.type === 'polygon')) {
        useStudioStore.getState().selectShape(hit.id);
        cb({ shape: hit as RectShape | PolygonShape, screenX: e.clientX, screenY: e.clientY });
      }
    }
    canvas.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mousemove',   handleMouseMove);
    window.addEventListener('mouseup',     handleMouseUp);
    window.addEventListener('keydown',     handleKeyDown);
    window.addEventListener('keyup',       handleKeyUp);

    scheduleRedraw();

    return () => {
      unsubStore();
      unsubProjectStore();
      unsubNav();
      resizeObserver.disconnect();
      canvas.removeEventListener('wheel',       handleWheel);
      canvas.removeEventListener('mousedown',   handleMouseDown);
      canvas.removeEventListener('dblclick',    handleDblClick);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousemove',   handleMouseMove);
      window.removeEventListener('mouseup',     handleMouseUp);
      window.removeEventListener('keydown',     handleKeyDown);
      window.removeEventListener('keyup',       handleKeyUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Tile manager: clear GPU bitmaps to free memory
      tileManagerRef.current.clearAll();
    };
  }, [containerRef, canvasRef, scheduleRedraw, fitToPage, zoomIn, zoomOut, openPdf]);

  return api;
}

// ── Commit helpers (called inside event handlers) ─────────────────────────────

function getPpi(s: EngineState): number {
  return s.calibrations[s.activePageId]?.pixelsPerInch ?? DEFAULT_PDF_PPI;
}

/** Tool Chest stamp: subject, role and colours for a new markup. */
function stamp(s: EngineState): Partial<DrawnShape> {
  // annotation tools are markups, not takeoff: red like Bluebeam, no Tool Chest subject
  if (s.activeTool === 'cloud') return { author: 'user', style: 'cloud', color: '#FF0000' };
  if (s.activeTool === 'arrow') return { author: 'user', style: 'arrow', color: '#FF0000' };
  const t = s.activeSubject;
  if (!t) return { author: 'user' };
  return { subject: t.subject, subjectRole: t.role, color: t.stroke, fill: t.fill, opacity: t.opacity, author: 'user' };
}

function dedupeTail(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out = pts.slice();
  while (out.length >= 2) {
    const a = out[out.length - 1], b = out[out.length - 2];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.5) out.pop(); else break;
  }
  return out;
}

function commitPolyline(points: { x: number; y: number }[], s: EngineState): void {
  const ppi = getPpi(s);
  const L   = polylineLengthPx(points);
  if (L < 1) return;
  const shape: PolylineShape = {
    id: crypto.randomUUID(), pageId: s.activePageId, type: 'polyline',
    points, lengthPx: L, lengthInches: L / ppi, ...stamp(s),
  } as PolylineShape;
  useStudioStore.getState().addShape(shape);
}

function commitText(a: { x: number; y: number }, b: { x: number; y: number }, leader: { x: number; y: number } | null, s: EngineState, scale: number): string {
  const shape: TextShape = {
    id: crypto.randomUUID(), pageId: s.activePageId, type: 'text',
    origin: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    widthPx: Math.max(Math.abs(b.x - a.x), 20 / scale), heightPx: Math.max(Math.abs(b.y - a.y), 14 / scale),
    text: '', fontSize: 12 / Math.max(scale, 0.05), leader, author: 'user', color: '#FF0000',
  };
  useStudioStore.getState().addShape(shape);
  return shape.id;
}

function commitMarker(pt: { x: number; y: number }, s: EngineState): void {
  const shape: MarkerShape = {
    id: crypto.randomUUID(), pageId: s.activePageId, type: 'marker',
    position: pt, countGroupId: s.activeSubject?.subject ?? 'count', ...stamp(s),
  } as MarkerShape;
  useStudioStore.getState().addShape(shape);
}

function commitLine(
  start: { x: number; y: number },
  end:   { x: number; y: number },
  s:     EngineState,
): void {
  const ppi    = getPpi(s);
  const lenPx  = distancePx(start, end);
  const shape: LineShape = {
    id:           crypto.randomUUID(),
    pageId:       s.activePageId,
    type:         'line',
    start,
    end,
    lengthPx:     lenPx,
    lengthInches: lenPx / ppi,
    ...stamp(s),
  } as LineShape;
  useStudioStore.getState().addShape(shape);
}

function commitRect(
  start: { x: number; y: number },
  end:   { x: number; y: number },
  s:     EngineState,
): void {
  const ppi    = getPpi(s);
  const x      = Math.min(start.x, end.x);
  const y      = Math.min(start.y, end.y);
  const wPx    = Math.abs(end.x - start.x);
  const hPx    = Math.abs(end.y - start.y);
  if (wPx < 2 || hPx < 2) return;

  const shape: RectShape = {
    id:           crypto.randomUUID(),
    pageId:       s.activePageId,
    type:         'rect',
    origin:       { x, y },
    widthPx:      wPx,
    heightPx:     hPx,
    widthInches:  wPx / ppi,
    heightInches: hPx / ppi,
    ...stamp(s),
  } as RectShape;
  useStudioStore.getState().addShape(shape);
}

function commitPolygon(
  points: { x: number; y: number }[],
  s:      EngineState,
): void {
  const ppi = getPpi(s);
  const xs  = points.map(p => p.x);
  const ys  = points.map(p => p.y);
  const bbW = Math.max(...xs) - Math.min(...xs);
  const bbH = Math.max(...ys) - Math.min(...ys);

  const shape: PolygonShape = {
    id:             crypto.randomUUID(),
    pageId:         s.activePageId,
    type:           'polygon',
    points,
    bbWidthPx:      bbW,
    bbHeightPx:     bbH,
    bbWidthInches:  bbW / ppi,
    bbHeightInches: bbH / ppi,
    ...stamp(s),
  } as PolygonShape;
  useStudioStore.getState().addShape(shape);
}

/** Shapes to draw / hit: others' markups only while "Others' markups" is on. */
function visibleShapes(shapes: DrawnShape[]): DrawnShape[] {
  return useNavStore.getState().showExternal ? shapes : shapes.filter(x => x.author !== 'external');
}

function shapeBounds(sh: DrawnShape): { x: number; y: number; w: number; h: number } {
  const pts = sh.type === 'rect' || sh.type === 'text' ? [sh.origin, { x: sh.origin.x + sh.widthPx, y: sh.origin.y + sh.heightPx }]
    : sh.type === 'line' ? [sh.start, sh.end]
    : sh.type === 'marker' ? [sh.position]
    : sh.points;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// ── Hit testing ───────────────────────────────────────────────────────────────

function hitTest(
  pt:     { x: number; y: number },
  shapes: DrawnShape[],
  tol     = 8,
): DrawnShape | null {
  // Iterate in reverse so topmost (last drawn) wins
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === 'rect') {
      if (
        pt.x >= s.origin.x && pt.x <= s.origin.x + s.widthPx &&
        pt.y >= s.origin.y && pt.y <= s.origin.y + s.heightPx
      ) return s;
    } else if (s.type === 'line') {
      if (pointNearLine(pt, s.start, s.end, tol)) return s;
    } else if (s.type === 'polygon') {
      if (pointInPolygon(pt, s.points)) return s;
      for (let k = 0; k < s.points.length; k++) {
        if (pointNearLine(pt, s.points[k], s.points[(k + 1) % s.points.length], tol)) return s;
      }
    } else if (s.type === 'polyline') {
      for (let k = 1; k < s.points.length; k++) {
        if (pointNearLine(pt, s.points[k - 1], s.points[k], tol)) return s;
      }
    } else if (s.type === 'text') {
      if (pt.x >= s.origin.x && pt.x <= s.origin.x + s.widthPx && pt.y >= s.origin.y && pt.y <= s.origin.y + s.heightPx) return s;
      if (s.leader) {
        const c = { x: s.origin.x + s.widthPx / 2, y: s.origin.y + s.heightPx / 2 };
        if (pointNearLine(pt, s.leader, c, tol)) return s;
      }
    } else if (s.type === 'marker' && s.subject) {
      if (Math.hypot(pt.x - s.position.x, pt.y - s.position.y) <= tol * 1.6) return s;
    }
  }
  return null;
}

function pointNearLine(
  p:  { x: number; y: number },
  a:  { x: number; y: number },
  b:  { x: number; y: number },
  d:  number,
): boolean {
  const ab  = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  if (len === 0) return false;
  const t   = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (len * len)));
  const nx  = a.x + t * ab.x;
  const ny  = a.y + t * ab.y;
  return Math.sqrt((p.x - nx) ** 2 + (p.y - ny) ** 2) <= d;
}

function pointInPolygon(
  pt:  { x: number; y: number },
  pts: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
