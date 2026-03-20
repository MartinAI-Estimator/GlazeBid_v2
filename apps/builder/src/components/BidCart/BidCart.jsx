/**
 * BidCart — Bid Cart & Labor Engine
 *
 * Architecture:
 *   • Labor is ALWAYS parametric — derived from saved frame bom hours
 *   • Materials are ALWAYS lump-sum vendor quotes (no unit pricing)
 *   • Formula: Grand Total = (Labor + Materials + Tax) ÷ (1 − GPM%)
 *
 * Layout:
 *   1. Header bar + Financial Settings toggle
 *   2. Executive Summary — 4 hero cards
 *   3. Section A — Material & Vendor Quotes (editable lump-sum table)
 *   4. Section B — Labor Takeoff Breakdown (read-only, grouped by system)
 */

import React, { useState } from 'react';
import { useBidMath } from '../../hooks/useBidMath';
import useBidStore from '../../store/useBidStore';
import { useProject } from '../../context/ProjectContext';
import { saveProjectToCloud } from '../../utils/syncProject';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const usd = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : '$—';

const hrs = (n) => (typeof n === 'number' ? `${n.toFixed(1)} hrs` : '—');

// ─── Inline editable number cell ──────────────────────────────────────────────

function EditableCell({ value, onChange, prefix = '', placeholder = '0', min = 0, step = 1 }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');

  const start = () => { setRaw(String(value ?? '')); setEditing(true); };
  const commit = () => {
    const v = parseFloat(raw);
    if (!isNaN(v) && v >= min) onChange(v);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus type="number" min={min} step={step} value={raw} placeholder={placeholder}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-full px-2 py-1 rounded border border-blue-500 bg-[#0d1117] text-white text-sm font-mono outline-none"
      />
    );
  }
  return (
    <button onClick={start} title="Click to edit"
      className="w-full text-left px-2 py-1 rounded text-sm font-mono text-white hover:bg-white/5 transition-colors cursor-text group">
      <span className="text-slate-400 text-xs">{prefix}</span>
      {value === 0
        ? <span className="text-slate-500 italic">{placeholder || '0'}</span>
        : <span>{typeof value === 'number' ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</span>
      }
    </button>
  );
}

// ─── Financial setting knob ───────────────────────────────────────────────────

function SettingKnob({ label, value, onChange, suffix = '', step = 0.5, min = 0 }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');

  const start = () => { setRaw(String(value)); setEditing(true); };
  const commit = () => {
    const v = parseFloat(raw);
    if (!isNaN(v) && v >= min) onChange(v);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      {editing ? (
        <input autoFocus type="number" min={min} step={step} value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-24 px-2 py-1 rounded border border-blue-500 bg-[#0d1117] text-white text-sm font-mono outline-none"
        />
      ) : (
        <button onClick={start}
          className="text-left px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:border-blue-500/50 hover:bg-white/8 transition-all text-sm font-bold text-white cursor-text">
          {value}{suffix}
        </button>
      )}
    </div>
  );
}

// ─── GPM knob (Auto / Manual toggle) ────────────────────────────────────────────
// Shows the active tier when in Auto mode; locks to the estimator's value in Manual mode.

function GpmKnob({ financials, setFinancial, autoGpm }) {
  const isAuto = financials.gpmMode === 'auto';
  const displayValue = isAuto ? autoGpm : financials.marginPct;
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');

  const toggleMode = () => {
    if (isAuto) {
      // Entering manual: seed with current auto value so estimator starts from a sensible number
      setFinancial('marginPct', autoGpm);
      setFinancial('gpmMode', 'manual');
    } else {
      setFinancial('gpmMode', 'auto');
    }
  };

  const start = () => { setRaw(String(displayValue)); setEditing(true); };
  const commit = () => {
    const v = parseFloat(raw);
    if (!isNaN(v) && v >= 0 && v < 100) {
      setFinancial('marginPct', v);
      setFinancial('gpmMode', 'manual'); // any manual edit locks it
    }
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Target GPM (%)</span>
      <div className="flex items-center gap-2">
        {editing ? (
          <input
            autoFocus type="number" min={0} max={99} step={0.5} value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-24 px-2 py-1 rounded border border-blue-500 bg-[#0d1117] text-white text-sm font-mono outline-none"
          />
        ) : (
          <button onClick={start}
            className="text-left px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:border-blue-500/50 hover:bg-white/[0.08] transition-all text-sm font-bold text-white cursor-text">
            {displayValue}%
          </button>
        )}
        {/* Auto / Manual mode toggle */}
        <button
          onClick={toggleMode}
          title={isAuto ? 'Auto-tiered GPM active — click to override' : 'Manual override active — click to restore auto-tier'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-all ${
            isAuto
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
          }`}>
          {isAuto ? '🔓 Auto' : '🔒 Manual'}
        </button>
      </div>
      <span className="text-[10px] leading-relaxed mt-0.5">
        {isAuto
          ? <span className="text-slate-600">Tier: cost band → <span className="text-emerald-500 font-bold">{autoGpm}%</span></span>
          : <span className="text-amber-500/70">Override: {financials.marginPct}% (auto would be {autoGpm}%)</span>}
      </span>
    </div>
  );
}

// ─── Empty labor state ────────────────────────────────────────────────────────

function EmptyLaborState() {
  return (
    <tr>
      <td colSpan={6} className="px-6 py-10 text-center">
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl opacity-30">📐</span>
          <p className="text-slate-500 text-sm">No frames saved yet.</p>
          <p className="text-slate-600 text-xs">
            Open <strong className="text-slate-500">Takeoff Workspace</strong>, draw a box, configure your frame, and click{' '}
            <strong className="text-slate-500">"Save Frame to Bid"</strong>.
          </p>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BidCart({ project }) {
  const {
    frameCount,
    laborGroups,
    vendorQuotes,
    updateVendorQuote,
    addVendorQuote,
    removeVendorQuote,
    financials,
    setFinancial,
    summary,
  } = useBidMath();

  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  const frames = useBidStore((s) => s.frames);
  const { adminSettings } = useProject();

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await saveProjectToCloud({ projectName: project?.name ?? 'Untitled', projectId: project?.id, adminSettings, frames, vendorQuotes, financials, summary });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const buildSalesforceCopy = () => {
    const isAuto = financials.gpmMode === 'auto';
    const vendorList = vendorQuotes.length
      ? vendorQuotes.map((q) => `  • ${q.label}${q.vendor ? ` (${q.vendor})` : ''}`).join('\n')
      : '  (no vendor scopes)';
    return [
      `Total Base Bid:    ${usd(summary.grandTotal)}`,
      `Hard Cost:         ${usd(summary.costBase)}`,
      `  ├ Materials:     ${usd(summary.totalMaterialCost)}`,
      `  ├ Tax (${financials.taxPct}%):      ${usd(summary.taxAmount)}`,
      `  └ Labor (${summary.totalLaborHours?.toFixed(1) ?? '0'} hrs): ${usd(summary.totalLaborCost)}`,
      `Gross Profit (${summary.activeMarginPct ?? financials.marginPct}%): ${usd(summary.grossProfit)}`,
      ``,
      `Vendor Scopes:`,
      vendorList,
      ``,
      `GPM Mode: ${isAuto ? `Auto (${summary.autoGpm}%)` : `Manual (${financials.marginPct}%)`}`,
    ].join('\n');
  };

  const copyForSalesforce = () => {
    navigator.clipboard.writeText(buildSalesforceCopy())
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => alert('Clipboard copy failed — please copy manually.'));
  };

  const exportCSV = () => {
    const rows = [
      ['GlazeBid Builder — Bid Export', project?.name ?? ''],
      [],
      ['MATERIAL VENDOR QUOTES'],
      ['Description', 'Vendor', 'Taxable', 'Amount ($)'],
      ...vendorQuotes.map((q) => [q.label, q.vendor, q.isTaxable ? 'Yes' : 'No', q.amount]),
      [],
      ['LABOR TAKEOFF BREAKDOWN'],
      ['System', 'Frames', 'Doors', 'Shop Hrs', 'Field Hrs', 'Total Hrs'],
      ...laborGroups.map((g) => [g.systemType, g.frameCount, g.doorCount, g.shopHours, g.fieldHours, g.totalHours]),
      [],
      ['SUMMARY'],
      ['Total Materials', summary.totalMaterialCost],
      ['Tax (' + financials.taxPct + '%)', summary.taxAmount],
      ['Total Labor (' + summary.totalLaborHours + ' hrs)', summary.totalLaborCost],
      ['Gross Profit', summary.grossProfit],
      ['FINAL BID', summary.grandTotal],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GlazeBid_${(project?.name ?? 'Export').replace(/\s+/g, '_')}.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0b0e11] text-white font-sans">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-500 flex items-center justify-center text-base shadow-lg shadow-emerald-900/40">
            💵
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Bid Cart &amp; Labor Engine</h1>
            <p className="text-[11px] text-slate-500">
              {project?.name ?? 'No project'} &mdash; {frameCount} frame{frameCount !== 1 ? 's' : ''} in takeoff
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const saveCfg = {
              idle:   { label: '☁ Save Project', cls: 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20' },
              saving: { label: '⏳ Saving…',      cls: 'bg-blue-600/20 border-blue-500/30 text-blue-300 cursor-not-allowed' },
              saved:  { label: '✓ Saved',         cls: 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300' },
              error:  { label: '✕ Save Failed',   cls: 'bg-red-600/20 border-red-500/30 text-red-300' },
            }[saveStatus];
            return (
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saving'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${saveCfg.cls}`}
              >
                {saveCfg.label}
              </button>
            );
          })()}
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              showSettings
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
            }`}
          >
            ⚙ Financial Settings
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all"
          >
            ↓ Export CSV
          </button>
          <button
            onClick={copyForSalesforce}
            title="Copy formatted bid summary to clipboard for pasting into Salesforce"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              copied
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
            }`}
          >
            {copied ? '✓ Copied!' : '📋 Copy for Salesforce'}
          </button>
        </div>
      </div>

      {/* ── Financial Settings Panel ── */}
      {showSettings && (
        <div className="flex items-end gap-6 px-6 py-4 bg-[#0d1117] border-b border-white/10 shrink-0 flex-wrap">
          <SettingKnob label="Labor Rate ($/hr)" value={financials.laborRate} onChange={(v) => setFinancial('laborRate', v)} suffix="/hr" step={0.5} />
          <SettingKnob label="Contingency %" value={financials.contingencyPct} onChange={(v) => setFinancial('contingencyPct', v)} suffix="%" step={0.5} />
          <GpmKnob financials={financials} setFinancial={setFinancial} autoGpm={summary.autoGpm} />
          <SettingKnob label="Tax % (Materials)" value={financials.taxPct} onChange={(v) => setFinancial('taxPct', v)} suffix="%" step={0.25} />
          <div className="ml-auto text-[10px] text-slate-600 leading-relaxed text-right">
            Labor is <span className="text-slate-500 font-bold">non-taxable</span>.<br />
            Tax applies to taxable material lines only.
          </div>
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-8">

        {/* EXECUTIVE SUMMARY — 4 hero cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Materials + Tax */}
          <div className="rounded-xl border border-white/10 bg-[#0d1117] p-5 flex flex-col gap-1 border-t-[3px] border-t-amber-500/70">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80">Materials + Tax</span>
            <span className="text-2xl font-black tabular-nums text-white mt-1">{usd(summary.totalMaterialCost + summary.taxAmount)}</span>
            <span className="text-xs text-slate-500 mt-auto pt-2 border-t border-white/5">
              {usd(summary.totalMaterialCost)} materials + {usd(summary.taxAmount)} tax ({financials.taxPct}%)
            </span>
          </div>

          {/* Total Labor */}
          <div className="rounded-xl border border-white/10 bg-[#0d1117] p-5 flex flex-col gap-1 border-t-[3px] border-t-blue-500/70">
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">Total Labor</span>
            <span className="text-2xl font-black tabular-nums text-white mt-1">{usd(summary.totalLaborCost)}</span>
            <span className="text-xs text-slate-500 mt-auto pt-2 border-t border-white/5">
              {summary.totalLaborHours.toFixed(1)} hrs × ${financials.laborRate}/hr
              {financials.contingencyPct > 0 && <span className="text-slate-600"> + {financials.contingencyPct}% contingency</span>}
            </span>
          </div>

          {/* Gross Profit */}
          <div className="rounded-xl border border-white/10 bg-[#0d1117] p-5 flex flex-col gap-1 border-t-[3px] border-t-violet-500/70">
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400/80">Gross Profit</span>
            <span className="text-2xl font-black tabular-nums text-white mt-1">{usd(summary.grossProfit)}</span>
            <span className="text-xs text-slate-500 mt-auto pt-2 border-t border-white/5">
              <span className={`font-bold ${
                financials.gpmMode === 'manual' ? 'text-amber-400' : 'text-violet-400'
              }`}>{summary.activeMarginPct}% target margin</span>
              {financials.gpmMode === 'manual' && <span className="text-amber-500/60 ml-1">(manual)</span>}
              {financials.gpmMode === 'auto'   && <span className="text-slate-600 ml-1">(auto-tiered)</span>}
            </span>
          </div>

          {/* Final Bid — HERO */}
          <div className="rounded-xl bg-gradient-to-br from-[#003a80] to-[#001f3f] border border-blue-500/30 p-5 flex flex-col gap-1 shadow-xl shadow-blue-900/30 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/10 to-transparent pointer-events-none" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300/90 relative z-10">★ Final Bid</span>
            <span className="text-3xl font-black tabular-nums text-white mt-1 relative z-10 drop-shadow">{usd(summary.grandTotal)}</span>
            <span className="text-xs text-blue-300/60 mt-auto pt-2 border-t border-blue-500/20 relative z-10">
              Hard cost {usd(summary.costBase)} ÷ (1 − {summary.activeMarginPct}% GPM)
            </span>
          </div>
        </div>

        {/* SECTION A — MATERIAL & VENDOR QUOTES */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">A — Material &amp; Vendor Quotes</h2>
              <p className="text-xs text-slate-500 mt-0.5">Enter lump-sum quotes from your vendors. Taxable rows contribute to the material tax calculation.</p>
            </div>
            <button onClick={addVendorQuote}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/25 hover:border-emerald-400/50 transition-all">
              + Add Line
            </button>
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white/[0.04] text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[36%]">Description</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[22%]">Vendor</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[26%] text-right">Quoted Amount ($)</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">Taxable</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {vendorQuotes.map((q) => (
                  <tr key={q.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-2">
                      <input type="text" value={q.label} onChange={(e) => updateVendorQuote(q.id, 'label', e.target.value)}
                        className="w-full bg-transparent text-white text-sm outline-none border-b border-transparent focus:border-blue-500 transition-colors py-0.5 placeholder:text-slate-600"
                        placeholder="Line item description" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="text" value={q.vendor} onChange={(e) => updateVendorQuote(q.id, 'vendor', e.target.value)}
                        className="w-full bg-transparent text-slate-400 text-sm outline-none border-b border-transparent focus:border-blue-500 transition-colors py-0.5 placeholder:text-slate-700"
                        placeholder="Vendor name" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <EditableCell value={q.amount} onChange={(v) => updateVendorQuote(q.id, 'amount', v)} prefix="$" step={100} min={0} placeholder="Enter quote" />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => updateVendorQuote(q.id, 'isTaxable', !q.isTaxable)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                          q.isTaxable
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                            : 'bg-white/[0.04] border-white/10 text-slate-600 hover:text-slate-400'
                        }`}>
                        {q.isTaxable ? 'Taxable' : 'Exempt'}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => removeVendorQuote(q.id)} title="Remove"
                        className="w-6 h-6 rounded flex items-center justify-center text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-all mx-auto">×</button>
                    </td>
                  </tr>
                ))}
                {vendorQuotes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-600 text-sm italic">
                      No vendor quotes yet — click + Add Line to begin.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-white/[0.04] border-t border-white/10">
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Material Subtotal</td>
                  <td className="px-4 py-3 text-right text-sm font-black text-amber-300 tabular-nums">{usd(summary.totalMaterialCost)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="bg-white/[0.03]">
                  <td colSpan={2} className="px-4 py-2 text-xs text-slate-600">Tax ({financials.taxPct}% on {usd(summary.taxableAmount)} taxable)</td>
                  <td className="px-4 py-2 text-right text-xs font-bold text-amber-400/70 tabular-nums">+ {usd(summary.taxAmount)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="border-t border-amber-500/20 bg-amber-500/[0.08]">
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold text-amber-400 uppercase tracking-wide">Materials + Tax</td>
                  <td className="px-4 py-3 text-right text-base font-black text-amber-300 tabular-nums">{usd(summary.totalMaterialCost + summary.taxAmount)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* SECTION B — LABOR TAKEOFF BREAKDOWN */}
        <section>
          <div className="mb-3">
            <h2 className="text-sm font-bold text-white tracking-tight">B — Labor Takeoff Breakdown</h2>
            <p className="text-xs text-slate-500 mt-0.5">Read-only. Hours aggregated from each saved frame&apos;s BOM. Adjust rate and contingency in Financial Settings.</p>
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white/[0.04] text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">System / Scope</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">Frames</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">Doors</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Shop Fab</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Field Install</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Total Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {laborGroups.length === 0 ? <EmptyLaborState /> : laborGroups.map((g) => (
                  <tr key={g.systemType} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-white text-sm">{g.systemType}</span>
                      {g.elevationTags.length > 0 && (
                        <p className="text-[10px] text-slate-600 mt-0.5 truncate max-w-xs">
                          {g.elevationTags.slice(0, 6).join(', ')}{g.elevationTags.length > 6 && ` +${g.elevationTags.length - 6} more`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-6 rounded-md bg-blue-500/15 border border-blue-500/25 text-blue-300 text-xs font-bold tabular-nums">{g.frameCount}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {g.doorCount > 0
                        ? <span className="inline-flex items-center justify-center w-8 h-6 rounded-md bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs font-bold tabular-nums">{g.doorCount}</span>
                        : <span className="text-slate-700 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-300">{hrs(g.shopHours)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-300">{hrs(g.fieldHours)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-bold text-white">{hrs(g.totalHours)}</td>
                  </tr>
                ))}
              </tbody>
              {laborGroups.length > 0 && (
                <tfoot>
                  <tr className="bg-white/[0.04] border-t border-white/10">
                    <td colSpan={3} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Raw Takeoff Hours</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400 tabular-nums font-bold">{hrs(laborGroups.reduce((s, g) => s + g.shopHours, 0))}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400 tabular-nums font-bold">{hrs(laborGroups.reduce((s, g) => s + g.fieldHours, 0))}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400 tabular-nums font-bold">{hrs(summary.rawLaborHours)}</td>
                  </tr>
                  {financials.contingencyPct > 0 && (
                    <tr className="bg-white/[0.03]">
                      <td colSpan={5} className="px-4 py-2 text-xs text-slate-600">+ {financials.contingencyPct}% contingency ({(summary.totalLaborHours - summary.rawLaborHours).toFixed(1)} hrs added)</td>
                      <td className="px-4 py-2 text-right text-xs text-slate-500 tabular-nums font-bold">{hrs(summary.totalLaborHours)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-blue-500/20 bg-blue-500/[0.08]">
                    <td colSpan={5} className="px-4 py-3 text-xs font-bold text-blue-400 uppercase tracking-wide">
                      Total Labor Cost
                      <span className="ml-2 normal-case font-normal text-slate-500">({summary.totalLaborHours.toFixed(1)} hrs × ${financials.laborRate}/hr)</span>
                    </td>
                    <td className="px-4 py-3 text-right text-base font-black text-blue-300 tabular-nums">{usd(summary.totalLaborCost)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {/* FINAL BID FOOTER */}
        <div className="rounded-xl bg-gradient-to-r from-[#001f3f] to-[#002d5a] border border-blue-500/30 p-5 flex items-center justify-between gap-4 shadow-xl shadow-blue-900/20 shrink-0">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300/70">Cost Breakdown</span>
            <div className="flex items-baseline gap-4 flex-wrap text-xs text-slate-400 tabular-nums">
              <span><span className="text-amber-400 font-bold">{usd(summary.totalMaterialCost)}</span> materials</span>
              <span className="text-slate-700">+</span>
              <span><span className="text-amber-400/70 font-bold">{usd(summary.taxAmount)}</span> tax</span>
              <span className="text-slate-700">+</span>
              <span><span className="text-blue-400 font-bold">{usd(summary.totalLaborCost)}</span> labor</span>
              <span className="text-slate-700">+</span>
              <span><span className="text-violet-400 font-bold">{usd(summary.grossProfit)}</span> GP ({summary.activeMarginPct}% margin)</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300/70 mb-1">★ Final Bid</div>
            <div className="text-4xl font-black tabular-nums text-white drop-shadow-lg">{usd(summary.grandTotal)}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
