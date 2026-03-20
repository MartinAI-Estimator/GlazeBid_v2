/**
 * Coordinate Transformation Utilities
 * 
 * Handles conversion between different coordinate spaces:
 * - Screen Space: Browser viewport coordinates (clientX, clientY)
 * - PDF Space: PDF document coordinates (0,0 at top-left)
 * - Viewport Space: Scaled PDF coordinates after rotation
 * 
 * CRITICAL: All transforms must account for:
 * 1. Canvas CSS transform: scale(s) translate(x, y)
 * 2. Page rotation (0°, 90°, 180°, 270°)
 * 3. Centering offsets
 */

/**
 * Convert screen coordinates to PDF coordinates
 * 
 * @param {number} screenX - Mouse X position in browser viewport
 * @param {number} screenY - Mouse Y position in browser viewport
 * @param {Object} params - Transform parameters
 * @param {Object} params.currentPage - PDF.js page object
 * @param {HTMLElement} params.containerRef - Container element ref
 * @param {number} params.rotation - Current page rotation
 * @param {Object} params.transformRef - Live transform values {scale, pan}
 * @returns {Object} PDF coordinates {x, y}
 */
export function screenToPDF(screenX, screenY, { currentPage, containerRef, rotation, transformRef }) {
  if (!currentPage || !containerRef) return { x: 0, y: 0 };
  
  // 🛡️ ROTATION SAFETY: Ensure we use the correct rotation even if state lags
  const safeRotation = rotation || currentPage.rotate || 0;
  const viewport = currentPage.getViewport({ scale: 1.0, rotation: safeRotation });
  const containerRect = containerRef.getBoundingClientRect();
  
  // 🎯 CRITICAL FIX: Use container center as stable reference point
  // Container doesn't scale, so its getBoundingClientRect() is always accurate
  const containerCenterX = containerRect.left + containerRect.width / 2;
  const containerCenterY = containerRect.top + containerRect.height / 2;
  
  // Get click position relative to container center (stable reference)
  const distFromCenterX = screenX - containerCenterX;
  const distFromCenterY = screenY - containerCenterY;
  
  // 🎯 RAF SYNC: Use transformRef (live RAF values) for perfect coordinate accuracy
  const currentScale = transformRef.scale;
  const currentPan = transformRef.pan;
  
  // The CSS transform is: scale(s) translate(x, y)
  // But translate happens BEFORE scale in CSS transform order
  // So: point_screen = (point_pdf + pan) * scale
  // Reverse: point_pdf = (point_screen / scale) - pan
  
  // Step 1: Undo scale to get position in unscaled space
  const unscaledX = distFromCenterX / currentScale;
  const unscaledY = distFromCenterY / currentScale;
  
  // Step 2: Subtract pan (pan is in unscaled space, measured from center)
  const pdfRelX = unscaledX - currentPan.x;
  const pdfRelY = unscaledY - currentPan.y;
  
  // Step 3: Convert from center-relative to top-left relative (PDF coordinate system)
  const pdfX = pdfRelX + (viewport.width / 2);
  const pdfY = pdfRelY + (viewport.height / 2);
  
  return { x: pdfX, y: pdfY };
}

/**
 * Convert PDF coordinates to screen coordinates
 * 
 * Note: With the current architecture, SVG is inside the transformed wrapper,
 * so PDF coordinates can be used directly in the SVG. The wrapper's transform
 * handles the conversion to screen space automatically.
 * 
 * @param {number} viewportX - X coordinate in PDF viewport space
 * @param {number} viewportY - Y coordinate in PDF viewport space
 * @returns {Object} Screen coordinates {x, y}
 */
export function pdfToScreen(viewportX, viewportY) {
  // NO TRANSFORM NEEDED!
  // SVG is inside the canvas wrapper which already has:
  //   transform: scale(${scale}) translate(${pan.x}px, ${pan.y}px)
  // So we just return them directly - the wrapper's transform handles everything
  return { x: viewportX, y: viewportY };
}

/**
 * Convert PDF space coordinates to viewport space (handles rotation)
 * Used for snap point extraction from PDF vectors
 * 
 * @param {number} pdfX - X coordinate in PDF space
 * @param {number} pdfY - Y coordinate in PDF space
 * @param {Object} params - Transform parameters
 * @param {Object} params.currentPage - PDF.js page object
 * @param {number} params.rotation - Current page rotation
 * @returns {Object} Viewport coordinates {x, y}
 */
export function pdfToViewportCoord(pdfX, pdfY, { currentPage, rotation }) {
  if (!currentPage) return { x: pdfX, y: pdfY };
  
  try {
    const viewport = currentPage.getViewport({ scale: 1.0, rotation });
    const [viewportX, viewportY] = viewport.convertToViewportPoint(pdfX, pdfY);
    return { x: viewportX, y: viewportY };
  } catch (error) {
    console.error('pdfToViewportCoord error:', error);
    return { x: pdfX, y: pdfY };
  }
}

/**
 * Calculate display size for canvas element
 * Canvas bitmap is rendered at renderScale, display size must be bitmap / renderScale
 * 
 * @param {Object} canvasDimensions - Canvas bitmap dimensions {width, height}
 * @param {number} renderScale - Rendering quality multiplier
 * @param {Object} fallbackViewport - Fallback viewport from currentPage.getViewport()
 * @returns {Object} Display dimensions {width, height} in pixels
 */
export function calculateCanvasDisplaySize(canvasDimensions, renderScale, fallbackViewport) {
  const displayWidth = canvasDimensions.width > 0 && renderScale > 0
    ? canvasDimensions.width / renderScale
    : fallbackViewport?.width || 100;
  
  const displayHeight = canvasDimensions.height > 0 && renderScale > 0
    ? canvasDimensions.height / renderScale
    : fallbackViewport?.height || 100;
  
  return { width: displayWidth, height: displayHeight };
}
