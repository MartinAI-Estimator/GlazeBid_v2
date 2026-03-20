/**
 * pdfLoader.ts
 *
 * Wraps PDF.js to load a PDF from a Uint8Array buffer.
 * Extracts page dimensions and generates low-res thumbnail blobs.
 *
 * Worker setup: uses Vite's `?url` import so the worker URL resolves
 * correctly in both dev (localhost) and production (file://) contexts.
 *
 * Real-world inches: PDF pages are natively at 72 DPI — every "page pixel"
 * is exactly 1/72 of an inch.  The coordinate system in coordinateSystem.ts
 * uses DEFAULT_PDF_PPI = 72 for uncalibrated pages, matching this exactly.
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PageState } from '../store/useStudioStore';

// ── Worker setup ──────────────────────────────────────────────────────────────
// Vite resolves the ?url import to the correct absolute URL in both dev and
// production. We assign it synchronously (before any getDocument() call).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadedPdf = {
  /** The live PDF.js document proxy — needed by PdfTileManager. */
  doc:         PDFDocumentProxy;
  /** One PageState per PDF page — dimensions at 72 DPI (1 px = 1 pt). */
  pages:       PageState[];
  /** PDFPageProxy objects indexed by zero-based page number. */
  pageProxies: PDFPageProxy[];
};

// Thumbnail scale exported so callers can reuse the same constant.
export const THUMB_SCALE = 0.15;

// ── loadPdfFromBuffer ─────────────────────────────────────────────────────────

/**
 * Parse a PDF buffer and build the Studio page list.
 *
 * Each page:
 *   - widthPx / heightPx: PDF viewport at scale=1 (72 DPI), rounded to integers
 *     to avoid floating-point dimension mismatches during tile rendering.
 *   - thumbnailUrl: an object-URL blob of a JPEG render at THUMB_SCALE.
 *     Caller is responsible for calling URL.revokeObjectURL() when unloading.
 */
export async function loadPdfFromBuffer(
  buffer:   Uint8Array,
  fileName: string,
): Promise<LoadedPdf> {
  // Guard: if IPC serialisation went wrong the buffer arrives as a plain object.
  // Reconstruct a proper Uint8Array from it so PDF.js doesn't throw.
  let safeBuffer: Uint8Array;
  if (buffer instanceof Uint8Array) {
    safeBuffer = buffer;
  } else {
    // Node Buffer arrives as {type:'Buffer', data:[…]} in some Electron versions
    const raw = buffer as unknown as { type?: string; data?: number[] };
    if (raw?.type === 'Buffer' && Array.isArray(raw.data)) {
      safeBuffer = new Uint8Array(raw.data);
    } else {
      console.error('[pdfLoader] Unexpected buffer type:', typeof buffer, buffer);
      throw new Error('Invalid PDF buffer received from IPC — expected Uint8Array');
    }
  }

  let doc: PDFDocumentProxy;
  try {
    doc = await pdfjsLib.getDocument({ data: safeBuffer }).promise;
  } catch (err) {
    console.error('[pdfLoader] PDF.js getDocument failed:', err);
    throw err;
  }

  const pages:       PageState[]      = [];
  const pageProxies: PDFPageProxy[]   = [];

  for (let i = 0; i < doc.numPages; i++) {
    const proxy = await doc.getPage(i + 1);  // getPage is 1-indexed

    // ── Page dimensions at 72 DPI ─────────────────────────────────────────
    const vp = proxy.getViewport({ scale: 1 });
    // Math.round avoids the float-truncation mismatch noted in Task 4.3.
    const widthPx  = Math.round(vp.width);
    const heightPx = Math.round(vp.height);

    // thumbnailUrl is populated lazily by the background loop in openPdf.
    // Keeping this function free of render calls means the proxies are
    // immediately available to PdfTileManager without "Rendering is still
    // in progress" conflicts.
    pages.push({
      id:           `pdf-page-${i}`,
      label:        `Page ${i + 1}`,
      widthPx,
      heightPx,
      pdfPageIndex: i,
    });

    pageProxies.push(proxy);
  }

  return { doc, pages, pageProxies };
}
