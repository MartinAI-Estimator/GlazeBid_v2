import React, { useState, useMemo, useEffect, useRef } from 'react';
import useBidStore from '../../store/useBidStore';
import { SYSTEM_PACKAGES, DEFAULT_SYSTEM_ID, SYSTEM_GEOMETRY_CATALOG } from '../../data/systemPackages';
import { parseArchitecturalString, formatArchitecturalInches } from '../../utils/parseArchitecturalDim';

// ─── Constants (non-system-specific) ──────────────────────────────────────────────────
const DOOR_HEIGHT       = 84;      // inches — standard door leaf height (Single & Pair)
const DOOR_HEADER_SL    = 2;       // inches — door header sightline (standard 2")

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = {
  // Root container — fills whatever parent gives it
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,          // grows to fill flex parent (drawer body) — keeps sidebarScroll bounded
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: 'var(--bg-deep, #0b0e11)',
    color: 'var(--text-primary, #e6edf3)',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },

  // Top title bar
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 20px 12px',
    borderBottom: '1px solid var(--border-subtle, #2d333b)',
    flexShrink: 0,
  },
  titleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleText: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text-primary, #e6edf3)',
    margin: 0,
  },
  titleSub: {
    fontSize: '0.72rem',
    color: 'var(--text-secondary, #9ea7b3)',
    margin: 0,
    marginTop: 1,
  },

  // Three-panel wrapper
  panels: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    gap: 0,
    overflow: 'hidden',
  },

  // ── Left panel (inputs) ──────────────────────────────────────────────────
  leftPanel: {
    width: 220,
    flexShrink: 0,
    padding: '18px 16px',
    borderRight: '1px solid var(--border-subtle, #2d333b)',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    backgroundColor: 'var(--bg-panel, #0d1117)',
  },

  sectionLabel: {
    fontSize: '0.62rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--text-secondary, #9ea7b3)',
    marginBottom: 10,
    borderBottom: '1px solid var(--border-subtle, #2d333b)',
    paddingBottom: 5,
  },

  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  fieldLabel: {
    fontSize: '0.73rem',
    fontWeight: 600,
    color: 'var(--text-secondary, #9ea7b3)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldValue: {
    fontSize: '0.73rem',
    fontWeight: 700,
    color: '#60a5fa',
  },
  rangeInput: {
    width: '100%',
    accentColor: '#2563eb',
    cursor: 'pointer',
  },
  numberInput: {
    width: '100%',
    padding: '7px 10px',
    backgroundColor: 'var(--bg-card, #1c2128)',
    border: '1px solid var(--border-subtle, #2d333b)',
    borderRadius: 6,
    color: 'var(--text-primary, #e6edf3)',
    fontSize: '0.85rem',
    fontWeight: 600,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },

  // Constant flags
  constRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    background: 'rgba(37,99,235,0.07)',
    border: '1px solid rgba(37,99,235,0.18)',
    borderRadius: 6,
    fontSize: '0.72rem',
  },
  constKey: {
    color: 'var(--text-secondary, #9ea7b3)',
    fontWeight: 500,
  },
  constVal: {
    color: '#60a5fa',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },

  // ── Center panel (visualizer) ────────────────────────────────────────────
  centerPanel: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    overflowY: 'auto',
    backgroundColor: 'var(--bg-deep, #0b0e11)',
    position: 'relative',
  },
  vizLabel: {
    fontSize: '0.62rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--text-secondary, #9ea7b3)',
    marginBottom: 14,
  },
  svgWrapper: {
    background: '#0d1117',
    borderRadius: 10,
    border: '1px solid #2d333b',
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  },
  dimBadge: {
    marginTop: 12,
    fontSize: '0.7rem',
    color: 'var(--text-secondary, #9ea7b3)',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 500,
  },

  // ── Right panel (BOM) ────────────────────────────────────────────────────
  rightPanel: {
    width: 280,
    flexShrink: 0,
    borderLeft: '1px solid var(--border-subtle, #2d333b)',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-panel, #0d1117)',
    overflow: 'hidden',
  },
  rightScrollBody: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '18px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  bomCard: {
    background: 'var(--bg-card, #1c2128)',
    border: '1px solid var(--border-subtle, #2d333b)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  bomCardHeader: {
    padding: '8px 12px',
    background: 'rgba(37,99,235,0.1)',
    borderBottom: '1px solid var(--border-subtle, #2d333b)',
    fontSize: '0.65rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#60a5fa',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  bomRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '9px 12px',
    borderBottom: '1px solid rgba(45,51,59,0.5)',
    fontSize: '0.78rem',
    gap: 8,
  },
  bomKey: {
    color: 'var(--text-secondary, #9ea7b3)',
    fontWeight: 500,
    lineHeight: 1.3,
  },
  bomVal: {
    color: 'var(--text-primary, #e6edf3)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  bomValAccent: {
    color: '#34d399',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  // Highlight rows for primary outputs
  bomRowHighlight: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid rgba(45,51,59,0.5)',
    fontSize: '0.8rem',
    gap: 8,
    background: 'rgba(52,211,153,0.05)',
  },

  // Save button
  saveFooter: {
    padding: '14px 16px',
    borderTop: '1px solid var(--border-subtle, #2d333b)',
    flexShrink: 0,
  },
  saveBtn: {
    width: '100%',
    padding: '11px 0',
    borderRadius: 8,
    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.85rem',
    cursor: 'pointer',
    letterSpacing: '0.03em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'filter 0.15s, transform 0.1s',
  },
  savedFlash: {
    width: '100%',
    padding: '11px 0',
    borderRadius: 8,
    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  // ── Unified tabbed sidebar ────────────────────────────────────────────────
  sidebar: {
    width: 320,
    flexShrink: 0,
    borderLeft: '1px solid var(--border-subtle, #2d333b)',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-panel, #0d1117)',
    overflow: 'hidden',
  },
  tabBar: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-subtle, #2d333b)',
    backgroundColor: 'var(--bg-panel, #0d1117)',
  },
  tabBtn: {
    flex: 1,
    padding: '10px 0',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    color: 'var(--text-secondary, #9ea7b3)',
    fontSize: '0.76rem',
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'color 0.15s',
  },
  tabBtnActive: {
    flex: 1,
    padding: '10px 0',
    border: 'none',
    borderBottom: '2px solid #2563eb',
    background: 'transparent',
    color: '#60a5fa',
    fontSize: '0.76rem',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'color 0.15s',
  },
  sidebarScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  accordionWrap: {
    border: '1px solid var(--border-subtle, #2d333b)',
    borderRadius: 7,
    overflow: 'hidden',
  },
  accordionHeader: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-secondary, #9ea7b3)',
    fontSize: '0.66rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    textAlign: 'left',
    transition: 'background 0.15s',
  },
  accordionBody: {
    padding: '12px 12px 14px',
    background: 'var(--bg-deep, #0b0e11)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
};

// ─── Per-bay horizontal mullion helpers ─────────────────────────────────────
/**
 * Returns an array of mullion bottom-edge positions (inches from interior sill)
 * evenly distributed for `rows` rows.  Empty when rows ≤ 1.
 */
function computeDefaultHorizontals(rows, height, headSL, sillSL, mullSL) {
  if (rows <= 1) return [];
  const interiorH = height - headSL - sillSL;
  const paneH     = (interiorH - (rows - 1) * mullSL) / rows;
  const edges     = [];
  for (let i = 1; i < rows; i++) {
    edges.push(i * (paneH + mullSL) - mullSL);
  }
  return edges;
}

// ─── SVG Wireframe Visualizer ─────────────────────────────────────────────────
function FrameVisualizer({
  width, height, bays,
  doorType = 'none', doorBay = 1,
  headSightline = 2, sillSightline = 2,
  externalBayWidths = [],
  mullionSightline = 2,
  bayHorizontals = {},   // sparse {bayIdx: [bottomEdge_in_inches_from_interior_sill, ...]}
  defaultRows    = 1,    // used to generate defaults for bays not in bayHorizontals
  shapeMode      = 'rectangular',  // 'rectangular' | 'raked_head'
  leftLegHeight  = null,           // raked: height at left edge (inches); null = use `height`
  rightLegHeight = null,           // raked: height at right edge (inches); null = use `height`
  sillStepUps    = {},             // { [bayIdx]: offsetInches } — raises that bay's glass floor
}) {
  const SVG_W = 440;
  const SVG_H = 300;
  const PAD   = 28;

  const scale  = Math.min((SVG_W - PAD * 2) / width, (SVG_H - PAD * 2) / height) * 0.88;
  const frameW = width  * scale;
  const frameH = height * scale;
  const ox = (SVG_W - frameW) / 2;
  const oy = (SVG_H - frameH) / 2;

  const mulW  = mullionSightline * scale;
  const headH = headSightline * scale;
  const sillH = sillSightline * scale;

  // ── Raked-head helpers ────────────────────────────────────────────────────
  const isRaked = shapeMode === 'raked_head';
  const leftH   = (isRaked && leftLegHeight  != null) ? leftLegHeight  : height;
  const rightH  = (isRaked && rightLegHeight != null) ? rightLegHeight : height;
  // SVG y of the outer frame top-left / top-right
  const frameTopLeftY  = oy + frameH - leftH  * scale;
  const frameTopRightY = oy + frameH - rightH * scale;
  // Interpolated outer-frame height (inches) at a given SVG x pixel
  const headerHeightAtPx = (xPx) => {
    const f = frameW > 0 ? Math.min(1, Math.max(0, (xPx - ox) / frameW)) : 0;
    return leftH + (rightH - leftH) * f;
  };
  // SVG y for the outer frame top at an x pixel
  const frameOuterTopAtPx = (xPx) => oy + frameH - headerHeightAtPx(xPx) * scale;
  // SVG y for the interior glass-zone top (head sightline subtracted) at an x pixel
  const interiorTopAtPx = (xPx) =>
    oy + frameH - (headerHeightAtPx(xPx) - headSightline) * scale;
  // toSvgY variant that incorporates a per-bay sill step-up
  const toSvgYForBay = (bayIdx, interiorIn) => {
    const stepUp = sillStepUps[bayIdx] ?? 0;
    return oy + frameH - (sillSightline + stepUp + interiorIn) * scale;
  };
  // Trapezoidal clip-path points string
  const clipPoints = `${ox},${frameTopLeftY} ${ox+frameW},${frameTopRightY} ${ox+frameW},${oy+frameH} ${ox},${oy+frameH}`;

  // Bay pixel positions — supports unequal bays from externalBayWidths
  const totalDLO_viz = width - (bays + 1) * mullionSightline;
  const hasBayW_viz  = externalBayWidths && externalBayWidths.length === bays;
  const dloWidths_viz = hasBayW_viz
    ? externalBayWidths.map(bw => (bw / width) * totalDLO_viz)
    : Array(bays).fill(totalDLO_viz / bays);

  let cumX_viz = ox + mullionSightline * scale;
  const baysData = dloWidths_viz.map(dloW => {
    const xStart = cumX_viz;
    const ww     = dloW * scale;
    cumX_viz += ww + mullionSightline * scale;
    return { xStart, ww };
  });

  // ── Per-bay horizontal mullion system ────────────────────────────────────
  // Interior coordinate: 0 = just above sill sightline, interiorH_in = just below head sightline
  const interiorH_in     = height - headSightline - sillSightline;
  // SVG y helpers — interior sill maps to the bottom of the glass zone
  const svgInteriorBottom = oy + frameH - sillH;
  const svgInteriorTop    = oy + headH;
  // Convert interior-inches (from sill, going up) → SVG y (top-left origin, going down)
  const toSvgY = (interiorIn) => svgInteriorBottom - interiorIn * scale;

  const defaultEdges = computeDefaultHorizontals(
    defaultRows, height, headSightline, sillSightline, mullionSightline
  );
  // Resolve each bay's edge list (custom override or default)
  const allBayEdges = Array.from({ length: bays }, (_, i) =>
    bayHorizontals[i] !== undefined ? [...bayHorizontals[i]].sort((a, b) => a - b) : defaultEdges
  );

  /**
   * Compute non-door glass pane segments for a bay.
   * Returns [{y0, paneH}] in interior-space inches.
   */
  const getPaneSegs = (edges) => {
    if (!edges || edges.length === 0) return [{ y0: 0, paneH: interiorH_in }];
    const segs = [];
    let cursor = 0;
    for (const edge of edges) {
      if (edge > cursor + 0.001) segs.push({ y0: cursor, paneH: edge - cursor });
      cursor = edge + mullionSightline;
    }
    if (cursor < interiorH_in - 0.001) segs.push({ y0: cursor, paneH: interiorH_in - cursor });
    return segs;
  };

  // Door geometry — uses absolute pixel positions, not row fractions
  const isDoorFrame   = doorType !== 'none';
  const doorBayIdx    = Math.max(0, Math.min(doorBay - 1, bays - 1));
  const doorColData   = isDoorFrame ? baysData[doorBayIdx] : null;
  const doorFloorY    = oy + frameH - sillH;              // sill top = door bottom
  const doorTopY      = doorFloorY - DOOR_HEIGHT * scale; // top of 84" door leaf
  const headerTopY    = doorTopY   - DOOR_HEADER_SL * scale; // top of door header sightline
  const transomDLOH_v = isDoorFrame
    ? height - DOOR_HEIGHT - DOOR_HEADER_SL - headSightline
    : 0;
  const hasTransom_v  = isDoorFrame && transomDLOH_v > 0;
  const transomPxH    = hasTransom_v ? transomDLOH_v * scale : 0;
  const transomTopY   = oy + headH;                       // transom sits just below head

  const arrowSize = 5;

  return (
    <svg
      width={SVG_W}
      height={SVG_H}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ display: 'block' }}
      aria-label="Frame wireframe elevation"
    >
      <defs>
        <linearGradient id="glassFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#bfdbfe" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.35" />
        </linearGradient>
        <pattern id="slashPattern" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#374151" strokeWidth="2" />
        </pattern>
        <marker id="arrowEnd" markerWidth={arrowSize} markerHeight={arrowSize} refX={arrowSize - 1} refY={arrowSize / 2} orient="auto">
          <path d={`M0,0 L0,${arrowSize} L${arrowSize},${arrowSize / 2} Z`} fill="#4b5563" />
        </marker>
        <marker id="arrowStart" markerWidth={arrowSize} markerHeight={arrowSize} refX="1" refY={arrowSize / 2} orient="auto">
          <path d={`M${arrowSize},0 L${arrowSize},${arrowSize} L0,${arrowSize / 2} Z`} fill="#4b5563" />
        </marker>
        {/* Trapezoidal clip region — used for raked frames */}
        <clipPath id="frameClip">
          {isRaked
            ? <polygon points={clipPoints} />
            : <rect x={ox} y={oy} width={frameW} height={frameH} />}
        </clipPath>
      </defs>

      {/* ── Outer aluminum frame (trapezoid when raked) ── */}
      {isRaked
        ? <polygon points={clipPoints}
            fill="url(#slashPattern)" stroke="#334155" strokeWidth={1.5} />
        : <rect x={ox} y={oy} width={frameW} height={frameH}
            fill="url(#slashPattern)" stroke="#334155" strokeWidth={1.5} rx={1} />}

      {/* ── Head sightline fill (trapezoid when raked) ── */}
      {isRaked
        ? <polygon
            points={`${ox},${frameTopLeftY} ${ox+frameW},${frameTopRightY} ${ox+frameW},${oy+frameH-(rightH-headSightline)*scale} ${ox},${oy+frameH-(leftH-headSightline)*scale}`}
            fill="#1e2d3d" stroke="none" />
        : <rect x={ox} y={oy} width={frameW} height={headH}
            fill="#1e2d3d" stroke="none" />}

      {/* ── Sill sightline fill — amber tint when > 2" (high base) ── */}
      <rect x={ox} y={oy + frameH - sillH} width={frameW} height={sillH}
        fill={sillSightline > 2 ? 'rgba(245,158,11,0.18)' : '#1e2d3d'}
        stroke={sillSightline > 2 ? '#f59e0b' : 'none'}
        strokeWidth={sillSightline > 2 ? 0.75 : 0}
      />
      {/* Sill label when it's a high base */}
      {sillSightline > 2 && sillH > 8 && (
        <text x={ox + frameW / 2} y={oy + frameH - sillH / 2 + 3}
          textAnchor="middle" fontSize={8} fill="#fcd34d"
          fontWeight="700" fontFamily="monospace" opacity={0.85}>
          {sillSightline}" base
        </text>
      )}

      {/* ── Per-bay sill step-up fills (orange band above sill) ── */}
      {baysData.map((bd, c) => {
        const stepUp = sillStepUps[c] ?? 0;
        if (stepUp <= 0) return null;
        const stepPx    = stepUp * scale;
        const stepFillY = oy + frameH - sillH - stepPx;
        return (
          <g key={`stepup-${c}`}>
            <rect x={bd.xStart} y={stepFillY} width={bd.ww} height={stepPx}
              fill="rgba(249,115,22,0.22)" stroke="#f97316" strokeWidth={0.8} />
            {stepPx > 12 && (
              <text
                x={bd.xStart + bd.ww / 2} y={stepFillY + stepPx / 2 + 3}
                textAnchor="middle" fontSize={Math.min(9, bd.ww / 4)}
                fill="#fdba74" fontWeight="700" fontFamily="monospace" opacity={0.9}>
                +{stepUp}"
              </text>
            )}
          </g>
        );
      })}

      {/* ── Vertical mullion centerlines ── */}
      {Array.from({ length: bays - 1 }, (_, i) => {
        const xPos    = baysData[i].xStart + baysData[i].ww + mulW / 2;
        const clineY1 = isRaked ? interiorTopAtPx(xPos) : oy + headH;
        return (
          <line key={`vcl-${i}`}
            x1={xPos} y1={clineY1} x2={xPos} y2={oy + frameH - sillH}
            stroke="#2563eb" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.55} />
        );
      })}

      {/* ── Horizontal mullion centerlines ── per-bay, not full-width ── */}
      {baysData.map((bd, c) => {
        const bEdges = allBayEdges[c];
        return bEdges.map((edge, i) => {
          const yCL = toSvgYForBay(c, edge + mullionSightline / 2);
          return (
            <line key={`hcl-${c}-${i}`}
              x1={bd.xStart} y1={yCL} x2={bd.xStart + bd.ww} y2={yCL}
              stroke="#2563eb" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.55} />
          );
        });
      })}

      {/* ── Standard glass panes ── per-bay independent rows ── */}
      {baysData.map((bd, c) => {
        if (isDoorFrame && c === doorBayIdx) return null; // door overlay handles this bay
        const paneSegs = getPaneSegs(allBayEdges[c]);
        return paneSegs.map((seg, r) => {
          const svgPaneBottomY = toSvgYForBay(c, seg.y0);
          const svgPaneH       = seg.paneH * scale;
          if (svgPaneH < 0.5) return null; // invisible — skip

          const isTopPane = r === paneSegs.length - 1;

          // Raked top pane — draw as trapezoid so it follows the angled header
          if (isRaked && isTopPane) {
            const topLeftY  = interiorTopAtPx(bd.xStart);
            const topRightY = interiorTopAtPx(bd.xStart + bd.ww);
            const pts = [
              `${bd.xStart},${svgPaneBottomY}`,
              `${bd.xStart + bd.ww},${svgPaneBottomY}`,
              `${bd.xStart + bd.ww},${topRightY}`,
              `${bd.xStart},${topLeftY}`,
            ].join(' ');
            return (
              <g key={`pane-${c}-${r}`}>
                <polygon points={pts}
                  fill="url(#glassFill)" stroke="#3b82f6" strokeWidth={1} />
                {c === 0 && bd.ww > 26 && Math.abs(svgPaneBottomY - topLeftY) > 16 && (
                  <text
                    x={bd.xStart + bd.ww / 2}
                    y={(svgPaneBottomY + Math.min(topLeftY, topRightY)) / 2 + 4}
                    textAnchor="middle" fontSize={Math.min(10, bd.ww / 5)}
                    fill="#93c5fd" fontWeight="700" fontFamily="monospace" opacity={0.8}>
                    DLO
                  </text>
                )}
              </g>
            );
          }

          // Rectangular pane (standard, or non-top pane in raked frame)
          const svgPaneTopY = svgPaneBottomY - svgPaneH;
          return (
            <g key={`pane-${c}-${r}`}>
              <rect x={bd.xStart} y={svgPaneTopY} width={bd.ww} height={svgPaneH}
                fill="url(#glassFill)" stroke="#3b82f6" strokeWidth={1} rx={1} />
              {c === 0 && r === paneSegs.length - 1 && bd.ww > 26 && svgPaneH > 16 && (
                <text x={bd.xStart + bd.ww / 2} y={svgPaneTopY + svgPaneH / 2 + 4}
                  textAnchor="middle" fontSize={Math.min(10, bd.ww / 5)}
                  fill="#93c5fd" fontWeight="700" fontFamily="monospace" opacity={0.8}>
                  DLO
                </text>
              )}
            </g>
          );
        });
      })}

      {/* ── Door overlay (absolute pixel positions within bay column) ── */}
      {isDoorFrame && doorColData && (() => {
        const px = doorColData.xStart;
        const pw = doorColData.ww;
        return (
          <g key="door-overlay">
            {/* Transom glass (DLO above door header, below head sightline) */}
            {hasTransom_v && (
              <>
                <rect x={px} y={transomTopY} width={pw} height={transomPxH}
                  fill="url(#glassFill)" stroke="#34d399" strokeWidth={1.2} rx={1} />
                <text x={px + pw / 2} y={transomTopY + transomPxH / 2 + 3}
                  textAnchor="middle" fontSize={Math.min(8, pw / 5)}
                  fill="#6ee7b7" fontWeight="700" fontFamily="monospace" opacity={0.85}>
                  TRAN
                </text>
              </>
            )}
            {/* Door header sightline fill */}
            <rect x={px} y={headerTopY} width={pw} height={DOOR_HEADER_SL * scale}
              fill="#1e2d3d" stroke="#334155" strokeWidth={0.75} />
            {/* Door leaf body */}
            <rect x={px} y={doorTopY} width={pw} height={DOOR_HEIGHT * scale}
              fill="rgba(15,23,42,0.88)" stroke="#60a5fa" strokeWidth={1.5} />
            {/* Center split for pair */}
            {doorType === 'pair' && (
              <line x1={px + pw / 2} y1={doorTopY} x2={px + pw / 2} y2={doorFloorY}
                stroke="#60a5fa" strokeWidth={1} opacity={0.6} />
            )}
            {/* Label */}
            <text x={px + pw / 2} y={doorTopY + DOOR_HEIGHT * scale * 0.52}
              textAnchor="middle" fontSize={Math.min(9, pw / 4)}
              fill="#93c5fd" fontWeight="700" fontFamily="monospace" opacity={0.9}>
              {doorType === 'pair' ? 'PR' : 'DR'}
            </text>
          </g>
        );
      })()}

      {/* ── Vertical interior mullion fills ── */}
      {Array.from({ length: bays - 1 }, (_, i) => {
        const xPos      = baysData[i].xStart + baysData[i].ww;
        // In raked mode, top of mullion follows the outer frame angle at mulCenter X
        const mulTopY   = isRaked ? frameOuterTopAtPx(xPos + mulW / 2) : oy;
        const mulHeight = oy + frameH - mulTopY;
        return (
          <rect key={`vmul-${i}`}
            x={xPos} y={mulTopY} width={mulW} height={mulHeight}
            fill="#1e2d3d" stroke="#334155" strokeWidth={0.75} />
        );
      })}

      {/* ── Horizontal interior mullion fills ── per-bay, scoped to bay width ── */}
      {baysData.map((bd, c) => {
        const bEdges = allBayEdges[c];
        return bEdges.map((edge, i) => {
          const mullTopY = toSvgYForBay(c, edge + mullionSightline);
          return (
            <rect key={`hmul-${c}-${i}`}
              x={bd.xStart} y={mullTopY} width={bd.ww} height={mulW}
              fill="#1e2d3d" stroke="#334155" strokeWidth={0.75} />
          );
        });
      })}

      {/* ── Width dimension arrow ── */}
      {frameW > 40 && (
        <g>
          <line x1={ox} y1={oy + frameH + 14} x2={ox + frameW} y2={oy + frameH + 14}
            stroke="#4b5563" strokeWidth={1}
            markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
          <text x={ox + frameW / 2} y={oy + frameH + 24}
            textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily="monospace">
            {width}"
          </text>
        </g>
      )}

      {/* ── Height dimension arrow ── */}
      {frameH > 40 && (
        isRaked ? (
          // Left and right leg height arrows for raked frames
          <>
            <line x1={ox - 14} y1={frameTopLeftY} x2={ox - 14} y2={oy + frameH}
              stroke="#f97316" strokeWidth={1}
              markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
            <text
              x={ox - 24} y={(frameTopLeftY + oy + frameH) / 2 + 4}
              textAnchor="middle" fontSize={8} fill="#fb923c" fontFamily="monospace"
              transform={`rotate(-90, ${ox - 24}, ${(frameTopLeftY + oy + frameH) / 2 + 4})`}>
              L:{leftH}"
            </text>
            <line x1={ox + frameW + 14} y1={frameTopRightY} x2={ox + frameW + 14} y2={oy + frameH}
              stroke="#f97316" strokeWidth={1}
              markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
            <text
              x={ox + frameW + 24} y={(frameTopRightY + oy + frameH) / 2 + 4}
              textAnchor="middle" fontSize={8} fill="#fb923c" fontFamily="monospace"
              transform={`rotate(-90, ${ox + frameW + 24}, ${(frameTopRightY + oy + frameH) / 2 + 4})`}>
              R:{rightH}"
            </text>
          </>
        ) : (
          <g>
            <line x1={ox + frameW + 14} y1={oy} x2={ox + frameW + 14} y2={oy + frameH}
              stroke="#4b5563" strokeWidth={1}
              markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
            <text x={ox + frameW + 24} y={oy + frameH / 2 + 4}
              textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily="monospace"
              transform={`rotate(-90, ${ox + frameW + 24}, ${oy + frameH / 2 + 4})`}>
              {height}"
            </text>
          </g>
        )
      )}

      {/* ── Shape mode badge ── */}
      {isRaked && (
        <text x={ox + frameW / 2} y={Math.min(frameTopLeftY, frameTopRightY) - 7}
          textAnchor="middle" fontSize={8} fill="#f97316" fontWeight="700"
          fontFamily="monospace" opacity={0.85} letterSpacing={1}>
          ► RAKED HEAD ◄
        </text>
      )}

      {/* ── Corner ticks ── */}
      {[
        [ox,         isRaked ? frameTopLeftY  : oy],
        [ox + frameW, isRaked ? frameTopRightY : oy],
        [ox,         oy + frameH],
        [ox + frameW, oy + frameH],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={2.5} fill="#475569" />
      ))}
    </svg>
  );
}

// ─── Input Slider + Number combo ─────────────────────────────────────────────
// ─── Architectural Dimension Text Input ─────────────────────────────────────────────────────────────────────
/**
 * Accepts architectural notation (“7'6"”, “84 1/2”, “84.5”, “84”) as typed text.
 * On blur / Enter, parses to decimal inches and calls onChange.
 * Displays a formatted hint (e.g. 10\'-0") in the label for quick reference.
 */
function ArchDimInput({ label, value, onChange, min = 1, max = 9999 }) {
  const [raw,     setRaw]     = useState(() => String(value));
  const [focused, setFocused] = useState(false);

  // Keep display in sync whenever an external prop change arrives
  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  const commit = (str) => {
    const parsed  = parseArchitecturalString(str, value);
    const clamped = isNaN(parsed) ? value : Math.min(max, Math.max(min, +parsed.toFixed(2)));
    onChange(clamped);
    setRaw(String(clamped));
  };

  return (
    <div style={css.field}>
      <div style={css.fieldLabel}>
        <span>{label}</span>
        <span style={{ ...css.fieldValue, fontSize: '0.68rem', color: '#34d399' }}>
          {formatArchitecturalInches(value)}
        </span>
      </div>
      <input
        type="text"
        value={raw}
        placeholder={`e.g. 120, 10', 7'6"`}
        onChange={e => setRaw(e.target.value)}
        onFocus={e => { setFocused(true); setRaw(String(value)); e.target.style.borderColor = '#2563eb'; e.target.select(); }}
        onBlur={e => {
          setFocused(false);
          commit(e.target.value);
          e.target.style.borderColor = 'var(--border-subtle, #2d333b)';
        }}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        style={css.numberInput}
      />
    </div>
  );
}

// ─── Slider Field (non-dimension numeric controls) ────────────────────────────
function SliderField({ label, value, onChange, min, max, step = 1, unit = '' }) {
  const [display, setDisplay] = React.useState(String(value));

  // Keep local display in sync when parent value changes externally
  React.useEffect(() => { setDisplay(String(value)); }, [value]);

  const commit = (raw) => {
    const v = Number(raw);
    if (!isNaN(v) && raw.trim() !== '') {
      const clamped = Math.min(max, Math.max(min, v));
      onChange(clamped);
      setDisplay(String(clamped));
    } else {
      // Revert to last valid value if left empty/invalid
      setDisplay(String(value));
    }
  };

  return (
    <div style={css.field}>
      <div style={css.fieldLabel}>
        <span>{label}</span>
      </div>
      <input
        type="number"
        min={min} max={max} step={step}
        value={display}
        onChange={e => setDisplay(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
        style={css.numberInput}
        onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.select(); }}
      />
    </div>
  );
}

// ─── Door Bay Input ───────────────────────────────────────────────────────────
function DoorBayInput({ bays, value, onChange }) {
  const [display, setDisplay] = React.useState(String(value));
  React.useEffect(() => { setDisplay(String(value)); }, [value]);
  const commit = (raw) => {
    const v = parseInt(raw, 10);
    if (!isNaN(v) && raw.trim() !== '') {
      const clamped = Math.min(bays, Math.max(1, v));
      onChange(clamped);
      setDisplay(String(clamped));
    } else {
      setDisplay(String(value));
    }
  };
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Door Location (Bay #)</div>
      <input
        type="number" min={1} max={bays} step={1}
        value={display}
        onChange={e => setDisplay(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        style={{ ...css.numberInput, borderColor: 'rgba(59,130,246,0.35)', color: '#93c5fd' }}
        onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.select(); }}
      />
    </div>
  );
}

// ─── Sightline Input (local display state — free typing, commit on blur) ────
function SightlineInput({ label, value, onChange, highlight = false }) {
  const [display, setDisplay] = React.useState(String(value));
  React.useEffect(() => { setDisplay(String(value)); }, [value]);
  const accentColor = highlight ? '#f59e0b' : '#2563eb';
  const commit = (raw) => {
    const v = parseFloat(raw);
    if (!isNaN(v) && raw.trim() !== '') {
      const clamped = Math.min(12, Math.max(1, v));
      onChange(clamped);
      setDisplay(String(clamped));
    } else {
      setDisplay(String(value));
    }
  };
  return (
    <div style={css.field}>
      <div style={css.fieldLabel}><span>{label}</span></div>
      <input
        type="number" min={1} max={12} step={0.25}
        value={display}
        onChange={e => setDisplay(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        style={{ ...css.numberInput, borderColor: highlight ? 'rgba(245,158,11,0.45)' : 'var(--border-subtle, #2d333b)', color: highlight ? '#fcd34d' : 'var(--text-primary, #e6edf3)' }}
        onFocus={e => { e.target.style.borderColor = accentColor; e.target.select(); }}
      />
    </div>
  );
}

// ─── Add Horizontal Input ─────────────────────────────────────────────────────
// Tiny controlled input for entering a height (inches from sill) to add to a bay
function AddHorizontalInput({ onAdd, maxH }) {
  const [val, setVal] = React.useState('');
  const commit = () => {
    const v = parseFloat(val);
    if (!isNaN(v) && v > 0 && v <= maxH) {
      onAdd(+v.toFixed(4));
      setVal('');
    }
  };
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
      <input
        type="number"
        min={0.5}
        max={maxH}
        step={0.25}
        placeholder={`in" from sill`}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        style={{
          flex: 1,
          padding: '4px 6px',
          backgroundColor: '#1c2128',
          border: '1px solid #2d333b',
          borderRadius: 5,
          color: '#e6edf3',
          fontSize: '0.75rem',
          outline: 'none',
          boxSizing: 'border-box',
        }}
        onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
        onBlur={e => { e.target.style.borderColor = '#2d333b'; }}
      />
      <button
        onClick={commit}
        style={{
          padding: '4px 8px',
          borderRadius: 5,
          background: 'rgba(37,99,235,0.2)',
          border: '1px solid rgba(37,99,235,0.4)',
          color: '#60a5fa',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}>
        +
      </button>
    </div>
  );
}

// ─── BOM Row ──────────────────────────────────────────────────────────────────
function BomRow({ label, value, accent = false, highlight = false }) {
  const rowStyle = highlight ? css.bomRowHighlight : css.bomRow;
  const valStyle = accent ? css.bomValAccent : css.bomVal;
  return (
    <div style={rowStyle}>
      <span style={css.bomKey}>{label}</span>
      <span style={valStyle}>{value}</span>
    </div>
  );
}

// ─── Accordion Section ───────────────────────────────────────────────────────
function AccordionSection({ title, open, onToggle, children }) {
  return (
    <div style={css.accordionWrap}>
      <button
        type="button"
        style={{
          ...css.accordionHeader,
          background: open ? 'rgba(37,99,235,0.09)' : 'var(--bg-panel, #0d1117)',
          color: open ? '#93c5fd' : 'var(--text-secondary, #9ea7b3)',
        }}
        onMouseDown={e => e.stopPropagation()}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span style={{
          fontSize: '0.8rem',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
          display: 'inline-block',
          lineHeight: 1,
        }}>▾</span>
      </button>
      {open && (
        <div style={css.accordionBody}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ParametricFrameBuilder({
  initialWidth        = 120,
  initialHeight       = 120,
  onSaveFrame,
  compact             = false,
  bayWidths:   externalBayWidths  = [],
  rowHeights:  externalRowHeights = [],
  onBaysRowsChange,
  quantity        = 1,
  onQuantityChange,
  systemProfile   = SYSTEM_PACKAGES[DEFAULT_SYSTEM_ID],
}) {
  const addFrame = useBidStore((state) => state.addFrame);

  // ── System Geometry — Base + Override architecture ────────────────────────
  // Helper: build an activeGeometry object from a system profile or catalog default
  const geoFromProfile = (profile) => {
    const id = profile?.id ?? DEFAULT_SYSTEM_ID;
    const cat = SYSTEM_GEOMETRY_CATALOG[id];
    return cat
      ? { ...cat.default }
      : {
          sightline:  profile?.geometry?.verticalSightline   ?? 2,
          hSightline: profile?.geometry?.horizontalSightline ?? 2,
          bite:       profile?.geometry?.glassBite           ?? 0.375,
          hBite:      profile?.geometry?.glassBite           ?? 0.375,
        };
  };

  const [activeGeometry,  setActiveGeometry]  = useState(() => geoFromProfile(systemProfile));
  const [geoOverride,     setGeoOverride]     = useState(false);  // reveals custom inputs
  const [selectedPreset,  setSelectedPreset]  = useState('__default__');

  // Sync geometry when the parent swaps the systemProfile prop (Toolbelt scope change)
  useEffect(() => {
    setActiveGeometry(geoFromProfile(systemProfile));
    setSelectedPreset('__default__');
    setGeoOverride(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemProfile?.id]);

  // Convenience aliases — all downstream math + render code reads these
  const sysSL   = activeGeometry.sightline;
  const sysBite = activeGeometry.bite;

  // Catalog entry for the active system (null-safe)
  const geoCatalog = SYSTEM_GEOMETRY_CATALOG[systemProfile?.id] ?? null;

  const [overallWidth,  setOverallWidth]  = useState(initialWidth);
  const [overallHeight, setOverallHeight] = useState(initialHeight);

  // When the parent draws a new box (without remounting the component),
  // propagate the fresh dimensions into local state.
  useEffect(() => { setOverallWidth(initialWidth);  }, [initialWidth]);
  useEffect(() => { setOverallHeight(initialHeight); }, [initialHeight]);
  const [bays,          setBays]          = useState(4);
  const [rows,          setRows]          = useState(1);
  const [elevationTag,  setElevationTag]  = useState('Elev-A');
  const [systemType,    setSystemType]    = useState('Storefront 2×4.5');
  const [glassType,     setGlassType]     = useState('GL-1 (1" Low-E)');
  const [headSightline, setHeadSightline] = useState(2);        // inches — head (top) sightline
  const [sillSightline, setSillSightline] = useState(2);        // inches — sill (base) sightline
  const [doorType,      setDoorType]      = useState('none');   // 'none' | 'single' | 'pair'
  const [doorBay,       setDoorBay]       = useState(1);        // 1-indexed bay that receives the door
  const [saved,         setSaved]         = useState(false);

  // ── Shape Mode (Raked Head + Stepped Sill) ──────────────────────────────
  const [shapeMode,     setShapeMode]     = useState('rectangular'); // 'rectangular' | 'raked_head'
  const [leftLegHeight, setLeftLegHeight] = useState(initialHeight);
  const [rightLegHeight,setRightLegHeight]= useState(initialHeight);
  const [sillStepUps,   setSillStepUps]   = useState({});  // { [bayIdx]: offsetInches }

  // Keep leg heights in sync when overall height changes in rectangular mode
  useEffect(() => {
    if (shapeMode === 'rectangular') {
      setLeftLegHeight(overallHeight);
      setRightLegHeight(overallHeight);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overallHeight, shapeMode]);

  // ── Sidebar tab + accordion open/closed state ─────────────────────────────
  const [sidebarTab,      setSidebarTab]      = useState('build');   // 'build' | 'calc'
  const [openSightlines,  setOpenSightlines]  = useState(true);   // open by default — sightlines are commonly adjusted
  const [openHorizontals, setOpenHorizontals] = useState(false);
  const [openGeometry,    setOpenGeometry]    = useState(false);

  // ── Bay-Based Horizontals ─────────────────────────────────────────────
  // Sparse map: { [bayIdx]: [..mullionBottomEdge_in_from_sill..] }
  // Missing key → bay inherits the global `rows` default.
  const [bayHorizontals, setBayHorizontals] = useState({});
  const lastDoorBayRef = useRef(null); // tracks which bay was last cleared for the door

  // Helper: get resolved edge list for a bay
  const resolvedEdges = (bayIdx) =>
    bayHorizontals[bayIdx] !== undefined
      ? [...bayHorizontals[bayIdx]].sort((a, b) => a - b)
      : computeDefaultHorizontals(rows, overallHeight, headSightline, sillSightline, sysSL);

  // Smart door insertion: auto-clear the door bay below the header,
  // and restore default when the door is removed.
  useEffect(() => {
    if (doorType === 'none') {
      // Restore the bay that previously held the door back to default
      if (lastDoorBayRef.current !== null) {
        setBayHorizontals(prev => {
          const next = { ...prev };
          delete next[lastDoorBayRef.current];
          return next;
        });
        lastDoorBayRef.current = null;
      }
      return;
    }
    const bayIdx = doorBay - 1;
    // If we're moving the door, also restore the old bay
    if (lastDoorBayRef.current !== null && lastDoorBayRef.current !== bayIdx) {
      setBayHorizontals(prev => {
        const next = { ...prev };
        delete next[lastDoorBayRef.current];
        return next;
      });
    }
    // Clear any intermediate horizontals below the door header in this bay
    const doorHeaderEdge = DOOR_HEIGHT; // bottom edge of door header mullion from interior sill
    setBayHorizontals(prev => {
      const existing = prev[bayIdx] !== undefined
        ? [...prev[bayIdx]]
        : computeDefaultHorizontals(rows, overallHeight, headSightline, sillSightline, sysSL);
      const cleared     = existing.filter(h => h >= doorHeaderEdge);
      const withHeader  = [...new Set([...cleared, doorHeaderEdge])].sort((a, b) => a - b);
      return { ...prev, [bayIdx]: withHeader };
    });
    lastDoorBayRef.current = bayIdx;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorType, doorBay]);

  // ── Math Engine ──────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const w  = overallWidth;
    const h  = overallHeight;
    const hs = headSightline;  // user-controlled head sightline
    const ss = sillSightline;  // user-controlled sill sightline

    // ── Vertical (bay) aluminum ──────────────────────────────────────────────
    const verticalsCount    = bays + 1;
    const totalVerticalLF   = (verticalsCount * h) / 12;

    // ── Horizontal (row) aluminum ────────────────────────────────────────────
    // Head + sill are user-overrideable; interior horizontal mullions use sysSL
    const horizontalsCount          = rows + 1;                            // display only
    const interiorHorizSightlines   = (rows - 1) * sysSL;
    const totalHorizontalSightlines = hs + ss + interiorHorizSightlines;   // needed for dloHeight

    // ── Vertical DLO (width) ───────────────────────────────────────────────
    const totalVerticalSightlines = verticalsCount * sysSL;
    const dloWidth                = (w - totalVerticalSightlines) / bays;

    // ── Horizontal DLO (height) ─────────────────────────────────────────────
    // Uses the spec formula with user-provided head + sill overrides
    const dloHeight = (h - totalHorizontalSightlines) / rows;

    // ── Standard glass cut sizes ───────────────────────────────────────────────
    const glassCutWidth  = dloWidth  + sysBite * 2;   // DLO + bite each side
    const glassCutHeight = dloHeight + sysBite * 2;
    const sqFtPerLite    = (glassCutWidth * glassCutHeight) / 144;

    // ── Per-bay accurate horizontal LF ─────────────────────────────────
    const defEdgesCalc        = computeDefaultHorizontals(rows, h, hs, ss, sysSL);
    const allBayEdgesCalc     = Array.from({ length: bays }, (_, i) =>
      bayHorizontals[i] !== undefined ? bayHorizontals[i] : defEdgesCalc
    );
    const totalInteriorHorizPcs = allBayEdgesCalc.reduce((sum, edges) => sum + edges.length, 0);
    const totalHorizontalLF = (w * 2) / 12
      + (totalInteriorHorizPcs * glassCutWidth) / 12;
    const totalAluminumLF   = totalVerticalLF + totalHorizontalLF;

    // Glass counts — derive per-bay lite counts from actual edge lists
    const bayLiteCounts = allBayEdgesCalc.map(edges => edges.length + 1);
    const baseTotalLites     = bayLiteCounts.reduce((s, n) => s + n, 0);
    const baseTotalGlassSqFt = sqFtPerLite * baseTotalLites;

    // ── Door engine ────────────────────────────────────────────────────────
    const hasDoor       = doorType !== 'none';
    const doorLeavesQty = doorType === 'pair' ? 2 : 1;
    const safeDoorBay   = Math.max(1, Math.min(doorBay, bays));

    // Spec formula: transomDloHeight = height − 84 − DOOR_HEADER_SL − headSightline
    //   e.g. 120" − 84" − 2" − 2" = 32" DLO
    const transomDLOH = hasDoor ? h - DOOR_HEIGHT - DOOR_HEADER_SL - hs : 0;
    const hasTransom  = hasDoor && transomDLOH > 0;

    // Transom glass — width DLO is the same as standard bays (spec)
    const transomCutW = hasTransom ? glassCutWidth               : 0;
    const transomCutH = hasTransom ? transomDLOH + sysBite * 2  : 0;
    const transomSqFt = hasTransom ? (transomCutW * transomCutH) / 144 : 0;

    // Glass totals adjusted for door bay:
    //   − 1 full-height std lite  (replaced by door unit)
    //   + 1 transom lite          (if height allows)
    const stdGlassLites      = baseTotalLites - (hasDoor ? 1 : 0);
    const adjustedTotalLites = stdGlassLites + (hasTransom ? 1 : 0);
    const adjustedTotalGlassSqFt =
      baseTotalGlassSqFt
      - (hasDoor    ? sqFtPerLite : 0)
      + (hasTransom ? transomSqFt : 0);

    // Aluminum adjustments for door bay:
    //   − sill extrusion (door threshold replaces it)
    //   + door header   (same length, seated at DOOR_HEIGHT from floor)
    const doorSillRemovedLF = hasDoor ? dloWidth / 12 : 0; // DLO width, not cut width
    const doorHeaderLF      = hasDoor ? dloWidth / 12 : 0;

    // ── Labor hours (from active system package) ──────────────────────────
    const fabRate     = systemProfile?.labor?.fabLFPerHour       ?? 12;
    const installRate = systemProfile?.labor?.installSqFtPerHour ?? 25;
    const shopHours   = totalAluminumLF / fabRate;
    const fieldHours  = adjustedTotalGlassSqFt / installRate;

    return {
      // Grid
      verticalsCount,
      horizontalsCount,
      totalVerticalLF,
      totalHorizontalLF,
      totalAluminumLF,
      totalHorizontalSightlines,
      // DLO
      dloWidth,
      dloHeight,
      glassCutWidth,
      glassCutHeight,
      sqFtPerLite,
      baseTotalLites,
      baseTotalGlassSqFt,
      // Door
      hasDoor,
      doorLeavesQty,
      safeDoorBay,
      hasTransom,
      transomDLOH,
      transomCutW,
      transomCutH,
      transomSqFt,
      stdGlassLites,
      adjustedTotalLites,
      adjustedTotalGlassSqFt,
      doorSillRemovedLF,
      doorHeaderLF,
      // Aliases used by BOM/save
      totalLites:     adjustedTotalLites,
      totalGlassSqFt: adjustedTotalGlassSqFt,
      // Labor
      shopHours,
      fieldHours,
    };
  }, [overallWidth, overallHeight, bays, rows, headSightline, sillSightline,
      doorType, doorBay, sysSL, sysBite, systemProfile, activeGeometry, bayHorizontals]);

  // ── Save Handler ─────────────────────────────────────────────────────────
  const handleSave = () => {
    const frameId = `frame_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Cut list — standard storefront fabrication pieces
    // Verticals   : bays+1 members, each runs the full frame height
    // Horizontals : (rows+1) rails × bays sections; each cut to the glass bite
    //               span (dloWidth + 2×bite) which seats perfectly in the vertical pockets
    const cutList = [
      {
        part:         'Vertical',
        qty:          calc.verticalsCount,
        lengthInches: overallHeight,
        note:         'Full-height member — head to sill',
      },
      {
        part:         'Horizontal',
        qty:          calc.horizontalsCount * bays,
        lengthInches: +calc.glassCutWidth.toFixed(4),
        note:         'Cut to DLO + 2× glass bite (pocket-to-pocket)',
      },
      ...(calc.hasDoor ? [
        {
          part:         'Sill (Door Bay)',
          qty:          -1,
          lengthInches: +calc.glassCutWidth.toFixed(4),
          note:         `Removed — door in Bay ${calc.safeDoorBay}; threshold replaces it`,
        },
        {
          part:         'Door Header',
          qty:          1,
          lengthInches: +calc.glassCutWidth.toFixed(4),
          note:         `At ${DOOR_HEIGHT}" AFF — Bay ${calc.safeDoorBay}`,
        },
        {
          part:         'Door Hardware Allowance',
          qty:          calc.doorLeavesQty,
          lengthInches: null,
          note:         calc.doorLeavesQty === 2 ? 'Pair — 2 leafs + 3-pt lock + closers' : 'Single — leaf + latch set + closer',
        },
      ] : []),
    ];

    const payload = {
      frameId,
      elevationTag,
      systemType,
      quantity,
      inputs: {
        width:            overallWidth,
        height:           overallHeight,
        bays,
        rows,
        glassBite:        sysBite,
        mullionSightline: sysSL,
        headSightline,
        sillSightline,
        systemName:       systemProfile?.name ?? 'Storefront',
        // Shape mode
        shapeMode,
        ...(shapeMode === 'raked_head' ? { leftLegHeight, rightLegHeight } : {}),
        sillStepUps:      Object.keys(sillStepUps).length > 0 ? sillStepUps : undefined,
        // Full active geometry snapshot (captures any custom override)
        geometry: {
          sightline:  activeGeometry.sightline,
          hSightline: activeGeometry.hSightline,
          bite:       activeGeometry.bite,
          hBite:      activeGeometry.hBite,
          preset:     selectedPreset,
          isOverride: geoOverride,
        },
      },
      bom: {
        quantity,
        totalAluminumLF:  +(calc.totalAluminumLF * quantity).toFixed(2),
        totalGlassSqFt:   +(calc.adjustedTotalGlassSqFt * quantity).toFixed(2),
        glassLitesCount:  calc.adjustedTotalLites * quantity,
        shopHours:        +(calc.shopHours * quantity).toFixed(2),
        fieldHours:       +(calc.fieldHours * quantity).toFixed(2),
        totalLaborHours:  +((calc.shopHours + calc.fieldHours) * quantity).toFixed(2),
        cutList:          cutList.map(item => ({
          ...item,
          // Multiply qty for positive items (sill removal stays -1 per frame, × quantity)
          qty: item.qty > 0 ? item.qty * quantity : item.qty * quantity,
        })),
        glassSizes: {
          glassType,
          widthInches:  +calc.glassCutWidth.toFixed(4),
          heightInches: +calc.glassCutHeight.toFixed(4),
          qty:          calc.stdGlassLites * quantity,
        },
        ...(calc.hasTransom ? {
          transomGlass: {
            glassType,
            widthInches:  +calc.transomCutW.toFixed(4),
            heightInches: +calc.transomCutH.toFixed(4),
            qty:          quantity,
            note:         `Transom above door — Bay ${calc.safeDoorBay}`,
          },
        } : {}),
        door: calc.hasDoor ? {
          type:       doorType,
          bay:        calc.safeDoorBay,
          heightIn:   DOOR_HEIGHT,
          leaves:     calc.doorLeavesQty,
          hasTransom: calc.hasTransom,
          transomDLOH: calc.hasTransom ? +calc.transomDLOH.toFixed(4) : null,
        } : null,
        // Detailed breakdown (useful downstream for pricing engines)
        _detail: {
          dloWidth:               +calc.dloWidth.toFixed(4),
          dloHeight:              +calc.dloHeight.toFixed(4),
          sqFtPerLite:            +calc.sqFtPerLite.toFixed(4),
          totalHorizontalSightlines: calc.totalHorizontalSightlines,
          totalVerticalLF:        +calc.totalVerticalLF.toFixed(2),
          totalHorizontalLF:      +calc.totalHorizontalLF.toFixed(2),
          verticalsCount:         calc.verticalsCount,
          horizontalsCount:       calc.horizontalsCount,
          systemName:             systemProfile?.name ?? 'Storefront',
          mullionSightline:       sysSL,
          glassBite:              sysBite,
        },
      },
    };

    // Always push to the global Zustand bid cart
    addFrame(payload);

    // Also fire the optional callback prop (e.g. parent wants to navigate away)
    if (typeof onSaveFrame === 'function') {
      onSaveFrame(payload);
    }

    console.log('[ParametricFrameBuilder] → Bid cart:', payload);

    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={css.container}>

      {/* Two-panel layout: center visualizer + unified right sidebar */}
      <div style={css.panels}>

        {/* ── CENTER: Visualizer ──────────────────────────────────────────── */}
        <div style={compact ? { display: 'none' } : css.centerPanel}>
          <p style={css.vizLabel}>Elevation Wireframe — Bay-Based Layout ({bays} bay{bays !== 1 ? 's' : ''})</p>
          <div style={css.svgWrapper}>
            <FrameVisualizer
              width={overallWidth}
              height={overallHeight}
              bays={bays}
              doorType={doorType}
              doorBay={calc.safeDoorBay}
              headSightline={headSightline}
              sillSightline={sillSightline}
              externalBayWidths={externalBayWidths.length === bays ? externalBayWidths : []}
              mullionSightline={sysSL}
              bayHorizontals={bayHorizontals}
              defaultRows={rows}
              shapeMode={shapeMode}
              leftLegHeight={leftLegHeight}
              rightLegHeight={rightLegHeight}
              sillStepUps={sillStepUps}
            />
          </div>
          <p style={css.dimBadge}>
            <span style={{ color: '#60a5fa', fontWeight: 700 }}>{elevationTag}</span>
            {systemType && <span style={{ color: 'var(--text-secondary, #9ea7b3)' }}> · {systemType}</span>}
            {glassType && <span style={{ color: '#34d399', fontWeight: 600 }}> · {glassType}</span>}
            <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>
            {overallWidth}" W
            {shapeMode === 'raked_head'
              ? <> × <span style={{ color: '#fb923c' }}>L:{leftLegHeight}" / R:{rightLegHeight}"</span></>
              : <> × {overallHeight}" H</>}
            &nbsp;|&nbsp; {calc.totalLites} lite{calc.totalLites !== 1 ? 's' : ''}
            {Object.keys(sillStepUps).length > 0 && (
              <span style={{ color: '#f97316', marginLeft: 6 }}>▲ Stepped</span>
            )}
          </p>
        </div>

        {/* ── UNIFIED RIGHT SIDEBAR ───────────────────────────────────────── */}
        <div style={compact ? { ...css.sidebar, flex: 1, width: 'auto' } : css.sidebar}>

          {/* Tab Bar */}
          <div style={css.tabBar}>
            <button
              style={sidebarTab === 'build' ? css.tabBtnActive : css.tabBtn}
              onClick={() => setSidebarTab('build')}
            >
              ⚙ Build
            </button>
            <button
              style={sidebarTab === 'calc' ? css.tabBtnActive : css.tabBtn}
              onClick={() => setSidebarTab('calc')}
            >
              📐 Calculations
            </button>
          </div>

          {/* Scrollable body */}
          <div style={css.sidebarScroll}>

            {/* ══════════════ BUILD TAB ══════════════ */}
            {sidebarTab === 'build' && (
              <>

                {/* ── Frame Identity ── always visible */}
                <div>
                  <p style={css.sectionLabel}>Frame Identity</p>
                  <div style={css.fieldGroup}>
                    <div style={css.field}>
                      <div style={css.fieldLabel}><span>Elevation Tag</span></div>
                      <input
                        type="text"
                        value={elevationTag}
                        onChange={e => setElevationTag(e.target.value)}
                        placeholder="e.g. Elev-A, N-Elevation"
                        style={css.numberInput}
                        onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
                        onBlur={e => { e.target.style.borderColor = 'var(--border-subtle, #2d333b)'; }}
                      />
                    </div>
                    <div style={css.field}>
                      <div style={css.fieldLabel}><span>System Type</span></div>
                      <input
                        type="text"
                        value={systemType}
                        onChange={e => setSystemType(e.target.value)}
                        placeholder="e.g. Storefront 2×4.5"
                        style={css.numberInput}
                        onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
                        onBlur={e => { e.target.style.borderColor = 'var(--border-subtle, #2d333b)'; }}
                      />
                    </div>
                    <div style={css.field}>
                      <div style={css.fieldLabel}><span>Glass Type / Tag</span></div>
                      <input
                        type="text"
                        value={glassType}
                        onChange={e => setGlassType(e.target.value)}
                        placeholder={'e.g. GL-1 (1" Low-E), Spandrel'}
                        style={{ ...css.numberInput, borderColor: 'rgba(52,211,153,0.35)', color: '#34d399' }}
                        onFocus={e => { e.target.style.borderColor = '#34d399'; }}
                        onBlur={e => { e.target.style.borderColor = 'rgba(52,211,153,0.35)'; }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Frame Dimensions ── always visible */}
                <div>
                  <p style={css.sectionLabel}>Frame Dimensions</p>

                  {/* Shape Mode toggle */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary, #9ea7b3)', marginBottom: 5 }}>Frame Shape</div>
                    <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border-subtle, #2d333b)' }}>
                      {[
                        { id: 'rectangular', label: '▭ Rectangular' },
                        { id: 'raked_head',  label: '◤ Raked Head'  },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => {
                            setShapeMode(opt.id);
                            if (opt.id === 'rectangular') {
                              setLeftLegHeight(overallHeight);
                              setRightLegHeight(overallHeight);
                            }
                          }}
                          style={{
                            flex: 1, padding: '6px 0', border: 'none', cursor: 'pointer',
                            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                            background: shapeMode === opt.id
                              ? (opt.id === 'raked_head' ? 'rgba(249,115,22,0.22)' : 'rgba(37,99,235,0.22)')
                              : 'transparent',
                            color: shapeMode === opt.id
                              ? (opt.id === 'raked_head' ? '#fb923c' : '#60a5fa')
                              : 'var(--text-secondary, #9ea7b3)',
                            borderRight: opt.id === 'rectangular' ? '1px solid var(--border-subtle, #2d333b)' : 'none',
                            transition: 'all 0.15s',
                          }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={css.fieldGroup}>
                    <ArchDimInput
                      label={shapeMode === 'raked_head' ? 'Overall Width' : 'Overall Width'}
                      value={overallWidth}
                      onChange={setOverallWidth}
                      min={1}
                      max={600}
                    />
                    {shapeMode === 'rectangular' ? (
                      <ArchDimInput
                        label="Overall Height"
                        value={overallHeight}
                        onChange={setOverallHeight}
                        min={1}
                        max={360}
                      />
                    ) : (
                      /* Raked Head: two separate leg heights */
                      <>
                        <div style={{
                          padding: '7px 10px',
                          background: 'rgba(249,115,22,0.06)',
                          border: '1px solid rgba(249,115,22,0.25)',
                          borderRadius: 6,
                          fontSize: '0.62rem',
                          color: '#fb923c',
                          fontStyle: 'italic',
                          lineHeight: 1.5,
                        }}>
                          Raked: define left &amp; right leg heights. The bounding-box height auto-adjusts to the tallest leg.
                        </div>
                        <ArchDimInput
                          label="Left Leg Height"
                          value={leftLegHeight}
                          onChange={v => {
                            setLeftLegHeight(v);
                            setOverallHeight(Math.max(v, rightLegHeight));
                          }}
                          min={1}
                          max={360}
                        />
                        <ArchDimInput
                          label="Right Leg Height"
                          value={rightLegHeight}
                          onChange={v => {
                            setRightLegHeight(v);
                            setOverallHeight(Math.max(leftLegHeight, v));
                          }}
                          min={1}
                          max={360}
                        />
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          padding: '5px 10px',
                          background: 'rgba(37,99,235,0.07)',
                          border: '1px solid rgba(37,99,235,0.18)',
                          borderRadius: 6,
                          fontSize: '0.7rem',
                        }}>
                          <span style={{ color: 'var(--text-secondary, #9ea7b3)' }}>Bounding Box H</span>
                          <span style={{ color: '#60a5fa', fontWeight: 700 }}>{Math.max(leftLegHeight, rightLegHeight)}"</span>
                        </div>
                      </>
                    )}
                    <div style={css.field}>
                      <label style={css.fieldLabel}>
                        <span>Quantity</span>
                        <span style={{ ...css.fieldValue, color: quantity > 1 ? '#fbbf24' : '#60a5fa' }}>×{quantity}</span>
                      </label>
                      <input
                        type="number"
                        value={quantity}
                        min={1}
                        max={999}
                        step={1}
                        onChange={e => {
                          const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                          if (typeof onQuantityChange === 'function') onQuantityChange(v);
                        }}
                        style={{
                          ...css.numberInput,
                          borderColor: quantity > 1 ? 'rgba(251,191,36,0.5)' : undefined,
                          color: quantity > 1 ? '#fbbf24' : undefined,
                          fontWeight: quantity > 1 ? 700 : undefined,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Grid Layout + Door ── always visible (primary controls) */}
                <div>
                  <p style={css.sectionLabel}>Grid &amp; Door</p>
                  <div style={css.fieldGroup}>
                    <SliderField
                      label="Number of Bays"
                      value={bays}
                      onChange={v => { setBays(v); onBaysRowsChange?.(v, rows); }}
                      min={1} max={12} step={1}
                    />
                    <SliderField
                      label="Number of Rows"
                      value={rows}
                      onChange={v => { setRows(v); onBaysRowsChange?.(bays, v); }}
                      min={1} max={6} step={1}
                    />
                    <div style={css.field}>
                      <div style={css.fieldLabel}><span>Door Type</span></div>
                      <select
                        value={doorType}
                        onChange={e => setDoorType(e.target.value)}
                        style={{ ...css.numberInput, cursor: 'pointer', appearance: 'auto' }}
                        onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
                        onBlur={e => { e.target.style.borderColor = 'var(--border-subtle, #2d333b)'; }}
                      >
                        <option value="none">None</option>
                        <option value="single">Single 36" &times; 84"</option>
                        <option value="pair">Pair 72" &times; 84"</option>
                      </select>
                    </div>
                    {doorType !== 'none' && (
                      <>
                        <DoorBayInput bays={bays} value={doorBay} onChange={setDoorBay} />
                        {calc.hasTransom ? (
                          <div style={{ fontSize: '0.62rem', color: '#34d399', fontStyle: 'italic',
                            background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)',
                            borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                            Transom: {calc.transomDLOH.toFixed(2)}" DLO<br/>
                            Cut: {calc.transomCutH.toFixed(4)}" H
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.62rem', color: '#f87171', fontStyle: 'italic',
                            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 5, padding: '5px 8px' }}>
                            No transom — door fills to head
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* ── ACCORDION 1: Sightline Overrides ── */}
                <AccordionSection
                  title="Sightline Overrides"
                  open={openSightlines}
                  onToggle={() => setOpenSightlines(v => !v)}
                >
                  <SightlineInput
                    label="Head Sightline"
                    value={headSightline}
                    onChange={setHeadSightline}
                  />
                  <SightlineInput
                    label="Sill Sightline / Base"
                    value={sillSightline}
                    onChange={setSillSightline}
                    highlight={sillSightline > 2}
                  />
                  {sillSightline > 2 && (
                    <div style={{ fontSize: '0.6rem', color: '#f59e0b', marginTop: -4, fontStyle: 'italic', paddingLeft: 2 }}>
                      High base / masonry sill
                    </div>
                  )}
                </AccordionSection>

                {/* ── ACCORDION 2: Bay Horizontals ── */}
                <AccordionSection
                  title="Bay Horizontals"
                  open={openHorizontals}
                  onToggle={() => setOpenHorizontals(v => !v)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Array.from({ length: bays }, (_, bayIdx) => {
                      const isDoorBayHere = doorType !== 'none' && bayIdx === (doorBay - 1);
                      const edges = resolvedEdges(bayIdx);
                      const isCustom = bayHorizontals[bayIdx] !== undefined;
                      return (
                        <div key={bayIdx} style={{
                          border: `1px solid ${isDoorBayHere ? 'rgba(59,130,246,0.35)' : isCustom ? 'rgba(251,191,36,0.35)' : '#2d333b'}`,
                          borderRadius: 6,
                          padding: '6px 8px',
                          background: isDoorBayHere ? 'rgba(59,130,246,0.05)' : isCustom ? 'rgba(251,191,36,0.04)' : 'transparent',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: isDoorBayHere ? '#60a5fa' : isCustom ? '#fcd34d' : '#9ea7b3' }}>
                              Bay {bayIdx + 1}{isDoorBayHere ? ' 🚪' : ''}
                            </span>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {isCustom && !isDoorBayHere && (
                                <button
                                  title="Reset to global rows"
                                  onClick={() => setBayHorizontals(prev => { const n = { ...prev }; delete n[bayIdx]; return n; })}
                                  style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>
                                  ↺
                                </button>
                              )}
                            </div>
                          </div>
                          {isDoorBayHere ? (
                            <div style={{ fontSize: '0.6rem', color: '#60a5fa', fontStyle: 'italic' }}>
                              Door owns the sill — header at {DOOR_HEIGHT}" AFF
                            </div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: edges.length > 0 ? 5 : 0 }}>
                                {edges.map((edge, ei) => (
                                  <span key={ei} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                    padding: '1px 6px', borderRadius: 10,
                                    background: 'rgba(37,99,235,0.12)',
                                    border: '1px solid rgba(37,99,235,0.3)',
                                    fontSize: '0.62rem', color: '#93c5fd', fontWeight: 700,
                                  }}>
                                    {edge.toFixed(2)}"
                                    <button
                                      onClick={() => {
                                        const newEdges = edges.filter((_, i) => i !== ei);
                                        setBayHorizontals(prev => ({ ...prev, [bayIdx]: newEdges }));
                                      }}
                                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontSize: '0.7rem', lineHeight: 1, marginLeft: 1 }}>
                                      ×
                                    </button>
                                  </span>
                                ))}
                                {edges.length === 0 && (
                                  <span style={{ fontSize: '0.6rem', color: '#52525b', fontStyle: 'italic' }}>no horizontals</span>
                                )}
                              </div>
                              <AddHorizontalInput
                                onAdd={(inchVal) => {
                                  const newEdges = [...new Set([...edges, inchVal])].sort((a, b) => a - b);
                                  setBayHorizontals(prev => ({ ...prev, [bayIdx]: newEdges }));
                                }}
                                maxH={overallHeight - headSightline - sillSightline - 0.5}
                              />
                              {/* ── Sill Step-Up control ── */}
                              <div style={{ marginTop: 7, borderTop: '1px solid rgba(45,51,59,0.6)', paddingTop: 7 }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#f97316', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span>▲</span>
                                  <span>Sill Step-Up</span>
                                  {(sillStepUps[bayIdx] ?? 0) > 0 && (
                                    <span style={{ marginLeft: 'auto', color: '#fdba74', fontWeight: 700, fontSize: '0.62rem' }}>
                                      +{sillStepUps[bayIdx]}"
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <input
                                    type="number"
                                    min={0}
                                    max={overallHeight - headSightline - sillSightline - 1}
                                    step={0.5}
                                    placeholder="0"
                                    value={sillStepUps[bayIdx] ?? ''}
                                    onChange={e => {
                                      const v = parseFloat(e.target.value);
                                      setSillStepUps(prev => {
                                        if (isNaN(v) || v <= 0) {
                                          const next = { ...prev };
                                          delete next[bayIdx];
                                          return next;
                                        }
                                        return { ...prev, [bayIdx]: +v.toFixed(2) };
                                      });
                                    }}
                                    style={{
                                      flex: 1, padding: '4px 6px',
                                      backgroundColor: '#1c2128',
                                      border: '1px solid rgba(249,115,22,0.3)',
                                      borderRadius: 5,
                                      color: '#fdba74',
                                      fontSize: '0.75rem',
                                      outline: 'none',
                                      boxSizing: 'border-box',
                                    }}
                                    onFocus={e => { e.target.style.borderColor = '#f97316'; }}
                                    onBlur={e => { e.target.style.borderColor = 'rgba(249,115,22,0.3)'; }}
                                  />
                                  <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>in"</span>
                                  {(sillStepUps[bayIdx] ?? 0) > 0 && (
                                    <button
                                      title="Remove step-up"
                                      onClick={() => setSillStepUps(prev => { const n = { ...prev }; delete n[bayIdx]; return n; })}
                                      style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 4, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>
                                      ↺
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </AccordionSection>

                {/* ── ACCORDION 3: System Geometry ── */}
                <AccordionSection
                  title="System Geometry"
                  open={openGeometry}
                  onToggle={() => setOpenGeometry(v => !v)}
                >
                  {/* Active System badge */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 2,
                    padding: '6px 8px',
                    background: 'rgba(96,165,250,0.08)',
                    border: '1px solid rgba(96,165,250,0.22)',
                    borderRadius: 6,
                  }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#60a5fa',
                      textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active System</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#e6edf3' }}>
                      {systemProfile?.name ?? 'Storefront'}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: '#9ea7b3' }}>
                      Fab {systemProfile?.labor?.fabLFPerHour ?? 12} LF/hr &middot; Install {systemProfile?.labor?.installSqFtPerHour ?? 25} SF/hr
                    </div>
                  </div>

                  {/* Vendor Preset dropdown */}
                  {geoCatalog && (
                    <div style={css.field}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary, #9ea7b3)', marginBottom: 3 }}>Vendor / Series Preset</div>
                      <select
                        value={selectedPreset}
                        onChange={e => {
                          const key = e.target.value;
                          setSelectedPreset(key);
                          if (key === '__default__') {
                            setActiveGeometry({ ...geoCatalog.default });
                          } else {
                            const preset = geoCatalog.presets.find(p => p.name === key);
                            if (preset) setActiveGeometry({ sightline: preset.sightline, hSightline: preset.hSightline, bite: preset.bite, hBite: preset.hBite });
                          }
                          setGeoOverride(false);
                        }}
                        style={{
                          ...css.numberInput,
                          fontSize: '0.72rem',
                          padding: '6px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="__default__">Industry Standard (Default)</option>
                        {geoCatalog.presets.map(p => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Live geometry summary pills */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {[['SL', sysSL + '"'], ['H-SL', activeGeometry.hSightline + '"'], ['Bite', sysBite + '"'], ['H-Bite', activeGeometry.hBite + '"']].map(([k, v]) => (
                      <div key={k} style={{
                        display: 'flex', gap: 3, alignItems: 'center',
                        padding: '2px 7px',
                        background: geoOverride ? 'rgba(251,191,36,0.1)' : 'rgba(37,99,235,0.07)',
                        border: `1px solid ${geoOverride ? 'rgba(251,191,36,0.3)' : 'rgba(37,99,235,0.2)'}`,
                        borderRadius: 12, fontSize: '0.62rem', fontWeight: 700,
                      }}>
                        <span style={{ color: 'var(--text-secondary, #9ea7b3)' }}>{k}</span>
                        <span style={{ color: geoOverride ? '#fcd34d' : '#60a5fa' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Custom Override toggle */}
                  <button
                    onClick={() => setGeoOverride(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '6px 10px',
                      background: geoOverride ? 'rgba(251,191,36,0.12)' : 'rgba(45,51,59,0.4)',
                      border: `1px solid ${geoOverride ? 'rgba(251,191,36,0.45)' : '#2d333b'}`,
                      borderRadius: 6, cursor: 'pointer',
                      fontSize: '0.67rem', fontWeight: 700,
                      color: geoOverride ? '#fcd34d' : '#9ea7b3',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>Custom Override</span>
                    <span style={{
                      width: 28, height: 14, borderRadius: 7, position: 'relative', flexShrink: 0,
                      background: geoOverride ? '#f59e0b' : '#374151',
                      transition: 'background 0.15s',
                      display: 'inline-block',
                    }}>
                      <span style={{
                        position: 'absolute', top: 2, left: geoOverride ? 14 : 2,
                        width: 10, height: 10, borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.15s',
                      }} />
                    </span>
                  </button>

                  {/* Override inputs — only visible when toggle is ON */}
                  {geoOverride && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6,
                      padding: '10px', background: 'rgba(251,191,36,0.05)',
                      border: '1px solid rgba(251,191,36,0.2)', borderRadius: 7 }}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#f59e0b',
                        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Custom Geometry</div>
                      {[
                        ['V Sightline (mullion)',  'sightline'],
                        ['H Sightline (rail)',     'hSightline'],
                        ['V Glass Bite',           'bite'],
                        ['H Glass Bite',           'hBite'],
                      ].map(([label, key]) => (
                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ fontSize: '0.62rem', color: '#9ea7b3', fontWeight: 600 }}>{label}</div>
                          <input
                            type="number" min={0.125} max={12} step={0.0625}
                            value={activeGeometry[key]}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v)) setActiveGeometry(prev => ({ ...prev, [key]: v }));
                            }}
                            style={{ ...css.numberInput, borderColor: 'rgba(245,158,11,0.4)', color: '#fcd34d', fontSize: '0.8rem', padding: '5px 8px' }}
                            onFocus={e => { e.target.style.borderColor = '#f59e0b'; e.target.select(); }}
                            onBlur={e => { e.target.style.borderColor = 'rgba(245,158,11,0.4)'; }}
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          setSelectedPreset('__custom__');
                        }}
                        style={{
                          marginTop: 4, padding: '6px 0',
                          background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.45)',
                          borderRadius: 6, color: '#fcd34d', fontSize: '0.68rem', fontWeight: 700,
                          cursor: 'pointer', width: '100%',
                        }}
                      >
                        ✓ Set as Project Spec
                      </button>
                    </div>
                  )}

                  {/* Structure constants */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
                    <div style={css.constRow}>
                      <span style={css.constKey}>Door Height</span>
                      <span style={css.constVal}>{DOOR_HEIGHT}" (fixed)</span>
                    </div>
                    <div style={css.constRow}>
                      <span style={css.constKey}>Verticals</span>
                      <span style={css.constVal}>{calc.verticalsCount} members</span>
                    </div>
                    <div style={css.constRow}>
                      <span style={css.constKey}>Horizontals</span>
                      <span style={css.constVal}>{calc.horizontalsCount} members</span>
                    </div>
                  </div>
                </AccordionSection>

              </>
            )}

            {/* ══════════════ CALCULATIONS TAB ══════════════ */}
            {sidebarTab === 'calc' && (
              <>

                {/* Glass DLOs */}
                <div style={css.bomCard}>
                  <div style={css.bomCardHeader}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <path d="M3 3h18v18H3z"/>
                    </svg>
                    Glass Daylight Openings
                  </div>
                  <BomRow label="Head Sightline"  value={`${headSightline}"`} />
                  <BomRow label="Sill / Base"     value={`${sillSightline}"`} accent={sillSightline > 2} />
                  {!calc.unequalBays
                    ? <BomRow label="DLO Width" value={`${calc.dloWidth.toFixed(4)}"`} />
                    : <BomRow label="DLO Widths" value={calc.perBayGlass.map((b, i) => `B${i+1}: ${b.dloW.toFixed(2)}"`).join('  ')} accent />
                  }
                  <BomRow label="DLO Height" value={`${calc.dloHeight.toFixed(4)}"`} />
                  <BomRow label="Std Lites"       value={`${calc.stdGlassLites}${quantity > 1 ? ` ×${quantity} = ${calc.stdGlassLites * quantity}` : ''}`} />
                  {calc.hasDoor && (
                    <BomRow label="Door Bay" value={`Bay ${calc.safeDoorBay} — ${doorType === 'pair' ? 'Pair' : 'Single'}`} accent />
                  )}
                  <BomRow
                    label={quantity > 1 ? `Total Lites (×${quantity})` : 'Total Lites'}
                    value={`${calc.adjustedTotalLites * quantity}${calc.hasTransom ? ' (incl. transom)' : ''}`}
                    highlight
                  />
                </div>

                {/* Glass cut sizes */}
                <div style={css.bomCard}>
                  <div style={css.bomCardHeader}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    Glass Cut Sizes
                  </div>
                  <BomRow label="Cut Width"     value={`${calc.glassCutWidth.toFixed(4)}"`}  />
                  <BomRow label="Cut Height"    value={`${calc.glassCutHeight.toFixed(4)}"`} />
                  <BomRow label="Sq Ft / Lite"  value={`${calc.sqFtPerLite.toFixed(2)} ft²`}      />
                  {calc.hasTransom && (
                    <>
                      <BomRow label="─ Transom Cut Width"  value={`${calc.transomCutW.toFixed(4)}"`} accent />
                      <BomRow label="─ Transom Cut Height" value={`${calc.transomCutH.toFixed(4)}"`} accent />
                      <BomRow label="─ Transom Sq Ft"      value={`${calc.transomSqFt.toFixed(2)} ft²`}  accent />
                    </>
                  )}
                  <BomRow
                    label={quantity > 1 ? `Total Glass Sq Ft (×${quantity})` : 'Total Glass Sq Ft'}
                    value={`${(calc.adjustedTotalGlassSqFt * quantity).toFixed(2)} ft²${quantity > 1 ? ` (${calc.adjustedTotalGlassSqFt.toFixed(2)} each)` : ''}`}
                    accent highlight
                  />
                </div>

                {/* Door Configuration */}
                {calc.hasDoor && (
                  <div style={{ ...css.bomCard, border: '1px solid rgba(59,130,246,0.3)' }}>
                    <div style={{ ...css.bomCardHeader, background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3h18v18H3z"/><line x1="12" y1="3" x2="12" y2="21"/>
                      </svg>
                      Door Configuration
                    </div>
                    <BomRow label="Type"        value={doorType === 'pair' ? 'Pair 72×84"' : 'Single 36×84"'} />
                    <BomRow label="Location"    value={`Bay ${calc.safeDoorBay}`} />
                    <BomRow label="Door Height" value={`${DOOR_HEIGHT}"`} />
                    <BomRow label="Leaves"      value={`${calc.doorLeavesQty}`} />
                    {calc.hasTransom ? (
                      <BomRow
                        label="Transom DLO Height"
                        value={`${calc.transomDLOH.toFixed(2)}"`}
                        accent
                      />
                    ) : (
                      <BomRow label="Transom" value="None (door fills to head)" />
                    )}
                    <div style={{ padding: '7px 12px 8px', fontSize: '0.62rem', color: 'var(--text-secondary, #9ea7b3)', fontStyle: 'italic' }}>
                      {calc.doorLeavesQty === 2
                        ? 'Pair: 2 door leafs + 3-pt lock + overhead closers'
                        : 'Single: door leaf + latch set + overhead closer'}
                    </div>
                  </div>
                )}

                {/* Aluminum LF */}
                <div style={css.bomCard}>
                  <div style={css.bomCardHeader}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <line x1="12" y1="5" x2="12" y2="19"/>
                    </svg>
                    Aluminum Linear Footage
                  </div>
                  <BomRow label="Vertical Members"   value={`${calc.verticalsCount} × ${overallHeight}"`}  />
                  <BomRow label="Vertical LF"        value={`${calc.totalVerticalLF.toFixed(2)} LF`}            />
                  <BomRow label="Horizontal Members" value={`${calc.horizontalsCount} × ${overallWidth}"`} />
                  <BomRow label="Horizontal LF"      value={`${calc.totalHorizontalLF.toFixed(2)} LF`}          />
                  <BomRow
                    label={quantity > 1 ? `Total Aluminum LF (×${quantity})` : 'Total Aluminum LF'}
                    value={`${(calc.totalAluminumLF * quantity).toFixed(2)} LF${quantity > 1 ? ` (${calc.totalAluminumLF.toFixed(2)} each)` : ''}`}
                    accent highlight
                  />
                </div>

                {/* Fabrication Cut List */}
                <div style={css.bomCard}>
                  <div style={css.bomCardHeader}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    Fabrication Cut List
                  </div>
                  {/* Verticals */}
                  <div style={{ ...css.bomRow, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ ...css.bomKey, color: '#93c5fd', fontWeight: 700 }}>Vertical</span>
                      <span style={css.bomVal}>Qty: {calc.verticalsCount * quantity}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ ...css.bomKey, fontSize: '0.7rem' }}>Length each</span>
                      <span style={{ ...css.bomVal, color: '#e2e8f0' }}>{overallHeight}" (full height)</span>
                    </div>
                  </div>
                  {/* Horizontals */}
                  <div style={{ ...css.bomRow, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ ...css.bomKey, color: '#86efac', fontWeight: 700 }}>Horizontal</span>
                      <span style={css.bomVal}>Qty: {calc.horizontalsCount * bays * quantity}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ ...css.bomKey, fontSize: '0.7rem' }}>Length each</span>
                      <span style={{ ...css.bomVal, color: '#e2e8f0' }}>{calc.glassCutWidth.toFixed(4)}"</span>
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary, #9ea7b3)', fontStyle: 'italic', marginTop: 1 }}>
                      DLO + 2&times; glass bite &mdash; pocket-to-pocket
                    </div>
                  </div>
                  {/* Door cut items */}
                  {calc.hasDoor && (
                    <>
                      <div style={{ ...css.bomRow, flexDirection: 'column', alignItems: 'flex-start', gap: 2, background: 'rgba(239,68,68,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ ...css.bomKey, color: '#f87171', fontWeight: 700, textDecoration: 'line-through' }}>Sill (Bay {calc.safeDoorBay})</span>
                          <span style={{ ...css.bomVal, color: '#fca5a5' }}>− 1 pc</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ ...css.bomKey, fontSize: '0.7rem' }}>Length removed</span>
                          <span style={{ ...css.bomVal, color: '#fca5a5' }}>{calc.glassCutWidth.toFixed(4)}"</span>
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#f87171', fontStyle: 'italic', marginTop: 1, opacity: 0.7 }}>Threshold replaces sill extrusion</div>
                      </div>
                      <div style={{ ...css.bomRow, flexDirection: 'column', alignItems: 'flex-start', gap: 2, background: 'rgba(59,130,246,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ ...css.bomKey, color: '#60a5fa', fontWeight: 700 }}>Door Header</span>
                          <span style={css.bomVal}>Qty: 1</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ ...css.bomKey, fontSize: '0.7rem' }}>Length @ {DOOR_HEIGHT}" from floor</span>
                          <span style={{ ...css.bomVal, color: '#e2e8f0' }}>{calc.glassCutWidth.toFixed(4)}"</span>
                        </div>
                      </div>
                      <div style={{ ...css.bomRow, flexDirection: 'column', alignItems: 'flex-start', gap: 2, background: 'rgba(251,191,36,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ ...css.bomKey, color: '#fbbf24', fontWeight: 700 }}>Door Hardware</span>
                          <span style={css.bomVal}>Allowance</span>
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary, #9ea7b3)', fontStyle: 'italic', marginTop: 1 }}>
                          {calc.doorLeavesQty === 2 ? 'Pair: 2 leafs + 3-pt lock + closers' : 'Single: leaf + latch + closer'}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Labor Hours */}
                <div style={{ ...css.bomCard, border: '1px solid rgba(52,211,153,0.25)' }}>
                  <div style={{ ...css.bomCardHeader, background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Labor Hours — {systemProfile?.name ?? 'Storefront'}
                  </div>
                  <BomRow
                    label={`Shop Fab (${systemProfile?.labor?.fabLFPerHour ?? 12} LF/hr)`}
                    value={`${(calc.shopHours * quantity).toFixed(2)} hrs${quantity > 1 ? ` (${calc.shopHours.toFixed(2)} ea)` : ''}`}
                  />
                  <BomRow
                    label={`Field Install (${systemProfile?.labor?.installSqFtPerHour ?? 25} ft²/hr)`}
                    value={`${(calc.fieldHours * quantity).toFixed(2)} hrs${quantity > 1 ? ` (${calc.fieldHours.toFixed(2)} ea)` : ''}`}
                  />
                  <BomRow
                    label={quantity > 1 ? `Total Labor (×${quantity})` : 'Total Labor'}
                    value={`${((calc.shopHours + calc.fieldHours) * quantity).toFixed(2)} hrs`}
                    accent highlight
                  />
                </div>

              </>
            )}

          </div>{/* end sidebarScroll */}

          {/* ── STICKY SAVE FOOTER — always visible regardless of active tab ── */}
          <div style={css.saveFooter}>
            {saved ? (
              <div style={css.savedFlash}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Saved to Bid!
              </div>
            ) : (
              <button
                style={css.saveBtn}
                onClick={handleSave}
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'none'; }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                Save Frame to Bid
              </button>
            )}
          </div>

        </div>{/* end unified sidebar */}

      </div>
    </div>
  );
}
