import React, { useState, useEffect, useRef } from 'react';

const MenuBar = ({ 
  onSave, 
  onUndo, 
  onRedo, 
  onExport, 
  onClearMarkups,
  onZoomIn,
  onZoomOut,
  onResetView,
  canUndo = false,
  canRedo = false 
}) => {
  const [activeMenu, setActiveMenu] = useState(null);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActiveMenu(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMenuClick = (menuName) => {
    setActiveMenu(activeMenu === menuName ? null : menuName);
  };

  const execute = (action) => {
    if (action) action();
    setActiveMenu(null);
  };

  return (
    <div ref={menuRef} style={styles.menuBar}>
      {/* FILE MENU */}
      <div style={styles.menuContainer}>
        <button 
          style={{
            ...styles.menuButton,
            ...(activeMenu === 'File' ? styles.menuButtonActive : {})
          }}
          onClick={() => handleMenuClick('File')}
          onMouseEnter={(e) => {
            if (activeMenu && activeMenu !== 'File') setActiveMenu('File');
            if (!activeMenu) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={(e) => {
            if (activeMenu !== 'File') e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          File
        </button>
        {activeMenu === 'File' && (
          <div style={styles.dropdown}>
            <MenuItem label="Save Project" shortcut="Ctrl+S" onClick={() => execute(onSave)} />
            <MenuItem label="Export to PDF" onClick={() => execute(() => onExport && onExport('pdf'))} />
            <MenuItem label="Export to Excel" onClick={() => execute(() => onExport && onExport('excel'))} />
            <div style={styles.separator} />
            <MenuItem label="Exit" onClick={() => execute(() => window.close())} />
          </div>
        )}
      </div>

      {/* EDIT MENU */}
      <div style={styles.menuContainer}>
        <button 
          style={{
            ...styles.menuButton,
            ...(activeMenu === 'Edit' ? styles.menuButtonActive : {})
          }}
          onClick={() => handleMenuClick('Edit')}
          onMouseEnter={(e) => {
            if (activeMenu && activeMenu !== 'Edit') setActiveMenu('Edit');
            if (!activeMenu) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={(e) => {
            if (activeMenu !== 'Edit') e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          Edit
        </button>
        {activeMenu === 'Edit' && (
          <div style={styles.dropdown}>
            <MenuItem 
              label="Undo" 
              shortcut="Ctrl+Z" 
              onClick={() => execute(onUndo)} 
              disabled={!canUndo}
            />
            <MenuItem 
              label="Redo" 
              shortcut="Ctrl+Y" 
              onClick={() => execute(onRedo)} 
              disabled={!canRedo}
            />
            <div style={styles.separator} />
            <MenuItem 
              label="Clear All Markups" 
              onClick={() => execute(onClearMarkups)} 
            />
          </div>
        )}
      </div>

      {/* VIEW MENU */}
      <div style={styles.menuContainer}>
        <button 
          style={{
            ...styles.menuButton,
            ...(activeMenu === 'View' ? styles.menuButtonActive : {})
          }}
          onClick={() => handleMenuClick('View')}
          onMouseEnter={(e) => {
            if (activeMenu && activeMenu !== 'View') setActiveMenu('View');
            if (!activeMenu) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={(e) => {
            if (activeMenu !== 'View') e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          View
        </button>
        {activeMenu === 'View' && (
          <div style={styles.dropdown}>
            <MenuItem label="Zoom In" shortcut="Ctrl++" onClick={() => execute(onZoomIn)} />
            <MenuItem label="Zoom Out" shortcut="Ctrl+-" onClick={() => execute(onZoomOut)} />
            <MenuItem label="Reset View" onClick={() => execute(onResetView)} />
          </div>
        )}
      </div>
    </div>
  );
};

// Helper Sub-Component for individual menu items
const MenuItem = ({ label, shortcut, onClick, disabled = false }) => {
  const [hovered, setHovered] = useState(false);
  
  return (
    <button 
      style={{
        ...styles.menuItem,
        ...(hovered && !disabled ? styles.menuItemHover : {}),
        ...(disabled ? styles.menuItemDisabled : {})
      }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
    >
      <span>{label}</span>
      {shortcut && <span style={styles.shortcut}>{shortcut}</span>}
    </button>
  );
};

const styles = {
  menuBar: {
    width: '100%',
    height: '28px',
    backgroundColor: '#001F3F',
    borderBottom: '1px solid #0a3a6b',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '8px',
    zIndex: 1001,
    position: 'relative',
    userSelect: 'none',
  },
  menuContainer: {
    position: 'relative',
  },
  menuButton: {
    padding: '4px 12px',
    fontSize: '12px',
    color: '#ffffff',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '2px',
    transition: 'background-color 0.15s',
  },
  menuButtonActive: {
    backgroundColor: 'rgba(0, 123, 255, 0.3)',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: '0',
    minWidth: '200px',
    backgroundColor: '#1c2128',
    border: '1px solid #30363d',
    borderRadius: '4px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    padding: '4px 0',
    zIndex: 1002,
  },
  menuItem: {
    width: '100%',
    textAlign: 'left',
    padding: '6px 16px',
    fontSize: '12px',
    color: '#e6edf3',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuItemHover: {
    backgroundColor: '#007BFF',
    color: '#ffffff',
  },
  menuItemDisabled: {
    color: '#6b7280',
    cursor: 'not-allowed',
  },
  shortcut: {
    fontSize: '11px',
    color: '#8b949e',
    marginLeft: '24px',
  },
  separator: {
    height: '1px',
    backgroundColor: '#30363d',
    margin: '4px 0',
  },
};

export default MenuBar;
