/**
 * useWandTool.ts  —  Plugin hook for the Magic Wand auto-detect tool.
 *
 * ── Design ───────────────────────────────────────────────────────────────────
 * When the user clicks the PDF canvas with the Wand tool active:
 *   1. Grab the raw canvas ImageData at the clicked pixel.
 *   2. Run a colour-similarity flood-fill (detectBoundary) to locate the
 *      connected boundary around that spot.
 *   3. Convert the resulting bounding-box (CSS px) → page-space coords via
 *      engine.screenToPage().
 *   4. Compute real-world dimensions using the active-page calibration.
 *   5. Commit the result as a RectShape (same as a manually drawn frame).
 *   6. Trigger QuickAssignMenu so the user can assign it to a system.
 *
 * Heavy pixel work runs inside detectBoundary's internal setTimeout(0) so
 * React can paint the "Scanning…" spinner first.
 *
 * ── Calibration Gate ─────────────────────────────────────────────────────────
 * If no calibration exists for the active page, the tool refuses and switches
 * to the calibrate tool.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useStudioStore }  from '../store/useStudioStore';
import { pageToInches }    from '../engine/coordinateSystem';
import { detectBoundary }  from '../engine/parametric/edgeDetect';
import type { CanvasEngineAPI } from './useCanvasEngine';

type UseWandToolResult = {
  isScanning:          boolean;
  calibrationRequired: boolean;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWandTool(
  canvasRef: RefObject<HTMLCanvasElement>,
  engine:    CanvasEngineAPI,
): UseWandToolResult {
  const [isScanning,          setIsScanning]          = useState(false);
  const [calibrationRequired, setCalibrationRequired] = useState(false);

  const spaceRef  = useRef(false);
  // Prevent double-fire while a detection is already running
  const busyRef   = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el: HTMLCanvasElement = canvas;

    function onKeyDown(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = true;
      if (e.key.toLowerCase() === 'w' && !e.ctrlKey && !e.metaKey) {
        useStudioStore.getState().setActiveTool('wand');
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = false;
    }

    function handleMouseDown(e: MouseEvent): void {
      if (e.button !== 0) return;
      const store = useStudioStore.getState();
      if (store.activeTool !== 'wand') return;
      if (spaceRef.current)            return;
      if (busyRef.current)             return;

      // Calibration gate
      const cal = store.calibrations[store.activePageId];
      if (!cal) {
        setCalibrationRequired(true);
        store.setActiveTool('calibrate');
        return;
      }
      setCalibrationRequired(false);

      const rect = el.getBoundingClientRect();
      const cssCx = e.clientX - rect.left;
      const cssCy = e.clientY - rect.top;

      // Stop engine from processing this click while we scan
      e.stopImmediatePropagation();
      busyRef.current = true;
      setIsScanning(true);

      detectBoundary(el, cssCx, cssCy).then(result => {
        busyRef.current = false;
        setIsScanning(false);

        if (!result.found) {
          console.warn('[Magic Wand]', result.reason);
          return;
        }

        const { box } = result;

        // Convert CSS-px bbox corners → page-space coords
        const tl = engine.screenToPage(box.x,       box.y);
        const br = engine.screenToPage(box.x + box.w, box.y + box.h);

        const widthPx  = Math.abs(br.x - tl.x);
        const heightPx = Math.abs(br.y - tl.y);

        if (widthPx < 4 || heightPx < 4) return;

        const freshStore = useStudioStore.getState();
        const freshCal   = freshStore.calibrations[freshStore.activePageId];
        if (!freshCal) return;

        const wIn = pageToInches(widthPx,  freshCal.pixelsPerInch);
        const hIn = pageToInches(heightPx, freshCal.pixelsPerInch);

        const shapeId = crypto.randomUUID();

        freshStore.addShape({
          id:              shapeId,
          type:            'rect',
          pageId:          freshStore.activePageId,
          origin:          { x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y) },
          widthPx,
          heightPx,
          widthInches:     wIn,
          heightInches:    hIn,
          label:           'Auto-Detected Frame',
          color:           '#64748b',
          frameSystemId:   null,
          frameSystemType: null,
        });

        const midX = engine.pageToScreen(
          Math.min(tl.x, br.x) + widthPx / 2,
          Math.min(tl.y, br.y),
        ).x;
        const topY = engine.pageToScreen(
          Math.min(tl.x, br.x),
          Math.min(tl.y, br.y),
        ).y;

        freshStore.setPendingFrameBounds({
          shapeId,
          widthInches:  wIn,
          heightInches: hIn,
          screenX:      midX,
          screenY:      topY,
        });
      });
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    el.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      el.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [canvasRef, engine]);

  return { isScanning, calibrationRequired };
}
