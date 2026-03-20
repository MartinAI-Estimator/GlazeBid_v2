/**
 * GlazeBid AIQ - BidSheet Context Tests (Category 15: State Management)
 * ======================================================================
 * Tests for React Context state management, reducers, and running totals.
 * Validates that frame additions and global rate changes propagate correctly.
 * 
 * Test Coverage:
 * - ADD_FRAME action with geometry data
 * - UPDATE_GLOBAL_RATE for labor cost recalculation
 * - Derived totalProjectCost instant recalculation
 * - Context provider wrapper behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useEffect } from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';


// =============================================================================
// MOCK BIDSHEET CONTEXT (Simplified for Testing)
// =============================================================================

/**
 * Simplified BidSheet reducer for testing state transitions.
 * This mirrors the core logic of the real BidSheetContext.
 */
const BidSheetActionTypes = {
  ADD_FRAME: 'ADD_FRAME',
  UPDATE_FRAME: 'UPDATE_FRAME',
  DELETE_FRAME: 'DELETE_FRAME',
  UPDATE_GLOBAL_RATE: 'UPDATE_GLOBAL_RATE',
  RECALCULATE_TOTALS: 'RECALCULATE_TOTALS',
  SET_FRAMES: 'SET_FRAMES',
};

/**
 * Default production rates (matches backend defaults)
 */
const DEFAULT_RATES = {
  shopRate: 45.00,    // $ per labor hour
  fieldRate: 55.00,
  distRate: 35.00,
  shopMHsPerSF: 0.110,
  fieldMHsPerSF: 0.264,
  distMHsPerSF: 0.051,
};

/**
 * Calculate frame costs based on rates
 */
function calculateFrameCosts(frame, rates) {
  const sf = frame.sf || 0;
  
  const shopMHs = sf * rates.shopMHsPerSF;
  const fieldMHs = sf * rates.fieldMHsPerSF;
  const distMHs = sf * rates.distMHsPerSF;
  
  const shopCost = shopMHs * rates.shopRate;
  const fieldCost = fieldMHs * rates.fieldRate;
  const distCost = distMHs * rates.distRate;
  
  return {
    ...frame,
    shop_mhs: shopMHs,
    field_mhs: fieldMHs,
    dist_mhs: distMHs,
    total_mhs: shopMHs + fieldMHs + distMHs,
    shop_cost: shopCost,
    field_cost: fieldCost,
    dist_cost: distCost,
    total_cost: shopCost + fieldCost + distCost,
  };
}

/**
 * Calculate totals from frames array
 */
function calculateTotals(frames) {
  return {
    totalFrames: frames.length,
    totalQuantity: frames.reduce((sum, f) => sum + (f.quantity || 0), 0),
    totalSF: frames.reduce((sum, f) => sum + (f.sf || 0), 0),
    shopMHs: frames.reduce((sum, f) => sum + (f.shop_mhs || 0), 0),
    fieldMHs: frames.reduce((sum, f) => sum + (f.field_mhs || 0), 0),
    distMHs: frames.reduce((sum, f) => sum + (f.dist_mhs || 0), 0),
    totalMHs: frames.reduce((sum, f) => sum + (f.total_mhs || 0), 0),
    shopCost: frames.reduce((sum, f) => sum + (f.shop_cost || 0), 0),
    fieldCost: frames.reduce((sum, f) => sum + (f.field_cost || 0), 0),
    distCost: frames.reduce((sum, f) => sum + (f.dist_cost || 0), 0),
    totalCost: frames.reduce((sum, f) => sum + (f.total_cost || 0), 0),
  };
}

/**
 * BidSheet Reducer - Core state management logic
 */
function bidSheetReducer(state, action) {
  switch (action.type) {
    case BidSheetActionTypes.ADD_FRAME: {
      const newFrame = calculateFrameCosts(action.payload, state.rates);
      const newFrames = [...state.frames, newFrame];
      const newTotals = calculateTotals(newFrames);
      
      return {
        ...state,
        frames: newFrames,
        totals: newTotals,
      };
    }
    
    case BidSheetActionTypes.UPDATE_FRAME: {
      const updatedFrames = state.frames.map(frame =>
        frame.id === action.payload.id
          ? calculateFrameCosts({ ...frame, ...action.payload }, state.rates)
          : frame
      );
      const newTotals = calculateTotals(updatedFrames);
      
      return {
        ...state,
        frames: updatedFrames,
        totals: newTotals,
      };
    }
    
    case BidSheetActionTypes.DELETE_FRAME: {
      const filteredFrames = state.frames.filter(f => f.id !== action.payload);
      const newTotals = calculateTotals(filteredFrames);
      
      return {
        ...state,
        frames: filteredFrames,
        totals: newTotals,
      };
    }
    
    case BidSheetActionTypes.UPDATE_GLOBAL_RATE: {
      const newRates = { ...state.rates, ...action.payload };
      
      // Recalculate ALL frames with new rates
      const recalculatedFrames = state.frames.map(frame =>
        calculateFrameCosts(frame, newRates)
      );
      const newTotals = calculateTotals(recalculatedFrames);
      
      return {
        ...state,
        rates: newRates,
        frames: recalculatedFrames,
        totals: newTotals,
      };
    }
    
    case BidSheetActionTypes.SET_FRAMES: {
      const framesWithCosts = action.payload.map(frame =>
        calculateFrameCosts(frame, state.rates)
      );
      const newTotals = calculateTotals(framesWithCosts);
      
      return {
        ...state,
        frames: framesWithCosts,
        totals: newTotals,
      };
    }
    
    default:
      return state;
  }
}

/**
 * Initial state for reducer
 */
const initialState = {
  frames: [],
  rates: { ...DEFAULT_RATES },
  totals: {
    totalFrames: 0,
    totalQuantity: 0,
    totalSF: 0,
    shopMHs: 0,
    fieldMHs: 0,
    distMHs: 0,
    totalMHs: 0,
    shopCost: 0,
    fieldCost: 0,
    distCost: 0,
    totalCost: 0,
  },
};

// =============================================================================
// REACT CONTEXT (Test Implementation)
// =============================================================================

const BidSheetContext = React.createContext(null);

function BidSheetProvider({ children, initialRates = {} }) {
  const [state, dispatch] = React.useReducer(
    bidSheetReducer,
    {
      ...initialState,
      rates: { ...DEFAULT_RATES, ...initialRates },
    }
  );
  
  const value = React.useMemo(() => ({
    frames: state.frames,
    rates: state.rates,
    totals: state.totals,
    addFrame: (frameData) => dispatch({ type: BidSheetActionTypes.ADD_FRAME, payload: frameData }),
    updateFrame: (frameData) => dispatch({ type: BidSheetActionTypes.UPDATE_FRAME, payload: frameData }),
    deleteFrame: (frameId) => dispatch({ type: BidSheetActionTypes.DELETE_FRAME, payload: frameId }),
    updateGlobalRate: (rateUpdate) => dispatch({ type: BidSheetActionTypes.UPDATE_GLOBAL_RATE, payload: rateUpdate }),
    setFrames: (frames) => dispatch({ type: BidSheetActionTypes.SET_FRAMES, payload: frames }),
  }), [state]);
  
  return (
    <BidSheetContext.Provider value={value}>
      {children}
    </BidSheetContext.Provider>
  );
}

function useBidSheet() {
  const context = React.useContext(BidSheetContext);
  if (!context) {
    throw new Error('useBidSheet must be used within BidSheetProvider');
  }
  return context;
}


// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Sample frame fixture with basic geometry
 */
const createTestFrame = (overrides = {}) => ({
  id: `frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  tag: 'A01',
  quantity: 2,
  width: 48,
  height: 84,
  sf: 28,  // 48*84/144 = 28 SF
  dlos: 1,
  ...overrides,
});


// =============================================================================
// TEST CASE 1: FRAME ADDITION & RECALCULATION
// =============================================================================

describe('BidSheetContext - Frame Addition & Recalculation', () => {
  it('should append frame and recalculate totalProjectCost instantly', () => {
    // Test component that uses the context
    let contextValue = null;
    
    function TestComponent() {
      contextValue = useBidSheet();
      return <div data-testid="test-component">Test</div>;
    }
    
    // Render with provider
    render(
      <BidSheetProvider>
        <TestComponent />
      </BidSheetProvider>
    );
    
    // Verify initial state
    expect(contextValue.frames).toHaveLength(0);
    expect(contextValue.totals.totalCost).toBe(0);
    
    // Add a frame
    const newFrame = createTestFrame({
      tag: 'A01',
      quantity: 2,
      sf: 28,
    });
    
    act(() => {
      contextValue.addFrame(newFrame);
    });
    
    // Verify frame was appended
    expect(contextValue.frames).toHaveLength(1);
    expect(contextValue.frames[0].tag).toBe('A01');
    expect(contextValue.frames[0].quantity).toBe(2);
    
    // Verify totalCost recalculated based on default rates
    // With 28 SF at default rates:
    // shopMHs = 28 * 0.110 = 3.08
    // fieldMHs = 28 * 0.264 = 7.392
    // distMHs = 28 * 0.051 = 1.428
    // shopCost = 3.08 * 45 = 138.60
    // fieldCost = 7.392 * 55 = 406.56
    // distCost = 1.428 * 35 = 49.98
    // totalCost = 138.60 + 406.56 + 49.98 = 595.14
    expect(contextValue.totals.totalCost).toBeCloseTo(595.14, 1);
    expect(contextValue.totals.totalFrames).toBe(1);
    expect(contextValue.totals.totalSF).toBe(28);
  });
  
  it('should accumulate costs when adding multiple frames', () => {
    let contextValue = null;
    
    function TestComponent() {
      contextValue = useBidSheet();
      return null;
    }
    
    render(
      <BidSheetProvider>
        <TestComponent />
      </BidSheetProvider>
    );
    
    // Add first frame
    act(() => {
      contextValue.addFrame(createTestFrame({ tag: 'A01', sf: 28 }));
    });
    
    const costAfterFirst = contextValue.totals.totalCost;
    
    // Add second frame with different SF
    act(() => {
      contextValue.addFrame(createTestFrame({ tag: 'A02', sf: 42 }));
    });
    
    // Should have 2 frames
    expect(contextValue.frames).toHaveLength(2);
    
    // Total cost should be higher than first frame alone
    expect(contextValue.totals.totalCost).toBeGreaterThan(costAfterFirst);
    
    // SF should accumulate
    expect(contextValue.totals.totalSF).toBe(70); // 28 + 42
  });
});


// =============================================================================
// TEST CASE 2: GLOBAL RATE OVERRIDE
// =============================================================================

describe('BidSheetContext - Global Rate Override', () => {
  it('should update total labor cost across all frames when rate changes', () => {
    let contextValue = null;
    
    function TestComponent() {
      contextValue = useBidSheet();
      return null;
    }
    
    render(
      <BidSheetProvider>
        <TestComponent />
      </BidSheetProvider>
    );
    
    // Add frames first
    act(() => {
      contextValue.addFrame(createTestFrame({ tag: 'A01', sf: 28 }));
      contextValue.addFrame(createTestFrame({ tag: 'A02', sf: 42 }));
    });
    
    const costBefore = contextValue.totals.totalCost;
    const shopCostBefore = contextValue.totals.shopCost;
    
    // Verify initial shop rate
    expect(contextValue.rates.shopRate).toBe(45.00);
    
    // Update global shop rate from $45 to $50
    act(() => {
      contextValue.updateGlobalRate({ shopRate: 50.00 });
    });
    
    // Verify rate changed
    expect(contextValue.rates.shopRate).toBe(50.00);
    
    // Shop cost should increase proportionally (50/45 = 1.111 increase)
    const expectedShopCostAfter = shopCostBefore * (50 / 45);
    expect(contextValue.totals.shopCost).toBeCloseTo(expectedShopCostAfter, 1);
    
    // Total cost should be higher
    expect(contextValue.totals.totalCost).toBeGreaterThan(costBefore);
    
    // Field and dist costs should remain unchanged
    // (since we only changed shopRate)
  });
  
  it('should propagate rate change to individual frame calculations', () => {
    let contextValue = null;
    
    function TestComponent() {
      contextValue = useBidSheet();
      return null;
    }
    
    render(
      <BidSheetProvider>
        <TestComponent />
      </BidSheetProvider>
    );
    
    // Add a frame
    act(() => {
      contextValue.addFrame(createTestFrame({ tag: 'A01', sf: 100 }));
    });
    
    const frameBefore = contextValue.frames[0];
    
    // Update shop rate
    act(() => {
      contextValue.updateGlobalRate({ shopRate: 60.00 });
    });
    
    const frameAfter = contextValue.frames[0];
    
    // Frame shop_cost should be recalculated
    // With 100 SF: shopMHs = 100 * 0.110 = 11
    // At $60/hour: shopCost = 11 * 60 = 660
    expect(frameAfter.shop_cost).toBeCloseTo(660, 1);
    
    // At previous $45/hour it was: 11 * 45 = 495
    expect(frameBefore.shop_cost).toBeCloseTo(495, 1);
  });
  
  it('should handle multiple rate updates in sequence', () => {
    let contextValue = null;
    
    function TestComponent() {
      contextValue = useBidSheet();
      return null;
    }
    
    render(
      <BidSheetProvider>
        <TestComponent />
      </BidSheetProvider>
    );
    
    // Add frame
    act(() => {
      contextValue.addFrame(createTestFrame({ sf: 100 }));
    });
    
    // Update multiple rates
    act(() => {
      contextValue.updateGlobalRate({ shopRate: 50.00 });
    });
    
    act(() => {
      contextValue.updateGlobalRate({ fieldRate: 65.00 });
    });
    
    // Both rates should be updated
    expect(contextValue.rates.shopRate).toBe(50.00);
    expect(contextValue.rates.fieldRate).toBe(65.00);
    
    // Total should reflect both changes
    // shopMHs = 100 * 0.110 = 11, cost = 11 * 50 = 550
    // fieldMHs = 100 * 0.264 = 26.4, cost = 26.4 * 65 = 1716
    // distMHs = 100 * 0.051 = 5.1, cost = 5.1 * 35 = 178.5
    // Total = 550 + 1716 + 178.5 = 2444.5
    expect(contextValue.totals.totalCost).toBeCloseTo(2444.5, 1);
  });
});


// =============================================================================
// EDGE CASES
// =============================================================================

describe('BidSheetContext - Edge Cases', () => {
  it('should handle deleting frames and recalculate totals', () => {
    let contextValue = null;
    
    function TestComponent() {
      contextValue = useBidSheet();
      return null;
    }
    
    render(
      <BidSheetProvider>
        <TestComponent />
      </BidSheetProvider>
    );
    
    // Add two frames
    let frameId1, frameId2;
    act(() => {
      const frame1 = createTestFrame({ id: 'frame-1', tag: 'A01', sf: 28 });
      const frame2 = createTestFrame({ id: 'frame-2', tag: 'A02', sf: 42 });
      frameId1 = frame1.id;
      frameId2 = frame2.id;
      contextValue.addFrame(frame1);
      contextValue.addFrame(frame2);
    });
    
    expect(contextValue.frames).toHaveLength(2);
    expect(contextValue.totals.totalSF).toBe(70);
    
    // Delete first frame
    act(() => {
      contextValue.deleteFrame('frame-1');
    });
    
    expect(contextValue.frames).toHaveLength(1);
    expect(contextValue.totals.totalSF).toBe(42);
    expect(contextValue.frames[0].tag).toBe('A02');
  });
  
  it('should handle zero SF frames gracefully', () => {
    let contextValue = null;
    
    function TestComponent() {
      contextValue = useBidSheet();
      return null;
    }
    
    render(
      <BidSheetProvider>
        <TestComponent />
      </BidSheetProvider>
    );
    
    // Add frame with zero SF
    act(() => {
      contextValue.addFrame(createTestFrame({ sf: 0 }));
    });
    
    expect(contextValue.frames).toHaveLength(1);
    expect(contextValue.totals.totalCost).toBe(0);
    expect(contextValue.frames[0].total_cost).toBe(0);
  });
  
  it('should throw error when used outside provider', () => {
    function TestComponent() {
      useBidSheet();
      return null;
    }
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useBidSheet must be used within BidSheetProvider');
  });
});


// =============================================================================
// REDUCER UNIT TESTS
// =============================================================================

describe('BidSheet Reducer - Unit Tests', () => {
  it('should return initial state for unknown action', () => {
    const state = bidSheetReducer(initialState, { type: 'UNKNOWN_ACTION' });
    expect(state).toBe(initialState);
  });
  
  it('should handle SET_FRAMES action', () => {
    const frames = [
      { id: '1', tag: 'A01', sf: 28, quantity: 1 },
      { id: '2', tag: 'A02', sf: 42, quantity: 2 },
    ];
    
    const state = bidSheetReducer(initialState, {
      type: BidSheetActionTypes.SET_FRAMES,
      payload: frames,
    });
    
    expect(state.frames).toHaveLength(2);
    expect(state.totals.totalSF).toBe(70);
    
    // Each frame should have calculated costs
    expect(state.frames[0].total_cost).toBeGreaterThan(0);
    expect(state.frames[1].total_cost).toBeGreaterThan(0);
  });
});
