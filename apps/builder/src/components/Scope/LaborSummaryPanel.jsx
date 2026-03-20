/**
 * LaborSummaryPanel.jsx - Layer 36: Labor Breakdown Display
 * 
 * Displays complete labor calculations matching Excel Bid Sheet format:
 * - System totals (MHs, Cost, Per SF)
 * - Task-by-task breakdown (15 rows)
 * - Shop/Distribution/Field categorization
 * 
 * Consumes data from calculateProductionBasedLabor() in pricingLogic.js
 */

import React, { useMemo } from 'react';
import { calculateProductionBasedLabor } from '../../utils/pricingLogic';

const LaborSummaryPanel = ({ estimateItems, system }) => {
  
  // Calculate labor for all frames in system
  const laborData = useMemo(() => {
    if (!estimateItems || estimateItems.length === 0) {
      return {
        totalHours: 0,
        totalCost: 0,
        totalArea: 0,
        breakdown: {}
      };
    }

    let totalHours = 0;
    let totalCost = 0;
    let totalArea = 0;
    
    // Initialize task accumulators
    const taskBreakdown = {
      joints: { qty: 0, totalHours: 0, cost: 0 },
      dist: { qty: 0, totalHours: 0, cost: 0 },
      subsills: { qty: 0, totalHours: 0, cost: 0 },
      bays: { qty: 0, totalHours: 0, cost: 0 },
      addBays: { qty: 0, totalHours: 0, cost: 0 },
      dlos: { qty: 0, totalHours: 0, cost: 0 },
      addDlos: { qty: 0, totalHours: 0, cost: 0 },
      pairs: { qty: 0, totalHours: 0, cost: 0 },
      singles: { qty: 0, totalHours: 0, cost: 0 },
      caulk: { qty: 0, totalHours: 0, cost: 0 },
      ssg: { qty: 0, totalHours: 0, cost: 0 },
      steel: { qty: 0, totalHours: 0, cost: 0 },
      vents: { qty: 0, totalHours: 0, cost: 0 },
      brakeMetal: { qty: 0, totalHours: 0, cost: 0 },
      open: { qty: 0, totalHours: 0, cost: 0 }
    };

    // Sum across all frames
    estimateItems.forEach(item => {
      const labor = calculateProductionBasedLabor(item, system, {});
      
      if (labor && labor.breakdown) {
        totalHours += labor.totalHours || 0;
        totalCost += labor.totalCost || 0;
        
        // Calculate area
        const width = parseFloat(item.width) || 0;
        const height = parseFloat(item.height) || 0;
        const qty = parseFloat(item.qty) || 1;
        totalArea += (width * height * qty) / 144; // Convert to SF
        
        // Accumulate each task
        Object.keys(taskBreakdown).forEach(taskKey => {
          if (labor.breakdown[taskKey]) {
            taskBreakdown[taskKey].qty += labor.breakdown[taskKey].qty || 0;
            taskBreakdown[taskKey].totalHours += labor.breakdown[taskKey].totalHours || 0;
            taskBreakdown[taskKey].cost += labor.breakdown[taskKey].cost || 0;
          }
        });
      }
    });

    return {
      totalHours,
      totalCost,
      totalArea,
      breakdown: taskBreakdown
    };
  }, [estimateItems, system]);

  // Get Hr Function rates from system
  const hrRates = system?.hrFunctionRates || {};
  
  // Task display configuration
  const taskConfig = [
    { key: 'joints', label: 'Joints', category: 'Shop' },
    { key: 'dist', label: 'Distribution', category: 'Distribution' },
    { key: 'subsills', label: 'Subsills', category: 'Field' },
    { key: 'bays', label: 'Bays (Standard)', category: 'Field' },
    { key: 'addBays', label: '> Bays (Add-on)', category: 'Field' },
    { key: 'dlos', label: 'DLOs (Standard)', category: 'Field' },
    { key: 'addDlos', label: '> DLOs (Add-on)', category: 'Field' },
    { key: 'pairs', label: 'Door Pairs', category: 'Field' },
    { key: 'singles', label: 'Single Doors', category: 'Field' },
    { key: 'caulk', label: 'Caulking', category: 'Field' },
    { key: 'ssg', label: 'SSG', category: 'Field' },
    { key: 'steel', label: 'Steel Reinforcement', category: 'Shop' },
    { key: 'vents', label: 'Vents', category: 'Field' },
    { key: 'brakeMetal', label: 'Brake Metal', category: 'Shop' },
    { key: 'open', label: 'Open Field', category: 'Field' }
  ];

  // Calculate per SF metrics
  const hoursPerSF = laborData.totalArea > 0 ? laborData.totalHours / laborData.totalArea : 0;
  const costPerSF = laborData.totalArea > 0 ? laborData.totalCost / laborData.totalArea : 0;

  // Calculate category totals
  const categoryTotals = useMemo(() => {
    const totals = { Shop: 0, Distribution: 0, Field: 0 };
    
    taskConfig.forEach(task => {
      const taskData = laborData.breakdown[task.key];
      if (taskData) {
        totals[task.category] += taskData.totalHours || 0;
      }
    });
    
    return totals;
  }, [laborData, taskConfig]);

  // Styles
  const excelHeaderStyle = {
    padding: '8px 12px',
    backgroundColor: '#0969da',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '700',
    textAlign: 'left',
    borderBottom: '1px solid #d0d7de'
  };

  const excelCellStyle = {
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: 'monospace',
    borderBottom: '1px solid #d0d7de'
  };

  const excelTotalStyle = {
    ...excelCellStyle,
    backgroundColor: '#d1f4e0',
    fontWeight: '700',
    color: '#1a7f37'
  };

  if (!estimateItems || estimateItems.length === 0) {
    return (
      <div style={{
        backgroundColor: '#fff3cd',
        border: '2px solid #ffc107',
        borderRadius: '8px',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
        <h4 style={{ margin: '0 0 8px 0', color: '#664d03' }}>
          No Labor Data to Display
        </h4>
        <p style={{ margin: 0, fontSize: '13px', color: '#664d03' }}>
          Import PartnerPak data to see labor calculations
        </p>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      border: '2px solid #d0d7de',
      overflow: 'hidden'
    }}>
      
      {/* Header: System Totals */}
      <div style={{
        backgroundColor: '#0969da',
        color: '#ffffff',
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
            💼 LABOR SUMMARY
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>
            {estimateItems.length} frames • {laborData.totalArea.toFixed(0)} SF
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '24px', fontWeight: '700' }}>
            ${laborData.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>
            {laborData.totalHours.toFixed(2)} MHs @ ${costPerSF.toFixed(2)}/SF
          </div>
        </div>
      </div>

      {/* Category Breakdown Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        backgroundColor: '#f6f8fa',
        borderBottom: '2px solid #d0d7de'
      }}>
        <div style={{ padding: '12px', borderRight: '1px solid #d0d7de' }}>
          <div style={{ fontSize: '11px', color: '#656d76', marginBottom: '4px' }}>🏭 Shop</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0969da' }}>
            {categoryTotals.Shop.toFixed(1)} MHs
          </div>
          <div style={{ fontSize: '11px', color: '#656d76' }}>
            {laborData.totalArea > 0 ? (categoryTotals.Shop / laborData.totalArea).toFixed(3) : '0.000'} MHs/SF
          </div>
        </div>
        <div style={{ padding: '12px', borderRight: '1px solid #d0d7de' }}>
          <div style={{ fontSize: '11px', color: '#656d76', marginBottom: '4px' }}>🚛 Distribution</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#9a6700' }}>
            {categoryTotals.Distribution.toFixed(1)} MHs
          </div>
          <div style={{ fontSize: '11px', color: '#656d76' }}>
            {laborData.totalArea > 0 ? (categoryTotals.Distribution / laborData.totalArea).toFixed(3) : '0.000'} MHs/SF
          </div>
        </div>
        <div style={{ padding: '12px' }}>
          <div style={{ fontSize: '11px', color: '#656d76', marginBottom: '4px' }}>🔧 Field</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a7f37' }}>
            {categoryTotals.Field.toFixed(1)} MHs
          </div>
          <div style={{ fontSize: '11px', color: '#656d76' }}>
            {laborData.totalArea > 0 ? (categoryTotals.Field / laborData.totalArea).toFixed(3) : '0.000'} MHs/SF
          </div>
        </div>
      </div>

      {/* Task Breakdown Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{...excelHeaderStyle, width: '200px'}}>Task Type</th>
              <th style={{...excelHeaderStyle, width: '100px', textAlign: 'center'}}>Category</th>
              <th style={{...excelHeaderStyle, width: '100px', textAlign: 'right'}}>Count</th>
              <th style={{...excelHeaderStyle, width: '100px', textAlign: 'right'}}>Hrs/Unit</th>
              <th style={{...excelHeaderStyle, width: '100px', textAlign: 'right'}}>Total MHs</th>
              <th style={{...excelHeaderStyle, width: '120px', textAlign: 'right'}}>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {taskConfig.map((task, index) => {
              const taskData = laborData.breakdown[task.key];
              const hrRate = hrRates[task.key] || 0;
              
              // Skip tasks with zero quantity
              if (!taskData || taskData.qty === 0) {
                return null;
              }

              const categoryColor = 
                task.category === 'Shop' ? '#0969da' :
                task.category === 'Distribution' ? '#9a6700' :
                '#1a7f37';

              return (
                <tr 
                  key={task.key}
                  style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f6f8fa' }}
                >
                  <td style={{...excelCellStyle, fontWeight: '600'}}>
                    {task.label}
                  </td>
                  <td style={{...excelCellStyle, textAlign: 'center'}}>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: categoryColor,
                      color: '#ffffff',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '700'
                    }}>
                      {task.category}
                    </span>
                  </td>
                  <td style={{...excelCellStyle, textAlign: 'right', color: '#0969da'}}>
                    {taskData.qty.toFixed(0)}
                  </td>
                  <td style={{...excelCellStyle, textAlign: 'right', color: '#656d76'}}>
                    {hrRate.toFixed(2)}
                  </td>
                  <td style={{...excelCellStyle, textAlign: 'right', fontWeight: '600'}}>
                    {taskData.totalHours.toFixed(2)}
                  </td>
                  <td style={{...excelCellStyle, textAlign: 'right', fontWeight: '600', color: '#1a7f37'}}>
                    ${taskData.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}

            {/* Total Row */}
            <tr>
              <td colSpan={4} style={{...excelTotalStyle, textAlign: 'right'}}>
                TOTAL LABOR
              </td>
              <td style={{...excelTotalStyle, textAlign: 'right'}}>
                {laborData.totalHours.toFixed(2)} MHs
              </td>
              <td style={{...excelTotalStyle, textAlign: 'right'}}>
                ${laborData.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
            </tr>

            {/* Per SF Row */}
            <tr>
              <td colSpan={4} style={{...excelCellStyle, textAlign: 'right', fontSize: '12px', color: '#656d76'}}>
                Per Square Foot ({laborData.totalArea.toFixed(0)} SF)
              </td>
              <td style={{...excelCellStyle, textAlign: 'right', fontWeight: '600', fontSize: '12px'}}>
                {hoursPerSF.toFixed(4)} MHs/SF
              </td>
              <td style={{...excelCellStyle, textAlign: 'right', fontWeight: '600', fontSize: '12px', color: '#1a7f37'}}>
                ${costPerSF.toFixed(2)}/SF
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer Note */}
      <div style={{
        padding: '12px 20px',
        backgroundColor: '#f6f8fa',
        fontSize: '11px',
        color: '#656d76',
        borderTop: '1px solid #d0d7de'
      }}>
        💡 <strong>Calculation Method:</strong> Count × Hr Function Rate = Total MHs. 
        Total MHs × $42/hr = Total Cost. 
        Counts calculated from frame geometry + user overrides.
      </div>
    </div>
  );
};

export default LaborSummaryPanel;
