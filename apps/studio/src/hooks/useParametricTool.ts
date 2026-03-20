/**
 * useParametricTool.ts
 *
 * Plugin hook for the Frame Highlight tool (Task 4.3).
 *
 * ── Design ────────────────────────────────────────────────────────────────────
 * Implements the "Hook-based Plugin System" pattern: it consumes the existing
 * CanvasEngineAPI as a black box and adds Frame Highlight behaviour without
 * touching useCanvasEngine, renderEngine, or pdfTileManager.
 *
 * ── Event strategy ───────────────────────────────────────────────────────────
 * Event listeners are attached in the CAPTURE phase (useCapture = true), which
 * fires before the canvas engine's bubble-phase listeners.  When the frame tool
 * is active and the user is actively drawing, stopImmediatePropagation() prevents
 * the canvas engine from processing the same events.
 *
 * Wheel events are intentionally NOT intercepted so zooming still works during
 * frame drawing.  Space-bar panning is preserved via spaceHeldRef tracking.
 *
 * ── Calibration Gate ─────────────────────────────────────────────────────────
 * If the active page has no calibration set, the tool refuses to start a draw,
 * switches the engine to 'calibrate' mode, and returns calibrationRequired=true
 * so FrameOverlay can display an informational banner.
 *
 * ── Coordinate conversion ────────────────────────────────────────────────────
 * engine.screenToPage() maps canvas-local CSS pixels → PDF page pixels.
 * pageToInches() then converts using the active page's pixelsPerInch calibration.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { pageToInches } from '../engine/coordinateSystem';
import type { CanvasEngineAPI } from './useCanvasEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

/** In-progress frame-draw preview in canvas-local CSS pixels. */
export type FramePreview = {
  x: number;
  y: number;
  w: number;
  h: number;
} | null;

type UseParametricToolResult = {
  framePreview:        FramePreview;
  calibrationRequired: boolean;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Attach the Frame Highlight tool to the canvas element.
 *
 * @param canvasRef  - Ref to the <canvas> element owned by StudioCanvas.
 * @param engine     - CanvasEngineAPI returned by useCanvasEngine.
 */
export function useParametricTool(
  canvasRef: RefObject<HTMLCanvasElement>,
  engine:    CanvasEngineAPI,
): UseParametricToolResult {
  const [framePreview,        setFramePreview]        = useState<FramePreview>(null);
  const [calibrationRequired, setCalibrationRequired] = useState(false);

  /** Start point of the current drag in canvas-local CSS pixels AND page px. */
  const startRef   = useRef<{
    screenX: number; screenY: number;
    pageX:   number; pageY:   number;
  } | null>(null);

  /** True while a frame drag is in progress. */
  const drawingRef  = useRef(false);

  /** Mirrors keyboard space-bar state so we don't hijack pan gestures. */
  const spaceRef    = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // `el` is used inside closures where TypeScript cannot re-narrow `canvas`.
    const el: HTMLCanvasElement = canvas;

    // ── Space-bar tracking ──────────────────────────────────────────────────
    function onKeyDown(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = true;
      // 'F' shortcut to activate frame tool
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
        useStudioStore.getState().setActiveTool('frame');
      }
      // Escape: cancel in-progress frame draw
      if (e.key === 'Escape' && drawingRef.current) {
        drawingRef.current = false;
        startRef.current   = null;
        setFramePreview(null);
      }
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);

    // ── Mouse Down (capture phase on canvas) ─────────────────────────────────
    function handleMouseDown(e: MouseEvent): void {
      if (e.button !== 0) return;                          // left-click only
      const store = useStudioStore.getState();
      if (store.activeTool !== 'frame') return;            // frame tool only
      if (spaceRef.current) return;                        // space-pan pass-through

      // ── Calibration gate ──────────────────────────────────────────────────
      const cal = store.calibrations[store.activePageId];
      if (!cal) {
        setCalibrationRequired(true);
        store.setActiveTool('calibrate');
        // Don't stop propagation — let the engine pick up mouse for calibration
        return;
      }
      setCalibrationRequired(false);

      const rect    = el.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const rawPage  = engine.screenToPage(screenX, screenY);
      const snapRes  = engine.getSnap(rawPage);
      const page     = snapRes.point;
      // Convert snapped page coords back to screen so the preview origin aligns
      const snapScreen = engine.pageToScreen(page.x, page.y);

      startRef.current  = { screenX: snapScreen.x, screenY: snapScreen.y, pageX: page.x, pageY: page.y };
      drawingRef.current = true;
      setFramePreview({ x: snapScreen.x, y: snapScreen.y, w: 0, h: 0 });

      e.stopImmediatePropagation();
    }

    // ── Mouse Move (capture phase on window — mirrors engine's own listener) ─
    function handleMouseMove(e: MouseEvent): void {
      if (!drawingRef.current || !startRef.current) return;

      const rect = el.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;
      const s    = startRef.current;

      const rawEnd     = engine.screenToPage(cx, cy);
      const snapRes    = engine.getSnap(rawEnd);
      const endScreen  = engine.pageToScreen(snapRes.point.x, snapRes.point.y);

      setFramePreview({
        x: Math.min(s.screenX, endScreen.x),
        y: Math.min(s.screenY, endScreen.y),
        w: Math.abs(endScreen.x - s.screenX),
        h: Math.abs(endScreen.y - s.screenY),
      });

      e.stopImmediatePropagation();
    }

    // ── Mouse Up (capture phase on window) ───────────────────────────────────
    function handleMouseUp(e: MouseEvent): void {
      if (!drawingRef.current || !startRef.current || e.button !== 0) return;

      drawingRef.current = false;
      const start = startRef.current;
      startRef.current = null;
      setFramePreview(null);

      const rect      = el.getBoundingClientRect();
      const endScreenX = e.clientX - rect.left;
      const endScreenY = e.clientY - rect.top;
      const rawEndPage = engine.screenToPage(endScreenX, endScreenY);
      const snapEnd    = engine.getSnap(rawEndPage).point;

      // Ignore accidental micro-drags (< 4 page pixels either axis)
      const wPx = Math.abs(snapEnd.x - start.pageX);
      const hPx = Math.abs(snapEnd.y - start.pageY);
      if (wPx < 4 || hPx < 4) { e.stopImmediatePropagation(); return; }

      const store = useStudioStore.getState();
      const cal   = store.calibrations[store.activePageId]!;

      const ox    = Math.min(start.pageX, snapEnd.x);
      const oy    = Math.min(start.pageY, snapEnd.y);
      const wIn   = pageToInches(wPx, cal.pixelsPerInch);
      const hIn   = pageToInches(hPx, cal.pixelsPerInch);

      const shapeId = crypto.randomUUID();

      // Commit the frame as a RectShape with default "unassigned" blue colour.
      // QuickAssignMenu will update color + frameSystemId once the user picks a system.
      store.addShape({
        id:             shapeId,
        type:           'rect',
        pageId:         store.activePageId,
        origin:         { x: ox, y: oy },
        widthPx:        wPx,
        heightPx:       hPx,
        widthInches:    wIn,
        heightInches:   hIn,
        label:          'Unassigned Frame',
        color:          '#64748b',   // slate-500 — neutral until assigned
        frameSystemId:  null,
        frameSystemType: null,
      });

      // Trigger QuickAssignMenu at the top-centre of the drawn rect (screen coords).
      const endScreen  = engine.pageToScreen(snapEnd.x, snapEnd.y);
      const midX = (Math.min(start.screenX, endScreen.x) + Math.max(start.screenX, endScreen.x)) / 2;
      const topY = Math.min(start.screenY, endScreen.y);

      store.setPendingFrameBounds({
        shapeId,
        widthInches:  wIn,
        heightInches: hIn,
        screenX:      midX,
        screenY:      topY,
      });

      e.stopImmediatePropagation();
    }

    // Capture phase on canvas/window ensures we fire BEFORE the engine's
    // bubble-phase listeners and can selectively intercept events.
    el.addEventListener('mousedown',  handleMouseDown, true);
    window.addEventListener('mousemove',  handleMouseMove, true);
    window.addEventListener('mouseup',    handleMouseUp,   true);

    return () => {
      el.removeEventListener('mousedown',  handleMouseDown, true);
      window.removeEventListener('mousemove',  handleMouseMove, true);
      window.removeEventListener('mouseup',    handleMouseUp,   true);
      window.removeEventListener('keydown',    onKeyDown);
      window.removeEventListener('keyup',      onKeyUp);
    };
  }, [canvasRef, engine]);

  return { framePreview, calibrationRequired };
}
