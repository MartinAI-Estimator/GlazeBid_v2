import React, { useState, useEffect } from 'react';

/**
 * Layer 22 - Grid Toolbar
 * Floating toolbar for defining grid rows/columns on Area markups
 * Shows when an Area markup is selected
 */
const GridToolbar = ({ markup, position, onUpdate, onClose }) => {
  const [rows, setRows] = useState(markup?.rows || 1);
  const [cols, setCols] = useState(markup?.cols || 1);

  useEffect(() => {
    setRows(markup?.rows || 1);
    setCols(markup?.cols || 1);
  }, [markup?.id]);

  const handleRowsChange = (e) => {
    const value = Math.max(1, parseInt(e.target.value) || 1);
    setRows(value);
    onUpdate({ rows: value, cols });
  };

  const handleColsChange = (e) => {
    const value = Math.max(1, parseInt(e.target.value) || 1);
    setCols(value);
    onUpdate({ rows, cols: value });
  };

  if (!markup || markup.type !== 'Area') return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        zIndex: 2000,
        minWidth: '280px'
      }}
    >
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <h4 style={{ 
          margin: 0, 
          fontSize: '13px', 
          fontWeight: '600', 
          color: '#c9d1d9' 
        }}>
          🔳 Grid Definition
        </h4>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8b949e',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0 4px'
          }}
        >
          ×
        </button>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '12px',
        marginBottom: '8px'
      }}>
        <div style={{ flex: 1 }}>
          <label style={{ 
            display: 'block', 
            fontSize: '11px', 
            color: '#8b949e',
            marginBottom: '4px',
            fontWeight: '500'
          }}>
            Cols (Vertical)
          </label>
          <input
            type="number"
            min="1"
            value={cols}
            onChange={handleColsChange}
            style={{
              width: '100%',
              padding: '6px 8px',
              backgroundColor: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#c9d1d9',
              fontSize: '13px',
              fontFamily: 'monospace'
            }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ 
            display: 'block', 
            fontSize: '11px', 
            color: '#8b949e',
            marginBottom: '4px',
            fontWeight: '500'
          }}>
            Rows (Horizontal)
          </label>
          <input
            type="number"
            min="1"
            value={rows}
            onChange={handleRowsChange}
            style={{
              width: '100%',
              padding: '6px 8px',
              backgroundColor: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#c9d1d9',
              fontSize: '13px',
              fontFamily: 'monospace'
            }}
          />
        </div>
      </div>

      <div style={{
        padding: '8px',
        backgroundColor: '#0d1117',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#8b949e'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>Panels:</span>
          <span style={{ color: '#58a6ff', fontWeight: '600' }}>{rows * cols}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Grid:</span>
          <span style={{ color: '#79c0ff', fontWeight: '600' }}>{cols} × {rows}</span>
        </div>
      </div>

      <div style={{ 
        marginTop: '8px', 
        fontSize: '10px', 
        color: '#6e7681',
        fontStyle: 'italic'
      }}>
        💡 Grid lines show mullion layout
      </div>
    </div>
  );
};

export default GridToolbar;
