/**
 * Hr Function Rates Table Component
 * Editable table matching Excel J2:Q6 structure
 * Shows breakdown of labor rates for Bays, DLOs, and Doors tasks
 * Collapsible section matching Labor Summary Panel
 */
import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useBidSheet } from '../../context/BidSheetContext';
import './HrFunctionRatesTable.css';

export default function HrFunctionRatesTable({ hrFunctionRates }) {
  const { updateHrRate } = useBidSheet();
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Initialize state with breakdown values
  const [rates, setRates] = useState({
    bays_assemble: 0.5,
    bays_clips: 0.68,
    bays_set: 1.0,
    bays_big_assemble: 0.75,
    bays_big_clips: 0.68,
    bays_big_set: 1.5,
    dlos_prep: 0.25,
    dlos_set: 0.75,
    dlos_big_prep: 0.25,
    dlos_big_set: 1.25,
    doors_distribution: 0.5,
    doors_install: 8.0
  });
  
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  
  // Calculate totals
  const totals = {
    bays: rates.bays_assemble + rates.bays_clips + rates.bays_set,
    bays_big: rates.bays_big_assemble + rates.bays_big_clips + rates.bays_big_set,
    dlos: rates.dlos_prep + rates.dlos_set,
    dlos_big: rates.dlos_big_prep + rates.dlos_big_set,
    doors: rates.doors_distribution + rates.doors_install
  };
  
  // Handle cell edit
  const handleCellEdit = (key, currentValue) => {
    setEditingCell(key);
    setEditValue(currentValue.toString());
  };
  
  // Handle save
  const handleCellSave = async (key) => {
    if (!editingCell) return;
    
    const value = parseFloat(editValue);
    if (!isNaN(value) && value >= 0) {
      // Update local state
      setRates(prev => ({ ...prev, [key]: value }));
      
      // Calculate new totals and update backend
      const newRates = { ...rates, [key]: value };
      const newTotals = {
        bays: newRates.bays_assemble + newRates.bays_clips + newRates.bays_set,
        bays_big: newRates.bays_big_assemble + newRates.bays_big_clips + newRates.bays_big_set,
        dlos: newRates.dlos_prep + newRates.dlos_set,
        dlos_big: newRates.dlos_big_prep + newRates.dlos_big_set,
        doors: newRates.doors_distribution + newRates.doors_install
      };
      
      // Update backend with new totals
      if (updateHrRate) {
        await updateHrRate('bays', newTotals.bays);
        await updateHrRate('bays_big', newTotals.bays_big);
        await updateHrRate('dlos', newTotals.dlos);
        await updateHrRate('dlos_big', newTotals.dlos_big);
        await updateHrRate('pairs', newTotals.doors);
        await updateHrRate('singles', newTotals.doors);
      }
    }
    
    setEditingCell(null);
  };
  
  // Handle key press
  const handleKeyPress = (e, key) => {
    if (e.key === 'Enter') {
      handleCellSave(key);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };
  
  // Render editable cell
  const renderCell = (key, value) => {
    const isEditing = editingCell === key;
    
    if (isEditing) {
      return (
        <input
          type="number"
          step="0.01"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleCellSave(key)}
          onKeyDown={(e) => handleKeyPress(e, key)}
          className="rate-input"
          autoFocus
        />
      );
    }
    
    return (
      <span
        className="rate-value editable"
        onClick={() => handleCellEdit(key, value)}
        title="Click to edit"
      >
        {value.toFixed(2)}
      </span>
    );
  };
  
  return (
    <div className={`hr-rates-panel ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Panel Header */}
      <div className="hr-rates-header">
        <h3 className="panel-title">Hour Function Rates</h3>
        <button
          className="collapse-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand Hour Function Rates' : 'Collapse Hour Function Rates'}
        >
          {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </button>
      </div>

      {/* Table Container */}
      <div className="hr-rates-table-container">
      <table className="hr-rates-table">
        <thead>
          <tr>
            <th className="task-col"></th>
            <th className="rate-col">Bays</th>
            <th className="rate-col">&gt; Bays</th>
            <th className="spacer-col"></th>
            <th className="rate-col">DLOs</th>
            <th className="rate-col">&gt; DLOs</th>
            <th className="spacer-col"></th>
            <th className="rate-col">Doors</th>
          </tr>
        </thead>
        <tbody>
          {/* Assemble / Prep / Distribution row */}
          <tr>
            <td className="task-label">Assemble</td>
            <td className="rate-cell">{renderCell('bays_assemble', rates.bays_assemble)}</td>
            <td className="rate-cell">{renderCell('bays_big_assemble', rates.bays_big_assemble)}</td>
            <td className="spacer-cell">Prep</td>
            <td className="rate-cell">{renderCell('dlos_prep', rates.dlos_prep)}</td>
            <td className="rate-cell">{renderCell('dlos_big_prep', rates.dlos_big_prep)}</td>
            <td className="spacer-cell">Distribution</td>
            <td className="rate-cell">{renderCell('doors_distribution', rates.doors_distribution)}</td>
          </tr>
          
          {/* Clips / Set / Install row */}
          <tr>
            <td className="task-label">Clips</td>
            <td className="rate-cell">{renderCell('bays_clips', rates.bays_clips)}</td>
            <td className="rate-cell">{renderCell('bays_big_clips', rates.bays_big_clips)}</td>
            <td className="spacer-cell">Set</td>
            <td className="rate-cell">{renderCell('dlos_set', rates.dlos_set)}</td>
            <td className="rate-cell">{renderCell('dlos_big_set', rates.dlos_big_set)}</td>
            <td className="spacer-cell">Install</td>
            <td className="rate-cell">{renderCell('doors_install', rates.doors_install)}</td>
          </tr>
          
          {/* Set / Total / Total row */}
          <tr>
            <td className="task-label">Set</td>
            <td className="rate-cell">{renderCell('bays_set', rates.bays_set)}</td>
            <td className="rate-cell">{renderCell('bays_big_set', rates.bays_big_set)}</td>
            <td className="spacer-cell">Total</td>
            <td className="rate-cell total-cell">{totals.dlos.toFixed(2)}</td>
            <td className="rate-cell total-cell">{totals.dlos_big.toFixed(2)}</td>
            <td className="spacer-cell">Total</td>
            <td className="rate-cell total-cell">{totals.doors.toFixed(2)}</td>
          </tr>
          
          {/* Total row */}
          <tr className="total-row">
            <td className="task-label">Total</td>
            <td className="rate-cell total-cell">{totals.bays.toFixed(2)}</td>
            <td className="rate-cell total-cell">{totals.bays_big.toFixed(2)}</td>
            <td className="spacer-cell"></td>
            <td className="rate-cell"></td>
            <td className="rate-cell"></td>
            <td className="spacer-cell"></td>
            <td className="rate-cell"></td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}
