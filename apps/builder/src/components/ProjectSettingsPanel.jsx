import React, { useState } from 'react';

/**
 * ProjectSettingsPanel
 * Dedicated full-screen settings view for project-level financial parameters.
 * Replaces the compact financials card when more control is needed.
 * Accessible via the ⚙️ icon in the project sidebar.
 */

const FIELD_GROUPS = [
  {
    title: 'Labor',
    subtitle: 'Applied to all man-hour calculations',
    color: '#60a5fa',
    fields: [
      { key: 'laborRate',        label: 'Burdened Labor Rate',     unit: '$/hr', icon: '⏱️', step: 0.5,  min: 0,  max: 200, description: 'Fully-burdened hourly rate including wages, taxes, and benefits. Applied to all Shop, Distribution, and Field MHs.' },
      { key: 'crewSize',         label: 'Field Crew Size',          unit: 'men',  icon: '👷', step: 1,    min: 1,  max: 20,  description: 'Number of field workers on site simultaneously. Used to calculate days and weeks on the Labor Days schedule.' },
      { key: 'laborContingency', label: 'Labor Contingency',        unit: '%',    icon: '🛡️', step: 0.25, min: 0,  max: 20,  description: 'Additional percentage added to total labor hours to cover unforeseen field conditions. Shown in Misc Labor section.' },
    ],
  },
  {
    title: 'Pricing',
    subtitle: 'Applied to final bid calculations',
    color: '#34d399',
    fields: [
      { key: 'markupPercent', label: 'Overhead & Profit Markup', unit: '%',   icon: '📈', step: 0.5,  min: 0,  max: 100, description: 'Applied to total cost (materials + labor) to arrive at the bid price. Does NOT apply to tax. Standard: 40%.' },
      { key: 'taxPercent',    label: 'Material Tax Rate',        unit: '%',   icon: '🏛️', step: 0.1,  min: 0,  max: 20,  description: 'Sales tax rate on materials only. Labor is not taxed. Varies by jurisdiction — confirm with your accountant. Colorado default: 8.2%.' },
    ],
  },
];

// GPM preview calculation
function calcGPM(settings) {
  // Simulate a $100k cost job to show what GPM would look like
  const cost      = 100000;
  const markup    = cost * ((settings.markupPercent ?? 40) / 100);
  const gpm       = (cost + markup) > 0 ? (markup / (cost + markup)) * 100 : 0;
  return { gpm, markup, totalBid: cost + markup + cost * ((settings.taxPercent ?? 8.2) / 100) };
}

function gpmColor(pct) {
  if (pct >= 30) return '#34d399';
  if (pct >= 25) return '#fbbf24';
  return '#f87171';
}

const fmt = n => (typeof n === 'number' ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProjectSettingsPanel({ bidSettings = {}, onBidSettingsChange, onClose }) {
  const [localSettings, setLocalSettings] = useState({ ...bidSettings });
  const [saved, setSaved] = useState(false);

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    onBidSettingsChange?.(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    const defaults = { laborRate: 42, crewSize: 2, laborContingency: 2.5, markupPercent: 40, taxPercent: 8.2 };
    setLocalSettings(defaults);
    setSaved(false);
  };

  const preview = calcGPM(localSettings);
  const hasChanges = JSON.stringify(localSettings) !== JSON.stringify(bidSettings);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
            ← Back
          </button>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ⚙️ Project Settings
          </h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
            Applied to entire bid
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={handleReset}
            style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            style={{
              padding: '7px 18px',
              background: saved ? '#10b981' : hasChanges ? 'var(--accent-blue)' : 'rgba(59,130,246,0.3)',
              border: 'none', borderRadius: 6,
              color: '#fff', fontWeight: 700, fontSize: '0.85rem',
              cursor: hasChanges ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
            }}
          >
            {saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Live GPM Preview */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: `2px solid ${gpmColor(preview.gpm)}40`, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
              Live GPM Preview
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Based on $100k cost job</span>
          </div>
          <div style={{ display: 'flex', gap: '2.5rem', flex: 1 }}>
            {[
              { label: 'Markup $',    value: `$${fmt(preview.markup)}`,  color: 'var(--text-primary)' },
              { label: 'Bid Total',   value: `$${fmt(preview.totalBid)}`, color: 'var(--text-primary)' },
              { label: 'GPM %',       value: `${preview.gpm.toFixed(1)}%`, color: gpmColor(preview.gpm) },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>{item.label}</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</span>
              </div>
            ))}
          </div>
          {/* Threshold indicator */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0.75rem 1rem', background: 'var(--bg-panel)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>Thresholds</span>
            {[
              { label: '$0–$250k',    target: 30 },
              { label: '$250k–$1M',  target: 27 },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                <span style={{ fontWeight: 700, color: preview.gpm >= row.target ? '#34d399' : '#f87171' }}>
                  {preview.gpm >= row.target ? '✓' : '✗'} {row.target}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Field groups */}
        {FIELD_GROUPS.map(group => (
          <div key={group.title} style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.5rem', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ width: 3, height: 18, background: group.color, borderRadius: 2, display: 'inline-block' }} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{group.title}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{group.subtitle}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {group.fields.map((field, i) => {
                const value = localSettings[field.key] ?? field.min;
                return (
                  <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: i < group.fields.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem' }}>{field.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{field.label}</span>
                        <span style={{ fontSize: '0.72rem', color: group.color, background: `${group.color}18`, padding: '1px 7px', borderRadius: 8, border: `1px solid ${group.color}30` }}>
                          {value} {field.unit}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {field.description}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="number"
                        value={value}
                        step={field.step}
                        min={field.min}
                        max={field.max}
                        onChange={e => handleChange(field.key, Number(e.target.value))}
                        style={{
                          width: 100,
                          padding: '0.65rem 0.85rem',
                          borderRadius: 8,
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-deep)',
                          color: group.color,
                          fontSize: '1.2rem',
                          fontWeight: 800,
                          textAlign: 'right',
                          outline: 'none',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                        onFocus={e => e.target.style.borderColor = group.color}
                        onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: 30 }}>
                        {field.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Unsaved changes warning */}
        {hasChanges && (
          <div style={{ padding: '0.75rem 1.25rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <span style={{ fontSize: '0.82rem', color: '#fbbf24', fontWeight: 600 }}>
              You have unsaved changes — click Save Changes to apply them to the bid.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
