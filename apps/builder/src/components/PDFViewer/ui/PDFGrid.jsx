import React from 'react';

const PDFGrid = ({ visible, spacing = 50, scale }) => {
  if (!visible) return null;
  
  // Adjust grid visual size based on zoom so it doesn't get too dense/sparse
  // Bluebeam usually keeps the grid static relative to the paper
  const visualSize = spacing * scale;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 5,
      backgroundImage: 'radial-gradient(#888 1px, transparent 1px)',
      backgroundSize: `${visualSize}px ${visualSize}px`
    }} />
  );
};

export default PDFGrid;
