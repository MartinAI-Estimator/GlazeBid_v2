/**
 * laborCalcEngine — CURTAIN WALL + INT SF Formula Parity Tests
 * =============================================================
 * Reference values extracted 2026-08-02 from the REAL Excel:
 *   Warren Bid Sheet.xlsm → 'Cap CW' tab rows 2–7  (curtain wall)
 *   Warren Bid Sheet.xlsm → 'Int SF' tab rows 2–7  (interior storefront)
 *
 * These pin the CW-specific rules that differ subtly and expensively from SF:
 *   - DLO prep split 50% shop / 50% field   (SF prep is 100% shop)
 *   - caulk divisor ÷12                      (SF is ÷20)
 *   - verticals/horizontals counting         (SF counts bays, + clips)
 * A silent CW regression = wrong curtain wall bids. (AUDIT 8.4)
 */
import { describe, it, expect } from 'vitest';
import { calcFrameMH } from '../../utils/laborCalcEngine';

// ── Rates from Warren 'Cap CW' rows 2–3 ─────────────────────────────────────
const hfCW = {
  assemble:     { verticals: 0.25, horizontals: 0.25 },
  install:      { verticals: 1.25, horizontals: 0.25, doors: 6 },
  prep:         { dlos: 0.5,  gtDlos: 0.5 },
  set:          { dlos: 1.25, gtDlos: 2 },
  distribution: { doors: 0.5 },
};
const irCW = {
  joints: 0.5, dist: 0.25, stoolTrim: 1, ft: 1,
  caulk: 0.67, ssg: 0.025, steel: 1, vents: 3, brakeMetal: 1, wlDl: 1,
};

// ── System counts from Warren 'Cap CW' row 4 (modeled as one mega-frame) ─────
// Joints=58, Dist=66(derived), StoolTrim=0, Verticals=13, Horizontals=29,
// F/T=16, DLOs=18, >DLOs=6, Pairs=2(AC4=4 leaves), Singles=0,
// CaulkLF=354.66 (beads=2 → perimeter 177.33), Brake=3
const capCWFrame = {
  quantity: 1,
  verticals: 13,
  horizontals: 29,
  dlos: 18,
  gtDlos: 6,
  pairs: 2,
  singles: 0,
  joints: 58,
  stoolTrim: 0,
  ft: 16,
  perimeter: 177.33,
  ssg: 0, steel: 0, vents: 0, brakeMetal: 3, wlDl: 0,
};
const BEADS = 2;

describe('Cap CW — Warren Bid Sheet parity (row 5 MHs)', () => {
  const r = calcFrameMH(capCWFrame, hfCW, irCW, BEADS, 'Cap CW');

  it('per-category MHs match the Excel row 5 exactly', () => {
    expect(r.jointsMH).toBeCloseTo(29, 2);        // U5
    expect(r.distMH).toBeCloseTo(16.5, 2);        // V5 (distCount 66 × 0.25)
    expect(r.stoolTrimMH).toBeCloseTo(0, 2);      // W5
    expect(r.vertsMH).toBeCloseTo(19.5, 2);       // X5  13 × (0.25+1.25)
    expect(r.horizMH).toBeCloseTo(14.5, 2);       // Y5  29 × (0.25+0.25)
    expect(r.ftMH).toBeCloseTo(16, 2);            // Z5
    expect(r.dlosMH).toBeCloseTo(31.5, 2);        // AA5 18 × 1.75
    expect(r.gtDlosMH).toBeCloseTo(15, 2);        // AB5 6 × 2.5
    expect(r.doorsMH).toBeCloseTo(26, 2);         // AC5 4 leaves × 6.5
    expect(r.caulkMH).toBeCloseTo(19.8, 1);       // AE5 (354.66/12)×0.67 = 19.80185
    expect(r.brakeMH).toBeCloseTo(3, 2);          // AI5
  });

  it('derived distCount matches Excel V4=66 (verts+horiz+dlos+gtDlos+vents+stool)', () => {
    expect(r.counts.distCount).toBe(66);
  });

  it('caulk uses the CW ÷12 divisor on caulkLF 354.66', () => {
    expect(r.counts.caulkLF).toBeCloseTo(354.66, 2);
    expect(r.caulkMH).toBeCloseTo((354.66 / 12) * 0.67, 2);
  });

  it('Shop MH = 45.5 (C4) — proves the 50/50 DLO prep shop/field split', () => {
    // 29 joints + 13×0.25 + 29×0.25 + (0.5/2)×18 + (0.5/2)×6 = 45.5
    expect(r.shopMH).toBeCloseTo(45.5, 2);
  });

  it('Distribution MH = 18.5 (C5)', () => {
    expect(r.distributionMH).toBeCloseTo(18.5, 2);
  });

  it('Field MH = 126.80 (C6)', () => {
    expect(r.fieldMH).toBeCloseTo(126.8, 1);
  });

  it('Total Labor = 190.80 (C7)', () => {
    expect(r.totalMH).toBeCloseTo(190.8, 1);
  });
});

// ── Int SF parity — Warren 'Int SF' tab ─────────────────────────────────────
// Distinct from Ext SF: doors install = 4 (not 8), dist = 0.25 (not 0.33),
// and NO subsills (interior) — the engine must honor an explicit 0.
const hfIntSF = {
  assemble:     { bays: 0.5,  gtBays: 0.75 },
  clips:        { bays: 0.68, gtBays: 0.68 },
  set:          { bays: 1,    gtBays: 1.5, dlos: 0.75, gtDlos: 1.25 },
  prep:         { dlos: 0.25, gtDlos: 0.25 },
  distribution: { doors: 0.5 },
  install:      { doors: 4 },
};
const irIntSF = {
  joints: 0.25, dist: 0.25, subsills: 0,
  caulk: 0.67, ssg: 0.025, steel: 0.5, vents: 3, brakeMetal: 1, open: 0,
};
// Counts row 4: Joints=24, Dist=17, Subsills=0, Bays=6, DLOs=11, Pairs=2(AB4=4),
// CaulkLF=149 (beads=2 → perimeter 74.5)
const intSFFrame = {
  quantity: 1,
  bays: 6,
  gtBays: 0,
  dlos: 11,
  gtDlos: 0,
  pairs: 2,
  singles: 0,
  joints: 24,
  subsills: 0,        // explicit zero — interior storefront has no subsills
  perimeter: 74.5,
  ssg: 0, steel: 0, vents: 0, brakeMetal: 0, open: 0,
};

describe('Int SF — Warren Bid Sheet parity', () => {
  const r = calcFrameMH(intSFFrame, hfIntSF, irIntSF, BEADS, 'Int SF');

  it('per-category MHs match Excel row 5', () => {
    expect(r.jointsMH).toBeCloseTo(6, 2);       // U5 24×0.25
    expect(r.distMH).toBeCloseTo(4.25, 2);      // V5 17×0.25 — needs subsills=0!
    expect(r.subsillsMH).toBeCloseTo(0, 2);     // W5
    expect(r.baysMH).toBeCloseTo(13.08, 2);     // X5 6×2.18
    expect(r.dlosMH).toBeCloseTo(11, 2);        // Z5 11×1.00
    expect(r.doorsMH).toBeCloseTo(18, 2);       // AB5 4 leaves × 4.5
    expect(r.caulkMH).toBeCloseTo(4.99, 2);     // AD5 (149/20)×0.67 = 4.9915 — SF ÷20
  });

  it('distCount = 17 (Excel V4) — an implied subsill would wrongly make it 18', () => {
    expect(r.counts.distCount).toBe(17);
  });

  it('Shop/Dist/Field/Total = 11.75 / 6.25 / 39.32 / 57.32 (C4–C7)', () => {
    expect(r.shopMH).toBeCloseTo(11.75, 2);
    expect(r.distributionMH).toBeCloseTo(6.25, 2);
    expect(r.fieldMH).toBeCloseTo(39.32, 1);
    expect(r.totalMH).toBeCloseTo(57.32, 1);
  });
});
