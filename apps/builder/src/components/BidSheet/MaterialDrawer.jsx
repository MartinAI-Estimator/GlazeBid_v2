import React, { useState, useEffect, useRef } from 'react';
import { useProject } from '../../context/ProjectContext';
import AccountingInput from './AccountingInput';
import { COST_CODES } from './SOWMaterialTracker';

// --- Shared cell input style -------------------------------------------------
const cellInput = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.38rem 0.55rem',
  borderRadius: 5,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  outline: 'none',
  transition: 'border-color 0.12s, background 0.12s',
};

const cellInputFocus = {
  borderColor: 'var(--accent-blue)',
  background: 'var(--bg-deep)',
};

// --- Single cell input with focus styling ------------------------------------
function CellInput({ value, onChange, placeholder, dataAttr, style = {} }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ ...cellInput, ...(focused ? cellInputFocus : {}), ...style }}
      {...(dataAttr ? { 'data-first-input': dataAttr } : {})}
    />
  );
}

const MaterialDrawer = ({
  isDrawerOpen,
  toggleDrawer,
  activeSystemId,
  systemName,
  importedSystems,
  setImportedSystems,
  projectIsTaxExempt = false,
  inline = false,
}) => {
  const { adminSettings } = useProject();
  const categories = adminSettings?.materialCategories?.length ? adminSettings.materialCategories : [];

  const [materials, setMaterials] = useState([]);
  const [contingency, setContingency] = useState(1.25);
  const [supplies, setSupplies] = useState(0.5);
  const [applyTax, setApplyTax] = useState(!projectIsTaxExempt);

  // Sync local state when active system changes
  useEffect(() => {
    if (activeSystemId && importedSystems) {
      const system = importedSystems.find(s => s.id === activeSystemId);
      setMaterials(system?.materials || []);
    }
  }, [activeSystemId, isDrawerOpen]);

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
    const defaultCat = categories[0]?.label || '';
    saveToMaster([...materials, { id: newId, category: defaultCat, description: '', vendor: '', cost: 0 }]);
  };

  const handleUpdate = (id, field, value) => {
    saveToMaster(materials.map(item =>
      item.id !== id ? item : { ...item, [field]: field === 'cost' ? parseFloat(value) || 0 : value }
    ));
  };

  const handleDelete = (id) => saveToMaster(materials.filter(item => item.id !== id));

  // -- Derived totals ----------------------------------------------------------
  const baseCost = materials.reduce((s, m) => s + (Number(m.cost) || 0), 0);
  const contingencyCost = baseCost * (contingency / 100);
  const suppliesCost    = baseCost * (supplies    / 100);
  const finalTotal      = baseCost + contingencyCost + suppliesCost;
  const fmt = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // -- Container style ---------------------------------------------------------
  const containerStyle = inline
    ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }
    : {
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 520,
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border-subtle)',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', zIndex: 50,
        transform: isDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
      };

  // -- Table column widths -----------------------------------------------------
  const COL_CAT  = 160;
  const COL_DESC = undefined; // flex
  const COL_VEN  = 120;
  const COL_COST = 110;
  const COL_DEL  = 36;

  const thStyle = {
    padding: '0.55rem 0.6rem',
    fontSize: '0.63rem', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: 'var(--text-secondary)',
    background: 'var(--bg-deep)',
    borderBottom: '2px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  };

  const tdStyle = {
    padding: '0.2rem 0.3rem',
    borderBottom: '1px solid var(--border-subtle)',
    verticalAlign: 'middle',
  };

  // -- Auto-row: editable % + computed $ --------------------------------------
  const AutoRow = ({ label, pct, setPct, cost, stepVal, maxVal, accent }) => {
    const [focused, setFocused] = useState(false);
    return (
      <tr style={{ background: 'rgba(255,255,255,0.018)' }}>
        {/* Category cell � shows label as badge */}
        <td style={{ ...tdStyle, padding: '0.4rem 0.6rem' }}>
          <span style={{
            fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: `${accent}18`, color: accent, border: `1px solid ${accent}33`,
            whiteSpace: 'nowrap',
          }}>
            {label}
          </span>
        </td>

        {/* Description cell � shows editable % */}
        <td style={{ ...tdStyle, padding: '0.4rem 0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.79rem', color: 'var(--text-secondary)' }}>
            <span>Auto � </span>
            <input
              type="number"
              min="0" max={maxVal} step={stepVal}
              value={pct}
              onChange={e => setPct(parseFloat(e.target.value) || 0)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                width: 48, padding: '2px 5px', borderRadius: 4, fontSize: '0.79rem',
                background: focused ? 'var(--bg-deep)' : 'rgba(255,255,255,0.05)',
                border: focused ? `1px solid ${accent}` : '1px solid var(--border-subtle)',
                color: accent, fontWeight: 700, textAlign: 'right', outline: 'none',
              }}
            />
            <span>% of materials</span>
          </div>
        </td>

        {/* Vendor � empty */}
        <td style={{ ...tdStyle, padding: '0.4rem 0.6rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>�</td>

        {/* Cost */}
        <td style={{ ...tdStyle, padding: '0.4rem 0.6rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: accent, fontSize: '0.82rem' }}>
          ${fmt(cost)}
        </td>

        {/* No delete */}
        <td style={tdStyle} />
      </tr>
    );
  };

  return (
    <div style={containerStyle}>

      {/* -- Header -- */}
      <div style={{
        padding: '1.1rem 1.5rem',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Materials & Costs</h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Linked to: <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{systemName}</span>
          </p>
        </div>
        {!inline && (
          <button
            onClick={toggleDrawer}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
          >&times;</button>
        )}
      </div>

      {/* -- Scrollable table area -- */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: COL_CAT }} />
            <col /> {/* description stretches */}
            <col style={{ width: COL_VEN }} />
            <col style={{ width: COL_COST }} />
            <col style={{ width: COL_DEL }} />
          </colgroup>

          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>Category</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>Description</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>Vendor</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
              <th style={{ ...thStyle }} />
            </tr>
          </thead>

          <tbody>
            {materials.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.83rem', fontStyle: 'italic' }}>
                  No materials yet � click below to add a line item.
                </td>
              </tr>
            )}

            {materials.map((item, rowIdx) => (
              <tr
                key={item.id}
                style={{ background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
              >
                {/* Category */}
                <td style={tdStyle}>
                  <select
                    value={item.category}
                    onChange={e => handleUpdate(item.id, 'category', e.target.value)}
                    style={{
                      ...cellInput,
                      background: 'var(--bg-panel)',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent-blue)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)'; }}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.label}>{cat.label}</option>
                    ))}
                  </select>
                </td>

                {/* Description */}
                <td style={tdStyle}>
                  <CellInput
                    value={item.description}
                    onChange={v => handleUpdate(item.id, 'description', v)}
                    placeholder="Description"
                    dataAttr={item.id}
                  />
                </td>

                {/* Vendor */}
                <td style={tdStyle}>
                  <CellInput
                    value={item.vendor || ''}
                    onChange={v => handleUpdate(item.id, 'vendor', v)}
                    placeholder="Vendor"
                  />
                </td>

                {/* Cost */}
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <AccountingInput
                    value={item.cost || 0}
                    onChange={val => handleUpdate(item.id, 'cost', val)}
                    style={{
                      ...cellInput,
                      textAlign: 'right',
                      color: '#34d399',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent-blue)'; e.target.style.background = 'var(--bg-deep)'; }}
                    onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}
                  />
                </td>

                {/* Delete */}
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <button
                    onClick={() => handleDelete(item.id)}
                    title="Delete"
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--text-secondary)', fontSize: '0.9rem',
                      cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
                      lineHeight: 1,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
                  >?</button>
                </td>
              </tr>
            ))}

            {/* -- Auto rows: Contingency + Supplies -- */}
            {(baseCost > 0 || materials.length > 0) && (
              <>
                <AutoRow
                  label="Contingency"
                  pct={contingency}
                  setPct={setContingency}
                  cost={contingencyCost}
                  stepVal={0.25}
                  maxVal={20}
                  accent="#fbbf24"
                />
                <AutoRow
                  label="Supplies"
                  pct={supplies}
                  setPct={setSupplies}
                  cost={suppliesCost}
                  stepVal={0.1}
                  maxVal={10}
                  accent="#38bdf8"
                />
              </>
            )}
          </tbody>
        </table>

        {/* -- Add row button -- */}
        <div style={{ padding: '0.65rem 0.75rem' }}>
          <button
            onClick={handleAddMaterial}
            style={{
              width: '100%', padding: '0.55rem',
              background: 'transparent',
              border: '1.5px dashed var(--accent-blue)',
              borderRadius: 7,
              color: 'var(--accent-blue)',
              fontWeight: 600, fontSize: '0.82rem',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            + Add Material / Subcontractor
          </button>
        </div>
      </div>

      {/* -- Pinned footer: Apply Tax + Total -- */}
      <div style={{ flexShrink: 0, background: 'var(--bg-panel)', borderTop: '1px solid var(--border-subtle)', padding: '0.85rem 1.25rem' }}>

        {/* Apply Tax toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Apply Tax</label>
            {projectIsTaxExempt && (
              <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>Project is Tax Exempt</p>
            )}
          </div>
          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: projectIsTaxExempt ? 'not-allowed' : 'pointer', opacity: projectIsTaxExempt ? 0.4 : 1 }}>
            <input
              type="checkbox"
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '0.65rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Total Linked Cost</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Incl. Contingency & Supplies</div>
          </div>
          <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
            ${fmt(finalTotal)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MaterialDrawer;