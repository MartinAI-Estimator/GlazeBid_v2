import React, { useState, useEffect } from 'react';
import { Check, X, Eye, ChevronDown, ChevronUp, AlertCircle, CheckCircle } from 'lucide-react';

/**
 * MarkupReviewPanel - Interactive panel to review and navigate AI-detected markups
 * 
 * Features:
 * - Lists all markups on current page with confidence indicators
 * - Click to navigate/zoom to markup location
 * - Quick approve/reject actions
 * - Color-coded confidence levels
 * - Collapsible for screen real estate
 */
const MarkupReviewPanel = ({ 
  pdfViewerRef,
  isVisible = true,
  onToggle
}) => {
  const [markups, setMarkups] = useState([]);
  const [aiPredictions, setAiPredictions] = useState({});
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Debug: Log on mount
  useEffect(() => {
    console.log('🎬 MarkupReviewPanel MOUNTED - pdfViewerRef:', !!pdfViewerRef, 'current:', !!pdfViewerRef?.current);
  }, []);
  
  // Refresh markups from PDFViewer periodically
  useEffect(() => {
    const updateMarkups = () => {
      if (pdfViewerRef?.current) {
        const currentMarkups = pdfViewerRef.current.getCurrentPageMarkups?.() || [];
        const predictions = pdfViewerRef.current.getAiPredictions?.() || {};
        
        // Debug log only when markups change
        if (currentMarkups.length !== markups.length) {
          console.log('📋 MarkupReviewPanel: Updated markups', currentMarkups.length, 'predictions:', Object.keys(predictions).length);
          console.log('   Markup IDs:', currentMarkups.map(m => m.id));
        }
        
        setMarkups(currentMarkups);
        setAiPredictions(predictions);
      } else {
        // Only log once when ref is not available
        if (markups.length === 0 && !pdfViewerRef?.current) {
          console.log('⏳ MarkupReviewPanel: Waiting for pdfViewerRef...');
        }
      }
    };
    
    // Initial load
    updateMarkups();
    
    // Poll for updates (markups can change from AI detection or user actions)
    const interval = setInterval(updateMarkups, 1000);
    return () => clearInterval(interval);
  }, [pdfViewerRef, refreshTrigger]);
  
  // Handle clicking on a markup to navigate to it
  const handleMarkupClick = (markup) => {
    console.log('🎯 MarkupReviewPanel: Clicked on markup', markup.id);
    setSelectedId(markup.id);
    
    if (pdfViewerRef?.current?.focusOnMarkup) {
      console.log('🎯 Calling focusOnMarkup...');
      pdfViewerRef.current.focusOnMarkup(markup.id);
    } else {
      console.warn('⚠️ pdfViewerRef.current.focusOnMarkup not available');
      console.log('   pdfViewerRef:', pdfViewerRef);
      console.log('   pdfViewerRef.current:', pdfViewerRef?.current);
      console.log('   Available methods:', pdfViewerRef?.current ? Object.keys(pdfViewerRef.current) : 'none');
    }
  };
  
  // Handle approving a markup
  const handleApprove = async (e, markupId) => {
    e.stopPropagation();
    if (pdfViewerRef?.current?.approveMarkup) {
      await pdfViewerRef.current.approveMarkup(markupId);
      setRefreshTrigger(prev => prev + 1);
    }
  };
  
  // Handle rejecting a markup
  const handleReject = async (e, markupId) => {
    e.stopPropagation();
    if (pdfViewerRef?.current?.rejectMarkup) {
      await pdfViewerRef.current.rejectMarkup(markupId, 'user_rejected');
      setRefreshTrigger(prev => prev + 1);
    }
  };
  
  // Get confidence color
  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.85) return '#4caf50'; // Green - very confident
    if (confidence >= 0.70) return '#2196f3'; // Blue - moderate
    if (confidence >= 0.50) return '#ffc107'; // Yellow - low
    return '#f44336'; // Red - very low
  };
  
  // Get confidence label
  const getConfidenceLabel = (confidence) => {
    if (confidence >= 0.85) return 'High';
    if (confidence >= 0.70) return 'Medium';
    if (confidence >= 0.50) return 'Low';
    return 'Review';
  };
  
  // Format markup display name
  const getMarkupDisplayName = (markup, index) => {
    const className = markup.class || 'Unknown';
    const mode = markup.mode || '';
    return `${className} ${mode} #${index + 1}`;
  };
  
  // Check if markup is AI-generated (needs review)
  const isAiGenerated = (markupId) => {
    return !!aiPredictions[markupId];
  };
  
  if (!isVisible) return null;
  
  // AI-generated markups that need review
  const aiMarkups = markups.filter(m => isAiGenerated(m.id));
  const userMarkups = markups.filter(m => !isAiGenerated(m.id));
  
  if (isCollapsed) {
    return (
      <div style={styles.collapsedPanel}>
        <button 
          onClick={() => setIsCollapsed(false)}
          style={styles.expandButton}
        >
          <ChevronDown size={16} />
          <span>Review ({aiMarkups.length})</span>
        </button>
      </div>
    );
  }
  
  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <Eye size={16} />
          <span>Markup Review</span>
          {aiMarkups.length > 0 && (
            <span style={styles.badge}>{aiMarkups.length}</span>
          )}
        </div>
        <button 
          onClick={() => setIsCollapsed(true)}
          style={styles.collapseButton}
        >
          <ChevronUp size={16} />
        </button>
      </div>
      
      {/* AI Predictions Section */}
      {aiMarkups.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <AlertCircle size={14} color="#ffc107" />
            <span>AI Predictions - Review Required</span>
          </div>
          <div style={styles.markupList}>
            {aiMarkups.map((markup, index) => {
              const confidence = markup.confidence || 0.5;
              const isSelected = selectedId === markup.id;
              
              return (
                <div
                  key={markup.id}
                  onClick={() => handleMarkupClick(markup)}
                  style={{
                    ...styles.markupItem,
                    backgroundColor: isSelected ? '#3a5871' : 'transparent',
                    borderLeft: `4px solid ${markup.color || getConfidenceColor(confidence)}`
                  }}
                >
                  {/* Markup Info */}
                  <div style={styles.markupInfo}>
                    <div style={styles.markupName}>
                      <div 
                        style={{
                          ...styles.colorDot,
                          backgroundColor: markup.color || '#888'
                        }}
                      />
                      {getMarkupDisplayName(markup, index)}
                    </div>
                    <div style={styles.markupMeta}>
                      <span 
                        style={{
                          ...styles.confidenceBadge,
                          backgroundColor: getConfidenceColor(confidence),
                        }}
                      >
                        {Math.round(confidence * 100)}% {getConfidenceLabel(confidence)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div style={styles.actions}>
                    <button
                      onClick={(e) => handleApprove(e, markup.id)}
                      style={styles.approveButton}
                      title="Approve markup"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={(e) => handleReject(e, markup.id)}
                      style={styles.rejectButton}
                      title="Reject markup"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* User Markups Section */}
      {userMarkups.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <CheckCircle size={14} color="#4caf50" />
            <span>Confirmed Markups</span>
          </div>
          <div style={styles.markupList}>
            {userMarkups.map((markup, index) => {
              const isSelected = selectedId === markup.id;
              
              return (
                <div
                  key={markup.id}
                  onClick={() => handleMarkupClick(markup)}
                  style={{
                    ...styles.markupItem,
                    backgroundColor: isSelected ? '#3a5871' : 'transparent',
                    borderLeft: `4px solid ${markup.color || '#4caf50'}`
                  }}
                >
                  <div style={styles.markupInfo}>
                    <div style={styles.markupName}>
                      <div 
                        style={{
                          ...styles.colorDot,
                          backgroundColor: markup.color || '#888'
                        }}
                      />
                      {getMarkupDisplayName(markup, index)}
                    </div>
                    {markup.value && (
                      <div style={styles.markupValue}>
                        {markup.value} {markup.mode === 'Count' ? 'EA' : markup.mode === 'Area' ? 'SF' : 'LF'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {markups.length === 0 && (
        <div style={styles.emptyState}>
          <AlertCircle size={24} color="#666" />
          <p>No markups on this page</p>
          <p style={styles.emptyHint}>AI detections will appear here for review</p>
        </div>
      )}
      
      {/* Quick Stats Footer */}
      <div style={styles.footer}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{aiMarkups.length}</span>
          <span style={styles.statLabel}>To Review</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{userMarkups.length}</span>
          <span style={styles.statLabel}>Confirmed</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{markups.length}</span>
          <span style={styles.statLabel}>Total</span>
        </div>
      </div>
    </div>
  );
};

const styles = {
  panel: {
    width: '280px',
    backgroundColor: '#1e2a38',
    borderLeft: '1px solid #3a4a5a',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  collapsedPanel: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    zIndex: 100,
  },
  expandButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: '#1e2a38',
    border: '1px solid #3a4a5a',
    borderRadius: '6px',
    color: 'white',
    fontSize: '12px',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #3a4a5a',
    backgroundColor: '#2a3a4a',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#f44336',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 'bold',
  },
  collapseButton: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    padding: '4px',
  },
  section: {
    borderBottom: '1px solid #3a4a5a',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: '#253545',
    color: '#aaa',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  markupList: {
    maxHeight: '300px',
    overflowY: 'auto',
  },
  markupItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    borderBottom: '1px solid #2a3a4a',
  },
  markupInfo: {
    flex: 1,
    minWidth: 0,
  },
  markupName: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '500',
  },
  colorDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  markupMeta: {
    marginTop: '4px',
    marginLeft: '18px',
  },
  markupValue: {
    marginTop: '2px',
    marginLeft: '18px',
    color: '#888',
    fontSize: '11px',
  },
  confidenceBadge: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    color: 'white',
    fontSize: '10px',
    fontWeight: '600',
  },
  actions: {
    display: 'flex',
    gap: '4px',
    marginLeft: '8px',
  },
  approveButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    backgroundColor: '#2e7d32',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  rejectButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    backgroundColor: '#c62828',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    color: '#888',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: '11px',
    color: '#666',
    marginTop: '4px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '12px',
    backgroundColor: '#253545',
    borderTop: '1px solid #3a4a5a',
    marginTop: 'auto',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: {
    color: 'white',
    fontSize: '18px',
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: '10px',
    textTransform: 'uppercase',
  },
};

export default MarkupReviewPanel;
