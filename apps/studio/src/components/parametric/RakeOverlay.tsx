/**
 * RakeOverlay.tsx  —  In-progress visual for the 4-point Raked Frame tool.
 *
 * Uses an SVG layer to draw:
 *   – Dashed polyline connecting placed points + live cursor
 *   – A circle dot at each placed point
 *   – A hint badge showing which corner to click next
 *   – Calibration-required banner (reuses FrameOverlay's style)
 *
 * Coordinates arrive in page-space from useRakeTool → converted to CSS-px
 * via engine.pageToScreen().
 */

import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import type { RakePreview }     from '../../hooks/useRakeTool';

// ── Labels for each click ────────────────────────────────────────────────────

const CORNER_HINTS = [
  'Click top-left',
  'Click top-right',
  'Click bottom-right',
  'Click bottom-left (closes shape)',
];

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  rakePreview:         RakePreview;
  calibrationRequired: boolean;
  engine:              CanvasEngineAPI;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function RakeOverlay({ rakePreview, calibrationRequired, engine }: Props) {
  const hint = rakePreview
    ? CORNER_HINTS[rakePreview.points.length] ?? ''
    : '';

  // Convert all page-space points to screen coords
  const screenPts = rakePreview
    ? rakePreview.points.map(p => engine.pageToScreen(p.x, p.y))
    : [];

  const screenCursor = rakePreview?.cursor
    ? engine.pageToScreen(rakePreview.cursor.x, rakePreview.cursor.y)
    : null;

  // Build the polyline string: placed points + live cursor
  const allPts = screenCursor ? [...screenPts, screenCursor] : screenPts;
  const polylinePoints = allPts.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 12 }}>
      {/* SVG polygon preview */}
      {rakePreview && allPts.length >= 2 && (
        <svg
          className="absolute inset-0 w-full h-full overflow-visible"
          style={{ pointerEvents: 'none' }}
        >
          {/* Dashed preview line */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#fb923c"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Placed-point dots */}
          {screenPts.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={5}
              fill="#fb923c"
              stroke="#fff"
              strokeWidth={1.5}
            />
          ))}
        </svg>
      )}

      {/* Corner hint badge */}
      {rakePreview && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2"
          style={{ pointerEvents: 'none' }}
        >
          <span
            style={{
              display:      'inline-block',
              padding:      '3px 10px',
              background:   'rgba(251,146,60,0.9)',
              color:        '#1e293b',
              fontSize:     11,
              fontWeight:   600,
              borderRadius: 6,
              whiteSpace:   'nowrap',
              boxShadow:    '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            {hint}
            {rakePreview.points.length > 0 && (
              <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.7 }}>
                ({rakePreview.points.length}/4) — Backspace to undo
              </span>
            )}
          </span>
        </div>
      )}

      {/* Calibration required banner */}
      {calibrationRequired && (
        <div
          className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2
            px-4 py-2 rounded-lg bg-amber-500/90 text-slate-900 text-xs font-semibold shadow-lg"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z" />
          </svg>
          Page not calibrated — switched to Calibrate tool. Draw a reference line first.
        </div>
      )}
    </div>
  );
}
