import React, { useState, useMemo } from 'react';
import { ArrowLeft, ChevronRight, LayoutGrid, FileText } from 'lucide-react';
import { calculatePricing } from '../utils/PricingEngine';
import { calcSystemAncillary, DEFAULT_ANCILLARY_CONFIG } from '../utils/ancillaryPricing';
import { calcSystemMH, mhToCost } from '../utils/laborCalcEngine';
import useProductionRatesStore from '../store/useProductionRatesStore';

// ─── Human-readable system type labels ───────────────────────────────────────
const SYSTEM_TYPE_LABELS = {
  'ext-sf-1':      'Exterior Storefront',
  'ext-sf-2':      'Exterior Storefront (Alt)',
  'int-sf':        'Interior Storefront',
  'cap-cw':        'Captured Curtain Wall',
  'ssg-cw':        'SSG Curtain Wall',
  'Ext SF':        'Exterior Storefront',
  'Int SF':        'Interior Storefront',
  'Cap CW':        'Captured Curtain Wall',
  'SSG CW':        'SSG Curtain Wall',
  'material-only': 'Material Only',
  'labor-only':    'Labor Only',
  'custom-system': 'Custom System',
  'misc-labor':    'Misc Labor',
};

const TYPE_COLORS = {
  'ext-sf-1':      '#58a6ff',
  'ext-sf-2':      '#79c0ff',
  'int-sf':        '#a5f3fc',
  'cap-cw':        '#34d399',
  'ssg-cw':        '#fbbf24',
  'Ext SF':        '#58a6ff',
  'Int SF':        '#a5f3fc',
  'Cap CW':        '#34d399',
  'SSG CW':        '#fbbf24',
  'material-only': '#c084fc',
  'labor-only':    '#fb923c',
  'custom-system': '#94a3b8',
  'misc-labor':    '#f472b6',
};

const DEFAULT_BID_SETTINGS = { laborRate: 42, markupPercent: 40, taxPercent: 8.2 };

function readBidSettings(projectKey) {
  try {
    const raw = localStorage.getItem(`glazebid:bidSettings:${projectKey}`);
    const saved = raw ? JSON.parse(raw) : {};
    return {
      laborRate:     Number(saved.laborRate)     || DEFAULT_BID_SETTINGS.laborRate,
      markupPercent: Number(saved.markupPercent) || DEFAULT_BID_SETTINGS.markupPercent,
      taxPercent:    Number(saved.taxPercent)    || DEFAULT_BID_SETTINGS.taxPercent,
    };
  } catch { return { ...DEFAULT_BID_SETTINGS }; }
}

function computeSF(sys) {
  if (sys.totals?.totalSF) return Number(sys.totals.totalSF);
  return (sys.frames || []).reduce((sum, f) => {
    const w = (Number(f.width) || 0) / 12;
    const h = (Number(f.height) || 0) / 12;
    return sum + w * h * (Number(f.quantity) || 1);
  }, 0);
}

// Mirrors GlazeBidWorkspace.laborMap logic:
// If frames exist → compute live via calcSystemMH engine.
// If no frames (Studio type-library systems) → read pre-saved sys.totals.
function getSystemMH(sys, getHourlyFunctions, getItemRates, beadsOfCaulk) {
  // Manual labor tasks (misc-labor / custom entries)
  const taskMH = (sys.laborTasks || []).reduce(
    (s, t) => s + (Number(t.qty) || 0) * (Number(t.hrsPer) || 0), 0
  );

  if (sys.frames?.length) {
    const sysType = sys.systemType || sys.name;
    const hf = sys.rateOverrides?.hourlyFunctions || getHourlyFunctions(sysType);
    const ir = sys.rateOverrides?.itemRates       || getItemRates(sysType);
    const mh = calcSystemMH(sys.frames, hf, ir, beadsOfCaulk, sysType);
    return mh.totalMH + taskMH;
  }

  // Pre-saved totals (Studio type-library or already-persisted systems)
  const shop  = Number(sys.totals?.shopMHs)  || 0;
  const dist  = Number(sys.totals?.distMHs)  || 0;
  const field = Number(sys.totals?.fieldMHs) || 0;
  return shop + dist + field + taskMH;
}

function computeSystemCosts(sys, bidSettings, rateStore) {
  const { markupPercent, taxPercent } = bidSettings;
  // Per-system rate takes priority over global bid setting
  const laborRate = Number(sys.productionRates?.laborRate) || bidSettings.laborRate;

  const { getHourlyFunctions, getItemRates, beadsOfCaulk } = rateStore;

  // Material cost: line-item materials + per-frame manual material + ancillary
  const lineMat  = (sys.materials || []).reduce((s, m) => s + (Number(m.cost) || 0), 0);
  const frameMat = (sys.frames   || []).reduce((s, f) => s + (Number(f.manualMaterialCost) || 0), 0);
  const ancillary = calcSystemAncillary(
    sys.frames || [],
    sys.ancillaryConfig || DEFAULT_ANCILLARY_CONFIG,
    { systemType: sys.systemType || sys.name }
  ).totalCost;
  const materialCost = lineMat + frameMat + ancillary;

  // Labor cost: live-computed MHs × rate
  const totalMH   = getSystemMH(sys, getHourlyFunctions, getItemRates, beadsOfCaulk || 2);
  const laborCost = mhToCost(totalMH, laborRate);

  const pricing = calculatePricing({
    materialCost,
    laborCost,
    taxPercent,
    pricingPercent: markupPercent,
    pricingMode: 'margin',
    isTaxExempt: false,
  });

  return { materialCost, laborCost, totalMH, pricing };
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ sys }) {
  const hasFrames = (sys.frames?.length || 0) > 0;
  const hasMaterials = (sys.materials?.length || 0) > 0;
  const sf = computeSF(sys);
  const hasMH = (sys.totals?.shopMHs || 0) + (sys.totals?.fieldMHs || 0) + (sys.totals?.distMHs || 0) > 0;

  if ((hasFrames || hasMaterials) && (sf > 0 || hasMH)) {
    return (
      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
        Complete
      </span>
    );
  }
  if (hasFrames || hasMaterials || sf > 0) {
    return (
      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
        In Progress
      </span>
    );
  }
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: '#8b949e', border: '1px solid rgba(255,255,255,0.1)' }}>
      Empty
    </span>
  );
}

// ─── Summary stat card ────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '1.1rem 1.4rem', minWidth: 140,
    }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: accent || '#e6edf3', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: '#8b949e', marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: '#5c6370', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const usd = (n) => {
  if (!n && n !== 0) return '—';
  if (n === 0) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// ─── Main page ────────────────────────────────────────────────────────────────
const ReviewBidPage = ({ project, onBack, onNavigate }) => {
  const projectKey = project || '_default';

  const systems = useMemo(() => {
    try {
      const raw = localStorage.getItem(`glazebid:workspaceSystems:${projectKey}`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, [projectKey]);

  const bidSettings = useMemo(() => readBidSettings(projectKey), [projectKey]);

  // Read production rates once (outside memo so Zustand reactivity triggers re-render)
  const storeGetHF       = useProductionRatesStore(s => s.getHourlyFunctions);
  const storeGetIR       = useProductionRatesStore(s => s.getItemRates);
  const storeBeads       = useProductionRatesStore(s => s.beadsOfCaulk || 2);
  const storeHFByType    = useProductionRatesStore(s => s.hourlyFunctionsByType);
  const storeIRByType    = useProductionRatesStore(s => s.itemRatesByType);

  const rateStore = useMemo(() => ({
    getHourlyFunctions: storeGetHF,
    getItemRates:       storeGetIR,
    beadsOfCaulk:       storeBeads,
  }), [storeGetHF, storeGetIR, storeBeads, storeHFByType, storeIRByType]); // eslint-disable-line

  const [hovRow, setHovRow] = useState(null);
  const [filter, setFilter] = useState('all');

  // Per-system costs
  const systemRows = useMemo(() =>
    systems.map(sys => ({
      sys,
      sf: computeSF(sys),
      ...computeSystemCosts(sys, bidSettings, rateStore),
    })),
    [systems, bidSettings, rateStore]
  );

  const typeKeys = [...new Set(systems.map(s => s.systemType).filter(Boolean))];
  const filterOptions = [{ key: 'all', label: 'All Systems' }, ...typeKeys.map(k => ({ key: k, label: SYSTEM_TYPE_LABELS[k] || k }))];

  const displayed = filter === 'all' ? systemRows : systemRows.filter(r => r.sys.systemType === filter);

  // Grand totals
  const totals = displayed.reduce((acc, r) => ({
    sf:           acc.sf + r.sf,
    totalMH:      acc.totalMH + r.totalMH,
    laborCost:    acc.laborCost + r.laborCost,
    materialCost: acc.materialCost + r.materialCost,
    markup:       acc.markup + r.pricing.pricingAmount,
    tax:          acc.tax + r.pricing.taxAmount,
    totalCost:    acc.totalCost + r.pricing.finalBid,
  }), { sf: 0, totalMH: 0, laborCost: 0, materialCost: 0, markup: 0, tax: 0, totalCost: 0 });

  const handleJump = (systemId) => {
    if (systemId) localStorage.setItem('glazebid:jumpToSystem', systemId);
    onNavigate?.('bidsheet');
  };

  // Column definitions (header, alignment, render)
  const COLS = [
    { h: '#',              align: 'left'  },
    { h: 'System Name',    align: 'left'  },
    { h: 'Type',           align: 'left'  },
    { h: 'Status',         align: 'left'  },
    { h: 'Total SF',       align: 'right' },
    { h: 'Total MHs',      align: 'right' },
    { h: 'Labor Cost',     align: 'right' },
    { h: 'Material Cost',  align: 'right' },
    { h: 'Markup',         align: 'right' },
    { h: 'Tax',            align: 'right' },
    { h: 'Total Cost',     align: 'right' },
    { h: '',               align: 'right' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.9rem 1.75rem',
        background: '#0d1117',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: 'none', color: '#8b949e', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: '0.3rem 0.6rem', borderRadius: 6 }}
          onMouseEnter={e => e.currentTarget.style.color = '#e6edf3'}
          onMouseLeave={e => e.currentTarget.style.color = '#8b949e'}
        >
          <ArrowLeft size={15} />
          Project Home
        </button>

        <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: '1rem' }}>/</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={16} color="#58a6ff" />
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e6edf3' }}>Review Bid</span>
          {project && (
            <span style={{ fontSize: '0.78rem', color: '#8b949e', background: 'rgba(255,255,255,0.06)', padding: '2px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)' }}>
              {project}
            </span>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Bid settings summary */}
        <div style={{ fontSize: '0.72rem', color: '#8b949e', display: 'flex', gap: '1rem' }}>
          <span>Labor: <strong style={{ color: '#e6edf3' }}>${bidSettings.laborRate}/hr</strong></span>
          <span>Markup: <strong style={{ color: '#e6edf3' }}>{bidSettings.markupPercent}%</strong></span>
          <span>Tax: <strong style={{ color: '#e6edf3' }}>{bidSettings.taxPercent}%</strong></span>
        </div>

        <button
          onClick={() => handleJump(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.45rem',
            padding: '0.5rem 1.25rem', borderRadius: 7,
            background: '#58a6ff', border: 'none',
            color: '#0d1117', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer',
          }}
        >
          <LayoutGrid size={14} />
          Open Bid Builder
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, padding: '1.75rem 1.75rem', width: '100%', boxSizing: 'border-box', overflowX: 'auto' }}>

        {/* ── Summary stat cards ── */}
        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <StatCard label="System Cards" value={systems.length} />
          <StatCard label="Total SF"     value={totals.sf > 0 ? totals.sf.toFixed(0) : '—'} sub="Square Feet" />
          <StatCard label="Total MHs"    value={totals.totalMH > 0 ? totals.totalMH.toFixed(1) : '—'} sub="Man-Hours" />
          <StatCard label="Labor Cost"   value={usd(totals.laborCost)}    accent="#58a6ff" />
          <StatCard label="Material Cost" value={usd(totals.materialCost)} accent="#79c0ff" />
          <StatCard label="Markup"        value={usd(totals.markup)}       accent="#fbbf24" />
          <StatCard label="Tax"           value={usd(totals.tax)}          accent="#f97316" />
          <StatCard label="Total Bid"     value={usd(totals.totalCost)}    accent="#34d399" />
        </div>

        {/* ── Filter pills ── */}
        {typeKeys.length > 1 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {filterOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key)}
                style={{
                  padding: '0.3rem 0.85rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.12s',
                  background: filter === opt.key ? '#58a6ff' : 'rgba(255,255,255,0.05)',
                  color: filter === opt.key ? '#0d1117' : '#8b949e',
                  border: filter === opt.key ? '1px solid #58a6ff' : '1px solid rgba(255,255,255,0.08)',
                }}
              >{opt.label}</button>
            ))}
          </div>
        )}

        {/* ── Table ── */}
        {displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 2rem', color: '#8b949e' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#e6edf3', fontWeight: 700 }}>No system cards yet</h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem' }}>Import takeoffs or create a system scope in the Bid Builder to get started.</p>
            <button
              onClick={() => handleJump(null)}
              style={{ padding: '0.6rem 1.5rem', borderRadius: 8, background: '#58a6ff', border: 'none', color: '#0d1117', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
            >Open Bid Builder →</button>
          </div>
        ) : (
          <div style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden', minWidth: 1000 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: '#0d1117', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                  {COLS.map((col, i) => (
                    <th key={i} style={{
                      padding: '0.8rem 0.9rem', textAlign: col.align,
                      fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: '#8b949e', whiteSpace: 'nowrap',
                    }}>{col.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(({ sys, sf, totalMH, laborCost, materialCost, pricing }, i) => {
                  const typeLabel = SYSTEM_TYPE_LABELS[sys.systemType] || sys.systemType || '—';
                  const typeColor = TYPE_COLORS[sys.systemType] || '#8b949e';
                  const isHov = hovRow === i;
                  const rowBg = isHov ? 'rgba(88,166,255,0.08)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
                  const cellR = { padding: '0.75rem 0.9rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', transition: 'background 0.1s' };

                  return (
                    <tr
                      key={sys.id || i}
                      onMouseEnter={() => setHovRow(i)}
                      onMouseLeave={() => setHovRow(null)}
                      onClick={() => handleJump(sys.id)}
                      style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.1s' }}
                    >
                      {/* 1. # */}
                      <td style={{ padding: '0.75rem 0.9rem', color: '#5c6370', fontWeight: 700, width: 38, fontSize: '0.75rem' }}>{i + 1}</td>

                      {/* 2. System Card Name */}
                      <td style={{ padding: '0.75rem 0.9rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <span style={{ color: isHov ? '#58a6ff' : '#e6edf3', transition: 'color 0.1s' }}>
                          {sys.name || `System ${i + 1}`}
                        </span>
                      </td>

                      {/* 3. Type */}
                      <td style={{ padding: '0.75rem 0.9rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}33` }}>
                          {typeLabel}
                        </span>
                      </td>

                      {/* 4. Status */}
                      <td style={{ padding: '0.75rem 0.9rem' }}>
                        <StatusBadge sys={sys} />
                      </td>

                      {/* 5. Total SF */}
                      <td style={{ ...cellR, color: sf > 0 ? '#e6edf3' : '#5c6370' }}>
                        {sf > 0 ? sf.toFixed(0) : '—'}
                      </td>

                      {/* 6. Total MHs */}
                      <td style={{ ...cellR, color: totalMH > 0 ? '#a5f3fc' : '#5c6370' }}>
                        {totalMH > 0 ? totalMH.toFixed(1) : '—'}
                      </td>

                      {/* 7. Labor Cost */}
                      <td style={{ ...cellR, color: laborCost > 0 ? '#58a6ff' : '#5c6370' }}>
                        {usd(laborCost)}
                      </td>

                      {/* 8. Material Cost */}
                      <td style={{ ...cellR, color: materialCost > 0 ? '#79c0ff' : '#5c6370' }}>
                        {usd(materialCost)}
                      </td>

                      {/* 9. Markup */}
                      <td style={{ ...cellR, color: pricing.pricingAmount > 0 ? '#fbbf24' : '#5c6370' }}>
                        {usd(pricing.pricingAmount)}
                      </td>

                      {/* 10. Tax */}
                      <td style={{ ...cellR, color: pricing.taxAmount > 0 ? '#f97316' : '#5c6370' }}>
                        {usd(pricing.taxAmount)}
                      </td>

                      {/* 11. Total Cost */}
                      <td style={{ ...cellR, color: pricing.finalBid > 0 ? '#34d399' : '#5c6370', fontWeight: 800 }}>
                        {usd(pricing.finalBid)}
                      </td>

                      {/* 12. Edit arrow */}
                      <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', width: 60 }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isHov ? '#58a6ff' : '#5c6370', display: 'inline-flex', alignItems: 'center', gap: 2, transition: 'color 0.1s' }}>
                          Edit <ChevronRight size={12} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* ── Totals footer row ── */}
              {displayed.length > 1 && (
                <tfoot>
                  <tr style={{ background: '#0d1117', borderTop: '2px solid rgba(255,255,255,0.12)' }}>
                    <td colSpan={4} style={{ padding: '0.75rem 0.9rem', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8b949e' }}>
                      {displayed.length} Systems Total
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', fontWeight: 800, color: '#e6edf3', fontVariantNumeric: 'tabular-nums' }}>
                      {totals.sf > 0 ? totals.sf.toFixed(0) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', fontWeight: 800, color: '#a5f3fc', fontVariantNumeric: 'tabular-nums' }}>
                      {totals.totalMH > 0 ? totals.totalMH.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', fontWeight: 800, color: '#58a6ff', fontVariantNumeric: 'tabular-nums' }}>
                      {usd(totals.laborCost)}
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', fontWeight: 800, color: '#79c0ff', fontVariantNumeric: 'tabular-nums' }}>
                      {usd(totals.materialCost)}
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', fontWeight: 800, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>
                      {usd(totals.markup)}
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', fontWeight: 800, color: '#f97316', fontVariantNumeric: 'tabular-nums' }}>
                      {usd(totals.tax)}
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', fontWeight: 900, color: '#34d399', fontSize: '0.92rem', fontVariantNumeric: 'tabular-nums' }}>
                      {usd(totals.totalCost)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── Future placeholder ── */}
        <div style={{ marginTop: '2rem', padding: '1.25rem 1.5rem', background: 'rgba(88,166,255,0.04)', border: '1px dashed rgba(88,166,255,0.15)', borderRadius: 12, color: '#5c6370', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FileText size={15} color="#58a6ff" style={{ opacity: 0.5, flexShrink: 0 }} />
          <span>
            <strong style={{ color: '#8b949e' }}>Coming soon:</strong> PM review notes, approval sign-off, revision tracking, and scope comparison tools.
          </span>
        </div>
      </div>
    </div>
  );
};

export default ReviewBidPage;