/**
 * Frame Grid - Virtualized table for 1000+ frames
 * Displays frame data with inline editing
 * Dynamic columns based on system type (Ext SF 1, Int SF, Cap CW, etc.)
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useBidSheet } from '../../context/BidSheetContext';
import { getSystemColumns } from './systemColumns';
import './FrameGrid.css';

export default function FrameGrid({ systemId, systemConfig, frames, loading }) {
  const { updateFrame, deleteFrame, addFrame } = useBidSheet();
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [localFrames, setLocalFrames] = useState(frames);
  const inputRef = useRef(null);
  
  // Update local frames when props change (but not during active editing)
  useEffect(() => {
    if (!editingCell) {
      // Not editing: safe to fully sync with backend data
      console.log('✅ Syncing localFrames with frames (not editing)');
      setLocalFrames(frames);
    } else {
      // Currently editing: merge calculated values only (SF, MHs, Cost)
      // This preserves user's current input while updating calculations
      console.log(`⚡ Merging calculated values (editing ${editingCell.field} in frame ${editingCell.frameId})`);
      setLocalFrames(prevFrames => {
        return frames.map(newFrame => {
          const existingFrame = prevFrames.find(f => f.id === newFrame.id);
          if (!existingFrame) return newFrame;
          
          // If this is the frame being edited, preserve input fields
          if (editingCell.frameId === newFrame.id) {
            console.log(`  Preserving input fields for frame ${newFrame.id}, updating calculations only`);
            return {
              ...existingFrame,
              // Update only calculated fields from backend
              sf: newFrame.sf,
              total_mhs: newFrame.total_mhs,
              total_cost: newFrame.total_cost,
              shop_mhs: newFrame.shop_mhs,
              dist_mhs: newFrame.dist_mhs,
              field_mhs: newFrame.field_mhs
            };
          }
          
          // For other frames, use the new data
          return newFrame;
        });
      });
    }
  }, [frames, editingCell]);
  
  // Get system-specific columns
  const columns = useMemo(() => getSystemColumns(systemId), [systemId]);
  const editableColumns = useMemo(() => columns.filter(col => col.editable), [columns]);
  
  // Handle cell edit start
  const handleCellEdit = (frameId, field, currentValue) => {
    setEditingCell({ frameId, field });
    setEditValue(currentValue?.toString() || '');
  };
  
  // Handle cell edit save
  const handleCellSave = async () => {
    if (!editingCell) return;
    
    const { frameId, field } = editingCell;
    let value = editValue;
    
    // Convert to number for numeric fields
    if (['width', 'height', 'quantity', 'subsills', 'bays', 'dlos', 'pairs', 'singles', 'ssg', 'steel', 'vents', 'brake', 'open', 'stool_trim', 'ft', 'wl_dl'].includes(field)) {
      value = parseFloat(editValue) || 0;
    }
    
    // Update local state immediately
    setLocalFrames(prevFrames => 
      prevFrames.map(frame => 
        frame.id === frameId 
          ? { ...frame, [field]: value }
          : frame
      )
    );
    
    try {
      await updateFrame(frameId, { [field]: value });
    } catch (err) {
      console.error('Failed to save cell:', err);
      // Revert on error
      setLocalFrames(frames);
    }
    
    setEditingCell(null);
  };
  
  // Save current cell without clearing edit state (for navigation)
  const saveCellValue = (frameId, field, value) => {
    let processedValue = value;
    
    // Convert to number for numeric fields
    if (['width', 'height', 'quantity', 'subsills', 'bays', 'dlos', 'pairs', 'singles', 'ssg', 'steel', 'vents', 'brake', 'open', 'stool_trim', 'ft', 'wl_dl'].includes(field)) {
      processedValue = parseFloat(value) || 0;
    }
    
    // Update local state immediately (optimistic update)
    setLocalFrames(prevFrames => 
      prevFrames.map(frame => 
        frame.id === frameId 
          ? { ...frame, [field]: processedValue }
          : frame
      )
    );
    
    // Save to backend without blocking navigation
    updateFrame(frameId, { [field]: processedValue })
      .then(() => {
        console.log(`✅ Saved ${field}=${processedValue} for frame ${frameId}`);
      })
      .catch(err => {
        console.error('Failed to save cell:', err);
        // Revert on error
        setLocalFrames(frames);
      });
  };
  
  // Handle cell edit cancel
  const handleCellCancel = () => {
    setEditingCell(null);
  };
  
  // Navigate to next/previous cell (Tab navigation)
  const moveToNextCell = (currentCell, reverse = false) => {
    const { frameId, field } = currentCell;
    const frameIndex = localFrames.findIndex(f => f.id === frameId);
    const fieldIndex = editableColumns.findIndex(col => col.key === field);
    
    let nextFrameIndex = frameIndex;
    let nextFieldIndex = fieldIndex;
    
    if (reverse) {
      // Move backwards (Shift+Tab)
      nextFieldIndex--;
      if (nextFieldIndex < 0) {
        nextFrameIndex--;
        nextFieldIndex = editableColumns.length - 1;
      }
    } else {
      // Move forwards (Tab)
      nextFieldIndex++;
      if (nextFieldIndex >= editableColumns.length) {
        nextFrameIndex++;
        nextFieldIndex = 0;
      }
    }
    
    // Check bounds
    if (nextFrameIndex >= 0 && nextFrameIndex < localFrames.length) {
      const nextFrame = localFrames[nextFrameIndex];
      const nextField = editableColumns[nextFieldIndex];
      if (nextField) {
        // Immediately set the next cell as editing
        setEditingCell({ frameId: nextFrame.id, field: nextField.key });
        setEditValue(nextFrame[nextField.key]?.toString() || '');
      }
    } else {
      // If out of bounds, just clear editing state
      setEditingCell(null);
    }
  };

  // Move using arrow keys without wrapping
  const moveToCellByDirection = (currentCell, key) => {
    if (!currentCell) return;
    const frameIndex = localFrames.findIndex(f => f.id === currentCell.frameId);
    const fieldIndex = editableColumns.findIndex(col => col.key === currentCell.field);
    if (frameIndex === -1 || fieldIndex === -1) return;

    let nextFrameIndex = frameIndex;
    let nextFieldIndex = fieldIndex;

    switch (key) {
      case 'ArrowRight':
        nextFieldIndex = Math.min(fieldIndex + 1, editableColumns.length - 1);
        break;
      case 'ArrowLeft':
        nextFieldIndex = Math.max(fieldIndex - 1, 0);
        break;
      case 'ArrowDown':
        nextFrameIndex = Math.min(frameIndex + 1, localFrames.length - 1);
        break;
      case 'ArrowUp':
        nextFrameIndex = Math.max(frameIndex - 1, 0);
        break;
      default:
        return;
    }

    if (nextFrameIndex === frameIndex && nextFieldIndex === fieldIndex) {
      return;
    }

    const nextFrame = localFrames[nextFrameIndex];
    const nextField = editableColumns[nextFieldIndex];
    if (!nextFrame || !nextField) return;

    setEditingCell({ frameId: nextFrame.id, field: nextField.key });
    setEditValue(nextFrame[nextField.key]?.toString() || '');
  };
  
  // Handle key press in edit mode
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const currentCell = editingCell;
      const currentValue = editValue;
      if (currentCell) {
        saveCellValue(currentCell.frameId, currentCell.field, currentValue);
        // Use requestAnimationFrame to ensure smooth transition
        requestAnimationFrame(() => {
          moveToNextCell(currentCell, false);
        });
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCellCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const currentCell = editingCell;
      const currentValue = editValue;
      if (currentCell) {
        saveCellValue(currentCell.frameId, currentCell.field, currentValue);
        // Use requestAnimationFrame to ensure smooth transition
        requestAnimationFrame(() => {
          moveToNextCell(currentCell, e.shiftKey);
        });
      }
    } else if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const currentCell = editingCell;
      const currentValue = editValue;
      if (currentCell) {
        saveCellValue(currentCell.frameId, currentCell.field, currentValue);
        requestAnimationFrame(() => {
          moveToCellByDirection(currentCell, e.key);
        });
      }
    }
  };
  
  // Handle individual frame delete with confirmation
  const handleDeleteFrame = async (frame) => {
    const frameLabel = frame.frame_number || `Frame ${frame.id}`;
    if (confirm(`Are you sure you want to delete ${frameLabel}?`)) {
      try {
        await deleteFrame(frame.id);
      } catch (err) {
        console.error('Failed to delete frame:', err);
        alert('Failed to delete frame. Please try again.');
      }
    }
  };
  
  // Handle add new frame
  const handleAddFrame = () => {
    // Create new frame with default values for all system fields
    const newFrame = {
      frame_number: `NEW-${Date.now()}`,
      comments: '',
      ...columns.reduce((acc, col) => {
        if (col.type === 'number' && col.key !== 'frame_number') {
          acc[col.key] = 0;
        }
        return acc;
      }, {})
    };
    addFrame(newFrame);
  };
  
  // Render editable cell
  const renderCell = (frame, field, value, isNumeric = false) => {
    const isEditing = editingCell?.frameId === frame.id && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="text"
          inputMode={isNumeric ? 'numeric' : 'text'}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellSave}
          onKeyDown={handleKeyPress}
          onFocus={(e) => e.target.select()}
          className={`cell-input ${isNumeric ? 'numeric-input' : ''}`}
          autoFocus
        />
      );
    }
    
    // Check if value is empty/zero for display
    const isEmpty = value === null || value === undefined || value === '' || value === 0;
    
    return (
      <span 
        className={`cell-value editable ${isEmpty ? 'empty-cell' : ''}`}
        onClick={() => handleCellEdit(frame.id, field, value)}
      >
        {value !== null && value !== undefined && value !== '' && value !== 0 ? value : ''}
      </span>
    );
  };
  
  if (loading) {
    return (
      <div className="frame-grid-loading">
        <div className="loading-spinner"></div>
        <p>Loading frames...</p>
      </div>
    );
  }
  
  return (
    <div className="frame-grid">
      {/* Grid Container */}
      <div className="frame-grid-container">
        {localFrames.length === 0 ? (
          <div className="frame-grid-empty">
            <p>No frames found. Import PartnerPak or add manually.</p>
            <button className="btn-primary" onClick={handleAddFrame}>
              Add First Frame
            </button>
          </div>
        ) : (
          <table className="frame-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th 
                    key={col.key} 
                    className={`col-${col.key} group-${col.group || 'default'}`}
                    style={{ minWidth: col.width }}
                    title={col.tooltip || col.label}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="col-actions group-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {localFrames.map((frame, index) => (
                <tr key={frame.id}>
                  {columns.map((col) => (
                    <td 
                      key={col.key}
                      className={`col-${col.key} group-${col.group || 'default'}`}
                    >
                      {col.editable ? (
                        renderCell(frame, col.key, frame[col.key], col.type === 'number')
                      ) : (
                        (() => {
                          const value = frame[col.key];
                          const displayValue = value !== null && value !== undefined && value !== 0
                            ? (col.type === 'number' ? value?.toFixed(2) : value)
                            : '';
                          const isEmpty = value === null || value === undefined || value === 0 || value === '';
                          return (
                            <span className={`cell-value readonly ${isEmpty ? 'empty-cell' : ''}`}>
                              {displayValue}
                            </span>
                          );
                        })()
                      )}
                    </td>
                  ))}
                  <td className="col-actions">
                    <button
                      className="btn-icon btn-delete-row"
                      onClick={() => handleDeleteFrame(frame)}
                      title="Delete frame"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Footer Totals */}
      {localFrames.length > 0 && (
        <div className="frame-grid-footer">
          <div className="footer-stat">
            <span className="footer-label">Total Frames:</span>
            <span className="footer-value">{localFrames.length}</span>
          </div>
          <div className="footer-item">
            <span className="footer-label">Total SF:</span>
            <span className="footer-value">
              {localFrames.reduce((sum, f) => sum + (f.sf || 0), 0).toFixed(2)}
            </span>
          </div>
          <div className="footer-item">
            <span className="footer-label">Total MHs:</span>
            <span className="footer-value">
              {localFrames.reduce((sum, f) => sum + (f.total_mhs || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
