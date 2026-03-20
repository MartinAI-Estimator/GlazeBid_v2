import React from 'react';
import { 
  GLAZING_CLASSES, 
  TOOL_CATEGORIES, 
  TOOL_MODES, 
  getClassConfig 
} from '../../constants';

const PDFToolbar = ({ activeTool, onSelectTool, onRotate, onExport, onCalibrate }) => {
  // 1. Extract the current Mode and System from the active tool object
  const currentMode = activeTool?.mode || 'Pan';
  const currentSystem = activeTool?.system || null;

  // 2. Helper to switch modes (Area, Polyline, Count)
  const setMode = (mode) => {
    // When switching modes, pick the first valid system for that mode to save clicks
    const modeKey = mode === TOOL_MODES.SMART_FRAME ? 'SMARTFRAME' : mode.toUpperCase();
    const validSystems = TOOL_CATEGORIES[modeKey] || [];
    const newSystem = validSystems.includes(currentSystem) ? currentSystem : validSystems[0];
    
    // Construct the full tool object
    const systemConfig = getClassConfig(newSystem);
    onSelectTool({
      type: mode.toLowerCase(), // For drawing logic
      mode: mode, // For UI state
      system: newSystem,
      label: systemConfig.label,
      color: systemConfig.color,
      layer: newSystem,
      config: systemConfig // Pass full config for units/logic
    });
  };

  // 3. Helper to switch systems (Storefront, Curtain Wall, etc.)
  const setSystem = (systemKey) => {
    const systemConfig = getClassConfig(systemKey);
    onSelectTool({
      ...activeTool,
      system: systemKey,
      label: systemConfig.label,
      color: systemConfig.color,
      layer: systemKey,
      config: systemConfig
    });
  };

  // 4. Filter available systems based on the active Mode
  // e.g. If "Count" is active, don't show "Storefront" if it's not in the Count category
  const activeCategoryKey = currentMode === 'Pan' || currentMode === 'Select' ? 'HIGHLIGHT' : currentMode.toUpperCase();
  const visibleSystems = TOOL_CATEGORIES[activeCategoryKey] || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#333', borderBottom: '1px solid #444' }}>
      
      {/* Tool Indicator - Shows current active tool for E2E testing */}
      <div 
        data-testid="tool-indicator" 
        data-tool={currentMode} 
        data-system={currentSystem || ''}
        aria-hidden="true"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
      />

      {/* ROW 1: STANDARD TOOLS & MODES */}
      <div style={{ height: '40px', display: 'flex', alignItems: 'center', padding: '0 15px', gap: '5px', borderBottom: '1px solid #3d3d3d' }}>
        {/* Navigation */}
        <div style={groupStyle}>
          <button style={btnStyle(currentMode === 'Pan')} onClick={() => onSelectTool({ type: 'pan', mode: 'Pan' })} data-testid="pan-button">✋ Pan</button>
          <button style={btnStyle(currentMode === 'Select')} onClick={() => onSelectTool({ type: 'select', mode: 'Select' })} data-testid="select-button">Select</button>
          <button style={actionBtnStyle} onClick={onRotate} data-testid="rotate-button">↻ Rotate</button>
          {onCalibrate && (
            <button style={btnStyle(currentMode === TOOL_MODES.CALIBRATION)} onClick={onCalibrate} data-testid="calibrate-scale-button">⚖️ Set Scale</button>
          )}
        </div>

        <div style={{ width: '1px', height: '20px', background: '#555', margin: '0 5px' }}></div>

        {/* Measurement Modes */}
        <div style={groupStyle}>
          <button style={btnStyle(currentMode === TOOL_MODES.AREA)} onClick={() => setMode(TOOL_MODES.AREA)}>📐 Area</button>
          <button style={btnStyle(currentMode === TOOL_MODES.SMART_FRAME)} onClick={() => setMode(TOOL_MODES.SMART_FRAME)}>🧩 Smart Frame</button>
          <button style={btnStyle(currentMode === TOOL_MODES.POLYLINE)} onClick={() => setMode(TOOL_MODES.POLYLINE)}>📏 Polyline</button>
          <button style={btnStyle(currentMode === TOOL_MODES.COUNT)} onClick={() => setMode(TOOL_MODES.COUNT)}>1️⃣ Count</button>
          <button style={btnStyle(currentMode === TOOL_MODES.HIGHLIGHT)} onClick={() => setMode(TOOL_MODES.HIGHLIGHT)}>🖊️ Highlight</button>
        </div>
        
        {onExport && (
          <>
            <div style={{ width: '1px', height: '20px', background: '#555', margin: '0 5px' }}></div>
            
            {/* Export to BidSheet */}
            <div style={groupStyle}>
              <button 
                style={exportBtnStyle} 
                onClick={onExport}
                title="Export BidSheet to Excel"
              >
                📤 Export BidSheet
              </button>
            </div>
          </>
        )}
      </div>

      {/* ROW 2: GLAZING SYSTEMS (Dynamic) */}
      {currentMode !== 'Pan' && currentMode !== 'Select' && (
        <div style={{ height: '40px', display: 'flex', alignItems: 'center', padding: '0 15px', gap: '5px', overflowX: 'auto' }}>
          {visibleSystems.map(systemKey => {
            const config = GLAZING_CLASSES[systemKey];
            const isActive = currentSystem === systemKey;
            
            return (
              <button
                key={systemKey}
                onClick={() => setSystem(systemKey)}
                title={systemKey}
                style={{
                  ...chipStyle,
                  background: isActive ? '#4a4a4a' : 'transparent',
                  border: isActive ? `1px solid ${config.color.replace('0.7', '1')}` : '1px solid transparent'
                }}
              >
                {/* Color Dot */}
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: config.color, marginRight: '6px' }}></div>
                {/* Label (Use shortcut if available, else label) */}
                {config.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- STYLES ---
const groupStyle = { display: 'flex', gap: '4px' };

const btnStyle = (isActive) => ({
  background: isActive ? '#3b82f6' : 'transparent',
  color: isActive ? '#fff' : '#ccc',
  border: 'none',
  padding: '6px 10px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
  transition: 'background 0.2s'
});

const actionBtnStyle = {
  background: '#444',
  color: '#ccc',
  border: 'none',
  padding: '6px 10px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px'
};

const exportBtnStyle = {
  background: '#10b981',
  color: '#fff',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
  transition: 'background 0.2s'
};

const chipStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: '12px',
  cursor: 'pointer',
  color: '#ddd',
  fontSize: '11px',
  whiteSpace: 'nowrap',
  transition: 'all 0.2s'
};

export default PDFToolbar;
