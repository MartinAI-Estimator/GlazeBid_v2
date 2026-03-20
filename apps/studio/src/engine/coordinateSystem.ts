// ============================================================================
// Coordinate System
//
// Three coordinate spaces:
//   SCREEN  — CSS pixels (mouse offsetX/Y, canvas clientWidth/Height).
//   PAGE    — PDF page pixels (72 DPI by default for standard PDFs).
//   INCHES  — Real-world measurement. Builder's pricingEngine works in inches.
//
// Transforms:
//   page → screen :  screenX = pageX  × camera.scale + camera.tx
//   screen → page :  pageX   = (screenX - camera.tx) / camera.scale
//   page  → inches:  inches  = pagePixels / pixelsPerInch
//   inches → page :  pagePixels = inches × pixelsPerInch
// ============================================================================

export const DEFAULT_PDF_PPI = 72; // Standard PDF coordinate unit

/** A 2D point in PAGE space (PDF page pixels). */
export type PagePoint = { x: number; y: number };

/**
 * Calibration for one PDF page.
 * Derived by the user drawing a reference line and entering its known length.
 */
export type PageCalibration = {
  pageId:        string;
  pixelsPerInch: number;
  /** The reference segment used for calibration, stored for visual display. */
  refStartPx?:   PagePoint;
  refEndPx?:     PagePoint;
  knownInches?:  number;
};

export function pageToInches(pagePx: number, ppi: number): number {
  return pagePx / ppi;
}

export function distancePx(a: PagePoint, b: PagePoint): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Compute a calibration from a reference line the user has drawn.
 * @param startPx   - Line start in page pixels.
 * @param endPx     - Line end in page pixels.
 * @param knownIn   - The user-entered real-world length in inches.
 */
export function calibrateFromLine(
  startPx:  PagePoint,
  endPx:    PagePoint,
  knownIn:  number,
  pageId:   string,
): PageCalibration {
  const dist = distancePx(startPx, endPx);
  if (knownIn <= 0 || dist <= 0) {
    return { pageId, pixelsPerInch: DEFAULT_PDF_PPI };
  }
  return {
    pageId,
    pixelsPerInch: dist / knownIn,
    refStartPx:    startPx,
    refEndPx:      endPx,
    knownInches:   knownIn,
  };
}
