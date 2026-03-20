import React, { useState } from 'react';

const SidebarNav = ({ currentView, onViewChange }) => {
  const [showTooltip, setShowTooltip] = useState(null);

  const navItems = [
    { id: 'home', icon: '🏠', label: 'Project Intake', group: 'main' },
    { id: 'viewer', icon: '📄', label: 'PDF Viewer', group: 'main' },
    { id: 'bid-cart', icon: '💵', label: 'Bid Cart & Pricing', group: 'main' },
    { id: 'estimate', icon: '📊', label: 'Estimate Summary', group: 'main' },
    { id: 'quote', icon: '💰', label: 'Quote Generator', group: 'main' },
    { id: 'structural', icon: '🏗️', label: 'Structural Analysis', group: 'main' },
    { id: 'nfrc', icon: '🌡️', label: 'NFRC Calculator', group: 'main' },
    { id: 'doors', icon: '🚪', label: 'Door Schedule', group: 'main' },
    { id: 'addendum', icon: '📋', label: 'Addendum Loader', group: 'main' },
  ];

  const bottomItems = [
    { id: 'settings', icon: '⚙️', label: 'System Config', group: 'bottom' },
  ];

  const handleClick = (id) => {
    if (onViewChange) {
      onViewChange(id);
    }
  };

  return (
    <nav style={styles.iconBar}>
      {/* Main navigation items */}
      {navItems.map((item) => (
        <div
          key={item.id}
          style={currentView === item.id ? styles.iconActive : styles.icon}
          onClick={() => handleClick(item.id)}
          onMouseEnter={() => setShowTooltip(item.id)}
          onMouseLeave={() => setShowTooltip(null)}
          title={item.label}
        >
          {item.icon}
          {showTooltip === item.id && (
            <div style={styles.tooltip}>{item.label}</div>
          )}
        </div>
      ))}

      {/* Bottom items */}
      <div style={styles.spacer} />
      {bottomItems.map((item) => (
        <div
          key={item.id}
          style={currentView === item.id ? styles.iconActive : styles.icon}
          onClick={() => handleClick(item.id)}
          onMouseEnter={() => setShowTooltip(item.id)}
          onMouseLeave={() => setShowTooltip(null)}
          title={item.label}
        >
          {item.icon}
          {showTooltip === item.id && (
            <div style={styles.tooltip}>{item.label}</div>
          )}
        </div>
      ))}
    </nav>
  );
};

const styles = {
  iconBar: { 
    width: '64px', 
    backgroundColor: '#050505', 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    paddingTop: '20px',
    borderRight: '1px solid #2d333b', 
    height: '100vh',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  icon: { 
    color: '#555', 
    padding: '16px 0', 
    fontSize: '22px', 
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.2s',
    ':hover': {
      color: '#888',
    }
  },
  iconActive: { 
    color: '#00a3ff', 
    padding: '16px 0', 
    fontSize: '22px',
    position: 'relative',
    cursor: 'pointer',
  },
  spacer: {
    flex: 1,
  },
  tooltip: {
    position: 'absolute',
    left: '70px',
    top: '50%',
    transform: 'translateY(-50%)',
    backgroundColor: '#1f2937',
    color: '#ffffff',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    zIndex: 1000,
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  }
};

export default SidebarNav;
