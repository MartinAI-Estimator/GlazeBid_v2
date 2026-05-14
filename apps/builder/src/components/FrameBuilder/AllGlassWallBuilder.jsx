import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import useAllGlassStore from '../../store/useAllGlassStore';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';
import { fmtIn } from '@glazebid/frame-engine';

// ─── Style Constants ──────────────────────────────────────────────────

const inputStyle = {
  background: '#1a1a1f',
  border: '1px solid #27272a',
  borderRadius: '6px',
  color: '#e4e4e7',
  padding: '6px 10px',
  fontSize: '13px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '11px',
  color: '#a1a1aa',
  marginBottom: '4px',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const sectionHeaderStyle = {
  fontSize: '11px',
  color: '#52525b',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '10px',
  paddingBottom: '6px',
  borderBottom: '1px solid #27272a',
};

const containerStyle = {
  padding: '16px',
  overflow: 'auto',
  height: '100%',
  background: '#111113',
};

const formRowStyle = {
  marginBottom: '14px',
};

const quickButtonGroupStyle = {
  display: 'flex',
  gap: '6px',
  marginTop: '4px',
};

const quickButtonStyle = {
  padding: '4px 8px',
  fontSize: '11px',
  background: '#27272a',
  border: '1px solid #3f3f46',
  borderRadius: '4px',
  color: '#a1a1aa',
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s',
};

const quickButtonActiveStyle = {
  ...quickButtonStyle,
  background: '#fb923c',
  color: '#111113',
  borderColor: '#fb923c',
};

// ─── Helper Components ────────────────────────────────────────────────

/**
 * Format inches to feet-inches display
 */
function formatInchesToFeetInches(inches) {
  if (!inches || inches === 0) return "0'-0\"";
  const feet = Math.floor(inches / 12);
  const inchesRemainder = (inches % 12).toFixed(1);
  return `${feet}'-${inchesRemainder}"`;
}

/**
 * Dual input for feet + inches
 */
function FeetInchesInput({ feet, inches, onFeetChange, onInchesChange, label }) {
  const [feetFocused, setFeetFocused] = useState(false);
  const [inchesFocused, setInchesFocused] = useState(false);

  return (
    <div style={formRowStyle}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
          <input
            type="number"
            placeholder="ft"
            value={feet || 0}
            onChange={(e) => onFeetChange(parseInt(e.target.value, 10) || 0)}
            onFocus={() => setFeetFocused(true)}
            onBlur={() => setFeetFocused(false)}
            style={{
              ...inputStyle,
              borderColor: feetFocused ? '#0ea5e9' : '#27272a',
              flex: 1,
            }}
          />
          <span style={{ color: '#52525b', alignSelf: 'center', fontSize: '13px' }}>ft</span>

          <input
            type="number"
            placeholder="in"
            step="0.1"
            value={inches || 0}
            onChange={(e) => onInchesChange(parseFloat(e.target.value) || 0)}
            onFocus={() => setInchesFocused(true)}
            onBlur={() => setInchesFocused(false)}
            style={{
              ...inputStyle,
              borderColor: inchesFocused ? '#0ea5e9' : '#27272a',
              flex: 1,
            }}
          />
          <span style={{ color: '#52525b', alignSelf: 'center', fontSize: '13px' }}>in</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Stepper input with +/- buttons
 */
function StepperInput({ value, min = 1, max = 50, onChange, label }) {
  const [focused, setFocused] = useState(false);

  const handleIncrement = () => onChange(Math.min(max, (value || min) + 1));
  const handleDecrement = () => onChange(Math.max(min, (value || min) - 1));

  return (
    <div style={formRowStyle}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          onClick={handleDecrement}
          style={{
            padding: '6px 10px',
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '4px',
            color: '#a1a1aa',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value || min}
          onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min)))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            ...inputStyle,
            borderColor: focused ? '#0ea5e9' : '#27272a',
            flex: 1,
          }}
        />
        <button
          onClick={handleIncrement}
          style={{
            padding: '6px 10px',
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '4px',
            color: '#a1a1aa',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function AllGlassWallBuilder() {
  const {
    walls,
    activeWallId,
    addWall,
    updateWall,
    setActiveWall,
    removeWall,
    addPanelToWall,
    removePanelFromWall,
    setPanelWidthOnWall,
    toggleDoorOnWall,
    getActiveWall,
  } = useAllGlassStore();

  const { glassSpecs = [] } = useFrameBuilderStore();

  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const [doorWidthInput, setDoorWidthInput] = useState('36');

  const activeWall = getActiveWall();
  const selectedPanel =
    activeWall && selectedPanelId
      ? activeWall.layout?.panels.find((p) => p.panelId === selectedPanelId)
      : null;

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleAddWall = () => {
    const wallId = addWall();
    setActiveWall(wallId);
    setSelectedPanelId(null);
  };

  const handleRemoveWall = (wallId) => {
    removeWall(wallId);
  };

  const handleTotalRunChange = (feet, inches) => {
    if (activeWall) {
      const totalInches = feet * 12 + inches;
      updateWall(activeWall.wallId, { totalRunInches: totalInches });
    }
  };

  const handleHeightChange = (feet, inches) => {
    if (activeWall) {
      const totalInches = feet * 12 + inches;
      updateWall(activeWall.wallId, { heightInches: totalInches });
    }
  };

  const handleAddPanel = () => {
    if (activeWall?.layout) {
      addPanelToWall(
        activeWall.wallId,
        activeWall.layout.panels.length - 1,
        false
      );
    }
  };

  const handleAddDoor = () => {
    if (activeWall?.layout) {
      const doorWidth = parseFloat(doorWidthInput) || 36;
      addPanelToWall(
        activeWall.wallId,
        activeWall.layout.panels.length - 1,
        true,
        doorWidth
      );
    }
  };

  const handleToggleDoor = () => {
    if (activeWall && selectedPanel) {
      const doorWidth = selectedPanel.isDoor ? 36 : parseFloat(doorWidthInput) || 36;
      toggleDoorOnWall(activeWall.wallId, selectedPanel.panelId, doorWidth);
    }
  };

  const handleRemovePanel = () => {
    if (activeWall && selectedPanel) {
      removePanelFromWall(activeWall.wallId, selectedPanel.panelId);
      setSelectedPanelId(null);
    }
  };

  const handlePanelWidthChange = (newWidth) => {
    if (activeWall && selectedPanel) {
      setPanelWidthOnWall(activeWall.wallId, selectedPanel.panelId, newWidth);
    }
  };

  // ─── Computed Values ──────────────────────────────────────────────

  const panels = activeWall?.layout?.panels || [];
  const totalRun = activeWall?.totalRunInches || 0;
  const totalRunFeet = Math.floor(totalRun / 12);
  const totalRunInches = totalRun % 12;
  const totalHeight = activeWall?.heightInches || 0;
  const totalHeightFeet = Math.floor(totalHeight / 12);
  const totalHeightInches = totalHeight % 12;

  const panelWidths = panels.map((p) => p.widthInches);
  const equalWidth =
    panels.length > 0
      ? totalRun / panels.length
      : 0;
  const allEqual = panelWidths.every((w) => Math.abs(w - equalWidth) < 0.1);

  const heightToThicknessRatio = activeWall?.glassThicknessIn
    ? totalHeight / (activeWall.glassThicknessIn * 12)
    : 0;
  const thicknessLimit =
    activeWall?.glassThicknessIn >= 0.625
      ? 75
      : activeWall?.glassThicknessIn >= 0.5
        ? 65
        : 50;
  const structuralPass = heightToThicknessRatio < thicknessLimit;

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* LEFT PANEL — Wall List + Inputs */}
      <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #27272a', background: '#111113' }}>
        {/* Wall List Header */}
        <div style={{ padding: '12px', borderBottom: '1px solid #27272a', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#e4e4e7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              All-Glass Walls
            </span>
            <button
              onClick={handleAddWall}
              style={{
                padding: '4px 8px',
                background: '#fb923c',
                border: 'none',
                borderRadius: '4px',
                color: '#111113',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>

        {/* Wall List */}
        <div style={{ flex: '0 0 35%', overflow: 'auto', borderBottom: '1px solid #27272a', flexShrink: 0 }}>
          {walls.length === 0 ? (
            <div style={{ padding: '16px', color: '#52525b', fontSize: '12px', textAlign: 'center' }}>
              No walls yet — click + Add to begin
            </div>
          ) : (
            walls.map((wall) => (
              <div
                key={wall.wallId}
                onClick={() => {
                  setActiveWall(wall.wallId);
                  setSelectedPanelId(null);
                }}
                style={{
                  padding: '10px 12px',
                  borderLeft: activeWallId === wall.wallId ? '3px solid #fb923c' : '3px solid transparent',
                  background: activeWallId === wall.wallId ? '#1a1a1f' : '#111113',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  borderBottom: '1px solid #27272a',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#e4e4e7' }}>
                  {wall.mark}
                </div>
                <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>
                  {formatInchesToFeetInches(wall.totalRunInches)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Scrollable Inputs Section */}
        <div style={{ flex: 1, overflow: 'auto', background: '#111113' }}>
          {activeWall ? (
            <div style={containerStyle}>
              {/* WALL IDENTITY */}
              <div style={sectionHeaderStyle}>Identity</div>

              <div style={formRowStyle}>
                <label style={labelStyle}>Mark</label>
                <input
                  type="text"
                  value={activeWall.mark || ''}
                  onChange={(e) =>
                    updateWall(activeWall.wallId, { mark: e.target.value })
                  }
                  style={inputStyle}
                />
              </div>

              <div style={formRowStyle}>
                <label style={labelStyle}>Scope Tag</label>
                <select
                  value={activeWall.scopeTag || 'BASE_BID'}
                  onChange={(e) =>
                    updateWall(activeWall.wallId, { scopeTag: e.target.value })
                  }
                  style={inputStyle}
                >
                  <option value="BASE_BID">Base Bid</option>
                  <option value="ALT_1">Alt 1</option>
                  <option value="ALT_2">Alt 2</option>
                  <option value="ALLOWANCE">Allowance</option>
                </select>
              </div>

              <div style={formRowStyle}>
                <label style={labelStyle}>Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={activeWall.quantity || 1}
                  onChange={(e) =>
                    updateWall(activeWall.wallId, {
                      quantity: Math.max(1, parseInt(e.target.value, 10)),
                    })
                  }
                  style={inputStyle}
                />
              </div>

              <div style={formRowStyle}>
                <label style={labelStyle}>Estimator Notes</label>
                <textarea
                  rows="2"
                  value={activeWall.estimatorNotes || ''}
                  onChange={(e) =>
                    updateWall(activeWall.wallId, {
                      estimatorNotes: e.target.value,
                    })
                  }
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* WALL DIMENSIONS */}
              <div style={sectionHeaderStyle}>Dimensions</div>

              <FeetInchesInput
                feet={totalRunFeet}
                inches={totalRunInches}
                label="Total Run"
                onFeetChange={(f) => handleTotalRunChange(f, totalRunInches)}
                onInchesChange={(i) => handleTotalRunChange(totalRunFeet, i)}
              />
              <div style={{ fontSize: '11px', color: '#52525b', marginTop: '-8px', marginBottom: '8px' }}>
                = {totalRun.toFixed(1)}"
              </div>

              <FeetInchesInput
                feet={totalHeightFeet}
                inches={totalHeightInches}
                label="Height"
                onFeetChange={(f) => handleHeightChange(f, totalHeightInches)}
                onInchesChange={(i) => handleHeightChange(totalHeightFeet, i)}
              />
              <div style={{ fontSize: '11px', color: '#52525b', marginTop: '-8px', marginBottom: '14px' }}>
                = {totalHeight.toFixed(1)}"
              </div>

              <div style={formRowStyle}>
                <label style={labelStyle}>Joint Width (inches)</label>
                <input
                  type="number"
                  step="0.125"
                  value={activeWall.jointWidthInches || 0.375}
                  onChange={(e) =>
                    updateWall(activeWall.wallId, {
                      jointWidthInches: parseFloat(e.target.value) || 0.375,
                    })
                  }
                  style={inputStyle}
                />
                <div style={quickButtonGroupStyle}>
                  {[
                    { label: '1/4"', value: 0.25 },
                    { label: '3/8"', value: 0.375 },
                    { label: '1/2"', value: 0.5 },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      onClick={() =>
                        updateWall(activeWall.wallId, {
                          jointWidthInches: btn.value,
                        })
                      }
                      style={{
                        ...quickButtonStyle,
                        ...(Math.abs(activeWall.jointWidthInches - btn.value) < 0.01
                          ? quickButtonActiveStyle
                          : {}),
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* GLASS */}
              <div style={sectionHeaderStyle}>Glass</div>

              <div style={formRowStyle}>
                <label style={labelStyle}>Glass Thickness</label>
                <select
                  value={activeWall.glassThicknessIn || 0.5}
                  onChange={(e) =>
                    updateWall(activeWall.wallId, {
                      glassThicknessIn: parseFloat(e.target.value),
                    })
                  }
                  style={inputStyle}
                >
                  <option value="0.375">3/8" — Light Partitions</option>
                  <option value="0.5">1/2" — Standard Office</option>
                  <option value="0.625">5/8" — Taller Walls</option>
                  <option value="0.75">3/4" — High Spans</option>
                  <option value="1.0">1" — Structural / Blast</option>
                </select>
              </div>

              <div style={formRowStyle}>
                <label style={labelStyle}>Glass Spec</label>
                <select
                  value={activeWall.glassSpecId || 'GL-1'}
                  onChange={(e) =>
                    updateWall(activeWall.wallId, { glassSpecId: e.target.value })
                  }
                  style={inputStyle}
                >
                  {glassSpecs.length === 0 ? (
                    <option value="GL-1">GL-1</option>
                  ) : (
                    glassSpecs.map((spec) => (
                      <option key={spec.specId} value={spec.specId}>
                        {spec.specId} — {spec.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* HARDWARE */}
              <div style={sectionHeaderStyle}>Hardware</div>

              <div style={formRowStyle}>
                <label style={labelStyle}>Vendor</label>
                <select
                  value={activeWall.hardwareVendorId || 'crl'}
                  onChange={(e) =>
                    updateWall(activeWall.wallId, {
                      hardwareVendorId: e.target.value,
                    })
                  }
                  style={inputStyle}
                >
                  <option value="crl">CRL</option>
                  <option value="dorma">Dorma</option>
                  <option value="assa-abloy">ASSA ABLOY</option>
                  <option value="blumcraft">Blumcraft</option>
                </select>
              </div>

              {/* PANELS */}
              <div style={sectionHeaderStyle}>Panels</div>

              <StepperInput
                value={panels.length}
                min={1}
                max={50}
                label="Panel Count"
                onChange={(newCount) => {
                  const currentCount = panels.length;
                  if (newCount > currentCount) {
                    for (let i = 0; i < newCount - currentCount; i++) {
                      addPanelToWall(
                        activeWall.wallId,
                        panels.length - 1,
                        false
                      );
                    }
                  }
                }}
              />

              <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                <button
                  onClick={handleAddPanel}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    background: '#0ea5e9',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#111113',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}
                >
                  + Glass Panel
                </button>
                <button
                  onClick={handleAddDoor}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    background: '#fb923c',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#111113',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}
                >
                  + Door
                </button>
              </div>

              {/* BOM SUMMARY */}
              {activeWall.lastBOM && (
                <>
                  <div style={sectionHeaderStyle}>BOM Summary</div>

                  <div style={{ fontSize: '12px', color: '#e4e4e7', lineHeight: '1.6' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ color: '#a1a1aa' }}>Total Glass:</span> {activeWall.lastBOM.totalGlassSF?.toFixed(1) || 0} SF
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ color: '#a1a1aa' }}>Base Shoe:</span> {activeWall.lastBOM.baseShoeLF?.toFixed(1) || 0} LF
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ color: '#a1a1aa' }}>Cap Rail:</span> {activeWall.lastBOM.capRailLF?.toFixed(1) || 0} LF
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ color: '#a1a1aa' }}>Silicone Joints:</span> {activeWall.lastBOM.structuralSiliconeJointLF?.toFixed(1) || 0} LF
                    </div>
                    <div>
                      <span style={{ color: '#a1a1aa' }}>Labor Est:</span> {activeWall.lastBOM.laborHours?.toFixed(1) || 0} hrs
                    </div>
                  </div>
                </>
              )}

              {/* Delete Wall Button */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #27272a' }}>
                <button
                  onClick={() => handleRemoveWall(activeWall.wallId)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: '#7f1d1d',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Trash2 size={14} />
                  Delete Wall
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                ...containerStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#52525b',
                fontSize: '13px',
              }}
            >
              Select a wall to configure
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — Visualization */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111113', overflow: 'auto' }}>
        {activeWall ? (
          <div style={{ padding: '20px', overflow: 'auto', height: '100%' }}>
            {/* Panel Strip Visualization */}
            {panels.length > 0 && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    Panel Layout
                  </div>

                  {/* Width labels above */}
                  <div
                    style={{
                      display: 'flex',
                      gap: `${(activeWall.jointWidthInches || 0.375) * 2}px`,
                      marginBottom: '4px',
                    }}
                  >
                    {panels.map((p) => (
                      <div
                        key={p.panelId}
                        style={{
                          flex: p.widthInches,
                          textAlign: 'center',
                          fontSize: '10px',
                          color: '#5a8fa5',
                          fontWeight: '600',
                        }}
                      >
                        {fmtIn(p.widthInches)}
                      </div>
                    ))}
                  </div>

                  {/* Panel strip */}
                  <div
                    style={{
                      display: 'flex',
                      gap: `${(activeWall.jointWidthInches || 0.375) * 2}px`,
                      height: '120px',
                      marginBottom: '12px',
                    }}
                  >
                    {panels.map((panel) => (
                      <div
                        key={panel.panelId}
                        onClick={() => setSelectedPanelId(panel.panelId)}
                        style={{
                          flex: panel.widthInches,
                          background: panel.isDoor
                            ? 'rgba(251,146,60,0.15)'
                            : 'rgba(100,180,220,0.12)',
                          border: `2px solid ${
                            selectedPanelId === panel.panelId
                              ? '#0ea5e9'
                              : panel.isDoor
                                ? '#fb923c'
                                : '#4a7c9e'
                          }`,
                          borderRadius: '4px',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background 0.15s, border-color 0.15s',
                        }}
                      >
                        {/* Door icon */}
                        {panel.isDoor && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '4px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              fontSize: '18px',
                            }}
                          >
                            🚪
                          </div>
                        )}

                        {/* State badge */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            fontSize: '8px',
                            color: '#52525b',
                            textTransform: 'uppercase',
                            fontWeight: '600',
                          }}
                        >
                          {panel.state || 'EQUAL'}
                        </div>

                        {/* Width label at bottom */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '4px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            fontSize: '10px',
                            color: '#a1a1aa',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {panel.widthInches.toFixed(2)}"
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Wall Info Bar */}
                <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '12px', padding: '8px', background: '#1a1a1f', borderRadius: '4px' }}>
                  <div>Total Run: {fmtIn(totalRun)}</div>
                  <div>
                    {panels.length} panel{panels.length !== 1 ? 's' : ''},{' '}
                    {panels.filter((p) => p.isDoor).length} door
                    {panels.filter((p) => p.isDoor).length !== 1 ? 's' : ''}
                  </div>
                  <div>
                    Equal width: {allEqual ? `${equalWidth.toFixed(2)}"` : 'N/A (mixed)'}
                  </div>
                </div>

                {/* Structural Check */}
                <div
                  style={{
                    fontSize: '12px',
                    color: structuralPass ? '#10b981' : '#ef4444',
                    marginBottom: '16px',
                    padding: '8px',
                    background: structuralPass ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    borderRadius: '4px',
                    borderLeft: `3px solid ${structuralPass ? '#10b981' : '#ef4444'}`,
                  }}
                >
                  H/t ratio: {heightToThicknessRatio.toFixed(1)} — {structuralPass ? '✓ OK' : '⚠ Review thickness'}
                </div>

                {/* Selected Panel Controls */}
                {selectedPanel && (
                  <div style={{ background: '#1a1a1f', borderRadius: '4px', padding: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                      Panel Controls
                    </div>

                    <div style={formRowStyle}>
                      <label style={labelStyle}>Width (inches)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={selectedPanel.widthInches || 0}
                        onChange={(e) =>
                          handlePanelWidthChange(parseFloat(e.target.value) || 0)
                        }
                        style={inputStyle}
                      />
                    </div>

                    <div style={formRowStyle}>
                      <label style={labelStyle}>Type</label>
                      <div
                        style={{
                          fontSize: '12px',
                          color: selectedPanel.isDoor ? '#fb923c' : '#a1a1aa',
                          marginBottom: '8px',
                        }}
                      >
                        {selectedPanel.isDoor ? '🚪 Door' : '🔷 Glass'}
                      </div>
                    </div>

                    {!selectedPanel.isDoor && (
                      <div style={formRowStyle}>
                        <label style={labelStyle}>Min width warning</label>
                        {selectedPanel.widthInches < 4 && (
                          <div style={{ fontSize: '12px', color: '#ef4444', padding: '6px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>
                            ⚠ Below 4" minimum
                          </div>
                        )}
                        {selectedPanel.widthInches >= 4 && (
                          <div style={{ fontSize: '12px', color: '#10b981' }}>✓ OK</div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                      <button
                        onClick={handleToggleDoor}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          background: selectedPanel.isDoor ? '#0ea5e9' : '#fb923c',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#111113',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        {selectedPanel.isDoor ? 'Make Glass' : 'Make Door'}
                      </button>
                      <button
                        onClick={handleRemovePanel}
                        style={{
                          padding: '6px 10px',
                          background: '#7f1d1d',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fca5a5',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {panels.length === 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#52525b',
                  fontSize: '14px',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ marginBottom: '12px' }}>Enter wall dimensions and click "+ Glass Panel" or "+ Door" to begin</div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#52525b',
              fontSize: '14px',
            }}
          >
            Select or create a wall to begin
          </div>
        )}
      </div>
    </div>
  );
}
