import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pdfjs } from 'react-pdf';
import { useProject } from '../context/ProjectContext';
import useGhostLayer from './PDFViewer/hooks/useGhostLayer';
import useMarkupTools from './PDFViewer/hooks/useMarkupTools.jsx';
import useMarkupEdit from './PDFViewer/hooks/useMarkupEdit.jsx';
import useSnapPoints from './PDFViewer/hooks/useSnapPoints.jsx';
import useHistory from './PDFViewer/hooks/useHistory.jsx';
import PDFGrid from './PDFViewer/ui/PDFGrid';
import ContextMenu from './PDFViewer/ui/ContextMenu';
import SelectionOverlay from './PDFViewer/ui/SelectionOverlay';
import GridToolbar from './PDFViewer/ui/GridToolbar';
import { GLAZING_CLASSES } from './constants';

// Worker Configuration - Use local worker file for reliability and speed
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const PDFViewer = ({ 
    file, 
    pageNumber = 1, 
    projectId, 
    sheetId, 
    activeTool,      // Input: Current tool from Toolbar
    snaps,           // Input: Snap settings
    showGrid,        // Input: Grid visibility
    calibration,     // Input: Real-world calibration data
    onSendToStructural,
    onPageLoad,      // Output: Report page info to Workspace
    onScaleChange,   // Output: Report zoom level to Workspace
    onCursorMove,    // Output: Report X/Y coordinates
    onCalibrationChange // Output: Report calibration updates
}) => {
  const SMART_FRAME_MULLION_WIDTH_IN = 3.0;

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  
  // Connect to ProjectContext - The Brain
  const { markups: contextMarkups, setMarkups: setContextMarkups } = useProject();
  
  // STATE
  const [transform, setTransform] = useState({ scale: 1.0, x: 0, y: 0 });
  const [renderedScale, setRenderedScale] = useState(1.0);
  const [rotation, setRotation] = useState(0); 
  
  const [pdfPage, setPdfPage] = useState(null);
  
  // HISTORY MANAGEMENT (Undo/Redo) - Now synced with ProjectContext
  const { 
    state: localMarkups, 
    pushState: pushToHistory, 
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = useHistory(contextMarkups);
  
  // Sync local markups with context whenever they change
  useEffect(() => {
    setContextMarkups(localMarkups);
  }, [localMarkups, setContextMarkups]);
  
  // Helper to update markups with history tracking
  const setMarkups = useCallback((updateFn) => {
    if (typeof updateFn === 'function') {
      pushToHistory(updateFn(localMarkups));
    } else {
      pushToHistory(updateFn);
    }
  }, [localMarkups, pushToHistory]);
  
  const [isPanning, setIsPanning] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { position: {x, y}, markup }
  const [clipboardMarkup, setClipboardMarkup] = useState(null);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [showGridToolbar, setShowGridToolbar] = useState(false); // Layer 22: Grid toolbar visibility
  const [smartFrameLineDrag, setSmartFrameLineDrag] = useState(null); // { markupId, orientation, index }
  const [hoverMarkupId, setHoverMarkupId] = useState(null);
  const [detectingSmartFrameIds, setDetectingSmartFrameIds] = useState([]);
  
  const renderTaskRef = useRef(null);
  // Double-buffer: PDF.js renders into this hidden canvas while the visible
  // canvasRef keeps its current pixels, preventing any white-flash on zoom.
  const bufferCanvasRef = useRef(document.createElement('canvas'));
  // Latest-ref for updateSmartFrameGridRelative: the async detection IIFE captures
  // this ref so it always calls the freshest version, avoiding stale-closure bugs
  // where setMarkups was bound to an outdated localMarkups snapshot.
  const latestUpdateGridRef = useRef(null);
  const fileRef = useRef(file);
  const pageNumberRef = useRef(pageNumber);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const zoomTimeoutRef = useRef(null);
  const processedSmartFramesRef = useRef(new Set());

  const activeCalibration = calibration?.pageNumber === pageNumber ? calibration : null;

  const withCalibration = useCallback((markup) => {
    if (!markup) return markup;
    return {
      ...markup,
      calibration: markup.calibration || activeCalibration || null
    };
  }, [activeCalibration]);

  const normalizeRelativePositions = useCallback((values = []) => {
    const unique = new Set();
    for (const value of values) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) continue;
      const clamped = Math.min(0.98, Math.max(0.02, numeric));
      unique.add(Number(clamped.toFixed(4)));
    }
    return Array.from(unique).sort((a, b) => a - b);
  }, []);

  const getMarkupBounds = useCallback((markup) => {
    if (!markup) return null;

    if (markup.boundingBox) {
      const { minX, maxX, minY, maxY } = markup.boundingBox;
      return {
        minX,
        maxX,
        minY,
        maxY,
        width: Math.max(0.0001, maxX - minX),
        height: Math.max(0.0001, maxY - minY)
      };
    }

    const sourcePoints = markup.path_points?.length ? markup.path_points : markup.points;
    if (!sourcePoints?.length) return null;

    const xs = sourcePoints.map(point => point.x);
    const ys = sourcePoints.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(0.0001, maxX - minX),
      height: Math.max(0.0001, maxY - minY)
    };
  }, []);

  const getMarkupPdfBBox = useCallback((markup) => {
    const bounds = getMarkupBounds(markup);
    if (!bounds) return null;

    // markup.boundingBox is stored in 1:1 scale (72 DPI) canvas space with a
    // Top-Left origin — which is exactly what PyMuPDF (fitz.Rect) expects.
    // Do NOT use viewport.convertToPdfPoint here: that helper flips the Y-axis
    // to match PDF spec (bottom-left origin), but fitz uses top-left natively,
    // so applying it sends the backend to the wrong half of the page entirely.
    const width  = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    if (width <= 0 || height <= 0) return null;

    console.log('📐 getMarkupPdfBBox:', { bounds, pdfBBox: [bounds.minX, bounds.minY, width, height] });

    return [
      Number(bounds.minX.toFixed(4)),
      Number(bounds.minY.toFixed(4)),
      Number(width.toFixed(4)),
      Number(height.toFixed(4))
    ];
  }, [getMarkupBounds]);

  const buildSmartFrameAssembly = useCallback((markup, gridRelative, status = 'draft', source = 'manual') => {
    const bounds = getMarkupBounds(markup);
    const calibrationData = markup?.calibration || activeCalibration;

    if (!bounds) {
      return {
        id: `FRAME-${String(markup?.id || Date.now()).replace('m_', '')}`,
        type: 'smart_frame',
        overall_dims: { width_inch: 0, height_inch: 0 },
        grid: { verticals: [], horizontals: [] },
        grid_relative: { verticals: [], horizontals: [] },
        bays: [],
        daylight_openings: [],
        mullion_width_inch: SMART_FRAME_MULLION_WIDTH_IN,
        status,
        source,
        updatedAt: Date.now()
      };
    }

    const pixelsPerInch = calibrationData?.pixelsPerInch;
    const widthInchRaw = Number.isFinite(pixelsPerInch) && pixelsPerInch > 0
      ? bounds.width / pixelsPerInch
      : bounds.width;
    const heightInchRaw = Number.isFinite(pixelsPerInch) && pixelsPerInch > 0
      ? bounds.height / pixelsPerInch
      : bounds.height;

    const widthInch = Number(widthInchRaw.toFixed(2));
    const heightInch = Number(heightInchRaw.toFixed(2));

    const verticalsRel = normalizeRelativePositions(gridRelative?.verticals || []);
    const horizontalsRel = normalizeRelativePositions(gridRelative?.horizontals || []);

    const verticalsInch = verticalsRel.map(value => Number((value * widthInch).toFixed(2)));
    const horizontalsInchFromBottom = horizontalsRel
      .map(value => Number(((1 - value) * heightInch).toFixed(2)))
      .sort((a, b) => a - b);

    const mullionWidth = SMART_FRAME_MULLION_WIDTH_IN;

    const verticalEdges = [0, ...verticalsInch, widthInch].sort((a, b) => a - b);
    const bayWidths = [];
    for (let index = 0; index < verticalEdges.length - 1; index++) {
      bayWidths.push(Number((verticalEdges[index + 1] - verticalEdges[index]).toFixed(2)));
    }

    const bayGroups = [];
    bayWidths.forEach((width) => {
      const rounded = Number(width.toFixed(1));
      const existing = bayGroups.find(item => Math.abs(item.width - rounded) < 0.05);
      if (existing) {
        existing.count += 1;
      } else {
        bayGroups.push({ width: rounded, count: 1 });
      }
    });

    const horizontalEdgesBottom = [0, ...horizontalsInchFromBottom, heightInch].sort((a, b) => a - b);
    const rowHeightsBottom = [];
    for (let index = 0; index < horizontalEdgesBottom.length - 1; index++) {
      rowHeightsBottom.push(Number((horizontalEdgesBottom[index + 1] - horizontalEdgesBottom[index]).toFixed(2)));
    }

    const daylightOpenings = [];
    rowHeightsBottom.forEach((rowHeight, rowIndex) => {
      bayWidths.forEach((bayWidth, bayIndex) => {
        const openingWidth = Number(Math.max(bayWidth - mullionWidth, 0).toFixed(2));
        const openingHeight = Number(Math.max(rowHeight - mullionWidth, 0).toFixed(2));
        const isTwoRows = rowHeightsBottom.length === 2;
        const liteType = isTwoRows
          ? (rowIndex === 0 ? 'lower_lite' : 'upper_lite')
          : `lite_r${rowIndex + 1}_c${bayIndex + 1}`;

        daylightOpenings.push({
          w: openingWidth,
          h: openingHeight,
          type: liteType
        });
      });
    });

    return {
      id: `FRAME-${String(markup?.id || Date.now()).replace('m_', '')}`,
      type: 'smart_frame',
      overall_dims: {
        width_inch: widthInch,
        height_inch: heightInch
      },
      grid: {
        verticals: verticalsInch,
        horizontals: horizontalsInchFromBottom
      },
      grid_relative: {
        verticals: verticalsRel,
        horizontals: horizontalsRel
      },
      bays: bayGroups,
      daylight_openings: daylightOpenings,
      mullion_width_inch: mullionWidth,
      status,
      source,
      updatedAt: Date.now()
    };
  }, [activeCalibration, getMarkupBounds, normalizeRelativePositions]);

  const handleMarkupCreated = useCallback((markup) => {
    const calibrated = withCalibration(markup);
    if (calibrated?.type === 'smart_frame') {
      const initialGrid = { verticals: [0.5], horizontals: [0.5] };
      const smartFrame = buildSmartFrameAssembly(calibrated, initialGrid, 'draft', 'fallback');
      setMarkups(prev => [...prev, { ...calibrated, smartFrame }]);
      return;
    }

    setMarkups(prev => [...prev, calibrated]);
  }, [buildSmartFrameAssembly, setMarkups, withCalibration]);

  const { ghosts, isSearching, requestGhosts, acceptGhost } = useGhostLayer(
    projectId, sheetId, pageNumber, 
    (newMarkup) => setMarkups(prev => [...prev, withCalibration(newMarkup)])
  );

  // DRAWING HOOK
  // SNAP POINTS HOOK (Vector Extraction)
  const { getNearestSnapPoint } = useSnapPoints(
    pdfPage,
    renderedScale,
    rotation
  );

  const { 
    handleMouseDown: toolMouseDown, 
    handleMouseMove: toolMouseMove,
    handleMouseUp: toolMouseUp,
    handleDoubleClick: toolDoubleClick,
    renderPreview,
    renderSnapIndicator
  } = useMarkupTools(
    activeTool, 
    renderedScale, 
    handleMarkupCreated,
    (snaps?.content) ? getNearestSnapPoint : null,
    pageNumber
  );

  // EDIT HOOK
  const {
    selectedIds,
    handleMarkupClick,
    handleMouseDown: editMouseDown,
    handleMouseMove: editMouseMove,
    handleMouseUp: editMouseUp,
    setSelectedIds
  } = useMarkupEdit(localMarkups, setMarkups, renderedScale, activeTool);

  // Layer 22: Show grid toolbar when Area markup selected
  const selectedMarkup = selectedIds.length > 0 ? localMarkups.find(m => m.id === selectedIds[0]) : null;
  
  useEffect(() => {
    setShowGridToolbar(selectedMarkup?.type === 'Area');
  }, [selectedMarkup?.id, selectedMarkup?.type]);

  // Layer 22: Update markup grid properties
  const handleGridUpdate = useCallback((updates) => {
    if (!selectedMarkup) return;
    setMarkups(prev => prev.map(m => 
      m.id === selectedMarkup.id ? { ...m, ...updates } : m
    ));
  }, [selectedMarkup, setMarkups]);

  // --- UNDO/REDO KEYBOARD LISTENERS ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Z (Undo)
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const previousState = undo();
        if (previousState !== null) {
          console.log('Undo -', canUndo ? `${canUndo - 1} left` : 'none left');
        }
      }
      // Ctrl+Y (Redo) or Ctrl+Shift+Z
      else if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        const nextState = redo();
        if (nextState !== null) {
          console.log('Redo -', canRedo ? `${canRedo - 1} left` : 'none left');
        }
      }

      if (e.key === 'Enter' && selectedMarkup?.type === 'smart_frame' && selectedMarkup?.smartFrame) {
        e.preventDefault();
        setMarkups(prev => prev.map(markup => {
          if (markup.id !== selectedMarkup.id || !markup.smartFrame) return markup;
          return {
            ...markup,
            smartFrame: {
              ...markup.smartFrame,
              status: 'confirmed',
              confirmedAt: Date.now(),
              updatedAt: Date.now()
            }
          };
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo, selectedMarkup, setMarkups]);

  // --- 1. Load & Intelligent Landscape ---
  useEffect(() => {
    if (!file) return;
    // Only skip reload if both file AND page number are unchanged
    if (file === fileRef.current && pageNumber === pageNumberRef.current && pdfPage) return;
    fileRef.current = file;
    pageNumberRef.current = pageNumber;

    const loadData = async () => {
      try {
        console.log('🔄 Loading PDF page:', pageNumber);
        const loadingTask = pdfjs.getDocument(file);
        const doc = await loadingTask.promise;
        const page = await doc.getPage(pageNumber);
        console.log('✅ PDF page loaded:', pageNumber);
        
        // Report Page Count to Workspace
        if (onPageLoad) {
            onPageLoad({
                numPages: doc.numPages,
                width: (page.view[2] / 72).toFixed(2), // Convert points to inches
                height: (page.view[3] / 72).toFixed(2)
            });
        }

        // 1. Get Viewport using the PDF's NATIVE rotation (don't force 0)
        const nativeViewport = page.getViewport({ scale: 1.0 });
        
        // 2. Intelligent Rotation Logic
        // Start with whatever the PDF says it is (e.g., 0, 90, 270)
        let finalRotation = nativeViewport.rotation;
        
        // If it looks like a Portrait (Height > Width), spin it 90 degrees
        // This accounts for the native rotation first!
        if (nativeViewport.height > nativeViewport.width) {
            finalRotation = (finalRotation + 90) % 360;
        }
        
        // Update State
        setRotation(finalRotation);
        setPdfPage(page);

        // 4. Auto-Fit to Container
        if (containerRef.current) {
            const correctedViewport = page.getViewport({ scale: 1.0, rotation: finalRotation });
            const { clientWidth } = containerRef.current;
            // Add margin for scrollbars
            const fitScale = (clientWidth - 60) / correctedViewport.width;
            
            const centeredX = (clientWidth - (correctedViewport.width * fitScale)) / 2;
            const centeredY = 40;

            setTransform({ scale: fitScale, x: centeredX, y: centeredY });
            setRenderedScale(fitScale);
            if (onScaleChange) onScaleChange(fitScale);
        }
      } catch (err) {
        console.error("PDF Load Error:", err);
      }
    };
    loadData();
  }, [file, pageNumber, onPageLoad, onScaleChange]);

  // --- 2. Resolution Engine (Double-Buffer) ---
  //
  // Strategy:
  //   1. The visible <canvas> (canvasRef) is NEVER blanked mid-render.
  //   2. PDF.js renders the next frame into an off-screen bufferCanvasRef.
  //   3. Only when renderTask.promise fully resolves do we atomically swap:
  //      set canvas.width/height (one invisible frame) then drawImage from the
  //      buffer — the whole swap completes inside a single paint cycle so the
  //      user never sees a blank white canvas.
  //   4. Any pending render is cancelled immediately when a new one starts.
  const renderCanvas = useCallback(async () => {
    if (!pdfPage || !canvasRef.current) return;

    if (renderTaskRef.current) renderTaskRef.current.cancel();
    setIsRendering(true);

    // Always use current 'rotation' state
    const viewport = pdfPage.getViewport({ scale: renderedScale, rotation });

    const maxDim = Math.max(viewport.width, viewport.height);
    const MAX_PIXELS = 8192;
    const renderCap = (maxDim > MAX_PIXELS) ? (MAX_PIXELS / maxDim) : 1.0;
    const dpr = window.devicePixelRatio || 1;

    const finalViewport = pdfPage.getViewport({ scale: renderedScale * renderCap * dpr, rotation });

    // ---- Render into off-screen buffer (visible canvas untouched) ----
    const buffer = bufferCanvasRef.current;
    buffer.width  = finalViewport.width;
    buffer.height = finalViewport.height;
    const bufferCtx = buffer.getContext('2d');
    bufferCtx.imageSmoothingEnabled = false;

    try {
      renderTaskRef.current = pdfPage.render({ canvasContext: bufferCtx, viewport: finalViewport });
      await renderTaskRef.current.promise;
      renderTaskRef.current = null;

      // ---- Atomic swap: buffer → visible canvas in one synchronous block ----
      const canvas = canvasRef.current;
      if (!canvas) { setIsRendering(false); return; }

      canvas.width  = finalViewport.width;   // blanks canvas for 0 paint cycles
      canvas.height = finalViewport.height;
      canvas.style.width  = '100%';
      canvas.style.height = '100%';
      canvas.style.transform = ''; // clear any lingering CSS scale override

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buffer, 0, 0);           // fills canvas before next paint
      // -----------------------------------------------------------------------

      setIsRendering(false);
    } catch (error) {
      setIsRendering(false);
      if (error?.name !== 'RenderingCancelledException') {
        console.error('renderCanvas error:', error);
      }
    }
  }, [pdfPage, renderedScale, rotation]); 

  useEffect(() => { renderCanvas(); }, [renderCanvas]);

  // --- 3. Zoom Logic (Manual DOM Listener to Fix Passive Event Warning) ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Allowed because passive: false
        
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const pdfX = (cursorX - transform.x) / transform.scale;
        const pdfY = (cursorY - transform.y) / transform.scale;

        const zoomFactor = Math.exp(e.deltaY * -0.002);
        const newScale = Math.min(Math.max(transform.scale * zoomFactor, 0.1), 32.0);

        const newX = cursorX - (pdfX * newScale);
        const newY = cursorY - (pdfY * newScale);

        setTransform({ scale: newScale, x: newX, y: newY });
        
        if (onScaleChange) onScaleChange(newScale);

        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => {
          setRenderedScale(newScale);
        }, 300);
      } else {
        e.preventDefault();
        setTransform(prev => ({
          ...prev,
          x: prev.x - (e.shiftKey ? e.deltaY : 0),
          y: prev.y - (e.shiftKey ? 0 : e.deltaY)
        }));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [transform, renderedScale, onScaleChange]);

  // --- 4. Mouse Interactions (Traffic Cop) ---
  const handleMouseDown = (e) => {
    // Close context menu on any click
    if (contextMenu) {
      setContextMenu(null);
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = (e.clientX - rect.left - transform.x) / transform.scale;
    const rawY = (e.clientY - rect.top - transform.y) / transform.scale;

    if (activeTool?.mode === 'Calibration' && e.button === 0) {
      setCalibrationPoints(prev => {
        const nextPoints = [...prev, { x: rawX, y: rawY }].slice(-2);

        if (nextPoints.length === 2) {
          const [p1, p2] = nextPoints;
          const pixelDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const distanceInchesInput = window.prompt('Enter real-world distance between the two points (inches):', '120');
          const distanceInches = distanceInchesInput ? parseFloat(distanceInchesInput) : NaN;

          if (!Number.isFinite(distanceInches) || distanceInches <= 0 || pixelDistance <= 0) {
            alert('Scale not set. Enter a positive numeric distance in inches.');
            return [];
          }

          const nextCalibration = {
            pageNumber,
            pixelsPerInch: pixelDistance / distanceInches,
            pixelsPerFoot: (pixelDistance / distanceInches) * 12,
            measuredDistanceInches: distanceInches,
            points: [p1, p2],
            updatedAt: Date.now()
          };

          if (onCalibrationChange) {
            onCalibrationChange(nextCalibration);
          }

          alert(`Scale calibrated: ${nextCalibration.pixelsPerFoot.toFixed(2)} px/ft`);
          return [];
        }

        return nextPoints;
      });
      return;
    }

    // 1. Deselect on blank space
    if (e.target.tagName !== 'polygon' && e.target.tagName !== 'circle' && e.target.tagName !== 'rect') {
        setSelectedIds([]); 
    }

    // 2. Pan Logic (Middle Click or Spacebar or Pan Tool with no markup clicked)
    const isPanTool = activeTool?.mode === 'Pan' || activeTool?.type === 'pan' || !activeTool?.type;
    if (isPanTool || e.button === 1 || (e.button === 0 && e.code === 'Space')) {
        e.preventDefault();
        setIsPanning(true);
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        return;
    }

    // 3. Drawing Logic (Check for valid drawing mode)
    const isDrawingMode = activeTool?.mode && activeTool.mode !== 'Pan' && activeTool.mode !== 'Select';
    if (isDrawingMode && e.button === 0 && !e.ctrlKey) {
        // Snapping is now handled inside useMarkupTools
        toolMouseDown(rawX, rawY);
        return;
    }
    
    // 3. AI Selection (Ctrl + Click)
    if (e.button === 0 && e.ctrlKey) {
        const rect = containerRef.current.getBoundingClientRect();
        const rawX = (e.clientX - rect.left - transform.x) / transform.scale;
        const rawY = (e.clientY - rect.top - transform.y) / transform.scale;
        
        const anchor = { 
            id: `anchor_${Date.now()}`, mode: 'Area', color: 'blue', 
            points: [{x: rawX, y: rawY}, {x: rawX + 50, y: rawY}, {x: rawX + 50, y: rawY + 50}, {x: rawX, y: rawY + 50}] 
        };
        setMarkups(prev => [...prev, anchor]);
        
        // Clean call (no arguments) to fix syntax error
        const imageBase64 = canvasRef.current.toDataURL(); 
        requestGhosts(anchor, imageBase64);
    }
  };

  const handleMouseMove = (e) => {
    // A. Edit Dragging
    editMouseMove(e);

    // B. Panning
    if (isPanning) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    }

    // C. Tool Rubber Band
    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const rawX = (e.clientX - rect.left - transform.x) / transform.scale;
        const rawY = (e.clientY - rect.top - transform.y) / transform.scale;

        if (smartFrameLineDrag) {
          setMarkups(prev => prev.map(markup => {
            if (markup.id !== smartFrameLineDrag.markupId || markup.type !== 'smart_frame' || !markup.smartFrame) {
              return markup;
            }

            const bounds = getMarkupBounds(markup);
            if (!bounds) return markup;

            const currentGrid = markup.smartFrame.grid_relative || { verticals: [], horizontals: [] };
            const nextGrid = {
              verticals: [...(currentGrid.verticals || [])],
              horizontals: [...(currentGrid.horizontals || [])]
            };

            if (smartFrameLineDrag.orientation === 'vertical' && nextGrid.verticals[smartFrameLineDrag.index] !== undefined) {
              nextGrid.verticals[smartFrameLineDrag.index] = (rawX - bounds.minX) / bounds.width;
              nextGrid.verticals = normalizeRelativePositions(nextGrid.verticals);
            }

            if (smartFrameLineDrag.orientation === 'horizontal' && nextGrid.horizontals[smartFrameLineDrag.index] !== undefined) {
              nextGrid.horizontals[smartFrameLineDrag.index] = (rawY - bounds.minY) / bounds.height;
              nextGrid.horizontals = normalizeRelativePositions(nextGrid.horizontals);
            }

            const nextSmartFrame = buildSmartFrameAssembly(markup, nextGrid, 'draft', 'manual');
            return {
              ...markup,
              smartFrame: {
                ...nextSmartFrame,
                confirmedAt: markup.smartFrame.confirmedAt
              }
            };
          }));
        }
        
        toolMouseMove(rawX, rawY);

        if (onCursorMove) onCursorMove({ x: Math.max(0, rawX/72), y: Math.max(0, rawY/72) });
    }
  };

  const handleMouseUp = (e) => {
    setIsPanning(false);
    editMouseUp(); // Stop Edit Drag
    setSmartFrameLineDrag(null);

    if (activeTool?.mode && activeTool.mode !== 'Select') {
         const rect = containerRef.current.getBoundingClientRect();
         const rawX = (e.clientX - rect.left - transform.x) / transform.scale;
         const rawY = (e.clientY - rect.top - transform.y) / transform.scale;
         toolMouseUp(rawX, rawY);
    }
  };

  // Right-click context menu
  const handleContextMenu = (e) => {
    e.preventDefault();
    
    if (!selectedMarkup) return;
    
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      markup: selectedMarkup
    });
  };

  const createFramePreview = useCallback((markup) => {
    if (!canvasRef.current || !pdfPage) return null;

    const sourcePoints = markup?.path_points?.length ? markup.path_points : markup?.points;
    if (!sourcePoints?.length) return null;

    try {
      const viewport = pdfPage.getViewport({ scale: renderedScale, rotation });
      const paperWidth = viewport.width;
      const paperHeight = viewport.height;
      if (paperWidth <= 0 || paperHeight <= 0) return null;

      const canvas = canvasRef.current;
      const scaleX = canvas.width / paperWidth;
      const scaleY = canvas.height / paperHeight;

      const xs = sourcePoints.map(point => point.x * renderedScale);
      const ys = sourcePoints.map(point => point.y * renderedScale);

      const padding = 12;
      const minX = Math.max(Math.min(...xs) - padding, 0);
      const minY = Math.max(Math.min(...ys) - padding, 0);
      const maxX = Math.min(Math.max(...xs) + padding, paperWidth);
      const maxY = Math.min(Math.max(...ys) + padding, paperHeight);

      const sourceX = Math.max(0, Math.floor(minX * scaleX));
      const sourceY = Math.max(0, Math.floor(minY * scaleY));
      const sourceW = Math.max(1, Math.ceil((maxX - minX) * scaleX));
      const sourceH = Math.max(1, Math.ceil((maxY - minY) * scaleY));

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = sourceW;
      cropCanvas.height = sourceH;
      const cropContext = cropCanvas.getContext('2d');
      if (!cropContext) return null;

      cropContext.drawImage(
        canvas,
        sourceX,
        sourceY,
        sourceW,
        sourceH,
        0,
        0,
        sourceW,
        sourceH
      );

      return {
        imageDataUrl: cropCanvas.toDataURL('image/png'),
        width: sourceW,
        height: sourceH
      };
    } catch (error) {
      console.warn('Could not generate frame preview:', error);
      return null;
    }
  }, [pdfPage, renderedScale, rotation]);


  const updateSmartFrameGridRelative = useCallback((markupId, nextGridRelative, source = 'manual', status = 'draft', gridDefinition = null) => {
    setMarkups(prev => prev.map(markup => {
      if (markup.id !== markupId || markup.type !== 'smart_frame') return markup;

      const existing = markup.smartFrame || {};
      const mergedRelative = {
        verticals: normalizeRelativePositions(nextGridRelative?.verticals ?? existing?.grid_relative?.verticals ?? []),
        horizontals: normalizeRelativePositions(nextGridRelative?.horizontals ?? existing?.grid_relative?.horizontals ?? [])
      };

      const nextSmartFrame = buildSmartFrameAssembly(markup, mergedRelative, status, source);
      return {
        ...markup,
        smartFrame: {
          ...nextSmartFrame,
          confirmedAt: existing.confirmedAt
        },
        grid_definition: gridDefinition || markup.grid_definition || null
      };
    }));
  }, [buildSmartFrameAssembly, normalizeRelativePositions, setMarkups]);

  // Keep the ref in sync with the latest version on every render.
  // This is intentionally outside useEffect so it is always current.
  latestUpdateGridRef.current = updateSmartFrameGridRelative;

  const startSmartFrameDetection = useCallback((markup) => {
    if (!markup || markup.type !== 'smart_frame') return false;
    const pdfBBox = getMarkupPdfBBox(markup);
    if (!pdfBBox) return false;
    const projectName = projectId || sheetId || 'default_project';

    setDetectingSmartFrameIds(prev => prev.includes(markup.id) ? prev : [...prev, markup.id]);

    (async () => {
      try {
        const requestPayload = {
          project_name: projectName,
          page_index: Math.max(0, pageNumber - 1),
          sheet_hint: sheetId,
          bbox: pdfBBox
        };
        console.log('🔍 Smart Frame Detection Request:', requestPayload);

        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/smart-frame/detect-grid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Detection failed:', response.status, errorText);
          throw new Error(`Grid detect HTTP ${response.status}: ${errorText}`);
        }

        const payload = await response.json();
        console.log('✅ Smart Frame Detection Response:', payload);
        
        const gridDefinition = payload?.grid || payload?.grid_definition || {};
        const detectedFromCreate = gridDefinition || payload?.grid_relative || {};
        console.log('📊 Extracted grid data:', detectedFromCreate);

        const fallbackVerticals = [0.5];
        const fallbackHorizontals = [0.5];

        // Use the latest-ref so we always call the freshest updateSmartFrameGridRelative
        // even if React re-rendered (and recreated the function) while we were awaiting.
        latestUpdateGridRef.current(
          markup.id,
          {
            verticals: Array.isArray(detectedFromCreate.verticals) && detectedFromCreate.verticals.length > 0 ? detectedFromCreate.verticals : fallbackVerticals,
            horizontals: Array.isArray(detectedFromCreate.horizontals) && detectedFromCreate.horizontals.length > 0 ? detectedFromCreate.horizontals : fallbackHorizontals
          },
          'auto_detect',
          'draft',
          gridDefinition
        );
      } catch (error) {
        console.warn('Smart frame detection failed, reverting to default grid:', error);
        latestUpdateGridRef.current(markup.id, { verticals: [0.5], horizontals: [0.5] }, 'fallback', 'draft');
      } finally {
        setDetectingSmartFrameIds(prev => prev.filter(id => id !== markup.id));
      }
    })();

    return true;
  }, [getMarkupPdfBBox, pageNumber, projectId, sheetId, updateSmartFrameGridRelative]);

  const addSmartFrameLine = useCallback((orientation) => {
    if (!selectedMarkup || selectedMarkup.type !== 'smart_frame') return;

    const currentGrid = selectedMarkup.smartFrame?.grid_relative || { verticals: [], horizontals: [] };
    const nextGrid = {
      verticals: [...(currentGrid.verticals || [])],
      horizontals: [...(currentGrid.horizontals || [])]
    };

    if (orientation === 'vertical') {
      nextGrid.verticals.push(0.5);
    } else {
      nextGrid.horizontals.push(0.5);
    }

    updateSmartFrameGridRelative(selectedMarkup.id, nextGrid, 'manual', 'draft');
  }, [selectedMarkup, updateSmartFrameGridRelative]);

  const confirmSelectedSmartFrame = useCallback(() => {
    if (!selectedMarkup || selectedMarkup.type !== 'smart_frame' || !selectedMarkup.smartFrame) return;
    setMarkups(prev => prev.map(markup => {
      if (markup.id !== selectedMarkup.id || !markup.smartFrame) return markup;
      return {
        ...markup,
        smartFrame: {
          ...markup.smartFrame,
          status: 'confirmed',
          confirmedAt: Date.now(),
          updatedAt: Date.now()
        }
      };
    }));
  }, [selectedMarkup, setMarkups]);

  const beginSmartFrameLineDrag = useCallback((event, markupId, orientation, index) => {
    event.preventDefault();
    event.stopPropagation();
    setSmartFrameLineDrag({ markupId, orientation, index });
  }, []);

  useEffect(() => {
    const smartFrames = localMarkups.filter(markup => (
      markup.type === 'smart_frame' && (!markup.pageNumber || markup.pageNumber === pageNumber)
    ));

    smartFrames.forEach((markup) => {
      if (processedSmartFramesRef.current.has(markup.id)) return;

      const started = startSmartFrameDetection(markup);
      if (started) {
        processedSmartFramesRef.current.add(markup.id);
      }
    });
  }, [localMarkups, pageNumber, startSmartFrameDetection]);

  const handleContextMenuAction = useCallback((option, data) => {
    const targetMarkup = contextMenu?.markup;
    if (!targetMarkup) {
      setContextMenu(null);
      return;
    }

    if (option === 'changeClass' && data) {
      const classConfig = GLAZING_CLASSES[data];
      if (classConfig) {
        setMarkups(prev => prev.map(markup => (
          markup.id === targetMarkup.id
            ? {
                ...markup,
                system: data,
                label: classConfig.label,
                color: classConfig.color
              }
            : markup
        )));
      }
    }

    if (option === 'copy') {
      setClipboardMarkup(JSON.parse(JSON.stringify(targetMarkup)));
    }

    if (option === 'paste' && clipboardMarkup) {
      const offset = 20 / Math.max(renderedScale, 0.1);
      const duplicatedMarkup = withCalibration({
        ...JSON.parse(JSON.stringify(clipboardMarkup)),
        id: `m_${Date.now()}`,
        points: clipboardMarkup.points?.map(point => ({
          x: point.x + offset,
          y: point.y + offset
        })) || [],
        path_points: clipboardMarkup.path_points?.map(point => ({
          x: point.x + offset,
          y: point.y + offset
        })),
        boundingBox: clipboardMarkup.boundingBox
          ? {
              ...clipboardMarkup.boundingBox,
              minX: clipboardMarkup.boundingBox.minX + offset,
              maxX: clipboardMarkup.boundingBox.maxX + offset,
              minY: clipboardMarkup.boundingBox.minY + offset,
              maxY: clipboardMarkup.boundingBox.maxY + offset
            }
          : undefined
      });
      setMarkups(prev => [...prev, duplicatedMarkup]);
      setSelectedIds([duplicatedMarkup.id]);
    }

    if (option === 'delete') {
      setMarkups(prev => prev.filter(markup => markup.id !== targetMarkup.id));
      setSelectedIds(prev => prev.filter(id => id !== targetMarkup.id));
    }

    if (option === 'structural' && (targetMarkup.type === 'Area' || targetMarkup.type === 'smart_frame')) {
      if (onSendToStructural) {
        const preparedMarkup = withCalibration({
          ...targetMarkup,
          framePreview: createFramePreview(targetMarkup)
        });
        onSendToStructural(preparedMarkup);
      }
    }

    setContextMenu(null);
  }, [contextMenu, clipboardMarkup, renderedScale, setMarkups, setSelectedIds, withCalibration, onSendToStructural, createFramePreview]);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#333' }}>
      
      {/* Note: Toolbar removed from here because it's now in the Workspace */}

      {/* The "Desk" (Viewport with subtle inner shadow for depth) */}
      <div 
        ref={containerRef}
        data-testid="pdf-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={toolDoubleClick}
        onContextMenu={handleContextMenu}
        style={{ 
            width: '100%', height: '100%', 
            position: 'relative', overflow: 'hidden', 
            cursor: (activeTool?.mode === 'Pan' || isPanning) ? 'grab' : 'crosshair',
            boxShadow: 'inset 0 0 20px #000' // Desk depth effect
        }}
      >
        {pdfPage && (
            // The "Paper" - white sheet on dark desk with crisp edge and heavy shadow
            <div style={{
                position: 'absolute',
                left: 0, top: 0,
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale / renderedScale})`,
                transformOrigin: '0 0',
                width: `${pdfPage.getViewport({ scale: renderedScale, rotation }).width}px`,
                height: `${pdfPage.getViewport({ scale: renderedScale, rotation }).height}px`,
                backgroundColor: 'white',           // Ensure paper is white even if PDF transparent
                border: '1px solid #999',           // Crisp edge definition like Bluebeam
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)' // Heavy lift shadow for depth
            }}>
                <canvas ref={canvasRef} />
                
                {/* GRID OVERLAY: Sits exactly on top of canvas, transforms with it */}
                {showGrid && <PDFGrid visible={true} scale={renderedScale} />}

                {/* SVG LAYER */}
                <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'auto' }}>
                    {/* Existing Markups - Filter by current page (legacy markups without pageNumber show on all pages) */}
                    {localMarkups.filter(m => !m.pageNumber || m.pageNumber === pageNumber).map(m => {
                      const isSmartFrame = m.type === 'smart_frame';
                      const isSelected = selectedIds.includes(m.id);
                      const shouldShowSmartFrameGrid = isSmartFrame && (isSelected || hoverMarkupId === m.id || smartFrameLineDrag?.markupId === m.id);
                      const displayPoints = m.path_points?.length ? m.path_points : m.points;
                      const polygonPoints = displayPoints?.length ? displayPoints : m.points;
                      const bounds = getMarkupBounds(m);
                      const clipPathId = isSmartFrame && polygonPoints?.length >= 3 ? `smart-frame-clip-${m.id}` : null;

                      // Calculate grid lines for Area markups (Layer 22)
                      const areaGridLines = [];
                      if (m.type === 'Area' && polygonPoints?.length >= 4 && (m.rows > 1 || m.cols > 1) && bounds) {
                        const scaledMinX = bounds.minX * renderedScale;
                        const scaledMaxX = bounds.maxX * renderedScale;
                        const scaledMinY = bounds.minY * renderedScale;
                        const scaledMaxY = bounds.maxY * renderedScale;
                        const scaledWidth = scaledMaxX - scaledMinX;
                        const scaledHeight = scaledMaxY - scaledMinY;

                        const cols = m.cols || 1;
                        for (let i = 1; i < cols; i++) {
                          const x = scaledMinX + (scaledWidth * i / cols);
                          areaGridLines.push(
                            <line
                              key={`${m.id}-v${i}`}
                              x1={x}
                              y1={scaledMinY}
                              x2={x}
                              y2={scaledMaxY}
                              stroke={m.color}
                              strokeWidth={1.5}
                              strokeDasharray="4,4"
                              opacity={0.6}
                            />
                          );
                        }

                        const rows = m.rows || 1;
                        for (let i = 1; i < rows; i++) {
                          const y = scaledMinY + (scaledHeight * i / rows);
                          areaGridLines.push(
                            <line
                              key={`${m.id}-h${i}`}
                              x1={scaledMinX}
                              y1={y}
                              x2={scaledMaxX}
                              y2={y}
                              stroke={m.color}
                              strokeWidth={1.5}
                              strokeDasharray="4,4"
                              opacity={0.6}
                            />
                          );
                        }
                      }

                      const smartFrameGridLines = [];
                      if (shouldShowSmartFrameGrid && bounds && m.smartFrame?.grid_relative) {
                        const scaledMinX = bounds.minX * renderedScale;
                        const scaledMaxX = bounds.maxX * renderedScale;
                        const scaledMinY = bounds.minY * renderedScale;
                        const scaledMaxY = bounds.maxY * renderedScale;
                        const scaledWidth = scaledMaxX - scaledMinX;
                        const scaledHeight = scaledMaxY - scaledMinY;

                        const verticals = m.smartFrame.grid_relative.verticals || [];
                        verticals.forEach((value, index) => {
                          const x = scaledMinX + (value * scaledWidth);
                          smartFrameGridLines.push(
                            <g key={`${m.id}-sf-v-${index}`}>
                              <line
                                x1={x}
                                y1={scaledMinY}
                                x2={x}
                                y2={scaledMaxY}
                                stroke="rgba(0,0,0,0)"
                                strokeWidth={14}
                                style={{ cursor: 'ew-resize', pointerEvents: 'all' }}
                                onMouseDown={(event) => beginSmartFrameLineDrag(event, m.id, 'vertical', index)}
                              />
                              <line
                                x1={x}
                                y1={scaledMinY}
                                x2={x}
                                y2={scaledMaxY}
                                stroke="#3b82f6"
                                strokeWidth={2}
                                strokeDasharray="7,5"
                                opacity={0.95}
                                style={{ pointerEvents: 'none' }}
                              />
                            </g>
                          );
                        });

                        const horizontals = m.smartFrame.grid_relative.horizontals || [];
                        horizontals.forEach((value, index) => {
                          const y = scaledMinY + (value * scaledHeight);
                          smartFrameGridLines.push(
                            <g key={`${m.id}-sf-h-${index}`}>
                              <line
                                x1={scaledMinX}
                                y1={y}
                                x2={scaledMaxX}
                                y2={y}
                                stroke="rgba(0,0,0,0)"
                                strokeWidth={14}
                                style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
                                onMouseDown={(event) => beginSmartFrameLineDrag(event, m.id, 'horizontal', index)}
                              />
                              <line
                                x1={scaledMinX}
                                y1={y}
                                x2={scaledMaxX}
                                y2={y}
                                stroke="#3b82f6"
                                strokeWidth={2}
                                strokeDasharray="7,5"
                                opacity={0.95}
                                style={{ pointerEvents: 'none' }}
                              />
                            </g>
                          );
                        });
                      }

                      const polygonPointString = polygonPoints?.length
                        ? polygonPoints.map(p => `${p.x * renderedScale},${p.y * renderedScale}`).join(' ')
                        : '';

                      return (
                        <g key={m.id}>
                          {clipPathId && polygonPointString && (
                            <defs>
                              <clipPath id={clipPathId}>
                                <polygon points={polygonPointString} />
                              </clipPath>
                            </defs>
                          )}
                          {polygonPointString && (
                            <polygon
                              points={polygonPointString}
                              fill={m.color}
                              fillOpacity={isSmartFrame ? (isSelected ? 0.28 : 0.15) : (isSelected ? 0.4 : 0.2)}
                              stroke={m.color}
                              strokeWidth={isSelected ? 3 : 2}
                              onClick={(e) => handleMarkupClick(e, m.id)}
                              onMouseEnter={() => setHoverMarkupId(m.id)}
                              onMouseLeave={() => setHoverMarkupId(prev => (prev === m.id ? null : prev))}
                              style={{ 
                                cursor: 'pointer',
                                pointerEvents: 'all'
                              }}
                            />
                          )}
                          {areaGridLines}
                          {smartFrameGridLines.length > 0 && (
                            <g clipPath={clipPathId ? `url(#${clipPathId})` : undefined}>
                              {smartFrameGridLines}
                            </g>
                          )}
                        </g>
                      );
                    })}
                    
                    {/* Snap Indicator (Always visible when tool active) */}
                    {renderSnapIndicator()}
                    
                    {/* Drawing Preview */}
                    {renderPreview()}

                    {/* Calibration Guide Line */}
                    {calibrationPoints.length > 0 && (
                      <g style={{ pointerEvents: 'none' }}>
                        <circle
                          cx={calibrationPoints[0].x * renderedScale}
                          cy={calibrationPoints[0].y * renderedScale}
                          r={6}
                          fill="#00bcd4"
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                        {calibrationPoints.length === 2 && (
                          <line
                            x1={calibrationPoints[0].x * renderedScale}
                            y1={calibrationPoints[0].y * renderedScale}
                            x2={calibrationPoints[1].x * renderedScale}
                            y2={calibrationPoints[1].y * renderedScale}
                            stroke="#00bcd4"
                            strokeWidth={2}
                            strokeDasharray="4,4"
                          />
                        )}
                      </g>
                    )}
                    
                    {/* Selection Overlay (On Top) */}
                    {selectedIds.length > 0 && (
                        <SelectionOverlay 
                            markup={localMarkups.find(m => m.id === selectedIds[0])}
                            scale={renderedScale}
                            onMouseDown={editMouseDown} // Handles Rotate/Move start
                        />
                    )}
                </svg>
            </div>
        )}
      </div>

      {selectedMarkup?.type === 'smart_frame' && selectedMarkup?.smartFrame && (
        <div style={{
          position: 'absolute',
          top: 14,
          right: 14,
          zIndex: 1500,
          background: 'rgba(18, 24, 32, 0.94)',
          border: '1px solid #36506f',
          borderRadius: 8,
          padding: '10px 12px',
          minWidth: 270,
          color: '#e5edf7',
          boxShadow: '0 8px 22px rgba(0,0,0,0.35)'
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#9ec7ff' }}>
            Smart Frame — Draw, Detect, Confirm
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8, color: '#b7c7d9' }}>
            <span>
              {selectedMarkup.smartFrame.status === 'confirmed' ? '✅ Confirmed' : '✏️ Draft'}
            </span>
            <span>
              {detectingSmartFrameIds.includes(selectedMarkup.id) ? '🔍 Detecting grid...' : 'Grid editable'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button
              onClick={() => addSmartFrameLine('vertical')}
              style={{ background: '#1f3a56', color: '#e5edf7', border: '1px solid #3d668f', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}
            >
              Add Vertical
            </button>
            <button
              onClick={() => addSmartFrameLine('horizontal')}
              style={{ background: '#1f3a56', color: '#e5edf7', border: '1px solid #3d668f', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}
            >
              Add Horizontal
            </button>
            <button
              onClick={confirmSelectedSmartFrame}
              style={{ background: '#1d5f3a', color: '#e5edf7', border: '1px solid #2f9158', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}
            >
              Confirm ↵
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#8fa8c3' }}>
            {selectedMarkup.smartFrame.overall_dims.width_inch.toFixed(1)}" × {selectedMarkup.smartFrame.overall_dims.height_inch.toFixed(1)}" • {selectedMarkup.smartFrame.grid.verticals.length}V / {selectedMarkup.smartFrame.grid.horizontals.length}H
          </div>
        </div>
      )}
      
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          markup={contextMenu.markup}
          onClose={() => setContextMenu(null)}
          onOptionSelect={handleContextMenuAction}
          canDuplicate={Boolean(clipboardMarkup)}
        />
      )}
      {/* Layer 22: Grid Toolbar for Area markups */}
      {showGridToolbar && selectedMarkup && (
        <GridToolbar
          markup={selectedMarkup}
          position={{ x: 100, y: 100 }}
          onUpdate={handleGridUpdate}
          onClose={() => setShowGridToolbar(false)}
        />
      )}
    </div>
  );
};

export default PDFViewer;
