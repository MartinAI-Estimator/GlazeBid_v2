/**
 * useGhostDetector.ts  —  Phase 6.3 multi-scale sliding-window ghost detector.
 *
 * When the user draws an anchor box (via useGhostTool), this hook:
 *   1. Reads the rendered canvas ImageData in a single pass.
 *   2. Extracts a 128D feature embedding from the anchor box.
 *   3. Registers the anchor with the internal SessionLearner.
 *   4. Runs a multi-scale (0.8×/1.0×/1.2×) sliding window across the page
 *      region, extracting feature embeddings at each position.
 *   5. Discards windows that are mostly blank (>90 % high-luminance pixels).
 *   6. Collects candidates cosine-similar to the anchor above a permissive
 *      initial threshold (session threshold × 0.88).
 *   7. Applies NMS (IoU > 0.50) to remove overlapping duplicates.
 *   8. Passes survivors through SessionLearner.rankCandidates() for final
 *      confidence scoring and hard-negative filtering.
 *   9. Returns the result as `detections` state (triggers GhostOverlay render).
 *
 * The user then accepts (✓) or rejects (✗) each ghost:
 *   • `commitDetection(id)` — converts CSS-px box → real-world inches via
 *     calibration and adds a RectShape to the store.
 *   • `rejectDetection(id)` — stores the embedding as a hard negative, raises
 *     the threshold, and re-filters all remaining pending detections in-place.
 *   • `acceptAll()`        — commits every pending detection in order.
 *   • `clearDetections()`  — resets the session.
 *
 * ── Performance notes ────────────────────────────────────────────────────────
 *  • Canvas ImageData is read once per `runDetection` call.
 *  • All pixel work is deferred to a `setTimeout(0)` so React can paint the
 *    "Detecting…" spinner before the synchronous loop begins.
 *  • MAX_RAW_CANDIDATES (200) and MAX_DETECTIONS (50) caps prevent excessive
 *    results on large or complex pages.
 *  • Windows outside the rendered PDF page area are skipped.
 *  • Stride = 50 % of anchor dimension (2× overlap per axis).
 *
 * ── ONNX slot ────────────────────────────────────────────────────────────────
 *  `extractFeaturesFromBuffer` is the only call that depends on the canvas-
 *  native feature extraction.  To upgrade to ONNX: replace that call with an
 *  ONNX InferenceSession run on a cropped canvas ImageData.  Everything else
 *  (SessionLearner, NMS, store commit) is model-agnostic.
 *
 * Legacy reference:
 *   _LEGACY_ARCHIVE/GlazeBid_AIQ/GHOST_HIGHLIGHTER_ARCHITECTURE.md
 *   SessionLearner.re_rank_ghosts(), Spatial Transformer discussion
 */

import { useState, useCallback, useRef, type RefObject } from 'react';
import { useStudioStore }                  from '../store/useStudioStore';
import { pageToInches }                    from '../engine/coordinateSystem';
import {
  extractFeaturesFromBuffer,
  cosineSimilarity,
  type FeatureVector,
}                                          from '../engine/parametric/featureExtract';
import { useSessionLearner }               from './useSessionLearner';
import type { CanvasEngineAPI }            from './useCanvasEngine';
import type { CssPxBox }                   from './useGhostTool';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Scales applied to the anchor box for multi-scale sliding window. */
const SCALES           = [0.8, 1.0, 1.2] as const;

/** Stride as a fraction of the anchor dimension (50% → 2× overlap). */
const STRIDE_RATIO     = 0.5;

/** NMS IoU threshold — candidates overlapping more than this are merged. */
const NMS_IOU          = 0.50;

/** Maximum raw candidates collected before NMS. */
const MAX_RAW          = 200;

/** Maximum ghost detections surfaced to the user after NMS + ranking. */
const MAX_DETECTIONS   = 50;

/**
 * Windows whose interior is more than this fraction high-luminance pixels
 * (lum > 220) are considered blank background and skipped.
 */
const BLANK_LUM_RATIO  = 0.90;

/** Luminance above which a pixel is "blank/white". */
const BLANK_LUM        = 220;

/**
 * Initial detection gate: accept candidates as raw if their similarity
 * is above `sessionThreshold × PRE_FILTER_FACTOR`.  The sessionLearner
 * applies the tighter session threshold in `rankCandidates`.
 */
const PRE_FILTER_FACTOR = 0.88;

// ── Public types ──────────────────────────────────────────────────────────────

export type GhostDetection = {
  id:         string;
  box:        CssPxBox;
  embedding:  FeatureVector;
  confidence: number;
  status:     'pending' | 'accepted' | 'rejected';
};

export type UseGhostDetectorResult = {
  isDetecting:     boolean;
  detections:      GhostDetection[];
  anchorBox:       CssPxBox | null;
  /** Cosine similarity threshold from the session learner — for UI display. */
  threshold:       number;
  positiveCount:   number;
  negativeCount:   number;
  /** Start a new detection pass using the given anchor CSS-px box. */
  runDetection:    (anchorCssBox: CssPxBox) => void;
  /** Accept a ghost: converts to page-space and adds to shape store. */
  commitDetection: (id: string) => void;
  /** Reject a ghost: raises session threshold + re-filters pending. */
  rejectDetection: (id: string) => void;
  /** Commit all currently-pending ghosts. */
  acceptAll:       () => void;
  /** Clear all detections and reset the session. */
  clearDetections: () => void;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function computeIou(a: CssPxBox, b: CssPxBox): number {
  const xa = Math.max(a.x, b.x);
  const ya = Math.max(a.y, b.y);
  const xb = Math.min(a.x + a.w, b.x + b.w);
  const yb = Math.min(a.y + a.h, b.y + b.h);
  const interW = Math.max(0, xb - xa);
  const interH = Math.max(0, yb - ya);
  const inter  = interW * interH;
  if (inter === 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function applyNMS(
  candidates: Array<{ box: CssPxBox; confidence: number; embedding: FeatureVector }>,
): typeof candidates {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: typeof candidates = [];
  for (const c of sorted) {
    if (!kept.some(k => computeIou(c.box, k.box) > NMS_IOU)) {
      kept.push(c);
    }
  }
  return kept;
}

/** True if the buffer region is mostly blank (no useful content to detect). */
function isBlankRegion(
  data: Uint8ClampedArray,
  bw:   number,
  bh:   number,
  bufX: number, bufY: number,
  bufW: number, bufH: number,
  stride: number = 4,
): boolean {
  let blankCount = 0;
  let totalCount = 0;
  for (let y = bufY; y < bufY + bufH; y += stride) {
    for (let x = bufX; x < bufX + bufW; x += stride) {
      const cx = Math.max(0, Math.min(bw - 1, Math.round(x)));
      const cy = Math.max(0, Math.min(bh - 1, Math.round(y)));
      const i  = (cy * bw + cx) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum > BLANK_LUM) blankCount++;
      totalCount++;
    }
  }
  return totalCount > 0 && blankCount / totalCount > BLANK_LUM_RATIO;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGhostDetector(
  canvasRef: RefObject<HTMLCanvasElement>,
  engine:    CanvasEngineAPI | null,
): UseGhostDetectorResult {
  const learner = useSessionLearner();

  const [isDetecting, setIsDetecting]  = useState(false);
  const [detections,  setDetections]   = useState<GhostDetection[]>([]);
  const [anchorBox,   setAnchorBox]    = useState<CssPxBox | null>(null);

  // Ref mirror for detections so callbacks don't close over stale state
  const detectionsRef = useRef<GhostDetection[]>([]);
  const cancelRef     = useRef({ cancelled: false });

  // ── runDetection ──────────────────────────────────────────────────────────

  const runDetection = useCallback((anchorCssBox: CssPxBox) => {
    const canvas = canvasRef.current;
    if (!canvas || !engine) return;

    cancelRef.current = { cancelled: false };
    setIsDetecting(true);
    setAnchorBox(anchorCssBox);
    learner.reset();

    setTimeout(() => {
      try {
        if (cancelRef.current.cancelled) { setIsDetecting(false); return; }

        const dpr  = window.devicePixelRatio || 1;
        const bw   = canvas.width;
        const bh   = canvas.height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { setIsDetecting(false); return; }

        const img  = ctx.getImageData(0, 0, bw, bh);
        const data = img.data;

        // ── Anchor embedding ──────────────────────────────────────────────
        const axBuf = anchorCssBox.x * dpr;
        const ayBuf = anchorCssBox.y * dpr;
        const awBuf = anchorCssBox.w * dpr;
        const ahBuf = anchorCssBox.h * dpr;

        const anchorEmb = extractFeaturesFromBuffer(data, bw, bh, axBuf, ayBuf, awBuf, ahBuf);
        if (!anchorEmb) { setIsDetecting(false); return; }

        learner.setAnchor(anchorEmb);
        const simGate = learner.threshold * PRE_FILTER_FACTOR;

        // ── Page bounds in CSS px (to avoid scanning background) ─────────
        const store = useStudioStore.getState();
        const page  = store.pages.find(p => p.id === store.activePageId);
        const pageTL = engine.pageToScreen(0, 0);
        const pageBR = page
          ? engine.pageToScreen(page.widthPx, page.heightPx)
          : { x: canvas.clientWidth, y: canvas.clientHeight };

        // ── Multi-scale sliding window ────────────────────────────────────
        const rawCandidates: Array<{ box: CssPxBox; confidence: number; embedding: FeatureVector }> = [];

        for (const scale of SCALES) {
          if (cancelRef.current.cancelled) break;

          const winW = anchorCssBox.w * scale;
          const winH = anchorCssBox.h * scale;
          if (winW < 8 || winH < 8) continue;

          const strX = winW * STRIDE_RATIO;
          const strY = winH * STRIDE_RATIO;

          for (let y = pageTL.y; y + winH <= pageBR.y; y += strY) {
            for (let x = pageTL.x; x + winW <= pageBR.x; x += strX) {
              if (cancelRef.current.cancelled) break;
              if (rawCandidates.length >= MAX_RAW) break;

              // Skip the anchor box itself (IoU > 0.70)
              const winBox: CssPxBox = { x, y, w: winW, h: winH };
              if (computeIou(winBox, anchorCssBox) > 0.70) continue;

              // Physical buffer coords
              const bx = x    * dpr;
              const by = y    * dpr;
              const bwW = winW * dpr;
              const bhH = winH * dpr;

              // Skip blank regions
              if (isBlankRegion(data, bw, bh, bx, by, bwW, bhH)) continue;

              const emb = extractFeaturesFromBuffer(data, bw, bh, bx, by, bwW, bhH);
              if (!emb) continue;

              const sim = cosineSimilarity(anchorEmb, emb);
              if (sim < simGate) continue;

              rawCandidates.push({ box: winBox, confidence: sim, embedding: emb });
            }
            if (rawCandidates.length >= MAX_RAW) break;
          }
        }

        // ── NMS ───────────────────────────────────────────────────────────
        const afterNMS = applyNMS(rawCandidates);

        // ── Final ranking via SessionLearner ──────────────────────────────
        const ranked = learner.rankCandidates(afterNMS).slice(0, MAX_DETECTIONS);

        const finalDetections: GhostDetection[] = ranked.map(c => ({
          id:         crypto.randomUUID(),
          box:        c.box,
          embedding:  c.embedding,
          confidence: c.confidence,
          status:     'pending' as const,
        }));

        detectionsRef.current = finalDetections;
        setDetections(finalDetections);
      } catch (err) {
        console.error('[GhostDetector] Error during detection:', err);
      } finally {
        setIsDetecting(false);
      }
    }, 0);
  }, [canvasRef, engine, learner]);

  // ── commitDetection ───────────────────────────────────────────────────────

  const commitDetection = useCallback((id: string) => {
    if (!engine) return;

    const det = detectionsRef.current.find(d => d.id === id);
    if (!det || det.status !== 'pending') return;

    const store = useStudioStore.getState();
    const cal   = store.calibrations[store.activePageId];
    if (!cal) return;

    // CSS-px corners → page space
    const tl = engine.screenToPage(det.box.x,              det.box.y);
    const br = engine.screenToPage(det.box.x + det.box.w, det.box.y + det.box.h);

    const widthPx  = Math.abs(br.x - tl.x);
    const heightPx = Math.abs(br.y - tl.y);
    const wIn      = pageToInches(widthPx,  cal.pixelsPerInch);
    const hIn      = pageToInches(heightPx, cal.pixelsPerInch);

    store.addShape({
      id:              crypto.randomUUID(),
      type:            'rect',
      pageId:          store.activePageId,
      origin:          { x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y) },
      widthPx,
      heightPx,
      widthInches:     wIn,
      heightInches:    hIn,
      label:           'Ghost Match',
      color:           '#10b981',
      frameSystemId:   null,
      frameSystemType: null,
    });

    learner.acceptGhost(det.embedding);

    const updated = detectionsRef.current.map(d =>
      d.id === id ? { ...d, status: 'accepted' as const } : d,
    );
    detectionsRef.current = updated;
    setDetections(updated);
  }, [engine, learner]);

  // ── rejectDetection ───────────────────────────────────────────────────────

  const rejectDetection = useCallback((id: string) => {
    const det = detectionsRef.current.find(d => d.id === id);
    if (!det || det.status !== 'pending') return;

    // Inform learner — this raises threshold and stores hard negative
    learner.rejectGhost(det.embedding);

    // Mark target as rejected
    let updated = detectionsRef.current.map(d =>
      d.id === id ? { ...d, status: 'rejected' as const } : d,
    );

    // Re-filter remaining pending detections against updated learner state
    const stillPending = updated.filter(d => d.status === 'pending');
    const rerankable   = stillPending.map(d => ({ ...d }));
    const reranked     = learner.rankCandidates(rerankable);
    const passedIds    = new Set(reranked.map(r => r.id));

    updated = updated.map(d =>
      d.status === 'pending' && !passedIds.has(d.id)
        ? { ...d, status: 'rejected' as const }
        : d,
    );

    detectionsRef.current = updated;
    setDetections(updated);
  }, [learner]);

  // ── acceptAll ─────────────────────────────────────────────────────────────

  const acceptAll = useCallback(() => {
    for (const d of detectionsRef.current) {
      if (d.status === 'pending') commitDetection(d.id);
    }
  }, [commitDetection]);

  // ── clearDetections ───────────────────────────────────────────────────────

  const clearDetections = useCallback(() => {
    cancelRef.current.cancelled = true;
    detectionsRef.current = [];
    setDetections([]);
    setAnchorBox(null);
    setIsDetecting(false);
    learner.reset();
  }, [learner]);

  return {
    isDetecting,
    detections,
    anchorBox,
    threshold:     learner.threshold,
    positiveCount: learner.positiveCount,
    negativeCount: learner.negativeCount,
    runDetection,
    commitDetection,
    rejectDetection,
    acceptAll,
    clearDetections,
  };
}
