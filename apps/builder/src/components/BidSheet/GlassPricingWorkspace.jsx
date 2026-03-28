import React, { useState, useEffect, useCallback } from 'react';
import AccountingInput from './AccountingInput';

/**
 * GlassPricingWorkspace
 * Mirrors the Excel Glass sheet — per-lite pricing with:
 * $/SqFt, Surcharge factor (17%), Breakage factor (3%), Set-up, Total SqFt, Total Cost
 */

const GLASS_TYPES = [
  'Monolithic — Clear',
  'Monolithic — Tinted',
  'Monolithic — Starphire (Low-Iron)',
  'Laminated — Clear',
  'Laminated — Starphire',
  'IGU — Clear / Air',
  'IGU — Clear / Argon',
  'IGU — Starphire / Argon',
  'IGU — Low-E (SB70)',
  'IGU — Low-E (SB60)',
  'IGU — Back Painted',
  'Tempered — Clear',
  'Fire Rated',
  'Spandrel',
  'Other',
];

const BREAKOUT_OPTIONS = [
  'Exterior Storefront',
  'Interior Storefront',
  'Curtain Wall',
  'Glazing Only',
  'Other',
];

const DEFAULT_SURCHARGE = 0.17;  // 17% — matches Excel
const DEFAULT_BREAKAGE  = 0.03;  // 3%  — matches Excel

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

export default function GlassPricingWorkspace({
  system,
  setImportedSystems,
  onComplete,
  onBack,
  markupPct   = 40,
  taxPct      = 8.2,
  isTaxExempt = false,
}) {
  const [lites,       setLites]       = useState([]);
  const [surcharge,   setSurcharge]   = useState(DEFAULT_SURCHARGE);
  const [breakage,    setBreakage]    = useState(DEFAULT_BREAKAGE);
  const [editingName, setEditingName] = useState(false);
  const [nameValue,   setNameValue]   = useState(system.name);

  useEffect(() => {
    setLites(system?.glassLites || []);
    setSurcharge(system?.glassConfig?.surcharge ?? DEFAULT_SURCHARGE);
    setBreakage( system?.glassConfig?.breakage  ?? DEFAULT_BREAKAGE);
    setNameValue(system.name);
  }, [system.id]);

  // ── Compute per-lite derived values ───────────────────────────────────────
  const computeLite = (lite) => {
    const w          = Number(lite.widthIn)  || 0;
    const h          = Number(lite.heightIn) || 0;
    const qty        = Number(lite.qty)      || 0;
    const pricePerSF = Number(lite.pricePerSF) || 0;
    const setup      = Number(lite.setup)    || 0;
    const sfPerLite  = (w * h) / 144;
    const totalSF    = sfPerLite * qty;
    const rawCost    = totalSF * pricePerSF + setup;
    const withSurcharge = rawCost * (1 + surcharge);
    const withBreakage  = withSurcharge * (1 + breakage);
    return { sfPerLite, totalSF, rawCost, withSurcharge, totalCost: withBreakage };
  };

  // ── Push to master ─────────────────────────────────────────────────────────
  const saveToMaster = useCallback((updatedLites, newSurcharge, newBreakage) => {
    setLites(updatedLites);
    const sc  = newSurcharge ?? surcharge;
    const brk = newBreakage  ?? breakage;
    const totalCost = updatedLites.reduce((s, l) => {
      const c = computeLite({ ...l });
      return s + c.totalCost;
    }, 0);
    const taxAmt    = isTaxExempt ? 0 : totalCost * (taxPct / 100);
    const markupAmt = totalCost * (markupPct / 100);
    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id
        ? {
            ...sys,
            glassLites: updatedLites,
            glassConfig: { surcharge: sc, breakage: brk },
            materials: updatedLites.map(l => ({
              id: l.id,
              category: '02-GLSS',
              description: l.glassType || 'Glass',
              cost: computeLite(l).totalCost,
            })),
            totals: {
              ...sys.totals,
              totalCost: totalCost + taxAmt + markupAmt,
              totalGlassSqFt: updatedLites.reduce((s, l) => s + computeLite(l).totalSF, 0),
            },
          }
        : sys
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system.id, surcharge, breakage, taxPct, markupPct, isTaxExempt, setImportedSystems]);

  const handleAdd = () => {
    const newId = `gl-${Date.now()}`;
    saveToMaster([...lites, {
      id: newId, glassType: 'IGU — Clear / Argon', widthIn: 0, heightIn: 0,
      qty: 1, pricePerSF: 0, setup: 0, breakout: 'Exterior Storefront',
    }], null, null);
  };

  const handleUpdate = (id, field, value) => {
    saveToMaster(
      lites.map(l => l.id === id
        ? { ...l, [field]: ['widthIn','heightIn','qty','pricePerSF','setup'].includes(field) ? parseFloat(value) || 0 : value }
        : l
      ), null, null
    );
  };

  const handleDelete = (id) => saveToMaster(lites.filter(l => l.id !== id), null, null);

  const handleRename = (newName) => {
    const trimmed = newName.trim() || system.name;
    setNameValue(trimmed);
    setEditingName(false);
    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id ? { ...sys, name: trimmed } : sys
    ));
  };

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalSF   = lites.reduce((s, l) => s + computeLite(l).totalSF, 0);
  const totalCost = lites.reduce((s, l) => s + computeLite(l).totalCost, 0);
  const taxAmt    = isTaxExempt ? 0 : totalCost * (taxPct / 100);
  const markupAmt = totalCost * (markupPct / 100);
  const totalBid  = totalCost + taxAmt + markupAmt;

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
          <span style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700 }}>
            🪟 GLASS PRICING
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {/* Surcharge / Breakage controls */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.78rem' }}>
            <label style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              Surcharge
              <input type="number" step="0.01" min="0" max="1" value={surcharge}
                onChange={e => { const v = parseFloat(e.target.value) || 0; setSurcharge(v); saveToMaster(lites, v, null); }}
                style={{ ...inputBase, width: 60, textAlign: 'right', color: '#fbbf24', fontWeight: 700 }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>({(surcharge * 100).toFixed(0)}%)</span>
            </label>
            <label style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              Breakage
              <input type="number" step="0.01" min="0" max="0.5" value={breakage}
                onChange={e => { const v = parseFloat(e.target.value) || 0; setBreakage(v); saveToMaster(lites, null, v); }}
                style={{ ...inputBase, width: 60, textAlign: 'right', color: '#fbbf24', fontWeight: 700 }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>({(breakage * 100).toFixed(0)}%)</span>
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total Bid</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>${fmt(totalBid)}</span>
          </div>
          <button onClick={onComplete} style={{ padding: '8px 16px', background: '#10b981', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
            ✅ Add to Project
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        {lites.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            <span style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🪟</span>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>No glass lites yet</p>
            <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.82rem', lineHeight: 1.6, maxWidth: 340 }}>
              Add individual glass lites with dimensions, quantity, and $/SqFt pricing.
              Surcharge ({(DEFAULT_SURCHARGE * 100).toFixed(0)}%) and Breakage ({(DEFAULT_BREAKAGE * 100).toFixed(0)}%) are applied automatically.
            </p>
            <button onClick={handleAdd}
              style={{ padding: '8px 20px', background: 'var(--accent-blue)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
              + Add First Lite
            </button>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-panel)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Glass Type</th>
                  <th style={{ padding: '0.5rem 0.5rem' }}>Breakout</th>
                  <th style={{ padding: '0.5rem 0.5rem', width: 72, textAlign: 'right' }}>W (in)</th>
                  <th style={{ padding: '0.5rem 0.5rem', width: 72, textAlign: 'right' }}>H (in)</th>
                  <th style={{ padding: '0.5rem 0.5rem', width: 60, textAlign: 'right' }}>QTY</th>
                  <th style={{ padding: '0.5rem 0.5rem', width: 72, textAlign: 'right' }}>SqFt ea.</th>
                  <th style={{ padding: '0.5rem 0.5rem', width: 85, textAlign: 'right' }}>$/SqFt</th>
                  <th style={{ padding: '0.5rem 0.5rem', width: 75, textAlign: 'right' }}>Set-up</th>
                  <th style={{ padding: '0.5rem 0.5rem', width: 80, textAlign: 'right' }}>Total SF</th>
                  <th style={{ padding: '0.5rem 0.75rem', width: 110, textAlign: 'right' }}>Total Cost</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {lites.map((lite, i) => {
                  const d = computeLite(lite);
                  return (
                    <tr key={lite.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                      <td style={{ padding: '0.4rem 0.75rem' }}>
                        <select value={lite.glassType} onChange={e => handleUpdate(lite.id, 'glassType', e.target.value)}
                          style={{ ...inputBase, width: '100%', background: 'var(--bg-panel)', fontSize: '0.78rem', minWidth: 180 }}>
                          {GLASS_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <select value={lite.breakout || ''} onChange={e => handleUpdate(lite.id, 'breakout', e.target.value)}
                          style={{ ...inputBase, width: '100%', background: 'var(--bg-panel)', fontSize: '0.78rem' }}>
                          {BREAKOUT_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                        <input type="number" min="0" step="0.5" value={lite.widthIn || ''}
                          onChange={e => handleUpdate(lite.id, 'widthIn', e.target.value)}
                          style={{ ...inputBase, width: 68, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                        <input type="number" min="0" step="0.5" value={lite.heightIn || ''}
                          onChange={e => handleUpdate(lite.id, 'heightIn', e.target.value)}
                          style={{ ...inputBase, width: 68, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                        <input type="number" min="1" step="1" value={lite.qty || ''}
                          onChange={e => handleUpdate(lite.id, 'qty', e.target.value)}
                          style={{ ...inputBase, width: 56, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {d.sfPerLite.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                        <AccountingInput value={lite.pricePerSF || 0}
                          onChange={val => handleUpdate(lite.id, 'pricePerSF', val)}
                          style={{ ...inputBase, width: 80, textAlign: 'right', color: '#34d399', fontWeight: 700 }} />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                        <AccountingInput value={lite.setup || 0}
                          onChange={val => handleUpdate(lite.id, 'setup', val)}
                          style={{ ...inputBase, width: 70, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontSize: '0.85rem', fontWeight: 700, color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>
                        {d.totalSF.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        ${fmt(d.totalCost)}
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                        <button onClick={() => handleDelete(lite.id)}
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
            <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-panel)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={handleAdd}
                style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px dashed var(--accent-blue)', borderRadius: 6, color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                + Add Lite
              </button>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <span>Total SqFt: <strong style={{ color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>{totalSF.toFixed(2)}</strong></span>
                <span>Glass Cost: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmt(totalCost)}</strong></span>
                <span>Tax: <strong style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>${fmt(taxAmt)}</strong></span>
                <span>Markup ({markupPct}%): <strong style={{ color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>${fmt(markupAmt)}</strong></span>
                <span>Total Bid: <strong style={{ color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>${fmt(totalBid)}</strong></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
