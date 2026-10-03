/**
 * markupTools.ts — Studio Markup Color Constants
 *
 * Derived from glazebid_scope_colors.py (canonical reference).
 * Studio reads scopeHex from GlazierAI output and renders markup
 * overlays in the correct color automatically.
 *
 * Colors mirror Martin's Estimating ToolBox.btx. Colors are NOT unique
 * (SF ext/int share orange; window wall + break metal share teal). To add a scope type, update glazebid_scope_colors.py first,
 * then mirror it here.
 */

export type ScopeType =
  | 'curtain_wall'
  | 'storefront'
  | 'window_wall'
  | 'break_metal'
  | 'all_glass_wall'
  | 'glazing_only'
  | 'window'
  | 'translucent_panel'
  | 'bifold_sliding'
  | 'fire_rated'
  | 'sun_control'
  | 'mirror'
  | 'glass_handrail'
  | 'glass_film'
  | 'skylight'
  | 'bullet_blast'
  | 'glass_canopy'
  | 'smart_glass';

export interface ScopeColorDef {
  hex: string;
  name: string;
  csiSections: string[];
}

// ── Primary Framing Systems ───────────────────────────────────────────────────

export const SCOPE_COLORS: Record<ScopeType, ScopeColorDef> = {
  curtain_wall: {
    hex: '#008000',
    name: 'Curtain Wall',
    csiSections: ['08 44 13', '08 44 33', '08 45 13'],
  },
  storefront: {
    hex: '#FF8000',
    name: 'Storefront',
    csiSections: ['08 41 13', '08 42 26'],
  },
  // WW = WINDOW WALL (Martin, 2026-10-03). Shares #008080 with break metal —
  // classify by subject, never by color.
  window_wall: {
    hex: '#008080',
    name: 'Window Wall',
    csiSections: ['08 44 00'],
  },
  break_metal: {
    hex: '#008080',
    name: 'Break Metal Flashing & Trim',
    csiSections: [],
  },

  // ── Glass-Primary Systems ─────────────────────────────────────────────────

  all_glass_wall: {
    hex: '#80FFFF',
    name: 'All-Glass Wall',
    csiSections: ['08 42 26'],
  },
  glazing_only: {
    hex: '#800040',
    name: 'Glazing Only',
    csiSections: ['08 80 00'],
  },
  window: {
    hex: '#0000FF',
    name: 'Fixed / Operable Window',
    csiSections: ['08 51 13', '08 52 13', '08 53 13', '08 56 19', '08 56 80'],
  },
  translucent_panel: {
    hex: '#0080FF',
    name: 'Translucent Panel',
    csiSections: ['08 45 13'],
  },

  // ── Specialty Systems ─────────────────────────────────────────────────────

  bifold_sliding: {
    hex: '#FFFF00',
    name: 'Bi-Fold / Sliding Door',
    csiSections: ['08 42 29'],
  },
  fire_rated: {
    hex: '#FF0000',
    name: 'Fire Rated',
    csiSections: ['08 88 13'],
  },
  sun_control: {
    hex: '#FF80FF',
    name: 'Sun Control Device',
    csiSections: ['08 44 13'],
  },
  mirror: {
    hex: '#FF80C0',
    name: 'Mirror',
    csiSections: ['08 83 00'],
  },
  glass_handrail: {
    hex: '#FF0080',
    name: 'Glass Handrail',
    csiSections: ['05 73 19'],
  },

  // ── New Tools (v1.0 additions) ────────────────────────────────────────────

  glass_film: {
    hex: '#CC99FF',
    name: 'Glass Film',
    csiSections: ['08 88 00'],
  },
  skylight: {
    hex: '#00B4D8',
    name: 'Skylight',
    csiSections: ['08 62 00', '08 63 00'],
  },
  bullet_blast: {
    hex: '#CC0033',
    name: 'Bullet / Blast Resistant',
    csiSections: ['08 88 16', '08 88 19'],
  },
  glass_canopy: {
    hex: '#33CC99',
    name: 'Glass Canopy / Overhead Glazing',
    csiSections: ['08 44 33', '08 63 13'],
  },
  smart_glass: {
    hex: '#9933FF',
    name: 'Smart / Switchable Glass',
    csiSections: ['08 88 00'],
  },
};

// ── Quick-access maps ─────────────────────────────────────────────────────────

/** Resolve a scope_type key to its hex color. Used by Studio render pipeline. */
export const SCOPE_TO_HEX: Record<ScopeType, string> = Object.fromEntries(
  (Object.entries(SCOPE_COLORS) as [ScopeType, ScopeColorDef][]).map(
    ([k, v]) => [k, v.hex]
  )
) as Record<ScopeType, string>;

/** Resolve a hex color back to its scope_type key. Used for Bluebeam import parsing. */
export const HEX_TO_SCOPE: Record<string, ScopeType> = Object.fromEntries(
  (Object.entries(SCOPE_COLORS) as [ScopeType, ScopeColorDef][]).map(
    ([k, v]) => [v.hex.toUpperCase(), k]
  )
);

/** All 17 scope types as a typed array. */
export const ALL_SCOPE_TYPES = Object.keys(SCOPE_COLORS) as ScopeType[];
