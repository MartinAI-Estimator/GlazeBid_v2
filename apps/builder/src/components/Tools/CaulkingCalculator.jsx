import React, { useState, useMemo } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
const CU_IN_PER_GAL   = 231;         // exact
const GAL_PER_CART    = 10.3 / 128;  // 10.3 fl-oz cartridge
const GAL_PER_SAUSAGE = 20   / 128;  // 20 fl-oz sausage
const ACCENT          = '#84cc16';

function numField(label, value, onChange, { step = '0.01', min = '0', hint = '' } = {}) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {hint && <span style={s.hint}>{hint}</span>}
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={s.input}
      />
    </div>
  );
}

function ResultCard({ icon, label, value, unit, sub }) {
  return (
    <div style={s.resultCard}>
      <div style={s.resultIcon}>{icon}</div>
      <div style={s.resultValue}>{value}</div>
      <div style={s.resultUnit}>{unit}</div>
      <div style={s.resultLabel}>{label}</div>
      {sub && <div style={s.resultSub}>{sub}</div>}
    </div>
  );
}

// ─── Joint cross-section diagram ─────────────────────────────────────────────
function JointDiagram({ width, depth }) {
  const w = Math.min(Math.max(Number(width) || 0, 0), 4);
  const d = Math.min(Math.max(Number(depth) || 0, 0), 4);

  // Scale: max 4" maps to ~80px
  const scale   = 20; // px per inch
  const jW      = Math.max(w * scale, 4);
  const jD      = Math.max(d * scale, 4);
  const svgW    = 160;
  const svgH    = 120;
  const wallH   = 28;
  const jx      = (svgW - jW) / 2;
  const jy      = wallH;

  return (
    <svg width={svgW} height={svgH} style={s.diagram}>
      {/* substrate left */}
      <rect x={0} y={0} width={jx} height={svgH} fill="#1e2a1e" rx={3} />
      {/* substrate right */}
      <rect x={jx + jW} y={0} width={svgW - jx - jW} height={svgH} fill="#1e2a1e" rx={3} />
      {/* sealant fill */}
      <rect x={jx} y={jy} width={jW} height={jD} fill={`${ACCENT}cc`} rx={2} />
      {/* joint opening */}
      <rect x={jx} y={0} width={jW} height={jy} fill="#0d1117" />
      {/* backer rod hint */}
      <rect x={jx} y={jy + jD} width={jW} height={Math.min(14, svgH - jy - jD)} fill="#2a2a3a" rx={1} />
      {/* width arrow */}
      <line x1={jx} y1={svgH - 8} x2={jx + jW} y2={svgH - 8} stroke={ACCENT} strokeWidth={1} markerEnd="url(#arr)" markerStart="url(#arr)" />
      <text x={svgW / 2} y={svgH - 1} textAnchor="middle" fill={ACCENT} fontSize={9}>{w > 0 ? `${w}"` : 'w'}</text>
      {/* depth arrow */}
      {jD > 6 && (
        <>
          <line x1={jx + jW + 7} y1={jy} x2={jx + jW + 7} y2={jy + jD} stroke={ACCENT} strokeWidth={1} />
          <text x={jx + jW + 14} y={jy + jD / 2 + 4} fill={ACCENT} fontSize={9}>{d > 0 ? `${d}"` : 'd'}</text>
        </>
      )}
      {/* labels */}
      <text x={svgW / 2} y={14} textAnchor="middle" fill="#8b949e" fontSize={9}>SEALANT</text>
    </svg>
  );
}

export default function CaulkingCalculator({ onBack }) {
  const [jointWidth,  setJointWidth]  = useState('');
  const [jointDepth,  setJointDepth]  = useState('');
  const [linearFeet,  setLinearFeet]  = useState('');
  const [wastePct,    setWastePct]    = useState('10');

  // Cost-per inputs
  const [costPerGal,  setCostPerGal]  = useState('');
  const [costPerCart, setCostPerCart] = useState('');
  const [costPerSaus, setCostPerSaus] = useState('');

  // ─── Core math ────────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const w  = parseFloat(jointWidth)  || 0;
    const d  = parseFloat(jointDepth)  || 0;
    const lf = parseFloat(linearFeet)  || 0;
    const wp = parseFloat(wastePct)    || 0;

    if (w <= 0 || d <= 0 || lf <= 0) return null;

    const volumeCuIn   = w * d * (lf * 12);
    const baseGallons  = volumeCuIn / CU_IN_PER_GAL;
    const gallons      = baseGallons * (1 + wp / 100);
    const cartridges   = Math.ceil(gallons / GAL_PER_CART);
    const sausages     = Math.ceil(gallons / GAL_PER_SAUSAGE);

    return {
      gallons:    gallons.toFixed(3),
      gallonsRaw: gallons,
      cartridges,
      sausages,
    };
  }, [jointWidth, jointDepth, linearFeet, wastePct]);

  // ─── Cost totals ──────────────────────────────────────────────────────────
  const costs = useMemo(() => {
    if (!calc) return null;
    const cpg = parseFloat(costPerGal)  || 0;
    const cpc = parseFloat(costPerCart) || 0;
    const cps = parseFloat(costPerSaus) || 0;
    return {
      byGallon:    cpg > 0 ? (calc.gallonsRaw * cpg).toFixed(2)      : null,
      byCartridge: cpc > 0 ? (calc.cartridges  * cpc).toFixed(2)     : null,
      bySausage:   cps > 0 ? (calc.sausages    * cps).toFixed(2)     : null,
    };
  }, [calc, costPerGal, costPerCart, costPerSaus]);

  const hasInput = jointWidth || jointDepth || linearFeet;

  const handleClear = () => {
    setJointWidth('');
    setJointDepth('');
    setLinearFeet('');
    setWastePct('10');
  };

  return (
    <div style={s.root}>
      {/* Nav bar */}
      <div style={s.navBar}>
        <button style={s.backBtn} onClick={onBack}>← Suite Home</button>
        <span style={s.navTitle}>🔧 Caulking / Sealant Calculator</span>
      </div>

      <div style={s.body}>
        {/* ─── Left panel: inputs ──────────────────────────────────── */}
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Joint Dimensions</span>
            {hasInput && (
              <button style={s.clearBtn} onClick={handleClear}>Clear All</button>
            )}
          </div>

          {/* Diagram */}
          <div style={s.diagramBox}>
            <JointDiagram width={jointWidth} depth={jointDepth} />
            <p style={s.diagramCaption}>
              Cross-section — sealant volume fills width × depth × linear length
            </p>
          </div>

          <div style={s.fieldsGrid}>
            {numField('Joint Width (in)', jointWidth, setJointWidth, { step: '0.0625', hint: 'Measured face-to-face of substrates' })}
            {numField('Joint Depth (in)', jointDepth, setJointDepth, { step: '0.0625', hint: 'Sealant fill depth (not backer rod)' })}
            {numField('Linear Feet', linearFeet, setLinearFeet, { step: '1', hint: 'Total run of joint' })}
            {numField('Waste (%)', wastePct, setWastePct, { step: '1', min: '0', hint: 'Typical: 5–15%' })}
          </div>

          {/* Rule of thumb note */}
          <div style={s.note}>
            <span style={s.noteIcon}>ℹ️</span>
            <span>
              Joint depth should equal joint width for joints ≤ ½". For wider joints, limit depth to ½" with a backer rod.
            </span>
          </div>
        </div>

        {/* ─── Right panel: results ────────────────────────────────── */}
        <div style={s.resultsPanel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Amount of Sealant Needed</span>
          </div>

          {calc ? (
            <>
              <div style={s.resultsGrid}>
                <ResultCard
                  icon="🥫"
                  label="Gallons"
                  value={calc.gallons}
                  unit="gal"
                  sub="Net volume incl. waste"
                />
                <ResultCard
                  icon="🖊️"
                  label="Cartridges"
                  value={calc.cartridges}
                  unit="ea"
                  sub="10.3 fl oz each"
                />
                <ResultCard
                  icon="🌭"
                  label="Sausages"
                  value={calc.sausages}
                  unit="ea"
                  sub="20 fl oz each"
                />
              </div>

              {/* ─── Cost per section ─────────────────────────── */}
              <div style={s.costSection}>
                <div style={s.panelHeader}>
                  <span style={s.panelTitle}>Cost Estimate</span>
                  <span style={s.costHint}>Enter unit price for any packaging type</span>
                </div>
                <div style={s.costGrid}>
                  {/* Gallon */}
                  <div style={s.costCard}>
                    <div style={s.costCardLabel}>🥫 Per Gallon</div>
                    <div style={s.costInputRow}>
                      <span style={s.currencySymbol}>$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={costPerGal}
                        onChange={e => setCostPerGal(e.target.value)}
                        style={s.costInput}
                      />
                      <span style={s.costUnit}>/ gal</span>
                    </div>
                    {costs?.byGallon && (
                      <div style={s.costTotal}>
                        <span style={s.costTotalLabel}>{calc.gallons} gal ×</span>
                        <span style={s.costTotalValue}>${costs.byGallon}</span>
                      </div>
                    )}
                  </div>

                  {/* Cartridge */}
                  <div style={s.costCard}>
                    <div style={s.costCardLabel}>🖊️ Per Cartridge (10.3 fl oz)</div>
                    <div style={s.costInputRow}>
                      <span style={s.currencySymbol}>$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={costPerCart}
                        onChange={e => setCostPerCart(e.target.value)}
                        style={s.costInput}
                      />
                      <span style={s.costUnit}>/ ea</span>
                    </div>
                    {costs?.byCartridge && (
                      <div style={s.costTotal}>
                        <span style={s.costTotalLabel}>{calc.cartridges} ea ×</span>
                        <span style={s.costTotalValue}>${costs.byCartridge}</span>
                      </div>
                    )}
                  </div>

                  {/* Sausage */}
                  <div style={s.costCard}>
                    <div style={s.costCardLabel}>🌭 Per Sausage (20 fl oz)</div>
                    <div style={s.costInputRow}>
                      <span style={s.currencySymbol}>$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={costPerSaus}
                        onChange={e => setCostPerSaus(e.target.value)}
                        style={s.costInput}
                      />
                      <span style={s.costUnit}>/ ea</span>
                    </div>
                    {costs?.bySausage && (
                      <div style={s.costTotal}>
                        <span style={s.costTotalLabel}>{calc.sausages} ea ×</span>
                        <span style={s.costTotalValue}>${costs.bySausage}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={s.breakdown}>
                <div style={s.breakdownTitle}>Calculation Breakdown</div>
                <div style={s.breakdownRow}>
                  <span>Joint cross-section</span>
                  <span>{jointWidth}" × {jointDepth}" = {(parseFloat(jointWidth) * parseFloat(jointDepth)).toFixed(4)} in²</span>
                </div>
                <div style={s.breakdownRow}>
                  <span>Volume (no waste)</span>
                  <span>
                    {((parseFloat(jointWidth) * parseFloat(jointDepth) * parseFloat(linearFeet) * 12) / CU_IN_PER_GAL).toFixed(4)} gal
                  </span>
                </div>
                <div style={s.breakdownRow}>
                  <span>Waste factor</span>
                  <span>+{wastePct}%</span>
                </div>
                <div style={{ ...s.breakdownRow, fontWeight: 700, borderTop: `1px solid ${ACCENT}33`, paddingTop: 8, marginTop: 4 }}>
                  <span>Total needed</span>
                  <span style={{ color: ACCENT }}>{calc.gallons} gal</span>
                </div>
              </div>
            </>
          ) : (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>🔧</div>
              <p style={s.emptyText}>Enter joint width, depth, and linear feet to calculate sealant quantities.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-deep, #0d1117)',
    color: 'var(--text-primary, #e6edf3)',
  },
  navBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 20px',
    background: 'var(--bg-card, #161b22)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    flexShrink: 0,
  },
  backBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--text-secondary, #8b949e)',
    padding: '5px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.82rem',
  },
  navTitle: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: 'var(--text-primary, #e6edf3)',
  },
  body: {
    flex: 1,
    display: 'flex',
    gap: 0,
    overflow: 'hidden',
  },
  panel: {
    width: 340,
    flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.07)',
    padding: '24px 20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  resultsPanel: {
    flex: 1,
    padding: '24px 28px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-secondary, #8b949e)',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: ACCENT,
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 600,
    padding: 0,
  },
  diagramBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '16px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  diagram: {
    display: 'block',
  },
  diagramCaption: {
    margin: 0,
    fontSize: '0.7rem',
    color: 'var(--text-secondary, #8b949e)',
    textAlign: 'center',
    lineHeight: 1.4,
  },
  fieldsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  label: {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: 'var(--text-primary, #e6edf3)',
  },
  hint: {
    fontSize: '0.7rem',
    color: 'var(--text-secondary, #8b949e)',
  },
  input: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 7,
    color: 'var(--text-primary, #e6edf3)',
    fontSize: '0.95rem',
    padding: '8px 12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  note: {
    display: 'flex',
    gap: 8,
    padding: '10px 12px',
    background: `${ACCENT}10`,
    border: `1px solid ${ACCENT}30`,
    borderRadius: 8,
    fontSize: '0.72rem',
    color: 'var(--text-secondary, #8b949e)',
    lineHeight: 1.5,
  },
  noteIcon: {
    flexShrink: 0,
    lineHeight: 1.5,
  },
  resultsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
  },
  resultCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 16px',
    background: 'var(--bg-card, #161b22)',
    border: `1px solid ${ACCENT}40`,
    borderRadius: 12,
    textAlign: 'center',
    gap: 4,
  },
  resultIcon: {
    fontSize: '1.6rem',
    marginBottom: 4,
  },
  resultValue: {
    fontSize: '2rem',
    fontWeight: 900,
    color: ACCENT,
    lineHeight: 1,
  },
  resultUnit: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: ACCENT,
    opacity: 0.7,
  },
  resultLabel: {
    fontSize: '0.82rem',
    fontWeight: 700,
    color: 'var(--text-primary, #e6edf3)',
    marginTop: 4,
  },
  resultSub: {
    fontSize: '0.68rem',
    color: 'var(--text-secondary, #8b949e)',
  },
  breakdown: {
    padding: '20px',
    background: 'var(--bg-card, #161b22)',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  breakdownTitle: {
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--text-secondary, #8b949e)',
    marginBottom: 4,
  },
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.83rem',
    color: 'var(--text-secondary, #8b949e)',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    opacity: 0.5,
  },
  emptyIcon: {
    fontSize: '3rem',
  },
  emptyText: {
    margin: 0,
    fontSize: '0.9rem',
    color: 'var(--text-secondary, #8b949e)',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 1.6,
  },
  costSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  costHint: {
    fontSize: '0.7rem',
    color: 'var(--text-secondary, #8b949e)',
    fontStyle: 'italic',
  },
  costGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
  },
  costCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '14px 16px',
    background: 'var(--bg-card, #161b22)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
  },
  costCardLabel: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--text-secondary, #8b949e)',
  },
  costInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  currencySymbol: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary, #8b949e)',
    flexShrink: 0,
  },
  costInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: 'var(--text-primary, #e6edf3)',
    fontSize: '0.95rem',
    padding: '6px 10px',
    outline: 'none',
    minWidth: 0,
  },
  costUnit: {
    fontSize: '0.75rem',
    color: 'var(--text-secondary, #8b949e)',
    flexShrink: 0,
  },
  costTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTop: `1px solid ${ACCENT}30`,
  },
  costTotalLabel: {
    fontSize: '0.72rem',
    color: 'var(--text-secondary, #8b949e)',
  },
  costTotalValue: {
    fontSize: '1.05rem',
    fontWeight: 800,
    color: ACCENT,
  },
};
