import React from 'react';
import { FileText, ChevronDown } from 'lucide-react';

const DocumentSelector = ({ sheets, selectedSheet, onSelectSheet }) => {
  const selectedSheetData = sheets.find(s => s.id === selectedSheet);
  const selectedDisplay = selectedSheetData?.display || 'Select a document...';
  const selectedCategory = selectedSheetData?.category || '';

  return (
    <div style={styles.container}>
      <div style={styles.label}>
        <FileText size={16} color="#9ca3af" />
        <span>Document:</span>
      </div>
      <div style={styles.selectWrapper}>
        <select 
          value={selectedSheet || ''} 
          onChange={(e) => onSelectSheet(e.target.value)}
          style={styles.select}
        >
          <option value="">Select a document...</option>
          
          {/* Group by category if available */}
          {sheets.some(s => s.category === 'Architectural') && (
            <optgroup label="Architectural Drawings">
              {sheets.filter(s => s.category === 'Architectural').map(sheet => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.display}
                </option>
              ))}
            </optgroup>
          )}
          
          {sheets.some(s => s.category === 'Structural') && (
            <optgroup label="Structural Drawings">
              {sheets.filter(s => s.category === 'Structural').map(sheet => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.display}
                </option>
              ))}
            </optgroup>
          )}
          
          {/* Other discipline sheets (Civil, Electrical, Mechanical, Plumbing) */}
          {sheets.some(s => s.category === 'Other') && (
            <optgroup label="Other Disciplines">
              {sheets.filter(s => s.category === 'Other').map(sheet => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.display}
                </option>
              ))}
            </optgroup>
          )}
          
          {/* Specification documents */}
          {sheets.some(s => s.category === 'Specifications') && (
            <optgroup label="Specifications">
              {sheets.filter(s => s.category === 'Specifications').map(sheet => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.display}
                </option>
              ))}
            </optgroup>
          )}
          
          {/* Uncategorized sheets */}
          {sheets.filter(s => !s.category).map(sheet => (
            <option key={sheet.id} value={sheet.id}>
              {sheet.display}
            </option>
          ))}
        </select>
        <ChevronDown size={18} color="#9ca3af" style={styles.icon} />
      </div>
      
      {selectedCategory && (
        <div style={styles.category}>
          <span style={{
            ...styles.categoryBadge,
            ...getCategoryStyle(selectedCategory),
          }}>
            {selectedCategory}
          </span>
        </div>
      )}
    </div>
  );
};

// Category color mapping
const getCategoryStyle = (category) => {
  switch (category) {
    case 'Architectural':
      return { backgroundColor: '#eff6ff', color: '#3b82f6' };
    case 'Structural':
      return { backgroundColor: '#f3e8ff', color: '#8b5cf6' };
    case 'Other':
      return { backgroundColor: '#fef3c7', color: '#d97706' };
    case 'Specifications':
      return { backgroundColor: '#d1fae5', color: '#059669' };
    default:
      return { backgroundColor: '#f3f4f6', color: '#6b7280' };
  }
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    backgroundColor: '#1a1f26',
    borderBottom: '1px solid #2d333b',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#9ca3af',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  selectWrapper: {
    position: 'relative',
    flex: 1,
    maxWidth: '500px',
  },
  select: {
    width: '100%',
    padding: '10px 40px 10px 12px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    appearance: 'none',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  icon: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
  },
  category: {
    display: 'flex',
    alignItems: 'center',
  },
  categoryBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
};

export default DocumentSelector;
