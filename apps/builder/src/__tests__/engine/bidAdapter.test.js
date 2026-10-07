/**
 * bidAdapter.test.js — the app's two bid shapes become engine scopes.
 *
 * The adapter is the only place `workspaceSystems` and `useBidStore.frames`
 * turn into something `computeBid()` can price, so these tests are what stop
 * the recap and the workspace drifting apart again.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCostCode, breakoutFor, jobFromBidSettings, materialLinesFromSystem,
  miscLaborFromSystem, sqFtForSystem, scopesFromWorkspaceSystems, scopesFromFrames,
  bidFromProject, BREAKOUT_FOR_SYSTEM_TYPE,
} from '../../engine/bidAdapter';
import { computeBid, DEFAULT_JOB } from '../../engine/bidCostEngine';

// ── cost codes ─────────────────────────────────────────────────────────────

describe('normalizeCostCode', () => {
  it.each([
    ['02-METL', '02-METL'], ['02-Metal', '02-METL'], ['metal', '02-METL'],
    ['aluminum', '02-METL'], ['02-Glass', '02-GLSS'], ['GLASS', '02-GLSS'],
    ['02-Doors', '02-DOOR'], ['hardware', '02-HDWR'], ['02-Caulking', '02-CAUL'],
    ['sealant', '02-CAUL'], ['mirrors', '02-MIRR'], ['03-Equipment', '03-EQUP'],
    ['05-Supplies', '05-SUPP'], ['06-Shop Drawings / Bonds', '06-SHOP'],
    ['07-Travel / Per Diem', '07-TRAV'], ['08-Contingency', '08-CONT'],
    ['shipping', '08-CONT'], ['freight', '08-CONT'],
  ])('%s -> %s', (raw, code) => expect(normalizeCostCode(raw)).toBe(code));

  it('anything unrecognised lands in metal rather than vanishing', () => {
    expect(normalizeCostCode('who knows')).toBe('02-METL');
    expect(normalizeCostCode(undefined)).toBe('02-METL');
    expect(normalizeCostCode('')).toBe('02-METL');
  });
});

// ── breakouts ──────────────────────────────────────────────────────────────

describe('breakoutFor', () => {
  it('both curtain-wall types land in one Curtain Wall breakout', () => {
    expect(BREAKOUT_FOR_SYSTEM_TYPE['Cap CW']).toBe('Curtain Wall');
    expect(breakoutFor({ systemType: 'SSG CW' })).toBe('Curtain Wall');
  });

  it('an explicit breakout tag wins over the system type', () => {
    expect(breakoutFor({ systemType: 'Ext SF', breakout: 'Automatic Sliding Doors' }))
      .toBe('Automatic Sliding Doors');
  });

  it('falls back to the system name, then to Unassigned', () => {
    expect(breakoutFor({ name: 'All Glass Interior Partitions' }))
      .toBe('All Glass Interior Partitions');
    expect(breakoutFor({})).toBe('Unassigned');
  });
});

// ── the job card ───────────────────────────────────────────────────────────

describe('jobFromBidSettings', () => {
  it('maps the app’s stored settings onto the engine job', () => {
    const j = jobFromBidSettings({
      laborRate: 40, markupPercent: 38, taxPercent: 2, crewSize: 4,
    });
    expect(j).toMatchObject({ laborRate: 40, markupPct: 38, taxPct: 2, crewSize: 4 });
  });

  it('markupPercent becomes an ADDITIVE markup, not a target margin', () => {
    // the old screens fed this same number to calculatePricing in margin mode,
    // where 38 meant "solve for a 38% GPM". It now means cost x 38%.
    const j = jobFromBidSettings({ markupPercent: 38, taxPercent: 0, laborRate: 100 });
    const r = computeBid({
      job: j,
      scopes: [{ breakout: 'A', materials: [{ group: '02-METL', cost: 1000 }],
        suppliesPctOverride: 0, materialContingencyPctOverride: 0,
        shopDrawingsCostOverride: 0 }],
    });
    expect(r.base.markup).toBeCloseTo(380, 6);     // additive
    expect(r.base.sell).toBeCloseTo(1380, 6);
    expect(r.base.sell).not.toBeCloseTo(1000 / (1 - 0.38), 2);   // NOT the margin solve
    expect(r.base.gpm).toBeCloseTo(380 / 1380, 6);
  });

  it('tax exempt zeroes the rate rather than relying on a flag downstream', () => {
    expect(jobFromBidSettings({ taxPercent: 8.2, isTaxExempt: true }).taxPct).toBe(0);
    expect(jobFromBidSettings({ taxPercent: 8.2 }).taxPct).toBe(8.2);
  });

  it('company defaults fill what the job does not set, then DEFAULT_JOB', () => {
    const j = jobFromBidSettings({ laborRate: 40 }, { markupPct: 25, suppliesPct: 0.75 });
    expect(j.laborRate).toBe(40);
    expect(j.markupPct).toBe(25);
    expect(j.suppliesPct).toBe(0.75);
    expect(j.materialContingencyPct).toBe(DEFAULT_JOB.materialContingencyPct);
  });

  it('carries the project-level adders through untouched', () => {
    const adders = [{ label: 'Per Diem', group: '07-TRAV', cost: 800 }];
    expect(jobFromBidSettings({ projectAdders: adders }).projectAdders).toEqual(adders);
  });
});

// ── workspace systems ──────────────────────────────────────────────────────

const SYS = {
  id: 'sys1', name: 'Exterior Storefront', systemType: 'Ext SF',
  totals: { shopMHs: 10, distMHs: 5, fieldMHs: 32, totalSF: 900, caulkLF: 400 },
  materials: [
    { costCode: '02-Metal', desc1: 'Kawneer', desc2: '451T', cost: 8955 },
    { costCode: '02-Glass', desc1: '1" IGU', cost: 12659 },
    { costCode: '08-Contingency', desc1: 'Shipping', cost: 1000 },
  ],
  frames: [{ elevationTag: 'SF-1', width: 120, height: 96, quantity: 2, manualMaterialCost: 500 }],
  laborTasks: [{ label: 'Butt Joints', qty: 85, hrsPer: 1 }],
  laborExtras: {
    equipment: [{ label: "60' boom", months: 1, monthRate: 3071, pickupDropoff: 0 }],
  },
};

describe('scopesFromWorkspaceSystems', () => {
  it('reads stored man-hours when no mhFor is given', () => {
    const [s] = scopesFromWorkspaceSystems([SYS]);
    expect(s.labor).toEqual({ shopMH: 10, distMH: 5, fieldMH: 32, caulkLF: 400 });
  });

  it('uses the caller’s labor engine when one is passed', () => {
    const mhFor = () => ({ shopMH: 63.5, distMH: 42.85, fieldMH: 180.237, caulkLF: 1018.42 });
    const [s] = scopesFromWorkspaceSystems([SYS], { mhFor });
    expect(s.labor.fieldMH).toBeCloseTo(180.237, 3);
  });

  it('names the breakout from the system type', () => {
    expect(scopesFromWorkspaceSystems([SYS])[0].breakout).toBe('Exterior Storefront');
  });

  it('typed material, per-frame material and equipment all become lines', () => {
    const lines = materialLinesFromSystem(SYS);
    expect(lines.map((l) => l.group)).toEqual([
      '02-METL', '02-GLSS', '08-CONT', '02-METL', '03-EQUP',
    ]);
    expect(lines[3].description).toMatch(/SF-1 — typed material/);
    expect(lines[3].cost).toBe(500);
  });

  it('EQUIPMENT IS MATERIAL — it is taxed and feeds supplies/contingency (#14)', () => {
    // ReviewBidPage used to add equipment to LABOR, so it escaped tax entirely
    // and never carried supplies or contingency.
    const [s] = scopesFromWorkspaceSystems([SYS]);
    const equip = s.materials.find((l) => l.group === '03-EQUP');
    expect(equip.auto).toBe('equipment');
    expect(equip.equipment).toMatchObject({ months: 1, monthRate: 3071 });

    const r = computeBid({
      job: jobFromBidSettings({ laborRate: 40, markupPercent: 38, taxPercent: 2, crewSize: 4 }),
      scopes: [s],
    });
    const codes = Object.fromEntries(r.costCodes.map((c) => [c.code, c]));
    expect(codes['03-EQUP'].cost).toBe(3071);
    expect(codes['03-EQUP'].tax).toBeCloseTo(3071 * 0.02, 6);
    expect(s.labor.shopMH + s.labor.distMH + s.labor.fieldMH).toBe(47);   // no equipment here
  });

  it('shipping rides as 08-CONT: taxed, but out of the supplies basis', () => {
    const [s] = scopesFromWorkspaceSystems([SYS]);
    const r = computeBid({ job: jobFromBidSettings({ taxPercent: 2 }), scopes: [s] });
    const mat = r.scopes[0].material;
    expect(mat.basis).toBe(8955 + 12659 + 500 + 3071);     // freight excluded
    expect(mat.lines.find((l) => l.description === 'Shipping').taxable).toBe(true);
  });

  it('misc labor tasks come across as hour lines', () => {
    expect(miscLaborFromSystem(SYS)).toEqual([
      { label: 'Butt Joints', qty: 85, hoursEach: 1, alternate: null },
    ]);
  });

  it('square feet: stored total wins, else summed off the frames', () => {
    expect(sqFtForSystem(SYS)).toBe(900);
    expect(sqFtForSystem({ frames: [{ width: 120, height: 96, quantity: 2 }] })).toBe(160);
    expect(sqFtForSystem({})).toBe(0);
  });

  it('per-scope overrides survive the trip', () => {
    const [s] = scopesFromWorkspaceSystems([{
      ...SYS,
      markupPctOverride: 45,
      suppliesBasisOverride: 70558.208,
      shopDrawingsCostOverride: 452.35,
      laborExtras: { ...SYS.laborExtras, cleaningDays: 5, cleaningHrsPerDay: 0.5, contingencyHours: 268 },
    }]);
    expect(s).toMatchObject({
      markupPctOverride: 45,
      suppliesBasisOverride: 70558.208,
      shopDrawingsCostOverride: 452.35,
      cleaningDaysOverride: 5,
      cleaningHoursPerDayOverride: 0.5,
      laborContingencyHoursOverride: 268,
    });
  });
});

describe('alternates become their own scopes', () => {
  const withAlts = {
    ...SYS,
    materials: [
      ...SYS.materials,
      { costCode: '02-Metal', desc1: 'Painted finish add', cost: 20000, alternate: 'Alternate 5' },
      { costCode: '02-Glass', desc1: 'Glass deduct', cost: -1320.17, alternate: 'Alternate 7' },
    ],
    laborTasks: [
      ...SYS.laborTasks,
      { label: 'Mirror install', qty: 4, hoursEach: 2, alternate: 'Alternate 5' },
    ],
  };

  it('one base scope plus one per alternate tag, all on the same breakout', () => {
    const scopes = scopesFromWorkspaceSystems([withAlts]);
    expect(scopes.map((s) => s.alternate)).toEqual([null, 'Alternate 5', 'Alternate 7']);
    expect(scopes.every((s) => s.breakout === 'Exterior Storefront')).toBe(true);
  });

  it('base keeps the labor; an alternate only gets labor tagged to it', () => {
    const [base, alt5, alt7] = scopesFromWorkspaceSystems([withAlts]);
    expect(base.labor.fieldMH).toBe(32);
    expect(base.miscLabor.map((m) => m.label)).toEqual(['Butt Joints']);
    expect(alt5.labor).toEqual({});
    expect(alt5.miscLabor.map((m) => m.label)).toEqual(['Mirror install']);
    expect(alt7.miscLabor).toEqual([]);
  });

  it('a deduct alternate stays negative end to end', () => {
    const r = computeBid({
      job: jobFromBidSettings({ laborRate: 40, markupPercent: 38, taxPercent: 2 }),
      scopes: scopesFromWorkspaceSystems([withAlts]),
    });
    const alt7 = r.alternates.find((a) => a.alternate === 'Alternate 7');
    expect(alt7.cost).toBeCloseTo(-1320.17, 4);
    expect(alt7.sell).toBeCloseTo(-1320.17 * 1.38 + -1320.17 * 0.02, 4);
    expect(alt7.sell).toBeLessThan(0);
    expect(r.base.cost).toBeGreaterThan(0);                 // base untouched by it
  });

  it('alternates carry no supplies or contingency unless the job says otherwise', () => {
    const [, alt5] = scopesFromWorkspaceSystems([withAlts]);
    expect(alt5.suppliesPctOverride).toBe(0);
    const [, withPct] = scopesFromWorkspaceSystems([{ ...withAlts, alternateSuppliesPct: 0.5 }]);
    expect(withPct.suppliesPctOverride).toBe(0.5);
  });

  it("'Base' and '' are not alternate tags", () => {
    const scopes = scopesFromWorkspaceSystems([{
      ...SYS,
      materials: [
        { costCode: '02-Metal', cost: 100, alternate: '' },
        { costCode: '02-Metal', cost: 200, alternate: 'Base' },
        { costCode: '02-Metal', cost: 300, alternate: 'base bid' },
      ],
      frames: [], laborExtras: {},
    }]);
    expect(scopes).toHaveLength(1);
    expect(scopes[0].materials).toHaveLength(3);
  });
});

// ── parametric frames ──────────────────────────────────────────────────────

const frame = (over = {}) => ({
  frameId: `f${Math.random()}`,
  elevationTag: 'SF-1',
  systemType: 'Cap CW',
  quantity: 2,
  inputs: { width: 120, height: 96 },
  bom: {
    totalGlassSqFt: 140, shopHours: 6, distHours: 3, fieldHours: 18,
    rfq: {
      metal: [
        { role: 'jamb', roleLabel: 'Jamb', qty: 4, totalLF: 64, lengthDisplay: '96"' },
        { role: 'head', roleLabel: 'Head', qty: 6, totalLF: 60, lengthDisplay: '40"' },
      ],
      glass: [{ glassType: 'GL-1', liteType: 'vision', qty: 12, totalSqFt: 140,
        widthInches: 38, heightInches: 44 }],
      doors: [],
    },
  },
  ...over,
});

describe('scopesFromFrames', () => {
  it('groups frames into one scope per breakout and sums their hours', () => {
    const [s] = scopesFromFrames([frame(), frame()]);
    expect(s.breakout).toBe('Curtain Wall');
    expect(s.labor).toMatchObject({ shopMH: 12, distMH: 6, fieldMH: 36 });
    expect(s.areaSqFt).toBe(280);
    expect(s.frameIds).toHaveLength(2);
  });

  it('caulk LF is the perimeter doubled, times quantity', () => {
    const [s] = scopesFromFrames([frame()]);        // 120x96, qty 2, 2 beads
    expect(s.labor.caulkLF).toBeCloseTo(((120 + 96) * 2 / 12) * 2 * 2, 6);
  });

  it('every die and glass makeup becomes an UNPRICED line, flagged for a quote', () => {
    const [s] = scopesFromFrames([frame()]);
    const metal = s.materials.filter((l) => l.group === '02-METL');
    expect(metal).toHaveLength(2);
    expect(metal[0]).toMatchObject({ quoteKey: 'Cap CW|jamb', qty: 64, unit: 'LF' });
    expect(s.materials.find((l) => l.group === '02-GLSS'))
      .toMatchObject({ quoteKey: 'glass|GL-1', qty: 140, unit: 'SF' });

    const r = computeBid({ job: jobFromBidSettings({}), scopes: [s] });
    expect(r.flagged.length).toBeGreaterThanOrEqual(3);
    expect(r.flagged.every((f) => f.source === 'none')).toBe(true);
    expect(r.base.cost).toBeGreaterThan(0);          // labor and caulk still price
  });

  it('caulking auto-prices off the caulk LF the frames generated', () => {
    const [s] = scopesFromFrames([frame()]);
    const r = computeBid({ job: jobFromBidSettings({ caulkPricePerLF: 1.9 }), scopes: [s] });
    const caul = r.scopes[0].material.lines.find((l) => l.group === '02-CAUL');
    expect(caul.cost).toBeCloseTo(s.labor.caulkLF * 1.9, 6);
  });

  it('a quote in history prices the frame lines instead of flagging them', () => {
    const [s] = scopesFromFrames([frame()]);
    const job = {
      ...jobFromBidSettings({}),
      asOf: '2026-10-06',
      quoteHistory: [
        { key: 'Cap CW|jamb', vendor: 'Kawneer', date: '2026-09-01', unitPrice: 11 },
        { key: 'glass|GL-1', vendor: 'Millet', date: '2026-09-15', unitPrice: 24 },
      ],
    };
    const r = computeBid({ job, scopes: [s] });
    const lines = r.scopes[0].material.lines;
    expect(lines.find((l) => l.description.match(/Jamb/)).cost).toBe(64 * 11);
    expect(lines.find((l) => l.group === '02-GLSS').cost).toBe(140 * 24);
    expect(r.flagged.map((f) => f.description)).toEqual([
      expect.stringMatching(/Head/),
    ]);
  });

  it('frames on different system types split into their own breakouts', () => {
    const s = scopesFromFrames([frame(), frame({ systemType: 'Ext SF' })]);
    expect(s.map((x) => x.breakout).sort())
      .toEqual(['Curtain Wall', 'Exterior Storefront']);
  });
});

// ── the whole project ──────────────────────────────────────────────────────

describe('bidFromProject', () => {
  it('merges a frame group into the workspace system on the same breakout', () => {
    const { scopes } = bidFromProject({
      systems: [SYS],                                   // breakout: Exterior Storefront
      frames: [frame({ systemType: 'Ext SF' })],        // same breakout
    });
    expect(scopes).toHaveLength(1);
    const s = scopes[0];
    expect(s.breakout).toBe('Exterior Storefront');
    expect(s.labor.fieldMH).toBe(32 + 18);              // hours add
    expect(s.areaSqFt).toBe(900 + 140);
    expect(s.materials.some((l) => l.quoteKey)).toBe(true);     // RFQ lines joined
    expect(s.materials.some((l) => l.cost === 8955)).toBe(true); // typed lines kept
    expect(s.frameIds).toHaveLength(1);
  });

  it('a frame group with no matching system becomes its own scope', () => {
    const { scopes } = bidFromProject({ systems: [SYS], frames: [frame()] });
    expect(scopes.map((s) => s.breakout).sort())
      .toEqual(['Curtain Wall', 'Exterior Storefront']);
  });

  it('frames alone are a complete bid', () => {
    const bid = bidFromProject({ frames: [frame()], bidSettings: { laborRate: 40, markupPercent: 38 } });
    const r = computeBid(bid);
    expect(r.base.cost).toBeGreaterThan(0);
    expect(r.base.markup).toBeCloseTo(r.base.cost * 0.38, 6);
  });

  it('an empty project is a zero bid, not a crash', () => {
    const r = computeBid(bidFromProject());
    expect(r.base).toMatchObject({ cost: 0, tax: 0, markup: 0, sell: 0 });
  });

  it('end to end, by hand: one scope, every rule visible', () => {
    const bid = bidFromProject({
      systems: [{
        id: 'x', name: 'Glazing Only',
        totals: { shopMHs: 0, distMHs: 0, fieldMHs: 0 },
        laborTasks: [{ label: 'Installation', qty: 21, hoursEach: 1 }],
        materials: [{ costCode: '02-Glass', desc1: '1/4" mono', cost: 250 }],
        laborExtras: { cleaningDays: 2, cleaningHrsPerDay: 1, contingencyHours: 23 },
      }],
      bidSettings: { laborRate: 40, markupPercent: 38, taxPercent: 2, crewSize: 4 },
    });
    const r = computeBid({ ...bid, scopes: bid.scopes.map((s) => ({ ...s, shopDrawingsCostOverride: 0 })) });
    const s = r.scopes[0];

    // labor: 21 install + 2 cleaning + 0.575 contingency = 23.575 MH x $40
    expect(s.labor.totalMH).toBeCloseTo(23.575, 6);
    expect(s.labor.cost).toBeCloseTo(943, 6);
    // material: 250 + 0.5% supplies + 1.25% contingency on the SAME basis
    expect(s.material.supplies).toBeCloseTo(1.25, 6);
    expect(s.material.contingency).toBeCloseTo(3.125, 6);
    expect(s.material.cost).toBeCloseTo(254.375, 6);
    // and the sheet's own figures for this breakout
    expect(s.cost).toBeCloseTo(1197.375, 4);
    expect(s.tax).toBeCloseTo(5.0875, 4);
    expect(s.markup).toBeCloseTo(455.0025, 4);
    expect(s.sell).toBeCloseTo(1657.465, 4);
  });
});
