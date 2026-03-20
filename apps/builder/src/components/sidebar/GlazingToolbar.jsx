import React, { useState } from 'react';
import { GLAZING_CLASSES, TOOL_MODES } from './constants'; // Based on your PyQt list

const GlazingToolbar = ({ onSelectTool, activeTool }) => {
  const [expandedCat, setExpandedCat] = useState('Polyline');

  const categories = [
    { id: 'Highlight', label: '🖍 Highlight', prefix: '' },
    { id: 'Polyline', label: '📏 Polyline', prefix: 'Shift+' },
    { id: 'Area', label: '📐 Area', prefix: 'Ctrl+' },
    { id: 'Count', label: '🔢 Count', prefix: 'Alt+' },
  ];

  return (
    <div style={styles.container}>
      {categories.map((cat) => (
        <div key={cat.id} style={styles.category}>
          <div 
            style={styles.header} 
            onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
          >
            {cat.label}
          </div>
          
          {expandedCat === cat.id && (
            <div style={styles.itemList}>
              {Object.keys(GLAZING_CLASSES).map((className) => (
                <div 
                  key={className}
                  onClick={() => onSelectTool(cat.id, className)}
                  style={{
                    ...styles.item,
                    backgroundColor: activeTool?.class === className && activeTool?.mode === cat.id 
                      ? '#4a5568' : 'transparent'
                  }}
                >
                  <span style={styles.className}>{className}</span>
                  <span style={styles.shortcut}>
                    {cat.prefix}{className[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const styles = {
  container: { width: '280px', backgroundColor: '#2c3e50', color: 'white', height: '100%', overflowY: 'auto' },
  category: { borderBottom: '1px solid #1a252f' },
  header: { padding: '12px', cursor: 'pointer', fontWeight: 'bold', backgroundColor: '#34495e' },
  itemList: { backgroundColor: '#3e5871' },
  item: { padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '11px' },
  className: { color: '#ecf0f1' },
  shortcut: { color: '#95a5a6', fontSize: '9px' }
};

export default GlazingToolbar;
