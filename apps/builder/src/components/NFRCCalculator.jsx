import React, { useState } from 'react';
import { Plus, Trash2, Calculator, Download, Save, Layers, Frame } from 'lucide-react';
import GlassBuilder from './GlassBuilder';

/**
 * NFRC Calculator - Full Assembly U-Factor Calculator
 * Based on ISO 15099 / NFRC 100 standards
 * Calculates both Center-of-Glass AND Overall Assembly U-Factor
 * Includes aluminum frame thermal performance
 */
const NFRCCalculator = ({ project, sheet }) => {
  const [mode, setMode] = useState('builder'); // 'builder' or 'manual'
  const [systemName, setSystemName] = useState('');
  const [builderAssembly, setBuilderAssembly] = useState(null); // Assembly from GlassBuilder
  
  const [layers, setLayers] = useState([
    { type: 'glass', thickness: 6, conductivity: 1.0, emissivityFront: 0.84, emissivityBack: 0.84 },
    { type: 'gap', thickness: 12.7, gasType: 'Air', gasMix: 100 },
    { type: 'glass', thickness: 6, conductivity: 1.0, emissivityFront: 0.84, emissivityBack: 0.84 },
  ]);
  
  const [environmentalConditions, setEnvironmentalConditions] = useState({
    tempOut: -18.0,
    tempIn: 21.0,
    hOut: 26.0, // W/m²K
    windSpeed: 5.5 // m/s (NFRC standard)
  });
  
  const [calculationResult, setCalculationResult] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Frame & Assembly Configuration
  const [frameSpec, setFrameSpec] = useState({
    frameType: 'aluminum_thermal',  // aluminum_non_thermal, aluminum_thermal, aluminum_with_strut, vinyl
    spacerType: 'warm_edge',         // aluminum, warm_edge, super_spacer
    frameWidth: 4.5,                 // inches - average frame face width
    includeAssembly: true            // whether to calculate full assembly U-factor
  });

  const [assemblyDimensions, setAssemblyDimensions] = useState({
    width: 48,    // inches - overall frame width
    height: 72,   // inches - overall frame height
    quantity: 1   // number of lites (for multi-pane calculations)
  });

  // Add layer
  const addLayer = (type) => {
    const newLayer = type === 'glass' 
      ? { type: 'glass', thickness: 6, conductivity: 1.0, emissivityFront: 0.84, emissivityBack: 0.84 }
      : { type: 'gap', thickness: 12.7, gasType: 'Air', gasMix: 100 };
    
    setLayers([...layers, newLayer]);
  };

  // Remove layer
  const removeLayer = (index) => {
    if (layers.length > 1) {
      const newLayers = layers.filter((_, i) => i !== index);
      setLayers(newLayers);
    }
  };

  // Update layer property
  const updateLayer = (index, property, value) => {
    const newLayers = [...layers];
    newLayers[index][property] = value;
    setLayers(newLayers);
  };

  // Run calculation
  const calculateUFactor = async () => {
    setIsCalculating(true);
    setErrorMessage('');
    setCalculationResult(null);

    // Use builderAssembly if in builder mode, otherwise use manual layers
    const layersToCalculate = mode === 'builder' && builderAssembly ? builderAssembly : layers;

    try {
      const response = await fetch('http://127.0.0.1:8000/api/nfrc/calculate-u-factor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemName,
          layers: layersToCalculate,
          environmentalConditions,
          frameSpec,
          assemblyDimensions,
          project,
          sheet
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Calculation failed');
      }

      const result = await response.json();
      setCalculationResult(result);
    } catch (error) {
      console.error('NFRC calculation error:', error);
      setErrorMessage(error.message || 'Failed to calculate U-factor');
    } finally {
      setIsCalculating(false);
    }
  };

  // Save system to library
  const saveToLibrary = async () => {
    if (!systemName) {
      alert('Please enter a system name');
      return;
    }

    const layersToSave = mode === 'builder' && builderAssembly ? builderAssembly : layers;

    try {
      const response = await fetch('http://127.0.0.1:8000/api/nfrc/save-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemName,
          layers: layersToSave,
          calculationResult
        })
      });

      if (response.ok) {
        alert('System saved to library!');
      } else {
        throw new Error('Failed to save system');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save system to library');
    }
  };

  // Handle assembly from GlassBuilder
  const handleBuilderSave = (assembly) => {
    setBuilderAssembly(assembly);
    // Optionally auto-calculate when assembly is saved
    // calculateUFactor() can be called here if desired
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Calculator size={20} style={{ marginRight: '8px' }} />
          <span style={styles.title}>NFRC Assembly U-Factor Calculator</span>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
          {/* System Name */}
          <div style={styles.section}>
            <label style={styles.label}>System Name</label>
            <input
              type="text"
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
              placeholder="e.g., IGU-Double-LowE"
              style={styles.input}
            />
          </div>

          {/* Mode Selector */}
          <div style={styles.section}>
            <div style={styles.modeSelector}>
              <button
                onClick={() => setMode('builder')}
                style={mode === 'builder' ? styles.modeBtnActive : styles.modeBtn}
              >
                <Layers size={16} style={{ marginRight: '6px' }} />
                Visual Builder
              </button>
              <button
                onClick={() => setMode('manual')}
                style={mode === 'manual' ? styles.modeBtnActive : styles.modeBtn}
              >
                <Calculator size={16} style={{ marginRight: '6px' }} />
                Manual Entry
              </button>
            </div>
          </div>

          {/* GlassBuilder Component (Builder Mode) */}
          {mode === 'builder' && (
            <div style={styles.section}>
              <GlassBuilder onSave={handleBuilderSave} />
            </div>
          )}

          {/* Manual Layer Configuration (Manual Mode) */}
          {mode === 'manual' && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Layer Configuration</h3>
              {layers.map((layer, index) => (
                <div key={index} style={styles.layerCard}>
                  <div style={styles.layerHeader}>
                    <span style={styles.layerTitle}>
                      {layer.type === 'glass' ? '🔷 Glass Layer' : '💨 Gap Layer'} {index + 1}
                    </span>
                    <button 
                      onClick={() => removeLayer(index)} 
                      style={styles.removeBtn}
                      disabled={layers.length === 1}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {layer.type === 'glass' ? (
                    <div style={styles.gridThree}>
                      <div>
                        <label style={styles.labelSmall}>Thickness (mm)</label>
                        <input
                          type="number"
                          value={layer.thickness}
                          onChange={(e) => updateLayer(index, 'thickness', parseFloat(e.target.value))}
                          style={styles.inputSmall}
                        />
                      </div>
                      <div>
                        <label style={styles.labelSmall}>Conductivity (W/mK)</label>
                        <input
                          type="number"
                          value={layer.conductivity}
                          onChange={(e) => updateLayer(index, 'conductivity', parseFloat(e.target.value))}
                          style={styles.inputSmall}
                        />
                      </div>
                      <div>
                        <label style={styles.labelSmall}>ε Front</label>
                        <input
                          type="number"
                          value={layer.emissivityFront}
                          onChange={(e) => updateLayer(index, 'emissivityFront', parseFloat(e.target.value))}
                          style={styles.inputSmall}
                        />
                      </div>
                      <div>
                        <label style={styles.labelSmall}>ε Back</label>
                        <input
                          type="number"
                          value={layer.emissivityBack}
                          onChange={(e) => updateLayer(index, 'emissivityBack', parseFloat(e.target.value))}
                          style={styles.inputSmall}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={styles.gridTwo}>
                      <div>
                        <label style={styles.labelSmall}>Gap Width (mm)</label>
                        <input
                          type="number"
                          value={layer.thickness}
                          onChange={(e) => updateLayer(index, 'thickness', parseFloat(e.target.value))}
                          style={styles.inputSmall}
                        />
                      </div>
                      <div>
                        <label style={styles.labelSmall}>Gas Type</label>
                        <select
                          value={layer.gasType}
                          onChange={(e) => updateLayer(index, 'gasType', e.target.value)}
                          style={styles.select}
                        >
                          <option value="Air">Air</option>
                          <option value="Argon">Argon (90%)</option>
                          <option value="Krypton">Krypton</option>
                          <option value="Xenon">Xenon</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div style={styles.addButtons}>
                <button onClick={() => addLayer('glass')} style={styles.addBtn}>
                  <Plus size={16} style={{ marginRight: '4px' }} />
                  Add Glass
                </button>
                <button onClick={() => addLayer('gap')} style={styles.addBtn}>
                  <Plus size={16} style={{ marginRight: '4px' }} />
                  Add Gap
                </button>
              </div>
            </div>
          )}

          {/* Frame & Assembly Configuration */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              Frame & Assembly Configuration
              <span style={styles.sectionSubtitle}> (for Overall U-Factor)</span>
            </h3>
            
            {/* Enable/Disable Assembly Calculation */}
            <div style={styles.checkboxRow}>
              <input
                type="checkbox"
                id="includeAssembly"
                checked={frameSpec.includeAssembly}
                onChange={(e) => setFrameSpec({ ...frameSpec, includeAssembly: e.target.checked })}
                style={styles.checkbox}
              />
              <label htmlFor="includeAssembly" style={styles.checkboxLabel}>
                Calculate Overall Assembly U-Factor (includes frame & edge)
              </label>
            </div>

            {frameSpec.includeAssembly && (
              <>
                {/* Frame Type & Spacer */}
                <div style={styles.gridTwo}>
                  <div>
                    <label style={styles.labelSmall}>Frame Type</label>
                    <select
                      value={frameSpec.frameType}
                      onChange={(e) => setFrameSpec({ ...frameSpec, frameType: e.target.value })}
                      style={styles.select}
                    >
                      <option value="aluminum_non_thermal">Aluminum (Non-Thermal Break)</option>
                      <option value="aluminum_thermal">Aluminum (Thermal Break)</option>
                      <option value="aluminum_with_strut">Aluminum (w/ Thermal Strut)</option>
                      <option value="vinyl">Vinyl</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.labelSmall}>Spacer Type</label>
                    <select
                      value={frameSpec.spacerType}
                      onChange={(e) => setFrameSpec({ ...frameSpec, spacerType: e.target.value })}
                      style={styles.select}
                    >
                      <option value="aluminum">Aluminum Spacer</option>
                      <option value="warm_edge">Warm Edge Spacer</option>
                      <option value="super_spacer">Super Spacer</option>
                    </select>
                  </div>
                </div>

                {/* Assembly Dimensions */}
                <div style={styles.gridThree}>
                  <div>
                    <label style={styles.labelSmall}>Frame Width (in)</label>
                    <input
                      type="number"
                      value={assemblyDimensions.width}
                      onChange={(e) => setAssemblyDimensions({ ...assemblyDimensions, width: parseFloat(e.target.value) })}
                      style={styles.inputSmall}
                    />
                  </div>
                  <div>
                    <label style={styles.labelSmall}>Frame Height (in)</label>
                    <input
                      type="number"
                      value={assemblyDimensions.height}
                      onChange={(e) => setAssemblyDimensions({ ...assemblyDimensions, height: parseFloat(e.target.value) })}
                      style={styles.inputSmall}
                    />
                  </div>
                  <div>
                    <label style={styles.labelSmall}>Frame Face Width (in)</label>
                    <input
                      type="number"
                      step="0.25"
                      value={frameSpec.frameWidth}
                      onChange={(e) => setFrameSpec({ ...frameSpec, frameWidth: parseFloat(e.target.value) })}
                      style={styles.inputSmall}
                    />
                  </div>
                </div>

                {/* Frame Type Info Panel */}
                <div style={styles.frameInfoPanel}>
                  <div style={styles.frameInfoTitle}>Frame U-Values (Reference)</div>
                  <div style={styles.frameInfoGrid}>
                    <span style={frameSpec.frameType === 'aluminum_non_thermal' ? styles.frameInfoActive : styles.frameInfoItem}>
                      Non-Thermal: 1.20
                    </span>
                    <span style={frameSpec.frameType === 'aluminum_thermal' ? styles.frameInfoActive : styles.frameInfoItem}>
                      Thermal Break: 0.65
                    </span>
                    <span style={frameSpec.frameType === 'aluminum_with_strut' ? styles.frameInfoActive : styles.frameInfoItem}>
                      w/ Strut: 0.45
                    </span>
                    <span style={frameSpec.frameType === 'vinyl' ? styles.frameInfoActive : styles.frameInfoItem}>
                      Vinyl: 0.35
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Environmental Conditions */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Environmental Conditions (NFRC 100)</h3>
            <div style={styles.gridTwo}>
              <div>
                <label style={styles.labelSmall}>Outside Temp (°C)</label>
                <input
                  type="number"
                  value={environmentalConditions.tempOut}
                  onChange={(e) => setEnvironmentalConditions({ ...environmentalConditions, tempOut: parseFloat(e.target.value) })}
                  style={styles.inputSmall}
                />
              </div>
              <div>
                <label style={styles.labelSmall}>Inside Temp (°C)</label>
                <input
                  type="number"
                  value={environmentalConditions.tempIn}
                  onChange={(e) => setEnvironmentalConditions({ ...environmentalConditions, tempIn: parseFloat(e.target.value) })}
                  style={styles.inputSmall}
                />
              </div>
              <div>
                <label style={styles.labelSmall}>h_out (W/m²K)</label>
                <input
                  type="number"
                  value={environmentalConditions.hOut}
                  onChange={(e) => setEnvironmentalConditions({ ...environmentalConditions, hOut: parseFloat(e.target.value) })}
                  style={styles.inputSmall}
                />
              </div>
              <div>
                <label style={styles.labelSmall}>Wind Speed (m/s)</label>
                <input
                  type="number"
                  value={environmentalConditions.windSpeed}
                  onChange={(e) => setEnvironmentalConditions({ ...environmentalConditions, windSpeed: parseFloat(e.target.value) })}
                  style={styles.inputSmall}
                />
              </div>
            </div>
          </div>

          {/* Calculate Button */}
          <button 
            onClick={calculateUFactor} 
            disabled={isCalculating}
            style={styles.calculateBtn}
          >
            <Calculator size={16} />
            {isCalculating ? 'Calculating...' : 'Calculate U-Factor'}
          </button>

          {/* Error Message */}
          {errorMessage && (
            <div style={styles.error}>
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Results */}
          {calculationResult && (
            <div style={styles.results}>
              <h3 style={styles.resultsTitle}>Calculation Results</h3>
              
              {/* Assembly U-Factor (Primary Result) */}
              {calculationResult.assemblyUFactor && (
                <div style={styles.assemblyResultBox}>
                  <div style={styles.assemblyResultLabel}>Overall Assembly U-Factor</div>
                  <div style={styles.assemblyResultValue}>
                    {calculationResult.assemblyUFactor.toFixed(3)} 
                    <span style={styles.assemblyResultUnit}> Btu/hr·ft²·°F</span>
                  </div>
                  <div style={styles.assemblyResultRating}>
                    {calculationResult.performanceRating}
                  </div>
                </div>
              )}

              <div style={styles.resultGrid}>
                <div style={styles.resultCard}>
                  <div style={styles.resultLabel}>U-Factor (Center-of-Glass)</div>
                  <div style={styles.resultValue}>
                    {calculationResult.uFactor.toFixed(3)} W/m²K
                  </div>
                  <div style={styles.resultSubtext}>
                    ({calculationResult.uFactorIP.toFixed(3)} Btu/hr·ft²·°F)
                  </div>
                </div>

                <div style={styles.resultCard}>
                  <div style={styles.resultLabel}>R-Value</div>
                  <div style={styles.resultValue}>
                    {calculationResult.rValue.toFixed(3)} m²K/W
                  </div>
                  <div style={styles.resultSubtext}>
                    ({calculationResult.rValueIP.toFixed(3)} hr·ft²·°F/Btu)
                  </div>
                </div>

                <div style={styles.resultCard}>
                  <div style={styles.resultLabel}>Total Heat Flux</div>
                  <div style={styles.resultValue}>
                    {calculationResult.heatFlux.toFixed(2)} W/m²
                  </div>
                </div>

                <div style={styles.resultCard}>
                  <div style={styles.resultLabel}>Iterations</div>
                  <div style={styles.resultValue}>
                    {calculationResult.iterations}
                  </div>
                  <div style={styles.resultSubtext}>
                    Converged: {calculationResult.converged ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>

              {/* Assembly Breakdown (if calculated) */}
              {calculationResult.assemblyBreakdown && (
                <div style={styles.breakdownSection}>
                  <h4 style={styles.breakdownTitle}>Assembly Breakdown</h4>
                  <div style={styles.breakdownGrid}>
                    <div style={styles.breakdownCard}>
                      <div style={styles.breakdownLabel}>Center Glass</div>
                      <div style={styles.breakdownValue}>
                        {calculationResult.assemblyBreakdown.centerGlass?.area_sf?.toFixed(1)} SF
                      </div>
                      <div style={styles.breakdownContribution}>
                        U: {calculationResult.assemblyBreakdown.centerGlass?.u_value}
                      </div>
                    </div>
                    <div style={styles.breakdownCard}>
                      <div style={styles.breakdownLabel}>Frame</div>
                      <div style={styles.breakdownValue}>
                        {calculationResult.assemblyBreakdown.frame?.area_sf?.toFixed(2)} SF
                      </div>
                      <div style={styles.breakdownContribution}>
                        U: {calculationResult.assemblyBreakdown.frame?.u_value}
                      </div>
                    </div>
                    <div style={styles.breakdownCard}>
                      <div style={styles.breakdownLabel}>Edge of Glass</div>
                      <div style={styles.breakdownValue}>
                        {calculationResult.assemblyBreakdown.edge?.area_sf?.toFixed(2)} SF
                      </div>
                      <div style={styles.breakdownContribution}>
                        U: {calculationResult.assemblyBreakdown.edge?.u_value}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Surface Temperatures */}
              <div style={styles.tempSection}>
                <h4 style={styles.tempTitle}>Surface Temperatures</h4>
                <div style={styles.tempGrid}>
                  {calculationResult.surfaceTemperatures.map((temp, index) => (
                    <div key={index} style={styles.tempCard}>
                      <div style={styles.tempLabel}>Surface {index + 1}</div>
                      <div style={styles.tempValue}>{temp.toFixed(2)}°C</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={styles.actionButtons}>
                <button onClick={saveToLibrary} style={styles.saveBtn}>
                  <Save size={16} />
                  Save to Library
                </button>
                <button onClick={() => {/* Export logic */}} style={styles.exportBtn}>
                  <Download size={16} />
                  Export Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
  );
};

const styles = {
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0b0e11',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: '1px solid #2d333b',
    backgroundColor: '#001F3F',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    color: '#ffffff',
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#8b949e',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s',
  },
  content: {
    padding: '24px',
    overflowY: 'auto',
    flex: 1,
  },
  section: {
    marginBottom: '24px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#ffffff',
    margin: '0 0 12px 0',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#c9d1d9',
    marginBottom: '8px',
  },
  labelSmall: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '500',
    color: '#8b949e',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#c9d1d9',
    fontSize: '14px',
    outline: 'none',
  },
  inputSmall: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#c9d1d9',
    fontSize: '13px',
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#c9d1d9',
    fontSize: '13px',
    outline: 'none',
  },
  gridTwo: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  addBtn: {
    padding: '8px 16px',
    backgroundColor: '#238636',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginRight: '8px',
  },
  addBtnGap: {
    padding: '8px 16px',
    backgroundColor: '#1f6feb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  layerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  layerCard: {
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '8px',
    padding: '16px',
  },
  layerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  layerTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#c9d1d9',
  },
  removeBtn: {
    background: 'transparent',
    border: '1px solid #da3633',
    color: '#da3633',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
  },
  calculateBtn: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#1f6feb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '24px',
  },
  error: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#da3633',
    color: '#ffffff',
    borderRadius: '6px',
    fontSize: '14px',
  },
  results: {
    marginTop: '24px',
    padding: '20px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '8px',
  },
  resultsTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: '16px',
  },
  resultGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginBottom: '20px',
  },
  resultCard: {
    backgroundColor: '#161b22',
    padding: '16px',
    borderRadius: '6px',
    border: '1px solid #21262d',
  },
  resultLabel: {
    fontSize: '12px',
    color: '#8b949e',
    marginBottom: '8px',
  },
  resultValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#58a6ff',
  },
  resultSubtext: {
    fontSize: '11px',
    color: '#8b949e',
    marginTop: '4px',
  },
  tempSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #30363d',
  },
  tempTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#c9d1d9',
    marginBottom: '12px',
  },
  tempGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  tempCard: {
    backgroundColor: '#161b22',
    padding: '12px',
    borderRadius: '6px',
    textAlign: 'center',
  },
  tempLabel: {
    fontSize: '11px',
    color: '#8b949e',
    marginBottom: '4px',
  },
  tempValue: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#7ee787',
  },
  modeSelector: {
    display: 'flex',
    gap: '8px',
    backgroundColor: '#21262d',
    padding: '4px',
    borderRadius: '6px',
  },
  modeBtn: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: 'transparent',
    color: '#8b949e',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  modeBtnActive: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: '#238636',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  gridThree: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  actionButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
  },
  saveBtn: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#238636',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  exportBtn: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#30363d',
    color: '#c9d1d9',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  // Frame & Assembly Configuration Styles
  sectionSubtitle: {
    fontSize: '12px',
    fontWeight: '400',
    color: '#8b949e',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: '#238636',
  },
  checkboxLabel: {
    fontSize: '14px',
    color: '#c9d1d9',
    cursor: 'pointer',
  },
  frameInfoPanel: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#161b22',
    borderRadius: '6px',
    border: '1px solid #30363d',
  },
  frameInfoTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#8b949e',
    marginBottom: '8px',
  },
  frameInfoGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  frameInfoItem: {
    fontSize: '11px',
    color: '#6e7681',
    padding: '4px 8px',
    backgroundColor: '#21262d',
    borderRadius: '4px',
  },
  frameInfoActive: {
    fontSize: '11px',
    color: '#7ee787',
    padding: '4px 8px',
    backgroundColor: '#238636',
    borderRadius: '4px',
    fontWeight: '600',
  },
  // Assembly Results Styles
  assemblyResultBox: {
    backgroundColor: '#1a4730',
    border: '2px solid #238636',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
    textAlign: 'center',
  },
  assemblyResultLabel: {
    fontSize: '14px',
    color: '#7ee787',
    marginBottom: '8px',
    fontWeight: '500',
  },
  assemblyResultValue: {
    fontSize: '36px',
    fontWeight: '700',
    color: '#ffffff',
  },
  assemblyResultUnit: {
    fontSize: '16px',
    fontWeight: '400',
    color: '#7ee787',
  },
  assemblyResultRating: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#7ee787',
    fontStyle: 'italic',
  },
  breakdownSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #30363d',
  },
  breakdownTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#c9d1d9',
    marginBottom: '12px',
  },
  breakdownGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  breakdownCard: {
    backgroundColor: '#161b22',
    padding: '12px',
    borderRadius: '6px',
    textAlign: 'center',
    border: '1px solid #30363d',
  },
  breakdownLabel: {
    fontSize: '11px',
    color: '#8b949e',
    marginBottom: '4px',
  },
  breakdownValue: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#c9d1d9',
  },
  breakdownContribution: {
    fontSize: '11px',
    color: '#58a6ff',
    marginTop: '4px',
  },
};

export default NFRCCalculator;
