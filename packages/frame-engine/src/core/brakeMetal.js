/**
 * brakeMetal.js — brake-formed sheet metal (its own table, like PartnerPak's
 * AddBrakeMetal: girth, brakes, hems, length — NOT an extrusion).
 *
 * A piece is entered with a girth (stretch-out width), number of brakes (bends)
 * and hems, and either a length or an edge of the frame it runs along
 * ('head' | 'sill' | 'jambL' | 'jambR' | 'jambs' | 'perimeter').
 *
 * Sheet yield: pieces longer than the sheet are spliced (with a lap); strips of
 * one girth are packed end-to-end into sheet-length columns (FFD), and columns
 * are packed across the sheet width (FFD).
 */

import { num, r4 } from './units.js';

export const DEFAULT_SHEET = Object.freeze({ widthIn: 48, lengthIn: 120, lapIn: 4 });

export function newBrakePiece(over = {}) {
  return { id: `BM${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    description: 'Sill flashing', girth: 12, length: null, edge: 'sill', qty: 1, bends: 3, hems: 1,
    finish: '', gauge: '.040 alum', ...over };
}

/** Resolve each piece's length from its edge; returns per-frame pieces. */
export function brakePieces(list = [], solved) {
  const W = solved?.width ?? 0; const H = solved?.height ?? 0;
  const edgeLen = (edge) => {
    if (!solved) return 0;
    const sum = (role, side) => solved.outline.edges
      .filter((e) => e.role === role && (side == null || (side === 'L' ? Math.min(e.a[0], e.b[0]) < W / 2 : Math.min(e.a[0], e.b[0]) >= W / 2)))
      .reduce((s, e) => s + e.length, 0);
    switch (edge) {
      case 'head': return sum('head');
      case 'sill': return Math.max(0, sum('sill') - (solved.doors ?? []).reduce((t, d) => t + d.width, 0));   // no flashing across door openings
      case 'jambL': return sum('jamb', 'L');
      case 'jambR': return sum('jamb', 'R');
      case 'jambs': return sum('jamb');
      case 'perimeter': return solved.outline.perimeterIn;
      default: return 0;
    }
  };
  const yTopOf = (edge) => (edge === 'sill' ? 0 : edge === 'head' || edge === 'jambs' || edge === 'jambL' || edge === 'jambR' || edge === 'perimeter' ? (solved?.topY ?? H) : (solved?.topY ?? H));
  return (list ?? []).map((p) => {
    const length = p.length != null && p.length !== '' ? num(p.length, 0) : edgeLen(p.edge);
    return {
      id: p.id, description: p.description ?? '', girth: num(p.girth, 0), length: r4(length), qty: Math.max(0, Math.round(num(p.qty, 1))),
      bends: Math.max(0, Math.round(num(p.bends, 0))), hems: Math.max(0, Math.round(num(p.hems, 0))),
      finish: p.finish ?? '', gauge: p.gauge ?? '', edge: p.edge ?? null,
      yTop: p.edge ? yTopOf(p.edge) : num(p.yTop, 0),
    };
  }).filter((p) => p.length > 0 && p.girth > 0 && p.qty > 0);
}

/**
 * Sheets needed for a set of brake pieces (one gauge + finish per call).
 * @param {{girth,length,qty}[]} pieces
 */
export function sheetYield(pieces, sheet = DEFAULT_SHEET) {
  const { widthIn: SW, lengthIn: SL, lapIn } = { ...DEFAULT_SHEET, ...sheet };
  // explode to strips, splicing long pieces
  const strips = [];
  for (const p of pieces) {
    for (let i = 0; i < p.qty; i++) {
      if (p.girth > SW) { strips.push({ girth: p.girth, length: p.length, oversize: true }); continue; }
      let remaining = p.length; let first = true;
      while (remaining > 1e-9) {
        const cut = Math.min(remaining + (first ? 0 : lapIn), SL);
        strips.push({ girth: p.girth, length: cut });
        remaining -= first ? cut : cut - lapIn;
        first = false;
      }
    }
  }
  // columns of one girth, packed along the sheet length
  const byGirth = new Map();
  for (const s of strips.filter((x) => !x.oversize)) {
    if (!byGirth.has(s.girth)) byGirth.set(s.girth, []);
    byGirth.get(s.girth).push(s.length);
  }
  const columns = [];
  for (const [girth, lens] of byGirth) {
    lens.sort((a, b) => b - a);
    const cols = [];
    for (const L of lens) {
      const c = cols.find((cc) => SL - cc.used + 1e-9 >= L);
      if (c) c.used += L; else cols.push({ girth, used: L });
    }
    columns.push(...cols);
  }
  // pack columns across the sheet width
  columns.sort((a, b) => b.girth - a.girth);
  const sheets = [];
  for (const c of columns) {
    const sh = sheets.find((s) => SW - s.used + 1e-9 >= c.girth);
    if (sh) { sh.used += c.girth; sh.cols.push(c); } else sheets.push({ used: c.girth, cols: [c] });
  }
  const usedArea = strips.filter((x) => !x.oversize).reduce((s, x) => s + x.girth * x.length, 0);
  const sheetArea = sheets.length * SW * SL;
  return {
    sheets: sheets.length, sheet: { widthIn: SW, lengthIn: SL },
    strips: strips.length, splices: strips.length - pieces.reduce((s, p) => s + p.qty, 0),
    yieldPct: sheetArea ? r4((usedArea / sheetArea) * 100) : 0,
    oversize: strips.filter((x) => x.oversize).length,
  };
}
