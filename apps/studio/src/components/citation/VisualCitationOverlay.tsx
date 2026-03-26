/**
 * VisualCitationOverlay.tsx
 *
 * SVG overlay that renders citation highlights on top of the PDF canvas.
 * Shows colored bounding boxes, architect tag labels, and implication
 * count badges. Shapes glow when they have high-cost implications.
 *
 * Receives a `pageToScreen` function from the canvas engine to transform
 * page-space bounding boxes into screen-space pixel positions.
 */

import React, { useCallback } from 'react';
import type { Citation } from '../../db/citationStore';

interface Props {
  citations:    Citation[];
  hoveredId?:   string;
  onHover:      (id: string | null) => void;
  pageToScreen: (px: number, py: number) => { x: number; y: number };
}

export default function VisualCitationOverlay({ citations, hoveredId, onHover, pageToScreen }: Props) {
  const handleHover = useCallback((id: string | null) => onHover(id), [onHover]);

  if (citations.length === 0) return null;

  return (
    <svg
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none',
        zIndex:        45,
        overflow:      'visible',
      }}
    >
      <defs>
        <filter id="citation-glow-high">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="citation-glow-medium">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {citations.map(c => {
        const bb = c.geometry.boundingBox;
        // Transform page-space top-left and bottom-right to screen pixels
        const tl = pageToScreen(bb.x, bb.y);
        const br = pageToScreen(bb.x + bb.width, bb.y + bb.height);
        const sx = tl.x;
        const sy = tl.y;
        const sw = br.x - tl.x;
        const sh = br.y - tl.y;

        if (sw < 2 || sh < 2) return null; // off-screen or too small

        const isHovered   = c.id === hoveredId;
        const hasHighCost = (c.implications ?? []).some(i => i.costImpact === 'high');
        const hasMedCost  = (c.implications ?? []).some(i => i.costImpact === 'medium');
        const hasAnyImpl  = (c.implications ?? []).length > 0;

        const strokeColor =
          hasHighCost ? '#ef4444' :
          hasMedCost  ? '#f59e0b' :
          hasAnyImpl  ? '#3b82f6' : '#22c55e';

        const filter =
          hasHighCost ? 'url(#citation-glow-high)' :
          hasMedCost  ? 'url(#citation-glow-medium)' : undefined;

        return (
          <g
            key={c.id}
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onMouseEnter={() => handleHover(c.id)}
            onMouseLeave={() => handleHover(null)}
          >
            {/* Shape highlight rectangle */}
            <rect
              x={sx} y={sy} width={sw} height={sh}
              fill={isHovered ? `${strokeColor}22` : `${strokeColor}11`}
              stroke={strokeColor}
              strokeWidth={isHovered ? 2 : 1}
              strokeDasharray={c.createdBy === 'ai' ? '4 2' : undefined}
              filter={filter}
              rx={2}
            />

            {/* Architect tag label */}
            <text
              x={sx + 4}
              y={sy + 13}
              fill={strokeColor}
              fontSize={10}
              fontWeight={700}
              fontFamily="monospace"
            >
              {c.scope.architectTag}
            </text>

            {/* Implication count badge */}
            {hasAnyImpl && (
              <g>
                <circle cx={sx + sw - 8} cy={sy + 8} r={7} fill={strokeColor} />
                <text
                  x={sx + sw - 8}
                  y={sy + 12}
                  fill="#000"
                  fontSize={9}
                  fontWeight={800}
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {(c.implications ?? []).length}
                </text>
              </g>
            )}

            {/* Hover tooltip */}
            {isHovered && (
              <foreignObject x={sx} y={sy + sh + 4} width={200} height={60}>
                <div
                  style={{
                    background:   'rgba(15,23,42,0.95)',
                    border:       '1px solid #1e3a5f',
                    borderRadius: 4,
                    padding:      '4px 8px',
                    color:        '#e2e8f0',
                    fontSize:     10,
                    fontFamily:   'Inter, sans-serif',
                    whiteSpace:   'nowrap',
                  }}
                >
                  <strong>{c.scope.architectTag}</strong> — {c.scope.systemType}
                  {hasAnyImpl && (
                    <div style={{ color: '#f59e0b', marginTop: 2 }}>
                      {(c.implications ?? []).length} implication{(c.implications ?? []).length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}
    </svg>
  );
}
