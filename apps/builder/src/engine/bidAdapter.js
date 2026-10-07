/**
 * bidAdapter.js — turns what the app actually stores into what `bidCostEngine`
 * wants, and nothing else.
 *
 * The Builder holds a bid in two unrelated shapes:
 *
 *   1. `useBidStore.workspaceSystems` — the scope/system cards the estimator
 *      builds in GlazeBidWorkspace: material lines, labor tasks, frames, stored
 *      man-hours, equipment, ancillary config.
 *   2. `useBidStore.frames` — parametric frames from the Frame Builder and the
 *      Studio auto-takeoff, each carrying a `bom` from `parametricFrameMath`.
 *
 * `computeBid()` wants one shape: scopes, keyed by **breakout x alternate**,
 * exactly as the ValorX sheet groups them. This module is the only place that
 * conversion happens, so the recap, the cost-code export and the proposal all
 * read one set of numbers.
 *
 * Pure — no React, no stores, no `calcSystemMH`. Man-hours come in through the
 * `mhFor` callback so this file is testable without the rate store, and so the
 * screen keeps using the same labor engine the workspace does.
 *
 * Decisions this encodes (see `GlazeBid_BidBuilder_Interview_2026-10-06.md`):
 *   #14 equipment rental is MATERIAL, not labor — the old ReviewBidPage added it
 *       to labor cost, which under-taxed it and skipped supplies/contingency
 *   #5  additive markup; GPM is an output
 *   #7  travel / per diem and bonds are project-level, never per scope
 *   decode §8.2 breakout != system type ("Automatic Sliding Doors", "Glazing
 *       Only" are breakouts with no frames)
 */

import { COST_GROUPS, DEFAULT_JOB } from './bidCostEngine';

// ── cost-code normalisation ────────────────────────────────────────────────

/**
 * Everything the app has ever written into `line.costCode` / `line.category`,
 * mapped onto the engine's eleven codes. Unknown values fall back to metal, the
 * same way `CostCodeExport.normalizeCostCode` does.
 */
const CODE_ALIASES = {
  METL: '02-METL', METAL: '02-METL', ALUMINUM: '02-METL',
  GLSS: '02-GLSS', GLASS: '02-GLSS',
  DOOR: '02-DOOR', DOORS: '02-DOOR',
  HDWR: '02-HDWR', HARDWARE: '02-HDWR',
  CAUL: '02-CAUL', CAULK: '02-CAUL', CAULKING: '02-CAUL', SEALANT: '02-CAUL',
  MIRR: '02-MIRR', MIRROR: '02-MIRR', MIRRORS: '02-MIRR',
  EQUP: '03-EQUP', EQUIP: '03-EQUP', EQUIPMENT: '03-EQUP',
  SUPP: '05-SUPP', SUPPLIES: '05-SUPP',
  SHOP: '06-SHOP', SHOPS: '06-SHOP', 'SHOP DRAWINGS': '06-SHOP', BONDS: '06-SHOP',
  TRAV: '07-TRAV', TRAVEL: '07-TRAV', 'PER DIEM': '07-TRAV',
  CONT: '08-CONT', CONTINGENCY: '08-CONT', FREIGHT: '08-CONT', SHIPPING: '08-CONT',
  GLAZ: '01-GLAZ', LABOR: '01-GLAZ',
};

/**
 * '02-Metal', 'metal', '02-METL', '06-Shop Drawings / Bonds', undefined -> a
 * code the engine knows. The full SOWMaterialTracker labels have to work: they
 * are what every line already in a saved `.gbid` carries.
 */
export function normalizeCostCode(raw) {
  if (!raw) return '02-METL';
  const s = String(raw).trim().toUpperCase();
  if (COST_GROUPS[s]) return s;
  // '06-SHOP DRAWINGS / BONDS' -> 'SHOP DRAWINGS / BONDS' -> 'SHOP DRAWINGS'
  const tail = /^\d{2}-/.test(s) ? s.slice(3) : s;
  const head = tail.split('/')[0].trim();
  return CODE_ALIASES[tail] || CODE_ALIASES[head] || CODE_ALIASES[s] || '02-METL';
}

// ── canonical system type -> the breakout name the sheet uses ───────────────

export const BREAKOUT_FOR_SYSTEM_TYPE = Object.freeze({
  'Ext SF': 'Exterior Storefront',
  'Int SF': 'Interior Storefront',
  'Cap CW': 'Curtain Wall',
  'SSG CW': 'Curtain Wall',
  'ext-sf-1': 'Exterior Storefront',
  'ext-sf-2': 'Exterior Storefront',
  'int-sf': 'Interior Storefront',
  'cap-cw': 'Curtain Wall',
  'ssg-cw': 'Curtain Wall',
  'material-only': 'Material Only',
  'labor-only': 'Labor Only',
  'misc-labor': 'Misc Labor',
});

/** The breakout a scope belongs to: explicit tag, then system type, then name. */
export function breakoutFor(sys) {
  if (sys.breakout) return String(sys.breakout);
  const t = sys.systemType || sys.type;
  if (t && BREAKOUT_FOR_SYSTEM_TYPE[t]) return BREAKOUT_FOR_SYSTEM_TYPE[t];
  return sys.name || 'Unassigned';
}

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** '' / 'Base' / 'base bid' all mean the base bid. */
const altKey = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /^base( bid)?$/i.test(s)) return null;
  return s;
};

// ── the job card ───────────────────────────────────────────────────────────

/**
 * Build the engine's job from the app's `bidSettings` plus company defaults.
 *
 * NOTE the markup field. The app stores `markupPercent` and every screen until
 * now fed it to `calculatePricing` in **margin** mode, where the number entered
 * IS the GPM and the sell is solved backwards. Interview #5 and the ValorX
 * sheet both say additive: cost x markup%, GPM reported. This adapter passes it
 * through as an additive markup, so the same stored 38 now means what it means
 * on the sheet. Totals will differ from the old screens — the old ones were
 * wrong against Alpine Buick GMC.
 */
export function jobFromBidSettings(bidSettings = {}, company = {}) {
  const b = bidSettings || {};
  const c = company || {};
  const pick = (...vals) => vals.find((v) => v != null && v !== '');
  return {
    ...DEFAULT_JOB,
    laborRate: num(pick(b.laborRate, c.laborRate, DEFAULT_JOB.laborRate)),
    markupPct: num(pick(b.markupPercent, b.markupPct, c.markupPct, DEFAULT_JOB.markupPct)),
    taxPct: b.isTaxExempt ? 0 : num(pick(b.taxPercent, b.taxPct, c.taxPct, DEFAULT_JOB.taxPct)),
    crewSize: num(pick(b.crewSize, c.crewSize, DEFAULT_JOB.crewSize)) || DEFAULT_JOB.crewSize,
    suppliesPct: num(pick(b.suppliesPct, c.suppliesPct, DEFAULT_JOB.suppliesPct)),
    materialContingencyPct: num(pick(
      b.materialContingencyPct, c.contingencyPct, DEFAULT_JOB.materialContingencyPct,
    )),
    laborContingencyPct: num(pick(
      b.laborContingency, b.laborContingencyPct, c.laborContingencyPct,
      DEFAULT_JOB.laborContingencyPct,
    )),
    shopDrawingsPct: num(pick(b.shopDrawingsPct, c.shopDrawingsPct, DEFAULT_JOB.shopDrawingsPct)),
    cleaningHoursPerDay: num(pick(
      b.cleaningHrsPerDay, b.cleaningHoursPerDay, c.cleaningHoursPerDay,
      DEFAULT_JOB.cleaningHoursPerDay,
    )),
    caulkPricePerLF: num(pick(b.caulkPricePerLF, c.caulkPricePerLF, DEFAULT_JOB.caulkPricePerLF)),
    bondPct: num(pick(b.bondPct, c.bondPct, DEFAULT_JOB.bondPct)),
    bondCostOverride: pick(b.bondCostOverride) ?? null,
    isTaxExempt: !!b.isTaxExempt,
    asOf: pick(b.bidDate, b.asOf) ?? null,
    projectAdders: Array.isArray(b.projectAdders) ? b.projectAdders : [],
  };
}

// ── material lines off a workspace system ──────────────────────────────────

/** Typed material lines, each carrying the alternate tag it was entered under. */
export function materialLinesFromSystem(sys) {
  const out = [];

  for (const m of sys.materials || []) {
    out.push({
      group: normalizeCostCode(m.costCode || m.category),
      description: [m.desc1, m.desc2, m.desc3].filter(Boolean).join(' ')
        || m.description || m.label || 'Material',
      notes: m.notes || null,
      cost: num(m.cost),
      vendorMarkupPct: m.vendorMarkupPct == null ? 0 : num(m.vendorMarkupPct),
      alternate: altKey(m.alternate),
      breakout: m.breakout || null,
    });
  }

  // per-frame typed material (the "manual material cost" field on a frame card)
  for (const f of sys.frames || []) {
    const c = num(f.manualMaterialCost);
    if (c) {
      out.push({
        group: '02-METL',
        description: `${f.elevationTag || f.tag || 'Frame'} — typed material`,
        cost: c,
        alternate: altKey(f.alternate),
      });
    }
  }

  // #14 equipment rental is a MATERIAL line, priced off the rental table
  for (const e of (sys.laborExtras || {}).equipment || []) {
    out.push({
      group: '03-EQUP',
      description: e.label || e.machine || 'Equipment rental',
      notes: [e.weeks ? `${e.weeks} wk` : null, e.months ? `${e.months} mo` : null,
        e.pickupDropoff ? `${e.pickupDropoff} PU/DO` : null].filter(Boolean).join(' · ') || null,
      auto: 'equipment',
      equipment: {
        weeks: num(e.weeks), months: num(e.months), puDo: num(e.pickupDropoff ?? e.puDo),
        weekRate: num(e.weekRate), monthRate: num(e.monthRate),
        glazierPkg: !!e.glazierPkg,
        glazierPkgWeekRate: num(e.glazierPkgWeekRate),
        glazierPkgMonthRate: num(e.glazierPkgMonthRate),
      },
      alternate: altKey(e.alternate),
    });
  }

  return out;
}

/** Misc-labor work lines (AG doors, butt joints, demo) off a system. */
export function miscLaborFromSystem(sys) {
  return (sys.laborTasks || []).map((t) => ({
    label: t.label || t.name || 'Misc Labor',
    qty: num(t.qty),
    hoursEach: num(t.hrsPer ?? t.hoursEach),
    alternate: altKey(t.alternate),
  }));
}

/** Square feet for the scope: stored total, else summed off the frame cards. */
export function sqFtForSystem(sys) {
  const stored = num((sys.totals || {}).totalSF);
  if (stored) return stored;
  return (sys.frames || []).reduce((s, f) => {
    const w = num(f.width) / 12;
    const h = num(f.height) / 12;
    return s + w * h * (num(f.quantity) || 1);
  }, 0);
}

// ── workspace systems -> scopes ────────────────────────────────────────────

/**
 * One base scope per system, plus one scope per alternate tag found on that
 * system's lines. Labor rides on the base scope unless a labor task itself
 * carries an alternate.
 *
 * @param {object[]} systems  useBidStore.workspaceSystems
 * @param {{ mhFor?: (sys) => {shopMH,distMH,fieldMH,caulkLF} }} opts
 *   `mhFor` returns the system's man-hours. Default reads `sys.totals`, which
 *   is what the workspace stores for systems with no frame cards. The screen
 *   passes a `mhFor` that runs `calcSystemMH` for systems that do have frames,
 *   so the recap and the workspace agree.
 */
export function scopesFromWorkspaceSystems(systems = [], opts = {}) {
  const mhFor = opts.mhFor || ((sys) => ({
    shopMH: num((sys.totals || {}).shopMHs),
    distMH: num((sys.totals || {}).distMHs),
    fieldMH: num((sys.totals || {}).fieldMHs),
    caulkLF: num((sys.totals || {}).caulkLF),
  }));

  const scopes = [];

  for (const sys of systems) {
    const breakout = breakoutFor(sys);
    const lines = materialLinesFromSystem(sys);
    const misc = miscLaborFromSystem(sys);
    const extras = sys.laborExtras || {};

    const base = {
      id: sys.id || sys.systemId || breakout,
      breakout,
      alternate: null,
      systemType: sys.systemType || null,
      areaSqFt: sqFtForSystem(sys),
      labor: mhFor(sys),
      liftMultiplier: extras.liftMultiplier == null ? 1 : num(extras.liftMultiplier),
      miscLabor: misc.filter((m) => !m.alternate),
      materials: lines.filter((l) => !l.alternate),
      markupPctOverride: sys.markupPctOverride == null ? null : num(sys.markupPctOverride),
      suppliesPctOverride: sys.suppliesPctOverride == null ? null : num(sys.suppliesPctOverride),
      materialContingencyPctOverride: sys.materialContingencyPctOverride == null
        ? null : num(sys.materialContingencyPctOverride),
      suppliesBasisOverride: sys.suppliesBasisOverride == null
        ? null : num(sys.suppliesBasisOverride),
      cleaningDaysOverride: extras.cleaningDays == null ? null : num(extras.cleaningDays),
      cleaningHoursPerDayOverride: extras.cleaningHrsPerDay == null
        ? null : num(extras.cleaningHrsPerDay),
      laborContingencyHoursOverride: extras.contingencyHours == null
        ? null : num(extras.contingencyHours),
      laborContingencyPctOverride: extras.contingencyPct == null
        ? null : num(extras.contingencyPct),
      shopDrawingsCostOverride: sys.shopDrawingsCostOverride == null
        ? null : num(sys.shopDrawingsCostOverride),
      sourceSystemId: sys.id || null,
    };
    scopes.push(base);

    const tags = [...new Set([
      ...lines.map((l) => l.alternate),
      ...misc.map((m) => m.alternate),
    ].filter(Boolean))];

    for (const tag of tags) {
      scopes.push({
        id: `${base.id}::${tag}`,
        breakout,
        alternate: tag,
        systemType: base.systemType,
        areaSqFt: 0,
        labor: {},
        miscLabor: misc.filter((m) => m.alternate === tag),
        materials: lines.filter((l) => l.alternate === tag),
        markupPctOverride: base.markupPctOverride,
        // an alternate add carries its own supplies/contingency only when the
        // estimator typed lines for it; the sheet often leaves them off
        suppliesPctOverride: sys.alternateSuppliesPct == null ? 0 : num(sys.alternateSuppliesPct),
        materialContingencyPctOverride: sys.alternateContingencyPct == null
          ? 0 : num(sys.alternateContingencyPct),
        shopDrawingsCostOverride: null,
        sourceSystemId: sys.id || null,
      });
    }
  }

  return scopes;
}

// ── parametric frames -> scopes ────────────────────────────────────────────

/**
 * Frames from the Frame Builder / Studio auto-takeoff, grouped into one scope
 * per breakout. Their man-hours come straight off `bom` (the frame engine
 * already applied quantity); their metal and glass arrive as RFQ lines with no
 * price yet, so `computeBid` flags them as unpriced until a quote lands.
 */
export function scopesFromFrames(frames = [], opts = {}) {
  const beads = opts.beadsOfCaulk == null ? 2 : num(opts.beadsOfCaulk);
  const groups = new Map();

  for (const f of frames) {
    const breakout = breakoutFor(f);
    const key = `${breakout}::${altKey(f.alternate) || ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: `frames::${key}`,
        breakout,
        alternate: altKey(f.alternate),
        systemType: f.systemType || null,
        areaSqFt: 0,
        labor: { shopMH: 0, distMH: 0, fieldMH: 0, caulkLF: 0 },
        miscLabor: [],
        materials: [],
        fromFrames: true,
        frameIds: [],
      });
    }
    const g = groups.get(key);
    const bom = f.bom || {};
    const qty = num(f.quantity) || 1;
    const W = num((f.inputs || {}).width);
    const H = num((f.inputs || {}).height);

    g.frameIds.push(f.frameId);
    g.areaSqFt += num(bom.totalGlassSqFt);
    g.labor.shopMH += num(bom.shopHours);
    g.labor.distMH += num(bom.distHours);
    g.labor.fieldMH += num(bom.fieldHours);
    g.labor.caulkLF += ((W + H) * 2 / 12) * qty * beads;

    // one unpriced RFQ line per die and per glass makeup, so the recap shows
    // exactly what is still waiting on a vendor
    const rfq = bom.rfq || {};
    for (const m of rfq.metal || []) {
      g.materials.push({
        group: '02-METL',
        description: `${f.elevationTag || 'Frame'} — ${m.roleLabel || m.role}`,
        notes: m.lengthDisplay ? `${m.qty} @ ${m.lengthDisplay}` : null,
        quoteKey: `${f.systemType}|${m.role}`,
        qty: num(m.totalLF),
        unit: 'LF',
        alternate: altKey(f.alternate),
      });
    }
    for (const l of rfq.glass || []) {
      g.materials.push({
        group: '02-GLSS',
        description: `${f.elevationTag || 'Frame'} — ${l.glassType} ${l.liteType}`,
        notes: `${l.qty} @ ${l.widthDisplay || l.widthInches}" x ${l.heightDisplay || l.heightInches}"`,
        quoteKey: `glass|${l.glassType}`,
        qty: num(l.totalSqFt),
        unit: 'SF',
        alternate: altKey(f.alternate),
      });
    }
    for (const d of rfq.doors || []) {
      g.materials.push({
        group: '02-DOOR',
        description: `${f.elevationTag || 'Frame'} — ${d.type} door`,
        quoteKey: `door|${f.systemType}|${d.type}`,
        qty: num(d.qty),
        unit: 'EA',
        alternate: altKey(f.alternate),
      });
    }
    g.materials.push({
      group: '02-CAUL',
      description: `${f.elevationTag || 'Frame'} — perimeter caulk`,
      auto: 'caulking',
      caulkLF: ((W + H) * 2 / 12) * qty * beads,
      alternate: altKey(f.alternate),
    });
  }

  return [...groups.values()];
}

// ── the whole bid ─────────────────────────────────────────────────────────

/**
 * Everything the project holds, in the shape `computeBid()` takes.
 *
 * Workspace systems and parametric frames both become scopes. When a frame
 * group lands on the same breakout as a workspace system, the two are MERGED —
 * the system's typed material and the frames' RFQ lines belong to one scope,
 * and their man-hours add. Otherwise an AI frame set would show up as a second
 * "Exterior Storefront" row beside the one the estimator built.
 */
export function bidFromProject({
  systems = [], frames = [], bidSettings = {}, company = {}, mhFor, beadsOfCaulk = 2,
} = {}) {
  const job = jobFromBidSettings(bidSettings, company);
  const sysScopes = scopesFromWorkspaceSystems(systems, { mhFor });
  const frameScopes = scopesFromFrames(frames, { beadsOfCaulk });

  const byKey = new Map();
  for (const s of sysScopes) byKey.set(`${s.breakout}::${s.alternate || ''}`, s);

  for (const fs of frameScopes) {
    const key = `${fs.breakout}::${fs.alternate || ''}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, fs);
      sysScopes.push(fs);
      continue;
    }
    existing.materials = [...existing.materials, ...fs.materials];
    existing.areaSqFt = num(existing.areaSqFt) + num(fs.areaSqFt);
    existing.labor = {
      shopMH: num(existing.labor.shopMH) + fs.labor.shopMH,
      distMH: num(existing.labor.distMH) + fs.labor.distMH,
      fieldMH: num(existing.labor.fieldMH) + fs.labor.fieldMH,
      caulkLF: num(existing.labor.caulkLF) + fs.labor.caulkLF,
    };
    existing.frameIds = [...(existing.frameIds || []), ...fs.frameIds];
  }

  return { job, scopes: sysScopes };
}

export default bidFromProject;
