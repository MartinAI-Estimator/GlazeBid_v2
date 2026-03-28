import React, { useState, useMemo } from 'react';
import { buildCostCodeReport, downloadCostCodeCSV } from './CostCodeExport';

// ─── Hr Function defaults (modifier labour hours) ────────────────────────────
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
  (typeof n === 'number' ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtPct = (n) =>
  (typeof n === 'number' ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

function gpmColor(pct) {
  if (pct >= 30) return '#34d399';
  if (pct >= 25) return '#fbbf24';
  return '#f87171';
}

const BidSummaryDashboard = ({
  projectName,
  importedSystems = [],
  customToolDefs = [],
  onBack,
  markupPercent: initMarkup    = 40,
  taxPercent:    initTax       = 8.2,
  laborRate:     initLaborRate = 42,
  onMarkupChange,
  onTaxChange,
}) => {
  const [markupPercent, setMarkupPercent] = useState(initMarkup);
  const [taxPercent,    setTaxPercent]    = useState(initTax);
  const [isTaxExempt,  setIsTaxExempt]   = useState(false);

  const handleMarkupChange = (v) => { setMarkupPercent(v); onMarkupChange?.(v); };
  const handleTaxChange    = (v) => { setTaxPercent(v);    onTaxChange?.(v);    };

  // Build hr lookup for custom tools
  const customDefMap = useMemo(
    () => Object.fromEntries(customToolDefs.map(t => [t.id, t.hrPerUnit || 1.0])),
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
      baseLaborMHs  += shopMHs + fieldMHs + distMHs;

      const laborRate = Number(sys.productionRates?.laborRate) || initLaborRate || 42;
      const modMHs    = getModMHs(sys);
      modifierLaborMHs += modMHs;
      totalLaborCost   += (shopMHs + fieldMHs + distMHs + modMHs) * laborRate;
    });

    const subtotal = materialCost + totalLaborCost;

    // Tax on materials only — labor is not taxed
    const taxAmount = isTaxExempt ? 0 : materialCost * (taxPercent / 100);

    // Markup on COST only (materials + labor), NOT on cost+tax
    const markupAmount = subtotal * (markupPercent / 100);
    const finalBid     = subtotal + taxAmount + markupAmount;

    // GPM% = Markup / (Cost + Markup) — margin on revenue excluding tax
    const gpmDollars = markupAmount;
    const gpmPct     = (subtotal + markupAmount) > 0
      ? (markupAmount / (subtotal + markupAmount)) * 100
      : 0;

    return {
      materialCost,
      baseLaborMHs,
      modifierLaborMHs,
      totalLaborMHs: baseLaborMHs + modifierLaborMHs,
      totalLaborCost,
      subtotal,
      taxAmount,
      markupAmount,
      finalBid,
      gpmDollars,
      gpmPct,
    };
  }, [importedSystems, markupPercent, taxPercent, isTaxExempt, customDefMap, initLaborRate]);

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

        {/* Live GPM badge in sticky header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Projected GPM
            </span>
            <span style={{
              fontSize: '1.4rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums',
              color: gpmColor(totals.gpmPct), lineHeight: 1.1,
            }}>
              {fmtPct(totals.gpmPct)}%
            </span>
          </div>
          <button
            onClick={() => {
              const report = buildCostCodeReport(importedSystems, markupPercent, taxPercent, isTaxExempt);
              downloadCostCodeCSV(report, projectName);
            }}
            style={{
              padding: '5px 12px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              color: 'var(--text-secondary)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            ⬇ Export CSV
          </button>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project</p>
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{projectName}</p>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '2rem', boxSizing: 'border-box' }}>

        {/* KPI Cards — 4 cards including Projected GPM */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1.25rem' }}>
          {[
            {
              label: 'Total Materials',
              value: `$${fmt(totals.materialCost)}`,
              sub: `${importedSystems.length} system${importedSystems.length !== 1 ? 's' : ''}`,
              color: 'var(--text-primary)',
            },
            {
              label: 'Total Labor Hours',
              value: `${totals.totalLaborMHs.toFixed(1)} hrs`,
              sub: `Base: ${totals.baseLaborMHs.toFixed(1)} · Modifiers: ${totals.modifierLaborMHs.toFixed(1)}`,
              color: 'var(--accent-blue)',
            },
            {
              label: 'Total Labor Cost',
              value: `$${fmt(totals.totalLaborCost)}`,
              sub: 'All systems combined',
              color: 'var(--text-primary)',
            },
            {
              label: 'Projected GPM',
              value: `${fmtPct(totals.gpmPct)}%`,
              sub: `$${fmt(totals.gpmDollars)} gross profit`,
              color: gpmColor(totals.gpmPct),
            },
          ].map(card => (
            <div key={card.label} style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.label}</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '1.8rem', fontWeight: 800, color: card.color, fontVariantNumeric: 'tabular-nums' }}>{card.value}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Per-system breakdown table */}
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
                  const matCost   = (sys.materials || []).reduce((s, m) => s + (Number(m.cost) || 0), 0);
                  const shopMHs   = Number(sys.totals?.shopMHs)  || 0;
                  const fieldMHs  = Number(sys.totals?.fieldMHs) || 0;
                  const distMHs   = Number(sys.totals?.distMHs)  || 0;
                  const baseMHs   = shopMHs + fieldMHs + distMHs;
                  const modMHs    = getModMHs(sys);
                  const laborRate = Number(sys.productionRates?.laborRate) || initLaborRate || 42;
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

        {/* Phase 3: Alternates Rollup */}
        {(() => {
          // Gather all alternate line items across all systems
          const allLines = importedSystems.flatMap(sys => sys.materials || []);
          const altLines = allLines.filter(l => l.alternate && l.alternate !== '');
          if (altLines.length === 0) return null;

          // Group by alternate name
          const altGroups = {};
          altLines.forEach(l => {
            const key = l.alternate;
            if (!altGroups[key]) altGroups[key] = [];
            altGroups[key].push(l);
          });

          return (
            <div style={{ background: 'var(--bg-panel)', borderRadius: 12, border: '1px solid rgba(167,139,250,0.25)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Alternates
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(167,139,250,0.25)' }}>
                  {Object.keys(altGroups).length} alternate{Object.keys(altGroups).length !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  Not included in base bid total
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Alternate', 'Items', 'Add Cost', 'Markup', 'Add Total'].map(h => (
                      <th key={h} style={{ padding: '0.6rem 1.5rem', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(altGroups).map(([altName, lines], i) => {
                    const addCost    = lines.reduce((s, l) => s + (Number(l.cost) || 0), 0);
                    const addMarkup  = addCost * (markupPercent / 100);
                    const addTotal   = addCost + addMarkup;
                    return (
                      <tr key={altName} style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '0.85rem', background: i % 2 === 1 ? 'rgba(167,139,250,0.03)' : 'transparent' }}>
                        <td style={{ padding: '0.85rem 1.5rem', fontWeight: 700, color: '#a78bfa' }}>
                          ⟐ {altName}
                        </td>
                        <td style={{ padding: '0.85rem 1.5rem', color: 'var(--text-secondary)' }}>
                          {lines.length}
                        </td>
                        <td style={{ padding: '0.85rem 1.5rem', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          +${fmt(addCost)}
                        </td>
                        <td style={{ padding: '0.85rem 1.5rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          +${fmt(addMarkup)}
                        </td>
                        <td style={{ padding: '0.85rem 1.5rem', fontWeight: 700, color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}>
                          +${fmt(addTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* If-selected total */}
              <div style={{ padding: '0.85rem 1.5rem', background: 'rgba(167,139,250,0.05)', borderTop: '1px solid rgba(167,139,250,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  If all alternates accepted — Base + All Alternates:
                </span>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}>
                  ${fmt(
                    totals.finalBid +
                    Object.values(altGroups).reduce((s, lines) => {
                      const ac = lines.reduce((x, l) => x + (Number(l.cost) || 0), 0);
                      return s + ac + ac * (markupPercent / 100);
                    }, 0)
                  )}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Adjustments + Final Number */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2rem', alignItems: 'start' }}>

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
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                Applied to materials only — labor is not taxed
              </p>
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
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                Applied to cost (materials + labor) — before tax
              </p>
            </div>

            {/* GPM threshold reference panel */}
            <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, padding: '0.85rem 1rem' }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent-blue)' }}>
                Company GPM Thresholds
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {[
                  { range: '$0 – $250k', target: '≥ 30%', met: totals.gpmPct >= 30 },
                  { range: '$250k – $1M', target: '≥ 27%', met: totals.gpmPct >= 27 },
                ].map(row => (
                  <div key={row.range} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{row.range}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.target}</span>
                      <span style={{ fontSize: '0.65rem', color: row.met ? '#34d399' : '#f87171' }}>
                        {row.met ? '✓ Met' : '✗ Below'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* The Big Number */}
          <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: 12, border: '2px solid var(--accent-blue)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { label: 'Materials',                                                          value: totals.materialCost },
              { label: 'Labor',                                                              value: totals.totalLaborCost },
              { label: 'Subtotal',                                                           value: totals.subtotal, bold: true },
              { label: `Tax (${isTaxExempt ? 'exempt' : taxPercent + '%'} on materials)`,   value: totals.taxAmount },
              { label: `Markup (${markupPercent}% on cost)`,                                value: totals.markupAmount },
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

            {/* GPM breakdown box under the final number */}
            <div style={{
              marginTop: '0.25rem',
              padding: '0.85rem 1rem',
              background: `${gpmColor(totals.gpmPct)}18`,
              border: `1px solid ${gpmColor(totals.gpmPct)}50`,
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>
                  Projected GPM
                </span>
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: gpmColor(totals.gpmPct), fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPct(totals.gpmPct)}%
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                ${fmt(totals.gpmDollars)} gross profit · markup ÷ (cost + markup)
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default BidSummaryDashboard;
