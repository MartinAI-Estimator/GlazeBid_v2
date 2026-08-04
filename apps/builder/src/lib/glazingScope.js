/**
 * glazingScope.js — "is this section MY work?" for a commercial glazing sub.
 *
 * WHY THIS EXISTS
 * specSorterV2 classifies at DIVISION level: everything in Division 08 comes
 * back as scope. That is wrong on every real job. Division 08 (Openings) is
 * shared by several trades — hollow metal doors, overhead/coiling doors and
 * door hardware all belong to OTHER subs. Auto-moving those into the glazier's
 * scope is the single most expensive classification error this tool can make:
 * it invites bidding work the company does not perform.
 *
 * THE RULE (MASTER_BUILD_PROMPT §5, owner-confirmed 2026-08-03)
 * Match on the 4-DIGIT FAMILY PREFIX, never on exact section numbers. Real spec
 * books use variants the standard list does not contain — 08 56 80, 08 88 13,
 * 08 41 13.13 — and exact matching silently drops them.
 *
 * Buckets:
 *   'scope'  — the glazier bids this directly
 *   'review' — not our scope, but carries scope-gap risk worth reading
 *              (sealants, steel subframes, testing costs, contract terms)
 *   'other'  — another trade's work
 */

// ─── Scope families (owner-confirmed) ────────────────────────────────────────
// 4-digit prefixes. Keys are digits-only so spacing/punctuation never matters.
export const GLAZING_FAMILIES = {
  '0841': 'Entrances and storefronts',
  '0843': 'Sliding storefronts',
  '0844': 'Curtain wall and glazed assemblies',
  '0851': 'Metal windows',
  '0856': 'Special function windows',
  '0880': 'Glazing',
  '0881': 'Glass glazing',
  '0883': 'Mirrors',
  '0884': 'Plastic glazing',
  '0888': 'Special function glazing',
};

// ─── Division 08 families that are explicitly NOT ours ───────────────────────
// Named so the UI can say WHY a Div 08 section was left out — an unexplained
// omission in Division 08 reads like a bug to an estimator.
export const NOT_OUR_TRADE_FAMILIES = {
  '0811': 'Hollow metal doors and frames — door sub',
  '0812': 'Metal frames — door sub',
  '0813': 'Metal doors — door sub',
  '0814': 'Wood doors — door sub',
  '0816': 'Composite doors — door sub',
  '0817': 'Integrated door opening assemblies — door sub',
  '0831': 'Access doors and panels — other trade',
  '0832': 'Sliding doors — other trade',
  '0833': 'Coiling doors and grilles — overhead door sub',
  '0834': 'Special function doors — other trade',
  '0836': 'Panel doors (overhead/sectional) — overhead door sub',
  '0838': 'Traffic doors — other trade',
  '0842': 'Entrances (specialty/automatic) — often the auto-door sub',
  '0845': 'Translucent wall and roof assemblies — verify who bids it',
  '0871': 'Door hardware — hardware supplier',
  '0875': 'Window hardware — hardware supplier',
  '0879': 'Hardware accessories — hardware supplier',
  '0891': 'Louvers — other trade',
  '0895': 'Vents — other trade',
};

// ─── Divisions worth reading even though we don't bid them ───────────────────
export const REVIEW_DIVISIONS = {
  '00': 'Procurement and contracting requirements',
  '01': 'General requirements — testing, mock-ups, closeout costs',
  '02': 'Existing conditions — demolition of existing glazing',
  '05': 'Metals — steel subframes and reinforcement',
  '07': 'Thermal and moisture protection — perimeter sealants',
};

/** Digits only: "08 41 13.13" → "08411313"; "08 56 80" → "085680". */
function digitsOf(sectionNumber) {
  return String(sectionNumber ?? '').replace(/\D/g, '');
}

/** 4-digit family prefix, or '' when the number is too short to classify. */
export function familyOf(sectionNumber) {
  const d = digitsOf(sectionNumber);
  return d.length >= 4 ? d.slice(0, 4) : '';
}

/** 2-digit division prefix. */
export function divisionOf(sectionNumber) {
  const d = digitsOf(sectionNumber);
  return d.length >= 2 ? d.slice(0, 2) : '';
}

/**
 * Classify one section number.
 * @returns {{bucket:'scope'|'review'|'other', family:string, division:string,
 *            label:string, reason:string}}
 */
export function classifySection(sectionNumber) {
  const family   = familyOf(sectionNumber);
  const division = divisionOf(sectionNumber);

  if (family && GLAZING_FAMILIES[family]) {
    return {
      bucket: 'scope',
      family,
      division,
      label:  GLAZING_FAMILIES[family],
      reason: `Division 08 family ${family.slice(0, 2)} ${family.slice(2)} — your work`,
    };
  }

  if (family && NOT_OUR_TRADE_FAMILIES[family]) {
    return {
      bucket: 'other',
      family,
      division,
      label:  NOT_OUR_TRADE_FAMILIES[family],
      reason: NOT_OUR_TRADE_FAMILIES[family],
    };
  }

  if (division && REVIEW_DIVISIONS[division]) {
    return {
      bucket: 'review',
      family,
      division,
      label:  REVIEW_DIVISIONS[division],
      reason: `Division ${division} — ${REVIEW_DIVISIONS[division]}`,
    };
  }

  // Unlisted Division 08 family: not a known glazing family and not a known
  // other-trade family. Surface it for review rather than silently hiding it —
  // an unrecognized Div 08 section is exactly the kind of thing that should
  // catch the estimator's eye.
  if (division === '08') {
    return {
      bucket: 'review',
      family,
      division,
      label:  'Division 08 — unrecognized family',
      reason: 'In Openings but not a known glazing or door family — check it',
    };
  }

  return { bucket: 'other', family, division, label: '', reason: 'Another trade' };
}

/** True when this section is the glazier's own work. */
export function isGlazingScope(sectionNumber) {
  return classifySection(sectionNumber).bucket === 'scope';
}

/**
 * Sort a section list into the two stacked lists the UI renders.
 * Input sections are specSorterV2 output ({ sectionNumber, title, ... }).
 * Order within each bucket is preserved (already page order from the engine).
 *
 * @returns {{scope:Array, review:Array, other:Array}} each item is the original
 *          section augmented with { scopeBucket, scopeLabel, scopeReason }.
 */
export function sortSections(sections = []) {
  const out = { scope: [], review: [], other: [] };
  for (const section of sections) {
    const c = classifySection(section?.sectionNumber);
    const augmented = {
      ...section,
      scopeBucket: c.bucket,
      scopeLabel:  c.label,
      scopeReason: c.reason,
      scopeFamily: c.family,
    };
    out[c.bucket].push(augmented);
  }
  return out;
}

/** Section numbers that auto-move to "My scope" — used by tests and the UI. */
export function scopeSectionNumbers(sections = []) {
  return sections
    .filter((s) => isGlazingScope(s?.sectionNumber))
    .map((s) => s.sectionNumber);
}
