/**
 * useRakeTool.ts  —  Plugin hook for the Raked Frame tool.
 *
 * ── Design ────────────────────────────────────────────────────────────────────
 * Follows the same "Hook-based Plugin System" pattern as useParametricTool:
 *   - Attaches CAPTURE-phase event listeners so it fires before the engine.
 *   - Consumes CanvasEngineAPI as a black box.
 *   - Does NOT touch renderEngine, pdfTileManager, or useCanvasEngine internals.
 *
 * ── Interaction ───────────────────────────────────────────────────────────────
 * 1. Press 'R' to activate the Raked Frame tool.
 * 2. Click 4 points in order: top-left → top-right → bottom-right → bottom-left.
 *    (A live polygon preview tracks each click + cursor.)
 * 3. On the 4th click, computeRakeAssembly() runs, the shape is committed as a
 *    PolygonShape (with isRaked=true), and a QuickAssignMenu appears.
 * 4. Backspace removes the last-placed point.
 * 5. Escape cancels.
 *
 * ── Calibration Gate ─────────────────────────────────────────────────────────
 * If the active page has no calibration, the tool refuses to start, switches to
 * 'calibrate', and returns calibrationRequired=true.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useStudioStore }  from '../store/useStudioStore';
import { pageToInches }    from '../engine/coordinateSystem';
import { computeRakeAssembly, pointsToRakedQuad, rakedQuadAABB }
  from '../engine/parametric/rakeMath';
import type { CanvasEngineAPI } from './useCanvasEngine';
import type { PagePoint }       from '../engine/coordinateSystem';

// ── Types ─────────────────────────────────────────────────────────────────────

/** In-progress rake preview: up to 3 committed points + live cursor. */
export type RakePreview = {
  points: PagePoint[];   // page-space points placed so far (0–3)
  cursor: PagePoint | null;
} | null;

type UseRakeToolResult = {
  rakePreview:         RakePreview;
  calibrationRequired: boolean;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRakeTool(
  canvasRef: RefObject<HTMLCanvasElement>,
  engine:    CanvasEngineAPI,
): UseRakeToolResult {
  const [rakePreview,         setRakePreview]         = useState<RakePreview>(null);
  const [calibrationRequired, setCalibrationRequired] = useState(false);

  /** Points placed so far in this stroke (page-space). */
  const pointsRef = useRef<PagePoint[]>([]);
  /** True while user is in the middle of placing points. */
  const activeRef = useRef(false);
  const spaceRef  = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el: HTMLCanvasElement = canvas;

    // ── Keyboard ─────────────────────────────────────────────────────────────
    function onKeyDown(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = true;

      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        useStudioStore.getState().setActiveTool('rake');
      }

      if (e.key === 'Escape') {
        activeRef.current = false;
        pointsRef.current = [];
        setRakePreview(null);
        setCalibrationRequired(false);
      }

      if (e.key === 'Backspace' && activeRef.current && pointsRef.current.length > 0) {
        e.preventDefault();
        pointsRef.current = pointsRef.current.slice(0, -1);
        if (pointsRef.current.length === 0) activeRef.current = false;
        setRakePreview(
          pointsRef.current.length > 0
            ? { points: [...pointsRef.current], cursor: null }
            : null,
        );
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = false;
    }

    // ── Mouse Down ───────────────────────────────────────────────────────────
    function handleMouseDown(e: MouseEvent): void {
      if (e.button !== 0) return;
      const store = useStudioStore.getState();
      if (store.activeTool !== 'rake') return;
      if (spaceRef.current) return;

      // Calibration gate
      const cal = store.calibrations[store.activePageId];
      if (!cal) {
        setCalibrationRequired(true);
        store.setActiveTool('calibrate');
        return;
      }
      setCalibrationRequired(false);

      const rect  = el.getBoundingClientRect();
      const sX    = e.clientX - rect.left;
      const sY    = e.clientY - rect.top;
      const rawPage = engine.screenToPage(sX, sY);
      const snapRes = engine.getSnap(rawPage);
      const page    = snapRes.point;

      pointsRef.current = [...pointsRef.current, page];
      activeRef.current = true;

      if (pointsRef.current.length < 4) {
        setRakePreview({ points: [...pointsRef.current], cursor: null });
        e.stopImmediatePropagation();
        return;
      }

      // ── 4th click: commit ──────────────────────────────────────────────────
      const pts = pointsRef.current as [PagePoint, PagePoint, PagePoint, PagePoint];
      const quad = pointsToRakedQuad(pts);
      const asm  = computeRakeAssembly(quad, cal.pixelsPerInch);
      const bbox = rakedQuadAABB(quad);

      const shapeId = crypto.randomUUID();
      store.addShape({
        id:             shapeId,
        type:           'polygon',
        pageId:         store.activePageId,
        points:         pts,
        bbWidthPx:      bbox.widthPx,
        bbHeightPx:     bbox.heightPx,
        bbWidthInches:  pageToInches(bbox.widthPx,  cal.pixelsPerInch),
        bbHeightInches: pageToInches(bbox.heightPx, cal.pixelsPerInch),
        label:          `Raked ${asm.avgWidthInch.toFixed(1)}" × ${asm.avgHeightInch.toFixed(1)}"`,
        color:          '#64748b',
        frameSystemId:  null,
        frameSystemType: null,
        isRaked:        true,
        headSlopeDeg:   asm.headSlopeDeg,
      });

      // Trigger QuickAssignMenu at the top-centre of the AABB
      store.setPendingFrameBounds({
        shapeId,
        widthInches:  asm.avgWidthInch,
        heightInches: asm.avgHeightInch,
        screenX: engine.pageToScreen(bbox.originX + bbox.widthPx / 2, bbox.originY).x,
        screenY: engine.pageToScreen(bbox.originX, bbox.originY).y,
      });

      pointsRef.current = [];
      activeRef.current = false;
      setRakePreview(null);
      e.stopImmediatePropagation();
    }

    // ── Mouse Move ───────────────────────────────────────────────────────────
    function handleMouseMove(e: MouseEvent): void {
      const store = useStudioStore.getState();
      if (store.activeTool !== 'rake' || !activeRef.current) return;

      const rect = el.getBoundingClientRect();
      const sX   = e.clientX - rect.left;
      const sY   = e.clientY - rect.top;
      const rawPage = engine.screenToPage(sX, sY);
      const snapRes = engine.getSnap(rawPage);

      setRakePreview({ points: [...pointsRef.current], cursor: snapRes.point });
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    el.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      el.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
    };
  }, [canvasRef, engine]);

  return { rakePreview, calibrationRequired };
}
