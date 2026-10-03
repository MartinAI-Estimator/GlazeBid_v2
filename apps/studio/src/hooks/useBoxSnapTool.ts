/**
 * useBoxSnapTool.ts  —  Box & Snap: drag a region, AiQ vision returns glazing
 * detections with real geometry.
 *
 * ── Why this lives in Studio ─────────────────────────────────────────────────
 * Studio's PAGE space IS PyMuPDF page space: 72 pt/in, top-left origin, y down,
 * and — verified empirically at /Rotate 0 and 90 — identical even for rotated
 * sheets, because PDF.js `getViewport({scale})` and PyMuPDF `page.rect` both
 * apply the page's intrinsic rotation the same way.  So a page-space rect from
 * `engine.screenToPage()` can be handed straight to the sidecar as a fitz
 * clip rect with NO conversion layer.  (Builder needed one; Studio does not.)
 *
 * ── Interaction model ────────────────────────────────────────────────────────
 *  • S shortcut → activates the tool
 *  • Drag       → live preview rect (page space)
 *  • Release    → POST the region, append detections
 *  • Escape     → cancels an in-progress drag (and dismisses an error)
 *  • Space-pan  → space held during drag passes through to engine pan
 *
 * Follows the capture-phase listener strategy of useGhostTool / useWandTool:
 * listeners attach on the canvas in capture mode and call
 * stopImmediatePropagation() so the canvas engine never sees the same event.
 * That is what keeps the drag from fighting the engine's pan/marquee logic.
 *
 * ── Backend ──────────────────────────────────────────────────────────────────
 * Unchanged from the Builder build:
 *   window.electron.runRegionTakeoff(...)      Studio preload
 *     → ipcMain 'glazierai:runRegion'          electron/main.ts (attaches key)
 *     → POST /drawing-intelligence/run-region  sidecar
 *   ← { detections: [{ system_type, bbox, confidence, description, mark }] }
 * bbox comes back in fitz page space = Studio page space. Nothing to convert.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useStudioStore, type PageState } from '../store/useStudioStore';
import { useProjectStore } from '../store/useProjectStore';
import { pageToInches } from '../engine/coordinateSystem';
import { computePageLayout } from '../engine/renderEngine';
import type { CanvasEngineAPI } from './useCanvasEngine';
import type { RectShape } from '../types/shapes';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A rectangle in PAGE space (= fitz page space). */
export type PageRect = { x0: number; y0: number; x1: number; y1: number };

export type BoxSnapDetection = {
  id: string;
  /** Canonical Builder system type: 'Ext SF' | 'Int SF' | 'Cap CW' | 'SSG CW',
   *  or a raw scope_type the backend could not map. */
  systemType: string;
  /** Page space — draw directly with engine.pageToScreen(). */
  bbox: PageRect;
  confidence: number;
  description: string;
  mark: string | null;
  /** Glass lites across / high, as the backend resolved them (≥ 1). */
  bayCount: number;
  rowCount: number;
  /** 'geometry' | 'vision' | 'geometry+vision' | 'default' */
  gridSource: string;
  /** Studio page this belongs to; detections are filtered by active page. */
  pageId: string;
  status: 'pending' | 'accepted' | 'rejected';
};

/** Coerce a backend count to a usable integer ≥ 1 (null / NaN / 0 → 1). */
export function asGridCount(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export type BoxSnapState = {
  /**
   * Live drag rect in VIRTUAL space (what engine.pageToScreen consumes
   * directly). In single-page mode virtual == page-local.
   */
  dragPreview: PageRect | null;
  detections: BoxSnapDetection[];
  isRunning: boolean;
  error: string | null;
  accept: (id: string) => void;
  reject: (id: string) => void;
  clear: () => void;
  dismissError: () => void;
};

// ── Tunables ──────────────────────────────────────────────────────────────────

/** Ignore accidental micro-drags (CSS px, matches useGhostTool's threshold). */
const MIN_DRAG_CSS_PX = 10;

// ── Debug logging ─────────────────────────────────────────────────────────────
// DEBUG (2026-09-18): the release → IPC chain was dying silently. Every step
// now logs with a [BoxSnap] prefix, and every early return also surfaces in
// the status pill. Flip BOX_SNAP_DEBUG to false once the chain is confirmed.
const BOX_SNAP_DEBUG = true;
const TAG = '%c[BoxSnap]';
const TAG_STYLE = 'color:#0ea5e9;font-weight:bold';
function dlog(...args: unknown[]): void {
  if (BOX_SNAP_DEBUG) console.log(TAG, TAG_STYLE, ...args);
}
function dwarn(...args: unknown[]): void {
  if (BOX_SNAP_DEBUG) console.warn(TAG, TAG_STYLE, ...args);
}
function derr(...args: unknown[]): void {
  console.error(TAG, TAG_STYLE, ...args);   // errors always log
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(a: { x: number; y: number }, b: { x: number; y: number }): PageRect {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

function clampToPage(p: { x: number; y: number }, w: number, h: number) {
  return { x: Math.max(0, Math.min(w, p.x)), y: Math.max(0, Math.min(h, p.y)) };
}

// ── Continuous-scroll coordinate translation ─────────────────────────────────
//
// In continuous-scroll mode the camera maps to a VIRTUAL canvas in which every
// page is stacked top-to-bottom (renderEngine.computePageLayout, 24px gaps),
// and the renderer draws each page inside `ctx.translate(0, yOffset)` — so the
// x offset is always 0 and only y shifts. Shapes are stored PAGE-LOCAL and the
// renderer adds the offset at draw time.
//
// engine.screenToPage() / pageToScreen() are raw camera transforms: they speak
// VIRTUAL space. The engine's own localization (resolveLocalPageXY) is a
// private closure, not on CanvasEngineAPI — so we recompute it here from the
// same exported computePageLayout, which keeps the two in lockstep.

/** y-offset of each page in virtual space; all zeros in single-page mode. */
export function pageYOffsets(
  pages: PageState[],
  continuousScroll: boolean,
): Map<string, number> {
  const m = new Map<string, number>();
  if (!continuousScroll || pages.length <= 1) {
    for (const p of pages) m.set(p.id, 0);
    return m;
  }
  for (const { page, yOffset } of computePageLayout(pages)) m.set(page.id, yOffset);
  return m;
}

/** Which page does a VIRTUAL point fall on, and what is it in page-local space? */
export function localize(
  virtualPt: { x: number; y: number },
  pages: PageState[],
  continuousScroll: boolean,
  activePageId: string,
): { page: PageState; yOffset: number; local: { x: number; y: number } } | null {
  if (!continuousScroll || pages.length <= 1) {
    const page = pages.find(p => p.id === activePageId) ?? pages[0];
    if (!page) return null;
    return { page, yOffset: 0, local: virtualPt };
  }
  const layouts = computePageLayout(pages);
  for (const { page, yOffset } of layouts) {
    if (virtualPt.y >= yOffset && virtualPt.y < yOffset + page.heightPx) {
      return { page, yOffset, local: { x: virtualPt.x, y: virtualPt.y - yOffset } };
    }
  }
  // Landed in a gap between pages — snap to the nearest page so a drag that
  // starts a few px above a sheet still works instead of silently dying.
  let best: { page: PageState; yOffset: number } | null = null;
  let bestDist = Infinity;
  for (const { page, yOffset } of layouts) {
    const d = virtualPt.y < yOffset
      ? yOffset - virtualPt.y
      : virtualPt.y - (yOffset + page.heightPx);
    if (d >= 0 && d < bestDist) { bestDist = d; best = { page, yOffset }; }
  }
  if (!best) return null;
  return {
    page: best.page,
    yOffset: best.yOffset,
    local: { x: virtualPt.x, y: virtualPt.y - best.yOffset },
  };
}

/** Uint8Array → base64 without blowing the call stack on a large set. */
function bytesToBase64(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(reader.error);
    // Copy through a fresh buffer: the engine's buffer may be a view.
    reader.readAsDataURL(new Blob([bytes.slice()], { type: 'application/pdf' }));
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBoxSnapTool(
  canvasRef: RefObject<HTMLCanvasElement>,
  engine: CanvasEngineAPI,
): BoxSnapState {
  const [dragPreview, setDragPreview] = useState<PageRect | null>(null);
  const [detections, setDetections] = useState<BoxSnapDetection[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  const spaceRef = useRef(false);
  const busyRef = useRef(false);
  /** Monotonic ticket so a stale response can never overwrite a fresh one. */
  const ticketRef = useRef(0);

  // ── Submit a region ────────────────────────────────────────────────────────

  const runRegion = useCallback(async (region: PageRect, pageId: string, pdfPageIndex: number) => {
    dlog('runRegion ▶ called', { region, pageId, pdfPageIndex });

    const api = window.electron;
    if (!api?.runRegionTakeoff) {
      derr(
        'runRegion ✖ window.electron.runRegionTakeoff is not a function.',
        '\n  window.electron present:', !!api,
        '\n  exposed keys:', api ? Object.keys(api) : '(none)',
        '\n  → The Studio preload is stale. It is loaded from apps/studio/dist-electron/preload.js,',
        'which is only rebuilt on a FULL relaunch (GlazeBid.bat → scripts/build-preloads.mjs). HMR does not rebuild it.',
      );
      setError('Box & Snap bridge missing (stale preload) — fully restart GlazeBid.');
      return;
    }

    let buf: Uint8Array | null = null;
    try {
      buf = engine.getPdfBuffer();
    } catch (e) {
      derr('runRegion ✖ engine.getPdfBuffer() threw', e);
    }
    if (!buf) {
      derr('runRegion ✖ engine.getPdfBuffer() returned', buf, '— no PDF bytes held by the engine');
      setError('No PDF loaded.');
      return;
    }
    if (!Number.isInteger(pdfPageIndex) || pdfPageIndex < 0) {
      derr('runRegion ✖ bad pdfPageIndex', pdfPageIndex, 'for page', pageId);
      setError(`Bad page index (${String(pdfPageIndex)}).`);
      return;
    }
    dlog('runRegion · pdf bytes:', buf.byteLength);

    const myTicket = ++ticketRef.current;
    busyRef.current = true;
    setIsRunning(true);
    setError(null);
    dlog('runRegion · isRunning=true, ticket', myTicket);

    const t0 = performance.now();
    try {
      const pdfBase64 = await bytesToBase64(buf);
      dlog('runRegion · base64 length:', pdfBase64.length);

      const payload = {
        pdfBase64,
        pageIndex: pdfPageIndex,
        region: [region.x0, region.y0, region.x1, region.y1] as [number, number, number, number],
        projectName: useStudioStore.getState().pdfFileName ?? '',
      };
      dlog('runRegion · IPC glazierai:runRegion →', { ...payload, pdfBase64: `<${pdfBase64.length} chars>` });

      const res = await api.runRegionTakeoff(payload);
      const ms = Math.round(performance.now() - t0);
      dlog(`runRegion · IPC ← (${ms} ms)`, {
        ok: res?.ok,
        error: res?.error,
        status: res?.data?.status,
        detections: res?.data?.detections?.length,
        first: res?.data?.detections?.[0],
        tokens: res?.data?.tokens_used,
      });

      if (myTicket !== ticketRef.current) {
        dwarn('runRegion · response superseded (ticket', myTicket, '≠', ticketRef.current, ') — dropped');
        return;
      }
      if (!res?.ok) throw new Error(res?.error || 'Region takeoff failed (no error text from main process).');

      const rows = res.data?.detections ?? [];
      const mapped: BoxSnapDetection[] = [];
      rows.forEach((r, i) => {
        const b = r?.bbox;
        if (!Array.isArray(b) || b.length !== 4 || b.some(v => !Number.isFinite(v))) {
          dwarn(`runRegion · detection ${i} dropped — unusable bbox`, b);
          return;
        }
        mapped.push({
          id: crypto.randomUUID(),
          systemType: String(r.system_type ?? 'unknown'),
          bbox: { x0: b[0], y0: b[1], x1: b[2], y1: b[3] },
          confidence: Number(r.confidence ?? 0),
          description: String(r.description ?? ''),
          mark: r.mark ?? null,
          bayCount: asGridCount(r.bay_count),
          rowCount: asGridCount(r.row_count),
          gridSource: String(r.grid_source ?? 'default'),
          pageId,
          status: 'pending',
        });
      });

      dlog(`runRegion ✔ ${mapped.length}/${rows.length} detections mapped`, mapped);
      setDetections(prev => [...prev, ...mapped]);
      if (mapped.length === 0) setError('No glazing found in that region.');
    } catch (e) {
      derr('runRegion ✖ failed:', e);
      if (myTicket === ticketRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      // Always release the busy latch for OUR ticket. (Previously a clear()
      // mid-scan bumped the ticket, this finally skipped, and busyRef stayed
      // true forever — every later mousedown was then silently ignored.)
      if (myTicket === ticketRef.current) {
        setIsRunning(false);
      }
      busyRef.current = false;
      dlog('runRegion · done, busy released');
    }
  }, [engine]);

  // ── Bridge self-check (once) ───────────────────────────────────────────────

  useEffect(() => {
    const api = window.electron;
    const ok = typeof api?.runRegionTakeoff === 'function';
    dlog(
      'hook mounted · window.electron:', !!api,
      '· runRegionTakeoff:', ok ? 'OK' : 'MISSING',
      '· keys:', api ? Object.keys(api) : [],
    );
    if (!ok) {
      dwarn(
        'runRegionTakeoff is MISSING from window.electron. Studio preload is stale —',
        'fully close Electron and relaunch with GlazeBid.bat so build-preloads.mjs rebuilds',
        'apps/studio/dist-electron/preload.js.',
      );
    }
  }, []);

  // ── Drag interaction ───────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el = canvas;

    function cancelDrag(): void {
      drawingRef.current = false;
      startRef.current = null;
      setDragPreview(null);
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = true;
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        // Don't steal the shortcut from a text field.
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        useStudioStore.getState().setActiveTool('boxsnap');
      }
      if (e.key === 'Escape') {
        if (drawingRef.current) cancelDrag();
        setError(null);
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = false;
    }

    /** Canvas CSS px → VIRTUAL page coords (what the camera speaks). */
    function virtualFromEvent(e: MouseEvent) {
      const rect = el.getBoundingClientRect();
      return engine.screenToPage(e.clientX - rect.left, e.clientY - rect.top);
    }

    function handleMouseDown(e: MouseEvent): void {
      if (e.button !== 0) return;
      if (useStudioStore.getState().activeTool !== 'boxsnap') return;
      if (spaceRef.current) { dlog('mousedown · ignored: space held (pan pass-through)'); return; }
      if (busyRef.current) {
        dwarn('mousedown · ignored: a region scan is already in flight (busyRef=true)');
        setError('Still reading the previous region…');
        return;
      }

      const rect = el.getBoundingClientRect();
      startRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      drawingRef.current = true;
      const v = virtualFromEvent(e);
      dlog('mousedown ▶ drag start', { css: startRef.current, virtual: v, canvasRect: { w: rect.width, h: rect.height } });
      setDragPreview({ x0: v.x, y0: v.y, x1: v.x, y1: v.y });
      e.stopImmediatePropagation();
    }

    function handleMouseMove(e: MouseEvent): void {
      if (!drawingRef.current || !startRef.current) return;
      // Re-project the START each frame rather than caching its page point:
      // if the user space-pans mid-drag, the anchor must stay on the same spot
      // of the drawing, not the same spot of the screen.
      const a = engine.screenToPage(startRef.current.x, startRef.current.y);
      setDragPreview(normalize(a, virtualFromEvent(e)));
      e.stopImmediatePropagation();
    }

    function handleMouseUp(e: MouseEvent): void {
      if (useStudioStore.getState().activeTool === 'boxsnap' || drawingRef.current) {
        dlog('mouseup ▶ received', {
          button: e.button,
          drawing: drawingRef.current,
          hasStart: !!startRef.current,
          target: (e.target as HTMLElement | null)?.tagName,
        });
      }
      if (!drawingRef.current || !startRef.current || e.button !== 0) {
        if (drawingRef.current || startRef.current) {
          dwarn('mouseup · ABORT guard 1', { drawing: drawingRef.current, hasStart: !!startRef.current, button: e.button });
        }
        return;
      }

      const rect = el.getBoundingClientRect();
      const startCss = startRef.current;
      const endCss = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      drawingRef.current = false;
      startRef.current = null;
      setDragPreview(null);
      e.stopImmediatePropagation();

      const dxCss = Math.abs(endCss.x - startCss.x);
      const dyCss = Math.abs(endCss.y - startCss.y);
      dlog('mouseup · css', { start: startCss, end: endCss, dxCss, dyCss });

      // Reject accidental micro-drags, measured in CSS px so the threshold
      // means the same thing at every zoom level.
      if (dxCss < MIN_DRAG_CSS_PX || dyCss < MIN_DRAG_CSS_PX) {
        dwarn(`mouseup · ABORT micro-drag: Δx=${dxCss.toFixed(1)} Δy=${dyCss.toFixed(1)} (min ${MIN_DRAG_CSS_PX}px each axis)`);
        setError(`Box too small (${Math.round(dxCss)}×${Math.round(dyCss)} px) — drag a larger region.`);
        return;
      }

      const store = useStudioStore.getState();
      const vA = engine.screenToPage(startCss.x, startCss.y);
      const vB = engine.screenToPage(endCss.x, endCss.y);
      dlog('mouseup · virtual', {
        vA, vB,
        continuousScroll: store.continuousScroll,
        pages: store.pages.length,
        activePageId: store.activePageId,
        yOffsets: Object.fromEntries(pageYOffsets(store.pages, store.continuousScroll)),
      });

      // A region belongs to ONE sheet. The START point decides which — that is
      // the page the user aimed at — and the end is clamped into it, so a drag
      // that overshoots onto the next sheet still yields a valid single-page
      // region instead of a box spanning a page gap.
      const hit = localize(vA, store.pages, store.continuousScroll, store.activePageId);
      if (!hit) {
        derr('mouseup · ABORT localize() returned null', { vA, pages: store.pages.map(p => ({ id: p.id, w: p.widthPx, h: p.heightPx })) });
        setError('Could not tell which sheet that region is on.');
        return;
      }
      const { page, yOffset } = hit;
      dlog('mouseup · localized', {
        pageId: page.id, pdfPageIndex: page.pdfPageIndex,
        pageW: page.widthPx, pageH: page.heightPx, yOffset, local: hit.local,
      });

      if (!(page.widthPx > 0) || !(page.heightPx > 0)) {
        derr('mouseup · ABORT page has no usable size', { widthPx: page.widthPx, heightPx: page.heightPx });
        setError('That sheet has no size yet — wait for it to finish loading.');
        return;
      }

      // Match the engine's own behaviour: clicking a page makes it active.
      if (page.id !== store.activePageId) {
        dlog('mouseup · switching active page', store.activePageId, '→', page.id);
        store.setActivePage(page.id);
      }

      const a = clampToPage(hit.local, page.widthPx, page.heightPx);
      const b = clampToPage(
        { x: vB.x, y: vB.y - yOffset },          // same page's local space
        page.widthPx, page.heightPx,
      );
      const region = normalize(a, b);            // page-LOCAL == fitz page space
      const w = region.x1 - region.x0;
      const h = region.y1 - region.y0;
      dlog('mouseup · region (page-local pts)', { a, b, region, w, h });

      if (![region.x0, region.y0, region.x1, region.y1].every(Number.isFinite)) {
        derr('mouseup · ABORT region has NaN/Infinity', region);
        setError('Region math produced an invalid box (NaN) — see console.');
        return;
      }
      if (w < 1 || h < 1) {
        dwarn('mouseup · ABORT region collapsed after clamping to the page', { w, h, region });
        setError('That box is off the sheet — start the drag on the drawing.');
        return;
      }

      dlog('mouseup ✔ dispatching runRegion');
      runRegion(region, page.id, page.pdfPageIndex).catch(err => {
        // runRegion handles its own errors; this only fires if it threw
        // synchronously-before-try or a bug slipped through.
        derr('mouseup · runRegion rejected (unhandled inside)', err);
        setError(err instanceof Error ? err.message : String(err));
      });
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    el.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [canvasRef, engine, runRegion]);

  // ── Accept / reject ────────────────────────────────────────────────────────

  /**
   * Accept: commit the detection as a RectShape + RawTakeoff, exactly like a
   * hand-drawn frame, so it flows through the existing inbox → Builder pipe.
   * Gated on calibration for the same reason useWandTool is: without a scale
   * the inches would be fabricated, and a takeoff with bogus dimensions is
   * worse than no takeoff.
   */
  const accept = useCallback((id: string) => {
    const det = detections.find(d => d.id === id);
    if (!det || det.status !== 'pending') return;

    const store = useStudioStore.getState();
    const cal = store.calibrations[det.pageId];
    if (!cal) {
      setError('Calibrate this page first — Box & Snap needs a scale to size the takeoff.');
      store.setActiveTool('calibrate');
      return;
    }

    const widthPx = det.bbox.x1 - det.bbox.x0;
    const heightPx = det.bbox.y1 - det.bbox.y0;
    const widthInches = pageToInches(widthPx, cal.pixelsPerInch);
    const heightInches = pageToInches(heightPx, cal.pixelsPerInch);

    const shapeId = crypto.randomUUID();
    const shape: RectShape = {
      id: shapeId,
      pageId: det.pageId,
      type: 'rect',
      origin: { x: det.bbox.x0, y: det.bbox.y0 },
      widthPx,
      heightPx,
      widthInches,
      heightInches,
      label: det.mark ? `${det.mark} — ${det.systemType}` : det.systemType,
      color: '#22c55e',
      frameSystemId: null,
      frameSystemType: det.systemType,
    };
    store.addShape(shape);

    // Everything the AI resolved rides along on the RawTakeoff so Builder's
    // inbox builds a `bayCount × rowCount` parametric frame of the right
    // system, not a 1×1 perimeter box labelled by guesswork.
    useProjectStore.getState().addTakeoff({
      shapeId,
      pageId: det.pageId,
      x: det.bbox.x0,
      y: det.bbox.y0,
      widthPx,
      heightPx,
      widthInches,
      heightInches,
      type: 'Area',
      label: shape.label,
      systemType: det.systemType,
      bayCount: det.bayCount,
      rowCount: det.rowCount,
      gridSource: det.gridSource,
      mark: det.mark,
      confidence: det.confidence,
      source: 'boxsnap',
    });

    setDetections(prev => prev.map(d => (d.id === id ? { ...d, status: 'accepted' } : d)));
  }, [detections]);

  const reject = useCallback((id: string) => {
    setDetections(prev => prev.map(d => (d.id === id ? { ...d, status: 'rejected' } : d)));
  }, []);

  const clear = useCallback(() => {
    ticketRef.current++;            // orphan any in-flight response
    busyRef.current = false;        // …and never leave the latch stuck
    setIsRunning(false);
    setDetections([]);
    setError(null);
    dlog('clear · detections cleared, busy released');
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return {
    dragPreview,
    detections,
    isRunning,
    error,
    accept,
    reject,
    clear,
    dismissError,
  };
}
