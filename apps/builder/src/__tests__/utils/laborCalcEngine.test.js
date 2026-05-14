/**
 * laborCalcEngine — Formula Parity Test
 * ======================================
 * Verifies that the JS engine produces the same MH outputs as the
 * reference Bid Sheet Excel (Ext SF 1 tab) for a known dataset.
 *
 * Reference values extracted from:
 *   Bid Sheet.xlsm → "Ext SF 1" tab rows 3-5 (rates, counts, MHs)
 */

import { describe, it, expect } from 'vitest';
import { calcFrameMH, calcSystemMH, mhToCost } from '../../utils/laborCalcEngine';

// ── Rates from Bid Sheet Excel "Ext SF 1" rows 3–5 ──────────────────────

const hf = {
  assemble:     { bays: 0.5,  gtBays: 0.75 },
  clips:        { bays: 0.68, gtBays: 0.68 },
  set:          { bays: 1,    gtBays: 1.5, dlos: 0.75, gtDlos: 1.25 },
  prep:         { dlos: 0.25, gtDlos: 0.25 },
  distribution: { doors: 0.5 },
  install:      { doors: 8 },
};

const ir = {
  joints:     0.25,
  dist:       0.33,
  subsills:   1,
  caulk:      0.67,
  ssg:        0.025,
  steel:      0.5,
  vents:      3,
  brakeMetal: 1,
  open:       0,
};

// ── Build a synthetic "system" that matches the Excel's aggregated counts ──
// The Excel's system-level counts (row 4, "Count"):
//   Joints=568, Dist=348, Subsills=57, Bays=49, >Bays=56,
//   DLOs=104, >DLOs=82, Pairs=2(×2=4), Singles=3,
//   CaulkLF=2908.42, SSG=0, Steel=0, Vents=0, BrakeMetal=18, Open=0
//
// We model this as a single mega-frame with qty=1 to match system totals.

const systemFrame = {
  quantity:    1,
  bays:        49,
  gtBays:      56,
  dlos:        104,
  gtDlos:      82,
  doors:       0,       // doors/pairs/singles are separate in Excel
  pairs:       2,       // raw pair count; engine doubles to 4 door leaves (Excel AB4=AB11*2)
  singles:     3,
  joints:      568,
  perimeter:   0,       // caulk uses separate fixture below
  ssg:         0,
  steel:       0,
  vents:       0,
  brakeMetal:  18,
  open:        0,
  addSubsills: 56,      // subsills = qty + addSubsills*qty = 1 + 56 = 57
};

// For caulk, we need perimeter × beadsOfCaulk = 2908.42 total LF.
// If beadsOfCaulk=2, then perimeter = 2908.42/2 = 1454.21
const beadsOfCaulk = 2;
const caulkFrame = { ...systemFrame, perimeter: 1454.21 };

// ── Expected MH values from Excel row 5 ("MHs") ──────────────────────────

const expected = {
  jointsMH:  142,        // 568 × 0.25
  distMH:    null,       // will compute from dist formula
  subsillsMH: 57,        // 57 × 1
  baysMH:    106.82,     // 49 × (0.5 + 0.68 + 1) = 49 × 2.18
  gtBaysMH:  164.08,     // 56 × (0.75 + 0.68 + 1.5) = 56 × 2.93
  dlosMH:    104,        // 104 × (0.25 + 0.75) = 104 × 1
  gtDlosMH:  123,        // 82 × (0.25 + 1.25) = 82 × 1.5
  doorsMH:   59.5,       // (0+4+3) × (0.5+8) = 7 × 8.5
  caulkMH:   97.43,      // (2908.42/20) × 0.67 = 145.421 × 0.67
  ssgMH:     0,
  steelMH:   0,
  ventsMH:   0,
  brakeMH:   18,         // 18 × 1
  openMH:    0,
};

// distCount = bays + gtBays + dlos + gtDlos + vents + subsills
// = 49 + 56 + 104 + 82 + 0 + 57 = 348
// distMH = 348 × 0.33 = 114.84
expected.distMH = 114.84;

describe('laborCalcEngine — Ext SF 1 parity', () => {

  it('calcFrameMH matches Excel per-category MH values', () => {
    const result = calcFrameMH(caulkFrame, hf, ir, beadsOfCaulk);

    expect(result.jointsMH).toBeCloseTo(expected.jointsMH, 1);
    expect(result.distMH).toBeCloseTo(expected.distMH, 1);
    expect(result.subsillsMH).toBeCloseTo(expected.subsillsMH, 1);
    expect(result.baysMH).toBeCloseTo(expected.baysMH, 1);
    expect(result.gtBaysMH).toBeCloseTo(expected.gtBaysMH, 1);
    expect(result.dlosMH).toBeCloseTo(expected.dlosMH, 1);
    expect(result.gtDlosMH).toBeCloseTo(expected.gtDlosMH, 1);
    expect(result.doorsMH).toBeCloseTo(expected.doorsMH, 1);
    expect(result.caulkMH).toBeCloseTo(expected.caulkMH, 1);
    expect(result.ssgMH).toBeCloseTo(expected.ssgMH, 1);
    expect(result.steelMH).toBeCloseTo(expected.steelMH, 1);
    expect(result.ventsMH).toBeCloseTo(expected.ventsMH, 1);
    expect(result.brakeMH).toBeCloseTo(expected.brakeMH, 1);
    expect(result.openMH).toBeCloseTo(expected.openMH, 1);
  });

  it('totalMH is the sum of all categories', () => {
    const result = calcFrameMH(caulkFrame, hf, ir, beadsOfCaulk);
    const manualTotal = Object.values(expected).reduce((s, v) => s + (v || 0), 0);
    expect(result.totalMH).toBeCloseTo(manualTotal, 0);
  });

  it('Shop / Distribution / Field breakdown matches Excel decomposition', () => {
    const result = calcFrameMH(caulkFrame, hf, ir, beadsOfCaulk);

    // Shop = joints_MH + bays*assemble + gtBays*assemble + dlos*prep + gtDlos*prep
    const expectedShop = 142 + 49 * 0.5 + 56 * 0.75 + 104 * 0.25 + 82 * 0.25;
    // = 142 + 24.5 + 42 + 26 + 20.5 = 255
    expect(result.shopMH).toBeCloseTo(expectedShop, 1);

    // Dist = distMH + doorTotal * distribution_doors
    const expectedDist = 114.84 + 7 * 0.5; // = 114.84 + 3.5 = 118.34
    expect(result.distributionMH).toBeCloseTo(expectedDist, 1);

    // Field = totalMH - shop - dist
    const expectedField = result.totalMH - expectedShop - expectedDist;
    expect(result.fieldMH).toBeCloseTo(expectedField, 1);
  });

  it('calcSystemMH aggregates frame results correctly', () => {
    const frames = [caulkFrame];
    const sysResult = calcSystemMH(frames, hf, ir, beadsOfCaulk);

    expect(sysResult.frameResults).toHaveLength(1);
    expect(sysResult.totalMH).toBeCloseTo(sysResult.frameResults[0].totalMH, 1);
    expect(sysResult.shopMH).toBeCloseTo(sysResult.frameResults[0].shopMH, 1);
  });

  it('mhToCost multiplies correctly', () => {
    expect(mhToCost(100, 42)).toBe(4200);
    expect(mhToCost(0, 42)).toBe(0);
    expect(mhToCost(100, 0)).toBe(0);
  });

  it('handles zero-rate gracefully (all MH = 0)', () => {
    const zeroHf = {
      assemble: { bays: 0, gtBays: 0 },
      clips: { bays: 0, gtBays: 0 },
      set: { bays: 0, gtBays: 0, dlos: 0, gtDlos: 0 },
      prep: { dlos: 0, gtDlos: 0 },
      distribution: { doors: 0 },
      install: { doors: 0 },
    };
    const zeroIr = { joints: 0, dist: 0, subsills: 0, caulk: 0, ssg: 0, steel: 0, vents: 0, brakeMetal: 0, open: 0 };
    const result = calcFrameMH(caulkFrame, zeroHf, zeroIr, beadsOfCaulk);
    expect(result.totalMH).toBe(0);
  });
});
