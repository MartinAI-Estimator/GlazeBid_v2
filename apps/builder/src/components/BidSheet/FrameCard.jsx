import React, { useState } from 'react';

const FrameCard = ({ frame, activeTool, onFrameClick }) => {
  const [hovered, setHovered] = useState(false);
  const { id, frame_number, width, height, quantity, bays, dlos, modifiers } = frame;

  return (
    <div
      onClick={() => onFrameClick && onFrameClick(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        borderRadius: '0.75rem',
        border: activeTool && hovered
          ? '2px solid var(--accent-blue)'
          : '1px solid var(--border-subtle)',
        backgroundColor: activeTool && hovered
          ? 'rgba(59, 130, 246, 0.05)'
          : 'var(--bg-card)',
        boxShadow: activeTool && hovered
          ? '0 4px 12px rgba(0,0,0,0.2)'
          : '0 1px 3px rgba(0,0,0,0.15)',
        transition: 'all 0.15s ease',
        minHeight: '160px',
        width: '100%',
        boxSizing: 'border-box',
        cursor: activeTool ? 'crosshair' : 'default',
      }}
    >
          {/* Header: frame number & quantity */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '0.75rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
              {frame_number}
            </h3>
            <span style={{
              backgroundColor: 'var(--bg-panel)',
              color: 'var(--text-secondary)',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: '0.72rem',
              fontWeight: 700,
              border: '1px solid var(--border-subtle)',
            }}>
              QTY: {quantity || 1}
            </span>
          </div>

          {/* Data grid: size + grid counts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.07em', marginBottom: 2 }}>Size</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {Number(width) || 0}" W × {Number(height) || 0}" H
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.07em', marginBottom: 2 }}>Grid</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {Number(bays) || 1} Bays, {Number(dlos) || 1} DLOs
              </span>
            </div>
          </div>

          {/* Modifiers drop zone */}
          <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              Applied Modifiers
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '32px', alignItems: 'center' }}>
              {(!modifiers || modifiers.length === 0) && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', opacity: 0.7 }}>
                  {activeTool ? 'Click to apply…' : 'No modifiers'}
                </span>
              )}
              {(modifiers || []).map(m => typeof m === 'string' ? { id: m, qty: 1 } : m).map((modObj, idx) => {
                const cleanLabel = modObj.id.replace('modifier-', '').replace(/-/g, ' ').toUpperCase();
                const isLift = modObj.id.includes('lift');
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', alignItems: 'center',
                      backgroundColor: 'var(--accent-blue)',
                      borderRadius: 4, overflow: 'hidden',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }}
                  >
                    <span style={{ color: '#fff', padding: '3px 8px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                      {cleanLabel}
                    </span>
                    {!isLift && modObj.qty > 1 && (
                      <span style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: '#fff', padding: '3px 6px', fontSize: '0.68rem', fontWeight: 800 }}>
                        ×{modObj.qty}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
    </div>
  );
};

export default FrameCard;
