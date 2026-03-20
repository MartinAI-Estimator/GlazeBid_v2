/**
 * useAIAutoScan.ts  —  Phase 6.2 bulk page-scan hook.
 *
 * When the user clicks "AI Scan" on the Toolbar this hook:
 *   1. Reads the full rendered canvas in one pass via scanPageRegions().
 *   2. Converts every detected CSS-px bbox → page-space → real-world inches
 *      using the active-page calibration.
 *   3. Discards detections whose real-world dimensions are outside plausible
 *      architectural ranges.
 *   4. Runs the Phase 6.1 heuristic classifier (classifyShape) on each
 *      candidate to produce confidence-scored suggestions.
 *   5. Groups results by geometric cluster (via bbox similarity).
 *   6. Fires onScanComplete() so StudioLayout can show BulkClassifyDialog.
 *
 * The hook also exposes:
 *   • `commitScanResults(accepted)` — adds accepted shapes to the store
 *   • `cancelScan()`                — aborts an in-progress scan
 *
 * Heavy pixel work (scanPageRegions) runs in a deferred setTimeout(0)
 * so React can paint the "Scanning…" indicator before the thread blocks.
 *
 * Legacy reference: _LEGACY_ARCHIVE/GlazeBid_AIQ/useAutoCount.js
 * (original used OpenCV contour detection; replaced with canvas BFS)
 */

import { useState, useCallback, useRef, type RefObject } from 'react';
import { useStudioStore }                               from '../store/useStudioStore';
import { pageToInches }                                 from '../engine/coordinateSystem';
import { scanPageRegions }                              from '../engine/parametric/pageScan';
import {
  classifyShape,
  clusterShapes as _clusterShapes,
  type HeuristicSuggestion,
} from './useFallbackIntelligence';
import type { CanvasEngineAPI }                         from './useCanvasEngine';
import type { RectShape }                               from '../types/shapes';

// ── Public types ──────────────────────────────────────────────────────────────

/** A single detection result — the shape is fully formed but NOT yet in the store. */
export type ScanResult = {
  /** Fully-formed RectShape ready to pass to store.addShape(). */
  shapeData:  RectShape;
  /** Heuristic suggestion, or null when confidence is too low. */
  suggestion: HeuristicSuggestion | null;
};

export type UseAIAutoScanResult = {
  /** True while the page scan is running. */
  isScanning: boolean;
  /** Run the bulk scan on the currently-rendered canvas page. */
  runScan:    () => void;
  /** Abort an in-progress scan (no-op when idle). */
  cancelScan: () => void;
  /**
   * Commit a subset of scan results to the store.
   * Accepted shapes are added; suggestions (if any) are applied immediately
   * when their action is 'auto_apply'.
   */
  commitScanResults: (accepted: ScanResult[]) => void;
};

// ── Plausible real-world dimension gates (inches) ─────────────────────────────
// Any detection outside these bounds is discarded as a false positive.
const MIN_W_IN =  6;    // narrower than a small vent — skip
const MAX_W_IN = 960;   // no single glazing unit >80 ft wide
const MIN_H_IN =  6;
const MAX_H_IN = 720;   // no single unit >60 ft tall

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAIAutoScan(
  canvasRef:      RefObject<HTMLCanvasElement>,
  engine:         CanvasEngineAPI | null,
  onScanComplete: (results: ScanResult[]) => void,
): UseAIAutoScanResult {
  const [isScanning, setIsScanning] = useState(false);
  const cancelRef = useRef({ cancelled: false });

  const runScan = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine)  return;
    if (isScanning)          return;

    const store = useStudioStore.getState();
    const cal   = store.calibrations[store.activePageId];
    if (!cal) {
      // No calibration on this page — can't convert to inches.
      store.setActiveTool('calibrate');
      return;
    }

    const page = store.pages.find(p => p.id === store.activePageId);
    const pageHeightPx = page?.heightPx ?? 1224;

    cancelRef.current = { cancelled: false };
    setIsScanning(true);

    void scanPageRegions(canvas, {}, cancelRef.current).then(regions => {
      setIsScanning(false);

      if (cancelRef.current.cancelled) return;

      // Convert CSS-px bboxes → RectShapes with real-world dimensions
      const pendingShapes: RectShape[] = [];

      for (const region of regions) {
        const { box } = region;

        // CSS-px corners → page-space coordinates
        const tl = engine.screenToPage(box.x,         box.y);
        const br = engine.screenToPage(box.x + box.w, box.y + box.h);

        const widthPx  = Math.abs(br.x - tl.x);
        const heightPx = Math.abs(br.y - tl.y);

        if (widthPx < 2 || heightPx < 2) continue;

        const wIn = pageToInches(widthPx,  cal.pixelsPerInch);
        const hIn = pageToInches(heightPx, cal.pixelsPerInch);

        // Real-world dimension gate
        if (wIn < MIN_W_IN || wIn > MAX_W_IN) continue;
        if (hIn < MIN_H_IN || hIn > MAX_H_IN) continue;

        pendingShapes.push({
          id:              crypto.randomUUID(),
          type:            'rect',
          pageId:          store.activePageId,
          origin:          { x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y) },
          widthPx,
          heightPx,
          widthInches:     wIn,
          heightInches:    hIn,
          label:           'AI Detected',
          color:           '#64748b',
          frameSystemId:   null,
          frameSystemType: null,
        });
      }

      if (pendingShapes.length === 0) {
        onScanComplete([]);
        return;
      }

      // Build geometric clusters across the pending shapes
      const clusters = _clusterShapes(pendingShapes);
      const clusterByShapeId = new Map<string, { clusterId: string; size: number }>();
      for (const cluster of clusters) {
        for (const id of cluster.shapeIds) {
          clusterByShapeId.set(id, { clusterId: cluster.clusterId, size: cluster.shapeIds.length });
        }
      }

      // Classify every pending shape
      const results: ScanResult[] = pendingShapes.map(shape => {
        const clusterInfo = clusterByShapeId.get(shape.id);
        const suggestion  = classifyShape(
          shape,
          pageHeightPx,
          clusterInfo?.size    ?? 1,
          clusterInfo?.clusterId ?? null,
        );
        return { shapeData: shape, suggestion };
      });

      onScanComplete(results);
    });
  }, [canvasRef, engine, isScanning, onScanComplete]);

  const cancelScan = useCallback(() => {
    cancelRef.current.cancelled = true;
    setIsScanning(false);
  }, []);

  const commitScanResults = useCallback((accepted: ScanResult[]) => {
    const store = useStudioStore.getState();
    for (const result of accepted) {
      const shape = result.shapeData;
      store.addShape(shape);
      // Auto-apply system type when classifier is highly confident
      if (result.suggestion?.action === 'auto_apply') {
        store.updateShape(shape.id, {
          frameSystemType: result.suggestion.suggestedType,
        });
      }
    }
  }, []);

  return { isScanning, runScan, cancelScan, commitScanResults };
}
