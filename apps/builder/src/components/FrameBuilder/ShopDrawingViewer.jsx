import React, { useRef, useMemo, useState } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';
import useAllGlassStore from '../../store/useAllGlassStore';

/**
 * ShopDrawingViewer — Professional shop drawing elevation viewer
 *
 * Renders per-frame and all-glass wall elevations as SVG.
 * Left panel: drawing list (Framed Systems + All-Glass Walls)
 * Right panel: SVG drawing area with scale controls and export options
 */

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Convert inches to feet-inches format: 72 → "6'-0""
 * Supports fractional inches: 72.5 → "6'-0 1/2""
 */
function fmtIn(inches) {
  if (inches === 0) return "0\"";
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  const wholeInches = Math.floor(remainder);
  const fraction = remainder - wholeInches;

  let result = '';
  if (feet > 0) {
    result += `${feet}'`;
  }

  if (wholeInches > 0 || fraction > 0) {
    if (feet > 0) result += '-';
    result += wholeInches;
    if (fraction > 0.01) {
      const frac = Math.round(fraction * 8) / 8;
      if (frac === 0.5) result += ' 1/2';
      else if (frac === 0.25) result += ' 1/4';
      else if (frac === 0.75) result += ' 3/4';
      else if (frac === 0.125) result += ' 1/8';
      else if (frac === 0.375) result += ' 3/8';
      else if (frac === 0.625) result += ' 5/8';
      else if (frac === 0.875) result += ' 7/8';
    }
    result += '"';
  } else if (feet > 0) {
    result += '"';
  }

  return result;
}

/**
 * Draw an architectural dimension line: line + ticks + text
 */
function DimensionLine({
  x1,
  y1,
  x2,
  y2,
  text,
  offset = 20,
  horizontal = true,
}) {
  const tickLen = 6;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  if (horizontal) {
    // Horizontal dimension line below (y2 > y1)
    return (
      <>
        <line x1={x1} y1={y1 + offset} x2={x2} y2={y2 + offset} stroke="#9ca3af" strokeWidth="0.5" />
        <line x1={x1} y1={y1} x2={x1} y2={y1 + offset} stroke="#9ca3af" strokeWidth="0.5" />
        <line x1={x2} y1={y2} x2={x2} y2={y2 + offset} stroke="#9ca3af" strokeWidth="0.5" />
        <text
          x={midX}
          y={y1 + offset + 12}
          textAnchor="middle"
          fontSize="10"
          fill="#374151"
          fontFamily="monospace"
        >
          {text}
        </text>
      </>
    );
  } else {
    // Vertical dimension line to the right (x2 > x1)
    return (
      <>
        <line x1={x1 + offset} y1={y1} x2={x2 + offset} y2={y2} stroke="#9ca3af" strokeWidth="0.5" />
        <line x1={x1} y1={y1} x2={x1 + offset} y2={y1} stroke="#9ca3af" strokeWidth="0.5" />
        <line x1={x2} y1={y2} x2={x2 + offset} y2={y2} stroke="#9ca3af" strokeWidth="0.5" />
        <text
          x={x1 + offset + 12}
          y={midY}
          textAnchor="start"
          fontSize="10"
          fill="#374151"
          fontFamily="monospace"
          dominantBaseline="middle"
        >
          {text}
        </text>
      </>
    );
  }
}

/**
 * Render a framed system (multi-bay, multi-row) elevation
 */
function FramedSystemElevation({ frame, pxPerInch, svgWidth, svgHeight }) {
  const scaledW = frame.widthInches * pxPerInch;
  const scaledH = frame.heightInches * pxPerInch;

  const bays = frame.bays || 1;
  const rows = frame.rows || 1;
  const bayW = frame.widthInches / bays;
  const rowH = frame.heightInches / rows;

  // SVG origin: top-left. Frame origin: 40px margin from top-left
  const frameX = 40;
  const frameY = 40;
  const titleBlockH = 60;

  // Compute light geometry (3px inset from mullion lines)
  const inset = 3;

  // Generate lites
  const lites = [];
  let liteNum = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < bays; c++) {
      lites.push({
        number: liteNum,
        column: c,
        row: r,
        x: frameX + (c * bayW * pxPerInch) + inset,
        y: frameY + (r * rowH * pxPerInch) + inset,
        w: (bayW * pxPerInch) - 2 * inset,
        h: (rowH * pxPerInch) - 2 * inset,
        widthInches: bayW,
        heightInches: rowH,
      });
      liteNum++;
    }
  }

  // Check for door bays
  const isDoorBay = (bayIdx) => {
    const bayConfig = frame.bayConfigs?.[bayIdx];
    return bayConfig?.type === 'door';
  };

  return (
    <g>
      {/* Frame outline */}
      <rect
        x={frameX}
        y={frameY}
        width={scaledW}
        height={scaledH}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="2"
      />

      {/* Sill line (hatched) */}
      <line x1={frameX} y1={frameY + scaledH} x2={frameX + scaledW} y2={frameY + scaledH} stroke="#1a1a1a" strokeWidth="1.5" />
      <line x1={frameX + 4} y1={frameY + scaledH + 4} x2={frameX + scaledW - 4} y2={frameY + scaledH + 4} stroke="#9ca3af" strokeWidth="0.5" />

      {/* Vertical mullions (divide bays) */}
      {Array.from({ length: bays - 1 }, (_, i) => {
        const x = frameX + (i + 1) * (bayW * pxPerInch);
        return (
          <line key={`mullion-v-${i}`} x1={x} y1={frameY} x2={x} y2={frameY + scaledH} stroke="#1a1a1a" strokeWidth="2" />
        );
      })}

      {/* Horizontal rails (divide rows) */}
      {Array.from({ length: rows - 1 }, (_, i) => {
        const y = frameY + (i + 1) * (rowH * pxPerInch);
        return (
          <line key={`rail-h-${i}`} x1={frameX} y1={y} x2={frameX + scaledW} y2={y} stroke="#1a1a1a" strokeWidth="1.5" />
        );
      })}

      {/* Glass lites */}
      {lites.map((lite) => {
        const isDoor = isDoorBay(lite.column);
        return (
          <g key={`lite-${lite.number}`}>
            {/* Lite fill */}
            <rect
              x={lite.x}
              y={lite.y}
              width={lite.w}
              height={lite.h}
              fill={isDoor ? '#e8e8e8' : '#dbeafe'}
              stroke="none"
            />

            {/* Glass hatch (diagonal lines) */}
            {!isDoor && (
              <>
                <line
                  x1={lite.x}
                  y1={lite.y}
                  x2={lite.x + lite.w}
                  y2={lite.y + lite.h}
                  stroke="#0ea5e9"
                  strokeWidth="0.8"
                  opacity="0.4"
                />
                <line
                  x1={lite.x + lite.w}
                  y1={lite.y}
                  x2={lite.x}
                  y2={lite.y + lite.h}
                  stroke="#0ea5e9"
                  strokeWidth="0.8"
                  opacity="0.4"
                />
              </>
            )}

            {/* Door arc (if door bay) */}
            {isDoor && (
              <>
                <path
                  d={`M ${lite.x + lite.w * 0.8} ${lite.y + lite.h} A ${lite.w * 0.3} ${lite.h * 0.3} 0 0 1 ${lite.x + lite.w} ${lite.y + lite.h * 0.7}`}
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="1"
                />
                <line x1={lite.x} y1={lite.y + lite.h} x2={lite.x + lite.w} y2={lite.y + lite.h} stroke="#6b7280" strokeWidth="1" />
                <text
                  x={lite.x + lite.w / 2}
                  y={lite.y + lite.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9"
                  fill="#6b7280"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                >
                  DOOR
                </text>
              </>
            )}

            {/* Lite number */}
            <text
              x={lite.x + lite.w / 2}
              y={lite.y + lite.h / 2 - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#1f2937"
              fontFamily="sans-serif"
              fontWeight="500"
            >
              L-{lite.number}
            </text>

            {/* Lite dimensions */}
            <text
              x={lite.x + lite.w / 2}
              y={lite.y + lite.h / 2 + 8}
              textAnchor="middle"
              fontSize="8"
              fill="#6b7280"
              fontFamily="monospace"
            >
              {fmtIn(lite.widthInches)} × {fmtIn(lite.heightInches)}
            </text>
          </g>
        );
      })}

      {/* Bay width dimensions (below frame) */}
      {bays > 1 && Array.from({ length: bays }, (_, i) => {
        const x1 = frameX + i * (bayW * pxPerInch);
        const x2 = x1 + (bayW * pxPerInch);
        const y = frameY + scaledH + 8;
        return (
          <DimensionLine
            key={`bay-dim-${i}`}
            x1={x1}
            y1={y}
            x2={x2}
            y2={y}
            text={fmtIn(bayW)}
            offset={0}
            horizontal={true}
          />
        );
      })}

      {/* Row height dimensions (right side) */}
      {rows > 1 && Array.from({ length: rows }, (_, i) => {
        const y1 = frameY + i * (rowH * pxPerInch);
        const y2 = y1 + (rowH * pxPerInch);
        const x = frameX + scaledW + 8;
        return (
          <DimensionLine
            key={`row-dim-${i}`}
            x1={x}
            y1={y1}
            x2={x}
            y2={y2}
            text={fmtIn(rowH)}
            offset={0}
            horizontal={false}
          />
        );
      })}

      {/* Overall width dimension (above) */}
      <DimensionLine
        x1={frameX}
        y1={frameY - 20}
        x2={frameX + scaledW}
        y2={frameY - 20}
        text={fmtIn(frame.widthInches)}
        offset={-15}
        horizontal={true}
      />

      {/* Overall height dimension (right) */}
      <DimensionLine
        x1={frameX + scaledW + 30}
        y1={frameY}
        x2={frameX + scaledW + 30}
        y2={frameY + scaledH}
        text={fmtIn(frame.heightInches)}
        offset={0}
        horizontal={false}
      />

      {/* North arrow (top-right) */}
      <g transform={`translate(${frameX + scaledW - 30}, ${frameY + 20})`}>
        <circle cx="0" cy="0" r="8" fill="none" stroke="#9ca3af" strokeWidth="0.5" />
        <line x1="0" y1="-6" x2="0" y2="6" stroke="#9ca3af" strokeWidth="1" />
        <line x1="0" y1="-6" x2="-3" y2="0" stroke="#9ca3af" strokeWidth="1" />
        <line x1="0" y1="-6" x2="3" y2="0" stroke="#9ca3af" strokeWidth="1" />
        <text x="0" y="12" textAnchor="middle" fontSize="9" fill="#6b7280">
          N
        </text>
      </g>

      {/* Revision block (top-right) */}
      <g transform={`translate(${frameX + scaledW - 120}, ${frameY})`}>
        <rect x="0" y="0" width="110" height="30" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
        <line x1="20" y1="0" x2="20" y2="30" stroke="#d1d5db" strokeWidth="0.5" />
        <line x1="45" y1="0" x2="45" y2="30" stroke="#d1d5db" strokeWidth="0.5" />
        <line x1="65" y1="0" x2="65" y2="30" stroke="#d1d5db" strokeWidth="0.5" />
        <line x1="0" y1="10" x2="110" y2="10" stroke="#d1d5db" strokeWidth="0.5" />
        <line x1="0" y1="20" x2="110" y2="20" stroke="#d1d5db" strokeWidth="0.5" />

        <text x="10" y="6" textAnchor="middle" fontSize="7" fill="#6b7280" fontWeight="bold">
          REV
        </text>
        <text x="32" y="6" textAnchor="middle" fontSize="7" fill="#6b7280" fontWeight="bold">
          DATE
        </text>
        <text x="55" y="6" textAnchor="middle" fontSize="7" fill="#6b7280" fontWeight="bold">
          BY
        </text>
        <text x="87" y="6" textAnchor="middle" fontSize="7" fill="#6b7280" fontWeight="bold">
          DESC
        </text>

        <text x="10" y="17" textAnchor="middle" fontSize="7" fill="#6b7280">
          -
        </text>
        <text x="32" y="17" textAnchor="middle" fontSize="7" fill="#6b7280">
          -
        </text>
        <text x="55" y="17" textAnchor="middle" fontSize="7" fill="#6b7280">
          -
        </text>
        <text x="80" y="17" textAnchor="middle" fontSize="7" fill="#6b7280">
          Initial
        </text>
      </g>
    </g>
  );
}

/**
 * Render an all-glass wall elevation
 */
function AllGlassWallElevation({ wall, pxPerInch, svgWidth, svgHeight }) {
  const scaledW = wall.totalRunInches * pxPerInch;
  const scaledH = wall.heightInches * pxPerInch;

  const frameX = 40;
  const frameY = 40;

  const panels = wall.layout?.panels || [];

  // Compute panel positions
  const panelElements = [];
  let panelNum = 1;
  let xPos = frameX;

  panels.forEach((panel) => {
    const panelW = panel.widthInches * pxPerInch;
    const isDoor = panel.isDoor || false;

    panelElements.push({
      number: panelNum,
      x: xPos,
      y: frameY,
      w: panelW,
      h: scaledH,
      widthInches: panel.widthInches,
      isDoor,
    });

    xPos += panelW;
    panelNum++;
  });

  return (
    <g>
      {/* Overall outline */}
      <rect x={frameX} y={frameY} width={scaledW} height={scaledH} fill="none" stroke="#1a1a1a" strokeWidth="2" />

      {/* Base shoe line */}
      <line x1={frameX} y1={frameY + scaledH} x2={frameX + scaledW} y2={frameY + scaledH} stroke="#1a1a1a" strokeWidth="1" />

      {/* Cap rail (double line) */}
      <line x1={frameX} y1={frameY} x2={frameX + scaledW} y2={frameY} stroke="#1a1a1a" strokeWidth="1.5" />
      <line
        x1={frameX}
        y1={frameY - 2}
        x2={frameX + scaledW}
        y2={frameY - 2}
        stroke="#1a1a1a"
        strokeWidth="0.5"
      />

      {/* Panels */}
      {panelElements.map((panel) => (
        <g key={`panel-${panel.number}`}>
          {/* Panel fill */}
          <rect
            x={panel.x}
            y={panel.y}
            width={panel.w}
            height={panel.h}
            fill={panel.isDoor ? '#e8e8e8' : '#dbeafe'}
            stroke="none"
          />

          {/* Glass hatch */}
          {!panel.isDoor && (
            <>
              <line
                x1={panel.x}
                y1={panel.y}
                x2={panel.x + panel.w}
                y2={panel.y + panel.h}
                stroke="#0ea5e9"
                strokeWidth="0.8"
                opacity="0.4"
              />
              <line
                x1={panel.x + panel.w}
                y1={panel.y}
                x2={panel.x}
                y2={panel.y + panel.h}
                stroke="#0ea5e9"
                strokeWidth="0.8"
                opacity="0.4"
              />
            </>
          )}

          {/* Door arc */}
          {panel.isDoor && (
            <>
              <path
                d={`M ${panel.x + panel.w * 0.8} ${panel.y + panel.h} A ${panel.w * 0.3} ${panel.h * 0.3} 0 0 1 ${panel.x + panel.w} ${panel.y + panel.h * 0.7}`}
                fill="none"
                stroke="#6b7280"
                strokeWidth="1"
              />
              <line x1={panel.x} y1={panel.y + panel.h} x2={panel.x + panel.w} y2={panel.y + panel.h} stroke="#6b7280" strokeWidth="1" />
              <text
                x={panel.x + panel.w / 2}
                y={panel.y + panel.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9"
                fill="#6b7280"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                DOOR
              </text>
            </>
          )}

          {/* Panel number */}
          <text
            x={panel.x + panel.w / 2}
            y={panel.y + panel.h / 2 - 8}
            textAnchor="middle"
            fontSize="10"
            fill="#1f2937"
            fontFamily="sans-serif"
            fontWeight="500"
          >
            P-{panel.number}
          </text>

          {/* Panel width dimension */}
          <text
            x={panel.x + panel.w / 2}
            y={panel.y + panel.h + 16}
            textAnchor="middle"
            fontSize="8"
            fill="#6b7280"
            fontFamily="monospace"
          >
            {fmtIn(panel.widthInches)}
          </text>
        </g>
      ))}

      {/* Joint lines (vertical lines between panels) */}
      {panelElements.map((panel, i) => {
        if (i === panelElements.length - 1) return null;
        const x = panel.x + panel.w;
        return (
          <line key={`joint-${i}`} x1={x} y1={frameY} x2={x} y2={frameY + scaledH} stroke="#d1d5db" strokeWidth="0.5" strokeDasharray="2,2" />
        );
      })}

      {/* Overall width dimension (above) */}
      <DimensionLine
        x1={frameX}
        y1={frameY - 20}
        x2={frameX + scaledW}
        y2={frameY - 20}
        text={fmtIn(wall.totalRunInches)}
        offset={-15}
        horizontal={true}
      />

      {/* Overall height dimension (right) */}
      <DimensionLine
        x1={frameX + scaledW + 30}
        y1={frameY}
        x2={frameX + scaledW + 30}
        y2={frameY + scaledH}
        text={fmtIn(wall.heightInches)}
        offset={0}
        horizontal={false}
      />

      {/* North arrow */}
      <g transform={`translate(${frameX + scaledW - 30}, ${frameY + 20})`}>
        <circle cx="0" cy="0" r="8" fill="none" stroke="#9ca3af" strokeWidth="0.5" />
        <line x1="0" y1="-6" x2="0" y2="6" stroke="#9ca3af" strokeWidth="1" />
        <line x1="0" y1="-6" x2="-3" y2="0" stroke="#9ca3af" strokeWidth="1" />
        <line x1="0" y1="-6" x2="3" y2="0" stroke="#9ca3af" strokeWidth="1" />
        <text x="0" y="12" textAnchor="middle" fontSize="9" fill="#6b7280">
          N
        </text>
      </g>
    </g>
  );
}

/**
 * Title block for both frame and all-glass elevations
 */
function TitleBlock({ mark, width, height, system = 'N/A', finish = 'N/A', scale }) {
  return (
    <g>
      <rect x="0" y="0" width="100%" height="60" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <line x1="0" y1="30" x2="100%" y2="30" stroke="#d1d5db" strokeWidth="0.5" />

      <text x="10" y="20" fontSize="10" fill="#1f2937" fontFamily="monospace" fontWeight="bold">
        MARK: {mark}
      </text>
      <text x="10" y="45" fontSize="8" fill="#6b7280" fontFamily="monospace">
        W: {fmtIn(width)} | H: {fmtIn(height)} | SYS: {system} | FINISH: {finish} | SCALE: {scale}
      </text>
    </g>
  );
}

/**
 * Main component
 */
export default function ShopDrawingViewer() {
  const { frames } = useFrameBuilderStore();
  const { walls } = useAllGlassStore();

  const [selectedType, setSelectedType] = useState(null); // 'frame' | 'wall'
  const [selectedId, setSelectedId] = useState(null);
  const [scaleMode, setScaleMode] = useState('1:10');
  const svgRef = useRef(null);

  // Compute px per inch based on scale mode
  const scaleFactors = {
    '1:20': 2,
    '1:10': 4,
    '1:5': 8,
  };

  const pxPerInchFixed = scaleFactors[scaleMode] || 4;

  // SVG dimensions (use fixed width, compute height based on content)
  const svgWidth = 1200;
  const svgHeightFixed = 800;

  // Get selected drawing
  const selectedFrame = selectedType === 'frame' && selectedId ? frames.find((f) => f.frameId === selectedId) : null;
  const selectedWall = selectedType === 'wall' && selectedId ? walls.find((w) => w.wallId === selectedId) : null;

  // Compute SVG dimensions based on selected drawing
  const computedSvgHeight = useMemo(() => {
    if (!selectedFrame && !selectedWall) return svgHeightFixed;

    let contentH = 80;
    if (selectedFrame) {
      contentH = 80 + selectedFrame.heightInches * pxPerInchFixed + 100;
    } else if (selectedWall) {
      contentH = 80 + selectedWall.heightInches * pxPerInchFixed + 100;
    }

    return Math.max(svgHeightFixed, contentH);
  }, [selectedFrame, selectedWall, pxPerInchFixed]);

  // Export SVG
  const handleExportSVG = () => {
    if (!svgRef.current) return;

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedFrame?.mark || selectedWall?.mark || 'elevation'}-elevation.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      {/* Left Panel: Drawing List */}
      <div className="w-56 border-r border-zinc-700 overflow-y-auto p-4 space-y-6">
        {/* Framed Systems */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-3">Framed Systems</h3>
          <div className="space-y-1">
            {frames.length === 0 ? (
              <p className="text-xs text-zinc-500">No frames yet</p>
            ) : (
              frames.map((frame) => (
                <button
                  key={frame.frameId}
                  onClick={() => {
                    setSelectedType('frame');
                    setSelectedId(frame.frameId);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm font-mono text-xs transition-colors ${
                    selectedType === 'frame' && selectedId === frame.frameId
                      ? 'bg-blue-900 text-blue-100'
                      : 'hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <div className="font-bold">{frame.mark}</div>
                  <div className="text-xs text-zinc-500">
                    {fmtIn(frame.widthInches)} × {fmtIn(frame.heightInches)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* All-Glass Walls */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-3">All-Glass Walls</h3>
          <div className="space-y-1">
            {walls.length === 0 ? (
              <p className="text-xs text-zinc-500">No walls yet</p>
            ) : (
              walls.map((wall) => (
                <button
                  key={wall.wallId}
                  onClick={() => {
                    setSelectedType('wall');
                    setSelectedId(wall.wallId);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm font-mono text-xs transition-colors ${
                    selectedType === 'wall' && selectedId === wall.wallId
                      ? 'bg-blue-900 text-blue-100'
                      : 'hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <div className="font-bold">{wall.mark}</div>
                  <div className="text-xs text-zinc-500">
                    {fmtIn(wall.totalRunInches)} × {fmtIn(wall.heightInches)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Panel: SVG Drawing Area + Controls */}
      <div className="flex-1 flex flex-col">
        {/* Controls Bar */}
        {(selectedFrame || selectedWall) && (
          <div className="border-b border-zinc-700 bg-zinc-900 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Scale Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-bold">Scale:</span>
                {Object.keys(scaleFactors).map((scale) => (
                  <button
                    key={scale}
                    onClick={() => setScaleMode(scale)}
                    className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                      scaleMode === scale
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {scale}
                  </button>
                ))}
                <button
                  onClick={() => setScaleMode('fit')}
                  className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                    scaleMode === 'fit'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  Fit
                </button>
              </div>

              {/* Drawing Info */}
              <div className="text-xs text-zinc-400 font-mono border-l border-zinc-700 pl-4">
                {selectedFrame ? (
                  <>
                    Mark: <span className="font-bold">{selectedFrame.mark}</span> | {fmtIn(selectedFrame.widthInches)} × {fmtIn(selectedFrame.heightInches)} |{' '}
                    {((selectedFrame.widthInches * selectedFrame.heightInches) / 144).toFixed(1)} SF
                  </>
                ) : selectedWall ? (
                  <>
                    Mark: <span className="font-bold">{selectedWall.mark}</span> | {fmtIn(selectedWall.totalRunInches)} × {fmtIn(selectedWall.heightInches)} |{' '}
                    {((selectedWall.totalRunInches * selectedWall.heightInches) / 144).toFixed(1)} SF
                  </>
                ) : null}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportSVG}
                className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-xs font-bold transition-colors"
              >
                Export SVG
              </button>
              <button
                onClick={handlePrint}
                className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs font-bold transition-colors"
              >
                Print
              </button>
            </div>
          </div>
        )}

        {/* SVG Drawing Area */}
        <div className="flex-1 overflow-auto bg-zinc-800 p-6">
          {!selectedFrame && !selectedWall ? (
            <div className="h-full flex items-center justify-center text-zinc-400 text-center">
              <div>
                <p className="text-lg mb-2">No drawing selected</p>
                <p className="text-sm">Select a frame or all-glass wall from the list to view its shop drawing</p>
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              width={svgWidth}
              height={computedSvgHeight}
              viewBox={`0 0 ${svgWidth} ${computedSvgHeight}`}
              className="mx-auto bg-white rounded shadow-lg"
              style={{ maxWidth: '100%', height: 'auto' }}
            >
              {/* Title Block */}
              <TitleBlock
                mark={selectedFrame?.mark || selectedWall?.mark || 'N/A'}
                width={selectedFrame?.widthInches || selectedWall?.totalRunInches || 0}
                height={selectedFrame?.heightInches || selectedWall?.heightInches || 0}
                system={selectedFrame?.vendorSystemId || 'All-Glass'}
                finish={selectedFrame?.finishType || 'Clear'}
                scale={scaleMode}
              />

              {/* Elevation Drawing */}
              {selectedFrame && (
                <FramedSystemElevation
                  frame={selectedFrame}
                  pxPerInch={pxPerInchFixed}
                  svgWidth={svgWidth}
                  svgHeight={computedSvgHeight}
                />
              )}

              {selectedWall && (
                <AllGlassWallElevation
                  wall={selectedWall}
                  pxPerInch={pxPerInchFixed}
                  svgWidth={svgWidth}
                  svgHeight={computedSvgHeight}
                />
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
