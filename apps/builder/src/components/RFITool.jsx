import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  X, 
  Camera, 
  MessageCircleQuestion,
  Plus,
  Trash2,
  Download,
  Edit3,
  Check,
  AlertTriangle,
  FileText,
  Layers,
  ZoomIn,
  Crop,
  Save
} from 'lucide-react';

/**
 * RFITool Component
 * Pre-Bid RFI "Snipper" tool - Capture drawing details with questions
 * For clarification requests before bid submission
 */
const RFITool = ({ 
  isOpen, 
  onClose, 
  project,
  currentSheet,
  sheetImage,
  onRFIGenerate
}) => {
  const [rfiItems, setRfiItems] = useState([]);
  const [isSnipping, setIsSnipping] = useState(false);
  const [currentSnip, setCurrentSnip] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [projectInfo, setProjectInfo] = useState({
    projectName: project || '',
    contractor: '',
    contact: '',
    email: '',
    dueDate: ''
  });

  const canvasRef = useRef(null);
  const snipStartRef = useRef(null);

  // Add new RFI item
  const addRFIItem = useCallback(() => {
    const newItem = {
      id: `rfi_${Date.now()}`,
      sheet: currentSheet,
      snipImage: null,
      snipBounds: null,
      question: '',
      reference: '',
      priority: 'medium', // 'low', 'medium', 'high'
      createdAt: new Date().toISOString()
    };
    setRfiItems(prev => [...prev, newItem]);
    setEditingId(newItem.id);
  }, [currentSheet]);

  // Delete RFI item
  const deleteRFIItem = useCallback((id) => {
    setRfiItems(prev => prev.filter(item => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
    }
  }, [editingId]);

  // Update RFI item field
  const updateRFIItem = useCallback((id, field, value) => {
    setRfiItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, []);

  // Start snipping mode
  const startSnipping = useCallback((itemId) => {
    setIsSnipping(true);
    setEditingId(itemId);
  }, []);

  // Handle snip capture from canvas
  const handleCanvasMouseDown = useCallback((e) => {
    if (!isSnipping) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    snipStartRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    setCurrentSnip({
      startX: snipStartRef.current.x,
      startY: snipStartRef.current.y,
      endX: snipStartRef.current.x,
      endY: snipStartRef.current.y
    });
  }, [isSnipping]);

  const handleCanvasMouseMove = useCallback((e) => {
    if (!isSnipping || !snipStartRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    setCurrentSnip({
      startX: snipStartRef.current.x,
      startY: snipStartRef.current.y,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top
    });
  }, [isSnipping]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isSnipping || !currentSnip || !editingId) return;

    // Normalize bounds
    const bounds = {
      x: Math.min(currentSnip.startX, currentSnip.endX),
      y: Math.min(currentSnip.startY, currentSnip.endY),
      width: Math.abs(currentSnip.endX - currentSnip.startX),
      height: Math.abs(currentSnip.endY - currentSnip.startY)
    };

    // Only capture if area is significant
    if (bounds.width > 10 && bounds.height > 10) {
      // Create snip image from canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Create temporary canvas for the snip
      const snipCanvas = document.createElement('canvas');
      snipCanvas.width = bounds.width;
      snipCanvas.height = bounds.height;
      const snipCtx = snipCanvas.getContext('2d');
      
      // Copy the region
      const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
      snipCtx.putImageData(imageData, 0, 0);
      
      // Update the RFI item with snip image
      const snipDataUrl = snipCanvas.toDataURL('image/png');
      updateRFIItem(editingId, 'snipImage', snipDataUrl);
      updateRFIItem(editingId, 'snipBounds', bounds);
    }

    setIsSnipping(false);
    setCurrentSnip(null);
    snipStartRef.current = null;
  }, [isSnipping, currentSnip, editingId, updateRFIItem]);

  // Draw sheet image and snip overlay on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sheetImage) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // Draw snip selection if active
      if (currentSnip) {
        ctx.strokeStyle = '#007BFF';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
          Math.min(currentSnip.startX, currentSnip.endX),
          Math.min(currentSnip.startY, currentSnip.endY),
          Math.abs(currentSnip.endX - currentSnip.startX),
          Math.abs(currentSnip.endY - currentSnip.startY)
        );
        
        // Semi-transparent fill
        ctx.fillStyle = 'rgba(0, 123, 255, 0.1)';
        ctx.fillRect(
          Math.min(currentSnip.startX, currentSnip.endX),
          Math.min(currentSnip.startY, currentSnip.endY),
          Math.abs(currentSnip.endX - currentSnip.startX),
          Math.abs(currentSnip.endY - currentSnip.startY)
        );
      }
    };
    img.src = sheetImage;
  }, [sheetImage, currentSnip]);

  // Generate RFI document
  const generateRFI = useCallback(() => {
    if (onRFIGenerate) {
      onRFIGenerate({
        projectInfo,
        items: rfiItems,
        generatedAt: new Date().toISOString()
      });
    }
  }, [projectInfo, rfiItems, onRFIGenerate]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#4ade80';
      default: return '#6b7280';
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <MessageCircleQuestion size={22} color="#007BFF" />
            <h2 style={styles.title}>Pre-Bid RFI Tool</h2>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Project Info Section */}
          <div style={styles.projectInfoSection}>
            <h3 style={styles.sectionTitle}>
              <FileText size={16} />
              Project Information
            </h3>
            <div style={styles.projectInfoGrid}>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Project Name</label>
                <input
                  type="text"
                  value={projectInfo.projectName}
                  onChange={(e) => setProjectInfo(prev => ({ ...prev, projectName: e.target.value }))}
                  style={styles.input}
                  placeholder="Enter project name"
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Contractor</label>
                <input
                  type="text"
                  value={projectInfo.contractor}
                  onChange={(e) => setProjectInfo(prev => ({ ...prev, contractor: e.target.value }))}
                  style={styles.input}
                  placeholder="Your company name"
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Contact</label>
                <input
                  type="text"
                  value={projectInfo.contact}
                  onChange={(e) => setProjectInfo(prev => ({ ...prev, contact: e.target.value }))}
                  style={styles.input}
                  placeholder="Contact name"
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Email</label>
                <input
                  type="email"
                  value={projectInfo.email}
                  onChange={(e) => setProjectInfo(prev => ({ ...prev, email: e.target.value }))}
                  style={styles.input}
                  placeholder="email@example.com"
                />
              </div>
            </div>
          </div>

          {/* Main Layout: Canvas + RFI Items */}
          <div style={styles.mainLayout}>
            {/* Canvas Section */}
            <div style={styles.canvasSection}>
              <div style={styles.canvasHeader}>
                <Layers size={16} />
                <span>{currentSheet || 'Sheet Preview'}</span>
                {isSnipping && (
                  <span style={styles.snippingBadge}>
                    <Crop size={12} />
                    Click and drag to capture area
                  </span>
                )}
              </div>
              <div style={styles.canvasContainer}>
                {sheetImage ? (
                  <canvas
                    ref={canvasRef}
                    style={{
                      ...styles.canvas,
                      cursor: isSnipping ? 'crosshair' : 'default'
                    }}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                  />
                ) : (
                  <div style={styles.noImage}>
                    <Camera size={40} color="#4b5563" />
                    <p>No sheet image available</p>
                    <p style={{ fontSize: '12px' }}>Open a sheet in the PDF viewer first</p>
                  </div>
                )}
              </div>
            </div>

            {/* RFI Items Section */}
            <div style={styles.rfiSection}>
              <div style={styles.rfiHeader}>
                <span style={styles.rfiTitle}>RFI Questions ({rfiItems.length})</span>
                <button style={styles.addButton} onClick={addRFIItem}>
                  <Plus size={16} />
                  Add Question
                </button>
              </div>

              <div style={styles.rfiList}>
                {rfiItems.length === 0 ? (
                  <div style={styles.emptyRfi}>
                    <MessageCircleQuestion size={32} color="#4b5563" />
                    <p>No RFI questions yet</p>
                    <p style={{ fontSize: '12px', color: '#6b7280' }}>
                      Click "Add Question" to start building your RFI
                    </p>
                  </div>
                ) : (
                  rfiItems.map((item, index) => (
                    <div key={item.id} style={styles.rfiItem}>
                      <div style={styles.rfiItemHeader}>
                        <span style={styles.rfiItemNumber}>#{index + 1}</span>
                        <span 
                          style={{ 
                            ...styles.priorityBadge,
                            backgroundColor: getPriorityColor(item.priority) 
                          }}
                        >
                          {item.priority}
                        </span>
                        <div style={styles.rfiItemActions}>
                          <button 
                            style={styles.iconButton}
                            onClick={() => startSnipping(item.id)}
                            title="Capture snip"
                          >
                            <Camera size={14} />
                          </button>
                          <button 
                            style={styles.iconButton}
                            onClick={() => deleteRFIItem(item.id)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Snip Preview */}
                      {item.snipImage && (
                        <div style={styles.snipPreview}>
                          <img src={item.snipImage} alt="Snip" style={styles.snipImage} />
                        </div>
                      )}

                      {/* Reference */}
                      <div style={styles.rfiField}>
                        <label style={styles.rfiFieldLabel}>Reference</label>
                        <input
                          type="text"
                          value={item.reference}
                          onChange={(e) => updateRFIItem(item.id, 'reference', e.target.value)}
                          style={styles.rfiInput}
                          placeholder="Sheet A1.1, Detail 3/A5.2, etc."
                        />
                      </div>

                      {/* Question */}
                      <div style={styles.rfiField}>
                        <label style={styles.rfiFieldLabel}>Question</label>
                        <textarea
                          value={item.question}
                          onChange={(e) => updateRFIItem(item.id, 'question', e.target.value)}
                          style={styles.rfiTextarea}
                          placeholder="Please clarify the glazing type for this opening..."
                          rows={3}
                        />
                      </div>

                      {/* Priority */}
                      <div style={styles.rfiField}>
                        <label style={styles.rfiFieldLabel}>Priority</label>
                        <select
                          value={item.priority}
                          onChange={(e) => updateRFIItem(item.id, 'priority', e.target.value)}
                          style={styles.rfiSelect}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.footerInfo}>
            {rfiItems.length > 0 && (
              <span>{rfiItems.length} question(s) ready</span>
            )}
          </div>
          <div style={styles.footerButtons}>
            <button style={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            <button 
              style={{
                ...styles.generateButton,
                opacity: rfiItems.length === 0 ? 0.5 : 1
              }}
              onClick={generateRFI}
              disabled={rfiItems.length === 0}
            >
              <Download size={16} />
              Generate RFI PDF
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
    flexShrink: 0,
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
    padding: '20px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  projectInfoSection: {
    backgroundColor: '#252526',
    borderRadius: '8px',
    padding: '16px',
    flexShrink: 0,
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
  },
  projectInfoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  inputLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#9ea7b3',
    textTransform: 'uppercase',
  },
  input: {
    padding: '8px 12px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '13px',
  },
  mainLayout: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 400px',
    gap: '16px',
    overflow: 'hidden',
  },
  canvasSection: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0b0e11',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  canvasHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: '#1c2128',
    borderBottom: '1px solid #2d333b',
    fontSize: '13px',
    color: '#9ea7b3',
  },
  snippingBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: 'auto',
    padding: '4px 8px',
    backgroundColor: '#007BFF',
    borderRadius: '4px',
    fontSize: '11px',
    color: '#ffffff',
  },
  canvasContainer: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
  noImage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    color: '#6b7280',
    textAlign: 'center',
    padding: '40px',
  },
  rfiSection: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#252526',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  rfiHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #2d333b',
  },
  rfiTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: '#007BFF',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  },
  rfiList: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  },
  emptyRfi: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '40px 20px',
    color: '#9ea7b3',
    textAlign: 'center',
  },
  rfiItem: {
    backgroundColor: '#1c2128',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '12px',
  },
  rfiItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  rfiItemNumber: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#007BFF',
  },
  priorityBadge: {
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 600,
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  rfiItemActions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: '4px',
  },
  iconButton: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snipPreview: {
    marginBottom: '12px',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #2d333b',
  },
  snipImage: {
    width: '100%',
    display: 'block',
  },
  rfiField: {
    marginBottom: '10px',
  },
  rfiFieldLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    color: '#9ea7b3',
    marginBottom: '4px',
    textTransform: 'uppercase',
  },
  rfiInput: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '13px',
    boxSizing: 'border-box',
  },
  rfiTextarea: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '13px',
    resize: 'vertical',
    minHeight: '60px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  rfiSelect: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '13px',
    cursor: 'pointer',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderTop: '1px solid #2d333b',
    flexShrink: 0,
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
  generateButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: '#4ade80',
    border: 'none',
    borderRadius: '6px',
    color: '#0b0e11',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
};

export default RFITool;
