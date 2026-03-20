/**
 * StructuralPanel.tsx
 *
 * Slide-in structural calculator panel for Studio.
 * Triggered from the right-click context menu "Check Structural" action.
 *
 * Pre-populates from the clicked frame highlight:
 *   - width/height → span and tributary width
 *   - raked angle  → headSlopeDeg
 *   - frameSystemType → auto-selects mullion profile
 *
 * All calculations run synchronously in the renderer via structuralEngine.ts
 * (no network calls, no async).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  runStructuralAnalysis,
  MULLION_PROFILES,
  type StructuralInputs,
  type StructuralResult,
  type MullionCheckStatus,
  type ExposureCategory,
} from '../../engine/structuralEngine';
import type { RectShape, PolygonShape } from '../../types/shapes';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StructuralPanelProps {
  shape:    RectShape | PolygonShape;
  onClose:  () => void;
  /** Called when the estimator clicks "Attach to Highlight" — persists the result */
  onAttach?: (shapeId: string, verdict: string, status: MullionCheckStatus) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StructuralPanel({ shape, onClose, onAttach }: StructuralPanelProps) {
  // Derive initial values from shape
  const initWidthFt  = shape.type === 'rect'
    ? (shape.widthInches  ?? 0) / 12
    : (shape.bbWidthInches ?? 0) / 12;
  const initHeightFt = shape.type === 'rect'
    ? (shape.heightInches  ?? 0) / 12
    : (shape.bbHeightInches ?? 0) / 12;
  const initRake     = ('headSlopeDeg' in shape ? shape.headSlopeDeg : 0) ?? 0;
  const initProfile  = deriveProfile(shape);

  // ── Input state ─────────────────────────────────────────────────────────────
  const [windVelocity,     setWindVelocity]     = useState(90);
  const [exposure,         setExposure]         = useState<ExposureCategory>('C');
  const [importanceFactor, setImportanceFactor] = useState(1.0);
  const [heightAboveGrade, setHeightAboveGrade] = useState(Math.max(initHeightFt * 2, 15)); // midpoint estimate
  const [bayCount,         setBayCount]         = useState(1);
  const [profileIdx,       setProfileIdx]       = useState(initProfile);
  const [attached,         setAttached]         = useState(false);

  // ── Section collapse state ───────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    wind: true, mullion: true, deflection: false, stress: false, steel: false, splice: false, clips: false,
  });

  function toggleSection(key: string) {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // ── Derived inputs object ────────────────────────────────────────────────────
  const inputs: StructuralInputs = useMemo(() => ({
    widthFt:          initWidthFt,
    heightFt:         initHeightFt,
    windVelocity,
    exposure,
    importanceFactor,
    heightAboveGrade,
    bayCount,
    mullionProfileIdx: profileIdx,
    headSlopeDeg:      initRake,
  }), [initWidthFt, initHeightFt, windVelocity, exposure, importanceFactor, heightAboveGrade, bayCount, profileIdx, initRake]);

  // ── Run analysis synchronously on every input change ────────────────────────
  const result: StructuralResult = useMemo(() => runStructuralAnalysis(inputs), [inputs]);

  // Reset "attached" badge when shape changes
  useEffect(() => { setAttached(false); }, [shape.id]);

  function handleAttach() {
    onAttach?.(shape.id, result.verdict, result.mullion.status);
    setAttached(true);
  }

  // ── Status palette ───────────────────────────────────────────────────────────
  const statusColor = STATUS_COLORS[result.mullion.status] ?? STATUS_COLORS.PASS;

  return (
    <div className="flex flex-col h-full bg-slate-850 border-l border-slate-700 text-slate-200 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-start gap-2">
          <span className="text-amber-400 text-base mt-0.5">🏗️</span>
          <div>
            <h2 className="text-xs font-semibold text-slate-100">Structural Check</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {(shape.label ?? 'Frame')} &nbsp;·&nbsp;
              {(initWidthFt * 12).toFixed(0)}&quot; × {(initHeightFt * 12).toFixed(0)}&quot;
              {initRake > 0 && ` · 🔺 ${initRake.toFixed(1)}°`}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-base px-1 leading-none">✕</button>
      </div>

      {/* ── Status strip ───────────────────────────────────────────────────── */}
      <div className={`px-3 py-2 flex items-center gap-2 shrink-0 ${statusColor.bg}`}>
        <span className="text-base">{statusColor.icon}</span>
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-bold ${statusColor.text}`}>
            {STATUS_LABELS[result.mullion.status]}
          </span>
          <p className="text-[10px] text-slate-400 truncate mt-0.5">{result.verdict}</p>
        </div>
        {attached ? (
          <span className="text-[10px] text-emerald-400 shrink-0 font-semibold">✅ Attached</span>
        ) : (
          <button
            onClick={handleAttach}
            className="shrink-0 px-2 py-1 text-[10px] font-semibold bg-amber-600/80 hover:bg-amber-500 text-white rounded transition-colors"
          >
            Attach
          </button>
        )}
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-700/50">

        {/* Input section */}
        <Section title="Inputs" icon="⚙️" open alwaysOpen>
          <div className="space-y-2">
            <InputRow label="Wind Speed (mph)">
              <NumberInput
                value={windVelocity}
                onChange={setWindVelocity}
                min={60} max={200} step={5}
              />
            </InputRow>
            <InputRow label="Exposure">
              <select
                value={exposure}
                onChange={e => setExposure(e.target.value as ExposureCategory)}
                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option>B</option>
                <option>C</option>
                <option>D</option>
              </select>
            </InputRow>
            <InputRow label="Importance (I)">
              <select
                value={importanceFactor}
                onChange={e => setImportanceFactor(Number(e.target.value))}
                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value={1.0}>1.00 — Standard</option>
                <option value={1.15}>1.15 — Hospital / EF</option>
                <option value={0.87}>0.87 — Agricultural</option>
              </select>
            </InputRow>
            <InputRow label="Height Above Grade (ft)">
              <NumberInput
                value={heightAboveGrade}
                onChange={setHeightAboveGrade}
                min={0} max={600} step={5}
              />
            </InputRow>
            <InputRow label="Bay Count">
              <NumberInput
                value={bayCount}
                onChange={setBayCount}
                min={1} max={12} step={1}
              />
            </InputRow>
            <InputRow label="Mullion Profile">
              <select
                value={profileIdx}
                onChange={e => setProfileIdx(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                {MULLION_PROFILES.map((p, i) => (
                  <option key={p.label} value={i}>{p.label}</option>
                ))}
              </select>
            </InputRow>
          </div>
        </Section>

        {/* Wind results */}
        <Section title="Wind Pressure" icon="💨" open={openSections.wind} onToggle={() => toggleSection('wind')}>
          <ResultGrid rows={[
            ['Design Pressure', `${result.wind.designPressurePsf.toFixed(2)} psf`],
            ['Velocity Pressure (qz)', `${result.wind.velocityPressurePsf.toFixed(2)} psf`],
            ['Kz', result.wind.Kz.toFixed(3)],
            ['+GCp Pressure', `${result.wind.positivePressurePsf.toFixed(2)} psf`],
            ['−GCp Suction', `${result.wind.negativePressurePsf.toFixed(2)} psf`],
          ]} />
        </Section>

        {/* Mullion summary */}
        <Section title="Mullion Check" icon="📏" open={openSections.mullion} onToggle={() => toggleSection('mullion')}>
          <div className="mb-2">
            <ProfileBadge profile={result.mullion.profile} />
          </div>
          <ResultGrid rows={[
            ['Required Ix', `${result.mullion.requiredIx.toFixed(3)} in⁴`],
            ['Aluminum Ix', `${result.mullion.profile.Ix.toFixed(3)} in⁴`],
            ['Composite Ix', `${result.mullion.steel.compositeIx.toFixed(3)} in⁴`],
          ]} />
        </Section>

        {/* Deflection */}
        <Section title="Deflection" icon="📉" open={openSections.deflection} onToggle={() => toggleSection('deflection')}>
          <ResultGrid rows={[
            ['Deflection', `${(result.mullion.deflection.deflectionIn * 1000 | 0) / 1000}" (${result.mullion.deflection.deflectionIn < 0.001 ? '<0.001' : result.mullion.deflection.deflectionIn.toFixed(3)}″)`],
            ['L/175 Limit', `${result.mullion.deflection.limitL175.toFixed(3)}"`],
            ['L/240 Limit', `${result.mullion.deflection.limitL240.toFixed(3)}"`],
            ['L/175 Utilization', pct(result.mullion.deflection.utilizationL175)],
            ['Passes L/175', bool(result.mullion.deflection.passesL175)],
            ['Passes L/240', bool(result.mullion.deflection.passesL240)],
          ]} />
        </Section>

        {/* Stress */}
        <Section title="Bending Stress" icon="⚗️" open={openSections.stress} onToggle={() => toggleSection('stress')}>
          <ResultGrid rows={[
            ['Bending Stress', `${(result.mullion.stress.bendingStressPsi / 1000).toFixed(1)} ksi`],
            ['Allowable Stress', `${(result.mullion.stress.allowableStressPsi / 1000).toFixed(1)} ksi`],
            ['Safety Factor', result.mullion.stress.safetyFactor.toFixed(2)],
            ['Utilization', pct(result.mullion.stress.utilizationPct)],
            ['Passes', bool(result.mullion.stress.passes)],
          ]} />
        </Section>

        {/* Steel reinforcement */}
        <Section title="Steel Reinforcement" icon="🔩" open={openSections.steel} onToggle={() => toggleSection('steel')}>
          {result.mullion.steel.required ? (
            result.mullion.steel.hss ? (
              <>
                <div className="mb-2 px-2 py-1.5 bg-amber-900/30 border border-amber-700/40 rounded text-[10px] text-amber-300">
                  {result.mullion.steel.hss.label} required
                </div>
                <ResultGrid rows={[
                  ['Section', result.mullion.steel.hss.label],
                  ['Ix', `${result.mullion.steel.hss.Ix.toFixed(2)} in⁴`],
                  ['Depth', `${result.mullion.steel.hss.depth}"`],
                  ['Weight', `${result.mullion.steel.hss.weight} lbs/ft`],
                  ['Composite Ix', `${result.mullion.steel.compositeIx.toFixed(2)} in⁴`],
                ]} />
              </>
            ) : (
              <div className="px-2 py-2 bg-red-900/30 border border-red-700/40 rounded text-[10px] text-red-300">
                {result.mullion.steel.message}
              </div>
            )
          ) : (
            <div className="px-2 py-2 bg-emerald-900/30 border border-emerald-700/40 rounded text-[10px] text-emerald-300">
              No steel reinforcement required
            </div>
          )}
        </Section>

        {/* Splice */}
        <Section title="Splice Recommendation" icon="📌" open={openSections.splice} onToggle={() => toggleSection('splice')}>
          <ResultGrid rows={[
            ['Required', bool(result.mullion.splice.needed)],
            ['Type', result.mullion.splice.type],
            ['Span', `${result.mullion.splice.maxSpanFt.toFixed(1)} ft`],
          ]} />
          <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">{result.mullion.splice.reasoning}</p>
        </Section>

        {/* Wind clips */}
        <Section title="Wind Clips" icon="🪝" open={openSections.clips} onToggle={() => toggleSection('clips')}>
          <ResultGrid rows={[
            ['Spacing', `${result.mullion.windClip.spacingIn}" o.c.`],
            ['Min Capacity', `${result.mullion.windClip.minLoadLbs} lbs`],
            ['Type', result.mullion.windClip.type],
          ]} />
        </Section>

        {/* Recommendations */}
        {result.mullion.recommendations.length > 0 && (
          <div className="px-3 py-2.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Notes</p>
            <ul className="space-y-1.5">
              {result.mullion.recommendations.map((r, i) => (
                <li key={i} className="text-[10px] text-slate-400 leading-relaxed">{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 bg-slate-900 border-t border-slate-700 shrink-0">
        <p className="text-[9px] text-slate-600 leading-relaxed">
          ASCE 7-22 · AAMA SFM-1 · ADM 2020 — For preliminary estimation only.
          PE review required before construction.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title, icon, open, onToggle, alwaysOpen = false, children,
}: {
  title: string;
  icon: string;
  open: boolean;
  onToggle?: () => void;
  alwaysOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2">
      <button
        className="w-full flex items-center gap-1.5 text-left mb-1.5 disabled:cursor-default"
        onClick={alwaysOpen ? undefined : onToggle}
        disabled={alwaysOpen}
      >
        <span className="text-xs">{icon}</span>
        <span className="text-[10px] font-semibold text-slate-300 flex-1">{title}</span>
        {!alwaysOpen && (
          <span className="text-[10px] text-slate-600">{open ? '▲' : '▼'}</span>
        )}
      </button>
      {open && children}
    </div>
  );
}

function ResultGrid({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className="space-y-0.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between items-baseline gap-2">
          <span className="text-[10px] text-slate-500 shrink-0">{label}</span>
          <span className="text-[10px] text-slate-300 text-right font-mono leading-relaxed">{value}</span>
        </div>
      ))}
    </div>
  );
}

function InputRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 justify-between">
      <span className="text-[10px] text-slate-400 shrink-0 w-32">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e => {
        const v = Number(e.target.value);
        if (!isNaN(v) && v >= min && v <= max) onChange(v);
      }}
      className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono text-right focus:outline-none focus:border-amber-500"
    />
  );
}

function ProfileBadge({ profile }: { profile: { label: string; systemType: string; depth: number } }) {
  const isAlw = profile.systemType === 'curtainwall';
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
      isAlw ? 'bg-sky-900/30 border-sky-700/50 text-sky-300' : 'bg-slate-700/50 border-slate-600 text-slate-300'
    }`}>
      <span>{isAlw ? '🏛️' : '🪟'}</span>
      {profile.label} — {profile.depth}&quot; pocket
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number) {
  const color = v > 100 ? 'text-red-400' : v > 80 ? 'text-amber-400' : 'text-emerald-400';
  return <span className={color}>{v.toFixed(0)}%</span>;
}

function bool(v: boolean) {
  return <span className={v ? 'text-emerald-400' : 'text-red-400'}>{v ? '✅ Yes' : '❌ No'}</span>;
}

/** Map frameSystemType hint from shape to mullion profile index */
function deriveProfile(shape: RectShape | PolygonShape): number {
  const sys = ('frameSystemType' in shape ? shape.frameSystemType : '') ?? '';
  if (sys.includes('cw') || sys.includes('curtainwall')) return 4; // CW 7.5" Shallow
  if (sys.includes('heavy')) return 2;                             // SF 4.5" Heavy
  return 1;                                                         // SF 4.5" Std (default)
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<MullionCheckStatus, { bg: string; text: string; icon: string }> = {
  PASS:             { bg: 'bg-emerald-950/60', text: 'text-emerald-400', icon: '✅' },
  PASS_WITH_STEEL:  { bg: 'bg-amber-950/60',   text: 'text-amber-400',   icon: '💡' },
  UPGRADE_TO_CW:    { bg: 'bg-orange-950/60',  text: 'text-orange-400',  icon: '🔄' },
  FAIL_CRITICAL:    { bg: 'bg-red-950/60',      text: 'text-red-400',     icon: '🚨' },
};

const STATUS_LABELS: Record<MullionCheckStatus, string> = {
  PASS:             'PASS — Aluminum OK',
  PASS_WITH_STEEL:  'PASS WITH STEEL REINF.',
  UPGRADE_TO_CW:    'UPGRADE TO CURTAINWALL',
  FAIL_CRITICAL:    'CRITICAL — PE REVIEW REQUIRED',
};
