import { useState, useEffect, useRef } from 'react';
import { ZOOM_CONFIG, ANIMATION } from '../utils/constants';

/**
 * useZoomPan - RAF-based smooth zoom and pan gestures
 * 
 * Responsibilities:
 * - Handle mouse wheel zoom with zoom-to-mouse behavior
 * - Handle pan gestures (drag with mouse)
 * - Manage zoom controls (zoomIn, zoomOut, zoomFit)
 * - RAF (RequestAnimationFrame) for 60fps smooth transforms
 * - Sync RAF transforms to React state after gesture ends
 * - Keyboard shortcuts (Space for pan, +/- for zoom)
 * 
 * Architecture:
 * - transformRef holds live values (updated at 60fps)
 * - React state syncs after 300ms debounce
 * - This prevents React re-renders during gestures (smooth!)
 * 
 * @param {Object} params
 * @param {Object} params.containerRef - Container element ref
 * @param {Object} params.canvasWrapperRef - Canvas wrapper ref (Layer 1)
 * @param {Object} params.overlayWrapperRef - Overlay wrapper ref (Layer 3)
 * @param {Object} params.currentPage - Current PDF page object
 * @param {number} params.rotation - Current page rotation
 * @param {string} params.currentMode - Current markup tool mode
 * @returns {Object} Zoom/pan state and controls
 */
export function useZoomPan({ 
  containerRef, 
  canvasWrapperRef, 
  overlayWrapperRef,
  currentPage,
  rotation,
  currentMode
}) {
  // Zoom/pan state (React state - synced after gestures)
  const [scale, setScale] = useState(ZOOM_CONFIG.INITIAL_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [tempPanMode, setTempPanMode] = useState(false); // Space bar hold
  
  // RAF refs (live values - updated at 60fps during gestures)
  const transformRef = useRef({ scale: ZOOM_CONFIG.INITIAL_SCALE, pan: { x: 0, y: 0 } });
  const isGestureActiveRef = useRef(false); // Is user actively zooming/panning?
  const rafIdRef = useRef(null); // RequestAnimationFrame ID
  const syncTimerRef = useRef(null); // Timer for syncing to React state
  const isInteractingRef = useRef(false); // Lock during interactions
  const interactionDebounceRef = useRef(null);
  
  /**
   * Sync RAF transform with React state (for button clicks, etc.)
   * This effect runs OUTSIDE of gestures to apply React state changes
   */
  useEffect(() => {
    // Only sync if not in active gesture (to avoid fighting RAF updates)
    if (!isGestureActiveRef.current) {
      transformRef.current.scale = scale;
      transformRef.current.pan = pan;
      
      // Update BOTH wrappers directly for immediate visual feedback
      const transformStr = `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`;
      if (canvasWrapperRef.current) {
        canvasWrapperRef.current.style.transform = transformStr;
      }
      if (overlayWrapperRef.current) {
        overlayWrapperRef.current.style.transform = transformStr;
      }
    }
  }, [scale, pan.x, pan.y, canvasWrapperRef, overlayWrapperRef]);
  
  /**
   * Mouse wheel zoom handler with RAF
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const wheelHandler = (e) => {
      e.preventDefault();
      
      // 🚀 PERFORMANCE: Lock interaction during wheel (prevents lag from snap calculations)
      isInteractingRef.current = true;
      clearTimeout(interactionDebounceRef.current);
      interactionDebounceRef.current = setTimeout(() => {
        isInteractingRef.current = false;
      }, 100);
      
      if (!canvasWrapperRef.current) return;
      
      const rect = container.getBoundingClientRect();
      
      // Get mouse position relative to container center (our transform origin)
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;
      
      // Calculate zoom delta - ZOOM_CONFIG.ZOOM_DELTA controls speed
      const delta = e.deltaY > 0 ? (1 - ZOOM_CONFIG.ZOOM_DELTA) : (1 + ZOOM_CONFIG.ZOOM_DELTA);
      
      // 🎯 RAF-BASED ZOOM: Update transform immediately without React re-render
      const prevScale = transformRef.current.scale;
      const prevPan = transformRef.current.pan;
      
      // 🛡️ SAFETY: Validate current values
      if (!isFinite(prevScale) || !isFinite(prevPan.x) || !isFinite(prevPan.y)) {
        console.error('❌ Invalid transform ref:', transformRef.current);
        transformRef.current = { scale: ZOOM_CONFIG.INITIAL_SCALE, pan: { x: 0, y: 0 } };
        return;
      }
      
      // Apply zoom limits
      const newScale = Math.max(
        ZOOM_CONFIG.MIN_SCALE, 
        Math.min(ZOOM_CONFIG.MAX_SCALE, prevScale * delta)
      );
      
      // Zoom-to-mouse calculation (translate-first transform order)
      const canvasX = mouseX / prevScale - prevPan.x;
      const canvasY = mouseY / prevScale - prevPan.y;
      
      let newPanX = mouseX / newScale - canvasX;
      let newPanY = mouseY / newScale - canvasY;
      
      // 🛡️ SAFETY: Clamp pan values to prevent extreme offsets
      const maxPan = 5000;
      newPanX = Math.max(-maxPan, Math.min(maxPan, newPanX));
      newPanY = Math.max(-maxPan, Math.min(maxPan, newPanY));
      
      // 🛡️ SAFETY: Final validation before applying
      if (!isFinite(newPanX) || !isFinite(newPanY)) {
        console.error('❌ Invalid pan calculation:', { newPanX, newPanY });
        return;
      }
      
      // Update ref immediately (no re-render)
      transformRef.current.scale = newScale;
      transformRef.current.pan = { x: newPanX, y: newPanY };
      isGestureActiveRef.current = true;
      
      // Apply transform via RAF (60fps smooth) to BOTH wrappers
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        const transformStr = `scale(${newScale}) translate(${newPanX}px, ${newPanY}px)`;
        if (canvasWrapperRef.current) {
          canvasWrapperRef.current.style.transform = transformStr;
        }
        if (overlayWrapperRef.current) {
          overlayWrapperRef.current.style.transform = transformStr;
        }
      });
      
      // Sync to React state after gesture ends (ANIMATION.DEBOUNCE_MS)
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        isGestureActiveRef.current = false;
        setScale(transformRef.current.scale);
        setPan(transformRef.current.pan);
      }, ANIMATION.DEBOUNCE_MS);
    };
    
    container.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      container.removeEventListener('wheel', wheelHandler);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [containerRef, canvasWrapperRef, overlayWrapperRef]);
  
  /**
   * Zoom controls (buttons)
   */
  const zoomIn = () => {
    const newScale = Math.min(ZOOM_CONFIG.MAX_SCALE, scale * 1.5);
    setScale(newScale);
  };
  
  const zoomOut = () => {
    const newScale = Math.max(ZOOM_CONFIG.MIN_SCALE, scale / 1.5);
    setScale(newScale);
  };
  
  const zoomFit = () => {
    if (!currentPage || !containerRef.current) return;
    
    const viewport = currentPage.getViewport({ scale: 1, rotation });
    const container = containerRef.current;
    
    const scaleX = (container.clientWidth * 0.9) / viewport.width;
    const scaleY = (container.clientHeight * 0.9) / viewport.height;
    const newScale = Math.min(scaleX, scaleY);
    
    setScale(newScale);
    setPan({ x: 0, y: 0 });
  };
  
  /**
   * Pan gesture handlers
   */
  const handlePanStart = (e) => {
    if (currentMode || !tempPanMode) return; // Don't pan if tool active (unless Space held)
    
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  
  const handlePanMove = (e) => {
    if (!isPanning || !panStart) return;
    
    const newPan = {
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    };
    setPan(newPan);
  };
  
  const handlePanEnd = () => {
    setIsPanning(false);
    setPanStart(null);
  };
  
  /**
   * Keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Space bar = temporary pan mode (hold)
      if (e.code === 'Space' && !e.repeat && !currentMode) {
        e.preventDefault();
        setTempPanMode(true);
      }
      
      // +/= key = zoom in
      if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        zoomIn();
      }
      
      // - key = zoom out
      if (e.key === '-' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        zoomOut();
      }
      
      // 0 key = zoom fit
      if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        zoomFit();
      }
    };
    
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setTempPanMode(false);
        setIsPanning(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [currentMode, scale, pan]);
  
  return {
    // State
    scale,
    pan,
    isPanning,
    tempPanMode,
    
    // Actions
    setScale,
    setPan,
    zoomIn,
    zoomOut,
    zoomFit,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    
    // Refs (for coordinate calculations and cleanup)
    transformRef,
    isGestureActiveRef,
    rafIdRef,
    isInteractingRef,
  };
}
