/**
 * HrFunctionRatesPanel.jsx - Layer 36b: Excel Row 2 Replica
 * 
 * Displays the Hr Function Rates table exactly as it appears in Excel Bid Sheet Row 2.
 * Shows all 15 task types with their hours-per-unit rates in a horizontal layout.
 * 
 * Excel Structure (Row 2):
 * Joints | Dist | Subsills | Bays | > Bays | DLOs | > DLOs | Pairs | Singles | Caulk | SSG | Steel | Vents | Brake | Open
 *  0.25  | 0.33 |   1.00   | 2.18 |  2.93  | 1.00 |  1.50  | 8.50  |  8.50   | 0.67  | 0.03| 0.50  | 3.00  | 1.00  | 0.00
 * 
 * Below that, shows Count, MHs, and Cost rows matching Excel Rows 3-5
 */

import React, { useMemo } from 'react';
import { calculateProductionBasedLabor } from '../../utils/pricingLogic';

const HrFunctionRatesPanel = ({ estimateItems, system }) => {
  
  // Get Hr Function rates from system
  const hrRates = system?.hrFunctionRates || {};
  
  // Task configuration matching Excel column order
  const tasks = [
    { key: 'joints', label: 'Joints' },
    { key: 'dist', label: 'Dist' },
    { key: 'subsills', label: 'Subsills' },
    { key: 'bays', label: 'Bays' },
    { key: 'addBays', label: '> Bays' },
    { key: 'dlos', label: 'DLOs' },
    { key: 'addDlos', label: '> DLOs' },
    { key: 'pairs', label: 'Pairs' },
    { key: 'singles', label: 'Singles' },
    { key: 'caulk', label: 'Caulk' },
    { key: 'ssg', label: 'SSG' },
    { key: 'steel', label: 'Steel' },
    { key: 'vents', label: 'Vents' },
    { key: 'brakeMetal', label: 'Brake Metal' },
    { key: 'open', label: 'Open' }
  ];

  // Calculate totals across all frames
  const totals = useMemo(() => {
    if (!estimateItems || estimateItems.length === 0) {
      return { count: {}, mhs: {}, cost: {}, totalMHs: 0, totalCost: 0, totalArea: 0 };
    }

    const count = {};
    const mhs = {};
    const cost = {};
    let totalMHs = 0;
    let totalCost = 0;
    let totalArea = 0;

    // Initialize accumulators
    tasks.forEach(task => {
      count[task.key] = 0;
      mhs[task.key] = 0;
      cost[task.key] = 0;
    });

    // Sum across all frames
    estimateItems.forEach(item => {
      const labor = calculateProductionBasedLabor(item, system, {});
      
      if (labor && labor.breakdown) {
        Object.keys(labor.breakdown).forEach(taskKey => {
          if (count[taskKey] !== undefined) {
            count[taskKey] += labor.breakdown[taskKey].qty || 0;
            mhs[taskKey] += labor.breakdown[taskKey].totalHours || 0;
            cost[taskKey] += labor.breakdown[taskKey].cost || 0;
          }
        });
        
        totalMHs += labor.totalHours || 0;
        totalCost += labor.totalCost || 0;
      }

      // Calculate area
      const width = parseFloat(item.width) || 0;
      const height = parseFloat(item.height) || 0;
      const qty = parseFloat(item.qty) || 1;
      totalArea += (width * height * qty) / 144; // SF
    });

    return { count, mhs, cost, totalMHs, totalCost, totalArea };
  }, [estimateItems, system, tasks]);

  const mhsPerSF = totals.totalArea > 0 ? totals.totalMHs / totals.totalArea : 0;
  const costPerSF = totals.totalArea > 0 ? totals.totalCost / totals.totalArea : 0;

  // Cell styles matching Excel
  const cellStyle = {
    padding: '8px 4px',
    textAlign: 'center',
    fontSize: '11px',
    fontFamily: 'monospace',
    border: '1px solid #d0d7de',
    backgroundColor: '#ffffff',
    minWidth: '60px'
  };

  const headerStyle = {
    ...cellStyle,
    backgroundColor: '#f6f8fa',
    fontWeight: '700',
    fontSize: '10px',
    color: '#57606a'
  };

  const labelStyle = {
    ...cellStyle,
    backgroundColor: '#f6f8fa',
    fontWeight: '700',
    textAlign: 'left',
    paddingLeft: '12px',
    minWidth: '120px',
    color: '#1f2328'
  };

  const totalCellStyle = {
    ...cellStyle,
    backgroundColor: '#d1f4e0',
    fontWeight: '700',
    fontSize: '12px',
    color: '#1a7f37'
  };

  return (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      border: '2px solid #0969da',
      overflow: 'hidden'
    }}>
      
      {/* Header */}
      <div style={{
        backgroundColor: '#0969da',
        color: '#ffffff',
        padding: '12px 16px',
        fontWeight: '700',
        fontSize: '14px',
        letterSpacing: '0.5px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>⚙️ HR FUNCTION RATES & LABOR SUMMARY</span>
        <span style={{ fontSize: '12px', opacity: 0.9 }}>
          Excel Rows 2-5 Replica
        </span>
      </div>

      {/* Scrollable table container */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
          
          {/* Row 1: Task Names (Column Headers) */}
          <thead>
            <tr>
              <th style={{...headerStyle, minWidth: '150px'}}>Metric</th>
              {tasks.map(task => (
                <th key={task.key} style={headerStyle}>
                  {task.label}
                </th>
              ))}
              <th style={{...headerStyle, minWidth: '100px'}}>TOTAL</th>
            </tr>
          </thead>

          <tbody>
            
            {/* Row 2: Hr Function Rates (Excel Row 2) */}
            <tr>
              <td style={labelStyle}>Hr Function</td>
              {tasks.map(task => (
                <td key={task.key} style={{...cellStyle, fontWeight: '600', color: '#0969da'}}>
                  {(hrRates[task.key] || 0).toFixed(2)}
                </td>
              ))}
              <td style={{...cellStyle, backgroundColor: '#f6f8fa'}}>
                -
              </td>
            </tr>

            {/* Row 3: Count (Excel Row 3) */}
            <tr>
              <td style={labelStyle}>Count</td>
              {tasks.map(task => (
                <td key={task.key} style={{...cellStyle, fontWeight: '500'}}>
                  {Math.round(totals.count[task.key] || 0)}
                </td>
              ))}
              <td style={{...cellStyle, backgroundColor: '#f6f8fa', fontWeight: '600'}}>
                {estimateItems.length} frames
              </td>
            </tr>

            {/* Row 4: MHs (Excel Row 4) */}
            <tr>
              <td style={labelStyle}>MHs</td>
              {tasks.map(task => (
                <td key={task.key} style={{...cellStyle, fontWeight: '600', color: '#1a7f37'}}>
                  {(totals.mhs[task.key] || 0).toFixed(2)}
                </td>
              ))}
              <td style={totalCellStyle}>
                {totals.totalMHs.toFixed(2)}
              </td>
            </tr>

            {/* Row 5: Cost (Excel Row 5) */}
            <tr>
              <td style={labelStyle}>Cost</td>
              {tasks.map(task => (
                <td key={task.key} style={{...cellStyle, fontWeight: '600', color: '#1a7f37'}}>
                  ${(totals.cost[task.key] || 0).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                </td>
              ))}
              <td style={totalCellStyle}>
                ${totals.totalCost.toLocaleString('en-US', {minimumFractionDigits: 2})}
              </td>
            </tr>

            {/* Row 6: Total Labor Summary (Excel Row 6) */}
            <tr>
              <td colSpan={tasks.length + 2} style={{
                padding: '12px',
                backgroundColor: '#0969da',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                  <span>
                    📊 Total Labor: <strong>{totals.totalMHs.toFixed(2)} MHs</strong>
                  </span>
                  <span>
                    📐 {mhsPerSF.toFixed(3)} MHs/SF
                  </span>
                  <span>
                    💰 ${totals.totalCost.toLocaleString('en-US', {minimumFractionDigits: 2})}
                  </span>
                  <span>
                    💵 ${costPerSF.toFixed(2)}/SF
                  </span>
                  <span>
                    📦 {totals.totalArea.toFixed(0)} SF • {estimateItems.length} Frames
                  </span>
                </div>
              </td>
            </tr>

          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div style={{
        padding: '8px 12px',
        backgroundColor: '#f6f8fa',
        fontSize: '11px',
        color: '#656d76',
        borderTop: '1px solid #d0d7de'
      }}>
        💡 This table replicates Excel Bid Sheet Rows 2-6. Hr Function × Count = MHs. MHs × $42/hr = Cost.
      </div>
    </div>
  );
};

export default HrFunctionRatesPanel;
