import React, { useState, useEffect, useRef } from 'react';
import MaterialDrawer from './MaterialDrawer';

const CustomSystemWorkspace = ({ system, importedSystems, setImportedSystems, onComplete, onBack, crewSize = 2, laborContingency = 2.5 }) => {
  const [tasks, setTasks] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(system.name);

  useEffect(() => {
    setTasks(system?.laborTasks || []);
  }, [system.id]);

  const saveToMaster = (updatedTasks) => {
    setTasks(updatedTasks);
    const baseMHs       = updatedTasks.reduce((sum, t) => sum + (Number(t.qty) || 0) * (Number(t.hrsPer) || 0), 0);
    const contMHs       = baseMHs * (laborContingency / 100);
    const daysOnsite    = Math.ceil(baseMHs / (crewSize * 8)) || 0;
    const cleaningMHs   = daysOnsite * 1;
    const finalMHs      = baseMHs + contMHs + cleaningMHs;
    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id
        ? {
            ...sys,
            laborTasks: updatedTasks,
            laborConfig: { baseMHs, contMHs, daysOnsite, cleaningMHs, crewSize },
            totals: { ...sys.totals, fieldMHs: finalMHs },
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
  }, [tasks]);

  const handleAddTask    = () => { const newId = Date.now().toString(); pendingFocusId.current = newId; saveToMaster([...tasks, { id: newId, description: '', qty: 1, hrsPer: 1 }]); };
  const handleUpdateTask = (id, field, value) => saveToMaster(tasks.map(t => t.id === id ? { ...t, [field]: value } : t));
  const handleDeleteTask = (id) => saveToMaster(tasks.filter(t => t.id !== id));

  const handleRename = (newName) => {
    const trimmed = newName.trim() || system.name;
    setNameValue(trimmed);
    setEditingName(false);
    setImportedSystems(prev => prev.map(sys =>
      sys.id === system.id ? { ...sys, name: trimmed } : sys
    ));
  };

  const laborMHs     = tasks.reduce((sum, t) => sum + (Number(t.qty) || 0) * (Number(t.hrsPer) || 0), 0);
  const laborRate    = system.productionRates?.laborRate || 42;
  // Padded labor hours
  const contMHs      = laborMHs * (laborContingency / 100);
  const daysOnsite   = Math.ceil(laborMHs / (crewSize * 8)) || 0;
  const cleaningMHs  = daysOnsite * 1;
  const paddedLaborMHs = laborMHs + contMHs + cleaningMHs;
  const laborCost    = paddedLaborMHs * laborRate;
  const materialCost = (system?.materials || []).reduce((sum, m) => sum + (Number(m.cost) || 0), 0);
  const totalCost    = laborCost + materialCost;

  return (
    <>
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
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#d97706',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>
              CUSTOM SYSTEM
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <button
              onClick={() => setIsDrawerOpen(true)}
              style={{
                padding: '6px 14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              📋 Materials
              <span style={{
                background: 'var(--bg-deep)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.7rem',
              }}>
                {system?.materials?.length || 0}
              </span>
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.5rem',
              borderLeft: '1px solid var(--border-subtle)',
              paddingLeft: '1.5rem',
            }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Scope Total:</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>${totalCost.toFixed(2)}</span>
            </div>

            <button
              onClick={onComplete}
              style={{ padding: '8px 16px', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              ✅ Add to Project
            </button>
          </div>
        </div>

        {/* Content (Labor Tasks) */}
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', width: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Labor Tasks</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Build your manual labor scope below. Use the "Materials" button in the top right to add hardware, glass, and metal.
            </p>
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            {tasks.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No labor tasks added yet.
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
                    <th style={{ padding: '1rem' }}>Task Description</th>
                    <th style={{ padding: '1rem', width: '120px' }}>Quantity</th>
                    <th style={{ padding: '1rem', width: '120px' }}>Hours Per</th>
                    <th style={{ padding: '1rem', width: '120px' }}>Total MHs</th>
                    <th style={{ padding: '1rem', width: '60px', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(item => {
                    const lineTotal = (Number(item.qty) || 0) * (Number(item.hrsPer) || 0);
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <input
                            type="text"
                            placeholder="e.g., Fabricate custom brake metal"
                            value={item.description}
                            data-first-input={item.id}
                            onChange={e => handleUpdateTask(item.id, 'description', e.target.value)}
                            style={{
                              width: '100%', padding: '0.5rem', borderRadius: '4px',
                              background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
                              color: 'var(--text-primary)', boxSizing: 'border-box',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <input
                            type="number"
                            min="0"
                            value={item.qty || ''}
                            onChange={e => handleUpdateTask(item.id, 'qty', Number(e.target.value))}
                            style={{
                              width: '100%', padding: '0.5rem', borderRadius: '4px',
                              background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
                              color: 'var(--text-primary)', boxSizing: 'border-box',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={item.hrsPer || ''}
                            onChange={e => handleUpdateTask(item.id, 'hrsPer', Number(e.target.value))}
                            style={{
                              width: '100%', padding: '0.5rem', borderRadius: '4px',
                              background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
                              color: 'var(--text-primary)', boxSizing: 'border-box',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
                          {lineTotal.toFixed(1)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteTask(item.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer' }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div style={{ padding: '1rem', background: 'var(--bg-panel)', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={handleAddTask}
                style={{
                  width: '100%', padding: '0.75rem', background: 'transparent',
                  color: 'var(--accent-blue)', border: '1px dashed var(--accent-blue)',
                  borderRadius: '6px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                + Add Labor Task
              </button>
            </div>
          </div>
        </div>

        {/* Labor Calculator Footer */}
        <div style={{ padding: '1.5rem 2rem', background: 'var(--bg-deep)', borderTop: '2px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span>Base Labor Hours:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{laborMHs.toFixed(1)} MHs</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span>Calculated Days Onsite:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{daysOnsite} Days <span style={{ fontSize: '0.72rem', fontWeight: 400 }}>(@ {crewSize} men)</span></span>
            </div>
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span>Daily Cleaning (1 hr/day):</span>
              <span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>+{cleaningMHs.toFixed(1)} MHs</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span>Labor Contingency ({laborContingency}%):</span>
              <span style={{ fontWeight: 700, color: '#f59e0b' }}>+{contMHs.toFixed(1)} MHs</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--bg-card)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>Final Padded Labor</span>
            <span style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--accent-blue)', lineHeight: 1 }}>{paddedLaborMHs.toFixed(1)} <span style={{ fontSize: '1rem', fontWeight: 600 }}>MHs</span></span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#34d399', marginTop: '0.35rem' }}>${laborCost.toFixed(2)} labor</span>
          </div>
        </div>
      </div>

      {/* Slide-out Drawer & Backdrop */}
      <MaterialDrawer
        isDrawerOpen={isDrawerOpen}
        toggleDrawer={() => setIsDrawerOpen(prev => !prev)}
        activeSystemId={system.id}
        systemName={system.name}
        importedSystems={importedSystems}
        setImportedSystems={setImportedSystems}
      />
      {isDrawerOpen && (
        <div
          onClick={() => setIsDrawerOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(2px)',
            zIndex: 49,
          }}
        />
      )}
    </>
  );
};

export default CustomSystemWorkspace;
