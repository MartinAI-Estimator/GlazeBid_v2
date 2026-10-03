/**
 * parametricFrameMath.js — GlazeBid's single frame-geometry engine.
 *
 * One frame spec in → die-level metal cut list, per-lite glass schedule and
 * door package out.  Both the AI intake (StudioInbox) and the estimator's
 * Parametric Frame Builder save through this module, so a frame opened,
 * edited and re-saved in the Builder carries exactly the numbers a vendor RFQ
 * will show.  No pricing: material dollars come from project vendor quotes.
 *
 * ── History ──────────────────────────────────────────────────────────────────
 *  2026-09-18a  Lifted from ParametricFrameBuilder (G4) for AI intake.
 *  2026-09-18b  Die-level BOM + exact glass math.
 *  2026-09-18c  THIS VERSION — consolidation: doors, raked heads, per-bay
 *               horizontals, sill step-ups and unequal bays ported from G4,
 *               G4's save path moved onto this engine, and a payload schema
 *               that round-trips through the Builder UI.
 *
 * ── Topology: storefront, verticals continuous ───────────────────────────────
 *   Jambs and intermediate verticals run full height (to the head's long
 *   point on a raked frame).  Head, sill, intermediate horizontals and door
 *   headers are cut to the clear span between vertical faces.
 *
 * ── Coordinates ─────────────────────────────────────────────────────────────
 *   x: inches from the left outside edge.  y: inches up from the frame bottom.
 *   Per-bay horizontals keep G4's convention: each value is the BOTTOM of the
 *   horizontal member, measured up from the top of that bay's sill (sill
 *   sightline + any sill step-up).
 *
 * ── Math (inches) ───────────────────────────────────────────────────────────
 *   DLO width (equal)  = (W − 2·jambSL − (bays − 1)·mullionSL) / bays
 *   Head underside y   = h(x) − headSL / cos θ          (θ = rake angle, 0 if square)
 *   Lite height        = next member bottom − current member top
 *   Glass W            = DLO W + 2·bite  − edgeClearance
 *   Glass H            = DLO H + 2·hBite − edgeClearance
 *   Raked top edge     : bite measured square to the slope → + hBite / cos θ vertically
 *   Ordered glass      = rounded DOWN to 1/16"; exact value kept alongside.
 *   Door               : leaf opening from frame bottom to DOOR_HEIGHT; door
 *                        header above it; sill removed in that bay; transom
 *                        lite(s) between header and head.
 */

import { SYSTEM_PACKAGES, SYSTEM_GEOMETRY_CATALOG, DEFAULT_SYSTEM_ID } from '../data/systemPackages';
import { toCanonicalSystemType, tryCanonicalSystemType } from '../utils/systemTypes';
import { calcFrameMH } from '../utils/laborCalcEngine';
import useProductionRatesStore from '../store/useProductionRatesStore';

// ── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_HEAD_SIGHTLINE = 2;
export const DEFAULT_SILL_SIGHTLINE = 2;
/** Total glass edge clearance per dimension (1/8" each side). */
export const DEFAULT_EDGE_CLEARANCE = 0.25;
/** Ordered glass is rounded down to this increment (inches). */
export const GLASS_ORDER_INCREMENT = 1 / 16;
/** Standard storefront door leaf opening height, from frame bottom (inches). */
export const DOOR_HEIGHT = 84;
/** Door header face width (inches). */
export const DOOR_HEADER_SIGHTLINE = 2;
/** Nominal door opening widths, for fit warnings only. */
export const DOOR_NOMINAL_WIDTH = Object.freeze({ single: 36, pair: 72 });

export const TOPOLOGY_STOREFRONT = 'storefront_vertical_continuous';

const EPS = 1e-6;
const MIN_LITE = 0.5;      // a "lite" shorter than this is a drawing error, not glass

/** Stick roles, in the order a cut list reads. */
export const METAL_ROLES = Object.freeze({
  jamb:                    { label: 'Jamb',                              orientation: 'vertical',   order: 1 },
  intermediate_vertical:   { label: 'Intermediate Vertical',             orientation: 'vertical',   order: 2 },
  head:                    { label: 'Head',                              orientation: 'horizontal', order: 3 },
  sill:                    { label: 'Sill',                              orientation: 'horizontal', order: 4 },
  intermediate_horizontal: { label: 'Transom / Intermediate Horizontal', orientation: 'horizontal', order: 5 },
  door_header:             { label: 'Door Header',                       orientation: 'horizontal', order: 6 },
});

// ── System profiles ──────────────────────────────────────────────────────────

export const SYSTEM_TYPE_TO_PACKAGE_ID = {
  'Ext SF': 'sys_storefront',
  'Int SF': 'sys_int_sf',
  'Cap CW': 'sys_cw_cap',
  'SSG CW': 'sys_cw_ssg',
};
const PACKAGE_ID_TO_SYSTEM_TYPE = Object.fromEntries(
  Object.entries(SYSTEM_TYPE_TO_PACKAGE_ID).map(([k, v]) => [v, k]),
);

/**
 * Canonical system type for a SYSTEM_PACKAGES id ('sys_cw_cap' → 'Cap CW').
 * G4 used toCanonicalSystemType(profile.id), which does not know package ids
 * and silently returned 'Ext SF' for every curtain wall frame.
 */
export function systemTypeForPackageId(id) {
  return PACKAGE_ID_TO_SYSTEM_TYPE[id] ?? toCanonicalSystemType(id);
}

/**
 * Resolve any system-type spelling (or a package id) to its profile + catalog
 * geometry.  Unknown / missing → storefront.
 */
export function systemProfileFor(systemTypeLike) {
  const systemType = PACKAGE_ID_TO_SYSTEM_TYPE[systemTypeLike] ?? toCanonicalSystemType(systemTypeLike);
  const id = SYSTEM_TYPE_TO_PACKAGE_ID[systemType] ?? DEFAULT_SYSTEM_ID;
  const profile = SYSTEM_PACKAGES[id] ?? SYSTEM_PACKAGES[DEFAULT_SYSTEM_ID];
  const cat = SYSTEM_GEOMETRY_CATALOG[id];
  const geometry = cat
    ? { ...cat.default }
    : {
        sightline:  profile?.geometry?.verticalSightline   ?? 2,
        hSightline: profile?.geometry?.horizontalSightline ?? 2,
        bite:       profile?.geometry?.glassBite           ?? 0.375,
        hBite:      profile?.geometry?.glassBite           ?? 0.375,
      };
  return { systemType, profile, geometry };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Coerce a bay/row count to an integer ≥ 1 (null, NaN, 0, "3" → 1, 1, 1, 3). */
export function asGridCount(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const num = (v, fallback) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const r4 = (x) => Math.round(x * 10000) / 10000;

/** Round DOWN to `inc` inches, tolerant of float noise. */
export function floorTo(x, inc = GLASS_ORDER_INCREMENT) {
  return Math.floor(x / inc + 1e-9) * inc;
}

/** Round to NEAREST `inc` inches. */
export function roundTo(x, inc = GLASS_ORDER_INCREMENT) {
  return Math.round(x / inc) * inc;
}

/** Inches → reduced shop fraction:  37.3125 → `37 5/16"`,  96 → `96"`,  0.5 → `1/2"`. */
export function formatInches(x, denom = 16) {
  if (!Number.isFinite(x)) return '—';
  const neg = x < 0;
  const ticks = Math.round(Math.abs(x) * denom);
  const whole = Math.floor(ticks / denom);
  let n = ticks - whole * denom;
  let d = denom;
  while (n > 0 && n % 2 === 0 && d % 2 === 0) { n /= 2; d /= 2; }
  const body = n === 0 ? `${whole}` : whole === 0 ? `${n}/${d}` : `${whole} ${n}/${d}`;
  return `${neg ? '-' : ''}${body}"`;
}

/**
 * G4's default horizontal positions: `rows` equal panes between sill and head,
 * returned as member-bottom offsets above the sill top.
 */
export function computeDefaultHorizontals(rows, height, headSL, sillSL, mullSL) {
  if (rows <= 1) return [];
  const interiorH = height - headSL - sillSL;
  const paneH = (interiorH - (rows - 1) * mullSL) / rows;
  const edges = [];
  for (let i = 1; i < rows; i++) edges.push(i * (paneH + mullSL) - mullSL);
  return edges;
}

function normalizeDoor(door, bays) {
  const type = door?.type === 'single' || door?.type === 'pair' ? door.type : 'none';
  if (type === 'none') return null;
  const bay = Math.max(1, Math.min(bays, Math.round(num(door.bay, 1))));
  return {
    type,
    bay,
    bayIdx: bay - 1,
    leaves: type === 'pair' ? 2 : 1,
    height: num(door.height, DOOR_HEIGHT),
    headerSightline: num(door.headerSightline, DOOR_HEADER_SIGHTLINE),
  };
}

function normalizeShape(shape, H) {
  if (shape?.mode === 'raked_head') {
    const L = num(shape.leftHeight, H);
    const R = num(shape.rightHeight, H);
    if (Math.abs(L - R) > EPS) return { mode: 'raked_head', leftHeight: L, rightHeight: R };
  }
  return { mode: 'rectangular', leftHeight: H, rightHeight: H };
}

// ── Core geometry ────────────────────────────────────────────────────────────

/**
 * Lay out one frame: bays, horizontals, lites, members.
 *
 * @param {object} p
 * @param {number} p.width, p.height          overall size (height ignored when raked; legs rule)
 * @param {number} p.bays, p.rows             lites across / default lites high
 * @param {number} p.sightline                mullion face;  p.jambSightline, p.hSightline default to it
 * @param {number} [p.headSightline=2], [p.sillSightline=2]
 * @param {number} p.bite                     p.hBite defaults to it
 * @param {number} [p.edgeClearance=0.25], [p.horizontalCutDeduction=0], [p.verticalCutDeduction=0]
 * @param {object} [p.bayHorizontals]         { [bayIdx]: number[] } member-bottom offsets above sill top
 * @param {number[]} [p.bayWidths]            per-bay DLO widths; scaled to fit if they don't sum
 * @param {object} [p.sillStepUps]            { [bayIdx]: inches } raises that bay's sill
 * @param {object} [p.door]                   { type: 'none'|'single'|'pair', bay (1-based), height?, headerSightline? }
 * @param {object} [p.shape]                  { mode: 'rectangular'|'raked_head', leftHeight, rightHeight }
 */
export function computeFrameGeometry(p) {
  const W = num(p.width, 0);
  const H0 = num(p.height, 0);
  const B = asGridCount(p.bays);
  const R = asGridCount(p.rows);

  const mullionSL = num(p.sightline, 2);
  const jambSL    = num(p.jambSightline, mullionSL);
  const hSL       = num(p.hSightline, mullionSL);
  const headSL    = num(p.headSightline, DEFAULT_HEAD_SIGHTLINE);
  const sillSL    = num(p.sillSightline, DEFAULT_SILL_SIGHTLINE);
  const bite      = num(p.bite, 0.375);
  const hBite     = num(p.hBite, bite);
  const clr       = num(p.edgeClearance, DEFAULT_EDGE_CLEARANCE);
  const hDeduct   = num(p.horizontalCutDeduction, 0);
  const vDeduct   = num(p.verticalCutDeduction, 0);

  const warnings = [];
  const shape = normalizeShape(p.shape, H0);
  const isRaked = shape.mode === 'raked_head';
  const L = shape.leftHeight;
  const Rh = shape.rightHeight;
  const H = isRaked ? Math.max(L, Rh) : H0;
  const door = normalizeDoor(p.door, B);

  // Rake
  const rise = Rh - L;
  const cos = W > 0 ? W / Math.hypot(W, rise) : 1;
  const rakeAngleDeg = W > 0 ? (Math.atan2(Math.abs(rise), W) * 180) / Math.PI : 0;
  const hAt = (x) => (isRaked ? L + rise * (x / W) : H);
  const headDrop = headSL / cos;           // vertical depth of the head face
  const topBite = hBite / cos;             // vertical glass engagement into the head

  // ── Bay widths ──
  const totalDLO = W - 2 * jambSL - (B - 1) * mullionSL;
  let dloWidths = Array(B).fill(totalDLO / B);
  let unequalBays = false;
  if (Array.isArray(p.bayWidths) && p.bayWidths.length === B && p.bayWidths.every(v => num(v, 0) > 0)) {
    const given = p.bayWidths.map(Number);
    const sum = given.reduce((s, v) => s + v, 0);
    dloWidths = Math.abs(sum - totalDLO) > 1 / 32
      ? given.map(v => (v / sum) * totalDLO)
      : given;
    if (Math.abs(sum - totalDLO) > 1 / 32) {
      warnings.push(`Bay widths sum to ${r4(sum)}" but ${r4(totalDLO)}" of DLO is available — scaled proportionally.`);
    }
    unequalBays = dloWidths.some(w => Math.abs(w - dloWidths[0]) > 1 / 32);
  }
  if (!(totalDLO > 0) || dloWidths.some(w => !(w > 0))) {
    warnings.push(`DLO width is ${r4(Math.min(...dloWidths))}" — ${B} bays do not fit in ${W}" with ${mullionSL}" mullions.`);
  }

  const defaultEdges = computeDefaultHorizontals(R, H, headSL, sillSL, hSL);
  const stepUps = p.sillStepUps && typeof p.sillStepUps === 'object' ? p.sillStepUps : {};
  const customH = p.bayHorizontals && typeof p.bayHorizontals === 'object' ? p.bayHorizontals : {};

  // ── Bays → horizontals → lites ──
  const bayLayout = [];
  const panes = [];
  let x = jambSL;
  for (let b = 0; b < B; b++) {
    const dloW = dloWidths[b];
    const x0 = x;
    const x1 = x + dloW;
    x = x1 + mullionSL;

    const isDoorBay = !!door && door.bayIdx === b;
    const stepUp = isDoorBay ? 0 : Math.max(0, num(stepUps[b], 0));
    const uL = hAt(x0) - headDrop;            // head underside at the bay's left face
    const uR = hAt(x1) - headDrop;
    const uMin = Math.min(uL, uR);

    const sillTop = sillSL + stepUp;         // G4 offset base for this bay
    const custom = Array.isArray(customH[b]) ? customH[b] : null;
    const offsets = (custom ?? defaultEdges).map(Number).filter(Number.isFinite).sort((a, c) => a - c);

    let zoneBottom;
    let headerTop = null;
    if (isDoorBay) {
      headerTop = door.height + door.headerSightline;
      zoneBottom = headerTop;
      if (headerTop > uMin + EPS) {
        warnings.push(`Bay ${b + 1}: door (${door.height}") + header (${door.headerSightline}") is taller than the frame allows under the head (${r4(uMin)}").`);
      }
    } else {
      zoneBottom = sillTop;
    }

    // Horizontal members that actually fit in this bay's glass zone.
    const members = [];
    let cursor = zoneBottom;
    for (const off of offsets) {
      const bottom = sillTop + off;
      const top = bottom + hSL;
      if (isDoorBay && bottom <= headerTop + 0.5) continue;            // at/below the door header (G4 stores the header itself as an edge)
      if (bottom < cursor + MIN_LITE - EPS || top > uMin - MIN_LITE + EPS) {
        warnings.push(`Bay ${b + 1}: horizontal at ${r4(off)}" above sill does not fit — ignored.`);
        continue;
      }
      members.push({ bottom, top });
      cursor = top;
    }

    // Lites between members.
    const zones = [];
    let y = zoneBottom;
    for (const m of members) { zones.push({ y0: y, y1: m.bottom, top: false }); y = m.top; }
    zones.push({ y0: y, y1: null, top: true });

    const liteType = isDoorBay ? 'transom' : 'vision';
    zones.forEach((z, zi) => {
      const rakedTop = z.top && isRaked;
      const hLeft  = (z.top ? uL : z.y1) - z.y0;
      const hRight = (z.top ? uR : z.y1) - z.y0;
      if (Math.min(hLeft, hRight) < MIN_LITE) {
        if (!(isDoorBay && z.top && members.length === 0)) {
          warnings.push(`Bay ${b + 1}: a ${r4(Math.min(hLeft, hRight))}" lite was dropped (too short).`);
        }
        return;
      }
      const topGlassBite = rakedTop ? topBite : hBite;
      const gW = dloW + 2 * bite - clr;
      const gHL = hLeft  + hBite + topGlassBite - clr;
      const gHR = hRight + hBite + topGlassBite - clr;
      panes.push({
        bay: b + 1,
        row: zi + 1,
        liteType,
        shape: rakedTop ? 'raked' : 'rect',
        dloWidth: dloW,
        dloHeightLeft: hLeft,
        dloHeightRight: hRight,
        bottomY: z.y0,
        glassExactWidth: gW,
        glassExactHeightLeft: gHL,
        glassExactHeightRight: gHR,
        glassWidth: floorTo(gW),
        glassHeightLeft: floorTo(gHL),
        glassHeightRight: floorTo(gHR),
      });
    });

    bayLayout.push({
      bay: b + 1, x0, x1, dloWidth: dloW, isDoorBay, stepUp,
      headUndersideLeft: uL, headUndersideRight: uR,
      doorHeaderTop: headerTop,
      horizontals: members,
    });
  }

  // ── Members (pieces) ──
  const pieces = [];
  const rakeNote = isRaked ? `Top cut to ${rakeAngleDeg.toFixed(1)}° rake — length is long point` : null;
  const vLen = (xa, xb) => Math.max(hAt(xa), hAt(xb)) - vDeduct;
  pieces.push({ role: 'jamb', length: vLen(0, jambSL),
    note: isRaked ? `Left jamb · ${rakeNote}` : 'Full height, continuous — head to sill' });
  pieces.push({ role: 'jamb', length: vLen(W - jambSL, W),
    note: isRaked ? `Right jamb · ${rakeNote}` : 'Full height, continuous — head to sill' });
  for (let b = 0; b < B - 1; b++) {
    const xa = bayLayout[b].x1;
    pieces.push({ role: 'intermediate_vertical', length: vLen(xa, xa + mullionSL),
      note: isRaked ? rakeNote : 'Full height, continuous — head to sill' });
  }
  for (const bl of bayLayout) {
    pieces.push({ role: 'head', length: bl.dloWidth / cos - hDeduct,
      note: isRaked ? `Along rake, both ends cut ${rakeAngleDeg.toFixed(1)}°` : 'Cut between vertical faces (DLO width)' });
    if (!bl.isDoorBay) {
      pieces.push({ role: 'sill', length: bl.dloWidth - hDeduct,
        note: bl.stepUp > 0 ? `Stepped up +${r4(bl.stepUp)}" — infill below by others` : 'Cut between vertical faces (DLO width)' });
    }
    for (let i = 0; i < bl.horizontals.length; i++) {
      pieces.push({ role: 'intermediate_horizontal', length: bl.dloWidth - hDeduct,
        note: bl.isDoorBay ? 'Transom horizontal above door header' : 'Cut between vertical faces' });
    }
    if (bl.isDoorBay) {
      pieces.push({ role: 'door_header', length: bl.dloWidth - hDeduct,
        note: `At ${door.height}" from frame bottom · sill removed in this bay` });
    }
  }

  // ── Door fit ──
  if (door) {
    const open = bayLayout[door.bayIdx].dloWidth;
    const nominal = DOOR_NOMINAL_WIDTH[door.type];
    if (open < nominal - 0.5) {
      warnings.push(`Bay ${door.bay}: door opening is ${r4(open)}" — narrower than a nominal ${door.type} (${nominal}").`);
    }
  }

  // ── Typical values (first vision lite) for summaries / legacy fields ──
  const typ = panes.find(pn => pn.liteType === 'vision' && pn.shape === 'rect')
    ?? panes.find(pn => pn.liteType === 'vision') ?? panes[0] ?? null;

  return {
    topology: TOPOLOGY_STOREFRONT,
    width: W, height: H, bays: B, rows: R,
    shape: { ...shape, rakeAngleDeg: r4(rakeAngleDeg) },
    door,
    unequalBays,
    sightlines: { jamb: jambSL, mullion: mullionSL, head: headSL, sill: sillSL, horizontal: hSL },
    bite, hBite, edgeClearance: clr,
    horizontalCutDeduction: hDeduct,
    verticalCutDeduction: vDeduct,
    totalVerticalSightlines: 2 * jambSL + (B - 1) * mullionSL,
    totalHorizontalSightlines: headSL + sillSL + (R - 1) * hSL,
    bayLayout,
    panes,
    pieces,
    // typical / legacy
    dloWidth: typ ? typ.dloWidth : dloWidths[0],
    dloHeight: typ ? Math.min(typ.dloHeightLeft, typ.dloHeightRight) : 0,
    glassExactWidth: typ ? typ.glassExactWidth : 0,
    glassExactHeight: typ ? Math.max(typ.glassExactHeightLeft, typ.glassExactHeightRight) : 0,
    glassWidth: typ ? typ.glassWidth : 0,
    glassHeight: typ ? Math.max(typ.glassHeightLeft, typ.glassHeightRight) : 0,
    verticalLength: H - vDeduct,
    horizontalLength: dloWidths[0] - hDeduct,
    liteCount: panes.length,
    visionLiteCount: panes.filter(pn => pn.liteType === 'vision').length,
    transomLiteCount: panes.filter(pn => pn.liteType === 'transom').length,
    perimeterLF: (2 * (W + H)) / 12,
    warnings,
  };
}

// ── Grouping into RFQ lines ──────────────────────────────────────────────────

/** Group the frame's pieces into die-level cut-list lines (per frame). */
export function buildMetalCutList(geo) {
  const groups = new Map();
  for (const pc of geo.pieces) {
    if (!(pc.length > 0)) continue;
    const key = `${pc.role}::${Math.round(pc.length * 32)}::${pc.note}`;
    const g = groups.get(key) ?? { role: pc.role, length: pc.length, note: pc.note, qty: 0 };
    g.qty += 1;
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => METAL_ROLES[a.role].order - METAL_ROLES[b.role].order || b.length - a.length)
    .map(g => ({
      role:          g.role,
      roleLabel:     METAL_ROLES[g.role].label,
      orientation:   METAL_ROLES[g.role].orientation,
      qtyPerFrame:   g.qty,
      lengthInches:  r4(g.length),
      lengthDisplay: formatInches(g.length),
      lfPerFrame:    r4((g.qty * g.length) / 12),
      note:          g.note,
    }));
}

/** Group the frame's lites into glass schedule lines (per frame). */
export function buildGlassSchedule(geo, { glassType = 'Unspecified' } = {}) {
  const groups = new Map();
  for (const pn of geo.panes) {
    if (!(pn.glassWidth > 0) || !(Math.min(pn.glassHeightLeft, pn.glassHeightRight) > 0)) continue;
    const key = [pn.liteType, pn.shape, pn.glassWidth, pn.glassHeightLeft, pn.glassHeightRight].join('::');
    const g = groups.get(key) ?? { pn, locations: [], qty: 0 };
    g.qty += 1;
    g.locations.push(`B${pn.bay}R${pn.row}`);
    groups.set(key, g);
  }
  const totalLites = geo.panes.length;
  return [...groups.values()]
    .sort((a, b) => (a.pn.liteType === b.pn.liteType ? 0 : a.pn.liteType === 'vision' ? -1 : 1)
      || (b.pn.glassWidth * Math.max(b.pn.glassHeightLeft, b.pn.glassHeightRight))
       - (a.pn.glassWidth * Math.max(a.pn.glassHeightLeft, a.pn.glassHeightRight)))
    .map(({ pn, locations, qty }) => {
      const raked = pn.shape === 'raked';
      const hMax = Math.max(pn.glassHeightLeft, pn.glassHeightRight);
      const sqFtEach = (pn.glassWidth * hMax) / 144;             // billed on the bounding rectangle
      const line = {
        liteType:          pn.liteType,
        shape:             pn.shape,
        location:          qty === totalLites ? `All ${qty} lites` : locations.join(', '),
        glassType,
        qtyPerFrame:       qty,
        widthInches:       r4(pn.glassWidth),
        heightInches:      r4(hMax),
        widthDisplay:      formatInches(pn.glassWidth),
        heightDisplay:     formatInches(hMax),
        exactWidthInches:  r4(pn.glassExactWidth),
        exactHeightInches: r4(Math.max(pn.glassExactHeightLeft, pn.glassExactHeightRight)),
        dloWidthInches:    r4(pn.dloWidth),
        dloHeightInches:   r4(Math.max(pn.dloHeightLeft, pn.dloHeightRight)),
        bite:              geo.bite,
        hBite:             geo.hBite,
        edgeClearance:     geo.edgeClearance,
        sqFtEach:          r4(sqFtEach),
        sqFtPerFrame:      r4(sqFtEach * qty),
      };
      if (raked) {
        Object.assign(line, {
          heightLeftInches:   r4(pn.glassHeightLeft),
          heightRightInches:  r4(pn.glassHeightRight),
          heightLeftDisplay:  formatInches(pn.glassHeightLeft),
          heightRightDisplay: formatInches(pn.glassHeightRight),
          rakeAngleDeg:       geo.shape.rakeAngleDeg,
          note:               'Trapezoid — quote on bounding rectangle; left/right heights given',
        });
      }
      return line;
    });
}

/** Door package lines (per frame). */
export function buildDoorSchedule(geo) {
  if (!geo.door) return [];
  const bl = geo.bayLayout[geo.door.bayIdx];
  return [{
    type:                geo.door.type,
    leaves:              geo.door.leaves,
    bay:                 geo.door.bay,
    openingWidthInches:  r4(bl.dloWidth),
    openingHeightInches: geo.door.height,
    openingWidthDisplay: formatInches(bl.dloWidth),
    openingHeightDisplay: formatInches(geo.door.height),
    qtyPerFrame:         1,
    hasTransom:          geo.panes.some(pn => pn.bay === geo.door.bay),
    note: geo.door.type === 'pair'
      ? 'Pair: 2 leaves, 3-pt lock, closers, threshold'
      : 'Single: leaf, latch set, closer, threshold',
  }];
}

// ── Frame BOM ────────────────────────────────────────────────────────────────

/**
 * The RFQ-ready BOM for one frame × quantity.
 *
 * Spec: { widthInches, heightInches, systemType, bays, rows, quantity?, elevationTag?,
 *         glassType?, geometryOverride?, headSightline?, sillSightline?, edgeClearance?,
 *         horizontalCutDeduction?, verticalCutDeduction?,
 *         door?, shape?, bayHorizontals?, bayWidths?, sillStepUps? }
 *
 * @returns {{ frame, dlo, metal, glass, doors, totals, geometry, warnings }}
 */
export function buildFrameBOM(spec) {
  const qty = Math.max(1, Math.round(Number(spec.quantity) || 1));
  const sys = systemProfileFor(spec.systemType);
  // Only finite override values replace catalog geometry (a missing key must
  // not blank out the catalog value).
  const override = Object.fromEntries(
    Object.entries(spec.geometryOverride || {}).filter(([, v]) => v !== null && v !== '' && Number.isFinite(Number(v))),
  );
  const g = { ...sys.geometry, ...override };
  const glassType = spec.glassType ?? 'Unspecified';

  const geo = computeFrameGeometry({
    width: spec.widthInches, height: spec.heightInches,
    bays: spec.bays, rows: spec.rows,
    sightline: g.sightline, jambSightline: g.jambSightline, hSightline: g.hSightline,
    headSightline: spec.headSightline, sillSightline: spec.sillSightline,
    bite: g.bite, hBite: g.hBite,
    edgeClearance: spec.edgeClearance,
    horizontalCutDeduction: spec.horizontalCutDeduction,
    verticalCutDeduction: spec.verticalCutDeduction,
    door: spec.door, shape: spec.shape,
    bayHorizontals: spec.bayHorizontals, bayWidths: spec.bayWidths, sillStepUps: spec.sillStepUps,
  });

  const metal = buildMetalCutList(geo).map((m, i) => ({
    lineId: `M${i + 1}`, ...m, qty: m.qtyPerFrame * qty, totalLF: r4(m.lfPerFrame * qty),
  }));
  const glass = buildGlassSchedule(geo, { glassType }).map((l, i) => ({
    lineId: `G${i + 1}`, ...l, qty: l.qtyPerFrame * qty, totalSqFt: r4(l.sqFtPerFrame * qty),
  }));
  const doors = buildDoorSchedule(geo).map((d, i) => ({
    lineId: `D${i + 1}`, ...d, qty: d.qtyPerFrame * qty,
  }));

  return {
    frame: {
      systemType:    sys.systemType,
      systemName:    sys.profile?.name ?? 'Storefront',
      systemId:      sys.profile?.id ?? DEFAULT_SYSTEM_ID,
      topology:      geo.topology,
      widthInches:   geo.width,
      heightInches:  geo.height,
      widthDisplay:  formatInches(geo.width),
      heightDisplay: formatInches(geo.height),
      bays:          geo.bays,
      rows:          geo.rows,
      shape:         geo.shape.mode,
      leftHeightInches:  geo.shape.leftHeight,
      rightHeightInches: geo.shape.rightHeight,
      door:          geo.door ? { type: geo.door.type, bay: geo.door.bay } : null,
      quantity:      qty,
      elevationTag:  spec.elevationTag ?? null,
    },
    dlo: {
      widthInches:   r4(geo.dloWidth),
      heightInches:  r4(geo.dloHeight),
      widthDisplay:  formatInches(geo.dloWidth),
      heightDisplay: formatInches(geo.dloHeight),
      unequalBays:   geo.unequalBays,
      perBay:        geo.bayLayout.map(bl => ({ bay: bl.bay, widthInches: r4(bl.dloWidth) })),
    },
    metal,
    glass,
    doors,
    totals: {
      metalPieces: metal.reduce((s, m) => s + m.qty, 0),
      metalLF:     r4(metal.reduce((s, m) => s + m.totalLF, 0)),
      liteCount:   glass.reduce((s, l) => s + l.qty, 0),
      glassSqFt:   r4(glass.reduce((s, l) => s + l.totalSqFt, 0)),
      doorLeaves:  doors.reduce((s, d) => s + d.leaves * d.qty, 0),
    },
    geometry: geo,
    warnings: geo.warnings,
  };
}

// ── Project-level RFQ ────────────────────────────────────────────────────────

/**
 * Merge many saved frames into vendor RFQ line items.  Uses each frame's
 * PER-FRAME quantities × its CURRENT quantity, so frames bumped by
 * useBidStore.incrementFrameQuantity stay correct.  Frames with no rfq block
 * (legacy saves) are listed in `skipped`, never guessed at.
 */
export function aggregateRfq(frames) {
  const metal = new Map();
  const glass = new Map();
  const doors = new Map();
  const skipped = [];

  for (const f of frames || []) {
    const rfq = f?.bom?.rfq;
    if (!rfq) { skipped.push(f?.elevationTag ?? f?.frameId ?? '?'); continue; }
    const q = Math.max(1, Math.round(Number(f.quantity ?? rfq.frame?.quantity ?? 1) || 1));
    const tag = f.elevationTag ?? rfq.frame?.elevationTag ?? '';
    const sysName = rfq.frame?.systemName ?? f.systemType ?? 'Unspecified';
    const addTag = (row) => { if (tag && !row.elevationTags.includes(tag)) row.elevationTags.push(tag); };

    for (const m of rfq.metal || []) {
      const key = `${sysName}::${m.role}::${Math.round(m.lengthInches * 32)}`;
      const row = metal.get(key) ?? {
        key, systemName: sysName, systemType: rfq.frame?.systemType ?? f.systemType,
        role: m.role, roleLabel: m.roleLabel, orientation: m.orientation,
        lengthInches: m.lengthInches, lengthDisplay: m.lengthDisplay,
        qty: 0, totalLF: 0, elevationTags: [],
      };
      row.qty += m.qtyPerFrame * q;
      row.totalLF = r4(row.totalLF + (m.qtyPerFrame * q * m.lengthInches) / 12);
      addTag(row);
      metal.set(key, row);
    }
    for (const l of rfq.glass || []) {
      const key = `${l.glassType}::${l.shape ?? 'rect'}::${l.widthInches}x${l.heightInches}::${l.heightLeftInches ?? ''}::${l.heightRightInches ?? ''}`;
      const row = glass.get(key) ?? {
        key, glassType: l.glassType, liteType: l.liteType, shape: l.shape ?? 'rect',
        widthInches: l.widthInches, heightInches: l.heightInches,
        widthDisplay: l.widthDisplay, heightDisplay: l.heightDisplay,
        heightLeftInches: l.heightLeftInches, heightRightInches: l.heightRightInches,
        sqFtEach: l.sqFtEach, qty: 0, totalSqFt: 0, elevationTags: [],
      };
      row.qty += l.qtyPerFrame * q;
      row.totalSqFt = r4(row.totalSqFt + l.sqFtEach * l.qtyPerFrame * q);
      addTag(row);
      glass.set(key, row);
    }
    for (const d of rfq.doors || []) {
      const key = `${sysName}::${d.type}::${Math.round(d.openingWidthInches * 32)}x${Math.round(d.openingHeightInches * 32)}`;
      const row = doors.get(key) ?? {
        key, systemName: sysName, type: d.type, leaves: d.leaves,
        openingWidthInches: d.openingWidthInches, openingHeightInches: d.openingHeightInches,
        openingWidthDisplay: d.openingWidthDisplay, openingHeightDisplay: d.openingHeightDisplay,
        qty: 0, elevationTags: [],
      };
      row.qty += d.qtyPerFrame * q;
      addTag(row);
      doors.set(key, row);
    }
  }

  const metalRows = [...metal.values()].sort((a, b) =>
    a.systemName.localeCompare(b.systemName)
    || METAL_ROLES[a.role].order - METAL_ROLES[b.role].order
    || b.lengthInches - a.lengthInches);
  const glassRows = [...glass.values()].sort((a, b) =>
    a.glassType.localeCompare(b.glassType)
    || (b.widthInches * b.heightInches) - (a.widthInches * a.heightInches));
  const doorRows = [...doors.values()];
  metalRows.forEach((r, i) => { r.lineId = `M${i + 1}`; });
  glassRows.forEach((r, i) => { r.lineId = `G${i + 1}`; });
  doorRows.forEach((r, i) => { r.lineId = `D${i + 1}`; });

  return {
    metal: metalRows,
    glass: glassRows,
    doors: doorRows,
    totals: {
      metalPieces: metalRows.reduce((s, r) => s + r.qty, 0),
      metalLF:     r4(metalRows.reduce((s, r) => s + r.totalLF, 0)),
      liteCount:   glassRows.reduce((s, r) => s + r.qty, 0),
      glassSqFt:   r4(glassRows.reduce((s, r) => s + r.totalSqFt, 0)),
      doorLeaves:  doorRows.reduce((s, r) => s + r.leaves * r.qty, 0),
    },
    skipped,
  };
}

// ── Labor ────────────────────────────────────────────────────────────────────

/**
 * Labor hours for ONE frame through laborCalcEngine (Excel parity).
 * `rates` may be injected for tests; default reads the production-rates store.
 */
export function frameLaborHours(geo, systemType, rates = null) {
  const laborSysType = toCanonicalSystemType(systemType);
  const r = rates ?? useProductionRatesStore.getState();
  const mh = calcFrameMH(
    {
      quantity:  1,
      bays:      geo.bays,
      rows:      geo.rows,
      panels:    geo.liteCount,
      pairs:     geo.door?.type === 'pair' ? 1 : 0,
      singles:   geo.door?.type === 'single' ? 1 : 0,
      perimeter: geo.perimeterLF,
    },
    r.getHourlyFunctions(laborSysType),
    r.getItemRates(laborSysType),
    r.beadsOfCaulk ?? 2,
    laborSysType,
  );
  return {
    shopHours:  mh.shopMH         ?? 0,
    distHours:  mh.distributionMH ?? 0,
    fieldHours: mh.fieldMH        ?? 0,
    laborSysType,
  };
}

// ── Bid-cart payload (the schema both StudioInbox and the Builder save) ──────

/**
 * Build the bid-cart frame payload from a frame spec.
 *
 * `inputs` holds EVERYTHING the Parametric Frame Builder needs to reopen the
 * frame exactly (frameSpecFromPayload / builderStateFromFrame read it back);
 * `bom` keeps the legacy fields existing screens read and adds `bom.rfq`.
 *
 * @param {object} spec   see buildFrameBOM
 * @param {object} [meta] { frameId, elevationTag, source, sourceSystemId, takeoffIds, ai,
 *                          systemLabel, preset, isOverride }
 * @param {object} [rates] injected labor rates (tests)
 */
export function buildFramePayload(spec, meta = {}, rates = null) {
  const rfq = buildFrameBOM(spec);
  const geo = rfq.geometry;
  const quantity = rfq.frame.quantity;
  const labor = frameLaborHours(geo, rfq.frame.systemType, rates);
  const vision = rfq.glass.find(l => l.liteType === 'vision') ?? rfq.glass[0] ?? null;
  const transom = rfq.glass.find(l => l.liteType === 'transom') ?? null;
  const doorLine = rfq.doors[0] ?? null;
  const W = geo.width;
  const H = geo.height;
  const elevationTag = meta.elevationTag || spec.elevationTag || `${Number(W).toFixed(0)}"x${Number(H).toFixed(0)}"`;

  const { geometry: _geo, ...rfqStored } = rfq;
  rfqStored.frame = { ...rfqStored.frame, elevationTag };

  return {
    frameId: meta.frameId ?? `frame_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    elevationTag,
    systemType: rfq.frame.systemType,                 // canonical — always
    quantity,
    source: meta.source ?? 'builder',
    sourceSystemId: meta.sourceSystemId ?? null,
    takeoffIds: Array.isArray(meta.takeoffIds) ? meta.takeoffIds : [],
    ...(meta.ai ? { ai: meta.ai } : {}),
    inputs: {
      width:            W,
      height:           H,
      bays:             geo.bays,
      rows:             geo.rows,
      glassBite:        geo.bite,
      mullionSightline: geo.sightlines.mullion,
      headSightline:    geo.sightlines.head,
      sillSightline:    geo.sightlines.sill,
      edgeClearance:    geo.edgeClearance,
      systemName:       rfq.frame.systemName,
      systemId:         rfq.frame.systemId,
      systemLabel:      meta.systemLabel ?? rfq.frame.systemName,
      glassType:        spec.glassType ?? 'Unspecified',
      topology:         geo.topology,
      shapeMode:        geo.shape.mode,
      leftLegHeight:    geo.shape.leftHeight,
      rightLegHeight:   geo.shape.rightHeight,
      door:             geo.door ? { type: geo.door.type, bay: geo.door.bay } : { type: 'none', bay: 1 },
      bayHorizontals:   spec.bayHorizontals && Object.keys(spec.bayHorizontals).length ? spec.bayHorizontals : {},
      sillStepUps:      spec.sillStepUps && Object.keys(spec.sillStepUps).length ? spec.sillStepUps : {},
      bayWidths:        Array.isArray(spec.bayWidths) && spec.bayWidths.length === geo.bays ? spec.bayWidths : null,
      geometry: {
        sightline:     geo.sightlines.mullion,
        jambSightline: geo.sightlines.jamb,
        hSightline:    geo.sightlines.horizontal,
        bite:          geo.bite,
        hBite:         geo.hBite,
        preset:        meta.preset ?? '__default__',
        isOverride:    !!meta.isOverride,
      },
    },
    bom: {
      quantity,
      totalAluminumLF: +rfq.totals.metalLF.toFixed(2),
      totalGlassSqFt:  +rfq.totals.glassSqFt.toFixed(2),
      glassLitesCount: rfq.totals.liteCount,
      shopHours:       +(labor.shopHours  * quantity).toFixed(2),
      distHours:       +(labor.distHours  * quantity).toFixed(2),
      fieldHours:      +(labor.fieldHours * quantity).toFixed(2),
      totalLaborHours: +((labor.shopHours + labor.distHours + labor.fieldHours) * quantity).toFixed(2),
      laborEngine:     'laborCalcEngine',
      // Legacy {part, qty, lengthInches, note} — die-level; qty is TOTAL so
      // useBidStore.incrementFrameQuantity can scale it.
      cutList: rfq.metal.map(m => ({
        part: m.roleLabel, role: m.role, qty: m.qty, qtyPerFrame: m.qtyPerFrame,
        lengthInches: m.lengthInches, lengthDisplay: m.lengthDisplay, note: m.note,
      })),
      glassSizes: vision
        ? { glassType: vision.glassType, widthInches: vision.widthInches, heightInches: vision.heightInches, qty: vision.qty }
        : { glassType: spec.glassType ?? 'Unspecified', widthInches: 0, heightInches: 0, qty: 0 },
      ...(transom ? {
        transomGlass: {
          glassType: transom.glassType, widthInches: transom.widthInches, heightInches: transom.heightInches,
          qty: transom.qty, note: `Transom above door — Bay ${geo.door?.bay}`,
        },
      } : {}),
      door: doorLine ? {
        type: doorLine.type, bay: doorLine.bay, heightIn: doorLine.openingHeightInches,
        widthIn: doorLine.openingWidthInches, leaves: doorLine.leaves, hasTransom: doorLine.hasTransom,
      } : null,
      rfq: rfqStored,
      warnings: rfq.warnings,
      _detail: {
        dloWidth:                  rfq.dlo.widthInches,
        dloHeight:                 rfq.dlo.heightInches,
        glassExactWidth:           r4(geo.glassExactWidth),
        glassExactHeight:          r4(geo.glassExactHeight),
        sqFtPerLite:               vision ? vision.sqFtEach : 0,
        totalVerticalSightlines:   geo.totalVerticalSightlines,
        totalHorizontalSightlines: geo.totalHorizontalSightlines,
        verticalsCount:            geo.bays + 1,
        horizontalLinesCount:      geo.rows + 1,
        systemName:                rfq.frame.systemName,
        mullionSightline:          geo.sightlines.mullion,
        glassBite:                 geo.bite,
        edgeClearance:             geo.edgeClearance,
        topology:                  geo.topology,
      },
    },
  };
}

/**
 * Saved payload → engine spec.  Tolerates legacy G4 saves (no door object,
 * no bayHorizontals, free-text systemType) so old frames also reopen.
 */
export function frameSpecFromPayload(frame) {
  const i = frame?.inputs ?? {};
  const legacyDoor = frame?.bom?.door;
  const door = i.door ?? (legacyDoor ? { type: legacyDoor.type, bay: legacyDoor.bay } : { type: 'none', bay: 1 });
  const systemType = tryCanonicalSystemType(frame?.systemType)
    ?? (i.systemId ? systemTypeForPackageId(i.systemId) : null)
    ?? tryCanonicalSystemType(i.systemName)
    ?? 'Ext SF';
  const g = i.geometry ?? {};
  return {
    widthInches:   num(i.width, 0),
    heightInches:  num(i.height, 0),
    systemType,
    bays:          asGridCount(i.bays),
    rows:          asGridCount(i.rows),
    quantity:      Math.max(1, Math.round(num(frame?.quantity, 1))),
    elevationTag:  frame?.elevationTag ?? null,
    glassType:     i.glassType ?? frame?.bom?.glassSizes?.glassType ?? 'Unspecified',
    geometryOverride: {
      sightline:     num(g.sightline, num(i.mullionSightline, undefined)),
      jambSightline: num(g.jambSightline, undefined),
      hSightline:    num(g.hSightline, undefined),
      bite:          num(g.bite, num(i.glassBite, undefined)),
      hBite:         num(g.hBite, undefined),
    },
    headSightline: num(i.headSightline, DEFAULT_HEAD_SIGHTLINE),
    sillSightline: num(i.sillSightline, DEFAULT_SILL_SIGHTLINE),
    edgeClearance: num(i.edgeClearance, DEFAULT_EDGE_CLEARANCE),
    door,
    shape: {
      mode: i.shapeMode === 'raked_head' ? 'raked_head' : 'rectangular',
      leftHeight: num(i.leftLegHeight, num(i.height, 0)),
      rightHeight: num(i.rightLegHeight, num(i.height, 0)),
    },
    bayHorizontals: i.bayHorizontals ?? {},
    sillStepUps:    i.sillStepUps ?? {},
    bayWidths:      Array.isArray(i.bayWidths) ? i.bayWidths : undefined,
  };
}

/**
 * Saved payload → the Parametric Frame Builder's initial UI state.
 * Every key maps 1:1 to a useState in ParametricFrameBuilder.
 */
export function builderStateFromFrame(frame) {
  const s = frameSpecFromPayload(frame);
  const i = frame?.inputs ?? {};
  const sys = systemProfileFor(s.systemType);
  const cat = { ...sys.geometry };
  const g = i.geometry ?? {};
  return {
    frameId:        frame?.frameId ?? null,
    width:          s.widthInches,
    height:         s.heightInches,
    bays:           s.bays,
    rows:           s.rows,
    quantity:       s.quantity,
    elevationTag:   s.elevationTag ?? 'Elev-A',
    systemLabel:    i.systemLabel ?? (tryCanonicalSystemType(frame?.systemType) ? sys.profile?.name : frame?.systemType) ?? sys.profile?.name,
    glassType:      s.glassType,
    headSightline:  s.headSightline,
    sillSightline:  s.sillSightline,
    doorType:       s.door?.type ?? 'none',
    doorBay:        Math.max(1, Math.round(num(s.door?.bay, 1))),
    shapeMode:      s.shape.mode,
    leftLegHeight:  s.shape.leftHeight,
    rightLegHeight: s.shape.rightHeight,
    sillStepUps:    { ...(s.sillStepUps || {}) },
    bayHorizontals: { ...(s.bayHorizontals || {}) },
    bayWidths:      s.bayWidths ?? [],
    systemProfile:  sys.profile,
    geometry: {
      sightline:  num(g.sightline,  num(i.mullionSightline, cat.sightline)),
      hSightline: num(g.hSightline, cat.hSightline),
      bite:       num(g.bite,       num(i.glassBite, cat.bite)),
      hBite:      num(g.hBite,      cat.hBite),
    },
    preset:     g.preset ?? '__default__',
    isOverride: !!g.isOverride,
    source:          frame?.source ?? 'builder',
    sourceSystemId:  frame?.sourceSystemId ?? null,
    takeoffIds:      frame?.takeoffIds ?? [],
    ai:              frame?.ai ?? null,
  };
}

// ── AI / Studio intake ───────────────────────────────────────────────────────

/**
 * Build a bid-cart payload from what a takeoff knows.  Same schema the
 * Builder saves, so the frame opens in the Builder unchanged.
 *
 * @param {object} t   { widthInches, heightInches, systemType?, bayCount?, rowCount?,
 *                       quantity?, elevationTag?, glassType?, mark?, gridSource?,
 *                       confidence?, sourceSystemId?, takeoffIds? }
 * @param {object} [opts] { frameId?, rates?, edgeClearance?, headSightline?, sillSightline?,
 *                          horizontalCutDeduction?, verticalCutDeduction?, geometryOverride? }
 */
export function buildFrameFromTakeoff(t, opts = {}) {
  const width = Number(t.widthInches) || 0;
  const height = Number(t.heightInches) || 0;
  const bays = asGridCount(t.bayCount);
  const rows = asGridCount(t.rowCount);
  return buildFramePayload(
    {
      widthInches: width, heightInches: height,
      systemType: t.systemType, bays, rows, quantity: t.quantity,
      elevationTag: t.elevationTag || t.mark || null,
      glassType: t.glassType ?? 'Unspecified',
      geometryOverride: opts.geometryOverride,
      headSightline: opts.headSightline,
      sillSightline: opts.sillSightline,
      edgeClearance: opts.edgeClearance,
      horizontalCutDeduction: opts.horizontalCutDeduction,
      verticalCutDeduction: opts.verticalCutDeduction,
    },
    {
      frameId: opts.frameId ?? `studio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      elevationTag: t.elevationTag || t.mark || null,
      source: 'studio',
      sourceSystemId: t.sourceSystemId ?? null,
      takeoffIds: t.takeoffIds,
      isOverride: !!opts.geometryOverride,
      ai: {
        bayCount: bays,
        rowCount: rows,
        gridSource: t.gridSource ?? (t.bayCount != null || t.rowCount != null ? 'takeoff' : 'default'),
        confidence: t.confidence ?? null,
        mark: t.mark ?? null,
      },
    },
    opts.rates ?? null,
  );
}

/**
 * Resolve the system type of a RawTakeoff: explicit field first, then a label
 * that names a type ("SF-1 — Cap CW" or "Cap CW"); null if nothing resolves.
 */
export function takeoffSystemType(t) {
  if (t?.systemType) {
    const hit = tryCanonicalSystemType(t.systemType);
    if (hit) return hit;
  }
  const label = t?.label;
  if (label) {
    const direct = tryCanonicalSystemType(label);
    if (direct) return direct;
    const tail = String(label).split('—').pop().trim();
    const fromTail = tryCanonicalSystemType(tail);
    if (fromTail) return fromTail;
  }
  return null;
}
