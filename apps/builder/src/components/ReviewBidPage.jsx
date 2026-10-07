/**
 * ReviewBidPage.jsx — THE bid recap (interview decision #3).
 *
 * One screen, one set of numbers, all of them from `computeBid()`. It replaces
 * four competing waterfalls:
 *
 *   - this page's own per-scope `calculatePricing` in MARGIN mode
 *   - GlazeBidWorkspace's right-rail Project Total
 *   - BidCart's `??` fallback arithmetic
 *   - BidSummaryDashboard's separate aggregation
 *
 * What it absorbed from BidSummaryDashboard (which was imported but never
 * rendered): the alternates rollup, the cost-code export, and the editable
 * adjustments panel — now writing to App's `bidSettings` rather than to local
 * state nobody could read.
 *
 * Markup is ADDITIVE (decision #21): cost x markup%, and GPM is reported, never
 * back-solved. The old margin mode is gone. Totals here will differ from what
 * the workspace used to show for the same bid; the workspace was wrong against
 * the Alpine Buick GMC sheet.
 */

import React, { useState, useMemo } from 'react';
import {
  ArrowLeft, ChevronRight, LayoutGrid, FileText, Download,
  SlidersHorizontal, AlertTriangle, Layers,
} from 'lucide-react';
import useBidRecap from '../hooks/useBidRecap';
import { costCodeCSV, scopeCSV, unpricedCSV, downloadCSV, safeName } from '../utils/bidRecapExport';

// ─── labels ───────────────────────────────────────────────────────────────────

const SYSTEM_TYPE_LABELS = {
  'ext-sf-1': 'Exterior Storefront',
  'ext-sf-2': 'Exterior Storefront (Alt)',
  'int-sf': 'Interior Storefront',
  'cap-cw': 'Captured Curtain Wall',
  'ssg-cw': 'SSG Curtain Wall',
  'Ext SF': 'Exterior Storefront',
  'Int SF': 'Interior Storefront',
  'Cap CW': 'Captured Curtain Wall',
  'SSG CW': 'SSG Curtain Wall',
  'material-only': 'Material Only',
  'labor-only': 'Labor Only',
  'custom-system': 'Custom System',
  'misc-labor': 'Misc Labor',
};

const TYPE_COLORS = {
  'ext-sf-1': '#58a6ff', 'ext-sf-2': '#79c0ff', 'int-sf': '#a5f3fc',
  'cap-cw': '#34d399', 'ssg-cw': '#fbbf24',
  'Ext SF': '#58a6ff', 'Int SF': '#a5f3fc', 'Cap CW': '#34d399', 'SSG CW': '#fbbf24',
  'material-only': '#c084fc', 'labor-only': '#fb923c',
  'custom-system': '#94a3b8', 'misc-labor': '#f472b6',
};

const DEFAULT_BID_SETTINGS = {
  laborRate: 42, markupPercent: 20, taxPercent: 8.25, crewSize: 4,
};

export function readBidSettings(projectKey) {
  try {
    const raw = localStorage.getItem(`glazebid:bidSettings:${projectKey}`);
    const saved = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_BID_SETTINGS, ...saved };
  } catch { return { ...DEFAULT_BID_SETTINGS }; }
}

function writeBidSettings(projectKey, settings) {
  try {
    localStorage.setItem(`glazebid:bidSettings:${projectKey}`, JSON.stringify(settings));
  } catch { /* private mode / quota — the in-memory value still drives the screen */ }
}

// ─── formatting ───────────────────────────────────────────────────────────────

const usd = (n, { dash = true } = {}) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return dash ? '—' : '$0';
  if (v === 0 && dash) return '—';
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `($${s})` : `$${s}`;
};
const pct1 = (n) => `${(Number(n) * 100).toFixed(2)}%`;
const num1 = (n) => (Number(n) ? Number(n).toFixed(1) : '—');
const num0 = (n) => (Number(n) ? Number(n).toFixed(0) : '—');

/** Company GPM thresholds, as the old dashboard showed them. */
function gpmColor(gpm, sell) {
  const target = sell > 1_000_000 ? 0.25 : sell > 250_000 ? 0.27 : 0.30;
  if (gpm >= target) return '#34d399';
  if (gpm >= target - 0.03) return '#fbbf24';
  return '#f87171';
}

// ─── small presentational pieces ──────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '1.1rem 1.4rem', minWidth: 140,
    }}>
      <div style={{
        fontSize: '1.35rem', fontWeight: 800, color: accent || '#e6edf3',
        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: '#8b949e', marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: '#5c6370', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, icon, right, children, tone = '#58a6ff' }) {
  return (
    <div style={{ marginTop: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem' }}>
        {icon}
        <h2 style={{
          margin: 0, fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: tone,
        }}>{title}</h2>
        <div style={{ flex: 1 }} />
        {right}
      </div>
      {children}
    </div>
  );
}

function Panel({ children, pad = '0' }) {
  return (
    <div style={{
      background: '#161b22', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, overflow: 'hidden', padding: pad,
    }}>{children}</div>
  );
}

function Btn({ onClick, children, kind = 'ghost', disabled }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.45rem 0.9rem', borderRadius: 7, fontSize: '0.78rem',
    fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
  };
  const kinds = {
    ghost: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#8b949e' },
    primary: { background: '#58a6ff', border: 'none', color: '#0d1117' },
  };
  return (
    <button type="button" onClick={disabled ? undefined : onClick} style={{ ...base, ...kinds[kind] }}>
      {children}
    </button>
  );
}

const TH = ({ children, align = 'right', width }) => (
  <th style={{
    padding: '0.8rem 0.9rem', textAlign: align, width,
    fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: '#8b949e', whiteSpace: 'nowrap',
  }}>{children}</th>
);

const TD = ({ children, align = 'right', color = '#e6edf3', weight = 400, width }) => (
  <td style={{
    padding: '0.72rem 0.9rem', textAlign: align, color, width,
    fontWeight: weight, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  }}>{children}</td>
);

/** A labelled number input that commits on change. */
function RateInput({ label, value, onChange, suffix = '%', step = 0.25, width = 76, testId }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          data-testid={testId}
          step={step}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={{
            width, padding: '0.35rem 0.5rem', borderRadius: 6, textAlign: 'right',
            background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)',
            color: '#e6edf3', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums',
          }}
        />
        <span style={{ fontSize: '0.72rem', color: '#5c6370' }}>{suffix}</span>
      </span>
    </label>
  );
}

function ScopeStatus({ scope }) {
  const chip = (bg, fg, text) => (
    <span style={{
      fontSize: '0.68rem', fontWeight: 700, padding: '2px 10px', borderRadius: 20,
      background: bg, color: fg, border: `1px solid ${fg}40`,
    }}>{text}</span>
  );
  if (scope.flaggedLines > 0) {
    return chip('rgba(251,191,36,0.1)', '#fbbf24', `${scope.flaggedLines} unpriced`);
  }
  if (scope.cost > 0) return chip('rgba(52,211,153,0.12)', '#34d399', 'Priced');
  return chip('rgba(255,255,255,0.05)', '#8b949e', 'Empty');
}

// ─── main page ────────────────────────────────────────────────────────────────

const ReviewBidPage = ({
  project, onBack, onNavigate, onEditFrame,
  bidSettings: bidSettingsProp, onBidSettingsChange,
}) => {
  const projectKey = project || '_default';

  // App owns bid settings when it passes them; otherwise this screen owns them
  // and persists to the same localStorage key the workspace reads.
  const [localSettings, setLocalSettings] = useState(() => readBidSettings(projectKey));
  const bidSettings = bidSettingsProp || localSettings;

  const setBidSettings = (patch) => {
    const next = { ...bidSettings, ...patch };
    writeBidSettings(projectKey, next);
    if (onBidSettingsChange) onBidSettingsChange(next);
    else setLocalSettings(next);
  };

  const { result, systems, frames } = useBidRecap({ bidSettings });

  const [filter, setFilter] = useState('all');
  const [hovRow, setHovRow] = useState(null);
  const [showAdjust, setShowAdjust] = useState(false);

  const baseScopes = useMemo(() => result.scopes.filter((s) => !s.alternate), [result.scopes]);

  const breakouts = useMemo(
    () => [...new Set(baseScopes.map((s) => s.breakout))],
    [baseScopes],
  );
  const displayed = filter === 'all' ? baseScopes : baseScopes.filter((s) => s.breakout === filter);

  const shown = useMemo(() => displayed.reduce((a, s) => ({
    sf: a.sf + (s.areaSqFt || 0),
    mh: a.mh + s.labor.totalMH,
    labor: a.labor + s.labor.cost,
    material: a.material + s.material.cost,
    cost: a.cost + s.cost,
    tax: a.tax + s.tax,
    markup: a.markup + s.markup,
    sell: a.sell + s.sell,
  }), { sf: 0, mh: 0, labor: 0, material: 0, cost: 0, tax: 0, markup: 0, sell: 0 }),
  [displayed]);

  const aiFrames = useMemo(() => frames.filter((f) => f.source === 'studio' || f.ai), [frames]);

  const jump = (systemId) => {
    if (systemId) localStorage.setItem('glazebid:jumpToSystem', systemId);
    onNavigate?.('bidsheet');
  };

  const dl = (builder, suffix) =>
    downloadCSV(builder(result, project || 'Bid'), `${safeName(project)}_${suffix}.csv`);

  const gpmTone = gpmColor(result.base.gpm, result.base.sell);

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.9rem 1.75rem',
        background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: 'none', color: '#8b949e', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: '0.3rem 0.6rem', borderRadius: 6 }}
        >
          <ArrowLeft size={15} />
          Project Home
        </button>

        <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: '1rem' }}>/</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={16} color="#58a6ff" />
          <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>Review Bid</span>
          {project && (
            <span style={{ fontSize: '0.78rem', color: '#8b949e', background: 'rgba(255,255,255,0.06)', padding: '2px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)' }}>
              {project}
            </span>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: '0.72rem', color: '#8b949e', display: 'flex', gap: '1rem' }}>
          <span>Labor <strong style={{ color: '#e6edf3' }}>${result.job.laborRate}/hr</strong></span>
          <span>Markup <strong style={{ color: '#e6edf3' }}>{result.job.markupPct}%</strong></span>
          <span>Tax <strong style={{ color: '#e6edf3' }}>{bidSettings.isTaxExempt ? 'exempt' : `${result.job.taxPct}%`}</strong></span>
        </div>

        <Btn onClick={() => setShowAdjust((v) => !v)}>
          <SlidersHorizontal size={13} /> Adjustments
        </Btn>
        <Btn kind="primary" onClick={() => jump(null)}>
          <LayoutGrid size={14} /> Open Bid Builder
        </Btn>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, padding: '1.75rem', width: '100%', boxSizing: 'border-box', overflowX: 'auto' }}>

        {/* ── Stat cards ── */}
        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
          <StatCard label="Scopes" value={baseScopes.length} sub={`${breakouts.length} breakout${breakouts.length === 1 ? '' : 's'}`} />
          <StatCard label="Total SF" value={num0(result.totalSqFt)} sub="Square feet" />
          <StatCard label="Man-Hours" value={num1(shown.mh)} sub={`$${result.job.laborRate}/hr blended`} />
          <StatCard label="Labor" value={usd(shown.labor)} accent="#58a6ff" />
          <StatCard label="Material" value={usd(shown.material)} accent="#79c0ff" />
          <StatCard label="Tax" value={usd(result.base.tax)} accent="#f97316" sub={bidSettings.isTaxExempt ? 'EXEMPT' : `${result.job.taxPct}% on material`} />
          <StatCard label="Markup" value={usd(result.base.markup)} accent="#fbbf24" sub={`${result.job.markupPct}% of cost`} />
          <StatCard label="Base Bid" value={usd(result.base.sell)} accent="#34d399" sub={`GPM ${pct1(result.base.gpm)}`} />
        </div>

        {/* ── Adjustments ── */}
        {showAdjust && (
          <Section title="Bid Adjustments" icon={<SlidersHorizontal size={14} color="#fbbf24" />} tone="#fbbf24">
            <Panel pad="1.1rem 1.3rem">
              <div data-testid="adjust-panel" style={{ display: 'flex', gap: '1.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <RateInput label="Markup" value={bidSettings.markupPercent} onChange={(v) => setBidSettings({ markupPercent: v })} testId="adj-markup" />
                <RateInput label="Tax" value={bidSettings.taxPercent} onChange={(v) => setBidSettings({ taxPercent: v })} testId="adj-tax" />
                <RateInput label="Labor rate" value={bidSettings.laborRate} onChange={(v) => setBidSettings({ laborRate: v })} testId="adj-labor-rate" suffix="$/hr" step={0.5} />
                <RateInput label="Crew" value={bidSettings.crewSize} onChange={(v) => setBidSettings({ crewSize: v })} testId="adj-crew" suffix="men" step={1} width={56} />
                <RateInput label="Supplies" value={bidSettings.suppliesPct ?? result.job.suppliesPct} onChange={(v) => setBidSettings({ suppliesPct: v })} testId="adj-supplies" step={0.05} />
                <RateInput label="Mat. contingency" value={bidSettings.materialContingencyPct ?? result.job.materialContingencyPct} onChange={(v) => setBidSettings({ materialContingencyPct: v })} testId="adj-contingency" step={0.05} />
                <RateInput label="Shop drawings" value={bidSettings.shopDrawingsPct ?? result.job.shopDrawingsPct} onChange={(v) => setBidSettings({ shopDrawingsPct: v })} testId="adj-shops" step={0.05} />
                <RateInput label="P&P bond" value={bidSettings.bondPct ?? result.job.bondPct} onChange={(v) => setBidSettings({ bondPct: v })} testId="adj-bond" step={0.05} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#8b949e', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={!!bidSettings.isTaxExempt}
                    onChange={(e) => setBidSettings({ isTaxExempt: e.target.checked })}
                  />
                  Tax exempt
                </label>
              </div>
              <div style={{ marginTop: '0.9rem', fontSize: '0.72rem', color: '#5c6370', lineHeight: 1.5 }}>
                Markup is <strong style={{ color: '#8b949e' }}>additive</strong>: cost × {result.job.markupPct}%.
                GPM is the result ({pct1(result.base.gpm)}), not an input — it comes out lower than
                {' '}{(result.job.markupPct / (100 + result.job.markupPct) * 100).toFixed(2)}% because tax
                sits in the sell but not in the profit.
              </div>
            </Panel>
          </Section>
        )}

        {/* ── Breakout filter ── */}
        {breakouts.length > 1 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.4rem' }}>
            {[{ key: 'all', label: 'All Breakouts' }, ...breakouts.map((b) => ({ key: b, label: b }))].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key)}
                style={{
                  padding: '0.3rem 0.85rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                  background: filter === opt.key ? '#58a6ff' : 'rgba(255,255,255,0.05)',
                  color: filter === opt.key ? '#0d1117' : '#8b949e',
                  border: `1px solid ${filter === opt.key ? '#58a6ff' : 'rgba(255,255,255,0.08)'}`,
                }}
              >{opt.label}</button>
            ))}
          </div>
        )}

        {/* ── Scope table ── */}
        {baseScopes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 2rem', color: '#8b949e' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#e6edf3', fontWeight: 700 }}>Nothing on the bid yet</h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem' }}>
              Build a scope in the Bid Builder, or send a takeoff over from Studio.
            </p>
            <Btn kind="primary" onClick={() => jump(null)}>Open Bid Builder →</Btn>
          </div>
        ) : (
          <Section
            title="Scopes"
            icon={<Layers size={14} color="#58a6ff" />}
            right={<Btn onClick={() => dl(scopeCSV, 'scopes')}><Download size={13} /> Scope CSV</Btn>}
          >
            <Panel>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: 1180 }}>
                <thead>
                  <tr style={{ background: '#0d1117', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                    <TH align="left" width={38}>#</TH>
                    <TH align="left">Breakout</TH>
                    <TH align="left">System</TH>
                    <TH align="left">Status</TH>
                    <TH>SF</TH>
                    <TH>MHs</TH>
                    <TH>Labor</TH>
                    <TH>Material</TH>
                    <TH>Cost</TH>
                    <TH>Tax</TH>
                    <TH>Markup</TH>
                    <TH>Sell</TH>
                    <TH>GPM</TH>
                    <TH width={60}> </TH>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((s, i) => {
                    const typeLabel = SYSTEM_TYPE_LABELS[s.systemType] || s.systemType || '—';
                    const typeColor = TYPE_COLORS[s.systemType] || '#8b949e';
                    const hov = hovRow === i;
                    return (
                      <tr
                        key={s.id || i}
                        onMouseEnter={() => setHovRow(i)}
                        onMouseLeave={() => setHovRow(null)}
                        onClick={() => jump(s.sourceSystemId || s.id)}
                        data-testid={`scope-row-${i}`}
                        style={{
                          background: hov ? 'rgba(88,166,255,0.08)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                          borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer',
                        }}
                      >
                        <TD align="left" color="#5c6370" weight={700} width={38}>{i + 1}</TD>
                        <td
                          data-testid={`scope-breakout-${i}`}
                          style={{ padding: '0.72rem 0.9rem', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', color: hov ? '#58a6ff' : '#e6edf3' }}
                        >{s.breakout}</td>
                        <TD align="left">
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}33` }}>
                            {typeLabel}
                          </span>
                        </TD>
                        <TD align="left"><ScopeStatus scope={s} /></TD>
                        <TD color={s.areaSqFt ? '#e6edf3' : '#5c6370'}>{num0(s.areaSqFt)}</TD>
                        <TD color={s.labor.totalMH ? '#a5f3fc' : '#5c6370'}>{num1(s.labor.totalMH)}</TD>
                        <TD color={s.labor.cost ? '#58a6ff' : '#5c6370'}>{usd(s.labor.cost)}</TD>
                        <TD color={s.material.cost ? '#79c0ff' : '#5c6370'}>{usd(s.material.cost)}</TD>
                        <TD color="#e6edf3" weight={600}>{usd(s.cost)}</TD>
                        <TD color={s.tax ? '#f97316' : '#5c6370'}>{usd(s.tax)}</TD>
                        <TD color={s.markup ? '#fbbf24' : '#5c6370'}>{usd(s.markup)}</TD>
                        <TD color="#34d399" weight={800}>{usd(s.sell)}</TD>
                        <TD color={gpmColor(s.gpm, s.sell)} weight={700}>{s.sell ? pct1(s.gpm) : '—'}</TD>
                        <TD width={60}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: hov ? '#58a6ff' : '#5c6370', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            Edit <ChevronRight size={12} />
                          </span>
                        </TD>
                      </tr>
                    );
                  })}
                </tbody>
                {displayed.length > 1 && (
                  <tfoot>
                    <tr style={{ background: '#0d1117', borderTop: '2px solid rgba(255,255,255,0.12)' }} data-testid="scope-totals">
                      <td colSpan={4} style={{ padding: '0.75rem 0.9rem', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8b949e' }}>
                        {displayed.length} scopes
                      </td>
                      <TD weight={800}>{num0(shown.sf)}</TD>
                      <TD weight={800} color="#a5f3fc">{num1(shown.mh)}</TD>
                      <TD weight={800} color="#58a6ff">{usd(shown.labor)}</TD>
                      <TD weight={800} color="#79c0ff">{usd(shown.material)}</TD>
                      <TD weight={800}>{usd(shown.cost)}</TD>
                      <TD weight={800} color="#f97316">{usd(shown.tax)}</TD>
                      <TD weight={800} color="#fbbf24">{usd(shown.markup)}</TD>
                      <TD weight={900} color="#34d399">{usd(shown.sell)}</TD>
                      <TD weight={800} color={gpmColor(shown.sell ? shown.markup / shown.sell : 0, shown.sell)}>
                        {shown.sell ? pct1(shown.markup / shown.sell) : '—'}
                      </TD>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </Panel>
          </Section>
        )}

        {/* ── Alternates ── */}
        {result.alternates.length > 0 && (
          <Section title="Alternates — not in the base bid" icon={<Layers size={14} color="#c084fc" />} tone="#c084fc">
            <Panel>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: '#0d1117', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                    <TH align="left">Alternate</TH>
                    <TH align="left">Breakouts</TH>
                    <TH>Cost</TH>
                    <TH>Tax</TH>
                    <TH>Markup</TH>
                    <TH>Add / (Deduct)</TH>
                  </tr>
                </thead>
                <tbody>
                  {result.alternates.map((a) => (
                    <tr key={a.alternate} data-testid={`alt-row-${a.alternate}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <TD align="left" weight={700}>{a.alternate}</TD>
                      <TD align="left" color="#8b949e">{a.scopes.join(' · ')}</TD>
                      <TD>{usd(a.cost)}</TD>
                      <TD color="#f97316">{usd(a.tax)}</TD>
                      <TD color="#fbbf24">{usd(a.markup)}</TD>
                      <TD weight={800} color={a.sell < 0 ? '#f87171' : '#34d399'}>{usd(a.sell)}</TD>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0d1117', borderTop: '2px solid rgba(255,255,255,0.12)' }} data-testid="all-alternates">
                    <td colSpan={2} style={{ padding: '0.75rem 0.9rem', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8b949e' }}>
                      Base + all alternates accepted
                    </td>
                    <TD weight={800}>{usd(result.all.cost)}</TD>
                    <TD weight={800} color="#f97316">{usd(result.all.tax)}</TD>
                    <TD weight={800} color="#fbbf24">{usd(result.all.markup)}</TD>
                    <TD weight={900} color="#34d399">{usd(result.all.sell)}</TD>
                  </tr>
                </tfoot>
              </table>
            </Panel>
          </Section>
        )}

        {/* ── Unpriced lines ── */}
        {result.flagged.length > 0 && (
          <Section
            title={`${result.flagged.length} line${result.flagged.length === 1 ? '' : 's'} still waiting on a price`}
            icon={<AlertTriangle size={14} color="#fbbf24" />}
            tone="#fbbf24"
            right={<Btn onClick={() => dl(unpricedCSV, 'unpriced')}><Download size={13} /> RFQ chase list</Btn>}
          >
            <Panel>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#0d1117', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                    <TH align="left">Breakout</TH>
                    <TH align="left">Code</TH>
                    <TH align="left">Description</TH>
                    <TH align="left">Source</TH>
                    <TH>Carried at</TH>
                  </tr>
                </thead>
                <tbody>
                  {result.flagged.slice(0, 40).map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <TD align="left" color="#8b949e">{f.breakout}{f.alternate ? ` · ${f.alternate}` : ''}</TD>
                      <TD align="left" color="#8b949e">{f.group}</TD>
                      <TD align="left">{f.description}</TD>
                      <TD align="left" color={f.source === 'budget' ? '#fbbf24' : '#f87171'} weight={700}>
                        {f.source === 'budget' ? 'budget rate' : 'no price'}
                      </TD>
                      <TD color={f.cost ? '#e6edf3' : '#5c6370'}>{usd(f.cost)}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.flagged.length > 40 && (
                <div style={{ padding: '0.6rem 0.9rem', fontSize: '0.72rem', color: '#5c6370' }}>
                  … and {result.flagged.length - 40} more — export the chase list for all of them.
                </div>
              )}
            </Panel>
          </Section>
        )}

        {/* ── AI frames from Studio ── */}
        {aiFrames.length > 0 && (
          <Section title={`${aiFrames.length} frame${aiFrames.length === 1 ? '' : 's'} from Studio`} icon={<LayoutGrid size={14} color="#34d399" />} tone="#34d399">
            <Panel>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#0d1117', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                    <TH align="left">Elevation</TH>
                    <TH align="left">System</TH>
                    <TH align="left">Size</TH>
                    <TH>Grid</TH>
                    <TH>Qty</TH>
                    <TH>MHs</TH>
                    <TH width={190}> </TH>
                  </tr>
                </thead>
                <tbody>
                  {aiFrames.map((f) => (
                    <tr key={f.frameId} data-testid={`ai-frame-${f.frameId}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <TD align="left" weight={700}>{f.elevationTag}</TD>
                      <TD align="left" color="#8b949e">{f.systemType}</TD>
                      <TD align="left" color="#8b949e">{f.inputs?.width}" × {f.inputs?.height}"</TD>
                      <TD color="#8b949e">{f.inputs?.bays}×{f.inputs?.rows}</TD>
                      <TD>{f.quantity}</TD>
                      <TD color="#a5f3fc">{num1(f.bom?.totalLaborHours)}</TD>
                      <TD width={190}>
                        <Btn onClick={() => onEditFrame?.(f.frameId)} disabled={!onEditFrame}>
                          Open in Frame Builder <ChevronRight size={12} />
                        </Btn>
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}

        {/* ── The bid ── */}
        <Section
          title="The bid"
          icon={<FileText size={14} color="#34d399" />}
          tone="#34d399"
          right={<Btn onClick={() => dl(costCodeCSV, 'cost_codes')}><Download size={13} /> Cost-code CSV</Btn>}
        >
          <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap', alignItems: 'stretch' }}>

            {/* waterfall */}
            <div style={{ flex: '1 1 420px' }}>
              <Panel pad="1.1rem 1.3rem">
                {[
                  ['Material (incl. supplies & contingency)', result.scopes.filter((s) => !s.alternate).reduce((a, s) => a + s.material.cost, 0), '#79c0ff'],
                  ['Labor', result.scopes.filter((s) => !s.alternate).reduce((a, s) => a + s.labor.cost - (s.labor.shopDrawingsCost || 0), 0), '#58a6ff'],
                  [`Shop drawings (${result.job.shopDrawingsPct}% of cost, ${num1(result.shopDrawings.hours)} hrs)`, result.shopDrawings.cost, '#8b949e'],
                  ...(result.projectAdders.cost ? [['Travel / per diem', result.projectAdders.cost, '#8b949e']] : []),
                ].map(([label, value, color]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.84rem' }}>
                    <span style={{ color: '#8b949e' }}>{label}</span>
                    <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{usd(value)}</span>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.55rem 0', marginTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.88rem' }}>
                  <span style={{ color: '#e6edf3', fontWeight: 700 }}>Hard cost</span>
                  <span style={{ color: '#e6edf3', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }} data-testid="hard-cost">{usd(result.base.cost)}</span>
                </div>

                {[
                  [bidSettings.isTaxExempt ? 'Tax (exempt)' : `Tax (${result.job.taxPct}% on material)`, result.base.tax, '#f97316'],
                  [`Markup (${result.job.markupPct}% of cost)`, result.base.markup, '#fbbf24'],
                  ...(result.bond.cost ? [[`P&P bond (${(result.bond.rate * 100).toFixed(2)}% of sell)`, result.bond.cost, '#8b949e']] : []),
                ].map(([label, value, color]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.84rem' }}>
                    <span style={{ color: '#8b949e' }}>{label}</span>
                    <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{usd(value)}</span>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.8rem 0 0.2rem', marginTop: '0.4rem', borderTop: '2px solid rgba(52,211,153,0.3)' }}>
                  <span style={{ color: '#34d399', fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Base bid</span>
                  <span style={{ color: '#34d399', fontWeight: 900, fontSize: '1.5rem', fontVariantNumeric: 'tabular-nums' }} data-testid="base-bid">
                    {usd(result.base.sell)}
                  </span>
                </div>
              </Panel>
            </div>

            {/* GPM + cost codes */}
            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <Panel pad="1.2rem 1.3rem">
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projected GPM</div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: gpmTone, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }} data-testid="gpm">
                  {pct1(result.base.gpm)}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#5c6370', marginTop: 4, lineHeight: 1.5 }}>
                  markup ÷ sell. Target {result.base.sell > 1_000_000 ? '25' : result.base.sell > 250_000 ? '27' : '30'}%
                  for a bid this size.
                </div>
              </Panel>

              <Panel>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <TH align="left">Cost code</TH>
                      <TH>Cost</TH>
                      <TH>Total</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {result.costCodes.map((c) => (
                      <tr key={c.code} data-testid={`code-${c.code}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <TD align="left" color="#8b949e">
                          <span style={{ color: '#e6edf3', fontWeight: 700 }}>{c.code}</span> {c.label}
                        </TD>
                        <TD>{usd(c.cost)}</TD>
                        <TD color="#34d399" weight={700}>{usd(c.sell)}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>
          </div>
        </Section>

        {systems.length === 0 && frames.length > 0 && (
          <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'rgba(52,211,153,0.05)', border: '1px dashed rgba(52,211,153,0.2)', borderRadius: 12, fontSize: '0.78rem', color: '#8b949e' }}>
            This bid is entirely Studio frames — their metal and glass carry no vendor price yet, so
            the material side will stay flagged until quotes land against the RFQ.
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewBidPage;
