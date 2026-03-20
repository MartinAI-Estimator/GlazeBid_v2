/**
 * System Tabs - Horizontal tab interface for multi-system management
 */
import React from 'react';
import { getSystem, getSystemOptions } from '../../config/systemRegistry';
import './SystemTabs.css';

export default function SystemTabs({ activeSystems, selectedSystem, onSelectSystem, onAddSystem, onRemoveSystem }) {
  const allSystemOptions = getSystemOptions();
    // Count instances of each system type
  const systemCounts = {};
  activeSystems.forEach(instanceId => {
    const baseSystemId = instanceId.split(':')[0];
    systemCounts[baseSystemId] = (systemCounts[baseSystemId] || 0) + 1;
  });
    const handleRemoveTab = (e, systemId) => {
    e.stopPropagation(); // Prevent tab selection when closing
    if (activeSystems.length > 1) {
      onRemoveSystem(systemId);
    } else {
      alert('Cannot remove the last system. At least one system must remain active.');
    }
  };
  
  return (
    <div className="system-tabs-container">
      <div className="system-tabs">
        {/* Active System Tabs */}
        {activeSystems.map(instanceId => {
          const baseSystemId = instanceId.split(':')[0];
          const instanceNum = instanceId.split(':')[1];
          const system = getSystem(baseSystemId);
          const systemOption = allSystemOptions.find(opt => opt.value === baseSystemId);
          const isActive = selectedSystem === instanceId;
          
          // Show instance number if there are multiple of this type
          const hasMultiple = systemCounts[baseSystemId] > 1;
          const displayLabel = hasMultiple 
            ? `${systemOption?.label || system?.name || baseSystemId} #${instanceNum}`
            : (systemOption?.label || system?.name || baseSystemId);
          
          return (
            <div
              key={instanceId}
              className={`system-tab ${isActive ? 'active' : ''}`}
              onClick={() => onSelectSystem(instanceId)}
            >
              <span className="system-tab-label">{displayLabel}</span>
              {activeSystems.length > 1 && (
                <button
                  className="system-tab-close"
                  onClick={(e) => handleRemoveTab(e, instanceId)}
                  title="Remove system"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
