import React, { useState } from 'react';

const NAV_ITEMS = [
  { label: '🖥️  Takeoff', key: 'takeoff', prop: 'onOpenTakeoff' },
  { label: '📐  Frame Builder', key: 'frame-builder', prop: 'onOpenFrameBuilder' },
  { label: '📊  Executive Dashboard', key: 'executive-dashboard', prop: 'onOpenExecutive' },
  { label: '🛒  Bid Cart', key: null, prop: 'onOpenBidCart' },
];

function SystemCard({ sys, selected, onSelect }) {
  const isStudio = sys.type === 'studio-custom' || sys.type === 'studio-frame-import';
  const isFrameImport = sys.type === 'studio-frame-import';
  const borderColor = selected
    ? 'var(--accent-blue)'
    : sys.status === 'completed'
    ? '#10b981'
    : 'var(--border-subtle)';

  return (
    <div
      onClick={() => onSelect(sys.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.45rem 0.65rem',
        background: selected ? 'rgba(0,123,255,0.08)' : 'var(--bg-card)',
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--accent-blue)';
          e.currentTarget.style.background = 'rgba(0,123,255,0.05)';
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = borderColor;
          e.currentTarget.style.background = 'var(--bg-card)';
        }
      }}
    >
      <span style={{
        fontSize: '0.78rem', fontWeight: 600,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        flex: 1, minWidth: 0,
      }}>
        {sys.name}
      </span>
      {isStudio && (
        <span style={{
          fontSize: '0.58rem', fontWeight: 700, flexShrink: 0,
          padding: '1px 5px', borderRadius: 5,
          background: isFrameImport ? 'rgba(96,165,250,0.15)' : 'rgba(167,139,250,0.15)',
          color: isFrameImport ? '#60a5fa' : '#a78bfa',
        }}>
          {isFrameImport ? '📐' : '📐'}
        </span>
      )}
    </div>
  );
}

export default function SystemsSidebar({
  systems = [],
  selectedSystemId,
  activeView,
  onSelect,
  onGoHome,
  onOpenTakeoff,
  onOpenFrameBuilder,
  onOpenExecutive,
  onOpenBidCart,
}) {
  const [completeExpanded, setCompleteExpanded] = useState(true);

  const needsWork = systems.filter(s => s.status !== 'completed');
  const complete  = systems.filter(s => s.status === 'completed');

  const handlers = { onOpenTakeoff, onOpenFrameBuilder, onOpenExecutive, onOpenBidCart };

  return (
    <div style={{
      width: 264,
      flexShrink: 0,
      borderLeft: '1px solid var(--border-subtle)',
      background: 'var(--bg-panel)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '0.85rem 1.1rem 0.75rem',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.12em',
        }}>
          Systems
        </span>
        <button
          onClick={onGoHome}
          title="Add new scope"
          style={{
            padding: '3px 10px',
            background: 'rgba(0,123,255,0.1)', color: 'var(--accent-blue)',
            border: 'none', borderRadius: 6,
            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,123,255,0.18)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,123,255,0.1)'; }}
        >
          + Add
        </button>
      </div>

      {/* ── Navigation ── */}
      <div style={{
        padding: '0.6rem 0.75rem',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column', gap: '0.35rem',
        flexShrink: 0,
      }}>
        {NAV_ITEMS.map(({ label, key, prop }) => {
          const active = key !== null && activeView === key;
          return (
            <button
              key={prop}
              onClick={handlers[prop]}
              style={{
                width: '100%', padding: '7px 10px',
                background: active ? 'rgba(0,123,255,0.1)' : 'var(--bg-card)',
                color: active ? 'var(--accent-blue)' : 'var(--text-primary)',
                border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                borderRadius: 7,
                fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.borderColor = 'var(--accent-blue)';
                  e.currentTarget.style.background = 'rgba(0,123,255,0.05)';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  e.currentTarget.style.background = 'var(--bg-card)';
                }
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Systems list ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>

        {/* Needs Work */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <span style={{
              fontSize: '0.62rem', fontWeight: 700,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              🔧 Needs Work
            </span>
            {needsWork.length > 0 && (
              <span style={{
                fontSize: '0.62rem', fontWeight: 700,
                padding: '1px 7px', borderRadius: 10,
                background: 'rgba(251,191,36,0.15)', color: '#f59e0b',
              }}>
                {needsWork.length}
              </span>
            )}
          </div>
          {needsWork.length === 0 ? (
            <div style={{
              padding: '0.75rem',
              border: '1px dashed var(--border-subtle)', borderRadius: 8,
              textAlign: 'center',
            }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                No pending systems
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {needsWork.map(sys => (
                <SystemCard
                  key={sys.id}
                  sys={sys}
                  selected={selectedSystemId === sys.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Complete */}
        <div>
          <div
            onClick={() => setCompleteExpanded(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              marginBottom: '0.5rem',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span style={{
              fontSize: '0.62rem', fontWeight: 700,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              ✓ Complete
            </span>
            {complete.length > 0 && (
              <span style={{
                fontSize: '0.62rem', fontWeight: 700,
                padding: '1px 7px', borderRadius: 10,
                background: 'rgba(16,185,129,0.15)', color: '#10b981',
              }}>
                {complete.length}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              {completeExpanded ? '▾' : '▸'}
            </span>
          </div>
          {completeExpanded && (
            complete.length === 0 ? (
              <div style={{
                padding: '0.75rem',
                border: '1px dashed var(--border-subtle)', borderRadius: 8,
                textAlign: 'center',
              }}>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  No completed systems yet
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {complete.map(sys => (
                  <SystemCard
                    key={sys.id}
                    sys={sys}
                    selected={selectedSystemId === sys.id}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )
          )}
        </div>

      </div>
    </div>
  );
}
