/**
 * useSnapPoints.js
 * 
 * Custom hook for snap point detection and spatial hashing
 * 
 * RESPONSIBILITIES:
 * - Extract snap points from PDF vectors using getOperatorList()
 * - Create spatial hash grid for O(1) lookup performance
 * - Detect nearest snap point with magnetic behavior
 * - Apply CTM (Current Transformation Matrix) tracking
 * - Filter out hatch patterns and keep only structural lines
 * 
 * COORDINATE SPACES:
 * - Local PDF space: Raw coordinates from PDF operators
 * - Global PDF space: After applying CTM transformations
 * - Viewport space: After applying viewport.transform (scale 1.0)
 * - All snap points stored in viewport space to match markup coordinates
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Spatial hash grid reduces search from O(n) to O(9 buckets)
 * - Ultra-aggressive filtering: Only keep lines > 3% of page width
 * - Deduplication: Remove points within 1px tolerance
 * - Priority-based snapping: Intersections > Endpoints > Midpoints
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

export const useSnapPoints = ({
  currentPage,
  pageNum,
  rotation,
  allMarkups,
  snapEnabled,
  scale,
  currentMode,
  isCalibrating
}) => {
  const [snapPoints, setSnapPoints] = useState([]);
  const [spatialHashGrid, setSpatialHashGrid] = useState(null);
  const [nearestSnapPoint, setNearestSnapPoint] = useState(null);
  
  /**
   * Create spatial hash grid for fast O(1) snap point lookup
   * Divides 2D space into buckets (default 100x100px)
   */
  const createSpatialHash = useCallback((points, bucketSize = 100) => {
    const hash = new Map();
    
    points.forEach(point => {
      // Calculate bucket coordinates
      const bucketX = Math.floor(point.x / bucketSize);
      const bucketY = Math.floor(point.y / bucketSize);
      const key = `${bucketX},${bucketY}`;
      
      if (!hash.has(key)) {
        hash.set(key, []);
      }
      hash.get(key).push(point);
    });
    
    console.log('🗂️ Spatial hash created:', {
      totalPoints: points.length,
      buckets: hash.size,
      avgPointsPerBucket: (points.length / hash.size).toFixed(1)
    });
    
    return { hash, bucketSize };
  }, []);
  
  /**
   * Extract snap points from PDF vectors + markups with spatial hash
   * Uses "Just-In-Time" approach - pre-process once, lookup fast at runtime
   */
  const extractSnapPoints = useCallback(async (page) => {
    try {
      const startTime = performance.now();
      const operatorList = await page.getOperatorList();
      const points = [];
      
      // STEP 1: Get viewport at scale 1.0 - must match markup coordinate space
      // Markups are stored in viewport space at scale 1.0
      // SVG parent has transform that handles zoom/pan
      const displayViewport = page.getViewport({ scale: 1.0, rotation });
      const displayWidth = displayViewport.width;
      const displayHeight = displayViewport.height;
      
      // The viewport.transform converts PDF user space → display pixels
      // x' = a*x + c*y + e
      // y' = b*x + d*y + f
      const viewportTransform = displayViewport.transform;
      
      console.log('🔍 PDF TO VIEWPORT SCALING WITH CTM TRACKING:');
      console.log('  📺 Display viewport:', { width: displayWidth, height: displayHeight });
      console.log('  📐 Rotation:', rotation, 'degrees');
      console.log('  🔄 Viewport transform:', viewportTransform);
      console.log('  🎯 TRACKING CTM (Current Transformation Matrix)');
      
      // Log available OPS for debugging
      console.log('  📋 OPS available:', Object.keys(pdfjsLib.OPS || {}).slice(0, 10), '...');
      
      // STEP 2: Calculate filter threshold based on DISPLAY dimensions
      // For large drawings, be MORE aggressive to prevent 378K+ points
      const pageArea = displayWidth * displayHeight;
      const isLargeDrawing = pageArea > 1728 * 1296; // > 24"x18" at 72 DPI
      
      // 🎯 FIX: Reduced from 1-3% to 0.2-0.5% for better snap detection
      // Large drawings: 0.5% of page width (5px on 1000px page)
      // Normal: 0.2% (2px on 1000px page) - catches mullions and details
      const minVectorLength = displayWidth * (isLargeDrawing ? 0.005 : 0.002);
      
      // HARD CAP: Prevent memory overload from complex drawings
      const MAX_SNAP_POINTS = isLargeDrawing ? 5000 : 10000;
      console.log(`📐 Snap extraction: ${isLargeDrawing ? 'LARGE' : 'normal'} drawing, max ${MAX_SNAP_POINTS} points, min length ${minVectorLength.toFixed(1)}px`);
      
      // Helper: Multiply two 2D affine transform matrices [a, b, c, d, e, f]
      const multiplyMatrix = (m1, m2) => {
        return [
          m1[0] * m2[0] + m1[2] * m2[1],           // a
          m1[1] * m2[0] + m1[3] * m2[1],           // b
          m1[0] * m2[2] + m1[2] * m2[3],           // c
          m1[1] * m2[2] + m1[3] * m2[3],           // d
          m1[0] * m2[4] + m1[2] * m2[5] + m1[4],   // e
          m1[1] * m2[4] + m1[3] * m2[5] + m1[5]    // f
        ];
      };
      
      // Helper: Transform point (x, y) through matrix [a, b, c, d, e, f]
      const transformPoint = (x, y, matrix) => {
        return [
          matrix[0] * x + matrix[2] * y + matrix[4],  // x'
          matrix[1] * x + matrix[3] * y + matrix[5]   // y'
        ];
      };
      
      if (!pdfjsLib.OPS) {
        console.error('❌ pdfjsLib.OPS unavailable');
        return;
      }
      
      // Log operator list stats for debugging
      console.log('  📊 Operator list size:', operatorList.fnArray.length, 'operators');
      
      // Count operator types for debugging
      const opCounts = {};
      operatorList.fnArray.forEach(fn => {
        opCounts[fn] = (opCounts[fn] || 0) + 1;
      });
      console.log('  🔢 Operator counts:', opCounts);
      
      // Check if constructPath operator exists
      const hasConstructPath = operatorList.fnArray.includes(pdfjsLib.OPS.constructPath);
      console.log('  🔍 Has constructPath ops:', hasConstructPath, '(OPS.constructPath =', pdfjsLib.OPS.constructPath, ')');
      
      // Track filtering stats
      let vectorsFiltered = 0;
      let vectorsKept = 0;
      let pathsProcessed = 0;
      
      // CTM (Current Transformation Matrix) tracking
      let ctm = [1, 0, 0, 1, 0, 0]; // Identity matrix
      const ctmStack = [];
      
      // Process operator list with CTM tracking
      let hitPointCap = false;
      for (let i = 0; i < operatorList.fnArray.length && !hitPointCap; i++) {
        const fn = operatorList.fnArray[i];
        const args = operatorList.argsArray[i];
        
        // Track CTM state changes
        if (fn === pdfjsLib.OPS.save) {
          // q - Push current CTM to stack
          ctmStack.push([...ctm]);
        } else if (fn === pdfjsLib.OPS.restore) {
          // Q - Pop CTM from stack
          if (ctmStack.length > 0) {
            ctm = ctmStack.pop();
          }
        } else if (fn === pdfjsLib.OPS.transform) {
          // cm - Multiply current CTM by transformation matrix
          const newMatrix = args;
          ctm = multiplyMatrix(ctm, newMatrix);
        } else if (fn === pdfjsLib.OPS.constructPath) {
          // Extract geometry with current CTM
          const path = args[0];
          const coordArray = args[1];
          
          pathsProcessed++;
          
          // coordArray is an ARRAY containing Float32Arrays, not a flat array!
          // Structure: [[Float32Array(x1,y1,x2,y2,...)]]
          if (!coordArray || !Array.isArray(coordArray) || coordArray.length === 0) continue;
          
          // Get the actual Float32Array from inside the array
          const coords = coordArray[0];
          if (!coords || coords.length < 4) continue; // Need at least 2 points (4 coords)
          
          // DEBUG: Log first path to confirm structure
          if (pathsProcessed === 1) {
            console.log('🔍 COORDINATE STRUCTURE DECODED:');
            console.log('  coordArray is Array:', Array.isArray(coordArray));
            console.log('  coordArray.length:', coordArray.length);
            console.log('  coords (Float32Array) length:', coords.length);
            console.log('  First 10 coords:', Array.from(coords.slice(0, 10)));
          }
            
          // Extract line segments from Float32Array
          // Fix loop boundary: need j+3 to be valid, so loop to length-3
          for (let j = 0; j < coords.length - 3; j += 2) {
            
            const x1 = coords[j];
            const y1 = coords[j + 1];
            const x2 = coords[j + 2];
            const y2 = coords[j + 3];
            
            // Skip if coordinates are invalid
            if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) continue;
            
            // STEP A: Apply CTM to get Global PDF coordinates
            const [gx1, gy1] = transformPoint(x1, y1, ctm);
            const [gx2, gy2] = transformPoint(x2, y2, ctm);
            
            // Calculate line length in Global PDF space
            const dx_global = gx2 - gx1;
            const dy_global = gy2 - gy1;
            const length_global = Math.sqrt(dx_global * dx_global + dy_global * dy_global);
            
            // STEP B: Apply viewport transform to get Display coordinates
            const [vx1, vy1] = transformPoint(gx1, gy1, viewportTransform);
            const [vx2, vy2] = transformPoint(gx2, gy2, viewportTransform);
            
            // Calculate line length IN VIEWPORT SPACE for filtering
            const dx = vx2 - vx1;
            const dy = vy2 - vy1;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            // STEP C: BOUNDS CHECK - Discard off-page construction lines
            const inBounds1 = (vx1 >= 0 && vx1 <= displayWidth && vy1 >= 0 && vy1 <= displayHeight);
            const inBounds2 = (vx2 >= 0 && vx2 <= displayWidth && vy2 >= 0 && vy2 <= displayHeight);
            
            // DEBUG: Log first coordinate transform
            if (vectorsKept === 0) {
              console.log('🔬 COORDINATE TRANSFORM PIPELINE:');
              console.log('  1️⃣  Local coords:', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1) });
              console.log('  2️⃣  → CTM applied:', { gx1: gx1.toFixed(1), gy1: gy1.toFixed(1), gx2: gx2.toFixed(1), gy2: gy2.toFixed(1) });
              console.log('  3️⃣  → Viewport applied:', { vx1: vx1.toFixed(1), vy1: vy1.toFixed(1), vx2: vx2.toFixed(1), vy2: vy2.toFixed(1) });
              console.log('  📏 Line length:', length.toFixed(1), 'px (min:', minVectorLength.toFixed(1), ')');
              console.log('  ✅ In bounds?', (inBounds1 && inBounds2) ? 'BOTH' : (inBounds1 || inBounds2) ? 'PARTIAL' : 'NONE (discarded)');
              console.log('  📐 Viewport range: 0-' + displayWidth.toFixed(0) + ' x 0-' + displayHeight.toFixed(0));
            }
            
            // FILTER: Only keep lines longer than 0.2-0.5% of page width (catches mullions)
            if (length < minVectorLength) {
              vectorsFiltered++;
              continue;
            }
            
            // Only add points that are within viewport bounds
            if (inBounds1 || inBounds2) {
              vectorsKept++;
              
              // PERFORMANCE: Stop collecting if we hit the cap
              if (points.length >= MAX_SNAP_POINTS) {
                console.warn(`⚠️ Hit snap point cap (${MAX_SNAP_POINTS}), stopping extraction early`);
                hitPointCap = true;
                break;
              }
              
              if (inBounds1) {
                points.push({ x: vx1, y: vy1, type: 'endpoint', priority: 1 });
              }
              if (inBounds2 && points.length < MAX_SNAP_POINTS) {
                points.push({ x: vx2, y: vy2, type: 'endpoint', priority: 1 });
              }
            } else {
              // Line is structurally valid but off-page (construction line)
              vectorsFiltered++;
            }
          }
        }
      }
      
      // Add markup snap points (user-drawn markups only)
      const pageMarkups = allMarkups.filter(m => m.pageNum === pageNum);
      pageMarkups.forEach(markup => {
        if (markup.points && markup.points.length > 0) {
          markup.points.forEach(point => {
            points.push({ x: point.x, y: point.y, type: 'markup-vertex', priority: 3 });
          });
          
          if (markup.mode === 'Polyline' && markup.points.length > 1) {
            for (let i = 0; i < markup.points.length - 1; i++) {
              const p1 = markup.points[i];
              const p2 = markup.points[i + 1];
              points.push({
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2,
                type: 'markup-midpoint',
                priority: 4
              });
            }
          }
          
          if ((markup.mode === 'Area' || markup.mode === 'Highlight') && markup.points.length === 4) {
            for (let i = 0; i < 4; i++) {
              const p1 = markup.points[i];
              const p2 = markup.points[(i + 1) % 4];
              points.push({
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2,
                type: 'markup-midpoint',
                priority: 4
              });
            }
          }
        }
      });
      
      const endTime = performance.now();
      
      console.log('✅ SNAP EXTRACTION COMPLETE:');
      console.log('  📊 Total Points:', points.length);
      console.log('  ✅ Vectors Kept:', vectorsKept);
      console.log('  ❌ Vectors Filtered:', vectorsFiltered);
      console.log('  📁 Paths Processed:', pathsProcessed);
      console.log('  🎨 Markup Points:', points.filter(p => p.type.startsWith('markup')).length);
      console.log('  ⏱️  Extract Time:', `${(endTime - startTime).toFixed(0)}ms`);
      console.log('  📏 Filter Ratio:', `${((vectorsFiltered / (vectorsFiltered + vectorsKept)) * 100).toFixed(1)}% filtered`);
      console.log('  🎯 Coordinate Space: CTM + VIEWPORT TRANSFORM');
      
      // Sample a few points for debugging
      if (points.length > 0) {
        console.log('  📍 Sample points:', points.slice(0, 5).map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(', '));
        console.log('  📍 Expected range: 0-' + displayWidth.toFixed(0) + ' x 0-' + displayHeight.toFixed(0));
      } else {
        console.warn('  ⚠️  NO POINTS EXTRACTED! Check:');
        console.warn('     - Are there lineTo operations in PDF?');
        console.warn('     - Are lines long enough (>' + minVectorLength.toFixed(1) + 'px)?');
        console.warn('     - Are points within viewport bounds?');
      }
      
      // Deduplicate points using spatial hash (O(n) instead of O(n²))
      // For 378K points, O(n²) would be 143 BILLION comparisons!
      const dedupeHash = new Map();
      const tolerance = 2; // 2px tolerance
      const uniquePoints = [];
      
      for (const point of points) {
        // Round to tolerance grid for fast dedup
        const key = `${Math.round(point.x / tolerance)},${Math.round(point.y / tolerance)}`;
        if (!dedupeHash.has(key)) {
          dedupeHash.set(key, true);
          uniquePoints.push(point);
        }
      }
      
      console.log('  🔄 After deduplication:', uniquePoints.length, 'points');
      
      // Create spatial hash grid for fast lookup
      const spatialHash = createSpatialHash(uniquePoints, 100);
      setSpatialHashGrid(spatialHash);
      setSnapPoints(uniquePoints);
      
    } catch (error) {
      console.error('❌ Error extracting snap points:', error);
      setSnapPoints([]);
      setSpatialHashGrid(null);
    }
  }, [rotation, allMarkups, pageNum, createSpatialHash]);
  
  /**
   * Find nearest snap point using spatial hash grid
   * Reduces from O(n) to O(9 buckets) = ~20 points instead of 4000+
   * 
   * COORDINATE SPACE: Operates in viewport space (snap points and mouse both in viewport coords)
   */
  const getSnappedPoint = useCallback((point) => {
    if (!snapEnabled || (!currentMode && !isCalibrating)) {
      setNearestSnapPoint(null);
      return point;
    }
    
    // Snap threshold in viewport units (must account for current zoom scale)
    // MAGNETIC SNAP: Balanced radius for easy snapping while maintaining precision
    // At scale 1.0: 10px radius, at scale 2.0: 5px radius (maintains constant screen distance)
    const snapThreshold = 10 / scale;
    
    let candidatePoints = [];
    
    // Use spatial hash if available (BIG performance win)
    if (spatialHashGrid && spatialHashGrid.hash) {
      const { hash, bucketSize } = spatialHashGrid;
      
      // Calculate mouse bucket in viewport space
      const bucketX = Math.floor(point.x / bucketSize);
      const bucketY = Math.floor(point.y / bucketSize);
      
      // Search 3x3 grid (current bucket + 8 neighbors)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `${bucketX + dx},${bucketY + dy}`;
          const bucketPoints = hash.get(key);
          if (bucketPoints) {
            candidatePoints.push(...bucketPoints);
          }
        }
      }
      
      console.log('🔍 Spatial hash search:', {
        mouseBucket: `${bucketX},${bucketY}`,
        candidatePoints: candidatePoints.length,
        bucketSize
      });
    } else {
      // Fallback: search all points (slower but works)
      candidatePoints = snapPoints;
    }
    
    // If no candidates, no snap
    if (candidatePoints.length === 0) {
      setNearestSnapPoint(null);
      return point;
    }
    
    // Find best snap candidate by priority and distance
    // MAGNETIC LOGIC: Intersection > Endpoint > Midpoint
    let bestSnap = null;
    let bestDistance = Infinity;
    let bestPriority = Infinity;
    
    for (const snapPt of candidatePoints) {
      const dist = Math.sqrt(
        Math.pow(snapPt.x - point.x, 2) + 
        Math.pow(snapPt.y - point.y, 2)
      );
      
      // Priority hierarchy (lower is better)
      let priority = snapPt.priority || 999;
      
      // Override priority based on type for magnetic behavior
      if (snapPt.type === 'intersection') {
        priority = 1; // Highest priority
      } else if (snapPt.type === 'endpoint' || snapPt.type === 'corner') {
        priority = Math.min(priority, 2); // High priority
      } else if (snapPt.type === 'midpoint' || snapPt.type === 'markup-midpoint') {
        priority = Math.max(priority, 5); // Lower priority
      }
      
      // Adjust threshold based on priority (intersections and endpoints get larger range)
      const priorityMultiplier = priority <= 2 ? 1.5 : 1.0;
      const threshold = snapThreshold * priorityMultiplier;
      
      // Check if this is a better snap candidate
      if (dist < threshold) {
        const isBetter = priority < bestPriority || 
                        (priority === bestPriority && dist < bestDistance);
        
        if (isBetter) {
          bestDistance = dist;
          bestPriority = priority;
          bestSnap = snapPt;
        }
      }
    }
    
    setNearestSnapPoint(bestSnap);
    
    if (bestSnap) {
      console.log('🧲 MAGNETIC SNAP:', {
        type: bestSnap.type,
        point: { x: bestSnap.x.toFixed(2), y: bestSnap.y.toFixed(2) },
        distance: bestDistance.toFixed(2) + 'px',
        priority: bestPriority,
        searchedPoints: candidatePoints.length,
        icon: bestSnap.type === 'intersection' ? '✛ Crosshair' : 
              (bestSnap.type === 'endpoint' || bestSnap.type === 'corner') ? '□ Square' : 
              (bestSnap.type === 'midpoint' || bestSnap.type === 'markup-midpoint') ? '△ Triangle' : '○ Circle'
      });
      return { x: bestSnap.x, y: bestSnap.y };
    }
    
    return point;
  }, [snapPoints, spatialHashGrid, scale, currentMode, isCalibrating, snapEnabled]);
  
  return {
    snapPoints,
    spatialHashGrid,
    nearestSnapPoint,
    extractSnapPoints,
    getSnappedPoint,
    setNearestSnapPoint
  };
};
