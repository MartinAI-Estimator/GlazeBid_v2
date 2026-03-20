import React, { useState } from 'react';

const MODIFIER_DEFS = [
  {
    id: 'modifier-door-single',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="2" width="12" height="20" rx="1" />
        <circle cx="13" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
    label: 'Single Door',
    color: '#3b82f6',
  },
  {
    id: 'modifier-door-pair',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="2" width="10" height="20" rx="1" />
        <rect x="13" y="2" width="10" height="20" rx="1" />
        <circle cx="10" cy="12" r="1" fill="currentColor" />
        <circle cx="14" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
    label: 'Door Pair',
    color: '#3b82f6',
  },
  {
    id: 'modifier-lift-required',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v10M8 6l4-4 4 4" />
        <rect x="4" y="14" width="16" height="8" rx="1" />
        <line x1="7" y1="14" x2="7" y2="22" />
        <line x1="17" y1="14" x2="17" y2="22" />
      </svg>
    ),
    label: 'Requires Lift',
    color: '#f59e0b',
  },
  {
    id: 'modifier-vent',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="10" rx="1" />
        <line x1="7" y1="7" x2="7" y2="17" />
        <line x1="12" y1="7" x2="12" y2="17" />
        <line x1="17" y1="7" x2="17" y2="17" />
      </svg>
    ),
    label: 'Vent',
    color: '#10b981',
  },
  {
    id: 'modifier-brake-metal',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3,18 8,6 16,6 21,18" />
        <line x1="6" y1="12" x2="18" y2="12" />
      </svg>
    ),
    label: 'Brake Metal',
    color: '#8b5cf6',
  },
  {
    id: 'modifier-steel',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="6" x2="20" y2="6" strokeWidth="3"/>
        <line x1="4" y1="12" x2="20" y2="12" strokeWidth="3"/>
        <line x1="4" y1="18" x2="20" y2="18" strokeWidth="3"/>
      </svg>
    ),
    label: 'Steel Reinf.',
    color: '#64748b',
  },
  {
    id: 'modifier-subsill',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="2" y1="18" x2="22" y2="18" strokeWidth="3"/>
        <line x1="4" y1="14" x2="20" y2="14" strokeWidth="1"/>
      </svg>
    ),
    label: '+ Subsill',
    color: '#0ea5e9',
  },
  {
    id: 'modifier-ssg',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 12h16M12 4v16" strokeDasharray="4 4"/>
      </svg>
    ),
    label: 'SSG (Silicone Glazed)',
    color: '#ec4899',
  },
];

const ToolPalette = ({ activeTool, setActiveTool, customTools, setCustomTools }) => {
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customHr, setCustomHr] = useState('');

  const handleSaveCustomTool = () => {
    if (!customName.trim()) {
      setIsAddingCustom(false);
      return;
    }
    const newTool = {
      id: `modifier-custom-${customName.trim().toLowerCase().replace(/\s+/g, '-')}`,
      icon: <span style={{ fontWeight: 900, fontSize: '1.2rem' }}>+</span>,
      label: customName.trim(),
      color: '#9333ea',
      hrPerUnit: parseFloat(customHr) || 1.0,
    };
    setCustomTools(prev => [...prev, newTool]);
    setCustomName('');
    setCustomHr('');
    setIsAddingCustom(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveCustomTool();
    if (e.key === 'Escape') { setIsAddingCustom(false); setCustomName(''); setCustomHr(''); }
  };

  const allTools = [...MODIFIER_DEFS, ...customTools];

  return (
    <div style={{ width: 220, flexShrink: 0, background: 'var(--bg-panel)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: 0 }}>Equip Modifiers</p>
      </div>

      <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
        {allTools.map((mod) => {
          const isActive = activeTool === mod.id;
          return (
            <button
              key={mod.id}
              onClick={() => setActiveTool(isActive ? null : mod.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.55rem 0.75rem', borderRadius: '8px',
                cursor: 'pointer', width: '100%', textAlign: 'left',
                border: isActive ? `2px solid ${mod.color}` : '1px solid var(--border-subtle)',
                background: isActive
                  ? `rgba(${mod.color === '#3b82f6' ? '59,130,246' : mod.color === '#f59e0b' ? '245,158,11' : mod.color === '#10b981' ? '16,185,129' : mod.color === '#8b5cf6' ? '139,92,246' : mod.color === '#9333ea' ? '147,51,234' : mod.color === '#0ea5e9' ? '14,165,233' : mod.color === '#ec4899' ? '236,72,153' : '100,116,139'},0.15)`
                  : 'var(--bg-card)',
                boxShadow: isActive ? `0 4px 12px rgba(0,0,0,0.15)` : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease',
                userSelect: 'none',
              }}
            >
              <span style={{ color: mod.color, opacity: 0.9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18 }}>{mod.icon}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{mod.label}</span>
            </button>
          );
        })}

        {/* Inline custom tool creator */}
        {!isAddingCustom ? (
          <button
            onClick={() => setIsAddingCustom(true)}
            style={{ padding: '0.55rem', marginTop: '0.5rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px dashed var(--border-subtle)', borderRadius: 8, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, textAlign: 'center', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            + New Custom Tool
          </button>
        ) : (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              autoFocus
              type="text"
              placeholder="e.g., Core Drill"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ width: '100%', padding: '0.4rem', borderRadius: 4, border: '1px solid var(--accent-blue)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Hr/unit:</span>
              <input
                type="number"
                step="0.25"
                min="0"
                placeholder="1.0"
                value={customHr}
                onChange={e => setCustomHr(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ flex: 1, padding: '0.35rem 0.4rem', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: '#34d399', fontSize: '0.75rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button onClick={handleSaveCustomTool} style={{ flex: 1, padding: '0.3rem', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>Add</button>
              <button onClick={() => { setIsAddingCustom(false); setCustomName(''); setCustomHr(''); }} style={{ flex: 1, padding: '0.3rem', background: 'var(--bg-panel)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          {activeTool ? 'Active! Click any frame to apply.' : 'Click a tool to equip it.'}
        </p>
      </div>
    </div>
  );
};

export default ToolPalette;
