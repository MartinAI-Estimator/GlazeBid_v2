/**
 * doors.js — door configuration inside a frame bay.
 *
 * The door package (leaves, door framing, hardware) is QUOTED BY THE VENDOR,
 * so doors produce no metal cut-list lines except the snap-in filler at an
 * open-back door jamb (see bom.js).  What this module produces:
 *   - leaf geometry for the drawing (stiles, rails, glass)
 *   - the door schedule row
 *   - the hardware schedule (manufacturer-standard placeholders; a door
 *     schedule imported from the specs replaces them in a later phase)
 *
 * Vocabulary follows the Tubelite Entrance Builder model in vendor-portal
 * (door-model.js): stile choices, hardware packages, prep-only options.
 */

import { num, r4 } from './units.js';

export const STILES = Object.freeze({
  narrow: { label: 'Narrow stile', width: 2.125, topRail: 2.25 },
  medium: { label: 'Medium stile', width: 3.5, topRail: 3.5 },
  wide:   { label: 'Wide stile',   width: 5,   topRail: 5 },
});
export const BOTTOM_RAILS = Object.freeze({ standard: 4, '6.5': 6.5, '10': 10 });
export const CLEARANCES = Object.freeze({ side: 0.125, meeting: 0.125, top: 0.125, bottom: 0.5 });
export const DOOR_GLASS_ADD_PER_AXIS = 0.75;

/** Hardware packages → placeholder items.  frequency: per-leaf | per-opening | per-pair | per-LF */
export const HARDWARE_PRESETS = Object.freeze({
  std: { label: 'Standard storefront', items: [
    { item: 'Offset pivots (top, intermediate, bottom)', qty: 1, frequency: 'per-leaf', group: 'hanging' },
    { item: 'Deadlock (MS) w/ thumbturn', qty: 1, frequency: 'per-opening', group: 'locking' },
    { item: 'Keyed cylinder', qty: 1, frequency: 'per-opening', group: 'locking' },
    { item: 'Pull handle', qty: 1, frequency: 'per-leaf', group: 'trim' },
    { item: 'Push bar', qty: 1, frequency: 'per-leaf', group: 'trim' },
    { item: 'Closer — overhead concealed', qty: 1, frequency: 'per-leaf', group: 'control' },
    { item: 'Threshold', qty: 1, frequency: 'per-opening', group: 'seals' },
    { item: 'Door sweep', qty: 1, frequency: 'per-leaf', group: 'seals' },
    { item: 'Weatherstripping', qty: 1, frequency: 'per-opening', group: 'seals' },
  ] },
  cont: { label: 'Continuous hinge', items: [
    { item: 'Continuous hinge', qty: 1, frequency: 'per-leaf', group: 'hanging' },
    { item: 'Deadlock (MS) w/ thumbturn', qty: 1, frequency: 'per-opening', group: 'locking' },
    { item: 'Keyed cylinder', qty: 1, frequency: 'per-opening', group: 'locking' },
    { item: 'Pull handle', qty: 1, frequency: 'per-leaf', group: 'trim' },
    { item: 'Push bar', qty: 1, frequency: 'per-leaf', group: 'trim' },
    { item: 'Closer — surface applied', qty: 1, frequency: 'per-leaf', group: 'control' },
    { item: 'Threshold', qty: 1, frequency: 'per-opening', group: 'seals' },
    { item: 'Door sweep', qty: 1, frequency: 'per-leaf', group: 'seals' },
    { item: 'Weatherstripping', qty: 1, frequency: 'per-opening', group: 'seals' },
  ] },
  cvr: { label: 'Panic — concealed vertical rod (CVR)', items: [
    { item: 'Offset pivots', qty: 1, frequency: 'per-leaf', group: 'hanging' },
    { item: 'Panic device — CVR', qty: 1, frequency: 'per-leaf', group: 'locking' },
    { item: 'Keyed cylinder (dogging / outside trim)', qty: 1, frequency: 'per-leaf', group: 'locking' },
    { item: 'Pull handle', qty: 1, frequency: 'per-leaf', group: 'trim' },
    { item: 'Closer — overhead concealed', qty: 1, frequency: 'per-leaf', group: 'control' },
    { item: 'Threshold', qty: 1, frequency: 'per-opening', group: 'seals' },
    { item: 'Door sweep', qty: 1, frequency: 'per-leaf', group: 'seals' },
    { item: 'Weatherstripping', qty: 1, frequency: 'per-opening', group: 'seals' },
  ] },
  rim: { label: 'Panic — rim', items: [
    { item: 'Offset pivots', qty: 1, frequency: 'per-leaf', group: 'hanging' },
    { item: 'Panic device — rim', qty: 1, frequency: 'per-leaf', group: 'locking' },
    { item: 'Keyed cylinder', qty: 1, frequency: 'per-leaf', group: 'locking' },
    { item: 'Removable mullion (pairs)', qty: 1, frequency: 'per-pair', group: 'locking' },
    { item: 'Pull handle', qty: 1, frequency: 'per-leaf', group: 'trim' },
    { item: 'Closer — overhead concealed', qty: 1, frequency: 'per-leaf', group: 'control' },
    { item: 'Threshold', qty: 1, frequency: 'per-opening', group: 'seals' },
    { item: 'Door sweep', qty: 1, frequency: 'per-leaf', group: 'seals' },
    { item: 'Weatherstripping', qty: 1, frequency: 'per-opening', group: 'seals' },
  ] },
  blank: { label: 'No hardware — blank door & frame', items: [] },
  schedule: { label: 'Hardware by others — per project hardware schedule', items: [
    { item: 'Hinge / pivot prep', qty: 1, frequency: 'per-leaf', group: 'prep' },
    { item: 'Lock / exit device prep', qty: 1, frequency: 'per-opening', group: 'prep' },
    { item: 'Closer prep', qty: 1, frequency: 'per-leaf', group: 'prep' },
    { item: 'Strike prep', qty: 1, frequency: 'per-opening', group: 'prep' },
  ] },
});

const leafCount = (d) => (d.kind === 'pair' ? 2 : 1);

function railIn(v, table, fallback) {
  if (v === 'none' || v == null) return 0;
  if (typeof v === 'number') return v;
  if (table && table[v] != null) return table[v];
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Leaf geometry for a door in an opening.
 * @param {object} door     door spec (model.defaultDoor)
 * @param {number} openW    opening width (bay DLO)
 * @param {number} openH    opening height
 */
export function doorGeometry(door, openW, openH) {
  const n = leafCount(door);
  const st = STILES[door.stile] ?? STILES.medium;
  const leafW = (openW - 2 * CLEARANCES.side - (n - 1) * CLEARANCES.meeting) / n;
  const leafH = openH - CLEARANCES.top - CLEARANCES.bottom;
  const top = door.topRail === 'standard' ? st.topRail : railIn(door.topRail, { medium: 3.5, wide: 5 }, st.topRail);
  const bottom = railIn(door.bottomRail, BOTTOM_RAILS, 4);
  const mid = door.midRail === 'none' ? 0 : railIn(door.midRail === 'standard' ? 4 : door.midRail, null, 4);
  const dloW = leafW - 2 * st.width;
  const dloH = leafH - top - bottom - mid;
  const lites = mid > 0 ? 2 : 1;
  const midAt = mid > 0 ? 36 - CLEARANCES.bottom - mid / 2 : null;   // mid rail centered ~36" AFF
  const glassW = dloW + DOOR_GLASS_ADD_PER_AXIS;
  const glassHs = mid > 0
    ? [midAt - bottom - mid / 2, leafH - top - (midAt + mid / 2)].map((h) => h + DOOR_GLASS_ADD_PER_AXIS)
    : [dloH + DOOR_GLASS_ADD_PER_AXIS];
  return {
    leaves: n, leafW: r4(leafW), leafH: r4(leafH),
    stile: st.width, stileLabel: st.label, topRail: top, bottomRail: bottom, midRail: mid, midRailAt: midAt,
    dloW: r4(dloW), dloH: r4(dloH), litesPerLeaf: lites,
    glassW: r4(glassW), glassHs: glassHs.map(r4),
    warnings: [
      leafW < 24 ? `Leaf width ${r4(leafW)}" is under 24".` : null,
      dloW < 4 ? 'Door glass is narrower than 4" — check stile choice.' : null,
    ].filter(Boolean),
  };
}

/** Hardware lines for one door (per opening; multiply by frame qty outside). */
export function doorHardware(door) {
  const preset = HARDWARE_PRESETS[door.hardwarePreset] ?? HARDWARE_PRESETS.std;
  const n = leafCount(door);
  const base = Array.isArray(door.hardware) && door.hardware.length ? door.hardware : preset.items;
  return base
    .filter((it) => !(it.frequency === 'per-pair' && n < 2))
    .filter((it) => !(it.item === 'Threshold' && door.threshold === false))
    .map((it) => ({
      ...it,
      qtyPerOpening: num(it.qty, 1) * (it.frequency === 'per-leaf' ? n : 1),
    }));
}

/** Handing text for the schedule. */
export function handingLabel(door) {
  if (door.kind === 'pair') return `Pair — ${door.activeLeaf === 'left' ? 'LH' : 'RH'} active, ${door.swing === 'in' ? 'in-swing' : 'out-swing'}`;
  return `${door.handing ?? 'RH'} ${door.swing === 'in' ? 'in-swing' : 'out-swing'}`;
}
