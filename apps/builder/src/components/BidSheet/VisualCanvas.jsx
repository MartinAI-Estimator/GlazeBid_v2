import React from 'react';
import FrameCard from './FrameCard';

const VisualCanvas = ({ systemName, frames, onBack, activeTool, onFrameClick }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--bg-deep)' }}>

      {/* Sticky header */}
      <div style={{
        flexShrink: 0,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-blue)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              ← Systems
            </button>
          )}
          {onBack && <span style={{ color: 'var(--border-subtle)' }}>|</span>}
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {systemName}
          </h2>
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '3px 10px',
          fontWeight: 600,
        }}>
          {frames.length} {frames.length === 1 ? 'Frame' : 'Frames'}
        </div>
      </div>

      {/* Scrollable canvas */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '1.5rem', backgroundColor: 'var(--bg-deep)' }}>
        {frames.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No frames loaded for this system.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1.5rem',
            paddingBottom: '2rem',
          }}>
            {frames.map((frame, idx) => (
              <FrameCard
                key={frame.id ?? idx}
                frame={{ ...frame, id: frame.id ?? String(idx) }}
                activeTool={activeTool}
                onFrameClick={onFrameClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VisualCanvas;
