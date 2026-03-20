import React, { useEffect, useRef } from 'react';

/**
 * ContextMenu Component - Simple right-click context menu
 * Auto-positions to avoid going off-screen
 */
const ContextMenu = ({ x, y, items, onClose }) => {
  const menuRef = useRef(null);
  
  // Close on outside click or Escape
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
  
  // Auto-position to avoid going off screen
  useEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      
      // Adjust if going off right edge
      if (rect.right > window.innerWidth) {
        menu.style.left = `${x - rect.width}px`;
      }
      
      // Adjust if going off bottom edge
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);
  
  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        backgroundColor: '#1e1e1e',
        border: '1px solid #3d444d',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        zIndex: 10000,
        minWidth: '180px',
        padding: '4px',
        color: '#ffffff',
      }}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={() => {
            item.action();
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#ffffff',
            textAlign: 'left',
            cursor: 'pointer',
            fontSize: '13px',
            borderRadius: '4px',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#2d333b';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'transparent';
          }}
        >
          {item.icon && <span style={{ marginRight: '8px' }}>{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;
