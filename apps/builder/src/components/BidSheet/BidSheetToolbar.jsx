/**
 * BidSheet Toolbar - Import/Export actions
 */
import React, { useRef, useState } from 'react';
import { useBidSheet } from '../../context/BidSheetContext';
import './BidSheetToolbar.css';

export default function BidSheetToolbar() {
  const { importPartnerPak, refreshFrames, frames, productionRates, updateProductionRate, clearAllFrames } = useBidSheet();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const fileInputRef = useRef(null);
  
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      importPartnerPak(file);
      e.target.value = ''; // Reset input
    }
  };
  
  const handleEditStart = () => {
    const currentValue = Number(productionRates?.beadsOfCaulk) || 2.00;
    setEditing(true);
    setEditValue(currentValue.toString());
  };
  
  const handleEditSave = () => {
    const value = parseFloat(editValue);
    if (!isNaN(value) && value >= 0) {
      updateProductionRate('beadsOfCaulk', value);
    }
    setEditing(false);
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleEditSave();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  };
  
  const beadsOfCaulk = Number(productionRates?.beadsOfCaulk) || 2.00;
  
  return (
    <div className="bidsheet-toolbar">
      <input 
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      
      {/* Caulk Beads Input - Far Left */}
      <div className="toolbar-caulk-beads">
        <label className="caulk-label">Caulk Beads:</label>
        {editing ? (
          <input
            type="number"
            step="0.01"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEditSave}
            onKeyDown={handleKeyPress}
            className="caulk-input"
            autoFocus
          />
        ) : (
          <span 
            className="caulk-value"
            onClick={handleEditStart}
            title="Click to edit"
          >
            {beadsOfCaulk.toFixed(2)}
          </span>
        )}
      </div>
      
      {/* Action Buttons - Far Right */}
      <div className="toolbar-buttons-group">
        <button 
          className="toolbar-btn toolbar-btn-import"
          onClick={handleImportClick}
          title="Import PartnerPak Excel (.xlsx, .xls, .csv)"
        >
          📥 Import
        </button>
        
        <button 
          className="toolbar-btn toolbar-btn-refresh"
          onClick={refreshFrames}
          title="Refresh Data"
        >
          🔄 Refresh
        </button>

        {frames.length > 0 && (
          <button 
            className="toolbar-btn toolbar-btn-clear"
            onClick={clearAllFrames}
            title="Clear all frames from this system"
          >
            🗑️ Clear All
          </button>
        )}
      </div>
    </div>
  );
}
