/**
 * shadowHeuristic.ts (parametric engine)
 *
 * Fast local heuristic — runs synchronously before any IPC call.
 * Pre-populates systemType in the QuickEntryModal based on pure
 * geometry + glazing domain rules.
 *
 * No AI, no network — deterministic dimension-based reasoning.
 */

export interface ShadowResult {
  systemType:   string;
  architectTag: string;
  systemLabel:  string;
  confidence:   number;
  suggestedBy:  string;
}

interface Dimensions {
  widthInches:  number;
  heightInches: number;
}

export function buildShadowSuggestion(dims: Dimensions): ShadowResult {
  const { widthInches, heightInches } = dims;
  const widthFt  = widthInches  / 12;
  const heightFt = heightInches / 12;

  // ── Rule 1: Large area + wide span → curtain wall ─────────────────────────
  if (widthFt >= 20 && heightFt >= 8) {
    return {
      systemType:   'cap-cw',
      architectTag: '',
      systemLabel:  'Curtain Wall — Cap',
      confidence:   0.82,
      suggestedBy:  'geometry-rule',
    };
  }

  // ── Rule 2: Wide but moderate height → storefront ─────────────────────────
  if (widthFt >= 6 && widthFt < 20 && heightFt >= 7 && heightFt <= 14) {
    const isHeavy = widthFt > 12;
    return {
      systemType:   isHeavy ? 'ext-sf-2' : 'ext-sf-1',
      architectTag: '',
      systemLabel:  isHeavy ? 'Ext Storefront — Heavy' : 'Ext Storefront — Std',
      confidence:   0.75,
      suggestedBy:  'geometry-rule',
    };
  }

  // ── Rule 3: Door-range opening at typical height ──────────────────────────
  if (widthFt >= 2.5 && widthFt <= 5 && heightFt >= 6.5 && heightFt <= 9) {
    return {
      systemType:   'door-only',
      architectTag: '',
      systemLabel:  'Door Only',
      confidence:   0.70,
      suggestedBy:  'geometry-rule',
    };
  }

  // ── Rule 4: Small area openings → interior storefront ─────────────────────
  const area = widthFt * heightFt;
  if (area < 20 && heightFt < 9) {
    return {
      systemType:   'int-sf',
      architectTag: '',
      systemLabel:  'Int Storefront',
      confidence:   0.50,
      suggestedBy:  'geometry-rule',
    };
  }

  // ── Rule 5: Moderate dimensions → standard storefront ─────────────────────
  if (widthFt >= 3 && heightFt >= 3) {
    return {
      systemType:   'ext-sf-1',
      architectTag: '',
      systemLabel:  'Ext Storefront — Std',
      confidence:   0.55,
      suggestedBy:  'geometry-rule',
    };
  }

  // ── Default ───────────────────────────────────────────────────────────────
  return {
    systemType:   'ext-sf-1',
    architectTag: '',
    systemLabel:  'Ext Storefront — Std',
    confidence:   0.40,
    suggestedBy:  'geometry-default',
  };
}
