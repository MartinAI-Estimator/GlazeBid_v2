/**
 * AdminSettingsPanel.jsx
 * Multi-tab admin settings panel. Tabs:
 *   1. Financial Defaults  — laborRate, tax, markup, contingency, GPM tiers
 *   2. System Defaults     — suppliesPct, contingencyPct, glass surcharge/breakage
 *   3. Labor MH Defaults   — HF / IR rates for SF & CW (LaborDefaultsTab)
 *   4. Material Groups     — categories for MaterialDrawer (MaterialCategoriesTab)
 */
import React, { useState, useEffect } from 'react';
import { useProject } from '../../context/ProjectContext';
import LaborDefaultsTab from '../Settings/LaborDefaultsTab';
import MaterialCategoriesTab from '../Settings/MaterialCategoriesTab';
import useProductionRatesStore from '../../store/useProductionRatesStore';
import FormulaReferenceTab from './FormulaReferenceTab';

// ─── shared style helpers ────────────────────────────────────────────────────

const inp = {
  padding: '5px 9px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid #30363d',
  borderRadius: 5,
  color: '#e6edf3',
  fontSize: '0.85rem',
  textAlign: 'right',
  outline: 'none',
  fontVariantNumeric: 'tabular-nums',
};

const labelRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.45rem 0',
  borderBottom: '1px solid rgba(48,54,61,0.45)',
};

const fieldLabel = { fontSize: '0.83rem', color: '#c9d1d9' };
const fieldNote  = { fontSize: '0.72rem', color: '#8b949e', marginTop: 2 };

function FieldRow({ label, note, children }) {
  return (
    <div style={{ ...labelRowStyle, gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={fieldLabel}>{label}</div>
        {note && <div style={fieldNote}>{note}</div>}
      </div>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, width = 90, step = 0.5, min = 0 }) {
  return (
    <input
      type="number"
      min={min}
      step={step}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{ ...inp, width }}
    />
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.72rem', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
        {title}
      </h3>
      <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid #21262d', borderRadius: 7, padding: '0.25rem 1rem' }}>
        {children}
      </div>
    </div>
  );
}

// ─── GPM Tiers mini-table ─────────────────────────────────────────────────────

function GpmTiers({ tiers, onChange }) {
  const update = (id, field, raw) => {
    const val = raw === '' ? null : Number(raw);
    onChange(tiers.map(t => t.id === id ? { ...t, [field]: val } : t));
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', width: '100%' }}>
        <thead>
          <tr>
            {['Label', 'Up To ($)', 'Target GPM (%)'].map(h => (
              <th key={h} style={{ padding: '0.3rem 0.5rem', color: '#8b949e', fontWeight: 700, fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #21262d', textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(tiers || []).map((t, i) => (
            <tr key={t.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <td style={{ padding: '0.3rem 0.5rem', borderBottom: '1px solid rgba(48,54,61,0.4)' }}>
                <input
                  type="text"
                  value={t.label}
                  onChange={e => update(t.id, 'label', e.target.value)}
                  style={{ ...inp, width: 120, textAlign: 'left' }}
                />
              </td>
              <td style={{ padding: '0.3rem 0.5rem', borderBottom: '1px solid rgba(48,54,61,0.4)' }}>
                <input
                  type="number"
                  min="0"
                  step="50000"
                  placeholder="No limit"
                  value={t.upTo ?? ''}
                  onChange={e => update(t.id, 'upTo', e.target.value)}
                  style={{ ...inp, width: 120 }}
                />
              </td>
              <td style={{ padding: '0.3rem 0.5rem', borderBottom: '1px solid rgba(48,54,61,0.4)' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={t.gpm ?? ''}
                  onChange={e => update(t.id, 'gpm', Number(e.target.value))}
                  style={{ ...inp, width: 80 }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => onChange([...(tiers || []), { id: `tier_${Date.now()}`, label: 'New Tier', upTo: null, gpm: 25 }])}
          style={{ padding: '4px 12px', fontSize: '0.74rem', background: 'rgba(56,139,253,0.1)', border: '1px solid #388bfd', borderRadius: 4, color: '#58a6ff', cursor: 'pointer' }}
        >+ Add Tier</button>
        {(tiers || []).length > 1 && (
          <button
            onClick={() => onChange((tiers || []).slice(0, -1))}
            style={{ padding: '4px 12px', fontSize: '0.74rem', background: 'rgba(248,81,73,0.08)', border: '1px solid #f85149', borderRadius: 4, color: '#f85149', cursor: 'pointer' }}
          >Remove Last</button>
        )}
      </div>
    </div>
  );
}

// ─── Financial Defaults Tab ───────────────────────────────────────────────────

function FinancialDefaultsTab({ adminSettings, setAdminSettings }) {
  const fd = adminSettings?.financialDefaults ?? {};
  const setLaborRate = useProductionRatesStore(s => s.setLaborRate);
  const [saved, setSaved] = useState(false);

  const [draft, setDraft] = useState({
    laborRate:      fd.laborRate      ?? 45,
    taxRate:        fd.taxRate        ?? 8.2,
    markupPct:      fd.markupPct      ?? 30,
    contingencyPct: fd.contingencyPct ?? 10,
    gpmTiers: fd.gpmTiers ?? [
      { id: 'tier_sm', label: 'Small Job', upTo: 250000,  gpm: 30 },
      { id: 'tier_md', label: 'Mid Job',   upTo: 1000000, gpm: 27 },
      { id: 'tier_lg', label: 'Large Job', upTo: null,    gpm: 25 },
    ],
  });

  const set = (key, raw) => {
    const val = raw === '' ? 0 : Number(raw) || 0;
    setDraft(p => ({ ...p, [key]: val }));
    setSaved(false);
  };

  const save = () => {
    setAdminSettings(prev => ({ ...prev, financialDefaults: { ...draft } }));
    // Keep useProductionRatesStore.laborRate in sync so laborMap in GlazeBidWorkspace
    // picks up the admin rate as immediate fallback for new bids.
    setLaborRate(draft.laborRate);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 640 }}>
      <p style={{ margin: '0 0 1.25rem', fontSize: '0.78rem', color: '#8b949e' }}>
        These defaults seed new bid projects. They can be overridden per-project in Project Settings.
      </p>

      <Section title="Labor">
        <FieldRow label="Burdened Labor Rate ($/hr)" note="Fully-loaded hourly rate including wages, taxes, benefits">
          <NumberInput value={draft.laborRate} onChange={v => set('laborRate', v)} width={90} step={0.5} />
        </FieldRow>
        <FieldRow label="Labor Contingency (%)" note="Buffer added to total MH estimate for unforeseen conditions">
          <NumberInput value={draft.contingencyPct} onChange={v => set('contingencyPct', v)} width={80} step={0.5} />
        </FieldRow>
      </Section>

      <Section title="Pricing">
        <FieldRow label="Default Markup / Margin (%)" note="Overhead & profit applied to hard cost">
          <NumberInput value={draft.markupPct} onChange={v => set('markupPct', v)} width={80} step={0.5} />
        </FieldRow>
        <FieldRow label="Material Tax Rate (%)" note="Sales tax on materials only — varies by jurisdiction">
          <NumberInput value={draft.taxRate} onChange={v => set('taxRate', v)} width={80} step={0.1} />
        </FieldRow>
      </Section>

      <Section title="GPM Tiers (auto-GPM by job size)">
        <div style={{ paddingBottom: '0.5rem' }}>
          <p style={{ margin: '0.5rem 0 0.75rem', fontSize: '0.75rem', color: '#8b949e' }}>
            Auto-GPM selects the tier based on total hard cost. Leave "Up To" blank for the final open-ended tier.
          </p>
          <GpmTiers tiers={draft.gpmTiers} onChange={tiers => { setDraft(p => ({ ...p, gpmTiers: tiers })); setSaved(false); }} />
        </div>
      </Section>

      <button
        onClick={save}
        style={{ padding: '8px 24px', background: saved ? '#1a7f37' : '#238636', border: 'none', borderRadius: 6, color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', marginTop: 4 }}
      >
        {saved ? '✓ Saved' : 'Save Financial Defaults'}
      </button>
    </div>
  );
}

// ─── System Card Defaults Tab ─────────────────────────────────────────────────

function SystemDefaultsTab({ adminSettings, setAdminSettings }) {
  const [draft, setDraft] = useState({
    suppliesPct:    adminSettings?.suppliesPct    ?? 0.5,
    contingencyPct: adminSettings?.contingencyPct ?? 1.25,
  });
  const [saved, setSaved] = useState(false);

  const set = (key, raw) => {
    const val = raw === '' ? 0 : Number(raw) || 0;
    setDraft(p => ({ ...p, [key]: val }));
    setSaved(false);
  };

  const save = () => {
    setAdminSettings(prev => ({ ...prev, ...draft }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 640 }}>
      <p style={{ margin: '0 0 1.25rem', fontSize: '0.78rem', color: '#8b949e' }}>
        Percentages applied automatically to system card material cost calculations.
      </p>

      <Section title="Materials — Auto Lines (SOW)">
        <FieldRow label="Supplies (%)" note="Auto-computed supplies line per material breakout section">
          <NumberInput value={draft.suppliesPct} onChange={v => set('suppliesPct', v)} width={80} step={0.25} />
        </FieldRow>
        <FieldRow label="Material Contingency (%)" note="Auto-computed contingency line per breakout section">
          <NumberInput value={draft.contingencyPct} onChange={v => set('contingencyPct', v)} width={80} step={0.25} />
        </FieldRow>
      </Section>

      <button
        onClick={save}
        style={{ padding: '8px 24px', background: saved ? '#1a7f37' : '#238636', border: 'none', borderRadius: 6, color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', marginTop: 4 }}
      >
        {saved ? '✓ Saved' : 'Save System Defaults'}
      </button>
    </div>
  );
}

// ─── AI Settings Tab ─────────────────────────────────────────────────────────
function AiSettingsTab() {
  const [keyInput, setKeyInput]   = useState('');
  const [hasKey, setHasKey]       = useState(false);
  const [status, setStatus]       = useState(null); // 'saved' | 'cleared' | 'error'
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    window.electronAPI?.aiKeyCheck?.().then(r => setHasKey(!!r?.hasKey));
  }, []);

  function flash(type, msg) {
    setStatus(type);
    setStatusMsg(msg);
    setTimeout(() => setStatus(null), 3000);
  }

  async function handleSave() {
    const key = keyInput.trim();
    if (!key.startsWith('sk-ant-')) {
      flash('error', 'Key should start with sk-ant-…');
      return;
    }
    const r = await window.electronAPI?.aiKeySave?.(key);
    if (r?.ok) { setHasKey(true); setKeyInput(''); flash('saved', 'API key saved and encrypted.'); }
    else flash('error', r?.error || 'Could not save key');
  }

  async function handleClear() {
    await window.electronAPI?.aiKeyClear?.();
    setHasKey(false);
    flash('cleared', 'API key removed.');
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 560 }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e6edf3', marginBottom: 6 }}>
        🤖 Anthropic API Key
      </h3>
      <p style={{ fontSize: '0.78rem', color: '#8b949e', marginBottom: 20, lineHeight: 1.55 }}>
        Powers the <strong style={{ color: '#c9d1d9' }}>Spec Chat</strong> feature in the Spec Sorter.
        Uses <code style={{ background: '#161b22', padding: '1px 5px', borderRadius: 3, fontSize: '0.75rem', color: '#79c0ff' }}>claude-haiku-3-5</code> (~$0.09 per session).
        Your key is encrypted at rest using your OS keychain — it never leaves your machine.
      </p>

      {/* Current status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 6, marginBottom: 20,
        background: hasKey ? 'rgba(63,185,80,0.08)' : 'rgba(139,148,158,0.08)',
        border: `1px solid ${hasKey ? '#3fb95030' : '#30363d'}`,
      }}>
        <span style={{ fontSize: '1rem' }}>{hasKey ? '🔐' : '🔓'}</span>
        <span style={{ fontSize: '0.8rem', color: hasKey ? '#3fb950' : '#8b949e' }}>
          {hasKey ? 'API key is stored and encrypted.' : 'No API key stored yet.'}
        </span>
        {hasKey && (
          <button
            onClick={handleClear}
            style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#f85149', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
          >
            Remove key
          </button>
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: '0.78rem', color: '#8b949e' }}>
          {hasKey ? 'Replace key:' : 'Enter your Anthropic API key:'}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="sk-ant-api03-…"
            style={{
              flex: 1, padding: '7px 10px', fontSize: '0.82rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid #30363d',
              borderRadius: 6, color: '#e6edf3', outline: 'none', fontFamily: 'monospace',
            }}
          />
          <button
            onClick={handleSave}
            disabled={!keyInput.trim()}
            style={{
              padding: '7px 18px', fontSize: '0.8rem', fontWeight: 700,
              background: keyInput.trim() ? '#238636' : '#21262d',
              border: 'none', borderRadius: 6, color: '#fff',
              cursor: keyInput.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Save
          </button>
        </div>
        <p style={{ fontSize: '0.72rem', color: '#484f58', margin: 0 }}>
          Get a key at <span style={{ color: '#388bfd' }}>console.anthropic.com</span>. Haiku costs ~$0.80/M input tokens.
        </p>
      </div>

      {/* Flash message */}
      {status && (
        <div style={{
          marginTop: 14, padding: '8px 12px', borderRadius: 6, fontSize: '0.78rem',
          background: status === 'saved' ? 'rgba(63,185,80,0.1)' : status === 'error' ? 'rgba(248,81,73,0.1)' : 'rgba(139,148,158,0.1)',
          color:      status === 'saved' ? '#3fb950'            : status === 'error' ? '#f85149'             : '#8b949e',
          border: `1px solid ${status === 'saved' ? '#3fb95030' : status === 'error' ? '#f8514930' : '#30363d'}`,
        }}>
          {status === 'saved' ? '✓ ' : status === 'error' ? '⚠ ' : ''}{statusMsg}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'financial', label: '💰 Financial Defaults' },
  { key: 'system',    label: '🏗️ System Card Defaults' },
  { key: 'labor',     label: '⏱️ Labor MH Rates' },
  { key: 'materials', label: '📦 Material Groups' },
  { key: 'formula',   label: '📐 Formula Reference' },
  { key: 'ai',        label: '🤖 AI Settings' },
];

export default function AdminSettingsPanel() {
  const { adminSettings, setAdminSettings } = useProject();
  const [activeTab, setActiveTab] = useState('financial');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', color: '#e6edf3', overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #21262d', background: '#161b22', flexShrink: 0, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === t.key ? '2px solid #58a6ff' : '2px solid transparent',
              color: activeTab === t.key ? '#58a6ff' : '#8b949e',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: '0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {activeTab === 'financial' && (
          <FinancialDefaultsTab adminSettings={adminSettings} setAdminSettings={setAdminSettings} />
        )}
        {activeTab === 'system' && (
          <SystemDefaultsTab adminSettings={adminSettings} setAdminSettings={setAdminSettings} />
        )}
        {activeTab === 'labor' && (
          <LaborDefaultsTab />
        )}
        {activeTab === 'materials' && (
          <MaterialCategoriesTab />
        )}
        {activeTab === 'formula' && (
          <FormulaReferenceTab />
        )}
        {activeTab === 'ai' && (
          <AiSettingsTab />
        )}
      </div>
    </div>
  );
}

