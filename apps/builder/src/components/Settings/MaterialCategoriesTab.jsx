import React, { useState, useCallback } from 'react';
import { useProject } from '../../context/ProjectContext';

const DEFAULT_CATEGORIES = [
  { id: 'aluminum',      label: 'Aluminum (02-Metal)' },
  { id: 'glass',         label: 'Glass' },
  { id: 'doors',         label: 'Doors (Leaves)' },
  { id: 'hardware',      label: 'Hardware Sets' },
  { id: 'equipment',     label: 'Equipment' },
  { id: 'caulking',      label: 'Caulking & Misc' },
  { id: 'subcontractor', label: 'Subcontractor / Labor' },
];

export default function MaterialCategoriesTab() {
  const { adminSettings, setAdminSettings } = useProject();

  const stored = adminSettings?.materialCategories;
  const [categories, setCategories] = useState(
    () => (stored?.length ? stored : []).map(c => ({ ...c }))
  );
  const [saved, setSaved] = useState(false);

  const update = useCallback((id, field, value) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    setSaved(false);
  }, []);

  const add = () => {
    const newId = `cat_${Date.now()}`;
    setCategories(prev => [...prev, { id: newId, label: '' }]);
    setSaved(false);
  };

  const remove = (id) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    setSaved(false);
  };

  const moveUp = (index) => {
    if (index === 0) return;
    setCategories(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    setSaved(false);
  };

  const moveDown = (index) => {
    setCategories(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    setSaved(false);
  };

  const save = () => {
    const valid = categories.filter(c => c.label.trim());
    setCategories(valid);
    setAdminSettings(prev => ({ ...prev, materialCategories: valid }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetToDefaults = () => {
    setCategories(DEFAULT_CATEGORIES.map(c => ({ ...c })));
    setSaved(false);
  };

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 640, boxSizing: 'border-box' }}>

      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Material Groups
        </h2>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          These groups appear in the category dropdown when adding materials to a system card.
          Add, rename, reorder, or remove groups as needed.
        </p>
      </div>

      {/* Category rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        {categories.map((cat, index) => (
          <div key={cat.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
          }}>
            {/* Reorder buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
              <button
                onClick={() => moveUp(index)}
                disabled={index === 0}
                style={reorderBtn(index === 0)}
                title="Move up"
              >▲</button>
              <button
                onClick={() => moveDown(index)}
                disabled={index === categories.length - 1}
                style={reorderBtn(index === categories.length - 1)}
                title="Move down"
              >▼</button>
            </div>

            {/* Label input */}
            <input
              type="text"
              value={cat.label}
              onChange={e => update(cat.id, 'label', e.target.value)}
              placeholder="Category name…"
              style={{
                flex: 1,
                padding: '0.4rem 0.6rem',
                background: 'var(--bg-deep)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />

            {/* Delete */}
            <button
              onClick={() => remove(cat.id)}
              title="Remove category"
              style={{
                flexShrink: 0,
                background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 6, padding: '0.3rem 0.55rem',
                cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1,
              }}
            >✕</button>
          </div>
        ))}
      </div>

      {/* Add row button */}
      <button
        onClick={add}
        style={{
          width: '100%', padding: '0.55rem',
          background: 'transparent',
          border: '1.5px dashed var(--accent-blue)',
          borderRadius: 8, color: 'var(--accent-blue)',
          fontWeight: 600, fontSize: '0.85rem',
          cursor: 'pointer', marginBottom: '1.5rem',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        + Add Group
      </button>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button
          onClick={save}
          style={{
            padding: '0.55rem 1.5rem', borderRadius: 7,
            background: saved ? 'rgba(52,211,153,0.15)' : 'var(--accent-blue)',
            color: saved ? '#34d399' : '#fff',
            border: saved ? '1px solid #34d399' : 'none',
            fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {saved ? '✓ Saved' : 'Save Groups'}
        </button>
        <button
          onClick={resetToDefaults}
          style={{
            padding: '0.55rem 1.25rem', borderRadius: 7,
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}

const reorderBtn = (disabled) => ({
  background: 'transparent',
  border: 'none',
  color: disabled ? 'rgba(255,255,255,0.15)' : 'var(--text-secondary)',
  cursor: disabled ? 'default' : 'pointer',
  fontSize: '0.55rem',
  padding: '1px 3px',
  lineHeight: 1,
});
