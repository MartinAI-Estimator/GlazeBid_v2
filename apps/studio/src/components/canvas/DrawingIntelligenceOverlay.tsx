/**
 * DrawingIntelligenceOverlay.tsx
 *
 * SVG overlay that renders glazing candidate bounding boxes on the Studio canvas.
 * Follows the GhostOverlay.tsx pattern — positioned absolutely over the canvas,
 * using Camera coordinate transforms to map PDF points to screen pixels.
 *
 * Color coding:
 *   Green  (#22C55E) — auto_accepted candidates
 *   Amber  (#F59E0B) — needs_review candidates (pending user decision)
 *   Blue   (#3B82F6) — user-confirmed candidates
 *   Gray   (#9CA3AF) — user-rejected candidates (dimmed)
 */

import React, { useMemo } from 'react';
import type { CandidateWithReview } from '../../hooks/useDrawingIntelligence';

interface Props {
  candidates: CandidateWithReview[];
  currentPageNum: number;
  /** Camera transform: converts PDF points to screen pixels */
  pdfToScreen: (x: number, y: number) => { x: number; y: number };
  /** Camera scale factor (zoom level) */
  scale: number;
  onConfirm: (candidateId: string) => void;
  onReject: (candidateId: string) => void;
  /** Canvas dimensions in pixels */
  canvasWidth: number;
  canvasHeight: number;
}

const STATUS_COLORS: Record<string, string> = {
  auto_accepted: '#22C55E',
  needs_review: '#F59E0B',
};

const USER_STATUS_COLORS: Record<string, string> = {
  confirmed: '#3B82F6',
  rejected: '#9CA3AF',
  pending: '',  // falls back to status color
};

export function DrawingIntelligenceOverlay({
  candidates,
  currentPageNum,
  pdfToScreen,
  scale,
  onConfirm,
  onReject,
  canvasWidth,
  canvasHeight,
}: Props) {
  const pageCandidates = useMemo(
    () => candidates.filter(c => c.pageNum === currentPageNum),
    [candidates, currentPageNum]
  );

  if (pageCandidates.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
        zIndex: 20,
      }}
      width={canvasWidth}
      height={canvasHeight}
    >
      {pageCandidates.map(candidate => {
        const bb = candidate.bounding_box;
        const topLeft = pdfToScreen(bb.x, bb.y);
        const bottomRight = pdfToScreen(bb.x + bb.width, bb.y + bb.height);

        const screenX = topLeft.x;
        const screenY = topLeft.y;
        const screenW = bottomRight.x - topLeft.x;
        const screenH = bottomRight.y - topLeft.y;

        // Skip if off-screen
        if (screenX + screenW < 0 || screenX > canvasWidth) return null;
        if (screenY + screenH < 0 || screenY > canvasHeight) return null;

        const color =
          USER_STATUS_COLORS[candidate.userStatus] ||
          STATUS_COLORS[candidate.status] ||
          '#F59E0B';

        const isDimmed = candidate.userStatus === 'rejected';
        const label = candidate.system_hint !== 'unknown'
          ? `${candidate.system_hint} ${candidate.confidence.toFixed(2)}`
          : `${candidate.status} ${candidate.confidence.toFixed(2)}`;

        const btnSize = Math.max(20, Math.min(32, screenH * 0.25));
        const fontSize = Math.max(8, Math.min(11, scale * 8));

        return (
          <g key={candidate.candidate_id} opacity={isDimmed ? 0.3 : 1}>
            {/* Bounding box */}
            <rect
              x={screenX}
              y={screenY}
              width={screenW}
              height={screenH}
              fill={color}
              fillOpacity={0.12}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={candidate.userStatus === 'pending' ? '6 3' : 'none'}
            />

            {/* Label bar */}
            {screenW > 60 && screenH > 20 && (
              <rect
                x={screenX}
                y={screenY}
                width={Math.min(screenW, 200)}
                height={fontSize + 6}
                fill={color}
                fillOpacity={0.85}
              />
            )}
            {screenW > 60 && screenH > 20 && (
              <text
                x={screenX + 4}
                y={screenY + fontSize + 1}
                fontSize={fontSize}
                fill="white"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {label}
              </text>
            )}

            {/* Action buttons — only for pending candidates with enough screen space */}
            {candidate.userStatus === 'pending' && screenW > 80 && screenH > 40 && (
              <g
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                transform={`translate(${screenX + screenW - btnSize * 2 - 6}, ${screenY + 2})`}
              >
                {/* Confirm button */}
                <rect
                  x={0} y={0} width={btnSize} height={btnSize}
                  rx={3} fill="#22C55E" fillOpacity={0.9}
                  onClick={(e) => { e.stopPropagation(); onConfirm(candidate.candidate_id); }}
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                />
                <text
                  x={btnSize / 2} y={btnSize * 0.72}
                  textAnchor="middle" fontSize={btnSize * 0.6}
                  fill="white" fontWeight="bold"
                  onClick={(e) => { e.stopPropagation(); onConfirm(candidate.candidate_id); }}
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                >&#x2713;</text>

                {/* Reject button */}
                <rect
                  x={btnSize + 4} y={0} width={btnSize} height={btnSize}
                  rx={3} fill="#EF4444" fillOpacity={0.9}
                  onClick={(e) => { e.stopPropagation(); onReject(candidate.candidate_id); }}
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                />
                <text
                  x={btnSize + 4 + btnSize / 2} y={btnSize * 0.72}
                  textAnchor="middle" fontSize={btnSize * 0.6}
                  fill="white" fontWeight="bold"
                  onClick={(e) => { e.stopPropagation(); onReject(candidate.candidate_id); }}
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                >&#x2715;</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
