import React, { useState, useCallback } from 'react';
import { Brain, Sparkles, Zap, CheckCircle, XCircle, Loader2, Info, PlusCircle } from 'lucide-react';
import { GLAZING_CLASSES } from './constants';

/**
 * AIAutomationButton Component
 * 
 * Provides AI-powered autonomous takeoff functionality:
 * 1. Ghost Detection - AI identifies glazing systems on the drawing
 * 2. Auto-Markup Creation - Converts ghosts to actual markups with class colors
 * 3. Learning Integration - User corrections improve AI over time
 */

// Map AI detection types to GLAZING_CLASSES names
const AI_TYPE_TO_CLASS = {
  'storefront': 'STOREFRONT',
  'curtain_wall': 'CURTAIN WALL',
  'window_wall': 'WINDOW WALL',
  'punched_opening': 'FIXED WINDOW_OPERABLE WINDOW',
  'window': 'FIXED WINDOW_OPERABLE WINDOW',
  'door': 'DOOR_ALUMINUM',
  'all_glass_door': 'ALL GLASS DOOR',
  'interior_storefront': 'INTERIOR STOREFRONT',
  'skylight': 'SKYLIGHT',
  'glass_handrail': 'GLASS HANDRAIL'
};

const AIAutomationButton = ({ 
  projectName, 
  currentSheet,
  currentPageNum = 1,
  entities = [], 
  onGhostsDetected, 
  onAutonomousComplete,
  onRecordCorrection,
  onAddMarkups,  // Callback to add markups to the PDFViewer
  onFocusGhost  // Callback to focus/zoom to a ghost on the drawing
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [ghosts, setGhosts] = useState([]);
  const [learningStats, setLearningStats] = useState(null);
  const [takeoffResults, setTakeoffResults] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // info, success, error
  const [hasRunDetection, setHasRunDetection] = useState(false); // Only allow detection once per project

  const API_BASE = 'http://127.0.0.1:8000';

  // Fetch learning stats on mount
  React.useEffect(() => {
    fetchLearningStats();
  }, []);

  const fetchLearningStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ai/learning-stats`);
      if (response.ok) {
        const data = await response.json();
        setLearningStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch learning stats:', error);
    }
  }, []);

  /**
   * Run Ghost Detection - AI identifies glazing systems (SINGLE PAGE)
   */
  const runGhostDetection = async () => {
    setIsLoading(true);
    setMessage('');
    
    console.log('🤖 Starting AI ghost detection (single page)...', { projectName, currentSheet, currentPageNum });
    
    try {
      const response = await fetch(`${API_BASE}/api/ai/ghost-detection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: projectName || '',
          sheet_id: currentSheet || '',
          page_num: currentPageNum || 1
        })
      });

      const data = await response.json();
      console.log('🤖 AI detection response:', data);
      
      if (data.ghosts && data.ghosts.length > 0) {
        // Include PDF dimensions with ghosts for coordinate alignment
        const ghostsWithMeta = data.ghosts.map(g => ({
          ...g,
          pdf_dimensions: data.pdf_dimensions
        }));
        ghostsWithMeta.pdf_dimensions = data.pdf_dimensions;
        
        setGhosts(ghostsWithMeta);
        setMessage(`✨ Found ${data.ghosts.length} glazing systems`);
        setMessageType('success');
        
        // Log coordinate info for debugging
        if (data.pdf_dimensions) {
          console.log(`📐 Backend PDF dimensions: ${data.pdf_dimensions.width} x ${data.pdf_dimensions.height}`);
        }
        if (data.ghosts[0]?.bbox) {
          console.log(`📐 First ghost bbox: x=${data.ghosts[0].bbox.x}, y=${data.ghosts[0].bbox.y}, w=${data.ghosts[0].bbox.width}, h=${data.ghosts[0].bbox.height}`);
        }
        
        if (onGhostsDetected) {
          onGhostsDetected(ghostsWithMeta);
        }
      } else {
        setMessage('No glazing systems detected on this sheet');
        setMessageType('info');
      }
    } catch (error) {
      console.error('Ghost detection failed:', error);
      setMessage(`Error: ${error.message}`);
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Run BATCH Ghost Detection - Scan ALL pages in drawing set
   * This is how a real estimator works - they look at the ENTIRE set!
   */
  const runBatchGhostDetection = async () => {
    setIsLoading(true);
    setMessage('Scanning all pages...');
    
    console.log('🔬 Starting BATCH AI ghost detection...', { projectName, currentSheet });
    
    try {
      const response = await fetch(`${API_BASE}/api/ai/batch-ghost-detection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: projectName || '',
          sheet_id: currentSheet || '',
          max_pages: 20
        })
      });

      const data = await response.json();
      console.log('🔬 Batch detection response:', data);
      
      if (data.total_ghosts > 0) {
        // Flatten all ghosts from all pages, but track which page they came from
        const allGhosts = [];
        for (const [pageNum, pageGhosts] of Object.entries(data.ghosts_by_page)) {
          for (const ghost of pageGhosts) {
            allGhosts.push({
              ...ghost,
              page_num: parseInt(pageNum),
              pdf_dimensions: data.pdf_dimensions
            });
          }
        }
        
        // Show ghosts for current page
        const currentPageGhosts = allGhosts.filter(g => g.page_num === currentPageNum);
        
        setGhosts(allGhosts);
        setMessage(`✨ Found ${data.total_ghosts} glazing systems across ${data.pages_scanned} pages (${currentPageGhosts.length} on this page)`);
        setMessageType('success');
        
        // Pass ALL ghosts to PDFViewer - it will filter by current page
        // This allows page navigation to show ghosts on other pages too
        if (onGhostsDetected) {
          onGhostsDetected(allGhosts);
        }
        
        // Mark detection as complete - only allow once per project
        setHasRunDetection(true);
        
        console.log(`📊 Batch scan complete: ${data.total_ghosts} total, ${currentPageGhosts.length} on page ${currentPageNum}`);
      } else {
        setMessage('No glazing systems detected in drawing set');
        setMessageType('info');
      }
    } catch (error) {
      console.error('Batch ghost detection failed:', error);
      setMessage(`Error: ${error.message}`);
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Run Autonomous Takeoff - Full 7-stage automation pipeline
   */
  const runAutonomousTakeoff = async () => {
    setIsProcessing(true);
    setMessage('');
    
    // Get current entities from props or use existing ghosts
    const entitiesToProcess = entities.length > 0 ? entities : ghosts.map(g => ({
      id: g.id,
      type: g.type,
      width: g.bbox.width,
      height: g.bbox.height,
      sheet_name: currentSheet,
      points: [[g.bbox.x, g.bbox.y], [g.bbox.x + g.bbox.width, g.bbox.y + g.bbox.height]]
    }));
    
    if (entitiesToProcess.length === 0) {
      setMessage('No entities to process. Run ghost detection first or add markups.');
      setMessageType('info');
      setIsProcessing(false);
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/ai/autonomous-takeoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: projectName || 'Untitled Project',
          entities: entitiesToProcess,
          include_pricing: true,
          export_formats: ['json']
        })
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        setTakeoffResults(data.results);
        const totals = data.results.project_totals || {};
        setMessage(`✅ Takeoff Complete: ${totals.total_glass_area_sf?.toFixed(1) || 0} SF, $${totals.estimated_total_cost?.toLocaleString() || 0}`);
        setMessageType('success');
        
        if (onAutonomousComplete) {
          onAutonomousComplete(data.results);
        }
        
        // Refresh learning stats
        fetchLearningStats();
      } else {
        setMessage(`Warning: ${data.message || 'Takeoff completed with issues'}`);
        setMessageType('info');
      }
    } catch (error) {
      console.error('Autonomous takeoff failed:', error);
      setMessage(`Error: ${error.message}`);
      setMessageType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Convert a ghost detection to a proper markup object
   * Uses the same structure as user-created markups so they can be:
   * - Edited (move, resize, adjust points)
   * - Class changed
   * - Sent to structural calculator
   * 
   * Markup mode is determined by AI based on sheet type:
   * - Floor Plans (A-1xx): Polyline for linear feet
   * - Elevations (A-2xx): Area for square feet
   * - Details/Schedules: Highlight for informational only
   */
  const ghostToMarkup = (ghost) => {
    const className = AI_TYPE_TO_CLASS[ghost.type] || 'STOREFRONT';
    const classConfig = GLAZING_CLASSES[className] || GLAZING_CLASSES['STOREFRONT'];
    
    // Use markup tool from AI if provided, otherwise default to Area
    // AI sets this based on sheet type (floor plan = polyline, elevation = area, etc.)
    const markupMode = ghost.markup_tool ? 
      ghost.markup_tool.charAt(0).toUpperCase() + ghost.markup_tool.slice(1) : 
      'Area';
    
    // For polylines, create a perimeter path. For area/highlight, create rectangle.
    let points;
    if (markupMode === 'Polyline') {
      // Polyline traces the perimeter for linear foot measurement
      points = [
        { x: ghost.bbox.x, y: ghost.bbox.y },
        { x: ghost.bbox.x + ghost.bbox.width, y: ghost.bbox.y },
        { x: ghost.bbox.x + ghost.bbox.width, y: ghost.bbox.y + ghost.bbox.height },
        { x: ghost.bbox.x, y: ghost.bbox.y + ghost.bbox.height },
        { x: ghost.bbox.x, y: ghost.bbox.y }  // Close the path
      ];
    } else {
      // Area/Highlight uses 4-point rectangle
      points = [
        { x: ghost.bbox.x, y: ghost.bbox.y },
        { x: ghost.bbox.x + ghost.bbox.width, y: ghost.bbox.y },
        { x: ghost.bbox.x + ghost.bbox.width, y: ghost.bbox.y + ghost.bbox.height },
        { x: ghost.bbox.x, y: ghost.bbox.y + ghost.bbox.height }
      ];
    }
    
    return {
      id: `ai_${ghost.id}_${Date.now()}`,
      mode: markupMode,  // 'Area', 'Polyline', or 'Highlight'
      class: className,
      color: classConfig.color,
      points: points,
      pageNum: currentPageNum,
      source: 'ai_detection',
      confidence: ghost.confidence,
      aiType: ghost.type,
      frameDesignation: ghost.frame_designation || ghost.tag_id || '',  // Frame designation from AI (e.g., "A", "F", "B")
      area_sf: ghost.area_sf,
      measurement_type: ghost.measurement_type || 'sqft',
      suggested_product: ghost.suggested_product,  // From glazing library
      alternatives: ghost.alternatives,  // Alternative products
      timestamp: new Date().toISOString()
    };
  };

  /**
   * Promote a ghost detection to final takeoff - Creates actual markup
   */
  const promoteGhost = async (ghostId) => {
    const ghost = ghosts.find(g => g.id === ghostId);
    if (!ghost) return;
    
    try {
      // Create markup from ghost
      const markup = ghostToMarkup(ghost);
      
      // Add to PDFViewer via callback
      if (onAddMarkups) {
        onAddMarkups([markup]);
      }
      
      // Notify backend for learning
      const response = await fetch(`${API_BASE}/api/ai/promote-ghost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghost_id: ghostId })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setGhosts(prev => prev.map(g => 
          g.id === ghostId ? { ...g, status: 'accepted' } : g
        ));
        setMessage(`✅ Created ${AI_TYPE_TO_CLASS[ghost.type] || ghost.type} markup`);
        setMessageType('success');
        fetchLearningStats();
      }
    } catch (error) {
      console.error('Failed to promote ghost:', error);
    }
  };

  /**
   * Promote ALL pending ghosts at once - Creates markups for all
   */
  const promoteAllGhosts = async () => {
    const pendingGhosts = ghosts.filter(g => g.status === 'pending');
    if (pendingGhosts.length === 0) {
      setMessage('No pending detections to promote');
      setMessageType('info');
      return;
    }
    
    // Convert all ghosts to markups
    const markups = pendingGhosts.map(ghostToMarkup);
    
    // Add all to PDFViewer
    if (onAddMarkups) {
      onAddMarkups(markups);
    }
    
    
  /**
   * Focus on a ghost detection - zoom and pan to its location on the drawing
   */
  const focusOnGhost = (ghost) => {
    if (onFocusGhost && ghost.bbox) {
      // Create a temporary markup-like object for focusOnMarkup
      const tempMarkup = {
        id: ghost.id,
        points: [
          { x: ghost.bbox.x, y: ghost.bbox.y },
          { x: ghost.bbox.x + ghost.bbox.width, y: ghost.bbox.y },
          { x: ghost.bbox.x + ghost.bbox.width, y: ghost.bbox.y + ghost.bbox.height },
          { x: ghost.bbox.x, y: ghost.bbox.y + ghost.bbox.height }
        ]
      };
      onFocusGhost(tempMarkup.id, tempMarkup);
    }
  };

  // Update all ghost statuses
    setGhosts(prev => prev.map(g => 
      g.status === 'pending' ? { ...g, status: 'accepted' } : g
    ));
    
    // Record learning for each
    for (const ghost of pendingGhosts) {
      try {
        await fetch(`${API_BASE}/api/ai/promote-ghost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ghost_id: ghost.id })
        });
      } catch (e) {
        console.error('Failed to record promotion:', e);
      }
    }
    
    setMessage(`✅ Created ${markups.length} markups from AI detections`);
    setMessageType('success');
    fetchLearningStats();
  };

  /**
   * Reject a ghost detection with learning
   */
  const rejectGhost = async (ghostId, reason = 'incorrect') => {
    try {
      const response = await fetch(`${API_BASE}/api/ai/reject-ghost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ghost_id: ghostId,
          reason: reason,
          correct_type: ''
        })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setGhosts(prev => prev.filter(g => g.id !== ghostId));
        setMessage(`❌ Rejected ${ghostId} - AI will learn from this`);
        setMessageType('info');
        fetchLearningStats();
      }
    } catch (error) {
      console.error('Failed to reject ghost:', error);
    }
  };

  const styles = {
    container: {
      margin: '10px',
      borderRadius: '8px',
      backgroundColor: '#1a2634',
      border: '1px solid #3a5871',
      overflow: 'hidden'
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px',
      backgroundColor: '#2c3e50',
      borderBottom: '1px solid #3a5871',
      cursor: 'pointer'
    },
    headerTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#00d4ff',
      fontWeight: 'bold',
      fontSize: '13px'
    },
    badge: {
      backgroundColor: '#00d4ff',
      color: '#000',
      padding: '2px 6px',
      borderRadius: '10px',
      fontSize: '9px',
      fontWeight: 'bold'
    },
    content: {
      padding: '12px',
      display: showPanel ? 'block' : 'none'
    },
    button: (isPrimary, isDisabled) => ({
      width: '100%',
      padding: '12px',
      marginBottom: '8px',
      border: 'none',
      borderRadius: '6px',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontSize: '12px',
      fontWeight: 'bold',
      backgroundColor: isDisabled ? '#3a5871' : isPrimary ? '#00d4ff' : '#4a6785',
      color: isPrimary && !isDisabled ? '#000' : '#fff',
      opacity: isDisabled ? 0.6 : 1,
      transition: 'all 0.2s'
    }),
    message: (type) => ({
      padding: '10px',
      marginBottom: '10px',
      borderRadius: '4px',
      fontSize: '11px',
      backgroundColor: type === 'success' ? 'rgba(0, 212, 255, 0.15)' : 
                       type === 'error' ? 'rgba(255, 68, 68, 0.15)' : 
                       'rgba(255, 255, 255, 0.1)',
      color: type === 'success' ? '#00d4ff' : 
             type === 'error' ? '#ff4444' : 
             '#ccc',
      border: `1px solid ${type === 'success' ? '#00d4ff' : type === 'error' ? '#ff4444' : '#555'}`
    }),
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
      marginTop: '10px'
    },
    statBox: {
      backgroundColor: '#2c3e50',
      padding: '10px',
      borderRadius: '4px',
      textAlign: 'center'
    },
    statValue: {
      color: '#00d4ff',
      fontSize: '18px',
      fontWeight: 'bold'
    },
    statLabel: {
      color: '#95a5a6',
      fontSize: '9px',
      marginTop: '4px'
    },
    ghostItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px',
      marginBottom: '4px',
      backgroundColor: '#2c3e50',
      borderRadius: '4px',
      borderLeft: '3px solid'
    },
    ghostActions: {
      display: 'flex',
      gap: '4px'
    },
    iconButton: (color) => ({
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: color,
      padding: '4px',
      borderRadius: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    })
  };

  const getGhostColor = (type) => {
    // Colors matching backend UPPERCASE class names
    const colors = {
      // Backend uses UPPERCASE class names
      'STOREFRONT': '#FF6B35',              // Orange
      'CURTAIN WALL': '#228B22',            // Forest Green
      'WINDOW WALL': '#0000FF',             // Blue
      'INTERIOR STOREFRONT': '#FFA500',     // Orange (lighter)
      'INTERIOR CURTAIN WALL': '#2E8B57',   // Sea Green
      'DOOR_ALUMINUM': '#00FF00',           // Lime Green
      'ALL GLASS DOOR': '#00FFFF',          // Cyan
      'FIXED WINDOW_OPERABLE WINDOW': '#6495ED', // Cornflower Blue
      'TRANSACTION WINDOW': '#FF1493',      // Deep Pink
      'BRAKE METAL': '#808080',             // Gray
      'FIRE RATED FRAMING': '#FF0000',      // Red
      'SKYLIGHT': '#4B0082',                // Indigo
      // Legacy lowercase (for compatibility)
      'door': '#00FF00',
      'window': '#6495ED',
      'storefront': '#FF6B35',
      'curtainwall': '#228B22',
      'skylight': '#4B0082',
      'entrance': '#00FF00',
      'curtain_wall': '#228B22',
      'window_wall': '#0000FF',
    };
    // Try direct lookup, then uppercase
    const upperType = type?.toUpperCase() || '';
    return colors[type] || colors[upperType] || '#888';
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div 
        style={styles.header}
        onClick={() => setShowPanel(!showPanel)}
      >
        <div style={styles.headerTitle}>
          <Brain size={18} />
          AI AUTOMATION
          <span style={styles.badge}>AIQ</span>
        </div>
        <span style={{ color: '#95a5a6' }}>
          {showPanel ? '▼' : '▶'}
        </span>
      </div>

      {/* Content Panel */}
      <div style={styles.content}>
        {/* Message Display */}
        {message && (
          <div style={styles.message(messageType)}>
            {message}
          </div>
        )}

        {/* AI Detection Button - Runs once per project */}
        {hasRunDetection ? (
          <div style={{
            padding: '12px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0, 212, 255, 0.1)',
            border: '1px solid #00d4ff',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#00d4ff', fontWeight: 'bold', fontSize: '12px' }}>
              <CheckCircle size={16} />
              AI DETECTION COMPLETE
            </div>
            <div style={{ color: '#9ea7b3', fontSize: '10px', marginTop: '4px' }}>
              {ghosts.length} systems detected across drawing set
            </div>
          </div>
        ) : (
          <button
            style={{
              width: '100%',
              padding: '14px',
              border: 'none',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '12px',
              fontWeight: 'bold',
              background: isLoading ? 'linear-gradient(135deg, #2c3e50, #1a252f)' : 'linear-gradient(135deg, #007BFF, #0056b3)',
              color: '#fff',
              opacity: isLoading ? 0.7 : 1,
              transition: 'all 0.2s',
              boxShadow: isLoading ? 'none' : '0 2px 8px rgba(0, 123, 255, 0.3)'
            }}
            onClick={runBatchGhostDetection}
            disabled={isLoading}
            title="Scan all pages in the drawing set to detect glazing systems"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="spin" />
                Scanning Drawing Set...
              </>
            ) : (
              <>
                <Zap size={16} />
                RUN AI DETECTION
              </>
            )}
          </button>
        )}

        {/* Ghost Detections List */}
        {ghosts.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ color: '#95a5a6', fontSize: '10px' }}>
                DETECTED SYSTEMS ({ghosts.filter(g => g.status === 'pending').length} pending)
              </span>
              {ghosts.filter(g => g.status === 'pending').length > 0 && (
                <button
                  onClick={promoteAllGhosts}
                  style={{
                    background: 'linear-gradient(135deg, #4caf50, #45a049)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <PlusCircle size={12} />
                  ACCEPT ALL
                </button>
              )}
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {ghosts.filter(g => g.status === 'pending').map(ghost => (
                <div 
                  key={ghost.id} 
                  onClick={() => onFocusGhost && onFocusGhost(ghost)}
                    style={{ 
                      ...styles.ghostItem, 
                      borderLeftColor: getGhostColor(ghost.type),
                      cursor: 'pointer'
                    }}
                    title="Click to view on drawing"
                >
                  <div>
                    <div style={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}>
                      {ghost.type?.toUpperCase().replace('_', ' ')}
                    </div>
                    <div style={{ color: '#95a5a6', fontSize: '9px' }}>
                      {ghost.area_sf?.toFixed(1)} SF • {(ghost.confidence * 100).toFixed(0)}% conf
                    </div>
                  </div>
                  <div style={styles.ghostActions}>
                    <button 
                      style={styles.iconButton('#4caf50')}
                      onClick={() => promoteGhost(ghost.id)}
                      title="Accept"
                    >
                      <CheckCircle size={18} />
                    </button>
                    <button 
                      style={styles.iconButton('#ff4444')}
                      onClick={() => rejectGhost(ghost.id)}
                      title="Reject"
                    >
                      <XCircle size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Learning Stats */}
        {learningStats && (
          <div style={styles.statsGrid}>
            <div style={styles.statBox}>
              <div style={styles.statValue}>
                {learningStats.ai_brain?.performance_metrics?.ghost_accuracy?.rate 
                  ? `${(learningStats.ai_brain.performance_metrics.ghost_accuracy.rate * 100).toFixed(0)}%` 
                  : '—'}
              </div>
              <div style={styles.statLabel}>ACCURACY</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>
                {learningStats.ai_brain?.learning_stats?.total_corrections || 0}
              </div>
              <div style={styles.statLabel}>CORRECTIONS</div>
            </div>
          </div>
        )}

        {/* Takeoff Results Summary */}
        {takeoffResults && (
          <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#2c3e50', borderRadius: '4px' }}>
            <div style={{ color: '#00d4ff', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>
              TAKEOFF RESULTS
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: '#95a5a6' }}>Total Glass:</span>
              <span style={{ color: '#fff' }}>{takeoffResults.project_totals?.total_glass_area_sf?.toFixed(1) || 0} SF</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: '#95a5a6' }}>Groups:</span>
              <span style={{ color: '#fff' }}>{takeoffResults.groups?.length || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: '#95a5a6' }}>Est. Cost:</span>
              <span style={{ color: '#4caf50', fontWeight: 'bold' }}>
                ${takeoffResults.project_totals?.estimated_total_cost?.toLocaleString() || 0}
              </span>
            </div>
          </div>
        )}

        {/* Info Footer */}
        <div style={{ marginTop: '12px', padding: '8px', backgroundColor: 'rgba(0, 212, 255, 0.1)', borderRadius: '4px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <Info size={14} style={{ color: '#00d4ff', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ color: '#95a5a6', fontSize: '9px', lineHeight: '1.4' }}>
            AI learns from your corrections. Accept or reject detections to improve accuracy over time.
          </div>
        </div>
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default AIAutomationButton;





