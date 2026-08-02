/**
 * takeoffEngine.test.js — Phase 1 TakeoffEngine validation
 *
 * Ground truth: PartnerPak Studio workbook Exercise 8 (Project 1 TF451 Frame 1)
 *   Frame: 2 panels × 2 rows, 7' 1/2" × 8' 6" (84.5 × 102), BOH @ 28"
 *   Drawing dims: 84 1/2 (O.A.FR) · CUT SIZE 101 7/8 · 39 1/4 per-bay DLO
 *                 row DLOs 70" (top) and 25 7/8" (bottom, sill face 2 1/8")
 */
import { describe, it, expect } from 'vitest';
import {
  computeElevation,
  roughOpeningToFrame,
  formatFraction,
  formatFeetInches,
  roundToFraction,
  estimateStockYield,
  scaleCutList,
} from '@glazebid/frame-engine';

// ── TF451-style metal group (faces measured off the workbook drawing) ────────
const P = (code, face, opts = {}) => ({
  productCode: code,
  description: opts.desc || code,
  profileWidth: face,
  profileDepth: opts.depth ?? 4.5,
  glassBite: opts.bite ?? 0.5,
  stockLength: 288,
});

const TF451 = {
  id: 'm451',
  name: 'M451 CG/SS/OG STOPS UP',
  systemType: 'STOREFRONT',
  thermal: false,
  head: P('451TCG001', 2.0, { desc: 'HEAD' }),
  sill: P('451TCG014', 2.125, { desc: 'SILL' }), // 2 1/8" sill face per drawing
  jambLeft: P('451TCG001', 2.0, { desc: 'JAMB' }),
  jambRight: P('451TCG001', 2.0, { desc: 'JAMB' }),
  verticalIntermediate: P('451TCG002', 2.0, { desc: 'VERTICAL' }),
  horizontalIntermediate: P('451TCG011', 2.0, { desc: 'HORIZONTAL' }),
};

const FRAME_1 = {
  frameName: 'Frame 1',
  quantityThus: 3, // "Number Thus: 3" per Exercise 8
  overallWidth: 84.5,
  overallHeight: 102,
  metalGroup: TF451,
  bays: 2,
  rows: [{ bohHeight: 28 }, {}], // BOH of intermediate horizontal @ 28"
  defaultGlassType: 'TEMPERED',
};

describe('Workbook Exercise 8 — TF451 Frame 1 ground truth', () => {
  const r = computeElevation(FRAME_1);

  it('produces no warnings on a clean frame', () => {
    expect(r.warnings).toEqual([]);
  });

  it('jambs and vertical cut to 101 7/8" (OAH − 2×1/16 tolerance)', () => {
    const jambs = r.metalCutList.filter((c) => c.memberType === 'JAMB');
    expect(jambs).toHaveLength(1); // merged: same part + length
    expect(jambs[0].quantity).toBe(2);
    expect(jambs[0].cutLength).toBe(101.875);
    expect(jambs[0].fractionDisplay).toBe('101 7/8"');

    const vert = r.metalCutList.find((c) => c.memberType === 'VERTICAL');
    expect(vert.quantity).toBe(1);
    expect(vert.cutLength).toBe(101.875);
  });

  it('head and sill butt between jambs: 84.5 − 4 = 80.5"', () => {
    expect(r.metalCutList.find((c) => c.memberType === 'HEAD').cutLength).toBe(80.5);
    expect(r.metalCutList.find((c) => c.memberType === 'SILL').cutLength).toBe(80.5);
  });

  it('bay DLO width is 39 1/4" (42.25 span − 2" jamb − 1" half mullion)', () => {
    for (const lite of r.glassSchedule) {
      expect(lite.dloWidth).toBe(39.25);
    }
  });

  it('intermediate horizontals cut to bay clear width, 1 per bay', () => {
    const horiz = r.metalCutList.find((c) => c.memberType === 'HORIZONTAL');
    expect(horiz.cutLength).toBe(39.25);
    expect(horiz.quantity).toBe(2); // 2 bays × 1 interior boundary
  });

  it('row DLO heights: bottom 25 7/8" (BOH 28 − sill 2 1/8), top 70"', () => {
    const bottom = r.glassSchedule.filter((l) => l.rowIndex === 0);
    const top = r.glassSchedule.filter((l) => l.rowIndex === 1);
    expect(bottom.every((l) => l.dloHeight === 25.875)).toBe(true);
    expect(top.every((l) => l.dloHeight === 70)).toBe(true);
  });

  it('mullion centerline at mid-frame, BOH elevation preserved', () => {
    expect(r.mullionCenterlines).toEqual([42.25]);
    expect(r.bohElevations).toEqual([28]);
  });

  it('glass = DLO + 2×bite (1/2" bite → +1")', () => {
    const lite = r.glassSchedule.find((l) => l.bayIndex === 0 && l.rowIndex === 1);
    expect(lite.glassWidth).toBe(40.25);
    expect(lite.glassHeight).toBe(71);
    expect(lite.glassType).toBe('TEMPERED');
    expect(lite.areaSqFt).toBeCloseTo((40.25 * 71) / 144, 1);
  });

  it('4 lites, quantityThus carried', () => {
    expect(r.glassSchedule).toHaveLength(4);
    expect(r.quantityThus).toBe(3);
  });
});

describe('RO ⇄ OAFR', () => {
  it('deducts shims per spec formula', () => {
    const o = roughOpeningToFrame(86, 103, { left: 0.75, right: 0.75, top: 0.5, bottom: 0.5 });
    expect(o.overallWidth).toBe(84.5);
    expect(o.overallHeight).toBe(102);
  });

  it('computeElevation accepts RO input and warns on bottom shim + door', () => {
    const r = computeElevation({
      ...FRAME_1,
      overallWidth: undefined,
      overallHeight: undefined,
      roWidth: 86,
      roHeight: 103,
      shims: { left: 0.75, right: 0.75, top: 0.5, bottom: 0.5 },
      bays: [{ }, { isDoorBay: true }],
    });
    expect(r.overallWidth).toBe(84.5);
    expect(r.warnings.some((w) => w.code === 'BOTTOM_SHIM_WITH_DOOR')).toBe(true);
  });
});

describe('Explicit bay spans', () => {
  it('honors CL spans and normalizes on mismatch with a warning', () => {
    const ok = computeElevation({ ...FRAME_1, bays: [{ width: 40 }, { width: 44.5 }] });
    expect(ok.warnings).toEqual([]);
    expect(ok.mullionCenterlines).toEqual([40]);

    const bad = computeElevation({ ...FRAME_1, bays: [{ width: 40 }, { width: 40 }] });
    expect(bad.warnings.some((w) => w.code === 'BAY_SUM_MISMATCH')).toBe(true);
    expect(bad.bays[0].width + bad.bays[1].width).toBeCloseTo(84.5, 5);
  });
});

describe('Equal row distribution (no BOH given)', () => {
  it('splits DLO equally: BOH lands at sill + equal share', () => {
    const r = computeElevation({ ...FRAME_1, rows: 2 });
    // total DLO = 102 − 2 (head) − 2.125 (sill) − 2 (horiz) = 95.875 → 47.9375 each
    expect(r.bohElevations[0]).toBeCloseTo(2.125 + 47.9375, 5);
    expect(r.glassSchedule.every((l) => Math.abs(l.dloHeight - 47.9375) < 0.001)).toBe(true);
  });
});

describe('Door bays (Phase 1 scope: sill omission + lite suppression)', () => {
  const r = computeElevation({
    ...FRAME_1,
    bays: [{}, { isDoorBay: true }, {}],
  });

  it('omits sill at the door bay, warns, cuts segments per open bay', () => {
    expect(r.warnings.some((w) => w.code === 'SILL_INTERRUPTED')).toBe(true);
    const sills = r.metalCutList.filter((c) => c.memberType === 'SILL');
    // two segments, same length (equal bays) → merged into one line qty 2
    expect(sills).toHaveLength(1);
    expect(sills[0].quantity).toBe(2);
  });

  it('suppresses row-1 lite in the door bay only', () => {
    const doorBayLites = r.glassSchedule.filter((l) => l.bayIndex === 1);
    expect(doorBayLites.some((l) => l.rowIndex === 0)).toBe(false);
    expect(doorBayLites.some((l) => l.rowIndex === 1)).toBe(true); // transom remains
  });
});

describe('Fraction utilities', () => {
  it('formats reduced fractions', () => {
    expect(formatFraction(101.875)).toBe('101 7/8"');
    expect(formatFraction(39.25)).toBe('39 1/4"');
    expect(formatFraction(96)).toBe('96"');
    expect(formatFraction(0.5)).toBe('1/2"');
  });

  it('rounds to 1/32 by default, 1/64 on request', () => {
    expect(formatFraction(25.8749)).toBe('25 7/8"');
    expect(roundToFraction(70.015)).toBe(70);
    expect(formatFraction(0.015625, 64)).toBe('1/64"');
  });

  it('formats feet-inches', () => {
    expect(formatFeetInches(94.5)).toBe(`7'-10 1/2"`);
    expect(formatFeetInches(102)).toBe(`8'-6"`);
    expect(formatFeetInches(8)).toBe('8"');
  });
});

describe('Stock yield (FFD + kerf)', () => {
  it('packs with 3/16" kerf', () => {
    // 101.875×2 + 80 + 3 kerfs = 284.3125 → all fit one 288" bar
    const y1 = estimateStockYield([101.875, 101.875, 80], 288);
    expect(y1.barsNeeded).toBe(1);

    // 200 + 80 fit together (280.375 with kerfs); 100 overflows to bar 2
    const y2 = estimateStockYield([200, 100, 80], 288);
    expect(y2.barsNeeded).toBe(2);
    expect(y2.bars[0]).toEqual([200, 80]);
  });

  it('computes waste pct for scrap coloring', () => {
    const y = estimateStockYield([280], 288);
    expect(y.wastePct).toBeCloseTo(((288 - 280) / 288) * 100, 0);
  });
});

describe('scaleCutList', () => {
  it('multiplies quantities by quantityThus', () => {
    const r = computeElevation(FRAME_1);
    const scaled = scaleCutList(r.metalCutList, r.quantityThus);
    const jamb = scaled.find((c) => c.memberType === 'JAMB');
    expect(jamb.quantity).toBe(6); // 2 × 3 thus
  });
});
