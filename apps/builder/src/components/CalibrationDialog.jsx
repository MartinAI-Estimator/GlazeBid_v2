import React, { useState } from 'react';

/**
 * CalibrationDialog Component
 * Enhanced feet and inches input matching PyQt6 interface
 * Calculates pixels per inch scale for accurate measurements
 */
const CalibrationDialog = ({ isOpen, onClose, onSetScale, pixelDistance }) => {
  const [feet, setFeet] = useState(1);
  const [inches, setInches] = useState(0);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const totalInches = (feet * 12) + inches;
    if (totalInches > 0 && pixelDistance > 0) {
      const ppi = pixelDistance / totalInches; // pixels per inch
      onSetScale({
        ppi: ppi,
        pxPerFoot: ppi * 12,
        feet: feet,
        inches: inches,
        pixelDistance: pixelDistance,
        totalInches: totalInches
      });
      onClose();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        width: '320px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Dialog Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px',
          paddingBottom: '15px',
          borderBottom: '2px solid #e67e22'
        }}>
          <span style={{ fontSize: '24px' }}>📏</span>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#2c3e50' }}>
            Calibrate Scale
          </h2>
        </div>

        {/* Pixel Distance Display */}
        <div style={{
          backgroundColor: '#ecf0f1',
          padding: '10px',
          borderRadius: '4px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '11px', color: '#7f8c8d', marginBottom: '4px' }}>
            Measured Line Distance
          </div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2c3e50' }}>
            {Math.round(pixelDistance)} pixels
          </div>
        </div>

        {/* Instructions */}
        <p style={{
          fontSize: '13px',
          color: '#7f8c8d',
          marginBottom: '20px',
          lineHeight: '1.5'
        }}>
          Enter the actual measurement of the line you drew on the drawing:
        </p>

        {/* Feet Input */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 'bold',
            color: '#2c3e50',
            marginBottom: '8px'
          }}>
            Feet:
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="number"
              value={feet}
              onChange={(e) => setFeet(Math.max(0, parseInt(e.target.value) || 0))}
              min="0"
              max="10000"
              style={{
                flex: 1,
                padding: '10px',
                fontSize: '16px',
                border: '2px solid #bdc3c7',
                borderRadius: '4px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#3498db'}
              onBlur={(e) => e.target.style.borderColor = '#bdc3c7'}
            />
            <span style={{ fontSize: '14px', color: '#7f8c8d', fontWeight: 'bold' }}>ft</span>
          </div>
        </div>

        {/* Inches Input */}
        <div style={{ marginBottom: '25px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 'bold',
            color: '#2c3e50',
            marginBottom: '8px'
          }}>
            Inches:
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="number"
              value={inches}
              onChange={(e) => setInches(Math.max(0, Math.min(11, parseInt(e.target.value) || 0)))}
              min="0"
              max="11"
              style={{
                flex: 1,
                padding: '10px',
                fontSize: '16px',
                border: '2px solid #bdc3c7',
                borderRadius: '4px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#3498db'}
              onBlur={(e) => e.target.style.borderColor = '#bdc3c7'}
            />
            <span style={{ fontSize: '14px', color: '#7f8c8d', fontWeight: 'bold' }}>in</span>
          </div>
        </div>

        {/* Preview Calculation */}
        {(feet > 0 || inches > 0) && (
          <div style={{
            backgroundColor: '#d5f4e6',
            border: '1px solid #27ae60',
            padding: '10px',
            borderRadius: '4px',
            marginBottom: '20px',
            fontSize: '12px',
            color: '#27ae60'
          }}>
            <strong>Scale Preview:</strong>
            <br />
            {Math.round(pixelDistance)} px = {feet}' {inches}"
            <br />
            {(pixelDistance / ((feet * 12) + inches)).toFixed(2)} pixels per inch
          </div>
        )}

        {/* Button Group */}
        <div style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 'bold',
              border: '2px solid #95a5a6',
              backgroundColor: 'white',
              color: '#7f8c8d',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ecf0f1';
              e.currentTarget.style.borderColor = '#7f8c8d';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.borderColor = '#95a5a6';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={feet === 0 && inches === 0}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 'bold',
              border: 'none',
              backgroundColor: (feet === 0 && inches === 0) ? '#bdc3c7' : '#27ae60',
              color: 'white',
              borderRadius: '4px',
              cursor: (feet === 0 && inches === 0) ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              if (feet > 0 || inches > 0) {
                e.currentTarget.style.backgroundColor = '#229954';
              }
            }}
            onMouseLeave={(e) => {
              if (feet > 0 || inches > 0) {
                e.currentTarget.style.backgroundColor = '#27ae60';
              }
            }}
          >
            Set Scale
          </button>
        </div>

        {/* Keyboard Hint */}
        <div style={{
          marginTop: '15px',
          paddingTop: '15px',
          borderTop: '1px solid #ecf0f1',
          fontSize: '11px',
          color: '#95a5a6',
          textAlign: 'center'
        }}>
          💡 Tip: Calibrate using a known dimension from the drawing
        </div>
      </div>
    </div>
  );
};

export default CalibrationDialog;
