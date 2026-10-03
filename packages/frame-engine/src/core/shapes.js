/**
 * shapes.js — frame outlines.
 *
 * An outline is a closed CCW loop of LOGICAL edges in frame coordinates
 * (x → right from the left outside edge, y → up from the frame bottom, inches).
 * A logical edge is a straight line or a circular arc.  Arcs are flattened to
 * short chords for clipping/offsetting, but keep their radius for reporting
 * and for true arc-length cut lengths.
 *
 * Templates: rect, rake, trapezoid (alias of rake), gable, arch (radius / segment
 * top), half_round, octagon, polygon (free vertices, optional bulge per edge).
 */

import { EPS, num } from './units.js';

const ARC_TOL = 1 / 64;      // max chord deviation when flattening arcs

// ── Vector helpers ───────────────────────────────────────────────────────────

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** Signed area (positive = CCW). */
export function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function polyPerimeter(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += len(sub(pts[(i + 1) % pts.length], pts[i]));
  return s;
}

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Intersection of infinite lines p+t·d and q+u·e, or null when parallel. */
export function lineIntersect(p, d, q, e) {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, mul(d, t));
}

// ── Arc helpers ──────────────────────────────────────────────────────────────

/** Arc through a→b with DXF bulge (tan(θ/4); + = CCW). */
export function arcFromBulge(a, b, bulge) {
  const chord = sub(b, a);
  const c = len(chord);
  const theta = 4 * Math.atan(bulge);                // signed sweep
  const r = c / (2 * Math.sin(Math.abs(theta) / 2));
  const mid = mul(add(a, b), 0.5);
  const h = r * Math.cos(Math.abs(theta) / 2);       // center offset from chord midpoint
  const n = norm([-chord[1], chord[0]]);             // left normal of a→b
  const sign = (bulge > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const center = add(mid, mul(n, h * sign));
  const a0 = Math.atan2(a[1] - center[1], a[0] - center[0]);
  return { center, radius: r, start: a0, sweep: theta };
}

function flattenArc(arc, tol = ARC_TOL) {
  const { center, radius, start, sweep } = arc;
  const maxStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / Math.max(radius, tol))));
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / Math.max(maxStep, 1e-3)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = start + (sweep * i) / n;
    pts.push([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
  }
  return pts;
}

// ── Templates ────────────────────────────────────────────────────────────────

/**
 * Build vertex list (+ bulges) for a shape template.
 * @returns {{ verts: [number,number][], bulges: number[], template: string, params: object }}
 */
export function templateVertices(shape, W, H) {
  const t = shape?.type ?? 'rect';
  const p = shape?.params ?? {};
  switch (t) {
    case 'rake':
    case 'trapezoid': {
      const L = num(p.leftHeight, H); const R = num(p.rightHeight, H);
      return { template: t, params: { leftHeight: L, rightHeight: R },
        verts: [[0, 0], [W, 0], [W, R], [0, L]], bulges: [0, 0, 0, 0] };
    }
    case 'gable': {
      const L = num(p.leftHeight, H * 0.75); const R = num(p.rightHeight, L);
      const P = num(p.peakHeight, H); const px = num(p.peakX, W / 2);
      return { template: t, params: { leftHeight: L, rightHeight: R, peakHeight: P, peakX: px },
        verts: [[0, 0], [W, 0], [W, R], [px, P], [0, L]], bulges: [0, 0, 0, 0, 0] };
    }
    case 'half_round':
    case 'arch': {
      // springHeight = jamb height; rise = arch height above spring line.
      const spring = num(p.springHeight, t === 'half_round' ? H - W / 2 : H * 0.8);
      const rise = Math.min(num(p.rise, t === 'half_round' ? W / 2 : H - spring), W / 2);
      // bulge for the top edge (from right-top to left-top, CCW → positive)
      const bulge = rise > EPS ? (2 * rise) / W : 0;
      return { template: t, params: { springHeight: spring, rise, radius: rise > EPS ? (W * W / 4 + rise * rise) / (2 * rise) : null },
        verts: [[0, 0], [W, 0], [W, spring], [0, spring]], bulges: [0, 0, bulge, 0] };
    }
    case 'octagon': {
      const c = num(p.corner, Math.min(W, H) * 0.2929);
      return { template: t, params: { corner: c },
        verts: [[c, 0], [W - c, 0], [W, c], [W, H - c], [W - c, H], [c, H], [0, H - c], [0, c]],
        bulges: Array(8).fill(0) };
    }
    case 'polygon': {
      const vs = (shape.vertices ?? []).map((v) => [num(v.x, 0), num(v.y, 0)]);
      const bs = (shape.vertices ?? []).map((v) => num(v.bulge, 0));
      if (vs.length >= 3) {
        if (polyArea(vs) < 0) { vs.reverse(); bs.reverse(); bs.push(bs.shift()); for (let i = 0; i < bs.length; i++) bs[i] = -bs[i]; }
        return { template: t, params: {}, verts: vs, bulges: bs };
      }
      // fall through to rect
    }
    // eslint-disable-next-line no-fallthrough
    default:
      return { template: 'rect', params: {}, verts: [[0, 0], [W, 0], [W, H], [0, H]], bulges: [0, 0, 0, 0] };
  }
}

/**
 * Classify a logical edge by its outward normal: sill (faces down), jamb (faces
 * sideways), head (faces up / any upper edge).
 */
function classifyEdge(nOut) {
  if (nOut[1] < -0.7) return 'sill';
  if (Math.abs(nOut[0]) >= 0.7) return 'jamb';
  return 'head';
}

/**
 * Build the outline model.
 * @returns {{
 *   template, params, edges: Edge[], poly: [x,y][], bbox, width, height,
 *   topAt(x), bottomAt(x), leftAt(y), rightAt(y), perimeter
 * }}
 */
export function buildOutline(shape, W, H) {
  const { verts, bulges, template, params } = templateVertices(shape, W, H);
  const n = verts.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i]; const b = verts[(i + 1) % n];
    const bulge = bulges[i] || 0;
    let pts; let arc = null;
    if (Math.abs(bulge) > 1e-9) { arc = arcFromBulge(a, b, bulge); pts = flattenArc(arc); }
    else pts = [a, b];
    // outward normal at the edge midpoint (CCW loop → outward = right of travel)
    const mi = Math.floor((pts.length - 1) / 2);
    const d = norm(sub(pts[mi + 1], pts[mi]));
    const nOut = [d[1], -d[0]];
    edges.push({
      index: i, key: `P${i}`, a, b, arc, pts,
      role: classifyEdge(nOut),
      length: arc ? Math.abs(arc.sweep) * arc.radius : len(sub(b, a)),
      angleDeg: arc ? null : (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
    });
  }
  const poly = [];
  for (const e of edges) poly.push(...e.pts.slice(0, -1));
  const bb = bbox(poly);

  const segs = [];
  for (let i = 0; i < poly.length; i++) segs.push([poly[i], poly[(i + 1) % poly.length]]);

  const hitsV = (x) => {
    const ys = [];
    for (const [a, b] of segs) {
      if ((a[0] - x) * (b[0] - x) <= 0 && Math.abs(b[0] - a[0]) > 1e-12) {
        const t = (x - a[0]) / (b[0] - a[0]);
        ys.push(a[1] + t * (b[1] - a[1]));
      } else if (Math.abs(a[0] - x) < 1e-9 && Math.abs(b[0] - x) < 1e-9) { ys.push(a[1], b[1]); }
    }
    return ys;
  };
  const hitsH = (y) => {
    const xs = [];
    for (const [a, b] of segs) {
      if ((a[1] - y) * (b[1] - y) <= 0 && Math.abs(b[1] - a[1]) > 1e-12) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      } else if (Math.abs(a[1] - y) < 1e-9 && Math.abs(b[1] - y) < 1e-9) { xs.push(a[0], b[0]); }
    }
    return xs;
  };
  const clampX = (x) => Math.min(bb.x1 - 1e-7, Math.max(bb.x0 + 1e-7, x));
  const clampY = (y) => Math.min(bb.y1 - 1e-7, Math.max(bb.y0 + 1e-7, y));

  return {
    template, params, edges, poly, bbox: bb,
    width: bb.w, height: bb.h,
    perimeter: edges.reduce((s, e) => s + e.length, 0),
    topAt: (x) => { const ys = hitsV(clampX(x)); return ys.length ? Math.max(...ys) : bb.y1; },
    bottomAt: (x) => { const ys = hitsV(clampX(x)); return ys.length ? Math.min(...ys) : bb.y0; },
    leftAt: (y) => { const xs = hitsH(clampY(y)); return xs.length ? Math.min(...xs) : bb.x0; },
    rightAt: (y) => { const xs = hitsH(clampY(y)); return xs.length ? Math.max(...xs) : bb.x1; },
    isRect: template === 'rect',
  };
}

/** Point-in-polygon (even-odd). */
export function pointInPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Sutherland–Hodgman: clip `subject` polygon by axis-aligned rect. */
export function clipPolyToRect(subject, x0, y0, x1, y1) {
  const planes = [
    { inside: (p) => p[0] >= x0 - 1e-9, cut: (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + t * (b[1] - a[1])]; } },
    { inside: (p) => p[0] <= x1 + 1e-9, cut: (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + t * (b[1] - a[1])]; } },
    { inside: (p) => p[1] >= y0 - 1e-9, cut: (a, b) => { const t = (y0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y0]; } },
    { inside: (p) => p[1] <= y1 + 1e-9, cut: (a, b) => { const t = (y1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y1]; } },
  ];
  let out = subject;
  for (const pl of planes) {
    const inp = out; out = [];
    if (!inp.length) break;
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i]; const prev = inp[(i + inp.length - 1) % inp.length];
      const ci = pl.inside(cur); const pi = pl.inside(prev);
      if (ci) { if (!pi) out.push(pl.cut(prev, cur)); out.push(cur); }
      else if (pi) out.push(pl.cut(prev, cur));
    }
  }
  return dedupe(out);
}

/** Drop duplicate consecutive points and collinear middles. */
export function dedupe(pts, eps = 1e-7) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push(p);
  }
  if (out.length > 1) {
    const f = out[0]; const l = out[out.length - 1];
    if (Math.abs(f[0] - l[0]) <= eps && Math.abs(f[1] - l[1]) <= eps) out.pop();
  }
  // remove collinear
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length]; const b = out[i]; const c = out[(i + 1) % out.length];
      if (Math.abs(cross(sub(b, a), sub(c, b))) < 1e-9 && dot(sub(b, a), sub(c, b)) > 0) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out;
}

/**
 * Offset a CCW polygon INWARD by a per-edge distance (negative = outward).
 * Edge i runs pts[i] → pts[i+1].  Works for convex polygons (all frame lites
 * are convex: rect ∩ convex outline).
 */
export function offsetPolygon(pts, dists) {
  const n = pts.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i]; const b = pts[(i + 1) % n];
    const d = norm(sub(b, a));
    const inward = [-d[1], d[0]];                     // left of travel = inside for CCW
    lines.push({ p: add(a, mul(inward, dists[i])), d });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L0 = lines[(i + n - 1) % n]; const L1 = lines[i];
    const x = lineIntersect(L0.p, L0.d, L1.p, L1.d);
    out.push(x ?? L1.p);
  }
  return out;
}
