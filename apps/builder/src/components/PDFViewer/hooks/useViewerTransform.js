/**
 * useViewerTransform Hook
 * Manages zoom, pan, and RAF-based smooth transforms
 * Handles the "Sandwich Architecture" coordinate system
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';

export function useViewerTransform({ 
  currentPage,
  rotation,
  containerRef,
  canvasWrapperRef,
  overlayWrapperRef 
}) {
  // Transform State
  const [scale, setScale] = useState(() => {
    console.log('🔍 INITIAL SCALE: 0.3');
    return 0.3;
  });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [tempPanMode, setTempPanMode] = useState(false); // Space bar temporary pan

  // RAF-based transform refs (bypass React for 60fps)
  const transformRef = useRef({ scale: 0.3, pan: { x: 0, y: 0 } });
  const rafIdRef = useRef(null);
  const syncTimerRef = useRef(null);
  const isGestureActiveRef = useRef(false);

  // Performance refs
  const isInteractingRef = useRef(false);
  const interactionDebounceRef = useRef(null);

  // 🎯 SYNC RAF TRANSFORM WITH REACT STATE
  // Using useLayoutEffect to ensure transform is applied BEFORE paint (prevents flicker)
  // CRITICAL FIX: Always apply transforms, not conditional on isGestureActiveRef
  // This ensures canvas and overlay wrappers are ALWAYS in sync after any state change
  useLayoutEffect(() => {
    // Always sync transformRef with React state
    transformRef.current.scale = scale;
    transformRef.current.pan = pan;
    
    // Always update BOTH wrappers directly - this ensures they stay synchronized
    // Even if RAF applied a transform, this will override with the final synced value
    const transformStr = `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`;
    if (canvasWrapperRef?.current) {
      canvasWrapperRef.current.style.transform = transformStr;
    }
    if (overlayWrapperRef?.current) {
      overlayWrapperRef.current.style.transform = transformStr;
    }
  }, [scale, pan, canvasWrapperRef, overlayWrapperRef]);

  // Zoom functions
  const zoomIn = useCallback(() => {
    const newScale = Math.min(10, scale * 1.5);
    setScale(newScale);
  }, [scale]);

  const zoomOut = useCallback(() => {
    const newScale = Math.max(0.1, scale / 1.5);
    setScale(newScale);
  }, [scale]);

  const zoomFit = useCallback(() => {
    if (!currentPage || !containerRef?.current) return;
    
    const viewport = currentPage.getViewport({ scale: 1, rotation: rotation || 0 });
    const container = containerRef.current;
    
    const scaleX = (container.clientWidth * 0.9) / viewport.width;
    const scaleY = (container.clientHeight * 0.9) / viewport.height;
    const newScale = Math.min(scaleX, scaleY);
    
    setScale(newScale);
    setPan({ x: 0, y: 0 });
  }, [currentPage, rotation, containerRef]);

  // Set specific zoom level
  const setZoom = useCallback((newScale) => {
    const clampedScale = Math.max(0.1, Math.min(10, newScale));
    setScale(clampedScale);
  }, []);

  // Pan handlers
  const startPan = useCallback((clientX, clientY) => {
    isInteractingRef.current = true;
    setPanStart({ x: clientX - pan.x, y: clientY - pan.y });
  }, [pan]);

  const updatePan = useCallback((clientX, clientY) => {
    if (panStart) {
      setPan({
        x: clientX - panStart.x,
        y: clientY - panStart.y
      });
    }
  }, [panStart]);

  const endPan = useCallback(() => {
    clearTimeout(interactionDebounceRef.current);
    interactionDebounceRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 100);
    setPanStart(null);
  }, []);

  // Wheel zoom with mouse-lock (attached via useEffect in parent)
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    
    if (!containerRef?.current || !canvasWrapperRef?.current) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    // Get mouse position relative to container center (our transform origin)
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    
    // Calculate zoom delta - smooth and moderate
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    
    // 🎯 RAF-BASED ZOOM: Update transform immediately without React re-render
    const prevScale = transformRef.current.scale;
    const prevPan = transformRef.current.pan;
    
    // Validate current values
    if (!isFinite(prevScale) || !isFinite(prevPan.x) || !isFinite(prevPan.y)) {
      console.error('❌ Invalid transform ref:', transformRef.current);
      return;
    }
    
    // Bluebeam-style max zoom: 10x (1000%)
    const newScale = Math.max(0.1, Math.min(10, prevScale * delta));
    
    // Zoom-to-mouse calculation
    const canvasX = mouseX / prevScale - prevPan.x;
    const canvasY = mouseY / prevScale - prevPan.y;
    
    let newPanX = mouseX / newScale - canvasX;
    let newPanY = mouseY / newScale - canvasY;
    
    // Clamp pan values to prevent extreme offsets
    const maxPan = 5000;
    newPanX = Math.max(-maxPan, Math.min(maxPan, newPanX));
    newPanY = Math.max(-maxPan, Math.min(maxPan, newPanY));
    
    // Final validation
    if (!isFinite(newPanX) || !isFinite(newPanY)) {
      console.error('❌ Invalid pan values:', { newPanX, newPanY });
      return;
    }
    
    // Update ref immediately (no re-render)
    transformRef.current.scale = newScale;
    transformRef.current.pan = { x: newPanX, y: newPanY };
    
    // Apply transform via RAF (60fps smooth) to BOTH wrappers IMMEDIATELY
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      const transformStr = `scale(${newScale}) translate(${newPanX}px, ${newPanY}px)`;
      if (canvasWrapperRef?.current) {
        canvasWrapperRef.current.style.transform = transformStr;
      }
      if (overlayWrapperRef?.current) {
        overlayWrapperRef.current.style.transform = transformStr;
      }
    });
    
    // 🎯 CRITICAL FIX: Update React state immediately (no debounce)
    // This keeps transformRef and React state perfectly in sync
    // ROI mode detection and rendering will use the same values
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [containerRef, canvasWrapperRef, overlayWrapperRef]);

  return {
    // State
    scale,
    pan,
    isPanning,
    panStart,
    tempPanMode,
    
    // Setters
    setScale,
    setPan,
    setIsPanning,
    setPanStart,
    setTempPanMode,
    
    // Actions
    zoomIn,
    zoomOut,
    zoomFit,
    setZoom,
    startPan,
    updatePan,
    endPan,
    handleWheel,
    
    // Refs
    transformRef,
    isGestureActiveRef,
    isInteractingRef,
    interactionDebounceRef
  };
}
