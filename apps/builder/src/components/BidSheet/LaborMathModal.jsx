import React, { useState, useEffect } from 'react';

// Default base hours for standard modifiers (editable by user per system)
const DEFAULT_HR_FUNCTIONS = {
  'modifier-door-single':   4.5,
  'modifier-door-pair':     8.0,
  'modifier-lift-required': 12.0,
  'modifier-vent':          1.5,
  'modifier-brake-metal':   0.5,
  'modifier-steel':         1.0,
  'modifier-subsill':       0.25,
  'modifier-ssg':           0.75,
};

const LaborMathModal = ({ isOpen, onClose, system, setImportedSystems, laborRate = 42, customToolDefs = [], crewSize = 2, laborContingency = 2.5 }) => {
  const [modifierData, setModifierData] = useState({});

  // Aggregate all modifier quantities from every frame in the system
  useEffect(() => {
    if (!isOpen || !system || !system.frames) return;

    // Build a lookup from custom tool defs: id → { label, hrPerUnit }
    const customDefMap = Object.fromEntries(
      customToolDefs.map(t => [t.id, { label: t.label, hrPerUnit: t.hrPerUnit || 1.0 }])
    );

    const aggregated = {};

    system.frames.forEach(frame => {
      (frame.modifiers || []).forEach(mod => {
        const modId  = typeof mod === 'string' ? mod  : mod.id;
        const qty    = typeof mod === 'string' ? 1    : (mod.qty || 1);

        if (!aggregated[modId]) {
          // Use custom tool label if available, otherwise derive from id
          const customDef = customDefMap[modId];
          const name = customDef
            ? customDef.label.toUpperCase()
            : modId.replace('modifier-custom-', '').replace('modifier-', '').replace(/-/g, ' ').toUpperCase();
          const defaultHr = customDef
            ? customDef.hrPerUnit
            : (DEFAULT_HR_FUNCTIONS[modId] ?? 1.0);

          aggregated[modId] = {
            id:         modId,
            name,
            count:      0,
            hrFunction: system.customRates?.[modId] ?? defaultHr,
          };
        }
        aggregated[modId].count += qty;
      });
    });

    setModifierData(aggregated);
  }, [isOpen, system]);

  const handleHrChange = (id, newHr) => {
    const value = parseFloat(newHr) || 0;
    setModifierData(prev => ({ ...prev, [id]: { ...prev[id], hrFunction: value } }));

    // Persist custom rate into system state so it survives re-opens
    setImportedSystems(prev =>
      prev.map(sys =>
        sys.id === system.id
          ? { ...sys, customRates: { ...(sys.customRates || {}), [id]: value } }
          : sys
      )
    );
  };

  // Grand totals with padding
  const rows = Object.values(modifierData);
  const grandModifierMhs  = rows.reduce((s, r) => s + r.count * r.hrFunction, 0);
  const baseFieldMHs      = Number(system?.totals?.fieldMHs) || 0;
  const totalBaseMHs      = baseFieldMHs + grandModifierMhs;
  const contingencyMHs    = totalBaseMHs * (laborContingency / 100);
  const daysOnsite        = Math.ceil(totalBaseMHs / (crewSize * 8)) || 0;
  const cleaningMHs       = daysOnsite * 1;
  const grandMhs          = totalBaseMHs + contingencyMHs + cleaningMHs;
  const grandCost         = grandMhs * laborRate;

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(3px)',
      zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-deep)',
        width: 820, maxWidth: '95vw', maxHeight: '90vh',
        borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-subtle)',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--bg-panel)',
          borderTopLeftRadius: 12, borderTopRightRadius: 12,
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              ⏱️ Labor Math & Modifiers
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {system?.name} &nbsp;·&nbsp; Labor Rate:&nbsp;
              <span style={{ color: '#34d399', fontWeight: 700 }}>${laborRate}/hr</span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: 4 }}
          >
            &times;
          </button>
        </div>

        {/* ── Table ── */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {rows.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '2rem' }}>
              No modifiers applied to this system yet.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{
                  borderBottom: '2px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  <th style={{ padding: '0.6rem 0.75rem 0.6rem 0' }}>Modifier</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Total Count</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Hr Function (per unit)</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Total MHs</th>
                  <th style={{ padding: '0.6rem 0 0.6rem 0.75rem', textAlign: 'right' }}>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const totalMhs = row.count * row.hrFunction;
                  const cost     = totalMhs * laborRate;
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.85rem 0.75rem 0.85rem 0', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        {row.name}
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {row.count}
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem' }}>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={row.hrFunction}
                          onChange={e => handleHrChange(row.id, e.target.value)}
                          style={{
                            width: 78,
                            padding: '0.35rem 0.5rem',
                            borderRadius: 5,
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-panel)',
                            color: 'var(--text-primary)',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', fontWeight: 700, color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>
                        {totalMhs.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.85rem 0 0.85rem 0.75rem', fontWeight: 700, color: '#34d399', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        ${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer totals ── */}
        {rows.length > 0 && (
          <div style={{
            padding: '1.25rem 1.5rem',
            borderTop: '2px solid var(--border-subtle)',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '2rem',
            alignItems: 'center',
            background: 'var(--bg-panel)',
            borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <div>Base Field Labor (PartnerPak) + Modifiers: <strong style={{ color: 'var(--text-primary)' }}>{totalBaseMHs.toFixed(1)} MHs</strong></div>
              <div>Calculated Days Onsite (@ {crewSize} men): <strong style={{ color: 'var(--text-primary)' }}>{daysOnsite} Days</strong></div>
              <div>Daily Cleaning (+1 hr/day): <strong style={{ color: 'var(--accent-blue)' }}>+{cleaningMHs.toFixed(1)} MHs</strong></div>
              <div>Labor Contingency ({laborContingency}%): <strong style={{ color: '#f59e0b' }}>+{contingencyMHs.toFixed(1)} MHs</strong></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: 2 }}>Final Padded Field Labor</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>{grandMhs.toFixed(1)} <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>MHs</span></div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                ${grandCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LaborMathModal;
