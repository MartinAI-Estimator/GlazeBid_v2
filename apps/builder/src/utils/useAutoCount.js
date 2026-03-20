/**
 * useAutoCount.js  —  OpenCV.js template matching for GlazeBid Auto-Count Engine
 *
 * Workflow:
 *   1. User draws a box  → that pixel region becomes the "template"
 *   2. User clicks "Auto-Count Matching"
 *   3. loadOpenCV()  lazily injects opencv.js via CDN (one-time, cached)
 *   4. runTemplateMatch()  grabs the full PDF canvas, converts both images to
 *      grayscale, runs cv.matchTemplate(TM_CCOEFF_NORMED), applies a confidence
 *      threshold, then Non-Maximum Suppression to remove duplicate hits.
 *   5. Returns bounding boxes in CSS canvas-px (renderedScale coordinate space)
 *      so they can be dropped straight onto the SVG overlay.
 *
 * Heavy processing runs inside a setTimeout(0) so React can finish the
 * "⏳ Scanning…" render before the synchronous WASM work begins.
 */

// ─── OpenCV CDN (v4.8.0 — stable, includes Mat/matchTemplate) ──────────────
const CV_CDN = 'https://docs.opencv.org/4.8.0/opencv.js';

// Singleton load promise — only one <script> ever injected
let _cvPromise = null;

/**
 * Lazily load OpenCV.js.
 * Re-entrant safe: calling many times returns the same promise.
 * @returns {Promise<cv>}  Resolves with the ready `cv` global object.
 */
export function loadOpenCV() {
  if (_cvPromise) return _cvPromise;

  _cvPromise = new Promise((resolve, reject) => {
    // Already available (e.g. loaded via index.html)
    if (window.cv && window.cv.Mat) {
      resolve(window.cv);
      return;
    }

    const script = document.createElement('script');
    script.src   = CV_CDN;
    script.async = true;

    script.onload = () => {
      // cv may still be async-initialising its WASM module after the script
      // executes, so we poll until cv.Mat appears.
      const poll = () => {
        if (window.cv && window.cv.Mat) {
          console.log('✅ OpenCV.js ready');
          resolve(window.cv);
        } else {
          setTimeout(poll, 50);
        }
      };
      poll();
    };

    script.onerror = () => {
      _cvPromise = null; // allow retry on next call
      reject(new Error('Failed to load OpenCV.js from CDN'));
    };

    document.head.appendChild(script);
  });

  return _cvPromise;
}

/**
 * Run template matching on the full PDF canvas page.
 *
 * @param {HTMLCanvasElement} canvasEl
 *   The rendered PDF <canvas> element (canvasRef.current in BlueprintViewer).
 *
 * @param {{ x: number, y: number, w: number, h: number }} roi
 *   The drawn bounding box in CSS canvas-px (renderedScale coordinate space).
 *
 * @param {number} pxRatio
 *   Physical canvas pixels ÷ CSS canvas-px.
 *   Compute as:  canvasEl.width / paperWidthAtRenderedScale
 *   This accounts for devicePixelRatio and HiDPI scaling.
 *
 * @param {number} [threshold=0.88]
 *   Minimum TM_CCOEFF_NORMED score to keep a match (0–1).
 *   0.88 = "looks 88% identical".  Lower → more hits, more false positives.
 *
 * @param {number} [overlapThresh=0.40]
 *   IoU threshold for Non-Maximum Suppression.
 *   0.40 = boxes sharing >40% overlap keep only the highest-scoring one.
 *
 * @returns {Promise<Array<{ x, y, w, h, score }>>}
 *   Matched boxes in CSS canvas-px (renderedScale space) — ready for SVG overlay.
 */
export async function runTemplateMatch(
  canvasEl,
  roi,
  pxRatio     = 1,
  threshold   = 0.88,
  overlapThresh = 0.40,
) {
  const cv = await loadOpenCV();

  return new Promise((resolve, reject) => {
    // Yield the UI thread so React can paint the "⏳ Scanning…" state first
    setTimeout(() => {
      let src = null, tmpl = null, result = null, srcGray = null, tmplGray = null;

      try {
        // ── Scale the ROI box up to physical canvas pixels ──────────────────
        const rx = Math.round(roi.x * pxRatio);
        const ry = Math.round(roi.y * pxRatio);
        const rw = Math.round(roi.w * pxRatio);
        const rh = Math.round(roi.h * pxRatio);

        if (rw < 8 || rh < 8) {
          console.warn('AutoCount: template too small, skipping');
          resolve([]);
          return;
        }

        const fullW = canvasEl.width;
        const fullH = canvasEl.height;

        if (rx < 0 || ry < 0 || rx + rw > fullW || ry + rh > fullH) {
          console.warn('AutoCount: ROI out of canvas bounds');
          resolve([]);
          return;
        }

        // ── Read full canvas into a cv.Mat ──────────────────────────────────
        const ctx      = canvasEl.getContext('2d');
        const imgData  = ctx.getImageData(0, 0, fullW, fullH);
        src            = cv.matFromImageData(imgData);

        // ── Crop template ────────────────────────────────────────────────────
        const tmplRect = new cv.Rect(rx, ry, rw, rh);
        tmpl           = src.roi(tmplRect);

        // ── Convert both to grayscale ─────────────────────────────────────
        srcGray  = new cv.Mat();
        tmplGray = new cv.Mat();
        cv.cvtColor(src,  srcGray,  cv.COLOR_RGBA2GRAY);
        cv.cvtColor(tmpl, tmplGray, cv.COLOR_RGBA2GRAY);

        // ── Template matching ────────────────────────────────────────────────
        result = new cv.Mat();
        cv.matchTemplate(srcGray, tmplGray, result, cv.TM_CCOEFF_NORMED);

        // ── Collect candidates above threshold ───────────────────────────────
        const cols   = result.cols;
        const rows   = result.rows;
        const data32 = result.data32F; // Float32Array (one score per pixel)
        const raw    = [];

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const score = data32[row * cols + col];
            if (score >= threshold) {
              raw.push({ x: col, y: row, w: rw, h: rh, score });
            }
          }
        }

        console.log(
          `🔍 AutoCount: ${raw.length} raw candidate(s) above ${threshold} threshold`,
        );

        // ── Non-Maximum Suppression ─────────────────────────────────────────
        const kept = nms(raw, overlapThresh);

        console.log(`✅ AutoCount: ${kept.length} match(es) after NMS`);

        // ── Convert physical px → CSS canvas-px (renderedScale space) ───────
        const matches = kept.map(m => ({
          x:     m.x / pxRatio,
          y:     m.y / pxRatio,
          w:     roi.w,
          h:     roi.h,
          score: +m.score.toFixed(3),
        }));

        resolve(matches);
      } catch (err) {
        console.error('AutoCount error:', err);
        reject(err);
      } finally {
        // Free WASM memory — leaks here will crash the tab on large PDFs
        try { src?.delete();     } catch (_) {}
        try { tmpl?.delete();    } catch (_) {}
        try { srcGray?.delete(); } catch (_) {}
        try { tmplGray?.delete(); } catch (_) {}
        try { result?.delete();  } catch (_) {}
      }
    }, 0); // setTimeout(0) lets React paint before blocking
  });
}

// ─── Non-Maximum Suppression ─────────────────────────────────────────────────

/**
 * Greedily keep the highest-scoring box; discard overlapping ones.
 * @param {Array<{x,y,w,h,score}>} boxes
 * @param {number} overlapThresh
 * @returns {Array<{x,y,w,h,score}>}
 */
function nms(boxes, overlapThresh) {
  if (!boxes.length) return [];

  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const picked = [];

  while (sorted.length > 0) {
    const top = sorted.shift();
    picked.push(top);

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (iou(top, sorted[i]) > overlapThresh) {
        sorted.splice(i, 1);
      }
    }
  }

  return picked;
}

/**
 * Intersection-over-Union for two axis-aligned bounding boxes.
 */
function iou(a, b) {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);

  const interW = Math.max(0, ix2 - ix1);
  const interH = Math.max(0, iy2 - iy1);
  const inter  = interW * interH;
  const union  = a.w * a.h + b.w * b.h - inter;

  return union <= 0 ? 0 : inter / union;
}
