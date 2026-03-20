/**
 * pageScan.ts  —  Whole-page rectangular region detection.
 *
 * Scans the entire canvas in a single pass to locate all enclosed
 * light (glass/opening) regions bounded by dark structural lines.
 * Used by useAIAutoScan for Phase 6.2 bulk detection.
 *
 * ── Algorithm ────────────────────────────────────────────────────────────────
 * 1. Read full canvas ImageData once.
 * 2. Walk a sampling grid (stride = gridStride physical px).
 * 3. When an unvisited, light (lum > lightThreshold) grid cell is found, BFS
 *    outward to trace the entire connected light region.
 *    All touched pixels are immediately marked visited so later grid seeds
 *    never re-enter the same region.
 * 4. Record the region's axis-aligned bounding box if its pixel count is in
 *    the valid range (not noise, not the entire-page background).
 * 5. Verify that the bbox perimeter has a minimum fraction of dark pixels —
 *    this confirms the light interior is bordered by structural frame lines.
 * 6. Return all valid bboxes in canvas CSS-pixel coordinates.
 *
 * ── Why not OpenCV? ──────────────────────────────────────────────────────────
 * We deliberately avoid a CDN/WASM dependency.  Canny + contour-finding would
 * give slightly better recall, but for clean architectural PDFs this BFS
 * approach achieves > 90 % of the value with zero dependencies.
 *
 * Legacy reference: _LEGACY_ARCHIVE/GlazeBid_AIQ — useAutoCount.js
 * (original used OpenCV template matching; replaced here with pure-Canvas BFS)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A detected region, with its bbox in canvas CSS pixels. */
export type ScanRegion = {
  /** Bounding box in canvas CSS pixels (same coordinate space as mouse events). */
  box: { x: number; y: number; w: number; h: number };
  /**
   * Fraction (0–1) of perimeter pixels that are dark.
   * Higher values indicate a well-bordered frame.
   */
  borderDarkRatio: number;
};

export type ScanOptions = {
  /**
   * Luminance above which a pixel is considered "light" (interior of a pane).
   * Default: 200  (out of 255; keeps near-white interiors, rejects mid-greys).
   */
  lightThreshold?: number;
  /**
   * Luminance below which a pixel is "dark" (structural frame line).
   * Default: 80.
   */
  darkThreshold?: number;
  /**
   * BFS sampling grid stride in physical (buffer) pixels.
   * Smaller → more seeds tested → slower but fewer missed regions.
   * Default: 30.
   */
  gridStride?: number;
  /**
   * Minimum connected-region size in physical buffer pixels.
   * Below this threshold the region is treated as noise.
   * Default: 400  (≈ 20 × 20 px at 1× DPI).
   */
  minRegionPx?: number;
  /**
   * Maximum connected-region size as a fraction of total page pixels.
   * Regions larger than this are the page background.
   * Default: 0.40.
   */
  maxRegionPxRatio?: number;
  /**
   * Minimum border-dark ratio to accept a region as a framed element.
   * Default: 0.18.
   */
  minBorderDarkRatio?: number;
};

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Detect all enclosed light rectangular regions on a rendered canvas page.
 *
 * All heavy pixel work runs inside a single `setTimeout(0)` so the caller
 * can update React state (e.g. show a spinner) before this blocks the thread.
 *
 * @param canvas      Rendered <canvas> element (canvasRef.current).
 * @param options     Tuning parameters (see ScanOptions).
 * @param cancelRef   Optional cancellation token.  Set `.cancelled = true` to
 *                    abort early — the Promise resolves with results found so far.
 */
export async function scanPageRegions(
  canvas:    HTMLCanvasElement,
  options:   ScanOptions = {},
  cancelRef?: { cancelled: boolean },
): Promise<ScanRegion[]> {
  return new Promise(resolve => {
    setTimeout(() => {
      try {
        const {
          lightThreshold     = 200,
          darkThreshold      = 80,
          gridStride         = 30,
          minRegionPx        = 400,
          maxRegionPxRatio   = 0.40,
          minBorderDarkRatio = 0.18,
        } = options;

        const dpr      = window.devicePixelRatio || 1;
        const bw       = canvas.width;   // physical buffer width
        const bh       = canvas.height;  // physical buffer height
        const totalPx  = bw * bh;
        const maxRegionPx = Math.floor(totalPx * maxRegionPxRatio);

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve([]); return; }

        const img  = ctx.getImageData(0, 0, bw, bh);
        const data = img.data;  // Uint8ClampedArray, 4 bytes per pixel

        // BT.601 luminance at base of RGBA quad
        const lum = (i: number): number =>
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

        // One visited byte per physical pixel (0 = unvisited, 1 = visited)
        const visited  = new Uint8Array(totalPx);

        // Reusable BFS queue: interleaved (x, y) pairs
        // Worst-case size = totalPx × 2 Int32 = 2 × 4 × totalPx bytes.
        // For a 2592 × 3456 retina page (~9 MP) that is ~72 MB — acceptable.
        const qBuf = new Int32Array(totalPx * 2);

        const results: ScanRegion[] = [];

        // ── Sampling-grid outer loop ──────────────────────────────────────────
        for (let gy = 0; gy < bh; gy += gridStride) {
          for (let gx = 0; gx < bw; gx += gridStride) {
            if (cancelRef?.cancelled) { resolve(results); return; }

            const seedPi = gy * bw + gx;

            // Skip already-visited pixels and dark pixels
            if (visited[seedPi]) continue;
            if (lum(seedPi * 4) <= lightThreshold) { visited[seedPi] = 1; continue; }

            // ── BFS: trace connected light region ─────────────────────────────
            let qHead = 0;
            let qTail = 0;
            let count = 0;
            let minX  = gx, minY = gy;
            let maxX  = gx, maxY = gy;

            const enqueue = (x: number, y: number): void => {
              if (x < 0 || y < 0 || x >= bw || y >= bh) return;
              const p = y * bw + x;
              if (visited[p]) return;
              visited[p] = 1;
              if (lum(p * 4) <= lightThreshold) return;  // dark pixel — mark visited but don't expand
              qBuf[qTail++] = x;
              qBuf[qTail++] = y;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              count++;
            };

            enqueue(gx, gy);

            while (qHead < qTail) {
              if (count > maxRegionPx) break;  // background — abort early
              const x = qBuf[qHead++];
              const y = qBuf[qHead++];
              enqueue(x + 1, y);
              enqueue(x - 1, y);
              enqueue(x,     y + 1);
              enqueue(x,     y - 1);
            }

            // Filter by pixel count
            if (count < minRegionPx || count > maxRegionPx) continue;

            // Minimum size / aspect-ratio sanity
            const w  = maxX - minX;
            const h  = maxY - minY;
            if (w < 10 || h < 10) continue;
            const ar = w / h;
            if (ar < 0.04 || ar > 25) continue;

            // ── Borderedness check: how dark is the bbox perimeter? ──────────
            const margin       = Math.max(2, Math.round(dpr));
            let borderTotal    = 0;
            let borderDark     = 0;

            const checkPx = (bx: number, by: number): void => {
              const cx = Math.max(0, Math.min(bw - 1, bx));
              const cy = Math.max(0, Math.min(bh - 1, by));
              if (lum((cy * bw + cx) * 4) < darkThreshold) borderDark++;
              borderTotal++;
            };

            // Top and bottom rows
            for (let x = minX; x <= maxX; x++) {
              checkPx(x, minY - margin);
              checkPx(x, maxY + margin);
            }
            // Left and right columns
            for (let y = minY; y <= maxY; y++) {
              checkPx(minX - margin, y);
              checkPx(maxX + margin, y);
            }

            const borderDarkRatio = borderTotal > 0 ? borderDark / borderTotal : 0;
            if (borderDarkRatio < minBorderDarkRatio) continue;

            // ── Convert physical-buffer px → CSS px ──────────────────────────
            results.push({
              box: {
                x: minX / dpr,
                y: minY / dpr,
                w: w    / dpr,
                h: h    / dpr,
              },
              borderDarkRatio,
            });
          }
        }

        resolve(results);
      } catch (err) {
        console.error('[pageScan] Error during scan:', err);
        resolve([]);
      }
    }, 0);
  });
}
