/**
 * ExtSFWorksheet.jsx - Layer 33: The 4 Critical Excel Tables
 * 
 * This component replicates the exact 4-table layout from the Excel "Ext SF 1" sheet:
 * - Table 1 (Top Left): Labor Triad (Shop, Field, Distribution)
 * - Table 2 (Bottom Left): Engineering & Admin (Fixed Costs)
 * - Table 3 (Center): Material Base Rates (Price Deck)
 * - Table 4 (Bottom/Wide): Quantities Engine (Calculated Display)
 * 
 * Excel Ranges:
 * - Table 1: B4:F7 (Labor)
 * - Table 2: B9:C11 (Fixed Costs)
 * - Table 3: J2:Q6 (Material Rates)
 * - Table 4: U2:AI6 (Quantities Engine)
 */

import React, { useMemo } from 'react';
import { useProject } from '../../../context/ProjectContext';
import { calculatePartnerPakSummary } from '../../../utils/pricingLogic';
import LaborSummaryPanel from '../LaborSummaryPanel';
import HrFunctionRatesPanel from '../HrFunctionRatesPanel';

const ExtSFWorksheet = ({ 
  system, 
  estimateItems,
  onUpdateSystemInputs
}) => {
  
  const { updateSystemDefinition } = useProject();
  
  // Calculate PartnerPak summary from takeoff data
  const summary = useMemo(() => 
    calculatePartnerPakSummary(estimateItems),
    [estimateItems]
  );

  // Get current inputs or defaults
  const inputs = system.inputs || {
    // TABLE 1: Labor Configuration
    shopBaseRate: 45.00,
    shopHoursPerSF: 0.11,
    shopBurdenPercent: 35,
    
    fieldBaseRate: 55.00,
    fieldHoursPerSF: 0.26,
    fieldBurdenPercent: 40,
    
    distBaseRate: 35.00,
    distHoursPerSF: 0.05,
    distBurdenPercent: 30,
    
    // TABLE 2: Fixed Costs (Engineering & Admin)
    engineeringCost: 2500,
    mockupsCost: 5000,
    freightCost: 1500,
    
    // TABLE 3: Material Base Rates
    aluminumBasePrice: 1.85,
    aluminumScrapPercent: 15,
    aluminumFinishPremium: 0.35,
    
    glassBasePrice: 12.50,
    glassWastePercent: 5,
    
    steelBasePrice: 1.25,
    steelScrapPercent: 10,
    
    miscSundryPercent: 8,
    
    // TABLE 4: Quantities Engine (System-specific factors)
    systemWeightPerLF: 3.5,  // lbs/LF of mullion
    gasketRowsPerMullion: 2,
    caulkJointSize: 0.5,
    settingBlocksPerDLO: 2
  };
  
  // Layer 35: Production Rates
  const productionRates = system.productionRates || {
    bays: { assemble: 0.5, clips: 0.68, set: 1.0 },
    addBays: { assemble: 0.75, clips: 0.68, set: 1.5 },
    dlos: { prep: 0.25, set: 0.75 },
    addDlos: { prep: 0.25, set: 1.25 },
    doors: { distribution: 0.5, install: 8.0 }
  };

  // Update input handler
  const handleInputChange = (key, value) => {
    const updatedInputs = { ...inputs, [key]: value };
    onUpdateSystemInputs(system.id, updatedInputs);
  };
  
  // Production rates handler
  const handleProductionRateChange = (category, task, value) => {
    const updatedRates = {
      ...productionRates,
      [category]: {
        ...productionRates[category],
        [task]: parseFloat(value) || 0
      }
    };
    updateSystemDefinition(system.id, { productionRates: updatedRates });
  };

  // ============================================================================
  // TABLE 1 CALCULATIONS: Labor Triad
  // ============================================================================
  
  const shopBurdenedRate = inputs.shopBaseRate * (1 + inputs.shopBurdenPercent / 100);
  const shopTotalCost = summary.area * inputs.shopHoursPerSF * shopBurdenedRate;
  
  const fieldBurdenedRate = inputs.fieldBaseRate * (1 + inputs.fieldBurdenPercent / 100);
  const fieldTotalCost = summary.area * inputs.fieldHoursPerSF * fieldBurdenedRate;
  
  const distBurdenedRate = inputs.distBaseRate * (1 + inputs.distBurdenPercent / 100);
  const distTotalCost = summary.area * inputs.distHoursPerSF * distBurdenedRate;
  
  const laborGrandTotal = shopTotalCost + fieldTotalCost + distTotalCost;

  // ============================================================================
  // TABLE 2 CALCULATIONS: Fixed Costs
  // ============================================================================
  
  const fixedCostsTotal = inputs.engineeringCost + inputs.mockupsCost + inputs.freightCost;

  // ============================================================================
  // TABLE 3 CALCULATIONS: Material Base Rates (Final costs after scrap/finish)
  // ============================================================================
  
  const aluminumFinalCost = inputs.aluminumBasePrice * (1 + inputs.aluminumScrapPercent / 100) + inputs.aluminumFinishPremium;
  const glassFinalCost = inputs.glassBasePrice * (1 + inputs.glassWastePercent / 100);
  const steelFinalCost = inputs.steelBasePrice * (1 + inputs.steelScrapPercent / 100);

  // ============================================================================
  // TABLE 4 CALCULATIONS: Quantities Engine
  // ============================================================================
  
  const metalLbs = summary.mullionLF * inputs.systemWeightPerLF * (1 + inputs.aluminumScrapPercent / 100);
  const glassSF = summary.area * (1 + inputs.glassWastePercent / 100);
  const gasketLF = summary.mullionLF * inputs.gasketRowsPerMullion * 1.05;
  
  // Caulk calculation: perimeter * joint size * multiplier / tube coverage
  const caulkTubes = Math.ceil((summary.perimeter * inputs.caulkJointSize * 1.0) / 30);
  
  // Screws: estimate ~8 per joint
  const screws = summary.joints * 8;
  
  // Setting blocks: 2 per DLO
  const settingBlocks = summary.dlos * inputs.settingBlocksPerDLO;
  
  // Anchors: estimate 1 per 4 LF of perimeter
  const anchors = Math.ceil(summary.perimeter / 4);

  // Material costs from quantities
  const metalCost = metalLbs * aluminumFinalCost;
  const glassCost = glassSF * glassFinalCost;
  const miscCost = (metalCost + glassCost) * (inputs.miscSundryPercent / 100);
  
  const materialsGrandTotal = metalCost + glassCost + miscCost;
  
  const systemGrandTotal = laborGrandTotal + fixedCostsTotal + materialsGrandTotal;

  // ============================================================================
  // EXCEL-LIKE STYLING
  // ============================================================================
  
  const excelCellStyle = {
    padding: '8px 10px',
    backgroundColor: '#ffffff',
    border: '1px solid #d0d7de',
    fontSize: '13px',
    color: '#1f2328',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  };

  const excelInputStyle = {
    ...excelCellStyle,
    width: '100%',
    textAlign: 'right',
    fontWeight: '500',
    fontFamily: 'monospace'
  };

  const excelHeaderStyle = {
    ...excelCellStyle,
    backgroundColor: '#f6f8fa',
    fontWeight: '700',
    fontSize: '12px',
    textTransform: 'uppercase',
    color: '#57606a',
    textAlign: 'center'
  };

  const excelLabelStyle = {
    ...excelCellStyle,
    backgroundColor: '#f6f8fa',
    fontWeight: '600',
    paddingLeft: '12px'
  };

  const excelCalculatedStyle = {
    ...excelCellStyle,
    backgroundColor: '#ddf4ff',
    textAlign: 'right',
    fontWeight: '600',
    fontFamily: 'monospace',
    color: '#0969da'
  };

  const excelTotalStyle = {
    ...excelCellStyle,
    backgroundColor: '#d1f4e0',
    textAlign: 'right',
    fontWeight: '700',
    fontSize: '14px',
    fontFamily: 'monospace',
    color: '#1a7f37'
  };

  return (
    <div style={{
      backgroundColor: '#f6f8fa',
      padding: '24px',
      minHeight: '100vh'
    }}>
      
      {/* Dashboard Grid Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '400px 1fr',
        gridTemplateRows: 'auto auto auto auto auto',
        gap: '24px',
        maxWidth: '1800px'
      }}>

        {/* ====================================================================
            TABLE 1: LABOR TRIAD (Top Left - B4:F7)
            ==================================================================== */}
        <div style={{
          gridColumn: '1',
          gridRow: '1',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          border: '2px solid #d0d7de',
          overflow: 'hidden'
        }}>
          <div style={{
            backgroundColor: '#0969da',
            color: '#ffffff',
            padding: '12px 16px',
            fontWeight: '700',
            fontSize: '14px',
            letterSpacing: '0.5px'
          }}>
            📊 TABLE 1: LABOR TRIAD
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={excelHeaderStyle}>Phase</th>
                <th style={excelHeaderStyle}>Base Rate ($)</th>
                <th style={excelHeaderStyle}>Hrs/SF</th>
                <th style={excelHeaderStyle}>Burden %</th>
                <th style={excelHeaderStyle}>Total ($)</th>
              </tr>
            </thead>
            <tbody>
              
              {/* Row 1: Shop/Fab Labor */}
              <tr>
                <td style={excelLabelStyle}>🏭 Shop/Fab</td>
                <td style={{ ...excelCellStyle, padding: '4px' }}>
                  <input
                    type="number"
                    step="0.50"
                    min="0"
                    value={inputs.shopBaseRate}
                    onChange={(e) => handleInputChange('shopBaseRate', parseFloat(e.target.value) || 0)}
                    style={excelInputStyle}
                  />
                </td>
                <td style={{ ...excelCellStyle, padding: '4px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputs.shopHoursPerSF}
                    onChange={(e) => handleInputChange('shopHoursPerSF', parseFloat(e.target.value) || 0)}
                    style={excelInputStyle}
                  />
                </td>
                <td style={{ ...excelCellStyle, padding: '4px' }}>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={inputs.shopBurdenPercent}
                    onChange={(e) => handleInputChange('shopBurdenPercent', parseFloat(e.target.value) || 0)}
                    style={excelInputStyle}
                  />
                </td>
                <td style={excelCalculatedStyle}>
                  ${shopTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>

              {/* Row 2: Field/Install Labor */}
              <tr>
                <td style={excelLabelStyle}>🏗️ Field/Install</td>
                <td style={{ ...excelCellStyle, padding: '4px' }}>
                  <input
                    type="number"
                    step="0.50"
                    min="0"
                    value={inputs.fieldBaseRate}
                    onChange={(e) => handleInputChange('fieldBaseRate', parseFloat(e.target.value) || 0)}
                    style={excelInputStyle}
                  />
                </td>
                <td style={{ ...excelCellStyle, padding: '4px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputs.fieldHoursPerSF}
                    onChange={(e) => handleInputChange('fieldHoursPerSF', parseFloat(e.target.value) || 0)}
                    style={excelInputStyle}
                  />
                </td>
                <td style={{ ...excelCellStyle, padding: '4px' }}>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={inputs.fieldBurdenPercent}
                    onChange={(e) => handleInputChange('fieldBurdenPercent', parseFloat(e.target.value) || 0)}
                    style={excelInputStyle}
                  />
                </td>
                <td style={excelCalculatedStyle}>
                  ${fieldTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>

              {/* Row 3: Distribution/Handling Labor */}
              <tr>
                <td style={excelLabelStyle}>🚚 Distribution</td>
                <td style={{ ...excelCellStyle, padding: '4px' }}>
                  <input
                    type="number"
                    step="0.50"
                    min="0"
                    value={inputs.distBaseRate}
                    onChange={(e) => handleInputChange('distBaseRate', parseFloat(e.target.value) || 0)}
                    style={excelInputStyle}
                  />
                </td>
                <td style={{ ...excelCellStyle, padding: '4px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputs.distHoursPerSF}
                    onChange={(e) => handleInputChange('distHoursPerSF', parseFloat(e.target.value) || 0)}
                    style={excelInputStyle}
                  />
                </td>
                <td style={{ ...excelCellStyle, padding: '4px' }}>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={inputs.distBurdenPercent}
                    onChange={(e) => handleInputChange('distBurdenPercent', parseFloat(e.target.value) || 0)}
                    style={excelInputStyle}
                  />
                </td>
                <td style={excelCalculatedStyle}>
                  ${distTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>

              {/* Total Row */}
              <tr>
                <td colSpan="4" style={{...excelTotalStyle, textAlign: 'right', paddingRight: '12px'}}>
                  LABOR TOTAL:
                </td>
                <td style={excelTotalStyle}>
                  ${laborGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ====================================================================
            HR FUNCTION RATES PANEL (Excel Rows 2-6)
            ==================================================================== */}
        <div style={{
          gridColumn: '1 / 3',
          gridRow: '2'
        }}>
          <HrFunctionRatesPanel 
            estimateItems={estimateItems}
            system={system}
          />
        </div>

        {/* ====================================================================
            LAYER 35: PRODUCTION RATE TABLES (The Secret Sauce)
            Excel Rows 2-5 (Top Right - Side-by-side with Labor Triad)
            ==================================================================== */}
        <div style={{
          gridColumn: '2',
          gridRow: '1',
          backgroundColor: '#0d1117',
          borderRadius: '8px',
          border: '2px solid #ff9966',
          padding: '20px'
        }}>
          <h3 style={{
            margin: '0 0 16px 0',
            color: '#ff9966',
            fontSize: '16px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            ⚡ Labor Production Rates <span style={{fontSize: '14px', color: '#8b949e', fontWeight: '400'}}>(Hours per Unit)</span>
          </h3>

          {/* 3-Column Grid Layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px'
          }}>
            
            {/* TABLE 1: Bays & Add-on Bays */}
            <div style={{
              backgroundColor: '#161b22',
              borderRadius: '6px',
              border: '1px solid #30363d',
              overflow: 'hidden'
            }}>
              <div style={{
                backgroundColor: '#238636',
                color: 'white',
                padding: '8px 12px',
                fontWeight: '600',
                fontSize: '13px',
                textAlign: 'center'
              }}>
                🔨 Bays & Add-on Bays
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0d1117' }}>
                    <th style={{
                      padding: '8px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#c9d1d9',
                      borderBottom: '1px solid #30363d'
                    }}>Task</th>
                    <th style={{
                      padding: '8px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#c9d1d9',
                      borderBottom: '1px solid #30363d'
                    }}>Bays</th>
                    <th style={{
                      padding: '8px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#c9d1d9',
                      borderBottom: '1px solid #30363d'
                    }}>&gt; Bays</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 8px', fontSize: '12px', color: '#8b949e' }}>Assemble</td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.bays.assemble}
                        onChange={(e) => handleProductionRateChange('bays', 'assemble', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.addBays.assemble}
                        onChange={(e) => handleProductionRateChange('addBays', 'assemble', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', fontSize: '12px', color: '#8b949e' }}>Clips</td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.bays.clips}
                        onChange={(e) => handleProductionRateChange('bays', 'clips', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.addBays.clips}
                        onChange={(e) => handleProductionRateChange('addBays', 'clips', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', fontSize: '12px', color: '#8b949e' }}>Set</td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.bays.set}
                        onChange={(e) => handleProductionRateChange('bays', 'set', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.addBays.set}
                        onChange={(e) => handleProductionRateChange('addBays', 'set', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                  </tr>
                  {/* Total Row */}
                  <tr style={{ backgroundColor: '#238636', color: 'white' }}>
                    <td style={{ padding: '6px 8px', fontSize: '12px', fontWeight: '600' }}>Total</td>
                    <td style={{ padding: '6px 8px', fontSize: '13px', fontWeight: '700', textAlign: 'center', fontFamily: 'monospace' }}>
                      {(productionRates.bays.assemble + productionRates.bays.clips + productionRates.bays.set).toFixed(2)}
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: '13px', fontWeight: '700', textAlign: 'center', fontFamily: 'monospace' }}>
                      {(productionRates.addBays.assemble + productionRates.addBays.clips + productionRates.addBays.set).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* TABLE 2: DLOs & Add-on DLOs */}
            <div style={{
              backgroundColor: '#161b22',
              borderRadius: '6px',
              border: '1px solid #30363d',
              overflow: 'hidden'
            }}>
              <div style={{
                backgroundColor: '#1f6feb',
                color: 'white',
                padding: '8px 12px',
                fontWeight: '600',
                fontSize: '13px',
                textAlign: 'center'
              }}>
                🪟 DLOs & Add-on DLOs
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0d1117' }}>
                    <th style={{
                      padding: '8px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#c9d1d9',
                      borderBottom: '1px solid #30363d'
                    }}>Task</th>
                    <th style={{
                      padding: '8px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#c9d1d9',
                      borderBottom: '1px solid #30363d'
                    }}>DLOs</th>
                    <th style={{
                      padding: '8px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#c9d1d9',
                      borderBottom: '1px solid #30363d'
                    }}>&gt; DLOs</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 8px', fontSize: '12px', color: '#8b949e' }}>Prep</td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.dlos.prep}
                        onChange={(e) => handleProductionRateChange('dlos', 'prep', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.addDlos.prep}
                        onChange={(e) => handleProductionRateChange('addDlos', 'prep', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', fontSize: '12px', color: '#8b949e' }}>Set</td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.dlos.set}
                        onChange={(e) => handleProductionRateChange('dlos', 'set', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.addDlos.set}
                        onChange={(e) => handleProductionRateChange('addDlos', 'set', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                  </tr>
                  {/* Total Row */}
                  <tr style={{ backgroundColor: '#1f6feb', color: 'white' }}>
                    <td style={{ padding: '6px 8px', fontSize: '12px', fontWeight: '600' }}>Total</td>
                    <td style={{ padding: '6px 8px', fontSize: '13px', fontWeight: '700', textAlign: 'center', fontFamily: 'monospace' }}>
                      {(productionRates.dlos.prep + productionRates.dlos.set).toFixed(2)}
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: '13px', fontWeight: '700', textAlign: 'center', fontFamily: 'monospace' }}>
                      {(productionRates.addDlos.prep + productionRates.addDlos.set).toFixed(2)}
                    </td>
                  </tr>
                  {/* Empty row to match table 1 height */}
                  <tr style={{ visibility: 'hidden' }}>
                    <td colSpan="3" style={{ height: '36px' }}></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* TABLE 3: Doors */}
            <div style={{
              backgroundColor: '#161b22',
              borderRadius: '6px',
              border: '1px solid #30363d',
              overflow: 'hidden'
            }}>
              <div style={{
                backgroundColor: '#8957e5',
                color: 'white',
                padding: '8px 12px',
                fontWeight: '600',
                fontSize: '13px',
                textAlign: 'center'
              }}>
                🚪 Doors
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0d1117' }}>
                    <th style={{
                      padding: '8px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#c9d1d9',
                      borderBottom: '1px solid #30363d'
                    }}>Task</th>
                    <th style={{
                      padding: '8px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#c9d1d9',
                      borderBottom: '1px solid #30363d'
                    }}>Doors</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 8px', fontSize: '12px', color: '#8b949e' }}>Distribution</td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.doors.distribution}
                        onChange={(e) => handleProductionRateChange('doors', 'distribution', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', fontSize: '12px', color: '#8b949e' }}>Install</td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={productionRates.doors.install}
                        onChange={(e) => handleProductionRateChange('doors', 'install', e.target.value)}
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '4px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#000000',
                          fontSize: '12px',
                          textAlign: 'center',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>
                  </tr>
                  {/* Total Row */}
                  <tr style={{ backgroundColor: '#8957e5', color: 'white' }}>
                    <td style={{ padding: '6px 8px', fontSize: '12px', fontWeight: '600' }}>Total</td>
                    <td style={{ padding: '6px 8px', fontSize: '13px', fontWeight: '700', textAlign: 'center', fontFamily: 'monospace' }}>
                      {(productionRates.doors.distribution + productionRates.doors.install).toFixed(2)}
                    </td>
                  </tr>
                  {/* Empty row to match table 1 height */}
                  <tr style={{ visibility: 'hidden' }}>
                    <td colSpan="2" style={{ height: '36px' }}></td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>
        </div>

        {/* ====================================================================
            LABOR SUMMARY PANEL (NEW - Layer 36)
            ==================================================================== */}
        <div style={{
          gridColumn: '1 / 3',
          gridRow: '3'
        }}>
          <LaborSummaryPanel 
            estimateItems={estimateItems} 
            system={system} 
          />
        </div>

        {/* ====================================================================
            SYSTEM GRAND TOTAL (Full Width Bottom)
            ==================================================================== */}
        <div style={{
          gridColumn: '1 / 3',
          gridRow: '4',
          backgroundColor: '#1a7f37',
          borderRadius: '8px',
          border: '3px solid #1a7f37',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: '700',
            letterSpacing: '1px'
          }}>
            🎯 SYSTEM GRAND TOTAL
          </div>
          <div style={{
            color: '#ffffff',
            fontSize: '32px',
            fontWeight: '900',
            fontFamily: 'monospace',
            letterSpacing: '1px'
          }}>
            ${systemGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{
            color: '#d1f4e0',
            fontSize: '14px',
            fontWeight: '600',
            textAlign: 'right'
          }}>
            <div>Labor: ${laborGrandTotal.toLocaleString('en-US', {minimumFractionDigits: 0})}</div>
            <div>Fixed: ${fixedCostsTotal.toLocaleString('en-US', {minimumFractionDigits: 0})}</div>
            <div>Materials: ${materialsGrandTotal.toLocaleString('en-US', {minimumFractionDigits: 0})}</div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ExtSFWorksheet;
