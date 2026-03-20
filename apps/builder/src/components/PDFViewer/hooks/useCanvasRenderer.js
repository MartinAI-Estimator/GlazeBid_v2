import { useState, useEffect, useRef } from 'react';
import { RENDER_CONFIG, ZOOM_CONFIG } from '../utils/constants';

/**
 * useCanvasRenderer - Manages PDF canvas rendering
 * 
 * Responsibilities:
 * - Full-page canvas rendering at base quality
 * - ROI (Region of Interest) rendering at high quality for zoom >400%
 * - Progressive rendering quality based on zoom level
 * - Canvas dimensions management
 * - Render task cancellation
 * 
 * Rendering Modes:
 * - FULL-PAGE: Render entire page to base canvas (zoom < ROI_ZOOM_THRESHOLD)
 * - ROI: Render only visible region to overlay canvas (zoom >= ROI_ZOOM_THRESHOLD)
 * 
 * @param {Object} params
 * @param {Object} params.currentPage - PDF.js page object
 * @param {number} params.rotation - Page rotation
 * @param {number} params.scale - Current zoom scale
 * @param {Object} params.pan - Current pan offset {x, y}
 * @param {Object} params.canvasRef - Base canvas ref
 * @param {Object} params.roiCanvasRef - ROI canvas ref
 * @param {Object} params.containerRef - Container ref
 * @param {Object} params.transformRef - Live transform values
 * @param {Object} params.renderTaskRef - Shared render task ref for cleanup
 * @returns {Object} Rendering state and controls
 */
export function useCanvasRenderer({
  currentPage,
  rotation,
  scale,
  pan,
  canvasRef,
  roiCanvasRef,
  containerRef,
  transformRef,
  renderTaskRef
}) {
  // Rendering state
  const [isRendering, setIsRendering] = useState(false);
  const [renderScale, setRenderScale] = useState(() => {
    // Calculate base quality using devicePixelRatio for Retina/4K displays
    return RENDER_CONFIG.BASE_QUALITY * (window.devicePixelRatio || 1);
  });
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [viewportDimensions, setViewportDimensions] = useState(null);
  const [isROIMode, setIsROIMode] = useState(false);
  const [roiCanvasReady, setRoiCanvasReady] = useState(false);
  
  // Refs
  const roiDebounceRef = useRef(null);
  const rerenderTimerRef = useRef(null);
  
  /**
   * Determine if we should use ROI mode based on zoom level
   */
  useEffect(() => {
    const shouldUseROI = scale >= ZOOM_CONFIG.ROI_ZOOM_THRESHOLD;
    if (shouldUseROI !== isROIMode) {
      console.log(shouldUseROI ? '🔍 Entering ROI mode' : '📄 Entering full-page mode');
      setIsROIMode(shouldUseROI);
      setRoiCanvasReady(false); // Reset ROI canvas ready state
    }
  }, [scale, isROIMode]);
  
  /**
   * Main render effect
   */
  useEffect(() => {
    if (!currentPage || !canvasRef.current || !roiCanvasRef.current || !containerRef.current) return;
    
    const renderPage = async () => {
      // Cancel any existing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      
      // Store viewport at scale 1.0 for SVG coordinate system
      const baseViewport = currentPage.getViewport({ scale: 1.0, rotation });
      setViewportDimensions({ width: baseViewport.width, height: baseViewport.height });
      
      if (isROIMode) {
        // ========================================
        // ROI MODE: High-res region on Overlay Canvas
        // ========================================
        
        // 🛡️ SAFETY: Validate scale/pan values before rendering
        if (!isFinite(scale) || !isFinite(pan.x) || !isFinite(pan.y)) {
          console.error('❌ Invalid transform values:', { scale, pan });
          setIsROIMode(false); // Fall back to full-page mode
          return;
        }
        
        // Use transformRef for live values during gestures
        let liveScale = transformRef.current.scale;
        let livePan = transformRef.current.pan;
        
        const containerRect = containerRef.current.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Calculate visible region in PDF coordinates
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;
        
        // Visible region corners in canvas space
        const topLeftX = -centerX / liveScale - livePan.x;
        const topLeftY = -centerY / liveScale - livePan.y;
        const bottomRightX = centerX / liveScale - livePan.x;
        const bottomRightY = centerY / liveScale - livePan.y;
        
        // Clip to page bounds
        const roiLeft = Math.max(0, topLeftX);
        const roiTop = Math.max(0, topLeftY);
        const roiRight = Math.min(baseViewport.width, bottomRightX);
        const roiBottom = Math.min(baseViewport.height, bottomRightY);
        
        const roiWidth = roiRight - roiLeft;
        const roiHeight = roiBottom - roiTop;
        
        if (roiWidth <= 0 || roiHeight <= 0) {
          console.warn('⚠️ Invalid ROI dimensions - falling back to full-page');
          setIsROIMode(false);
          return;
        }
        
        // Render to ROI canvas
        const roiCanvas = roiCanvasRef.current;
        roiCanvas.width = containerRect.width * dpr;
        roiCanvas.height = containerRect.height * dpr;
        
        const context = roiCanvas.getContext('2d');
        context.scale(dpr, dpr);
        
        // Create viewport for the ROI
        const roiViewport = currentPage.getViewport({
          scale: liveScale * renderScale,
          rotation
        });
        
        // Calculate transform to position ROI correctly
        const offsetX = -roiLeft * liveScale * renderScale;
        const offsetY = -roiTop * liveScale * renderScale;
        
        context.setTransform(
          roiViewport.transform[0], roiViewport.transform[1],
          roiViewport.transform[2], roiViewport.transform[3],
          offsetX, offsetY
        );
        
        const renderContext = {
          canvasContext: context,
          viewport: roiViewport,
        };
        
        context.imageSmoothingEnabled = false;
        setIsRendering(true);
        renderTaskRef.current = currentPage.render(renderContext);
        
        try {
          await renderTaskRef.current.promise;
          renderTaskRef.current = null;
          setRoiCanvasReady(true);
          setIsRendering(false);
          console.log('✅ ROI render complete');
        } catch (error) {
          setIsRendering(false);
          if (error.name !== 'RenderingCancelledException') {
            console.error('❌ ROI render error:', error);
          }
        }
      } else {
        // ========================================
        // FULL-PAGE MODE: Render entire page to Base Canvas
        // ========================================
        const viewport = currentPage.getViewport({ 
          scale: renderScale,
          rotation
        });
        
        const baseCanvas = canvasRef.current;
        const baseContext = baseCanvas.getContext('2d');
        baseCanvas.width = viewport.width;
        baseCanvas.height = viewport.height;
        
        // Update state to trigger re-render with new canvas dimensions
        setCanvasDimensions({ width: viewport.width, height: viewport.height });
        
        const renderContext = {
          canvasContext: baseContext,
          viewport,
        };
        
        baseContext.imageSmoothingEnabled = false;
        setIsRendering(true);
        renderTaskRef.current = currentPage.render(renderContext);
        
        try {
          await renderTaskRef.current.promise;
          renderTaskRef.current = null;
          setIsRendering(false);
          console.log('✅ Full-Page render complete');
        } catch (error) {
          setIsRendering(false);
          if (error.name !== 'RenderingCancelledException') {
            console.error('Full-Page render error:', error);
          }
        }
      }
    };
    
    // Debounce ROI re-renders during zoom to prevent lag/flashing
    if (isROIMode) {
      clearTimeout(roiDebounceRef.current);
      roiDebounceRef.current = setTimeout(() => {
        renderPage();
      }, RENDER_CONFIG.ROI_DEBOUNCE_MS);
    } else {
      renderPage();
    }
    
    return () => {
      if (roiDebounceRef.current) clearTimeout(roiDebounceRef.current);
    };
  }, [currentPage, rotation, renderScale, isROIMode, scale, pan]);
  
  /**
   * Progressive rendering: Re-render at higher quality after zoom stops
   */
  useEffect(() => {
    if (isROIMode) return; // Don't progressive render in ROI mode
    
    clearTimeout(rerenderTimerRef.current);
    rerenderTimerRef.current = setTimeout(() => {
      // Increase render quality when user stops zooming
      const targetRenderScale = Math.min(
        scale * RENDER_CONFIG.BASE_QUALITY,
        RENDER_CONFIG.BASE_QUALITY * 2
      );
      
      if (Math.abs(renderScale - targetRenderScale) > 0.1) {
        console.log('📈 Progressive render: Increasing quality to', targetRenderScale.toFixed(2) + 'x');
        setRenderScale(targetRenderScale);
      }
    }, 500); // Wait 500ms after zoom stops
    
    return () => clearTimeout(rerenderTimerRef.current);
  }, [scale, isROIMode, renderScale]);
  
  return {
    // State
    isRendering,
    renderScale,
    canvasDimensions,
    viewportDimensions,
    isROIMode,
    roiCanvasReady,
    
    // Actions
    setRenderScale,
    
    // Refs
    roiDebounceRef,
  };
}
