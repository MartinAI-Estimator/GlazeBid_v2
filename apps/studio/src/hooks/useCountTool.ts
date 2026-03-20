/**
 * useCountTool.ts  —  Plugin hook for the Count Marker tool.
 *
 * ── Design ────────────────────────────────────────────────────────────────────
 * Follows the "Hook-based Plugin System" pattern (capture-phase listeners,
 * CanvasEngineAPI as black box, no engine file modifications).
 *
 * ── Interaction ───────────────────────────────────────────────────────────────
 * 1. Press 'C' to activate the Count tool.
 * 2. If no count groups exist, the user is prompted via a small inline form
 *    (rendered by CountOverlay) to name the first group.
 * 3. Each left-click on the PDF drops a MarkerShape at that page coordinate.
 *    The marker auto-assigns to the currently active count group.
 * 4. CountOverlay renders a coloured circle for every marker on the active page.
 *
 * Markers are stored as MarkerShape (type: 'marker') in useStudioStore.shapes.
 * Their metadata (groupId, systemId) is mirrored in useProjectStore.counts.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useStudioStore }  from '../store/useStudioStore';
import { useProjectStore } from '../store/useProjectStore';
import type { CanvasEngineAPI } from './useCanvasEngine';

type UseCountToolResult = {
  /** ID of the currently active count group (or null if none exist yet). */
  activeGroupId: string | null;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCountTool(
  canvasRef: RefObject<HTMLCanvasElement>,
  engine:    CanvasEngineAPI,
): UseCountToolResult {
  const spaceRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el: HTMLCanvasElement = canvas;

    function onKeyDown(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = true;
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        useStudioStore.getState().setActiveTool('count');
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') spaceRef.current = false;
    }

    function handleMouseDown(e: MouseEvent): void {
      if (e.button !== 0) return;
      const store = useStudioStore.getState();
      if (store.activeTool !== 'count') return;
      if (spaceRef.current) return;

      const projStore = useProjectStore.getState();

      // ── Type-Count mode: activeFrameTypeId is set → drop a TypeCountDot ──
      if (store.activeFrameTypeId) {
        const rect = el.getBoundingClientRect();
        const sX   = e.clientX - rect.left;
        const sY   = e.clientY - rect.top;
        const page = engine.screenToPage(sX, sY);

        projStore.addTypeDot({
          frameTypeId: store.activeFrameTypeId,
          pageId:      store.activePageId,
          position:    page,
        });

        e.stopImmediatePropagation();
        return;
      }

      // ── Legacy count-group mode ───────────────────────────────────────────
      let groupId: string;
      if (projStore.countGroups.length === 0) {
        groupId = projStore.addCountGroup();
      } else {
        groupId = projStore.countGroups[projStore.countGroups.length - 1].id;
      }

      const rect  = el.getBoundingClientRect();
      const sX    = e.clientX - rect.left;
      const sY    = e.clientY - rect.top;
      const page  = engine.screenToPage(sX, sY);

      const shapeId = crypto.randomUUID();

      // Commit marker shape to studio store
      store.addShape({
        id:           shapeId,
        type:         'marker',
        pageId:       store.activePageId,
        position:     page,
        countGroupId: groupId,
        color:        projStore.countGroups.find(g => g.id === groupId)?.color ?? '#f43f5e',
        label:        projStore.countGroups.find(g => g.id === groupId)?.label,
      });

      // Mirror in project store
      projStore.addCount({
        shapeId,
        pageId:       store.activePageId,
        systemId:     '',
        countGroupId: groupId,
        label:        projStore.countGroups.find(g => g.id === groupId)?.label,
      });

      e.stopImmediatePropagation();
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

  // Return active group id so CountOverlay can highlight it
  const countGroups = useProjectStore(s => s.countGroups);
  const activeGroupId = countGroups.length > 0
    ? countGroups[countGroups.length - 1].id
    : null;

  return { activeGroupId };
}
