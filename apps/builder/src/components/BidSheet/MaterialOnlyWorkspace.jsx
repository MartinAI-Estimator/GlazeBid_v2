import React, { useState, useEffect, useRef } from 'react';
import { useProject } from '../../context/ProjectContext';
import AccountingInput from './AccountingInput';

const DEFAULT_CATEGORIES = ['Aluminum (02-Metal)', 'Glass', 'Doors (Leaves)', 'Hardware Sets', 'Equipment', 'Caulking & Misc', 'Subcontractor / Labor'];

const MaterialOnlyWorkspace = ({ system, setImportedSystems, onComplete, onBack }) => {
  const { adminSettings } = useProject();
  const catLabels = adminSettings?.materialCategories?.length
    ? adminSettings.materialCategories.map(c => c.label)
    : DEFAULT_CATEGORIES;
  const [materials, setMaterials] = useState([]);
  const [suppliesPercent, setSuppliesPercent] = useState(0.5);
  const [contingencyPercent, setContingencyPercent] = useState(1.25);
  const [isTaxable, setIsTaxable] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(system.name);

  useEffect(() => {
    setMaterials(system?.materials || []);
    setSuppliesPercent(system?.materialConfig?.suppliesPercent ?? 0.5);
    setContingencyPercent(system?.materialConfig?.contingencyPercent ?? 1.25);
    setIsTaxable(system?.materialConfig?.isTaxable ?? true);
  }, [system.id]);

  const saveToMaster = (updatedMaterials, updatedSupplies, updatedContingency, updatedTaxable) => {
    const mats = updatedMaterials ?? materials;
    const sup  = updatedSupplies      ?? suppliesPercent;
    const cont = updatedContingency   ?? contingencyPercent;
    const tax  = updatedTaxable       ?? isTaxable;

    if (updatedMaterials !== null && updatedMaterials !== undefined)     setMaterials(mats);
    if (updatedSupplies !== null && updatedSupplies !== undefined)       setSuppliesPercent(sup);
    if (updatedContingency !== null && updatedContingency !== undefined) setContingencyPercent(cont);
    if (updatedTaxable !== null && updatedTaxable !== undefined)         setIsTaxable(tax);

    const subtotal        = mats.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const suppliesCost    = subtotal * (sup / 100);
    const contingencyCost = subtotal * (cont / 100);
    const finalCost       = subtotal + suppliesCost + contingencyCost;

    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id
        ? {
            ...sys,
            materials: mats,
            materialConfig: { suppliesPercent: sup, contingencyPercent: cont, isTaxable: tax },
            totals: { ...sys.totals, totalCost: finalCost },
          }
        : sys
    ));
  };

  const pendingFocusId = useRef(null);

  useEffect(() => {
    if (pendingFocusId.current) {
      const el = document.querySelector(`[data-first-input="${pendingFocusId.current}"]`);
      if (el) { el.focus(); pendingFocusId.current = null; }
    }
  }, [materials]);

  const handleAddLine    = () => { const newId = Date.now().toString(); pendingFocusId.current = newId; saveToMaster([...materials, { id: newId, category: catLabels[0] || '', description: '', cost: 0 }], null, null, null); };
  const handleUpdateLine = (id, field, value) => saveToMaster(materials.map(item => item.id === id ? { ...item, [field]: field === 'cost' ? parseFloat(value) || 0 : value } : item), null, null, null);
  const handleDeleteLine = (id) => saveToMaster(materials.filter(item => item.id !== id), null, null, null);

  const handleRename = (newName) => {
    const trimmed = newName.trim() || system.name;
    setNameValue(trimmed);
    setEditingName(false);
    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id ? { ...sys, name: trimmed } : sys
    ));
  };

  const subtotal  = materials.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
  const totalCost = subtotal + (subtotal * (suppliesPercent / 100)) + (subtotal * (contingencyPercent / 100));

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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Scope Total:</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>${totalCost.toFixed(2)}</span>
          </div>
          <button
            onClick={onComplete}
            style={{ padding: '8px 16px', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            ✅ Add to Project
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', width: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {materials.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No materials added. Click below to start building your quote.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{
                  background: 'var(--bg-panel)',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                }}>
                  <th style={{ padding: '1rem' }}>Category</th>
                  <th style={{ padding: '1rem' }}>Description</th>
                  <th style={{ padding: '1rem', width: '150px' }}>Cost</th>
                  <th style={{ padding: '1rem', width: '60px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {materials.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <select
                        value={item.category}
                        data-first-input={item.id}
                        onChange={e => handleUpdateLine(item.id, 'category', e.target.value)}
                        style={{
                          width: '100%', padding: '0.5rem', borderRadius: '4px',
                          background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {catLabels.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <input
                        type="text"
                        placeholder="Item description..."
                        value={item.description}
                        onChange={e => handleUpdateLine(item.id, 'description', e.target.value)}
                        style={{
                          width: '100%', padding: '0.5rem', borderRadius: '4px',
                          background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)', boxSizing: 'border-box',
                        }}
                      />
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>$</span>
                        <AccountingInput
                          value={item.cost || 0}
                          onChange={val => handleUpdateLine(item.id, 'cost', val)}
                          style={{
                            width: '100%', padding: '0.5rem', borderRadius: '4px',
                            background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
                            color: '#34d399', fontWeight: 'bold', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeleteLine(item.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ padding: '1rem', background: 'var(--bg-panel)', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={handleAddLine}
              style={{
                width: '100%', padding: '0.75rem', background: 'transparent',
                color: 'var(--accent-blue)', border: '1px dashed var(--accent-blue)',
                borderRadius: '6px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Add Line Item
            </button>
          </div>

          {/* Material Settings Footer */}
          <div style={{
            padding: '1.5rem',
            background: 'var(--bg-panel)',
            borderTop: '2px solid var(--border-subtle)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2rem',
          }}>

            {/* Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Supplies & Misc (%)</label>
                  <input
                    type="number" min="0" max="20" step="0.25"
                    value={suppliesPercent}
                    onChange={e => saveToMaster(null, Number(e.target.value) || 0, null, null)}
                    style={{
                      width: 72, padding: '4px 8px', borderRadius: 6,
                      background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
                      color: 'var(--accent-blue)', fontWeight: 700, fontSize: '0.85rem',
                      textAlign: 'right', outline: 'none',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Material Contingency (%)</label>
                  <input
                    type="number" min="0" max="30" step="0.25"
                    value={contingencyPercent}
                    onChange={e => saveToMaster(null, null, Number(e.target.value) || 0, null)}
                    style={{
                      width: 72, padding: '4px 8px', borderRadius: 6,
                      background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
                      color: '#f59e0b', fontWeight: 700, fontSize: '0.85rem',
                      textAlign: 'right', outline: 'none',
                    }}
                    onFocus={e => (e.target.style.borderColor = '#f59e0b')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                  />
                </div>
              </div>
            </div>

            {/* Totals Breakdown & Tax Toggle */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              background: 'var(--bg-card)',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Supplies & Contingency:</span>
                <span>+${(totalCost - subtotal).toFixed(2)}</span>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '0.5rem 0' }} />

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={isTaxable}
                  onChange={e => saveToMaster(null, null, null, e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Apply Material Tax</span>
              </label>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};

export default MaterialOnlyWorkspace;
