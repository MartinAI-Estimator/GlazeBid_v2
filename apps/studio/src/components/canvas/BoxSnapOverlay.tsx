/**
 * BoxSnapOverlay.tsx  —  visual layer for the Box & Snap vision tool.
 *
 * Renders as an `absolute inset-0` overlay above StudioCanvas, following the
 * CountOverlay pattern: every box is positioned with `engine.pageToScreen()`,
 * so it sits on the drawing and tracks zoom and pan.
 *
 * ── Why this overlay runs a camera tick ──────────────────────────────────────
 * `camera.pan()` in useCanvasEngine does NOT write to the store (only zoom
 * does, via setCameraScale). So a page-space HTML overlay that only re-renders
 * on store changes will stay frozen while the PDF slides underneath during a
 * pan — a bug CountOverlay currently has. Rather than change the engine, this
 * overlay watches the projection itself: one rAF loop, one pageToScreen(0,0)
 * probe per frame, state bumped only when the projection actually moved. It
 * runs only while there is something on screen to keep aligned, so an idle
 * Studio pays nothing.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { pageYOffsets } from '../../hooks/useBoxSnapTool';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import type { BoxSnapDetection, PageRect } from '../../hooks/useBoxSnapTool';

// ── System colours ────────────────────────────────────────────────────────────
//
// OWNER-SPECIFIED (2026-09-17). These are UI colours chosen so the four
// canonical system types are distinguishable at a glance.
//
// NOTE — they intentionally differ from glazebid_scope_colors.py, the Bluebeam
// export key, which uses: storefront #FF8000 orange (covering BOTH Ext SF and
// Int SF), curtain_wall #008000 green, #FF0000 red = FIRE-RATED, #0000FF blue =
// WINDOW. Only Cap CW = green matches. If these overlays are ever exported as
// Bluebeam markups, map through the scope-colour key on the way out rather than
// shipping these values, or a red storefront will read as fire-rated.
const SYSTEM_STYLES: Record<string, { stroke: string; fill: string; text: string }> = {
  'Ext SF': { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.22)',  text: '#fecaca' }, // red
  'Int SF': { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.22)', text: '#bfdbfe' }, // blue
  'Cap CW': { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.22)',  text: '#bbf7d0' }, // green
  'SSG CW': { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.22)', text: '#e9d5ff' }, // violet
};

const FALLBACK_STYLE = { stroke: '#94a3b8', fill: 'rgba(148, 163, 184, 0.20)', text: '#e2e8f0' };

const styleFor = (systemType: string) => SYSTEM_STYLES[systemType] ?? FALLBACK_STYLE;

// ── Camera tick ───────────────────────────────────────────────────────────────

/** Re-render whenever the canvas projection moves (pan, zoom, fit). */
function useCameraTick(engine: CanvasEngineAPI, active: boolean): void {
  const [, force] = useState(0);
  const lastRef = useRef<string>('');

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const probe = () => {
      // Two points pin translation AND scale with two cheap calls.
      const a = engine.pageToScreen(0, 0);
      const b = engine.pageToScreen(1000, 1000);
      const key = `${a.x.toFixed(2)},${a.y.toFixed(2)},${b.x.toFixed(2)},${b.y.toFixed(2)}`;
      if (key !== lastRef.current) {
        lastRef.current = key;
        force(n => n + 1);
      }
      raf = requestAnimationFrame(probe);
    };
    raf = requestAnimationFrame(probe);
    return () => cancelAnimationFrame(raf);
  }, [engine, active]);
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  engine: CanvasEngineAPI;
  active: boolean;
  activePageId: string;
  /** VIRTUAL space — projects directly, no offset needed. */
  dragPreview: PageRect | null;
  /** bbox is PAGE-LOCAL; this overlay adds the page's offset back. */
  detections: BoxSnapDetection[];
  isRunning: boolean;
  error: string | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onClear: () => void;
  onDismissError: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function BoxSnapOverlay({
  engine,
  active,
  activePageId,
  dragPreview,
  detections,
  isRunning,
  error,
  onAccept,
  onReject,
  onClear,
  onDismissError,
}: Props): React.ReactElement | null {
  const pages = useStudioStore(s => s.pages);
  const continuousScroll = useStudioStore(s => s.continuousScroll);

  // Page-local bbox → virtual space. All-zero offsets in single-page mode.
  const yOffsets = pageYOffsets(pages, continuousScroll);

  // In continuous mode every stacked page is on screen at once, so show them
  // all; in single-page mode only the active page is visible, so filter.
  const visible = detections.filter(d =>
    d.status !== 'rejected' && (continuousScroll || d.pageId === activePageId),
  );
  const pending = visible.filter(d => d.status === 'pending');

  // Keep boxes glued to the drawing while anything is on screen.
  useCameraTick(engine, active && (visible.length > 0 || dragPreview !== null));

  if (!active && visible.length === 0) return null;

  /** Project a VIRTUAL-space rect to screen. */
  const project = (r: PageRect) => {
    const tl = engine.pageToScreen(r.x0, r.y0);
    const br = engine.pageToScreen(r.x1, r.y1);
    return {
      left: Math.min(tl.x, br.x),
      top: Math.min(tl.y, br.y),
      width: Math.abs(br.x - tl.x),
      height: Math.abs(br.y - tl.y),
    };
  };

  /** Project a PAGE-LOCAL rect: add that page's stack offset, then project. */
  const projectLocal = (r: PageRect, pageId: string) => {
    const dy = yOffsets.get(pageId) ?? 0;
    return project({ x0: r.x0, y0: r.y0 + dy, x1: r.x1, y1: r.y1 + dy });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      {/* ── Detections ──────────────────────────────────────────────────── */}
      {visible.map(d => {
        const box = projectLocal(d.bbox, d.pageId);
        if (box.width < 1 || box.height < 1) return null;
        const s = styleFor(d.systemType);
        const accepted = d.status === 'accepted';
        const showActions = d.status === 'pending' && box.width > 70 && box.height > 34;

        return (
          <div
            key={d.id}
            style={{
              position: 'absolute',
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              background: s.fill,
              border: `2px ${accepted ? 'solid' : 'dashed'} ${s.stroke}`,
              borderRadius: 2,
              opacity: accepted ? 0.55 : 1,
              pointerEvents: 'none',
              transition: 'opacity 120ms',
            }}
          >
            {/* Label */}
            {box.width > 54 && (
              <span
                style={{
                  position: 'absolute',
                  top: -18,
                  left: -2,
                  fontSize: 10,
                  fontFamily: 'ui-monospace, monospace',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'rgba(15,23,42,0.92)',
                  color: s.text,
                  border: `1px solid ${s.stroke}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {accepted ? '✓ ' : ''}
                {d.mark ? `${d.mark} · ` : ''}
                {d.systemType} · {d.bayCount}×{d.rowCount}
                {d.gridSource === 'default' ? '?' : ''} · {Math.round(d.confidence * 100)}%
              </span>
            )}

            {/* Accept / reject */}
            {showActions && (
              <div
                style={{
                  position: 'absolute',
                  right: 3,
                  bottom: 3,
                  display: 'flex',
                  gap: 4,
                  pointerEvents: 'auto',
                }}
              >
                <button
                  title={d.description || 'Accept — add to takeoff inbox'}
                  onClick={e => { e.stopPropagation(); onAccept(d.id); }}
                  style={btn('#16a34a')}
                >
                  ✓
                </button>
                <button
                  title="Reject"
                  onClick={e => { e.stopPropagation(); onReject(d.id); }}
                  style={btn('#e11d48')}
                >
                  ✗
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Live drag rect ──────────────────────────────────────────────── */}
      {dragPreview && (() => {
        const box = project(dragPreview);
        return (
          <div
            style={{
              position: 'absolute',
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              background: 'rgba(14,165,233,0.10)',
              border: '2px dashed #0ea5e9',
              outline: '1px solid rgba(255,255,255,0.75)',
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          />
        );
      })()}

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      {active && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 11px',
            borderRadius: 7,
            fontSize: 12,
            fontFamily: 'ui-monospace, monospace',
            background: error ? 'rgba(127,29,29,0.94)' : 'rgba(15,23,42,0.94)',
            color: error ? '#fecaca' : '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.14)',
            pointerEvents: 'auto',
            maxWidth: '72%',
          }}
        >
          <span>
            {isRunning
              ? '⏳ Box & Snap — reading region…'
              : error
                ? `✖ ${error}`
                : `▭ Box & Snap — drag a box · ${pending.length} pending${continuousScroll ? '' : ' on this sheet'}`}
          </span>
          {error && (
            <button onClick={onDismissError} style={linkBtn}>dismiss</button>
          )}
          {visible.length > 0 && (
            <button onClick={onClear} style={linkBtn}>clear</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline styles ─────────────────────────────────────────────────────────────

const btn = (bg: string): React.CSSProperties => ({
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 3,
  border: 'none',
  background: bg,
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
  lineHeight: 1,
});

const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  opacity: 0.75,
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
  padding: 0,
};
