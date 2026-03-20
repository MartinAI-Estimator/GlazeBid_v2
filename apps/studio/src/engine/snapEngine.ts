import type { PagePoint } from './coordinateSystem';
import type { DrawnShape } from '../types/shapes';

export type SnapType   = 'endpoint' | 'midpoint' | 'intersection' | 'none';
export type SnapResult = {
  snapped:  boolean;
  point:    PagePoint;
  snapType: SnapType;
};

const NONE_SNAP = (cursor: PagePoint): SnapResult =>
  ({ snapped: false, point: cursor, snapType: 'none' });

// ── Collect snap candidates ───────────────────────────────────────────────────

function candidates(
  shapes:  DrawnShape[],
  pageId:  string,
): Array<{ pt: PagePoint; type: SnapType }> {
  const out: Array<{ pt: PagePoint; type: SnapType }> = [];

  for (const s of shapes) {
    if (s.pageId !== pageId) continue;

    if (s.type === 'line') {
      const mid: PagePoint = { x: (s.start.x + s.end.x) / 2, y: (s.start.y + s.end.y) / 2 };
      out.push({ pt: s.start, type: 'endpoint' });
      out.push({ pt: s.end,   type: 'endpoint' });
      out.push({ pt: mid,     type: 'midpoint' });

    } else if (s.type === 'rect') {
      const { origin: o, widthPx: w, heightPx: h } = s;
      out.push({ pt: o,                                    type: 'endpoint' });
      out.push({ pt: { x: o.x + w, y: o.y },              type: 'endpoint' });
      out.push({ pt: { x: o.x + w, y: o.y + h },          type: 'endpoint' });
      out.push({ pt: { x: o.x,     y: o.y + h },          type: 'endpoint' });
      out.push({ pt: { x: o.x + w / 2, y: o.y },          type: 'midpoint' });
      out.push({ pt: { x: o.x + w / 2, y: o.y + h },      type: 'midpoint' });
      out.push({ pt: { x: o.x,         y: o.y + h / 2 },  type: 'midpoint' });
      out.push({ pt: { x: o.x + w,     y: o.y + h / 2 },  type: 'midpoint' });

    } else if (s.type === 'polygon') {
      for (let i = 0; i < s.points.length; i++) {
        const a = s.points[i];
        const b = s.points[(i + 1) % s.points.length];
        out.push({ pt: a,                              type: 'endpoint' });
        out.push({ pt: { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }, type: 'midpoint' });
      }
    }

    // Mullion intersection candidates — only for rect shapes with an interior grid
    if (s.type === 'rect' && s.grid && (
      s.grid.vertRelPositions.length > 0 || s.grid.horizRelPositions.length > 0
    )) {
      const { origin: o, widthPx: w, heightPx: h, grid } = s;
      // Mullion–mullion intersections (interior grid cross-points)
      for (const vr of grid.vertRelPositions) {
        for (const hr of grid.horizRelPositions) {
          out.push({ pt: { x: o.x + vr * w, y: o.y + hr * h }, type: 'intersection' });
        }
        // Vertical mullion hits top and bottom perimeter edges
        out.push({ pt: { x: o.x + vr * w, y: o.y     }, type: 'intersection' });
        out.push({ pt: { x: o.x + vr * w, y: o.y + h }, type: 'intersection' });
      }
      for (const hr of grid.horizRelPositions) {
        // Horizontal transom hits left and right perimeter edges
        out.push({ pt: { x: o.x,     y: o.y + hr * h }, type: 'intersection' });
        out.push({ pt: { x: o.x + w, y: o.y + hr * h }, type: 'intersection' });
      }
    }
  }

  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find the nearest snap point to the given cursor.
 *
 * @param cursor        - Current cursor in PAGE space.
 * @param shapes        - All committed shapes on the active page.
 * @param pageId        - Active page ID.
 * @param snapEnabled   - Object snap toggle from store.
 * @param thresholdPx   - Distance threshold in PAGE pixels
 *                        (convert from screen px: `snapThresholdScreen / cameraScale`).
 * @param pdfPoints     - Optional extra candidates from the PDF's own vector content
 *                        (supplied by pdfSnapParser; defaults to [] when not provided).
 */
export function findSnap(
  cursor:       PagePoint,
  shapes:       DrawnShape[],
  pageId:       string,
  snapEnabled:  boolean,
  thresholdPx:  number,
  pdfPoints:    PagePoint[] = [],
): SnapResult {
  if (!snapEnabled) return NONE_SNAP(cursor);

  let best     = NONE_SNAP(cursor);
  let bestDist = thresholdPx;

  for (const { pt, type } of candidates(shapes, pageId)) {
    const d = Math.sqrt((cursor.x - pt.x) ** 2 + (cursor.y - pt.y) ** 2);
    if (d < bestDist) {
      bestDist = d;
      best     = { snapped: true, point: pt, snapType: type };
    }
  }

  // PDF content snap — vector endpoints extracted from the PDF itself.
  // Treated as 'endpoint' so the magenta-square indicator renders.
  for (const pt of pdfPoints) {
    const d = Math.sqrt((cursor.x - pt.x) ** 2 + (cursor.y - pt.y) ** 2);
    if (d < bestDist) {
      bestDist = d;
      best     = { snapped: true, point: pt, snapType: 'endpoint' };
    }
  }

  return best;
}
