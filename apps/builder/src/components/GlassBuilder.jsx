import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FlipHorizontal, Edit3, RefreshCw, Save } from 'lucide-react';

const DEFAULT_GLASS_LIBRARY = [
  { id: 'clear6', name: 'Clear 6mm', thickness: 6.0, conductivity: 1.0, emissivityFront: 0.84, emissivityBack: 0.84 },
  { id: 'clear8', name: 'Clear 8mm', thickness: 8.0, conductivity: 1.0, emissivityFront: 0.84, emissivityBack: 0.84 },
  { id: 'lowe6', name: 'Low-E 6mm', thickness: 6.0, conductivity: 1.0, emissivityFront: 0.84, emissivityBack: 0.10, coating: 'Surface #3' },
  { id: 'lowe8', name: 'Low-E 8mm', thickness: 8.0, conductivity: 1.0, emissivityFront: 0.84, emissivityBack: 0.10, coating: 'Surface #3' },
  { id: 'tint6', name: 'Gray Tint 6mm', thickness: 6.0, conductivity: 1.0, emissivityFront: 0.84, emissivityBack: 0.84, tint: true },
];

/**
 * GlassBuilder - Interactive Glazing System Assembly Tool
 * Visual "stack builder" for creating IGU systems with drag-and-drop
 */
const GlassBuilder = ({ onSave, initialAssembly = null }) => {
  const [assembly, setAssembly] = useState(initialAssembly || [
    { id: 1, type: 'GLASS', product: 'Clear 6mm', thickness: 6.0, emissivityFront: 0.84, emissivityBack: 0.84, conductivity: 1.0, coating: null },
    { id: 2, type: 'GAP', gas: 'Air', thickness: 12.7, width_inches: 0.5 },
    { id: 3, type: 'GLASS', product: 'Clear 6mm', thickness: 6.0, emissivityFront: 0.84, emissivityBack: 0.84, conductivity: 1.0, coating: null }
  ]);

  const [systemName, setSystemName] = useState('IGU-Custom');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [editingLayer, setEditingLayer] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [performanceResults, setPerformanceResults] = useState(null);
  const availableGlass = DEFAULT_GLASS_LIBRARY;

  useEffect(() => {
    if (assembly.length === 0) return;
    simulatePerformanceCalculation(assembly, setIsCalculating, setPerformanceResults);
  }, [assembly]);

  // Add new glass + gap pair
  const addLayer = () => {
    const newId = Math.max(...assembly.map(l => l.id)) + 1;
    const newLayers = [
      ...assembly,
      { id: newId, type: 'GAP', gas: 'Air', thickness: 12.7, width_inches: 0.5 },
      { id: newId + 1, type: 'GLASS', product: 'Clear 6mm', thickness: 6.0, emissivityFront: 0.84, emissivityBack: 0.84, conductivity: 1.0, coating: null }
    ];
    setAssembly(newLayers);
  };

  // Remove layer (and its adjacent gap if glass)
  const removeLayer = (index) => {
    if (assembly.length <= 1) return; // Don't remove last layer
    
    let newAssembly = [...assembly];
    
    if (assembly[index].type === 'GLASS') {
      // Remove glass and adjacent gap
      if (index > 0 && assembly[index - 1].type === 'GAP') {
        newAssembly.splice(index - 1, 2);
      } else if (index < assembly.length - 1 && assembly[index + 1].type === 'GAP') {
        newAssembly.splice(index, 2);
      } else {
        newAssembly.splice(index, 1);
      }
    } else {
      newAssembly.splice(index, 1);
    }
    
    setAssembly(newAssembly);
  };

  // Flip glass coating (swap front/back emissivity)
  const flipGlass = (index) => {
    const newAssembly = [...assembly];
    const layer = newAssembly[index];
    
    if (layer.type === 'GLASS') {
      const tempEmis = layer.emissivityFront;
      layer.emissivityFront = layer.emissivityBack;
      layer.emissivityBack = tempEmis;
      
      // Update coating indicator
      if (layer.emissivityFront < 0.2) {
        layer.coating = 'Surface #1';
      } else if (layer.emissivityBack < 0.2) {
        layer.coating = 'Surface #3';
      } else {
        layer.coating = null;
      }
      
      setAssembly(newAssembly);
    }
  };

  // Change glass product
  const changeGlassProduct = (index, productId) => {
    const newAssembly = [...assembly];
    const product = availableGlass.find(g => g.id === productId);
    
    if (product) {
      newAssembly[index] = {
        ...newAssembly[index],
        product: product.name,
        thickness: product.thickness,
        conductivity: product.conductivity,
        emissivityFront: product.emissivityFront,
        emissivityBack: product.emissivityBack,
        coating: product.coating || null,
        tint: product.tint || false
      };
      setAssembly(newAssembly);
    }
  };

  // Change gap gas
  const changeGapGas = (index, gas) => {
    const newAssembly = [...assembly];
    newAssembly[index].gas = gas;
    setAssembly(newAssembly);
  };

  // Update layer thickness
  const updateThickness = (index, thickness) => {
    const newAssembly = [...assembly];
    newAssembly[index].thickness = parseFloat(thickness);
    
    if (newAssembly[index].type === 'GAP') {
      newAssembly[index].width_inches = (parseFloat(thickness) / 25.4).toFixed(2);
    }
    
    setAssembly(newAssembly);
  };

  // Drag and drop handlers
  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newAssembly = [...assembly];
    const draggedItem = newAssembly[draggedIndex];
    newAssembly.splice(draggedIndex, 1);
    newAssembly.splice(index, 0, draggedItem);
    
    setDraggedIndex(index);
    setAssembly(newAssembly);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Save assembly
  const handleSave = () => {
    if (onSave) {
      onSave({
        name: systemName,
        assembly: assembly,
        performance: performanceResults
      });
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <input
            type="text"
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            style={styles.systemNameInput}
            placeholder="System Name"
          />
          <button onClick={handleSave} style={styles.saveBtn}>
            <Save size={16} />
            Save Assembly
          </button>
        </div>
        <button onClick={addLayer} style={styles.addLayerBtn}>
          <Plus size={16} />
          Add Glass + Gap
        </button>
      </div>

      <div style={styles.mainContent}>
        {/* Left: Assembly Visualizer */}
        <div style={styles.visualizerPanel}>
          <h3 style={styles.panelTitle}>Assembly Cross-Section</h3>
          <div style={styles.crossSection}>
            <div style={styles.environmentLabel}>Outside</div>
            
            <div style={styles.assemblyStack}>
              {assembly.map((layer, index) => (
                <div
                  key={layer.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    ...styles.layerContainer,
                    opacity: draggedIndex === index ? 0.5 : 1,
                  }}
                >
                  {layer.type === 'GLASS' ? (
                    <div style={styles.glassLayer}>
                      {/* Low-E coating indicator on surface */}
                      {layer.emissivityFront < 0.2 && (
                        <div style={styles.coatingLine}>Low-E ↓</div>
                      )}
                      
                      <div style={styles.glassBlock}>
                        <div style={styles.glassLabel}>
                          {layer.product}
                          {layer.coating && (
                            <span style={styles.coatingBadge}>{layer.coating}</span>
                          )}
                        </div>
                        <div style={styles.glassThickness}>{layer.thickness}mm</div>
                        
                        {/* Action buttons */}
                        <div style={styles.layerActions}>
                          <button
                            onClick={() => flipGlass(index)}
                            style={styles.actionBtn}
                            title="Flip coating"
                          >
                            <FlipHorizontal size={12} />
                          </button>
                          <button
                            onClick={() => setEditingLayer(index)}
                            style={styles.actionBtn}
                            title="Edit"
                          >
                            <Edit3 size={12} />
                          </button>
                          {assembly.length > 1 && (
                            <button
                              onClick={() => removeLayer(index)}
                              style={styles.actionBtnDanger}
                              title="Remove"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {layer.emissivityBack < 0.2 && (
                        <div style={styles.coatingLine}>↑ Low-E</div>
                      )}
                    </div>
                  ) : (
                    <div style={styles.gapLayer}>
                      <div style={styles.gapContent}>
                        <div style={styles.gapLabel}>
                          {layer.width_inches}" {layer.gas}
                        </div>
                        <div style={styles.gapActions}>
                          <select
                            value={layer.gas}
                            onChange={(e) => changeGapGas(index, e.target.value)}
                            style={styles.gasSelect}
                          >
                            <option value="Air">Air</option>
                            <option value="Argon">Argon</option>
                            <option value="Krypton">Krypton</option>
                            <option value="Xenon">Xenon</option>
                          </select>
                          <input
                            type="number"
                            value={layer.thickness}
                            onChange={(e) => updateThickness(index, e.target.value)}
                            style={styles.thicknessInput}
                            step="0.1"
                          />
                          mm
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div style={styles.environmentLabel}>Inside</div>
          </div>

          {/* Edit Layer Modal */}
          {editingLayer !== null && assembly[editingLayer].type === 'GLASS' && (
            <div style={styles.editModal}>
              <div style={styles.editModalContent}>
                <h4 style={styles.editModalTitle}>Edit Glass Layer</h4>
                <label style={styles.editLabel}>
                  Select Product:
                  <select
                    value={availableGlass.find(g => g.name === assembly[editingLayer].product)?.id || 'clear6'}
                    onChange={(e) => {
                      changeGlassProduct(editingLayer, e.target.value);
                      setEditingLayer(null);
                    }}
                    style={styles.editSelect}
                  >
                    {availableGlass.map(glass => (
                      <option key={glass.id} value={glass.id}>
                        {glass.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={() => setEditingLayer(null)} style={styles.editCloseBtn}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Performance Preview */}
        <div style={styles.previewPanel}>
          <h3 style={styles.panelTitle}>
            Performance Preview
            {isCalculating && <RefreshCw size={16} style={styles.spinIcon} />}
          </h3>
          
          {performanceResults ? (
            <div style={styles.resultsGrid}>
              <div style={styles.resultCard}>
                <div style={styles.resultLabel}>U-Factor (Winter)</div>
                <div style={styles.resultValue}>{performanceResults.uValue}</div>
                <div style={styles.resultUnit}>W/m²K</div>
                <div style={styles.resultSubtext}>
                  {performanceResults.uValueIP} Btu/hr·ft²·°F
                </div>
              </div>

              <div style={styles.resultCard}>
                <div style={styles.resultLabel}>R-Value</div>
                <div style={styles.resultValue}>{performanceResults.rValue}</div>
                <div style={styles.resultUnit}>m²K/W</div>
                <div style={styles.resultSubtext}>
                  R-{performanceResults.rValueIP} (IP)
                </div>
              </div>

              <div style={styles.resultCard}>
                <div style={styles.resultLabel}>SHGC (Solar Gain)</div>
                <div style={styles.resultValue}>{performanceResults.shgc}</div>
                <div style={styles.resultUnit}>0-1 scale</div>
                <div style={styles.resultSubtext}>
                  {(performanceResults.shgc * 100).toFixed(0)}% of solar heat
                </div>
              </div>

              <div style={styles.resultCard}>
                <div style={styles.resultLabel}>VT (Visible Light)</div>
                <div style={styles.resultValue}>{performanceResults.vt}</div>
                <div style={styles.resultUnit}>0-1 scale</div>
                <div style={styles.resultSubtext}>
                  {(performanceResults.vt * 100).toFixed(0)}% transmission
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.noResults}>
              Simulating...
            </div>
          )}

          {/* Assembly Summary */}
          <div style={styles.summarySection}>
            <h4 style={styles.summaryTitle}>Assembly Details</h4>
            <div style={styles.summaryList}>
              <div style={styles.summaryItem}>
                <span>Glass Panes:</span>
                <strong>{assembly.filter(l => l.type === 'GLASS').length}</strong>
              </div>
              <div style={styles.summaryItem}>
                <span>Air Spaces:</span>
                <strong>{assembly.filter(l => l.type === 'GAP').length}</strong>
              </div>
              <div style={styles.summaryItem}>
                <span>Low-E Coatings:</span>
                <strong>
                  {assembly.filter(l => l.type === 'GLASS' && (l.emissivityFront < 0.2 || l.emissivityBack < 0.2)).length}
                </strong>
              </div>
              <div style={styles.summaryItem}>
                <span>Total Thickness:</span>
                <strong>
                  {assembly.reduce((sum, l) => sum + l.thickness, 0).toFixed(1)}mm
                </strong>
              </div>
            </div>
          </div>

          {/* Performance Recommendations */}
          {performanceResults && (
            <div style={styles.recommendationsSection}>
              <h4 style={styles.summaryTitle}>💡 Optimization Tips</h4>
              <div style={styles.tipsList}>
                {parseFloat(performanceResults.uValue) > 2.0 && (
                  <div style={styles.tip}>
                    ⚡ Add Low-E coating to reduce U-Factor by 30-40%
                  </div>
                )}
                {assembly.some(l => l.type === 'GAP' && l.gas === 'Air') && (
                  <div style={styles.tip}>
                    💨 Replace air with Argon for 10-15% better insulation
                  </div>
                )}
                {assembly.filter(l => l.type === 'GLASS').length === 2 && parseFloat(performanceResults.uValue) > 1.5 && (
                  <div style={styles.tip}>
                    🔺 Add third pane for triple-glazing performance
                  </div>
                )}
                {parseFloat(performanceResults.shgc) > 0.5 && (
                  <div style={styles.tip}>
                    ☀️ High SHGC - good for cold climates, may overheat in warm climates
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

async function simulatePerformanceCalculation(assembly, setIsCalculating, setPerformanceResults) {
  setIsCalculating(true);

  await new Promise(resolve => setTimeout(resolve, 500));

  const glassCount = assembly.filter(l => l.type === 'GLASS').length;
  const hasLowE = assembly.some(l => l.type === 'GLASS' && (l.emissivityBack < 0.2 || l.emissivityFront < 0.2));
  const hasArgon = assembly.some(l => l.type === 'GAP' && l.gas === 'Argon');

  let uValue = 5.8;

  if (glassCount === 2) {
    uValue = hasLowE ? (hasArgon ? 1.7 : 2.0) : (hasArgon ? 2.4 : 2.8);
  } else if (glassCount === 3) {
    uValue = hasLowE ? (hasArgon ? 0.8 : 1.0) : (hasArgon ? 1.4 : 1.6);
  }

  const shgc = hasLowE ? 0.27 : (glassCount === 1 ? 0.82 : 0.70);
  const vt = hasLowE ? 0.65 : 0.80;

  setPerformanceResults({
    uValue: uValue.toFixed(2),
    uValueIP: (uValue * 0.176110).toFixed(3),
    shgc: shgc.toFixed(2),
    vt: vt.toFixed(2),
    rValue: (1.0 / uValue).toFixed(2),
    rValueIP: ((1.0 / uValue) * 5.678263).toFixed(2)
  });

  setIsCalculating(false);
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0d1117',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: '#161b22',
    borderBottom: '1px solid #30363d',
  },
  headerLeft: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  systemNameInput: {
    padding: '8px 12px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#c9d1d9',
    fontSize: '14px',
    fontWeight: '600',
    minWidth: '200px',
  },
  saveBtn: {
    padding: '8px 16px',
    backgroundColor: '#238636',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  addLayerBtn: {
    padding: '8px 16px',
    backgroundColor: '#1f6feb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  mainContent: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  visualizerPanel: {
    flex: '0 0 450px',
    borderRight: '1px solid #30363d',
    padding: '24px',
    overflowY: 'auto',
    backgroundColor: '#0d1117',
  },
  previewPanel: {
    flex: 1,
    padding: '24px',
    overflowY: 'auto',
    backgroundColor: '#161b22',
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#c9d1d9',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  crossSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#161b22',
    borderRadius: '8px',
    border: '1px solid #30363d',
  },
  environmentLabel: {
    fontSize: '11px',
    color: '#8b949e',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    textAlign: 'center',
    padding: '4px',
  },
  assemblyStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  layerContainer: {
    cursor: 'grab',
    transition: 'opacity 0.2s',
  },
  glassLayer: {
    display: 'flex',
    flexDirection: 'column',
  },
  coatingLine: {
    fontSize: '10px',
    color: '#f85149',
    fontWeight: '600',
    textAlign: 'center',
    padding: '2px',
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
  },
  glassBlock: {
    height: '80px',
    background: 'linear-gradient(90deg, rgba(58, 166, 255, 0.3) 0%, rgba(58, 166, 255, 0.5) 50%, rgba(58, 166, 255, 0.3) 100%)',
    border: '2px solid #1f6feb',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backdropFilter: 'blur(10px)',
  },
  glassLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  coatingBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    backgroundColor: '#f85149',
    borderRadius: '3px',
    color: '#ffffff',
  },
  glassThickness: {
    fontSize: '11px',
    color: '#8b949e',
    marginTop: '4px',
  },
  layerActions: {
    position: 'absolute',
    right: '8px',
    top: '8px',
    display: 'flex',
    gap: '4px',
  },
  actionBtn: {
    padding: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '3px',
    color: '#c9d1d9',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  actionBtnDanger: {
    padding: '4px',
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    border: '1px solid #f85149',
    borderRadius: '3px',
    color: '#f85149',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  gapLayer: {
    minHeight: '60px',
    border: '1px dashed #30363d',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(48, 54, 61, 0.1)',
  },
  gapContent: {
    textAlign: 'center',
  },
  gapLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#8b949e',
    marginBottom: '8px',
  },
  gapActions: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gasSelect: {
    padding: '4px 8px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '4px',
    color: '#c9d1d9',
    fontSize: '11px',
  },
  thicknessInput: {
    width: '50px',
    padding: '4px 6px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '4px',
    color: '#c9d1d9',
    fontSize: '11px',
  },
  editModal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  editModalContent: {
    backgroundColor: '#161b22',
    padding: '24px',
    borderRadius: '8px',
    border: '1px solid #30363d',
    minWidth: '300px',
  },
  editModalTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#c9d1d9',
    marginBottom: '16px',
  },
  editLabel: {
    display: 'block',
    fontSize: '13px',
    color: '#8b949e',
    marginBottom: '16px',
  },
  editSelect: {
    display: 'block',
    width: '100%',
    marginTop: '8px',
    padding: '8px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '4px',
    color: '#c9d1d9',
    fontSize: '14px',
  },
  editCloseBtn: {
    padding: '8px 16px',
    backgroundColor: '#30363d',
    color: '#c9d1d9',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    width: '100%',
  },
  resultsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
    marginBottom: '24px',
  },
  resultCard: {
    backgroundColor: '#0d1117',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #30363d',
  },
  resultLabel: {
    fontSize: '12px',
    color: '#8b949e',
    marginBottom: '8px',
  },
  resultValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#58a6ff',
    lineHeight: 1,
  },
  resultUnit: {
    fontSize: '12px',
    color: '#8b949e',
    marginTop: '4px',
  },
  resultSubtext: {
    fontSize: '11px',
    color: '#6e7681',
    marginTop: '8px',
  },
  noResults: {
    padding: '48px',
    textAlign: 'center',
    color: '#8b949e',
    fontSize: '14px',
  },
  summarySection: {
    backgroundColor: '#0d1117',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #30363d',
    marginBottom: '16px',
  },
  summaryTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#c9d1d9',
    marginBottom: '12px',
  },
  summaryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#8b949e',
  },
  recommendationsSection: {
    backgroundColor: 'rgba(31, 111, 235, 0.1)',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid rgba(31, 111, 235, 0.3)',
  },
  tipsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  tip: {
    fontSize: '12px',
    color: '#c9d1d9',
    padding: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '4px',
  },
  spinIcon: {
    animation: 'spin 1s linear infinite',
  },
};

export default GlassBuilder;
