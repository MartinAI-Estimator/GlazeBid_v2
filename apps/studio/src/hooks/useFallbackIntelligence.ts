/**
 * useFallbackIntelligence.ts
 *
 * Phase 1 AI: Pure-logic heuristic classification for unassigned shapes.
 *
 * When a shape has no frameSystemType assigned yet, this hook computes:
 *   1. Geometric clustering  — groups shapes with ≥0.92 bbox similarity
 *   2. Sill-height heuristic — infers type from vertical position on page
 *   3. Aspect-ratio heuristic — infers type from W/H ratio
 *   4. Size validation       — boosts/penalises based on real-world constraints
 *   5. Confidence decision   — merges sources → action + badge colour
 *
 * All logic is pure math — zero ML dependencies.
 * Re-derives on each shapes/page change via useMemo.
 *
 * Legacy reference: _LEGACY_ARCHIVE/GlazeBid_AIQ/backend/core/fallback_intelligence.py
 */

import { useMemo, useCallback }           from 'react';
import { useStudioStore }                 from '../store/useStudioStore';
import type { DrawnShape, RectShape, PolygonShape } from '../types/shapes';

// ── Public types ──────────────────────────────────────────────────────────────

export type GlazingSystemType =
  | 'door'
  | 'window'
  | 'storefront'
  | 'curtain_wall'
  | 'entrance';

export type ConfidenceAction =
  | 'auto_apply'
  | 'suggest_with_verify'
  | 'flag'
  | 'ask';

export type HeuristicSource =
  | 'sill_height'
  | 'aspect_ratio'
  | 'size_validation';

export type HeuristicSuggestion = {
  shapeId:       string;
  suggestedType: GlazingSystemType;
  /** 0.0 – 1.0 */
  confidence:    number;
  sources:       HeuristicSource[];
  reasoning:     string;
  action:        ConfidenceAction;
  badgeColor:    'green' | 'yellow' | 'orange' | 'red';
  /** ID of the geometric cluster this shape belongs to, or null. */
  clusterId:     string | null;
  /** Number of shapes in the cluster (1 = unique). */
  clusterSize:   number;
};

export type ShapeCluster = {
  clusterId: string;
  shapeIds:  string[];
};

export type UseFallbackIntelligenceResult = {
  /** Map from shapeId → suggestion for all unassigned shapes on the active page. */
  suggestions:             Map<string, HeuristicSuggestion>;
  /** Geometric similarity clusters with ≥ 2 members. */
  clusters:                ShapeCluster[];
  /**
   * Apply a system type label to multiple shapes at once.
   * Wires directly to `useStudioStore.updateShape`.
   */
  applyBulkClassification: (shapeIds: string[], systemType: string) => void;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIDENCE_AUTO_APPLY  = 0.85;
const CONFIDENCE_SUGGEST     = 0.70;
const CONFIDENCE_FLAG        = 0.50;

/** Two shapes are considered geometrically identical if similarity ≥ this. */
const CLUSTER_THRESHOLD = 0.92;

/**
 * Real-world size constraints per system type (inches).
 * Used to boost or penalise aspect-ratio suggestions.
 * Source: legacy size_constraints extracted from ai_markup_detector_v2.py.
 */
const SIZE_CONSTRAINTS: Record<
  GlazingSystemType,
  { minW: number; maxW: number; minH: number; maxH: number }
> = {
  door:         { minW: 30,   maxW: 72,   minH: 78,   maxH: 108  },
  window:       { minW: 12,   maxW: 96,   minH: 12,   maxH: 72   },
  storefront:   { minW: 48,   maxW: 720,  minH: 72,   maxH: 168  },
  curtain_wall: { minW: 48,   maxW: 960,  minH: 96,   maxH: 720  },
  entrance:     { minW: 36,   maxW: 240,  minH: 84,   maxH: 144  },
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Extract width/height in inches from rect or polygon — null for other types. */
function getShapeDimensions(
  shape: DrawnShape,
): { widthIn: number; heightIn: number } | null {
  if (shape.type === 'rect') {
    return { widthIn: shape.widthInches, heightIn: shape.heightInches };
  }
  if (shape.type === 'polygon') {
    return { widthIn: shape.bbWidthInches, heightIn: shape.bbHeightInches };
  }
  return null;
}

/**
 * Bottom edge of the shape as a 0–1 fraction of page height (0 = top, 1 = bottom).
 * Returns null for non-spatial shapes.
 */
function getRelativeBottom(shape: DrawnShape, pageHeightPx: number): number | null {
  if (pageHeightPx <= 0) return null;

  if (shape.type === 'rect') {
    return (shape.origin.y + shape.heightPx) / pageHeightPx;
  }
  if (shape.type === 'polygon') {
    const maxY = Math.max(...shape.points.map(p => p.y));
    return maxY / pageHeightPx;
  }
  return null;
}

/**
 * Bounding-box similarity: (aspect-ratio sim × 0.6) + (area ratio × 0.4).
 * Range 0.0 (completely different) → 1.0 (identical geometry).
 */
function calcBboxSimilarity(
  w1: number, h1: number,
  w2: number, h2: number,
): number {
  if (h1 <= 0 || h2 <= 0) return 0;

  const ar1 = w1 / h1;
  const ar2 = w2 / h2;
  const arDiff   = Math.abs(ar1 - ar2) / Math.max(ar1, ar2);
  const arSim    = 1 - Math.min(arDiff, 1);

  const area1    = w1 * h1;
  const area2    = w2 * h2;
  const areaSim  = (area1 > 0 && area2 > 0)
    ? Math.min(area1, area2) / Math.max(area1, area2)
    : 0;

  return arSim * 0.6 + areaSim * 0.4;
}

/** Group shapes into clusters using agglomerative single-linkage. Exported for useAIAutoScan. */
export function clusterShapes(shapes: DrawnShape[]): ShapeCluster[] {
  // shapeToCluster[id] = representative cluster id
  const shapeToCluster = new Map<string, string>();
  const clusterMembers = new Map<string, string[]>();

  for (const s of shapes) {
    shapeToCluster.set(s.id, s.id);
    clusterMembers.set(s.id, [s.id]);
  }

  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];

      const da = getShapeDimensions(a);
      const db = getShapeDimensions(b);
      if (!da || !db) continue;

      const sim = calcBboxSimilarity(da.widthIn, da.heightIn, db.widthIn, db.heightIn);
      if (sim < CLUSTER_THRESHOLD) continue;

      const cA = shapeToCluster.get(a.id)!;
      const cB = shapeToCluster.get(b.id)!;
      if (cA === cB) continue;

      // Merge cluster B into cluster A
      const bMembers = clusterMembers.get(cB) ?? [];
      const aMembers = clusterMembers.get(cA) ?? [];
      const merged   = [...aMembers, ...bMembers];
      clusterMembers.set(cA, merged);
      clusterMembers.delete(cB);
      for (const id of bMembers) shapeToCluster.set(id, cA);
    }
  }

  const result: ShapeCluster[] = [];
  for (const [clusterId, shapeIds] of clusterMembers) {
    if (shapeIds.length >= 2) {
      result.push({ clusterId, shapeIds });
    }
  }
  return result;
}

/** Infer system type from shape's vertical position on the page. */
function applySillHeight(
  shape: DrawnShape,
  pageHeightPx: number,
): { type: GlazingSystemType; confidence: number; reasoning: string } | null {
  const relBottom = getRelativeBottom(shape, pageHeightPx);
  if (relBottom === null) return null;

  // Assumed floor at bottom 5% of page; 10 ft floor-to-ceiling assumed.
  const distFromFloor  = 0.95 - relBottom;
  const sillHeightFt   = distFromFloor * 10;

  if (sillHeightFt < 0.5) {
    return {
      type:       'entrance',
      confidence: 0.75,
      reasoning:  `Sits at floor level (sill ~${(sillHeightFt * 12).toFixed(0)}" from floor) → entrance`,
    };
  }
  if (sillHeightFt >= 2.0 && sillHeightFt <= 4.0) {
    return {
      type:       'window',
      confidence: 0.65,
      reasoning:  `Elevated sill ~${sillHeightFt.toFixed(1)}ft → typical window`,
    };
  }
  if (sillHeightFt > 8.0) {
    return {
      type:       'window',
      confidence: 0.60,
      reasoning:  `High placement ~${sillHeightFt.toFixed(1)}ft → clerestory window`,
    };
  }
  return null;
}

/** Infer system type from width-to-height aspect ratio. */
function applyAspectRatio(
  widthIn: number,
  heightIn: number,
): { type: GlazingSystemType; confidence: number; reasoning: string } {
  const ar = heightIn > 0 ? widthIn / heightIn : 1;

  if (ar < 0.5) {
    return {
      type:       'door',
      confidence: 0.70,
      reasoning:  `Aspect ratio ${ar.toFixed(2)} (tall & narrow) → door`,
    };
  }
  if (ar <= 2.0) {
    return {
      type:       'window',
      confidence: 0.60,
      reasoning:  `Aspect ratio ${ar.toFixed(2)} (balanced) → window`,
    };
  }
  return {
    type:       'storefront',
    confidence: 0.75,
    reasoning:  `Aspect ratio ${ar.toFixed(2)} (wide & short) → storefront`,
  };
}

/**
 * Returns a confidence delta for a (type, width, height) triple.
 * +0.10 if both dimensions are within known product range.
 * -0.25 if both dimensions are outside range.
 * 0 otherwise.
 */
function sizeValidationDelta(
  type: GlazingSystemType,
  widthIn: number,
  heightIn: number,
): number {
  const c    = SIZE_CONSTRAINTS[type];
  const wOk  = widthIn  >= c.minW && widthIn  <= c.maxW;
  const hOk  = heightIn >= c.minH && heightIn <= c.maxH;
  if (wOk && hOk)   return  0.10;
  if (!wOk && !hOk) return -0.25;
  return 0;
}

type RawSuggestion = {
  type:       GlazingSystemType;
  confidence: number;
  source:     HeuristicSource;
  reasoning:  string;
};

/**
 * Merge multiple raw suggestions into a single decision:
 *   - Group by type, take max confidence per type
 *   - If 2+ sources agree on a type → ×1.10 boost (capped at 0.95)
 *   - Pick highest-confidence type
 *   - Assign action + badgeColor
 */
function makeDecision(raws: RawSuggestion[]): {
  suggestedType: GlazingSystemType;
  confidence:    number;
  sources:       HeuristicSource[];
  reasoning:     string;
  action:        ConfidenceAction;
  badgeColor:    'green' | 'yellow' | 'orange' | 'red';
} | null {
  if (raws.length === 0) return null;

  type Bucket = { conf: number; sources: HeuristicSource[]; reasons: string[] };
  const byType = new Map<GlazingSystemType, Bucket>();

  for (const r of raws) {
    const ex = byType.get(r.type);
    if (!ex) {
      byType.set(r.type, { conf: r.confidence, sources: [r.source], reasons: [r.reasoning] });
    } else {
      byType.set(r.type, {
        conf:    Math.max(ex.conf, r.confidence),
        sources: [...ex.sources, r.source],
        reasons: [...ex.reasons, r.reasoning],
      });
    }
  }

  let bestType:    GlazingSystemType = 'window';
  let bestConf     = 0;
  let bestSources: HeuristicSource[] = [];
  let bestReasons: string[]          = [];

  for (const [type, bucket] of byType) {
    let conf = bucket.conf;
    // Agreement boost: multiple sources agree → more confident
    if (bucket.sources.length >= 2) conf = Math.min(conf * 1.1, 0.95);
    if (conf > bestConf) {
      bestConf    = conf;
      bestType    = type;
      bestSources = bucket.sources;
      bestReasons = bucket.reasons;
    }
  }

  let action:     ConfidenceAction;
  let badgeColor: 'green' | 'yellow' | 'orange' | 'red';

  if (bestConf >= CONFIDENCE_AUTO_APPLY) {
    action = 'auto_apply';        badgeColor = 'green';
  } else if (bestConf >= CONFIDENCE_SUGGEST) {
    action = 'suggest_with_verify'; badgeColor = 'yellow';
  } else if (bestConf >= CONFIDENCE_FLAG) {
    action = 'flag';              badgeColor = 'orange';
  } else {
    action = 'ask';               badgeColor = 'red';
  }

  return {
    suggestedType: bestType,
    confidence:    bestConf,
    sources:       [...new Set(bestSources)],
    reasoning:     bestReasons.join('; '),
    action,
    badgeColor,
  };
}

// ── Public classification helper (used by useAIAutoScan) ─────────────────────

/**
 * Run all heuristics on a single shape and return a complete suggestion.
 * Exported so useAIAutoScan can classify pending shapes before they are
 * committed to the store.
 */
export function classifyShape(
  shape:         RectShape,
  pageHeightPx:  number,
  clusterSize:   number    = 1,
  clusterId:     string | null = null,
): HeuristicSuggestion | null {
  const dims = getShapeDimensions(shape);
  if (!dims) return null;

  const raws: RawSuggestion[] = [];

  const sill = applySillHeight(shape, pageHeightPx);
  if (sill) raws.push({ ...sill, source: 'sill_height' });

  const ar = applyAspectRatio(dims.widthIn, dims.heightIn);
  raws.push({ ...ar, source: 'aspect_ratio' });

  const boosted = raws.map(r => ({
    ...r,
    confidence: Math.max(
      0,
      Math.min(1, r.confidence + sizeValidationDelta(r.type, dims.widthIn, dims.heightIn)),
    ),
  }));

  const decision = makeDecision(boosted);
  if (!decision) return null;

  return {
    shapeId:       shape.id,
    suggestedType: decision.suggestedType,
    confidence:    decision.confidence,
    sources:       decision.sources,
    reasoning:     decision.reasoning,
    action:        decision.action,
    badgeColor:    decision.badgeColor,
    clusterId,
    clusterSize,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFallbackIntelligence(): UseFallbackIntelligenceResult {
  const shapes      = useStudioStore(s => s.shapes);
  const activePageId = useStudioStore(s => s.activePageId);
  const pages       = useStudioStore(s => s.pages);
  const updateShape = useStudioStore(s => s.updateShape);

  const pageHeightPx = useMemo(
    () => pages.find(p => p.id === activePageId)?.heightPx ?? 1224,
    [pages, activePageId],
  );

  /** Rect and polygon shapes on the active page that have no system type yet. */
  const targetShapes = useMemo(
    () => shapes.filter(s =>
      s.pageId === activePageId &&
      (s.type === 'rect' || s.type === 'polygon') &&
      !(s as RectShape | PolygonShape).frameSystemType,
    ),
    [shapes, activePageId],
  );

  const clusters = useMemo(() => clusterShapes(targetShapes), [targetShapes]);

  /** Fast reverse-lookup: shapeId → its cluster (if any). */
  const clusterByShapeId = useMemo(() => {
    const map = new Map<string, ShapeCluster>();
    for (const cluster of clusters) {
      for (const id of cluster.shapeIds) map.set(id, cluster);
    }
    return map;
  }, [clusters]);

  const suggestions = useMemo(() => {
    const result = new Map<string, HeuristicSuggestion>();

    for (const shape of targetShapes) {
      const dims = getShapeDimensions(shape);
      if (!dims) continue;

      const raws: RawSuggestion[] = [];

      // Sill height
      const sill = applySillHeight(shape, pageHeightPx);
      if (sill) raws.push({ ...sill, source: 'sill_height' });

      // Aspect ratio
      const ar = applyAspectRatio(dims.widthIn, dims.heightIn);
      raws.push({ ...ar, source: 'aspect_ratio' });

      // Apply size-validation delta to each raw suggestion
      const boosted = raws.map(r => ({
        ...r,
        confidence: Math.max(
          0,
          Math.min(r.confidence + sizeValidationDelta(r.type, dims.widthIn, dims.heightIn), 0.95),
        ),
      }));

      const decision = makeDecision(boosted);
      if (!decision) continue;

      const cluster = clusterByShapeId.get(shape.id);

      result.set(shape.id, {
        shapeId:       shape.id,
        suggestedType: decision.suggestedType,
        confidence:    decision.confidence,
        sources:       decision.sources,
        reasoning:     decision.reasoning,
        action:        decision.action,
        badgeColor:    decision.badgeColor,
        clusterId:     cluster?.clusterId ?? null,
        clusterSize:   cluster?.shapeIds.length ?? 1,
      });
    }

    return result;
  }, [targetShapes, pageHeightPx, clusterByShapeId]);

  const applyBulkClassification = useCallback(
    (shapeIds: string[], systemType: string) => {
      for (const id of shapeIds) {
        // Cast is safe: frameSystemType is a string field on rect/polygon shapes
        updateShape(id, { frameSystemType: systemType } as Partial<RectShape>);
      }
    },
    [updateShape],
  );

  return { suggestions, clusters, applyBulkClassification };
}
