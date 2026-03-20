import React, { useState, useMemo } from 'react';

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

const fmt = (n) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BidSummaryDashboard = ({
  projectName, importedSystems = [], customToolDefs = [], onBack,
  markupPercent: initMarkup = 20, taxPercent: initTax = 8.5,
  onMarkupChange, onTaxChange,
}) => {
  const [markupPercent, setMarkupPercent] = useState(initMarkup);
  const [taxPercent, setTaxPercent]       = useState(initTax);
  const [isTaxExempt, setIsTaxExempt]     = useState(false);

  // Sync changes back to workspace-level state
  const handleMarkupChange = (v) => { setMarkupPercent(v); onMarkupChange?.(v); };
  const handleTaxChange    = (v) => { setTaxPercent(v);    onTaxChange?.(v);    };

  // Build hr lookup for custom tools
  const customDefMap = useMemo(() =>
    Object.fromEntries(customToolDefs.map(t => [t.id, t.hrPerUnit || 1.0])),
    [customToolDefs]
  );

  // Helper: compute per-system modifier MHs
  const getModMHs = (sys) => {
    let mhs = 0;
    (sys.frames || []).forEach(frame => {
      (frame.modifiers || []).forEach(mod => {
        const modId = typeof mod === 'string' ? mod : mod.id;
        const qty   = typeof mod === 'string' ? 1  : (mod.qty || 1);
        const hr    = sys.customRates?.[modId]
                   ?? customDefMap[modId]
                   ?? DEFAULT_HR_FUNCTIONS[modId]
                   ?? 1.0;
        mhs += qty * hr;
      });
    });
    return mhs;
  };

  const totals = useMemo(() => {
    let materialCost     = 0;
    let baseLaborMHs     = 0;
    let modifierLaborMHs = 0;
    let totalLaborCost   = 0;

    importedSystems.forEach(sys => {
      materialCost += (sys.materials || []).reduce((s, m) => s + (Number(m.cost) || 0), 0);

      const shopMHs  = Number(sys.totals?.shopMHs)  || 0;
      const fieldMHs = Number(sys.totals?.fieldMHs) || 0;
      const distMHs  = Number(sys.totals?.distMHs)  || 0;
      baseLaborMHs += shopMHs + fieldMHs + distMHs;

      const laborRate = Number(sys.productionRates?.laborRate) || 42;
      const modMHs    = getModMHs(sys);
      modifierLaborMHs += modMHs;
      totalLaborCost   += (shopMHs + fieldMHs + distMHs + modMHs) * laborRate;
    });

    const subtotal     = materialCost + totalLaborCost;
    const taxAmount    = isTaxExempt ? 0 : materialCost * (taxPercent / 100);
    const markupAmount = subtotal * (markupPercent / 100);
    const finalBid     = subtotal + taxAmount + markupAmount;

    return {
      materialCost, baseLaborMHs, modifierLaborMHs,
      totalLaborMHs: baseLaborMHs + modifierLaborMHs,
      totalLaborCost, subtotal, taxAmount, markupAmount, finalBid,
    };
  }, [importedSystems, markupPercent, taxPercent, isTaxExempt, customDefMap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep)', overflowY: 'auto' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)',
        padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 10, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={onBack}
            style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '4px 8px', borderRadius: 6 }}
          >
            ← Back to Workspace
          </button>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Executive Bid Summary
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project</p>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{projectName}</p>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '2rem', boxSizing: 'border-box' }}>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
          {[
            { label: 'Total Materials',   value: `$${fmt(totals.materialCost)}`,   sub: `${importedSystems.length} system${importedSystems.length !== 1 ? 's' : ''}`, color: 'var(--text-primary)' },
            { label: 'Total Labor Hours', value: `${totals.totalLaborMHs.toFixed(1)} hrs`, sub: `Base: ${totals.baseLaborMHs.toFixed(1)} · Modifiers: ${totals.modifierLaborMHs.toFixed(1)}`, color: 'var(--accent-blue)' },
            { label: 'Total Labor Cost',  value: `$${fmt(totals.totalLaborCost)}`,  sub: 'All systems combined', color: 'var(--text-primary)' },
          ].map(card => (
            <div key={card.label} style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.label}</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '1.8rem', fontWeight: 800, color: card.color, fontVariantNumeric: 'tabular-nums' }}>{card.value}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Per-system breakdown */}
        {importedSystems.length > 0 && (
          <div style={{ background: 'var(--bg-panel)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>System Breakdown</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                  {['System', 'Frames', 'Materials', 'Base MHs', 'Mod MHs', 'Labor Cost'].map(h => (
                    <th key={h} style={{ padding: '0.6rem 1.5rem', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importedSystems.map(sys => {
                  const matCost  = (sys.materials || []).reduce((s, m) => s + (Number(m.cost) || 0), 0);
                  const shopMHs  = Number(sys.totals?.shopMHs)  || 0;
                  const fieldMHs = Number(sys.totals?.fieldMHs) || 0;
                  const distMHs  = Number(sys.totals?.distMHs)  || 0;
                  const baseMHs  = shopMHs + fieldMHs + distMHs;
                  const modMHs   = getModMHs(sys);
                  const laborRate = Number(sys.productionRates?.laborRate) || 42;
                  const laborCost = (baseMHs + modMHs) * laborRate;
                  return (
                    <tr key={sys.id} style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '0.85rem' }}>
                      <td style={{ padding: '0.85rem 1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{sys.name}</td>
                      <td style={{ padding: '0.85rem 1.5rem', color: 'var(--text-secondary)' }}>{sys.frames?.length || 0}</td>
                      <td style={{ padding: '0.85rem 1.5rem', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmt(matCost)}</td>
                      <td style={{ padding: '0.85rem 1.5rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{baseMHs.toFixed(2)}</td>
                      <td style={{ padding: '0.85rem 1.5rem', color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>{modMHs.toFixed(2)}</td>
                      <td style={{ padding: '0.85rem 1.5rem', color: '#34d399', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${fmt(laborCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Adjustments + Final Number */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2rem', alignItems: 'start' }}>

          {/* Controls */}
          <div style={{ background: 'var(--bg-panel)', padding: '2rem', borderRadius: 12, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Bid Adjustments</h3>

            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                <span>Material Tax Rate (%)</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 400 }}>
                  <input type="checkbox" checked={isTaxExempt} onChange={e => setIsTaxExempt(e.target.checked)} />
                  Tax Exempt
                </label>
              </label>
              <input
                type="number" step="0.1" value={taxPercent} disabled={isTaxExempt}
                onChange={e => handleTaxChange(Number(e.target.value))}
                style={{ width: '100%', padding: '0.7rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: isTaxExempt ? 'var(--bg-deep)' : 'var(--bg-card)', color: isTaxExempt ? 'var(--text-secondary)' : 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box', opacity: isTaxExempt ? 0.5 : 1 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Overhead & Profit Markup (%)
              </label>
              <input
                type="number" step="0.5" value={markupPercent}
                onChange={e => handleMarkupChange(Number(e.target.value))}
                style={{ width: '100%', padding: '0.7rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* The Big Number */}
          <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: 12, border: '2px solid var(--accent-blue)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { label: 'Materials',                                         value: totals.materialCost },
              { label: 'Labor',                                             value: totals.totalLaborCost },
              { label: 'Subtotal',                                          value: totals.subtotal, bold: true },
              { label: `Tax (${isTaxExempt ? 'exempt' : taxPercent + '%'})`,value: totals.taxAmount },
              { label: `Markup (${markupPercent}%)`,                        value: totals.markupAmount },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: row.bold ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: row.bold ? 700 : 400 }}>
                <span>{row.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>${fmt(row.value)}</span>
              </div>
            ))}

            <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '0.75rem', paddingTop: '1.25rem' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Final Bid Price</p>
              <p style={{ margin: '0.4rem 0 0', fontSize: '2.75rem', fontWeight: 900, color: '#34d399', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                ${fmt(totals.finalBid)}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default BidSummaryDashboard;
