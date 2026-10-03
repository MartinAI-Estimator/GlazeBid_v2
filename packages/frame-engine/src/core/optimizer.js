/**
 * optimizer.js — cutting-stock optimization (first-fit decreasing).
 *
 * Runs per DIE (part + finish) across a whole frame set (or job), so drops from
 * one frame feed the next.  Each cut consumes its length + kerf; each bar loses
 * the end trim.  Pieces longer than the usable bar are spliced first (a note is
 * kept on the piece) — they can never be cut from one bar.
 *
 * FFD is within a few percent of optimal for glazing cut lists and is fast
 * enough to re-run on every edit.
 */

import { r4 } from './units.js';

export const SCRAP_BANDS = Object.freeze({ green: 8, yellow: 10 });   // % thresholds
export const scrapColor = (pct) => (pct < SCRAP_BANDS.green ? 'green' : pct <= SCRAP_BANDS.yellow ? 'yellow' : 'red');

/**
 * @param {{ length: number, qty: number, label?: string, ref?: any }[]} cuts
 * @param {{ stockLengthIn: number, kerfIn?: number, endTrimIn?: number }} opts
 * @returns {{ bars: { cuts: {length,label,ref}[], used: number, drop: number }[],
 *            barCount, stockLengthIn, totalCutIn, scrapPct, oversize: [] }}
 */
export function optimizeCuts(cuts, { stockLengthIn = 288, kerfIn = 0.125, endTrimIn = 0 } = {}) {
  const usable = stockLengthIn - 2 * endTrimIn;
  const pieces = [];
  const oversize = [];
  for (const c of cuts) {
    for (let i = 0; i < Math.max(0, Math.round(c.qty)); i++) {
      if (c.length > usable + 1e-9) { oversize.push({ ...c, qty: 1 }); continue; }
      if (c.length > 1e-9) pieces.push({ length: c.length, label: c.label, ref: c.ref });
    }
  }
  pieces.sort((a, b) => b.length - a.length);
  const bars = [];
  for (const p of pieces) {
    const need = p.length + kerfIn;
    let placed = false;
    for (const b of bars) {
      // the last cut on a bar does not need a kerf past the bar end
      const room = usable - b.used;
      if (room + 1e-9 >= need || room + 1e-9 >= p.length) {
        b.cuts.push(p); b.used += Math.min(need, room); placed = true; break;
      }
    }
    if (!placed) bars.push({ cuts: [p], used: Math.min(need, usable) });
  }
  const totalCutIn = pieces.reduce((s, p) => s + p.length, 0);
  const stockIn = bars.length * stockLengthIn;
  bars.forEach((b) => { b.drop = r4(stockLengthIn - 2 * endTrimIn - b.used); b.used = r4(b.used); });
  return {
    bars,
    barCount: bars.length,
    stockLengthIn,
    totalCutIn: r4(totalCutIn),
    stockIn,
    scrapPct: stockIn > 0 ? r4(((stockIn - totalCutIn) / stockIn) * 100) : 0,
    oversize,
  };
}

/**
 * Split a piece longer than the usable bar into splice-able pieces.
 * Returns lengths (each ≤ maxLen).  Equal split keeps splices symmetric.
 */
export function splitForStock(length, maxLen) {
  if (length <= maxLen + 1e-9) return [length];
  const n = Math.ceil(length / maxLen - 1e-9);
  return Array.from({ length: n }, () => length / n);
}
