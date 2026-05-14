/**
 * SystemLaborMHs.jsx — Per-system labor MH rate editor + live calculation view
 *
 * 4 tables matching the bid sheet Excel (same as Admin, but per-system):
 *   1. Labor Summary — Beads of Caulk + Shop/Dist/Field/Total (MHs, MHs/SqFt, $, $/SqFt)
 *   2. Statistics    — MHs/DLO, Avg SqFt/DLO, Avg SqFt/Frame
 *   3. Grouped HF    — Hourly function rates (always editable, seeds from global defaults)
 *   4. Calc Table    — Hr Function rate, Count, MHs, Cost per item/column
 */

import React, { useState, useCallback, useMemo } from 'react';
import useProductionRatesStore from '../../store/useProductionRatesStore';
import { getSystemTypeConfig, getHFColumnTotal } from '../../utils/systemTypeConfig.js';
import { calcSystemMH, mhToCost, aggregateFrameResults } from '../../utils/laborCalcEngine.js';

// ── Editable numeric cell ───────────────────────────────────────────────────
const RateCell = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const begin = () => { setDraft(value ? String(value) : ''); setEditing(true); };
  const commit = () => { setEditing(false); const n = parseFloat(draft); if (!isNaN(n) && n !== value) onChange(n); };
  if (editing) return (
    <td style={S.cellEditing}>
      <input autoFocus type="number" step="any" value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        style={S.input} />
    </td>
  );
  return (
    <td style={S.cell} onClick={begin} title="Click to edit">
      {value || <span style={{ opacity: 0.3 }}>0</span>}
    </td>
  );
};

const fmt = (v) => (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (v) => (v || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function SystemLaborMHs({ system, setImportedSystems }) {
  const store = useProductionRatesStore();
  const sysType = system.systemType || system.name;
  const cfg = getSystemTypeConfig(sysType);
  const customCols = cfg.category === 'storefront' ? store.customColsSF || [] : store.customColsCW || [];

  const globalHF = store.getHourlyFunctions(sysType);
  const globalIR = store.getItemRates(sysType);
  const laborRate = store.laborRate || 0;
  const beadsOfCaulk = store.beadsOfCaulk || 2;

  // Always use per-system overrides if present, otherwise fall back to global defaults
  const hf = system.rateOverrides?.hourlyFunctions ?? globalHF;
  const ir = system.rateOverrides?.itemRates ?? globalIR;

  // Compute labor data for this system using active rates
  const laborData = useMemo(() => {
    if (!system.frames || system.frames.length === 0) {
      return { frameResults: [], shopMH: 0, distributionMH: 0, fieldMH: 0, totalMH: 0 };
    }
    return calcSystemMH(system.frames, hf, ir, beadsOfCaulk, sysType);
  }, [system.frames, hf, ir, beadsOfCaulk, sysType]);

  const { counts: aggCounts, mhs: aggMHs } = useMemo(
    () => aggregateFrameResults(laborData.frameResults),
    [laborData.frameResults]
  );

  const totalSF = system.totals?.totalSF || 0;
  const totalDLOs = (aggCounts.dlos || 0) + (aggCounts.gtDlos || 0);
  const totalFrames = system.frames?.length || 0;

  // Update a single HF rate on this system
  const setHFRate = useCallback((fnName, field, value) => {
    setImportedSystems(prev => prev.map(s => {
      if (s.id !== system.id) return s;
      const overrides = s.rateOverrides || { hourlyFunctions: JSON.parse(JSON.stringify(globalHF)), itemRates: { ...globalIR } };
      const fn = overrides.hourlyFunctions[fnName] || {};
      return { ...s, rateOverrides: { ...overrides, hourlyFunctions: { ...overrides.hourlyFunctions, [fnName]: { ...fn, [field]: Number(value) || 0 } } } };
    }));
  }, [system.id, globalHF, globalIR, setImportedSystems]);

  // Update a single item rate on this system
  const setIRRate = useCallback((item, value) => {
    setImportedSystems(prev => prev.map(s => {
      if (s.id !== system.id) return s;
      const overrides = s.rateOverrides || { hourlyFunctions: JSON.parse(JSON.stringify(globalHF)), itemRates: { ...globalIR } };
      return { ...s, rateOverrides: { ...overrides, itemRates: { ...overrides.itemRates, [item]: Number(value) || 0 } } };
    }));
  }, [system.id, globalHF, globalIR, setImportedSystems]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>

      {/* ── Header ── */}
      <div>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Labor MHs — {sysType}
        </h3>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          Rates start from company defaults. Changes here apply to this system only.
        </p>
      </div>

      {/* ── TABLE 1: Labor Summary  +  TABLE 2: Statistics ── */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ ...S.card, minWidth: 320, flex: 1 }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLabel}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700 }}>Beads of Caulk</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {beadsOfCaulk || 0}
                    </span>
                  </div>
                </th>
                <th style={S.thR}>MHs</th>
                <th style={S.thR}>MHs / SqFt</th>
                <th style={S.thR}>$</th>
                <th style={S.thR}>$ / SqFt</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Shop', mh: laborData.shopMH, bg: 'rgba(167,139,250,0.06)' },
                { label: 'Distribution', mh: laborData.distributionMH, bg: 'rgba(56,189,248,0.06)' },
                { label: 'Field', mh: laborData.fieldMH, bg: 'rgba(251,191,36,0.06)' },
              ].map(r => (
                <tr key={r.label} style={{ background: r.bg }}>
                  <td style={S.cellLabel}>{r.label}</td>
                  <td style={S.cellR}>{fmt(r.mh)}</td>
                  <td style={S.cellR}>{fmtD(totalSF ? r.mh / totalSF : 0)}</td>
                  <td style={S.cellR}>$ {fmt(mhToCost(r.mh, laborRate))}</td>
                  <td style={S.cellR}>$ {fmt(totalSF ? mhToCost(r.mh, laborRate) / totalSF : 0)}</td>
                </tr>
              ))}
              <tr style={{ background: 'rgba(52,211,153,0.08)', borderTop: '2px solid var(--border-subtle)' }}>
                <td style={{ ...S.cellLabel, fontWeight: 800, color: '#34d399' }}>Total Labor</td>
                <td style={{ ...S.cellR, fontWeight: 800, color: '#34d399' }}>{fmt(laborData.totalMH)}</td>
                <td style={{ ...S.cellR, fontWeight: 700, color: '#34d399' }}>{fmtD(totalSF ? laborData.totalMH / totalSF : 0)}</td>
                <td style={{ ...S.cellR, fontWeight: 800, color: '#34d399' }}>$ {fmt(mhToCost(laborData.totalMH, laborRate))}</td>
                <td style={{ ...S.cellR, fontWeight: 700, color: '#34d399' }}>$ {fmt(totalSF ? mhToCost(laborData.totalMH, laborRate) / totalSF : 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ ...S.card, minWidth: 180 }}>
          <table style={S.table}>
            <tbody>
              <tr><td style={S.cellLabel}>MHs / DLO</td><td style={S.cellR}>{fmt(totalDLOs ? laborData.totalMH / totalDLOs : 0)}</td></tr>
              <tr><td style={S.cellLabel}>Avg. SqFt / DLO</td><td style={S.cellR}>{fmt(totalDLOs ? totalSF / totalDLOs : 0)}</td></tr>
              <tr><td style={S.cellLabel}>Avg. SqFt / Frame</td><td style={S.cellR}>{fmt(totalFrames ? totalSF / totalFrames : 0)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── TABLE 3: Grouped HF Rates ── */}
      <div style={S.card}>
        <div style={S.cardHeader}>Hourly Function Rates</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {cfg.hfGroups.map((g, gi) => (
                  <React.Fragment key={gi}>
                    {gi > 0 && <th style={S.spacer} />}
                    <th style={S.thLabel}></th>
                    {g.columns.map(c => <th key={c.key} style={S.thR}>{c.label}</th>)}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(...cfg.hfGroups.map(g => g.rows.length)) }).map((_, ri) => (
                <tr key={ri}>
                  {cfg.hfGroups.map((g, gi) => {
                    const row = g.rows[ri];
                    return (
                      <React.Fragment key={gi}>
                        {gi > 0 && <td style={S.spacer} />}
                        <td style={S.cellLabel}>{row ? row.label : ''}</td>
                        {g.columns.map(col => {
                          if (!row) return <td key={col.key} style={S.cellDisabled} />;
                          const curVal = (hf[row.key] || {})[col.key] || 0;
                          return (
                            <RateCell key={col.key} value={curVal}
                              onChange={v => setHFRate(row.key, col.key, v)} />
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ borderTop: '2px solid var(--border-subtle)' }}>
                {cfg.hfGroups.map((g, gi) => (
                  <React.Fragment key={gi}>
                    {gi > 0 && <td style={S.spacer} />}
                    <td style={{ ...S.cellLabel, fontWeight: 800 }}>Total</td>
                    {g.columns.map(col => {
                      const total = g.rows.reduce((s, row) => s + ((hf[row.key] || {})[col.key] || 0), 0);
                      return <td key={col.key} style={S.cellTotal}>{total ? total.toFixed(2) : '—'}</td>;
                    })}
                  </React.Fragment>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── TABLE 4: Calculation Table ── */}
      <div style={S.card}>
        <div style={S.cardHeader}>Calculation</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLabel}></th>
                {cfg.calcCols.map(col => (
                  <th key={col.key} style={{ ...S.thR, fontSize: '0.65rem' }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Hr Function row */}
              <tr>
                <td style={S.cellLabel}>Hr Function</td>
                {cfg.calcCols.map(col => {
                  if (col.type === 'hf') {
                    const total = getHFColumnTotal(hf, col.key);
                    return <td key={col.key} style={{ ...S.cellR, color: 'var(--accent-blue)', fontWeight: 600 }}>{fmt(total)}</td>;
                  }
                  const curVal = ir[col.key] || 0;
                  return (
                    <RateCell key={col.key} value={curVal}
                      onChange={v => setIRRate(col.key, v)} />
                  );
                })}
                {customCols.map(col => {
                  const curVal = ir[col.key] || 0;
                  return (
                    <RateCell key={col.key} value={curVal}
                      onChange={v => setIRRate(col.key, v)} />
                  );
                })}
              </tr>
              {/* Count */}
              <tr>
                <td style={S.cellLabel}>Count</td>
                {cfg.calcCols.map(col => {
                  let count = aggCounts[col.countKey] || 0;
                  if (col.countDivisor) count = count / col.countDivisor;
                  return <td key={col.key} style={S.cellR}>{count ? Math.round(count) : 0}</td>;
                })}
                {customCols.map(col => <td key={col.key} style={S.cellR}>—</td>)}
              </tr>
              {/* MHs — HrFunction × Count for every column */}
              <tr>
                <td style={S.cellLabel}>MHs</td>
                {cfg.calcCols.map(col => {
                  let count = aggCounts[col.countKey] || 0;
                  if (col.countDivisor) count = count / col.countDivisor;
                  const hrFn = col.type === 'hf'
                    ? getHFColumnTotal(hf, col.key)
                    : (ir[col.key] || 0);
                  const mh = hrFn * count;
                  return <td key={col.key} style={S.cellR}>{fmt(mh)}</td>;
                })}
                {customCols.map(col => {
                  const hrFn = ir[col.key] || 0;
                  const mh = hrFn * 0; // no count key for custom cols — always 0
                  return <td key={col.key} style={S.cellR}>{fmt(mh)}</td>;
                })}
              </tr>
              {/* Cost — MHs × laborRate */}
              <tr>
                <td style={S.cellLabel}>Cost</td>
                {cfg.calcCols.map(col => {
                  let count = aggCounts[col.countKey] || 0;
                  if (col.countDivisor) count = count / col.countDivisor;
                  const hrFn = col.type === 'hf'
                    ? getHFColumnTotal(hf, col.key)
                    : (ir[col.key] || 0);
                  const mh = hrFn * count;
                  return <td key={col.key} style={S.cellR}>$ {fmt(mhToCost(mh, laborRate))}</td>;
                })}
                {customCols.map(col => <td key={col.key} style={S.cellR}>$ {fmt(0)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────
const S = {
  card: { border: '1px solid var(--border-subtle)', borderRadius: 10, background: 'var(--bg-card)', overflow: 'hidden' },
  cardHeader: { padding: '0.65rem 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' },
  thLabel: { padding: '0.45rem 0.75rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-subtle)', textAlign: 'left' },
  thR: { padding: '0.45rem 0.75rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-subtle)', textAlign: 'right' },
  cellLabel: { padding: '0.45rem 0.75rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  cell: { padding: '0.45rem 0.75rem', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' },
  cellR: { padding: '0.45rem 0.75rem', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  cellEditing: { padding: '0.25rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  cellDisabled: { padding: '0.45rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)', opacity: 0.3, borderBottom: '1px solid rgba(255,255,255,0.04)' },
  cellTotal: { padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  spacer: { width: 16, borderBottom: '1px solid transparent' },
  input: { width: '100%', padding: '0.3rem 0.5rem', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums', textAlign: 'right', background: 'var(--bg-deep)', border: '1px solid var(--accent-blue)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none' },
};
