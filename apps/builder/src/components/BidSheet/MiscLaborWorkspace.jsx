import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * MiscLaborWorkspace
 * Mirrors the Excel SOW Miscellaneous Labor section exactly.
 * Each line: Group | Description 1 | Description 2 | Qty | Hrs Per | Total Hrs | Cost
 * Auto-generates: Daily Cleaning (1 hr/day), Labor Contingency (2.5%), Shop Labor (0.7%)
 */

// ─── Standard Misc Labor groups — mirrors Excel SOW Misc Labor patterns ──────
const MISC_GROUPS = [
  'EX SF',
  'INT SF',
  'CW',
  'Glazing',
  'Fire Rated',
  'Hardware',
  'Other',
];

const AUTO_TASK_TYPES = [
  { id: 'daily-cleaning', label: 'Daily Cleaning',    qtyLabel: 'Days', hrsPer: 1,     pct: null,  icon: '🧹' },
  { id: 'labor-cont',     label: 'Labor Cont.',        qtyLabel: 'MHs',  hrsPer: 0.025, pct: 2.5,  icon: '🛡️' },
  { id: 'shop-labor',     label: 'Shops',              qtyLabel: 'SqFt', hrsPer: 0.007, pct: 0.7,  icon: '🏭' },
];

const fmt = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const inputBase = {
  padding: '0.4rem 0.5rem',
  borderRadius: 5,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-deep)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function MiscLaborWorkspace({
  system,
  setImportedSystems,
  onComplete,
  onBack,
  laborRate     = 42,
  crewSize      = 2,
  markupPct     = 40,
}) {
  const [tasks,       setTasks]       = useState([]);
  const [editingName, setEditingName] = useState(false);
  const [nameValue,   setNameValue]   = useState(system.name);
  const pendingFocusId = useRef(null);

  useEffect(() => {
    setTasks(system?.laborTasks || []);
    setNameValue(system.name);
  }, [system.id]);

  useEffect(() => {
    if (pendingFocusId.current) {
      const el = document.querySelector(`[data-first-input="${pendingFocusId.current}"]`);
      if (el) { el.focus(); pendingFocusId.current = null; }
    }
  }, [tasks]);

  // Push to master state
  const saveToMaster = useCallback((updatedTasks) => {
    setTasks(updatedTasks);
    const totalMHs = updatedTasks.reduce((s, t) => s + (Number(t.qty) || 0) * (Number(t.hrsPer) || 0), 0);
    const totalCost = totalMHs * laborRate;
    const markupAmt = totalCost * (markupPct / 100);
    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id
        ? {
            ...sys,
            laborTasks: updatedTasks,
            totals: {
              ...sys.totals,
              fieldMHs: totalMHs,
              totalCost: totalCost + markupAmt,
            },
          }
        : sys
    ));
  }, [system.id, laborRate, markupPct, setImportedSystems]);

  const handleAdd = (group = 'EX SF', alternate = '') => {
    const newId = `ml-${Date.now()}`;
    pendingFocusId.current = newId;
    saveToMaster([...tasks, {
      id: newId,
      group,
      desc1: '',
      desc2: '',
      qty: 1,
      hrsPer: 1,
      alternate,
      isAuto: false,
    }]);
  };

  const handleUpdate = (id, field, value) => {
    saveToMaster(tasks.map(t =>
      t.id === id
        ? { ...t, [field]: ['qty', 'hrsPer'].includes(field) ? parseFloat(value) || 0 : value }
        : t
    ));
  };

  const handleDelete = (id) => saveToMaster(tasks.filter(t => t.id !== id));

  const handleRename = (newName) => {
    const trimmed = newName.trim() || system.name;
    setNameValue(trimmed);
    setEditingName(false);
    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id ? { ...sys, name: trimmed } : sys
    ));
  };

  // ── Derived totals ────────────────────────────────────────────────────────
  const baseMHs   = tasks.reduce((s, t) => s + (Number(t.qty) || 0) * (Number(t.hrsPer) || 0), 0);
  const baseCost  = baseMHs * laborRate;
  const markupAmt = baseCost * (markupPct / 100);
  const totalBid  = baseCost + markupAmt;
  const daysOnsite = crewSize > 0 ? Math.ceil(baseMHs / (crewSize * 8)) || 0 : 0;

  // ── Group tasks by group name ─────────────────────────────────────────────
  const grouped = tasks.reduce((acc, t) => {
    const key = t.group || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep)' }}>

      {/* Header */}
      <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
            ← Dashboard
          </button>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          {editingName ? (
            <input autoFocus value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={e => handleRename(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setNameValue(system.name); setEditingName(false); } }}
              style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', background: 'var(--bg-deep)', border: '1px solid var(--accent-blue)', borderRadius: 6, padding: '2px 8px', outline: 'none', minWidth: 200 }}
            />
          ) : (
            <h2 onClick={() => setEditingName(true)} title="Click to rename"
              style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', cursor: 'text', borderBottom: '1px dashed transparent' }}
              onMouseEnter={e => e.currentTarget.style.borderBottomColor = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
            >{nameValue}</h2>
          )}
          <span style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700 }}>
            MISC LABOR
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total MHs</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>{baseMHs.toFixed(1)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total Bid</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>${fmt(totalBid)}</span>
            </div>
          </div>
          <button onClick={onComplete} style={{ padding: '8px 16px', background: '#10b981', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
            ✅ Add to Project
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Quick Add toolbar */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Add:</span>
          {MISC_GROUPS.map(g => (
            <button key={g} onClick={() => handleAdd(g)}
              style={{ padding: '4px 12px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              + {g}
            </button>
          ))}
          <button onClick={() => handleAdd('Other')}
            style={{ padding: '4px 12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, color: 'var(--accent-blue)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            + Custom
          </button>
        </div>

        {tasks.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>👷</span>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>No misc labor tasks yet</p>
            <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.82rem', lineHeight: 1.6, maxWidth: 340 }}>
              Add tasks like Daily Cleaning, Hardware Installs, Shop Labor, or Labor Contingency.
              Each line: Group · Description · Qty × Hrs Per = Total MHs → Cost.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {AUTO_TASK_TYPES.map(at => (
                <button key={at.id} onClick={() => handleAdd('EX SF')}
                  style={{ padding: '6px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  {at.icon} {at.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Task table */}
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-panel)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '0.5rem 0.75rem', width: 100 }}>Group</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>Description 1</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>Description 2</th>
                    <th style={{ padding: '0.5rem 0.75rem', width: 80, textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '0.5rem 0.75rem', width: 80, textAlign: 'right' }}>Hrs Per</th>
                    <th style={{ padding: '0.5rem 0.75rem', width: 80, textAlign: 'right' }}>Total Hrs</th>
                    <th style={{ padding: '0.5rem 0.75rem', width: 110, textAlign: 'right' }}>Cost</th>
                    <th style={{ padding: '0.5rem 0.75rem', width: 80, textAlign: 'right' }}>Markup</th>
                    <th style={{ padding: '0.5rem 0.75rem', width: 110, textAlign: 'right' }}>Total</th>
                    <th style={{ width: 36 }} />
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t, i) => {
                    const totalHrs  = (Number(t.qty) || 0) * (Number(t.hrsPer) || 0);
                    const lineCost  = totalHrs * laborRate;
                    const lineMU    = lineCost * (markupPct / 100);
                    const lineTotal = lineCost + lineMU;
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                        {/* Group */}
                        <td style={{ padding: '0.4rem 0.75rem' }}>
                          <select value={t.group || 'EX SF'} onChange={e => handleUpdate(t.id, 'group', e.target.value)}
                            style={{ ...inputBase, width: '100%', background: 'var(--bg-panel)', fontSize: '0.78rem' }}>
                            {MISC_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </td>
                        {/* Desc 1 */}
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <input type="text" value={t.desc1 || ''} data-first-input={t.id}
                            onChange={e => handleUpdate(t.id, 'desc1', e.target.value)}
                            placeholder="e.g. Installation, Daily Cleaning"
                            style={{ ...inputBase, width: '100%' }} />
                        </td>
                        {/* Desc 2 */}
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <input type="text" value={t.desc2 || ''}
                            onChange={e => handleUpdate(t.id, 'desc2', e.target.value)}
                            placeholder="Notes"
                            style={{ ...inputBase, width: '100%' }} />
                        </td>
                        {/* Qty */}
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                          <input type="number" min="0" step="1" value={t.qty || ''}
                            onChange={e => handleUpdate(t.id, 'qty', e.target.value)}
                            style={{ ...inputBase, width: 70, textAlign: 'right' }} />
                        </td>
                        {/* Hrs Per */}
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                          <input type="number" min="0" step="0.25" value={t.hrsPer || ''}
                            onChange={e => handleUpdate(t.id, 'hrsPer', e.target.value)}
                            style={{ ...inputBase, width: 70, textAlign: 'right' }} />
                        </td>
                        {/* Total Hrs */}
                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#60a5fa', fontSize: '0.88rem' }}>
                          {totalHrs.toFixed(2)}
                        </td>
                        {/* Cost */}
                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          ${fmt(lineCost)}
                        </td>
                        {/* Markup */}
                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          ${fmt(lineMU)}
                        </td>
                        {/* Total */}
                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                          ${fmt(lineTotal)}
                        </td>
                        {/* Delete */}
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                          <button onClick={() => handleDelete(t.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1rem', cursor: 'pointer', opacity: 0.6, lineHeight: 1, padding: '2px 4px' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-panel)', borderTop: '1px solid var(--border-subtle)' }}>
                <button onClick={() => handleAdd('EX SF')}
                  style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px dashed var(--accent-blue)', borderRadius: 6, color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                  + Add Task
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer summary */}
      {tasks.length > 0 && (
        <div style={{ flexShrink: 0, background: 'var(--bg-panel)', borderTop: '2px solid var(--border-subtle)', padding: '1rem 1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>Labor Summary</p>
            {[
              { label: 'Total MHs',    value: `${baseMHs.toFixed(1)} hrs` },
              { label: `@ $${laborRate}/hr`, value: `$${fmt(baseCost)}` },
              { label: `Markup (${markupPct}%)`, value: `$${fmt(markupAmt)}` },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <span>{row.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--text-primary)' }}>{row.value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>Total Bid (Misc Labor)</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 900, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>${fmt(totalBid)}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{daysOnsite} days onsite @ {crewSize} men</span>
          </div>
        </div>
      )}
    </div>
  );
}
