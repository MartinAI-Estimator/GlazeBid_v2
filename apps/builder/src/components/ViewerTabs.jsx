import React from 'react';
import './ViewerTabs.css';

/**
 * ViewerTabs Component
 * Displays navigation tabs at the top of the PDF viewer
 * Matches GlazeBid dashboard card styling
 */
export default function ViewerTabs({ items, activeTab, onTabClick }) {
  return (
    <div className="viewer-tabs-container">
      <div className="viewer-tabs">
        {items.map(item => (
          <div
            key={item.id}
            className={`viewer-tab ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabClick && onTabClick(item.id)}
          >
            <span className="viewer-tab-icon">{item.icon}</span>
            <span className="viewer-tab-label">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
