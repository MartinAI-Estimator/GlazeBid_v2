import React, { useState, useMemo } from 'react';
import { calculateProductionBasedLabor } from '../../utils/pricingLogic';

/**
 * SystemScopeGrid Component - Layer 34
 * Unified data grid that combines editable inputs with PartnerPak import data
 * 
 * Layout:
 * - Left Side (Editable): Comments, Subsills, Add Bays, Pairs, Singles, Steel, Vents, Brake Metal
 * - Right Side (Read-Only): Frame Name, Width, Height, Qty (from PartnerPak)
 * - Far Right (Calculated): Labor MHs, Labor Cost (Layer 36)
 * 
 * This replicates the Excel "Ext SF 1" sheet workflow where users:
 * 1. Import PartnerPak data (right columns)
 * 2. Add row-by-row specifications (left columns)
 * 3. See calculated labor automatically (far right)
 */
const SystemScopeGrid = ({ rows, onUpdateRow, system }) => {
  // DEBUG: Log when component renders
  console.log('🔍 SystemScopeGrid rendered:', {
    rowCount: rows?.length || 0,
    systemName: system?.name,
    sampleRow: rows?.[0]
  });

  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');

  // Handle sorting
  const sortedRows = useMemo(() => {
    if (!sortColumn) return rows;
    
    return [...rows].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      
      // Handle numeric columns
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // Handle string columns
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
      
      if (sortDirection === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
  }, [rows, sortColumn, sortDirection]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleCellChange = (rowId, field, value) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    
    // Parse numeric values
    let parsedValue = value;
    if (['subsills', 'addBays', 'dlos', 'pairs', 'singles', 'vents', 'brakeMetal', 'open'].includes(field)) {
      parsedValue = value === '' ? 0 : parseFloat(value) || 0;
    }
    
    onUpdateRow(rowId, { [field]: parsedValue });
  };

  const handleSteelToggle = (rowId, currentValue) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    
    onUpdateRow(rowId, { steel: !currentValue });
  };

  const handleSSGToggle = (rowId, currentValue) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    
    onUpdateRow(rowId, { ssg: !currentValue });
  };

  // Excel-like cell styles
  const cellStyle = {
    padding: '8px 10px',
    border: '1px solid #30363d',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#0d1117'
  };

  const inputCellStyle = {
    ...cellStyle,
    backgroundColor: '#ffffff',
    color: '#000000'
  };

  const readOnlyCellStyle = {
    ...cellStyle,
    backgroundColor: '#1c2128',
    color: '#8b949e'
  };

  const headerStyle = {
    padding: '10px',
    border: '1px solid #30363d',
    backgroundColor: '#161b22',
    color: '#c9d1d9',
    fontSize: '12px',
    fontWeight: '600',
    textAlign: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    position: 'sticky',
    top: 0,
    zIndex: 10
  };

  const inputStyle = {
    width: '100%',
    padding: '4px 6px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#000000',
    fontSize: '13px',
    fontFamily: 'monospace',
    textAlign: 'right'
  };

  if (rows.length === 0) {
    return (
      <div style={{
        padding: '60px',
        textAlign: 'center',
        color: '#8b949e',
        backgroundColor: '#0d1117',
        borderRadius: '8px',
        border: '1px solid #30363d'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <h3 style={{ margin: '0 0 8px 0', color: '#c9d1d9' }}>
          No items for {system?.name || 'this system'}
        </h3>
        <p style={{ margin: 0, fontSize: '13px' }}>
          Import a PartnerPak file to populate this grid
        </p>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#0d1117',
      borderRadius: '8px',
      border: '1px solid #30363d',
      overflow: 'auto',
      maxHeight: 'calc(100vh - 400px)'
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px'
      }}>
        <thead>
          <tr>
            {/* Input Section Header */}
            <th colSpan={12} style={{
              ...headerStyle,
              backgroundColor: '#ff9966',
              color: '#000000',
              fontSize: '14px',
              fontWeight: '700',
              textAlign: 'center',
              padding: '12px'
            }}>
              Input
            </th>
            {/* Calculated Section Header */}
            <th colSpan={2} style={{
              ...headerStyle,
              backgroundColor: '#3fb950',
              color: '#000000',
              fontSize: '14px',
              fontWeight: '700',
              textAlign: 'center',
              padding: '12px'
            }}>
              Calculated Labor
            </th>
          </tr>
          <tr>
            {/* Match Excel exactly */}
            <th style={headerStyle} onClick={() => handleSort('label')}>
              Name
              {sortColumn === 'label' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('comments')}>
              Comments
              {sortColumn === 'comments' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('subsills')}>
              + Subsills
              {sortColumn === 'subsills' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('addBays')}>
              &gt; Bays
              {sortColumn === 'addBays' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('dlos')}>
              &gt; DLOs
              {sortColumn === 'dlos' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('pairs')}>
              Pairs
              {sortColumn === 'pairs' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('singles')}>
              Singles
              {sortColumn === 'singles' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('ssg')}>
              SSG
              {sortColumn === 'ssg' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('steel')}>
              Steel
              {sortColumn === 'steel' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('vents')}>
              Vents
              {sortColumn === 'vents' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={{...headerStyle, backgroundColor: '#a8d5ff'}} onClick={() => handleSort('brakeMetal')}>
              Brake
              {sortColumn === 'brakeMetal' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            <th style={{...headerStyle, backgroundColor: '#a8d5ff'}} onClick={() => handleSort('open')}>
              Open
              {sortColumn === 'open' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
            </th>
            {/* Layer 36: Labor Calculation Columns */}
            <th style={{...headerStyle, backgroundColor: '#d1f4e0', color: '#1a7f37'}}>
              MHs
            </th>
            <th style={{...headerStyle, backgroundColor: '#d1f4e0', color: '#1a7f37'}}>
              Labor Cost
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={row.id} style={{
              backgroundColor: index % 2 === 0 ? '#0d1117' : '#161b22'
            }}>
              {/* 1. Name (Frame Label) */}
              <td style={{...inputCellStyle, backgroundColor: '#ffccaa', color: '#000000', fontWeight: 'bold'}}>
                {row.label || '--'}
              </td>
              
              {/* 2. Comments */}
              <td style={inputCellStyle}>
                <input
                  type="text"
                  value={row.comments || ''}
                  onChange={(e) => handleCellChange(row.id, 'comments', e.target.value)}
                  style={{ ...inputStyle, textAlign: 'left' }}
                  placeholder=""
                />
              </td>
              
              {/* 3. + Subsills */}
              <td style={inputCellStyle}>
                <input
                  type="number"
                  value={row.subsills || 0}
                  onChange={(e) => handleCellChange(row.id, 'subsills', e.target.value)}
                  style={inputStyle}
                  min="0"
                  step="1"
                />
              </td>
              
              {/* 4. > Bays */}
              <td style={inputCellStyle}>
                <input
                  type="number"
                  value={row.addBays || 0}
                  onChange={(e) => handleCellChange(row.id, 'addBays', e.target.value)}
                  style={inputStyle}
                  min="0"
                  step="1"
                />
              </td>
              
              {/* 5. > DLOs */}
              <td style={inputCellStyle}>
                <input
                  type="number"
                  value={row.dlos || 0}
                  onChange={(e) => handleCellChange(row.id, 'dlos', e.target.value)}
                  style={inputStyle}
                  min="0"
                  step="1"
                />
              </td>
              
              {/* 6. Pairs */}
              <td style={inputCellStyle}>
                <input
                  type="number"
                  value={row.pairs || 0}
                  onChange={(e) => handleCellChange(row.id, 'pairs', e.target.value)}
                  style={inputStyle}
                  min="0"
                  step="1"
                />
              </td>
              
              {/* 7. Singles */}
              <td style={inputCellStyle}>
                <input
                  type="number"
                  value={row.singles || 0}
                  onChange={(e) => handleCellChange(row.id, 'singles', e.target.value)}
                  style={inputStyle}
                  min="0"
                  step="1"
                />
              </td>
              
              {/* 8. SSG (checkbox) */}
              <td style={{ ...inputCellStyle, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={row.ssg || false}
                  onChange={() => handleSSGToggle(row.id, row.ssg)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
              </td>
              
              {/* 9. Steel (checkbox) */}
              <td style={{ ...inputCellStyle, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={row.steel || false}
                  onChange={() => handleSteelToggle(row.id, row.steel)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
              </td>
              
              {/* 10. Vents */}
              <td style={inputCellStyle}>
                <input
                  type="number"
                  value={row.vents || 0}
                  onChange={(e) => handleCellChange(row.id, 'vents', e.target.value)}
                  style={inputStyle}
                  min="0"
                  step="1"
                />
              </td>
              
              {/* 11. Brake (blue column) */}
              <td style={{...inputCellStyle, backgroundColor: '#cce5ff'}}>
                <input
                  type="number"
                  value={row.brakeMetal || 0}
                  onChange={(e) => handleCellChange(row.id, 'brakeMetal', e.target.value)}
                  style={{...inputStyle, color: '#000000'}}
                  min="0"
                  step="0.1"
                />
              </td>
              
              {/* 12. Open (blue column) */}
              <td style={{...inputCellStyle, backgroundColor: '#cce5ff'}}>
                <input
                  type="number"
                  value={row.open || 0}
                  onChange={(e) => handleCellChange(row.id, 'open', e.target.value)}
                  style={{...inputStyle, color: '#000000'}}
                  min="0"
                  step="1"
                />
              </td>
              
              {/* Layer 36: Calculated Labor Columns */}
              {(() => {
                const labor = calculateProductionBasedLabor(row, system, {});
                return (
                  <>
                    {/* 13. Labor MHs (calculated) */}
                    <td style={{
                      ...readOnlyCellStyle,
                      backgroundColor: '#d1f4e0',
                      color: '#1a7f37',
                      fontWeight: '700',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      cursor: 'help'
                    }}
                    title={`Breakdown:\nBays: ${(labor?.breakdown?.bays?.totalHours || 0).toFixed(1)} MHs\nDLOs: ${(labor?.breakdown?.dlos?.totalHours || 0).toFixed(1)} MHs\nJoints: ${(labor?.breakdown?.joints?.totalHours || 0).toFixed(1)} MHs\nCaulk: ${(labor?.breakdown?.caulk?.totalHours || 0).toFixed(1)} MHs\n+ ${Object.keys(labor?.breakdown || {}).length - 4} more tasks`}
                    >
                      {(labor?.totalHours || 0).toFixed(2)}
                    </td>
                    
                    {/* 14. Labor Cost (calculated) */}
                    <td style={{
                      ...readOnlyCellStyle,
                      backgroundColor: '#d1f4e0',
                      color: '#1a7f37',
                      fontWeight: '700',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      cursor: 'help'
                    }}
                    title={`${(labor?.totalHours || 0).toFixed(2)} MHs × $42/hr`}
                    >
                      ${(labor?.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </>
                );
              })()}
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Summary Row */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#161b22',
        borderTop: '2px solid #238636',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: '#c9d1d9',
        fontSize: '13px',
        fontWeight: '600'
      }}>
        <div>
          📊 Total Rows: <span style={{ color: '#58a6ff' }}>{rows.length}</span>
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
          <div>
            🚪 Doors: <span style={{ color: '#3fb950' }}>
              {rows.reduce((sum, r) => sum + (r.pairs || 0) * 2 + (r.singles || 0), 0)}
            </span>
          </div>
          <div>
            💨 Vents: <span style={{ color: '#3fb950' }}>
              {rows.reduce((sum, r) => sum + (r.vents || 0), 0)}
            </span>
          </div>
          <div>
            SSG: <span style={{ color: '#3fb950' }}>
              {rows.filter(r => r.ssg).length}
            </span>
          </div>
          <div>
            🏗️ Steel: <span style={{ color: '#3fb950' }}>
              {rows.filter(r => r.steel).length}
            </span>
          </div>
          <div>
            💼 Total Labor: <span style={{ color: '#3fb950', fontWeight: '700' }}>
              {rows.reduce((sum, r) => {
                const labor = calculateProductionBasedLabor(r, system, {});
                return sum + (labor?.totalHours || 0);
              }, 0).toFixed(2)} MHs
            </span>
          </div>
          <div>
            💰 Total Cost: <span style={{ color: '#3fb950', fontWeight: '700' }}>
              ${rows.reduce((sum, r) => {
                const labor = calculateProductionBasedLabor(r, system, {});
                return sum + (labor?.totalCost || 0);
              }, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemScopeGrid;
