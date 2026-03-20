/**
 * Camera.ts
 *
 * 2D viewport camera. Stores the current pan/zoom and converts between
 * SCREEN space (CSS pixels) and PAGE space (PDF page pixels).
 *
 *   screenX = pageX  × scale + tx
 *   screenY = pageY  × scale + ty
 *
 * The canvas buffer is rendered at devicePixelRatio for crispness.
 * applyToContext() bakes the DPR into the transform, so all draw calls
 * use page-space coordinates with no DPR correction needed at call sites.
 */

const MIN_SCALE  = 0.02;  //    2 %
const MAX_SCALE  = 100;   // 10 000 %
const ZOOM_STEP  = 1.15;  // per discrete wheel tick

export class Camera {
  scale = 1;
  tx    = 0;   // translation in CSS pixels
  ty    = 0;

  // ── Context Transform ─────────────────────────────────────────────────────

  /** Apply camera + DPR transform to a canvas context before drawing. */
  applyToContext(ctx: CanvasRenderingContext2D, dpr: number): void {
    ctx.setTransform(
      this.scale * dpr, 0,
      0, this.scale * dpr,
      this.tx * dpr,
      this.ty * dpr,
    );
  }

  // ── Coordinate Conversion ─────────────────────────────────────────────────

  /** Screen CSS px → page px */
  screenToPage(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.tx) / this.scale,
      y: (sy - this.ty) / this.scale,
    };
  }

  /** Page px → screen CSS px */
  pageToScreen(px: number, py: number): { x: number; y: number } {
    return {
      x: px * this.scale + this.tx,
      y: py * this.scale + this.ty,
    };
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  /**
   * Zoom toward a focal point (CSS px).
   * direction: +1 = zoom in, -1 = zoom out
   */
  zoomAt(focalX: number, focalY: number, direction: number): void {
    const factor   = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    if (newScale === this.scale) return;
    const ratio = newScale / this.scale;
    this.tx     = focalX - ratio * (focalX - this.tx);
    this.ty     = focalY - ratio * (focalY - this.ty);
    this.scale  = newScale;
  }

  /**
   * Smooth zoom from a continuous scale factor (e.g. trackpad pinch).
   * Use scaleFactor = 1 - deltaY * 0.003 from WheelEvent.
   */
  zoomBy(focalX: number, focalY: number, scaleFactor: number): void {
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * scaleFactor));
    if (newScale === this.scale) return;
    const ratio = newScale / this.scale;
    this.tx     = focalX - ratio * (focalX - this.tx);
    this.ty     = focalY - ratio * (focalY - this.ty);
    this.scale  = newScale;
  }

  // ── Pan ───────────────────────────────────────────────────────────────────

  pan(dx: number, dy: number): void {
    this.tx += dx;
    this.ty += dy;
  }

  // ── Fit ───────────────────────────────────────────────────────────────────

  /** Fit a page (page-pixel dimensions) centred in the screen with padding. */
  fitToPage(
    pageW:   number,
    pageH:   number,
    screenW: number,
    screenH: number,
    padding = 60,
  ): void {
    const sx = (screenW - padding * 2) / pageW;
    const sy = (screenH - padding * 2) / pageH;
    this.scale = Math.min(sx, sy);
    this.tx    = (screenW - pageW * this.scale) / 2;
    this.ty    = padding;
  }

  // ── Display Helpers ───────────────────────────────────────────────────────

  get zoomPercent(): string {
    return `${Math.round(this.scale * 100)}%`;
  }
}
