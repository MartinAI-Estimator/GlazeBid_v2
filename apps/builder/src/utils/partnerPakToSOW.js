/**
 * partnerPakToSOW.js
 * Transforms a PartnerPak smart-import result into SOWMaterialTracker lines.
 *
 * PartnerPak system shape (from /api/bidsheet/projects/:name/smart-import):
 *   system.name        — "EX SF 1", "Cap CW", etc.
 *   system.frames[]    — array of frame objects
 *   system.totals      — { shopMHs, fieldMHs, distMHs }
 *   system.systemType  — "Exterior Storefront" | "Curtain Wall" | etc.
 *
 * Produces SOW line shape:
 *   { id, costCode, desc1, desc2, notes, breakout, alternate, cost, isAuto }
 *
 * Cost is initialised to 0 — the estimator fills in the $ amounts.
 * One 02-METL line is created per frame group as a placeholder.
 */

// Maps PartnerPak systemType → SOW Breakout category
const SYSTEM_TYPE_TO_BREAKOUT = {
  'Exterior Storefront':   'Exterior Storefront',
  'Interior Storefront':   'Interior Storefront',
  'Curtain Wall':          'Curtain Wall',
  'Cap CW':                'Curtain Wall',
  'Captured CW':           'Curtain Wall',
  'SSG CW':                'Curtain Wall',
  'Glazing Only':          'Glazing Only',
  'Fire Rated':            'Fire Rated Storefront',
  'Window Wall':           'Window Wall',
  'Hollow Metal':          'Hollow Metal Glazing',
};

// Maps PartnerPak systemType → default cost code
const SYSTEM_TYPE_TO_COST_CODE = {
  'Exterior Storefront':   '02-METL',
  'Interior Storefront':   '02-METL',
  'Curtain Wall':          '02-METL',
  'Cap CW':                '02-METL',
  'SSG CW':                '02-METL',
  'Glazing Only':          '02-GLSS',
  'Fire Rated':            '02-METL',
};

/**
 * Convert one PartnerPak system into a set of SOW manual lines.
 * @param {object} system - PartnerPak system object
 * @param {string} [alternate=''] - Alternate tag if applicable
 * @returns {Array} SOW line items (isAuto: false, cost: 0)
 */
export function systemToSOWLines(system, alternate = '') {
  const breakout  = SYSTEM_TYPE_TO_BREAKOUT[system.systemType]  || system.systemType || 'Miscellaneous';
  const costCode  = SYSTEM_TYPE_TO_COST_CODE[system.systemType] || '02-METL';
  const frames    = system.frames || [];

  // If no frames, create a single placeholder line for the system
  if (frames.length === 0) {
    return [{
      id:        `pp-${system.id || Date.now()}-blank`,
      costCode,
      desc1:     system.name || 'Imported System',
      desc2:     '',
      notes:     'PartnerPak import',
      breakout,
      alternate,
      cost:      0,
      isAuto:    false,
    }];
  }

  // Group frames by their label/elevation to avoid one line per frame
  // (PartnerPak can have 50+ frames — we want one line per system, not per frame)
  const totalSqFt = frames.reduce((s, f) => s + (Number(f.sqFt) || Number(f.area) || 0), 0);
  const frameCount = frames.length;

  // Primary material line — aluminum/framing
  const lines = [{
    id:        `pp-${system.id || Date.now()}-metl`,
    costCode,
    desc1:     system.name || 'Imported System',
    desc2:     `${frameCount} frame${frameCount !== 1 ? 's' : ''} · ${totalSqFt.toFixed(0)} SqFt`,
    notes:     'PartnerPak',
    breakout,
    alternate,
    cost:      0,
    isAuto:    false,
  }];

  // If system has glass data, add a 02-GLSS placeholder too
  const hasGlass = frames.some(f => f.glassType || f.glass || f.glazing);
  if (hasGlass) {
    lines.push({
      id:        `pp-${system.id || Date.now()}-glss`,
      costCode:  '02-GLSS',
      desc1:     `${system.name} — Glass`,
      desc2:     `${totalSqFt.toFixed(0)} SqFt`,
      notes:     'PartnerPak',
      breakout,
      alternate,
      cost:      0,
      isAuto:    false,
    });
  }

  // Hardware placeholder if system has doors
  const hasDoors = frames.some(f =>
    (f.modifiers || []).some(m => {
      const id = typeof m === 'string' ? m : m.id;
      return id?.includes('door');
    })
  );
  if (hasDoors) {
    const doorCount = frames.reduce((s, f) =>
      s + (f.modifiers || []).filter(m => {
        const id = typeof m === 'string' ? m : m.id;
        return id?.includes('door');
      }).length, 0
    );
    lines.push({
      id:        `pp-${system.id || Date.now()}-hdwr`,
      costCode:  '02-HDWR',
      desc1:     `${system.name} — Hardware`,
      desc2:     `${doorCount} door${doorCount !== 1 ? 's' : ''}`,
      notes:     'PartnerPak',
      breakout,
      alternate,
      cost:      0,
      isAuto:    false,
    });
  }

  return lines;
}

/**
 * Convert a full PartnerPak import result (array of systems) into SOW lines.
 * @param {Array} systems - Array of PartnerPak system objects
 * @returns {Array} Flat array of SOW line items ready for SOWMaterialTracker
 */
export function partnerPakToSOWLines(systems = []) {
  return systems.flatMap(sys => systemToSOWLines(sys));
}

/**
 * Merge new PartnerPak-derived lines into existing SOW lines.
 * Skips lines that were already imported from the same system (by id prefix).
 * Preserves any manually-entered lines.
 * @param {Array} existingLines - Current SOW lines (may include manual entries)
 * @param {Array} newSystems    - PartnerPak systems to merge in
 * @returns {Array} Merged line array
 */
export function mergePartnerPakLines(existingLines = [], newSystems = []) {
  // Remove old PartnerPak lines (they'll be replaced)
  const manualLines = existingLines.filter(l => !l.notes?.includes('PartnerPak'));
  const newLines    = partnerPakToSOWLines(newSystems);
  return [...manualLines, ...newLines];
}
