/**
 * BidCartPanel — Live Project Summary + Labor Engine + Glass RFQ Exporter
 *
 * Reads from useBidStore (Zustand). Only this component re-renders when the
 * store changes — no prop drilling, no Context cascade.
 *
 * Sections:
 *  1. Stat tiles  — frames, aluminum LF, glass SqFt, total lites (ticks up live)
 *  2. Labor Engine — shop fab hours, field install hours, labor cost estimate
 *                    with tunable velocity sliders and burdened rate input
 *  3. Glass RFQ    — aggregated vendor schedule grouped by size + system type
 *  4. Frame Log    — collapsible list of saved frames with remove button
 *  5. Export       — one-click CSV download of the RFQ schedule
 */

import React, { useState } from 'react';
import useBidStore, { getGlassRFQ, exportGlassRFQtoCSV } from '../../store/useBidStore';
import AccountingInput from './AccountingInput';

// ─── Stat Tile ────────────────────────────────────────────────────────────────
function StatTile({ label, value, unit, accent }) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 100,
      padding: '14px 16px',
      background: 'var(--bg-card, #1c2128)',
      border: `1px solid ${accent ? 'rgba(37,99,235,0.35)' : 'var(--border-subtle, #2d333b)'}`,
      borderRadius: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-secondary, #9ea7b3)' }}>
        {label}
      </span>
      <span style={{ fontSize: '1.35rem', fontWeight: 800, color: accent ? '#60a5fa' : 'var(--text-primary, #e6edf3)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {value}
      </span>
      {unit && <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #9ea7b3)', fontWeight: 500 }}>{unit}</span>}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.95rem' }}>{icon}</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-primary, #e6edf3)' }}>
          {title}
        </span>
      </div>
      {right}
    </div>
  );
}

// ─── Rate Slider ──────────────────────────────────────────────────────────────
function RateSlider({ label, storeKey, value, min, max, step, unit, setLaborRate }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #9ea7b3)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          min={min} max={max} step={step}
          value={value}
          onChange={e => setLaborRate(storeKey, e.target.value)}
          style={{
            width: 64, padding: '3px 6px', borderRadius: 5,
            background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
            color: '#60a5fa', fontWeight: 700, fontSize: '0.78rem',
            textAlign: 'right', outline: 'none',
          }}
          onFocus={e => (e.target.style.borderColor = '#2563eb')}
          onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
        />
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BidCartPanel({ projectName = 'My Project', onNavigate }) {
  const frames        = useBidStore(s => s.frames);
  const projectTotals = useBidStore(s => s.projectTotals);
  const laborRates    = useBidStore(s => s.laborRates);
  const setLaborRate  = useBidStore(s => s.setLaborRate);
  const removeFrame   = useBidStore(s => s.removeFrame);
  const clearBid      = useBidStore(s => s.clearBid);

  const [showFrameLog, setShowFrameLog] = useState(false);
  const [exportFlash,  setExportFlash]  = useState(false);

  const rfqLines = getGlassRFQ(frames);
  const t        = projectTotals;
  const labor    = t.labor ?? {};

  const handleExport = () => {
    exportGlassRFQtoCSV(rfqLines, projectName);
    setExportFlash(true);
    setTimeout(() => setExportFlash(false), 2000);
  };

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      backgroundColor: 'var(--bg-deep, #0b0e11)',
      color: 'var(--text-primary, #e6edf3)',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 28,
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid var(--border-subtle, #2d333b)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary, #e6edf3)' }}>
            Bid Cart
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'var(--text-secondary, #9ea7b3)' }}>
            {projectName} · {t.totalFrames} frame{t.totalFrames !== 1 ? 's' : ''} saved
          </p>
        </div>
        {t.totalFrames > 0 && (
          <button
            onClick={() => { if (window.confirm('Clear all frames from the bid?')) clearBid(); }}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.07)',
              color: '#f87171',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            Clear Bid
          </button>
        )}
      </div>

      {/* ── Stat Tiles ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <StatTile label="Frames"       value={t.totalFrames}                    accent />
        <StatTile label="Aluminum"     value={t.totalAluminumLF?.toFixed(1)}    unit="LF" />
        <StatTile label="Glass SqFt"   value={t.totalGlassSqFt?.toFixed(1)}     unit="ft²" />
        <StatTile label="Total Lites"  value={t.totalLites}                     unit="pcs" />
      </div>

      {/* ── Labor Engine ───────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-panel, #0d1117)', border: '1px solid var(--border-subtle, #2d333b)', borderRadius: 10, padding: '18px 18px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <SectionHeader icon="⚙️" title="Labor Engine" />

        {/* Rate sliders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 2px' }}>
          <RateSlider
            label="Shop Fab Velocity"
            storeKey="shopFabVelocity"
            value={laborRates.shopFabVelocity}
            min={2} max={40} step={1}
            unit="LF/hr"
            setLaborRate={setLaborRate}
          />
          <RateSlider
            label="Field Install Velocity"
            storeKey="fieldInstallVelocity"
            value={laborRates.fieldInstallVelocity}
            min={5} max={100} step={5}
            unit="SqFt/hr"
            setLaborRate={setLaborRate}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #9ea7b3)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Burdened Rate ($/hr)
            </span>
            <AccountingInput
              value={laborRates.burdenedRatePerHour || 0}
              onChange={val => setLaborRate('burdenedRatePerHour', val)}
              style={{
                width: 80,
                padding: '5px 8px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle, #2d333b)',
                background: 'var(--bg-card, #1c2128)',
                color: '#60a5fa',
                fontWeight: 700,
                fontSize: '0.82rem',
                textAlign: 'right',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Labor results grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 6, borderTop: '1px solid var(--border-subtle, #2d333b)' }}>
          {[
            { label: 'Shop Fab',      value: labor.shopFabHours,    unit: 'hrs', color: '#93c5fd' },
            { label: 'Field Install', value: labor.fieldInstHours,  unit: 'hrs', color: '#86efac' },
            { label: 'Total Hours',   value: labor.totalLaborHours, unit: 'hrs', color: '#fbbf24' },
          ].map(({ label, value, unit, color }) => (
            <div key={label} style={{ padding: '10px 12px', background: 'var(--bg-card, #1c2128)', borderRadius: 7, border: '1px solid var(--border-subtle, #2d333b)' }}>
              <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary, #9ea7b3)', fontWeight: 700, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{(value ?? 0).toFixed(2)}</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary, #9ea7b3)' }}>{unit}</div>
            </div>
          ))}
          {/* Estimated labor cost — full-width accent card */}
          <div style={{ gridColumn: '1 / -1', padding: '12px 14px', background: 'rgba(52,211,153,0.06)', borderRadius: 7, border: '1px solid rgba(52,211,153,0.22)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#34d399', fontWeight: 700 }}>Est. Labor Cost</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #9ea7b3)', marginTop: 2 }}>
                {(labor.totalLaborHours ?? 0).toFixed(2)} hrs × ${laborRates.burdenedRatePerHour}/hr burdened
              </div>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
              ${(labor.estimatedLaborCost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-secondary, #9ea7b3)', fontStyle: 'italic', lineHeight: 1.4 }}>
          Shop fab driven by aluminum LF ÷ velocity. Field install driven by glass SqFt ÷ velocity.
          Adjust the sliders to match your shop's historical throughput.
        </p>
      </div>

      {/* ── Glass RFQ Schedule ─────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-panel, #0d1117)', border: '1px solid var(--border-subtle, #2d333b)', borderRadius: 10, padding: '18px 18px 14px' }}>

        <SectionHeader
          icon="🪟"
          title="Glass RFQ Schedule"
          right={
            rfqLines.length > 0 ? (
              <button
                onClick={handleExport}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: exportFlash ? '1px solid #34d399' : '1px solid rgba(37,99,235,0.45)',
                  background: exportFlash ? 'rgba(52,211,153,0.1)' : 'rgba(37,99,235,0.1)',
                  color: exportFlash ? '#34d399' : '#60a5fa',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  letterSpacing: '0.04em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {exportFlash ? '✓ Exported!' : '↓ Export CSV'}
              </button>
            ) : null
          }
        />

        {rfqLines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary, #9ea7b3)', fontSize: '0.78rem' }}>
            No frames saved yet. Use the Parametric Frame Builder to add frames to the bid.
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '32px 44px 70px 70px 70px 1fr 1fr',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(37,99,235,0.08)',
              marginBottom: 4,
            }}>
              {['#', 'QTY', 'Width"', 'Height"', 'SqFt', 'Glass Type', 'System / Elevations'].map((h) => (
                <span key={h} style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#60a5fa' }}>{h}</span>
              ))}
            </div>

            {/* Data rows */}
            {rfqLines.map((line, i) => (
              <div
                key={line.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 44px 70px 70px 70px 1fr 1fr',
                  gap: 8,
                  padding: '8px 10px',
                  borderBottom: i < rfqLines.length - 1 ? '1px solid rgba(45,51,59,0.5)' : 'none',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #9ea7b3)', fontWeight: 600 }}>{i + 1}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary, #e6edf3)', fontVariantNumeric: 'tabular-nums' }}>{line.qty}</span>
                <span style={{ fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', color: '#93c5fd', fontWeight: 600 }}>{line.widthInches.toFixed(2)}</span>
                <span style={{ fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', color: '#93c5fd', fontWeight: 600 }}>{line.heightInches.toFixed(2)}</span>
                <span style={{ fontSize: '0.72rem', color: '#86efac', fontVariantNumeric: 'tabular-nums' }}>{line.totalSqFt.toFixed(2)}</span>
                <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.glassType}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-primary, #e6edf3)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.systemType}</span>
                  {line.elevationTags.filter(Boolean).length > 0 && (
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary, #9ea7b3)' }}>
                      {[...new Set(line.elevationTags)].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* RFQ Totals bar */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '32px 44px 70px 70px 70px 1fr 1fr',
              gap: 8,
              padding: '9px 10px',
              borderTop: '1px solid var(--border-subtle, #2d333b)',
              marginTop: 4,
              background: 'rgba(52,211,153,0.04)',
              borderRadius: 6,
            }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.06em', gridColumn: '1/3' }}>TOTAL</span>
              <span />
              <span />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                {rfqLines.reduce((s, r) => s + r.totalSqFt, 0).toFixed(2)}
              </span>
              <span />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #9ea7b3)' }}>
                {rfqLines.reduce((s, r) => s + r.qty, 0)} total lites · {rfqLines.length} unique size{rfqLines.length !== 1 ? 's' : ''}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Frame Log ──────────────────────────────────────────────────────── */}
      {frames.length > 0 && (
        <div style={{ background: 'var(--bg-panel, #0d1117)', border: '1px solid var(--border-subtle, #2d333b)', borderRadius: 10, padding: '14px 18px' }}>
          <SectionHeader
            icon="📋"
            title={`Frame Log (${frames.length})`}
            right={
              <button
                onClick={() => setShowFrameLog(v => !v)}
                style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', padding: '2px 6px' }}
              >
                {showFrameLog ? 'Collapse ▲' : 'Expand ▼'}
              </button>
            }
          />

          {showFrameLog && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {frames.map((f) => (
                <div
                  key={f.frameId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--bg-card, #1c2128)',
                    borderRadius: 7,
                    border: '1px solid var(--border-subtle, #2d333b)',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#60a5fa', whiteSpace: 'nowrap' }}>{f.elevationTag}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #9ea7b3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.systemType}</span>
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #9ea7b3)', fontVariantNumeric: 'tabular-nums' }}>
                      {f.inputs.width}&quot;×{f.inputs.height}&quot; · {f.inputs.bays}B/{f.inputs.rows}R · {f.bom.totalAluminumLF} LF · {f.bom.totalGlassSqFt} ft²
                    </span>
                  </div>
                  <button
                    onClick={() => removeFrame(f.frameId)}
                    title="Remove frame"
                    style={{
                      background: 'none',
                      border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: 5,
                      color: '#f87171',
                      cursor: 'pointer',
                      padding: '3px 8px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {frames.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary, #9ea7b3)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10, opacity: 0.4 }}>🏗️</div>
          <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600 }}>No frames in the bid yet</p>
          <p style={{ margin: '6px 0 0', fontSize: '0.72rem', lineHeight: 1.5 }}>
            Use the Parametric Frame Builder to define frames.<br/>
            Click &ldquo;Save Frame to Bid&rdquo; to populate this panel.
          </p>
        </div>
      )}

    </div>
  );
}
