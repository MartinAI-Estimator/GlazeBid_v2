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
import type { InProgressShape, DrawnShape, RectShape, LineShape, PolygonShape } from '../types/shapes';
import type { ContextMenuTarget } from '../components/canvas/ShapeContextMenu';
import {
  useStudioStore,
  DEFAULT_PAGE_W,
  DEFAULT_PAGE_H,
  type ToolType,
  type PageState,
} from '../store/useStudioStore';
import type { PageCalibration } from '../engine/coordinateSystem';
import { useProjectStore } from '../store/useProjectStore';

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
};

const SNAP_NONE: SnapResult = { snapped: false, point: { x: 0, y: 0 }, snapType: 'none' };

const CURSOR: Record<ToolType | 'panning', string> = {
  select:    'default',
  pan:       'grab',
  panning:   'grabbing',
  line:      'crosshair',
  rect:      'crosshair',
  polygon:   'crosshair',
  calibrate: 'crosshair',
  frame:     'crosshair',
  rake:      'crosshair',
  count:     'cell',
  wand:      'copy',
  ghost:     'crosshair',
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
  });
  const inProgressRef      = useRef<InProgressShape | null>(null);
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

      renderFrame({
        ctx,
        canvas,
        camera:     cam,
        dpr,
        pageWidth:  pg?.widthPx  ?? DEFAULT_PAGE_W,
        pageHeight: pg?.heightPx ?? DEFAULT_PAGE_H,
        shapes:     s.shapes,   // renderEngine filters by pageId in continuous mode
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
    pdfBufferRef.current = buffer;
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

  const api = useMemo<CanvasEngineAPI>(
    () => ({ fitToPage, zoomIn, zoomOut, openPdf, loadPdfBuffer, screenToPage, pageToScreen, getSnap, getPdfBuffer: () => pdfBufferRef.current, rake: undefined as never, count: undefined as never, wand: undefined as never, ghost: undefined as never }),
    [fitToPage, zoomIn, zoomOut, openPdf, loadPdfBuffer, screenToPage, pageToScreen, getSnap],
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
      };
      scheduleRedraw();
    });

    // Subscribe to project store so TypeCountDot changes also trigger a redraw
    const unsubProjectStore = useProjectStore.subscribe(() => {
      scheduleRedraw();
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

    function updateCursor(): void {
      const s = stateRef.current;
      canvas.style.cursor = ptrRef.current.isPanning
        ? CURSOR.panning
        : CURSOR[s.activeTool];
    }

    // ── Wheel (zoom) ─────────────────────────────────────────────────────────
    function handleWheel(e: WheelEvent): void {
      e.preventDefault();
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
          // Hit-test: find topmost shape covering the click
          const hit = hitTest(pt, s.shapes.filter(sh => sh.pageId === s.activePageId));
          useStudioStore.getState().selectShape(hit?.id ?? null);
          break;
        }
        case 'line': {
          const ip = inProgressRef.current;
          if (!ip || ip.type !== 'line' || !ip.start) {
            inProgressRef.current = { type: 'line', start: pt, cursor: pt };
          } else {
            // Second click → commit
            commitLine(ip.start, pt, s);
            inProgressRef.current = null;
            snapRef.current = SNAP_NONE;
          }
          break;
        }
        case 'rect': {
          inProgressRef.current = { type: 'rect', start: pt, cursor: pt };
          break;
        }
        case 'polygon': {
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

      const pt = getSnappedPage(e);

      const ip = inProgressRef.current;
      if (ip) {
        if (ip.type === 'line'      && ip.start)         ip.cursor = pt;
        if (ip.type === 'rect'      && ip.start)         ip.cursor = pt;
        if (ip.type === 'polygon')                       ip.cursor = pt;
        if (ip.type === 'calibrate' && ip.start)         ip.cursor = pt;
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
      const s  = stateRef.current;
      const pt = getSnappedPage(e);

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
          const dist = distancePx(ip.start, pt);
          useStudioStore.getState().setPendingCalibrationLine({
            start:  ip.start,
            end:    pt,
            distPx: dist,
          });
          inProgressRef.current = null;
          snapRef.current = SNAP_NONE;
          scheduleRedraw();
        }
      }
    }

    // ── Double Click (close polygon) ──────────────────────────────────────────
    function handleDblClick(_e: MouseEvent): void {
      const ip = inProgressRef.current;
      const s  = stateRef.current;
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

      // Escape = cancel current drawing
      if (e.key === 'Escape') {
        inProgressRef.current = null;
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

      // Tool shortcuts
      // Note: 'r'→rake, 'c'→count, 'w'→wand take priority over old rect/calibrate.
      // Rect is now 'b' (box), calibrate is 'a'.
      const shortcuts: Record<string, ToolType> = {
        v: 'select',  h: 'pan',   l: 'line',
        b: 'rect',    p: 'polygon',
        a: 'calibrate', f: 'frame',
        r: 'rake',    c: 'count', w: 'wand',
      };
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() in shortcuts) {
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
      if (!cb) return;
      const rect    = canvas.getBoundingClientRect();
      const pagePt  = cameraRef.current.screenToPage(e.clientX - rect.left, e.clientY - rect.top);
      const hit     = hitTest(pagePt, stateRef.current.shapes);
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
  };
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
  };
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
  };
  useStudioStore.getState().addShape(shape);
}

// ── Hit testing ───────────────────────────────────────────────────────────────

function hitTest(
  pt:     { x: number; y: number },
  shapes: DrawnShape[],
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
      if (pointNearLine(pt, s.start, s.end, 8)) return s;
    } else if (s.type === 'polygon') {
      if (pointInPolygon(pt, s.points)) return s;
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
