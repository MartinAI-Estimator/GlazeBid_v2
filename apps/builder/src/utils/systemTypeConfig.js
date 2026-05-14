/**
 * systemTypeConfig.js — System Type Configuration
 *
 * Maps the 4 Bid Sheet tabs to their formula categories, column config IDs,
 * hourly function structures, and item rate structures.
 *
 * Storefront (SF) types:  Ext SF, Int SF
 * Curtain Wall (CW) types: Cap CW, SSG CW
 */

// ── Storefront hourly function / item rate templates ─────────────────────────

export const EMPTY_HF_SF = {
  assemble:     { bays: 0, gtBays: 0 },
  clips:        { bays: 0, gtBays: 0 },
  set:          { bays: 0, gtBays: 0, dlos: 0, gtDlos: 0 },
  prep:         { dlos: 0, gtDlos: 0 },
  distribution: { doors: 0 },
  install:      { doors: 0 },
};

export const EMPTY_IR_SF = {
  joints:     0,
  dist:       0,
  subsills:   0,
  caulk:      0,
  ssg:        0,
  steel:      0,
  vents:      0,
  brakeMetal: 0,
  open:       0,
};

// ── Curtain Wall hourly function / item rate templates ───────────────────────

export const EMPTY_HF_CW = {
  assemble:     { verticals: 0, horizontals: 0 },
  install:      { verticals: 0, horizontals: 0, doors: 0 },
  prep:         { dlos: 0, gtDlos: 0 },
  set:          { dlos: 0, gtDlos: 0 },
  distribution: { doors: 0 },
};

export const EMPTY_IR_CW = {
  joints:     0,
  dist:       0,
  stoolTrim:  0,
  ft:         0,
  caulk:      0,
  ssg:        0,
  steel:      0,
  vents:      0,
  brakeMetal: 0,
  wlDl:       0,
};

// ── Excel Bid Sheet default rates (sourced from Warren Bid Sheet.xlsm) ───────
//
// Ext SF 1 tab:
//   Shop  = jointsMH + bays*assemble + gtBays*assemble + dlos*prep + gtDlos*prep
//   Dist  = distMH + (pairs×2 + singles) * distribution.doors
//   Field = subsillsMH + bays*(clips+set) + gtBays*(clips+set) + dlos*set
//           + gtDlos*set + doors*install + caulkMH + ssg + steel + vents + brake + open
//
// Cap CW / SSG CW tabs:
//   Shop  = jointsMH + verts*assemble + horiz*assemble + (prep_dlos/2)*dlos + (prep_gtDlos/2)*gtDlos
//   Dist  = distMH + (pairs×2 + singles) * distribution.doors
//   Field = stoolTrimMH + verts*install + horiz*install + ftMH + (prep_dlos/2)*dlos
//           + dlos*set + (prep_gtDlos/2)*gtDlos + gtDlos*set + doors*install
//           + caulkMH + ssg + steel + vents + brake + wlDl

export const EXCEL_HF_SF = {
  assemble:     { bays: 0.50, gtBays: 0.75 },
  clips:        { bays: 0.68, gtBays: 0.68 },
  set:          { bays: 1.00, gtBays: 1.50, dlos: 0.75, gtDlos: 1.25 },
  prep:         { dlos: 0.25, gtDlos: 0.25 },
  distribution: { doors: 0.50 },
  install:      { doors: 8.00 },   // Q4 in Warren sheet = 8 (verify: 7 doors × 8.5 total = 59.5 doorsMH)
};
// Resulting HF column totals: Bays=2.18, >Bays=2.93, DLOs=1.00, >DLOs=1.50, Doors=8.50

export const EXCEL_IR_SF = {
  joints:     0.25,
  dist:       0.33,  // V3 in Warren sheet = 0.33 (verify: 348 dist × 0.33 = 114.84)
  subsills:   1.00,
  caulk:      0.67,   // MH per stick (applied after ÷20 LF)
  ssg:        0.025,
  steel:      0.50,
  vents:      3.00,
  brakeMetal: 1.00,
  open:       0.00,
};

export const EXCEL_HF_CW = {
  assemble:     { verticals: 0.25, horizontals: 0.25 },
  install:      { verticals: 1.25, horizontals: 0.25, doors: 6.00 },
  prep:         { dlos: 0.50, gtDlos: 0.50 },
  set:          { dlos: 1.25, gtDlos: 2.00 },
  distribution: { doors: 0.50 },
};
// Resulting HF column totals: Verticals=1.50, Horizontals=0.50, DLOs=1.75, >DLOs=2.50, Doors=6.50

export const EXCEL_IR_CW = {
  joints:     0.50,
  dist:       0.25,
  stoolTrim:  1.00,
  ft:         1.00,
  caulk:      0.67,   // MH per stick (applied after ÷12 LF)
  ssg:        0.025,
  steel:      1.00,
  vents:      3.00,
  brakeMetal: 1.00,
  wlDl:       1.00,
};

// ── Admin UI table layout per category ──────────────────────────────────────

export const HF_ROWS_SF = [
  { key: 'assemble',     label: 'Assemble',     fields: ['bays', 'gtBays'] },
  { key: 'clips',        label: 'Clips',        fields: ['bays', 'gtBays'] },
  { key: 'set',          label: 'Set',          fields: ['bays', 'gtBays', 'dlos', 'gtDlos'] },
  { key: 'prep',         label: 'Prep',         fields: ['dlos', 'gtDlos'] },
  { key: 'distribution', label: 'Distribution', fields: ['doors'] },
  { key: 'install',      label: 'Install',      fields: ['doors'] },
];

export const HF_COLS_SF = [
  { key: 'bays',   label: 'Bays' },
  { key: 'gtBays', label: '> Bays' },
  { key: 'dlos',   label: 'DLOs' },
  { key: 'gtDlos', label: '> DLOs' },
  { key: 'doors',  label: 'Doors' },
];

export const IR_ROWS_SF = [
  { key: 'joints',     label: 'Joints',      unit: 'MH / joint' },
  { key: 'dist',       label: 'Distribution', unit: 'MH / piece' },
  { key: 'subsills',   label: 'Subsills',    unit: 'MH / subsill' },
  { key: 'caulk',      label: 'Caulk',       unit: 'MH / stick (÷20 LF)' },
  { key: 'ssg',        label: 'SSG',         unit: 'MH / unit' },
  { key: 'steel',      label: 'Steel',       unit: 'MH / unit' },
  { key: 'vents',      label: 'Vents',       unit: 'MH / vent' },
  { key: 'brakeMetal', label: 'Brake Metal', unit: 'MH / unit' },
  { key: 'open',       label: 'Open',        unit: 'MH / unit' },
];

export const HF_ROWS_CW = [
  { key: 'assemble',     label: 'Assemble',     fields: ['verticals', 'horizontals'] },
  { key: 'install',      label: 'Install',      fields: ['verticals', 'horizontals', 'doors'] },
  { key: 'prep',         label: 'Prep',         fields: ['dlos', 'gtDlos'] },
  { key: 'set',          label: 'Set',          fields: ['dlos', 'gtDlos'] },
  { key: 'distribution', label: 'Distribution', fields: ['doors'] },
];

export const HF_COLS_CW = [
  { key: 'verticals',   label: 'Verticals' },
  { key: 'horizontals', label: 'Horizontals' },
  { key: 'dlos',        label: 'DLOs' },
  { key: 'gtDlos',      label: '> DLOs' },
  { key: 'doors',       label: 'Doors' },
];

export const IR_ROWS_CW = [
  { key: 'joints',     label: 'Joints',      unit: 'MH / joint' },
  { key: 'dist',       label: 'Distribution', unit: 'MH / piece' },
  { key: 'stoolTrim',  label: 'Stool Trim',  unit: 'MH / unit' },
  { key: 'ft',         label: 'F/T',         unit: 'MH / unit' },
  { key: 'caulk',      label: 'Caulk',       unit: 'MH / stick (÷12 LF)' },
  { key: 'ssg',        label: 'SSG',         unit: 'MH / unit' },
  { key: 'steel',      label: 'Steel',       unit: 'MH / unit' },
  { key: 'vents',      label: 'Vents',       unit: 'MH / vent' },
  { key: 'brakeMetal', label: 'Brake Metal', unit: 'MH / unit' },
  { key: 'wlDl',       label: 'WL / DL',    unit: 'MH / unit' },
];

// ── Grouped HF table layout (matches bid sheet Excel) ───────────────────────
// Each group is a mini-table displayed side-by-side: columns + applicable rows

export const HF_GROUPS_SF = [
  {
    columns: [{ key: 'bays', label: 'Bays' }, { key: 'gtBays', label: '> Bays' }],
    rows: [{ key: 'assemble', label: 'Assemble' }, { key: 'clips', label: 'Clips' }, { key: 'set', label: 'Set' }],
  },
  {
    columns: [{ key: 'dlos', label: 'DLOs' }, { key: 'gtDlos', label: '> DLOs' }],
    rows: [{ key: 'prep', label: 'Prep' }, { key: 'set', label: 'Set' }],
  },
  {
    columns: [{ key: 'doors', label: 'Doors' }],
    rows: [{ key: 'distribution', label: 'Distribution' }, { key: 'install', label: 'Install' }],
  },
];

export const HF_GROUPS_CW = [
  {
    columns: [{ key: 'verticals', label: 'Verticals' }, { key: 'horizontals', label: 'Horizontals' }],
    rows: [{ key: 'assemble', label: 'Assemble' }, { key: 'install', label: 'Install' }],
  },
  {
    columns: [{ key: 'dlos', label: 'DLOs' }, { key: 'gtDlos', label: '> DLOs' }],
    rows: [{ key: 'prep', label: 'Prep' }, { key: 'set', label: 'Set' }],
  },
  {
    columns: [{ key: 'doors', label: 'Doors' }],
    rows: [{ key: 'distribution', label: 'Distribution' }, { key: 'install', label: 'Install' }],
  },
];

// ── Calculation table columns ───────────────────────────────────────────────
// type: 'ir' = item rate directly, 'hf' = hourly function column total
// countKey: key in aggregated counts from calcSystemMH frameResults
// mhKey: key in per-frame MH result

export const CALC_COLS_SF = [
  { key: 'joints',     label: 'Joints',      type: 'ir', countKey: 'joints',    mhKey: 'jointsMH' },
  { key: 'dist',       label: 'Dist',        type: 'ir', countKey: 'distCount', mhKey: 'distMH' },
  { key: 'subsills',   label: 'Subsills',    type: 'ir', countKey: 'subsills',  mhKey: 'subsillsMH' },
  { key: 'bays',       label: 'Bays',        type: 'hf', countKey: 'bays',     mhKey: 'baysMH' },
  { key: 'gtBays',     label: '> Bays',      type: 'hf', countKey: 'gtBays',   mhKey: 'gtBaysMH' },
  { key: 'dlos',       label: 'DLOs',        type: 'hf', countKey: 'dlos',     mhKey: 'dlosMH' },
  { key: 'gtDlos',     label: '> DLOs',      type: 'hf', countKey: 'gtDlos',   mhKey: 'gtDlosMH' },
  { key: 'doors',      label: 'Doors',       type: 'hf', countKey: 'doorTotal', mhKey: 'doorsMH' },
  { key: 'caulk',      label: 'Caulk',       type: 'ir', countKey: 'caulkLF',  mhKey: 'caulkMH', countDivisor: 20 },
  { key: 'ssg',        label: 'SSG',         type: 'ir', countKey: 'ssg',      mhKey: 'ssgMH' },
  { key: 'steel',      label: 'Steel',       type: 'ir', countKey: 'steel',    mhKey: 'steelMH' },
  { key: 'vents',      label: 'Vents',       type: 'ir', countKey: 'vents',    mhKey: 'ventsMH' },
  { key: 'brakeMetal', label: 'Brake Metal', type: 'ir', countKey: 'brakeMetal', mhKey: 'brakeMH' },
  { key: 'open',       label: 'Open',        type: 'ir', countKey: 'openItem', mhKey: 'openMH' },
];

export const CALC_COLS_CW = [
  { key: 'joints',       label: 'Joints',       type: 'ir', countKey: 'joints',      mhKey: 'jointsMH' },
  { key: 'dist',         label: 'Dist',         type: 'ir', countKey: 'distCount',   mhKey: 'distMH' },
  { key: 'stoolTrim',    label: 'Stool Trim',   type: 'ir', countKey: 'stoolTrim',   mhKey: 'stoolTrimMH' },
  { key: 'verticals',    label: 'Verticals',    type: 'hf', countKey: 'verticals',   mhKey: 'vertsMH' },
  { key: 'horizontals',  label: 'Horizontals',  type: 'hf', countKey: 'horizontals', mhKey: 'horizMH' },
  { key: 'ft',           label: 'F/T',          type: 'ir', countKey: 'ft',          mhKey: 'ftMH' },
  { key: 'dlos',         label: 'DLOs',         type: 'hf', countKey: 'dlos',        mhKey: 'dlosMH' },
  { key: 'gtDlos',       label: '> DLOs',       type: 'hf', countKey: 'gtDlos',      mhKey: 'gtDlosMH' },
  { key: 'doors',        label: 'Doors',        type: 'hf', countKey: 'doorTotal',   mhKey: 'doorsMH' },
  { key: 'caulk',        label: 'Caulk',        type: 'ir', countKey: 'caulkLF',    mhKey: 'caulkMH', countDivisor: 12 },
  { key: 'ssg',          label: 'SSG',          type: 'ir', countKey: 'ssg',         mhKey: 'ssgMH' },
  { key: 'steel',        label: 'Steel',        type: 'ir', countKey: 'steel',       mhKey: 'steelMH' },
  { key: 'vents',        label: 'Vents',        type: 'ir', countKey: 'vents',       mhKey: 'ventsMH' },
  { key: 'brakeMetal',   label: 'Brake Metal',  type: 'ir', countKey: 'brakeMetal',  mhKey: 'brakeMH' },
  { key: 'wlDl',         label: 'WL / DL',      type: 'ir', countKey: 'wlDl',       mhKey: 'wlDlMH' },
];

// ── Master system type definitions ──────────────────────────────────────────

export const SYSTEM_TYPES = {
  'Ext SF': {
    category:       'storefront',
    columnId:       'ext-sf-1',
    label:          'Exterior Storefront',
    emptyHF:        EMPTY_HF_SF,
    emptyIR:        EMPTY_IR_SF,
    excelDefaultHF: EXCEL_HF_SF,
    excelDefaultIR: EXCEL_IR_SF,
    hfRows:         HF_ROWS_SF,
    hfCols:         HF_COLS_SF,
    irRows:         IR_ROWS_SF,
    hfGroups:       HF_GROUPS_SF,
    calcCols:       CALC_COLS_SF,
  },
  'Int SF': {
    category:       'storefront',
    columnId:       'int-sf',
    label:          'Interior Storefront',
    emptyHF:        EMPTY_HF_SF,
    emptyIR:        EMPTY_IR_SF,
    excelDefaultHF: EXCEL_HF_SF,
    excelDefaultIR: EXCEL_IR_SF,
    hfRows:         HF_ROWS_SF,
    hfCols:         HF_COLS_SF,
    irRows:         IR_ROWS_SF,
    hfGroups:       HF_GROUPS_SF,
    calcCols:       CALC_COLS_SF,
  },
  'Cap CW': {
    category:       'curtainwall',
    columnId:       'cap-cw',
    label:          'Captured Curtain Wall',
    emptyHF:        EMPTY_HF_CW,
    emptyIR:        EMPTY_IR_CW,
    excelDefaultHF: EXCEL_HF_CW,
    excelDefaultIR: EXCEL_IR_CW,
    hfRows:         HF_ROWS_CW,
    hfCols:         HF_COLS_CW,
    irRows:         IR_ROWS_CW,
    hfGroups:       HF_GROUPS_CW,
    calcCols:       CALC_COLS_CW,
  },
  'SSG CW': {
    category:       'curtainwall',
    columnId:       'ssg-cw',
    label:          'SSG Curtain Wall',
    emptyHF:        EMPTY_HF_CW,
    emptyIR:        EMPTY_IR_CW,
    excelDefaultHF: EXCEL_HF_CW,
    excelDefaultIR: EXCEL_IR_CW,
    hfRows:         HF_ROWS_CW,
    hfCols:         HF_COLS_CW,
    irRows:         IR_ROWS_CW,
    hfGroups:       HF_GROUPS_CW,
    calcCols:       CALC_COLS_CW,
  },
};

export const SYSTEM_TYPE_NAMES = Object.keys(SYSTEM_TYPES);

/** Get formula category ('storefront' | 'curtainwall') for a system type name */
export function getSystemCategory(systemType) {
  return SYSTEM_TYPES[systemType]?.category || 'storefront';
}

/** Get the column config ID for systemColumns.js */
export function getColumnConfigId(systemType) {
  return SYSTEM_TYPES[systemType]?.columnId || 'ext-sf-1';
}

/** Get the full config for a system type, defaulting to Ext SF */
export function getSystemTypeConfig(systemType) {
  return SYSTEM_TYPES[systemType] || SYSTEM_TYPES['Ext SF'];
}

/** Get total hourly-function rate for a given column across all functions */
export function getHFColumnTotal(hf, colKey) {
  let total = 0;
  for (const fnName of Object.keys(hf)) {
    const fn = hf[fnName];
    if (fn && typeof fn === 'object' && typeof fn[colKey] === 'number') {
      total += fn[colKey];
    }
  }
  return total;
}
