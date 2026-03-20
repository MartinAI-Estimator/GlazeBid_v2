/**
 * rakeMath.ts  —  Geometry for raked (sloped head/sill) glazing frames.
 *
 * A raked frame is defined by 4 corners in PDF page space (pixels, origin TL):
 *   tl = top-left, tr = top-right, br = bottom-right, bl = bottom-left
 *
 * Design intent (from legacy GlazeBid_AIQ):
 *   - The head (top edge) may be sloped; sill is typically level.
 *   - Width for quoting  = average of top and bottom edge lengths.
 *   - Height for quoting = average of left and right edge lengths.
 *   - Gross area         = shoelace formula on the 4 corners.
 *
 * All functions are pure: no React, no side-effects.
 */

import type { PagePoint } from '../coordinateSystem';
import { distancePx }     from '../coordinateSystem';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Four corners of a raked frame in PDF page space (pixels). */
export type RakedQuad = {
  tl: PagePoint;  // top-left
  tr: PagePoint;  // top-right
  br: PagePoint;  // bottom-right
  bl: PagePoint;  // bottom-left
};

export type RakeAssembly = {
  /** Mean of top + bottom widths in inches — used for quoting profiles. */
  avgWidthInch:    number;
  /** Mean of left + right heights in inches. */
  avgHeightInch:   number;
  /** Width of the top (head) edge in inches. */
  topWidthInch:    number;
  /** Width of the bottom (sill) edge in inches. */
  bottomWidthInch: number;
  /** Height of the left jamb in inches. */
  leftHeightInch:  number;
  /** Height of the right jamb in inches. */
  rightHeightInch: number;
  /**
   * Slope angle of the head (top edge) in degrees.
   * 0° = perfectly level; positive = head rises from left to right.
   */
  headSlopeDeg: number;
  /**
   * Slope angle of the sill (bottom edge) in degrees.
   * Usually near 0° for a standard raked frame.
   */
  sillSlopeDeg:  number;
  /** Gross area in square feet (shoelace on 4 corners). */
  areaSqFt:      number;
  /** Perimeter in linear feet. */
  perimeterFt:   number;
};

// ── Core Math ─────────────────────────────────────────────────────────────────

/**
 * Shoelace formula for polygon area in page-pixel² (always positive).
 */
function shoelacePx(pts: PagePoint[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Returns the angle (degrees) of the line p1 → p2 measured from horizontal.
 * 0° = left-to-right horizontal. Positive = line rises to the right (in PDF space
 * where Y increases downward, a negative result means rise in screen terms).
 */
function slopeDeg(p1: PagePoint, p2: PagePoint): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
}

/**
 * Compute the full RakeAssembly for a quadrilateral raked frame.
 *
 * @param quad          - Four corners in page-space pixels (tl, tr, br, bl).
 * @param pixelsPerInch - Calibrated PPI for this page.
 */
export function computeRakeAssembly(
  quad:          RakedQuad,
  pixelsPerInch: number,
): RakeAssembly {
  const { tl, tr, br, bl } = quad;
  const ppi = pixelsPerInch > 0 ? pixelsPerInch : 72;

  const topPx    = distancePx(tl, tr);
  const bottomPx = distancePx(bl, br);
  const leftPx   = distancePx(tl, bl);
  const rightPx  = distancePx(tr, br);

  const topWidthInch    = topPx    / ppi;
  const bottomWidthInch = bottomPx / ppi;
  const leftHeightInch  = leftPx   / ppi;
  const rightHeightInch = rightPx  / ppi;

  const avgWidthInch  = (topWidthInch  + bottomWidthInch) / 2;
  const avgHeightInch = (leftHeightInch + rightHeightInch) / 2;

  const headSlopeDeg = slopeDeg(tl, tr);
  const sillSlopeDeg = slopeDeg(bl, br);

  const areaSqFt   = shoelacePx([tl, tr, br, bl]) / (ppi * ppi) / 144;
  const perimeterFt = (topPx + rightPx + bottomPx + leftPx) / ppi / 12;

  return {
    avgWidthInch:    Number(avgWidthInch.toFixed(3)),
    avgHeightInch:   Number(avgHeightInch.toFixed(3)),
    topWidthInch:    Number(topWidthInch.toFixed(3)),
    bottomWidthInch: Number(bottomWidthInch.toFixed(3)),
    leftHeightInch:  Number(leftHeightInch.toFixed(3)),
    rightHeightInch: Number(rightHeightInch.toFixed(3)),
    headSlopeDeg:    Number(headSlopeDeg.toFixed(2)),
    sillSlopeDeg:    Number(sillSlopeDeg.toFixed(2)),
    areaSqFt:        Number(areaSqFt.toFixed(4)),
    perimeterFt:     Number(perimeterFt.toFixed(3)),
  };
}

/**
 * Build a RakedQuad from four ordered page-space points.
 * Expected order: [topLeft, topRight, bottomRight, bottomLeft] (clockwise from TL).
 */
export function pointsToRakedQuad(
  pts: [PagePoint, PagePoint, PagePoint, PagePoint],
): RakedQuad {
  return { tl: pts[0], tr: pts[1], br: pts[2], bl: pts[3] };
}

/**
 * Axis-aligned bounding box of a RakedQuad.
 * Used to generate fallback `widthPx` / `heightPx` for a PolygonShape.
 */
export function rakedQuadAABB(quad: RakedQuad): {
  originX: number; originY: number; widthPx: number; heightPx: number;
} {
  const xs = [quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x];
  const ys = [quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    originX:  minX,
    originY:  minY,
    widthPx:  Math.max(...xs) - minX,
    heightPx: Math.max(...ys) - minY,
  };
}
