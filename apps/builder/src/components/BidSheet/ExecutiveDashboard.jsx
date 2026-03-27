import React, { useMemo } from 'react';
import useBidStore, { getGlassRFQ, exportGlassRFQtoCSV } from '../../store/useBidStore';

/**
 * ExecutiveDashboard — Parametric Frame BOM Aggregation + Glass RFQ
 *
 * Phase 1 Fix: Replaced the old split $45/$65 shop/field rate model with a
 * single burdenedRatePerHour pulled from useBidStore.laborRates — matching the
 * Excel sheet's single $42/hr model applied uniformly to all labor phases.
 */

const fmt2        = (n) => (typeof n === 'number' ? n.toFixed(2) : '0.00');
const fmtCurrency = (n) => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const fmtNum      = (n, d = 2) => (typeof n === 'number' ? n.toFixed(d) : '0.00');
const fmtPct      = (n) => (typeof n === 'number' ? n.toFixed(1) : '0.0');

function gpmColor(pct) {
  if (pct >= 30) return '#34d399';
  if (pct >= 25) return '#fbbf24';
  return '#f87171';
}

const c = {
  deep: '#0b0e11', card: '#1c2128', border: '#2d333b',
  blueLight: '#60a5fa', blueDim: 'rgba(37,99,235,0.12)',
  greenLight: '#34d399', greenDim: 'rgba(16,185,129,0.1)',
  amberLight: '#fbbf24',
  purple: '#a78bfa', purpleDim: 'rgba(167,139,250,0.1)',
  textPrimary: '#e6edf3', textSecondary: '#9ea7b3',
};

function KpiCard({ icon, label, value, sub, accent, dimBg }) {
  return (
    <div style={{ flex: 1, minWidth: 160, background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: dimBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>{icon}</div>
      <p style={{ fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.textSecondary, margin: 0 }}>{label}</p>
      <p style={{ fontSize: '1.55rem', fontWeight: 800, color: accent, margin: 0, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: '0.68rem', color: c.textSecondary, margin: 0 }}>{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <h2 style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: c.textSecondary, margin: 0 }}>{title}</h2>
      {action}
    </div>
  );
}

function LaborRow({ label, hours, rateLabel, cost, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: `1px solid ${c.border}` }}>
      <div>
        <p style={{ fontSize: '0.83rem', fontWeight: 600, color: c.textPrimary, margin: 0 }}>{label}</p>
        <p style={{ fontSize: '0.7rem', color: c.textSecondary, margin: '2px 0 0' }}>
          {fmtNum(hours)} hrs × {rateLabel}
        </p>
      </div>
      <p style={{ fontSize: '1.05rem', fontWeight: 800, color: accent, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(cost)}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 14, color: c.textSecondary }}>
      <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={c.border} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x={3} y={3} width={7} height={7}/><rect x={14} y={3} width={7} height={7}/>
        <rect x={14} y={14} width={7} height={7}/><rect x={3} y={14} width={7} height={7}/>
      </svg>
      <p style={{ fontSize: '0.88rem', fontWeight: 600, margin: 0 }}>No frames saved yet</p>
      <p style={{ fontSize: '0.75rem', margin: 0, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
        Use the Parametric Frame Builder to configure frames and save them to the bid.
      </p>
    </div>
  );
}

export default function ExecutiveDashboard({ projectName = 'GlazeBid Project' }) {
  const frames        = useBidStore((s) => s.frames);
  const projectTotals = useBidStore((s) => s.projectTotals);

  // Single burdened rate — matches Excel's single $42/hr model
  const laborRates   = useBidStore((s) => s.laborRates);
  const burdenedRate = laborRates?.burdenedRatePerHour ?? 42;

  const shopHours  = projectTotals.labor?.shopFabHours   ?? 0;
  const fieldHours = projectTotals.labor?.fieldInstHours ?? 0;
  const totalLaborHours = shopHours + fieldHours;

  // Single rate applied uniformly across all labor phases
  const totalLaborCost = totalLaborHours * burdenedRate;

  const rfqLines     = useMemo(() => getGlassRFQ(frames), [frames]);
  const totalRFQQty  = rfqLines.reduce((s, r) => s + r.qty, 0);
  const totalRFQSqFt = rfqLines.reduce((s, r) => s + r.totalSqFt, 0);

  const handleExportCSV = () => exportGlassRFQtoCSV(rfqLines, projectName);
  const hasFrames = frames.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: c.deep, color: c.textPrimary, fontFamily: 'Inter, "Segoe UI", sans-serif', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 28, minHeight: '100%' }}>

        {/* Page Title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Executive Dashboard</h1>
            <p style={{ fontSize: '0.75rem', color: c.textSecondary, margin: '4px 0 0' }}>
              {projectName} — live BOM aggregation + vendor quote schedule
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Active labor rate chip */}
            <div style={{ background: c.blueDim, border: `1px solid rgba(96,165,250,0.25)`, borderRadius: 20, padding: '5px 14px' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: c.blueLight }}>
                Rate: {fmtCurrency(burdenedRate)}/hr
              </span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: hasFrames ? c.greenDim : c.blueDim,
              border: `1px solid ${hasFrames ? 'rgba(52,211,153,0.3)' : 'rgba(96,165,250,0.2)'}`,
              borderRadius: 20, padding: '5px 14px',
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: hasFrames ? c.greenLight : c.blueLight }} />
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: hasFrames ? c.greenLight : c.blueLight }}>
                {hasFrames ? `${frames.length} frame${frames.length !== 1 ? 's' : ''} in bid` : 'No frames saved'}
              </span>
            </div>
          </div>
        </div>

        {!hasFrames ? <EmptyState /> : (
          <>
            {/* SECTION 1: KPI Cards */}
            <section>
              <SectionHeader title="Project Overview" />
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <KpiCard icon="🔲" label="Total Frames"    value={projectTotals.totalFrames}                     sub="configured assemblies"  accent={c.blueLight}  dimBg={c.blueDim} />
                <KpiCard icon="📏" label="Total Aluminum"  value={`${fmtNum(projectTotals.totalAluminumLF)} LF`}  sub="shop fab material"      accent={c.purple}     dimBg={c.purpleDim} />
                <KpiCard icon="🪟" label="Total Glass"     value={`${fmtNum(projectTotals.totalGlassSqFt)} SqFt`} sub={`${projectTotals.totalLites ?? 0} total lites`} accent={c.blueLight} dimBg={c.blueDim} />
                <KpiCard icon="💰" label="Total Labor Cost" value={fmtCurrency(totalLaborCost)}                   sub={`${fmtNum(totalLaborHours)} hrs @ ${fmtCurrency(burdenedRate)}/hr`} accent={c.greenLight} dimBg={c.greenDim} />
              </div>
            </section>

            {/* SECTION 2: Labor Breakdown */}
            <section>
              <SectionHeader title="Labor Breakdown" />
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', background: c.blueDim, borderBottom: `1px solid ${c.border}` }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.blueLight }}>Category</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.blueLight }}>Cost</span>
                </div>
                <LaborRow label="Shop Fabrication"   hours={shopHours}  rateLabel={`${fmtCurrency(burdenedRate)}/hr`} cost={shopHours  * burdenedRate} accent={c.purple} />
                <LaborRow label="Field Installation" hours={fieldHours} rateLabel={`${fmtCurrency(burdenedRate)}/hr`} cost={fieldHours * burdenedRate} accent={c.blueLight} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: c.greenDim }}>
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: c.textPrimary, margin: 0 }}>Total Labor</p>
                    <p style={{ fontSize: '0.7rem', color: c.textSecondary, margin: '2px 0 0' }}>
                      {fmtNum(totalLaborHours)} hrs ({fmtNum(shopHours)} shop + {fmtNum(fieldHours)} field) @ {fmtCurrency(burdenedRate)}/hr
                    </p>
                  </div>
                  <p style={{ fontSize: '1.2rem', fontWeight: 800, color: c.greenLight, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(totalLaborCost)}</p>
                </div>
              </div>

              {/* Rate legend chips */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                {[
                  { label: 'Shop velocity',  val: `${laborRates?.shopFabVelocity ?? 10} LF / hr` },
                  { label: 'Field velocity', val: `${laborRates?.fieldInstVelocity ?? 25} SqFt / hr` },
                  { label: 'Burdened rate',  val: `${fmtCurrency(burdenedRate)}/hr` },
                  { label: 'Model',          val: 'Single rate — all phases' },
                ].map(({ label, val }) => (
                  <div key={label} style={{ flex: 1, padding: '8px 12px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 8 }}>
                    <p style={{ fontSize: '0.6rem', color: c.textSecondary, margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: c.textPrimary, margin: 0 }}>{val}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* SECTION 3: Glass RFQ Table */}
            <section style={{ paddingBottom: 32 }}>
              <SectionHeader
                title="Glass RFQ Schedule — Vendor Quote"
                action={
                  <button
                    onClick={handleExportCSV}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', boxShadow: '0 2px 10px rgba(37,99,235,0.4)' }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                  >
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Export Glass RFQ to CSV
                  </button>
                }
              />
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px 70px 90px 110px', padding: '9px 14px', background: c.blueDim, borderBottom: `1px solid ${c.border}` }}>
                  {['#', 'Glass Type / System', 'Width (in)', 'Height (in)', 'QTY', 'SqFt ea.', 'Total SqFt'].map(col => (
                    <span key={col} style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.blueLight }}>{col}</span>
                  ))}
                </div>
                {rfqLines.map((row, i) => (
                  <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px 70px 90px 110px', padding: '11px 14px', borderBottom: `1px solid rgba(45,51,59,0.5)`, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: c.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                    <div>
                      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: c.textPrimary, margin: 0 }}>{row.glassType}</p>
                      <p style={{ fontSize: '0.65rem', color: c.textSecondary, margin: '1px 0 0' }}>{row.systemType}</p>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', color: c.textPrimary }}>{fmt2(row.widthInches)}"</span>
                    <span style={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', color: c.textPrimary }}>{fmt2(row.heightInches)}"</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.blueLight }}>{row.qty}</span>
                    <span style={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', color: c.textSecondary }}>{fmt2(row.sqFtPerLite)}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.greenLight }}>{fmt2(row.totalSqFt)}</span>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px 70px 90px 110px', padding: '12px 14px', background: c.greenDim, borderTop: `1px solid rgba(52,211,153,0.2)`, alignItems: 'center' }}>
                  <span /><span style={{ fontSize: '0.72rem', fontWeight: 700, color: c.greenLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>PROJECT TOTALS</span>
                  <span /><span />
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: c.greenLight, fontVariantNumeric: 'tabular-nums' }}>{totalRFQQty}</span>
                  <span />
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: c.greenLight, fontVariantNumeric: 'tabular-nums' }}>{fmt2(totalRFQSqFt)}</span>
                </div>
              </div>

              {rfqLines.some(r => r.elevationTags.filter(Boolean).length > 0) && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 8 }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.textSecondary, margin: '0 0 8px' }}>Elevation Tags</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {rfqLines.flatMap(row =>
                      [...new Set(row.elevationTags)].filter(Boolean).map(tag => (
                        <span key={`${row.key}-${tag}`} style={{ fontSize: '0.68rem', padding: '2px 10px', background: c.blueDim, border: `1px solid rgba(96,165,250,0.2)`, borderRadius: 20, color: c.blueLight, fontWeight: 600 }}>{tag}</span>
                      ))
                    )}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
