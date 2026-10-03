/**
 * parametricFrameMath.custom.test.js — the custom shapes ported from G4:
 * doors, raked heads, per-bay (uneven) horizontals, sill step-ups, unequal
 * bays, plus the payload round-trip the Builder depends on.
 *
 * Base frame for most cases: Ext SF, 2" sightlines everywhere, 3/8" bite,
 * 1/4" edge clearance → glass = DLO + 1/2", ordered size rounded down to 1/16".
 */

import { describe, it, expect } from 'vitest';
import {
  buildFrameBOM,
  buildFramePayload,
  frameSpecFromPayload,
  builderStateFromFrame,
  buildFrameFromTakeoff,
  aggregateRfq,
  systemTypeForPackageId,
  frameLaborHours,
  floorTo,
  DOOR_HEIGHT,
} from '../../engine/parametricFrameMath';
import { calcFrameMH } from '../../utils/laborCalcEngine';
import useProductionRatesStore from '../../store/useProductionRatesStore';

const ZERO_RATES = { getHourlyFunctions: () => ({}), getItemRates: () => ({}), beadsOfCaulk: 2 };
const roles = (bom) => bom.metal.map(m => [m.role, m.qtyPerFrame, m.lengthInches]);

// ── Doors ────────────────────────────────────────────────────────────────────

describe('door — single, 120" × 120", 3 bays, door in bay 2', () => {
  // DLO W = (120 − 8)/3 = 37.3333.  Vision bays: 120 − 2 − 2 = 116 DLO.
  // Door bay: leaf 0→84, header 84→86, transom 86→118 = 32" DLO.
  const bom = buildFrameBOM({
    widthInches: 120, heightInches: 120, systemType: 'Ext SF', bays: 3, rows: 1,
    door: { type: 'single', bay: 2 },
  });

  it('removes the sill in the door bay and adds a door header', () => {
    expect(roles(bom)).toEqual([
      ['jamb', 2, 120],
      ['intermediate_vertical', 2, 120],
      ['head', 3, 37.3333],
      ['sill', 2, 37.3333],
      ['door_header', 1, 37.3333],
    ]);
    expect(bom.metal.find(m => m.role === 'door_header').note).toMatch(/84" from frame bottom/);
  });

  it('vision lites + one transom lite with exact sizes', () => {
    expect(bom.glass.map(l => [l.liteType, l.qtyPerFrame, l.widthInches, l.heightInches, l.location])).toEqual([
      ['vision', 2, 37.8125, 116.5, 'B1R1, B3R1'],
      ['transom', 1, 37.8125, 32.5, 'B2R1'],
    ]);
    const tr = bom.glass[1];
    expect(tr.dloHeightInches).toBe(32);                           // 120 − 84 − 2 − 2
  });

  it('door package line', () => {
    expect(bom.doors).toEqual([expect.objectContaining({
      lineId: 'D1', type: 'single', leaves: 1, bay: 2,
      openingWidthInches: 37.3333, openingHeightInches: DOOR_HEIGHT, hasTransom: true, qty: 1,
    })]);
    expect(bom.totals).toMatchObject({ liteCount: 3, doorLeaves: 1 });
    expect(bom.warnings).toEqual([]);
  });

  it('labor sees 3 lites and 1 single (G4 double-counted the transom)', () => {
    const rates = useProductionRatesStore.getState();
    const got = frameLaborHours(bom.geometry, 'Ext SF', rates);
    const want = calcFrameMH(
      { quantity: 1, bays: 3, rows: 1, panels: 3, pairs: 0, singles: 1, perimeter: 40 },
      rates.getHourlyFunctions('Ext SF'), rates.getItemRates('Ext SF'), rates.beadsOfCaulk ?? 2, 'Ext SF',
    );
    expect(got.shopHours).toBeCloseTo(want.shopMH, 6);
    expect(got.distHours).toBeCloseTo(want.distributionMH, 6);
    expect(got.fieldHours).toBeCloseTo(want.fieldMH, 6);
    expect(got.fieldHours).toBeGreaterThan(0);
    // G4 counted this frame as 4 panels: prove the difference is real
    const g4 = calcFrameMH(
      { quantity: 1, bays: 3, rows: 1, panels: 4, pairs: 0, singles: 1, perimeter: 40 },
      rates.getHourlyFunctions('Ext SF'), rates.getItemRates('Ext SF'), rates.beadsOfCaulk ?? 2, 'Ext SF',
    );
    expect(g4.shopMH + g4.fieldMH).toBeGreaterThan(want.shopMH + want.fieldMH);
  });
});

describe('door — edge cases', () => {
  it('pair door: 2 leaves', () => {
    const bom = buildFrameBOM({ widthInches: 160, heightInches: 120, systemType: 'Ext SF', bays: 2, rows: 1, door: { type: 'pair', bay: 1 } });
    expect(bom.doors[0]).toMatchObject({ type: 'pair', leaves: 2, openingWidthInches: 77 });
    expect(bom.totals.doorLeaves).toBe(2);
  });

  it('door fills to head (88" frame): no transom, no warning', () => {
    const bom = buildFrameBOM({ widthInches: 120, heightInches: 88, systemType: 'Ext SF', bays: 3, rows: 1, door: { type: 'single', bay: 2 } });
    expect(bom.glass.every(l => l.liteType === 'vision')).toBe(true);
    expect(bom.doors[0].hasTransom).toBe(false);
    expect(bom.warnings).toEqual([]);
  });

  it('frame too short for door + header warns', () => {
    const bom = buildFrameBOM({ widthInches: 120, heightInches: 86, systemType: 'Ext SF', bays: 3, rows: 1, door: { type: 'single', bay: 2 } });
    expect(bom.warnings.join(' ')).toMatch(/door .* taller than the frame/);
  });

  it('narrow door bay warns', () => {
    const bom = buildFrameBOM({ widthInches: 100, heightInches: 120, systemType: 'Ext SF', bays: 3, rows: 1, door: { type: 'single', bay: 2 } });
    expect(bom.warnings.join(' ')).toMatch(/narrower than a nominal single/);
  });

  it('G4 stores the door header itself as an 84" edge in the door bay — it is not double-counted', () => {
    const bom = buildFrameBOM({
      widthInches: 120, heightInches: 120, systemType: 'Ext SF', bays: 3, rows: 2,
      door: { type: 'single', bay: 2 }, bayHorizontals: { 1: [84] },
    });
    expect(bom.metal.find(m => m.role === 'door_header').qtyPerFrame).toBe(1);
    expect(bom.glass.filter(l => l.liteType === 'transom')).toHaveLength(1);
    // rows = 2 still splits the vision bays: (116 − 2)/2 = 57" DLO each
    expect(bom.metal.find(m => m.role === 'intermediate_horizontal').qtyPerFrame).toBe(2);
  });

  it('an extra horizontal above the door header splits the transom', () => {
    const bom = buildFrameBOM({
      widthInches: 120, heightInches: 120, systemType: 'Ext SF', bays: 3, rows: 1,
      door: { type: 'single', bay: 2 }, bayHorizontals: { 1: [84, 100] },
    });
    // member at 2 + 100 = 102 → 104 ; transom zone 86 → 118 → lites 16" and 14"
    const tr = bom.glass.filter(l => l.liteType === 'transom').map(l => l.dloHeightInches).sort((a, b) => a - b);
    expect(tr).toEqual([14, 16]);
  });
});

// ── Raked head ───────────────────────────────────────────────────────────────

describe('raked head — 120" wide, left 96", right 120", 2 bays', () => {
  const W = 120, L = 96, R = 120;
  const cos = W / Math.hypot(W, R - L);                // rake 11.31°
  const bom = buildFrameBOM({
    widthInches: W, heightInches: R, systemType: 'Ext SF', bays: 2, rows: 1,
    shape: { mode: 'raked_head', leftHeight: L, rightHeight: R },
  });
  const h = (x) => L + (R - L) * (x / W);
  const drop = 2 / cos;                                 // head face, measured vertically

  it('reports the rake', () => {
    expect(bom.frame.shape).toBe('raked_head');
    expect(bom.geometry.shape.rakeAngleDeg).toBeCloseTo(11.3099, 3);
  });

  it('verticals are cut to their long point; heads run along the rake', () => {
    const jambs = bom.metal.filter(m => m.role === 'jamb').map(m => m.lengthInches).sort((a, b) => a - b);
    expect(jambs[0]).toBeCloseTo(h(2), 3);               // left jamb, inner face is the long point: 96.4
    expect(jambs[1]).toBeCloseTo(120, 3);                // right jamb, outer face
    const iv = bom.metal.find(m => m.role === 'intermediate_vertical');
    expect(iv.lengthInches).toBeCloseTo(h(61), 3);       // mullion at x 59–61 → 108.2
    const head = bom.metal.find(m => m.role === 'head');
    expect(head.qtyPerFrame).toBe(2);
    expect(head.lengthInches).toBeCloseTo(57 / cos, 3);  // 58.1289 along slope
    expect(head.note).toMatch(/11\.3°/);
    expect(bom.metal.find(m => m.role === 'sill').lengthInches).toBe(57);
  });

  it('raked lites carry left/right heights with the top bite projected onto the slope', () => {
    const lites = bom.glass;
    expect(lites.every(l => l.shape === 'raked')).toBe(true);
    const b1 = lites.find(l => l.location === 'B1R1');
    const expL = floorTo((h(2) - drop - 2) + 0.375 + 0.375 / cos - 0.25);
    const expR = floorTo((h(59) - drop - 2) + 0.375 + 0.375 / cos - 0.25);
    expect(b1.heightLeftInches).toBe(expL);
    expect(b1.heightRightInches).toBe(expR);
    expect(b1.heightInches).toBe(expR);                 // bounding height for quoting
    expect(b1.widthInches).toBe(57.5);
    expect(b1.note).toMatch(/Trapezoid/);
  });
});

// ── Uneven grids ─────────────────────────────────────────────────────────────

describe('per-bay horizontals (uneven grid)', () => {
  // 120 × 96, 3 bays, rows 1 by default; bay 1 gets a horizontal 30" above the sill
  const bom = buildFrameBOM({
    widthInches: 120, heightInches: 96, systemType: 'Ext SF', bays: 3, rows: 1,
    bayHorizontals: { 0: [30] },
  });

  it('only bay 1 is split: 30" lite below, 60" above (94 − 34)', () => {
    expect(bom.glass.map(l => [l.qtyPerFrame, l.heightInches, l.location])).toEqual([
      [2, 92.5, 'B2R1, B3R1'],
      [1, 60.5, 'B1R2'],
      [1, 30.5, 'B1R1'],
    ]);
    expect(bom.metal.find(m => m.role === 'intermediate_horizontal').qtyPerFrame).toBe(1);
  });

  it('a horizontal that does not fit is dropped with a warning', () => {
    const b = buildFrameBOM({ widthInches: 120, heightInches: 96, systemType: 'Ext SF', bays: 3, rows: 1, bayHorizontals: { 0: [93] } });
    expect(b.warnings.join(' ')).toMatch(/does not fit/);
    expect(b.metal.find(m => m.role === 'intermediate_horizontal')).toBeUndefined();
  });
});

describe('sill step-up', () => {
  const bom = buildFrameBOM({
    widthInches: 120, heightInches: 96, systemType: 'Ext SF', bays: 3, rows: 1,
    sillStepUps: { 1: 12 },
  });
  it('raises that bay\'s glass floor and flags its sill', () => {
    expect(bom.glass.map(l => [l.qtyPerFrame, l.heightInches])).toEqual([[2, 92.5], [1, 80.5]]);
    const sills = bom.metal.filter(m => m.role === 'sill');
    expect(sills.map(s => s.qtyPerFrame).sort()).toEqual([1, 2]);
    expect(sills.find(s => s.qtyPerFrame === 1).note).toMatch(/Stepped up \+12"/);
  });
});

describe('unequal bay widths', () => {
  it('uses the given DLO widths when they fit', () => {
    const bom = buildFrameBOM({ widthInches: 120, heightInches: 96, systemType: 'Ext SF', bays: 3, rows: 1, bayWidths: [30, 40, 42] });
    expect(bom.dlo.unequalBays).toBe(true);
    expect(bom.metal.filter(m => m.role === 'head').map(m => m.lengthInches)).toEqual([42, 40, 30]);
    expect(bom.glass.map(l => l.widthInches).sort((a, b) => a - b)).toEqual([30.5, 40.5, 42.5]);
  });
  it('scales them (with a warning) when they do not', () => {
    const bom = buildFrameBOM({ widthInches: 120, heightInches: 96, systemType: 'Ext SF', bays: 2, rows: 1, bayWidths: [1, 3] });
    expect(bom.dlo.perBay.map(b => b.widthInches)).toEqual([28.5, 85.5]);   // (120 − 6) split 1:3
    expect(bom.warnings[0]).toMatch(/scaled/);
  });
});

// ── Payload schema round-trip (the Builder handshake) ───────────────────────

describe('payload ⇄ spec ⇄ builder state round-trip', () => {
  const spec = {
    widthInches: 144, heightInches: 132, systemType: 'Cap CW', bays: 4, rows: 2, quantity: 3,
    elevationTag: 'CW-2', glassType: 'GL-2',
    geometryOverride: { sightline: 2.5, hSightline: 2.5, bite: 0.5, hBite: 0.5 },
    headSightline: 3, sillSightline: 4,
    door: { type: 'pair', bay: 2 },
    shape: { mode: 'raked_head', leftHeight: 120, rightHeight: 132 },
    bayHorizontals: { 0: [40], 3: [30, 70] },
    sillStepUps: { 2: 6 },
  };
  const payload = buildFramePayload(spec, { frameId: 'f-rt', systemLabel: 'Kawneer 1600', preset: 'Kawneer 1600 CW 2.5"', isOverride: false }, ZERO_RATES);

  it('inputs hold everything needed to reopen the frame', () => {
    expect(payload.systemType).toBe('Cap CW');
    expect(payload.inputs).toMatchObject({
      width: 144, height: 132, bays: 4, rows: 2, headSightline: 3, sillSightline: 4,
      systemId: 'sys_cw_cap', systemLabel: 'Kawneer 1600', glassType: 'GL-2',
      shapeMode: 'raked_head', leftLegHeight: 120, rightLegHeight: 132,
      door: { type: 'pair', bay: 2 },
      bayHorizontals: { 0: [40], 3: [30, 70] },
      sillStepUps: { 2: 6 },
    });
    expect(payload.inputs.geometry).toMatchObject({ sightline: 2.5, hSightline: 2.5, bite: 0.5, hBite: 0.5, preset: 'Kawneer 1600 CW 2.5"' });
  });

  it('re-saving the reopened spec reproduces the identical BOM', () => {
    const again = buildFramePayload(frameSpecFromPayload(payload), { frameId: 'f-rt', systemLabel: 'Kawneer 1600', preset: 'Kawneer 1600 CW 2.5"' }, ZERO_RATES);
    expect(again.inputs).toEqual(payload.inputs);
    expect(again.bom.rfq).toEqual(payload.bom.rfq);
    expect(again.bom.totalAluminumLF).toBe(payload.bom.totalAluminumLF);
  });

  it('builder state maps 1:1 to the Builder controls', () => {
    const st = builderStateFromFrame(payload);
    expect(st).toMatchObject({
      frameId: 'f-rt', width: 144, height: 132, bays: 4, rows: 2, quantity: 3,
      elevationTag: 'CW-2', systemLabel: 'Kawneer 1600', glassType: 'GL-2',
      headSightline: 3, sillSightline: 4, doorType: 'pair', doorBay: 2,
      shapeMode: 'raked_head', leftLegHeight: 120, rightLegHeight: 132,
      sillStepUps: { 2: 6 }, bayHorizontals: { 0: [40], 3: [30, 70] },
      preset: 'Kawneer 1600 CW 2.5"', isOverride: false,
    });
    expect(st.systemProfile.id).toBe('sys_cw_cap');
    expect(st.geometry).toEqual({ sightline: 2.5, hSightline: 2.5, bite: 0.5, hBite: 0.5 });
  });

  it('an AI intake frame reopens with its exact size, grid and system', () => {
    const ai = buildFrameFromTakeoff({ widthInches: 120, heightInches: 96, systemType: 'SSG CW', bayCount: 3, rowCount: 2, quantity: 2, mark: 'SF-9' }, { rates: ZERO_RATES });
    const st = builderStateFromFrame(ai);
    expect(st).toMatchObject({ width: 120, height: 96, bays: 3, rows: 2, quantity: 2, elevationTag: 'SF-9', doorType: 'none', shapeMode: 'rectangular', source: 'studio' });
    expect(st.systemProfile.id).toBe('sys_cw_ssg');
  });

  it('legacy G4 saves (free-text systemType, no door object) still reopen', () => {
    const legacy = {
      frameId: 'old', elevationTag: 'Elev-A', systemType: 'Storefront 2×4.5', quantity: 1,
      inputs: { width: 100, height: 90, bays: 2, rows: 1, glassBite: 0.375, mullionSightline: 2, headSightline: 2, sillSightline: 2, systemName: 'Storefront', shapeMode: 'rectangular' },
      bom: { door: { type: 'single', bay: 1 }, glassSizes: { glassType: 'GL-1' } },
    };
    const spec2 = frameSpecFromPayload(legacy);
    expect(spec2).toMatchObject({ systemType: 'Ext SF', widthInches: 100, heightInches: 90, door: { type: 'single', bay: 1 }, glassType: 'GL-1' });
    const st = builderStateFromFrame(legacy);
    expect(st.systemLabel).toBe('Storefront 2×4.5');
  });
});

describe('package id → canonical system type (G4 fed curtain wall labor as Ext SF)', () => {
  it.each([['sys_storefront', 'Ext SF'], ['sys_int_sf', 'Int SF'], ['sys_cw_cap', 'Cap CW'], ['sys_cw_ssg', 'SSG CW']])(
    '%s → %s', (id, t) => expect(systemTypeForPackageId(id)).toBe(t));
});

describe('aggregateRfq carries doors and custom glass', () => {
  it('merges door packages and transom lites across frames', () => {
    const f = (tag, q) => buildFramePayload(
      { widthInches: 120, heightInches: 120, systemType: 'Ext SF', bays: 3, rows: 1, quantity: q, door: { type: 'single', bay: 2 } },
      { elevationTag: tag }, ZERO_RATES,
    );
    const out = aggregateRfq([f('E1', 1), f('E2', 2)]);
    expect(out.doors).toEqual([expect.objectContaining({ type: 'single', qty: 3, elevationTags: ['E1', 'E2'] })]);
    expect(out.glass.find(g => g.liteType === 'transom')).toMatchObject({ qty: 3, heightInches: 32.5 });
    expect(out.metal.find(m => m.role === 'door_header').qty).toBe(3);
    expect(out.totals.doorLeaves).toBe(3);
  });
});
