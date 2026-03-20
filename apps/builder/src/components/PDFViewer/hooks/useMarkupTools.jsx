import { useState, useEffect, useCallback, useRef } from 'react';
import { TOOL_MODES, MARKUP_SETTINGS } from '../../constants';

const computeBoundingBox = (points = []) => {
  if (!points.length) return null;
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
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
};

const useMarkupTools = (activeTool, scale, onMarkupCreated, getNearestSnapPoint, pageNumber) => {
  const [drawingPath, setDrawingPath] = useState([]); 
  const [cursorPos, setCursorPos] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [snapIndicator, setSnapIndicator] = useState(null); // For green snap box
  
  const pathRef = useRef(drawingPath);
  useEffect(() => { pathRef.current = drawingPath; }, [drawingPath]);

  const isDrawingTool = activeTool && activeTool.mode && activeTool.mode !== 'Pan' && activeTool.mode !== 'Select';
  const isCountTool = activeTool?.mode === TOOL_MODES.COUNT;

  // Helper to finish drawing
  const finishDrawing = useCallback((points, closeLoop) => {
    if (!points || points.length === 0) return;
    
    const isArea = activeTool.mode === TOOL_MODES.AREA;
    const isSmartFrame = activeTool.mode === TOOL_MODES.SMART_FRAME;
    const closedPoints = closeLoop ? [...points, points[0]] : points;
    const smartFramePath = isSmartFrame && Array.isArray(points)
      ? points.map(point => ({ ...point }))
      : undefined;
    const smartFrameBounds = isSmartFrame && smartFramePath?.length
      ? computeBoundingBox(smartFramePath)
      : null;
    
    const newMarkup = {
      id: `m_${Date.now()}`,
      type: isSmartFrame ? 'smart_frame' : activeTool.mode,
      system: activeTool.system,
      label: activeTool.label,
      color: activeTool.color,
      layer: activeTool.layer,
      points: closedPoints,
      path_points: smartFramePath,
      boundingBox: smartFrameBounds || undefined,
      pageNumber: pageNumber,
      // Layer 22: Add grid properties for Area markups
      rows: isArea ? 1 : undefined,
      cols: isArea ? 1 : undefined
    };
    onMarkupCreated(newMarkup);
    setDrawingPath([]);
    setCursorPos(null);
    setDragStart(null);
  }, [activeTool, onMarkupCreated, pageNumber]);

  // Helper to add point to path
  const addPointToPath = useCallback((x, y) => {
    const actsAsArea = activeTool.mode === TOOL_MODES.AREA || activeTool.mode === TOOL_MODES.HIGHLIGHT || activeTool.mode === TOOL_MODES.SMART_FRAME;
    
    // Check if clicking near start (close polygon)
    if (actsAsArea && drawingPath.length > 2) {
      const startPoint = drawingPath[0];
      const dist = Math.hypot(x - startPoint.x, y - startPoint.y);
      const snapThreshold = MARKUP_SETTINGS.SNAP_THRESHOLD / scale;
      
      if (dist < snapThreshold) {
        finishDrawing(drawingPath, true);
        return;
      }
    }
    
    setDrawingPath(prev => [...prev, { x, y }]);
  }, [activeTool, drawingPath, scale, finishDrawing]);

  // 1. MOUSE DOWN
  const handleMouseDown = useCallback((x, y) => {
    if (!isDrawingTool) return;

    // Check for snap
    let finalPos = { x, y };
    if (getNearestSnapPoint) {
      const snapped = getNearestSnapPoint(x, y);
      if (snapped) finalPos = snapped;
    }

    if (isCountTool) {
      finishDrawing([finalPos], false);
      return;
    }

    if (drawingPath.length === 0) {
      setDragStart(finalPos);
      setDrawingPath([finalPos]);
    } else {
      addPointToPath(finalPos.x, finalPos.y);
    }
  }, [isDrawingTool, isCountTool, drawingPath.length, finishDrawing, addPointToPath, getNearestSnapPoint]);

  // 2. MOUSE MOVE
  const handleMouseMove = useCallback((x, y) => {
    if (!isDrawingTool) return;
    
    // Check for snap and update indicator
    let finalPos = { x, y };
    let snapped = null;
    if (getNearestSnapPoint) {
      snapped = getNearestSnapPoint(x, y);
      if (snapped) finalPos = snapped;
    }
    
    setSnapIndicator(snapped);
    setCursorPos(finalPos);
  }, [isDrawingTool, getNearestSnapPoint]);

  // 3. MOUSE UP
  const handleMouseUp = useCallback((x, y) => {
    if (!dragStart) return;

    // Check for snap
    let finalPos = { x, y };
    if (getNearestSnapPoint) {
      const snapped = getNearestSnapPoint(x, y);
      if (snapped) finalPos = snapped;
    }

    const dist = Math.hypot(finalPos.x - dragStart.x, finalPos.y - dragStart.y);
    const dragThreshold = 10 / scale;

    if (dist > dragThreshold) {
      const isRectTool = activeTool.mode === TOOL_MODES.AREA || activeTool.mode === TOOL_MODES.HIGHLIGHT || activeTool.mode === TOOL_MODES.SMART_FRAME;
      const isLineTool = activeTool.mode === TOOL_MODES.POLYLINE;

      if (isRectTool) {
        const p1 = dragStart;
        const p3 = finalPos;
        const p2 = { x: p3.x, y: p1.y };
        const p4 = { x: p1.x, y: p3.y };
        finishDrawing([p1, p2, p3, p4], true);
      } else if (isLineTool) {
        finishDrawing([dragStart, finalPos], false);
      }
    }

    setDragStart(null);
  }, [dragStart, scale, activeTool, finishDrawing, getNearestSnapPoint]);

  // 4. DOUBLE CLICK
  const handleDoubleClick = useCallback((e) => {
    e?.preventDefault();
    if (!isDrawingTool || pathRef.current.length < 2) return;
    const actsAsArea = activeTool.mode === TOOL_MODES.AREA || activeTool.mode === TOOL_MODES.HIGHLIGHT || activeTool.mode === TOOL_MODES.SMART_FRAME;
    finishDrawing(pathRef.current, actsAsArea);
  }, [activeTool, isDrawingTool, finishDrawing]);

  // 5. RENDER PREVIEW
  const renderPreview = () => {
    if (drawingPath.length === 0 || !cursorPos) return null;

    const strokeColor = activeTool.color || 'blue';
    const isArea = activeTool.mode === TOOL_MODES.AREA || activeTool.mode === TOOL_MODES.HIGHLIGHT || activeTool.mode === TOOL_MODES.SMART_FRAME;

    let pointsToRender = [...drawingPath];

    if (dragStart && isArea) {
      const p1 = dragStart;
      const p3 = cursorPos;
      const p2 = { x: p3.x, y: p1.y };
      const p4 = { x: p1.x, y: p3.y };
      pointsToRender = [p1, p2, p3, p4];
    } else {
      pointsToRender.push(cursorPos);
    }

    // Calculate area in square feet for display (if calibration available)
    let areaDisplayText = null;
    let areaCenterX = 0;
    let areaCenterY = 0;
    if (isArea && pointsToRender.length >= 3) {
      // Calculate polygon area using shoelace formula (in pixels)
      let pixelArea = 0;
      for (let i = 0; i < pointsToRender.length; i++) {
        const j = (i + 1) % pointsToRender.length;
        pixelArea += pointsToRender[i].x * pointsToRender[j].y;
        pixelArea -= pointsToRender[j].x * pointsToRender[i].y;
      }
      pixelArea = Math.abs(pixelArea) / 2;
      
      // Calculate center for label positioning
      const xs = pointsToRender.map(p => p.x);
      const ys = pointsToRender.map(p => p.y);
      areaCenterX = (Math.min(...xs) + Math.max(...xs)) / 2 * scale;
      areaCenterY = (Math.min(...ys) + Math.max(...ys)) / 2 * scale;
      
      // Convert to SF if we have a square per foot measurement (72 pixels = 1 inch at default, 864 = 1 foot)
      // For now show pixel area as indicative value
      const approximateSF = (pixelArea / (72 * 72 * 144)).toFixed(1); // Rough conversion
      areaDisplayText = `${approximateSF} SF`;
    }

    return (
      <g style={{ pointerEvents: 'none' }}>
        <polyline 
          points={pointsToRender.map(p => `${p.x * scale},${p.y * scale}`).join(' ')}
          fill={isArea ? strokeColor : "none"}
          fillOpacity={isArea ? 0.2 : 0}
          stroke={strokeColor}
          strokeWidth={MARKUP_SETTINGS.LINE_WIDTH}
          strokeDasharray={dragStart ? "0" : "5,5"}
        />
        {!dragStart && drawingPath.map((p, i) => (
          <rect 
            key={i}
            x={(p.x * scale) - 4}
            y={(p.y * scale) - 4}
            width={8}
            height={8}
            fill="yellow"
            stroke="black"
          />
        ))}
        {/* Area Measurement Display */}
        {areaDisplayText && (
          <text
            data-testid="area-measurement"
            x={areaCenterX}
            y={areaCenterY}
            fill="white"
            stroke="black"
            strokeWidth={0.5}
            fontSize={14}
            fontWeight="bold"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {areaDisplayText}
          </text>
        )}
      </g>
    );
  };

  // 6. RENDER SNAP INDICATOR (Always visible when tool is active)
  const renderSnapIndicator = () => {
    if (!snapIndicator || !isDrawingTool) return null;
    
    // Bluebeam-style: filled box for points, unfilled for lines
    const isPointSnap = snapIndicator.type === 'point';
    
    return (
      <g style={{ pointerEvents: 'none' }}>
        <rect 
          x={(snapIndicator.x * scale) - 6}
          y={(snapIndicator.y * scale) - 6}
          width={12}
          height={12}
          fill={isPointSnap ? '#00ff00' : 'none'}
          fillOpacity={isPointSnap ? 0.3 : 0}
          stroke="#00ff00"
          strokeWidth={2}
        />
      </g>
    );
  };

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    renderPreview,
    renderSnapIndicator,
    isDrawing: drawingPath.length > 0
  };
};

export default useMarkupTools;
