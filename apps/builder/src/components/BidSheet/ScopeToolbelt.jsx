import React, { useState } from 'react';
import useBidStore from '../../store/useBidStore';
import { SYSTEM_PACKAGE_LIST } from '../../data/systemPackages';

// â”€â”€â”€ ENTIRE FILE REPLACED â€” see new contextual CAD design below â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ Scope map â€” four mathematical engines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const SCOPE_MAP = {
  GRID: [
    'Storefront',
    'Curtain Wall',
    'Window Wall',
    'Interior Storefront',
    'Interior Curtain Wall',
    'Fixed Window',
    'Fire Rated Framing',
  ],
  ASSEMBLY: [
    'All Glass Wall',
    'All Glass Door',
    'Transaction Window',
    'Drive-Thru Window',
    'Bullet Resistant',
    'Bi-Fold Door',
    'Automatic Sliding',
    'Aluminum Sliding',
    'Translucent Panel',
    'Skylight',
    'Interior Heavy Glass',
    'Back Painted Glazing',
    'HM/Wood Door Glazing',
    'Film',
  ],
  LINEAR: [
    'Brake Metal',
    'Flashing',
    'Column Cover',
    'Caulking',
    'Butt Joint',
    'Glass Handrail',
  ],
  COUNT: [
    'Aluminum Louver',
    'Windload Clip',
    'Deadload Clip',
    'Sunshade',
  ],
};

// â”€â”€â”€ Per-engine visual config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ENGINE_META = {
  GRID: {
    label: 'Grid',
    hint:  'Box â†’ Rows & Bays',
    color: '#60a5fa',
    dim:   'rgba(96,165,250,0.13)',
    border:'rgba(96,165,250,0.30)',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <rect x={3} y={3} width={7} height={7}/><rect x={14} y={3} width={7} height={7}/>
        <rect x={3} y={14} width={7} height={7}/><rect x={14} y={14} width={7} height={7}/>
      </svg>
    ),
  },
  ASSEMBLY: {
    label: 'Assembly',
    hint:  'Box â†’ SqFt + Hardware',
    color: '#a78bfa',
    dim:   'rgba(167,139,250,0.13)',
    border:'rgba(167,139,250,0.30)',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    ),
  },
  LINEAR: {
    label: 'Linear',
    hint:  'Line â†’ Linear Footage',
    color: '#fbbf24',
    dim:   'rgba(251,191,36,0.13)',
    border:'rgba(251,191,36,0.30)',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <line x1={2} y1={12} x2={22} y2={12}/>
        <line x1={2} y1={8}  x2={2}  y2={16}/>
        <line x1={22} y1={8} x2={22} y2={16}/>
      </svg>
    ),
  },
  COUNT: {
    label: 'Count',
    hint:  'Pin â†’ Unit Count',
    color: '#34d399',
    dim:   'rgba(52,211,153,0.13)',
    border:'rgba(52,211,153,0.30)',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx={12} cy={10} r={3}/>
      </svg>
    ),
  },
};

// â”€â”€â”€ Engine display order (Grid first â€” most common takeoff) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ENGINE_ORDER = ['GRID', 'LINEAR', 'COUNT', 'ASSEMBLY'];

// â”€â”€â”€ Thin hairline divider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Divider = () => (
  <div style={{ height: 1, background: '#1e2530', margin: '0 10px' }} />
);

// â”€â”€â”€ Project Frames accordion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ProjectFrames({ frames, activeFrameId, onSelectFrame }) {
  const [open, setOpen] = useState(frames.length > 0);

  // Auto-open when the first frame is saved
  React.useEffect(() => {
    if (frames.length > 0) setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames.length]);

  const accent = '#fbbf24';

  return (
    <div style={{ flexShrink: 0 }}>
      {/* â”€â”€ Header â”€â”€ */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px',
          background: 'transparent',
          border: 'none', borderTop: '1px solid #1e2530',
          cursor: 'pointer', textAlign: 'left',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: accent,
        }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <rect x={2} y={3} width={20} height={5} rx={1}/>
            <path d="M4 8v13M20 8v13M10 12h4"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1.2 }}>
            Project Frames
          </div>
          <div style={{ fontSize: '0.59rem', color: '#52525b', marginTop: 1, lineHeight: 1.2 }}>
            {frames.length === 0 ? 'None saved yet' : `${frames.length} condition${frames.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        {frames.length > 0 && (
          <span style={{
            fontSize: '0.6rem', fontWeight: 700, flexShrink: 0,
            background: 'rgba(251,191,36,0.15)', color: accent,
            borderRadius: 20, padding: '1px 6px',
          }}>{frames.length}</span>
        )}
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2.5}
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* â”€â”€ Frame list â”€â”€ */}
      {open && (
        <div style={{ paddingBottom: 6 }}>
          {frames.length === 0 ? (
            <div style={{ padding: '8px 12px 8px 44px', fontSize: '0.63rem', color: '#374151', fontStyle: 'italic', lineHeight: 1.5 }}>
              Save a frame to stamp it on any plan sheet.
            </div>
          ) : (
            frames.map(f => {
              const isActive = activeFrameId === f.frameId;
              const label    = f.elevationTag ?? f.frameId;
              const sub      = `${f.inputs?.width ?? '?'}"Ã—${f.inputs?.height ?? '?'}"${f.quantity > 1 ? ` Ã—${f.quantity}` : ''}`;
              return (
                <button
                  key={f.frameId}
                  type="button"
                  onClick={() => onSelectFrame?.(f.frameId)}
                  title={`${label} â€” ${f.systemType ?? ''}`}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 12px 5px 44px',
                    background: isActive ? 'rgba(251,191,36,0.1)' : 'transparent',
                    border: 'none',
                    borderLeft: `2px solid ${isActive ? accent : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.71rem', fontWeight: isActive ? 700 : 500, color: isActive ? accent : '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {label}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: '#52525b', marginTop: 1 }}>{sub}</div>
                  </div>
                  {f.quantity > 1 && (
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: accent, background: 'rgba(251,191,36,0.1)', borderRadius: 8, padding: '1px 5px', flexShrink: 0 }}>
                      Ã—{f.quantity}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ScopeToolbelt({
  onSelectScope,
  onSelectSavedFrame,
  activeSavedFrameId,
  onSelectSystem,
  activeSystemId,
}) {
  const frames = useBidStore(s => s.frames);

  // Which engine button is "equipped" â€” default Grid
  const [activeEngine, setActiveEngine] = useState('GRID');

  // Per-engine selected scope â€” remembers last choice independently
  const [engineScopes, setEngineScopes] = useState({
    GRID:     SCOPE_MAP.GRID[0],
    ASSEMBLY: SCOPE_MAP.ASSEMBLY[0],
    LINEAR:   SCOPE_MAP.LINEAR[0],
    COUNT:    SCOPE_MAP.COUNT[0],
  });

  const meta         = ENGINE_META[activeEngine];
  const currentScope = engineScopes[activeEngine];

  const handleEngineClick = (eng) => {
    setActiveEngine(eng);
    // Switch workspace immediately to this engine + its remembered scope
    if (typeof onSelectScope === 'function') onSelectScope(engineScopes[eng], eng);
  };

  const handleScopeChange = (scopeName) => {
    setEngineScopes(prev => ({ ...prev, [activeEngine]: scopeName }));
    if (typeof onSelectScope === 'function') onSelectScope(scopeName, activeEngine);
  };

  return (
    <div style={{
      width: 200,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0b0f14',
      borderRight: '1px solid #1e2530',
      flexShrink: 0,
      fontFamily: 'Inter, "Segoe UI", sans-serif',
      overflowX: 'hidden',
      overflowY: 'auto',
      userSelect: 'none',
    }}>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          SECTION 1 â€” TOOLBOX  (engine selector)
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div style={{ padding: '10px 10px 10px', flexShrink: 0 }}>
        <div style={{
          fontSize: '0.57rem', fontWeight: 800,
          color: '#374151', textTransform: 'uppercase', letterSpacing: '0.13em',
          marginBottom: 7,
        }}>
          Tool
        </div>

        {/* 2 Ã— 2 button grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {ENGINE_ORDER.map(eng => {
            const m        = ENGINE_META[eng];
            const isActive = activeEngine === eng;
            return (
              <button
                key={eng}
                type="button"
                onClick={() => handleEngineClick(eng)}
                title={m.hint}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 5,
                  padding: '9px 4px',
                  borderRadius: 8,
                  border: `1px solid ${isActive ? m.border : '#2d333b'}`,
                  background: isActive ? m.dim : 'rgba(255,255,255,0.02)',
                  color: isActive ? m.color : '#52525b',
                  cursor: 'pointer',
                  transition: 'all 0.13s',
                  outline: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.color = '#9ea7b3';
                    e.currentTarget.style.borderColor = '#3d4451';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.color = '#52525b';
                    e.currentTarget.style.borderColor = '#2d333b';
                  }
                }}
              >
                {/* Active highlight bar along the top edge */}
                {isActive && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: m.color, borderRadius: '8px 8px 0 0',
                  }} />
                )}
                {m.icon}
                <span style={{
                  fontSize: '0.62rem', fontWeight: isActive ? 700 : 600,
                  lineHeight: 1, letterSpacing: '0.01em',
                }}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Divider />

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          SECTION 2 â€” ACTIVE MATERIAL  (contextual scope + system)
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div style={{ padding: '10px 10px', flexShrink: 0 }}>
        <div style={{
          fontSize: '0.57rem', fontWeight: 800,
          color: '#374151', textTransform: 'uppercase', letterSpacing: '0.13em',
          marginBottom: 7,
        }}>
          Material
        </div>

        {/* Card */}
        <div style={{
          background: meta.dim,
          border: `1px solid ${meta.border}`,
          borderRadius: 9,
          overflow: 'hidden',
        }}>
          {/* Engine label strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px',
            borderBottom: `1px solid ${meta.border}`,
          }}>
            <span style={{ color: meta.color, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {meta.icon}
            </span>
            <span style={{
              fontSize: '0.62rem', fontWeight: 700, color: meta.color,
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              {meta.label} Engine
            </span>
          </div>

          {/* Scope select */}
          <div style={{ padding: '8px 8px 8px' }}>
            <div style={{ fontSize: '0.58rem', color: '#4b5563', fontWeight: 600, marginBottom: 4, paddingLeft: 1 }}>
              Scope
            </div>
            <div style={{ position: 'relative' }}>
              <select
                value={currentScope}
                onChange={e => handleScopeChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 26px 7px 9px',
                  background: '#0b0f14',
                  border: `1px solid ${meta.border}`,
                  borderRadius: 6,
                  color: meta.color,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = meta.color; }}
                onBlur={e => { e.target.style.borderColor = meta.border; }}
              >
                {SCOPE_MAP[activeEngine].map(scope => (
                  <option key={scope} value={scope}>{scope}</option>
                ))}
              </select>
              <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth={2.5}
                style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <div style={{ fontSize: '0.57rem', color: '#374151', marginTop: 5, paddingLeft: 1, lineHeight: 1.4 }}>
              {meta.hint}
            </div>
          </div>

          {/* System Package â€” GRID engine only */}
          {activeEngine === 'GRID' && (
            <div style={{ borderTop: `1px solid ${meta.border}`, padding: '8px 8px 8px' }}>
              <div style={{ fontSize: '0.58rem', color: '#4b5563', fontWeight: 600, marginBottom: 4, paddingLeft: 1 }}>
                System
              </div>
              <div style={{ position: 'relative' }}>
                <select
                  value={activeSystemId ?? ''}
                  onChange={e => { if (typeof onSelectSystem === 'function') onSelectSystem(e.target.value); }}
                  style={{
                    width: '100%',
                    padding: '6px 24px 6px 8px',
                    background: '#0b0f14',
                    border: '1px solid rgba(96,165,250,0.25)',
                    borderRadius: 6,
                    color: '#93c5fd',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                    appearance: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#60a5fa'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(96,165,250,0.25)'; }}
                >
                  {SYSTEM_PACKAGE_LIST.map(pkg => (
                    <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                  ))}
                </select>
                <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth={2.5}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              {/* Geometry hint for the selected system */}
              {(() => {
                const pkg = SYSTEM_PACKAGE_LIST.find(p => p.id === activeSystemId);
                if (!pkg) return null;
                return (
                  <div style={{ fontSize: '0.57rem', color: '#374151', marginTop: 4, paddingLeft: 1, lineHeight: 1.4 }}>
                    SL {pkg.geometry.verticalSightline}" Â· Bite {pkg.geometry.glassBite}" Â· {pkg.labor.fabLFPerHour} LF/hr
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      <Divider />

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          SECTION 3 â€” PROJECT FRAMES LIBRARY
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <ProjectFrames
        frames={frames}
        activeFrameId={activeSavedFrameId}
        onSelectFrame={id => { if (typeof onSelectSavedFrame === 'function') onSelectSavedFrame(id); }}
      />

    </div>
  );
}
