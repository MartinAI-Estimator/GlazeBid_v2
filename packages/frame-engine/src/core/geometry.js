/**
 * geometry.js — solve a FrameSpec into members, joints, pieces and lites.
 *
 *   spec ──► size (RO − joints | frame) ──► outline ──► columns (DLO / EQ / door)
 *        ──► rows per column ──► members (perimeter edges, verticals, horizontals)
 *        ──► joints (owner = which member runs through) ──► cut pieces
 *        ──► faces (lites / door openings) ──► DLO polygon ──► glass polygon
 *
 * Coordinates: x right from the frame's left outside edge, y up from the frame
 * bottom (the sill AFF is added only when an absolute height is needed).
 * Member positions are CENTERLINES; a member of sightline s occupies ±s/2.
 * Perimeter members sit INSIDE the outline, s deep.
 *
 * Run-through rule at every joint ('v' = the vertical/perimeter-side member runs
 * through, 'h' = the horizontal runs through).  Frame default + per-joint override.
 */

import { EPS, num, r4 } from './units.js';
import {
  buildOutline, clipPolyToRect, dedupe, offsetPolygon, polyArea, polyPerimeter, bbox,
  pointInPoly, sub, norm, add, mul, lineIntersect, len, cross,
} from './shapes.js';
import { getSystem, JOINERY } from './library.js';
import { normalizeSpec } from './model.js';

const MIN_LITE = 0.5;
const TOL = 1 / 64;

// ── Profiles ────────────────────────────────────────────────────────────────

/** Effective profile set for a frame (library + frame overrides). */
export function effectiveSystem(spec, customSystems = []) {
  const sys = getSystem(spec.systemId, customSystems);
  const o = spec.overrides ?? {};
  const profiles = {};
  for (const role of ['jamb', 'head', 'sill', 'mullion', 'horizontal']) {
    profiles[role] = { ...(sys.profiles?.[role] ?? { sightline: 2, depth: 4.5 }), ...(o.profiles?.[role] ?? {}) };
  }
  profiles.doorHeader = { ...profiles.horizontal, ...(o.profiles?.doorHeader ?? {}) };
  const joinery = spec.joinery && JOINERY[spec.joinery] && !JOINERY[spec.joinery].reserved
    ? spec.joinery : sys.defaultJoinery;
  return {
    sys,
    joinery,
    family: sys.family,
    profiles,
    glazing: {
      addPerAxis: num(o.glassAddPerAxis, sys.glazing?.addPerAxis ?? 0.75),
      ssgAddPerEdge: o.ssgAddPerEdge != null ? num(o.ssgAddPerEdge, null) : (sys.glazing?.ssgAddPerEdge ?? null),
    },
    stockLengthIn: num(o.stockLengthIn, sys.stockLengthIn ?? 288),
    dies: { ...(sys.dies ?? {}), ...(o.dies ?? {}) },
    accessories: { ...(sys.accessories ?? {}), ...(o.accessories ?? {}) },
  };
}

// ── EQ solver ────────────────────────────────────────────────────────────────

/**
 * Solve a list of {dlo|null, locked} against an available total.
 * null = EQ (shares the remainder).  Locked values never change.
 * If nothing is EQ the LAST unlocked entry absorbs the difference (flagged).
 */
export function solveEq(items, available, label, warnings, minEach = 0) {
  const vals = items.map((it) => (it.dlo === null || it.dlo === undefined || it.dlo === '' ? null : num(it.dlo, null)));
  const fixed = vals.reduce((s, v) => s + (v ?? 0), 0);
  const eqIdx = vals.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  const out = vals.slice();
  if (eqIdx.length) {
    const share = (available - fixed) / eqIdx.length;
    eqIdx.forEach((i) => { out[i] = share; });
    if (share < minEach - EPS) warnings.push(`${label}: EQ ${label.includes('row') ? 'rows' : 'bays'} solve to ${r4(share)}" — less than the ${minEach}" minimum.`);
  } else if (Math.abs(fixed - available) > TOL) {
    const absorb = [...items.keys()].reverse().find((i) => !items[i].locked);
    if (absorb !== undefined) {
      out[absorb] = vals[absorb] + (available - fixed);
      warnings.push(`${label}: entered DLOs total ${r4(fixed)}" but ${r4(available)}" is available — ${label.includes('row') ? 'row' : 'bay'} ${absorb + 1} absorbs ${r4(available - fixed)}".`);
    } else {
      warnings.push(`${label}: entered DLOs total ${r4(fixed)}" but ${r4(available)}" is available and every entry is locked.`);
    }
  }
  return { values: out, eq: vals.map((v) => v === null) };
}

// ── Main solve ───────────────────────────────────────────────────────────────

/**
 * @param {object} specIn  FrameSpec (see model.js)
 * @param {object} [ctx]   { customSystems, company }
 */
export function solveFrame(specIn, ctx = {}) {
  const spec = normalizeSpec(specIn);
  const warnings = [];
  const es = effectiveSystem(spec, ctx.customSystems);
  const P = es.profiles;

  // ── 1. Size ──
  const sz = spec.size;
  let W = num(sz.width, 0); let H = num(sz.height, 0);
  if (sz.mode === 'ro') {
    const j = sz.joints;
    W = W - num(j.left, 0) - num(j.right, 0);
    H = H - num(j.head, 0) - num(j.sill, 0);
  }
  if (!(W > 0) || !(H > 0)) {
    warnings.push('Frame width and height must be greater than zero.');
    W = Math.max(W, 1); H = Math.max(H, 1);
  }
  const sillAFF = num(spec.sillAFF, 0) + (sz.mode === 'ro' ? 0 : 0);

  // ── 2. Outline ──
  const outline = buildOutline(spec.shape, W, H);
  const topY = outline.bbox.y1;
  const perimSL = (role) => (role === 'jamb' ? P.jamb.sightline : role === 'sill' ? P.sill.sightline : P.head.sightline);
  outline.edges.forEach((e) => { e.sightline = perimSL(e.role); });

  // ── 3. Columns ──
  const cols = spec.columns;
  const nC = cols.length;
  const jambL = P.jamb.sightline; const jambR = P.jamb.sightline; const mullSL = P.mullion.sightline;
  const availW = W - jambL - jambR - (nC - 1) * mullSL;
  const colSolve = solveEq(cols.map((c) => ({ dlo: c.kind === 'door' && c.dlo == null ? 36 * (c.door?.kind === 'pair' ? 2 : 1) : c.dlo, locked: c.kind === 'door' || c.locked })),
    availW, 'Bays', warnings, 4);
  const colW = colSolve.values;
  // vertical line centerlines between columns
  const vx = []; let x = jambL;
  for (let c = 0; c < nC; c++) {
    const x0 = x; const x1 = x + colW[c];
    cols[c]._x0 = x0; cols[c]._x1 = x1;
    x = x1 + mullSL;
    if (c < nC - 1) vx.push(x1 + mullSL / 2);
  }
  if (colW.some((w) => !(w > 0))) warnings.push('One or more bays have no width — check bay DLOs.');

  // ── 4. Members ──
  // Interior verticals (mullions) V1..V(n-1), minus removed ranges; plus extra verticals.
  const members = [];      // { key, kind: 'v'|'h'|'p', role, sl, ... }
  const vlines = [];       // interior vertical segments
  const hsegs = [];        // interior horizontal segments
  const headUnder = (xa, xb) => {
    // lowest head underside over [xa, xb] (vertical depth of head face under sloped/arc tops)
    let m = Infinity;
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const xx = xa + ((xb - xa) * i) / steps;
      m = Math.min(m, innerTopAt(outline, xx, P.head.sightline));
    }
    return m;
  };

  for (let i = 0; i < vx.length; i++) {
    const key = `V${i + 1}`;
    vlines.push({ key, x: vx[i], y0: outline.bottomAt(vx[i]), y1: outline.topAt(vx[i]), sl: mullSL, role: 'mullion', kind: 'v', col: i });
  }

  // Rows per column
  const lites = [];
  const doors = [];
  for (let c = 0; c < nC; c++) {
    const col = cols[c];
    const isDoor = col.kind === 'door';
    const xl = c === 0 ? jambL : vx[c - 1] + mullSL / 2;
    const xr = c === nC - 1 ? W - jambR : vx[c] - mullSL / 2;
    const xlC = c === 0 ? 0 : vx[c - 1];            // boundary centerline (0 = outline)
    const xrC = c === nC - 1 ? W : vx[c];
    col._xl = xl; col._xr = xr;
    const step = isDoor ? 0 : Math.max(0, num(col.sillStep, 0));
    const under = headUnder(xl, xr);

    let base;           // y of the top face of the lowest member in this column
    if (isDoor) {
      const d = col.door ?? {};
      const dh = num(d.height, 84);
      const hdrSL = P.doorHeader.sightline;
      const headerFits = dh + hdrSL < under - MIN_LITE;
      if (dh > under + EPS) warnings.push(`Bay ${c + 1}: door height ${r4(dh)}" is taller than the frame allows (${r4(under)}").`);
      if (headerFits) {
        hsegs.push({ key: `DH${c}`, y: dh + hdrSL / 2, x0: xlC, x1: xrC, sl: hdrSL, role: 'doorHeader', kind: 'h', col: c });
        base = dh + hdrSL;
      } else {
        base = null;     // door runs to the head — no header, no transom
        if (dh < under - EPS) warnings.push(`Bay ${c + 1}: ${r4(under - dh)}" between door and head — too small for a header + transom; door taken to the head.`);
      }
      doors.push({ col: c, key: `DR${c}`, spec: d, x0: xl, x1: xr, width: xr - xl, height: base == null ? under : dh, headerSL: base == null ? 0 : hdrSL });
    } else {
      if (step > 0) {
        hsegs.push({ key: `SS${c}`, y: step + P.sill.sightline / 2, x0: xlC, x1: xrC, sl: P.sill.sightline, role: 'sill', kind: 'h', col: c, stepped: true });
        base = step + P.sill.sightline;
      } else base = P.sill.sightline;
    }

    if (base !== null) {
      const rowsIn = spec.bayRows?.[c] ?? (isDoor ? [{ dlo: null }] : spec.rows);
      const nR = rowsIn.length;
      const hSL = P.horizontal.sightline;
      const avail = under - base - (nR - 1) * hSL;
      const rs = solveEq(rowsIn.map((r) => ({ dlo: r.dlo, locked: !!r.locked })), avail,
        `Bay ${c + 1} rows`, warnings, 0);
      let y = base;
      for (let k = 0; k < nR - 1; k++) {
        y += rs.values[k];
        hsegs.push({ key: `H${c}.${k + 1}`, y: y + hSL / 2, x0: xlC, x1: xrC, sl: hSL, role: 'horizontal', kind: 'h', col: c });
        y += hSL;
      }
      col._rows = rs.values; col._rowEq = rs.eq;
    } else { col._rows = []; col._rowEq = []; }
    col._base = base; col._under = under; col._step = step;
  }

  // Extra (split) members
  for (const xm of spec.extraMembers ?? []) {
    const sl = xm.orient === 'v' ? num(xm.sightline, mullSL) : num(xm.sightline, P.horizontal.sightline);
    if (xm.orient === 'v') vlines.push({ key: xm.key, x: num(xm.at, 0), y0: num(xm.from, 0), y1: num(xm.to, 0), sl, role: 'mullion', kind: 'v', extra: true });
    else hsegs.push({ key: xm.key, y: num(xm.at, 0), x0: num(xm.from, 0), x1: num(xm.to, 0), sl, role: 'horizontal', kind: 'h', extra: true });
  }

  // Removals: whole members or vertical ranges
  const removed = new Set((spec.removedMembers ?? []).filter((r) => typeof r === 'string'));
  const rangeRemovals = (spec.removedMembers ?? []).filter((r) => r && typeof r === 'object');
  const hByKey = new Map(hsegs.map((h) => [h.key, h]));
  let vlinesCut = [];
  for (const v of vlines) {
    if (removed.has(v.key)) continue;
    let pieces = [{ ...v }];
    for (const rr of rangeRemovals.filter((r) => r.v === v.key)) {
      const ya = rr.from === 'BOT' ? -Infinity : hByKey.get(rr.from)?.y;
      const yb = rr.to === 'TOP' ? Infinity : hByKey.get(rr.to)?.y;
      if (ya === undefined || yb === undefined) continue;
      const next = [];
      for (const p of pieces) {
        if (yb <= p.y0 || ya >= p.y1) { next.push(p); continue; }
        if (ya > p.y0 + EPS) next.push({ ...p, y1: ya, key: `${p.key}` });
        if (yb < p.y1 - EPS) next.push({ ...p, y0: yb, key: `${p.key}` });
      }
      pieces = next;
    }
    pieces.forEach((p, i) => { vlinesCut.push({ ...p, key: pieces.length > 1 ? `${v.key}${String.fromCharCode(97 + i)}` : v.key, line: v.key }); });
  }
  const hsegsLive = hsegs.filter((h) => !removed.has(h.key));

  // ── 5. Faces (lites + door openings) by cell union ──
  const xs = uniqSorted([0, W, ...vlinesCut.map((v) => v.x), ...hsegsLive.flatMap((h) => [h.x0, h.x1])]);
  const ys = uniqSorted([0, topY, ...hsegsLive.map((h) => h.y), ...vlinesCut.flatMap((v) => [v.y0, v.y1])]);
  const nx = xs.length - 1; const ny = ys.length - 1;
  const cellId = (i, j) => j * nx + i;
  const parent = new Int32Array(nx * ny).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };

  const inside = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2; const cy = (ys[j] + ys[j + 1]) / 2;
      // inside the outline AND not below a stepped sill AND (for door bays) tagged later
      let ok = pointInPoly([cx, cy], outline.poly);
      if (!ok) {
        // partially-inside cells (under an arc / rake) count when any corner is inside
        const corners = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i], ys[j + 1]], [xs[i + 1], ys[j + 1]]];
        ok = corners.some((p) => pointInPoly([p[0] + (cx > p[0] ? 1e-6 : -1e-6), p[1] + (cy > p[1] ? 1e-6 : -1e-6)], outline.poly));
      }
      inside[cellId(i, j)] = ok ? 1 : 0;
    }
  }
  const vCovers = (xv, ya, yb) => vlinesCut.some((v) => Math.abs(v.x - xv) < EPS && v.y0 <= ya + EPS && v.y1 >= yb - EPS);
  const hCovers = (yh, xa, xb) => hsegsLive.some((h) => Math.abs(h.y - yh) < EPS && h.x0 <= xa + EPS && h.x1 >= xb - EPS);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!inside[cellId(i, j)]) continue;
      if (i + 1 < nx && inside[cellId(i + 1, j)] && !vCovers(xs[i + 1], ys[j], ys[j + 1])) unite(cellId(i, j), cellId(i + 1, j));
      if (j + 1 < ny && inside[cellId(i, j + 1)] && !hCovers(ys[j + 1], xs[i], xs[i + 1])) unite(cellId(i, j), cellId(i, j + 1));
    }
  }
  const groups = new Map();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = cellId(i, j);
    if (!inside[id]) continue;
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push([i, j]);
  }


  const faces = [];
  for (const cells of groups.values()) {
    const i0 = Math.min(...cells.map((c) => c[0])); const i1 = Math.max(...cells.map((c) => c[0])) + 1;
    const j0 = Math.min(...cells.map((c) => c[1])); const j1 = Math.max(...cells.map((c) => c[1])) + 1;
    const rectCells = (i1 - i0) * (j1 - j0);
    const xa = xs[i0]; const xb = xs[i1]; const ya = ys[j0]; const yb = ys[j1];
    const midX = (xa + xb) / 2;
    const col = cols.findIndex((cc, ci) => midX >= (ci === 0 ? 0 : vx[ci - 1]) - EPS && midX <= (ci === nC - 1 ? W : vx[ci]) + EPS);
    const colObj = cols[Math.max(0, col)];
    // below a stepped sill → infill by others (not a lite)
    if (colObj && colObj._step > 0 && yb <= colObj._step + P.sill.sightline / 2 + EPS && colObj.kind !== 'door') continue;
    const isDoorOpening = colObj?.kind === 'door' && (colObj._base === null || ya < (colObj._base ?? 0) - EPS) && yb <= (colObj._base ?? Infinity) + EPS;
    const irregular = rectCells !== cells.length;
    const leftM = xa <= EPS ? null : vlinesCut.find((v) => Math.abs(v.x - xa) < EPS && v.y0 < yb - EPS && v.y1 > ya + EPS);
    const botM = ya <= EPS ? null : hsegsLive.find((h) => Math.abs(h.y - ya) < EPS && h.x0 < xb - EPS && h.x1 > xa + EPS);
    faces.push({ xa, xb, ya, yb, cells, irregular, col, isDoorOpening, leftKey: leftM?.key ?? 'L', botKey: botM?.key ?? 'B' });
  }

  // Lite keys + DLO / glass polygons
  const ssgEdges = es.joinery === 'ssg_4side' ? 'all' : es.joinery === 'ssg_2side' ? 'v' : null;
  for (const f of faces) {
    if (f.isDoorOpening) continue;
    let poly = clipPolyToRect(outline.poly, f.xa, f.ya, f.xb, f.yb);
    poly = dedupe(poly);
    if (poly.length < 3 || polyArea(poly) < 1e-6) continue;
    if (polyArea(poly) < 0) poly.reverse();
    // tag each edge with what it lies on
    const tags = poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const onX = (xv) => Math.abs(a[0] - xv) < 1e-6 && Math.abs(b[0] - xv) < 1e-6;
      const onY = (yv) => Math.abs(a[1] - yv) < 1e-6 && Math.abs(b[1] - yv) < 1e-6;
      const pe = perimeterEdgeContaining(outline, a, b);
      if (pe) return { kind: 'p', member: pe.key, role: pe.role, sl: pe.sightline, orient: pe.role === 'jamb' ? 'v' : 'h' };
      if (onX(f.xa) || onX(f.xb)) {
        const xv = onX(f.xa) ? f.xa : f.xb;
        const m = vlinesCut.find((v) => Math.abs(v.x - xv) < EPS && v.y0 < Math.max(a[1], b[1]) - EPS && v.y1 > Math.min(a[1], b[1]) + EPS);
        return { kind: 'v', member: m?.key ?? '?', role: m?.role ?? 'mullion', sl: m?.sl ?? mullSL, orient: 'v' };
      }
      if (onY(f.ya) || onY(f.yb)) {
        const yv = onY(f.ya) ? f.ya : f.yb;
        const m = hsegsLive.find((h) => Math.abs(h.y - yv) < EPS && h.x0 < Math.max(a[0], b[0]) - EPS && h.x1 > Math.min(a[0], b[0]) + EPS);
        return { kind: 'h', member: m?.key ?? '?', role: m?.role ?? 'horizontal', sl: m?.sl ?? P.horizontal.sightline, orient: 'h' };
      }
      return { kind: '?', member: '?', role: '?', sl: 0, orient: 'h' };
    });
    const inward = tags.map((t) => (t.kind === 'p' ? t.sl : t.sl / 2));
    const dlo = offsetPolygon(poly, inward);
    if (polyArea(dlo) <= 0) { warnings.push(`A lite near x=${r4(f.xa)}" y=${r4(f.ya)}" has no daylight — members overlap.`); continue; }
    const isSSG = (t) => ssgEdges === 'all' || (ssgEdges === 'v' && t.orient === 'v');
    const addCap = es.glazing.addPerAxis / 2;
    const ssgAdd = es.glazing.ssgAddPerEdge;
    const outward = tags.map((t) => (isSSG(t) ? (ssgAdd ?? addCap) : addCap));
    if (tags.some(isSSG) && ssgAdd == null) {
      if (!warnings.some((w) => w.startsWith('SSG glass add'))) warnings.push('SSG glass add per edge is not set for this system — enter it from the manufacturer\'s instructions (using the captured add meanwhile).');
    }
    const glass = offsetPolygon(dlo, outward.map((d) => -d));
    const dbb = bbox(dlo); const gbb = bbox(glass);
    const rect = dlo.length === 4 && dlo.every((p, i) => {
      const q = dlo[(i + 1) % 4]; return Math.abs(p[0] - q[0]) < 1e-6 || Math.abs(p[1] - q[1]) < 1e-6;
    });
    const colObj = cols[Math.max(0, f.col)];
    const liteKind = colObj?.kind === 'door' ? 'transom' : 'vision';
    const key = `${f.leftKey}/${f.botKey}`;
    if (Math.min(dbb.w, dbb.h) < MIN_LITE) { warnings.push(`Lite ${key} is only ${r4(Math.min(dbb.w, dbb.h))}" — dropped.`); continue; }
    if (f.irregular) warnings.push(`Lite ${key} is not rectangular in the grid — a member ends without support. Check removed / split members.`);
    lites.push({
      key, col: f.col, kind: liteKind,
      shape: rect ? 'rect' : 'shaped',
      cellBox: { x0: f.xa, x1: f.xb, y0: f.ya, y1: f.yb },
      edges: tags,
      dloPoly: dlo.map(roundPt), glassPoly: glass.map(roundPt),
      dloW: dbb.w, dloH: dbb.h, dloBox: dbb,
      glassW: gbb.w, glassH: gbb.h, glassBox: gbb,
      dloArea: polyArea(dlo), glassArea: polyArea(glass),
      glassPerimeter: polyPerimeter(glass),
      ssgEdgesLF: tags.reduce((s, t, i) => s + (isSSG(t) ? len(sub(glass[(i + 1) % glass.length], glass[i])) : 0), 0) / 12,
      bottomAFF: sillAFF + dbb.y0, topAFF: sillAFF + dbb.y1,
    });
  }
  // stable order: bottom→top, left→right
  lites.sort((a, b) => a.dloBox.x0 - b.dloBox.x0 || a.dloBox.y0 - b.dloBox.y0);
  lites.forEach((l, i) => { l.index = i + 1; l.tag = `${String.fromCharCode(65 + Math.min(25, l.col))}${1 + lites.filter((m) => m.col === l.col && m.dloBox.y0 < l.dloBox.y0 - EPS).length}`; });

  // ── 6. Joints + pieces ──
  const topo = buildTopology({ spec, es, outline, vlines: vlinesCut, hsegs: hsegsLive, cols, W, warnings });

  return {
    spec, es, warnings,
    width: W, height: H, topY, sillAFF,
    roughOpening: sz.mode === 'ro' ? { width: num(sz.width, 0), height: num(sz.height, 0), joints: { ...sz.joints } } : null,
    outline: { template: outline.template, params: outline.params, poly: outline.poly.map(roundPt),
      edges: outline.edges.map((e) => ({ key: e.key, role: e.role, a: e.a, b: e.b, arc: e.arc ? { radius: e.arc.radius, center: e.arc.center } : null, length: e.length, sightline: e.sightline, pts: e.pts.map(roundPt) })),
      perimeterIn: outline.perimeter },
    columns: cols.map((c, i) => ({ index: i, kind: c.kind, dlo: colW[i], eq: colSolve.eq[i], x0: c._x0, x1: c._x1, step: c._step,
      rows: c._rows, rowEq: c._rowEq, base: c._base, under: c._under, door: c.door ?? null })),
    verticals: vlinesCut, horizontals: hsegsLive,
    lites, doors,
    joints: topo.joints, pieces: topo.pieces,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const roundPt = (p) => [r4(p[0]), r4(p[1])];

function uniqSorted(arr) {
  const s = [...arr].filter(Number.isFinite).sort((a, b) => a - b);
  const out = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > 1e-7) out.push(v);
  return out;
}

/** Y of the head's inner face at x (outline top minus head sightline measured square to the slope). */
export function innerTopAt(outline, x, headSL) {
  const top = outline.topAt(x);
  const d = 0.05;
  const s = (outline.topAt(x + d) - outline.topAt(x - d)) / (2 * d);
  const cos = 1 / Math.sqrt(1 + s * s);
  return top - headSL / cos;
}

function perimeterEdgeContaining(outline, a, b) {
  for (const e of outline.edges) {
    for (let i = 0; i < e.pts.length - 1; i++) {
      const p = e.pts[i]; const q = e.pts[i + 1];
      if (onSeg(a, p, q) && onSeg(b, p, q)) return e;
    }
  }
  return null;
}
function onSeg(pt, p, q) {
  const d = sub(q, p); const L = len(d);
  if (L < 1e-9) return false;
  const t = ((pt[0] - p[0]) * d[0] + (pt[1] - p[1]) * d[1]) / (L * L);
  if (t < -1e-6 || t > 1 + 1e-6) return false;
  const proj = add(p, mul(d, t));
  return Math.hypot(proj[0] - pt[0], proj[1] - pt[1]) < 1e-5;
}

// ── Topology: joints and cut pieces ─────────────────────────────────────────

/**
 * Default owner of a joint by system family and joint type.
 *   storefront: verticals / jambs run through everywhere
 *   curtain wall: verticals run through; perimeter corners: jamb runs through
 * Frame-level spec.joints.defaultRunThrough flips the interior default.
 */
function defaultOwner(spec, type) {
  const d = spec.joints?.defaultRunThrough === 'h' ? 'h' : 'v';
  if (type === 'corner') return spec.joints?.cornerRunThrough === 'h' ? 'h' : 'v';
  return d;
}

function buildTopology({ spec, es, outline, vlines, hsegs, cols, W, warnings }) {
  const P = es.profiles;
  const overrides = spec.joints?.overrides ?? {};
  const owner = (key, type) => overrides[key] ?? defaultOwner(spec, type);
  const joints = [];
  const pieces = [];
  const addJoint = (j) => { j.owner = owner(j.key, j.type); joints.push(j); return j; };

  // ---------- perimeter edges: corners ----------
  const E = outline.edges;
  const nE = E.length;
  const cornerOf = []; // per edge: { start: joint, end: joint }
  for (let i = 0; i < nE; i++) cornerOf.push({});
  for (let k = 0; k < nE; k++) {
    const prev = E[(k + nE - 1) % nE]; const next = E[k];
    const v = next.a;
    // a corner between a jamb and a head/sill = 'v' owns → jamb runs through; between two non-jamb edges → miter
    const jambInvolved = prev.role === 'jamb' || next.role === 'jamb';
    const sameRole = prev.role === next.role && !jambInvolved;
    const type = jambInvolved ? 'corner' : 'miter';
    const j = addJoint({ key: `C${k}`, type, x: v[0], y: v[1], members: [prev.key, next.key], perimeter: true });
    if (type === 'miter' || sameRole) j.owner = 'miter';
    cornerOf[(k + nE - 1) % nE].end = j; cornerOf[k].start = j;
  }

  // ---------- interior verticals: ends at perimeter / horizontals ----------
  // A vertical's end is "at perimeter" if it reaches the outline; else it ends on an H member.
  const vEnds = [];
  for (const v of vlines) {
    const bot = outline.bottomAt(v.x); const top = outline.topAt(v.x);
    const atBotPerim = Math.abs(v.y0 - bot) < 1e-4;
    const atTopPerim = Math.abs(v.y1 - top) < 1e-4;
    const hBot = !atBotPerim ? hsegs.find((h) => Math.abs(h.y - v.y0) < 1e-4 && h.x0 <= v.x + EPS && h.x1 >= v.x - EPS) : null;
    const hTop = !atTopPerim ? hsegs.find((h) => Math.abs(h.y - v.y1) < 1e-4 && h.x0 <= v.x + EPS && h.x1 >= v.x - EPS) : null;
    if (!atBotPerim && !hBot) warnings.push(`${v.key}: bottom end is not supported by a member.`);
    if (!atTopPerim && !hTop) warnings.push(`${v.key}: top end is not supported by a member.`);
    const jb = addJoint({ key: `${v.key}:bot`, type: atBotPerim ? 'vPerim' : 'vOnH', x: v.x, y: v.y0,
      members: [v.key, atBotPerim ? edgeAt(outline, v.x, 'bottom')?.key : hBot?.key].filter(Boolean) });
    if (!atBotPerim) jb.owner = overrides[jb.key] ?? 'h';
    const jt = addJoint({ key: `${v.key}:top`, type: atTopPerim ? 'vPerim' : 'vOnH', x: v.x, y: v.y1,
      members: [v.key, atTopPerim ? edgeAt(outline, v.x, 'top')?.key : hTop?.key].filter(Boolean) });
    if (!atTopPerim) jt.owner = overrides[jt.key] ?? 'h';
    vEnds.push({ v, jb, jt, atBotPerim, atTopPerim, hBot, hTop });
  }

  // ---------- horizontals: ends at verticals / perimeter; cross joints ----------
  // Group H segments by y to find collinear neighbours meeting at a vertical (cross joints).
  const hEnd = new Map(); // `${h.key}:L|R` → joint
  const vAt = (x, y) => vlines.find((v) => Math.abs(v.x - x) < 1e-4 && v.y0 <= y + EPS && v.y1 >= y - EPS);
  for (const h of hsegs) {
    for (const side of ['L', 'R']) {
      const xe = side === 'L' ? h.x0 : h.x1;
      const v = vAt(xe, h.y);
      const perimX = side === 'L' ? outline.leftAt(h.y) : outline.rightAt(h.y);
      const atPerim = !v && Math.abs(xe - perimX) < 1e-3;
      // collinear continuation with no vertical between → the two segments are ONE member (joined)
      const cont = !v && !atPerim ? hsegs.find((o) => o !== h && Math.abs(o.y - h.y) < 1e-4 && Math.abs((side === 'L' ? o.x1 : o.x0) - xe) < 1e-4) : null;
      if (cont) { hEnd.set(`${h.key}:${side}`, { type: 'continuous', with: cont.key }); continue; }
      if (!v && !atPerim) { warnings.push(`${h.key}: ${side === 'L' ? 'left' : 'right'} end is not supported by a member.`); hEnd.set(`${h.key}:${side}`, { type: 'free' }); continue; }
      if (atPerim) {
        const j = addJoint({ key: `${h.key}:${side}`, type: 'hPerim', x: xe, y: h.y, members: [h.key, edgeAt(outline, h.y, side === 'L' ? 'left' : 'right')?.key].filter(Boolean) });
        hEnd.set(`${h.key}:${side}`, j);
        continue;
      }
      // at a vertical: is there a collinear H on the other side?
      const other = hsegs.find((o) => o !== h && Math.abs(o.y - h.y) < 1e-4 && Math.abs((side === 'L' ? o.x1 : o.x0) - xe) < 1e-4);
      const leftKey = side === 'L' ? (other?.key ?? '') : h.key;
      const rightKey = side === 'L' ? h.key : (other?.key ?? '');
      const key = `${v.key}@${leftKey}+${rightKey}`;
      let j = joints.find((jj) => jj.key === key);
      if (!j) j = addJoint({ key, type: other ? 'cross' : 'tee', x: xe, y: h.y, members: [v.line ?? v.key, leftKey, rightKey].filter(Boolean), vKey: v.key, hl: leftKey || null, hr: rightKey || null });
      hEnd.set(`${h.key}:${side}`, j);
    }
  }

  // ---------- pieces: interior verticals ----------
  for (const { v, jb, jt, atBotPerim, atTopPerim, hBot, hTop } of vEnds) {
    // breakpoints along v where a horizontal owns ('h') a cross/tee
    const along = joints.filter((j) => (j.type === 'cross' || j.type === 'tee') && j.vKey === v.key && j.y > v.y0 + EPS && j.y < v.y1 - EPS)
      .sort((a, b) => a.y - b.y);
    const hsl = (j) => Math.max(...[j.hl, j.hr].filter(Boolean).map((k) => hsegs.find((h) => h.key === k)?.sl ?? 0));
    // bottom start
    let start;
    if (atBotPerim) start = jb.owner === 'h' ? innerBottomAt(outline, v.x, P.sill.sightline) : v.y0;
    else start = v.y0 + (hBot?.sl ?? 0) / 2;          // stands on the H member's top face
    const segs = [];
    let cur = start;
    for (const j of along) {
      if (j.owner === 'h') { segs.push([cur, j.y - hsl(j) / 2, j]); cur = j.y + hsl(j) / 2; }
    }
    let end; let longNote = null;
    if (atTopPerim) {
      if (jt.owner === 'h') end = Math.min(innerTopAt(outline, v.x - v.sl / 2, P.head.sightline), innerTopAt(outline, v.x + v.sl / 2, P.head.sightline));
      else {
        const tl = outline.topAt(v.x - v.sl / 2); const tr = outline.topAt(v.x + v.sl / 2);
        end = Math.max(tl, tr);
        if (Math.abs(tl - tr) > 1e-3) longNote = 'top cut to head angle — length is long point';
      }
    } else end = v.y1 - (hTop?.sl ?? 0) / 2;
    segs.push([cur, end, null]);
    segs.forEach(([a, b], i) => {
      if (b - a <= EPS) return;
      pieces.push({ member: v.key, role: v.role, orient: 'v', length: b - a, x: v.x, y0: a, y1: b, sl: v.sl,
        note: [segs.length > 1 ? `piece ${i + 1} of ${segs.length} (horizontal runs through)` : 'continuous', longNote].filter(Boolean).join(' · ') });
    });
  }

  // ---------- pieces: interior horizontals (chain through 'h'-owned crosses) ----------
  const visited = new Set();
  const segByKey = new Map(hsegs.map((h) => [h.key, h]));
  for (const h of [...hsegs].sort((a, b) => a.y - b.y || a.x0 - b.x0)) {
    if (visited.has(h.key)) continue;
    // walk left to chain start
    let first = h;
    for (;;) {
      const L = hEnd.get(`${first.key}:L`);
      const prevKey = L?.type === 'continuous' ? L.with : (L?.type === 'cross' && L.owner === 'h') ? L.hl : null;
      if (!prevKey || visited.has(prevKey) || prevKey === h.key) break;
      const prev = segByKey.get(prevKey); if (!prev) break; first = prev;
      if (first === h) break;
    }
    // walk right collecting the chain
    const chain = [first]; visited.add(first.key);
    let curSeg = first;
    for (;;) {
      const R = hEnd.get(`${curSeg.key}:R`);
      const nextKey = R?.type === 'continuous' ? R.with : (R?.type === 'cross' && R.owner === 'h') ? R.hr : null;
      if (!nextKey || visited.has(nextKey)) break;
      const nx = segByKey.get(nextKey); if (!nx) break;
      chain.push(nx); visited.add(nx.key); curSeg = nx;
    }
    const L = hEnd.get(`${chain[0].key}:L`); const R = hEnd.get(`${chain[chain.length - 1].key}:R`);
    const xStart = hEndX(L, chain[0], 'L', vlines, outline, P);
    const xEnd = hEndX(R, chain[chain.length - 1], 'R', vlines, outline, P);
    const length = xEnd - xStart;
    const sl = chain[0].sl;
    if (length > EPS) {
      pieces.push({ member: chain.map((c) => c.key).join('+'), role: chain[0].role, orient: 'h', length, y: chain[0].y,
        x0: xStart, x1: xEnd, sl, col: chain[0].col,
        note: [chain.length > 1 ? `runs through ${chain.length - 1} vertical${chain.length > 2 ? 's' : ''}` : endNote(L, R), chain[0].stepped ? 'stepped sill — infill below by others' : null].filter(Boolean).join(' · ') });
    }
  }

  // ---------- pieces: perimeter edges ----------
  for (let k = 0; k < nE; k++) {
    const e = E[k];
    // breaks along this edge: interior verticals meeting a sill/head edge where the vertical owns;
    // horizontals meeting a jamb edge where the horizontal owns.
    const breaks = [];
    if (e.role !== 'jamb') {
      for (const { v, jb, jt, atBotPerim, atTopPerim } of vEnds) {
        const j = e.role === 'sill' ? (atBotPerim ? jb : null) : (atTopPerim ? jt : null);
        if (!j || j.owner !== 'v') continue;
        if (!pointOnEdge(e, [v.x, j.y])) continue;
        breaks.push({ x0: v.x - v.sl / 2, x1: v.x + v.sl / 2, axis: 'x' });
      }
      // door bays: no sill in the door opening
      if (e.role === 'sill') {
        for (const c of cols) if (c.kind === 'door' || c._step > 0) {
          const xa = c._x0 ?? c._xl; const xb = c._x1 ?? c._xr;
          if (pointOnEdge(e, [(xa + xb) / 2, 0])) breaks.push({ x0: xa, x1: xb, axis: 'x', gap: c.kind === 'door' ? 'door' : 'step' });
        }
      }
    } else {
      for (const [hk, j] of hEnd) {
        if (!j || j.type !== 'hPerim' || j.owner !== 'h') continue;
        const h = hsegs.find((s) => `${s.key}:L` === hk || `${s.key}:R` === hk);
        if (!h || !pointOnEdge(e, [j.x, j.y])) continue;
        breaks.push({ y0: h.y - h.sl / 2, y1: h.y + h.sl / 2, axis: 'y' });
      }
    }
    // end trims at corners
    const cs = cornerOf[k].start; const ce = cornerOf[k].end;
    const prevE = E[(k + nE - 1) % nE]; const nextE = E[(k + 1) % nE];
    const trimStart = cornerTrim(e, prevE, cs, 'start');
    const trimEnd = cornerTrim(e, nextE, ce, 'end');
    const spans = perimeterSpans(e, trimStart, trimEnd, breaks);
    spans.forEach((sp, i) => {
      if (sp.length <= EPS) return;
      const notes = [];
      if (e.arc) notes.push(`curved — roll to ${r4(e.arc.radius)}" outside radius`);
      if (cs?.owner === 'miter' && i === 0) notes.push('mitered at corner');
      if (ce?.owner === 'miter' && i === spans.length - 1) notes.push('mitered at corner');
      if (!e.arc && e.role !== 'jamb' && Math.abs(e.a[1] - e.b[1]) > 1e-6) notes.push(`sloped ${r4(Math.abs(Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 180 / Math.PI) % 180 > 90 ? 180 - Math.abs(Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 180 / Math.PI) : Math.abs(Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 180 / Math.PI))}° — length along slope`);
      if (e.role === 'jamb' && (cs?.owner !== 'h' && ce?.owner !== 'h')) notes.push('full height, continuous');
      if (e.role === 'jamb') {
        const adj = [prevE, nextE].find((o) => o.role === 'head');
        const sloped = adj && (adj.arc || Math.abs(adj.a[1] - adj.b[1]) > 1e-6);
        if (sloped) notes.push('top cut to head angle — length is long point');
      }
      pieces.push({ member: e.key, role: e.role, orient: e.role === 'jamb' ? 'v' : 'h', length: sp.length,
        x0: sp.p0[0], y0: sp.p0[1], x1: sp.p1[0], y1: sp.p1[1], sl: e.sightline, perimeter: true,
        note: notes.join(' · ') || (e.role === 'jamb' ? '' : 'cut between vertical faces') });
    });
  }

  // splice anything longer than stock
  return { joints, pieces };
}

function endNote(L, R) {
  const t = [L, R].map((j) => (j?.owner === 'h' && (j.type === 'tee' || j.type === 'hPerim') ? 'runs over' : null)).filter(Boolean);
  return t.length ? `end${t.length > 1 ? 's' : ''} run over the vertical` : 'cut between vertical faces';
}

function hEndX(j, seg, side, vlines, outline, P) {
  const xe = side === 'L' ? seg.x0 : seg.x1;
  if (!j || j.type === 'free') return xe;
  if (j.type === 'hPerim') {
    if (j.owner === 'h') return side === 'L' ? outline.leftAt(seg.y) : outline.rightAt(seg.y);
    // stop at the jamb's inner face
    return side === 'L' ? innerLeftAt(outline, seg.y, P.jamb.sightline) : innerRightAt(outline, seg.y, P.jamb.sightline);
  }
  const v = vlines.find((vv) => vv.key === j.vKey);
  const half = (v?.sl ?? 0) / 2;
  const runs = j.owner === 'h';
  if (side === 'L') return runs ? xe - half : xe + half;
  return runs ? xe + half : xe - half;
}

function innerBottomAt(outline, x, sillSL) { return outline.bottomAt(x) + sillSL; }
function innerLeftAt(outline, y, jambSL) {
  const d = 0.05; const s = (outline.leftAt(y + d) - outline.leftAt(y - d)) / (2 * d);
  return outline.leftAt(y) + jambSL * Math.sqrt(1 + s * s);
}
function innerRightAt(outline, y, jambSL) {
  const d = 0.05; const s = (outline.rightAt(y + d) - outline.rightAt(y - d)) / (2 * d);
  return outline.rightAt(y) - jambSL * Math.sqrt(1 + s * s);
}

function edgeAt(outline, t, where) {
  // perimeter edge containing the outline point at x=t (top/bottom) or y=t (left/right)
  let pt;
  if (where === 'top') pt = [t, outline.topAt(t)];
  else if (where === 'bottom') pt = [t, outline.bottomAt(t)];
  else if (where === 'left') pt = [outline.leftAt(t), t];
  else pt = [outline.rightAt(t), t];
  return outline.edges.find((e) => pointOnEdge(e, pt)) ?? null;
}

function pointOnEdge(e, pt) {
  for (let i = 0; i < e.pts.length - 1; i++) if (onSeg(pt, e.pts[i], e.pts[i + 1])) return true;
  return false;
}

/**
 * Where a perimeter edge stops at a corner, as a point on the edge's outer polyline.
 * owner 'v' (jamb runs through): the non-jamb edge stops at the jamb's inner face.
 * owner 'h' (head/sill runs through): the jamb stops at the head/sill inner face.
 * 'miter': both run to the vertex.
 */
function cornerTrim(e, other, joint, which) {
  const vertex = which === 'start' ? e.a : e.b;
  if (!joint || joint.owner === 'miter') return { point: vertex };
  const eIsJamb = e.role === 'jamb'; const oIsJamb = other.role === 'jamb';
  let eRuns;
  if (joint.owner === 'v') eRuns = eIsJamb || (!eIsJamb && !oIsJamb);
  else eRuns = !eIsJamb || (eIsJamb && oIsJamb);
  if (eRuns) return { point: vertex };
  // stop at other's inner face: offset other's end segment inward by its sightline, intersect with e's end segment line
  const oSeg = which === 'start' ? [other.pts[other.pts.length - 2], other.pts[other.pts.length - 1]] : [other.pts[0], other.pts[1]];
  const od = norm(sub(oSeg[1], oSeg[0]));
  const oIn = [-od[1], od[0]];
  const op = add(oSeg[0], mul(oIn, other.sightline));
  // first crossing of e's polyline (walking from this corner) with the other member's inner face line
  const pts = which === 'start' ? e.pts : [...e.pts].reverse();
  const onSide = (p) => cross(od, sub(p, op));
  for (let i = 0; i < pts.length - 1; i++) {
    const s0 = onSide(pts[i]); const s1 = onSide(pts[i + 1]);
    if (s0 === 0) return { point: pts[i] };
    if (s0 * s1 < 0) {
      const t = s0 / (s0 - s1);
      return { point: add(pts[i], mul(sub(pts[i + 1], pts[i]), t)) };
    }
  }
  // no crossing on the polyline — extend the end segment
  const eSeg = [pts[0], pts[1]];
  const hit = lineIntersect(eSeg[0], sub(eSeg[1], eSeg[0]), op, od);
  return { point: hit ?? vertex };
}

/**
 * Split a perimeter edge into pieces between its trimmed ends and break gaps.
 * Lengths are measured along the edge's OUTER polyline (true arc length on arcs).
 */
function perimeterSpans(e, trimStart, trimEnd, breaks) {
  // param along polyline by cumulative length
  const cum = [0];
  for (let i = 1; i < e.pts.length; i++) cum.push(cum[i - 1] + len(sub(e.pts[i], e.pts[i - 1])));
  const total = cum[cum.length - 1];
  const scale = e.arc ? e.length / total : 1;                // chord polyline → true arc length
  const paramOf = (pt) => {
    let best = 0; let bestD = Infinity;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const p = e.pts[i]; const q = e.pts[i + 1]; const d = sub(q, p); const L = len(d);
      if (L < 1e-12) continue;
      let t = ((pt[0] - p[0]) * d[0] + (pt[1] - p[1]) * d[1]) / (L * L);
      const tc = Math.max(0, Math.min(1, t));
      const proj = add(p, mul(d, tc));
      const dist = Math.hypot(proj[0] - pt[0], proj[1] - pt[1]);
      if (dist < bestD - 1e-9) { bestD = dist; best = cum[i] + t * L; }
    }
    return best;
  };
  const pointAt = (s) => {
    s = Math.max(0, Math.min(total, s));
    for (let i = 0; i < e.pts.length - 1; i++) {
      if (s <= cum[i + 1] + 1e-12) {
        const t = (s - cum[i]) / Math.max(cum[i + 1] - cum[i], 1e-12);
        return add(e.pts[i], mul(sub(e.pts[i + 1], e.pts[i]), t));
      }
    }
    return e.pts[e.pts.length - 1];
  };
  const s0 = paramOf(trimStart.point); const s1 = paramOf(trimEnd.point);
  // gaps in param space
  const gaps = [];
  for (const b of breaks) {
    let ga; let gb;
    if (b.axis === 'x') { ga = paramAtX(e, b.x0, cum); gb = paramAtX(e, b.x1, cum); }
    else { ga = paramAtY(e, b.y0, cum); gb = paramAtY(e, b.y1, cum); }
    if (ga == null || gb == null) continue;
    gaps.push([Math.min(ga, gb), Math.max(ga, gb)]);
  }
  gaps.sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cur = Math.min(s0, s1); const end = Math.max(s0, s1);
  for (const [ga, gb] of gaps) {
    if (gb <= cur + EPS || ga >= end - EPS) continue;
    if (ga > cur + EPS) spans.push([cur, ga]);
    cur = Math.max(cur, gb);
  }
  if (end > cur + EPS) spans.push([cur, end]);
  return spans.map(([a, b]) => ({ length: (b - a) * scale, p0: pointAt(a), p1: pointAt(b) }));
}

function paramAtX(e, x, cum) {
  for (let i = 0; i < e.pts.length - 1; i++) {
    const p = e.pts[i]; const q = e.pts[i + 1];
    if ((p[0] - x) * (q[0] - x) <= 0 && Math.abs(q[0] - p[0]) > 1e-12) {
      const t = (x - p[0]) / (q[0] - p[0]);
      return cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return null;
}
function paramAtY(e, y, cum) {
  for (let i = 0; i < e.pts.length - 1; i++) {
    const p = e.pts[i]; const q = e.pts[i + 1];
    if ((p[1] - y) * (q[1] - y) <= 0 && Math.abs(q[1] - p[1]) > 1e-12) {
      const t = (y - p[1]) / (q[1] - p[1]);
      return cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return null;
}
