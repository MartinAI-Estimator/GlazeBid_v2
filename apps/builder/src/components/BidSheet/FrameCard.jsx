import React, { useState } from 'react';
import { getSystemCategory } from '../../utils/systemTypeConfig';

const FIELD_TO_MOD = {
  subsills: 'modifier-subsill',
  receptors: 'modifier-receptor',
  singles: 'modifier-door-single',
  pairs: 'modifier-door-pair',
  vents: 'modifier-vent',
  brake: 'modifier-brake-metal',
  steel: 'modifier-steel',
  ssg: 'modifier-ssg',
};

const MOD_TO_FIELD = Object.fromEntries(Object.entries(FIELD_TO_MOD).map(([field, modId]) => [modId, field]));

const FrameCard = ({ frame, frameIndex, activeTool, onFrameClick, onUpdateFrameField, systemType }) => {
  const [hovered, setHovered] = useState(false);
  const { id, mark, frame_number, width, height, quantity, panels, rows, bays, dlos, modifiers, gtBays, gtDlos } = frame;
  const displayName = mark || frame_number || `Frame ${id}`;
  const isStorefront = getSystemCategory(systemType || 'Ext SF') === 'storefront';

  const handleNumericChange = (field, value) => {
    const parsed = Math.max(0, Number(value) || 0);
    onUpdateFrameField?.(id, frameIndex, field, parsed);
  };

  const appliedModifiers = (() => {
    const merged = {};

    // Use numeric input fields as canonical source for mapped modifiers
    Object.entries(FIELD_TO_MOD).forEach(([field, modId]) => {
      const qty = Math.max(0, Number(frame[field]) || 0);
      if (qty > 0) merged[modId] = qty;
    });

    // Include non-mapped modifiers from paintbrush/sidebar workflow
    (modifiers || []).forEach((m) => {
      const modId = typeof m === 'string' ? m : m.id;
      const qty = typeof m === 'string' ? 1 : (m.qty || 1);
      if (MOD_TO_FIELD[modId]) return;
      merged[modId] = (merged[modId] || 0) + qty;
    });

    return Object.entries(merged).map(([modId, qty]) => ({ id: modId, qty }));
  })();

  return (
    <div
      onClick={() => onFrameClick && onFrameClick(id, frameIndex)}
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
              {displayName}
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
                {Number(panels) || Number(bays) || 1} Panels, {Number(rows) || 1} Rows
              </span>
            </div>
          </div>

          {/* Input controls aligned with line-item logic */}
          <div style={{ marginTop: '0.35rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-subtle)' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.45rem' }}>
              Input Controls
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isStorefront ? '1fr 1fr' : '1fr', gap: '0.45rem' }}>
              {isStorefront && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{'>'} Bays (high-work)</span>
                  <input
                    type='number'
                    min='0'
                    step='1'
                    value={gtBays || 0}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleNumericChange('gtBays', e.target.value)}
                    style={inputStyle}
                  />
                </label>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{'>'} DLOs (high-work)</span>
                <input
                  type='number'
                  min='0'
                  step='1'
                  value={gtDlos || 0}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleNumericChange('gtDlos', e.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>
          </div>

          {/* Modifiers drop zone */}
          <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              Applied Modifiers
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '32px', alignItems: 'center' }}>
              {appliedModifiers.length === 0 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', opacity: 0.7 }}>
                  {activeTool ? 'Click to apply…' : 'No modifiers'}
                </span>
              )}
              {appliedModifiers.map((modObj, idx) => {
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

const inputStyle = {
  padding: '4px 6px',
  borderRadius: 5,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-panel)',
  color: 'var(--text-primary)',
  fontSize: '0.74rem',
  fontVariantNumeric: 'tabular-nums',
};

export default FrameCard;
