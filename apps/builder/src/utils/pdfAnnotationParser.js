/**
 * PDF Annotation Parser - "Smart Scan"
 * Extracts existing PDF annotations (from Bluebeam, Adobe, etc.) and converts them to GlazeBid markups
 * 
 * Strategy: We interrogate the PDF's native annotation layer and translate those shapes into
 * our interactive markup format, preserving color, geometry, and labels.
 */

/**
 * Extract annotations from a PDF document
 * @param {PDFDocumentProxy} pdfDocument - The loaded PDF.js document
 * @returns {Promise<Array>} Array of GlazeBid markup objects
 */
export async function extractAnnotations(pdfDocument) {
  const allMarkups = [];
  const numPages = pdfDocument.numPages;

  console.log(`🔍 Smart Scan: Analyzing ${numPages} pages for annotations...`);

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const annotations = await page.getAnnotations();

      console.log(`📄 Page ${pageNum}: Found ${annotations.length} annotations`);

      for (const annot of annotations) {
        const markup = parseAnnotation(annot, viewport, pageNum);
        if (markup) {
          allMarkups.push(markup);
        }
      }
    } catch (err) {
      console.error(`❌ Error scanning page ${pageNum}:`, err);
    }
  }

  console.log(`✅ Smart Scan Complete: Extracted ${allMarkups.length} markups`);
  return allMarkups;
}

/**
 * Parse a single PDF annotation into a GlazeBid markup
 * @param {Object} annot - PDF.js annotation object
 * @param {Object} viewport - Page viewport for coordinate transformation
 * @param {Number} pageNumber - Current page number
 * @returns {Object|null} GlazeBid markup object or null if not supported
 */
function parseAnnotation(annot, viewport, pageNumber) {
  const { subtype, rect, color, contents, title, vertices, lineCoordinates } = annot;

  // Filter: Only process supported annotation types
  const supportedTypes = ['Square', 'Polygon', 'Line', 'PolyLine'];
  if (!supportedTypes.includes(subtype)) {
    return null;
  }

  // Extract color (RGB array [0-1] to hex)
  const markupColor = color ? rgbToHex(color) : '#3b82f6'; // Default blue

  // Extract label from contents or title
  const label = contents || title || `Imported ${subtype}`;

  // Convert coordinates based on annotation type
  let points = [];
  let type = 'AREA'; // Default type

  if (subtype === 'Square') {
    // Rectangle: rect = [x1, y1, x2, y2] in PDF coordinates (bottom-left origin)
    points = rectToPoints(rect, viewport);
    type = 'AREA';
  } else if (subtype === 'Polygon' && vertices) {
    // Polygon: vertices = [x1, y1, x2, y2, ...] in PDF coordinates
    points = verticesToPoints(vertices, viewport);
    type = 'AREA';
  } else if (subtype === 'Line' && lineCoordinates) {
    // Line: lineCoordinates = [x1, y1, x2, y2]
    points = lineToPoints(lineCoordinates, viewport);
    type = 'LINEAR';
  } else if (subtype === 'PolyLine' && vertices) {
    // PolyLine: vertices = [x1, y1, x2, y2, ...]
    points = verticesToPoints(vertices, viewport);
    type = 'LINEAR';
  }

  // Validate that we got valid points
  if (!points || points.length < 2) {
    console.warn(`⚠️ Skipping ${subtype}: insufficient points`);
    return null;
  }

  // Calculate measurement (area or length)
  const measurement = type === 'AREA' ? calculateArea(points) : calculateLength(points);

  // Generate unique ID
  const id = `imported_${pageNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Return GlazeBid markup format
  return {
    id,
    type,
    points,
    color: markupColor,
    label,
    measurement,
    unit: type === 'AREA' ? 'SF' : 'LF',
    pageNumber,
    source: 'import', // Tag as imported
    createdAt: new Date().toISOString()
  };
}

/**
 * Convert PDF rectangle to GlazeBid points (4-corner polygon)
 * PDF rect: [x1, y1, x2, y2] where (x1, y1) is bottom-left
 * GlazeBid: Array of {x, y} points in top-left coordinate system
 */
function rectToPoints(rect, viewport) {
  const [x1, y1Pdf, x2, y2Pdf] = rect;
  const pageHeight = viewport.height;

  // Flip Y coordinates (PDF is bottom-up, we need top-down)
  const y1 = pageHeight - y2Pdf;
  const y2 = pageHeight - y1Pdf;

  // Create 4-corner polygon (clockwise from top-left)
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 }
  ];
}

/**
 * Convert PDF vertices array to GlazeBid points
 * PDF vertices: [x1, y1, x2, y2, x3, y3, ...]
 * GlazeBid: Array of {x, y} points
 */
function verticesToPoints(vertices, viewport) {
  const pageHeight = viewport.height;
  const points = [];

  for (let i = 0; i < vertices.length; i += 2) {
    const x = vertices[i];
    const yPdf = vertices[i + 1];
    const y = pageHeight - yPdf; // Flip Y coordinate

    points.push({ x, y });
  }

  return points;
}

/**
 * Convert PDF line coordinates to GlazeBid points
 * PDF line: [x1, y1, x2, y2]
 * GlazeBid: Array of 2 {x, y} points
 */
function lineToPoints(lineCoords, viewport) {
  const [x1, y1Pdf, x2, y2Pdf] = lineCoords;
  const pageHeight = viewport.height;

  // Flip Y coordinates
  const y1 = pageHeight - y1Pdf;
  const y2 = pageHeight - y2Pdf;

  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 }
  ];
}

/**
 * Convert RGB array [0-1] to hex color string
 */
function rgbToHex(rgbArray) {
  if (!rgbArray || rgbArray.length < 3) return '#3b82f6';

  const r = Math.round(rgbArray[0] * 255);
  const g = Math.round(rgbArray[1] * 255);
  const b = Math.round(rgbArray[2] * 255);

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(n) {
  return n.toString(16).padStart(2, '0');
}

/**
 * Calculate area of a polygon using shoelace formula
 * @param {Array} points - Array of {x, y} points
 * @returns {Number} Area in square units
 */
function calculateArea(points) {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area / 2);
}

/**
 * Calculate total length of a polyline
 * @param {Array} points - Array of {x, y} points
 * @returns {Number} Total length
 */
function calculateLength(points) {
  if (points.length < 2) return 0;

  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  return totalLength;
}

/**
 * Get a preview/summary of annotations before importing
 * @param {PDFDocumentProxy} pdfDocument - The loaded PDF.js document
 * @returns {Promise<Object>} Summary statistics
 */
export async function getAnnotationSummary(pdfDocument) {
  const markups = await extractAnnotations(pdfDocument);

  const summary = {
    total: markups.length,
    byType: {
      AREA: markups.filter(m => m.type === 'AREA').length,
      LINEAR: markups.filter(m => m.type === 'LINEAR').length
    },
    byPage: {}
  };

  // Count per page
  markups.forEach(m => {
    summary.byPage[m.pageNumber] = (summary.byPage[m.pageNumber] || 0) + 1;
  });

  return { summary, markups };
}
