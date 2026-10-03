/**
 * parametricFrameMath.test.js — die-level BOM + glass math (Gaps 2 & 8).
 *
 * Hand-worked reference frame (an estimator can check every number on paper):
 *   Ext SF storefront, 120" W × 96" H, 3 bays × 2 rows
 *   2" jambs / mullions / head / sill / intermediate horizontal, 3/8" bite,
 *   1/4" total edge clearance
 *
 *   DLO W   = (120 − 2·2 − 2·2) / 3        = 37.3333"   (37 5/16")
 *   DLO H   = (96 − 2 − 2 − 1·2) / 2        = 45.0000"
 *   Glass W = 37.3333 + 0.75 − 0.25         = 37.8333" → order 37 13/16" (37.8125)
 *   Glass H = 45 + 0.75 − 0.25              = 45.5000" → order 45 1/2"
 *
 *   Jamb                       2 @ 96"
 *   Intermediate Vertical      2 @ 96"
 *   Head                       3 @ 37.3333"
 *   Sill                       3 @ 37.3333"
 *   Intermediate Horizontal    3 @ 37.3333"   (1 line × 3 bays)
 *   → 13 pieces, 4·96 + 9·37.3333 = 720" = 60.00 LF
 *   → 6 lites @ 37.8125 × 45.5 = 11.9476 SF → 71.6862 SF
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeFrameGeometry,
  buildMetalCutList,
  buildGlassSchedule,
  buildFrameBOM,
  buildFrameFromTakeoff,
  aggregateRfq,
  systemProfileFor,
  takeoffSystemType,
  asGridCount,
  formatInches,
  floorTo,
  DEFAULT_EDGE_CLEARANCE,
} from '../../engine/parametricFrameMath';
import { groupTakeoffs, framePayloadForGroup } from '../../components/StudioInbox';
import { SYSTEM_GEOMETRY_CATALOG } from '../../data/systemPackages';
import useBidStore from '../../store/useBidStore';

const ZERO_RATES = { getHourlyFunctions: () => ({}), getItemRates: () => ({}), beadsOfCaulk: 2 };

const REF = { width: 120, height: 96, bays: 3, rows: 2, sightline: 2, bite: 0.375 };

// ── helpers ──────────────────────────────────────────────────────────────────

describe('formatInches / floorTo', () => {
  it.each([
    [37.3333, '37 5/16"'],
    [96, '96"'],
    [0.5, '1/2"'],
    [45.5, '45 1/2"'],
    [37.8125, '37 13/16"'],
    [0.0625, '1/16"'],
    [12.25, '12 1/4"'],
  ])('%s → %s', (x, s) => expect(formatInches(x)).toBe(s));

  it('floorTo never rounds a glass size UP, and leaves exact sixteenths alone', () => {
    expect(floorTo(37.8333)).toBe(37.8125);
    expect(floorTo(45.5)).toBe(45.5);
    expect(floorTo(38.0625)).toBe(38.0625);          // float-noise safe
    expect(floorTo(38.0624999)).toBe(38.0);
  });

  it('asGridCount coerces garbage to 1', () => {
    expect([null, 0, NaN, '3', 2.6].map(asGridCount)).toEqual([1, 1, 1, 3, 3]);
  });
});

// ── geometry ─────────────────────────────────────────────────────────────────

describe('computeFrameGeometry — DLO and glass', () => {
  const g = computeFrameGeometry(REF);

  it('subtracts every sightline: 2 jambs + (bays−1) mullions; head + sill + (rows−1) horizontals', () => {
    expect(g.totalVerticalSightlines).toBe(8);
    expect(g.totalHorizontalSightlines).toBe(6);
    expect(g.dloWidth).toBeCloseTo(37.3333, 4);
    expect(g.dloHeight).toBeCloseTo(45, 6);
  });

  it('glass = DLO + 2·bite − 1/4" edge clearance, ordered size rounded DOWN to 1/16"', () => {
    expect(DEFAULT_EDGE_CLEARANCE).toBe(0.25);
    expect(g.glassExactWidth).toBeCloseTo(37.8333, 4);
    expect(g.glassExactHeight).toBeCloseTo(45.5, 6);
    expect(g.glassWidth).toBe(37.8125);
    expect(g.glassHeight).toBe(45.5);
    expect(g.glassWidth).toBeLessThanOrEqual(g.glassExactWidth);
  });

  it('members: verticals full height, horizontals = clear span between vertical faces', () => {
    expect(g.verticalLength).toBe(96);
    expect(g.horizontalLength).toBeCloseTo(37.3333, 4);
    expect(g.horizontalLength).toBeCloseTo(g.dloWidth, 10);
  });

  it('separate jamb / horizontal sightlines and bites are honoured', () => {
    const h = computeFrameGeometry({ ...REF, jambSightline: 2.5, hSightline: 1.75, hBite: 0.5 });
    expect(h.dloWidth).toBeCloseTo((120 - 5 - 4) / 3, 6);            // 37.0
    expect(h.dloHeight).toBeCloseTo((96 - 2 - 2 - 1.75) / 2, 6);     // 45.125
    expect(h.glassExactHeight).toBeCloseTo(45.125 + 1 - 0.25, 6);    // hBite drives height
  });

  it('edge clearance and cut deductions are configurable', () => {
    const h = computeFrameGeometry({ ...REF, edgeClearance: 0, horizontalCutDeduction: 1 / 32, verticalCutDeduction: 0.5 });
    expect(h.glassExactWidth).toBeCloseTo(38.0833, 4);
    expect(h.horizontalLength).toBeCloseTo(37.3333 - 0.03125, 4);
    expect(h.verticalLength).toBe(95.5);
  });

  it('impossible grids warn instead of throwing', () => {
    const bad = computeFrameGeometry({ width: 10, height: 96, bays: 6, rows: 1, sightline: 2, bite: 0.375 });
    expect(bad.dloWidth).toBeLessThan(0);
    expect(bad.warnings[0]).toMatch(/DLO width/);
    expect(buildGlassSchedule(bad)).toEqual([]);
  });
});

// ── die-level cut list ───────────────────────────────────────────────────────

describe('buildMetalCutList — die-level roles', () => {
  it('3×2 reference frame', () => {
    const cut = buildMetalCutList(computeFrameGeometry(REF));
    expect(cut.map(c => [c.role, c.qtyPerFrame, c.lengthInches])).toEqual([
      ['jamb',                    2, 96],
      ['intermediate_vertical',   2, 96],
      ['head',                    3, 37.3333],
      ['sill',                    3, 37.3333],
      ['intermediate_horizontal', 3, 37.3333],
    ]);
    expect(cut[2]).toMatchObject({ roleLabel: 'Head', orientation: 'horizontal', lengthDisplay: '37 5/16"' });
    expect(cut[4].roleLabel).toBe('Transom / Intermediate Horizontal');
    const lf = cut.reduce((s, c) => s + c.lfPerFrame, 0);
    expect(lf).toBeCloseTo(60, 3);
  });

  it('1×1 frame has no intermediates', () => {
    const cut = buildMetalCutList(computeFrameGeometry({ width: 48, height: 84, bays: 1, rows: 1, sightline: 2, bite: 0.375 }));
    expect(cut.map(c => [c.role, c.qtyPerFrame, c.lengthInches])).toEqual([
      ['jamb', 2, 84],
      ['head', 1, 44],
      ['sill', 1, 44],
    ]);
  });

  it('intermediate horizontals = bays × (rows − 1)', () => {
    const cut = buildMetalCutList(computeFrameGeometry({ width: 200, height: 144, bays: 4, rows: 3, sightline: 2, bite: 0.375 }));
    const ih = cut.find(c => c.role === 'intermediate_horizontal');
    expect(ih.qtyPerFrame).toBe(8);
    expect(cut.find(c => c.role === 'intermediate_vertical').qtyPerFrame).toBe(3);
  });
});

// ── RFQ structure ────────────────────────────────────────────────────────────

describe('buildFrameBOM — RFQ-ready structure', () => {
  const bom = buildFrameBOM({
    widthInches: 120, heightInches: 96, systemType: 'Ext SF', bays: 3, rows: 2,
    quantity: 2, elevationTag: 'SF-1', glassType: 'GL-1',
  });

  it('frame header', () => {
    expect(bom.frame).toMatchObject({
      systemType: 'Ext SF', systemName: 'Storefront', systemId: 'sys_storefront',
      topology: 'storefront_vertical_continuous',
      widthInches: 120, heightInches: 96, widthDisplay: '120"', heightDisplay: '96"',
      bays: 3, rows: 2, quantity: 2, elevationTag: 'SF-1',
    });
    expect(bom.dlo).toMatchObject({ widthDisplay: '37 5/16"', heightDisplay: '45"' });
  });

  it('metal lines carry per-frame and total quantities with line ids', () => {
    expect(bom.metal.map(m => m.lineId)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
    expect(bom.metal[0]).toMatchObject({ role: 'jamb', qtyPerFrame: 2, qty: 4, lengthInches: 96, totalLF: 32 });
    expect(bom.metal[2]).toMatchObject({ role: 'head', qtyPerFrame: 3, qty: 6 });
  });

  it('glass line carries ordered + exact size, DLO, bite and clearance', () => {
    expect(bom.glass).toHaveLength(1);
    expect(bom.glass[0]).toMatchObject({
      lineId: 'G1', glassType: 'GL-1', qtyPerFrame: 6, qty: 12,
      widthInches: 37.8125, heightInches: 45.5,
      widthDisplay: '37 13/16"', heightDisplay: '45 1/2"',
      exactWidthInches: 37.8333, exactHeightInches: 45.5,
      dloWidthInches: 37.3333, dloHeightInches: 45,
      bite: 0.375, edgeClearance: 0.25,
    });
    expect(bom.glass[0].sqFtEach).toBeCloseTo(11.9476, 3);
  });

  it('totals', () => {
    expect(bom.totals.metalPieces).toBe(26);
    expect(bom.totals.metalLF).toBeCloseTo(120, 3);
    expect(bom.totals.liteCount).toBe(12);
    expect(bom.totals.glassSqFt).toBeCloseTo(143.372, 2);
    expect(bom.warnings).toEqual([]);
  });
});

// ── system mapping ───────────────────────────────────────────────────────────

describe('systemProfileFor — canonical type → catalog geometry', () => {
  it.each([
    ['Ext SF', 'sys_storefront'],
    ['Int SF', 'sys_int_sf'],
    ['Cap CW', 'sys_cw_cap'],
    ['SSG CW', 'sys_cw_ssg'],
  ])('%s → %s', (type, id) => {
    const { systemType, profile, geometry } = systemProfileFor(type);
    expect(systemType).toBe(type);
    expect(profile.id).toBe(id);
    expect(geometry).toEqual(SYSTEM_GEOMETRY_CATALOG[id].default);
  });

  it('Cap CW 120×96 3×2: 2.5" mullions, 1/2" bite', () => {
    const b = buildFrameBOM({ widthInches: 120, heightInches: 96, systemType: 'Cap CW', bays: 3, rows: 2 });
    expect(b.dlo.widthInches).toBeCloseTo(36.6667, 4);        // (120 − 5 − 5)/3
    expect(b.dlo.heightInches).toBeCloseTo(44.75, 4);         // (96 − 2 − 2 − 2.5)/2
    expect(b.glass[0].exactWidthInches).toBeCloseTo(37.4167, 4);
    expect(b.glass[0].widthInches).toBe(37.375);              // 37 3/8"
    expect(b.glass[0].heightInches).toBe(45.5);
  });
});

// ── project RFQ aggregation ──────────────────────────────────────────────────

describe('aggregateRfq — project-level vendor lines', () => {
  beforeEach(() => useBidStore.setState({ frames: [] }));

  const mk = (over = {}) => buildFrameFromTakeoff(
    { widthInches: 120, heightInches: 96, systemType: 'Ext SF', bayCount: 3, rowCount: 2, quantity: 1, glassType: 'GL-1', ...over },
    { rates: ZERO_RATES },
  );

  it('merges identical sticks and lites across frames and keeps elevation tags', () => {
    const out = aggregateRfq([mk({ mark: 'SF-1' }), mk({ mark: 'SF-2', quantity: 2 })]);
    const jamb = out.metal.find(m => m.role === 'jamb');
    expect(jamb).toMatchObject({ qty: 6, lengthInches: 96, elevationTags: ['SF-1', 'SF-2'] });
    expect(out.glass).toHaveLength(1);
    expect(out.glass[0]).toMatchObject({ qty: 18, widthInches: 37.8125, heightInches: 45.5 });
    expect(out.totals.metalPieces).toBe(13 * 3);
    expect(out.totals.metalLF).toBeCloseTo(180, 3);
    expect(out.metal.map(m => m.lineId)[0]).toBe('M1');
  });

  it('different sizes stay separate lines; sorted by role then length', () => {
    const out = aggregateRfq([mk(), mk({ widthInches: 90, bayCount: 2 })]);
    const heads = out.metal.filter(m => m.role === 'head');
    expect(heads).toHaveLength(2);
    expect(heads[0].lengthInches).toBeGreaterThan(heads[1].lengthInches);
    expect(out.metal[0].role).toBe('jamb');
  });

  it('follows useBidStore.incrementFrameQuantity (reads per-frame qty × current quantity)', () => {
    const f = mk({ mark: 'SF-1' });
    useBidStore.getState().addFrame(f);
    useBidStore.getState().incrementFrameQuantity(f.frameId);
    const out = aggregateRfq(useBidStore.getState().frames);
    expect(out.metal.find(m => m.role === 'jamb').qty).toBe(4);
    expect(out.glass[0].qty).toBe(12);
  });

  it('frames without an rfq block are reported, not guessed', () => {
    const out = aggregateRfq([mk(), { frameId: 'legacy', elevationTag: 'OLD-1', bom: { cutList: [] } }]);
    expect(out.skipped).toEqual(['OLD-1']);
  });
});

// ── bid-cart payload (backward compatible) ───────────────────────────────────

describe('buildFrameFromTakeoff — payload', () => {
  const f = buildFrameFromTakeoff(
    { widthInches: 120, heightInches: 96, systemType: 'Ext SF', bayCount: 3, rowCount: 2, quantity: 2,
      mark: 'SF-1', gridSource: 'geometry', confidence: 0.9, sourceSystemId: 'sys-abc', takeoffIds: ['t1', 't2'] },
    { frameId: 'f1', rates: ZERO_RATES },
  );

  it('legacy fields still present and now die-level', () => {
    expect(f).toMatchObject({ frameId: 'f1', elevationTag: 'SF-1', systemType: 'Ext SF', quantity: 2 });
    expect(f.inputs).toMatchObject({ width: 120, height: 96, bays: 3, rows: 2, edgeClearance: 0.25, systemName: 'Storefront' });
    expect(f.bom.cutList.map(c => c.part)).toEqual(['Jamb', 'Intermediate Vertical', 'Head', 'Sill', 'Transom / Intermediate Horizontal']);
    expect(f.bom.cutList[0]).toMatchObject({ qty: 4, qtyPerFrame: 2, lengthInches: 96 });
    expect(f.bom.glassSizes).toEqual({ glassType: 'Unspecified', widthInches: 37.8125, heightInches: 45.5, qty: 12 });
    expect(f.bom.totalAluminumLF).toBe(120);
    expect(f.bom.glassLitesCount).toBe(12);
    expect(f.bom._detail.glassExactWidth).toBeCloseTo(37.8333, 4);
  });

  it('carries the structured rfq block (without internal geometry)', () => {
    expect(f.bom.rfq.metal).toHaveLength(5);
    expect(f.bom.rfq.glass).toHaveLength(1);
    expect(f.bom.rfq.geometry).toBeUndefined();
    expect(f.ai).toMatchObject({ bayCount: 3, rowCount: 2, gridSource: 'geometry' });
  });

  it('labor fields are finite numbers', () => {
    for (const k of ['shopHours', 'distHours', 'fieldHours', 'totalLaborHours']) {
      expect(Number.isFinite(f.bom[k])).toBe(true);
    }
  });

  it('missing grid → 1×1 default; missing system → Ext SF', () => {
    const g = buildFrameFromTakeoff({ widthInches: 60, heightInches: 84 }, { rates: ZERO_RATES });
    expect(g.inputs).toMatchObject({ bays: 1, rows: 1 });
    expect(g.ai.gridSource).toBe('default');
    expect(g.systemType).toBe('Ext SF');
    expect(g.elevationTag).toBe('60"x84"');
  });
});

describe('takeoffSystemType', () => {
  it('explicit field, then Box & Snap label, then null', () => {
    expect(takeoffSystemType({ systemType: 'Cap CW', label: 'x' })).toBe('Cap CW');
    expect(takeoffSystemType({ label: 'SF-1 — Cap CW' })).toBe('Cap CW');
    expect(takeoffSystemType({ label: 'north wall' })).toBeNull();
  });
});

// ── StudioInbox intake still works end to end ────────────────────────────────

describe('StudioInbox intake → die-level frame', () => {
  const boxSnap = (over = {}) => ({
    id: `t-${Math.random()}`, type: 'Area', widthInches: 120, heightInches: 96,
    label: 'SF-1 — Cap CW', systemType: 'Cap CW', bayCount: 3, rowCount: 2,
    gridSource: 'geometry', mark: 'SF-1', confidence: 0.88, source: 'boxsnap', ...over,
  });

  it('AI Cap CW 3×2 ×2 → Cap CW die-level BOM', () => {
    const [g] = groupTakeoffs([boxSnap(), boxSnap()]);
    const frame = framePayloadForGroup(g);
    expect(frame.systemType).toBe('Cap CW');
    expect(frame.quantity).toBe(2);
    expect(frame.bom.rfq.metal.find(m => m.role === 'intermediate_vertical').qty).toBe(4);
    expect(frame.bom.rfq.glass[0]).toMatchObject({ qty: 12, widthInches: 37.375 });
  });

  it('hand-drawn rect: Ext SF 1×1', () => {
    const [g] = groupTakeoffs([{ id: 'h1', type: 'Area', widthInches: 48, heightInches: 84, label: 'west' }]);
    const frame = framePayloadForGroup(g);
    expect(frame.bom.rfq.metal.map(m => m.role)).toEqual(['jamb', 'head', 'sill']);
    expect(frame.bom.glassSizes).toMatchObject({ widthInches: 44.5, heightInches: 80.5, qty: 1 });
  });
});
