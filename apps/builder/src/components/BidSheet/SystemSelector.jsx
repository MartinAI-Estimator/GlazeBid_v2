/**
 * System Selector - Dropdown to choose system type
 */
import React from 'react';
import './SystemSelector.css';

export default function SystemSelector({ value, onChange, options }) {
  return (
    <div className="system-selector">
      <label className="system-selector-label">System Type:</label>
      <div className="system-selector-dropdown">
        <select 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          className="system-select"
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.icon} {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
