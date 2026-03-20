/**
 * measurementParser.ts  —  Architectural dimension parsing and formatting.
 *
 * Glaziers use fractional inches, not decimals.  This utility converts
 * between the two representations.
 *
 * Ported and re-implemented from:
 *   _LEGACY_ARCHIVE/GlazeBid_AIQ/frontend/src/utils/parseArchitecturalDim.js
 *
 * ── Supported input strings (all return decimal inches) ───────────────────────
 *   "10'2"       → 122.0
 *   "10'-2 1/2"  → 122.5
 *   "10' 2 1/2"  → 122.5
 *   "122"        → 122.0
 *   "122.5"      → 122.5
 *   "122 1/2"    → 122.5
 *   "1/2"        → 0.5
 *   "6'-8\""     → 80.0
 *
 * ── Supported output modes ────────────────────────────────────────────────────
 *   'inches'  → "122 1/2\""  (always expressed purely in inches)
 *   'auto'    → "10'-2 1/2\""  when ≥12", plain inches otherwise
 */

// ── Fraction table (1/16" precision) ─────────────────────────────────────────

/** Every 1/16" fraction value and its display string. */
const ARCH_FRACS: [number, string][] = [
  [1 / 16,  '1/16'],  [1 / 8,  '1/8'],   [3 / 16,  '3/16'],  [1 / 4,  '1/4'],
  [5 / 16,  '5/16'],  [3 / 8,  '3/8'],   [7 / 16,  '7/16'],  [1 / 2,  '1/2'],
  [9 / 16,  '9/16'],  [5 / 8,  '5/8'],   [11 / 16, '11/16'], [3 / 4,  '3/4'],
  [13 / 16, '13/16'], [7 / 8,  '7/8'],   [15 / 16, '15/16'],
];

/** Snap tolerance: within 1/32" of any fraction → treated as that fraction. */
const FRAC_TOL = 0.031;

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parses an architectural dimension string into decimal inches.
 * Returns `fallback` (default NaN) if the string cannot be parsed.
 */
export function parseArchitecturalString(
  val:      string,
  fallback: number = NaN,
): number {
  // Normalise curly/unicode quotes to ASCII
  const s = val.trim()
    .replace(/[\u201C\u201D\u2033]/g, '"')  // " " ″  → "
    .replace(/[\u2018\u2019\u2032]/g, "'"); // ' ' ′  → '

  if (!s) return fallback;

  // ── Plain decimal: "122.5" ─────────────────────────────────────────────────
  if (/^-?[\d.]+$/.test(s)) {
    const n = parseFloat(s);
    return isNaN(n) ? fallback : +n.toFixed(6);
  }

  // ── Bare fraction: "1/2"  "7/16" ──────────────────────────────────────────
  const bareFrac = s.match(/^(\d+)\/(\d+)$/);
  if (bareFrac) {
    const den = parseInt(bareFrac[2], 10);
    if (den === 0) return fallback;
    return +(parseInt(bareFrac[1], 10) / den).toFixed(6);
  }

  // ── Whole + fraction: "84 1/2"  "3 7/16" ──────────────────────────────────
  const wholeFrac = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (wholeFrac) {
    const den = parseInt(wholeFrac[3], 10);
    if (den === 0) return fallback;
    return +(parseInt(wholeFrac[1], 10) + parseInt(wholeFrac[2], 10) / den).toFixed(6);
  }

  // ── Feet-and-inches: "7'6"  "7'-6""  "7' 6"  "10'0"  "10'-2 1/2"" ────────
  //   Group 1: feet  (integer or decimal)
  //   Group 2: inches portion  (may include fraction, may be absent for 10'0)
  const fiRe = /^(\d+(?:\.\d+)?)\s*'\s*-?\s*([\d\s./]*)[""]?$/;
  const fi = s.match(fiRe);
  if (fi) {
    const feet  = parseFloat(fi[1]);
    const inStr = (fi[2] ?? '').trim();
    const inches = inStr ? parseArchitecturalString(inStr, 0) : 0;
    const result = feet * 12 + inches;
    return isNaN(result) ? fallback : +result.toFixed(6);
  }

  return fallback;
}

// ── Formatter ─────────────────────────────────────────────────────────────────

/**
 * Formats decimal inches to the nearest 1/16" as an architectural string.
 *
 * @param inches  Value in decimal inches.
 * @param mode    'inches' → always expressed in inches ("122 1/2\"")
 *                'auto'   → uses feet when ≥12" ("10'-2 1/2\"")
 */
export function formatArchitecturalInches(
  inches: number,
  mode:   'inches' | 'auto' = 'auto',
): string {
  if (!isFinite(inches) || isNaN(inches)) return '—';

  const neg   = inches < 0;
  const total = Math.abs(inches);
  const sign  = neg ? '-' : '';

  if (mode === 'inches') {
    return sign + fmtInchesOnly(total);
  }

  // 'auto' mode
  if (total < 12) {
    return sign + fmtInchesOnly(total);
  }

  const feet     = Math.floor(total / 12);
  const remIn    = +(total - feet * 12).toFixed(6);
  const inLabel  = fmtInchesOnly(remIn);
  return `${sign}${feet}'-${inLabel}`;
}

/** Format a value < 24" as  "6""  |  "6 1/2""  |  "0 7/16"" */
function fmtInchesOnly(val: number): string {
  const whole    = Math.floor(val);
  const rem      = +(val - whole).toFixed(6);
  const fracLabel = matchFraction(rem);

  if (fracLabel) {
    return whole > 0 ? `${whole} ${fracLabel}"` : `${fracLabel}"`;
  }
  return `${whole}"`;
}

/**
 * Returns the 1/16" fraction label closest to `rem` (a value in [0,1)),
 * or an empty string if rem is effectively 0.
 */
function matchFraction(rem: number): string {
  if (rem < FRAC_TOL) return '';

  // Direct table lookup
  for (const [val, label] of ARCH_FRACS) {
    if (Math.abs(rem - val) <= FRAC_TOL) return label;
  }

  // Fall back: quantise to nearest 1/16 and look up again
  const quantised = Math.round(rem * 16) / 16;
  for (const [val, label] of ARCH_FRACS) {
    if (Math.abs(quantised - val) < 0.001) return label;
  }

  // Last resort: round to 4 decimal places
  return rem.toFixed(4);
}
