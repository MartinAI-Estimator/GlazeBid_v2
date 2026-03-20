import { useState, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../utils/constants';

const useGhostLayer = (project, sheetId, pageNum, onMarkupCreated) => {
  const [ghosts, setGhosts] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const sessionIdRef = useRef(`${project}_${sheetId}_${pageNum}`);

  // 1. The Trigger: AI searches when you finish drawing an Anchor
  const requestGhosts = useCallback(async (anchorMarkup, pageImageBase64) => {
    if (!anchorMarkup || anchorMarkup.mode === 'Count') return; // Skip counts for now

    setIsSearching(true);
    try {
      const response = await fetch(API_ENDPOINTS.GHOST_SUGGEST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          // Backend expects image_base64 instead of page_image_base64
          image_base64: pageImageBase64,  
          scales: [0.8, 1.0, 1.2],        
          // Send anchor bounding box
          anchor_bbox: {
             x: Math.min(...anchorMarkup.points.map(p => p.x)), 
             y: Math.min(...anchorMarkup.points.map(p => p.y)),
             width: Math.max(...anchorMarkup.points.map(p => p.x)) - Math.min(...anchorMarkup.points.map(p => p.x)), 
             height: Math.max(...anchorMarkup.points.map(p => p.y)) - Math.min(...anchorMarkup.points.map(p => p.y))
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Enforce Strict Inheritance: Ghosts must match Anchor's styling
        const styledGhosts = data.ghosts.map(g => ({
          ...g,
          mode: anchorMarkup.mode,
          color: anchorMarkup.color, // Inherit color
          label: anchorMarkup.label, // Inherit label (e.g. "W1")
          layer: 'ghost'
        }));
        setGhosts(styledGhosts);
      }
    } catch (err) {
      console.error("AI Search Failed:", err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 2. The Acceptance: Convert Ghost -> Real Markup
  const acceptGhost = useCallback((ghost) => {
    // Remove from Ghost layer
    setGhosts(prev => prev.filter(g => g.id !== ghost.id));

    // Create Real Markup object
    const newMarkup = {
      ...ghost,
      id: `m_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      layer: 'markup',
      is_ghost: false,
      pageNumber: pageNum
    };

    // Send to Parent (to save in DB)
    onMarkupCreated(newMarkup);

    // Train the AI (Background)
    fetch(API_ENDPOINTS.GHOST_ACCEPT, {
      method: 'POST',
      body: JSON.stringify({ ghost_id: ghost.id, session_id: sessionIdRef.current })
    });
  }, [onMarkupCreated]);

  // 3. The Rejection: Remove & Train
  const rejectGhost = useCallback((ghost) => {
    setGhosts(prev => prev.filter(g => g.id !== ghost.id));

    fetch(API_ENDPOINTS.GHOST_REJECT, {
      method: 'POST',
      body: JSON.stringify({ ghost_id: ghost.id, session_id: sessionIdRef.current })
    });
  }, []);

  return { ghosts, isSearching, requestGhosts, acceptGhost, rejectGhost, setGhosts };
};

export default useGhostLayer;
