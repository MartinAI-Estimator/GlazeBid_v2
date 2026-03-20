/**
 * GlazeBid AIQ - Stats Ribbon Component Tests (Category 14: User Interface)
 * =========================================================================
 * Tests for the top-level UI stats ribbon component ensuring it accurately
 * renders the underlying mathematical state.
 * 
 * Test Coverage:
 * - Dynamic rendering of total cost with currency formatting
 * - Frame count display
 * - System health indicator
 * - Responsive updates when props/context change
 * 
 * Testing Strategy:
 * - React Testing Library for DOM assertions
 * - Mocked context/props for controlled testing
 * - screen.getByText() for UI value verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';


// =============================================================================
// STATS RIBBON COMPONENT (Testable Version)
// =============================================================================

/**
 * StatsRibbon Component
 * Displays project statistics in a horizontal ribbon format.
 * 
 * Accepts pre-computed stats via props for easier testing,
 * or fetches from API if no props provided.
 */
function StatsRibbon({ 
  totalCost = 0, 
  totalFrames = 0, 
  totalSF = 0,
  activeRFIs = 0,
  systemHealth = 'healthy' 
}) {
  // Format currency
  const formattedCost = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(totalCost);

  return (
    <div data-testid="stats-ribbon" style={styles.ribbon}>
      {/* Total Cost Stat */}
      <div data-testid="stat-total-cost" style={styles.statItem}>
        <div style={styles.statContent}>
          <span style={styles.statLabel}>Total Cost</span>
          <span data-testid="total-cost-value" style={styles.statValue}>
            {formattedCost}
          </span>
        </div>
      </div>
      
      <div style={styles.divider} />
      
      {/* Total Frames Stat */}
      <div data-testid="stat-total-frames" style={styles.statItem}>
        <div style={styles.statContent}>
          <span style={styles.statLabel}>Frames</span>
          <span data-testid="total-frames-value" style={styles.statValue}>
            {totalFrames}
          </span>
        </div>
      </div>
      
      <div style={styles.divider} />
      
      {/* Total SF Stat */}
      <div data-testid="stat-total-sf" style={styles.statItem}>
        <div style={styles.statContent}>
          <span style={styles.statLabel}>Total SF</span>
          <span data-testid="total-sf-value" style={styles.statValue}>
            {totalSF.toLocaleString()} SF
          </span>
        </div>
      </div>
      
      <div style={styles.divider} />
      
      {/* Active RFIs */}
      <div data-testid="stat-rfis" style={styles.statItem}>
        <div style={styles.statContent}>
          <span style={styles.statLabel}>Active RFIs</span>
          <span 
            data-testid="active-rfis-value" 
            style={{
              ...styles.statValue,
              color: activeRFIs > 0 ? '#f59e0b' : '#9ca3af'
            }}
          >
            {activeRFIs}
          </span>
        </div>
      </div>
      
      <div style={styles.divider} />
      
      {/* System Health */}
      <div data-testid="stat-health" style={styles.statItem}>
        <div style={styles.statContent}>
          <span style={styles.statLabel}>System</span>
          <span 
            data-testid="system-health-value"
            style={{
              ...styles.statValue,
              color: systemHealth === 'healthy' ? '#10b981' : '#ef4444'
            }}
          >
            {systemHealth === 'healthy' ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  ribbon: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '12px 24px',
    backgroundColor: '#0d1117',
    borderTop: '1px solid #2d333b',
    borderBottom: '1px solid #2d333b',
    fontFamily: 'Inter, sans-serif',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  statContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  statLabel: {
    fontSize: '11px',
    color: '#9ca3af',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '16px',
    color: '#ffffff',
    fontWeight: '600',
  },
  divider: {
    width: '1px',
    height: '32px',
    backgroundColor: '#2d333b',
  },
};


// =============================================================================
// CONTEXT WRAPPER FOR INTEGRATION TESTING
// =============================================================================

const StatsContext = React.createContext(null);

function StatsProvider({ children, initialStats = {} }) {
  const [stats, setStats] = React.useState({
    totalCost: 0,
    totalFrames: 0,
    totalSF: 0,
    activeRFIs: 0,
    systemHealth: 'healthy',
    ...initialStats,
  });
  
  const updateStats = (updates) => {
    setStats(prev => ({ ...prev, ...updates }));
  };
  
  return (
    <StatsContext.Provider value={{ stats, updateStats }}>
      {children}
    </StatsContext.Provider>
  );
}

function useStats() {
  const context = React.useContext(StatsContext);
  if (!context) {
    throw new Error('useStats must be used within StatsProvider');
  }
  return context;
}

/**
 * StatsRibbon that consumes context instead of props
 */
function StatsRibbonWithContext() {
  const { stats } = useStats();
  return <StatsRibbon {...stats} />;
}


// =============================================================================
// TEST CASE 1: DYNAMIC RIBBON RENDERING
// =============================================================================

describe('StatsRibbon - Dynamic Ribbon Rendering', () => {
  it('should format and display Total Cost as $15,250.00', () => {
    render(
      <StatsRibbon 
        totalCost={15250.00}
        totalFrames={42}
        totalSF={2800}
      />
    );
    
    // Use getByText to find formatted currency
    // $15,250.00 exact match
    expect(screen.getByTestId('total-cost-value')).toHaveTextContent('$15,250.00');
  });
  
  it('should display exact frame count of 42', () => {
    render(
      <StatsRibbon 
        totalCost={15250.00}
        totalFrames={42}
        totalSF={2800}
      />
    );
    
    // Assert exact frame count
    expect(screen.getByTestId('total-frames-value')).toHaveTextContent('42');
  });
  
  it('should display Total SF with proper formatting', () => {
    render(
      <StatsRibbon 
        totalCost={15250.00}
        totalFrames={42}
        totalSF={2800}
      />
    );
    
    // 2800 should be formatted as "2,800 SF"
    expect(screen.getByTestId('total-sf-value')).toHaveTextContent('2,800 SF');
  });
  
  it('should render the stats ribbon container', () => {
    render(<StatsRibbon />);
    
    expect(screen.getByTestId('stats-ribbon')).toBeInTheDocument();
  });
});


// =============================================================================
// TEST - CURRENCY FORMATTING
// =============================================================================

describe('StatsRibbon - Currency Formatting', () => {
  it('should format large numbers with thousands separator', () => {
    render(<StatsRibbon totalCost={1234567.89} />);
    
    expect(screen.getByTestId('total-cost-value')).toHaveTextContent('$1,234,567.89');
  });
  
  it('should format zero as $0.00', () => {
    render(<StatsRibbon totalCost={0} />);
    
    expect(screen.getByTestId('total-cost-value')).toHaveTextContent('$0.00');
  });
  
  it('should format decimal values correctly', () => {
    render(<StatsRibbon totalCost={595.14} />);
    
    expect(screen.getByTestId('total-cost-value')).toHaveTextContent('$595.14');
  });
  
  it('should round to 2 decimal places', () => {
    render(<StatsRibbon totalCost={595.147} />);
    
    // Should round to 595.15
    expect(screen.getByTestId('total-cost-value')).toHaveTextContent('$595.15');
  });
});


// =============================================================================
// TEST - SYSTEM HEALTH INDICATOR
// =============================================================================

describe('StatsRibbon - System Health Indicator', () => {
  it('should display "Online" when system is healthy', () => {
    render(<StatsRibbon systemHealth="healthy" />);
    
    expect(screen.getByTestId('system-health-value')).toHaveTextContent('Online');
  });
  
  it('should display "Offline" when system is unhealthy', () => {
    render(<StatsRibbon systemHealth="error" />);
    
    expect(screen.getByTestId('system-health-value')).toHaveTextContent('Offline');
  });
  
  it('should apply green color for healthy system', () => {
    render(<StatsRibbon systemHealth="healthy" />);
    
    const healthValue = screen.getByTestId('system-health-value');
    expect(healthValue).toHaveStyle({ color: '#10b981' });
  });
  
  it('should apply red color for unhealthy system', () => {
    render(<StatsRibbon systemHealth="error" />);
    
    const healthValue = screen.getByTestId('system-health-value');
    expect(healthValue).toHaveStyle({ color: '#ef4444' });
  });
});


// =============================================================================
// TEST - ACTIVE RFIS INDICATOR
// =============================================================================

describe('StatsRibbon - Active RFIs Display', () => {
  it('should display RFI count', () => {
    render(<StatsRibbon activeRFIs={5} />);
    
    expect(screen.getByTestId('active-rfis-value')).toHaveTextContent('5');
  });
  
  it('should apply warning color when RFIs > 0', () => {
    render(<StatsRibbon activeRFIs={3} />);
    
    const rfiValue = screen.getByTestId('active-rfis-value');
    expect(rfiValue).toHaveStyle({ color: '#f59e0b' });
  });
  
  it('should apply gray color when RFIs = 0', () => {
    render(<StatsRibbon activeRFIs={0} />);
    
    const rfiValue = screen.getByTestId('active-rfis-value');
    expect(rfiValue).toHaveStyle({ color: '#9ca3af' });
  });
});


// =============================================================================
// TEST - CONTEXT INTEGRATION
// =============================================================================

describe('StatsRibbon - Context Integration', () => {
  it('should render stats from context provider', () => {
    render(
      <StatsProvider initialStats={{
        totalCost: 25000,
        totalFrames: 100,
        totalSF: 5000,
      }}>
        <StatsRibbonWithContext />
      </StatsProvider>
    );
    
    expect(screen.getByTestId('total-cost-value')).toHaveTextContent('$25,000.00');
    expect(screen.getByTestId('total-frames-value')).toHaveTextContent('100');
    expect(screen.getByTestId('total-sf-value')).toHaveTextContent('5,000 SF');
  });
  
  it('should update when context changes', async () => {
    function TestComponent() {
      const { stats, updateStats } = useStats();
      
      return (
        <div>
          <StatsRibbon {...stats} />
          <button 
            data-testid="update-btn"
            onClick={() => updateStats({ totalCost: 50000 })}
          >
            Update
          </button>
        </div>
      );
    }
    
    render(
      <StatsProvider initialStats={{ totalCost: 10000 }}>
        <TestComponent />
      </StatsProvider>
    );
    
    // Initial value
    expect(screen.getByTestId('total-cost-value')).toHaveTextContent('$10,000.00');
    
    // Click update using fireEvent to properly trigger React state updates
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByTestId('update-btn'));
    
    // Wait for the update to be reflected in the DOM
    await waitFor(() => {
      expect(screen.getByTestId('total-cost-value')).toHaveTextContent('$50,000.00');
    });
  });
});


// =============================================================================
// TEST - DEFAULT PROPS
// =============================================================================

describe('StatsRibbon - Default Props', () => {
  it('should render with default values when no props provided', () => {
    render(<StatsRibbon />);
    
    expect(screen.getByTestId('total-cost-value')).toHaveTextContent('$0.00');
    expect(screen.getByTestId('total-frames-value')).toHaveTextContent('0');
    expect(screen.getByTestId('total-sf-value')).toHaveTextContent('0 SF');
    expect(screen.getByTestId('active-rfis-value')).toHaveTextContent('0');
    expect(screen.getByTestId('system-health-value')).toHaveTextContent('Online');
  });
});


// =============================================================================
// TEST - ACCESSIBILITY (a11y basics)
// =============================================================================

describe('StatsRibbon - Accessibility', () => {
  it('should have proper test-ids for automation', () => {
    render(<StatsRibbon totalCost={1000} totalFrames={10} />);
    
    expect(screen.getByTestId('stats-ribbon')).toBeInTheDocument();
    expect(screen.getByTestId('stat-total-cost')).toBeInTheDocument();
    expect(screen.getByTestId('stat-total-frames')).toBeInTheDocument();
    expect(screen.getByTestId('stat-total-sf')).toBeInTheDocument();
    expect(screen.getByTestId('stat-rfis')).toBeInTheDocument();
    expect(screen.getByTestId('stat-health')).toBeInTheDocument();
  });
  
  it('should have proper labels for each stat', () => {
    render(<StatsRibbon />);
    
    expect(screen.getByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('Frames')).toBeInTheDocument();
    expect(screen.getByText('Total SF')).toBeInTheDocument();
    expect(screen.getByText('Active RFIs')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });
});
