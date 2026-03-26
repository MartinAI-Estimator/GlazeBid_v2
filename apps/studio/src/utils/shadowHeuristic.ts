/**
 * shadowHeuristic.ts
 *
 * Fast local heuristic that pre-populates citation fields before the
 * CitationFormPanel opens. Uses shape dimensions, page label patterns,
 * and size-range constraints to suggest systemType + architectTag.
 *
 * Zero ML dependencies — pure deterministic logic.
 */

// ── Size constraints (inches) per system type ─────────────────────────────────

type SystemCandidate = {
  systemType:  string;
  systemLabel: string;
  minW: number; maxW: number;
  minH: number; maxH: number;
};

const SYSTEM_CANDIDATES: SystemCandidate[] = [
  { systemType: 'ext-sf-1', systemLabel: 'Exterior Storefront',  minW: 48,  maxW: 720, minH: 72, maxH: 168 },
  { systemType: 'ext-sf-2', systemLabel: 'Exterior Storefront 2',minW: 48,  maxW: 720, minH: 72, maxH: 168 },
  { systemType: 'int-sf',   systemLabel: 'Interior Storefront',  minW: 48,  maxW: 480, minH: 72, maxH: 144 },
  { systemType: 'cap-cw',   systemLabel: 'Captured Curtainwall', minW: 48,  maxW: 960, minH: 96, maxH: 720 },
  { systemType: 'ssg-cw',   systemLabel: 'SSG Curtainwall',      minW: 48,  maxW: 960, minH: 96, maxH: 720 },
  { systemType: 'door-only', systemLabel: 'Door',                minW: 30,  maxW: 72,  minH: 78, maxH: 108 },
];

// ── Sheet label → architect tag mapping ──────────────────────────────────────

const TAG_PATTERNS: { pattern: RegExp; tag: string }[] = [
  { pattern: /^A[0-9]/i,   tag: 'Architectural' },
  { pattern: /^S[0-9]/i,   tag: 'Structural' },
  { pattern: /^E[0-9]/i,   tag: 'Elevation' },
  { pattern: /^D[0-9]/i,   tag: 'Detail' },
  { pattern: /^AD[0-9]/i,  tag: 'Architectural Detail' },
  { pattern: /elev/i,      tag: 'Elevation' },
  { pattern: /detail/i,    tag: 'Detail' },
  { pattern: /sched/i,     tag: 'Schedule' },
  { pattern: /plan/i,      tag: 'Plan' },
];

// ── Public API ────────────────────────────────────────────────────────────────

export interface ShadowSuggestion {
  systemType:   string;
  architectTag: string;
  systemLabel:  string;
  confidence:   number;
  suggestedBy:  string;
}

/**
 * Given shape dimensions and page label, produce a best-guess pre-fill.
 * Returns undefined if no heuristic fires with enough confidence.
 */
export function computeShadow(
  widthInches:  number,
  heightInches: number,
  sheetLabel:   string,
): ShadowSuggestion | undefined {
  // 1. Find candidates whose size range fits
  const fits = SYSTEM_CANDIDATES.filter(c =>
    widthInches >= c.minW && widthInches <= c.maxW &&
    heightInches >= c.minH && heightInches <= c.maxH
  );

  if (fits.length === 0) return undefined;

  // 2. Score each candidate — tighter range = higher score
  let best: SystemCandidate = fits[0];
  let bestScore = 0;
  for (const c of fits) {
    const wRange = c.maxW - c.minW || 1;
    const hRange = c.maxH - c.minH || 1;
    // Normalised position within range — centre=1, edge=0.5
    const wPos = 1 - Math.abs((widthInches - (c.minW + wRange / 2)) / (wRange / 2));
    const hPos = 1 - Math.abs((heightInches - (c.minH + hRange / 2)) / (hRange / 2));
    const score = (wPos + hPos) / 2;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  // 3. Infer architect tag from sheet label
  let architectTag = 'Unknown';
  for (const tp of TAG_PATTERNS) {
    if (tp.pattern.test(sheetLabel)) {
      architectTag = tp.tag;
      break;
    }
  }

  // 4. Confidence = size fit quality (0.3–0.8 range)
  const confidence = Math.min(0.8, 0.3 + bestScore * 0.5);

  return {
    systemType:   best.systemType,
    architectTag,
    systemLabel:  best.systemLabel,
    confidence,
    suggestedBy:  'size-heuristic',
  };
}
