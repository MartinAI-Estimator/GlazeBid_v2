import React, { useState, useCallback, useEffect } from 'react';
import { 
  X, 
  Copy, 
  ArrowRight, 
  Check, 
  AlertTriangle,
  Layers,
  Move,
  RefreshCw,
  Settings,
  FileCheck
} from 'lucide-react';

/**
 * MarkupTransfer Component
 * Transfers/copies markups from one sheet to another (e.g., from old revision to new)
 * Useful when addendums change sheets and markups need to be migrated
 */
const MarkupTransfer = ({ 
  isOpen, 
  onClose, 
  project, 
  sheets = [],
  currentSheet,
  onTransferComplete 
}) => {
  const [sourceSheet, setSourceSheet] = useState(currentSheet || '');
  const [targetSheet, setTargetSheet] = useState('');
  const [sourceMarkups, setSourceMarkups] = useState([]);
  const [selectedMarkups, setSelectedMarkups] = useState(new Set());
  const [transferMode, setTransferMode] = useState('copy'); // 'copy' or 'move'
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState(null);
  const [error, setError] = useState(null);

  // Load markups from source sheet
  useEffect(() => {
    const loadSourceMarkups = async () => {
      if (!sourceSheet || !project) {
        setSourceMarkups([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `http://localhost:8000/load-markups?project=${encodeURIComponent(project)}&sheet=${encodeURIComponent(sourceSheet)}`
        );
        const data = await response.json();
        
        if (data.status === 'success') {
          setSourceMarkups(data.markups || []);
          // Select all by default
          setSelectedMarkups(new Set(data.markups.map(m => m.id)));
        } else {
          setSourceMarkups([]);
          setSelectedMarkups(new Set());
        }
      } catch {
        // Backend not available in offline/Electron mode — start with empty list.
        setSourceMarkups([]);
        setSelectedMarkups(new Set());
      } finally {
        setIsLoading(false);
      }
    };

    loadSourceMarkups();
  }, [sourceSheet, project]);

  const toggleMarkupSelection = useCallback((markupId) => {
    setSelectedMarkups(prev => {
      const next = new Set(prev);
      if (next.has(markupId)) {
        next.delete(markupId);
      } else {
        next.add(markupId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedMarkups(new Set(sourceMarkups.map(m => m.id)));
  }, [sourceMarkups]);

  const selectNone = useCallback(() => {
    setSelectedMarkups(new Set());
  }, []);

  const executeTransfer = async () => {
    if (!targetSheet || selectedMarkups.size === 0) {
      setError('Please select a target sheet and at least one markup');
      return;
    }

    if (sourceSheet === targetSheet) {
      setError('Source and target sheets must be different');
      return;
    }

    setIsTransferring(true);
    setError(null);
    setTransferResult(null);

    try {
      // Get selected markups
      const markupsToTransfer = sourceMarkups.filter(m => selectedMarkups.has(m.id));
      
      // Apply offset and generate new IDs
      const transferredMarkups = markupsToTransfer.map(markup => {
        const newMarkup = { ...markup };
        newMarkup.id = `transferred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        newMarkup.sourceSheet = sourceSheet;
        newMarkup.transferredAt = new Date().toISOString();
        
        // Apply coordinate offset if set
        if ((offsetX !== 0 || offsetY !== 0) && newMarkup.points) {
          newMarkup.points = newMarkup.points.map(point => ({
            ...point,
            x: point.x + offsetX,
            y: point.y + offsetY
          }));
        }
        
        // Update center point if exists
        if (newMarkup.center) {
          newMarkup.center = {
            x: newMarkup.center.x + offsetX,
            y: newMarkup.center.y + offsetY
          };
        }
        
        return newMarkup;
      });

      // Save each markup to target sheet
      let successCount = 0;
      for (const markup of transferredMarkups) {
        const response = await fetch('http://localhost:8000/save-markup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project,
            sheet: targetSheet,
            markup
          })
        });

        if (response.ok) {
          successCount++;
        }
      }

      // If move mode, delete from source
      if (transferMode === 'move') {
        // TODO: Implement delete from source
        console.log('Move mode: Would delete markups from source');
      }

      setTransferResult({
        success: true,
        transferred: successCount,
        total: transferredMarkups.length,
        targetSheet
      });

      // Notify parent
      if (onTransferComplete) {
        onTransferComplete({
          sourceSheet,
          targetSheet,
          markups: transferredMarkups,
          mode: transferMode
        });
      }

    } catch {
      setError('Markup transfer is not available in offline mode.');
    } finally {
      setIsTransferring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <Copy size={22} color="#007BFF" />
            <h2 style={styles.title}>Transfer Markups</h2>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Sheet Selection Row */}
          <div style={styles.sheetRow}>
            {/* Source Sheet */}
            <div style={styles.sheetSelector}>
              <label style={styles.label}>Source Sheet</label>
              <select 
                style={styles.select}
                value={sourceSheet}
                onChange={(e) => setSourceSheet(e.target.value)}
              >
                <option value="">Select source...</option>
                {sheets.map(sheet => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.name || sheet.id}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight size={24} color="#6b7280" style={{ marginTop: '24px' }} />

            {/* Target Sheet */}
            <div style={styles.sheetSelector}>
              <label style={styles.label}>Target Sheet</label>
              <select 
                style={styles.select}
                value={targetSheet}
                onChange={(e) => setTargetSheet(e.target.value)}
              >
                <option value="">Select target...</option>
                {sheets
                  .filter(s => s.id !== sourceSheet)
                  .map(sheet => (
                    <option key={sheet.id} value={sheet.id}>
                      {sheet.name || sheet.id}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Transfer Mode */}
          <div style={styles.modeRow}>
            <label style={styles.label}>Transfer Mode</label>
            <div style={styles.modeButtons}>
              <button
                style={{
                  ...styles.modeButton,
                  ...(transferMode === 'copy' ? styles.modeButtonActive : {})
                }}
                onClick={() => setTransferMode('copy')}
              >
                <Copy size={16} />
                Copy
              </button>
              <button
                style={{
                  ...styles.modeButton,
                  ...(transferMode === 'move' ? styles.modeButtonActive : {})
                }}
                onClick={() => setTransferMode('move')}
              >
                <Move size={16} />
                Move
              </button>
            </div>
          </div>

          {/* Offset Settings */}
          <div style={styles.offsetRow}>
            <Settings size={16} color="#9ea7b3" />
            <span style={styles.offsetLabel}>Coordinate Offset (pixels):</span>
            <div style={styles.offsetInputs}>
              <label>
                X: 
                <input
                  type="number"
                  value={offsetX}
                  onChange={(e) => setOffsetX(Number(e.target.value))}
                  style={styles.offsetInput}
                />
              </label>
              <label>
                Y: 
                <input
                  type="number"
                  value={offsetY}
                  onChange={(e) => setOffsetY(Number(e.target.value))}
                  style={styles.offsetInput}
                />
              </label>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div style={styles.error}>
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {/* Success Display */}
          {transferResult?.success && (
            <div style={styles.success}>
              <Check size={16} />
              Successfully transferred {transferResult.transferred} of {transferResult.total} markups to {transferResult.targetSheet}
            </div>
          )}

          {/* Markups List */}
          <div style={styles.markupsSection}>
            <div style={styles.markupsHeader}>
              <span style={styles.markupsTitle}>
                <Layers size={16} />
                Source Markups ({sourceMarkups.length})
              </span>
              <div style={styles.markupsActions}>
                <button style={styles.linkButton} onClick={selectAll}>Select All</button>
                <span style={styles.divider}>|</span>
                <button style={styles.linkButton} onClick={selectNone}>Select None</button>
              </div>
            </div>

            <div style={styles.markupsList}>
              {isLoading ? (
                <div style={styles.loading}>
                  <RefreshCw size={20} className="spin" />
                  Loading markups...
                </div>
              ) : sourceMarkups.length === 0 ? (
                <div style={styles.empty}>
                  No markups found on source sheet
                </div>
              ) : (
                sourceMarkups.map(markup => (
                  <div 
                    key={markup.id}
                    style={{
                      ...styles.markupItem,
                      ...(selectedMarkups.has(markup.id) ? styles.markupItemSelected : {})
                    }}
                    onClick={() => toggleMarkupSelection(markup.id)}
                  >
                    <div style={styles.checkbox}>
                      {selectedMarkups.has(markup.id) && <Check size={14} />}
                    </div>
                    <div style={styles.markupInfo}>
                      <div style={styles.markupType}>
                        {markup.tool === 'polyline' ? '📐' : 
                         markup.tool === 'rectangle' ? '⬜' :
                         markup.tool === 'area' ? '⬡' :
                         markup.tool === 'count' ? '🔢' : '📍'}
                        {' '}{markup.type || markup.tool || 'Markup'}
                      </div>
                      <div style={styles.markupMeta}>
                        {markup.points?.length || 0} points
                        {markup.quantity && ` • Qty: ${markup.quantity}`}
                        {markup.color && ` • ${markup.color}`}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.footerInfo}>
            {selectedMarkups.size > 0 && (
              <span>{selectedMarkups.size} markup(s) selected</span>
            )}
          </div>
          <div style={styles.footerButtons}>
            <button style={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            <button 
              style={{
                ...styles.transferButton,
                opacity: (selectedMarkups.size === 0 || !targetSheet || isTransferring) ? 0.5 : 1
              }}
              onClick={executeTransfer}
              disabled={selectedMarkups.size === 0 || !targetSheet || isTransferring}
            >
              {isTransferring ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  Transferring...
                </>
              ) : (
                <>
                  <FileCheck size={16} />
                  {transferMode === 'copy' ? 'Copy' : 'Move'} to Target
                </>
              )}
            </button>
          </div>
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
    width: '600px',
    maxWidth: '95vw',
    maxHeight: '85vh',
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
  },
  content: {
    flex: 1,
    padding: '24px',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sheetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  sheetSelector: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#9ea7b3',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  select: {
    padding: '10px 12px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  modeRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  modeButtons: {
    display: 'flex',
    gap: '8px',
  },
  modeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#9ea7b3',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s',
  },
  modeButtonActive: {
    backgroundColor: '#007BFF',
    borderColor: '#007BFF',
    color: '#ffffff',
  },
  offsetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#0b0e11',
    borderRadius: '6px',
  },
  offsetLabel: {
    fontSize: '13px',
    color: '#9ea7b3',
  },
  offsetInputs: {
    display: 'flex',
    gap: '16px',
    marginLeft: 'auto',
  },
  offsetInput: {
    width: '80px',
    padding: '6px 8px',
    marginLeft: '8px',
    backgroundColor: '#1c2128',
    border: '1px solid #2d333b',
    borderRadius: '4px',
    color: '#ffffff',
    fontSize: '13px',
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
  success: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    border: '1px solid #4ade80',
    borderRadius: '8px',
    color: '#4ade80',
    fontSize: '14px',
  },
  markupsSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '200px',
  },
  markupsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  markupsTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
  },
  markupsActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#007BFF',
    cursor: 'pointer',
    fontSize: '12px',
  },
  divider: {
    color: '#4b5563',
  },
  markupsList: {
    flex: 1,
    backgroundColor: '#0b0e11',
    borderRadius: '8px',
    overflow: 'auto',
    maxHeight: '250px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '32px',
    color: '#9ea7b3',
  },
  empty: {
    padding: '32px',
    textAlign: 'center',
    color: '#6b7280',
  },
  markupItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid #1c2128',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  markupItemSelected: {
    backgroundColor: 'rgba(0, 123, 255, 0.15)',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: '2px solid #4b5563',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#007BFF',
    flexShrink: 0,
  },
  markupInfo: {
    flex: 1,
  },
  markupType: {
    fontSize: '14px',
    color: '#ffffff',
    fontWeight: 500,
  },
  markupMeta: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '2px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderTop: '1px solid #2d333b',
  },
  footerInfo: {
    fontSize: '13px',
    color: '#9ea7b3',
  },
  footerButtons: {
    display: 'flex',
    gap: '12px',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#9ea7b3',
    cursor: 'pointer',
    fontSize: '14px',
  },
  transferButton: {
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

export default MarkupTransfer;
