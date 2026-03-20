/**
 * parseArchitecturalDim.js
 *
 * Glass-industry notation ↔ decimal-inches converter.
 *
 * parseArchitecturalString  — user text → decimal inches (for math / state)
 * formatArchitecturalInches — decimal inches → display string
 */

/**
 * Converts common architectural dimension strings to decimal inches.
 *
 * Supported input formats:
 *   "7'6\""    → 90          feet-and-inches (with closing ")
 *   "7'6"      → 90          feet-and-inches (no closing ")
 *   "7'-6\""   → 90          feet-and-inches with dash separator
 *   "7'"        → 84          feet only
 *   "84.5"      → 84.5        decimal inches
 *   "84 1/2"    → 84.5        whole + fraction
 *   "1/2"       → 0.5         fraction only
 *   "84"        → 84          plain integer
 *
 * @param {string|number} val   Raw user input
 * @param {number} [fallback=NaN]  Returned when parsing fails
 * @returns {number} Decimal inches
 */
export function parseArchitecturalString(val, fallback = NaN) {
  if (val === null || val === undefined) return fallback;
  const s = String(val).trim();
  if (!s) return fallback;

  // ── Plain number (may have trailing " or ') ─────────────────────────────
  const stripped = s.replace(/['"″′]/g, '').trim();
  const plain = parseFloat(stripped);
  if (!isNaN(plain) && stripped !== '' && !/['-/\s]/.test(stripped)) {
    return plain;
  }

  // ── Feet-and-inches: 7'6"  7'6  7'-6"  7' 6  10'0  ─────────────────────
  // Captures: feetPart ' [sep] inchesPart? "?
  const feetInchRe = /^(\d+(?:\.\d+)?)\s*['′]\s*[-–]?\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)?\s*[""″]?$/;
  const fi = s.match(feetInchRe);
  if (fi) {
    const feet   = parseFloat(fi[1]);
    const inStr  = (fi[2] ?? '').trim();
    const inches = inStr ? parseArchitecturalString(inStr, 0) : 0;
    const result = feet * 12 + inches;
    return isNaN(result) ? fallback : +result.toFixed(6);
  }

  // Feet-only: 7'
  const feetOnly = s.match(/^(\d+(?:\.\d+)?)\s*['′]$/);
  if (feetOnly) {
    return parseFloat(feetOnly[1]) * 12;
  }

  // ── Whole + fraction: 84 1/2 ─────────────────────────────────────────────
  const wholeFrac = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (wholeFrac) {
    const whole = parseInt(wholeFrac[1], 10);
    const num   = parseInt(wholeFrac[2], 10);
    const den   = parseInt(wholeFrac[3], 10);
    if (den === 0) return fallback;
    return +(whole + num / den).toFixed(6);
  }

  // ── Fraction only: 1/2 ───────────────────────────────────────────────────
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const den = parseInt(frac[2], 10);
    if (den === 0) return fallback;
    return +(parseInt(frac[1], 10) / den).toFixed(6);
  }

  // ── Decimal with optional trailing inch-mark: 84.5" ─────────────────────
  const decInch = s.match(/^(\d+(?:\.\d+)?)\s*[""″]$/);
  if (decInch) return parseFloat(decInch[1]);

  // ── Last resort: generic parseFloat ──────────────────────────────────────
  const pf = parseFloat(s);
  return isNaN(pf) ? fallback : pf;
}

// ─── Common architectural fractions (sorted least-to-greatest) ───────────────
const ARCH_FRACS = [
  [1/16, '1/16'], [1/8,  '1/8' ], [3/16, '3/16'], [1/4, '1/4'],
  [5/16, '5/16'], [3/8,  '3/8' ], [7/16, '7/16'], [1/2, '1/2'],
  [9/16, '9/16'], [5/8,  '5/8' ], [11/16,'11/16'],[3/4, '3/4'],
  [13/16,'13/16'],[7/8,  '7/8' ], [15/16,'15/16'],
];
const FRAC_TOL = 0.004; // ±1/256" snap tolerance

/**
 * Converts decimal inches to a nearest-fraction display string.
 *
 *   90     → "7'-6\""
 *   84.5   → "84 1/2\""
 *   84.25  → "84 1/4\""
 *   84     → "84\""
 *   120    → "10'-0\""
 *
 * @param {number} inches
 * @returns {string}
 */
export function formatArchitecturalInches(inches) {
  if (inches == null || isNaN(+inches)) return '';
  const total  = +inches;
  const feet   = Math.floor(total / 12);
  const rem    = +(total - feet * 12).toFixed(6); // remaining inches

  const fracStr = _decToFracStr(rem);

  if (feet > 0) {
    return fracStr === '0' ? `${feet}'-0"` : `${feet}'-${fracStr}"`;
  }
  return fracStr === '0' ? `0"` : `${fracStr}"`;
}

function _decToFracStr(dec) {
  const whole = Math.floor(dec);
  const frac  = +(dec - whole).toFixed(6);

  if (frac < FRAC_TOL) {
    return whole === 0 ? '0' : String(whole);
  }

  for (const [val, str] of ARCH_FRACS) {
    if (Math.abs(frac - val) < FRAC_TOL) {
      return whole > 0 ? `${whole} ${str}` : str;
    }
  }

  // No clean fraction: fall back to 2-decimal
  return +(whole + frac).toFixed(2) + '';
}
