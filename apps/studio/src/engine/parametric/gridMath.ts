/**
 * gridMath.ts  —  Internal grid / mullion layout math.
 *
 * Ported from legacy GlazeBid_AIQ:
 *   - `buildSmartFrameAssembly()` in frontend/src/components/PDFViewer.jsx
 *   - `calculateJoints()` in frontend/src/utils/partnerPakGenerator.js
 *   - `calculateFormulaBaseValue('MULLION_LF', ...)` in frontend/src/utils/pricingLogic.js
 *
 * All functions are pure: no React, no side-effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

import type { DoorSpec } from './doorMath';
export type { DoorSpec };

/**
 * Glass type for a specific daylight opening.
 * Stored on GridSpec.bayTypes so bay-level glass choices persist with the grid.
 */
export type GlassType = 'vision' | 'spandrel';

/**
 * A frame's internal grid specification.
 * Stored on `RectShape.grid` and `PolygonShape.grid`.
 */
export type GridSpec = {
  /** Number of horizontal rows of glass lites. */
  rows: number;
  /** Number of vertical columns of glass lites. */
  cols: number;
  /**
   * Interior vertical mullion positions as a fraction [0, 1] of frame width.
   * e.g. [0.5] = one mullion at centre; [0.333, 0.667] = two mullions dividing thirds.
   * Must have exactly (cols − 1) entries after normalisation.
   */
  vertRelPositions: number[];
  /**
   * Interior horizontal mullion positions as a fraction [0, 1] of frame height.
   * 0 = top of frame, 1 = bottom of frame in PDF page space.
   */
  horizRelPositions: number[];
  /** Face dimension of each mullion member in inches (typical: 3"). */
  mullionWidthInch: number;
  /**
   * Door leaves assigned to specific bay columns.
   * A door in a bay omits the bottom sill extrusion and adds door hardware labor.
   */
  doors?: DoorSpec[];
  /**
   * Per-bay glass type override. Key format: `"${col},${row}"` (both 0-based).
   * Defaults to 'vision' for any unspecified bay.
   * Used by systemEngine to generate the glass list and mark spandrel lites.
   */
  bayTypes?: Record<string, GlassType>;
};

export type DaylightOpening = {
  col:        number; // 0-based column index
  row:        number; // 0-based row index
  widthInch:  number;
  heightInch: number;
};

export type GridAssembly = {
  /** LF of all vertical internal mullions (cols−1) × heightFt */
  verticalMullionLF:   number;
  /** LF of all horizontal internal mullions (rows−1) × widthFt */
  horizontalMullionLF: number;
  totalMullionLF:      number;
  /** Total glass panels = rows × cols */
  panels:              number;
  /** Width of each column bay in inches (left to right) */
  bayWidthsInch:    number[];
  /** Height of each row in inches (top to bottom) */
  rowHeightsInch:   number[];
  daylightOpenings: DaylightOpening[];
};

// ── Defaults ──────────────────────────────────────────────────────────────────

/** A single undivided frame — 1 row, 1 col, no interior mullions. */
export const DEFAULT_GRID: GridSpec = {
  rows:              1,
  cols:              1,
  vertRelPositions:  [],
  horizRelPositions: [],
  mullionWidthInch:  3.0,
  doors:             [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clamp relative positions to (0.02, 0.98) and deduplicate.
 * Matches legacy `normalizeRelativePositions()` in PDFViewer.jsx.
 */
export function normalizeRelPositions(values: number[]): number[] {
  const unique = new Set<number>();
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const c = Math.min(0.98, Math.max(0.02, v));
    unique.add(Number(c.toFixed(4)));
  }
  return Array.from(unique).sort((a, b) => a - b);
}

// ── Core Math ─────────────────────────────────────────────────────────────────

/**
 * Derive the full GridAssembly from a frame's real-world dimensions + GridSpec.
 *
 * Mullion LF formulas (from partnerPakGenerator.js):
 *   verticalMullionLF   = (cols − 1) × heightInch / 12
 *   horizontalMullionLF = (rows − 1) × widthInch / 12
 *
 * Bay / row sizing:
 *   - Vertical edges: [0, ...vertRelPositions × widthInch, widthInch]
 *   - Horizontal edges from top: [0, ...horizRelPositions × heightInch, heightInch]
 *     (positions are 0=top, 1=bottom in PDF page space)
 *
 * Daylight openings (each bay minus half a mullion on each side):
 *   dlo.width  = max(bayWidth  − mullionWidthInch, 0)
 *   dlo.height = max(rowHeight − mullionWidthInch, 0)
 */
export function computeGridAssembly(
  widthInch:  number,
  heightInch: number,
  grid:       GridSpec,
): GridAssembly {
  const mw       = grid.mullionWidthInch;
  const vertRel  = normalizeRelPositions(grid.vertRelPositions);
  const horizRel = normalizeRelPositions(grid.horizRelPositions);

  // ── Bay widths (left → right) ──────────────────────────────────────────────
  const vertEdges = [0, ...vertRel.map(r => r * widthInch), widthInch]
    .sort((a, b) => a - b);
  const bayWidthsInch: number[] = [];
  for (let i = 0; i < vertEdges.length - 1; i++) {
    bayWidthsInch.push(Number((vertEdges[i + 1] - vertEdges[i]).toFixed(3)));
  }

  // ── Row heights (top → bottom) ────────────────────────────────────────────
  // horizRel: 0 = top, 1 = bottom in PDF page space → directly map to height
  const horizEdges = [0, ...horizRel.map(r => r * heightInch), heightInch]
    .sort((a, b) => a - b);
  const rowHeightsInch: number[] = [];
  for (let i = 0; i < horizEdges.length - 1; i++) {
    rowHeightsInch.push(Number((horizEdges[i + 1] - horizEdges[i]).toFixed(3)));
  }

  // ── Mullion linear feet ───────────────────────────────────────────────────
  const verticalMullionLF   = Number(((bayWidthsInch.length - 1) * heightInch / 12).toFixed(3));
  const horizontalMullionLF = Number(((rowHeightsInch.length - 1) * widthInch / 12).toFixed(3));
  const totalMullionLF      = Number((verticalMullionLF + horizontalMullionLF).toFixed(3));
  const panels              = bayWidthsInch.length * rowHeightsInch.length;

  // ── Daylight openings ─────────────────────────────────────────────────────
  const daylightOpenings: DaylightOpening[] = [];
  rowHeightsInch.forEach((rh, ri) => {
    bayWidthsInch.forEach((bw, ci) => {
      daylightOpenings.push({
        col:        ci,
        row:        ri,
        widthInch:  Number(Math.max(bw - mw, 0).toFixed(3)),
        heightInch: Number(Math.max(rh - mw, 0).toFixed(3)),
      });
    });
  });

  return {
    verticalMullionLF,
    horizontalMullionLF,
    totalMullionLF,
    panels,
    bayWidthsInch,
    rowHeightsInch,
    daylightOpenings,
  };
}

/**
 * Build a GridSpec with evenly-spaced mullions for a given rows × cols count.
 * Creates exactly (cols − 1) vertical and (rows − 1) horizontal interior lines.
 */
export function buildEvenGrid(
  rows:             number,
  cols:             number,
  mullionWidthInch: number = 3.0,
): GridSpec {
  const vertRel: number[] = [];
  for (let c = 1; c < cols; c++) {
    vertRel.push(Number((c / cols).toFixed(4)));
  }
  const horizRel: number[] = [];
  for (let r = 1; r < rows; r++) {
    horizRel.push(Number((r / rows).toFixed(4)));
  }
  return {
    rows,
    cols,
    vertRelPositions:  vertRel,
    horizRelPositions: horizRel,
    mullionWidthInch,
  };
}

/**
 * Add one vertical mullion at the given relative X position (0–1).
 * Recounts `cols` from the resulting edges.
 */
export function addVerticalMullion(grid: GridSpec, relX: number): GridSpec {
  const next = normalizeRelPositions([...grid.vertRelPositions, relX]);
  return { ...grid, vertRelPositions: next, cols: next.length + 1 };
}

/**
 * Add one horizontal mullion at the given relative Y position (0–1).
 * Recounts `rows` from the resulting edges.
 */
export function addHorizontalMullion(grid: GridSpec, relY: number): GridSpec {
  const next = normalizeRelPositions([...grid.horizRelPositions, relY]);
  return { ...grid, horizRelPositions: next, rows: next.length + 1 };
}

/**
 * Remove the vertical mullion closest to the given relative X position.
 */
export function removeClosestVertical(grid: GridSpec, relX: number): GridSpec {
  if (grid.vertRelPositions.length === 0) return grid;
  let minDist = Infinity;
  let minIdx  = 0;
  grid.vertRelPositions.forEach((v, i) => {
    const d = Math.abs(v - relX);
    if (d < minDist) { minDist = d; minIdx = i; }
  });
  const next = grid.vertRelPositions.filter((_, i) => i !== minIdx);
  return { ...grid, vertRelPositions: next, cols: next.length + 1 };
}

/**
 * Remove the horizontal mullion closest to the given relative Y position.
 */
export function removeClosestHorizontal(grid: GridSpec, relY: number): GridSpec {
  if (grid.horizRelPositions.length === 0) return grid;
  let minDist = Infinity;
  let minIdx  = 0;
  grid.horizRelPositions.forEach((v, i) => {
    const d = Math.abs(v - relY);
    if (d < minDist) { minDist = d; minIdx = i; }
  });
  const next = grid.horizRelPositions.filter((_, i) => i !== minIdx);
  return { ...grid, horizRelPositions: next, rows: next.length + 1 };
}
