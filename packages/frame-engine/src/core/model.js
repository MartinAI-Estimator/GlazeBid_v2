/**
 * model.js — the FrameSpec: everything an estimator (or the AI import) sets.
 *
 * FrameSpec (schema 'glazebid.frame/1')
 * {
 *   id, mark, frameSet, quantity, notes,
 *   systemId, joinery, finish,
 *   size: { mode: 'frame'|'ro', width, height, joints: { head, sill, left, right } },
 *   sillAFF,                                   // frame bottom above finished floor
 *   shape: { type, params, vertices? },        // see shapes.js
 *   columns: [{ dlo|null, locked?, kind: 'glass'|'door', sillStep?, door? }],   // left → right
 *   rows:    [{ dlo|null, locked? }],          // frame default, bottom → top
 *   bayRows: { [col]: [{ dlo|null }] },        // per-bay override
 *   extraMembers:  [{ key, orient: 'v'|'h', at, from, to, sightline? }],
 *   removedMembers: [ 'H0.1' | 'V2' | { v: 'V2', from: hKey|'BOT', to: hKey|'TOP' } ],
 *   joints: { defaultRunThrough: 'v'|'h', cornerRunThrough: 'v'|'h', overrides: { [jointKey]: 'v'|'h' } },
 *   glass:  { frameDefault: glassTypeId|null, lites: { [liteKey]: glassTypeId },
 *             temper: { [liteKey]: true|false }, hazards: { [liteKey]: ['stair'|'wet'|'other'] } },
 *   overrides: { profiles: { role: { sightline, depth } }, glassAddPerAxis, ssgAddPerEdge,
 *                stockLengthIn, dies: { role: part }, accessories: { role: part } },
 *   liftLine: null | inches AFF,               // null → inherit from frame set
 *   labor: { difficulty: 1, extra: { ssg, steel, vents, open, stoolTrim, ft, wlDl } },
 *   brakeMetal: [{ id, description, girth, length, qty, bends, hems, finish, edge? }],
 * }
 *
 * All dimensions decimal inches.
 */

import { num } from './units.js';
import { DEFAULT_SYSTEM_ID, getSystem } from './library.js';

export const SCHEMA = 'glazebid.frame/1';

let _seq = 0;
export const newId = (p = 'f') => `${p}_${Date.now().toString(36)}${(++_seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Door defaults — every door option the builder exposes. */
export function defaultDoor(kind = 'single') {
  return {
    mark: '',
    kind,                     // 'single' | 'pair'
    height: 84,               // opening height from frame bottom (in)
    stile: 'medium',          // 'narrow' | 'medium' | 'wide'
    topRail: 'standard',      // 'standard' | 'medium' | 'wide' | custom number
    bottomRail: 'standard',   // 'standard' (≈4") | '10' | custom number
    midRail: 'none',          // 'none' | 'standard' | custom AFF number
    swing: 'out',             // 'out' | 'in'
    handing: 'RH',            // single: LH | RH | LHR | RHR ; pair: active leaf below
    activeLeaf: 'right',      // pair only
    glassTypeId: null,        // null → project default
    hardwarePreset: 'std',    // see doors.js HARDWARE_PRESETS
    hardware: null,           // null → from preset; else itemized overrides
    threshold: true,
    notes: '',
  };
}

export function createFrame(over = {}) {
  const sys = getSystem(over.systemId ?? DEFAULT_SYSTEM_ID);
  return normalizeSpec({
    schema: SCHEMA,
    id: newId('frame'),
    mark: 'SF-1',
    frameSet: 'EX SF',
    quantity: 1,
    notes: '',
    systemId: sys.id,
    joinery: sys.defaultJoinery,
    finish: 'Clear Anodized',
    size: { mode: 'frame', width: 120, height: 96, joints: { head: 0.5, sill: 0.25, left: 0.25, right: 0.25 } },
    sillAFF: 0,
    shape: { type: 'rect', params: {} },
    columns: [{ dlo: null, kind: 'glass' }, { dlo: null, kind: 'glass' }, { dlo: null, kind: 'glass' }],
    rows: [{ dlo: null }],
    bayRows: {},
    extraMembers: [],
    removedMembers: [],
    joints: { defaultRunThrough: 'v', cornerRunThrough: 'v', overrides: {} },
    glass: { frameDefault: null, lites: {}, temper: {}, hazards: {} },
    overrides: {},
    liftLine: null,
    labor: { difficulty: 1, extra: {} },
    brakeMetal: [],
    ...over,
  });
}

/** Fill missing keys, coerce types.  Never throws. */
export function normalizeSpec(s = {}) {
  const sz = s.size ?? {};
  const j = sz.joints ?? {};
  const columns = Array.isArray(s.columns) && s.columns.length ? s.columns : [{ dlo: null, kind: 'glass' }];
  const rows = Array.isArray(s.rows) && s.rows.length ? s.rows : [{ dlo: null }];
  return {
    schema: SCHEMA,
    id: s.id ?? newId('frame'),
    mark: s.mark ?? '',
    frameSet: s.frameSet ?? '',
    quantity: Math.max(1, Math.round(num(s.quantity, 1))),
    notes: s.notes ?? '',
    systemId: s.systemId ?? DEFAULT_SYSTEM_ID,
    joinery: s.joinery ?? null,
    finish: s.finish ?? '',
    size: {
      mode: sz.mode === 'ro' ? 'ro' : 'frame',
      width: num(sz.width, 0), height: num(sz.height, 0),
      joints: { head: num(j.head, 0), sill: num(j.sill, 0), left: num(j.left, 0), right: num(j.right, 0) },
    },
    sillAFF: num(s.sillAFF, 0),
    shape: s.shape && s.shape.type ? s.shape : { type: 'rect', params: {} },
    columns: columns.map((c) => ({
      dlo: c.dlo === '' || c.dlo === undefined ? null : c.dlo === null ? null : num(c.dlo, null),
      locked: !!c.locked,
      kind: c.kind === 'door' ? 'door' : 'glass',
      sillStep: num(c.sillStep, 0),
      door: c.kind === 'door' ? { ...defaultDoor(c.door?.kind), ...(c.door ?? {}) } : undefined,
    })),
    rows: rows.map((r) => ({ dlo: r.dlo === '' || r.dlo === undefined || r.dlo === null ? null : num(r.dlo, null), locked: !!r.locked })),
    bayRows: s.bayRows && typeof s.bayRows === 'object' ? s.bayRows : {},
    extraMembers: Array.isArray(s.extraMembers) ? s.extraMembers : [],
    removedMembers: Array.isArray(s.removedMembers) ? s.removedMembers : [],
    joints: { defaultRunThrough: s.joints?.defaultRunThrough === 'h' ? 'h' : 'v',
      cornerRunThrough: s.joints?.cornerRunThrough === 'h' ? 'h' : 'v',
      overrides: { ...(s.joints?.overrides ?? {}) } },
    glass: { frameDefault: s.glass?.frameDefault ?? null, lites: { ...(s.glass?.lites ?? {}) },
      temper: { ...(s.glass?.temper ?? {}) }, hazards: { ...(s.glass?.hazards ?? {}) } },
    overrides: s.overrides ?? {},
    liftLine: s.liftLine === null || s.liftLine === undefined || s.liftLine === '' ? null : num(s.liftLine, null),
    labor: { difficulty: num(s.labor?.difficulty, 1), extra: { ...(s.labor?.extra ?? {}) } },
    brakeMetal: Array.isArray(s.brakeMetal) ? s.brakeMetal : [],
  };
}

/** Copy a frame as a variant: SF1 → SF1A, SF1A → SF1B. */
export function variantOf(spec, existingMarks = []) {
  const base = String(spec.mark || 'F').replace(/[A-Z]$/, (m) => (/\d[A-Z]$/.test(spec.mark) ? '' : m));
  let letter = 'A'.charCodeAt(0);
  let mark;
  do { mark = `${base}${String.fromCharCode(letter++)}`; } while (existingMarks.includes(mark) && letter <= 90);
  return normalizeSpec({ ...structuredClone(spec), id: newId('frame'), mark });
}

// ── Editing verbs (pure: spec in → spec out) ─────────────────────────────────

export const edit = {
  setBays(spec, n) {
    n = Math.max(1, Math.round(n));
    const cols = spec.columns.slice(0, n);
    while (cols.length < n) cols.push({ dlo: null, kind: 'glass' });
    return { ...spec, columns: cols };
  },
  setRows(spec, n) {
    n = Math.max(1, Math.round(n));
    const rows = spec.rows.slice(0, n);
    while (rows.length < n) rows.push({ dlo: null });
    return { ...spec, rows };
  },
  setColumnDlo(spec, c, dlo) {
    const cols = spec.columns.map((col, i) => (i === c ? { ...col, dlo } : col));
    return { ...spec, columns: cols };
  },
  setRowDlo(spec, r, dlo, col = null) {
    if (col === null) return { ...spec, rows: spec.rows.map((row, i) => (i === r ? { ...row, dlo } : row)) };
    const rows = (spec.bayRows[col] ?? spec.rows).map((row, i) => (i === r ? { ...row, dlo } : { ...row }));
    return { ...spec, bayRows: { ...spec.bayRows, [col]: rows } };
  },
  /** Split a lite: add a horizontal (or vertical) inside one bay. */
  splitBayRows(spec, col, nRows) {
    const rows = Array.from({ length: Math.max(1, nRows) }, () => ({ dlo: null }));
    return { ...spec, bayRows: { ...spec.bayRows, [col]: rows } };
  },
  resetBayRows(spec, col) {
    const b = { ...spec.bayRows }; delete b[col];
    return { ...spec, bayRows: b };
  },
  setDoor(spec, c, kind) {
    const cols = spec.columns.map((col, i) => {
      if (i !== c) return col;
      if (kind === 'none') return { ...col, kind: 'glass', door: undefined, dlo: col.dlo, locked: false };
      return { ...col, kind: 'door', door: { ...defaultDoor(kind), ...(col.door ?? {}), kind }, dlo: col.dlo ?? (kind === 'pair' ? 72 : 36), locked: true };
    });
    return { ...spec, columns: cols };
  },
  toggleJoint(spec, key, current) {
    const next = current === 'h' ? 'v' : 'h';
    return { ...spec, joints: { ...spec.joints, overrides: { ...spec.joints.overrides, [key]: next } } };
  },
  removeMember(spec, keyOrRange) {
    return { ...spec, removedMembers: [...spec.removedMembers, keyOrRange] };
  },
  restoreMembers(spec) { return { ...spec, removedMembers: [] }; },
  addExtraMember(spec, m) { return { ...spec, extraMembers: [...spec.extraMembers, { key: `X${spec.extraMembers.length + 1}`, ...m }] }; },
  setLiteGlass(spec, liteKey, glassTypeId) {
    const lites = { ...spec.glass.lites };
    if (glassTypeId == null) delete lites[liteKey]; else lites[liteKey] = glassTypeId;
    return { ...spec, glass: { ...spec.glass, lites } };
  },
  setLiteTemper(spec, liteKey, val) {
    const temper = { ...spec.glass.temper };
    if (val === null || val === undefined) delete temper[liteKey]; else temper[liteKey] = !!val;
    return { ...spec, glass: { ...spec.glass, temper } };
  },
  setLiteHazard(spec, liteKey, hazards) {
    const hz = { ...spec.glass.hazards };
    if (!hazards?.length) delete hz[liteKey]; else hz[liteKey] = hazards;
    return { ...spec, glass: { ...spec.glass, hazards: hz } };
  },
};

// ── AI import: hydrateFrame ──────────────────────────────────────────────────

/**
 * Turn the AI extraction payload (Cowork context §4) into a FrameSpec.
 *
 * Returns { spec, set: string[], needsInput: [{ field, reason }] } — null /
 * missing payload fields are reported as needing estimator input, never
 * silently defaulted.
 *
 * Payload: { mark, systemType, frameSeries, manufacturer, finish, laborType,
 *   overallWidth, overallHeight, sillAFF, panelCount, rowCount, bayWidths,
 *   rowHeights, primaryGlass, safetyFilm, specialtyGlass, brakemetal,
 *   squareCornerMullion, hasDoor, doorBays, notes, confidence, flaggedFields, frameSet?, quantity? }
 */
export function hydrateFrame(payload = {}, { systemId = null, glassTypeIdFor = null } = {}) {
  const set = []; const needsInput = [];
  const has = (v) => v !== null && v !== undefined && v !== '';
  const need = (field, reason) => needsInput.push({ field, reason });

  const fam = String(payload.systemType ?? '').toLowerCase();
  const isCW = fam.includes('curtain') || fam === 'cw' || payload.laborType === 'COMBINATION';
  const sysId = systemId ?? guessSystemId(payload, isCW);

  const bays = Math.max(1, Math.round(num(payload.panelCount, 1)));
  const rowsN = Math.max(1, Math.round(num(payload.rowCount, 1)));
  if (!has(payload.panelCount)) need('panelCount', 'Bay count not read — defaulted to 1.');
  if (!has(payload.rowCount)) need('rowCount', 'Row count not read — defaulted to 1.');

  // Bay widths: the payload gives overall bay widths (frame-edge / CL); the
  // builder works in DLO, so EQ bays are left null and solved by the engine.
  const doorBays = new Set((payload.doorBays ?? []).map((b) => Math.round(num(b, -1))));
  // doorBays are 0-based bay indices (payload schema)
  const columns = Array.from({ length: bays }, (_, i) => (doorBays.has(i)
    ? { kind: 'door', dlo: null, door: defaultDoor('single') }
    : { kind: 'glass', dlo: null }));
  if (Array.isArray(payload.bayWidths) && payload.bayWidths.length === bays) {
    set.push('bayWidths');
    // record as notes for the estimator; DLO conversion needs sightlines — mark EQ
    need('bayWidths', 'Bay widths read as drawing dimensions — confirm DLO per bay (EQ used until confirmed).');
  } else if (bays > 1) need('bayWidths', 'Bay widths not read — bays set EQ.');

  const rows = Array.from({ length: rowsN }, () => ({ dlo: null }));
  if (!Array.isArray(payload.rowHeights) || payload.rowHeights.length !== rowsN) {
    if (rowsN > 1) need('rowHeights', 'Row heights not read — rows set EQ. Enter DLO heights.');
  } else set.push('rowHeights');

  if (!has(payload.overallWidth)) need('overallWidth', 'Overall width missing.'); else set.push('overallWidth');
  if (!has(payload.overallHeight)) need('overallHeight', 'Overall height missing.'); else set.push('overallHeight');
  if (!has(payload.sillAFF)) need('sillAFF', 'Sill AFF not on drawing — enter at bid time (defaults to 0").'); else set.push('sillAFF');
  if (payload.hasDoor && !(payload.doorBays ?? []).length) need('doorBays', 'Frame has a door but no door bay was identified.');
  for (const f of payload.flaggedFields ?? []) need(f, 'Flagged low-confidence by extraction.');

  const glassId = glassTypeIdFor ? glassTypeIdFor(payload.primaryGlass) : null;
  if (has(payload.primaryGlass)) set.push('primaryGlass'); else need('primaryGlass', 'Glass type not read — project default used.');

  const spec = createFrame({
    mark: payload.mark ?? '',
    frameSet: payload.frameSet ?? (isCW ? 'EX CW' : 'EX SF'),
    quantity: num(payload.quantity, 1),
    notes: [payload.notes, payload.frameSeries ? `Series: ${payload.frameSeries}` : null,
      payload.safetyFilm ? 'Safety film (SF) required' : null,
      payload.brakemetal ? 'Brake metal shown on elevation' : null,
      payload.squareCornerMullion ? 'Square corner mullion' : null,
      Array.isArray(payload.bayWidths) ? `Drawing bay widths: ${payload.bayWidths.join(', ')}` : null,
      Array.isArray(payload.specialtyGlass) && payload.specialtyGlass.length ? `Specialty glass: ${JSON.stringify(payload.specialtyGlass)}` : null,
    ].filter(Boolean).join('\n'),
    systemId: sysId,
    finish: payload.finish ?? '',
    size: { mode: 'frame', width: num(payload.overallWidth, 0), height: num(payload.overallHeight, 0), joints: { head: 0, sill: 0, left: 0, right: 0 } },
    sillAFF: num(payload.sillAFF, 0),
    columns, rows,
    glass: { frameDefault: glassId, lites: {}, temper: {}, hazards: {} },
  });
  ['mark', 'systemType', 'finish', 'panelCount', 'rowCount'].forEach((f) => { if (has(payload[f])) set.push(f); });
  return { spec, set: [...new Set(set)], needsInput, confidence: payload.confidence ?? null };
}

function guessSystemId(p, isCW) {
  const m = String(p.manufacturer ?? '').toLowerCase();
  const series = String(p.frameSeries ?? '');
  const make = m.includes('tubelite') ? 'tubelite' : 'kawneer';
  if (isCW) return `${make}-1600-75`;
  if (/2\s*x\s*6|601/.test(series)) return /non|nt/i.test(series) ? `${make}-601` : `${make}-601t`;
  if (/1-?3\/4|450/.test(series)) return `${make}-450`;
  if (/interior|int\b/i.test(series)) return 'generic-int-sf';
  return `${make}-451t`;
}
