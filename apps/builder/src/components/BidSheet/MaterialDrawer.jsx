import React, { useState, useEffect, useRef } from 'react';
import { useProject } from '../../context/ProjectContext';
import AccountingInput from './AccountingInput';
import { COST_CODES } from './SOWMaterialTracker';

const DEFAULT_CATEGORIES = COST_CODES.map(c => ({
  id: c.code,
  icon: c.icon,
  label: `${c.code} — ${c.label.replace(/^\d{2}-/, '')}`,
}));

const inputBase = {
  padding: '0.45rem 0.6rem',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-deep)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  outline: 'none',
};

const MaterialDrawer = ({
  isDrawerOpen,
  toggleDrawer,
  activeSystemId,
  systemName,
  importedSystems,
  setImportedSystems,
  projectIsTaxExempt = false,
}) => {
  const { adminSettings } = useProject();
  const categories = (adminSettings?.materialCategories?.length ? adminSettings.materialCategories : DEFAULT_CATEGORIES);
  const catLabels = categories.map(c => c.label);

  const [materials, setMaterials] = useState([]);
  const [contingency, setContingency] = useState(1.25);
  const [supplies, setSupplies] = useState(0.5);
  const [applyTax, setApplyTax] = useState(!projectIsTaxExempt);

  // Sync local materials when the drawer opens or the active system changes
  useEffect(() => {
    if (activeSystemId && importedSystems) {
      const system = importedSystems.find(s => s.id === activeSystemId);
      setMaterials(system?.materials || []);
    }
  }, [activeSystemId, isDrawerOpen]);

  // Push local changes back to the master importedSystems state
  const saveToMaster = (updatedMaterials) => {
    setMaterials(updatedMaterials);
    if (setImportedSystems) {
      setImportedSystems(prev =>
        prev.map(sys =>
          sys.id === activeSystemId ? { ...sys, materials: updatedMaterials } : sys
        )
      );
    }
  };

  const pendingFocusId = useRef(null);

  useEffect(() => {
    if (pendingFocusId.current) {
      const el = document.querySelector(`[data-first-input="${pendingFocusId.current}"]`);
      if (el) { el.focus(); pendingFocusId.current = null; }
    }
  }, [materials]);

  const handleAddMaterial = () => {
    const newId = Date.now().toString();
    pendingFocusId.current = newId;
    const newItem = {
      id: newId,
      category: catLabels[0] || '',
      description: '',
      vendor: '',
      cost: 0,
    };
    saveToMaster([...materials, newItem]);
  };

  const handleUpdateMaterial = (id, field, value) => {
    const updated = materials.map(item => {
      if (item.id !== id) return item;
      return { ...item, [field]: field === 'cost' ? parseFloat(value) || 0 : value };
    });
    saveToMaster(updated);
  };

  const handleDeleteMaterial = (id) => {
    saveToMaster(materials.filter(item => item.id !== id));
  };

  const totalMaterialCost = materials.reduce((sum, m) => sum + (Number(m.cost) || 0), 0);
  const finalMaterialTotal = totalMaterialCost * (1 + contingency / 100 + supplies / 100);
  const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{
      position: 'fixed',
      top: 0, right: 0, bottom: 0,
      width: 420,
      background: 'var(--bg-card)',
      borderLeft: '1px solid var(--border-subtle)',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 50,
      transform: isDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
    }}>

      {/* Header */}
      <div style={{
        padding: '1.25rem 1.5rem',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Materials & Costs</h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Linked to: <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{systemName}</span>
          </p>
        </div>
        <button
          onClick={toggleDrawer}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
        >
          &times;
        </button>
      </div>

      {/* Scrollable material list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

        {materials.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem', fontSize: '0.85rem', fontStyle: 'italic' }}>
            No materials yet â€” starting with a blank slate.
          </div>
        )}

        {materials.map((item) => (
          <div
            key={item.id}
            style={{
              background: 'var(--bg-deep)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {/* Row 1: category select + delete */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={item.category}
                onChange={(e) => handleUpdateMaterial(item.id, 'category', e.target.value)}
                style={{ ...inputBase, flex: 1, background: 'var(--bg-panel)' }}
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.label}>{cat.icon} {cat.label}</option>
                ))}
              </select>
              <button
                onClick={() => handleDeleteMaterial(item.id)}
                title="Delete line item"
                style={{
                  background: 'rgba(239,68,68,0.12)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 6,
                  padding: '0.4rem 0.6rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Row 2: description */}
            <input
              type="text"
              placeholder="Description (e.g., Brake Metal 3-bend, Sub Installer)"
              value={item.description}
              data-first-input={item.id}
              onChange={(e) => handleUpdateMaterial(item.id, 'description', e.target.value)}
              style={{ ...inputBase, width: '100%', boxSizing: 'border-box' }}
            />

            {/* Row 3: vendor */}
            <input
              type="text"
              placeholder="Vendor (e.g., Oldcastle, AFC, Guardian)"
              value={item.vendor || ''}
              onChange={(e) => handleUpdateMaterial(item.id, 'vendor', e.target.value)}
              style={{ ...inputBase, width: '100%', boxSizing: 'border-box' }}
            />

            {/* Row 4: cost */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>$</span>
              <AccountingInput
                value={item.cost || 0}
                onChange={(val) => handleUpdateMaterial(item.id, 'cost', val)}
                style={{
                  ...inputBase,
                  flex: 1,
                  color: '#34d399',
                  fontWeight: 700,
                  fontSize: '1rem',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
          </div>
        ))}

        <button
          onClick={handleAddMaterial}
          style={{
            width: '100%',
            padding: '0.65rem',
            background: 'transparent',
            border: '1.5px dashed var(--accent-blue)',
            borderRadius: 8,
            color: 'var(--accent-blue)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          + Add Material / Subcontractor
        </button>
      </div>

      {/* Pinned footer: sliders + tax + total */}
      <div style={{ flexShrink: 0, background: 'var(--bg-panel)', borderTop: '1px solid var(--border-subtle)', padding: '1rem 1.25rem' }}>

        {/* Contingency input */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Contingency (%)</label>
          <input
            type="number" min="0" max="5" step="0.25"
            value={contingency}
            onChange={e => setContingency(parseFloat(e.target.value) || 0)}
            style={{
              width: 72, padding: '4px 8px', borderRadius: 6,
              background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
              color: 'var(--accent-blue)', fontWeight: 700, fontSize: '0.82rem',
              textAlign: 'right', outline: 'none',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
          />
        </div>

        {/* Supplies input */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Supplies (%)</label>
          <input
            type="number" min="0" max="5" step="0.1"
            value={supplies}
            onChange={e => setSupplies(parseFloat(e.target.value) || 0)}
            style={{
              width: 72, padding: '4px 8px', borderRadius: 6,
              background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
              color: 'var(--accent-blue)', fontWeight: 700, fontSize: '0.82rem',
              textAlign: 'right', outline: 'none',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
          />
        </div>

        {/* Tax toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', marginBottom: '0.5rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Apply Tax</label>
            {projectIsTaxExempt && (
              <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>Project is Tax Exempt</p>
            )}
          </div>
          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: projectIsTaxExempt ? 'not-allowed' : 'pointer', opacity: projectIsTaxExempt ? 0.4 : 1 }}>
            <input type="checkbox" style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              checked={projectIsTaxExempt ? false : applyTax}
              onChange={e => !projectIsTaxExempt && setApplyTax(e.target.checked)}
              disabled={projectIsTaxExempt}
            />
            <div style={{
              width: 40, height: 22, borderRadius: 11,
              background: applyTax && !projectIsTaxExempt ? 'var(--accent-blue)' : 'var(--border-subtle)',
              position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: 2,
                left: applyTax && !projectIsTaxExempt ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
              }} />
            </div>
          </label>
        </div>

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', marginTop: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Total Linked Cost</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Incl. Contingency & Supplies</div>
          </div>
          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
            ${fmt(finalMaterialTotal)}
          </span>
        </div>
      </div>

    </div>
  );
};

export default MaterialDrawer;
