import { useState, useCallback, useEffect } from 'react';

const computeBoundsFromPoints = (points = []) => {
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

const useMarkupEdit = (markups, setMarkups, scale, activeTool) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [modifyType, setModifyType] = useState(null); // 'move', 'resize', 'rotate'
  const [initialMarkupState, setInitialMarkupState] = useState(null);

  // 1. GLOBAL ESCAPE & DELETE LISTENER
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedIds.length === 0) return;

      // ESCAPE: Deselect
      if (e.key === 'Escape') {
        setSelectedIds([]);
      }

      // DELETE/BACKSPACE: Remove Markup
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setMarkups(prev => prev.filter(m => !selectedIds.includes(m.id)));
        setSelectedIds([]);
      }

      // ARROW KEYS: Nudge (1 inch logical push)
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
                const nudge = e.shiftKey ? 10 : 1; // 1px or 10px
                const dx = e.key === 'ArrowRight' ? nudge : e.key === 'ArrowLeft' ? -nudge : 0;
                const dy = e.key === 'ArrowDown' ? nudge : e.key === 'ArrowUp' ? -nudge : 0;
                const deltaX = dx / scale;
                const deltaY = dy / scale;

                setMarkups(prev => prev.map(m => {
                     if (!selectedIds.includes(m.id)) return m;
                     const movedPoints = m.points?.map(p => ({ x: p.x + deltaX, y: p.y + deltaY })) || [];
                     const movedPathPoints = m.path_points?.map(p => ({ x: p.x + deltaX, y: p.y + deltaY }));
                     return {
                             ...m,
                             points: movedPoints,
                             path_points: movedPathPoints,
                             boundingBox: computeBoundsFromPoints(movedPoints) || undefined
                     };
                }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, scale, setMarkups]);

  // 2. CLICK HANDLER (Select - works with any tool active)
  const handleMarkupClick = (e, id) => {
    e.stopPropagation(); // Stop Pan
    setSelectedIds([id]);
  };

  // 3. START MODIFY (Drag/Rotate)
  const handleMouseDown = (e, type, handleIndex) => {
      if (selectedIds.length === 0) return;
      e.stopPropagation();
      e.preventDefault();

      const markup = markups.find(m => m.id === selectedIds[0]);
      if (!markup) return;

      setIsDragging(true);
      setModifyType(type); // 'move' or 'rotate' or 'resize_0', 'resize_1'...
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialMarkupState(JSON.parse(JSON.stringify(markup)));
  };

  // 4. MOVE MODIFY (The Math)
  const handleMouseMove = useCallback((e) => {
      if (!isDragging || !dragStart || !modifyType) return;

      const dx = (e.clientX - dragStart.x) / scale;
      const dy = (e.clientY - dragStart.y) / scale;

      setMarkups(prev => prev.map(m => {
          if (m.id !== selectedIds[0]) return m;

          // A. MOVE LOGIC
          if (modifyType === 'move') {
              const movedPoints = initialMarkupState.points?.map(p => ({
                  x: p.x + dx,
                  y: p.y + dy
              })) || [];
              const movedPathPoints = initialMarkupState.path_points?.map(p => ({
                  x: p.x + dx,
                  y: p.y + dy
              }));
              return {
                  ...initialMarkupState,
                  points: movedPoints,
                  path_points: movedPathPoints,
                  boundingBox: computeBoundsFromPoints(movedPoints) || undefined
              };
          }

          // B. RESIZE LOGIC
          if (modifyType.startsWith('resize-')) {
              const origBounds = computeBoundsFromPoints(initialMarkupState.points);
              if (!origBounds) return m;
              const { minX: origMinX, maxX: origMaxX, minY: origMinY, maxY: origMaxY, width: origWidth, height: origHeight } = origBounds;
              if (origWidth === 0 || origHeight === 0) return m;

              // Calculate new bounds based on which corner
              let newMinX = origMinX;
              let newMaxX = origMaxX;
              let newMinY = origMinY;
              let newMaxY = origMaxY;

              if (modifyType === 'resize-tl') {
                  newMinX = origMinX + dx;
                  newMinY = origMinY + dy;
              } else if (modifyType === 'resize-tr') {
                  newMaxX = origMaxX + dx;
                  newMinY = origMinY + dy;
              } else if (modifyType === 'resize-br') {
                  newMaxX = origMaxX + dx;
                  newMaxY = origMaxY + dy;
              } else if (modifyType === 'resize-bl') {
                  newMinX = origMinX + dx;
                  newMaxY = origMaxY + dy;
              }

              const newWidth = newMaxX - newMinX;
              const newHeight = newMaxY - newMinY;

              // Prevent negative dimensions
              if (newWidth <= 5 || newHeight <= 5) return m;

              // Scale each point proportionally
              const scalePoint = (point) => ({
                  x: newMinX + ((point.x - origMinX) / origWidth) * newWidth,
                  y: newMinY + ((point.y - origMinY) / origHeight) * newHeight
              });
              return {
                  ...initialMarkupState,
                  points: initialMarkupState.points.map(scalePoint),
                  path_points: initialMarkupState.path_points?.map(scalePoint),
                  boundingBox: {
                      minX: newMinX,
                      maxX: newMaxX,
                      minY: newMinY,
                      maxY: newMaxY,
                      width: newWidth,
                      height: newHeight
                  }
              };
          }

          // C. ROTATE LOGIC
          if (modifyType === 'rotate') {
              // Calculate center of shape
              if (!initialMarkupState.points || initialMarkupState.points.length === 0) return m;
              const cx = initialMarkupState.points.reduce((sum, p) => sum + p.x, 0) / initialMarkupState.points.length;
              const cy = initialMarkupState.points.reduce((sum, p) => sum + p.y, 0) / initialMarkupState.points.length;
              
              // Angle math
              const startAngle = Math.atan2(dragStart.y - (cy * scale), dragStart.x - (cx * scale));
              const currentAngle = Math.atan2(e.clientY - (cy * scale), e.clientX - (cx * scale));
              const rotationDelta = (currentAngle - startAngle) * (180 / Math.PI); // Degrees

              // Apply rotation to all points around center
              const rad = rotationDelta * (Math.PI / 180);
              const cos = Math.cos(rad);
              const sin = Math.sin(rad);
              const rotatePoint = (point) => ({
                  x: (cos * (point.x - cx)) - (sin * (point.y - cy)) + cx,
                  y: (sin * (point.x - cx)) + (cos * (point.y - cy)) + cy
              });

              const rotatedPoints = initialMarkupState.points.map(rotatePoint);
              const rotatedPathPoints = initialMarkupState.path_points?.map(rotatePoint);
              return {
                  ...initialMarkupState,
                  points: rotatedPoints,
                  path_points: rotatedPathPoints,
                  boundingBox: computeBoundsFromPoints(rotatedPoints) || undefined
              };
          }

          return m;
      }));

  }, [isDragging, dragStart, modifyType, selectedIds, scale, initialMarkupState, setMarkups]);

  // 5. END MODIFY
  const handleMouseUp = () => {
      setIsDragging(false);
      setModifyType(null);
      setDragStart(null);
      setInitialMarkupState(null);
  };

  return {
      selectedIds,
      handleMarkupClick,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      setSelectedIds // Exported so background click can clear
  };
};

export default useMarkupEdit;
