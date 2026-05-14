/**
 * BidCart — Bid Summary & Totals
 *
 * Aggregates all system cards added in GlazeBidWorkspace and shows
 * a clean executive summary with per-system cost breakdown and
 * a pricing waterfall.
 *
 * Data source: useBidProjectStore (populated by GlazeBidWorkspace).
 */

import React, { useState } from 'react';
import useBidProjectStore from '../../store/useBidProjectStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const usd = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : '$—';

const pct = (n) => (typeof n === 'number' ? `${n.toFixed(1)}%` : '—');

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, sub }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-bold text-white tracking-tight">{label}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function WaterfallRow({ label, value, accent, bold, indent, borderTop }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: borderTop ? '12px 16px' : '8px 16px',
      paddingLeft: indent ? 28 : 16,
      borderTop: borderTop ? '1px solid rgba(255,255,255,0.1)' : undefined,
      background: bold ? 'rgba(255,255,255,0.03)' : 'transparent',
    }}>
      <span style={{ fontSize: '0.75rem', color: accent || '#94a3b8', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: bold ? '0.95rem' : '0.78rem', fontWeight: bold ? 800 : 600, color: accent || '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BidCart({ project, onNavigate }) {
  const systems     = useBidProjectStore(s => s.systems);
  const recap       = useBidProjectStore(s => s.projectRecap);
  const bidSettings = useBidProjectStore(s => s.bidSettings);

  const [copied, setCopied] = useState(false);

  const { markupPercent = 20, taxPercent = 8.5 } = bidSettings;

  // Per-system table rows
  const systemRows = systems.map(sys => ({
    id:       sys.id,
    name:     sys.name || sys.shortName || 'System',
    type:     sys.type,
    matCost:  sys._computedMaterialCost || 0,
    labCost:  sys._computedLaborCost    || 0,
    eqCost:   sys._computedEquipCost    || 0,
    total:    (sys._computedMaterialCost || 0) + (sys._computedLaborCost || 0) + (sys._computedEquipCost || 0),
  }));

  // Project-wide aggregates (use pre-computed recap when available, else sum rows)
  const totalMat   = systemRows.reduce((s, r) => s + r.matCost,  0);
  const totalLab   = systemRows.reduce((s, r) => s + r.labCost,  0);
  const totalEq    = systemRows.reduce((s, r) => s + r.eqCost,   0);
  const hardCost   = recap?.totalCost   ?? (totalMat + totalLab + totalEq);
  const taxAmt     = recap?.taxAmount   ?? (totalMat * (taxPercent / 100));
  const markupAmt  = recap?.pricingAmount ?? (hardCost * (markupPercent / 100));
  const finalBid   = recap?.finalBid    ?? (hardCost + markupAmt);
  const gpmPct     = recap?.gpmPct      ?? (finalBid > 0 ? (markupAmt / finalBid) * 100 : 0);

  const buildCopyText = () => {
    const sysLines = systemRows.map(r =>
      `  ${r.name}: Mat ${usd(r.matCost)} + Lab ${usd(r.labCost)} = ${usd(r.total)}`
    ).join('\n');
    return [
      `── GlazeBid Summary: ${project?.name ?? 'Untitled'} ──`,
      ``,
      `Final Bid: ${usd(finalBid)} (${gpmPct.toFixed(1)}% GPM)`,
      ``,
      `Systems (${systemRows.length}):`,
      sysLines || '  (no systems)',
      ``,
      `Materials: ${usd(totalMat)}  Labor: ${usd(totalLab)}  Equipment: ${usd(totalEq)}`,
      `Tax (${taxPercent}%): ${usd(taxAmt)}  Markup: ${usd(markupAmt)}`,
    ].join('\n');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(buildCopyText())
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => alert('Clipboard copy failed.'));
  };

  const exportCSV = () => {
    const rows = [
      ['GlazeBid Summary', project?.name ?? ''],
      [],
      ['SYSTEM', 'MATERIALS', 'LABOR', 'EQUIPMENT', 'SUBTOTAL'],
      ...systemRows.map(r => [r.name, r.matCost.toFixed(2), r.labCost.toFixed(2), r.eqCost.toFixed(2), r.total.toFixed(2)]),
      [],
      ['TOTALS'],
      ['Total Materials', totalMat.toFixed(2)],
      ['Total Labor',     totalLab.toFixed(2)],
      ['Total Equipment', totalEq.toFixed(2)],
      [`Tax (${taxPercent}%)`, taxAmt.toFixed(2)],
      [`Markup (${markupPercent}%)`, markupAmt.toFixed(2)],
      ['FINAL BID', finalBid.toFixed(2)],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GlazeBid_${(project?.name ?? 'Export').replace(/\s+/g, '_')}.csv`;
    a.click();
  };

  const hasData = systemRows.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0b0e11] text-white font-sans">

      {/* ── Breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px', height: 32, background: '#0a0a0b', borderBottom: '1px solid #1f1f23', flexShrink: 0, fontSize: 11 }}>
        <button
          onClick={() => onNavigate?.('projectHome')}
          style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: 0 }}
        >
          ← {project?.name || project?.projectName || 'Project'}
        </button>
        <span style={{ color: '#3f3f46' }}>›</span>
        <span style={{ color: '#a1a1aa', fontWeight: 500 }}>Bid Summary</span>
      </div>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-500 flex items-center justify-center text-base shadow-lg shadow-emerald-900/40">
            💵
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Bid Summary</h1>
            <p className="text-[11px] text-slate-500">
              {project?.name ?? 'No project'} &mdash; {systemRows.length} system{systemRows.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate?.('bidsheet')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600/15 border border-blue-500/30 text-blue-300 hover:bg-blue-600/25 hover:border-blue-400/50 transition-all"
          >
            ← Edit in Bid Builder
          </button>
          <button
            onClick={exportCSV}
            disabled={!hasData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-40"
          >
            ↓ CSV
          </button>
          <button
            onClick={copyToClipboard}
            disabled={!hasData}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 ${
              copied
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
            }`}
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-8">

        {!hasData ? (
          /* ── Empty State ── */
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-24">
            <span className="text-5xl opacity-20">📋</span>
            <p className="text-slate-500 text-sm">No systems added yet.</p>
            <p className="text-slate-600 text-xs max-w-xs text-center">
              Open <strong className="text-slate-400">Bid Builder</strong>, add scope systems, and they will appear here automatically.
            </p>
            <button
              onClick={() => onNavigate?.('bidsheet')}
              className="mt-2 px-4 py-2 rounded-lg text-xs font-bold bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 transition-all"
            >
              Open Bid Builder →
            </button>
          </div>
        ) : (
          <>
            {/* ── 4 HERO SUMMARY CARDS ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

              <div className="rounded-xl border border-white/10 bg-[#0d1117] p-5 flex flex-col gap-1 border-t-[3px] border-t-amber-500/70">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80">Total Materials</span>
                <span className="text-2xl font-black tabular-nums text-white mt-1">{usd(totalMat)}</span>
                <span className="text-xs text-slate-500 mt-auto pt-2 border-t border-white/5">
                  + {usd(taxAmt)} tax ({taxPercent}%)
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0d1117] p-5 flex flex-col gap-1 border-t-[3px] border-t-blue-500/70">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">Total Labor</span>
                <span className="text-2xl font-black tabular-nums text-white mt-1">{usd(totalLab)}</span>
                <span className="text-xs text-slate-500 mt-auto pt-2 border-t border-white/5">
                  {systemRows.length} system{systemRows.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0d1117] p-5 flex flex-col gap-1 border-t-[3px] border-t-violet-500/70">
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400/80">Gross Profit</span>
                <span className="text-2xl font-black tabular-nums text-white mt-1">{usd(markupAmt)}</span>
                <span className="text-xs text-slate-500 mt-auto pt-2 border-t border-white/5">
                  <span className="font-bold text-violet-400">{pct(gpmPct)} GPM</span>
                  <span className="text-slate-600 ml-1">({markupPercent}% margin)</span>
                </span>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-[#003a80] to-[#001f3f] border border-blue-500/30 p-5 flex flex-col gap-1 shadow-xl shadow-blue-900/30 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/10 to-transparent pointer-events-none" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300/90 relative z-10">★ Final Bid</span>
                <span className="text-3xl font-black tabular-nums text-white mt-1 relative z-10 drop-shadow">{usd(finalBid)}</span>
                <span className="text-xs text-blue-300/60 mt-auto pt-2 border-t border-blue-500/20 relative z-10">
                  Hard cost {usd(hardCost)} ÷ (1 − {gpmPct.toFixed(1)}% GPM)
                </span>
              </div>
            </div>

            {/* ── TWO-COLUMN: System Breakdown + Bid Waterfall ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

              {/* SYSTEM COST BREAKDOWN */}
              <section>
                <SectionHeader
                  label="System Cost Breakdown"
                  sub="Per-system material, labor, and equipment costs from Bid Builder."
                />
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-white/[0.04] text-left">
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[35%]">System</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Materials</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Labor</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Equipment</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Subtotal</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center w-14"> </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {systemRows.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-white/[0.04] group cursor-pointer transition-colors"
                          onClick={() => {
                            useBidProjectStore.getState().setPendingEditSystemId(row.id);
                            onNavigate?.('bidsheet');
                          }}
                          title={`Open ${row.name} for editing`}
                        >
                          <td className="px-4 py-2.5 text-sm text-white font-medium">
                            <span className="group-hover:text-blue-300 transition-colors">{row.name}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-mono tabular-nums text-amber-300">{usd(row.matCost)}</td>
                          <td className="px-4 py-2.5 text-right text-sm font-mono tabular-nums text-blue-300">{usd(row.labCost)}</td>
                          <td className="px-4 py-2.5 text-right text-sm font-mono tabular-nums text-slate-400">
                            {row.eqCost > 0 ? usd(row.eqCost) : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-mono font-bold tabular-nums text-white">{usd(row.total)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-blue-400 border border-blue-500/0 group-hover:border-blue-500/40 group-hover:bg-blue-500/10 transition-all"
                            >
                              ✏️ Edit
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-white/[0.04] border-t border-white/10">
                        <td className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Project Totals</td>
                        <td className="px-4 py-3 text-right text-sm font-black text-amber-300 tabular-nums">{usd(totalMat)}</td>
                        <td className="px-4 py-3 text-right text-sm font-black text-blue-300 tabular-nums">{usd(totalLab)}</td>
                        <td className="px-4 py-3 text-right text-sm font-black text-slate-400 tabular-nums">{totalEq > 0 ? usd(totalEq) : '—'}</td>
                        <td className="px-4 py-3 text-right text-sm font-black text-white tabular-nums">{usd(hardCost)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {/* BID WATERFALL ── right column */}
              <section>
                <SectionHeader label="Bid Waterfall" sub="How the Final Bid price is built up." />
                <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/[0.06]">
                  <WaterfallRow label="Materials"             value={usd(totalMat)}  accent="#fbbf24" />
                  <WaterfallRow label={`Tax (${pct(taxPercent)})`} value={`+ ${usd(taxAmt)}`} accent="#f59e0b" indent />
                  <WaterfallRow label="Labor"                 value={usd(totalLab)}  accent="#60a5fa" />
                  {totalEq > 0 && (
                    <WaterfallRow label="Equipment"           value={usd(totalEq)}   accent="#a78bfa" />
                  )}
                  <WaterfallRow label="Hard Cost"             value={usd(hardCost)}  bold borderTop accent="#e2e8f0" />
                  <WaterfallRow label={`Gross Profit (${pct(gpmPct)})`} value={`+ ${usd(markupAmt)}`} accent="#a78bfa" />
                  <WaterfallRow label="★ Final Bid"           value={usd(finalBid)}  bold borderTop accent="#93c5fd" />
                </div>

                {/* Rates reference */}
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4b5563', marginBottom: 6 }}>Rates (set in Bid Builder)</div>
                  {[
                    { label: 'Tax rate',    value: pct(taxPercent)    },
                    { label: 'Margin',      value: pct(markupPercent) },
                    { label: 'GPM',         value: pct(gpmPct)        },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#6b7280', padding: '2px 0' }}>
                      <span>{label}</span>
                      <span style={{ color: '#9ca3af', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
