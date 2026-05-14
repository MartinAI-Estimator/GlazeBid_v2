import React, { useState, useMemo } from 'react';
import { analyzeStructural } from '@glazebid/frame-engine';

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCENT = '#06b6d4'; // cyan

const SYSTEM_CLASSES = [
  { value: 'ext-storefront',  label: 'Exterior Storefront  (L/175)' },
  { value: 'int-storefront',  label: 'Interior Storefront  (L/175)' },
  { value: 'cap-curtainwall', label: 'Capped Curtainwall   (L/240)' },
  { value: 'ssg-cw',         label: 'SSG Curtainwall      (L/240)' },
  { value: 'all-glass',       label: 'All-Glass System     (L/60)'  },
];

const PROFILE_DEPTHS = [
  { label: '2"   — Shallow Storefront', value: 2.0 },
  { label: '2.5" — Standard Storefront', value: 2.5 },
  { label: '3"   — Deep Storefront',    value: 3.0 },
  { label: '3.5" — Transition',         value: 3.5 },
  { label: '4"   — Shallow CW',         value: 4.0 },
  { label: '4.5" — Medium CW',          value: 4.5 },
  { label: '5"   — CW Standard',        value: 5.0 },
  { label: '6"   — Deep CW',            value: 6.0 },
  { label: '7"   — Heavy CW',           value: 7.0 },
];

const WIND_PRESETS = [90, 100, 110, 115, 130, 150];
const EXPOSURES    = ['B', 'C', 'D'];

const STATUS_CFG = {
  PASS: {
    label: 'PASS',            icon: '✓',
    color: '#22c55e',         bg: 'rgba(34,197,94,0.12)',
    desc:  'Aluminum mullion adequate for applied loads.',
  },
  ADD_STEEL: {
    label: 'ADD STEEL',       icon: '⚡',
    color: '#f59e0b',         bg: 'rgba(245,158,11,0.12)',
    desc:  'HSS reinforcement tube required in mullion cavity.',
  },
  UPGRADE_PROFILE: {
    label: 'UPGRADE PROFILE', icon: '▲',
    color: '#f97316',         bg: 'rgba(249,115,22,0.12)',
    desc:  'Deeper profile required. Current system insufficient.',
  },
  ENGINEER_REQUIRED: {
    label: 'ENGINEER REQUIRED', icon: '⛔',
    color: '#ef4444',           bg: 'rgba(239,68,68,0.12)',
    desc:  'Loads exceed standard limits. PE review required.',
  },
};

const LADDER_ORDER = ['PASS', 'ADD_STEEL', 'UPGRADE_PROFILE', 'ENGINEER_REQUIRED'];
const fmt = (n, d = 2) => (typeof n === 'number' ? n.toFixed(d) : '—');

// ─── Sub-components ───────────────────────────────────────────────────────────
function Section({ label, hint, children }) {
  return (
    <div style={s.section}>
      <label style={s.sectionLabel}>{label}</label>
      {hint && <div style={s.hint}>{hint}</div>}
      {children}
    </div>
  );
}

function Divider() { return <div style={s.divider} />; }

function MetricCard({ label, value, unit }) {
  return (
    <div style={s.metricCard}>
      <div style={s.metricValue}>{value}<span style={s.metricUnit}> {unit}</span></div>
      <div style={s.metricLabel}>{label}</div>
    </div>
  );
}

function SteelItem({ label, value }) {
  return (
    <div>
      <div style={s.steelItemLabel}>{label}</div>
      <div style={s.steelItemValue}>{value}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StructuralCalculator({ onBack }) {
  const [systemClass,    setSystemClass]    = useState('ext-storefront');
  const [profileDepth,   setProfileDepth]   = useState('3.0');
  const [windSpeed,      setWindSpeed]      = useState('110');
  const [exposure,       setExposure]       = useState('C');
  const [buildingHeight, setBuildingHeight] = useState('30');
  const [spanFt,         setSpanFt]         = useState('10');
  const [tributaryIn,    setTributaryIn]    = useState('36');

  const result = useMemo(() => {
    const windSpeedMph     = parseFloat(windSpeed)      || 0;
    const buildingHeightFt = parseFloat(buildingHeight) || 0;
    const mullionSpanIn    = (parseFloat(spanFt) || 0) * 12;
    const tributaryWidthIn = parseFloat(tributaryIn)    || 0;
    const profileDepthIn   = parseFloat(profileDepth)   || 3.0;

    if (windSpeedMph <= 0 || buildingHeightFt <= 0 || mullionSpanIn <= 0 || tributaryWidthIn <= 0) return null;

    try {
      return analyzeStructural({ windSpeedMph, exposureCategory: exposure, buildingHeightFt, mullionSpanIn, tributaryWidthIn, profileDepthIn, systemClass });
    } catch { return null; }
  }, [systemClass, profileDepth, windSpeed, exposure, buildingHeight, spanFt, tributaryIn]);

  const statusCfg      = result ? STATUS_CFG[result.status] : null;
  const currentStep    = result ? LADDER_ORDER.indexOf(result.status) : -1;
  const utilizePct     = result ? (result.mullionDeflectionIn / result.deflectionLimitIn) * 100 : 0;

  return (
    <div style={s.root}>
      {/* Nav Bar */}
      <div style={s.navBar}>
        <button style={s.backBtn} onClick={onBack}>← Suite Home</button>
        <span style={s.navTitle}>🧱 Structural Calculator</span>
        <span style={s.navSub}>ASCE 7-22 Wind Load Analysis</span>
      </div>

      <div style={s.body}>
        {/* ── Left: Inputs ── */}
        <div style={s.leftPanel}>
          <div style={s.panelTitle}>Design Parameters</div>

          <Section label="System Type">
            <select value={systemClass} onChange={e => setSystemClass(e.target.value)} style={s.select}>
              {SYSTEM_CLASSES.map(sc => (
                <option key={sc.value} value={sc.value} style={{ background: '#161b22', color: '#e6edf3' }}>{sc.label}</option>
              ))}
            </select>
          </Section>

          <Section label="Profile Depth">
            <select value={profileDepth} onChange={e => setProfileDepth(e.target.value)} style={s.select}>
              {PROFILE_DEPTHS.map(pd => (
                <option key={pd.value} value={pd.value} style={{ background: '#161b22', color: '#e6edf3' }}>{pd.label}</option>
              ))}
            </select>
          </Section>

          <Divider />

          <Section label="Basic Wind Speed (mph)">
            <div style={s.presetRow}>
              {WIND_PRESETS.map(v => (
                <button
                  key={v}
                  style={{ ...s.presetBtn, ...(String(v) === windSpeed ? { background: ACCENT, color: '#000', borderColor: ACCENT } : {}) }}
                  onClick={() => setWindSpeed(String(v))}
                >{v}</button>
              ))}
            </div>
            <input type="number" min="60" max="300" step="5" value={windSpeed}
              onChange={e => setWindSpeed(e.target.value)} style={s.input} placeholder="Custom mph" />
          </Section>

          <Section label="Exposure Category">
            <div style={s.segRow}>
              {EXPOSURES.map(exp => (
                <button
                  key={exp}
                  style={{ ...s.segBtn, ...(exposure === exp ? { background: ACCENT, color: '#000', borderColor: ACCENT } : {}) }}
                  onClick={() => setExposure(exp)}
                >{exp}</button>
              ))}
            </div>
            <div style={s.expHint}>
              {exposure === 'B' && 'Suburban / wooded, sheltered terrain'}
              {exposure === 'C' && 'Open terrain with scattered obstructions'}
              {exposure === 'D' && 'Unobstructed flat areas — shorelines'}
            </div>
          </Section>

          <Section label="Building Height (ft)">
            <input type="number" min="8" max="500" step="1" value={buildingHeight}
              onChange={e => setBuildingHeight(e.target.value)} style={s.input} />
          </Section>

          <Divider />
          <div style={s.panelSubTitle}>Frame Geometry</div>

          <Section label="Mullion Span (ft)" hint="Floor-to-floor or unsupported length">
            <input type="number" min="1" max="60" step="0.25" value={spanFt}
              onChange={e => setSpanFt(e.target.value)} style={s.input} />
            {spanFt && <div style={s.unitNote}>{fmt(parseFloat(spanFt) * 12 || 0, 1)}&Prime;</div>}
          </Section>

          <Section label="Tributary Width (in)" hint="Bay width center-to-center">
            <input type="number" min="6" max="120" step="0.25" value={tributaryIn}
              onChange={e => setTributaryIn(e.target.value)} style={s.input} />
            {tributaryIn && <div style={s.unitNote}>{fmt((parseFloat(tributaryIn) || 0) / 12, 2)} ft</div>}
          </Section>
        </div>

        {/* ── Right: Results ── */}
        <div style={s.rightPanel}>
          {!result ? (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>🧱</div>
              <div style={s.emptyText}>Enter design parameters to run analysis</div>
            </div>
          ) : (
            <>
              {/* Decision Ladder */}
              <div style={s.ladderCard}>
                <div style={s.cardTitle}>Decision Ladder</div>
                <div style={s.ladder}>
                  {LADDER_ORDER.map((step, i) => {
                    const cfg      = STATUS_CFG[step];
                    const isActive = i === currentStep;
                    const isPast   = i < currentStep;
                    return (
                      <div key={step} style={{ ...s.ladderStep, ...(isActive ? { background: cfg.bg, borderColor: cfg.color } : {}), ...(isPast ? { opacity: 0.35 } : {}) }}>
                        <div style={{ ...s.ladderIcon, ...(isActive ? { color: cfg.color } : {}) }}>
                          {isActive ? cfg.icon : isPast ? '✓' : '○'}
                        </div>
                        <div style={s.ladderText}>
                          <span style={isActive ? { color: cfg.color, fontWeight: 600 } : {}}>{cfg.label}</span>
                          {isActive && <div style={s.ladderDesc}>{cfg.desc}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Wind Metrics */}
              <div style={s.metricsRow}>
                <MetricCard label="Design Pressure"       value={fmt(result.windPressurePsf)} unit="psf" />
                <MetricCard label="Velocity Pressure (qz)" value={fmt(result.qz)}             unit="psf" />
                <MetricCard label="Exposure Factor (Kz)"  value={fmt(result.Kz, 3)}           unit=""    />
              </div>

              {/* Deflection Check */}
              <div style={s.deflCard}>
                <div style={s.cardTitle}>Deflection Check</div>
                <div style={s.deflRow}>
                  <div>
                    <div style={s.deflLabel}>Calculated</div>
                    <div style={{ ...s.deflValue, color: utilizePct > 100 ? '#ef4444' : ACCENT }}>
                      {fmt(result.mullionDeflectionIn, 4)}&Prime;
                    </div>
                  </div>
                  <div>
                    <div style={s.deflLabel}>Limit (L/{result.deflectionRatio})</div>
                    <div style={s.deflValue}>{fmt(result.deflectionLimitIn, 4)}&Prime;</div>
                  </div>
                  <div>
                    <div style={s.deflLabel}>Utilization</div>
                    <div style={{ ...s.deflValue, color: utilizePct > 100 ? '#ef4444' : '#22c55e' }}>
                      {fmt(utilizePct, 1)}%
                    </div>
                  </div>
                </div>
                <div style={s.utilBar}>
                  <div style={{ ...s.utilFill, width: `${Math.min(utilizePct, 100)}%`, background: utilizePct > 100 ? '#ef4444' : utilizePct > 80 ? '#f59e0b' : '#22c55e' }} />
                </div>
              </div>

              {/* Steel Recommendation */}
              {result.steelRec && (
                <div style={s.steelCard}>
                  <div style={s.steelTitle}>⚡ Steel Reinforcement</div>
                  <div style={s.steelGrid}>
                    <SteelItem label="HSS Section"         value={result.steelRec.size} />
                    <SteelItem label="Moment of Inertia"   value={`${result.steelRec.I.toFixed(3)} in⁴`} />
                    <SteelItem label="Weight"              value={`${result.steelRec.weight.toFixed(2)} lbs/ft`} />
                  </div>
                </div>
              )}

              {/* Upgrade / Engineer notes */}
              {(result.upgradeNote || result.engineerNote) && (
                <div style={{ ...s.noteCard, borderColor: result.engineerNote ? '#ef4444' : '#f97316' }}>
                  <div style={s.noteIcon}>{result.engineerNote ? '⛔' : '▲'}</div>
                  <div style={s.noteText}>{result.engineerNote || result.upgradeNote}</div>
                </div>
              )}

              {/* Shop Note */}
              {result.noteForShops && (
                <div style={s.shopCard}>
                  <div style={s.shopLabel}>Note for Shops</div>
                  <div style={s.shopText}>{result.noteForShops}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root:         { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep, #0d1117)' },
  navBar:       { display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', background: 'var(--bg-card, #161b22)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  backBtn:      { background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#8b949e', padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem' },
  navTitle:     { fontSize: '0.95rem', fontWeight: 600, color: '#e6edf3' },
  navSub:       { fontSize: '0.75rem', color: '#8b949e', marginLeft: 'auto' },
  body:         { display: 'flex', flex: 1, overflow: 'hidden' },
  leftPanel:    { width: 310, flexShrink: 0, overflowY: 'auto', padding: '16px 20px', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 0 },
  rightPanel:   { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  panelTitle:   { fontSize: '0.72rem', fontWeight: 600, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 },
  panelSubTitle:{ fontSize: '0.72rem', fontWeight: 600, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, marginTop: 4 },
  section:      { marginBottom: 14 },
  sectionLabel: { display: 'block', fontSize: '0.78rem', fontWeight: 500, color: '#8b949e', marginBottom: 4 },
  hint:         { fontSize: '0.72rem', color: '#6e7681', marginBottom: 4 },
  select:       { width: '100%', background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e6edf3', padding: '7px 10px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' },
  input:        { width: '100%', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e6edf3', padding: '7px 10px', fontSize: '0.86rem', boxSizing: 'border-box', outline: 'none' },
  presetRow:    { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  presetBtn:    { flex: '1 0 auto', minWidth: 44, padding: '5px 8px', background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#8b949e', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' },
  segRow:       { display: 'flex', gap: 6, marginBottom: 6 },
  segBtn:       { flex: 1, padding: '6px 0', background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#8b949e', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s' },
  expHint:      { fontSize: '0.72rem', color: '#6e7681', marginTop: 2 },
  unitNote:     { fontSize: '0.72rem', color: ACCENT, marginTop: 2 },
  divider:      { height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 0 14px' },
  emptyState:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, opacity: 0.4 },
  emptyIcon:    { fontSize: 48 },
  emptyText:    { color: '#8b949e', fontSize: '0.9rem' },
  // Ladder
  ladderCard:   { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' },
  cardTitle:    { fontSize: '0.72rem', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  ladder:       { display: 'flex', flexDirection: 'column', gap: 6 },
  ladderStep:   { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.2s' },
  ladderIcon:   { fontSize: '1rem', fontWeight: 700, color: '#6e7681', width: 20, textAlign: 'center', flexShrink: 0 },
  ladderText:   { fontSize: '0.82rem', color: '#8b949e', flex: 1 },
  ladderDesc:   { fontSize: '0.75rem', color: '#8b949e', marginTop: 2, fontWeight: 400 },
  // Metrics
  metricsRow:   { display: 'flex', gap: 10 },
  metricCard:   { flex: 1, background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px' },
  metricValue:  { fontSize: '1.2rem', fontWeight: 700, color: '#e6edf3' },
  metricUnit:   { fontSize: '0.72rem', color: '#8b949e', fontWeight: 400 },
  metricLabel:  { fontSize: '0.72rem', color: '#8b949e', marginTop: 2 },
  // Deflection
  deflCard:     { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' },
  deflRow:      { display: 'flex', gap: 24, marginBottom: 10 },
  deflLabel:    { fontSize: '0.72rem', color: '#6e7681', marginBottom: 2 },
  deflValue:    { fontSize: '1.1rem', fontWeight: 700, color: '#e6edf3' },
  utilBar:      { height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  utilFill:     { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  // Steel
  steelCard:    { background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '14px 16px' },
  steelTitle:   { fontSize: '0.82rem', fontWeight: 600, color: '#f59e0b', marginBottom: 10 },
  steelGrid:    { display: 'flex', gap: 20 },
  steelItemLabel:{ fontSize: '0.72rem', color: '#8b949e', marginBottom: 2 },
  steelItemValue:{ fontSize: '0.9rem', fontWeight: 600, color: '#e6edf3' },
  // Notes
  noteCard:     { display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid', borderRadius: 10, padding: '12px 14px' },
  noteIcon:     { fontSize: '1rem', flexShrink: 0 },
  noteText:     { fontSize: '0.82rem', color: '#e6edf3', lineHeight: 1.5 },
  // Shop note
  shopCard:     { background: `rgba(6,182,212,0.06)`, border: `1px solid rgba(6,182,212,0.2)`, borderRadius: 10, padding: '12px 16px' },
  shopLabel:    { fontSize: '0.72rem', fontWeight: 600, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 },
  shopText:     { fontSize: '0.84rem', color: '#e6edf3', lineHeight: 1.6 },
};
