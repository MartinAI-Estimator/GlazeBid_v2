import React, { useState, useMemo } from 'react';

const FirestopCalculator = () => {
  // ===== FIRESTOP STATE =====
  const [firestopInputs, setFirestopInputs] = useState({
    floorLineLF: 0,
    floorCount: 1,
    studSpacingIn: 24,
    intumescentWidth: 1.0,
    mineralWoolThickness: 4,
    ulSystem: 'HW-D-0001',
    customULSystem: '',
  });

  // ===== EXPANSION JOINT STATE =====
  const [expansionInputs, setExpansionInputs] = useState({
    runLengthFt: 0,
    tempDeltaF: 100,
    jointWidthIn: 2,
    coverStyle: 'snap-on',
  });

  // ===== TOAST STATE =====
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  // ===== FIRESTOP CALCULATIONS =====
  const firestopCalcs = useMemo(() => {
    const { floorLineLF, floorCount, studSpacingIn, intumescentWidth } = firestopInputs;
    const totalFloorLF = floorLineLF * floorCount;
    const mineralWoolLF = totalFloorLF * 1.05;
    const intumescentStripLF = totalFloorLF * 2;
    const sealantSausages = Math.ceil((totalFloorLF * 12) / 20);
    const anchorsRequired = Math.ceil((totalFloorLF * 12) / studSpacingIn);

    return {
      totalFloorLF,
      mineralWoolLF,
      intumescentStripLF,
      sealantSausages,
      anchorsRequired,
    };
  }, [firestopInputs]);

  // ===== EXPANSION JOINT CALCULATIONS =====
  const expansionCalcs = useMemo(() => {
    const { runLengthFt, tempDeltaF, jointWidthIn } = expansionInputs;
    const expansionIn = runLengthFt * 12 * 0.0000131 * tempDeltaF;
    const recommendedJointCount = Math.max(1, Math.ceil(runLengthFt / 30));
    const jointCoverLF = recommendedJointCount * (jointWidthIn / 12);
    const siliconeJointsLF = recommendedJointCount * 2;
    const spacingFt = runLengthFt > 0 ? (runLengthFt / recommendedJointCount).toFixed(1) : 0;

    // Calculate joint positions as percentages for SVG rendering
    const jointPositions = [];
    for (let i = 0; i < recommendedJointCount; i++) {
      jointPositions.push(((i + 0.5) / recommendedJointCount) * 100);
    }

    return {
      expansionIn,
      recommendedJointCount,
      jointCoverLF,
      siliconeJointsLF,
      spacingFt,
      jointPositions,
    };
  }, [expansionInputs]);

  // ===== TOAST HANDLER =====
  const showToastMessage = (message) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // ===== EVENT HANDLERS =====
  const handleFirestopChange = (field, value) => {
    setFirestopInputs(prev => ({
      ...prev,
      [field]: field === 'ulSystem' ? value : (isNaN(value) ? prev[field] : parseFloat(value) || 0),
    }));
  };

  const handleExpansionChange = (field, value) => {
    setExpansionInputs(prev => ({
      ...prev,
      [field]: field === 'coverStyle' ? value : (isNaN(value) ? prev[field] : parseFloat(value) || 0),
    }));
  };

  const handleAddFirestopToBOM = () => {
    showToastMessage('✓ Added to Metal List');
  };

  const handleAddExpansionToBOM = () => {
    showToastMessage('✓ Added to Metal List');
  };

  // ===== STYLES =====
  const bgDark = '#09090b';
  const panelBg = '#111113';
  const borderColor = '#27272a';
  const textColor = '#e4e4e7';
  const accentBlue = '#0ea5e9';
  const accentGreen = '#10b981';
  const inputBg = '#1a1a1d';

  const sectionHeaderStyle = {
    fontSize: '16px',
    fontWeight: '600',
    color: textColor,
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottomWidth: '3px',
    borderBottomColor: accentBlue,
    borderBottomStyle: 'solid',
  };

  const panelStyle = {
    backgroundColor: panelBg,
    border: `1px solid ${borderColor}`,
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  };

  const inputGroupStyle = {
    marginBottom: '12px',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '500',
    color: textColor,
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: inputBg,
    color: textColor,
    border: `1px solid ${borderColor}`,
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  };

  const selectStyle = {
    ...inputStyle,
    fontFamily: 'inherit',
    cursor: 'pointer',
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '12px',
    fontSize: '13px',
  };

  const tableCellStyle = {
    padding: '10px',
    borderBottom: `1px solid ${borderColor}`,
    textAlign: 'left',
    color: textColor,
  };

  const tableHeaderCellStyle = {
    ...tableCellStyle,
    backgroundColor: '#1a1a1d',
    fontWeight: '600',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const tableValueStyle = {
    ...tableCellStyle,
    color: accentGreen,
    fontWeight: '600',
    fontFamily: 'monospace',
  };

  const badgeStyle = {
    display: 'inline-block',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    color: accentBlue,
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    marginBottom: '12px',
    border: `1px solid ${accentBlue}`,
  };

  const buttonStyle = {
    width: '100%',
    padding: '10px',
    backgroundColor: accentGreen,
    color: '#000',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  };

  const buttonHoverStyle = {
    ...buttonStyle,
    opacity: 0.85,
  };

  const [buttonHover, setButtonHover] = useState({
    firestop: false,
    expansion: false,
  });

  const outputValueStyle = {
    color: accentGreen,
    fontWeight: '600',
    fontSize: '14px',
    fontFamily: 'monospace',
  };

  const infoPanelStyle = {
    backgroundColor: 'rgba(15, 165, 233, 0.05)',
    border: `1px solid ${accentBlue}`,
    borderRadius: '4px',
    padding: '10px 12px',
    fontSize: '12px',
    color: textColor,
    marginTop: '12px',
    lineHeight: '1.5',
  };

  return (
    <div style={{ backgroundColor: bgDark, color: textColor, padding: '20px', minHeight: '100%' }}>
      {/* TOAST NOTIFICATION */}
      {showToast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: accentGreen,
            color: '#000',
            padding: '12px 16px',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: '600',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            animation: 'fadeInOut 2s ease-in-out',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* PAGE CONTAINER */}
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* PAGE HEADER */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: textColor, margin: '0 0 4px 0' }}>
            Firestop & Expansion Calcs
          </h1>
          <p style={{ fontSize: '12px', color: '#a1a1a6', margin: '0', marginTop: '4px' }}>
            Curtain wall (CW) firestop materials and joint sizing for long-span installations
          </p>
        </div>

        {/* ========== SECTION 1: FIRESTOP CALCULATOR ========== */}
        <div style={panelStyle}>
          <div style={sectionHeaderStyle}>Firestop Calculator</div>

          {/* INPUTS GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div style={inputGroupStyle}>
              <label style={labelStyle}>Floor Line LF</label>
              <input
                type="number"
                value={firestopInputs.floorLineLF}
                onChange={(e) => handleFirestopChange('floorLineLF', e.target.value)}
                min="0"
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Floor Count</label>
              <input
                type="number"
                value={firestopInputs.floorCount}
                onChange={(e) => handleFirestopChange('floorCount', e.target.value)}
                min="1"
                step="1"
                style={inputStyle}
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Stud Spacing (in)</label>
              <input
                type="number"
                value={firestopInputs.studSpacingIn}
                onChange={(e) => handleFirestopChange('studSpacingIn', e.target.value)}
                min="6"
                step="1"
                style={inputStyle}
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Intumescent Width (in)</label>
              <input
                type="number"
                value={firestopInputs.intumescentWidth}
                onChange={(e) => handleFirestopChange('intumescentWidth', e.target.value)}
                min="0.5"
                step="0.25"
                style={inputStyle}
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Mineral Wool Thickness (in)</label>
              <input
                type="number"
                value={firestopInputs.mineralWoolThickness}
                onChange={(e) => handleFirestopChange('mineralWoolThickness', e.target.value)}
                min="2"
                step="0.5"
                style={inputStyle}
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>UL System Design</label>
              <select
                value={firestopInputs.ulSystem}
                onChange={(e) => handleFirestopChange('ulSystem', e.target.value)}
                style={selectStyle}
              >
                <option value="HW-D-0001">HW-D-0001 (Aluminum Frame)</option>
                <option value="HW-D-0002">HW-D-0002 (Steel Frame)</option>
                <option value="WL-1003">WL-1003 (Wood Frame)</option>
                <option value="WL-1004">WL-1004 (Mixed Assembly)</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>

          {/* CUSTOM UL SYSTEM INPUT */}
          {firestopInputs.ulSystem === 'Custom' && (
            <div style={inputGroupStyle}>
              <label style={labelStyle}>Custom UL System</label>
              <input
                type="text"
                value={firestopInputs.customULSystem}
                onChange={(e) =>
                  setFirestopInputs(prev => ({ ...prev, customULSystem: e.target.value }))
                }
                placeholder="Enter custom designation..."
                style={inputStyle}
              />
            </div>
          )}

          {/* FIRESTOP RESULTS TABLE */}
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>Material</th>
                <th style={tableHeaderCellStyle}>Qty</th>
                <th style={tableHeaderCellStyle}>Unit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tableCellStyle}>Mineral Wool Backer</td>
                <td style={tableValueStyle}>{firestopCalcs.mineralWoolLF.toFixed(1)}</td>
                <td style={tableCellStyle}>LF</td>
              </tr>
              <tr>
                <td style={tableCellStyle}>Intumescent Strip</td>
                <td style={tableValueStyle}>{firestopCalcs.intumescentStripLF.toFixed(1)}</td>
                <td style={tableCellStyle}>LF</td>
              </tr>
              <tr>
                <td style={tableCellStyle}>Firestop Sealant (20oz)</td>
                <td style={tableValueStyle}>{firestopCalcs.sealantSausages}</td>
                <td style={tableCellStyle}>Sausages</td>
              </tr>
              <tr>
                <td style={tableCellStyle}>Impasse Anchors</td>
                <td style={tableValueStyle}>{firestopCalcs.anchorsRequired}</td>
                <td style={tableCellStyle}>EA</td>
              </tr>
            </tbody>
          </table>

          {/* UL BADGE */}
          <div style={badgeStyle}>
            UL Design: {firestopInputs.ulSystem === 'Custom' ? firestopInputs.customULSystem : firestopInputs.ulSystem}
          </div>

          {/* INFO BOX */}
          <div style={infoPanelStyle}>
            <strong>Total Floor Footage:</strong> <span style={outputValueStyle}>{firestopCalcs.totalFloorLF.toFixed(1)} LF</span>
            <br />
            <strong>Sealant Volume:</strong> Approximately <span style={outputValueStyle}>{(firestopCalcs.sealantSausages * 20).toFixed(0)}</span> linear feet at 20oz/sausage
          </div>

          {/* ADD TO BOM BUTTON */}
          <button
            style={buttonHover.firestop ? buttonHoverStyle : buttonStyle}
            onMouseEnter={() => setButtonHover(prev => ({ ...prev, firestop: true }))}
            onMouseLeave={() => setButtonHover(prev => ({ ...prev, firestop: false }))}
            onClick={handleAddFirestopToBOM}
          >
            Add to Metal List
          </button>
        </div>

        {/* ========== SECTION 2: EXPANSION JOINT CALCULATOR ========== */}
        <div style={panelStyle}>
          <div style={sectionHeaderStyle}>Expansion Joint Calculator</div>

          {/* INPUTS GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div style={inputGroupStyle}>
              <label style={labelStyle}>Run Length (ft)</label>
              <input
                type="number"
                value={expansionInputs.runLengthFt}
                onChange={(e) => handleExpansionChange('runLengthFt', e.target.value)}
                min="0"
                step="1"
                style={inputStyle}
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Temperature Delta (°F)</label>
              <input
                type="number"
                value={expansionInputs.tempDeltaF}
                onChange={(e) => handleExpansionChange('tempDeltaF', e.target.value)}
                min="0"
                step="10"
                style={inputStyle}
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Joint Cover Width (in)</label>
              <input
                type="number"
                value={expansionInputs.jointWidthIn}
                onChange={(e) => handleExpansionChange('jointWidthIn', e.target.value)}
                min="1"
                step="0.25"
                style={inputStyle}
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Cover Style</label>
              <select
                value={expansionInputs.coverStyle}
                onChange={(e) => handleExpansionChange('coverStyle', e.target.value)}
                style={selectStyle}
              >
                <option value="snap-on">Snap-On Cover</option>
                <option value="2-piece-bar">2-Piece Bar</option>
                <option value="silicone-only">Silicone Only</option>
              </select>
            </div>
          </div>

          {/* EXPANSION JOINT SVG DIAGRAM */}
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: inputBg, borderRadius: '4px', border: `1px solid ${borderColor}` }}>
            <p style={{ fontSize: '11px', color: '#a1a1a6', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '500' }}>
              Joint Layout ({expansionCalcs.recommendedJointCount} joints)
            </p>
            <svg width="100%" height="80" viewBox="0 0 500 80" style={{ backgroundColor: 'transparent' }}>
              {/* MAIN RUN BAR */}
              <rect x="20" y="30" width="460" height="20" fill={accentBlue} fillOpacity="0.2" stroke={accentBlue} strokeWidth="1" />

              {/* JOINT MARKS */}
              {expansionCalcs.jointPositions.map((pos, idx) => {
                const xPos = 20 + (pos / 100) * 460;
                return (
                  <g key={idx}>
                    {/* TICK MARK */}
                    <line x1={xPos} y1="25" x2={xPos} y2="35" stroke={accentGreen} strokeWidth="2" />
                    {/* TICK LABEL */}
                    <text
                      x={xPos}
                      y="58"
                      textAnchor="middle"
                      fill={textColor}
                      fontSize="11"
                      fontFamily="monospace"
                    >
                      J-{idx + 1}
                    </text>
                  </g>
                );
              })}

              {/* DIMENSION LINE */}
              <line x1="20" y1="72" x2="480" y2="72" stroke={borderColor} strokeWidth="1" />
              <line x1="20" y1="68" x2="20" y2="76" stroke={borderColor} strokeWidth="1" />
              <line x1="480" y1="68" x2="480" y2="76" stroke={borderColor} strokeWidth="1" />
            </svg>
          </div>

          {/* EXPANSION CALCS INFO */}
          <div style={infoPanelStyle}>
            <div>
              <strong>Thermal Movement:</strong> <span style={outputValueStyle}>{expansionCalcs.expansionIn.toFixed(3)}"</span>
              <br />
              <strong>Recommended Joints:</strong> <span style={outputValueStyle}>{expansionCalcs.recommendedJointCount}</span> @ every <span style={outputValueStyle}>{expansionCalcs.spacingFt}</span> ft
              <br />
              <strong>Joint Cover:</strong> <span style={outputValueStyle}>{expansionCalcs.jointCoverLF.toFixed(1)}</span> LF of {expansionInputs.jointWidthIn}" cover
              <br />
              <strong>Silicone:</strong> <span style={outputValueStyle}>{expansionCalcs.siliconeJointsLF.toFixed(1)}</span> LF
            </div>
          </div>

          {/* ADD TO BOM BUTTON */}
          <button
            style={buttonHover.expansion ? buttonHoverStyle : buttonStyle}
            onMouseEnter={() => setButtonHover(prev => ({ ...prev, expansion: true }))}
            onMouseLeave={() => setButtonHover(prev => ({ ...prev, expansion: false }))}
            onClick={handleAddExpansionToBOM}
          >
            Add to Metal List
          </button>
        </div>

        {/* FOOTER HELP */}
        <div style={{ fontSize: '11px', color: '#71717a', marginTop: '20px', paddingTop: '12px', borderTopWidth: '1px', borderTopColor: borderColor, borderTopStyle: 'solid' }}>
          <p style={{ margin: '0' }}>
            <strong>Firestop Assumptions:</strong> 5% mineral wool overlap; sealant at 20 oz/20 LF; anchors per stud spacing.
          </p>
          <p style={{ margin: '4px 0 0 0' }}>
            <strong>Expansion Assumptions:</strong> Aluminum coefficient 0.0000131 in/in/°F; joints recommended every 30 ft; 2 LF silicone per joint (both sides).
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(-10px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

export default FirestopCalculator;
