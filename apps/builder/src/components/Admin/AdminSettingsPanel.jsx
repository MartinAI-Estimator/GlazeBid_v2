import React, { useState } from 'react';
import { useProject } from '../../context/ProjectContext';

/**
 * AdminSettingsPanel
 * Company-wide rate defaults. Written to adminSettings in ProjectContext.
 * Accessible via ⚙️ Settings in the sidebar gear icon.
 *
 * Defaults set here flow through to:
 *   - SOWMaterialTracker  (Supplies%, Contingency%)
 *   - ProjectHome         (default laborRate, markupPercent, taxPercent)
 *   - LaborOnlyWorkspace  (laborContingency, crewSize)
 *   - GPM thresholds      (displayed in BidSummaryDashboard + ProjectSettingsPanel)
 */

const DEFAULT_ADMIN_SETTINGS = {
  // Material section defaults
  suppliesPct:        0.5,
  contingencyPct:     1.25,
  // Labor defaults
  defaultLaborRate:   42,
  defaultCrewSize:    2,
  defaultLaborCont:   2.5,
  // Pricing defaults
  defaultMarkupPct:   40,
  defaultTaxPct:      8.2,
  // Glass defaults
  glassSurchargePct:  17,
  glassBreakagePct:   3,
  // GPM thresholds
  gpmThresholds: [
    { label: '$0 – $250k',   minGPM: 30 },
    { label: '$250k – $1M',  minGPM: 27 },
    { label: '$1M+',         minGPM: 25 },
  ],
};

const FIELD_GROUPS = [
  {
    title: 'Material Section Defaults',
    subtitle: 'Auto-computed per breakout section in SOW Material Tracker',
    color: '#60a5fa',
    fields: [
      { key: 'suppliesPct',    label: 'Supplies %',      unit: '%',   step: 0.1,  min: 0, max: 10,  description: 'Auto-computed supplies line per breakout section. Excel default: 0.5%.' },
      { key: 'contingencyPct', label: 'Contingency %',   unit: '%',   step: 0.25, min: 0, max: 20,  description: 'Auto-computed contingency line per breakout section. Excel default: 1.25%.' },
    ],
  },
  {
    title: 'Labor Defaults',
    subtitle: 'Pre-filled in new projects',
    color: '#a78bfa',
    fields: [
      { key: 'defaultLaborRate',  label: 'Burdened Labor Rate', unit: '$/hr', step: 0.5, min: 0,   max: 300, description: 'Fully-burdened hourly rate. Applied to all Shop, Distribution, and Field MHs.' },
      { key: 'defaultCrewSize',   label: 'Field Crew Size',      unit: 'men',  step: 1,   min: 1,   max: 20,  description: 'Number of field workers on site. Used for days/weeks scheduling.' },
      { key: 'defaultLaborCont',  label: 'Labor Contingency',    unit: '%',   step: 0.25, min: 0,  max: 20,  description: 'Additional % added to total labor hours for unforeseen field conditions.' },
    ],
  },
  {
    title: 'Pricing Defaults',
    subtitle: 'Pre-filled in new projects and BidSummaryDashboard',
    color: '#34d399',
    fields: [
      { key: 'defaultMarkupPct', label: 'O&P Markup',       unit: '%',  step: 0.5,  min: 0, max: 100, description: 'Applied to cost (materials + labor). Does NOT apply to tax.' },
      { key: 'defaultTaxPct',    label: 'Material Tax Rate', unit: '%',  step: 0.1,  min: 0, max: 20,  description: 'Sales tax on materials only. Labor is not taxed.' },
    ],
  },
  {
    title: 'Glass Defaults',
    subtitle: 'Pre-filled in Glass Pricing workspace',
    color: '#fbbf24',
    fields: [
      { key: 'glassSurchargePct', label: 'Glass Surcharge', unit: '%',  step: 0.5,  min: 0, max: 50,  description: 'Applied on top of raw glass cost. Covers handling, shipping, cutting. Excel default: 17%.' },
      { key: 'glassBreakagePct',  label: 'Glass Breakage',  unit: '%',  step: 0.5,  min: 0, max: 20,  description: 'Applied after surcharge to cover breakage allowance. Excel default: 3%.' },
    ],
  },
];

const fmt1 = (n) => (typeof n === 'number' ? n : 0).toFixed(1);

export default function AdminSettingsPanel() {
  const { adminSettings, setAdminSettings } = useProject();
  const current   = { ...DEFAULT_ADMIN_SETTINGS, ...adminSettings };
  const [local,   setLocal]   = useState(current);
  const [saved,   setSaved]   = useState(false);
  const [activeTab, setActiveTab] = useState('rates');

  const handleChange = (key, value) => {
    setLocal(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleThresholdChange = (i, field, value) => {
    setLocal(prev => ({
      ...prev,
      gpmThresholds: prev.gpmThresholds.map((t, idx) =>
        idx === i ? { ...t, [field]: field === 'minGPM' ? Number(value) : value } : t
      ),
    }));
    setSaved(false);
  };

  const handleSave = () => {
    setAdminSettings?.(local);
    // Also persist to localStorage for cross-session survival
    try {
      localStorage.setItem('glazebid:adminSettings', JSON.stringify(local));
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_ADMIN_SETTINGS });
    setSaved(false);
  };

  const hasChanges = JSON.stringify(local) !== JSON.stringify(current);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.2rem' }}>⚙️</span>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Admin Settings</h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
            Company-wide defaults
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleReset}
            style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
            Reset to Defaults
          </button>
          <button onClick={handleSave} disabled={!hasChanges}
            style={{ padding: '7px 18px', background: saved ? '#10b981' : hasChanges ? 'var(--accent-blue)' : 'rgba(59,130,246,0.3)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: hasChanges ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}>
            {saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', flexShrink: 0 }}>
        {[
          { id: 'rates',      label: '📊 Rate Defaults' },
          { id: 'thresholds', label: '🎯 GPM Thresholds' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: '0.65rem 1.25rem', background: 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent', color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', marginBottom: -1 }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 860, boxSizing: 'border-box' }}>

        {activeTab === 'rates' && FIELD_GROUPS.map(group => (
          <div key={group.title} style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ width: 3, height: 16, background: group.color, borderRadius: 2, display: 'inline-block' }} />
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{group.title}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{group.subtitle}</span>
            </div>
            {group.fields.map((field, i) => {
              const value = local[field.key] ?? field.min;
              return (
                <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: i < group.fields.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{field.label}</span>
                      <span style={{ fontSize: '0.7rem', color: group.color, background: `${group.color}18`, padding: '1px 7px', borderRadius: 8, border: `1px solid ${group.color}30`, fontVariantNumeric: 'tabular-nums' }}>
                        {value} {field.unit}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{field.description}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input type="number" value={value} step={field.step} min={field.min} max={field.max}
                      onChange={e => handleChange(field.key, Number(e.target.value))}
                      style={{ width: 88, padding: '0.6rem 0.75rem', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-deep)', color: group.color, fontSize: '1.1rem', fontWeight: 800, textAlign: 'right', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
                      onFocus={e => e.target.style.borderColor = group.color}
                      onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: 28 }}>{field.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {activeTab === 'thresholds' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              GPM thresholds define the minimum acceptable Gross Profit Margin for each project size bracket.
              These appear as green/amber/red indicators in the BidSummaryDashboard and Project Settings panel.
            </p>

            <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: '1rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
                  <span>Project Size Bracket</span>
                  <span style={{ textAlign: 'center' }}>Min GPM %</span>
                  <span style={{ textAlign: 'center' }}>Current Preview</span>
                </div>
              </div>
              {local.gpmThresholds.map((t, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: '1rem', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: i < local.gpmThresholds.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <input type="text" value={t.label}
                    onChange={e => handleThresholdChange(i, 'label', e.target.value)}
                    style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 600, outline: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                    <input type="number" value={t.minGPM} step={0.5} min={0} max={100}
                      onChange={e => handleThresholdChange(i, 'minGPM', e.target.value)}
                      style={{ width: 70, padding: '0.5rem 0.6rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-deep)', color: '#34d399', fontSize: '1rem', fontWeight: 800, textAlign: 'right', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                      <span style={{ fontSize: '0.72rem', color: '#34d399' }}>≥{fmt1(t.minGPM)}%</span>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', display: 'inline-block', marginLeft: 4 }} />
                      <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>&lt;{fmt1(t.minGPM)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add threshold row */}
            <button
              onClick={() => setLocal(prev => ({ ...prev, gpmThresholds: [...prev.gpmThresholds, { label: 'New Bracket', minGPM: 25 }] }))}
              style={{ alignSelf: 'flex-start', padding: '6px 14px', background: 'transparent', border: '1px dashed var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add Bracket
            </button>
          </div>
        )}

        {hasChanges && (
          <div style={{ padding: '0.75rem 1rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span>⚠️</span>
            <span style={{ fontSize: '0.82rem', color: '#fbbf24', fontWeight: 600 }}>
              Unsaved changes — these affect all new projects and workspaces. Click Save Changes to apply.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
