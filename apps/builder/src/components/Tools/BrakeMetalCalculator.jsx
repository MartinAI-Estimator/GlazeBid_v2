import React, { useState, useMemo } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCENT = '#f97316'; // orange

// Material thickness options (inches)
const MATERIAL_TYPES = [
  { id: 'al',  label: 'Aluminum',         density: 0.0975 }, // lb/in³
  { id: 'stl', label: 'Galv. Steel',      density: 0.2836 },
  { id: 'ss',  label: 'Stainless Steel',  density: 0.2860 },
  { id: 'cop', label: 'Copper',           density: 0.3240 },
];

const THICKNESSES = {
  al:  [
    { label: '.032"',  value: 0.032 },
    { label: '.040"',  value: 0.040 },
    { label: '.050"',  value: 0.050 },
    { label: '.063"',  value: 0.063 },
    { label: '.080"',  value: 0.080 },
    { label: '.090"',  value: 0.090 },
    { label: '.100"',  value: 0.100 },
    { label: '.125"',  value: 0.125 },
    { label: '.160"',  value: 0.160 },
    { label: '.190"',  value: 0.190 },
  ],
  stl: [
    { label: '22ga (.030")', value: 0.030 },
    { label: '20ga (.036")', value: 0.036 },
    { label: '18ga (.048")', value: 0.048 },
    { label: '16ga (.060")', value: 0.060 },
    { label: '14ga (.075")', value: 0.075 },
    { label: '12ga (.105")', value: 0.105 },
    { label: '11ga (.120")', value: 0.120 },
    { label: '.125"',        value: 0.125 },
    { label: '.187"',        value: 0.1875 },
    { label: '.250"',        value: 0.250 },
  ],
  ss:  [
    { label: '22ga (.030")', value: 0.030 },
    { label: '20ga (.036")', value: 0.036 },
    { label: '18ga (.048")', value: 0.048 },
    { label: '16ga (.060")', value: 0.060 },
    { label: '14ga (.075")', value: 0.075 },
    { label: '.125"',        value: 0.125 },
  ],
  cop: [
    { label: '16oz (.021")', value: 0.021 },
    { label: '20oz (.027")', value: 0.027 },
    { label: '24oz (.032")', value: 0.032 },
    { label: '32oz (.043")', value: 0.043 },
  ],
};

const RADII = [
  { label: '1/16" (.063")', value: 0.0625 },
  { label: '3/32" (.094")', value: 0.09375 },
  { label: '1/8"  (.125")', value: 0.125 },
  { label: '3/16" (.188")', value: 0.1875 },
  { label: '1/4"  (.250")', value: 0.250 },
  { label: '3/8"  (.375")', value: 0.375 },
  { label: '1/2"  (.500")', value: 0.500 },
];

const MAX_BENDS = 7; // up to 8 legs, 7 bends

// ─── Math ─────────────────────────────────────────────────────────────────────

/** K-factor based on inside-radius / thickness ratio */
function kFactor(insideRadius, thickness) {
  const ratio = insideRadius / thickness;
  if (ratio < 1) return 0.33;
  if (ratio < 2) return 0.38;
  if (ratio < 4) return 0.41;
  return 0.50;
}

/**
 * Bend Allowance = (π/180) × angle × (inside_radius + K × thickness)
 */
function bendAllowance(angleDeg, insideRadius, thickness) {
  const K = kFactor(insideRadius, thickness);
  return (Math.PI / 180) * angleDeg * (insideRadius + K * thickness);
}

/**
 * Compute flat blank width from legs + bends.
 * Returns { flatBlankIn, bends: [{ba, K}] }
 */
function calcFlatBlank(legs, bends, thickness) {
  let total = legs.reduce((s, l) => s + (parseFloat(l) || 0), 0);
  const bendDetails = bends.map(b => {
    const angle   = parseFloat(b.angle)  || 0;
    const radius  = parseFloat(b.radius) || 0;
    if (angle <= 0 || radius <= 0) return { ba: 0, K: 0 };
    const ba = bendAllowance(angle, radius, thickness);
    const K  = kFactor(radius, thickness);
    return { ba, K };
  });
  total += bendDetails.reduce((s, b) => s + b.ba, 0);
  return { flatBlankIn: total, bendDetails };
}

// ─── Schema helpers ───────────────────────────────────────────────────────────

const makeLeg  = () => '';
const makeBend = () => ({ angle: '90', radius: '0.125' });

// ─── Sub-components ───────────────────────────────────────────────────────────

function NumInput({ label, value, onChange, step = '0.01', min = '0', hint }) {
  return (
    <div style={s.field}>
      <label style={s.fieldLabel}>{label}</label>
      {hint && <div style={s.fieldHint}>{hint}</div>}
      <input type="number" min={min} step={step} value={value}
        onChange={e => onChange(e.target.value)} style={s.input} />
    </div>
  );
}

function ResultCard({ label, value, unit, sub }) {
  return (
    <div style={s.resultCard}>
      <div style={s.resultValue}>{value}</div>
      <div style={s.resultUnit}>{unit}</div>
      <div style={s.resultLabel}>{label}</div>
      {sub && <div style={s.resultSub}>{sub}</div>}
    </div>
  );
}

function SectionHead({ label }) {
  return <div style={s.sectionHead}>{label}</div>;
}

// Simple top-down SVG cross-section of the bent profile
function ProfileSVG({ legs, bends }) {
  const W = 280, H = 140;
  const legVals = legs.map(l => parseFloat(l) || 0);
  const total = legVals.reduce((a, b) => a + b, 0) || 1;
  const scale = Math.min((W - 40) / total, 12); // px per inch, max 12

  // Build path: start at left, alternating horizontal / vertical for each leg
  // Direction flips at each bend (simplified 2D cross-section, treats bends as right angles for display)
  const pts = [{ x: 20, y: H / 2 }];
  let dir = 0; // 0=right, 1=down, 2=left, 3=up
  const DIRS = [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 }];

  legVals.forEach((len, i) => {
    const prev  = pts[pts.length - 1];
    const d     = DIRS[dir % 4];
    const bAngle = bends[i] ? (parseFloat(bends[i]?.angle) || 90) : 90;
    const pxLen = len * scale;
    pts.push({ x: prev.x + d.dx * pxLen, y: prev.y + d.dy * pxLen });
    // Determine next direction based on bend angle
    if (bAngle >= 135) dir += 1;
    else if (bAngle >= 45) dir += 1;
    else dir += 2; // acute: fold back
  });

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const hasPath = legVals.some(l => l > 0);

  return (
    <svg width={W} height={H} style={s.svg}>
      {hasPath ? (
        <path d={pathD} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="#6e7681" fontSize={13}>Enter leg lengths to preview</text>
      )}
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BrakeMetalCalculator({ onBack }) {
  // Material
  const [matType,   setMatType]   = useState('al');
  const [thickness, setThickness] = useState('0.063');

  // Legs / Bends (start with 2 legs + 1 bend = angle shape)
  const [legs,  setLegs]  = useState(['', '']);
  const [bends, setBends] = useState([makeBend()]);

  // Quantity
  const [qty,  setQty]  = useState('1');  // # pieces
  const [lenFt, setLenFt] = useState(''); // piece length in feet

  // ── Leg helpers ──
  const addLeg = () => {
    if (legs.length >= MAX_BENDS + 1) return;
    setLegs(p  => [...p, makeLeg()]);
    setBends(p => [...p, makeBend()]);
  };
  const removeLeg = () => {
    if (legs.length <= 1) return;
    setLegs(p  => p.slice(0, -1));
    setBends(p => p.slice(0, -1));
  };
  const setLeg = (i, v) => setLegs(p  => p.map((l, j) => j === i ? v : l));
  const setBendField = (i, field, v) => setBends(p => p.map((b, j) => j === i ? { ...b, [field]: v } : b));

  // ── Core calc ──
  const mat = MATERIAL_TYPES.find(m => m.id === matType) ?? MATERIAL_TYPES[0];
  const T   = parseFloat(thickness) || 0.063;

  const result = useMemo(() => {
    if (legs.some(l => !l || parseFloat(l) <= 0)) return null;

    const { flatBlankIn, bendDetails } = calcFlatBlank(legs, bends, T);
    const pieceLenIn = (parseFloat(lenFt) || 0) * 12;
    const numPieces  = parseInt(qty) || 1;

    // Weight per foot of run (blank width × 1ft × thickness × density)
    const sqInPerFoot   = flatBlankIn * 12;              // in² per linear foot
    const wtPerFoot     = sqInPerFoot * T * mat.density; // lbs/ft per piece
    const totalLenFt    = pieceLenIn > 0 ? (numPieces * pieceLenIn / 12) : null;
    const totalWeight   = totalLenFt != null ? wtPerFoot * totalLenFt : null;
    // Material sq-ft needed (flat blank, unfolded)
    const sqFt = totalLenFt != null ? (flatBlankIn / 12) * totalLenFt : null;

    return { flatBlankIn, bendDetails, wtPerFoot, totalLenFt, totalWeight, sqFt };
  }, [legs, bends, T, matType, qty, lenFt]);

  const thicknessOpts = THICKNESSES[matType] ?? THICKNESSES.al;

  return (
    <div style={s.root}>
      {/* Nav */}
      <div style={s.navBar}>
        <button style={s.backBtn} onClick={onBack}>← Suite Home</button>
        <span style={s.navTitle}>⚙️ Brake Metal Calculator</span>
        <span style={s.navSub}>Bend allowance · Flat blank · Material weight</span>
      </div>

      <div style={s.body}>
        {/* ── Left: Inputs ── */}
        <div style={s.leftPanel}>
          <SectionHead label="Material" />

          <div style={s.fieldRow}>
            <div style={{ flex: 1 }}>
              <label style={s.fieldLabel}>Type</label>
              <select value={matType} onChange={e => { setMatType(e.target.value); setThickness(THICKNESSES[e.target.value][2].value.toString()); }} style={s.select}>
                {MATERIAL_TYPES.map(m => (
                  <option key={m.id} value={m.id} style={{ background: '#161b22', color: '#e6edf3' }}>{m.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.fieldLabel}>Thickness</label>
              <select value={thickness} onChange={e => setThickness(e.target.value)} style={s.select}>
                {thicknessOpts.map(t => (
                  <option key={t.value} value={t.value} style={{ background: '#161b22', color: '#e6edf3' }}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={s.divider} />
          <SectionHead label={`Profile  (${legs.length} legs, ${bends.length} bend${bends.length !== 1 ? 's' : ''})`} />

          {/* Legs + Bends interleaved */}
          {legs.map((leg, i) => (
            <div key={i}>
              <div style={s.legRow}>
                <label style={s.legLabel}>Leg {i + 1}</label>
                <input
                  type="number" min="0" step="0.125" value={leg}
                  placeholder="inches"
                  onChange={e => setLeg(i, e.target.value)}
                  style={{ ...s.input, width: '100%' }}
                />
              </div>
              {i < bends.length && (
                <div style={s.bendRow}>
                  <div style={s.bendLine} />
                  <div style={s.bendInputs}>
                    <div style={s.bendField}>
                      <label style={s.bendLabel}>Angle °</label>
                      <input type="number" min="1" max="179" step="0.5" value={bends[i].angle}
                        onChange={e => setBendField(i, 'angle', e.target.value)}
                        style={{ ...s.inputSm }} />
                    </div>
                    <div style={s.bendField}>
                      <label style={s.bendLabel}>Inside R</label>
                      <select value={bends[i].radius} onChange={e => setBendField(i, 'radius', e.target.value)} style={s.selectSm}>
                        {RADII.map(r => (
                          <option key={r.value} value={r.value} style={{ background: '#161b22', color: '#e6edf3' }}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div style={s.legActions}>
            <button style={s.addBtn} onClick={addLeg} disabled={legs.length >= MAX_BENDS + 1}>+ Add Leg</button>
            <button style={s.removeBtn} onClick={removeLeg} disabled={legs.length <= 1}>− Remove</button>
          </div>

          <div style={s.divider} />
          <SectionHead label="Quantity" />

          <div style={s.fieldRow}>
            <NumInput label="# Pieces"    value={qty}   onChange={setQty}   step="1"    min="1"  />
            <NumInput label="Piece Length (ft)" value={lenFt} onChange={setLenFt} step="0.25" min="0" hint="Leave blank for per-foot" />
          </div>
        </div>

        {/* ── Right: Results ── */}
        <div style={s.rightPanel}>
          {/* Profile preview */}
          <div style={s.previewCard}>
            <div style={s.cardTitle}>Profile Preview</div>
            <ProfileSVG legs={legs} bends={bends} />
          </div>

          {!result ? (
            <div style={s.emptyState}>
              <div style={s.emptyText}>Enter leg lengths above to calculate</div>
            </div>
          ) : (
            <>
              {/* Primary result cards */}
              <div style={s.resultRow}>
                <ResultCard
                  label="Flat Blank Width"
                  value={result.flatBlankIn.toFixed(4)}
                  unit="inches"
                  sub={`${(result.flatBlankIn / 12).toFixed(3)} ft`}
                />
                <ResultCard
                  label="Weight / Lin. Ft"
                  value={result.wtPerFoot.toFixed(3)}
                  unit="lbs/ft"
                  sub={`${mat.label}`}
                />
                {result.totalWeight != null && (
                  <ResultCard
                    label="Total Weight"
                    value={result.totalWeight.toFixed(1)}
                    unit="lbs"
                    sub={`${result.totalLenFt?.toFixed(1)} LF total`}
                  />
                )}
              </div>

              {result.sqFt != null && (
                <div style={s.resultRow}>
                  <ResultCard
                    label="Flat Material Needed"
                    value={result.sqFt.toFixed(2)}
                    unit="sq ft"
                    sub={`${parseInt(qty)} pcs × ${parseFloat(lenFt).toFixed(2)} ft × ${(result.flatBlankIn / 12).toFixed(3)} ft blank`}
                  />
                </div>
              )}

              {/* Bend-by-bend breakdown */}
              <div style={s.breakdownCard}>
                <div style={s.cardTitle}>Bend-by-Bend Breakdown</div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Element</th>
                      <th style={s.th}>Dim</th>
                      <th style={s.th}>Angle</th>
                      <th style={s.th}>R (in)</th>
                      <th style={s.th}>K</th>
                      <th style={s.th}>BA (in)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legs.map((leg, i) => {
                      const bd = result.bendDetails[i];
                      return (
                        <React.Fragment key={i}>
                          <tr>
                            <td style={s.td}>Leg {i + 1}</td>
                            <td style={{ ...s.td, color: ACCENT }}>{(parseFloat(leg) || 0).toFixed(4)}&Prime;</td>
                            <td style={s.td}>—</td>
                            <td style={s.td}>—</td>
                            <td style={s.td}>—</td>
                            <td style={s.td}>—</td>
                          </tr>
                          {bd && (
                            <tr style={{ background: 'rgba(249,115,22,0.04)' }}>
                              <td style={{ ...s.td, color: '#8b949e' }}>Bend {i + 1}</td>
                              <td style={s.td}>—</td>
                              <td style={s.td}>{bends[i]?.angle}°</td>
                              <td style={s.td}>{bends[i]?.radius}</td>
                              <td style={s.td}>{bd.K.toFixed(2)}</td>
                              <td style={{ ...s.td, color: '#f59e0b' }}>{bd.ba.toFixed(4)}&Prime;</td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <tr style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                      <td style={{ ...s.td, fontWeight: 600, color: '#e6edf3' }} colSpan={5}>Total Flat Blank</td>
                      <td style={{ ...s.td, fontWeight: 700, color: ACCENT }}>{result.flatBlankIn.toFixed(4)}&Prime;</td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
  leftPanel:    { width: 310, flexShrink: 0, overflowY: 'auto', padding: '14px 18px', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 0 },
  rightPanel:   { flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  sectionHead:  { fontSize: '0.72rem', fontWeight: 600, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, marginTop: 4 },
  field:        { flex: 1 },
  fieldLabel:   { display: 'block', fontSize: '0.78rem', fontWeight: 500, color: '#8b949e', marginBottom: 4 },
  fieldHint:    { fontSize: '0.7rem', color: '#6e7681', marginBottom: 2 },
  fieldRow:     { display: 'flex', gap: 10, marginBottom: 12 },
  input:        { background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e6edf3', padding: '7px 10px', fontSize: '0.86rem', boxSizing: 'border-box', outline: 'none' },
  inputSm:      { width: '70px', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e6edf3', padding: '5px 8px', fontSize: '0.82rem', boxSizing: 'border-box', outline: 'none' },
  select:       { width: '100%', background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e6edf3', padding: '7px 8px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' },
  selectSm:     { width: '130px', background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e6edf3', padding: '5px 8px', fontSize: '0.78rem', outline: 'none' },
  divider:      { height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' },
  // Legs
  legRow:       { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  legLabel:     { fontSize: '0.78rem', color: '#8b949e', width: 38, flexShrink: 0 },
  // Bends
  bendRow:      { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  bendLine:     { width: 10, height: 20, borderLeft: `2px solid ${ACCENT}40`, marginLeft: 16 },
  bendInputs:   { display: 'flex', alignItems: 'flex-end', gap: 8 },
  bendField:    {},
  bendLabel:    { display: 'block', fontSize: '0.7rem', color: '#6e7681', marginBottom: 2 },
  // Add/Remove
  legActions:   { display: 'flex', gap: 8, marginTop: 8, marginBottom: 4 },
  addBtn:       { flex: 1, padding: '6px 0', background: `${ACCENT}18`, border: `1px solid ${ACCENT}50`, borderRadius: 6, color: ACCENT, fontSize: '0.82rem', cursor: 'pointer', fontWeight: 500 },
  removeBtn:    { padding: '6px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, color: '#ef4444', fontSize: '0.82rem', cursor: 'pointer' },
  // Preview
  previewCard:  { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' },
  cardTitle:    { fontSize: '0.72rem', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  svg:          { display: 'block', background: 'rgba(0,0,0,0.2)', borderRadius: 6 },
  emptyState:   { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0', opacity: 0.4 },
  emptyText:    { color: '#8b949e', fontSize: '0.88rem' },
  // Results
  resultRow:    { display: 'flex', gap: 10, flexWrap: 'wrap' },
  resultCard:   { flex: '1 0 120px', background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' },
  resultValue:  { fontSize: '1.35rem', fontWeight: 700, color: '#e6edf3' },
  resultUnit:   { fontSize: '0.72rem', color: '#8b949e' },
  resultLabel:  { fontSize: '0.78rem', color: '#8b949e', marginTop: 4 },
  resultSub:    { fontSize: '0.7rem', color: ACCENT, marginTop: 2 },
  // Breakdown table
  breakdownCard:{ background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px', overflow: 'auto' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' },
  th:           { textAlign: 'left', padding: '6px 10px', color: '#8b949e', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  td:           { padding: '6px 10px', color: '#c9d1d9', borderBottom: '1px solid rgba(255,255,255,0.04)' },
};
