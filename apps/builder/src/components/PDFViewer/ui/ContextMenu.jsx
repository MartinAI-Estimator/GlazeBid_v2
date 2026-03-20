import React, { useEffect, useRef } from 'react';
import { GLAZING_CLASSES } from '../../constants';

const ContextMenu = ({ position, markup, onClose, onOptionSelect, canDuplicate = false }) => {
  const menuRef = useRef(null);
  const [showClassSubmenu, setShowClassSubmenu] = React.useState(false);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Prevent menu from going offscreen
  const adjustedPosition = { ...position };
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect();
    if (position.x + 250 > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - 260;
    }
    if (position.y + 200 > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - 210;
    }
  }

  const handleOptionClick = (option, data = null) => {
    onOptionSelect(option, data);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      data-testid="context-menu"
      style={{
        position: 'fixed',
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
        backgroundColor: '#2b2b2b',
        border: '1px solid #555',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        zIndex: 10000,
        minWidth: '200px',
        padding: '4px 0',
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '13px',
        color: '#e0e0e0'
      }}
    >
      {/* Current Class Display */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #444',
        color: '#999',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase'
      }}>
        {markup?.system || 'UNCLASSIFIED'} ({markup?.label || '-'})
      </div>

      {/* Change Class Option with Submenu */}
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setShowClassSubmenu(true)}
        onMouseLeave={() => setShowClassSubmenu(false)}
      >
        <div
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'background 0.15s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#3e3e3e'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <span>Change Class</span>
          <span style={{ marginLeft: '20px', color: '#888' }}>▶</span>
        </div>

        {/* Submenu */}
        {showClassSubmenu && (
          <div style={{
            position: 'absolute',
            left: '100%',
            top: '0',
            backgroundColor: '#2b2b2b',
            border: '1px solid #555',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            minWidth: '220px',
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '4px 0'
          }}>
            {Object.entries(GLAZING_CLASSES).map(([key, config]) => (
              <div
                key={key}
                onClick={() => handleOptionClick('changeClass', key)}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#3e3e3e'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: '16px',
                  height: '16px',
                  backgroundColor: config.color,
                  borderRadius: '3px',
                  border: '1px solid #666'
                }} />
                <span style={{ fontSize: '12px' }}>{key}</span>
                <span style={{ 
                  marginLeft: 'auto', 
                  fontSize: '10px', 
                  color: '#888',
                  fontWeight: 600
                }}>
                  {config.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <div style={{
        height: '1px',
        backgroundColor: '#444',
        margin: '4px 0'
      }} />

      {/* Structural Calculator (Area and Smart Frame) */}
      {(markup?.type === 'Area' || markup?.type === 'smart_frame') && (
        <>
          <div
            onClick={() => handleOptionClick('structural')}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              transition: 'background 0.15s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#3e3e3e'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            Send to Structural Calculator
          </div>

          <div style={{
            height: '1px',
            backgroundColor: '#444',
            margin: '4px 0'
          }} />
        </>
      )}

      {/* Copy Option */}
      <div
        onClick={() => handleOptionClick('copy')}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          transition: 'background 0.15s'
        }}
        onMouseOver={(e) => e.currentTarget.style.background = '#3e3e3e'}
        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
      >
        Copy
        <span style={{ float: 'right', color: '#888', fontSize: '11px' }}>Ctrl+C</span>
      </div>

      {/* Paste Option (if clipboard has data) */}
      <div
        onClick={() => canDuplicate && handleOptionClick('paste')}
        style={{
          padding: '8px 12px',
          cursor: canDuplicate ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s',
          opacity: canDuplicate ? 1 : 0.5
        }}
        onMouseOver={(e) => {
          if (canDuplicate) e.currentTarget.style.background = '#3e3e3e';
        }}
        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
      >
        Duplicate
        <span style={{ float: 'right', color: '#888', fontSize: '11px' }}>Ctrl+D</span>
      </div>

      {/* Separator */}
      <div style={{
        height: '1px',
        backgroundColor: '#444',
        margin: '4px 0'
      }} />

      {/* Delete Option */}
      <div
        onClick={() => handleOptionClick('delete')}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          color: '#ff6b6b',
          transition: 'background 0.15s'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = '#4a2828';
          e.currentTarget.style.color = '#ff8888';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#ff6b6b';
        }}
      >
        Delete
        <span style={{ float: 'right', color: '#888', fontSize: '11px' }}>Del</span>
      </div>
    </div>
  );
};

export default ContextMenu;
