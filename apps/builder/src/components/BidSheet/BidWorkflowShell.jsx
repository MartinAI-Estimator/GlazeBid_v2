import React, { useState, useMemo } from 'react';
import SOWMaterialTracker from './SOWMaterialTracker';
import LaborOnlyWorkspace from './LaborOnlyWorkspace';
import MiscLaborWorkspace from './MiscLaborWorkspace';
import GlassPricingWorkspace from './GlassPricingWorkspace';
import BidSummaryDashboard from './BidSummaryDashboard';

/**
 * BidWorkflowShell
 * Single-page tabbed bid workflow — mirrors the Excel sheet tab order.
 *
 * Tab order matches Excel:
 *   1. Job Setup    — project name, GC, bid date, scope notes
 *   2. Materials    — SOWMaterialTracker (breakout + cost codes)
 *   3. Labor        — field labor tasks + auto-calculated padding
 *   4. Glass        — per-lite pricing with surcharge + breakage
 *   5. Misc Labor   — daily cleaning, hardware, shop labor
 *   6. Summary      — BidSummaryDashboard with export
 *
 * No "back to dashboard" needed — everything lives on one screen.
 * The sticky footer shows the live running total at all times.
 */

const TABS = [
  { id: 'setup',     icon: '📋', label: 'Job Setup',   shortLabel: 'Setup'    },
  { id: 'materials', icon: '🔩', label: 'Materials',   shortLabel: 'Materials' },
  { id: 'labor',     icon: '👷', label: 'Field Labor', shortLabel: 'Labor'    },
  { id: 'glass',     icon: '🪟', label: 'Glass',       shortLabel: 'Glass'    },
  { id: 'misc',      icon: '🧹', label: 'Misc Labor',  shortLabel: 'Misc'     },
  { id: 'summary',   icon: '💰', label: 'Summary',     shortLabel: 'Summary'  },
];

const fmt = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function gpmColor(pct) {
  if (pct >= 30) return '#34d399';
  if (pct >= 25) return '#fbbf24';
  return '#f87171';
}

export default function BidWorkflowShell({
  project,
  bidSettings = {},
  onBidSettingsChange,
  onBack,
}) {
  const [activeTab, setActiveTab] = useState('setup');

  // Unified bid data — all workspaces read/write into this single state
  const [bid, setBid] = useState({
    // Job Setup
    projectName:   project || '',
    gcName:        '',
    bidDate:       new Date().toISOString().slice(0, 10),
    dueDate:       '',
    scopeNotes:    '',
    bidNumber:     '',

    // Material lines (SOWMaterialTracker format)
    materialLines: [],

    // Labor tasks (LaborOnlyWorkspace format)
    laborTasks: [],

    // Glass lites (GlassPricingWorkspace format)
    glassLites:  [],
    glassConfig: { surcharge: 0.17, breakage: 0.03 },

    // Misc labor tasks (MiscLaborWorkspace format)
    miscTasks: [],
  });

  const laborRate   = bidSettings.laborRate        ?? 42;
  const markupPct   = bidSettings.markupPercent    ?? 40;
  const taxPct      = bidSettings.taxPercent       ?? 8.2;
  const crewSize    = bidSettings.crewSize         ?? 2;
  const laborCont   = bidSettings.laborContingency ?? 2.5;

  // ── Live running totals ──────────────────────────────────────────────────
  const totals = useMemo(() => {
    // Materials
    const matBase = bid.materialLines
      .filter(l => !l.isAuto && !l.alternate)
      .reduce((s, l) => s + (Number(l.cost) || 0), 0);

    // Field labor
    const fieldMHs = bid.laborTasks
      .reduce((s, t) => s + (Number(t.qty) || 0) * (Number(t.hrsPer) || 0), 0);
    const fieldCost = fieldMHs * laborRate;

    // Glass
    const glassCost = bid.glassLites.reduce((s, l) => {
      const sf  = (Number(l.widthIn) * Number(l.heightIn)) / 144 * (Number(l.qty) || 1);
      const raw = sf * (Number(l.pricePerSF) || 0) + (Number(l.setup) || 0);
      return s + raw * (1 + (bid.glassConfig?.surcharge ?? 0.17)) * (1 + (bid.glassConfig?.breakage ?? 0.03));
    }, 0);

    // Misc labor
    const miscMHs  = bid.miscTasks.reduce((s, t) => s + (Number(t.qty) || 0) * (Number(t.hrsPer) || 0), 0);
    const miscCost = miscMHs * laborRate;

    const totalCost    = matBase + fieldCost + glassCost + miscCost;
    const taxAmt       = totalCost * (taxPct / 100);
    const markupAmt    = totalCost * (markupPct / 100);
    const finalBid     = totalCost + taxAmt + markupAmt;
    const gpmPct       = (totalCost + markupAmt) > 0
      ? (markupAmt / (totalCost + markupAmt)) * 100 : 0;

    return { matBase, fieldMHs, fieldCost, glassCost, miscCost, miscMHs, totalCost, taxAmt, markupAmt, finalBid, gpmPct };
  }, [bid, laborRate, markupPct, taxPct]);

  // ── Completion signals — which tabs have data ────────────────────────────
  const tabStatus = {
    setup:     bid.projectName.length > 0,
    materials: bid.materialLines.filter(l => !l.isAuto).length > 0,
    labor:     bid.laborTasks.length > 0,
    glass:     bid.glassLites.length > 0,
    misc:      bid.miscTasks.length > 0,
    summary:   totals.finalBid > 0,
  };

  // ── Adapters: translate flat bid state into workspace-compatible shapes ──
  // BidSummaryDashboard expects importedSystems[]
  const importedSystemsForSummary = useMemo(() => {
    const systems = [];
    if (bid.materialLines.length > 0) {
      systems.push({
        id: 'materials', name: 'Materials', type: 'material-only',
        materials: bid.materialLines,
        totals: { shopMHs: 0, fieldMHs: 0, distMHs: 0 },
      });
    }
    if (bid.laborTasks.length > 0) {
      systems.push({
        id: 'labor', name: 'Field Labor', type: 'labor-only',
        materials: [],
        totals: { fieldMHs: totals.fieldMHs, shopMHs: 0, distMHs: 0 },
        productionRates: { laborRate },
      });
    }
    if (bid.glassLites.length > 0) {
      systems.push({
        id: 'glass', name: 'Glass', type: 'glass-pricing',
        materials: bid.glassLites.map(l => ({
          id: l.id, costCode: '02-GLSS',
          description: l.glassType,
          cost: (() => {
            const sf  = (Number(l.widthIn) * Number(l.heightIn)) / 144 * (Number(l.qty) || 1);
            const raw = sf * (Number(l.pricePerSF) || 0) + (Number(l.setup) || 0);
            return raw * (1 + (bid.glassConfig?.surcharge ?? 0.17)) * (1 + (bid.glassConfig?.breakage ?? 0.03));
          })(),
        })),
        totals: { shopMHs: 0, fieldMHs: 0, distMHs: 0 },
      });
    }
    if (bid.miscTasks.length > 0) {
      systems.push({
        id: 'misc', name: 'Misc Labor', type: 'misc-labor',
        materials: [],
        totals: { fieldMHs: totals.miscMHs, shopMHs: 0, distMHs: 0 },
        productionRates: { laborRate },
      });
    }
    return systems;
  }, [bid, totals, laborRate]);

  // Fake "system" shape for workspaces that expect system prop
  const laborSystem    = { id: 'bid-labor',     name: 'Field Labor', laborTasks: bid.laborTasks };
  const miscSystem     = { id: 'bid-misc',      name: 'Misc Labor',  laborTasks: bid.miscTasks  };
  const glassSystem    = { id: 'bid-glass',     name: 'Glass',       glassLites: bid.glassLites, glassConfig: bid.glassConfig };

  const fakeSetter = (key) => (updater) => {
    setBid(prev => {
      const systems = typeof updater === 'function' ? updater([{ ...prev, id: `bid-${key}` }]) : updater;
      const updated = Array.isArray(systems) ? systems[0] : systems;
      if (key === 'labor')     return { ...prev, laborTasks:    updated?.laborTasks    ?? prev.laborTasks };
      if (key === 'misc')      return { ...prev, miscTasks:     updated?.laborTasks    ?? prev.miscTasks };
      if (key === 'glass')     return { ...prev, glassLites: updated?.glassLites ?? prev.glassLites, glassConfig: updated?.glassConfig ?? prev.glassConfig };
      return prev;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0 1.5rem',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        flexShrink: 0,
        height: 52,
      }}>
        {/* Back + project name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            ← Projects
          </button>
          <span style={{ color: 'var(--border-subtle)' }}>·</span>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            {bid.projectName || 'Untitled Bid'}
          </span>
          {bid.bidNumber && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
              #{bid.bidNumber}
            </span>
          )}
        </div>

        {/* Workflow tabs — centered */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {TABS.map((tab, i) => {
            const isActive  = activeTab === tab.id;
            const isDone    = tabStatus[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0 1.1rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  color: isActive ? 'var(--accent-blue)' : isDone ? '#34d399' : 'var(--text-secondary)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                  marginBottom: -1,
                }}
              >
                <span style={{ fontSize: '0.9rem' }}>{isDone && !isActive ? '✓' : tab.icon}</span>
                {tab.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Live GPM in top-right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Projected GPM</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 900, color: gpmColor(totals.gpmPct), fontVariantNumeric: 'tabular-nums' }}>
              {totals.gpmPct.toFixed(1)}%
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Running Total</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
              ${fmt(totals.finalBid)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* TAB 1: Job Setup */}
        {activeTab === 'setup' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', maxWidth: 860, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Job Setup</h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Fill in the project details. This information appears on the proposal and bid summary.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              {[
                { key: 'projectName', label: 'Project Name *', placeholder: 'e.g. Highlands at Briargate — Storefront Package', full: true },
                { key: 'bidNumber',   label: 'Quote / Bid #',  placeholder: 'e.g. Q-197712' },
                { key: 'gcName',      label: 'General Contractor', placeholder: 'e.g. GH Phipps Construction' },
                { key: 'bidDate',     label: 'Bid Date',       type: 'date' },
                { key: 'dueDate',     label: 'Due Date / ITB Date', type: 'date' },
              ].map(field => (
                <div key={field.key} style={{ gridColumn: field.full ? '1 / -1' : 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {field.label}
                  </label>
                  <input
                    type={field.type || 'text'}
                    value={bid[field.key] || ''}
                    placeholder={field.placeholder}
                    onChange={e => setBid(prev => ({ ...prev, [field.key]: e.target.value }))}
                    style={{ padding: '0.65rem 0.85rem', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.92rem', outline: 'none', boxSizing: 'border-box', width: '100%' }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Scope Notes
              </label>
              <textarea
                value={bid.scopeNotes}
                onChange={e => setBid(prev => ({ ...prev, scopeNotes: e.target.value }))}
                placeholder="Describe the scope of work — system types, elevations, special conditions..."
                rows={4}
                style={{ padding: '0.65rem 0.85rem', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
              />
            </div>

            {/* Bid settings inline — so estimators set rates before entering costs */}
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
              <div style={{ padding: '0.65rem 1.25rem', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  ⚙️ Bid Rates — confirm before entering costs
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
                {[
                  { label: 'Labor Rate', key: 'laborRate',     unit: '$/hr', default: 42   },
                  { label: 'Crew Size',  key: 'crewSize',      unit: 'men',  default: 2    },
                  { label: 'Markup',     key: 'markupPercent', unit: '%',    default: 40   },
                  { label: 'Tax Rate',   key: 'taxPercent',    unit: '%',    default: 8.2  },
                  { label: 'Labor Cont.',key: 'laborContingency', unit: '%', default: 2.5  },
                ].map((f, i) => (
                  <div key={f.key} style={{ padding: '0.85rem 1rem', borderRight: i < 4 ? '1px solid var(--border-subtle)' : 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <input type="number" value={bidSettings[f.key] ?? f.default}
                        onChange={e => onBidSettingsChange?.({ ...bidSettings, [f.key]: Number(e.target.value) })}
                        style={{ flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 5, background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)', color: '#60a5fa', fontWeight: 700, fontSize: '0.95rem', textAlign: 'right', outline: 'none' }}
                      />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{f.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Next button */}
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setActiveTab('materials')}
                style={{ padding: '10px 24px', background: 'var(--accent-blue)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Next: Materials →
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Materials */}
        {activeTab === 'materials' && (
          <SOWMaterialTracker
            lines={bid.materialLines}
            onChange={lines => setBid(prev => ({ ...prev, materialLines: lines }))}
            markupPct={markupPct}
            taxPct={taxPct}
          />
        )}

        {/* TAB 3: Field Labor */}
        {activeTab === 'labor' && (
          <LaborOnlyWorkspace
            system={laborSystem}
            setImportedSystems={fakeSetter('labor')}
            onComplete={() => setActiveTab('glass')}
            onBack={() => setActiveTab('materials')}
            crewSize={crewSize}
            laborContingency={laborCont}
          />
        )}

        {/* TAB 4: Glass */}
        {activeTab === 'glass' && (
          <GlassPricingWorkspace
            system={glassSystem}
            setImportedSystems={fakeSetter('glass')}
            onComplete={() => setActiveTab('misc')}
            onBack={() => setActiveTab('labor')}
            markupPct={markupPct}
            taxPct={taxPct}
          />
        )}

        {/* TAB 5: Misc Labor */}
        {activeTab === 'misc' && (
          <MiscLaborWorkspace
            system={miscSystem}
            setImportedSystems={fakeSetter('misc')}
            onComplete={() => setActiveTab('summary')}
            onBack={() => setActiveTab('glass')}
            laborRate={laborRate}
            crewSize={crewSize}
            markupPct={markupPct}
          />
        )}

        {/* TAB 6: Summary */}
        {activeTab === 'summary' && (
          <BidSummaryDashboard
            projectName={bid.projectName || project}
            importedSystems={importedSystemsForSummary}
            onBack={() => setActiveTab('misc')}
            markupPercent={markupPct}
            taxPercent={taxPct}
            laborRate={laborRate}
          />
        )}
      </div>

      {/* ── Sticky footer — running cost bar ─────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '0.5rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        fontSize: '0.78rem',
      }}>
        {[
          { label: 'Materials',  value: `$${fmt(totals.matBase)}`,  color: 'var(--text-primary)' },
          { label: 'Field Labor',value: `$${fmt(totals.fieldCost)}`, color: 'var(--accent-blue)' },
          { label: 'Glass',      value: `$${fmt(totals.glassCost)}`, color: '#60a5fa' },
          { label: 'Misc Labor', value: `$${fmt(totals.miscCost)}`,  color: '#a78bfa' },
        ].map((item, i) => (
          <React.Fragment key={item.label}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{item.label}</span>
              <span style={{ fontWeight: 700, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</span>
            </div>
            {i < 3 && <span style={{ color: 'var(--border-subtle)' }}>+</span>}
          </React.Fragment>
        ))}
        <span style={{ color: 'var(--border-subtle)', marginLeft: 'auto' }}>→</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total Cost</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmt(totals.totalCost)}</span>
        </div>
        <span style={{ color: 'var(--border-subtle)' }}>+</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tax + Markup</span>
          <span style={{ fontWeight: 700, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>${fmt(totals.taxAmt + totals.markupAmt)}</span>
        </div>
        <span style={{ color: 'var(--border-subtle)' }}>=</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Final Bid</span>
          <span style={{ fontSize: '1rem', fontWeight: 900, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>${fmt(totals.finalBid)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: '0.5rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>GPM</span>
          <span style={{ fontSize: '1rem', fontWeight: 900, color: gpmColor(totals.gpmPct), fontVariantNumeric: 'tabular-nums' }}>{totals.gpmPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
