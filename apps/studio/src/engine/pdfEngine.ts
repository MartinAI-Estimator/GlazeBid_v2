/**
 * pdfEngine.ts
 *
 * PDF.js integration — document loading, page rendering to GPU bitmaps,
 * and thumbnail data-URL generation.
 *
 * DPI / Tile math
 * ───────────────
 * PDF coordinates are defined at 72 pt per inch.
 * getViewport({ scale: 1 }) → width/height in "page-space pixels" at 72 DPI.
 *
 * We maintain a tile cache with multiple resolution tiers:
 *   tier 1 → ×1  (72 DPI)   — low-zoom overview
 *   tier 2 → ×2 (144 DPI)   — normal use
 *   tier 4 → ×4 (288 DPI)   — ≥ 300 % camera zoom
 *   tier 8 → ×8 (576 DPI)   — ≥ 1 000 % camera zoom (stays crisp at 10 000 %)
 *
 * The bitmap is ALWAYS drawn via:
 *   drawImage(bitmap, 0, 0, pageW, pageH)         ← page-space destination
 * The camera transform then scales that correctly to the screen.
 * At camera scale S the on-screen pixel density = S × devicePixelRatio, so a
 * tier-T bitmap remains sharp up to S = T / devicePixelRatio.
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Configure the web worker once at module-load time.
// Using new URL(..., import.meta.url) lets Vite resolve the asset path at
// build time without the non-standard ?url query suffix.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

export type { PDFDocumentProxy, PDFPageProxy };

// ── Render Tiers ──────────────────────────────────────────────────────────────

export type RenderTier = 1 | 2 | 4 | 8;

/**
 * Choose the minimum render tier needed for the current camera scale so the
 * PDF page never looks blurry at the user's viewport.
 */
export function chooseTier(cameraScale: number): RenderTier {
  if (cameraScale >= 10) return 8;
  if (cameraScale >= 3)  return 4;
  if (cameraScale >= 1)  return 2;
  return 1;
}

// ── Document Loading ──────────────────────────────────────────────────────────

/**
 * Parse a PDF document from raw bytes.
 * The Uint8Array is obtained from the Electron IPC bridge (Node.js Buffer
 * arrives as a Uint8Array via structured clone).
 */
export async function loadPdfFromBuffer(data: Uint8Array): Promise<PDFDocumentProxy> {
  // Defensive copy so PDF.js can take full ownership of the buffer.
  const copy = new Uint8Array(data);
  return pdfjsLib.getDocument({ data: copy }).promise;
}

// ── Page Rendering ────────────────────────────────────────────────────────────

/**
 * Render a PDF page to an ImageBitmap at the given tier scale.
 * Uses OffscreenCanvas so the render never blocks the main-thread paint loop.
 *
 * Returned bitmap dimensions: Math.round(pageW × tier) × Math.round(pageH × tier).
 * Drawing it into the 72-DPI page-space rect [0, 0, pageW, pageH] gives perfect
 * sharpness up to (tier × 100 %) camera zoom.
 */
export async function renderPageToBitmap(
  page: PDFPageProxy,
  tier: RenderTier,
): Promise<ImageBitmap> {
  const viewport = page.getViewport({ scale: tier });
  const w = Math.round(viewport.width);
  const h = Math.round(viewport.height);

  // Off-DOM canvas: never appended to document; GC'd after createImageBitmap.
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');

  // pdfjs types canvasContext as CanvasRenderingContext2D; OffscreenCanvasRenderingContext2D
  // is a structural superset and accepted at runtime — the cast keeps TS happy.
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
  return await createImageBitmap(canvas);
}

/**
 * Render a PDF page to a JPEG data URL for navigation thumbnails.
 * Default scale = 0.25 → ~18 % of native resolution (fast, compact).
 */
export async function renderPageToDataUrl(
  page:  PDFPageProxy,
  scale = 0.25,
): Promise<string> {
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = Math.round(viewport.width);
  canvas.height  = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.8);
}
