import React, { useState, useCallback, useRef } from 'react';
import { 
  X, 
  Upload, 
  Layers, 
  FileSearch, 
  ArrowLeftRight, 
  Download,
  AlertTriangle,
  CheckCircle,
  Info,
  ZoomIn,
  ZoomOut,
  RefreshCw
} from 'lucide-react';

/**
 * AddendumViewer Component
 * Visual diff comparison for addendum analysis
 * Shows Red (Deleted) / Blue (Added) overlay
 */
const AddendumViewer = ({ isOpen, onClose, project }) => {
  const [oldSheet, setOldSheet] = useState(null);
  const [newSheet, setNewSheet] = useState(null);
  const [diffImage, setDiffImage] = useState(null);
  const [impactReport, setImpactReport] = useState(null);
  const [viewMode, setViewMode] = useState('side-by-side'); // 'side-by-side', 'overlay', 'diff-only'
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  
  const oldFileRef = useRef(null);
  const newFileRef = useRef(null);

  const handleOldSheetUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      setOldSheet({
        file,
        name: file.name,
        preview: URL.createObjectURL(file)
      });
      setDiffImage(null);
      setImpactReport(null);
      setError(null);
    }
  }, []);

  const handleNewSheetUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      setNewSheet({
        file,
        name: file.name,
        preview: URL.createObjectURL(file)
      });
      setDiffImage(null);
      setImpactReport(null);
      setError(null);
    }
  }, []);

  const runComparison = async () => {
    if (!oldSheet || !newSheet) {
      setError('Please upload both original and revised sheets');
      return;
    }

    setIsComparing(true);
    setError(null);

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('old_pdf', oldSheet.file);
      formData.append('new_pdf', newSheet.file);

      // Call comparison endpoint
      const compareResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/visual-diff/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          old_pdf_path: oldSheet.name,
          new_pdf_path: newSheet.name,
          output_path: `diff_${Date.now()}.jpg`
        })
      });

      if (!compareResponse.ok) {
        throw new Error('Comparison failed');
      }

      const compareResult = await compareResponse.json();
      
      // For now, use placeholder diff image
      // In production, this would be the actual diff image path
      setDiffImage(compareResult.diff_image || oldSheet.preview);

      // Get impact report
      const impactResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/visual-diff/impact-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          old_sheet_path: oldSheet.name,
          new_sheet_path: newSheet.name
        })
      });

      if (impactResponse.ok) {
        const impact = await impactResponse.json();
        setImpactReport(impact.impact_report);
      }

    } catch {
      setError('Visual diff comparison is not available in offline mode.');
    } finally {
      setIsComparing(false);
    }
  };

  const getChangeIndicator = (change) => {
    if (change > 0) return { icon: AlertTriangle, color: '#ef4444', label: 'Increased' };
    if (change < 0) return { icon: CheckCircle, color: '#4ade80', label: 'Decreased' };
    return { icon: Info, color: '#60a5fa', label: 'No Change' };
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <Layers size={24} color="#007BFF" />
            <h2 style={styles.title}>Addendum Visual Diff</h2>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Main Content */}
        <div style={styles.content}>
          {/* Upload Section */}
          <div style={styles.uploadSection}>
            {/* Old Sheet */}
            <div style={styles.uploadCard}>
              <input
                ref={oldFileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: 'none' }}
                onChange={handleOldSheetUpload}
              />
              <button 
                style={styles.uploadButton}
                onClick={() => oldFileRef.current?.click()}
              >
                <Upload size={20} />
                <span>Original Sheet</span>
              </button>
              {oldSheet && (
                <div style={styles.fileName}>
                  <FileSearch size={14} />
                  {oldSheet.name}
                </div>
              )}
            </div>

            {/* Arrow */}
            <ArrowLeftRight size={24} color="#6b7280" />

            {/* New Sheet */}
            <div style={styles.uploadCard}>
              <input
                ref={newFileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: 'none' }}
                onChange={handleNewSheetUpload}
              />
              <button 
                style={styles.uploadButton}
                onClick={() => newFileRef.current?.click()}
              >
                <Upload size={20} />
                <span>Revised Sheet</span>
              </button>
              {newSheet && (
                <div style={styles.fileName}>
                  <FileSearch size={14} />
                  {newSheet.name}
                </div>
              )}
            </div>

            {/* Compare Button */}
            <button 
              style={{
                ...styles.compareButton,
                opacity: (!oldSheet || !newSheet || isComparing) ? 0.5 : 1
              }}
              onClick={runComparison}
              disabled={!oldSheet || !newSheet || isComparing}
            >
              {isComparing ? (
                <>
                  <RefreshCw size={18} className="spin" />
                  Comparing...
                </>
              ) : (
                <>
                  <Layers size={18} />
                  Run Visual Diff
                </>
              )}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div style={styles.error}>
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {/* View Mode Tabs */}
          <div style={styles.viewModes}>
            {['side-by-side', 'overlay', 'diff-only'].map(mode => (
              <button
                key={mode}
                style={{
                  ...styles.viewModeButton,
                  ...(viewMode === mode ? styles.viewModeActive : {})
                }}
                onClick={() => setViewMode(mode)}
              >
                {mode.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </button>
            ))}
          </div>

          {/* Comparison View */}
          <div style={styles.comparisonArea}>
            {viewMode === 'side-by-side' && (
              <div style={styles.sideBySide}>
                <div style={styles.imageContainer}>
                  <div style={styles.imageLabel}>Original</div>
                  {oldSheet ? (
                    <img src={oldSheet.preview} alt="Original" style={styles.sheetImage} />
                  ) : (
                    <div style={styles.placeholder}>Upload original sheet</div>
                  )}
                </div>
                <div style={styles.imageContainer}>
                  <div style={styles.imageLabel}>Revised</div>
                  {newSheet ? (
                    <img src={newSheet.preview} alt="Revised" style={styles.sheetImage} />
                  ) : (
                    <div style={styles.placeholder}>Upload revised sheet</div>
                  )}
                </div>
              </div>
            )}

            {viewMode === 'overlay' && oldSheet && newSheet && (
              <div style={styles.overlayView}>
                <div style={styles.overlayControls}>
                  <label>Opacity: {Math.round(overlayOpacity * 100)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                    style={styles.slider}
                  />
                </div>
                <div style={styles.overlayContainer}>
                  <img 
                    src={oldSheet.preview} 
                    alt="Original" 
                    style={{ ...styles.sheetImage, position: 'absolute' }} 
                  />
                  <img 
                    src={newSheet.preview} 
                    alt="Revised" 
                    style={{ 
                      ...styles.sheetImage, 
                      position: 'absolute',
                      opacity: overlayOpacity,
                      mixBlendMode: 'difference'
                    }} 
                  />
                </div>
              </div>
            )}

            {viewMode === 'diff-only' && (
              <div style={styles.diffView}>
                {diffImage ? (
                  <img src={diffImage} alt="Difference" style={styles.sheetImage} />
                ) : (
                  <div style={styles.placeholder}>
                    Run comparison to see diff view
                    <p style={styles.legend}>
                      <span style={{ color: '#ef4444' }}>■ Red = Deleted</span>
                      {' | '}
                      <span style={{ color: '#00bfff' }}>■ Blue = Added</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Impact Report */}
          {impactReport && (
            <div style={styles.impactReport}>
              <h3 style={styles.impactTitle}>📊 Impact Report</h3>
              <div style={styles.impactGrid}>
                <div style={styles.impactCard}>
                  <div style={styles.impactLabel}>Change %</div>
                  <div style={styles.impactValue}>
                    {impactReport.pixel_analysis?.change_percentage || 0}%
                  </div>
                </div>
                <div style={styles.impactCard}>
                  <div style={styles.impactLabel}>Regions Changed</div>
                  <div style={styles.impactValue}>
                    {impactReport.pixel_analysis?.num_change_regions || 0}
                  </div>
                </div>
                {impactReport.takeoff_impact?.square_feet && (
                  <div style={styles.impactCard}>
                    <div style={styles.impactLabel}>SF Change</div>
                    <div style={{
                      ...styles.impactValue,
                      color: impactReport.takeoff_impact.square_feet.change > 0 ? '#ef4444' : '#4ade80'
                    }}>
                      {impactReport.takeoff_impact.square_feet.change > 0 ? '+' : ''}
                      {impactReport.takeoff_impact.square_feet.change} SF
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.footerButton} onClick={onClose}>
            Close
          </button>
          {diffImage && (
            <button style={styles.primaryButton}>
              <Download size={16} />
              Export Report
            </button>
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1c2128',
    borderRadius: '12px',
    width: '95vw',
    maxWidth: '1400px',
    height: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: '1px solid #2d333b',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#ffffff',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9ea7b3',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: '24px',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  uploadSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#252526',
    borderRadius: '8px',
  },
  uploadCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  uploadButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#2d333b',
    border: '2px dashed #4b5563',
    borderRadius: '8px',
    color: '#9ea7b3',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  fileName: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#4ade80',
  },
  compareButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: '#007BFF',
    border: 'none',
    borderRadius: '8px',
    color: '#ffffff',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  error: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    color: '#fca5a5',
    fontSize: '14px',
  },
  viewModes: {
    display: 'flex',
    gap: '8px',
  },
  viewModeButton: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#9ea7b3',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s',
  },
  viewModeActive: {
    backgroundColor: '#007BFF',
    borderColor: '#007BFF',
    color: '#ffffff',
  },
  comparisonArea: {
    flex: 1,
    backgroundColor: '#0b0e11',
    borderRadius: '8px',
    overflow: 'hidden',
    minHeight: '400px',
  },
  sideBySide: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    height: '100%',
    gap: '2px',
  },
  imageContainer: {
    position: 'relative',
    backgroundColor: '#1c2128',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
  },
  imageLabel: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    padding: '4px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#ffffff',
    fontWeight: 500,
  },
  sheetImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  placeholder: {
    color: '#6b7280',
    textAlign: 'center',
    padding: '40px',
  },
  legend: {
    marginTop: '16px',
    fontSize: '13px',
  },
  overlayView: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  overlayControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: '#252526',
    color: '#9ea7b3',
    fontSize: '13px',
  },
  slider: {
    width: '150px',
  },
  overlayContainer: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diffView: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  impactReport: {
    padding: '16px',
    backgroundColor: '#252526',
    borderRadius: '8px',
  },
  impactTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
  },
  impactGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
  },
  impactCard: {
    padding: '12px',
    backgroundColor: '#1c2128',
    borderRadius: '6px',
    textAlign: 'center',
  },
  impactLabel: {
    fontSize: '11px',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase',
  },
  impactValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '16px 24px',
    borderTop: '1px solid #2d333b',
  },
  footerButton: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#9ea7b3',
    cursor: 'pointer',
    fontSize: '14px',
  },
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: '#007BFF',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
};

export default AddendumViewer;
