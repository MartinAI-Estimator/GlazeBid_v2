/**
 * systemTypes — canonical enum + translation shim tests
 *
 * Guards AUDIT 8.1: three naming schemes coexisted with no mapping, so a
 * curtain wall frame stored as 'cap-cw' silently got STOREFRONT labor
 * formulas. The shim must make that impossible.
 */
import { describe, it, expect } from 'vitest';
import {
  CANONICAL_SYSTEM_TYPES,
  toCanonicalSystemType,
  tryCanonicalSystemType,
  isCanonicalSystemType,
  toColumnId,
} from '../../utils/systemTypes';
import { getSystemCategory, getSystemTypeConfig } from '../../utils/systemTypeConfig';
import { calcFrameMH } from '../../utils/laborCalcEngine';

describe('canonical enum', () => {
  it('is exactly the four owner-approved names', () => {
    expect(CANONICAL_SYSTEM_TYPES).toEqual(['Ext SF', 'Int SF', 'Cap CW', 'SSG CW']);
  });

  it('canonical names pass through unchanged', () => {
    for (const t of CANONICAL_SYSTEM_TYPES) {
      expect(toCanonicalSystemType(t)).toBe(t);
      expect(isCanonicalSystemType(t)).toBe(true);
    }
  });
});

describe('legacy kebab-case contract ids', () => {
  it.each([
    ['ext-sf-1', 'Ext SF'],
    ['ext-sf-2', 'Ext SF'],
    ['int-sf',   'Int SF'],
    ['cap-cw',   'Cap CW'],
    ['ssg-cw',   'SSG CW'],
  ])('%s → %s', (legacy, canonical) => {
    expect(toCanonicalSystemType(legacy)).toBe(canonical);
  });

  it('instance-suffixed ids resolve to their base type', () => {
    expect(toCanonicalSystemType('ext-sf-1:2')).toBe('Ext SF');
    expect(toCanonicalSystemType('cap-cw:3')).toBe('Cap CW');
  });

  it('round-trips canonical → columnId → canonical', () => {
    expect(toColumnId('Ext SF')).toBe('ext-sf-1');
    expect(toColumnId('Int SF')).toBe('int-sf');
    expect(toColumnId('Cap CW')).toBe('cap-cw');
    expect(toColumnId('SSG CW')).toBe('ssg-cw');
    for (const t of CANONICAL_SYSTEM_TYPES) {
      expect(toCanonicalSystemType(toColumnId(t))).toBe(t);
    }
  });
});

describe('unknown values', () => {
  it("'Studio Takeoff' and garbage default to Ext SF via toCanonicalSystemType", () => {
    expect(toCanonicalSystemType('Studio Takeoff')).toBe('Ext SF');
    expect(toCanonicalSystemType('???')).toBe('Ext SF');
    expect(toCanonicalSystemType(null)).toBe('Ext SF');
  });

  it('tryCanonicalSystemType returns null instead of defaulting', () => {
    expect(tryCanonicalSystemType('Studio Takeoff')).toBeNull();
    expect(tryCanonicalSystemType(null)).toBeNull();
    expect(tryCanonicalSystemType('cap-cw')).toBe('Cap CW');
  });
});

describe('the bug the shim kills: legacy CW ids must get CW formulas', () => {
  it('getSystemCategory resolves legacy ids correctly', () => {
    expect(getSystemCategory('cap-cw')).toBe('curtainwall');
    expect(getSystemCategory('ssg-cw')).toBe('curtainwall');
    expect(getSystemCategory('cap-cw:2')).toBe('curtainwall');
    expect(getSystemCategory('ext-sf-1')).toBe('storefront');
    expect(getSystemCategory('int-sf')).toBe('storefront');
  });

  it('getSystemTypeConfig for cap-cw returns the CW config, not the Ext SF fallback', () => {
    expect(getSystemTypeConfig('cap-cw').category).toBe('curtainwall');
    expect(getSystemTypeConfig('cap-cw').columnId).toBe('cap-cw');
  });

  it("calcFrameMH dispatches a 'cap-cw' frame to the CURTAIN WALL formula", () => {
    // CW caulk divisor is ÷12; SF is ÷20. Same inputs give different caulkMH,
    // so the divisor tells us which formula ran.
    const frame = { quantity: 1, bays: 2, rows: 3, panels: 6, perimeter: 120 };
    const hf = { assemble: {}, install: {}, prep: {}, set: {}, distribution: {} };
    const ir = { caulk: 0.67 };
    const beads = 1;

    const viaLegacy    = calcFrameMH(frame, hf, ir, beads, 'cap-cw');
    const viaCanonical = calcFrameMH(frame, hf, ir, beads, 'Cap CW');
    const viaSF        = calcFrameMH(frame, hf, ir, beads, 'Ext SF');

    expect(viaLegacy.caulkMH).toBeCloseTo((120 / 12) * 0.67, 2);
    expect(viaLegacy.caulkMH).toBe(viaCanonical.caulkMH);
    expect(viaSF.caulkMH).toBeCloseTo((120 / 20) * 0.67, 2);
    expect(viaLegacy.caulkMH).not.toBe(viaSF.caulkMH);
    // CW result shape (verticals/horizontals), not SF shape (bays)
    expect(viaLegacy.counts.verticals).toBe(2);
    expect(viaLegacy.counts.horizontals).toBe(3);
  });
});
