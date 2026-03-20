/**
 * FrameOverlay.tsx
 *
 * Absolutely-positioned layer over the StudioCanvas that renders:
 *   1. The live dashed-rect preview while the user is dragging a new frame.
 *   2. A "Calibration Required" banner when the frame tool fires but the page
 *      has not yet been calibrated.
 *   3. The QuickAssignMenu popup (delegated to its own component).
 *
 * The overlay itself is pointer-events:none so it never steals events from the
 * canvas or useParametricTool's capture-phase listeners.  QuickAssignMenu uses
 * its own pointer-events (auto) to receive clicks.
 */

import QuickAssignMenu from './QuickAssignMenu';
import type { FramePreview } from '../../hooks/useParametricTool';

type Props = {
  framePreview:        FramePreview;
  calibrationRequired: boolean;
};

export default function FrameOverlay({ framePreview, calibrationRequired }: Props) {
  return (
    // Full-size overlay — sits above the <canvas> but below any modal dialogs.
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 10 }}>

      {/* ── In-progress frame preview ───────────────────────────────────── */}
      {framePreview && framePreview.w > 0 && framePreview.h > 0 && (
        <div
          style={{
            position:     'absolute',
            left:         framePreview.x,
            top:          framePreview.y,
            width:        framePreview.w,
            height:       framePreview.h,
            border:       '2px dashed #38bdf8',
            background:   'rgba(56, 189, 248, 0.06)',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        >
          {/* Live dimension badge */}
          {framePreview.w > 40 && (
            <span
              style={{
                position:   'absolute',
                bottom:     '100%',
                left:       '50%',
                transform:  'translateX(-50%)',
                marginBottom: 4,
                padding:    '1px 6px',
                background: 'rgba(15,23,42,0.85)',
                color:      '#38bdf8',
                fontSize:   10,
                fontFamily: 'monospace',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {framePreview.w.toFixed(0)} × {framePreview.h.toFixed(0)} px
            </span>
          )}
        </div>
      )}

      {/* ── Calibration required banner ─────────────────────────────────── */}
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

      {/* ── QuickAssignMenu ─────────────────────────────────────────────── */}
      {/* pointer-events reset to auto so the menu is interactive */}
      <div className="pointer-events-auto">
        <QuickAssignMenu />
      </div>

    </div>
  );
}
