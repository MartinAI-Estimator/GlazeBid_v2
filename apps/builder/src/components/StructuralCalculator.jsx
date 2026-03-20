import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, TrendingUp, Wrench } from 'lucide-react';

const DEFAULT_PARAMS = {
  width: 10.0,
  height: 10.0,
  mullion_spacing: 5.0,
  transom_height: 0,
  panel_count: 1,
  system_type: 'storefront',
  wind_velocity: 90,
  exposure_category: 'B',
  importance_factor: 1.0,
  dead_load: 10.0,
  live_load: 0,
  snow_load: 0,
  material: 'aluminum_2x4.5'
};

/**
 * Structural Calculator Component
 * Complete structural analysis for frame elevations
 * Wind load, deflection, and stress calculations
 */
const StructuralCalculator = ({ 
  isOpen, 
  onClose, 
  markup, 
  calibration,
  project, 
  sheet,
  embedded = false
}) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  
  // Input parameters
  const [params, setParams] = useState(DEFAULT_PARAMS);
  
  const [materials, setMaterials] = useState({});
  
  // Reset calculator state for each new/opened markup and seed dimensions
  useEffect(() => {
    if (!isOpen) return;

    setLoading(false);
    setAnalysis(null);
    setError(null);

    const extractedDimensions = getDimensionsFromMarkup(markup, calibration);
    setParams({
      ...DEFAULT_PARAMS,
      ...extractedDimensions
    });

    fetchMaterials();
  }, [isOpen, markup?.id]);
  
  const fetchMaterials = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/structural/materials');
      const data = await response.json();
      if (data.status === 'success') {
        setMaterials(data.materials);
      }
    } catch (err) {
      console.error('Failed to load materials:', err);
    }
  };
  
  const getDimensionsFromMarkup = (markup, fallbackCalibration) => {
    // Calculate dimensions from markup points
    if (!(markup && markup.points && markup.points.length >= 2)) {
      return {};
    }

      const xs = markup.points.map(p => p.x);
      const ys = markup.points.map(p => p.y);

      const widthPx = Math.max(...xs) - Math.min(...xs);
      const heightPx = Math.max(...ys) - Math.min(...ys);

      const appliedCalibration = markup.calibration || fallbackCalibration;
      let width = widthPx / 12;
      let height = heightPx / 12;

      if (appliedCalibration?.pixelsPerFoot) {
        width = widthPx / appliedCalibration.pixelsPerFoot;
        height = heightPx / appliedCalibration.pixelsPerFoot;
      } else if (appliedCalibration?.pixelsPerInch) {
        width = widthPx / (appliedCalibration.pixelsPerInch * 12);
        height = heightPx / (appliedCalibration.pixelsPerInch * 12);
      }

      return {
        width: Math.max(width, 1),
        height: Math.max(height, 1)
      };
  };
  
  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const requestData = {
        ...params,
        markup_id: markup?.id,
        calibration: markup?.calibration || calibration || null,
        project: project,
        sheet: sheet
      };
      
      const response = await fetch('http://127.0.0.1:8000/api/structural/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      
      const data = await response.json();
      
      if (data.status === 'success' && data.analysis) {
        setAnalysis(data.analysis);
      } else {
        setError(data.detail || 'Analysis failed - invalid response');
      }
    } catch (err) {
      setError('Failed to run analysis: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDecisionColor = (status) => {
    if (status === 'PASS' || status === 'PASS_WITH_STEEL') return '#5cb85c';
    if (status === 'CRITICAL_FAIL' || status === 'FAIL') return '#d9534f';
    return '#6c757d';
  };

  const getFramePreview = () => {
    if (!(markup && markup.points && markup.points.length >= 3)) return null;

    const points = markup.points;
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    const viewWidth = 360;
    const viewHeight = 140;
    const padding = 12;
    const scale = Math.min(
      (viewWidth - padding * 2) / width,
      (viewHeight - padding * 2) / height
    );

    const normalizedPoints = points.map(point => {
      const nx = (point.x - minX) * scale + padding;
      const ny = (point.y - minY) * scale + padding;
      return `${nx.toFixed(2)},${ny.toFixed(2)}`;
    }).join(' ');

    return {
      viewWidth,
      viewHeight,
      normalizedPoints,
      color: markup.color || 'rgba(0, 123, 255, 0.7)'
    };
  };

  const framePreview = getFramePreview();
  const frameImage = markup?.framePreview?.imageDataUrl || null;
  
  if (!embedded && !isOpen) return null;
  
  return (
    <div style={embedded ? styles.embeddedRoot : styles.overlay}>
      <div style={embedded ? styles.embeddedModal : styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            <Wrench size={24} style={{ marginRight: '10px' }} />
            Structural Calculator
          </h2>
          {analysis?.mullion_check?.status && (
            <div
              style={{
                ...styles.decisionBadge,
                backgroundColor: getDecisionColor(analysis.mullion_check.status),
              }}
            >
              {analysis.mullion_check.status}
            </div>
          )}
          {!embedded && (
            <button onClick={onClose} style={styles.closeBtn}>
              <X size={24} />
            </button>
          )}
        </div>
        
        {/* Content */}
        <div style={styles.content}>
          {framePreview && (
            <div style={styles.framePreviewCard}>
              <div style={styles.framePreviewHeader}>Selected Frame Preview</div>
              <div style={styles.framePreviewBody}>
                {frameImage ? (
                  <img src={frameImage} alt="Selected frame preview" style={styles.framePreviewImage} />
                ) : (
                  <svg
                    width={framePreview.viewWidth}
                    height={framePreview.viewHeight}
                    style={styles.framePreviewSvg}
                  >
                    <polygon
                      points={framePreview.normalizedPoints}
                      fill={framePreview.color}
                      fillOpacity={0.25}
                      stroke={framePreview.color}
                      strokeWidth={2}
                    />
                  </svg>
                )}
                <div style={styles.frameMeta}>
                  <div><strong>Markup:</strong> {markup?.id || 'N/A'}</div>
                  <div><strong>Type:</strong> {markup?.type || 'Area'}</div>
                  <div><strong>System:</strong> {markup?.system || 'Unclassified'}</div>
                  <div><strong>Width:</strong> {params.width?.toFixed?.(2) || params.width} ft</div>
                  <div><strong>Height:</strong> {params.height?.toFixed?.(2) || params.height} ft</div>
                </div>
              </div>
            </div>
          )}

          {!analysis ? (
            // Input Form
            <div style={styles.form}>
              <h3 style={styles.sectionTitle}>Frame Geometry</h3>
              <div style={styles.row}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Width (ft)</label>
                  <input
                    type="number"
                    value={params.width}
                    onChange={(e) => setParams({...params, width: parseFloat(e.target.value)})}
                    style={styles.input}
                    step="0.1"
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Height (ft)</label>
                  <input
                    type="number"
                    value={params.height}
                    onChange={(e) => setParams({...params, height: parseFloat(e.target.value)})}
                    style={styles.input}
                    step="0.1"
                  />
                </div>
              </div>
              
              <div style={styles.row}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Mullion Spacing (ft)</label>
                  <input
                    type="number"
                    value={params.mullion_spacing}
                    onChange={(e) => setParams({...params, mullion_spacing: parseFloat(e.target.value)})}
                    style={styles.input}
                    step="0.5"
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>System Type</label>
                  <select
                    value={params.system_type}
                    onChange={(e) => setParams({...params, system_type: e.target.value})}
                    style={styles.input}
                  >
                    <option value="storefront">Storefront</option>
                    <option value="curtainwall">Curtainwall</option>
                    <option value="window">Window Wall</option>
                  </select>
                </div>
              </div>
              
              <h3 style={styles.sectionTitle}>Load Conditions</h3>
              <div style={styles.row}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Wind Velocity (mph)</label>
                  <input
                    type="number"
                    value={params.wind_velocity}
                    onChange={(e) => setParams({...params, wind_velocity: parseFloat(e.target.value)})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Exposure</label>
                  <select
                    value={params.exposure_category}
                    onChange={(e) => setParams({...params, exposure_category: e.target.value})}
                    style={styles.input}
                  >
                    <option value="B">B - Urban/Suburban</option>
                    <option value="C">C - Open Terrain</option>
                    <option value="D">D - Flat/Water</option>
                  </select>
                </div>
              </div>
              
              <div style={styles.row}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Material</label>
                  <select
                    value={params.material}
                    onChange={(e) => setParams({...params, material: e.target.value})}
                    style={styles.input}
                  >
                    {Object.entries(materials).map(([key, mat]) => (
                      <option key={key} value={key}>{mat.name}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Importance Factor</label>
                  <input
                    type="number"
                    value={params.importance_factor}
                    onChange={(e) => setParams({...params, importance_factor: parseFloat(e.target.value)})}
                    style={styles.input}
                    step="0.05"
                  />
                </div>
              </div>
              
              {error && (
                <div style={styles.error}>
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}
              
              <button
                onClick={runAnalysis}
                disabled={loading}
                style={styles.analyzeBtn}
              >
                {loading ? '🔄 Analyzing...' : '📊 Run Structural Analysis'}
              </button>
            </div>
          ) : (
            // Results Display
            <div style={styles.results}>
              {/* Overall Status */}
              <div style={{
                ...styles.statusCard,
                backgroundColor: analysis.overall_pass ? '#d4edda' : '#f8d7da',
                borderColor: analysis.overall_pass ? '#c3e6cb' : '#f5c6cb'
              }}>
                {analysis.overall_pass ? (
                  <CheckCircle size={32} color="#155724" />
                ) : (
                  <AlertCircle size={32} color="#721c24" />
                )}
                <div>
                  <h3 style={{ margin: 0, color: analysis.overall_pass ? '#155724' : '#721c24' }}>
                    {analysis.overall_status}
                  </h3>
                  <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>
                    Frame structural analysis complete
                  </p>
                </div>
              </div>

              {/* Mullion Decision */}
              {analysis.mullion_check && (
                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>🧠 Mullion Decision</h3>
                  <div style={styles.cardContent}>
                    <div style={styles.resultRow}>
                      <span>Status:</span>
                      <strong style={{ color: getDecisionColor(analysis.mullion_check.status) }}>
                        {analysis.mullion_check.status}
                      </strong>
                    </div>
                    <div style={styles.resultRow}>
                      <span>Required Inertia:</span>
                      <strong>{analysis.mullion_check.calculations?.i_required_in4} in⁴</strong>
                    </div>
                    <div style={styles.resultRow}>
                      <span>Base Mullion Ix:</span>
                      <span>{analysis.mullion_check.inputs?.mullion_ix_in4} in⁴</span>
                    </div>
                    {analysis.mullion_check.fix?.type === 'steel_reinforcement' && (
                      <>
                        <div style={styles.resultRow}>
                          <span>Steel Recommendation:</span>
                          <strong>{analysis.mullion_check.fix.shape}</strong>
                        </div>
                        <div style={styles.resultRow}>
                          <span>Composite Inertia:</span>
                          <strong>{analysis.mullion_check.fix.composite_ix_in4} in⁴</strong>
                        </div>
                      </>
                    )}
                    {analysis.mullion_check.fix?.type === 'switch_system' && (
                      <div style={styles.resultRow}>
                        <span>System Recommendation:</span>
                        <strong style={{ color: '#d9534f' }}>Switch to Curtain Wall</strong>
                      </div>
                    )}
                    {analysis.mullion_check.recommendation && (
                      <div style={{ marginTop: '10px', fontWeight: '600', color: getDecisionColor(analysis.mullion_check.status) }}>
                        {analysis.mullion_check.recommendation}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Wind Analysis */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>🌪️ Wind Load Analysis</h3>
                <div style={styles.cardContent}>
                  <div style={styles.resultRow}>
                    <span>Design Pressure:</span>
                    <strong>{analysis.wind_analysis.design_pressure_psf} psf</strong>
                  </div>
                  <div style={styles.resultRow}>
                    <span>Positive Pressure:</span>
                    <span>{analysis.wind_analysis.positive_pressure_psf} psf</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span>Negative Pressure:</span>
                    <span>{analysis.wind_analysis.negative_pressure_psf} psf</span>
                  </div>
                </div>
              </div>
              
              {/* Deflection Check */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>📏 Deflection Check</h3>
                <div style={styles.cardContent}>
                  <div style={styles.resultRow}>
                    <span>Calculated Deflection:</span>
                    <strong>{analysis.deflection_check.deflection_in}" </strong>
                  </div>
                  <div style={styles.resultRow}>
                    <span>L/175 Limit:</span>
                    <span>{analysis.deflection_check.limit_l175_in}"</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span>Utilization:</span>
                    <strong style={{ 
                      color: analysis.deflection_check.utilization_l175_pct > 100 ? '#d9534f' : 
                             analysis.deflection_check.utilization_l175_pct > 80 ? '#f0ad4e' : '#5cb85c'
                    }}>
                      {analysis.deflection_check.utilization_l175_pct}%
                    </strong>
                  </div>
                  <div style={styles.resultRow}>
                    <span>Status:</span>
                    <span style={{
                      color: analysis.deflection_check.status === 'PASS' ? '#5cb85c' : '#d9534f',
                      fontWeight: 'bold'
                    }}>
                      {analysis.deflection_check.status}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Stress Check */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>💪 Stress Analysis</h3>
                <div style={styles.cardContent}>
                  <div style={styles.resultRow}>
                    <span>Bending Stress:</span>
                    <strong>{analysis.stress_check.bending_stress_psi} psi</strong>
                  </div>
                  <div style={styles.resultRow}>
                    <span>Allowable Stress:</span>
                    <span>{analysis.stress_check.allowable_stress_psi} psi</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span>Safety Factor:</span>
                    <strong>{analysis.stress_check.safety_factor}</strong>
                  </div>
                  <div style={styles.resultRow}>
                    <span>Utilization:</span>
                    <strong style={{ 
                      color: analysis.stress_check.utilization_pct > 100 ? '#d9534f' : 
                             analysis.stress_check.utilization_pct > 80 ? '#f0ad4e' : '#5cb85c'
                    }}>
                      {analysis.stress_check.utilization_pct}%
                    </strong>
                  </div>
                </div>
              </div>
              
              {/* Recommendations */}
              {analysis.recommendations && analysis.recommendations.length > 0 && (
                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>💡 Recommendations</h3>
                  <ul style={styles.recommendations}>
                    {analysis.recommendations.map((rec, idx) => (
                      <li key={idx} style={styles.recommendation}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div style={styles.buttonRow}>
                <button onClick={() => setAnalysis(null)} style={styles.backBtn}>
                  ← Back to Parameters
                </button>
                {!embedded && (
                  <button onClick={onClose} style={styles.doneBtn}>
                    ✓ Done
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000
  },
  embeddedRoot: {
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'stretch',
    padding: '16px',
    boxSizing: 'border-box',
    backgroundColor: '#0d1117'
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '800px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
  },
  embeddedModal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #dee2e6',
    backgroundColor: '#f8f9fa'
  },
  title: {
    margin: 0,
    fontSize: '24px',
    display: 'flex',
    alignItems: 'center',
    color: '#2c3e50'
  },
  decisionBadge: {
    color: 'white',
    fontSize: '12px',
    fontWeight: '700',
    borderRadius: '999px',
    padding: '6px 12px',
    marginLeft: 'auto',
    marginRight: '12px',
    letterSpacing: '0.3px'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '5px',
    color: '#6c757d'
  },
  content: {
    padding: '14px',
    overflowY: 'auto',
    flex: 1
  },
  framePreviewCard: {
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '12px',
    backgroundColor: '#fff'
  },
  framePreviewHeader: {
    margin: 0,
    padding: '10px 14px',
    backgroundColor: '#f8f9fa',
    borderBottom: '1px solid #dee2e6',
    fontSize: '14px',
    fontWeight: '700',
    color: '#2c3e50'
  },
  framePreviewBody: {
    padding: '10px 12px',
    display: 'flex',
    gap: '14px',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap'
  },
  framePreviewSvg: {
    border: '1px solid #e9ecef',
    borderRadius: '6px',
    backgroundColor: '#fcfdff',
    maxWidth: '100%'
  },
  framePreviewImage: {
    width: '100%',
    maxWidth: '780px',
    maxHeight: '260px',
    objectFit: 'contain',
    border: '1px solid #e9ecef',
    borderRadius: '6px',
    backgroundColor: '#fcfdff',
    padding: '6px',
    boxSizing: 'border-box',
    flex: '1 1 560px'
  },
  frameMeta: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '6px',
    fontSize: '13px',
    color: '#3d4652',
    minWidth: '220px',
    flex: '0 0 240px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  sectionTitle: {
    margin: '10px 0',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#2c3e50',
    borderBottom: '2px solid #3498db',
    paddingBottom: '5px'
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column'
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '5px',
    color: '#495057'
  },
  input: {
    padding: '8px 12px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '14px'
  },
  error: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '12px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  analyzeBtn: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '12px 24px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '10px'
  },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  statusCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid'
  },
  card: {
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  cardTitle: {
    margin: 0,
    padding: '12px 15px',
    backgroundColor: '#f8f9fa',
    borderBottom: '1px solid #dee2e6',
    fontSize: '16px',
    fontWeight: 'bold'
  },
  cardContent: {
    padding: '15px'
  },
  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0'
  },
  recommendations: {
    margin: 0,
    padding: '15px 15px 15px 35px'
  },
  recommendation: {
    marginBottom: '10px',
    fontSize: '14px',
    lineHeight: '1.5'
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end'
  },
  backBtn: {
    backgroundColor: '#6c757d',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  doneBtn: {
    backgroundColor: '#28a745',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  }
};

export default StructuralCalculator;
