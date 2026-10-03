/**
 * FrameCanvas — interactive SVG elevation of one frame.
 *
 * Draws straight from the engine's solved geometry (inches, y up): outline in
 * metal, DLO polygons as glass, door openings with leaves and swing, member
 * piece breaks (so the estimator SEES which member runs through), joint
 * markers, dimension strings, sill AFF / floor, and the lift line.
 *
 * Tools (props.mode):
 *   select   click a lite / member / door to inspect it; drag empty space to pan
 *   glass    click a lite to paint the active glass type
 *   temper   click a lite to cycle: auto → force tempered → force annealed → auto
 *   splitH   click a lite to add a horizontal in that bay (one more row)
 *   splitV   click a lite to add a vertical through its middle
 *   merge    click a member to remove it (merges the lites on either side)
 *   joint    click a joint to flip which member runs through
 *   lift     click to place the lift line (drag to move it)
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { formatFeetInches, formatInches } from '@glazebid/frame-engine/core';

const METAL = {
  clear: '#b9c0c7', bronze: '#5b4636', black: '#2b2b2e', white: '#e8e8e6', champagne: '#c9b48f', default: '#9aa3ab',
};
export function metalColor(finish = '') {
  const f = finish.toLowerCase();
  if (f.includes('bronze')) return METAL.bronze;
  if (f.includes('black')) return METAL.black;
  if (f.includes('white')) return METAL.white;
  if (f.includes('champagne')) return METAL.champagne;
  if (f.includes('clear') || f.includes('#14') || f.includes('silver')) return METAL.clear;
  return METAL.default;
}

const GLASS_PALETTE = ['#9fd3e6', '#a7e0c4', '#c9b6ea', '#f2c99a', '#f0a8b8', '#b8c8f2', '#d9e59a', '#9ee0dc'];
export function glassColorMap(glassTypes = []) {
  const m = {};
  glassTypes.forEach((g, i) => {
    m[g.id] = g.kind === 'spandrel' ? '#6b7280' : g.kind === 'null' ? '#e5e7eb' : (g.color ?? GLASS_PALETTE[i % GLASS_PALETTE.length]);
  });
  return m;
}

const polyStr = (pts, T) => pts.map(([x, y]) => `${T.x(x)},${T.y(y)}`).join(' ');

export default function FrameCanvas({
  result, glassTypes, mode = 'select', dimMode = 'dlo', selection, onAction, showJoints = false,
  liftLineAFF = null, activeGlassId = null,
}) {
  const svgRef = useRef(null);
  const solved = result?.solved;
  const W = solved?.width ?? 100; const topY = solved?.topY ?? 100;
  const sillAFF = solved?.sillAFF ?? 0;
  const pad = Math.max(W, topY) * 0.16 + 14;
  const floorDrop = sillAFF > 0 ? Math.min(sillAFF, Math.max(W, topY) * 0.25) : 0;
  const base = useMemo(() => ({ x: -pad * 1.35, y: -pad * 0.55, w: W + pad * 2.35, h: topY + pad * 1.55 + floorDrop }), [W, topY, pad, floorDrop]);
  const [view, setView] = useState(base);
  useEffect(() => { setView(base); }, [base.w, base.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // y flip: frame y (up) → svg y (down)
  const T = useMemo(() => ({ x: (x) => x, y: (y) => topY - y }), [topY]);
  const fs = Math.max(W, topY) / 55;          // font size in inches
  const colors = useMemo(() => glassColorMap(glassTypes), [glassTypes]);
  const glassById = useMemo(() => Object.fromEntries((glassTypes ?? []).map((g) => [g.id, g])), [glassTypes]);
  const metal = metalColor(result?.spec?.finish);

  // ── pointer helpers ──
  const toFrame = useCallback((evt) => {
    const svg = svgRef.current; if (!svg) return null;
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: topY - p.y };
  }, [topY]);

  const drag = useRef(null);
  const onWheel = (e) => {
    e.preventDefault();
    const p = toFrame(e); if (!p) return;
    const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const sx = p.x; const sy = topY - p.y;
    setView((v) => ({ x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k, w: v.w * k, h: v.h * k }));
  };
  useEffect(() => {
    const el = svgRef.current; if (!el) return undefined;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const onPointerDown = (e) => {
    if (mode === 'lift') {
      const p = toFrame(e); if (p) { onAction?.({ type: 'liftLine', aff: Math.round((p.y + sillAFF) * 4) / 4 }); drag.current = { lift: true }; }
      return;
    }
    if (e.target === svgRef.current || e.target.dataset?.bg) drag.current = { x: e.clientX, y: e.clientY, view };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    if (drag.current.lift) { const p = toFrame(e); if (p) onAction?.({ type: 'liftLine', aff: Math.round((p.y + sillAFF) * 4) / 4 }); return; }
    const svg = svgRef.current; const ctm = svg.getScreenCTM();
    const dx = (e.clientX - drag.current.x) / ctm.a; const dy = (e.clientY - drag.current.y) / ctm.d;
    setView({ ...drag.current.view, x: drag.current.view.x - dx, y: drag.current.view.y - dy });
  };
  const onPointerUp = () => { drag.current = null; };

  if (!solved) return <div className="fbv1-empty">No frame selected.</div>;

  const glassByKey = Object.fromEntries((result.glass ?? []).map((g) => [g.key, g]));
  const isSel = (type, key) => selection?.type === type && selection?.key === key;

  const clickLite = (l, e) => {
    e.stopPropagation();
    const p = toFrame(e);
    onAction?.({ type: 'lite', key: l.key, lite: l, mode, point: p });
  };
  const clickMember = (m, e) => { e.stopPropagation(); onAction?.({ type: 'member', member: m, mode, point: toFrame(e) }); };
  const clickJoint = (j, e) => { e.stopPropagation(); onAction?.({ type: 'joint', joint: j, mode }); };
  const clickDoor = (d, e) => { e.stopPropagation(); onAction?.({ type: 'door', door: d, mode }); };

  // ── dimension helpers ──
  const dimH = (x0, x1, y, label, key, tick = fs * 0.6) => (
    <g key={key} className="fbv1-dim">
      <line x1={T.x(x0)} y1={T.y(y)} x2={T.x(x1)} y2={T.y(y)} />
      <line x1={T.x(x0)} y1={T.y(y) - tick} x2={T.x(x0)} y2={T.y(y) + tick} />
      <line x1={T.x(x1)} y1={T.y(y) - tick} x2={T.x(x1)} y2={T.y(y) + tick} />
      <text x={T.x((x0 + x1) / 2)} y={T.y(y) - fs * 0.35} fontSize={fs} textAnchor="middle">{label}</text>
    </g>
  );
  const dimV = (y0, y1, x, label, key, tick = fs * 0.6) => (
    <g key={key} className="fbv1-dim">
      <line x1={T.x(x)} y1={T.y(y0)} x2={T.x(x)} y2={T.y(y1)} />
      <line x1={T.x(x) - tick} y1={T.y(y0)} x2={T.x(x) + tick} y2={T.y(y0)} />
      <line x1={T.x(x) - tick} y1={T.y(y1)} x2={T.x(x) + tick} y2={T.y(y1)} />
      <text x={T.x(x) - fs * 0.35} y={T.y((y0 + y1) / 2)} fontSize={fs} textAnchor="middle"
        transform={`rotate(-90 ${T.x(x) - fs * 0.35} ${T.y((y0 + y1) / 2)})`}>{label}</text>
    </g>
  );

  const cols = solved.columns;
  const P = solved.es.profiles;
  const bayDims = [];
  const yB1 = -fs * 2.2 - floorDrop; const yB2 = -fs * 4.6 - floorDrop;
  if (dimMode === 'dlo') {
    cols.forEach((c, i) => bayDims.push(dimH(c.x0, c.x1, yB1, `${formatFeetInches(c.dlo)}${c.eq ? ' EQ' : ''}`, `bd${i}`)));
  } else if (dimMode === 'cl') {
    const xsCL = [0, ...solved.verticals.filter((v) => !v.extra).map((v) => v.x).sort((a, b) => a - b), W];
    for (let i = 0; i < xsCL.length - 1; i++) bayDims.push(dimH(xsCL[i], xsCL[i + 1], yB1, formatFeetInches(xsCL[i + 1] - xsCL[i]), `bc${i}`));
  }
  const selCol = selection?.col ?? (selection?.type === 'lite' ? solved.lites.find((l) => l.key === selection.key)?.col : null) ?? 0;
  const rowDims = [];
  const sc = cols[Math.min(selCol, cols.length - 1)];
  if (sc && dimMode !== 'overall') {
    const lites = solved.lites.filter((l) => l.col === sc.index).sort((a, b) => a.dloBox.y0 - b.dloBox.y0);
    lites.forEach((l, i) => rowDims.push(dimV(l.dloBox.y0, l.dloBox.y1, W + fs * 2.4, `${formatFeetInches(l.dloBox.y1 - l.dloBox.y0)}`, `rd${i}`)));
  }

  // piece outlines (interior members) to show run-through
  const interiorPieces = (result.solved.pieces ?? []).filter((p) => !p.perimeter);
  const perimPieces = (result.solved.pieces ?? []).filter((p) => p.perimeter);
  const liftY = liftLineAFF == null ? null : liftLineAFF - sillAFF;

  return (
    <svg ref={svgRef} className={`fbv1-canvas mode-${mode}`} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
      role="img" aria-label={`Elevation of frame ${result.spec.mark}`}>
      <rect data-bg="1" x={view.x} y={view.y} width={view.w} height={view.h} className="fbv1-bg" />

      {/* floor line */}
      {sillAFF > 0 && (
        <g className="fbv1-floor">
          <line x1={T.x(-pad)} x2={T.x(W + pad)} y1={T.y(-floorDrop)} y2={T.y(-floorDrop)} />
          {dimV(-floorDrop, 0, -fs * 5.2, `${formatFeetInches(sillAFF)} AFF`, 'aff')}
        </g>
      )}

      {/* metal */}
      <polygon points={polyStr(solved.outline.poly, T)} fill={metal} className="fbv1-metal" />

      {/* member piece breaks */}
      {interiorPieces.map((p, i) => {
        const sel = isSel('member', p.member);
        if (p.orient === 'v') {
          return <rect key={`ip${i}`} className={`fbv1-piece ${sel ? 'sel' : ''}`} x={p.x - p.sl / 2} y={T.y(p.y1)} width={p.sl} height={p.y1 - p.y0}
            onClick={(e) => clickMember(p, e)}><title>{`${p.member} · ${p.role} · ${formatInches(p.length)}${p.note ? ` · ${p.note}` : ''}`}</title></rect>;
        }
        return <rect key={`ip${i}`} className={`fbv1-piece ${sel ? 'sel' : ''}`} x={p.x0} y={T.y(p.y + p.sl / 2)} width={p.x1 - p.x0} height={p.sl}
          onClick={(e) => clickMember(p, e)}><title>{`${p.member} · ${p.role} · ${formatInches(p.length)}${p.note ? ` · ${p.note}` : ''}`}</title></rect>;
      })}
      {perimPieces.map((p, i) => {
        // tick marks at both ends of each perimeter piece, across the member
        const d = [p.x1 - p.x0, p.y1 - p.y0]; const L = Math.hypot(d[0], d[1]) || 1;
        const inward = [-d[1] / L, d[0] / L];
        const ticks = [[p.x0, p.y0], [p.x1, p.y1]].map(([x, y], k) => (
          <line key={k} className="fbv1-tick" x1={T.x(x)} y1={T.y(y)} x2={T.x(x + inward[0] * p.sl)} y2={T.y(y + inward[1] * p.sl)} />
        ));
        return <g key={`pp${i}`} onClick={(e) => clickMember(p, e)} className="fbv1-perim">{ticks}<title>{`${p.member} · ${p.role} · ${formatInches(p.length)}${p.note ? ` · ${p.note}` : ''}`}</title></g>;
      })}

      {/* lites */}
      {solved.lites.map((l) => {
        const g = glassByKey[l.key];
        const gt = glassById[g?.glassTypeId];
        const fill = colors[g?.glassTypeId] ?? '#bfe3ee';
        const bb = l.dloBox;
        const cx = (bb.x0 + bb.x1) / 2; const cy = (bb.y0 + bb.y1) / 2;
        const small = Math.min(bb.w, bb.h) < fs * 6;
        return (
          <g key={l.key} className={`fbv1-lite ${isSel('lite', l.key) ? 'sel' : ''}`} onClick={(e) => clickLite(l, e)}>
            <polygon points={polyStr(l.dloPoly, T)} fill={fill} />
            {gt?.kind === 'spandrel' && <polygon points={polyStr(l.dloPoly, T)} className="fbv1-hatch" />}
            {!small && <text x={T.x(cx)} y={T.y(cy) - fs * 0.6} fontSize={fs * 1.15} textAnchor="middle" className="fbv1-tag">{l.tag}</text>}
            <text x={T.x(cx)} y={T.y(cy) + fs * (small ? 0.4 : 0.8)} fontSize={fs * 0.95} textAnchor="middle" className="fbv1-gmark">{g?.glassMark ?? ''}</text>
            {!small && g && <text x={T.x(cx)} y={T.y(cy) + fs * 2.1} fontSize={fs * 0.8} textAnchor="middle" className="fbv1-size">{`${formatInches(g.orderW)} × ${formatInches(g.orderH)}`}</text>}
            {g?.tempered && (
              <g className={`fbv1-temper ${g.temperManual ? 'manual' : ''}`}>
                <circle cx={T.x(bb.x1 - fs * 1.1)} cy={T.y(bb.y0 + fs * 1.1)} r={fs * 0.75} />
                <text x={T.x(bb.x1 - fs * 1.1)} y={T.y(bb.y0 + fs * 1.1) + fs * 0.32} fontSize={fs * 0.9} textAnchor="middle">T</text>
              </g>
            )}
            <title>{`${l.tag} (${l.key}) · DLO ${formatInches(l.dloW)} × ${formatInches(l.dloH)}${g ? ` · glass ${formatInches(g.orderW)} × ${formatInches(g.orderH)} · ${g.glassMark}${g.tempered ? ' tempered' : ''}` : ''}`}</title>
          </g>
        );
      })}

      {/* doors */}
      {(result.doors ?? []).map((d) => {
        const sd = solved.doors.find((x) => x.col === d.col);
        if (!sd) return null;
        const geo = d.geometry;
        const leaves = [];
        const lw = geo.leafW; const lh = geo.leafH;
        for (let k = 0; k < geo.leaves; k++) {
          const x0 = sd.x0 + 0.125 + k * (lw + 0.125); const y0 = 0.5;
          const hingeLeft = geo.leaves === 2 ? k === 0 : (d.handing ?? 'RH').startsWith('L');
          leaves.push(
            <g key={k}>
              <rect className="fbv1-leaf" x={x0} y={T.y(y0 + lh)} width={lw} height={lh} />
              <rect className="fbv1-leafglass" x={x0 + geo.stile} y={T.y(y0 + lh - geo.topRail)} width={Math.max(0, lw - 2 * geo.stile)} height={Math.max(0, lh - geo.topRail - geo.bottomRail)} />
              {geo.midRail > 0 && <rect className="fbv1-leaf" x={x0 + geo.stile} y={T.y(y0 + geo.midRailAt + geo.midRail / 2)} width={lw - 2 * geo.stile} height={geo.midRail} />}
              {/* swing: dashed V from the hinge side corners to the latch side middle */}
              <polyline className="fbv1-swing" points={`${hingeLeft ? x0 : x0 + lw},${T.y(y0 + lh)} ${hingeLeft ? x0 + lw : x0},${T.y(y0 + lh / 2)} ${hingeLeft ? x0 : x0 + lw},${T.y(y0)}`} />
            </g>,
          );
        }
        return (
          <g key={`d${d.col}`} className={`fbv1-door ${isSel('door', d.col) ? 'sel' : ''}`} onClick={(e) => clickDoor(d, e)}>
            <rect className="fbv1-dooropen" x={sd.x0} y={T.y(sd.height)} width={sd.width} height={sd.height} />
            {leaves}
            <text x={T.x((sd.x0 + sd.x1) / 2)} y={T.y(sd.height * 0.6)} fontSize={fs * 1.1} textAnchor="middle" className="fbv1-doormark">{d.mark}</text>
            <text x={T.x((sd.x0 + sd.x1) / 2)} y={T.y(sd.height * 0.6) + fs * 1.3} fontSize={fs * 0.8} textAnchor="middle" className="fbv1-size">{`${d.swing === 'in' ? 'IN' : 'OUT'} · ${d.kind === 'pair' ? 'PAIR' : d.handing}`}</text>
          </g>
        );
      })}

      {/* joints */}
      {(showJoints || mode === 'joint') && solved.joints.map((j) => {
        const owner = j.owner;
        const r = fs * 0.75;
        return (
          <g key={j.key} className={`fbv1-joint own-${owner} ${isSel('joint', j.key) ? 'sel' : ''}`} onClick={(e) => clickJoint(j, e)}>
            <circle cx={T.x(j.x)} cy={T.y(j.y)} r={r} />
            {owner === 'v' && <line x1={T.x(j.x)} x2={T.x(j.x)} y1={T.y(j.y) - r * 0.65} y2={T.y(j.y) + r * 0.65} />}
            {owner === 'h' && <line x1={T.x(j.x) - r * 0.65} x2={T.x(j.x) + r * 0.65} y1={T.y(j.y)} y2={T.y(j.y)} />}
            {owner === 'miter' && <line x1={T.x(j.x) - r * 0.5} x2={T.x(j.x) + r * 0.5} y1={T.y(j.y) + r * 0.5} y2={T.y(j.y) - r * 0.5} />}
            <title>{`${j.key} · ${j.type} · ${owner === 'v' ? 'vertical runs through' : owner === 'h' ? 'horizontal runs through' : 'mitered'}${mode === 'joint' && owner !== 'miter' ? ' — click to flip' : ''}`}</title>
          </g>
        );
      })}

      {/* dimensions */}
      {bayDims}
      {dimH(0, W, yB2, `${formatFeetInches(W)}${solved.roughOpening ? `  (RO ${formatFeetInches(solved.roughOpening.width)})` : ''}`, 'ow')}
      {(() => {
        // jamb heights: left / right outside edges (they differ on rakes and gables)
        const edgeTop = (xEdge) => Math.max(...solved.outline.poly.filter((q) => Math.abs(q[0] - xEdge) < 1e-3).map((q) => q[1]), 0);
        const hl = edgeTop(0); const hr = edgeTop(W);
        const ro = solved.roughOpening ? `  (RO ${formatFeetInches(solved.roughOpening.height)})` : '';
        return (
          <>
            {dimV(0, hl, -fs * 2.6, `${formatFeetInches(hl)}${solved.outline.template === 'rect' ? ro : ''}`, 'oh')}
            {Math.abs(hr - hl) > 1e-3 && dimV(0, hr, W + fs * 5.4, formatFeetInches(hr), 'ohr')}
            {topY > Math.max(hl, hr) + 1e-3 && dimV(0, topY, -fs * 5.2 - (sillAFF > 0 ? fs * 2.6 : 0), `${formatFeetInches(topY)} max`, 'oht')}
          </>
        );
      })()}
      {rowDims}

      {/* lift line */}
      {liftY != null && (
        <g className="fbv1-lift">
          <line x1={T.x(-pad * 0.9)} x2={T.x(W + pad * 0.9)} y1={T.y(liftY)} y2={T.y(liftY)} />
          <text x={T.x(W + pad * 0.85)} y={T.y(liftY) - fs * 0.4} fontSize={fs * 0.95} textAnchor="end">{`LIFT LINE ${formatFeetInches(liftLineAFF)} AFF`}</text>
        </g>
      )}
      {activeGlassId && mode === 'glass' && (
        <text x={view.x + fs} y={view.y + fs * 1.6} fontSize={fs} className="fbv1-hint">{`Painting ${glassById[activeGlassId]?.mark ?? activeGlassId} — click lites`}</text>
      )}
    </svg>
  );
}
