import React from 'react';

const SelectionOverlay = ({ markup, scale, onMouseDown }) => {
  if (!markup) return null;

  // Calculate Bounding Box
  const xs = markup.points.map(p => p.x);
  const ys = markup.points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const width = maxX - minX;
  const height = maxY - minY;
  const cx = minX + width / 2;
  const cy = minY + height / 2;

  // Style Config
  const boxStyle = {
      fill: 'none',
      stroke: '#00a8ff',
      strokeWidth: 2,
      strokeDasharray: '4,4'
  };
  
  const handleStyle = {
      fill: '#fff',
      stroke: '#00a8ff',
      strokeWidth: 1,
      width: 8,
      height: 8,
      cursor: 'grab' // Simply grab for now
  };

  return (
    <g>
      {/* 1. The Bounding Box */}
      <rect 
         x={minX * scale} y={minY * scale} 
         width={width * scale} height={height * scale}
         {...boxStyle}
      />

      {/* 2. Rotation Lollipop (Top Center) */}
      <line 
         x1={cx * scale} y1={minY * scale}
         x2={cx * scale} y2={(minY * scale) - 20}
         stroke="#00a8ff" strokeWidth={2}
      />
      <circle 
         cx={cx * scale} cy={(minY * scale) - 20} r={6}
         fill="#00a8ff" cursor="alias" // Rotate cursor
         onMouseDown={(e) => onMouseDown(e, 'rotate')}
      />

      {/* 3. Drag Handle (Center - Invisible hit area) */}
      <rect 
          x={minX * scale} y={minY * scale} 
          width={width * scale} height={height * scale}
          fill="transparent" cursor="move"
          onMouseDown={(e) => onMouseDown(e, 'move')}
      />

      {/* 4. Corner Resize Handles */}
      {/* Top-Left */}
      <rect 
         x={(minX * scale) - 4} y={(minY * scale) - 4}
         width={8} height={8}
         fill="#fff" stroke="#00a8ff" strokeWidth={1}
         cursor="nwse-resize"
         onMouseDown={(e) => onMouseDown(e, 'resize-tl')}
      />
      {/* Top-Right */}
      <rect 
         x={(maxX * scale) - 4} y={(minY * scale) - 4}
         width={8} height={8}
         fill="#fff" stroke="#00a8ff" strokeWidth={1}
         cursor="nesw-resize"
         onMouseDown={(e) => onMouseDown(e, 'resize-tr')}
      />
      {/* Bottom-Right */}
      <rect 
         x={(maxX * scale) - 4} y={(maxY * scale) - 4}
         width={8} height={8}
         fill="#fff" stroke="#00a8ff" strokeWidth={1}
         cursor="nwse-resize"
         onMouseDown={(e) => onMouseDown(e, 'resize-br')}
      />
      {/* Bottom-Left */}
      <rect 
         x={(minX * scale) - 4} y={(maxY * scale) - 4}
         width={8} height={8}
         fill="#fff" stroke="#00a8ff" strokeWidth={1}
         cursor="nesw-resize"
         onMouseDown={(e) => onMouseDown(e, 'resize-bl')}
      />
    </g>
  );
};

export default SelectionOverlay;
