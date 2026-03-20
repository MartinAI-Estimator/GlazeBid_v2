/**
 * GhostOverlay.tsx  —  Phase 6.3 Ghost Highlighter visual layer.
 *
 * Renders on top of the StudioCanvas as an `absolute inset-0` overlay.
 * Shows:
 *   • The anchor box the user drew (violet dashed border) while a scan is
 *     running or when results are present.
 *   • The draw preview rect while the user is dragging (transparent fill).
 *   • Each ghost detection as a semi-transparent colored rect with ✓ / ✗
 *     action buttons that appear on hover:
 *       – emerald  (confidence ≥ 0.85)  high-confidence match
 *       – sky       (confidence 0.70–0.85) medium confidence
 *       – amber     (confidence < 0.70)  low-confidence / needs review
 *   • Accepted detections darken briefly then become invisible.
 *   • Rejected detections fade out.
 *   • A floating status bar at the top of the canvas when detections exist:
 *       "Ghost Detector  ·  N pending  ·  Accept All  ·  Clear  ·  Threshold XX%"
 *   • A centred scanning spinner overlay while `isDetecting` is true.
 *
 * Legacy reference:
 *   _LEGACY_ARCHIVE/GlazeBid_AIQ/AI_DETECTION_ARCHITECTURE.md — colour coding.
 *   _LEGACY_ARCHIVE/GlazeBid_AIQ/GHOST_HIGHLIGHTER_EXEC_SUMMARY.md — UX flow.
 */

import React, { useState } from 'react';
import type { GhostDetection } from '../../hooks/useGhostDetector';
import type { CssPxBox }       from '../../hooks/useGhostTool';

// ── Types ─────────────────────────────────────────────────────────────────────

export type GhostOverlayProps = {
  detections:    GhostDetection[];
  anchorBox:     CssPxBox | null;
  /** Live preview rect while the user is still dragging the anchor. */
  drawPreview:   CssPxBox | null;
  isDetecting:   boolean;
  threshold:     number;
  positiveCount: number;
  negativeCount: number;
  onCommit:      (id: string) => void;
  onReject:      (id: string) => void;
  onAcceptAll:   () => void;
  onClear:       () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceColor(confidence: number): {
  bg: string;
  border: string;
  text: string;
} {
  if (confidence >= 0.85) return { bg: 'bg-emerald-400/30', border: 'border-emerald-400', text: 'text-emerald-300' };
  if (confidence >= 0.70) return { bg: 'bg-sky-400/30',     border: 'border-sky-400',     text: 'text-sky-300'     };
  return                         { bg: 'bg-amber-400/30',   border: 'border-amber-400',   text: 'text-amber-300'   };
}

function confidenceLabel(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

// ── Sub-component: single ghost rect ─────────────────────────────────────────

type GhostRectProps = {
  detection: GhostDetection;
  onCommit:  (id: string) => void;
  onReject:  (id: string) => void;
};

function GhostRect({ detection, onCommit, onReject }: GhostRectProps) {
  const [hovered, setHovered] = useState(false);
  const { box, confidence, status, id } = detection;

  if (status === 'accepted' || status === 'rejected') return null;

  const colors = confidenceColor(confidence);

  return (
    <div
      className={`
        absolute border-2 rounded-sm transition-all duration-150 cursor-default
        ${colors.bg} ${colors.border}
        ${hovered ? 'brightness-125' : ''}
      `}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Confidence label */}
      <span
        className={`
          absolute -top-5 left-0 text-[10px] font-semibold px-1
          rounded bg-black/60 leading-4 ${colors.text}
        `}
      >
        {confidenceLabel(confidence)}
      </span>

      {/* Accept / Reject buttons — shown on hover or always if box is large enough */}
      {(hovered || box.w >= 60) && (
        <div className="absolute bottom-1 right-1 flex gap-1">
          <button
            className="flex items-center justify-center w-5 h-5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow"
            title="Accept — add as shape"
            onClick={e => { e.stopPropagation(); onCommit(id); }}
          >
            ✓
          </button>
          <button
            className="flex items-center justify-center w-5 h-5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold shadow"
            title="Reject — remove and raise threshold"
            onClick={e => { e.stopPropagation(); onReject(id); }}
          >
            ✗
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GhostOverlay({
  detections,
  anchorBox,
  drawPreview,
  isDetecting,
  threshold,
  positiveCount,
  negativeCount,
  onCommit,
  onReject,
  onAcceptAll,
  onClear,
}: GhostOverlayProps) {
  const pendingCount = detections.filter(d => d.status === 'pending').length;
  const hasActivity  = isDetecting ||
                       pendingCount  > 0 ||
                       positiveCount > 0 ||
                       negativeCount > 0 ||
                       anchorBox     !== null;

  if (!hasActivity && !drawPreview) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none"
      aria-label="Ghost detection overlay"
    >
      {/* ── Draw preview (user is dragging the anchor) ───────────────────── */}
      {drawPreview && (
        <div
          className="absolute border-2 border-dashed border-violet-400 bg-violet-500/15 rounded-sm"
          style={{
            left:   drawPreview.x,
            top:    drawPreview.y,
            width:  drawPreview.w,
            height: drawPreview.h,
          }}
        />
      )}

      {/* ── Anchor box (shown while scanning or results are present) ────── */}
      {anchorBox && !drawPreview && (
        <div
          className="absolute border-2 border-dashed border-violet-500 bg-violet-500/10 rounded-sm"
          style={{
            left:   anchorBox.x,
            top:    anchorBox.y,
            width:  anchorBox.w,
            height: anchorBox.h,
          }}
        >
          <span className="absolute -top-5 left-0 text-[10px] font-semibold px-1 rounded bg-black/60 text-violet-300 leading-4">
            Anchor
          </span>
        </div>
      )}

      {/* ── Ghost detection rects ────────────────────────────────────────── */}
      <div className="pointer-events-auto">
        {detections.map(det => (
          <GhostRect
            key={det.id}
            detection={det}
            onCommit={onCommit}
            onReject={onReject}
          />
        ))}
      </div>

      {/* ── Scanning spinner ─────────────────────────────────────────────── */}
      {isDetecting && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 bg-slate-900/80 px-5 py-3 rounded-lg border border-slate-600 shadow-lg">
            <svg
              className="w-6 h-6 animate-spin text-violet-400"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-xs text-slate-300 font-medium">Detecting ghosts…</span>
          </div>
        </div>
      )}

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      {!isDetecting && hasActivity && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/90 border border-slate-600/70 rounded-full px-4 py-1.5 shadow-lg pointer-events-auto text-xs text-slate-300">
          {/* Title */}
          <span className="font-semibold text-violet-300">Ghost Detector</span>
          <span className="text-slate-600">·</span>

          {/* Counts */}
          <span>
            {pendingCount > 0
              ? <span className="text-white font-medium">{pendingCount} pending</span>
              : <span className="text-slate-500">no pending</span>
            }
          </span>

          {positiveCount > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400">{positiveCount} accepted</span>
            </>
          )}

          {negativeCount > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-rose-400">{negativeCount} rejected</span>
            </>
          )}

          <span className="text-slate-600">·</span>

          {/* Threshold */}
          <span className="text-slate-400">
            Threshold: <span className="text-amber-300 font-medium">{Math.round(threshold * 100)}%</span>
          </span>

          <span className="text-slate-600">·</span>

          {/* Actions */}
          {pendingCount > 0 && (
            <button
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              onClick={onAcceptAll}
            >
              Accept All
            </button>
          )}

          <button
            className="text-slate-400 hover:text-slate-200 transition-colors"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
