import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import iconLogo from '../assets/ICON_LOGO.svg';

const CustomTitleBar = ({ 
  showMenu = false,
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

  const handleMinimize = () => {
    if (window.electronAPI?.windowMinimize) window.electronAPI.windowMinimize();
  };

  const handleMaximize = () => {
    if (window.electronAPI?.windowMaximize) window.electronAPI.windowMaximize();
  };

  const handleClose = () => {
    if (window.electronAPI?.windowClose) window.electronAPI.windowClose();
  };

  return (
    <div style={styles.titleBar}>
      <div style={styles.leftSection} ref={menuRef}>
        <img src={iconLogo} alt="GlazeBid Builder" style={styles.logo} />
        
        {/* Menu items - only show when inside a project */}
        {showMenu && (
          <div style={styles.menuSection}>
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
        )}
      </div>
      
      <div style={styles.windowControls}>
        <button onClick={handleMinimize} className="title-bar-button" style={styles.controlButton} title="Minimize">
          <span style={{ display: 'block', width: '10px', height: '1px', backgroundColor: 'currentColor' }} />
        </button>
        <button onClick={handleMaximize} className="title-bar-button" style={styles.controlButton} title="Maximize">
          <span style={{ display: 'block', width: '10px', height: '10px', border: '1px solid currentColor', backgroundColor: 'transparent' }} />
        </button>
        <button onClick={handleClose} className="title-bar-button close" style={styles.controlButton} title="Close">
          <X size={16} />
        </button>
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
        ...menuItemStyles.menuItem,
        ...(hovered && !disabled ? menuItemStyles.menuItemHover : {}),
        ...(disabled ? menuItemStyles.menuItemDisabled : {})
      }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
    >
      <span>{label}</span>
      {shortcut && <span style={menuItemStyles.shortcut}>{shortcut}</span>}
    </button>
  );
};

const menuItemStyles = {
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
    backgroundColor: '#0ea5e9',
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
};

const styles = {
  titleBar: {
    height: '40px',
    background: '#09090b',
    borderBottom: '1px solid #27272a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px',
    WebkitAppRegion: 'drag',
    userSelect: 'none',
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10001,
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    WebkitAppRegion: 'no-drag', // Allow clicking menu items
  },
  logo: {
    height: '20px',
    width: '20px',
    marginRight: '8px',
  },
  menuSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '0px',
  },
  menuContainer: {
    position: 'relative',
  },
  menuButton: {
    padding: '6px 10px',
    fontSize: '12px',
    color: '#ffffff',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '2px',
    transition: 'background-color 0.15s',
  },
  menuButtonActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: '0',
    minWidth: '200px',
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '4px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    padding: '4px 0',
    zIndex: 10002,
  },
  separator: {
    height: '1px',
    backgroundColor: '#27272a',
    margin: '4px 0',
  },
  windowControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    WebkitAppRegion: 'no-drag', // Allow clicking buttons
  },
  controlButton: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: '#a1a1aa',
    cursor: 'pointer',
    transition: 'background-color 0.15s, color 0.15s',
    borderRadius: '0',
  },
  closeButton: {
    ':hover': {
      backgroundColor: '#e74c3c',
    },
  },
};

// Add hover effect styles via CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  .title-bar-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  .title-bar-button.close:hover {
    background-color: #e74c3c !important;
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('titlebar-styles')) {
  styleSheet.id = 'titlebar-styles';
  document.head.appendChild(styleSheet);
}

export default CustomTitleBar;
