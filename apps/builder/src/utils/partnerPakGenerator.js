/**
 * Layer 22 - PartnerPak Generator
 * Exports GlazeBid markups to PartnerPak CSV format
 * Reverse integration: Visual Takeoff → CSV Export
 */

/**
 * Calculate joints (linear feet of internal mullions)
 * @param {number} rows - Number of horizontal divisions
 * @param {number} cols - Number of vertical divisions
 * @param {number} width - Width in inches
 * @param {number} height - Height in inches
 * @returns {number} Total joints in linear feet
 */
const calculateJoints = (rows, cols, width, height) => {
  // Vertical mullions (between columns)
  const verticalLF = (cols - 1) * (height / 12); // Convert inches to feet
  
  // Horizontal mullions (between rows)
  const horizontalLF = (rows - 1) * (width / 12); // Convert inches to feet
  
  return verticalLF + horizontalLF;
};

/**
 * Convert markup to PartnerPak row format
 * @param {object} markup - GlazeBid markup object
 * @returns {object} PartnerPak row data
 */
const markupToPartnerPakRow = (markup) => {
  // Calculate dimensions from points (assuming rectangular Area markup)
  if (!markup.points || markup.points.length < 4) {
    return null;
  }

  // Get bounding box
  const xs = markup.points.map(p => p.x);
  const ys = markup.points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Calculate dimensions (points are in PDF units, convert to inches at 72 DPI)
  const width = Math.abs(maxX - minX) / 72; // Convert to inches
  const height = Math.abs(maxY - minY) / 72; // Convert to inches
  const areaSF = (width * height) / 144; // Square feet
  const perimeterFT = ((2 * width) + (2 * height)) / 12; // Linear feet

  // Grid properties (default to 1 if not defined)
  const rows = markup.rows || 1;
  const cols = markup.cols || 1;
  const panels = rows * cols;
  const joints = calculateJoints(rows, cols, width, height);

  return {
    frameName: markup.label || markup.id,
    width: width.toFixed(2),
    height: height.toFixed(2),
    area: areaSF.toFixed(2),
    perimeter: perimeterFT.toFixed(2),
    joints: joints.toFixed(2),
    panels: panels,
    rows: rows,
    cols: cols,
    numberThus: 1 // Default quantity
  };
};

/**
 * Generate PartnerPak CSV content from markups
 * @param {array} markups - Array of GlazeBid markup objects
 * @returns {string} CSV content
 */
export const generatePartnerPakCSV = (markups) => {
  // Filter to only Area markups (ignore polylines, counts, etc.)
  const areaMarkups = markups.filter(m => m.type === 'Area');

  if (areaMarkups.length === 0) {
    throw new Error('No Area markups found to export');
  }

  // PartnerPak CSV Header
  const headers = [
    'Frame Name',
    'Width',
    'Height',
    'Area',
    'Perimeter',
    'Joints',
    'Panels',
    'Rows',
    'Cols',
    'Number Thus'
  ];

  // Convert markups to rows
  const rows = areaMarkups
    .map(markupToPartnerPakRow)
    .filter(row => row !== null)
    .map(row => [
      row.frameName,
      row.width,
      row.height,
      `${row.area} Sqft`, // Match PartnerPak format
      `${row.perimeter} Ft`, // Match PartnerPak format
      row.joints,
      row.panels,
      row.rows,
      row.cols,
      row.numberThus
    ]);

  // Build CSV content
  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ];

  return csvLines.join('\n');
};

/**
 * Trigger browser download of PartnerPak CSV
 * @param {array} markups - Array of GlazeBid markup objects
 * @param {string} filename - Optional filename (default: GlazeBid_Export.csv)
 */
export const exportToPartnerPak = (markups, filename = 'GlazeBid_Export.csv') => {
  try {
    const csvContent = generatePartnerPakCSV(markups);
    
    // Create blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (navigator.msSaveBlob) {
      // IE 10+
      navigator.msSaveBlob(blob, filename);
    } else {
      // Modern browsers
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }

    console.log(`✅ Exported ${markups.filter(m => m.type === 'Area').length} items to ${filename}`);
    return { success: true, count: markups.filter(m => m.type === 'Area').length };
  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  }
};
