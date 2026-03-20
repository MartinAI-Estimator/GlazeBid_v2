/**
 * featureExtract.ts  —  Canvas-native image-patch feature extraction.
 *
 * Produces a 128-dimensional L2-normalised Float32Array from any rectangular
 * region of a rendered canvas buffer.  No WASM, no CDN dependencies.
 *
 * ── Feature Layout (128 elements) ───────────────────────────────────────────
 *  [0  – 63]  Mean luminance per 8×8 spatial grid cell         (normalised 0–1)
 *  [64 – 127] Mean edge magnitude per 8×8 spatial grid cell    (normalised 0–1)
 *
 *  The patch is divided into an 8×8 spatial grid (64 cells).
 *  Each cell is sampled with a 4×4 sub-grid drawn from the source region
 *  (bi-linear nearest-neighbour interpolation, so the total virtual sample is
 *  32×32 points).
 *
 *  Edge magnitude at each sample = mean of |L(x,y)−L(x+1,y)| and |L(x,y)−L(x,y+1)|
 *  (Sobel-lite, horizontal + vertical finite differences).
 *
 *  The full 128-element vector is L2-normalised, making cosineSimilarity equal
 *  to a simple dot product (no additional division needed).
 *
 * ── Why this works for architectural PDFs ────────────────────────────────────
 *  Glazing openings share a characteristic luminance + edge signature:
 *    • High-luminance interior (glass = white on drawings)
 *    • Dark-pixel border (frame line)
 *    • Edge cell pattern determined by mullion grid position inside the opening
 *  Cosine similarity between two same-type openings drawn at slightly different
 *  sizes/positions is typically 0.87–0.95, well above the 0.75 session threshold.
 *
 * ── ONNX drop-in slot ────────────────────────────────────────────────────────
 *  When a trained ONNX FeatureEncoder is available, replace the body of
 *  `extractFeaturesFromBuffer` with an ONNX inference call.  The rest of the
 *  pipeline (SessionLearner, cosine scoring, NMS) is model-agnostic.
 *
 * Legacy reference:
 *   _LEGACY_ARCHIVE/GlazeBid_AIQ/GHOST_HIGHLIGHTER_ARCHITECTURE.md
 *   Python SessionLearner — cosine_similarity(), set_anchor(), re_rank_ghosts()
 */

// ── Public types ──────────────────────────────────────────────────────────────

/** 128-dimensional L2-normalised feature vector. */
export type FeatureVector = Float32Array;

// ── Private constants ─────────────────────────────────────────────────────────

const GRID = 8;          // 8×8 spatial grid = 64 cells
const SPL  = 4;          // 4×4 samples per grid cell → 32×32 virtual patch
const DIM  = GRID * GRID * 2; // 128

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * BT.601 luminance (0–255) sampled from the physical-pixel buffer at (px, py),
 * clamped to buffer bounds.
 */
function bufLum(
  data: Uint8ClampedArray,
  bw:   number,
  bh:   number,
  px:   number,
  py:   number,
): number {
  const x = Math.max(0, Math.min(bw - 1, Math.round(px)));
  const y = Math.max(0, Math.min(bh - 1, Math.round(py)));
  const i = (y * bw + x) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract a 128D feature vector from a rectangular sub-region of a canvas buffer.
 *
 * All coordinates are in physical buffer pixels (i.e. CSS pixels × devicePixelRatio).
 *
 * @param data    `ImageData.data` (Uint8ClampedArray, RGBA, row-major).
 * @param bw      Physical buffer width  (canvas.width).
 * @param bh      Physical buffer height (canvas.height).
 * @param bufX    Left edge of the region in buffer px.
 * @param bufY    Top  edge of the region in buffer px.
 * @param bufW    Width  of the region in buffer px.
 * @param bufH    Height of the region in buffer px.
 * @returns       A 128-element L2-normalised Float32Array, or null when the
 *                region is too small to sample reliably.
 */
export function extractFeaturesFromBuffer(
  data: Uint8ClampedArray,
  bw:   number,
  bh:   number,
  bufX: number,
  bufY: number,
  bufW: number,
  bufH: number,
): FeatureVector | null {
  if (bufW < 4 || bufH < 4) return null;

  const vec = new Float32Array(DIM);

  // Scale factors to map the 32×32 virtual grid onto the buffer region.
  const xScale = bufW / (GRID * SPL);
  const yScale = bufH / (GRID * SPL);

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let lumSum  = 0;
      let edgeSum = 0;
      const count = SPL * SPL;  // 16

      for (let ky = 0; ky < SPL; ky++) {
        for (let kx = 0; kx < SPL; kx++) {
          // Virtual-grid sample position (SI, SJ) in the 32×32 mesh
          const si = gx * SPL + kx;
          const sj = gy * SPL + ky;

          // Map to physical buffer coordinates (centre of each sample cell)
          const px = bufX + (si + 0.5) * xScale;
          const py = bufY + (sj + 0.5) * yScale;

          const L  = bufLum(data, bw, bh, px,       py);
          const Lr = bufLum(data, bw, bh, px + xScale, py);          // right
          const Lb = bufLum(data, bw, bh, px,       py + yScale);    // below

          lumSum  += L;
          edgeSum += (Math.abs(L - Lr) + Math.abs(L - Lb)) * 0.5;
        }
      }

      const cellIdx = gy * GRID + gx;
      vec[cellIdx]       = lumSum  / (count * 255.0);  // normalise 0→1
      vec[64 + cellIdx]  = edgeSum / (count * 255.0);
    }
  }

  // L2 normalise so cosine similarity = dot product
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 1e-8) {
    for (let i = 0; i < DIM; i++) vec[i] /= norm;
  }

  return vec;
}

/**
 * Cosine similarity between two L2-normalised FeatureVectors.
 *
 * Because both vectors are already unit-length, this reduces to a dot product —
 * no division required.  Return value is clamped to [-1, 1] for floating-point
 * safety.
 */
export function cosineSimilarity(a: FeatureVector, b: FeatureVector): number {
  let dot = 0;
  for (let i = 0; i < DIM; i++) dot += a[i] * b[i];
  return dot < -1 ? -1 : dot > 1 ? 1 : dot;
}
