/**
 * BidSheet Main Component
 * Multi-system estimating with modern UI
 */
import React, { useState, useRef } from 'react';
import { BidSheetProvider, useBidSheet } from '../../context/BidSheetContext';
import { getSystemOptions } from '../../config/systemRegistry';
import './BidSheet.css';

// Subcomponents
import AddSystemButton from './AddSystemButton';
import SystemTabs from './SystemTabs';
import LaborSummaryPanel from './LaborSummaryPanel';
import HrFunctionRatesTable from './HrFunctionRatesTable';
import FrameGridModal from './FrameGridModal';
import LiveCalculationsPanel from './LiveCalculationsPanel';
import BidSheetToolbar from './BidSheetToolbar';
import GlazeBidWorkspace from './GlazeBidWorkspace';

// Error Boundary to catch rendering errors
class BidSheetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('❌ BidSheet Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem'
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '0.5rem',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            maxWidth: '600px'
          }}>
            <h2 style={{ color: '#ef4444', marginTop: 0 }}>❌ BidSheet Error</h2>
            <p style={{ color: '#64748b' }}>The BidSheet component encountered an error:</p>
            <pre style={{
              background: '#f1f5f9',
              padding: '1rem',
              borderRadius: '0.375rem',
              overflow: 'auto',
              fontSize: '0.875rem',
              color: '#1e293b'
            }}>
              {this.state.error?.toString()}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function BidSheetContent({ projectName, onNavigate, bidSettings, onBidSettingsChange }) {
  const {
    selectedSystem,
    setSelectedSystem,
    activeSystems,
    addSystem,
    removeSystem,
    currentSystem,
    frames,
    totals,
    statistics,
    loading,
    error,
    productionRates,
    hrFunctionRates
  } = useBidSheet();

  // 'visual' = new Visual Workspace, 'classic' = original frame grid
  const [mode, setMode] = useState('visual');
  const workspaceRef = useRef(null);

  // In Visual Workspace mode, the PartnerPak drop zone IS the first step,
  // so skip the "no systems" gate and let GlazeBidWorkspace render directly.
  // Only show the Classic empty-state modal when in Classic Grid mode.
  if (mode === 'classic' && activeSystems.length === 0) {
    const allSystemOptions = getSystemOptions();

    return (
      <div className="bidsheet-container" style={{ minHeight: '100vh', background: '#f8fafc' }}>
        {/* Empty State Modal */}
        <div className="bidsheet-empty-modal-overlay">
          <div className="bidsheet-empty-modal">
            <h3 className="add-system-label">Add System:</h3>
            <select 
              className="add-system-select"
              onChange={(e) => {
                if (e.target.value) {
                  addSystem(e.target.value);
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>Select a system...</option>
              {allSystemOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.icon} {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }
  
  // Debug logging
  console.log('🔍 BidSheet Render:', {
    selectedSystem,
    currentSystem,
    framesCount: frames?.length,
    totals,
    loading,
    error,
    productionRates,
    hrFunctionRates
  });
  
  // Loading guard only applies to Classic Grid (Visual Workspace has its own loading states)
  if (mode === 'classic' && (!totals || !productionRates || !hrFunctionRates)) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e2e8f0',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p>Loading BidSheet...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bidsheet-container" style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* ── VISUAL WORKSPACE MODE ── */}
      {mode === 'visual' && (
      <GlazeBidWorkspace ref={workspaceRef} projectName={projectName} onNavigate={onNavigate} bidSettings={bidSettings} onBidSettingsChange={onBidSettingsChange} />
      )}

      {/* ── CLASSIC GRID MODE ── */}
      {mode === 'classic' && (
        <>
          {/* System Tabs */}
          <SystemTabs
            activeSystems={activeSystems}
            selectedSystem={selectedSystem}
            onSelectSystem={setSelectedSystem}
            onAddSystem={addSystem}
            onRemoveSystem={removeSystem}
          />

          {/* Main Content */}
          <div className="bidsheet-content">
            {/* Toolbar for current system */}
            <div className="bidsheet-content-toolbar">
              <BidSheetToolbar />
            </div>

            {/* Top Panel: Labor Summary */}
            <section className="bidsheet-section labor-summary-section">
              <LaborSummaryPanel
                totals={totals}
                hrFunctionRates={hrFunctionRates}
                statistics={statistics}
              />
            </section>

            {/* Hr Function Rates Table */}
            <section className="bidsheet-section hr-rates-section">
              <HrFunctionRatesTable
                hrFunctionRates={hrFunctionRates}
              />
            </section>

            {/* Middle Section: Frame Grid Modal */}
            <div className="bidsheet-main-grid">
              <section className="bidsheet-section frame-grid-section">
                <FrameGridModal
                  systemId={selectedSystem}
                  systemConfig={currentSystem}
                  frames={frames}
                  loading={loading}
                />
              </section>
            </div>
          </div>
        </>
      )}

      {/* Error Display */}
      {error && (
        <div className="bidsheet-error">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}

export default function BidSheet({ project, onNavigate, bidSettings, onBidSettingsChange }) {
  console.log('🎯 BidSheet mounting with project:', project);

  // project can be a string name or an object with a .name property
  const projectName = typeof project === 'string' ? project : project?.name ?? project?.project_name ?? 'unknown';

  return (
    <BidSheetErrorBoundary>
      <BidSheetProvider projectName={projectName}>
        <BidSheetContent projectName={projectName} onNavigate={onNavigate} bidSettings={bidSettings} onBidSettingsChange={onBidSettingsChange} />
      </BidSheetProvider>
    </BidSheetErrorBoundary>
  );
}
