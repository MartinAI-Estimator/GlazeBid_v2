/**
 * GlazeBid - useBidStore Tests
 * =============================
 * Tests the Zustand bid cart + labor engine store.
 * Covers: addFrame, removeFrame, clearBid, rehydrateBid,
 * incrementFrameQuantity, setLaborRate, and persist middleware behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import useBidStore from '../../store/useBidStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_LABOR_RATES = {
  shopFabVelocity: 10,
  fieldInstVelocity: 25,
  burdenedRatePerHour: 42,
};

/** Create a minimal valid frame payload (as ParametricFrameBuilder would) */
function makeFrame(overrides = {}) {
  return {
    frameId: `frame-${Math.random().toString(36).slice(2, 8)}`,
    elevationTag: 'A01',
    systemType: 'Storefront',
    quantity: 1,
    inputs: { width: 48, height: 84, bays: 2, rows: 1 },
    bom: {
      totalAluminumLF: 24,
      totalGlassSqFt: 28,
      glassLitesCount: 2,
      cutList: [],
      glassSizes: { widthInches: 22, heightInches: 40, qty: 2 },
    },
    ...overrides,
  };
}

// Reset store to clean state before each test
beforeEach(() => {
  useBidStore.getState().clearBid();
  vi.clearAllMocks();
});

// =============================================================================
// CORE CRUD
// =============================================================================

describe('useBidStore - addFrame', () => {
  it('adds a frame and increments frame count', () => {
    useBidStore.getState().addFrame(makeFrame({ elevationTag: 'A01' }));

    const { frames, projectTotals } = useBidStore.getState();
    expect(frames).toHaveLength(1);
    expect(frames[0].elevationTag).toBe('A01');
    expect(projectTotals.totalFrames).toBe(1);
  });

  it('accumulates aluminum LF and glass SF across multiple frames', () => {
    useBidStore.getState().addFrame(makeFrame({ bom: { totalAluminumLF: 20, totalGlassSqFt: 20, glassLitesCount: 1, cutList: [] } }));
    useBidStore.getState().addFrame(makeFrame({ bom: { totalAluminumLF: 10, totalGlassSqFt: 15, glassLitesCount: 1, cutList: [] } }));

    const { projectTotals } = useBidStore.getState();
    expect(projectTotals.totalAluminumLF).toBe(30);
    expect(projectTotals.totalGlassSqFt).toBe(35);
  });

  it('recalculates labor totals after adding a frame', () => {
    // 28 sqft glass, fieldInstVelocity=25 → fieldInstHours = 28/25 = 1.12
    useBidStore.getState().addFrame(makeFrame());

    const { projectTotals } = useBidStore.getState();
    expect(projectTotals.labor.fieldInstHours).toBeCloseTo(28 / 25, 2);
    expect(projectTotals.labor.estimatedLaborCost).toBeGreaterThan(0);
  });
});

describe('useBidStore - removeFrame', () => {
  it('removes the correct frame and updates totals', () => {
    const f1 = makeFrame({ elevationTag: 'A01' });
    const f2 = makeFrame({ elevationTag: 'B01' });

    useBidStore.getState().addFrame(f1);
    useBidStore.getState().addFrame(f2);
    useBidStore.getState().removeFrame(f1.frameId);

    const { frames, projectTotals } = useBidStore.getState();
    expect(frames).toHaveLength(1);
    expect(frames[0].elevationTag).toBe('B01');
    expect(projectTotals.totalFrames).toBe(1);
  });

  it('no-ops gracefully when frameId does not exist', () => {
    useBidStore.getState().addFrame(makeFrame());
    useBidStore.getState().removeFrame('nonexistent-id');

    expect(useBidStore.getState().frames).toHaveLength(1);
  });
});

describe('useBidStore - clearBid', () => {
  it('empties frames array and resets totals to zero', () => {
    useBidStore.getState().addFrame(makeFrame());
    useBidStore.getState().addFrame(makeFrame());
    useBidStore.getState().clearBid();

    const { frames, projectTotals } = useBidStore.getState();
    expect(frames).toHaveLength(0);
    expect(projectTotals.totalFrames).toBe(0);
    expect(projectTotals.labor.estimatedLaborCost).toBe(0);
  });
});

// =============================================================================
// LABOR RATES
// =============================================================================

describe('useBidStore - setLaborRate', () => {
  it('updates burdenedRatePerHour and recalculates labor cost', () => {
    useBidStore.getState().addFrame(makeFrame()); // 28 sqft glass
    const before = useBidStore.getState().projectTotals.labor.estimatedLaborCost;

    useBidStore.getState().setLaborRate('burdenedRatePerHour', 84); // double

    const after = useBidStore.getState().projectTotals.labor.estimatedLaborCost;
    expect(after).toBeCloseTo(before * 2, 1);
  });

  it('keeps the updated rate in state', () => {
    useBidStore.getState().setLaborRate('fieldInstVelocity', 50);
    expect(useBidStore.getState().laborRates.fieldInstVelocity).toBe(50);
  });
});

// =============================================================================
// REHYDRATION
// =============================================================================

describe('useBidStore - rehydrateBid', () => {
  it('replaces frames and recalculates totals from external data', () => {
    useBidStore.getState().addFrame(makeFrame()); // old data

    const incoming = [makeFrame({ elevationTag: 'X01' }), makeFrame({ elevationTag: 'X02' })];
    useBidStore.getState().rehydrateBid({ frames: incoming });

    const { frames, projectTotals } = useBidStore.getState();
    expect(frames).toHaveLength(2);
    expect(frames[0].elevationTag).toBe('X01');
    expect(projectTotals.totalFrames).toBe(2);
  });

  it('stores pendingRehydration when financials are provided', () => {
    const financials = { laborRate: 55, gpmMode: 'auto' };
    useBidStore.getState().rehydrateBid({ frames: [], financials });

    expect(useBidStore.getState().pendingRehydration).toEqual(
      expect.objectContaining({ financials })
    );
  });

  it('clears pendingRehydration when none provided', () => {
    useBidStore.getState().rehydrateBid({ frames: [] });
    expect(useBidStore.getState().pendingRehydration).toBeNull();
  });
});

// =============================================================================
// INCREMENT QUANTITY
// =============================================================================

describe('useBidStore - incrementFrameQuantity', () => {
  it('increments quantity and scales BOM proportionally', () => {
    const f = makeFrame({ quantity: 1, bom: { totalAluminumLF: 20, totalGlassSqFt: 28, glassLitesCount: 2, cutList: [], glassSizes: { widthInches: 22, heightInches: 40, qty: 2 } } });
    useBidStore.getState().addFrame(f);

    useBidStore.getState().incrementFrameQuantity(f.frameId);

    const updated = useBidStore.getState().frames[0];
    expect(updated.quantity).toBe(2);
    expect(updated.bom.totalAluminumLF).toBeCloseTo(40, 1);
    expect(updated.bom.totalGlassSqFt).toBeCloseTo(56, 1);
  });
});

// =============================================================================
// IMPORT BLUEBEAM FRAMES
// =============================================================================

describe('useBidStore - importBluebeamFrames', () => {
  it('adds new frames without duplicating by frameId', () => {
    const f1 = makeFrame({ frameId: 'dup-1' });
    useBidStore.getState().addFrame(f1);

    // Import same frame again + one new one
    const f2 = makeFrame({ frameId: 'new-1' });
    useBidStore.getState().importBluebeamFrames([f1, f2]);

    expect(useBidStore.getState().frames).toHaveLength(2);
  });

  it('no-ops when all incoming frames are duplicates', () => {
    const f = makeFrame({ frameId: 'dup-1' });
    useBidStore.getState().addFrame(f);
    useBidStore.getState().importBluebeamFrames([f]);

    expect(useBidStore.getState().frames).toHaveLength(1);
  });
});

// =============================================================================
// PERSIST MIDDLEWARE – localStorage integration
// =============================================================================

describe('useBidStore - persist middleware', () => {
  it('calls localStorage.setItem with key "glazebid-bid-store" when frames change', () => {
    useBidStore.getState().addFrame(makeFrame());

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'glazebid-bid-store',
      expect.any(String)
    );
  });

  it('persisted payload contains frames and laborRates', () => {
    useBidStore.getState().addFrame(makeFrame({ elevationTag: 'P01' }));

    const calls = localStorage.setItem.mock.calls;
    const storeCall = calls.find(([key]) => key === 'glazebid-bid-store');
    expect(storeCall).toBeDefined();

    const payload = JSON.parse(storeCall[1]);
    expect(payload.state).toHaveProperty('frames');
    expect(payload.state).toHaveProperty('laborRates');
  });

  it('persisted payload does NOT contain projectTotals (derived data)', () => {
    useBidStore.getState().addFrame(makeFrame());

    const calls = localStorage.setItem.mock.calls;
    const storeCall = calls.find(([key]) => key === 'glazebid-bid-store');
    const payload = JSON.parse(storeCall[1]);

    // partialize must have excluded projectTotals
    expect(payload.state).not.toHaveProperty('projectTotals');
  });

  it('persisted payload does NOT contain pendingRehydration (transient data)', () => {
    useBidStore.getState().rehydrateBid({ frames: [], financials: { laborRate: 50 } });

    const calls = localStorage.setItem.mock.calls;
    const storeCall = calls.find(([key]) => key === 'glazebid-bid-store');
    const payload = JSON.parse(storeCall[1]);

    expect(payload.state).not.toHaveProperty('pendingRehydration');
  });
});
