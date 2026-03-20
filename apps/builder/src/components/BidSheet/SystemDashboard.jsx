import React from 'react';

const SystemDashboard = ({ systems, onSelectSystem, onAddSystem, onDeleteSystem }) => {
  const pendingSystems   = (systems || []).filter(s => s.status !== 'completed');
  const completedSystems = (systems || []).filter(s => s.status === 'completed');

  const formatDate = (isoString) => {
    if (!isoString) return 'Never';
    const d = new Date(isoString);
    return d.toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const SystemCard = ({ sys, isCompleted }) => {
    const isStudioCard = sys.type === 'studio-custom' || sys.type === 'studio-frame-import';
    return (
    <div
      onClick={() => onSelectSystem(sys.id)}
      style={{
        background: 'var(--bg-card)',
        padding: '1.5rem',
        borderRadius: '12px',
        border: isCompleted ? '1px solid #10b981' : '1px solid var(--border-subtle)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        transition: 'transform 0.15s, box-shadow 0.15s',
        opacity: isCompleted ? 0.88 : 1,
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
        e.currentTarget.querySelector('.delete-btn').style.opacity = '1';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.querySelector('.delete-btn').style.opacity = '0';
      }}
    >
      {/* Delete button — appears on hover */}
      <button
        className="delete-btn"
        onClick={e => {
          e.stopPropagation();
          if (window.confirm(`Are you sure you want to delete "${sys.name}"? This cannot be undone.`)) {
            onDeleteSystem(sys.id);
          }
        }}
        style={{
          position: 'absolute', top: '0.75rem', right: '0.75rem',
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '6px', color: '#ef4444',
          width: '28px', height: '28px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', cursor: 'pointer',
          opacity: '0', transition: 'opacity 0.15s, background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
        title="Delete system"
      >
        ×
      </button>
      {/* Card header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: isCompleted ? '0' : '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {isStudioCard && (
            <span style={{
              background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
              border: '1px solid rgba(139,92,246,0.35)',
              padding: '1px 6px', borderRadius: '8px',
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em',
              flexShrink: 0,
            }}>📐 STUDIO</span>
          )}
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {sys.name}
          </h3>
        </div>
        {isCompleted && (
          <span style={{
            background: '#d1fae5', color: '#065f46',
            padding: '2px 8px', borderRadius: '12px',
            fontSize: '0.68rem', fontWeight: 700, flexShrink: 0, marginLeft: '0.5rem',
          }}>
            ✓ DONE
          </span>
        )}
      </div>

      {/* Quick stats */}
      <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
        {isStudioCard ? (
          <>
            <span>📐 {sys.totals?.totalQuantity || 0} highlights</span>
            <span>📏 {(sys.totals?.totalSF || 0).toFixed(1)} SF</span>
          </>
        ) : (
          <>
            <span>🖼 {sys.frames?.length || 0} frames</span>
            <span>📦 {sys.materials?.length || 0} materials</span>
          </>
        )}
      </div>

      {/* Cost if available */}
      {sys.totals?.totalCost > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Est. Cost</span>
          <span style={{ fontWeight: 700, color: '#34d399' }}>${sys.totals.totalCost.toFixed(2)}</span>
        </div>
      )}

      {/* Timestamp footer */}
      <div style={{
        marginTop: 'auto',
        paddingTop: '0.6rem',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.7rem',
        color: 'var(--text-secondary)',
      }}>
        <span>{sys.shortName || 'Imported'}</span>
        <span style={{ fontStyle: 'italic' }}>Modified: {formatDate(sys.lastModified)}</span>
      </div>
    </div>
  );
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '3rem' }}>

      {/* ── Needs Attention ── */}
      <div>
        <h2 style={{
          fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)',
          marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
        }}>
          ⏳ Needs Attention
          <span style={{
            background: 'var(--bg-panel)', color: 'var(--text-secondary)',
            padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
          }}>
            {pendingSystems.length}
          </span>
        </h2>

        {pendingSystems.length === 0 ? (
          <div style={{
            padding: '2rem', textAlign: 'center',
            background: 'var(--bg-panel)', borderRadius: '12px',
            border: '1px dashed var(--border-subtle)',
            color: 'var(--text-secondary)', fontSize: '0.9rem',
          }}>
            All systems are complete! 🎉
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {pendingSystems.map(sys => <SystemCard key={sys.id} sys={sys} isCompleted={false} />)}
          </div>
        )}

        <button
          onClick={onAddSystem}
          style={{
            width: '100%', marginTop: '1.25rem', padding: '0.9rem',
            background: 'transparent', color: 'var(--text-secondary)',
            border: '2px dashed var(--border-subtle)', borderRadius: '12px',
            fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          + Add Alternate / Blank System
        </button>
      </div>

      {/* ── Completed Systems ── */}
      {completedSystems.length > 0 && (
        <div>
          <h2 style={{
            fontSize: '1.15rem', fontWeight: 700, color: '#10b981',
            marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
            borderTop: '1px solid var(--border-subtle)', paddingTop: '2rem',
          }}>
            ✅ Completed Systems
            <span style={{
              background: '#d1fae5', color: '#065f46',
              padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
            }}>
              {completedSystems.length}
            </span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {completedSystems.map(sys => <SystemCard key={sys.id} sys={sys} isCompleted={true} />)}
          </div>
        </div>
      )}

    </div>
  );
};

export default SystemDashboard;

