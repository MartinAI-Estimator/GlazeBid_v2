/**
 * systemTypes.js — THE canonical SystemType enum + translation shim
 *
 * OWNER-APPROVED (2026-08-02): the canonical system type names are the
 * systemTypeConfig display names, matching the Bid Sheet Excel tabs:
 *
 *   'Ext SF'  — Exterior Storefront   (storefront formulas)
 *   'Int SF'  — Interior Storefront   (storefront formulas)
 *   'Cap CW'  — Captured Curtain Wall (curtain wall formulas)
 *   'SSG CW'  — SSG Curtain Wall      (curtain wall formulas)
 *
 * Everything else that appears in stored data is LEGACY and must pass
 * through toCanonicalSystemType() before touching the labor engine,
 * rate stores, or pricing:
 *
 *   kebab-case contract ids:  'ext-sf-1', 'ext-sf-2', 'int-sf', 'cap-cw', 'ssg-cw'
 *   Studio hand-off marker:   'Studio Takeoff'   (RawTakeoff without a resolved type)
 *   instance-suffixed ids:    'ext-sf-1:2' (BidSheetContext system instances)
 *
 * DO NOT add new naming schemes. If a new system type is ever added it gets
 * a canonical name here first (CLAUDE.md §6).
 */

export const CANONICAL_SYSTEM_TYPES = ['Ext SF', 'Int SF', 'Cap CW', 'SSG CW'];

export const DEFAULT_SYSTEM_TYPE = 'Ext SF';

// legacy value (lowercased) → canonical
const LEGACY_TO_CANONICAL = {
  'ext-sf-1': 'Ext SF',
  'ext-sf-2': 'Ext SF',
  'ext-sf':   'Ext SF',
  'int-sf':   'Int SF',
  'cap-cw':   'Cap CW',
  'ssg-cw':   'SSG CW',
  // display-name variants seen in stored data
  'ext sf':   'Ext SF',
  'ext sf 1': 'Ext SF',
  'ext sf 2': 'Ext SF',
  'int sf':   'Int SF',
  'cap cw':   'Cap CW',
  'ssg cw':   'SSG CW',
  'exterior storefront': 'Ext SF',
  'interior storefront': 'Int SF',
  'captured curtain wall': 'Cap CW',
  'ssg curtain wall': 'SSG CW',
};

// canonical → legacy kebab column-config id (systemColumns.js / frozen IPC contract)
const CANONICAL_TO_COLUMN_ID = {
  'Ext SF': 'ext-sf-1',
  'Int SF': 'int-sf',
  'Cap CW': 'cap-cw',
  'SSG CW': 'ssg-cw',
};

/** True if the value is already a canonical system type name. */
export function isCanonicalSystemType(value) {
  return CANONICAL_SYSTEM_TYPES.includes(value);
}

/**
 * Translate ANY system type spelling (canonical, legacy kebab, instance-suffixed,
 * Studio marker, display label) to the canonical name.
 *
 * Unknown / unresolvable values (including 'Studio Takeoff') return `fallback`
 * — the storefront default, matching the labor engine's historical behavior —
 * but callers that care should check isCanonicalSystemType() first and surface
 * the ambiguity to the estimator instead of silently defaulting.
 */
export function toCanonicalSystemType(value, fallback = DEFAULT_SYSTEM_TYPE) {
  if (value == null) return fallback;
  const raw = String(value).trim();
  if (isCanonicalSystemType(raw)) return raw;
  // instance-suffixed ids like 'ext-sf-1:2' → base id
  const base = raw.split(':')[0].trim();
  const hit = LEGACY_TO_CANONICAL[base.toLowerCase()];
  return hit || fallback;
}

/**
 * Like toCanonicalSystemType but returns null for unknown values instead of
 * defaulting — use when you need to KNOW the type was resolved (e.g. review
 * queues, Studio hand-off) rather than assume storefront.
 */
export function tryCanonicalSystemType(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (isCanonicalSystemType(raw)) return raw;
  const base = raw.split(':')[0].trim();
  return LEGACY_TO_CANONICAL[base.toLowerCase()] || null;
}

/** Canonical name → legacy kebab column id (for systemColumns + frozen contracts). */
export function toColumnId(value) {
  return CANONICAL_TO_COLUMN_ID[toCanonicalSystemType(value)] || 'ext-sf-1';
}
