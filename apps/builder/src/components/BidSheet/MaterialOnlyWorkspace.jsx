import React, { useState, useEffect } from 'react';
import SOWMaterialTracker from './SOWMaterialTracker';

const MaterialOnlyWorkspace = ({ system, setImportedSystems, onComplete, onBack }) => {
  const [lines, setLines]           = useState(system?.materials || []);
  const [markupPct, setMarkupPct]   = useState(system?.materialConfig?.markupPct ?? 40);
  const [taxPct, setTaxPct]         = useState(system?.materialConfig?.taxPct    ?? 8.2);
  const [isTaxExempt, setIsTaxExempt] = useState(system?.materialConfig?.isTaxExempt ?? false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue]     = useState(system.name);

  useEffect(() => {
    setLines(system?.materials || []);
    setMarkupPct(system?.materialConfig?.markupPct ?? 40);
    setTaxPct(system?.materialConfig?.taxPct    ?? 8.2);
    setIsTaxExempt(system?.materialConfig?.isTaxExempt ?? false);
  }, [system.id]);

  // Persist every change back to parent
  const handleLinesChange = (newLines) => {
    setLines(newLines);
    const baseCost = newLines.reduce((s, l) => s + (Number(l.cost) || 0), 0);
    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id
        ? {
            ...sys,
            materials: newLines,
            materialConfig: { markupPct, taxPct, isTaxExempt },
            totals: { ...sys.totals, totalCost: baseCost },
          }
        : sys
    ));
  };

  const handleRename = (newName) => {
    const trimmed = newName.trim() || system.name;
    setNameValue(trimmed);
    setEditingName(false);
    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id ? { ...sys, name: trimmed } : sys
    ));
  };

  const baseCost = lines.reduce((s, l) => s + (Number(l.cost) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep)' }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            ← Dashboard
          </button>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={e => handleRename(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setNameValue(system.name); setEditingName(false); } }}
              style={{
                fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)',
                background: 'var(--bg-deep)', border: '1px solid var(--accent-blue)',
                borderRadius: '6px', padding: '2px 8px', outline: 'none', minWidth: '200px',
              }}
            />
          ) : (
            <h2
              onClick={() => setEditingName(true)}
              title="Click to rename"
              style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', cursor: 'text', borderBottom: '1px dashed transparent' }}
              onMouseEnter={e => e.currentTarget.style.borderBottomColor = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
            >{nameValue}</h2>
          )}
          <span style={{
            background: 'rgba(59,130,246,0.15)',
            color: 'var(--accent-blue)',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}>
            MATERIAL ONLY
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Base Cost:</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>
              ${baseCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <button
            onClick={onComplete}
            style={{ padding: '8px 16px', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            ✅ Add to Project
          </button>
        </div>
      </div>

      {/* SOW Material Tracker */}
      <SOWMaterialTracker
        lines={lines}
        onChange={handleLinesChange}
        markupPct={markupPct}
        taxPct={taxPct}
        isTaxExempt={isTaxExempt}
      />
    </div>
  );
};

export default MaterialOnlyWorkspace;
