/**
 * renderEngine.ts
 *
 * Pure canvas drawing functions. No React, no side-effects.
 * All coordinates passed in are PAGE-SPACE pixels; the camera transform
 * (already applied to the context) handles the mapping to screen.
 */

import type { Camera } from './Camera';
import type { PageCalibration } from './coordinateSystem';
import type { SnapResult, SnapType } from './snapEngine';
import type { DrawnShape, InProgressShape } from '../types/shapes';
import type { PageState } from '../store/useStudioStore';
import type { TileResult } from './pdfTileManager';
import type { TypeCountDot, FrameType } from '../store/useProjectStore';

// ── Page-layout helper (also used by useCanvasEngine) ─────────────────────────

const CONTINUOUS_PAGE_GAP = 24; // px between pages in continuous-scroll mode

type PageLayout = {
  page:    PageState;
  yOffset: number;
};

/**
 * Compute the y-offset of each page in continuous-scroll virtual space.
 * Pages stack top-to-bottom with CONTINUOUS_PAGE_GAP between them.
 */
export function computePageLayout(pages: PageState[]): PageLayout[] {
  let y = 0;
  return pages.map(page => {
    const layout = { page, yOffset: y };
    y += page.heightPx + CONTINUOUS_PAGE_GAP;
    return layout;
  });
}

/**
 * Total virtual-canvas dimensions when all pages are stacked.
 * Width = widest page;  Height = sum of heights + gaps.
 */
export function virtualCanvasSize(pages: PageState[]): { w: number; h: number } {
  if (pages.length === 0) return { w: 0, h: 0 };
  const w = Math.max(...pages.map(p => p.widthPx));
  const h = pages.reduce((acc, p) => acc + p.heightPx, 0) +
            CONTINUOUS_PAGE_GAP * (pages.length - 1);
  return { w, h };
}

// ── Render Context ─────────────────────────────────────────────────────────────

type RenderContext = {
  ctx:        CanvasRenderingContext2D;
  canvas:     HTMLCanvasElement;
  camera:     Camera;
  dpr:        number;
  pageWidth:  number;
  pageHeight: number;
  shapes:     DrawnShape[];
  selectedId: string | null;
  inProgress: InProgressShape | null;
  snapResult: SnapResult;
  showGrid:   boolean;
  calibration: PageCalibration | null;

  // ── PDF background (Task 4.2) ────────────────────────────────────────────
  /** Best available tile for the active page.  null = white placeholder. */
  pdfTile:          TileResult | null;
  /** True = render all pages stacked vertically. */
  continuousScroll: boolean;
  /** Full page list (required when continuousScroll = true). */
  allPages:         PageState[];
  /**
   * Returns the best available tile for any page.
   * `viewport` is the page-space visible region for viewport-tile mode.
   */
  getTileForPage:   (pageId: string, viewport: { x: number; y: number; w: number; h: number }) => TileResult | null;
  /** Active page calibration per pageId (for continuous view). */
  calibrations:     Record<string, PageCalibration | null>;
  activePageId:     string;

  // ── TypeCountDots (Frame Type Library) ──────────────────────────────────
  /** All placed type-count dots for the project. Filtered per page during render. */
  typeDots:         TypeCountDot[];
  /** Color look-up: frameTypeId → hex color string. */
  frameTypeColors:  Record<string, string>;
  /** Mark look-up: frameTypeId → mark string (e.g. "SF-1A"). */
  frameTypeMarks:   Record<string, string>;
};

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  bg:           '#3a3a3a',
  pageShadow:   'rgba(0,0,0,0.55)',
  pageWhite:    '#ffffff',
  gridMinor:    'rgba(100,116,139,0.10)',
  gridMajor:    'rgba(100,116,139,0.22)',
  line:         '#38bdf8',
  rect:         '#38bdf8',
  rectFill:     'rgba(56,189,248,0.07)',
  polygon:      '#a78bfa',
  polygonFill:  'rgba(167,139,250,0.08)',
  selected:     '#fb923c',
  selFill:      'rgba(251,146,60,0.10)',
  inProgress:   '#38bdf8',
  snap:         '#22d3ee',
  calibLine:    '#fbbf24',
  label:        'rgba(226,232,240,0.9)',
  handle:       '#ffffff',
};

// ── Main Entry Point ──────────────────────────────────────────────────────────

export function renderFrame(rc: RenderContext): void {
  const { ctx, canvas, camera, dpr } = rc;

  // 1 — Clear at device resolution
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // 2 — Apply camera + DPR transform; all subsequent draws in page space
  ctx.save();
  camera.applyToContext(ctx, dpr);

  if (rc.continuousScroll && rc.allPages.length > 1) {
    // ── Continuous-scroll mode: render all pages stacked ───────────────────────
    const layouts = computePageLayout(rc.allPages);
    // Visible region in page-layout space (shared across all pages in the loop)
    const visMinY = (0 - camera.ty) / camera.scale;
    const visMaxY = (canvas.height / dpr - camera.ty) / camera.scale;
    const vpW     = (canvas.width  / dpr) / camera.scale;
    const vpH     = (canvas.height / dpr) / camera.scale;
    const vpX     = (0 - camera.tx) / camera.scale;

    for (const { page, yOffset } of layouts) {
      if (yOffset + page.heightPx < visMinY) continue;
      if (yOffset > visMaxY) break;

      ctx.save();
      ctx.translate(0, yOffset);

      // Per-page viewport: Y is relative to this page's own top-left origin.
      const pageVP = { x: vpX, y: visMinY - yOffset, w: vpW, h: vpH };
      const tile  = rc.getTileForPage(page.id, pageVP);
      const cal   = rc.calibrations[page.id] ?? null;
      const isActive = page.id === rc.activePageId;

      drawPageBackground(ctx, page.widthPx, page.heightPx, tile, camera.scale, dpr);

      if (rc.showGrid && camera.scale > 2) {
        drawGrid(ctx, camera, page.widthPx, page.heightPx);
      }
      if (cal?.refStartPx && cal.refEndPx) {
        drawCalibrationRef(ctx, cal, camera.scale);
      }

      const pageShapes = rc.shapes.filter(s => s.pageId === page.id);
      for (const shape of pageShapes) {
        drawShape(ctx, shape, camera.scale, rc.selectedId === shape.id);
      }

      // Draw type-count dots for this page
      const pageDots = rc.typeDots.filter(d => d.pageId === page.id);
      if (pageDots.length > 0) {
        drawTypeDots(ctx, pageDots, rc.frameTypeColors, rc.frameTypeMarks, camera.scale);
      }

      if (isActive && rc.inProgress) {
        drawInProgress(ctx, rc.inProgress, camera.scale);
      }

      ctx.restore();
    }

    // Snap indicator is always in active-page local coords — find its offset
    if (rc.snapResult.snapped) {
      const active = layouts.find(l => l.page.id === rc.activePageId);
      if (active) {
        ctx.save();
        ctx.translate(0, active.yOffset);
        drawSnapIndicator(ctx, rc.snapResult.point, camera.scale, rc.snapResult.snapType);
        ctx.restore();
      }
    }
  } else {
    // ── Single-page mode (default) ────────────────────────────────────────
    // 3 — Page background (PDF tile or white placeholder)
    drawPageBackground(ctx, rc.pageWidth, rc.pageHeight, rc.pdfTile, camera.scale, dpr);

    // 4 — Grid (only above 2× zoom)
    if (rc.showGrid && camera.scale > 2) {
      drawGrid(ctx, camera, rc.pageWidth, rc.pageHeight);
    }

    // 5 — Calibration reference lines
    if (rc.calibration?.refStartPx && rc.calibration.refEndPx) {
      drawCalibrationRef(ctx, rc.calibration, camera.scale);
    }

    // 6 — Committed shapes (filter to active page only)
    const pageShapes = rc.shapes.filter(s => s.pageId === rc.activePageId);
    for (const shape of pageShapes) {
      drawShape(ctx, shape, camera.scale, rc.selectedId === shape.id);
    }

    // 6b — Type-count dots (filter to active page only)
    const pageDots = rc.typeDots.filter(d => d.pageId === rc.activePageId);
    if (pageDots.length > 0) {
      drawTypeDots(ctx, pageDots, rc.frameTypeColors, rc.frameTypeMarks, camera.scale);
    }

    // 7 — In-progress shape
    if (rc.inProgress) {
      drawInProgress(ctx, rc.inProgress, camera.scale);
    }

    // 8 — Snap indicator
    if (rc.snapResult.snapped) {
      drawSnapIndicator(ctx, rc.snapResult.point, camera.scale, rc.snapResult.snapType);
    }
  }

  ctx.restore();
}

// ── Page background (PDF tile or white) ────────────────────────────────────────

function drawPageBackground(
  ctx:    CanvasRenderingContext2D,
  w:      number,
  h:      number,
  tile:   TileResult | null,
  scale:  number,
  dpr:    number,
): void {
  // Drop-shadow for the page card.
  // Cap shadowBlur: at low zoom the formula 18/(scale*dpr) can exceed
  // ~50 device-pixels, which triggers a Chromium compositing overflow
  // that causes the entire page rect to disappear.
  ctx.save();
  ctx.shadowColor = C.pageShadow;
  ctx.shadowBlur  = scale > 0.1 ? Math.min(20, 18 / (scale * dpr)) : 0;

  // White page background — always drawn first.  Provides the drop-shadow and
  // fills any page area not covered when a viewport tile only overlaps part of
  // the page (e.g. zoomed into a corner).
  ctx.fillStyle = C.pageWhite;
  ctx.fillRect(0, 0, w, h);
  ctx.shadowBlur = 0; // tile must not cast its own shadow

  if (tile) {
    if (tile.region) {
      // Viewport tile: covers only the visible page region at exact render scale.
      // Drawing at (region.x, region.y, region.w, region.h) in page-space, with
      // the camera transform applied, maps tile pixels 1:1 to screen pixels —
      // zero interpolation, zero blur at any zoom level.
      const r = tile.region;
      ctx.drawImage(tile.bitmap, r.x, r.y, r.w, r.h);
    } else {
      // Full-page tile: stretched to cover the whole page.
      ctx.drawImage(tile.bitmap, 0, 0, w, h);
    }
  }

  ctx.restore();
}

// ── Grid ──────────────────────────────────────────────────────────────────────

function drawGrid(
  ctx:   CanvasRenderingContext2D,
  cam:   Camera,
  pageW: number,
  pageH: number,
): void {
  const targetScreenPx = 48;
  const step           = niceGridStep(targetScreenPx / cam.scale);
  const majorStep      = step * 5;

  ctx.save();

  ctx.strokeStyle = C.gridMinor;
  ctx.lineWidth   = 0.5 / cam.scale;
  ctx.beginPath();
  for (let x = 0; x <= pageW; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, pageH); }
  for (let y = 0; y <= pageH; y += step) { ctx.moveTo(0, y); ctx.lineTo(pageW, y); }
  ctx.stroke();

  ctx.strokeStyle = C.gridMajor;
  ctx.lineWidth   = 0.8 / cam.scale;
  ctx.beginPath();
  for (let x = 0; x <= pageW; x += majorStep) { ctx.moveTo(x, 0); ctx.lineTo(x, pageH); }
  for (let y = 0; y <= pageH; y += majorStep) { ctx.moveTo(0, y); ctx.lineTo(pageW, y); }
  ctx.stroke();

  ctx.restore();
}

function niceGridStep(raw: number): number {
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}

// ── Calibration Reference ─────────────────────────────────────────────────────

function drawCalibrationRef(
  ctx: CanvasRenderingContext2D,
  cal: NonNullable<RenderContext['calibration']>,
  scale: number,
): void {
  if (!cal.refStartPx || !cal.refEndPx) return;
  const lw = 1.5 / scale;
  ctx.save();
  ctx.setLineDash([4 / scale, 3 / scale]);
  ctx.strokeStyle = C.calibLine;
  ctx.lineWidth   = lw;
  ctx.beginPath();
  ctx.moveTo(cal.refStartPx.x, cal.refStartPx.y);
  ctx.lineTo(cal.refEndPx.x,   cal.refEndPx.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // Ticks at ends
  const angle = Math.atan2(cal.refEndPx.y - cal.refStartPx.y, cal.refEndPx.x - cal.refStartPx.x);
  const perp  = angle + Math.PI / 2;
  const tick  = 5 / scale;
  for (const pt of [cal.refStartPx, cal.refEndPx]) {
    ctx.beginPath();
    ctx.moveTo(pt.x + Math.cos(perp) * tick, pt.y + Math.sin(perp) * tick);
    ctx.lineTo(pt.x - Math.cos(perp) * tick, pt.y - Math.sin(perp) * tick);
    ctx.stroke();
  }
  if (cal.knownInches !== undefined) {
    const mx = (cal.refStartPx.x + cal.refEndPx.x) / 2;
    const my = (cal.refStartPx.y + cal.refEndPx.y) / 2;
    drawLabel(ctx, `↔ ${cal.knownInches}"`, mx, my - 7 / scale, scale, C.calibLine);
  }
  ctx.restore();
}

// ── Committed Shape Drawing ───────────────────────────────────────────────────

function drawShape(
  ctx:      CanvasRenderingContext2D,
  shape:    DrawnShape,
  scale:    number,
  selected: boolean,
): void {
  const lw    = 2 / scale;
  const color = selected ? C.selected : (shape.color ?? (shape.type === 'polygon' ? C.polygon : C.rect));

  ctx.save();

  if (shape.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(shape.start.x, shape.start.y);
    ctx.lineTo(shape.end.x,   shape.end.y);
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.stroke();
    dot(ctx, shape.start, 3 / scale, color);
    dot(ctx, shape.end,   3 / scale, color);
    const mx = (shape.start.x + shape.end.x) / 2;
    const my = (shape.start.y + shape.end.y) / 2;
    drawLabel(ctx, `${shape.lengthInches.toFixed(2)}"`, mx, my - 7 / scale, scale);

  } else if (shape.type === 'rect') {
    const { origin: o, widthPx: w, heightPx: h } = shape;
    ctx.fillStyle = selected ? C.selFill : C.rectFill;
    ctx.fillRect(o.x, o.y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.strokeRect(o.x, o.y, w, h);
    // Dimension labels
    drawLabel(ctx, `${shape.widthInches.toFixed(2)}"`, o.x + w / 2,      o.y - 7 / scale,      scale);
    drawLabel(ctx, `${shape.heightInches.toFixed(2)}"`, o.x + w + 8 / scale, o.y + h / 2, scale, C.label, true);
    if (shape.label) {
      drawLabel(ctx, shape.label, o.x + w / 2, o.y + h / 2, scale, '#f1f5f9');
    }
    // Corner handles on selection
    if (selected) {
      const hs = 5 / scale;
      for (const corner of [o, {x:o.x+w,y:o.y}, {x:o.x+w,y:o.y+h}, {x:o.x,y:o.y+h}]) {
        ctx.fillStyle = C.handle;
        ctx.fillRect(corner.x - hs / 2, corner.y - hs / 2, hs, hs);
      }
    }

  } else if (shape.type === 'polygon') {
    if (shape.points.length < 2) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(shape.points[0].x, shape.points[0].y);
    for (let i = 1; i < shape.points.length; i++) {
      ctx.lineTo(shape.points[i].x, shape.points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle   = selected ? C.selFill : C.polygonFill;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.stroke();
    for (const pt of shape.points) dot(ctx, pt, 3 / scale, color);
  }

  ctx.restore();
}

// ── In-Progress Drawing ───────────────────────────────────────────────────────

function drawInProgress(
  ctx: CanvasRenderingContext2D,
  ip:  InProgressShape,
  scale: number,
): void {
  const lw = 2 / scale;
  ctx.save();
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.strokeStyle = C.inProgress;
  ctx.lineWidth   = lw;

  if (ip.type === 'line' && ip.start && ip.cursor) {
    ctx.beginPath();
    ctx.moveTo(ip.start.x, ip.start.y);
    ctx.lineTo(ip.cursor.x, ip.cursor.y);
    ctx.stroke();
    dot(ctx, ip.start, 3 / scale, C.inProgress);

  } else if (ip.type === 'rect' && ip.start && ip.cursor) {
    const x = Math.min(ip.start.x, ip.cursor.x);
    const y = Math.min(ip.start.y, ip.cursor.y);
    const w = Math.abs(ip.cursor.x - ip.start.x);
    const h = Math.abs(ip.cursor.y - ip.start.y);
    ctx.fillStyle = C.rectFill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

  } else if (ip.type === 'polygon' && ip.points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(ip.points[0].x, ip.points[0].y);
    for (let i = 1; i < ip.points.length; i++) {
      ctx.lineTo(ip.points[i].x, ip.points[i].y);
    }
    if (ip.cursor) ctx.lineTo(ip.cursor.x, ip.cursor.y);
    ctx.stroke();
    for (const pt of ip.points) dot(ctx, pt, 3 / scale, C.inProgress);

  } else if (ip.type === 'calibrate' && ip.start && ip.cursor) {
    ctx.strokeStyle = C.calibLine;
    ctx.beginPath();
    ctx.moveTo(ip.start.x, ip.start.y);
    ctx.lineTo(ip.cursor.x, ip.cursor.y);
    ctx.stroke();
    dot(ctx, ip.start, 3 / scale, C.calibLine);
  }

  ctx.restore();
}

// ── Snap Indicator ────────────────────────────────────────────────────────────

function drawSnapIndicator(
  ctx:      CanvasRenderingContext2D,
  pt:       { x: number; y: number },
  scale:    number,
  snapType: SnapType,
): void {
  const r = 6 / scale;
  ctx.save();
  ctx.lineWidth = 1.5 / scale;

  if (snapType === 'endpoint') {
    // Magenta square — corners of frames
    ctx.strokeStyle = '#e879f9';
    ctx.fillStyle   = 'rgba(232,121,249,0.15)';
    ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
    ctx.strokeRect(pt.x - r, pt.y - r, r * 2, r * 2);
  } else if (snapType === 'intersection') {
    // Yellow diamond — mullion/transom intersections
    ctx.strokeStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(pt.x,           pt.y - r * 1.4);
    ctx.lineTo(pt.x + r * 1.4, pt.y);
    ctx.lineTo(pt.x,           pt.y + r * 1.4);
    ctx.lineTo(pt.x - r * 1.4, pt.y);
    ctx.closePath();
    ctx.stroke();
  } else {
    // Midpoint: cyan circle + crosshair
    ctx.strokeStyle = C.snap;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pt.x - r * 1.5, pt.y);
    ctx.lineTo(pt.x + r * 1.5, pt.y);
    ctx.moveTo(pt.x, pt.y - r * 1.5);
    ctx.lineTo(pt.x, pt.y + r * 1.5);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dot(
  ctx:   CanvasRenderingContext2D,
  pt:    { x: number; y: number },
  r:     number,
  color: string,
): void {
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// ── TypeCountDot Rendering ─────────────────────────────────────────────────────

/**
 * Render a set of TypeCountDots as colored circular pins with:
 *   - A filled circle in the frame type's color
 *   - A white border ring for contrast on any PDF background
 *   - The instance number inside in white bold text
 *   - The frame mark as a small label beneath
 *
 * Dots are drawn in page-space (caller has already translated for any page offset).
 */
function drawTypeDots(
  ctx:        CanvasRenderingContext2D,
  dots:       TypeCountDot[],
  colorMap:   Record<string, string>,
  markMap:    Record<string, string>,
  scale:      number,
): void {
  // Pin radius in page-space pixels — comfortable to click/read at all zoom levels
  const r      = 10 / scale;
  const border = 2  / scale;
  const fontSize = Math.max(6, 8 / scale);
  const labelFs  = Math.max(5, 7 / scale);

  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (const dot of dots) {
    const { x, y } = dot.position;
    const color = colorMap[dot.frameTypeId] ?? '#38bdf8';
    const mark  = markMap[dot.frameTypeId]  ?? '?';

    // White outline ring
    ctx.beginPath();
    ctx.arc(x, y, r + border, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.fill();

    // Filled color circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Instance number
    ctx.font        = `bold ${fontSize}px system-ui,-apple-system,sans-serif`;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(String(dot.instanceNum), x, y);

    // Mark label below the dot
    ctx.font        = `${labelFs}px system-ui,-apple-system,sans-serif`;
    ctx.fillStyle   = color;
    // Semi-transparent background pill for legibility
    const labelText = mark;
    const tw = ctx.measureText(labelText).width;
    const lx = x - tw / 2 - 2 / scale;
    const ly = y + r + border + 1 / scale;
    ctx.fillStyle = 'rgba(15,23,42,0.75)';
    ctx.fillRect(lx, ly, tw + 4 / scale, labelFs + 2 / scale);
    ctx.fillStyle = color;
    ctx.fillText(labelText, x, ly + labelFs / 2 + 1 / scale);
  }

  ctx.restore();
}

// ── Labels ─────────────────────────────────────────────────────────────────────

function drawLabel(
  ctx:     CanvasRenderingContext2D,
  text:    string,
  x:       number,
  y:       number,
  scale:   number,
  color    = C.label,
  rotated  = false,
): void {
  const fontSize = Math.max(8, 11 / scale);
  ctx.save();
  ctx.font        = `${fontSize}px system-ui,-apple-system,sans-serif`;
  ctx.fillStyle   = color;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  if (rotated) {
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(text, 0, 0);
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}
