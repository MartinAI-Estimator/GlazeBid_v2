/**
 * useGhostTool.ts  —  Anchor-box drawing interaction for the Ghost Highlighter.
 *
 * When the Ghost tool is active ('ghost' ToolType), the user clicks and drags
 * on the canvas to draw a reference bounding box around a frame they want the
 * AI to find more of.  On mouseup the box is fired to the caller via
 * `onAnchorDrawn`; from that point `useGhostDetector` takes over.
 *
 * ── Interaction model ────────────────────────────────────────────────────────
 *  • G shortcut  → activates the ghost tool
 *  • Drag        → live preview rect (returned as `drawPreview`)
 *  • Release     → fires onAnchorDrawn(cssBox) + clears the preview
 *  • Escape      → cancels an in-progress draw without firing callback
 *  • Space-pan   → space held during drag passes through to engine pan
 *
 * ── Design notes ─────────────────────────────────────────────────────────────
 *  Follows the exact same capture-phase event strategy as useParametricTool:
 *  listeners attach on the canvas in capture mode and call
 *  stopImmediatePropagation() to prevent the canvas engine from processing the
 *  same click.  This keeps the anchor draw independent of the engine's own
 *  panning logic.
 *
 *  Unlike useParametricTool, the ghost tool does NOT need calibration to draw
 *  the anchor box — the box is purely in CSS-px space.  Calibration IS required
 *  for `commitDetection` (committing a ghost as a real shape), which is handled
 *  separately in useGhostDetector.
 */

import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { useStudioStore } from '../store/useStudioStore';

// ── Public types ──────────────────────────────────────────────────────────────

/** A rectangle in canvas-element CSS pixels. */
export type CssPxBox = { x: number; y: number; w: number; h: number };

type UseGhostToolResult = {
  /** Non-null while the user is actively dragging an anchor box. */
  drawPreview: CssPxBox | null;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Attach the Ghost Highlighter anchor-drawing tool to the canvas.
 *
 * @param canvasRef      Ref to <canvas> owned by StudioCanvas.
 * @param onAnchorDrawn  Called once per successful drag with the drawn CSS-px box.
 */
export function useGhostTool(
  canvasRef:      RefObject<HTMLCanvasElement>,
  onAnchorDrawn:  (box: CssPxBox) => void,
): UseGhostToolResult {
  const [drawPreview, setDrawPreview] = useState<CssPxBox | null>(null);

  const startRef   = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  const spaceRef   = useRef(false);
  // Stable ref to the most recent callback so the effect doesn't need to
  // re-register listeners every time the caller's callback reference changes.
  const onAnchorDrawnRef = useRef(onAnchorDrawn);
  useEffect(() => { onAnchorDrawnRef.current = onAnchorDrawn; }, [onAnchorDrawn]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el = canvas;

    // ── Keyboard ─────────────────────────────────────────────────────────────
    function onKeyDown(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = true;

      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        useStudioStore.getState().setActiveTool('ghost');
      }

      if (e.key === 'Escape' && drawingRef.current) {
        drawingRef.current = false;
        startRef.current   = null;
        setDrawPreview(null);
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = false;
    }

    // ── Mouse ─────────────────────────────────────────────────────────────────
    function handleMouseDown(e: MouseEvent): void {
      if (e.button !== 0) return;
      if (useStudioStore.getState().activeTool !== 'ghost') return;
      if (spaceRef.current) return;   // space-pan pass-through

      const rect = el.getBoundingClientRect();
      startRef.current  = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      drawingRef.current = true;
      setDrawPreview({ x: startRef.current.x, y: startRef.current.y, w: 0, h: 0 });
      e.stopImmediatePropagation();
    }

    function handleMouseMove(e: MouseEvent): void {
      if (!drawingRef.current || !startRef.current) return;

      const rect = el.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;
      const s    = startRef.current;

      setDrawPreview({
        x: Math.min(s.x, cx),
        y: Math.min(s.y, cy),
        w: Math.abs(cx - s.x),
        h: Math.abs(cy - s.y),
      });
      e.stopImmediatePropagation();
    }

    function handleMouseUp(e: MouseEvent): void {
      if (!drawingRef.current || !startRef.current || e.button !== 0) return;

      drawingRef.current = false;
      const start = startRef.current;
      startRef.current = null;

      const rect = el.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;

      const box: CssPxBox = {
        x: Math.min(start.x, cx),
        y: Math.min(start.y, cy),
        w: Math.abs(cx - start.x),
        h: Math.abs(cy - start.y),
      };

      setDrawPreview(null);
      e.stopImmediatePropagation();

      // Ignore accidental micro-drags
      if (box.w < 10 || box.h < 10) return;

      onAnchorDrawnRef.current(box);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    el.addEventListener('mousedown',   handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup',   handleMouseUp,  true);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      el.removeEventListener('mousedown',   handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup',   handleMouseUp,  true);
    };
  // canvasRef.current is stable; re-register only if the ref object changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef]);

  return { drawPreview };
}
