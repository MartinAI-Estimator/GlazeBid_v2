/**
 * partnerPakParser.test.js — Phase 3 validation against a real PartnerPak export
 *
 * Fixture: reference/partnerpak/Alpine Buick GMC-20260723131753.dat
 * Ground truth: reference/partnerpak/Alpine Buick GMC.txt (printed bid reports)
 *   18 unique frames / 38 total across 3 framesets (Exterior SF, Interior SF, EX CW).
 *
 * NOTE: report glass quantities are per-frame lines × NumberThus (S=18, T=3, B=2).
 * The parser reports per-frame lines; NumberThus extraction is Phase 3.1.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePartnerPakDat, computeElevation } from '@glazebid/frame-engine';

const here = dirname(fileURLToPath(import.meta.url));
const DAT = resolve(here, '../../../../../reference/partnerpak/Alpine Buick GMC-20260723131753.dat');
const hasFixture = existsSync(DAT);

// Report ground truth: frameName → [frameSet, width, height]
const GT = {
  'Frame S': ['Exterior Storefront', 56, 32],
  'Frame T': ['Exterior Storefront', 180, 104],
  'Frame L': ['Exterior Storefront', 140, 144],
  'Frame Showroom': ['Exterior Storefront', 220, 144],
  'Frame G': ['Interior Storefront', 154, 120],
  'Frame M': ['Interior Storefront', 1044, 120],
  'Frame K1': ['Interior Storefront', 167, 120],
  'Frame N': ['Interior Storefront', 317, 120],
  'Frame G1': ['Interior Storefront', 317, 120],
  'Frame G2': ['Interior Storefront', 154, 120],
  'Frame F': ['Interior Storefront', 99, 144],
  'Frame A1': ['EX CW', 720, 246],
  'Frame A2': ['EX CW', 720, 246],
  'Frame D': ['EX CW', 470, 246],
  'Frame B': ['EX CW', 60, 246],
  'Frame A': ['EX CW', 420, 246],
  'Frame E': ['EX CW', 530, 246],
  'Glass Ceiling': ['EX CW', 240, 76],
};

describe.skipIf(!hasFixture)('PartnerPak .dat parser — Alpine Buick GMC', () => {
  let proj;
  beforeAll(async () => {
    proj = await parsePartnerPakDat(new Uint8Array(readFileSync(DAT)));
  });

  it('finds the project, 18 frames, 3 framesets', () => {
    expect(proj.projectName).toBe('Alpine Buick GMC');
    expect(proj.frames).toHaveLength(18);
    expect(proj.frameSets.sort()).toEqual(['EX CW', 'Exterior Storefront', 'Interior Storefront']);
  });

  it('matches frameset + dims for all 18 frames vs printed reports', () => {
    for (const f of proj.frames) {
      const gt = GT[f.frameName];
      expect(gt, `unknown frame ${f.frameName}`).toBeDefined();
      expect(f.frameSetName, f.frameName).toBe(gt[0]);
      expect(f.width, `${f.frameName} width`).toBe(gt[1]);
      expect(f.height, `${f.frameName} height`).toBe(gt[2]);
    }
  });

  it('reads vendor/system/finish as data (vendor-neutral: nothing hardcoded)', () => {
    const s = proj.frames.find((f) => f.frameName === 'Frame S');
    expect(s.vendor).toContain('KAWNEER'); // this file happens to be Kawneer — read, not assumed
    expect(s.system).toContain('451T');
    expect(s.backColor).toContain('#14 CLEAR');
    expect(s.laborType).toBe('STANDARD');
  });

  it('parses per-frame glazing with DLO for in-row frames', () => {
    const s = proj.frames.find((f) => f.frameName === 'Frame S');
    expect(s.glazing).toHaveLength(1);
    expect(s.glazing[0].glassWidth).toBe(52.75);   // report: 52 3/4
    expect(s.glazing[0].glassHeight).toBe(28.25);  // report: 28 1/4
    expect(s.glazing[0].dloWidth).toBe(51.9998);
    expect(s.glazing[0].dloHeight).toBe(27.5);
    expect(s.glazing[0].spec).toBe('1 CLEAR INS TE');
  });

  it('report glass sizes are covered by owned + orphan pools', () => {
    const all = [...proj.frames.flatMap((f) => f.glazing), ...proj.orphanGlazing];
    const find = (w, h) =>
      all.filter((g) => Math.abs(g.glassWidth - w) < 0.01 && Math.abs(g.glassHeight - h) < 0.01)
         .reduce((t, g) => t + g.quantity, 0);
    expect(find(52.75, 28.25)).toBe(1);        // Frame S (×18 thus in report)
    expect(find(58.0625, 100.25)).toBe(2);     // Frame T (×3 thus → 6 in report)
    expect(find(56.4375, 116.75)).toBe(11);    // Frame M (thus 1 → 11 in report)
    expect(find(71.75, 13.25)).toBe(4);        // report: 4 × 71 3/4 × 13 1/4
  });
});

describe.skipIf(!hasFixture)('TakeoffEngine reproduces PartnerPak production output', () => {
  it('Frame S: exact glass match using faces derived from the .dat', () => {
    const P = (c, f) => ({ productCode: c, description: c, profileWidth: f, profileDepth: 4.5, glassBite: 0.5, stockLength: 288 });
    const mg = {
      id: '451t', name: 'bG-451T CG/SS/OG', systemType: 'STOREFRONT', thermal: true,
      head: P('H', 2.0002), sill: P('S', 2.4998),
      jambLeft: P('J', 2.0002), jambRight: P('J', 2.0002),
      verticalIntermediate: P('V', 2.0002), horizontalIntermediate: P('Z', 2.0002),
    };
    const r = computeElevation({
      frameName: 'Frame S', overallWidth: 56, overallHeight: 32,
      metalGroup: mg, bays: 1, rows: 1, defaultGlassType: 'TEMPERED',
      glazingTolerance: 0.25, // 1/8" per side — matches PartnerPak's glass deduction
    });
    const lite = r.glassSchedule[0];
    expect(Math.abs(lite.dloWidth - 51.9998)).toBeLessThanOrEqual(1 / 32);
    expect(lite.dloHeight).toBe(27.5);
    expect(lite.glassWidth).toBe(52.75);   // PartnerPak actual: 52 3/4
    expect(lite.glassHeight).toBe(28.25);  // PartnerPak actual: 28 1/4
  });
});
