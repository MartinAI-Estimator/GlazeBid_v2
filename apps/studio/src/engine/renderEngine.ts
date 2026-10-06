/**
 * renderEngine.ts
 *
 * Pure canvas drawing functions. No React, no side-effects.
 * All coordinates passed in are PAGE-SPACE pixels; the camera transform
 * (already applied to the context) handles the mapping to screen.
 */

import type { Camera } from './Camera';
import { DEFAULT_PDF_PPI, type PageCalibration } from './coordinateSystem';
import { handlesOf, measureLabel } from './shapeGeometry';
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
  /** Hyperlinked callout under the cursor (active page) — highlighted like Bluebeam. */
  hoverLinkRect?:   [number, number, number, number] | null;
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
      const ppiP = cal?.pixelsPerInch ?? DEFAULT_PDF_PPI;
      for (const shape of pageShapes) {
        drawShape(ctx, shape, camera.scale, rc.selectedId === shape.id, ppiP);
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
    const ppiA = rc.calibration?.pixelsPerInch ?? DEFAULT_PDF_PPI;
    for (const shape of pageShapes) {
      drawShape(ctx, shape, camera.scale, rc.selectedId === shape.id, ppiA);
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

    // 7b — hovered hyperlink
    if (rc.hoverLinkRect) {
      const [x0, y0, x1, y1] = rc.hoverLinkRect, pad = 2 / camera.scale;
      ctx.save();
      ctx.fillStyle = 'rgba(14,165,233,0.15)';
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 1.5 / camera.scale;
      ctx.fillRect(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad);
      ctx.strokeRect(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad);
      ctx.restore();
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

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Tool Chest markups: Toolbox colours, live measurement label, handles when selected. */
function drawSubjectShape(
  ctx: CanvasRenderingContext2D, shape: DrawnShape, scale: number, selected: boolean, ppi: number,
): void {
  const stroke = shape.color ?? '#FFFF00';
  const fillA  = hexA(shape.fill ?? stroke, shape.author === 'external' ? Math.min(shape.opacity ?? 0.2, 0.2)
                       : shape.subjectRole === 'highlight' ? 0.35 : (shape.opacity ?? 0.25));
  const lw     = (shape.subjectRole === 'polylength' ? 3 : 2) / scale;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  let labelAt: { x: number; y: number } | null = null;
  if (shape.type === 'rect') {
    const { origin: o, widthPx: w, heightPx: h } = shape;
    ctx.fillStyle = fillA; ctx.fillRect(o.x, o.y, w, h); ctx.strokeRect(o.x, o.y, w, h);
    labelAt = { x: o.x + w / 2, y: o.y + h / 2 };
  } else if (shape.type === 'polygon' && shape.points.length >= 2) {
    ctx.beginPath(); ctx.moveTo(shape.points[0].x, shape.points[0].y);
    for (const q of shape.points.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.closePath(); ctx.fillStyle = fillA; ctx.fill(); ctx.stroke();
    const n = shape.points.length;
    labelAt = { x: shape.points.reduce((a, q) => a + q.x, 0) / n, y: shape.points.reduce((a, q) => a + q.y, 0) / n };
  } else if (shape.type === 'polyline' && shape.points.length >= 2) {
    ctx.beginPath(); ctx.moveTo(shape.points[0].x, shape.points[0].y);
    for (const q of shape.points.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.stroke();
    // label at the middle of the longest segment
    let best = 0, bi = 1;
    for (let i = 1; i < shape.points.length; i++) {
      const L = Math.hypot(shape.points[i].x - shape.points[i - 1].x, shape.points[i].y - shape.points[i - 1].y);
      if (L > best) { best = L; bi = i; }
    }
    const a = shape.points[bi - 1], b = shape.points[bi];
    labelAt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 8 / scale };
  } else if (shape.type === 'line') {
    ctx.beginPath(); ctx.moveTo(shape.start.x, shape.start.y); ctx.lineTo(shape.end.x, shape.end.y); ctx.stroke();
    labelAt = { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 - 8 / scale };
  } else if (shape.type === 'marker' && shape.subjectRole === 'flag') {
    // yellow flag pin: engine uncertainty (reason in Properties)
    const { x, y } = shape.position, r = 8 / scale;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - r * 0.8, y - r * 1.6); ctx.lineTo(x + r * 0.8, y - r * 1.6); ctx.closePath();
    ctx.fillStyle = '#facc15'; ctx.fill(); ctx.lineWidth = 1 / scale; ctx.strokeStyle = '#713f12'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - r * 2.1, r * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#713f12'; ctx.font = `bold ${r * 1.2}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y - r * 2.05);
    if (selected) { ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2 / scale; ctx.beginPath(); ctx.arc(x, y - r * 2.1, r * 1.3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    return;
  } else if (shape.type === 'marker') {
    const r = 7 / scale;
    ctx.beginPath(); ctx.arc(shape.position.x, shape.position.y, r, 0, Math.PI * 2);
    ctx.fillStyle = hexA(stroke, 0.55); ctx.fill(); ctx.stroke();
    if (shape.qtyOverride != null) labelAt = { x: shape.position.x, y: shape.position.y - r - 8 / scale };
  }
  if (labelAt && shape.author !== 'external') {
    const lines = measureLabel(shape, ppi);
    if (lines.length) drawTag(ctx, lines, labelAt.x, labelAt.y, scale, stroke);
  }
  // engine markup not yet reviewed → small badge
  if (shape.author === 'engine' && shape.reviewState !== 'accepted' && labelAt) {
    dot(ctx, { x: labelAt.x - 10 / scale, y: labelAt.y - 10 / scale }, 3.5 / scale, '#facc15');
  }
  if (selected) drawHandles(ctx, shape, scale);
  ctx.restore();
}

function drawHandles(ctx: CanvasRenderingContext2D, shape: DrawnShape, scale: number): void {
  const hs = 7 / scale;
  ctx.save();
  ctx.lineWidth = 1 / scale;
  for (const h of handlesOf(shape)) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0ea5e9';
    ctx.fillRect(h.at.x - hs / 2, h.at.y - hs / 2, hs, hs);
    ctx.strokeRect(h.at.x - hs / 2, h.at.y - hs / 2, hs, hs);
  }
  ctx.restore();
}

/** Measurement tag: dark rounded box with one line per value (Bluebeam-like). */
function drawTag(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, scale: number, accent: string): void {
  const fs = 10 / scale, pad = 3 / scale, lh = fs * 1.25;
  ctx.save();
  ctx.font = `600 ${fs}px system-ui,-apple-system,sans-serif`;
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2;
  const h = lh * lines.length + pad * 2;
  ctx.fillStyle = 'rgba(15,23,42,0.82)';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(x - w / 2, y - h / 2, 2 / scale, h);
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, x, y - h / 2 + pad + lh * (i + 0.5)));
  ctx.restore();
}

function drawShape(
  ctx:      CanvasRenderingContext2D,
  shape:    DrawnShape,
  scale:    number,
  selected: boolean,
  ppi:      number = DEFAULT_PDF_PPI,
): void {
  if (shape.subject || shape.type === 'polyline') {
    drawSubjectShape(ctx, shape, scale, selected, ppi);
    return;
  }
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
    // Only show dimension label when selected
    if (selected) {
      const mx = (shape.start.x + shape.end.x) / 2;
      const my = (shape.start.y + shape.end.y) / 2;
      drawLabel(ctx, `${shape.lengthInches.toFixed(2)}"`, mx, my - 7 / scale, scale);
    }

  } else if (shape.type === 'rect') {
    const { origin: o, widthPx: w, heightPx: h } = shape;
    ctx.fillStyle = selected ? C.selFill : C.rectFill;
    ctx.fillRect(o.x, o.y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.strokeRect(o.x, o.y, w, h);
    // Dimension labels only when selected
    if (selected) {
      drawLabel(ctx, `${shape.widthInches.toFixed(2)}"`, o.x + w / 2,      o.y - 7 / scale,      scale);
      drawLabel(ctx, `${shape.heightInches.toFixed(2)}"`, o.x + w + 8 / scale, o.y + h / 2, scale, C.label, true);
    }
    if (shape.label) {
      drawLabel(ctx, shape.label, o.x + w / 2, o.y + h / 2, scale, '#f1f5f9');
    }
    if (selected) drawHandles(ctx, shape, scale);

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
  if (selected && shape.type !== 'rect') drawHandles(ctx, shape, scale);
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

  } else if (ip.type === 'polyline' && ip.points.length > 0) {
    ctx.setLineDash([]);
    ctx.lineWidth = 3 / scale;
    ctx.beginPath();
    ctx.moveTo(ip.points[0].x, ip.points[0].y);
    for (let i = 1; i < ip.points.length; i++) ctx.lineTo(ip.points[i].x, ip.points[i].y);
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
