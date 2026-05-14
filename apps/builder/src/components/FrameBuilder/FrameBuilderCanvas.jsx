/**
 * FrameBuilderCanvas — 2D CAD canvas for glazing frame parametric preview
 *
 * Renders a live 2D drawing of the frame with:
 * - Glass panes
 * - Frame members (head, sill, jambs, mullions, transoms)
 * - Dimension strings (overall, bay widths, row heights)
 * - Context (wall, floor finish)
 * - Interactive zoom/pan
 *
 * Uses HTML5 Canvas 2D API directly (no fabric.js, no Konva).
 * Consumes useFrameBuilderStore for frame data.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';
import { fmtIn } from '@glazebid/frame-engine';

// ─── Fallback fmtIn if import fails ──────────────────────────────────────────
function fmtInFallback(inches) {
  if (inches <= 0) return '0"';
  const ft = Math.floor(inches / 12);
  const rem = inches % 12;
  const whole = Math.floor(rem);
  const frac = rem - whole;

  const FRACS = [
    [0, ''],
    [1/16, '1/16'],
    [1/8, '1/8'],
    [3/16, '3/16'],
    [1/4, '1/4'],
    [5/16, '5/16'],
    [3/8, '3/8'],
    [7/16, '7/16'],
    [1/2, '1/2'],
    [9/16, '9/16'],
    [5/8, '5/8'],
    [11/16, '11/16'],
    [3/4, '3/4'],
    [13/16, '13/16'],
    [7/8, '7/8'],
    [15/16, '15/16'],
  ];

  let fracStr = '';
  for (const [val, str] of FRACS) {
    if (Math.abs(frac - val) < 0.01) {
      fracStr = str;
      break;
    }
  }

  if (ft === 0 && whole === 0) {
    return fracStr ? `${fracStr}"` : '0"';
  }
  if (ft === 0) {
    return fracStr ? `${whole} ${fracStr}"` : `${whole}"`;
  }
  if (whole === 0 && !fracStr) {
    return `${ft}'`;
  }
  if (!fracStr) {
    return `${ft}'-${whole}"`;
  }
  return `${ft}'-${whole} ${fracStr}"`;
}

const fmt = fmtIn || fmtInFallback;

// ─── Helper: Parse frame data into usable structure ──────────────────────────
function getFrameGeometry(frame) {
  if (!frame) return null;

  const {
    widthInches = 0,
    heightInches = 0,
    bays = 1,
    rows = 1,
    vendorSystemId = '',
  } = frame;

  const profileWidth = 1.75;

  // === Variable bay widths ===
  const bayConfigs = frame.bayConfigs || [];
  let bayWidths;
  if (bayConfigs.length === bays && bayConfigs.every(c => typeof c.widthOverride === 'number')) {
    bayWidths = bayConfigs.map(c => c.widthOverride);
  } else {
    const totalBayWidth = widthInches - ((bays - 1) * profileWidth);
    const eqW = bays > 0 ? totalBayWidth / bays : 0;
    bayWidths = Array(Math.max(bays, 1)).fill(eqW);
  }

  // === Variable row heights ===
  const rowConfigs = frame.rowConfigs || [];
  let rowHeights;
  if (rowConfigs.length === rows && rowConfigs.every(c => typeof c.heightOverride === 'number')) {
    rowHeights = rowConfigs.map(c => c.heightOverride);
  } else {
    const totalRowHeight = heightInches - ((rows - 1) * profileWidth);
    const eqH = rows > 0 ? totalRowHeight / rows : 0;
    rowHeights = Array(Math.max(rows, 1)).fill(eqH);
  }

  // Cumulative bay x offsets from frameLeft (where each bay's pane starts)
  const bxOffsets = [];
  let cx = profileWidth;
  for (let b = 0; b < bays; b++) {
    bxOffsets.push(cx);
    cx += bayWidths[b] + profileWidth;
  }

  // Cumulative row y offsets from frameTop
  const ryOffsets = [];
  let cy = profileWidth;
  for (let r = 0; r < rows; r++) {
    ryOffsets.push(cy);
    cy += rowHeights[r] + profileWidth;
  }

  // Backward-compat single values (first bay/row)
  const bayWidth = bayWidths[0] ?? 0;
  const rowHeight = rowHeights[0] ?? 0;
  const DLO_w = Math.max(bayWidth - profileWidth, 0);
  const DLO_h = Math.max(rowHeight - profileWidth, 0);

  return {
    frameWidth: widthInches,
    frameHeight: heightInches,
    bays,
    rows,
    bayWidths,
    rowHeights,
    bxOffsets,
    ryOffsets,
    bayWidth,
    rowHeight,
    profileWidth,
    DLO_w,
    DLO_h,
    mark: frame.mark || 'A-1',
    sillAFF: frame.sillAFF || 0,
    vendorSystemId,
  };
}

// ─── Main Drawing Function ──────────────────────────────────────────────────

// Member finish color palette
const MEMBER_COLORS = {
  'clear-anod':       { fill: '#7a8e96', face: '#9aaeb6', shadow: '#5a6e76' },
  'dark-bronze':      { fill: '#2d1e0a', face: '#4d3e2a', shadow: '#1a1005' },
  'black-anod':       { fill: '#1a1a1a', face: '#2a2a2a', shadow: '#0a0a0a' },
  'two-coat-paint':   { fill: '#4a5a6a', face: '#6a7a8a', shadow: '#2a3a4a' },
  'three-coat-kynar': { fill: '#3a4020', face: '#5a6040', shadow: '#1a2010' },
  'custom':           { fill: '#2d1e0a', face: '#4d3e2a', shadow: '#1a1005' },
};

// Match selected/hovered element to a hit region
function elMatch(el, reg) {
  if (!el || !reg) return false;
  if (el.type !== reg.type) return false;
  if (reg.bay !== undefined && el.bay !== reg.bay) return false;
  if (reg.row !== undefined && el.row !== reg.row) return false;
  return true;
}

// ─── DLO Geometry Helper ─────────────────────────────────────────────────────
// Computes self-consistent panel origins and DLO sizes.
// Interior mullions are profileWidth wide (single profile), perimeter
// jambs/head/sill are also profileWidth wide — all members the same gauge.
// panelX[b] = world-x where bay b DLO starts
// panelY[r] = world-y where row r DLO starts
// dloBayW[b] / dloRowH[r] = DLO dimensions in world inches
function getDLOGeometry(geo) {
  const { frameWidth, frameHeight, bays, rows, bayWidths, rowHeights, profileWidth } = geo;
  const frameLeft = -frameWidth / 2;
  const frameTop  = -frameHeight / 2;

  const dloBayW = bayWidths.map(w => Math.max(w - profileWidth, 0));
  const dloRowH = rowHeights.map(h => Math.max(h - profileWidth, 0));

  let cx = profileWidth; // starts after left jamb inner face
  const panelX = [];
  for (let b = 0; b < bays; b++) {
    panelX.push(frameLeft + cx);
    cx += dloBayW[b] + profileWidth; // DLO + next mullion (or right jamb)
  }

  let cy = profileWidth; // starts after head inner face
  const panelY = [];
  for (let r = 0; r < rows; r++) {
    panelY.push(frameTop + cy);
    cy += dloRowH[r] + profileWidth;
  }

  return { frameLeft, frameTop, dloBayW, dloRowH, panelX, panelY, profileWidth, frameWidth, frameHeight, bays, rows };
}

// Compute world-space hit regions for interactive click/hover
function computeHitRegions(geo) {
  if (!geo) return [];
  const { frameLeft, frameTop, panelX, panelY, dloBayW, dloRowH, profileWidth, frameWidth, frameHeight, bays, rows } = getDLOGeometry(geo);
  const regions = [];
  const GRAB = 10; // generous grab zone for mullion/transom drag (world-inches)

  // Glass panes
  for (let b = 0; b < bays; b++) {
    for (let r = 0; r < rows; r++) {
      regions.push({ type: 'pane', bay: b, row: r,
        x: panelX[b], y: panelY[r], w: dloBayW[b], h: dloRowH[r] });
    }
  }
  // Perimeter members
  regions.push({ type: 'head',       x: frameLeft,                            y: frameTop,                                w: frameWidth,   h: profileWidth });
  regions.push({ type: 'sill',       x: frameLeft,                            y: frameTop + frameHeight - profileWidth,   w: frameWidth,   h: profileWidth });
  regions.push({ type: 'jamb-left',  x: frameLeft,                            y: frameTop,                                w: profileWidth, h: frameHeight  });
  regions.push({ type: 'jamb-right', x: frameLeft + frameWidth - profileWidth, y: frameTop,                               w: profileWidth, h: frameHeight  });
  // Interior mullions — grab zone clamped to inside head/sill (verticals run through)
  for (let b = 1; b < bays; b++) {
    const leftFace = panelX[b - 1] + dloBayW[b - 1];
    const cx = leftFace + profileWidth / 2;
    regions.push({ type: 'mullion', bay: b,
      x: cx - GRAB, y: frameTop + profileWidth,
      w: GRAB * 2,  h: frameHeight - 2 * profileWidth });
  }
  // Interior transoms — per-bay (horizontals interrupt at each vertical)
  for (let r = 1; r < rows; r++) {
    const topFace = panelY[r - 1] + dloRowH[r - 1];
    const cy = topFace + profileWidth / 2;
    for (let b = 0; b < bays; b++) {
      const leftX  = panelX[b];
      const rightX = panelX[b] + dloBayW[b];
      regions.push({ type: 'transom', row: r, bay: b,
        x: leftX, y: cy - GRAB, w: rightX - leftX, h: GRAB * 2 });
    }
  }
  return regions;
}
function drawFrame(ctx, frame, camera, layers, canvasSize, selectedEl, hoveredEl, finishType) {
  const { w, h } = canvasSize;
  const { x: panX, y: panY, zoom } = camera;

  // 1. Clear background — dark CAD
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, w, h);

  // 2. Draw grid (if enabled)
  if (layers.grid) {
    drawGrid(ctx, w, h, panX, panY, zoom);
  }

  // 3. Apply camera transform
  ctx.save();
  ctx.translate(w / 2 + panX, h / 2 + panY);
  ctx.scale(zoom, zoom);

  const geo = getFrameGeometry(frame);

  if (geo) {
    // 4. Draw context (wall, floor) if enabled
    if (layers.context) {
      drawContextLayer(ctx, geo, frame, zoom);
    }

    // 5. Render frame based on shape
    if (frame.shape === 'raked' && frame.leftHeightInches && frame.rightHeightInches) {
      if (layers.glass) {
        drawRakedGlassLayer(ctx, frame);
      }
      drawRakedFrame(ctx, frame, geo);
      if (layers.dimensions) {
        drawRakedDimensions(ctx, frame, zoom);
      }
      if (layers.labels) {
        drawRakedLabels(ctx, frame, zoom);
      }
    } else if (frame.shape === 'arched-head') {
      if (layers.glass) {
        drawArchedGlassLayer(ctx, frame, geo);
      }
      drawArchedFrame(ctx, frame, geo);
      if (layers.dimensions) {
        drawDimensions(ctx, geo, zoom);
      }
      if (layers.labels) {
        drawArchedLabels(ctx, frame, geo, zoom);
      }
    } else if (frame.shape === 'circle' || frame.shape === 'oval') {
      if (layers.glass) {
        drawCircleGlassLayer(ctx, frame);
      }
      drawCircleFrame(ctx, frame);
      if (layers.dimensions) {
        drawCircleDimensions(ctx, frame, zoom);
      }
      if (layers.labels) {
        drawCircleLabels(ctx, frame, zoom);
      }
    } else if (frame.shape !== 'rectangular') {
      // Custom polygon or other non-rectangular shapes
      drawCustomGeometryPlaceholder(ctx, frame, zoom);
    } else {
      // Standard rectangular frame
      if (layers.glass) {
        drawGlassLayer(ctx, geo, zoom, frame, selectedEl, hoveredEl);
      }
      drawRectangularFrame(ctx, geo, zoom, finishType, selectedEl, hoveredEl, frame);
      if (layers.dimensions) {
        drawDimensions(ctx, geo, zoom);
      }
      if (layers.labels) {
        drawLabels(ctx, geo, zoom);
      }
    }
  }

  ctx.restore();
}

// ─── Grid Drawing ───────────────────────────────────────────────────────────
function drawGrid(ctx, canvasWidth, canvasHeight, panX, panY, zoom) {
  const minorSpacing = 12; // 12" world units
  const majorSpacing = 48; // 48" world units

  // Calculate grid in world coordinates
  const leftWorldEdge = (-canvasWidth / 2 - panX) / zoom;
  const rightWorldEdge = (canvasWidth / 2 - panX) / zoom;
  const topWorldEdge = (-canvasHeight / 2 - panY) / zoom;
  const bottomWorldEdge = (canvasHeight / 2 - panY) / zoom;

  const minGridX = Math.floor(leftWorldEdge / minorSpacing) * minorSpacing;
  const maxGridX = Math.ceil(rightWorldEdge / minorSpacing) * minorSpacing;
  const minGridY = Math.floor(topWorldEdge / minorSpacing) * minorSpacing;
  const maxGridY = Math.ceil(bottomWorldEdge / minorSpacing) * minorSpacing;

  ctx.save();
  ctx.translate(canvasWidth / 2 + panX, canvasHeight / 2 + panY);
  ctx.scale(zoom, zoom);

  // Minor grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 0.5 / zoom;
  for (let x = minGridX; x <= maxGridX; x += minorSpacing) {
    if (x % majorSpacing === 0) continue; // Skip major lines
    ctx.beginPath();
    ctx.moveTo(x, minGridY);
    ctx.lineTo(x, maxGridY);
    ctx.stroke();
  }
  for (let y = minGridY; y <= maxGridY; y += minorSpacing) {
    if (y % majorSpacing === 0) continue; // Skip major lines
    ctx.beginPath();
    ctx.moveTo(minGridX, y);
    ctx.lineTo(maxGridX, y);
    ctx.stroke();
  }

  // Major grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1 / zoom;
  for (let x = minGridX; x <= maxGridX; x += majorSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, minGridY);
    ctx.lineTo(x, maxGridY);
    ctx.stroke();
  }
  for (let y = minGridY; y <= maxGridY; y += majorSpacing) {
    ctx.beginPath();
    ctx.moveTo(minGridX, y);
    ctx.lineTo(maxGridX, y);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Context Layer (Wall, Floor) ────────────────────────────────────────────
function drawContextLayer(ctx, geo, frame, zoom) {
  const { frameWidth, frameHeight, profileWidth } = geo;
  const jointClearance = 0.5;

  const roWidth = frameWidth + jointClearance * 2;
  const roHeight = frameHeight + jointClearance * 2;
  const roLeft = -roWidth / 2;
  const roTop = -roHeight / 2;

  // Wall surround — no fill, line only
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1 / zoom;
  ctx.strokeRect(roLeft, roTop, roWidth, roHeight);

  // Exterior / Interior labels
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = `${9 / zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXTERIOR', 0, roTop - 18 / zoom);
  ctx.fillText('INTERIOR', 0, roTop + roHeight + 18 / zoom);

  // Floor finish line
  const sillAFF = frame?.sillAFF || 0;
  ctx.strokeStyle = 'rgba(80,200,120,0.5)';
  ctx.lineWidth = 0.6 / zoom;
  ctx.setLineDash([3 / zoom, 3 / zoom]);
  ctx.beginPath();
  ctx.moveTo(-frameWidth / 2 - 30 / zoom, -frameHeight / 2);
  ctx.lineTo(frameWidth / 2 + 30 / zoom, -frameHeight / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(80,200,120,0.5)';
  ctx.font = `${8 / zoom}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`SILL: ${sillAFF}" AFF`, frameWidth / 2 + 28 / zoom, -frameHeight / 2 + 2 / zoom);
}

// ─── Glass Layer ────────────────────────────────────────────────────────────
function drawGlassLayer(ctx, geo, zoom, frame, selectedEl, hoveredEl) {
  const { panelX, panelY, dloBayW, dloRowH, bays, rows } = getDLOGeometry(geo);
  const spandrelRows = frame?.spandrelRows || [];

  for (let b = 0; b < bays; b++) {
    for (let r = 0; r < rows; r++) {
      const px = panelX[b];
      const py = panelY[r];
      const pw = dloBayW[b];
      const ph = dloRowH[r];
      const isSpandrel = spandrelRows.includes(r);

      // Fill — nearly transparent so lines dominate
      ctx.fillStyle = isSpandrel ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(px, py, pw, ph);

      // Pane edge line
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5 / zoom;
      ctx.strokeRect(px, py, pw, ph);

      // Selection / hover
      if (selectedEl?.type === 'pane' && selectedEl.bay === b && selectedEl.row === r) {
        ctx.fillStyle = 'rgba(59,130,246,0.15)';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = 'rgba(96,165,250,0.8)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeRect(px, py, pw, ph);
      } else if (hoveredEl?.type === 'pane' && hoveredEl.bay === b && hoveredEl.row === r) {
        ctx.fillStyle = 'rgba(59,130,246,0.08)';
        ctx.fillRect(px, py, pw, ph);
      }

      // DLO label
      const paneScreenH = ph * zoom;
      if (!isSpandrel && paneScreenH >= 50) {
        ctx.fillStyle = 'rgba(150,200,220,0.55)';
        ctx.font = `${9 / zoom}px "SF Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${fmt(pw)} × ${fmt(ph)}`, px + pw / 2, py + ph / 2);
      } else if (isSpandrel && paneScreenH >= 40) {
        ctx.fillStyle = 'rgba(150,200,220,0.4)';
        ctx.font = `${8 / zoom}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SPANDREL', px + pw / 2, py + ph / 2);
      }
    }
  }
}

// Helper: lighten a hex color by a 0-1 factor
function lightenHex(hex, factor) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const lr = Math.min(255, Math.round(r + (255 - r) * factor));
  const lg = Math.min(255, Math.round(g + (255 - g) * factor));
  const lb = Math.min(255, Math.round(b + (255 - b) * factor));
  return `rgb(${lr},${lg},${lb})`;
}

// ─── Rectangular Frame Members ──────────────────────────────────────────────
// Draws frame members as double-line aluminum profiles (outer face + inner face).
// Each member shows two parallel lines separated by profileWidth in world-inches.
function drawRectangularFrame(ctx, geo, zoom, finishType, selectedEl, hoveredEl, frame) {
  const { frameLeft, frameTop, panelX, panelY, dloBayW, dloRowH,
          profileWidth, frameWidth, frameHeight, bays, rows } = getDLOGeometry(geo);

  const bayConfigs = frame?.bayConfigs || [];
  const doorBays = new Set(
    bayConfigs
      .filter(c => c.type === 'door-single' || c.type === 'door-pair')
      .map(c => c.index)
  );

  const structStatus = frame?.lastBOM?.structural?.status;
  const needsSteel   = structStatus === 'ADD_STEEL' || structStatus === 'UPGRADE_PROFILE';
  const isIncomplete = !frame?.lastBOM;

  const PROF_MULT = { 'std-2': 1.0, 'hd-4': 2.3, 'str-6': 3.4 };

  ctx.lineCap = 'square';

  // ── Helper: stroke a single line, highlighted if selected/hovered ──
  function line(x1, y1, x2, y2, hitReg, col, lw) {
    const sel = elMatch(selectedEl, hitReg);
    const hov = elMatch(hoveredEl,  hitReg);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = sel ? '#3b82f6' : (hov ? 'rgba(96,165,250,0.6)' : col);
    ctx.lineWidth   = (sel ? 3 : lw) / zoom;
    ctx.stroke();
  }

  // ── Helper: draw TWO parallel lines for one member face ──
  // faceA / faceB are the two line positions; ax1..y2 define the line extent.
  function doubleLine(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2, hitReg, col, lw) {
    const sel = elMatch(selectedEl, hitReg);
    const hov = elMatch(hoveredEl,  hitReg);
    const sc  = sel ? '#3b82f6' : (hov ? 'rgba(96,165,250,0.6)' : col);
    const lwidth = (sel ? 3 : lw) / zoom;
    // selection fill between the two lines
    if (sel) {
      ctx.fillStyle = 'rgba(59,130,246,0.15)';
      // Build fill polygon from the four corners
      ctx.beginPath();
      ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2);
      ctx.lineTo(bx2, by2); ctx.lineTo(bx1, by1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = sc;
    ctx.lineWidth = lwidth;
    ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke();
  }

  // Shorthand extents
  const fL = frameLeft;
  const fT = frameTop;
  const fR = frameLeft + frameWidth;
  const fB = frameTop  + frameHeight;
  const pw = profileWidth;

  // ─────────────────────────────────────────────────────────────────────────
  // SCREW-SPLINE STOREFRONT JOINERY — draw order:
  //   1. Head outer + sill outer  (full width — defines RO)
  //   2. Head inner + sill inner  (per-bay segments, interrupted by verticals)
  //   3. Transoms                 (per-bay segments, interrupted by verticals)
  //   4. Jambs                    (full height — run through head/sill)
  //   5. Mullions                 (full height — drawn last, visually on top)
  // TODO curtain_wall: reverse — horizontals run through, verticals interrupt per row.

  // ── 1. Head outer + sill outer — full width ──
  line(fL, fT, fR, fT, { type: 'head' }, '#e8e8e8', 1.5);
  line(fL, fB, fR, fB, { type: 'sill' }, '#e8e8e8', 1.5);

  // ── 2. Head inner + sill inner — per-bay segments ──
  {
    const headSel = elMatch(selectedEl, { type: 'head' });
    const sillSel = elMatch(selectedEl, { type: 'sill' });
    // Selection fill spans the full band so the highlight reads clearly
    if (headSel) { ctx.fillStyle = 'rgba(59,130,246,0.15)'; ctx.fillRect(fL, fT, frameWidth, pw); }
    if (sillSel) { ctx.fillStyle = 'rgba(59,130,246,0.15)'; ctx.fillRect(fL, fB - pw, frameWidth, pw); }
    for (let b = 0; b < bays; b++) {
      const leftX  = panelX[b];
      const rightX = panelX[b] + dloBayW[b];
      line(leftX, fT + pw, rightX, fT + pw, { type: 'head' }, '#e8e8e8', 1.5);
      line(leftX, fB - pw, rightX, fB - pw, { type: 'sill' }, '#e8e8e8', 1.5);
    }
  }

  // ── 3. Transoms — per-bay segments, interrupted by verticals ──
  // Horizontals butt into vertical inner faces.
  for (let r = 1; r < rows; r++) {
    const transKey  = `transom-${r}`;
    const transMult = PROF_MULT[frame?.memberOverrides?.[transKey]?.profileVariantId] || 1.0;
    const topFace    = panelY[r - 1] + dloRowH[r - 1];
    const bottomFace = panelY[r];
    const center     = (topFace + bottomFace) / 2;

    for (let b = 0; b < bays; b++) {
      const leftX  = panelX[b];
      const rightX = panelX[b] + dloBayW[b];

      if (transMult > 1.2) {
        const halfGap = (bottomFace - topFace) * transMult / 2;
        doubleLine(leftX, center - halfGap, rightX, center - halfGap,
                   leftX, center + halfGap, rightX, center + halfGap,
                   { type: 'transom', row: r, bay: b }, '#c0c8d0', 1.5);
      } else {
        doubleLine(leftX, topFace,    rightX, topFace,
                   leftX, bottomFace, rightX, bottomFace,
                   { type: 'transom', row: r, bay: b }, '#c0c8d0', 1.5);
      }
    }
  }

  // ── 4. Jambs — full height, run through head/sill zones ──
  doubleLine(fL,    fT, fL,    fB,
             fL+pw, fT, fL+pw, fB,
             { type: 'jamb-left' }, '#e8e8e8', 1.5);
  doubleLine(fR-pw, fT, fR-pw, fB,
             fR,    fT, fR,    fB,
             { type: 'jamb-right' }, '#e8e8e8', 1.5);

  // ── 5. Mullions — full height, drawn last so they visually run through ──
  for (let b = 1; b < bays; b++) {
    const mulKey  = `mullion-${b}`;
    const mulMult = PROF_MULT[frame?.memberOverrides?.[mulKey]?.profileVariantId] || 1.0;
    const leftFace  = panelX[b - 1] + dloBayW[b - 1];
    const rightFace = panelX[b];
    const center    = (leftFace + rightFace) / 2;

    if (mulMult > 1.2) {
      const halfGap = (rightFace - leftFace) * mulMult / 2;
      doubleLine(center - halfGap, fT, center - halfGap, fB,
                 center + halfGap, fT, center + halfGap, fB,
                 { type: 'mullion', bay: b }, '#c0c8d0', 1.5);
    } else {
      doubleLine(leftFace,  fT, leftFace,  fB,
                 rightFace, fT, rightFace, fB,
                 { type: 'mullion', bay: b }, '#c0c8d0', 1.5);
    }

    if (needsSteel) {
      ctx.strokeStyle = 'rgba(239,68,68,0.8)';
      ctx.lineWidth   = 2 / zoom;
      ctx.beginPath(); ctx.moveTo(center, fT + 2/zoom); ctx.lineTo(center, fB - 2/zoom); ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.font = `bold ${7 / zoom}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('S', center, fT + 5/zoom);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DOOR BAY VISUALS
  for (const b of doorBays) {
    const px = panelX[b];
    const pw2 = dloBayW[b];
    const py = panelY[0];
    const ph2 = rows === 1 ? dloRowH[0] : panelY[1] - panelY[0];

    ctx.fillStyle = 'rgba(200,160,80,0.15)';
    ctx.fillRect(px, py, pw2, ph2);

    ctx.strokeStyle = 'rgba(150,100,50,0.7)';
    ctx.lineWidth   = 2 / zoom;
    ctx.setLineDash([4/zoom, 2/zoom]);
    ctx.beginPath(); ctx.moveTo(px, py + ph2); ctx.lineTo(px + pw2, py + ph2); ctx.stroke();
    ctx.setLineDash([]);

    const swingR = Math.min(pw2 * 0.6, ph2 * 0.5);
    ctx.strokeStyle = 'rgba(150,100,50,0.6)';
    ctx.lineWidth   = 1 / zoom;
    ctx.beginPath(); ctx.arc(px, py + ph2, swingR, -Math.PI / 2, 0); ctx.stroke();

    ctx.fillStyle = 'rgba(180,120,50,0.85)';
    ctx.font = `bold ${11 / zoom}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DR', px + pw2 / 2, py + ph2 / 2);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INCOMPLETE FRAME: amber dashed border
  if (isIncomplete) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth   = 2 / zoom;
    ctx.setLineDash([8/zoom, 4/zoom]);
    ctx.strokeRect(fL - 1/zoom, fT - 1/zoom, frameWidth + 2/zoom, frameHeight + 2/zoom);
    ctx.setLineDash([]);
  }
}

// ─── Dimension Strings ──────────────────────────────────────────────────────
function drawDimensions(ctx, geo, zoom) {
  const { frameLeft, frameTop, panelX, panelY, dloBayW, dloRowH,
          profileWidth, frameWidth, frameHeight, bays, rows } = getDLOGeometry(geo);

  const dimLineColor = 'rgba(100,170,200,0.5)';
  const dimTextMain  = '#7ec8e3';
  const dimTextSub   = 'rgba(100,170,200,0.55)';
  const tick = 8 / zoom;           // tick mark half-length in world units
  const lw   = 1 / zoom;           // dimension line weight

  // ── Helper: horizontal dim line with architectural ticks ──
  function dimH(x1, x2, y, label, textColor, fontSize) {
    ctx.strokeStyle = dimLineColor;
    ctx.lineWidth = lw;
    // dim line
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    // ticks (vertical, above+below the dim line)
    ctx.beginPath(); ctx.moveTo(x1, y - tick); ctx.lineTo(x1, y + tick); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y - tick); ctx.lineTo(x2, y + tick); ctx.stroke();
    // text above line
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize / zoom}px "SF Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, (x1 + x2) / 2, y - 2 / zoom);
  }

  // ── Helper: vertical dim line with ticks ──
  function dimV(x, y1, y2, label, textColor, fontSize) {
    ctx.strokeStyle = dimLineColor;
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - tick, y1); ctx.lineTo(x + tick, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - tick, y2); ctx.lineTo(x + tick, y2); ctx.stroke();
    // rotated text
    const midY = (y1 + y2) / 2;
    ctx.save();
    ctx.translate(x - 4 / zoom, midY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize / zoom}px "SF Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  // ── Overall width (above frame) ──
  const owY = frameTop - 24 / zoom;
  dimH(frameLeft, frameLeft + frameWidth, owY, fmt(frameWidth), dimTextMain, 11);

  // ── Bay widths: DLO dim per bay, just below the overall line ──
  if (bays > 1) {
    const bwY = frameTop - 10 / zoom;
    for (let b = 0; b < bays; b++) {
      dimH(panelX[b], panelX[b] + dloBayW[b], bwY, fmt(dloBayW[b]), dimTextSub, 9);
    }
  }

  // ── Overall height (right of frame) ──
  const ohX = frameLeft + frameWidth + 24 / zoom;
  dimV(ohX, frameTop, frameTop + frameHeight, fmt(frameHeight), dimTextMain, 11);

  // ── Row heights: DLO dim per row ──
  if (rows > 1) {
    const rhX = frameLeft + frameWidth + 10 / zoom;
    for (let r = 0; r < rows; r++) {
      dimV(rhX, panelY[r], panelY[r] + dloRowH[r], fmt(dloRowH[r]), dimTextSub, 9);
    }
  }
}

// ─── Labels ─────────────────────────────────────────────────────────────────
// Member text (HEAD/SILL/JAMB/etc.) removed — clutter only.
// DLO labels are now drawn inside drawGlassLayer.
// AFF callouts are rendered by drawContextLayer.
function drawLabels(ctx, geo, zoom) {
  // intentionally empty — all labeling handled by glass + context layers
}

// ─── Helper: Draw Member (Raked/Arched) ────────────────────────────────────
function drawMember(ctx, x1, y1, x2, y2, width) {
  ctx.fillStyle = '#c8c8c8';
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.abs(x2 - x1) || width;
  const h = Math.abs(y2 - y1) || width;
  ctx.fillRect(minX, minY, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.2;
  ctx.strokeRect(minX, minY, w, h);
}

// ─── Helper: Draw Vertical Mullion ──────────────────────────────────────────
function drawVerticalMullion(ctx, x, y1, y2, width) {
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(x - width / 2, y1, width, y2 - y1);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.2;
  ctx.strokeRect(x - width / 2, y1, width, y2 - y1);
}

// ─── Raked Frame (sloped head) ──────────────────────────────────────────────
function drawRakedFrame(ctx, frame, geo) {
  const { widthInches, leftHeightInches, rightHeightInches, bays, rows } = frame;
  const profileWidth = geo.profileWidth || 1.75;

  // Frame corners (origin at sill center)
  const bottomLeft = { x: -widthInches / 2, y: 0 };
  const bottomRight = { x: widthInches / 2, y: 0 };
  const topLeft = { x: -widthInches / 2, y: leftHeightInches };
  const topRight = { x: widthInches / 2, y: rightHeightInches };

  // HEAD member: diagonal polygon from topLeft to topRight
  const dx = topRight.x - topLeft.x;
  const dy = topRight.y - topLeft.y;
  const headLength = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  // Perpendicular offset for profile width
  const perpX = Math.sin(angle) * profileWidth;
  const perpY = -Math.cos(angle) * profileWidth;

  // Draw head member as filled quad
  ctx.beginPath();
  ctx.moveTo(topLeft.x, topLeft.y);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(topRight.x - perpX, topRight.y - perpY);
  ctx.lineTo(topLeft.x - perpX, topLeft.y - perpY);
  ctx.closePath();
  ctx.fillStyle = '#c8c8c8';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.2;
  ctx.stroke();

  // LEFT JAMB: vertical
  drawMember(ctx, bottomLeft.x, bottomLeft.y, bottomLeft.x + profileWidth, topLeft.y, profileWidth);

  // RIGHT JAMB: vertical (different height)
  drawMember(ctx, bottomRight.x - profileWidth, bottomRight.y, bottomRight.x, topRight.y, profileWidth);

  // SILL: horizontal
  drawMember(ctx, bottomLeft.x, 0, bottomRight.x, profileWidth, profileWidth);

  // VERTICAL MULLIONS: each varies in height linearly
  const bayWidth = widthInches / bays;
  for (let b = 1; b < bays; b++) {
    const xPos = -widthInches / 2 + (widthInches / bays) * b;
    const heightAtPos = leftHeightInches + (rightHeightInches - leftHeightInches) * (b / bays);
    const headY = heightAtPos - profileWidth;
    drawVerticalMullion(ctx, xPos, 0, headY, profileWidth);
  }

  // HORIZONTAL TRANSOMS: for each row, account for raked head
  const minFrameHeight = Math.min(leftHeightInches, rightHeightInches);
  const standardRowHeight = rows > 1 ? (minFrameHeight - profileWidth) / rows : minFrameHeight - profileWidth * 2;

  for (let r = 1; r < rows; r++) {
    const transomY = profileWidth + r * standardRowHeight;
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(-widthInches / 2 + profileWidth, transomY, widthInches - profileWidth * 2, profileWidth);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.2;
    ctx.strokeRect(-widthInches / 2 + profileWidth, transomY, widthInches - profileWidth * 2, profileWidth);
  }

  // Active frame highlight
  ctx.shadowColor = '#0ea5e9';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-widthInches / 2 - 1, -1, widthInches + 2, Math.max(leftHeightInches, rightHeightInches) + 2);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// ─── Raked Glass Layer ──────────────────────────────────────────────────────
function drawRakedGlassLayer(ctx, frame) {
  const { widthInches, leftHeightInches, rightHeightInches, bays, rows } = frame;
  const profileWidth = 1.75;

  const bayWidth = widthInches / bays;
  const minFrameHeight = Math.min(leftHeightInches, rightHeightInches);
  const standardRowHeight = rows > 1 ? (minFrameHeight - profileWidth) / rows : minFrameHeight - profileWidth * 2;

  for (let b = 0; b < bays; b++) {
    const bx = -widthInches / 2 + b * bayWidth + profileWidth / 2;
    const bWidth = bayWidth - profileWidth;
    const leftH = leftHeightInches + (rightHeightInches - leftHeightInches) * (b / bays);
    const rightH = leftHeightInches + (rightHeightInches - leftHeightInches) * ((b + 1) / bays);

    for (let r = 0; r < rows; r++) {
      if (r < rows - 1) {
        // Standard rectangular glass for non-top rows
        const glassY = profileWidth + r * standardRowHeight;
        const glassH = standardRowHeight - profileWidth;
        ctx.fillStyle = 'rgba(130,190,215,0.18)';
        ctx.fillRect(bx, glassY, bWidth, glassH);
        ctx.strokeStyle = 'rgba(100,170,200,0.35)';
        ctx.lineWidth = 0.3;
        ctx.strokeRect(bx, glassY, bWidth, glassH);
      } else {
        // Top row: trapezoidal glass (sloped)
        const bottomY = profileWidth + (rows - 1) * standardRowHeight;
        const leftTopY = leftH - profileWidth;
        const rightTopY = rightH - profileWidth;

        ctx.beginPath();
        ctx.moveTo(bx, bottomY);
        ctx.lineTo(bx + bWidth, bottomY);
        ctx.lineTo(bx + bWidth, rightTopY);
        ctx.lineTo(bx, leftTopY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(130,190,215,0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,170,200,0.35)';
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
    }
  }
}

// ─── Raked Dimensions ───────────────────────────────────────────────────────
function drawRakedDimensions(ctx, frame, zoom) {
  const { widthInches, leftHeightInches, rightHeightInches } = frame;

  const dimLineColor = '#5a8fa5';
  const dimTextColor = '#a8c4cc';

  // Overall width
  const overallWidthY = -30;
  ctx.strokeStyle = dimLineColor;
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(-widthInches / 2, overallWidthY);
  ctx.lineTo(widthInches / 2, overallWidthY);
  ctx.stroke();

  ctx.fillStyle = dimTextColor;
  ctx.font = `${12 / zoom}px "SF Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(fmt(widthInches), 0, overallWidthY - 3);

  // Left height
  const leftHeightX = -widthInches / 2 - 30;
  ctx.beginPath();
  ctx.moveTo(leftHeightX, 0);
  ctx.lineTo(leftHeightX, leftHeightInches);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(fmt(leftHeightInches), leftHeightX - 5, leftHeightInches / 2);

  // Right height
  const rightHeightX = widthInches / 2 + 30;
  ctx.strokeStyle = dimLineColor;
  ctx.beginPath();
  ctx.moveTo(rightHeightX, 0);
  ctx.lineTo(rightHeightX, rightHeightInches);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillText(fmt(rightHeightInches), rightHeightX + 5, rightHeightInches / 2);

  // Rake indication text
  ctx.fillStyle = '#fb923c';
  ctx.font = `${10 / zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const rakeDiff = Math.abs(rightHeightInches - leftHeightInches);
  ctx.fillText(`Rake: ${fmt(rakeDiff)}`, 0, leftHeightInches + 15);
}

// ─── Raked Labels ──────────────────────────────────────────────────────────
function drawRakedLabels(ctx, frame, zoom) {
  const { widthInches, leftHeightInches, rightHeightInches, mark } = frame;
  const profileWidth = 1.75;

  ctx.fillStyle = '#0ea5e9';
  ctx.font = `bold ${14 / zoom}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(mark, -widthInches / 2 + 5, 5);

  ctx.fillStyle = '#6b7280';
  ctx.font = `${9 / zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SILL', 0, profileWidth / 2);
  ctx.fillText('LEFT JAMB', -widthInches / 2 + 5, leftHeightInches / 2);
  ctx.fillText('RIGHT JAMB', widthInches / 2 - 5, rightHeightInches / 2);
}

// ─── Arched Head Frame ──────────────────────────────────────────────────────
function drawArchedFrame(ctx, frame, geo) {
  const { frameWidth, frameHeight, bays, rows, bayWidth, rowHeight, profileWidth } = geo;
  const frameLeft = -frameWidth / 2;
  const frameTop = -frameHeight / 2;
  const archHeight = frameHeight * 0.3; // Arch rises 30% of frame height
  const springLine = frameTop + frameHeight - archHeight - profileWidth;

  // Draw rectangular part (sill and jambs)
  ctx.fillStyle = '#c8c8c8';
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.2;

  // SILL
  ctx.fillRect(frameLeft, frameTop + frameHeight - profileWidth, frameWidth, profileWidth);
  ctx.strokeRect(frameLeft, frameTop + frameHeight - profileWidth, frameWidth, profileWidth);

  // LEFT JAMB
  ctx.fillRect(frameLeft, springLine, profileWidth, frameHeight - archHeight);
  ctx.strokeRect(frameLeft, springLine, profileWidth, frameHeight - archHeight);

  // RIGHT JAMB
  ctx.fillRect(frameLeft + frameWidth - profileWidth, springLine, profileWidth, frameHeight - archHeight);
  ctx.strokeRect(frameLeft + frameWidth - profileWidth, springLine, profileWidth, frameHeight - archHeight);

  // ARCH (semi-ellipse from springLine to head)
  ctx.beginPath();
  const centerX = frameLeft + frameWidth / 2;
  const centerY = springLine;
  const radiusX = frameWidth / 2;
  const radiusY = archHeight;
  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, Math.PI, 0);
  ctx.fillStyle = '#c8c8c8';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.2;
  ctx.stroke();

  // Vertical mullions (only in rectangular section)
  for (let b = 1; b < bays; b++) {
    const mullionX = frameLeft + profileWidth + b * (bayWidth + profileWidth);
    ctx.fillRect(mullionX, springLine, profileWidth, frameHeight - archHeight);
    ctx.strokeRect(mullionX, springLine, profileWidth, frameHeight - archHeight);
  }

  // Horizontal transoms
  for (let r = 1; r < rows; r++) {
    const transomY = frameTop + profileWidth + r * (rowHeight + profileWidth);
    if (transomY > springLine) break; // Stop above spring line
    ctx.fillRect(frameLeft + profileWidth, transomY, frameWidth - profileWidth * 2, profileWidth);
    ctx.strokeRect(frameLeft + profileWidth, transomY, frameWidth - profileWidth * 2, profileWidth);
  }

  // Active frame highlight
  ctx.shadowColor = '#0ea5e9';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(frameLeft - 1, frameTop - 1, frameWidth + 2, frameHeight + 2);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// ─── Arched Glass Layer ─────────────────────────────────────────────────────
function drawArchedGlassLayer(ctx, frame, geo) {
  const { frameWidth, frameHeight, bays, rows, bayWidth, rowHeight, profileWidth, DLO_w, DLO_h } = geo;
  const frameLeft = -frameWidth / 2;
  const frameTop = -frameHeight / 2;
  const archHeight = frameHeight * 0.3;
  const springLine = frameTop + frameHeight - archHeight - profileWidth;

  // Rectangular glass (below spring line)
  for (let b = 0; b < bays; b++) {
    for (let r = 0; r < rows; r++) {
      const x = frameLeft + profileWidth + b * (bayWidth + profileWidth);
      const y = frameTop + profileWidth + r * (rowHeight + profileWidth);

      if (y + DLO_h < springLine) {
        ctx.fillStyle = 'rgba(130,190,215,0.18)';
        ctx.fillRect(x, y, DLO_w, DLO_h);
        ctx.strokeStyle = 'rgba(100,170,200,0.35)';
        ctx.lineWidth = 0.3;
        ctx.strokeRect(x, y, DLO_w, DLO_h);
      }
    }
  }

  // Arch glass (simplified: fill arched region)
  ctx.fillStyle = 'rgba(130,190,215,0.18)';
  const centerX = frameLeft + frameWidth / 2;
  ctx.beginPath();
  ctx.ellipse(centerX, springLine, frameWidth / 2 - profileWidth, archHeight - profileWidth, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,170,200,0.35)';
  ctx.lineWidth = 0.3;
  ctx.stroke();
}

// ─── Arched Labels ─────────────────────────────────────────────────────────
function drawArchedLabels(ctx, frame, geo, zoom) {
  const { frameWidth, frameHeight, mark } = geo;
  const frameLeft = -frameWidth / 2;
  const frameTop = -frameHeight / 2;

  ctx.fillStyle = '#0ea5e9';
  ctx.font = `bold ${14 / zoom}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(mark, frameLeft + 5, frameTop + 5);

  ctx.fillStyle = '#6b7280';
  ctx.font = `${9 / zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ARCH', frameLeft + frameWidth / 2, frameTop + frameHeight * 0.15);
}

// ─── Circle Frame ──────────────────────────────────────────────────────────
function drawCircleFrame(ctx, frame) {
  const diameter = frame.widthInches || 48;
  const radius = diameter / 2;
  const profileWidth = 1.75;

  // Outer circle frame
  ctx.fillStyle = '#c8c8c8';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // Inner glass circle
  ctx.fillStyle = 'rgba(130,190,215,0.18)';
  ctx.beginPath();
  ctx.arc(0, 0, radius - profileWidth, 0, Math.PI * 2);
  ctx.fill();

  // Stroke outline
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, radius - profileWidth, 0, Math.PI * 2);
  ctx.stroke();

  // Active frame highlight
  ctx.shadowColor = '#0ea5e9';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// ─── Circle Glass Layer ───────────────────────────────────────────────────
function drawCircleGlassLayer(ctx, frame) {
  const diameter = frame.widthInches || 48;
  const radius = diameter / 2;
  const profileWidth = 1.75;

  ctx.fillStyle = 'rgba(130,190,215,0.18)';
  ctx.beginPath();
  ctx.arc(0, 0, radius - profileWidth, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(100,170,200,0.35)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.arc(0, 0, radius - profileWidth, 0, Math.PI * 2);
  ctx.stroke();
}

// ─── Circle Dimensions ─────────────────────────────────────────────────────
function drawCircleDimensions(ctx, frame, zoom) {
  const diameter = frame.widthInches || 48;
  const radius = diameter / 2;

  const dimLineColor = '#5a8fa5';
  const dimTextColor = '#a8c4cc';

  // Diameter line (horizontal)
  ctx.strokeStyle = dimLineColor;
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(-radius, -radius - 20);
  ctx.lineTo(radius, -radius - 20);
  ctx.stroke();

  ctx.fillStyle = dimTextColor;
  ctx.font = `${12 / zoom}px "SF Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`Dia: ${fmt(diameter)}`, 0, -radius - 25);
}

// ─── Circle Labels ────────────────────────────────────────────────────────
function drawCircleLabels(ctx, frame, zoom) {
  const { mark } = frame;

  ctx.fillStyle = '#0ea5e9';
  ctx.font = `bold ${14 / zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 0, 0);
}

// ─── Custom Geometry Placeholder ────────────────────────────────────────────
function drawCustomGeometryPlaceholder(ctx, frame, zoom) {
  const frameWidth = frame.widthInches || 48;
  const frameHeight = frame.heightInches || 48;

  ctx.fillStyle = '#1a1f27';
  ctx.fillRect(-frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight);

  ctx.strokeStyle = '#fb923c';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(-frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight);
  ctx.setLineDash([]);

  ctx.fillStyle = '#fb923c';
  ctx.font = `${10 / zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Custom Geometry', 0, -10);
  ctx.fillText('See shop drawings', 0, 10);
}

// ─── Section View Drawing ────────────────────────────────────────────────────
function drawSectionView(ctx, frame, group, canvasSize) {
  const { w, h } = canvasSize;
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, w, h);

  if (!frame && !group) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No frame selected', w / 2, h / 2);
    return;
  }

  // Profile dimensions (from group archetype fields, fallback to defaults)
  const profileWidth = group?.profileWidth || 1.75;   // face width  (in)
  const profileDepth = group?.profileDepth || 4.5;    // system depth (in)
  const glassBite    = group?.glassBite    || 0.625;  // bite into profile (in)

  // Glass thickness from frame's last BOM or guess
  const glassThk = frame?.lastBOM?.glassSchedule?.[0]?.thickness || 1.0;

  const isThermal = (group?.archetypeId || '').includes('thermal');

  // Finish color
  const finishType = frame?.finishType || group?.finishType || 'dark-bronze';
  const FINISH = {
    'dark-bronze':    '#5a3e28',
    'clear-anodized': '#c0c0c0',
    'black':          '#1c1c1c',
    'white':          '#e8e8e8',
    'custom-color':   '#4a6fa5',
  };
  const alumColor  = FINISH[finishType] || FINISH['dark-bronze'];
  const alumFaceColor = '#b0986e';

  // Scale: fit system depth across ~50% of canvas width, at least 6px/in
  const scale = Math.min((w * 0.45) / profileDepth, (h * 0.55) / (profileWidth + glassThk + profileWidth), 28);

  const cx = w / 2;
  const cy = h / 2;

  // Derived pixel sizes
  const depthPx   = profileDepth * scale;
  const facePx    = profileWidth  * scale;
  const bitePx    = glassBite    * scale;
  const glThkPx   = glassThk    * scale;

  // Draw one horizontal profile member (head or sill cross-section)
  // Member runs horizontally; we look at it from the side.
  // Left aluminum body: full depth × face height
  const leftAlumX = cx - depthPx / 2;
  const profileTopY = cy - facePx / 2;

  // ── Left profile body ──
  ctx.fillStyle = alumColor;
  ctx.fillRect(leftAlumX, profileTopY, depthPx, facePx);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(leftAlumX, profileTopY, depthPx, facePx);

  // ── Glass pocket (notch at glass-bite depth from inner face) ──
  const pocketDepthPx = bitePx;
  const pocketY = profileTopY + facePx;
  const glassW  = glThkPx;
  const glassX  = cx - glassW / 2;

  // Glass unit
  ctx.fillStyle = 'rgba(185,220,235,0.72)';
  ctx.fillRect(glassX, pocketY, glassW, 40 * scale / 6);

  // Gasket lines at glass bite
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(cx - glassW / 2 - pocketDepthPx, pocketY);
  ctx.lineTo(cx - glassW / 2 - pocketDepthPx, pocketY + 30 * scale / 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + glassW / 2 + pocketDepthPx, pocketY);
  ctx.lineTo(cx + glassW / 2 + pocketDepthPx, pocketY + 30 * scale / 6);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Thermal break strip ──
  if (isThermal) {
    const stripW = Math.max(4, scale * 0.3);
    ctx.fillStyle = 'rgba(251,191,36,0.55)';
    ctx.fillRect(cx - stripW / 2, profileTopY, stripW, facePx);
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(cx - stripW / 2, profileTopY, stripW, facePx);
  }

  // ── Face highlight ──
  ctx.fillStyle = alumFaceColor;
  ctx.fillRect(leftAlumX, profileTopY, 3, facePx);

  // ─── Dimension annotations ─────────────────────────────────────────────────
  const annColor = '#94a3b8';
  ctx.fillStyle = annColor;
  ctx.strokeStyle = annColor;
  ctx.lineWidth = 0.7;
  ctx.font = `bold ${Math.max(9, scale * 0.7)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.setLineDash([]);

  function dimLine(x1, y1, x2, y2, labelText, side = 'right') {
    // Leader lines
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const offX = side === 'right' ? 22 : -22;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + offX, my); ctx.stroke();
    ctx.textAlign = side === 'right' ? 'left' : 'right';
    ctx.fillStyle = annColor;
    ctx.fillText(labelText, mx + offX + (side === 'right' ? 2 : -2), my);
  }

  const annX = leftAlumX + depthPx + 6;
  // Face width dim
  dimLine(annX, profileTopY, annX, profileTopY + facePx, `${profileWidth}"`, 'right');
  // System depth dim (top)
  const depthAnnY = profileTopY - 16;
  ctx.beginPath(); ctx.moveTo(leftAlumX, depthAnnY); ctx.lineTo(leftAlumX + depthPx, depthAnnY); ctx.stroke();
  // tick marks
  ctx.beginPath(); ctx.moveTo(leftAlumX, depthAnnY - 4); ctx.lineTo(leftAlumX, depthAnnY + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(leftAlumX + depthPx, depthAnnY - 4); ctx.lineTo(leftAlumX + depthPx, depthAnnY + 4); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = annColor;
  ctx.fillText(`${profileDepth}" depth`, leftAlumX + depthPx / 2, depthAnnY - 7);

  // Glass bite dim
  const biteAnnX = glassX - 6;
  dimLine(biteAnnX, pocketY, biteAnnX, pocketY + bitePx * 2, `${glassBite}" bite`, 'left');

  // ─── Info bar ──────────────────────────────────────────────────────────────
  ctx.font = '10px system-ui';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9ca3af';
  const systemLabel = group?.name || 'No system selected';
  const thermalLabel = isThermal ? '  ·  Thermal Break' : '';
  ctx.fillText(`SECTION VIEW  ·  ${systemLabel}${thermalLabel}`, 12, h - 10);

  ctx.textAlign = 'right';
  ctx.fillText('Click canvas members in elevation view to inspect', w - 12, h - 10);
}

// ─── FrameBuilderCanvas Component ───────────────────────────────────────────
export default function FrameBuilderCanvas({ onElementSelect }) {
  const canvasRef   = useRef(null);
  const containerRef= useRef(null);
  const hitRegionsRef = useRef([]);

  const [camera,   setCamera  ] = useState({ x: 0, y: 0, zoom: 1 });
  const [layers,   setLayers  ] = useState({ grid: true, dimensions: true, glass: true, labels: true, context: true, section: false });
  const [canvasSize,setCanvasSize]=useState({ w: 800, h: 600 });
  const [isPanning, setIsPanning]=useState(false);
  const [panStart,  setPanStart ]=useState({ x: 0, y: 0 });
  const [selectedEl,setSelectedEl]=useState(null);
  const [hoveredEl, setHoveredEl ]=useState(null);
  const isSpaceDown = useRef(false);

  // CAD drag state (mullion/transom repositioning)
  const dragRef = useRef(null); // { type:'mullion'|'transom', index:n, startWorldX, startWorldY, origWidths[], origHeights[] }
  const [isDragging, setIsDragging] = useState(false);

  const { frames, groups, activeFrameId, glassSpecs, updateFrame } = useFrameBuilderStore();
  const frame = frames.find((f) => f.frameId === activeFrameId) || null;
  const group = frame ? groups.find((g) => g.groupId === frame.groupId) : null;
  const finishType = frame?.finishType || group?.finishType || 'dark-bronze';

  // Setup ResizeObserver for responsive canvas sizing
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const newW = rect.width;
      const newH = rect.height;

      if (canvasRef.current) {
        canvasRef.current.width = newW * dpr;
        canvasRef.current.height = newH * dpr;

        const ctx = canvasRef.current.getContext('2d');
        ctx.scale(dpr, dpr);
      }

      setCanvasSize({ w: newW, h: newH });
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Main render loop: re-draw whenever frame, camera, selection, or hover changes
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const geo = getFrameGeometry(frame);
    hitRegionsRef.current = computeHitRegions(geo);
    if (layers.section) {
      drawSectionView(ctx, frame, group, canvasSize);
    } else {
      drawFrame(ctx, frame, camera, layers, canvasSize, selectedEl, hoveredEl, finishType);
    }
  }, [frame, group, camera, layers, canvasSize, selectedEl, hoveredEl, finishType, glassSpecs, isDragging]);

  // Keyboard: space down/up for pan mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        isSpaceDown.current = true;
        e.preventDefault();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        isSpaceDown.current = false;
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mouse wheel: zoom toward cursor — registered as native listener (passive:false) so preventDefault works
  const handleWheel = useCallback((e) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(20, camera.zoom * zoomFactor));

    // Zoom toward cursor (CAD-style)
    const cursorWorldX = (cursorX - rect.width / 2 - camera.x) / camera.zoom;
    const cursorWorldY = (cursorY - rect.height / 2 - camera.y) / camera.zoom;

    const newPanX = cursorX - rect.width / 2 - cursorWorldX * newZoom;
    const newPanY = cursorY - rect.height / 2 - cursorWorldY * newZoom;

    setCamera({
      x: newPanX,
      y: newPanY,
      zoom: newZoom,
    });
  }, [camera]);

  // Attach wheel listener as non-passive so preventDefault() works
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Mouse helpers ─────────────────────────────────────────────────────────
  const clientToWorld = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { wx: 0, wy: 0 };
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return {
      wx: (px - canvasSize.w / 2 - camera.x) / camera.zoom,
      wy: (py - canvasSize.h / 2 - camera.y) / camera.zoom,
    };
  };

  const hitAtClient = (clientX, clientY) => {
    const { wx, wy } = clientToWorld(clientX, clientY);
    return hitRegionsRef.current.find(
      (r) => wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h
    ) || null;
  };

  // Mouse down: start pan OR start CAD drag for mullion/transom
  const handleMouseDown = (e) => {
    const isMiddleButton = e.button === 1;
    const isSpaceClick = isSpaceDown.current && e.button === 0;

    if (isMiddleButton || isSpaceClick) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
      return;
    }

    // Left click — check if we're starting a mullion/transom drag
    if (e.button === 0) {
      const hit = hitAtClient(e.clientX, e.clientY);
      if (hit && (hit.type === 'mullion' || hit.type === 'transom')) {
        const geo = getFrameGeometry(frame);
        if (!geo) return;
        const { wx, wy } = clientToWorld(e.clientX, e.clientY);
        dragRef.current = {
          type: hit.type,
          index: hit.type === 'mullion' ? hit.bay : hit.row,
          startWX: wx,
          startWY: wy,
          origBayWidths: [...geo.bayWidths],
          origRowHeights: [...geo.rowHeights],
        };
        setIsDragging(true);
        e.preventDefault();
      }
    }
  };

  // Mouse move: pan + drag + hover
  const handleMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setCamera((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // ── CAD drag: reposition mullion/transom live ────────────────────────────
    if (isDragging && dragRef.current && frame) {
      const { type, index, startWX, startWY, origBayWidths, origRowHeights } = dragRef.current;
      const { wx, wy } = clientToWorld(e.clientX, e.clientY);

      if (type === 'mullion') {
        // Δx in world-inches, snapped to 1"
        const rawDelta = wx - startWX;
        const delta = Math.round(rawDelta);
        const leftBay  = index - 1;   // bay to the left of this mullion
        const rightBay = index;        // bay to the right (index === bay number)
        if (leftBay >= 0 && rightBay < origBayWidths.length) {
          const MIN_BAY = 6;
          const total = origBayWidths[leftBay] + origBayWidths[rightBay];
          // Clamp delta so neither side goes below min
          const clampedDelta = Math.min(
            Math.max(delta, MIN_BAY - origBayWidths[leftBay]),   // left can't go below min
            origBayWidths[rightBay] - MIN_BAY                    // right can't go below min
          );
          const newBayWidths = [...origBayWidths];
          newBayWidths[leftBay]  = origBayWidths[leftBay]  + clampedDelta;
          newBayWidths[rightBay] = origBayWidths[rightBay] - clampedDelta;
          const bayConfigs = newBayWidths.map((w, i) => ({
            ...(frame.bayConfigs?.[i] || {}),
            widthOverride: Math.round(w),
          }));
          updateFrame(frame.frameId, { bayConfigs });
        }
      } else if (type === 'transom') {
        // Δy in world-inches (canvas Y positive downward)
        const rawDelta = wy - startWY;
        const delta = Math.round(rawDelta);
        const topRow    = index - 1;
        const bottomRow = index;
        if (topRow >= 0 && bottomRow < origRowHeights.length) {
          const MIN_ROW = 6;
          const clampedDelta = Math.min(
            Math.max(delta, MIN_ROW - origRowHeights[topRow]),
            origRowHeights[bottomRow] - MIN_ROW
          );
          const newRowHeights = [...origRowHeights];
          newRowHeights[topRow]    = origRowHeights[topRow]    + clampedDelta;
          newRowHeights[bottomRow] = origRowHeights[bottomRow] - clampedDelta;
          const rowConfigs = newRowHeights.map((h, i) => ({
            ...(frame.rowConfigs?.[i] || {}),
            heightOverride: Math.round(newRowHeights[i]),
          }));
          updateFrame(frame.frameId, { rowConfigs });
        }
      }
      return;
    }

    // Hover hit detection (always when not dragging/panning)
    const hit = hitAtClient(e.clientX, e.clientY);
    setHoveredEl(hit);
  };

  // Mouse up: stop pan or commit drag
  const handleMouseUp = (e) => {
    if (isDragging) {
      dragRef.current = null;
      setIsDragging(false);
      return;
    }
    setIsPanning(false);
  };

  // Canvas click: suppress after drag, otherwise hit-test and select
  const handleCanvasClick = (e) => {
    if (isDragging) return; // just finished a drag — don't select
    const hit = hitAtClient(e.clientX, e.clientY);
    setSelectedEl(hit);
    if (hit && onElementSelect) onElementSelect(hit);
  };

  // Fit to view: padded fit so wall surround / INTERIOR label are always visible
  const handleFitToView = useCallback(() => {
    const geo = getFrameGeometry(frame);
    if (!geo || !canvasSize.w || !canvasSize.h) return;
    const { frameWidth, frameHeight } = geo;

    // Fixed pixel padding — extra bottom room for floor bar + INTERIOR label
    const padT = 60, padB = 80, padL = 60, padR = 60;
    const availW = canvasSize.w - padL - padR;
    const availH = canvasSize.h - padT - padB;

    const scaleX = availW / frameWidth;
    const scaleY = availH / frameHeight;
    const zoom   = Math.min(scaleX, scaleY, 6.0);

    // Shift camera so frame is centered inside the padded area
    const camX = (padL - padR) / 2;       // 0 for symmetric L/R
    const camY = (padT - padB) / 2;       // -10: nudge frame up into extra bottom space

    setCamera({ x: camX, y: camY, zoom });
  }, [frame, canvasSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fit on initial mount
  useEffect(() => {
    const t = setTimeout(() => handleFitToView(), 200);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fit whenever the active frame changes
  useEffect(() => {
    if (!activeFrameId || !frame) return;
    const t = setTimeout(() => handleFitToView(), 150);
    return () => clearTimeout(t);
  }, [activeFrameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle layer visibility
  const toggleLayer = (layerName) => {
    setLayers((prev) => ({
      ...prev,
      [layerName]: !prev[layerName],
    }));
  };

  const scaleStr = `1:${Math.round((1 / camera.zoom) * 12)}`;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#0d1117',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: isSpaceDown.current ? 'grab'
            : isPanning      ? 'grabbing'
            : isDragging && dragRef.current?.type === 'mullion'  ? 'col-resize'
            : isDragging && dragRef.current?.type === 'transom'  ? 'row-resize'
            : hoveredEl?.type === 'mullion'  ? 'col-resize'
            : hoveredEl?.type === 'transom'  ? 'row-resize'
            : hoveredEl ? 'pointer' : 'default',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
      />

      {/* Toolbar overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'rgba(15,20,30,0.88)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '6px',
          padding: '6px 10px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          fontSize: '12px',
          color: '#94a3b8',
          fontFamily: 'SF Mono, monospace',
        }}
      >
        {/* Scale display */}
        <span style={{ minWidth: '50px' }}>{scaleStr}</span>

        {/* Separator */}
        <div style={{ width: '1px', height: '16px', background: '#27272a' }} />

        {/* Fit to view button */}
        <button
          onClick={handleFitToView}
          title="Fit to view"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#a1a1a1',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '12px',
          }}
          onMouseEnter={(e) => (e.target.style.color = '#0ea5e9')}
          onMouseLeave={(e) => (e.target.style.color = '#a1a1a1')}
        >
          ⊡
        </button>

        {/* Grid toggle */}
        <button
          onClick={() => toggleLayer('grid')}
          title="Toggle grid"
          style={{
            background: layers.grid ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
            border: '1px solid ' + (layers.grid ? '#0ea5e9' : '#27272a'),
            color: layers.grid ? '#0ea5e9' : '#a1a1a1',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: '10px',
            borderRadius: '3px',
          }}
        >
          Grid
        </button>

        {/* Layer toggles */}
        {['dimensions', 'glass', 'labels', 'context'].map((layer) => (
          <button
            key={layer}
            onClick={() => toggleLayer(layer)}
            title={`Toggle ${layer}`}
            style={{
              background: layers[layer] ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
              border: '1px solid ' + (layers[layer] ? '#0ea5e9' : 'rgba(255,255,255,0.15)'),
              color: layers[layer] ? '#0ea5e9' : '#94a3b8',
              cursor: 'pointer',
              padding: '2px 6px',
              fontSize: '10px',
              borderRadius: '3px',
              textTransform: 'capitalize',
            }}
          >
            {layer.substring(0, 3)}
          </button>
        ))}

        {/* Separator + Section view toggle */}
        <div style={{ width: '1px', height: '16px', background: '#27272a' }} />
        <button
          onClick={() => toggleLayer('section')}
          title="Section view — cross-section through system depth"
          style={{
            background: layers.section ? 'rgba(245,158,11,0.2)' : 'transparent',
            border: '1px solid ' + (layers.section ? '#f59e0b' : 'rgba(255,255,255,0.15)'),
            color: layers.section ? '#f59e0b' : '#94a3b8',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: '10px',
            borderRadius: '3px',
            fontWeight: layers.section ? 700 : 400,
          }}
        >
          Sec
        </button>
      </div>

      {/* Empty state overlay */}
      {!frame && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'rgba(13,17,23,0.85)',
            color: 'rgba(255,255,255,0.45)',
            fontSize: '14px',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ marginBottom: '8px' }}>Select or create a frame to preview</div>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>
            ← Use the input panel to define your frame
          </div>
        </div>
      )}
    </div>
  );
}
