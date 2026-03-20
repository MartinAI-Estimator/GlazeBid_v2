import { useState, useCallback } from 'react';

/**
 * Hook for Vertex-level editing of markup points
 * Allows dragging individual points, adding new vertices, and deleting vertices
 */
const useVertexEdit = (markups, setMarkups, scale) => {
  const [vertexEditMode, setVertexEditMode] = useState(null); // { markupId, dragIndex } or null
  const [hoverVertex, setHoverVertex] = useState(null); // { markupId, index } or null

  // Enter vertex edit mode for a markup (double-click)
  const enterVertexMode = useCallback((markupId) => {
    setVertexEditMode({ markupId, dragIndex: null });
  }, []);

  // Exit vertex edit mode
  const exitVertexMode = useCallback(() => {
    setVertexEditMode(null);
    setHoverVertex(null);
  }, []);

  // Check if mouse is near a vertex
  const checkVertexHit = useCallback((x, y, points) => {
    const hitRadius = 10 / scale; // 10px hit radius
    
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const dist = Math.hypot(x - p.x, y - p.y);
      if (dist < hitRadius) {
        return i;
      }
    }
    return null;
  }, [scale]);

  // Start dragging a vertex
  const startVertexDrag = useCallback((markupId, x, y) => {
    if (!vertexEditMode || vertexEditMode.markupId !== markupId) return false;

    const markup = markups.find(m => m.id === markupId);
    if (!markup) return false;

    const vertexIndex = checkVertexHit(x, y, markup.points);
    if (vertexIndex !== null) {
      setVertexEditMode({ markupId, dragIndex: vertexIndex });
      return true;
    }
    return false;
  }, [vertexEditMode, markups, checkVertexHit]);

  // Drag vertex to new position
  const dragVertex = useCallback((x, y) => {
    if (!vertexEditMode || vertexEditMode.dragIndex === null) return;

    setMarkups(prev => prev.map(m => {
      if (m.id !== vertexEditMode.markupId) return m;

      const newPoints = [...m.points];
      newPoints[vertexEditMode.dragIndex] = { x, y };

      // If it's the first point of a closed polygon, update the last point too
      if (vertexEditMode.dragIndex === 0 && 
          newPoints.length > 1 && 
          newPoints[0].x === newPoints[newPoints.length - 1].x &&
          newPoints[0].y === newPoints[newPoints.length - 1].y) {
        newPoints[newPoints.length - 1] = { x, y };
      }

      return { ...m, points: newPoints };
    }));
  }, [vertexEditMode, setMarkups]);

  // End vertex drag
  const endVertexDrag = useCallback(() => {
    if (vertexEditMode) {
      setVertexEditMode({ ...vertexEditMode, dragIndex: null });
    }
  }, [vertexEditMode]);

  // Add new vertex between two existing ones
  const addVertex = useCallback((markupId, x, y) => {
    const markup = markups.find(m => m.id === markupId);
    if (!markup) return;

    // Find closest edge (between two consecutive points)
    let closestEdge = null;
    let minDist = Infinity;
    const insertThreshold = 15 / scale; // 15px threshold

    for (let i = 0; i < markup.points.length - 1; i++) {
      const p1 = markup.points[i];
      const p2 = markup.points[i + 1];

      // Distance from point to line segment
      const A = x - p1.x;
      const B = y - p1.y;
      const C = p2.x - p1.x;
      const D = p2.y - p1.y;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      const param = lenSq !== 0 ? dot / lenSq : -1;

      let xx, yy;

      if (param < 0) {
        xx = p1.x;
        yy = p1.y;
      } else if (param > 1) {
        xx = p2.x;
        yy = p2.y;
      } else {
        xx = p1.x + param * C;
        yy = p1.y + param * D;
      }

      const dist = Math.hypot(x - xx, y - yy);

      if (dist < minDist) {
        minDist = dist;
        closestEdge = { index: i, insertPoint: { x: xx, y: yy } };
      }
    }

    if (closestEdge && minDist < insertThreshold) {
      setMarkups(prev => prev.map(m => {
        if (m.id !== markupId) return m;

        const newPoints = [...m.points];
        newPoints.splice(closestEdge.index + 1, 0, closestEdge.insertPoint);
        return { ...m, points: newPoints };
      }));
    }
  }, [markups, setMarkups, scale]);

  // Delete a vertex
  const deleteVertex = useCallback((markupId, vertexIndex) => {
    setMarkups(prev => prev.map(m => {
      if (m.id !== markupId) return m;

      // Don't allow deleting if only 2 points left (minimum for line)
      if (m.points.length <= 2) return m;

      const newPoints = m.points.filter((_, i) => i !== vertexIndex);

      // If first point was deleted and it was a closed polygon, update last point
      if (vertexIndex === 0 && 
          m.points.length > 1 &&
          m.points[0].x === m.points[m.points.length - 1].x &&
          m.points[0].y === m.points[m.points.length - 1].y) {
        newPoints[newPoints.length - 1] = newPoints[0];
      }

      return { ...m, points: newPoints };
    }));
  }, [setMarkups]);

  // Update hover state
  const updateHover = useCallback((markupId, x, y) => {
    if (!vertexEditMode || vertexEditMode.markupId !== markupId) return;

    const markup = markups.find(m => m.id === markupId);
    if (!markup) return;

    const vertexIndex = checkVertexHit(x, y, markup.points);
    if (vertexIndex !== null) {
      setHoverVertex({ markupId, index: vertexIndex });
    } else {
      setHoverVertex(null);
    }
  }, [vertexEditMode, markups, checkVertexHit]);

  // Render vertex handles
  const renderVertexHandles = (markupId) => {
    if (!vertexEditMode || vertexEditMode.markupId !== markupId) return null;

    const markup = markups.find(m => m.id === markupId);
    if (!markup) return null;

    const handleSize = 8;

    return (
      <g>
        {/* Polyline connecting all points */}
        <polyline
          points={markup.points.map(p => `${p.x * scale},${p.y * scale}`).join(' ')}
          fill="none"
          stroke="#FF9800"
          strokeWidth={2}
          strokeDasharray="5,5"
          pointerEvents="none"
        />

        {/* Vertex handles */}
        {markup.points.map((p, i) => {
          const isHovered = hoverVertex?.markupId === markupId && hoverVertex?.index === i;
          const isDragging = vertexEditMode.dragIndex === i;

          return (
            <g key={i}>
              {/* Hit area */}
              <circle
                cx={p.x * scale}
                cy={p.y * scale}
                r={12}
                fill="transparent"
                style={{ cursor: 'move' }}
              />
              {/* Visible handle */}
              <circle
                cx={p.x * scale}
                cy={p.y * scale}
                r={handleSize / 2}
                fill={isDragging ? '#FF5722' : isHovered ? '#FF9800' : '#fff'}
                stroke="#FF9800"
                strokeWidth={2}
                pointerEvents="none"
              />
              {/* Vertex number */}
              <text
                x={p.x * scale}
                y={(p.y * scale) - 15}
                fontSize="10"
                fill="#FF9800"
                textAnchor="middle"
                pointerEvents="none"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return {
    vertexEditMode,
    isVertexEditing: vertexEditMode !== null,
    enterVertexMode,
    exitVertexMode,
    startVertexDrag,
    dragVertex,
    endVertexDrag,
    addVertex,
    deleteVertex,
    updateHover,
    renderVertexHandles
  };
};

export default useVertexEdit;
