import React, { useState, useEffect } from 'react';
import { Droppable } from '@hello-pangea/dnd';

// Map modifier IDs to display config (no emojis — pure CSS overlays)
const MODIFIER_OVERLAYS = {
  'modifier-door-pair': {
    label: 'Door Pair',
    render: (vw, vh) => (
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: Math.min(vw * 0.72, vw - 8),
        height: vh * 0.55,
        borderTop: '2.5px solid #60a5fa',
        borderLeft: '2.5px solid #60a5fa',
        borderRight: '2.5px solid #60a5fa',
        background: 'rgba(59,130,246,0.12)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 3,
        boxSizing: 'border-box',
      }}>
        <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#93c5fd', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Door Pair</span>
        {/* Center split line */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, background: '#60a5fa', opacity: 0.6 }} />
      </div>
    ),
  },
  'modifier-door-single': {
    label: 'Door',
    render: (vw, vh) => (
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: Math.min(vw * 0.44, vw - 8),
        height: vh * 0.55,
        borderTop: '2.5px solid #60a5fa',
        borderLeft: '2.5px solid #60a5fa',
        borderRight: '2.5px solid #60a5fa',
        background: 'rgba(59,130,246,0.12)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 3,
        boxSizing: 'border-box',
      }}>
        <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase' }}>Door</span>
      </div>
    ),
  },
  'modifier-lift-required': {
    label: 'Lift',
    render: () => (
      <div style={{
        position: 'absolute',
        top: 4,
        right: 4,
        background: 'rgba(245,158,11,0.2)',
        border: '1.5px solid #f59e0b',
        borderRadius: 4,
        padding: '2px 5px',
        fontSize: '0.5rem',
        fontWeight: 700,
        color: '#fcd34d',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        lineHeight: 1,
      }}>Lift</div>
    ),
  },
  'modifier-vent': {
    label: 'Vent',
    render: (vw) => (
      <div style={{
        position: 'absolute',
        top: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        width: Math.min(vw * 0.55, vw - 8),
        height: 16,
        borderBottom: '2px solid #34d399',
        borderLeft: '2px solid #34d399',
        borderRight: '2px solid #34d399',
        background: 'rgba(16,185,129,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}>
        <span style={{ fontSize: '0.5rem', fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase' }}>Vent</span>
      </div>
    ),
  },
  'modifier-brake-metal': {
    label: 'BM',
    render: () => (
      <div style={{
        position: 'absolute',
        bottom: 4,
        left: 4,
        background: 'rgba(139,92,246,0.2)',
        border: '1.5px solid #8b5cf6',
        borderRadius: 4,
        padding: '2px 5px',
        fontSize: '0.5rem',
        fontWeight: 700,
        color: '#c4b5fd',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        lineHeight: 1,
      }}>BM</div>
    ),
  },
  'modifier-steel': {
    label: 'Stl',
    render: () => (
      <div style={{
        position: 'absolute',
        bottom: 4,
        right: 4,
        background: 'rgba(100,116,139,0.25)',
        border: '1.5px solid #64748b',
        borderRadius: 4,
        padding: '2px 5px',
        fontSize: '0.5rem',
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        lineHeight: 1,
      }}>Steel</div>
    ),
  },
};

const FrameWireframe = ({ frame }) => {
  // Fix for @hello-pangea/dnd + React 18 Strict Mode:
  // Droppables fail to register on first mount in Strict Mode because the
  // library's internal context is torn down and re-created. Waiting one rAF
  // tick after mount guarantees the DragDropContext is stable before the
  // Droppable renders, so the drop zone registers correctly.
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(frame);
      setEnabled(false);
    };
  }, []);

  const { id, frame_number, width, height, bays, dlos, modifiers } = frame;

  // Ensure we have real numbers; default to a 48×48 box if CSV data is missing/zero
  const safeWidth  = Number(width)  || 48;
  const safeHeight = Number(height) || 48;
  const safeBays   = Number(bays)   || 1;
  const safeDlos   = Number(dlos)   || 1;

  // Scale to fit within a fixed bounding box. Both axes are capped so
  // wide storefronts don't overflow the flexbox grid.
  const MAX_H = 180;
  const MAX_W = 160;
  const scaleFactor = Math.min(MAX_H / safeHeight, MAX_W / safeWidth);
  // Force a minimum so it never collapses to 0
  const visualWidth  = Math.max(Math.round(safeWidth  * scaleFactor), 50);
  const visualHeight = Math.max(Math.round(safeHeight * scaleFactor), 50);

  // Glass pane colour — semi-transparent blue so panes are clearly visible
  const glassColor = 'rgba(147,197,253,0.55)';
  const frameColor = '#1e293b'; // slate-800 — darker aluminium for contrast

  // Don't render until the rAF tick has fired — keeps the Droppable from
  // registering before DragDropContext is stable (React 18 Strict Mode fix).
  if (!enabled) return null;

  return (
    <Droppable droppableId={`frame-${id}`}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0.5rem',
            flexShrink: 0,
          }}
        >
          {/* Frame number label */}
          <div style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            marginBottom: 6,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {frame_number}
          </div>

          {/* Wireframe box */}
          <div
            style={{
              position: 'relative',
              width: visualWidth,
              height: visualHeight,
              backgroundColor: frameColor,
              display: 'grid',
              gridTemplateColumns: `repeat(${safeBays}, 1fr)`,
              gridTemplateRows: `repeat(${safeDlos}, 1fr)`,
              gap: 3,
              padding: 3,
              borderRadius: 3,
              boxSizing: 'border-box',
              transition: 'box-shadow 0.15s, outline 0.15s',
              outline: snapshot.isDraggingOver
                ? '2px solid #3b82f6'
                : '2px solid transparent',
              boxShadow: snapshot.isDraggingOver
                ? '0 0 0 4px rgba(59,130,246,0.25), 0 4px 20px rgba(0,0,0,0.5)'
                : '0 2px 8px rgba(0,0,0,0.4)',
              cursor: 'default',
            }}
  // Hover ring via inline JS (no Tailwind needed)
            onMouseEnter={e => { if (!snapshot.isDraggingOver) e.currentTarget.style.outline = '2px solid rgba(59,130,246,0.5)'; }}
            onMouseLeave={e => { if (!snapshot.isDraggingOver) e.currentTarget.style.outline = '2px solid transparent'; }}
          >
            {/* Glass panes — pointerEvents:none so the mouse passes through to the Droppable */}
            {Array.from({ length: safeBays * safeDlos }).map((_, i) => (
              <div key={i} style={{ background: glassColor, borderRadius: 1, pointerEvents: 'none' }} />
            ))}

            {/* Modifier overlays */}
            {modifiers?.map((mod) => {
              const def = MODIFIER_OVERLAYS[mod];
              return def ? (
                <React.Fragment key={mod}>
                  {def.render(visualWidth, visualHeight)}
                </React.Fragment>
              ) : null;
            })}
          </div>

          {/* Dimensions */}
          <div style={{
            fontSize: '0.6rem',
            marginTop: 6,
            color: 'var(--text-secondary)',
            fontWeight: 500,
            letterSpacing: '0.03em',
          }}>
            {width}&quot; × {height}&quot;
          </div>

          {/* Modifier badge strip */}
          {modifiers && modifiers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4, justifyContent: 'center', maxWidth: visualWidth + 16 }}>
              {modifiers.map((mod) => {
                const def = MODIFIER_OVERLAYS[mod];
                const label = def?.label ?? mod.replace('modifier-', '').replace(/-/g, ' ');
                return (
                  <span key={mod} style={{
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    padding: '2px 5px',
                    borderRadius: 4,
                    background: 'rgba(0,123,255,0.12)',
                    border: '1px solid rgba(0,123,255,0.25)',
                    color: '#60a5fa',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}>{label}</span>
                );
              })}
            </div>
          )}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
};

export default FrameWireframe;
