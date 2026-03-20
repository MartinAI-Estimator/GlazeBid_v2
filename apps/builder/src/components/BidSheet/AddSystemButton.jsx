/**
 * Add System Button - Dropdown menu for adding new system tabs
 */
import React, { useState } from 'react';
import { getSystemOptions } from '../../config/systemRegistry';
import './AddSystemButton.css';

export default function AddSystemButton({ onAddSystem, activeSystems, autoOpen = false }) {
  const [showMenu, setShowMenu] = useState(autoOpen);
  const allSystemOptions = getSystemOptions();
  
  const handleAddSystem = (systemId) => {
    onAddSystem(systemId);
    setShowMenu(false);
  };
  
  return (
    <div className="add-system-button-container">
      <button
        className="add-system-button"
        onClick={() => setShowMenu(!showMenu)}
      >
        <span className="add-system-icon">➕</span>
        <span className="add-system-text">ADD SYSTEM</span>
      </button>
      
      {/* Dropdown Menu */}
      {showMenu && (
        <>
          <div className="add-system-dropdown">
            {allSystemOptions.map(option => (
              <button
                key={option.value}
                className="add-system-dropdown-item"
                onClick={() => handleAddSystem(option.value)}
              >
                <span className="add-system-dropdown-icon">{option.icon}</span>
                <span className="add-system-dropdown-label">{option.label}</span>
              </button>
            ))}
          </div>
          
          {/* Overlay to close menu */}
          <div 
            className="add-system-overlay" 
            onClick={() => setShowMenu(false)}
          />
        </>
      )}
    </div>
  );
}
