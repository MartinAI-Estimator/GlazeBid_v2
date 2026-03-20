import { useState, useEffect, useCallback, useRef } from 'react';
import { pdfjs } from 'react-pdf';

const useSnapPoints = (pdfPage, scale, rotation = 0) => {
  const [snapPoints, setSnapPoints] = useState([]);
  const [snapLines, setSnapLines] = useState([]);  // NEW: Track line segments
  const spatialHash = useRef(new Map()); 
  const lineHash = useRef(new Map());  // NEW: Spatial hash for lines
  const CELL_SIZE = 50; 

  // --- MATH HELPERS ---
  // Transform point [x, y] by matrix [a, b, c, d, e, f]
  const transformPoint = (x, y, m) => {
      return {
          x: m[0] * x + m[2] * y + m[4],
          y: m[1] * x + m[3] * y + m[5]
      };
  };

  // Multiply matrices m1 * m2
  const multiplyMatrix = (m1, m2) => {
      return [
          m1[0] * m2[0] + m1[2] * m2[1],
          m1[1] * m2[0] + m1[3] * m2[1],
          m1[0] * m2[2] + m1[2] * m2[3],
          m1[1] * m2[2] + m1[3] * m2[3],
          m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
          m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
      ];
  }; 

  // --- 1. EXTRACTION ENGINE ---
  useEffect(() => {
    if (!pdfPage) return;

    const extractPoints = async () => {
      try {
        const opList = await pdfPage.getOperatorList();
        
        // CRITICAL: Use the SAME rotation as canvas rendering
        const viewport = pdfPage.getViewport({ scale: 1.0, rotation });
        const viewportTransform = viewport.transform; 
        
        // State for extraction
        let points = [];
        let lines = [];  // NEW: Track line segments
        let ctm = [1, 0, 0, 1, 0, 0]; // Identity
        const ctmStack = [];
        const OPS = pdfjs.OPS;
        
        // DEBUG: Count operator types
        const opCounts = {};
        let ctmTransforms = 0;
        let constructPathCount = 0;
        let pathSegmentsExtracted = 0;
        let lineAttempts = 0;
        let lineFiltered = 0;

        // --- THE MINER FUNCTION ---
        // Processes an operator list with a given CTM
        const processOpList = (fnArray, argsArray) => {
            for (let i = 0; i < fnArray.length; i++) {
                const fn = fnArray[i];
                const args = argsArray[i];
                
                // DEBUG: Count operator types
                const opName = Object.keys(OPS).find(key => OPS[key] === fn) || `Unknown_${fn}`;
                opCounts[opName] = (opCounts[opName] || 0) + 1;

                // 1. STATE TRACKING
                if (fn === OPS.save) {
                    ctmStack.push([...ctm]);
                } 
                else if (fn === OPS.restore) {
                    if (ctmStack.length > 0) ctm = ctmStack.pop();
                } 
                else if (fn === OPS.transform) {
                    ctm = multiplyMatrix(ctm, args);
                    ctmTransforms++;
                }

                // 2. GEOMETRY EXTRACTION
                // Move/Line (m/l)
                else if (fn === OPS.moveTo || fn === OPS.lineTo) {
                    const rawP = { x: args[0], y: args[1] };
                    const pdfP = transformPoint(rawP.x, rawP.y, ctm); // Apply Group Transform
                    const viewP = transformPoint(pdfP.x, pdfP.y, viewportTransform); // Apply Page Transform
                    points.push(viewP);
                }
                
                // Rectangle (re)
                else if (fn === OPS.rectangle) {
                    const x = args[0], y = args[1], w = args[2], h = args[3];
                    const corners = [
                        { x: x, y: y },
                        { x: x + w, y: y },
                        { x: x + w, y: y + h },
                        { x: x, y: y + h }
                    ];
                    corners.forEach(p => {
                        const pdfP = transformPoint(p.x, p.y, ctm);
                        const viewP = transformPoint(pdfP.x, pdfP.y, viewportTransform);
                        points.push(viewP);
                    });
                }

                // ConstructPath (Complex CAD Geometry)
                else if (fn === OPS.constructPath) {
                    constructPathCount++;
                    
                    // Correct structure: args = [typeCode, [commandsArray], dataArray]
                    const pathType = args[0];
                    const ops = args[1] && args[1][0];  // Float32Array of command codes
                    const data = args[2];  // Float32Array of coordinates
                    
                    if (!ops || !data) {
                        continue;  // Skip if malformed
                    }
                    
                    let dIndex = 0;
                    let lastPoint = null;  // NEW: Track last point for line segments
                    
                    // Path segment type codes (from PDF.js)
                    const PATH_OPS = {
                        closePath: 0,
                        moveTo: 1,
                        lineTo: 2,
                        curveTo: 3,
                        curveTo2: 4,
                        curveTo3: 5,
                        rectangle: 6
                    };
                    
                    for (let j = 0; j < ops.length; j++) {
                        const op = ops[j];
                        
                        // Move and Line segments
                        if (op === PATH_OPS.moveTo || op === PATH_OPS.lineTo) {
                            pathSegmentsExtracted++;
                            const rawP = { x: data[dIndex], y: data[dIndex + 1] };
                            const pdfP = transformPoint(rawP.x, rawP.y, ctm);
                            const viewP = transformPoint(pdfP.x, pdfP.y, viewportTransform);
                            
                            // CRITICAL: Filter out NaN/Infinity values
                            if (isFinite(viewP.x) && isFinite(viewP.y)) {
                                points.push(viewP);
                                
                                // NEW: Create line segment if we have a previous point
                                if (lastPoint && op === PATH_OPS.lineTo) {
                                    lineAttempts++;
                                    const length = Math.sqrt(
                                        Math.pow(viewP.x - lastPoint.x, 2) + 
                                        Math.pow(viewP.y - lastPoint.y, 2)
                                    );
                                    // Only track lines longer than 1px (filter out degenerate segments)
                                    if (length > 1) {
                                        lines.push({ p1: lastPoint, p2: viewP });
                                    } else {
                                        lineFiltered++;
                                    }
                                }
                                
                                lastPoint = viewP;
                            }
                            dIndex += 2;
                        }
                        // Rectangle
                        else if (op === PATH_OPS.rectangle) {
                            pathSegmentsExtracted += 4;
                             const x = data[dIndex], y = data[dIndex+1], w = data[dIndex+2], h = data[dIndex+3];
                             const corners = [{x,y}, {x:x+w,y}, {x:x+w,y:y+h}, {x,y:y+h}];
                             const transformedCorners = [];
                             
                             corners.forEach(p => {
                                 const pdfP = transformPoint(p.x, p.y, ctm);
                                 const viewP = transformPoint(pdfP.x, pdfP.y, viewportTransform);
                                 
                                 // CRITICAL: Filter out NaN/Infinity values
                                 if (isFinite(viewP.x) && isFinite(viewP.y)) {
                                     points.push(viewP);
                                     transformedCorners.push(viewP);
                                 }
                             });
                             
                             // NEW: Create line segments for rectangle edges
                             if (transformedCorners.length === 4) {
                                 for (let k = 0; k < 4; k++) {
                                     const p1 = transformedCorners[k];
                                     const p2 = transformedCorners[(k + 1) % 4];
                                     lines.push({ p1, p2 });
                                 }
                                 lastPoint = transformedCorners[0];
                             }
                             
                             dIndex += 4;
                        }
                        // Curves - advance index but don't extract points
                        else if (op === PATH_OPS.curveTo) dIndex += 6;
                        else if (op === PATH_OPS.curveTo2) dIndex += 4;
                        else if (op === PATH_OPS.curveTo3) dIndex += 4;
                        // closePath has no data
                    }
                }
            }
        };

        // RUN THE MINER
        // Note: XObject recursion usually requires parsing commonObjs which is heavy.
        // For now, we trust that standard PDF.js getOperatorList flattens most XObjects into the main list.
        processOpList(opList.fnArray, opList.argsArray);

        // --- 3. FILTERING & DEDUPLICATION ---
        const deduped = [];
        const seen = new Set();
        
        // Filter out 0,0 points and off-page points
        const pageW = viewport.width;
        const pageH = viewport.height;
        
        let boundsFiltered = 0;

        points.forEach(p => {
            // Bounds Check
            if (p.x < 0 || p.y < 0 || p.x > pageW || p.y > pageH) {
                boundsFiltered++;
                return;
            }
            
            // Quantize to 1px for deduplication
            const key = `${Math.round(p.x)}_${Math.round(p.y)}`;
            if (seen.has(key)) return;
            
            seen.add(key);
            deduped.push(p);
        });

        const validPoints = deduped.filter(p => isFinite(p.x) && isFinite(p.y));
        const validLines = lines.filter(l => 
            isFinite(l.p1.x) && isFinite(l.p1.y) && 
            isFinite(l.p2.x) && isFinite(l.p2.y)
        );
        
        console.log(`📍 SNAP ENGINE: Found ${validPoints.length}/${deduped.length} valid snap points + ${validLines.length} line segments`);
        console.log(`� LINE DEBUG: ${lineAttempts} attempts, ${lineFiltered} filtered (< 1px), ${validLines.length} kept`);
        console.log(`�🔧 DEBUG: buildSpatialHash type:`, typeof buildSpatialHash);
        console.log(`🔧 DEBUG: buildLineHash type:`, typeof buildLineHash);
        
        if (validPoints.length !== deduped.length) {
            console.warn(`⚠️ WARNING: ${deduped.length - validPoints.length} points had NaN/Infinity coordinates!`);
        }
        
        setSnapPoints(validPoints);
        setSnapLines(validLines);
        
        try {
            buildSpatialHash(validPoints);
            console.log(`✅ Point spatial hash built: ${spatialHash.current.size} cells`);
        } catch (err) {
            console.error("❌ Error building point hash:", err);
        }
        
        try {
            buildLineHash(validLines);
            console.log(`✅ Line spatial hash built: ${lineHash.current.size} cells`);
        } catch (err) {
            console.error("❌ Error building line hash:", err);
        }

      } catch (err) {
        console.error("Snap Extraction Error:", err);
      }
    };

    extractPoints();
  }, [pdfPage, rotation]);


  // --- 2. BUILD GRID (Optimization) ---
  const buildSpatialHash = (points) => {
      spatialHash.current.clear();
      points.forEach(p => {
          const key = `${Math.floor(p.x / CELL_SIZE)}_${Math.floor(p.y / CELL_SIZE)}`;
          if (!spatialHash.current.has(key)) spatialHash.current.set(key, []);
          spatialHash.current.get(key).push(p);
      });
  };
    
    const buildLineHash = (lines) => {
        lineHash.current.clear();
        lines.forEach(line => {
            // Hash all cells that the line passes through
            const minX = Math.min(line.p1.x, line.p2.x);
            const maxX = Math.max(line.p1.x, line.p2.x);
            const minY = Math.min(line.p1.y, line.p2.y);
            const maxY = Math.max(line.p1.y, line.p2.y);
            
            const startCellX = Math.floor(minX / CELL_SIZE);
            const endCellX = Math.floor(maxX / CELL_SIZE);
            const startCellY = Math.floor(minY / CELL_SIZE);
            const endCellY = Math.floor(maxY / CELL_SIZE);
            
            for (let cellX = startCellX; cellX <= endCellX; cellX++) {
                for (let cellY = startCellY; cellY <= endCellY; cellY++) {
                    const key = `${cellX}_${cellY}`;
                    if (!lineHash.current.has(key)) lineHash.current.set(key, []);
                    lineHash.current.get(key).push(line);
                }
            }
        });
    };
    
    // Helper: Calculate distance from point to line segment
    const pointToLineDistance = (point, line) => {
        const {p1, p2} = line;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lengthSq = dx * dx + dy * dy;
        
        // Degenerate line (point)
        if (lengthSq === 0) {
            return {
                distance: Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2),
                snapPoint: p1
            };
        }
        
        // Project point onto line, clamped to segment
        let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        
        return {
            distance: Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2),
            snapPoint: {x: projX, y: projY}
        };
    };


  // --- 3. SNAP FINDER ---
  const getNearestSnapPoint = useCallback((x, y, threshold = 15) => {
      if (!scale) {
          console.log(`⚠️ getNearestSnapPoint: scale is ${scale}`);
          return null;
      }
      
      const searchThreshold = threshold / scale;
      const minDistSq = searchThreshold * searchThreshold;
      const cellX = Math.floor(x / CELL_SIZE);
      const cellY = Math.floor(y / CELL_SIZE);
      
      let nearest = null;
      let currentBestDist = minDistSq;
      let snapType = null;

      // PRIORITY 1: Check lines FIRST (follow along edges/walls)
      // Use larger threshold for line snapping to create "magnetic" following behavior
      const lineThreshold = searchThreshold * 2.0;  // 2x larger than point threshold
      const lineDistSq = lineThreshold * lineThreshold;
      
      let linesChecked = 0;
      for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
              const key = `${cellX + dx}_${cellY + dy}`;
              const bucket = lineHash.current.get(key);
              if (!bucket) continue;

              linesChecked += bucket.length;
              for (const line of bucket) {
                  const result = pointToLineDistance({x, y}, line);
                  const distSq = result.distance * result.distance;
                  
                  if (distSq < currentBestDist && distSq < lineDistSq) {
                      currentBestDist = distSq;
                      nearest = result.snapPoint;
                      snapType = 'line';
                  }
              }
          }
      }
      
      // PRIORITY 2: Check points (corners, endpoints) - tighter threshold
      // Points override lines only when very close (precise corner snapping)
      let pointsChecked = 0;
      for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
              const key = `${cellX + dx}_${cellY + dy}`;
              const bucket = spatialHash.current.get(key);
              if (!bucket) continue;

              pointsChecked += bucket.length;
              for (const p of bucket) {
                  const diffX = p.x - x;
                  const diffY = p.y - y;
                  const distSq = diffX*diffX + diffY*diffY;
                  
                  if (distSq < currentBestDist) {
                      currentBestDist = distSq;
                      nearest = { x: p.x, y: p.y };
                      snapType = 'point';
                  }
              }
          }
      }
      
      if (nearest) {
          console.log(`🎯 SNAP: Found ${snapType} at (${nearest.x.toFixed(1)}, ${nearest.y.toFixed(1)}) - checked ${pointsChecked} points, ${linesChecked} lines`);
      }
      
      return nearest ? { ...nearest, type: snapType } : null;
  }, [scale]);

  return { getNearestSnapPoint };
};

export default useSnapPoints;
