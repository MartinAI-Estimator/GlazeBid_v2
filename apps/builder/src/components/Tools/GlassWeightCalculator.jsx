import React, { useState, useMemo } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
// Float glass density = 2.5 g/cm³ → 13.12 lb/ft²/inch of thickness
const LBS_PER_SQFT_PER_INCH = 13.12;
const ACCENT = '#e879f9';

const THICKNESSES = [
  { label: '3/32" (2mm)',  inches: 0.09375 },
  { label: '1/8" (3mm)',   inches: 0.125   },
  { label: '5/32" (4mm)',  inches: 0.15625 },
  { label: '3/16" (5mm)',  inches: 0.1875  },
  { label: '1/4" (6mm)',   inches: 0.25    },
  { label: '5/16" (8mm)',  inches: 0.3125  },
  { label: '3/8" (10mm)',  inches: 0.375   },
  { label: '1/2" (12mm)',  inches: 0.5     },
  { label: '9/16" (14mm)', inches: 0.5625  },
  { label: '5/8" (16mm)',  inches: 0.625   },
  { label: '3/4" (19mm)',  inches: 0.75    },
  { label: '1" (25mm)',    inches: 1.0     },
];

const INTERLAYERS = [
  { label: 'PVB .030" — Standard',     psf: 0.045 },
  { label: 'PVB .060" — Double',       psf: 0.085 },
  { label: 'PVB .090" — Triple',       psf: 0.128 },
  { label: 'SGP .060" — SentryGlas®',  psf: 0.090 },
  { label: 'SGP .090" — Heavy',        psf: 0.135 },
];

const TYPES = [
  { id: 'mono',    label: 'Monolithic'    },
  { id: 'ig',      label: 'Insulated (IG)' },
  { id: 'lami',    label: 'Laminated'     },
  { id: 'lami-ig', label: 'Laminated IGU' },
];

const fmt2 = n => n.toFixed(2);
const fmt3 = n => n.toFixed(3);

function ThicknessSelect({ label, value, onChange }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={s.select}>
        {THICKNESSES.map(t => (
          <option key={t.label} value={t.inches} style={{ background: '#161b22', color: '#e6edf3' }}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}

function InterlayerSelect({ label, value, onChange }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={s.select}>
        {INTERLAYERS.map(il => (
          <option key={il.label} value={il.psf} style={{ background: '#161b22', color: '#e6edf3' }}>{il.label}</option>
        ))}
      </select>
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div style={s.divider}>
      <span style={s.dividerLabel}>{label}</span>
    </div>
  );
}

// Simple SVG cross-section preview
function GlassCrossSection({ type, t1, t2, t3, t4 }) {
  const scale = 40; // px per inch, clamped
  const maxH  = 180;
  const w     = 120;
  const layers = [];

  const clamp = in_ => Math.min(Math.max(in_ * scale, 6), 40);

  if (type === 'mono') {
    layers.push({ h: clamp(t1), fill: '#88c8f0aa', label: `${t1}"` });
  } else if (type === 'ig') {
    layers.push({ h: clamp(t1), fill: '#88c8f0aa', label: `${t1}"` });
    layers.push({ h: 20,        fill: '#2a2a3a88', label: 'Air' });
    layers.push({ h: clamp(t2), fill: '#88c8f0aa', label: `${t2}"` });
  } else if (type === 'lami') {
    layers.push({ h: clamp(t1), fill: '#88c8f0aa', label: `${t1}"` });
    layers.push({ h: 5,         fill: `${ACCENT}99`, label: 'PVB' });
    layers.push({ h: clamp(t2), fill: '#88c8f0aa', label: `${t2}"` });
  } else if (type === 'lami-ig') {
    layers.push({ h: clamp(t1), fill: '#88c8f0aa', label: `${t1}"` });
    layers.push({ h: 5,         fill: `${ACCENT}99`, label: 'PVB' });
    layers.push({ h: clamp(t2), fill: '#88c8f0aa', label: `${t2}"` });
    layers.push({ h: 20,        fill: '#2a2a3a88', label: 'Air' });
    layers.push({ h: clamp(t3), fill: '#88c8f0aa', label: `${t3}"` });
  }

  const totalH = layers.reduce((a, l) => a + l.h, 0);
  const svgH   = Math.max(totalH + 16, 60);
  let y = 8;

  return (
    <svg width={w} height={svgH} style={{ display: 'block', overflow: 'visible' }}>
      {layers.map((layer, i) => {
        const rect = (
          <g key={i}>
            <rect x={10} y={y} width={w - 20} height={layer.h} fill={layer.fill}
              stroke="rgba(255,255,255,0.18)" strokeWidth={1} rx={1} />
            <text x={w / 2} y={y + layer.h / 2 + 4} textAnchor="middle"
              fill="rgba(255,255,255,0.75)" fontSize={9}>{layer.label}</text>
          </g>
        );
        y += layer.h;
        return rect;
      })}
    </svg>
  );
}

function ResultRow({ label, value, highlight }) {
  return (
    <div style={{ ...s.resultRow, ...(highlight ? s.resultRowHL : {}) }}>
      <span style={s.resultLabel}>{label}</span>
      <span style={{ ...s.resultVal, ...(highlight ? { color: ACCENT, fontWeight: 800 } : {}) }}>{value}</span>
    </div>
  );
}

export default function GlassWeightCalculator({ onBack }) {
  const [type,       setType]       = useState('mono');
  // Thicknesses stored as strings (option values) then parsed
  const [t1, setT1] = useState('0.25');   // outer / mono / lami lite 1
  const [t2, setT2] = useState('0.25');   // ig inner / lami lite 2
  const [t3, setT3] = useState('0.25');   // lami-ig: inner mono lite
  const [il1, setIl1] = useState(String(INTERLAYERS[0].psf)); // interlayer (lami / lami-ig outer)

  const [widthIn,  setWidthIn]  = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [qty,      setQty]      = useState('1');

  // ─── Weight math ──────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const p1 = parseFloat(t1)  || 0;
    const p2 = parseFloat(t2)  || 0;
    const p3 = parseFloat(t3)  || 0;
    const il = parseFloat(il1) || 0;
    const w  = parseFloat(widthIn)  || 0;
    const h  = parseFloat(heightIn) || 0;
    const q  = Math.max(parseInt(qty) || 1, 1);

    if (w <= 0 || h <= 0) return null;

    const sqft = (w * h) / 144;

    // Build layer breakdown
    const layers = [];

    if (type === 'mono') {
      layers.push({ desc: `Glass ${p1}"`,  psf: p1 * LBS_PER_SQFT_PER_INCH });
    } else if (type === 'ig') {
      layers.push({ desc: `Outer lite ${p1}"`,  psf: p1 * LBS_PER_SQFT_PER_INCH });
      layers.push({ desc: `Inner lite ${p2}"`,  psf: p2 * LBS_PER_SQFT_PER_INCH });
    } else if (type === 'lami') {
      layers.push({ desc: `Lite 1 ${p1}"`,       psf: p1 * LBS_PER_SQFT_PER_INCH });
      layers.push({ desc: `Interlayer`,          psf: il });
      layers.push({ desc: `Lite 2 ${p2}"`,       psf: p2 * LBS_PER_SQFT_PER_INCH });
    } else if (type === 'lami-ig') {
      layers.push({ desc: `Lam lite 1 ${p1}"`,   psf: p1 * LBS_PER_SQFT_PER_INCH });
      layers.push({ desc: `Interlayer`,           psf: il });
      layers.push({ desc: `Lam lite 2 ${p2}"`,   psf: p2 * LBS_PER_SQFT_PER_INCH });
      layers.push({ desc: `Inner lite ${p3}"`,    psf: p3 * LBS_PER_SQFT_PER_INCH });
    }

    const totalPsf  = layers.reduce((a, l) => a + l.psf, 0);
    const lbsEach   = totalPsf * sqft;
    const lbsTotal  = lbsEach * q;
    const kgEach    = lbsEach * 0.453592;
    const kgTotal   = lbsTotal * 0.453592;
    const tonsTotal = lbsTotal / 2000;

    return { layers, totalPsf, sqft, lbsEach, lbsTotal, kgEach, kgTotal, tonsTotal, q };
  }, [type, t1, t2, t3, il1, widthIn, heightIn, qty]);

  return (
    <div style={s.root}>
      {/* Nav */}
      <div style={s.navBar}>
        <button style={s.backBtn} onClick={onBack}>← Suite Home</button>
        <span style={s.navTitle}>🪟 Glass Weight Calculator</span>
      </div>

      <div style={s.body}>
        {/* ─── Left panel ─────────────────────────────────────────── */}
        <div style={s.panel}>

          {/* Type selector */}
          <div style={s.field}>
            <label style={s.label}>Glass Type</label>
            <div style={s.typeGrid}>
              {TYPES.map(tp => (
                <button
                  key={tp.id}
                  style={{
                    ...s.typeBtn,
                    background: type === tp.id ? ACCENT : 'rgba(255,255,255,0.04)',
                    color:      type === tp.id ? '#000'  : 'var(--text-secondary, #8b949e)',
                    borderColor: type === tp.id ? ACCENT : 'rgba(255,255,255,0.12)',
                    fontWeight:  type === tp.id ? 700    : 500,
                  }}
                  onClick={() => setType(tp.id)}
                >
                  {tp.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Monolithic ── */}
          {type === 'mono' && (
            <>
              <SectionDivider label="Glass" />
              <ThicknessSelect label="Thickness" value={t1} onChange={setT1} />
            </>
          )}

          {/* ── Insulated IG ── */}
          {type === 'ig' && (
            <>
              <SectionDivider label="Outer Lite" />
              <ThicknessSelect label="Outer Glass Thickness" value={t1} onChange={setT1} />
              <SectionDivider label="Inner Lite" />
              <ThicknessSelect label="Inner Glass Thickness" value={t2} onChange={setT2} />
            </>
          )}

          {/* ── Laminated ── */}
          {type === 'lami' && (
            <>
              <SectionDivider label="Laminated Make-Up" />
              <ThicknessSelect label="Lite 1 Thickness" value={t1} onChange={setT1} />
              <InterlayerSelect label="Interlayer" value={il1} onChange={setIl1} />
              <ThicknessSelect label="Lite 2 Thickness" value={t2} onChange={setT2} />
            </>
          )}

          {/* ── Laminated IGU ── */}
          {type === 'lami-ig' && (
            <>
              <SectionDivider label="Outer Laminated Lite" />
              <ThicknessSelect label="Outer Lite 1 Thickness" value={t1} onChange={setT1} />
              <InterlayerSelect label="Interlayer" value={il1} onChange={setIl1} />
              <ThicknessSelect label="Outer Lite 2 Thickness" value={t2} onChange={setT2} />
              <SectionDivider label="Inner Lite (Monolithic)" />
              <ThicknessSelect label="Inner Glass Thickness" value={t3} onChange={setT3} />
            </>
          )}

          {/* ── Size ── */}
          <SectionDivider label="Lite Size" />
          <div style={s.field}>
            <label style={s.label}>Width (in)</label>
            <input type="number" min="0" step="0.0625" placeholder="—"
              value={widthIn} onChange={e => setWidthIn(e.target.value)} style={s.input} />
          </div>
          <div style={s.field}>
            <label style={s.label}>Height (in)</label>
            <input type="number" min="0" step="0.0625" placeholder="—"
              value={heightIn} onChange={e => setHeightIn(e.target.value)} style={s.input} />
          </div>

          <div style={s.field}>
            <label style={s.label}>Quantity (lites)</label>
            <input type="number" min="1" step="1" value={qty}
              onChange={e => setQty(e.target.value)} style={s.input} />
          </div>

          {/* Cross-section preview */}
          {(parseFloat(t1) > 0) && (
            <div style={s.previewBox}>
              <div style={s.previewLabel}>Cross-Section</div>
              <GlassCrossSection
                type={type}
                t1={parseFloat(t1)} t2={parseFloat(t2)}
                t3={parseFloat(t3)} t4={0}
              />
            </div>
          )}
        </div>

        {/* ─── Right panel: results ────────────────────────────────── */}
        <div style={s.resultsPanel}>
          {calc ? (
            <>
              {/* Summary cards */}
              <div style={s.cardRow}>
                <div style={s.bigCard}>
                  <div style={s.bigCardTop}>Weight / Lite</div>
                  <div style={s.bigCardValue}>{fmt2(calc.lbsEach)}</div>
                  <div style={s.bigCardUnit}>lbs</div>
                  <div style={s.bigCardSub}>{fmt2(calc.kgEach)} kg</div>
                </div>
                <div style={s.bigCard}>
                  <div style={s.bigCardTop}>Total Weight ({calc.q} {calc.q === 1 ? 'lite' : 'lites'})</div>
                  <div style={{ ...s.bigCardValue, color: ACCENT }}>{fmt2(calc.lbsTotal)}</div>
                  <div style={{ ...s.bigCardUnit, color: ACCENT }}>lbs</div>
                  <div style={s.bigCardSub}>{fmt2(calc.kgTotal)} kg &nbsp;·&nbsp; {fmt3(calc.tonsTotal)} tons</div>
                </div>
                <div style={s.bigCard}>
                  <div style={s.bigCardTop}>Unit Weight</div>
                  <div style={s.bigCardValue}>{fmt2(calc.totalPsf)}</div>
                  <div style={s.bigCardUnit}>lb / ft²</div>
                  <div style={s.bigCardSub}>{fmt2(calc.sqft)} ft² per lite</div>
                </div>
              </div>

              {/* Layer breakdown */}
              <div style={s.breakdown}>
                <div style={s.breakTitle}>Layer-by-Layer Breakdown</div>
                <div style={s.breakHeader}>
                  <span>Layer</span>
                  <span>lb/ft²</span>
                  <span>Lbs (1 lite)</span>
                </div>
                {calc.layers.map((l, i) => (
                  <div key={i} style={s.breakRow}>
                    <span>{l.desc}</span>
                    <span>{fmt3(l.psf)}</span>
                    <span>{fmt2(l.psf * calc.sqft)}</span>
                  </div>
                ))}
                <div style={{ ...s.breakRow, ...s.breakTotal }}>
                  <span>Total</span>
                  <span>{fmt3(calc.totalPsf)}</span>
                  <span style={{ color: ACCENT }}>{fmt2(calc.lbsEach)} lbs</span>
                </div>
              </div>

              {/* Reference note */}
              <div style={s.refNote}>
                <span>📐</span>
                <span>
                  Based on float glass density 2.5 g/cm³ (13.12 lb/ft²/in).
                  Interlayer weights: PVB ≈ 0.045–0.128 psf · SGP ≈ 0.090–0.135 psf.
                  Actual weights may vary by manufacturer. Always verify for crane and handling planning.
                </span>
              </div>
            </>
          ) : (
            <div style={s.emptyState}>
              <div style={{ fontSize: '3rem' }}>🪟</div>
              <p style={s.emptyText}>Enter a lite size (width × height) to calculate weight.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep, #0d1117)', color: 'var(--text-primary, #e6edf3)' },
  navBar: { display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', background: 'var(--bg-card, #161b22)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  backBtn: { background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary, #8b949e)', padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem' },
  navTitle: { fontSize: '0.95rem', fontWeight: 700 },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },

  // Left panel
  panel: { width: 300, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)', padding: '20px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 },
  typeBtn: { padding: '7px 6px', borderRadius: 7, border: '1px solid', cursor: 'pointer', fontSize: '0.78rem', textAlign: 'center', transition: 'all 0.15s' },
  divider: { display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 0' },
  dividerLabel: { fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary, #8b949e)', whiteSpace: 'nowrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, #e6edf3)' },
  select: { background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: '#e6edf3', fontSize: '0.88rem', padding: '7px 10px', outline: 'none' },
  input: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--text-primary, #e6edf3)', fontSize: '0.95rem', padding: '7px 10px', outline: 'none' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  previewBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', marginTop: 4 },
  previewLabel: { fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-secondary, #8b949e)' },

  // Right panel
  resultsPanel: { flex: 1, padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 },
  cardRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  bigCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 12px', background: 'var(--bg-card, #161b22)', border: `1px solid ${ACCENT}40`, borderRadius: 12, textAlign: 'center', gap: 2 },
  bigCardTop: { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary, #8b949e)', marginBottom: 6 },
  bigCardValue: { fontSize: '2.2rem', fontWeight: 900, lineHeight: 1 },
  bigCardUnit: { fontSize: '0.8rem', fontWeight: 600, opacity: 0.7, marginTop: 2 },
  bigCardSub: { fontSize: '0.7rem', color: 'var(--text-secondary, #8b949e)', marginTop: 6 },

  // Breakdown table
  breakdown: { background: 'var(--bg-card, #161b22)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0 },
  breakTitle: { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary, #8b949e)', marginBottom: 10 },
  breakHeader: { display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: 8, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary, #8b949e)', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 6, marginBottom: 4 },
  breakRow: { display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: 8, fontSize: '0.83rem', color: 'var(--text-secondary, #8b949e)', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  breakTotal: { fontWeight: 700, color: 'var(--text-primary, #e6edf3)', borderTop: `1px solid ${ACCENT}33`, borderBottom: 'none', marginTop: 6, paddingTop: 8 },

  resultRow: { display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' },
  resultRowHL: { borderTop: `1px solid ${ACCENT}33`, borderBottom: 'none', marginTop: 4, paddingTop: 10 },
  resultLabel: { color: 'var(--text-secondary, #8b949e)' },
  resultVal: { fontWeight: 600 },

  refNote: { display: 'flex', gap: 10, padding: '12px 16px', background: `${ACCENT}0d`, border: `1px solid ${ACCENT}28`, borderRadius: 8, fontSize: '0.72rem', color: 'var(--text-secondary, #8b949e)', lineHeight: 1.55 },

  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: 0.5 },
  emptyText: { margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary, #8b949e)', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 },
};

