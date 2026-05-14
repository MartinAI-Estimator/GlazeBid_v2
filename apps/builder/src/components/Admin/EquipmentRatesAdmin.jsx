import React, { useState } from 'react';
import useEquipmentRatesStore from '../../store/useEquipmentRatesStore';

const CATEGORY_COLORS = {
  'Electric Scissor Lifts':       { accent: '#38bdf8', bg: 'rgba(56,189,248,0.06)'  },
  'Boom Lifts':                   { accent: '#a78bfa', bg: 'rgba(167,139,250,0.06)' },
  'Telehandlers (Forklift & Lull)': { accent: '#fbbf24', bg: 'rgba(251,191,36,0.06)'  },
  'Manipulators':                 { accent: '#34d399', bg: 'rgba(52,211,153,0.06)'  },
  'Crane':                        { accent: '#f87171', bg: 'rgba(248,113,113,0.06)' },
  'Swing Stage':                  { accent: '#fb923c', bg: 'rgba(251,146,60,0.06)'  },
};

const fmtCurrency = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const RateInput = ({ value, onChange }) => (
  <input
    type="number"
    min="0"
    step="1"
    value={value ?? ''}
    placeholder="—"
    onChange={e => onChange(e.target.value)}
    style={{
      width: 80,
      padding: '3px 6px',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 4,
      color: 'var(--text-primary)',
      fontSize: '0.78rem',
      textAlign: 'right',
      fontVariantNumeric: 'tabular-nums',
      outline: 'none',
    }}
  />
);

export default function EquipmentRatesAdmin() {
  const { getGrouped, updateRate, updateName, resetToDefaults } = useEquipmentRatesStore();
  const groups = getGrouped();
  const [confirmReset, setConfirmReset] = useState(false);

  const th = (label, align = 'right') => ({
    padding: '0.35rem 0.6rem',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '0.66rem',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    textAlign: align,
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ padding: '1.5rem 2rem', overflowY: 'auto', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>🏗️ Equipment Rental Rates</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Seeded from Warren Bid Sheet — updated 11/1/25. Edit any rate; changes save automatically.
          </p>
        </div>
        {confirmReset ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#f87171' }}>Reset all to defaults?</span>
            <button
              onClick={() => { resetToDefaults(); setConfirmReset(false); }}
              style={{ padding: '4px 10px', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 4, color: '#f87171', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >Yes, reset</button>
            <button
              onClick={() => setConfirmReset(false)}
              style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}
            >Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 5, color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}
          >↺ Reset to Defaults</button>
        )}
      </div>

      {groups.map(({ category, items }) => {
        const { accent, bg } = CATEGORY_COLORS[category] || { accent: '#8b949e', bg: 'rgba(139,148,158,0.05)' };
        return (
          <div key={category} style={{ marginBottom: '1.25rem', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
            {/* Category header */}
            <div style={{ padding: '0.45rem 0.75rem', background: bg, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent }}>{category}</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ ...th('left'), width: '100%', textAlign: 'left' }}>Item</th>
                  <th style={th()}>Week Rate</th>
                  <th style={th()}>Month Rate</th>
                  <th style={th()}>P/D Rate</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isTransport = item.pdRate != null;
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: idx < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        background: isTransport ? 'rgba(251,191,36,0.04)' : idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.35rem 0.6rem', color: isTransport ? '#fbbf24' : 'var(--text-primary)' }}>
                        {item.name}
                      </td>
                      <td style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>
                        {isTransport
                          ? <span style={{ fontSize: '0.68rem', color: '#fbbf24', fontStyle: 'italic' }}>incl. w/ P/D</span>
                          : <RateInput value={item.weekRate} onChange={v => updateRate(item.id, 'weekRate', v)} />
                        }
                      </td>
                      <td style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>
                        {isTransport
                          ? <span style={{ fontSize: '0.68rem', color: '#fbbf24', fontStyle: 'italic' }}>incl. w/ P/D</span>
                          : <RateInput value={item.monthRate} onChange={v => updateRate(item.id, 'monthRate', v)} />
                        }
                      </td>
                      <td style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>
                        {isTransport
                          ? <RateInput value={item.pdRate} onChange={v => updateRate(item.id, 'pdRate', v)} />
                          : <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
        Rates sourced from Warren Rental — updated 11/1/25. Transportation P/D rate applies once per mobilization (both pickup and drop-off included).
      </p>
    </div>
  );
}
