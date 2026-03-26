/**
 * useCitationCapture.ts
 *
 * Observes useStudioStore for newly completed shapes and fires the
 * QuickEntryModal via useCitationStore — without touching the core
 * canvas engine.
 *
 * This hook is the ONLY connection between the takeoff engine and citations.
 * It uses an observer pattern: watch shapes array for new entries,
 * derive dimensions from the shape itself (already calibrated at commit time),
 * and push a PendingShape into the citation store.
 *
 * If citation breaks, canvas still works. That's the right failure boundary.
 */

import { useEffect, useRef } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { useCitationStore } from '../store/useCitationStore';
import type { DrawnShape, RectShape, PolygonShape } from '../types/shapes';

export function useCitationCapture() {
  const shapes = useStudioStore(s => s.shapes);
  const pages  = useStudioStore(s => s.pages);

  const setPendingShape = useCitationStore(s => s.setPendingShape);
  const knownShapeIds   = useRef(new Set<string>());

  useEffect(() => {
    for (const shape of shapes) {
      // Skip shapes we've already processed
      if (knownShapeIds.current.has(shape.id)) continue;
      knownShapeIds.current.add(shape.id);

      // Only rect and polygon are measurable openings
      if (shape.type !== 'rect' && shape.type !== 'polygon') continue;

      // ── Diagnostic (remove before shipping) ───────────────────────────
      console.log('🔍 [CitationCapture] New shape detected:', shape.type, shape.id);
      console.log('   Shape fields:', JSON.stringify(shape, null, 2));

      const dims = getDimensions(shape);
      if (!dims) continue;

      console.log('📐 [CitationCapture] Dimensions:', dims.widthInches.toFixed(1), '×', dims.heightInches.toFixed(1), 'in');

      // Sanity check — reject impossibly small or large values
      if (dims.widthInches < 6 || dims.widthInches > 2400) {
        console.warn('⚠️ [CitationCapture] Width out of range:', dims.widthInches);
        continue;
      }
      if (dims.heightInches < 6 || dims.heightInches > 1200) {
        console.warn('⚠️ [CitationCapture] Height out of range:', dims.heightInches);
        continue;
      }

      const page = pages.find(p => p.id === shape.pageId);
      const sheetNumber = page?.label ?? 'Unknown';
      const bb = getBoundingBox(shape);

      // Small delay so the canvas finishes rendering before modal appears
      setTimeout(() => {
        setPendingShape({
          shapeId:      shape.id,
          pageId:       shape.pageId,
          sheetNumber,
          widthInches:  dims.widthInches,
          heightInches: dims.heightInches,
          boundingBox:  bb,
        });
      }, 80);
    }
  }, [shapes, pages, setPendingShape]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDimensions(shape: DrawnShape): { widthInches: number; heightInches: number } | null {
  if (shape.type === 'rect') {
    return { widthInches: shape.widthInches, heightInches: shape.heightInches };
  }
  if (shape.type === 'polygon') {
    return { widthInches: shape.bbWidthInches, heightInches: shape.bbHeightInches };
  }
  return null;
}

function getBoundingBox(shape: RectShape | PolygonShape): { x: number; y: number; width: number; height: number } {
  if (shape.type === 'rect') {
    return {
      x:      shape.origin.x,
      y:      shape.origin.y,
      width:  shape.widthPx,
      height: shape.heightPx,
    };
  }
  // polygon
  const xs = shape.points.map(p => p.x);
  const ys = shape.points.map(p => p.y);
  return {
    x:      Math.min(...xs),
    y:      Math.min(...ys),
    width:  Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
