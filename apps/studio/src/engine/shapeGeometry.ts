/**
 * shapeGeometry.ts — measurement, handles and edits for committed shapes.
 *
 * Everything is in page space (PDF points as rendered by the tile manager).
 * Inches come from the page calibration (pixels per inch).
 *
 *   measure(shape)              → { lengthIn?, areaSf?, wIn?, hIn?, count? }
 *   recompute(shape, ppi)       → shape with lengthPx / *_Inches refreshed
 *   handlesOf(shape)            → editable handles (corners / edges / vertices)
 *   hitHandle(shape, pt, tol)   → handle under the cursor
 *   applyHandleDrag(shape, h, pt, ppi) → reshaped shape
 *   translate(shape, dx, dy, ppi)      → moved shape
 *   insertVertex / removeVertex
 *   fmtFtIn(inches)             → 12'-3 1/2"
 */
import type { DrawnShape, RectShape, PolygonShape, PolylineShape, LineShape, TextShape } from '../types/shapes';
import type { PagePoint } from './coordinateSystem';

export type Handle =
  | { kind: 'rect'; pos: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'; at: PagePoint }
  | { kind: 'vertex'; index: number; at: PagePoint }
  | { kind: 'end'; which: 'start' | 'end'; at: PagePoint }
  | { kind: 'leader'; at: PagePoint };

const dist = (a: PagePoint, b: PagePoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function polylineLengthPx(pts: PagePoint[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

export function polygonAreaPx(pts: PagePoint[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return Math.abs(a) / 2;
}

/** Re-derive the measured fields after geometry changed. */
export function recompute<T extends DrawnShape>(shape: T, ppi: number): T {
  if (shape.type === 'rect') {
    return { ...shape, widthInches: shape.widthPx / ppi, heightInches: shape.heightPx / ppi };
  }
  if (shape.type === 'polygon') {
    const xs = shape.points.map(p => p.x), ys = shape.points.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    return { ...shape, bbWidthPx: w, bbHeightPx: h, bbWidthInches: w / ppi, bbHeightInches: h / ppi };
  }
  if (shape.type === 'polyline') {
    const L = polylineLengthPx(shape.points);
    return { ...shape, lengthPx: L, lengthInches: L / ppi };
  }
  if (shape.type === 'line') {
    const L = dist(shape.start, shape.end);
    return { ...shape, lengthPx: L, lengthInches: L / ppi };
  }
  return shape;
}

export type Measure = { lengthIn?: number; areaSf?: number; wIn?: number; hIn?: number; count?: number };

export function measure(shape: DrawnShape, ppi: number): Measure {
  if (shape.type === 'rect') {
    const wIn = shape.widthPx / ppi, hIn = shape.heightPx / ppi;
    return { wIn, hIn, areaSf: (wIn * hIn) / 144 };
  }
  if (shape.type === 'polygon') {
    const xs = shape.points.map(p => p.x), ys = shape.points.map(p => p.y);
    return {
      areaSf: polygonAreaPx(shape.points) / (ppi * ppi) / 144,
      wIn: (Math.max(...xs) - Math.min(...xs)) / ppi,
      hIn: (Math.max(...ys) - Math.min(...ys)) / ppi,
    };
  }
  if (shape.type === 'polyline') return { lengthIn: polylineLengthPx(shape.points) / ppi };
  if (shape.type === 'line') return { lengthIn: dist(shape.start, shape.end) / ppi };
  if (shape.type === 'text') return {};
  return { count: 1 };
}

/** 12'-3 1/2"  (nearest 1/16") */
export function fmtFtIn(inches: number): string {
  const neg = inches < 0;
  let t = Math.round(Math.abs(inches) * 16);
  const ft = Math.floor(t / 192); t -= ft * 192;
  const inch = Math.floor(t / 16); let frac = t - inch * 16;
  let fs = '';
  if (frac) {
    let den = 16;
    while (frac % 2 === 0) { frac /= 2; den /= 2; }
    fs = ` ${frac}/${den}`;
  }
  return `${neg ? '-' : ''}${ft}'-${inch}${fs}"`;
}

export function fmtSf(sf: number): string {
  return sf >= 100 ? sf.toFixed(0) : sf.toFixed(2);
}

/** The label Bluebeam shows on a measurement markup. */
export function measureLabel(shape: DrawnShape, ppi: number): string[] {
  const m = measure(shape, ppi);
  if (shape.qtyOverride != null) {
    if (shape.subjectRole === 'count' || shape.type === 'marker') return [`${shape.qtyOverride} Thus`];
    if (m.areaSf !== undefined) return [`A = ${fmtSf(shape.qtyOverride)} sf (typed)`];
    return [`${fmtFtIn(shape.qtyOverride)} (typed)`];
  }
  if (shape.subjectRole === 'polylength' || shape.type === 'polyline' || shape.type === 'line') {
    return m.lengthIn !== undefined ? [fmtFtIn(m.lengthIn)] : [];
  }
  if (m.areaSf !== undefined) {
    const out = [`A = ${fmtSf(m.areaSf)} sf`];
    if (m.wIn !== undefined && m.hIn !== undefined) out.push(`W = ${fmtFtIn(m.wIn)}`, `H = ${fmtFtIn(m.hIn)}`);
    return out;
  }
  return [];
}

// ── Handles ────────────────────────────────────────────────────────────────────

export function handlesOf(shape: DrawnShape): Handle[] {
  if (shape.type === 'text') {
    const box = handlesOf({ ...shape, type: 'rect', widthInches: 0, heightInches: 0 } as unknown as RectShape);
    return shape.leader ? [...box, { kind: 'leader', at: shape.leader }] : box;
  }
  if (shape.type === 'rect') {
    const { x, y } = shape.origin, w = shape.widthPx, h = shape.heightPx;
    return [
      { kind: 'rect', pos: 'nw', at: { x, y } },
      { kind: 'rect', pos: 'n', at: { x: x + w / 2, y } },
      { kind: 'rect', pos: 'ne', at: { x: x + w, y } },
      { kind: 'rect', pos: 'e', at: { x: x + w, y: y + h / 2 } },
      { kind: 'rect', pos: 'se', at: { x: x + w, y: y + h } },
      { kind: 'rect', pos: 's', at: { x: x + w / 2, y: y + h } },
      { kind: 'rect', pos: 'sw', at: { x, y: y + h } },
      { kind: 'rect', pos: 'w', at: { x, y: y + h / 2 } },
    ];
  }
  if (shape.type === 'polygon' || shape.type === 'polyline') {
    return shape.points.map((p, i) => ({ kind: 'vertex' as const, index: i, at: p }));
  }
  if (shape.type === 'line') {
    return [{ kind: 'end', which: 'start', at: shape.start }, { kind: 'end', which: 'end', at: shape.end }];
  }
  return [];
}

export function hitHandle(shape: DrawnShape, pt: PagePoint, tol: number): Handle | null {
  for (const h of handlesOf(shape)) if (dist(h.at, pt) <= tol) return h;
  return null;
}

export function applyHandleDrag(shape: DrawnShape, h: Handle, pt: PagePoint, ppi: number): DrawnShape {
  if (shape.type === 'text') {
    if (h.kind === 'leader') return { ...shape, leader: { x: pt.x, y: pt.y } };
    const r = applyHandleDrag({ ...shape, type: 'rect', widthInches: 0, heightInches: 0 } as unknown as RectShape, h, pt, ppi) as RectShape;
    return { ...shape, origin: r.origin, widthPx: r.widthPx, heightPx: r.heightPx } as TextShape;
  }
  if (shape.type === 'rect' && h.kind === 'rect') {
    let x0 = shape.origin.x, y0 = shape.origin.y, x1 = x0 + shape.widthPx, y1 = y0 + shape.heightPx;
    if (h.pos.includes('w')) x0 = pt.x;
    if (h.pos.includes('e')) x1 = pt.x;
    if (h.pos.includes('n')) y0 = pt.y;
    if (h.pos.includes('s')) y1 = pt.y;
    const r: RectShape = {
      ...shape,
      origin: { x: Math.min(x0, x1), y: Math.min(y0, y1) },
      widthPx: Math.max(1, Math.abs(x1 - x0)),
      heightPx: Math.max(1, Math.abs(y1 - y0)),
    };
    return recompute(r, ppi);
  }
  if ((shape.type === 'polygon' || shape.type === 'polyline') && h.kind === 'vertex') {
    const pts = shape.points.slice();
    pts[h.index] = { x: pt.x, y: pt.y };
    return recompute({ ...shape, points: pts } as PolygonShape | PolylineShape, ppi);
  }
  if (shape.type === 'line' && h.kind === 'end') {
    const l: LineShape = { ...shape, [h.which]: { x: pt.x, y: pt.y } };
    return recompute(l, ppi);
  }
  return shape;
}

export function translate(shape: DrawnShape, dx: number, dy: number, ppi: number): DrawnShape {
  const mv = (p: PagePoint) => ({ x: p.x + dx, y: p.y + dy });
  switch (shape.type) {
    case 'rect': return { ...shape, origin: mv(shape.origin) };
    case 'polygon': return { ...shape, points: shape.points.map(mv) };
    case 'polyline': return recompute({ ...shape, points: shape.points.map(mv) }, ppi);
    case 'line': return { ...shape, start: mv(shape.start), end: mv(shape.end) };
    case 'marker': return { ...shape, position: mv(shape.position) };
    case 'text': return { ...shape, origin: mv(shape.origin) };   // the leader point stays where it points
  }
}

/** Nearest edge of a polygon / polyline to pt (index of the segment's first vertex) within tol. */
export function hitEdge(shape: DrawnShape, pt: PagePoint, tol: number): { index: number; at: PagePoint } | null {
  if (shape.type !== 'polygon' && shape.type !== 'polyline') return null;
  const pts = shape.points;
  const n = shape.type === 'polygon' ? pts.length : pts.length - 1;
  let best: { index: number; at: PagePoint; d: number } | null = null;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (!L2) continue;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / L2));
    const at = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const d = dist(at, pt);
    if (d <= tol && (!best || d < best.d)) best = { index: i, at, d };
  }
  return best ? { index: best.index, at: best.at } : null;
}

export function insertVertex(shape: DrawnShape, edgeIndex: number, at: PagePoint, ppi: number): DrawnShape {
  if (shape.type !== 'polygon' && shape.type !== 'polyline') return shape;
  const pts = shape.points.slice();
  pts.splice(edgeIndex + 1, 0, { x: at.x, y: at.y });
  return recompute({ ...shape, points: pts } as PolygonShape | PolylineShape, ppi);
}

export function removeVertex(shape: DrawnShape, index: number, ppi: number): DrawnShape {
  if (shape.type === 'polygon' && shape.points.length > 3) {
    return recompute({ ...shape, points: shape.points.filter((_, i) => i !== index) }, ppi);
  }
  if (shape.type === 'polyline' && shape.points.length > 2) {
    return recompute({ ...shape, points: shape.points.filter((_, i) => i !== index) }, ppi);
  }
  return shape;
}
