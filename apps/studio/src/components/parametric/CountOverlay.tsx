/**
 * CountOverlay.tsx  —  HTML overlay for count markers.
 *
 * Renders a coloured circle for every MarkerShape on the active page.
 * Circles are positioned using engine.pageToScreen() so they track the PDF
 * canvas at all zoom/pan levels.
 *
 * Also renders a compact panel listing all count groups + their totals.
 *
 * The overlay itself is pointer-events:none; individual markers are
 * pointer-events:auto so the user can click them to delete.
 */

import React, { useCallback } from 'react';
import { useStudioStore }  from '../../store/useStudioStore';
import { useProjectStore } from '../../store/useProjectStore';
import { tallyAllGroups }  from '../../engine/parametric/countMath';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import type { MarkerShape }     from '../../types/shapes';

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  engine:        CanvasEngineAPI;
  activeGroupId: string | null;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CountOverlay({ engine, activeGroupId }: Props): React.ReactElement {
  const activeTool    = useStudioStore(s => s.activeTool);
  const activePageId  = useStudioStore(s => s.activePageId);
  const shapes        = useStudioStore(s => s.shapes);
  const removeShape   = useStudioStore(s => s.removeShape);
  const countGroups   = useProjectStore(s => s.countGroups);
  const removeCountsForShape = useProjectStore(s => s.removeCountsForShape);

  // All marker shapes on the active page
  const markers = shapes.filter(
    (s): s is MarkerShape => s.type === 'marker' && s.pageId === activePageId,
  );

  const tally = tallyAllGroups(markers, countGroups);

  const handleDeleteMarker = useCallback((shapeId: string) => {
    removeShape(shapeId);
    removeCountsForShape(shapeId);
  }, [removeShape, removeCountsForShape]);

  if (markers.length === 0 && countGroups.length === 0) return <></>;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Marker dots */}
      {markers.map(m => {
        const pos    = engine.pageToScreen(m.position.x, m.position.y);
        const group  = countGroups.find(g => g.id === m.countGroupId);
        const color  = group?.color ?? m.color ?? '#f43f5e';
        const isActive = m.countGroupId === activeGroupId;
        return (
          <div
            key={m.id}
            title={`${group?.label ?? 'Ungrouped'} — click to remove`}
            onClick={() => handleDeleteMarker(m.id)}
            style={{
              position:     'absolute',
              left:         pos.x - 8,
              top:          pos.y - 8,
              width:        16,
              height:       16,
              borderRadius: '50%',
              background:   color,
              border:       isActive ? '2px solid #fff' : '1.5px solid rgba(255,255,255,0.4)',
              opacity:      0.92,
              cursor:       activeTool === 'count' ? 'pointer' : 'default',
              pointerEvents: activeTool === 'count' ? 'auto' : 'none',
              boxShadow:    '0 1px 3px rgba(0,0,0,0.5)',
              transition:   'transform 0.1s',
              transform:    isActive ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        );
      })}

      {/* Count legend panel — only visible when count tool is active */}
      {activeTool === 'count' && countGroups.length > 0 && (
        <div
          style={{
            position:     'absolute',
            right:        12,
            bottom:       48,
            background:   'rgba(15,23,42,0.9)',
            border:       '1px solid #334155',
            borderRadius: 8,
            padding:      '8px 12px',
            pointerEvents: 'auto',
            minWidth:     140,
            color:        '#f1f5f9',
            fontSize:     12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#38bdf8', fontSize: 11 }}>
            COUNT TOTALS
          </div>
          {countGroups.map(g => (
            <div
              key={g.id}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          8,
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width:        10,
                  height:       10,
                  borderRadius: '50%',
                  background:   g.color,
                  flexShrink:   0,
                }}
              />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.label}
              </span>
              <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                {tally.get(g.id) ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
