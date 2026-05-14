/**
 * WizardNewFrame — 3-step guided wizard for creating a new frame.
 *
 * Step 1: System selection (archetype, vendor, finish, connection)
 * Step 2: Frame dimensions (name, W×H, bays, rows, qty, sill AFF)
 * Step 3: Glass & scope (glass spec, scope, notes + live DLO summary)
 */

import React, { useState, useMemo } from 'react';
import {
  ARCHETYPE_CATALOG,
  getVendorsForArchetype,
  FINISH_MULTIPLIERS,
} from '@glazebid/frame-engine';
import { fmtIn } from '@glazebid/frame-engine';

// ─── helpers ─────────────────────────────────────────────────────────────────

function ftIn(inches) {
  if (!inches || inches <= 0) return '';
  try { return fmtIn(inches); } catch (_) {}
  const ft = Math.floor(inches / 12);
  const rem = inches % 12;
  const wi = Math.floor(rem);
  const frac = rem - wi;
  const fs = frac > 0 ? ` ${Math.round(frac * 8)}/8"` : '"';
  return ft > 0 ? `${ft}'-${wi}${fs}` : `${wi}${fs}`;
}

const FINISH_OPTIONS = [
  { value: 'clear-anod',       label: 'Clear Anodized',   swatch: '#9ab0b8' },
  { value: 'dark-bronze',      label: 'Dark Bronze',       swatch: '#5a3d20' },
  { value: 'black-anod',       label: 'Black Anodized',    swatch: '#252525' },
  { value: 'two-coat-paint',   label: '2-Coat Paint',      swatch: '#6080a0' },
  { value: 'three-coat-kynar', label: '3-Coat Kynar',      swatch: '#708860' },
  { value: 'custom',           label: 'Custom',            swatch: '#887060' },
];

const SCOPE_OPTIONS = [
  { value: 'BASE_BID', label: 'Base Bid' },
  { value: 'ALT_1',    label: 'Alt 1' },
  { value: 'ALT_2',    label: 'Alt 2' },
  { value: 'ALLOWANCE',label: 'Allowance' },
];

const SYSTEM_CLASS_LABELS = {
  storefront:   'Storefront',
  curtainwall:  'Curtain Wall',
  'window-wall':'Window Wall',
  entrance:     'Entrance',
  'all-glass':  'All-Glass',
};

// Group archetypes by category
const ARCHETYPE_BY_CLASS = Object.values(ARCHETYPE_CATALOG).reduce((acc, a) => {
  const cls = a.category;
  if (!acc[cls]) acc[cls] = [];
  acc[cls].push(a);
  return acc;
}, {});

// ─── sub-components ───────────────────────────────────────────────────────────

const Inp = ({ value, onChange, type = 'text', placeholder, width, style: xs }) => (
  <input
    type={type}
    value={value ?? ''}
    placeholder={placeholder}
    onChange={e => onChange(type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
    style={{
      background: '#1c1c1f', border: '1px solid #3f3f46', borderRadius: 4,
      color: '#e4e4e7', fontSize: 12, padding: '5px 8px',
      width: width || '100%', outline: 'none', boxSizing: 'border-box', ...xs,
    }}
  />
);

const Sel = ({ value, onChange, options }) => (
  <select
    value={value ?? ''}
    onChange={e => onChange(e.target.value)}
    style={{
      background: '#1c1c1f', border: '1px solid #3f3f46', borderRadius: 4,
      color: '#e4e4e7', fontSize: 12, padding: '5px 8px',
      width: '100%', outline: 'none',
    }}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const Label = ({ children }) => (
  <div style={{ color: '#71717a', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
    {children}
  </div>
);

const Field = ({ label, children, hint }) => (
  <div style={{ marginBottom: 12 }}>
    <Label>{label}</Label>
    {children}
    {hint && <div style={{ color: '#6a9ab0', fontSize: 10, marginTop: 3 }}>{hint}</div>}
  </div>
);

// ─── mini live preview ────────────────────────────────────────────────────────

function MiniPreview({ widthIn, heightIn, bays, rows }) {
  const W = 160, H = 120, PAD = 10;
  if (!widthIn || !heightIn) return (
    <div style={{ width: W, height: H, background: '#18181b', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46', fontSize: 10 }}>
      Enter dimensions
    </div>
  );
  const aspect = widthIn / heightIn;
  let fw, fh;
  if (aspect > (W - 2 * PAD) / (H - 2 * PAD)) { fw = W - 2 * PAD; fh = fw / aspect; }
  else { fh = H - 2 * PAD; fw = fh * aspect; }
  const ox = (W - fw) / 2, oy = (H - fh) / 2;
  const p = 2; // profile px

  const bays_ = Math.max(1, bays || 1);
  const rows_ = Math.max(1, rows || 1);
  const bayW = (fw - (bays_ - 1) * p) / bays_;
  const rowH = (fh - (rows_ - 1) * p) / rows_;

  return (
    <svg width={W} height={H} style={{ background: '#18181b', borderRadius: 6 }}>
      {/* Frame body */}
      <rect x={ox} y={oy} width={fw} height={fh} fill="#2d1e0a" />
      {/* Glass panes */}
      {Array.from({ length: bays_ }, (_, b) =>
        Array.from({ length: rows_ }, (_, r) => {
          const gx = ox + p + b * (bayW + p);
          const gy = oy + p + r * (rowH + p);
          return <rect key={`${b}-${r}`} x={gx} y={gy} width={bayW - p} height={rowH - p} fill="rgba(185,220,235,0.5)" stroke="rgba(80,160,190,0.5)" strokeWidth="0.5" />;
        })
      )}
      {/* Mullions */}
      {Array.from({ length: bays_ - 1 }, (_, b) => {
        const mx = ox + p + (b + 1) * (bayW + p) - p;
        return <rect key={b} x={mx} y={oy} width={p} height={fh} fill="#5a3820" />;
      })}
      {/* Transoms */}
      {Array.from({ length: rows_ - 1 }, (_, r) => {
        const ty = oy + p + (r + 1) * (rowH + p) - p;
        return <rect key={r} x={ox} y={ty} width={fw} height={p} fill="#4a2e14" />;
      })}
    </svg>
  );
}

// ─── step indicator ───────────────────────────────────────────────────────────

function StepDot({ n, label, active, done }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        background: done ? '#22c55e' : active ? '#3b82f6' : '#27272a',
        color: done || active ? '#fff' : '#52525b',
      }}>{done ? '✓' : n}</div>
      <span style={{ fontSize: 10, color: active ? '#e4e4e7' : done ? '#71717a' : '#3f3f46', fontWeight: active ? 600 : 400 }}>{label}</span>
    </div>
  );
}

// ─── main wizard ─────────────────────────────────────────────────────────────

export default function WizardNewFrame({ targetGroupId, groups, glassSpecs, onComplete, onCancel, updateGroup }) {
  // Derive initial group settings
  const group = groups.find(g => g.groupId === targetGroupId);

  const [step, setStep] = useState(1);

  // Step 1 state
  const [sysClass,    setSysClass]    = useState(group?.archetypeId ? (ARCHETYPE_CATALOG[group.archetypeId]?.category ?? 'storefront') : 'storefront');
  const [archetypeId, setArchetypeId] = useState(group?.archetypeId || 'sf-450');
  const [vendorId,    setVendorId]    = useState(group?.vendorSystemId || '');
  const [finishType,  setFinishType]  = useState(group?.finishType || 'dark-bronze');
  const [connType,    setConnType]    = useState(group?.connectionType || 'screw-spline');

  // Step 2 state
  const [mark,       setMark]       = useState('');
  const [widthIn,    setWidthIn]    = useState(0);
  const [heightIn,   setHeightIn]   = useState(0);
  const [bays,       setBays]       = useState(1);
  const [rows,       setRows]       = useState(1);
  const [qty,        setQty]        = useState(1);
  const [sillAFF,    setSillAFF]    = useState(0);

  // Step 3 state
  const [glassSpecId, setGlassSpecId] = useState(group?.glassSpecId || 'GL-1');
  const [scopeTag,    setScopeTag]    = useState('BASE_BID');
  const [notes,       setNotes]       = useState('');

  const archetypeOptions = useMemo(() =>
    (ARCHETYPE_BY_CLASS[sysClass] || []).map(a => ({ value: a.id, label: a.label })),
    [sysClass]
  );

  const vendorOptions = useMemo(() => {
    const vs = getVendorsForArchetype(archetypeId);
    return vs.map(v => ({ value: v.id, label: `${v.manufacturer} ${v.productLine}` }));
  }, [archetypeId]);

  // Auto-select first vendor when archetype changes
  const effectiveVendorId = vendorId || vendorOptions[0]?.value || '';

  // DLO summary for step 3
  const profW = ARCHETYPE_CATALOG[archetypeId]?.profileWidth ?? 1.75;
  const dloW = widthIn > 0 && bays > 0
    ? Math.max(((widthIn - (bays - 1) * profW) / bays) - profW, 0)
    : 0;
  const dloH = heightIn > 0 && rows > 0
    ? Math.max(((heightIn - (rows - 1) * profW) / rows) - profW, 0)
    : 0;
  const litesTotal = (bays || 1) * (rows || 1) * (qty || 1);

  const canNext1 = archetypeId && effectiveVendorId;
  const canNext2 = widthIn >= 12 && heightIn >= 12;

  const handleBuild = () => {
    onComplete({
      archetypeId,
      vendorSystemId: effectiveVendorId,
      finishType,
      connectionType: connType,
      finishMultiplier: FINISH_MULTIPLIERS[finishType] ?? 1.0,
      glassSpecId,
      // frame fields
      mark: mark.trim() || undefined,
      widthInches: widthIn,
      heightInches: heightIn,
      bays: Math.max(1, bays),
      rows: Math.max(1, rows),
      quantity: Math.max(1, qty),
      sillAFF,
      scopeTag,
      estimatorNotes: notes,
    });
  };

  // ── shared styles ──
  const overlay = {
    position: 'fixed', inset: 0, zIndex: 500,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const card = {
    background: '#18181b', border: '1px solid #27272a', borderRadius: 10,
    width: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
  };
  const header = {
    padding: '16px 20px 12px', borderBottom: '1px solid #27272a',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0,
  };
  const body   = { padding: '18px 20px', overflowY: 'auto', flex: 1 };
  const footer = {
    padding: '12px 20px', borderTop: '1px solid #27272a', flexShrink: 0,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  };
  const btnPrimary = {
    background: '#3b82f6', border: 'none', color: '#fff', padding: '7px 18px',
    borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  };
  const btnSecondary = {
    background: 'transparent', border: '1px solid #3f3f46', color: '#71717a',
    padding: '7px 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
  };
  const btnSuccess = {
    ...btnPrimary, background: '#16a34a',
  };

  const STEP_TITLES = ['System Selection', 'Frame Dimensions', 'Glass & Scope'];

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={card}>
        {/* Header */}
        <div style={header}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7', marginBottom: 10 }}>
              New Frame — {STEP_TITLES[step - 1]}
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <StepDot n={1} label="System"    active={step === 1} done={step > 1} />
              <StepDot n={2} label="Dimensions" active={step === 2} done={step > 2} />
              <StepDot n={3} label="Glass"      active={step === 3} done={false} />
            </div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#52525b', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={body}>

          {/* ── STEP 1: System ── */}
          {step === 1 && <>
            <Field label="System Class">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {Object.keys(ARCHETYPE_BY_CLASS).map(cls => (
                  <button
                    key={cls}
                    onClick={() => {
                      setSysClass(cls);
                      const first = ARCHETYPE_BY_CLASS[cls]?.[0];
                      if (first) { setArchetypeId(first.id); setVendorId(''); }
                    }}
                    style={{
                      background: sysClass === cls ? '#3b82f6' : '#27272a',
                      border: 'none', borderRadius: 4, padding: '5px 12px',
                      color: sysClass === cls ? '#fff' : '#a1a1aa', fontSize: 11,
                      cursor: 'pointer', fontWeight: sysClass === cls ? 600 : 400,
                    }}
                  >{SYSTEM_CLASS_LABELS[cls] || cls}</button>
                ))}
              </div>
            </Field>

            <Field label="Archetype / Series">
              <Sel value={archetypeId} onChange={v => { setArchetypeId(v); setVendorId(''); }} options={archetypeOptions} />
              {ARCHETYPE_CATALOG[archetypeId]?.description && (
                <div style={{ color: '#52525b', fontSize: 10, marginTop: 4 }}>{ARCHETYPE_CATALOG[archetypeId].description}</div>
              )}
            </Field>

            <Field label="Primary Vendor">
              {vendorOptions.length > 0
                ? <Sel value={effectiveVendorId} onChange={setVendorId} options={vendorOptions} />
                : <div style={{ color: '#52525b', fontSize: 11 }}>No vendors for this archetype</div>
              }
            </Field>

            <Field label="Assembly Method">
              <div style={{ display: 'flex', gap: 16 }}>
                {[['screw-spline', 'Screw Spline'], ['shear-block', 'Shear Block']].map(([v, l]) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#a1a1aa', fontSize: 12 }}>
                    <input type="radio" name="conn" value={v} checked={connType === v} onChange={() => setConnType(v)} style={{ accentColor: '#3b82f6' }} />
                    {l}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Finish">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {FINISH_OPTIONS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setFinishType(f.value)}
                    title={f.label}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: finishType === f.value ? '#27272a' : 'transparent',
                      border: `1px solid ${finishType === f.value ? '#3b82f6' : '#3f3f46'}`,
                      borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: f.swatch, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ color: '#a1a1aa', fontSize: 11 }}>{f.label}</span>
                  </button>
                ))}
              </div>
            </Field>
          </>}

          {/* ── STEP 2: Dimensions ── */}
          {step === 2 && <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <Field label="Frame Name / Mark">
                <Inp value={mark} onChange={setMark} placeholder="e.g. A-1" />
              </Field>

              <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Width (in)" hint={ftIn(widthIn)}>
                  <Inp type="number" value={widthIn || ''} onChange={setWidthIn} />
                </Field>
                <Field label="Height (in)" hint={ftIn(heightIn)}>
                  <Inp type="number" value={heightIn || ''} onChange={setHeightIn} />
                </Field>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Panels">
                  <Inp type="number" value={bays} onChange={v => setBays(Math.max(1, v))} />
                </Field>
                <Field label="Rows">
                  <Inp type="number" value={rows} onChange={v => setRows(Math.max(1, v))} />
                </Field>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Qty">
                  <Inp type="number" value={qty} onChange={v => setQty(Math.max(1, v))} />
                </Field>
                <Field label="Sill AFF (in)" hint={ftIn(sillAFF)}>
                  <Inp type="number" value={sillAFF || ''} onChange={setSillAFF} />
                </Field>
              </div>
            </div>

            {/* Mini preview */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 18 }}>
              <MiniPreview widthIn={widthIn} heightIn={heightIn} bays={bays} rows={rows} />
              {widthIn > 0 && heightIn > 0 && (
                <div style={{ fontSize: 10, color: '#52525b', textAlign: 'center' }}>
                  {ftIn(widthIn)} × {ftIn(heightIn)}<br />
                  {bays}p × {rows}r
                </div>
              )}
            </div>
          </div>}

          {/* ── STEP 3: Glass & Scope ── */}
          {step === 3 && <>
            <Field label="Vision Glass Spec">
              <Sel
                value={glassSpecId}
                onChange={setGlassSpecId}
                options={glassSpecs.length > 0
                  ? glassSpecs.map(g => ({ value: g.specId, label: g.name }))
                  : [{ value: 'GL-1', label: 'Standard 1" IG (default)' }]
                }
              />
            </Field>

            <Field label="Scope">
              <Sel value={scopeTag} onChange={setScopeTag} options={SCOPE_OPTIONS} />
            </Field>

            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Estimator notes…"
                style={{
                  width: '100%', background: '#1c1c1f', border: '1px solid #3f3f46',
                  borderRadius: 4, color: '#a1a1aa', fontSize: 11, padding: '6px 8px',
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </Field>

            {/* Summary card */}
            {widthIn > 0 && heightIn > 0 && (
              <div style={{
                background: '#0f0f11', border: '1px solid #27272a', borderRadius: 6,
                padding: '10px 14px', marginTop: 4,
              }}>
                <div style={{ fontSize: 10, color: '#52525b', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                  {[
                    ['Frame OD', `${ftIn(widthIn)} × ${ftIn(heightIn)}`],
                    ['Panels × Rows', `${bays} × ${rows}`],
                    ['DLO per lite', `${ftIn(dloW)} × ${ftIn(dloH)}`],
                    ['Glass SF / lite', dloW > 0 ? `${((dloW * dloH) / 144).toFixed(2)} SF` : '—'],
                    ['Total lites', litesTotal],
                    ['Qty frames', qty],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #1a1a1d' }}>
                      <span style={{ color: '#52525b', fontSize: 10 }}>{k}</span>
                      <span style={{ color: '#a1a1aa', fontSize: 10, fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>}

        </div>

        {/* Footer */}
        <div style={footer}>
          <div>
            {step > 1 && (
              <button style={btnSecondary} onClick={() => setStep(s => s - 1)}>← Back</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnSecondary} onClick={onCancel}>Cancel</button>
            {step < 3
              ? <button style={{ ...btnPrimary, opacity: (step === 1 && !canNext1) || (step === 2 && !canNext2) ? 0.45 : 1 }}
                  disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
                  onClick={() => setStep(s => s + 1)}
                >Next →</button>
              : <button style={btnSuccess} onClick={handleBuild}>Build Frame →</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
