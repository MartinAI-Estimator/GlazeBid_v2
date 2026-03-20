/**
 * edgeDetect.ts  —  Canvas-based Magic Wand boundary detection.
 *
 * Runs entirely in the browser using raw ImageData — no OpenCV, no CDN deps.
 * Mirrors the spirit of legacy `useAutoCount.js` (which used OpenCV template
 * matching) but uses a simpler flood-fill approach suited to architectural PDFs.
 *
 * ── Algorithm ────────────────────────────────────────────────────────────────
 * 1. User clicks a point on the rendered PDF canvas.
 * 2. Sample the RGBA colour at that pixel (the "seed").
 * 3. 4-connected flood fill outward from the seed, collecting pixels that are
 *    either:
 *    (a) "dark" (luminance < darkThreshold) — structural lines in the drawing, OR
 *    (b) colour-similar to the seed (RGBA distance ≤ tolerance).
 * 4. Compute the axis-aligned bounding box of all filled pixels.
 * 5. Return the bounding box in canvas-element CSS pixel coordinates, ready to
 *    be converted to page coordinates via engine.screenToPage().
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 * All heavy work runs inside a setTimeout(0) so React can paint any "Scanning…"
 * state before the synchronous pixel loop begins. A maxPixels cap aborts fills
 * on pathologically large or open regions.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Axis-aligned bounding box in canvas-element CSS pixels. */
export type BoundaryBox = {
  x: number;  // left edge
  y: number;  // top edge
  w: number;  // width
  h: number;  // height
};

export type DetectResult =
  | { found: true;  box: BoundaryBox; pixelCount: number }
  | { found: false; reason: string };

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Run the Magic Wand boundary detection on a rendered PDF canvas element.
 *
 * @param canvas        - The <canvas> element (canvasRef.current).
 * @param cssCx         - Click X in canvas-element CSS pixels.
 * @param cssCy         - Click Y in canvas-element CSS pixels.
 * @param tolerance     - RGBA colour-distance threshold (0–441; default 40).
 *                        Lower = tighter selection; higher = broader.
 * @param darkThreshold - Luminance below this is treated as a "structural line"
 *                        and included regardless of colour distance (0–255; default 80).
 * @param maxPixels     - Safety cap: abort fill after this many pixels (default 2 000 000).
 */
export async function detectBoundary(
  canvas:        HTMLCanvasElement,
  cssCx:         number,
  cssCy:         number,
  tolerance:     number = 40,
  darkThreshold: number = 80,
  maxPixels:     number = 2_000_000,
): Promise<DetectResult> {
  return new Promise(resolve => {
    // Defer to let React paint "Scanning…" state (mirrors useAutoCount.js setTimeout(0))
    setTimeout(() => {
      try {
        const dpr = window.devicePixelRatio || 1;
        // Translate CSS-px click → buffer-px click
        const bufX = Math.round(cssCx * dpr);
        const bufY = Math.round(cssCy * dpr);
        const bw   = canvas.width;   // physical buffer width
        const bh   = canvas.height;  // physical buffer height

        if (bufX < 0 || bufY < 0 || bufX >= bw || bufY >= bh) {
          resolve({ found: false, reason: 'Click is outside the canvas bounds.' });
          return;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve({ found: false, reason: 'Cannot acquire 2D context – canvas may be tainted.' });
          return;
        }

        const img  = ctx.getImageData(0, 0, bw, bh);
        const data = img.data; // Uint8ClampedArray, 4 bytes per pixel (R, G, B, A)

        // Flatten (x, y) → flat index for data[] (start of RGBA quad)
        const idx = (x: number, y: number) => (y * bw + x) * 4;

        // Seed colour at the clicked pixel
        const si    = idx(bufX, bufY);
        const seedR = data[si];
        const seedG = data[si + 1];
        const seedB = data[si + 2];

        // RGBA Euclidean distance from seed
        const colorDist = (i: number): number => {
          const dr = data[i]     - seedR;
          const dg = data[i + 1] - seedG;
          const db = data[i + 2] - seedB;
          return Math.sqrt(dr * dr + dg * dg + db * db);
        };

        // BT.601 luminance
        const lum = (i: number): number =>
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

        // A pixel is "fillable" if it is a structural line OR colour-similar to seed
        const shouldFill = (i: number): boolean =>
          lum(i) < darkThreshold || colorDist(i) <= tolerance;

        // Visited flag per buffer pixel (flat array, 1 byte each)
        const visited = new Uint8Array(bw * bh);

        // BFS queue stored as interleaved (x, y) pairs in a pre-allocated Int32Array
        // Large enough for the max-pixels limit (2 pairs per pixel).
        const qBuf = new Int32Array(maxPixels * 2 + 4);
        let qHead  = 0;
        let qTail  = 0;

        // Bounding box accumulators
        let minX = bufX, minY = bufY;
        let maxX = bufX, maxY = bufY;
        let count = 0;

        const enqueue = (x: number, y: number): void => {
          if (x < 0 || y < 0 || x >= bw || y >= bh) return;
          const pi = y * bw + x;
          if (visited[pi]) return;
          if (!shouldFill(pi * 4))  return;
          visited[pi] = 1;
          qBuf[qTail++] = x;
          qBuf[qTail++] = y;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          count++;
        };

        enqueue(bufX, bufY);

        while (qHead < qTail && count < maxPixels) {
          const x = qBuf[qHead++];
          const y = qBuf[qHead++];
          enqueue(x + 1, y);
          enqueue(x - 1, y);
          enqueue(x,     y + 1);
          enqueue(x,     y - 1);
        }

        if (count < 20) {
          resolve({
            found:  false,
            reason: 'Region is too small — try clicking directly on a frame line.',
          });
          return;
        }

        // Convert buffer-px bbox → CSS-px bbox
        resolve({
          found: true,
          box: {
            x: minX / dpr,
            y: minY / dpr,
            w: (maxX - minX) / dpr,
            h: (maxY - minY) / dpr,
          },
          pixelCount: count,
        });
      } catch (err) {
        resolve({ found: false, reason: String(err) });
      }
    }, 0);
  });
}
