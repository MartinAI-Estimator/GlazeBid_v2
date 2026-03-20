import React, { useState, useEffect, useRef } from 'react';
import OpenSeadragon from 'openseadragon';
import ToolPalette from './ToolPalette';
import CalibrationDialog from './CalibrationDialog';
import { ZoomIn, ZoomOut, Home, Maximize2, Hand } from 'lucide-react';
import { GLAZING_CLASSES, TOOL_MODES } from './constants';

const SheetViewer = ({ project, sheetId }) => {
  const viewerRef = useRef(null);
  const [activeMarkup, setActiveMarkup] = useState(null);
  const [allMarkups, setAllMarkups] = useState([]);
  const [updateTrigger, setUpdateTrigger] = useState(0); // Forces SVG to re-render on zoom

  // Add these state variables if not already present
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [snapPoints, setSnapPoints] = useState([]);
  const [currentMode, setCurrentMode] = useState(null); // 'Highlight', 'Polyline', 'Area', 'Count'
  const [currentClassName, setCurrentClassName] = useState('Storefront'); // Default glazing class
  const [currentFrameDesignation, setCurrentFrameDesignation] = useState(''); // Frame designation (e.g., "A", "F", "B")
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [scale, setScale] = useState(null); // pixels per foot
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const [tempCalibrationDistance, setTempCalibrationDistance] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  // Helper to save markup to backend
  const saveMarkupToBackend = async (markup) => {
    try {
      await fetch('http://127.0.0.1:8000/save-markup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project,
          sheet: typeof sheetId === 'object' ? sheetId.id : sheetId,
          markup
        })
      });
      console.log('Markup saved:', markup);
    } catch (err) {
      console.error('Failed to save markup:', err);
    }
  };

  // Helper to save scale to backend
  const saveScaleToBackend = async (scaleValue) => {
    try {
      await fetch('http://127.0.0.1:8000/save-scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project,
          sheet: typeof sheetId === 'object' ? sheetId.id : sheetId,
          scale: scaleValue
        })
      });
      console.log('Scale saved:', scaleValue);
    } catch (err) {
      console.error('Failed to save scale:', err);
    }
  };

  // --- Add the getSnappedPoint function here ---
  const getSnappedPoint = (imagePoint) => {
    // 1. If we aren't using a tool or have no points, just return the mouse spot
    if (!isCalibrating || !snapPoints.length) return imagePoint; 

    let nearest = imagePoint;

    // 2. DYNAMIC GRAVITY: This was the key logic in your snippet.
    // It calculates the 'magnet' radius based on the current zoom.
    let minDistance = 20 / viewerRef.current.viewport.getZoom(); 

    snapPoints.forEach(pt => {
      // Standard distance math: a^2 + b^2 = c^2
      const dist = Math.sqrt(Math.pow(pt.x - imagePoint.x, 2) + Math.pow(pt.y - imagePoint.y, 2));
      if (dist < minDistance) {
        minDistance = dist;
        nearest = pt;
      }
    });

    return nearest;
  };

  // Calibration Logic - Calculates pixels per foot scale
  const handleCalibration = (snappedPoint) => {
    const newPoints = [...calibrationPoints, snappedPoint];
    
    if (newPoints.length === 2) {
      // 1. Calculate pixel distance (a² + b² = c²)
      const dx = newPoints[1].x - newPoints[0].x;
      const dy = newPoints[1].y - newPoints[0].y;
      const pixelDist = Math.sqrt(dx * dx + dy * dy);

      // 2. Ask user for the real-world distance
      const realDist = prompt("Enter the distance in feet (e.g., 4.5 for 4' 6\"):");
      
      if (realDist) {
        const newScale = pixelDist / parseFloat(realDist);
        setScale(newScale); // pixels per foot
        saveScaleToBackend(newScale); // Save so you don't have to re-calibrate
        alert(`Scale Set: ${newScale.toFixed(2)} pixels per foot.`);
      }
      
      setIsCalibrating(false);
      setCalibrationPoints([]);
    } else {
      setCalibrationPoints(newPoints);
    }
  };

  // Calculate Final Takeoff Data - Converts pixels to real units
  const calculateFinalData = (points, mode, scaleValue) => {
    if (!scaleValue || scaleValue === 0) return 0;

    if (mode === "Polyline") {
      let totalPixels = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i+1].x - points[i].x;
        const dy = points[i+1].y - points[i].y;
        totalPixels += Math.sqrt(dx * dx + dy * dy);
      }
      return (totalPixels / scaleValue).toFixed(2); // Returns Linear Feet (LF)
    }

    if (mode === "Area") {
      let areaPixels = 0;
      for (let i = 0; i < points.length; i++) {
        let j = (i + 1) % points.length;
        areaPixels += points[i].x * points[j].y;
        areaPixels -= points[j].x * points[i].y;
      }
      const sqFt = (Math.abs(areaPixels) / 2) / (scaleValue * scaleValue);
      return sqFt.toFixed(2); // Returns Square Feet (SF)
    }
    
    return 1; // Count defaults to 1 EA
  };

  // Count Tool Click Handler
  const handleCountClick = (snappedPoint, glazingClass) => {
    const newCountMarkup = {
      id: `count-${Date.now()}`,
      mode: 'Count',
      class: glazingClass,
      points: [snappedPoint], // A count is just a single point
      color: GLAZING_CLASSES[glazingClass]?.color || 'red',
      value: 1, // Each click equals 1 unit
    };

    setAllMarkups(prev => [...prev, newCountMarkup]);
    
    // Send to backend immediately so you don't lose data if the browser crashes
    saveMarkupToBackend(newCountMarkup);
  };

  // Canvas Click Handler - Differentiates between Count (stamp) and Line/Area (drawing)
  const handleStageClick = (event) => {
    if (!viewerRef.current) return;

    // Get the click position in viewport coordinates
    const viewportPoint = viewerRef.current.viewport.pointFromPixel(event.position);
    // Convert to image coordinates
    const imagePoint = viewerRef.current.viewport.viewportToImageCoordinates(viewportPoint);
    
    // Apply snap point logic
    const snappedPoint = getSnappedPoint(imagePoint);

    // Handle calibration mode first
    if (isCalibrating) {
      handleCalibration(snappedPoint);
      return;
    }

    // Regular tool modes
    if (!currentMode) return;

    // Handle different tool modes
    if (currentMode === 'Count') {
      const newCount = {
        id: `count-${Date.now()}`,
        mode: 'Count',
        class: currentClassName, // e.g., 'STOREFRONT' or 'HARDWARE'
        points: [snappedPoint],  // Just one coordinate
        color: GLAZING_CLASSES[currentClassName]?.color || 'red',
        value: 1,
        frameDesignation: currentFrameDesignation || '',  // Frame designation (e.g., "A", "F")
        timestamp: new Date().toISOString()
      };
      
      setAllMarkups(prev => [...prev, newCount]);
      
      // Send to backend immediately so you don't lose data if the browser crashes
      saveMarkupToBackend(newCount);
    } else {
      // Existing Polyline/Area logic (setActiveMarkup, etc.)
      // TODO: Add Line and Area drawing logic here
      console.log('Drawing mode:', currentMode, 'Point:', snappedPoint);
    }
  };

  useEffect(() => {
    if (!project || !sheetId) {
      console.warn("SheetViewer: Missing project or sheetId", { project, sheetId });
      return;
    }

    const sheetIdSafe = typeof sheetId === 'object' ? sheetId.id : sheetId;
    const encodedProject = encodeURIComponent(project);
    const encodedSheetId = encodeURIComponent(sheetIdSafe);
    const tileUrl = `http://127.0.0.1:8000/tiles/${encodedProject}/${encodedSheetId}/map.dzi`;
    
    // To debug: See what the app is TRYING to load
    console.log("Current Tile URL:", tileUrl);
    console.log("Project:", project, "SheetId:", sheetIdSafe);

    // 1. Initialize OSD with "Extreme Zoom" settings
    setIsLoading(true);
    setLoadProgress(0);
    
    viewerRef.current = OpenSeadragon({
      id: "openseadragon-viewer",
      tileSources: tileUrl,
      
      // DISABLE DEFAULT CONTROLS (we have custom ones now)
      showNavigationControl: false,   // Removes the default zoom/home/fullscreen buttons
      showNavigator: false,            // Removes the mini-map navigator
      
      // THE "DEEP ZOOM" ENGINE - extracted from your snippet
      maxZoomPixelRatio: 20,       // Allows you to zoom in 20x further than standard
      defaultZoomLevel: 1,
      minZoomLevel: 0.1,
      
      // PERFORMANCE & ACCURACY
      imageSmoothEnabled: false,    // Critical! Keeps lines sharp (blocky) instead of blurry
      animationTime: 0.5,           
      
      // MEASUREMENT CONTROLS
      clickToZoom: false,           // Prevents the screen from jumping when you click to measure
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: false       // Important: double-click is for finishing a line, not zooming
      }
    });

    // 2. Track tile loading progress
    viewerRef.current.addHandler('open', () => {
      setLoadProgress(50);
    });
    
    viewerRef.current.addHandler('tile-loaded', () => {
      setLoadProgress(prev => Math.min(prev + 2, 95));
    });
    
    viewerRef.current.addHandler('tile-drawing', () => {
      setIsLoading(false);
      setLoadProgress(100);
    });
    
    // 3. Sync SVG to Zoom/Pan
    const syncOverlay = () => setUpdateTrigger(v => v + 1);
    viewerRef.current.addHandler('animation', syncOverlay);
    viewerRef.current.addHandler('canvas-drag', syncOverlay);
    viewerRef.current.addHandler('canvas-scroll', syncOverlay);

    // 4. Add click handler for takeoff tools
    viewerRef.current.addHandler('canvas-click', handleStageClick);

    return () => {
      if (viewerRef.current) viewerRef.current.destroy();
    };
  }, [project, sheetId]);

  // Keyboard Shortcuts - The "Estimator's Speed"
  useEffect(() => {
    const handleKeys = (e) => {
      if (e.key.toLowerCase() === 'c') setCurrentMode('Count');
      if (e.key.toLowerCase() === 'p') setCurrentMode('Polyline');
      if (e.key.toLowerCase() === 'a') setCurrentMode('Area');
      if (e.key.toLowerCase() === 'x') {
        setIsCalibrating(true);
        setCurrentMode(null);
        setCalibrationPoints([]);
        alert('Calibration Mode: Click two points on a known dimension.');
      }
      // Class shortcuts
      if (e.key.toLowerCase() === 's') setCurrentClassName('STOREFRONT');
      if (e.key.toLowerCase() === 'w') setCurrentClassName('WINDOW WALL');
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, []);

  // Helper to convert Drawing Pixels to Screen Pixels
  const getScreenPos = (point) => {
    if (!viewerRef.current) return { x: 0, y: 0 };
    const viewportPt = viewerRef.current.viewport.imageToViewportCoordinates(point.x, point.y);
    return viewerRef.current.viewport.pixelFromPoint(viewportPt);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      
      {/* LOADING INDICATOR */}
      {isLoading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingSpinner}>
            <div style={styles.spinner}></div>
            <p style={styles.loadingText}>Loading Drawing...</p>
            <div style={styles.progressBar}>
              <div style={{...styles.progressFill, width: `${loadProgress}%`}}></div>
            </div>
            <p style={styles.progressText}>{loadProgress}%</p>
          </div>
        </div>
      )}
      
      {/* ZOOM CONTROLS - Top Right */}
      <div style={{
        position: 'absolute', 
        top: 20, 
        right: 20, 
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        backgroundColor: '#15191e',
        padding: '8px',
        borderRadius: '8px',
        border: '1px solid #2d333b'
      }}>
        <button 
          onClick={() => viewerRef.current?.viewport.zoomBy(1.5)}
          style={styles.zoomBtn}
          title="Zoom In"
        >
          <ZoomIn size={20} />
        </button>
        <button 
          onClick={() => viewerRef.current?.viewport.zoomBy(0.67)}
          style={styles.zoomBtn}
          title="Zoom Out"
        >
          <ZoomOut size={20} />
        </button>
        <button 
          onClick={() => viewerRef.current?.viewport.goHome()}
          style={styles.zoomBtn}
          title="Fit to Screen"
        >
          <Home size={20} />
        </button>
        <button 
          onClick={() => {
            setIsPanning(!isPanning);
            if (viewerRef.current) {
              viewerRef.current.setMouseNavEnabled(!isPanning);
            }
          }}
          style={{
            ...styles.zoomBtn,
            backgroundColor: isPanning ? '#00a3ff' : 'transparent'
          }}
          title="Pan Tool"
        >
          <Hand size={20} />
        </button>
      </div>
      
      {/* TOOL PALETTE - Right Side */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '100%',
        width: '320px',
        backgroundColor: '#15191e',
        borderLeft: '1px solid #2d333b',
        zIndex: 50,
        overflowY: 'auto',
      }}>
        <ToolPalette 
          currentMode={currentMode}
          currentClass={currentClassName}
          onModeChange={setCurrentMode}
          onClassChange={setCurrentClassName}
          onCalibrate={() => setShowCalibrationDialog(true)}
          scale={scale}
        />
      </div>
      
      {/* CALIBRATION DIALOG */}
      {showCalibrationDialog && (
        <CalibrationDialog
          onClose={() => setShowCalibrationDialog(false)}
          onConfirm={(feet, inches, pixelDistance) => {
            const totalInches = (feet * 12) + inches;
            const ppi = pixelDistance / totalInches;
            setScale(ppi);
            saveScaleToBackend(ppi);
            setShowCalibrationDialog(false);
          }}
          pixelDistance={tempCalibrationDistance}
        />
      )}

      {/* THE MARKUP LAYER (The Glass Pane) */}
      <svg style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        zIndex: 50, pointerEvents: 'none', overflow: 'visible'
      }}>
        {/* Render Count Markups */}
        {allMarkups.filter(m => m.mode === 'Count').map((m) => {
          const s = getScreenPos(m.points[0]); // Your existing coordinate sync function
          return (
            <g key={m.id} style={{ pointerEvents: 'none' }}>
              {/* Outer Ring for visibility */}
              <circle cx={s.x} cy={s.y} r="8" fill="none" stroke={m.color} strokeWidth="1" strokeOpacity="0.5" />
              
              {/* The "X" Stamp */}
              <line x1={s.x - 5} y1={s.y - 5} x2={s.x + 5} y2={s.y + 5} stroke={m.color} strokeWidth="2" />
              <line x1={s.x + 5} y1={s.y - 5} x2={s.x - 5} y2={s.y + 5} stroke={m.color} strokeWidth="2" />
              
              {/* Small center dot for precision */}
              <circle cx={s.x} cy={s.y} r="1.5" fill={m.color} />
            </g>
          );
        })}
        
        {/* Render Calibration Points */}
        {calibrationPoints.map((pt, i) => {
          const s = getScreenPos(pt);
          return (
            <g key={`cal-${i}`}>
              <circle cx={s.x} cy={s.y} r="6" fill="yellow" stroke="black" strokeWidth="2" />
              <text x={s.x + 10} y={s.y - 10} fill="yellow" fontSize="14" fontWeight="bold">
                {i + 1}
              </text>
            </g>
          );
        })}
        
        {/* Render lines/polylines for other markup types */}
        {allMarkups.filter(m => m.mode !== 'Count').map((m, i) => {
          const pointsString = m.points.map(p => {
            const viewportPt = viewerRef.current.viewport.imageToViewportCoordinates(p.x, p.y);
            const pixelPt = viewerRef.current.viewport.pixelFromPoint(viewportPt);
            return `${pixelPt.x},${pixelPt.y}`;
          }).join(' ');

          return (
            <polyline
              key={i}
              points={pointsString}
              fill="none"
              stroke={m.color}
              strokeWidth="3"
              style={{ pointerEvents: 'none' }}
            />
          );
        })}
        {/* Active line logic here... */}
      </svg>

      {/* THE DRAWING LAYER (The Bottom Layer) */}
      <div id="openseadragon-viewer" style={{ 
        width: '100%', 
        height: '100%', 
        backgroundColor: '#222',
        position: 'relative',
        zIndex: 1
      }} />

    </div>
  );
};

const styles = {
  zoomBtn: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    color: '#ffffff',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11, 14, 17, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  loadingSpinner: {
    textAlign: 'center',
    color: '#ffffff',
  },
  spinner: {
    border: '4px solid #2d333b',
    borderTop: '4px solid #00a3ff',
    borderRadius: '50%',
    width: '60px',
    height: '60px',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px',
  },
  loadingText: {
    fontSize: '16px',
    marginBottom: '20px',
    color: '#9ea7b3',
  },
  progressBar: {
    width: '300px',
    height: '6px',
    backgroundColor: '#2d333b',
    borderRadius: '3px',
    overflow: 'hidden',
    margin: '0 auto 10px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00a3ff',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '14px',
    color: '#00a3ff',
    fontWeight: 'bold',
  },
};

export default SheetViewer;

