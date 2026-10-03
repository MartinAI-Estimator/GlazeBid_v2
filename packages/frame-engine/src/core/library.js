/**
 * library.js — manufacturer system library.
 *
 * Every frame points at ONE library system.  The system supplies:
 *   - family + allowed joinery          (storefront / curtainwall)
 *   - member profiles per role          (sightline = face width, depth)
 *   - glazing rule                      (glass = DLO + add per axis; SSG edges per manufacturer)
 *   - stock length                      (bar optimizer)
 *   - die map: role → part number       (metal RFQ)
 *   - accessory parts                   (setting blocks, shear blocks, end dams, gaskets, …)
 *   - labor category                    (STANDARD = storefront, COMBINATION = curtain wall)
 *
 * Any value can be overridden per frame (frame.overrides).  Kawneer systems are
 * defined here by hand from the PartnerPak .dat analysis + the vendor-portal
 * cross-reference; each Tubelite twin is DERIVED from the Kawneer system through
 * the xref, so the two stay in lock-step and every derived die carries its
 * EXACT / APPROX match quality.
 *
 * Dimensions are nominal catalog values — VERIFY against the current
 * manufacturer catalog before relying on them for a fabrication order.
 */

import { XREF } from './data/xrefData.js';

// ── Roles ────────────────────────────────────────────────────────────────────

/** Metal (cut-list) roles, in the order a cut list reads. */
export const METAL_ROLES = Object.freeze({
  jamb:              { label: 'Jamb',                         orient: 'v', order: 1 },
  mullion:           { label: 'Intermediate Vertical',        orient: 'v', order: 2 },
  head:              { label: 'Head',                         orient: 'h', order: 3 },
  sill:              { label: 'Sill',                         orient: 'h', order: 4 },
  horizontal:        { label: 'Intermediate Horizontal',      orient: 'h', order: 5 },
  subsill:           { label: 'Subsill / Sill Receptor',      orient: 'h', order: 6 },
  headReceptor:      { label: 'Head Receptor',                orient: 'h', order: 7 },
  doorJambFiller:    { label: 'Door Jamb Snap-in Filler',     orient: 'v', order: 8 },
  pressurePlate:     { label: 'Pressure Plate',               orient: '*', order: 9 },
  cover:             { label: 'Snap Cover',                   orient: '*', order: 10 },
  thermalIsolator:   { label: 'Thermal Isolator',             orient: '*', order: 11 },
  perimeterFiller:   { label: 'Perimeter Filler',             orient: '*', order: 12 },
});

/** Accessory roles. `unit` is how the quantity is expressed. */
export const ACCESSORY_ROLES = Object.freeze({
  settingBlock:     { label: 'Setting Block',               unit: 'ea' },
  sideBlock:        { label: 'Side / Anti-walk Block',      unit: 'ea' },
  shearBlock:       { label: 'Shear Block (horizontal)',    unit: 'ea' },
  shearBlockHS:     { label: 'Shear Block (head / sill)',   unit: 'ea' },
  assemblyScrew:    { label: 'Assembly / Spline Screw',     unit: 'ea' },
  endDam:           { label: 'End Dam',                     unit: 'ea' },
  endDamScrew:      { label: 'End Dam Screw',               unit: 'ea' },
  gasketInterior:   { label: 'Glazing Gasket — Interior',   unit: 'LF' },
  gasketExterior:   { label: 'Glazing Gasket — Exterior',   unit: 'LF' },
  gasketPerimeter:  { label: 'Perimeter Gasket',            unit: 'LF' },
  ppFastener:       { label: 'Pressure Plate Fastener',     unit: 'ea' },
  zonePlug:         { label: 'Zone Plug / Joint Plug',      unit: 'ea' },
  waterDeflector:   { label: 'Water Deflector',             unit: 'ea' },
  anchor:           { label: 'Perimeter Anchor',            unit: 'ea' },
  shim:             { label: 'Shim',                        unit: 'ea' },
  sealantExterior:  { label: 'Perimeter Sealant — Exterior',unit: 'LF' },
  sealantInterior:  { label: 'Perimeter Sealant — Interior',unit: 'LF' },
  backerRod:        { label: 'Backer Rod',                  unit: 'LF' },
  structuralSilicone:{ label: 'Structural Silicone',        unit: 'LF' },
  ssgSpacer:        { label: 'SSG Spacer / Backer',         unit: 'LF' },
});

export const JOINERY = Object.freeze({
  screw_spline:   { label: 'Screw spline',                  family: 'storefront' },
  shear_block:    { label: 'Shear block',                   family: 'storefront' },
  stick_receptor: { label: 'Stick — head & sill receptor',  family: 'storefront' },
  captured:       { label: 'Captured (pressure plate + cover)', family: 'curtainwall' },
  ssg_2side:      { label: '2-sided SSG (verticals SSG)',   family: 'curtainwall' },
  ssg_4side:      { label: '4-sided SSG',                   family: 'curtainwall' },
  unitized:       { label: 'Unitized (reserved — not in v1)', family: 'curtainwall', reserved: true },
});

// ── Accessory quantity rules (defaults; system / company may override) ──────

export const DEFAULT_RULES = Object.freeze({
  settingBlocksPerLite: 2,
  sideBlocksPerLite: 2,
  screwsPerSplineJoint: 2,       // screw spline: screws per horizontal end
  screwsPerShearBlock: 4,        // 2 to vertical + 2 to horizontal
  endDamsPerSill: 2,
  endDamScrewsPerEndDam: 2,
  anchorSpacingIn: 24,           // perimeter anchors o.c. (jambs + head + sill)
  anchorMinPerMember: 2,
  shimsPerAnchor: 1,
  ppFastenerSpacingIn: 9,        // CW pressure plate screws o.c.
  zonePlugsPerJoint: 1,          // CW: horizontal ends
  waterDeflectorsPerSillEnd: 0,
  beadsExterior: 1,
  beadsInterior: 1,
  sausageOz: 20,
  kerfIn: 0.125,
  endTrimIn: 0,                  // trimmed off each bar before cutting
});

// ── Kawneer systems (hand-defined) ───────────────────────────────────────────

const SF = (o) => ({ family: 'storefront', laborType: 'STANDARD', systemType: 'Ext SF',
  defaultJoinery: 'screw_spline', joinery: ['screw_spline', 'shear_block', 'stick_receptor'],
  glazing: { addPerAxis: 0.75, ssgAddPerEdge: null }, stockLengthIn: 288, ...o });
const CW = (o) => ({ family: 'curtainwall', laborType: 'COMBINATION', systemType: 'Cap CW',
  defaultJoinery: 'captured', joinery: ['captured', 'ssg_2side', 'ssg_4side', 'unitized'],
  glazing: { addPerAxis: 1.0, ssgAddPerEdge: null }, stockLengthIn: 288, ...o });

const prof = (face, depth, extra = {}) => ({
  jamb: { sightline: face, depth }, head: { sightline: face, depth }, sill: { sightline: face, depth },
  mullion: { sightline: face, depth }, horizontal: { sightline: face, depth }, ...extra,
});

const SF_GASKETS = { gasketInterior: '027074', gasketExterior: '027074' };

const KAWNEER = [
  SF({ id: 'kawneer-450', manufacturer: 'Kawneer', series: '450', xrefSys: '450 Non-Thermal',
    name: 'Trifab 450 — 1-3/4" x 4-1/2" Non-Thermal', profiles: prof(1.75, 4.5),
    dies: { jamb: '450CG001', head: '450CG001', sill: '450CG003', mullion: '450CG001', horizontal: '450CG011',
      doorJambFiller: '450CG002', subsill: '450SC001', perimeterFiller: '450026' },
    accessories: { settingBlock: '027366', sideBlock: '027084', shearBlock: '450CG525', shearBlockHS: '450CG524',
      assemblyScrew: '450_SS', endDam: '450114', endDamScrew: '28808', waterDeflector: '450105', ...SF_GASKETS } }),
  SF({ id: 'kawneer-451', manufacturer: 'Kawneer', series: '451', xrefSys: '451 Non-Thermal',
    name: 'Trifab 451 — 2" x 4-1/2" Non-Thermal', profiles: prof(2, 4.5),
    dies: { jamb: '451CG001', head: '451CG001', sill: '451CG014', mullion: '451CG001', horizontal: '451CG011',
      doorJambFiller: '451CG002', subsill: '451VG037', perimeterFiller: '452145' },
    accessories: { settingBlock: '027073', sideBlock: '480520', shearBlock: '451CG525', shearBlockHS: '451VG524',
      assemblyScrew: '028856', ...SF_GASKETS } }),
  SF({ id: 'kawneer-451t', manufacturer: 'Kawneer', series: '451T', xrefSys: '451T Thermal',
    name: 'Trifab 451T — 2" x 4-1/2" Thermal (Center Glaze)', profiles: prof(2, 4.5),
    dies: { jamb: '451TCG001', head: '451TCG001', sill: '451TCG014', mullion: '451TCG001', horizontal: '451TCG011',
      doorJambFiller: '451TCG002', subsill: '451TVG037', headReceptor: '451TVG570', perimeterFiller: '451T026' },
    accessories: { settingBlock: '027073', sideBlock: '480520', shearBlock: '451CG525', shearBlockHS: '451VG624',
      assemblyScrew: '028856', endDam: '451TVG316', endDamScrew: '028808', waterDeflector: '451105', ...SF_GASKETS } }),
  SF({ id: 'kawneer-451ut', manufacturer: 'Kawneer', series: '451UT', xrefSys: '451UT Ultra-Thermal',
    name: 'Trifab 451UT — 2" x 4-1/2" Ultra-Thermal', profiles: prof(2, 4.5),
    dies: { jamb: '452TCG001', head: '452TCG001', sill: '452TCG014', mullion: '452TCG001', horizontal: '452TCG021',
      doorJambFiller: null, subsill: '452TCG037', perimeterFiller: '452TCG126' },
    accessories: { settingBlock: '027073', sideBlock: '480520', assemblyScrew: '028856', endDam: '452CG315', ...SF_GASKETS } }),
  SF({ id: 'kawneer-601', manufacturer: 'Kawneer', series: '601', xrefSys: '601 Non-Thermal',
    name: 'Trifab 601 — 2" x 6" Non-Thermal', profiles: prof(2, 6),
    dies: { jamb: '601CG001', head: '601CG001', sill: '601CG014', mullion: '601CG001', horizontal: '601CG021',
      doorJambFiller: '601CG002', subsill: '601VG037', headReceptor: '601VG570', perimeterFiller: '601CG026' },
    accessories: { settingBlock: '601CG_SB_NT', sideBlock: '480520', assemblyScrew: '028856', endDam: '601NT_ED',
      waterDeflector: '601NT_WD', ...SF_GASKETS } }),
  SF({ id: 'kawneer-601t', manufacturer: 'Kawneer', series: '601T', xrefSys: '601T Thermal',
    name: 'Trifab 601T — 2" x 6" Thermal (Center Glaze)', profiles: prof(2, 6),
    dies: { jamb: '601TCG001', head: '601TCG001', sill: '601TCG014', mullion: '601TCG001', horizontal: '601TCG011',
      doorJambFiller: '601TCG002', subsill: '601TCG037', perimeterFiller: '601TCG026' },
    accessories: { settingBlock: '601TCG_SB', sideBlock: '123391', shearBlock: '601CG524', shearBlockHS: '601CG528',
      assemblyScrew: '028856', endDam: '601CG317', waterDeflector: '451165', ...SF_GASKETS } }),
  SF({ id: 'kawneer-601ut', manufacturer: 'Kawneer', series: '601UT', xrefSys: '601UT Ultra-Thermal',
    name: 'Trifab 601UT — 2" x 6" Ultra-Thermal', profiles: prof(2, 6),
    dies: { jamb: '601UTCG001', head: '601UTCG001', sill: '601UTCG014', mullion: '601UTCG001', horizontal: '601UTCG021',
      doorJambFiller: null, subsill: '601UTCG037', perimeterFiller: '601UTCG026' },
    accessories: { sideBlock: '480520', assemblyScrew: '028856', shim: '601UTCG216', ...SF_GASKETS } }),
  SF({ id: 'kawneer-501t-ir', manufacturer: 'Kawneer', series: 'IR 501T', xrefSys: '501T IR Thermal',
    name: 'IR 501T — 2" x 5" Impact-Rated Thermal', profiles: prof(2, 5),
    dies: { jamb: '575T500', head: '575T501', sill: '575T513', mullion: '575T521', horizontal: '575T511',
      doorJambFiller: '575T522', subsill: '575T537', perimeterFiller: '575T526' },
    accessories: { settingBlock: '575205', sideBlock: '422434', gasketInterior: '127121', gasketExterior: '127127',
      endDam: '575UT537', endDamScrew: '128370' } }),
  CW({ id: 'kawneer-1600-6', manufacturer: 'Kawneer', series: '1600 Wall (6")', xrefSys: '1600 Curtain Wall',
    name: '1600 Wall System — 2-1/2" x 6"', profiles: prof(2.5, 6),
    dies: { jamb: '162001', head: '162094', sill: '162094', mullion: '162001', horizontal: '162090',
      doorJambFiller: 'CW_E3192', pressurePlate: '162335', pressurePlatePerimeter: '162505', cover: '162006',
      thermalIsolator: '162310', perimeterFiller: '162022' },
    accessories: { settingBlock: '027853', sideBlock: '027855', shearBlock: '162377', shearBlockHS: '162331',
      assemblyScrew: '128394', gasketInterior: '027850', gasketExterior: '027850', gasketPerimeter: '027857',
      ppFastener: '128406', zonePlug: '162350', ssgSpacer: '027475' } }),
  CW({ id: 'kawneer-1600-75', manufacturer: 'Kawneer', series: '1600 Wall (7-1/2")', xrefSys: '1600 Curtain Wall',
    name: '1600 Wall System — 2-1/2" x 7-1/2"', profiles: prof(2.5, 7.5),
    dies: { jamb: '162003', head: '162095', sill: '162095', mullion: '162003', horizontal: '162091',
      doorJambFiller: 'CW_E3192', pressurePlate: '162335', pressurePlatePerimeter: '162505', cover: '162006',
      thermalIsolator: '162310', perimeterFiller: '162020' },
    accessories: { settingBlock: '027853', sideBlock: '027855', shearBlock: '162378', shearBlockHS: '162332',
      assemblyScrew: '128394', gasketInterior: '027850', gasketExterior: '027850', gasketPerimeter: '027857',
      ppFastener: '128406', zonePlug: '162350', ssgSpacer: '027475' } }),
  CW({ id: 'kawneer-1600ut', manufacturer: 'Kawneer', series: '1600 UT', xrefSys: '1600 UT Curtain Wall',
    name: '1600 UT Ultra-Thermal Wall — 2-1/2" x 7-1/2"', profiles: prof(2.5, 7.5),
    dies: { jamb: '171266', head: '171266', sill: '171266', mullion: '171266', horizontal: '171266',
      perimeterFiller: '171293', pressurePlate: '162335', pressurePlatePerimeter: '162505', cover: '162006' },
    accessories: { settingBlock: '127169', gasketInterior: '027850', gasketExterior: '027850', zonePlug: '171309' } }),
  CW({ id: 'kawneer-1620', manufacturer: 'Kawneer', series: '1620', xrefSys: '1620 Curtain Wall',
    name: '1620 / 1620 SSG Wall — 2" x 6"', profiles: prof(2, 6),
    defaultJoinery: 'captured',
    dies: { jamb: '178017', head: '178008', sill: '178008', mullion: '178001', horizontal: '178012',
      ssgMullion: '178023', pressurePlate: '178300', pressurePlatePerimeter: '178305', cover: '178006' },
    accessories: { settingBlock: '027858', assemblyScrew: '128570', zonePlug: '178324' } }),
];

/** Tubelite series name for each Kawneer system (Part Mapping.xlsx → Systems). */
const TUBELITE_SERIES = {
  'kawneer-450':     { series: '4500',        name: 'Tubelite 4500 — 1-3/4" x 4-1/2" Non-Thermal' },
  'kawneer-451':     { series: 'E14000',      name: 'Tubelite E14000 — 2" x 4-1/2" Non-Thermal' },
  'kawneer-451t':    { series: 'T14000',      name: 'Tubelite T14000 — 2" x 4-1/2" Thermal' },
  'kawneer-451ut':   { series: 'TU14000',     name: 'Tubelite TU14000 — 2" x 4-1/2" Ultra-Thermal' },
  'kawneer-601':     { series: 'E24650',      name: 'Tubelite E24650 — 2" x 6" Non-Thermal' },
  'kawneer-601t':    { series: 'T24650',      name: 'Tubelite T24650 — 2" x 6" Thermal' },
  'kawneer-601ut':   { series: 'TU24650',     name: 'Tubelite TU24650 — 2" x 6" Ultra-Thermal' },
  'kawneer-501t-ir': { series: 'T34000 IR',   name: 'Tubelite T34000 IR — Impact-Rated (approx. to 501T)' },
  'kawneer-1600-6':  { series: '400CW (6")',  name: 'Tubelite 400 Curtain Wall — 2-1/2" x 6"' },
  'kawneer-1600-75': { series: '400CW (7-1/2")', name: 'Tubelite 400 Curtain Wall — 2-1/2" x 7-1/2"' },
  'kawneer-1600ut':  { series: '400CW UT',    name: 'Tubelite 400 Curtain Wall Ultra-Thermal' },
  'kawneer-1620':    { series: '200 Series',  name: 'Tubelite 200 Series Curtain Wall — 2" face' },
};

// ── Xref helpers ─────────────────────────────────────────────────────────────

const XREF_BY_K = new Map();
for (const x of XREF) if (!XREF_BY_K.has(x.k)) XREF_BY_K.set(x.k, x);

/** Look up a Kawneer part in the cross-reference. */
export function xrefFor(kawneerPart) {
  return kawneerPart ? XREF_BY_K.get(String(kawneerPart)) ?? null : null;
}

function derivePart(kPart) {
  if (!kPart) return { part: null, match: null, from: null };
  const x = xrefFor(kPart);
  if (!x || !x.t) return { part: null, match: 'MISSING', from: kPart };
  return { part: x.t, match: x.m, from: kPart };
}

function deriveTubelite(k) {
  const ts = TUBELITE_SERIES[k.id];
  const dies = {}; const dieMatch = {};
  for (const [role, part] of Object.entries(k.dies)) {
    const d = derivePart(part);
    dies[role] = d.part; if (part) dieMatch[role] = { match: d.match, kawneer: part };
  }
  const accessories = {}; const accMatch = {};
  for (const [role, part] of Object.entries(k.accessories)) {
    const d = derivePart(part);
    accessories[role] = d.part; if (part) accMatch[role] = { match: d.match, kawneer: part };
  }
  return {
    ...k,
    id: k.id.replace('kawneer-', 'tubelite-'),
    manufacturer: 'Tubelite',
    series: ts?.series ?? k.series,
    name: ts?.name ?? `Tubelite equivalent of ${k.name}`,
    equivalentOf: k.id,
    dies, accessories,
    dieMatch, accMatch,
  };
}

/** Kawneer dies keyed back to Kawneer (identity, EXACT) so both makes report the same way. */
function withKawneerMatch(k) {
  const dieMatch = {}; const accMatch = {};
  for (const [r, p] of Object.entries(k.dies)) if (p) dieMatch[r] = { match: 'NATIVE', kawneer: p };
  for (const [r, p] of Object.entries(k.accessories)) if (p) accMatch[r] = { match: 'NATIVE', kawneer: p };
  return { ...k, dieMatch, accMatch, equivalentOf: null };
}

/** A generic system for "Custom" / unknown manufacturers: no dies, roles only. */
const GENERIC = [
  SF({ id: 'generic-sf-2x45', manufacturer: 'Generic', series: '2 x 4-1/2', name: 'Generic Storefront 2" x 4-1/2"',
    profiles: prof(2, 4.5), dies: {}, accessories: {} }),
  SF({ id: 'generic-sf-2x6', manufacturer: 'Generic', series: '2 x 6', name: 'Generic Storefront 2" x 6"',
    profiles: prof(2, 6), dies: {}, accessories: {} }),
  { ...SF({ id: 'generic-int-sf', manufacturer: 'Generic', series: '1-3/4 x 4', name: 'Generic Interior Storefront 1-3/4" x 4"',
    profiles: prof(1.75, 4), dies: {}, accessories: {} }), systemType: 'Int SF' },
  CW({ id: 'generic-cw-25x75', manufacturer: 'Generic', series: '2-1/2 x 7-1/2', name: 'Generic Curtain Wall 2-1/2" x 7-1/2"',
    profiles: prof(2.5, 7.5), dies: {}, accessories: {} }),
];

// ── Public library ───────────────────────────────────────────────────────────

const _systems = [
  ...KAWNEER.map(withKawneerMatch),
  ...KAWNEER.map(deriveTubelite),
  ...GENERIC.map((g) => ({ ...g, dieMatch: {}, accMatch: {}, equivalentOf: null })),
];

export const SYSTEM_LIBRARY = Object.freeze(_systems.map((s) => Object.freeze(s)));
export const DEFAULT_SYSTEM_ID = 'kawneer-451t';

const BY_ID = new Map(SYSTEM_LIBRARY.map((s) => [s.id, s]));

/** All systems, optionally filtered by manufacturer / family. */
export function listSystems({ manufacturer, family } = {}) {
  return SYSTEM_LIBRARY.filter((s) =>
    (!manufacturer || s.manufacturer === manufacturer) && (!family || s.family === family));
}

/** Resolve a system by id; unknown ids fall back to the default system. */
export function getSystem(id, customSystems = []) {
  return customSystems.find((s) => s.id === id) ?? BY_ID.get(id) ?? BY_ID.get(DEFAULT_SYSTEM_ID);
}

/** The cross-manufacturer twin of a system (Kawneer ↔ Tubelite), or null. */
export function equivalentSystem(id) {
  const s = BY_ID.get(id);
  if (!s) return null;
  if (s.manufacturer === 'Kawneer') return BY_ID.get(id.replace('kawneer-', 'tubelite-')) ?? null;
  if (s.manufacturer === 'Tubelite') return BY_ID.get(s.equivalentOf) ?? null;
  return null;
}

/**
 * Every catalog part for the system's xref family — what the UI offers when an
 * estimator swaps a die (e.g. heavy-weight jamb, 90° corner).
 */
export function partsCatalog(systemId) {
  const s = getSystem(systemId);
  if (!s?.xrefSys) return [];
  return XREF.filter((x) => x.sys === s.xrefSys).map((x) => ({
    tier: x.tier,
    description: x.d,
    part: s.manufacturer === 'Tubelite' ? x.t : x.k,
    kawneer: x.k, tubelite: x.t, oldcastle: x.o, match: x.m,
  })).filter((p) => p.part);
}

/** Description of a part number, from the xref (either make). */
export function describePart(part) {
  if (!part) return null;
  const k = XREF_BY_K.get(String(part));
  if (k) return k.d;
  const t = XREF.find((x) => x.t === part);
  return t ? t.d : null;
}
