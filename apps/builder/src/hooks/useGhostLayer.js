/**
 * useGhostLayer.js
 * 
 * Custom hook for Smart Guide (Ghost Highlighter) state management.
 * 
 * RESPONSIBILITIES:
 * - Fetch ghost suggestions from backend when user creates markup
 * - Manage ghost display state (show/hide, active anchor)
 * - Handle accept/deny actions (convert ghost → real markup)
 * - Track Smart Guide enabled/disabled state
 * - Session management and cleanup
 * 
 * STRATEGIC CONSTRAINTS:
 * 1. Strict Type Inheritance: Ghosts match anchor mode exactly
 * 2. Current Page Only: No cross-page scanning
 * 3. Auto-Label Grouping: All ghosts inherit anchor's frameDesignation
 * 4. User-Driven Class: Ghosts inherit anchor's class (no AI guessing)
 * 5. Active Selection Only: Only show ghosts for most recent markup
 * 
 * USAGE:
 * const {
 *   smartGuideEnabled,
 *   toggleSmartGuide,
 *   ghostMarkups,
 *   requestGhosts,
 *   approveGhost,
 *   denyGhost,
 *   clearGhosts
 * } = useGhostLayer({ project, sheetId, pageNum, onMarkupCreated });
 */

import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '../apiClient';

const useGhostLayer = ({
  project,
  sheetId,
  pageNum,
  canvasRef,  // Reference to PDF canvas for image capture
  onMarkupCreated  // Callback when ghost is approved
}) => {
  // Smart Guide state
  const [smartGuideEnabled, setSmartGuideEnabled] = useState(false);
  const [ghostMarkups, setGhostMarkups] = useState([]);
  const [activeAnchorId, setActiveAnchorId] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStats, setSearchStats] = useState(null);
  
  // Session management - handle undefined values gracefully
  const sessionIdRef = useRef(`${project || 'unknown'}_${sheetId || 'unknown'}_page_${pageNum || 0}`);
  
  /**
   * Toggle Smart Guide on/off
   */
  const toggleSmartGuide = useCallback((enabled) => {
    setSmartGuideEnabled(enabled);
    
    // Clear ghosts when disabled
    if (!enabled) {
      setGhostMarkups([]);
      setActiveAnchorId(null);
    }
    
    console.log(enabled ? '✨ Smart Guide Enabled' : '⏹️  Smart Guide Disabled');
  }, []);
  
  /**
   * Capture current page as base64 image
   */
  const capturePageImage = useCallback(async () => {
    if (!canvasRef || !canvasRef.current) {
      throw new Error('Canvas reference not available');
    }
    
    // Convert canvas to blob, then to base64
    return new Promise((resolve) => {
      canvasRef.current.toBlob((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result);  // data:image/jpeg;base64,...
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.85);
    });
  }, [canvasRef]);
  
  /**
   * Request ghost suggestions for an anchor markup
   * 
   * @param {Object} anchorMarkup - The markup object that triggered the search
   * @returns {Promise<Array>} - Array of ghost markup objects
   */
  const requestGhosts = useCallback(async (anchorMarkup) => {
    if (!smartGuideEnabled) {
      return [];
    }
    
    // Validate we have required context
    if (!project || !sheetId || pageNum === undefined || pageNum === null) {
      console.warn('Smart Guide: Missing project/sheet/page context, skipping');
      return [];
    }
    
    // Validate anchor has required fields
    const requiredFields = ['id', 'mode', 'class', 'frameDesignation', 'points', 'color', 'pageNum'];
    for (const field of requiredFields) {
      if (!(field in anchorMarkup)) {
        console.error(`Smart Guide: Anchor missing field '${field}'`);
        return [];
      }
    }
    
    // Don't suggest for Count mode (no duplicates needed)
    if (anchorMarkup.mode === 'Count') {
      console.log('Smart Guide: Skipping Count mode (no auto-duplication)');
      return [];
    }
    
    setIsSearching(true);
    setActiveAnchorId(anchorMarkup.id);
    
    try {
      console.log(`🔍 Smart Guide: Searching for similar ${anchorMarkup.mode} markups...`);
      
      // Capture current page image
      const pageImageBase64 = await capturePageImage();
      
      // Call backend Smart Guide API
      const response = await apiFetch('/api/ghost/live-suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          anchor_markup: anchorMarkup,
          page_image_base64: pageImageBase64,
          search_scope: 'current_page'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Smart Guide API error');
      }
      
      const data = await response.json();
      
      // Update state
      setGhostMarkups(data.ghosts || []);
      setSearchStats({
        count: data.ghosts?.length || 0,
        time_ms: data.search_time_ms || 0,
        anchor_id: data.anchor_id
      });
      
      console.log(`✨ Smart Guide: Found ${data.ghosts.length} suggestions in ${data.search_time_ms}ms`);
      
      return data.ghosts || [];
    } catch (error) {
      console.error('Smart Guide error:', error);
      setGhostMarkups([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [smartGuideEnabled, capturePageImage, project, sheetId, pageNum]);
  
  /**
   * Approve a ghost - converts it to a real markup
   * 
   * @param {Object} ghost - Ghost markup object to approve
   * @returns {Object} - Converted real markup object
   */
  const approveGhost = useCallback((ghost) => {
    // Convert ghost to real markup
    const realMarkup = {
      ...ghost,
      id: `${ghost.mode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      is_ghost: false,  // No longer a ghost
      approved_at: new Date().toISOString(),
      timestamp: new Date().toISOString()
    };
    
    // Remove the ghost from display
    setGhostMarkups(prev => prev.filter(g => g.id !== ghost.id));
    
    // Log to learning loop
    try {
      apiFetch('/api/ghost/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          ghost_id: ghost.id,
          embedding_base64: ''  // Optional: store embedding for retraining
        })
      });
    } catch (err) {
      console.warn('Failed to log ghost acceptance:', err);
    }
    
    // Notify parent component to save the markup
    if (onMarkupCreated) {
      onMarkupCreated(realMarkup);
    }
    
    console.log(`✅ Ghost approved: ${ghost.id} → ${realMarkup.id}`);
    
    return realMarkup;
  }, [onMarkupCreated]);
  
  /**
   * Deny a ghost - removes it from display and logs rejection
   * 
   * @param {Object} ghost - Ghost markup object to deny
   */
  const denyGhost = useCallback((ghost) => {
    // Remove from display
    setGhostMarkups(prev => prev.filter(g => g.id !== ghost.id));
    
    // Log rejection to learning loop (adjusts threshold)
    try {
      apiFetch('/api/ghost/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          ghost_id: ghost.id,
          embedding_base64: ''  // Optional: store for hard negative training
        })
      });
    } catch (err) {
      console.warn('Failed to log ghost rejection:', err);
    }
    
    console.log(`❌ Ghost denied: ${ghost.id}`);
  }, []);
  
  /**
   * Clear all ghosts from display
   */
  const clearGhosts = useCallback(() => {
    setGhostMarkups([]);
    setActiveAnchorId(null);
    setSearchStats(null);
  }, []);
  
  /**
   * End session and cleanup
   */
  const endSession = useCallback(async () => {
    try {
      await apiFetch(`/api/ghost/session?session_id=${sessionIdRef.current}`, {
        method: 'DELETE'
      });
      console.log('🧹 Smart Guide session ended');
    } catch (err) {
      console.warn('Failed to end Smart Guide session:', err);
    }
    
    clearGhosts();
  }, [clearGhosts]);
  
  return {
    // State
    smartGuideEnabled,
    ghostMarkups,
    activeAnchorId,
    isSearching,
    searchStats,
    
    // Actions
    toggleSmartGuide,
    requestGhosts,
    approveGhost,
    denyGhost,
    clearGhosts,
    endSession
  };
};

export default useGhostLayer;
