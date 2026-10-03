/**
 * units.js — inch math for the frame engine.
 *
 * Internal unit is DECIMAL INCHES everywhere.  Feet-inches only at the edges
 * (display + parsing user input).
 */

export const EPS = 1e-6;

/** Round to 4 decimals (kills float noise in stored values). */
export const r4 = (x) => Math.round(x * 10000) / 10000;

/** Coerce to a finite number, or `fallback`. '' / null / undefined → fallback. */
export function num(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Round to NEAREST increment (default 1/16"). */
export function roundTo(x, inc = 1 / 16) {
  return Math.round(x / inc + 1e-9) * inc;
}

/** Round DOWN to increment (default 1/16"). */
export function floorTo(x, inc = 1 / 16) {
  return Math.floor(x / inc + 1e-9) * inc;
}

/** Round UP to increment (default 1/16"). */
export function ceilTo(x, inc = 1 / 16) {
  return Math.ceil(x / inc - 1e-9) * inc;
}

/**
 * Glass BLOCK size: round up to the next EVEN inch.  Vendors price on it.
 *   24 1/8 → 26,  25 → 26,  26 → 26,  0.5 → 2
 */
export function blockSize(x) {
  if (!(x > 0)) return 0;
  return Math.ceil(x / 2 - 1e-9) * 2;
}

/** Inches → reduced shop fraction: 37.3125 → `37 5/16"`, 96 → `96"`. */
export function formatInches(x, denom = 16) {
  if (!Number.isFinite(x)) return '—';
  const neg = x < 0;
  const ticks = Math.round(Math.abs(x) * denom);
  const whole = Math.floor(ticks / denom);
  let n = ticks - whole * denom;
  let d = denom;
  while (n > 0 && n % 2 === 0 && d % 2 === 0) { n /= 2; d /= 2; }
  const body = n === 0 ? `${whole}` : whole === 0 ? `${n}/${d}` : `${whole} ${n}/${d}`;
  return `${neg ? '-' : ''}${body}"`;
}

/** Inches → feet-inches: 117.5 → `9'-9 1/2"`. */
export function formatFeetInches(x, denom = 16) {
  if (!Number.isFinite(x)) return '—';
  const neg = x < 0;
  const ticks = Math.round(Math.abs(x) * denom);
  const totalIn = ticks / denom;
  const ft = Math.floor(totalIn / 12 + 1e-9);
  const inch = totalIn - ft * 12;
  const inStr = formatInches(inch, denom);
  if (ft === 0) return `${neg ? '-' : ''}${inStr}`;
  return `${neg ? '-' : ''}${ft}'-${inStr}`;
}

/**
 * Parse whatever an estimator types into decimal inches.
 *   "117.5"  "117 1/2"  "9'-9 1/2\""  "9' 9.5"  "9'"  "3/4"  "9-9 1/2" (ft-in)
 * Returns null when the string isn't a dimension.
 */
export function parseDimension(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = String(input).trim().toLowerCase().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  if (!s) return null;
  s = s.replace(/\s*(in|inch|inches)\b/g, '"').replace(/\s*(ft|feet|foot)\b/g, "'");

  const frac = (t) => {
    t = t.trim().replace(/"$/, '').trim();
    if (!t) return 0;
    // "9 1/2", "1/2", "9.5", "9-1/2"
    let m = t.match(/^(\d+(?:\.\d+)?)[\s-]+(\d+)\/(\d+)$/);
    if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
    m = t.match(/^(\d+)\/(\d+)$/);
    if (m) return Number(m[1]) / Number(m[2]);
    m = t.match(/^\d+(?:\.\d+)?$/);
    if (m) return Number(t);
    return NaN;
  };

  let ft = 0;
  let rest = s;
  const fi = s.indexOf("'");
  if (fi >= 0) {
    ft = Number(s.slice(0, fi).trim());
    rest = s.slice(fi + 1).replace(/^[\s-]+/, '');
    if (!Number.isFinite(ft)) return null;
  } else {
    // "9-9 1/2" with no quote marks → feet-inches only when the dash is followed by a number and the first part is an integer and there's no fraction slash before the dash
    const m = s.match(/^(\d+)-(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)"?$/);
    if (m && !s.startsWith('0')) {
      // ambiguous with "9-1/2" (9 and a half inches) — treat "a-b/c" as inches
      if (!/^\d+-\d+\/\d+"?$/.test(s)) { ft = Number(m[1]); rest = m[2]; }
    }
  }
  const inches = frac(rest);
  if (!Number.isFinite(inches)) return null;
  const v = ft * 12 + inches;
  return Number.isFinite(v) ? v : null;
}

/** Area helpers */
export const sqft = (wIn, hIn) => (wIn * hIn) / 144;
