import React from 'react';

// cursorPosition prop intentionally removed — X/Y values are written directly to
// #pdf-cursor-x / #pdf-cursor-y via DOM refs from PDFWorkspace, bypassing the
// React render cycle to achieve Bluebeam-level mouse tracking performance.
const PDFStatusBar = ({ scale, pageInfo, snaps, onToggleSnap, calibration, onSetScale, isCalibrating }) => {
  const calibrationText = calibration?.pixelsPerFoot
    ? `CALIBRATED (${calibration.pixelsPerFoot.toFixed(2)} px/ft)`
    : 'NOT CALIBRATED';

  return (
    <div style={{ 
      height: '30px', 
      background: '#2b2b2b', 
      borderTop: '1px solid #444', 
      color: '#bbb', 
      display: 'flex', 
      alignItems: 'center', 
      padding: '0 15px', 
      fontSize: '11px',
      fontFamily: 'Segoe UI, sans-serif',
      userSelect: 'none'
    }}>
      {/* Left: Hint Text */}
      <div style={{ marginRight: 'auto' }}>
        {isCalibrating ? 'Click two points, then enter real-world distance (inches).' : 'Ready'}
      </div>

      {/* Center: Cursor Coordinates — written directly via DOM, not React state */}
      <div style={{ marginRight: '20px', fontVariantNumeric: 'tabular-nums' }}>
        X:&nbsp;<span id="pdf-cursor-x">0.00</span>"&nbsp;&nbsp;Y:&nbsp;<span id="pdf-cursor-y">0.00</span>"
      </div>

      {/* Right: Snaps & Page Info */}
      <div style={{ display: 'flex', gap: '15px' }}>
        <div 
          onClick={() => onToggleSnap('grid')}
          style={{ color: snaps.grid ? '#3b82f6' : '#bbb', cursor: 'pointer', fontWeight: snaps.grid ? 'bold' : 'normal' }}
        >
          SNAP TO GRID
        </div>
        <div 
          onClick={() => onToggleSnap('content')}
          style={{ color: snaps.content ? '#3b82f6' : '#bbb', cursor: 'pointer', fontWeight: snaps.content ? 'bold' : 'normal' }}
        >
          SNAP TO CONTENT
        </div>
        {onSetScale && (
          <div
            onClick={onSetScale}
            style={{ color: isCalibrating ? '#3b82f6' : '#bbb', cursor: 'pointer', fontWeight: isCalibrating ? 'bold' : 'normal' }}
          >
            SET SCALE
          </div>
        )}
        <div style={{ color: calibration?.pixelsPerFoot ? '#3b82f6' : '#bbb' }}>
          {calibrationText}
        </div>
        <div style={{ borderLeft: '1px solid #555', paddingLeft: '15px' }}>
          {pageInfo || 'Loading...'} ({Math.round(scale * 100)}%)
        </div>
      </div>
    </div>
  );
};

export default PDFStatusBar;
