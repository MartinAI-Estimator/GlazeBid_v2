/**
 * PDFViewer Math Utilities
 * Pure functions for geometric calculations - no state, no side effects
 */

/**
 * Calculate intersection point of two line segments
 * @param {Object} line1 - First line {x1, y1, x2, y2}
 * @param {Object} line2 - Second line {x1, y1, x2, y2}
 * @returns {Object|null} Intersection point {x, y} or null if no intersection
 */
export function getLineIntersection(line1, line2) {
  const { x1, y1, x2, y2 } = line1;
  const { x1: x3, y1: y3, x2: x4, y2: y4 } = line2;
  
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  
  // Lines are parallel or coincident
  if (Math.abs(denom) < 0.0001) return null;
  
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  
  // Check if intersection is within both line segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  }
  
  return null;
}

/**
 * Calculate distance from point to line segment
 * @param {Object} point - Point {x, y}
 * @param {Object} lineStart - Line start {x, y}
 * @param {Object} lineEnd - Line end {x, y}
 * @returns {number} Distance in PDF units
 */
export function pointToLineDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx*dx + dy*dy;
  
  if (lengthSquared === 0) {
    // Line segment is a point
    const pdx = point.x - lineStart.x;
    const pdy = point.y - lineStart.y;
    return Math.sqrt(pdx*pdx + pdy*pdy);
  }
  
  // Project point onto line segment
  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared));
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  const pdx = point.x - projX;
  const pdy = point.y - projY;
  
  return Math.sqrt(pdx*pdx + pdy*pdy);
}

/**
 * Check if point is inside polygon
 * @param {Object} point - Point {x, y}
 * @param {Array} polygon - Array of points [{x, y}, ...]
 * @returns {boolean} True if point is inside polygon
 */
export function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
                      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculate distance between two points
 * @param {Object} p1 - First point {x, y}
 * @param {Object} p2 - Second point {x, y}
 * @returns {number} Euclidean distance
 */
export function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Generate unused color for custom markup types
 * @param {Array} usedColors - Array of color strings already in use
 * @returns {string} New unique color in rgba format
 */
export function generateUnusedColor(usedColors = []) {
  const baseColors = [
    'rgba(255, 99, 71, 0.7)',    // Tomato
    'rgba(147, 112, 219, 0.7)',  // Medium Purple
    'rgba(32, 178, 170, 0.7)',   // Light Sea Green
    'rgba(255, 182, 193, 0.7)',  // Light Pink
    'rgba(244, 164, 96, 0.7)',   // Sandy Brown
    'rgba(60, 179, 113, 0.7)',   // Medium Sea Green
    'rgba(106, 90, 205, 0.7)',   // Slate Blue
    'rgba(255, 105, 180, 0.7)',  // Hot Pink
    'rgba(64, 224, 208, 0.7)',   // Turquoise
    'rgba(255, 228, 196, 0.7)',  // Bisque
  ];
  
  // Find first unused color
  for (const color of baseColors) {
    if (!usedColors.includes(color)) {
      return color;
    }
  }
  
  // All colors used - generate random
  const r = Math.floor(Math.random() * 200 + 55);
  const g = Math.floor(Math.random() * 200 + 55);
  const b = Math.floor(Math.random() * 200 + 55);
  return `rgba(${r}, ${g}, ${b}, 0.7)`;
}

/**
 * Clamp value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if value is finite and valid
 * @param {number} value - Value to validate
 * @returns {boolean} True if value is finite
 */
export function isValidNumber(value) {
  return typeof value === 'number' && isFinite(value) && !isNaN(value);
}

/**
 * Parse CSS transform matrix to extract scale and translate
 * @param {string} matrixString - CSS transform matrix string
 * @returns {Object} {scale, pan: {x, y}} or null if invalid
 */
export function parseTransformMatrix(matrixString) {
  if (!matrixString || matrixString === 'none') return null;
  
  const values = matrixString.match(/matrix.*\((.+)\)/);
  if (!values) return null;
  
  const parts = values[1].split(',').map(v => parseFloat(v.trim()));
  
  if (matrixString.startsWith('matrix3d')) {
    // matrix3d: scale at [0], translate at [12], [13]
    return {
      scale: parts[0],
      pan: { x: parts[12], y: parts[13] }
    };
  } else {
    // matrix: scale at [0], translate at [4], [5]
    return {
      scale: parts[0],
      pan: { x: parts[4], y: parts[5] }
    };
  }
}

export default {
  getLineIntersection,
  pointToLineDistance,
  isPointInPolygon,
  distance,
  generateUnusedColor,
  clamp,
  isValidNumber,
  parseTransformMatrix,
};
