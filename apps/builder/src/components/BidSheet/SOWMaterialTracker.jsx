import React, { useState, useMemo, useCallback } from 'react';
import AccountingInput from './AccountingInput';

// ─── Cost Code Taxonomy — mirrors Excel SOW Material Tracker ─────────────────
export const COST_CODES = [
  { code: '02-METL', label: '02-Metal',                  icon: '🔩', group: 'material' },
  { code: '02-GLSS', label: '02-Glass',                  icon: '🪟', group: 'material' },
  { code: '02-DOOR', label: '02-Doors',                  icon: '🚪', group: 'material' },
  { code: '02-HDWR', label: '02-Hardware',               icon: '🔑', group: 'material' },
  { code: '02-CAUL', label: '02-Caulking',               icon: '🪣', group: 'material' },
  { code: '02-MIRR', label: '02-Mirrors',                icon: '🪞', group: 'material' },
  { code: '03-EQUP', label: '03-Equipment',              icon: '🏗️', group: 'material' },
  { code: '06-SHOP', label: '06-Shop Drawings / Bonds',  icon: '📐', group: 'material' },
  { code: '07-TRAV', label: '07-Travel / Per Diem',      icon: '✈️', group: 'material' },
  { code: '05-SUPP', label: '05-Supplies',               icon: '📦', group: 'auto'     }, // auto-computed
  { code: '08-CONT', label: '08-Contingency',            icon: '⚠️', group: 'auto'     }, // auto-computed
];

// Breakout categories — mirrors Excel SOW Breakout 1 column
export const BREAKOUT_OPTIONS = [
  'Exterior Storefront',
  'Interior Storefront',
  'Curtain Wall',
  'Glazing Only',
  'Fire Rated Storefront',
  'Window Wall',
  'Hollow Metal Glazing',
  'Miscellaneous',
];

// Alternate options — mirrors Excel SOW Alternate column
export const ALTERNATE_OPTIONS = [
  '',  // base scope
  'Alternate 1',
  'Alternate 2',
  'Alternate 3',
  'Alternate 4',
  'Alternate 5',
  'Alternate 6',
  'Alternate 7',
  'Alternate 8',
  'Alternate 9',
  'Alternate 10',
];

const SUPPLIES_PCT    = 0.5;   // 0.5% of section base cost — matches Excel
const CONTINGENCY_PCT = 1.25;  // 1.25% of section base cost — matches Excel

const fmt = (n) =>
  (typeof n === 'number' ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const inputBase = {
  padding: '0.4rem 0.6rem',
  borderRadius: 5,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-deep)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  outline: 'none',
  boxSizing: 'border-box',
};

// ─── Generate auto Supplies + Contingency lines for a breakout+alternate group ─
function generateAutoLines(baseLines) {
  const baseCost = baseLines.reduce((s, l) => s + (Number(l.cost) || 0), 0);
  if (baseCost <= 0) return [];

  const suppliesCost     = baseCost * (SUPPLIES_PCT    / 100);
  const contingencyCost  = baseCost * (CONTINGENCY_PCT / 100);
  const sample           = baseLines[0];

  return [
    {
      id:        `auto-supp-${sample?.breakout || 'x'}-${sample?.alternate || 'base'}`,
      costCode:  '05-SUPP',
      desc1:     "Addt'l Supplies",
      desc2:     '',
      desc3:     '',
      notes:     `${SUPPLIES_PCT}%`,
      breakout:  sample?.breakout  || '',
      alternate: sample?.alternate || '',
      cost:      suppliesCost,
      isAuto:    true,
    },
    {
      id:        `auto-cont-${sample?.breakout || 'x'}-${sample?.alternate || 'base'}`,
      costCode:  '08-CONT',
      desc1:     'Contingency',
      desc2:     '',
      desc3:     '',
      notes:     `${CONTINGENCY_PCT}%`,
      breakout:  sample?.breakout  || '',
      alternate: sample?.alternate || '',
      cost:      contingencyCost,
      isAuto:    true,
    },
  ];
}

// ─── SOW Material Tracker ────────────────────────────────────────────────────
export default function SOWMaterialTracker({
  lines       = [],
  onChange,           // (lines) => void  — called on every mutation
  markupPct   = 40,
  taxPct      = 8.2,
  isTaxExempt = false,
  readOnly    = false,
}) {
  const [collapsed, setCollapsed] = useState({}); // breakout → bool

  // ── Manual lines only (auto lines are derived, never stored) ────────────────
  const manualLines = useMemo(
    () => lines.filter(l => !l.isAuto),
    [lines]
  );

  // ── Derive all lines: manual + injected auto Supplies/Contingency ───────────
  const allLines = useMemo(() => {
    // Group manual lines by breakout+alternate key
    const groups = {};
    manualLines.forEach(l => {
      const key = `${l.breakout || ''}::${l.alternate || ''}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    });

    // For each group inject auto lines after the manual ones
    const result = [];
    Object.values(groups).forEach(group => {
      result.push(...group);
      result.push(...generateAutoLines(group));
    });
    return result;
  }, [manualLines]);

  // ── Subtotal: base scope only (no alternates) ───────────────────────────────
  const baseSubtotal = useMemo(
    () => allLines
      .filter(l => !l.alternate)
      .reduce((s, l) => s + (Number(l.cost) || 0), 0),
    [allLines]
  );

  const taxAmount    = isTaxExempt ? 0 : baseSubtotal * (taxPct    / 100);
  const markupAmount = baseSubtotal * (markupPct / 100);
  const totalBid     = baseSubtotal + taxAmount + markupAmount;

  // ── Cost-code summary ───────────────────────────────────────────────────────
  const costCodeSummary = useMemo(() => {
    const map = {};
    allLines.forEach(l => {
      if (l.alternate) return; // base scope only
      const cc = l.costCode || '02-METL';
      map[cc] = (map[cc] || 0) + (Number(l.cost) || 0);
    });
    return map;
  }, [allLines]);

  // ── Mutation helpers ────────────────────────────────────────────────────────
  const addLine = useCallback((breakout = '', alternate = '') => {
    const newLine = {
      id:        `ml-${Date.now()}`,
      costCode:  '02-METL',
      desc1:     '',
      desc2:     '',
      desc3:     '',
      notes:     '',
      breakout,
      alternate,
      cost:      0,
      isAuto:    false,
    };
    onChange?.([...manualLines, newLine]);
  }, [manualLines, onChange]);

  const updateLine = useCallback((id, field, value) => {
    onChange?.(
      manualLines.map(l =>
        l.id === id
          ? { ...l, [field]: field === 'cost' ? parseFloat(value) || 0 : value }
          : l
      )
    );
  }, [manualLines, onChange]);

  const deleteLine = useCallback((id) => {
    onChange?.(manualLines.filter(l => l.id !== id));
  }, [manualLines, onChange]);

  // ── Group allLines by breakout for rendering ────────────────────────────────
  const breakoutGroups = useMemo(() => {
    const map = {};
    allLines.forEach(l => {
      const key = l.breakout || '(No Breakout)';
      if (!map[key]) map[key] = { base: [], alternates: {} };
      if (!l.alternate) {
        map[key].base.push(l);
      } else {
        if (!map[key].alternates[l.alternate]) map[key].alternates[l.alternate] = [];
        map[key].alternates[l.alternate].push(l);
      }
    });
    return map;
  }, [allLines]);

  // ── Render a single line row ────────────────────────────────────────────────
  const renderLine = (line) => {
    const cc = COST_CODES.find(c => c.code === line.costCode);
    const isAuto = line.isAuto;

    return (
      <tr
        key={line.id}
        style={{
          background: isAuto
            ? 'rgba(245,158,11,0.04)'
            : 'transparent',
          borderBottom: '1px solid var(--border-subtle)',
          opacity: isAuto ? 0.85 : 1,
        }}
      >
        {/* Cost Code */}
        <td style={{ padding: '0.45rem 0.75rem', whiteSpace: 'nowrap' }}>
          {isAuto ? (
            <span style={{
              fontSize: '0.72rem', fontWeight: 700,
              color: '#f59e0b', fontFamily: 'monospace',
            }}>
              {cc?.icon} {line.costCode}
            </span>
          ) : (
            <select
              value={line.costCode}
              onChange={e => updateLine(line.id, 'costCode', e.target.value)}
              disabled={readOnly}
              style={{
                ...inputBase,
                width: 160,
                background: 'var(--bg-panel)',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
              }}
            >
              {COST_CODES.filter(c => c.group === 'material').map(c => (
                <option key={c.code} value={c.code}>
                  {c.icon} {c.code} — {c.label.replace(/^\d{2}-/, '')}
                </option>
              ))}
            </select>
          )}
        </td>

        {/* Desc 1 */}
        <td style={{ padding: '0.45rem 0.5rem' }}>
          {isAuto ? (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              {line.desc1}
            </span>
          ) : (
            <input
              type="text"
              value={line.desc1}
              onChange={e => updateLine(line.id, 'desc1', e.target.value)}
              placeholder="Description 1"
              disabled={readOnly}
              style={{ ...inputBase, width: '100%' }}
            />
          )}
        </td>

        {/* Desc 2 */}
        <td style={{ padding: '0.45rem 0.5rem' }}>
          {isAuto ? null : (
            <input
              type="text"
              value={line.desc2 || ''}
              onChange={e => updateLine(line.id, 'desc2', e.target.value)}
              placeholder="Description 2"
              disabled={readOnly}
              style={{ ...inputBase, width: '100%' }}
            />
          )}
        </td>

        {/* Notes */}
        <td style={{ padding: '0.45rem 0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: isAuto ? 'italic' : 'normal' }}>
            {line.notes}
          </span>
        </td>

        {/* Alternate */}
        <td style={{ padding: '0.45rem 0.5rem' }}>
          {isAuto ? null : (
            <select
              value={line.alternate || ''}
              onChange={e => updateLine(line.id, 'alternate', e.target.value)}
              disabled={readOnly}
              style={{ ...inputBase, width: 110, fontSize: '0.75rem' }}
            >
              {ALTERNATE_OPTIONS.map(a => (
                <option key={a} value={a}>{a || 'Base Scope'}</option>
              ))}
            </select>
          )}
        </td>

        {/* Cost */}
        <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right' }}>
          {isAuto ? (
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
              ${fmt(line.cost)}
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>$</span>
              <AccountingInput
                value={line.cost || 0}
                onChange={val => updateLine(line.id, 'cost', val)}
                style={{
                  ...inputBase,
                  width: 110,
                  textAlign: 'right',
                  color: '#34d399',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
          )}
        </td>

        {/* Tax */}
        <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {!isTaxExempt && !line.alternate
            ? `$${fmt((Number(line.cost) || 0) * taxPct / 100)}`
            : '—'}
        </td>

        {/* Markup */}
        <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {!line.alternate
            ? `$${fmt((Number(line.cost) || 0) * markupPct / 100)}`
            : '—'}
        </td>

        {/* Total */}
        <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right' }}>
          {!line.alternate ? (
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              ${fmt(
                (Number(line.cost) || 0) +
                (isTaxExempt ? 0 : (Number(line.cost) || 0) * taxPct / 100) +
                (Number(line.cost) || 0) * markupPct / 100
              )}
            </span>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', fontVariantNumeric: 'tabular-nums' }}>
              ${fmt(Number(line.cost) || 0)}
            </span>
          )}
        </td>

        {/* Delete */}
        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
          {!isAuto && !readOnly && (
            <button
              onClick={() => deleteLine(line.id)}
              style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1rem', cursor: 'pointer', opacity: 0.6, lineHeight: 1, padding: '2px 4px' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
            >
              ✕
            </button>
          )}
        </td>
      </tr>
    );
  };

  // ── Render a breakout section ───────────────────────────────────────────────
  const renderBreakoutSection = (breakoutName, groupData) => {
    const isCollapsed = collapsed[breakoutName];
    const baseCost    = groupData.base.reduce((s, l) => s + (Number(l.cost) || 0), 0);
    const hasAlts     = Object.keys(groupData.alternates).length > 0;

    return (
      <div key={breakoutName} style={{ marginBottom: '1.5rem' }}>
        {/* Breakout header */}
        <div
          onClick={() => setCollapsed(c => ({ ...c, [breakoutName]: !c[breakoutName] }))}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.6rem 1rem',
            background: 'rgba(96,165,250,0.08)',
            border: '1px solid rgba(96,165,250,0.2)',
            borderRadius: isCollapsed ? 8 : '8px 8px 0 0',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', transition: 'transform 0.15s', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{breakoutName}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              {groupData.base.filter(l => !l.isAuto).length} item{groupData.base.filter(l => !l.isAuto).length !== 1 ? 's' : ''}
              {hasAlts && ` + ${Object.keys(groupData.alternates).length} alt${Object.keys(groupData.alternates).length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Base Cost:</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>
              ${fmt(baseCost)}
            </span>
          </div>
        </div>

        {!isCollapsed && (
          <div style={{ border: '1px solid rgba(96,165,250,0.2)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-panel)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', width: 170 }}>Cost Code</th>
                  <th style={{ padding: '0.5rem 0.5rem', textAlign: 'left' }}>Description 1</th>
                  <th style={{ padding: '0.5rem 0.5rem', textAlign: 'left' }}>Description 2</th>
                  <th style={{ padding: '0.5rem 0.5rem', textAlign: 'left', width: 80 }}>Notes</th>
                  <th style={{ padding: '0.5rem 0.5rem', textAlign: 'left', width: 120 }}>Alternate</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', width: 130 }}>Cost</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', width: 80 }}>Tax</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', width: 80 }}>Markup</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', width: 110 }}>Total</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {/* Base scope lines */}
                {groupData.base.map(renderLine)}

                {/* Alternate sections */}
                {Object.entries(groupData.alternates).map(([altName, altLines]) => (
                  <React.Fragment key={altName}>
                    <tr>
                      <td colSpan={10} style={{ padding: '0.35rem 0.75rem', background: 'rgba(167,139,250,0.08)', borderTop: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          ⟐ {altName}
                        </span>
                      </td>
                    </tr>
                    {altLines.map(renderLine)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {/* Add line button */}
            {!readOnly && (
              <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-panel)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => addLine(breakoutName === '(No Breakout)' ? '' : breakoutName, '')}
                  style={{ padding: '0.35rem 0.85rem', background: 'transparent', border: '1px dashed var(--accent-blue)', borderRadius: 5, color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  + Add Line
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────────
  const hasLines = manualLines.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <div style={{
        padding: '0.75rem 1.5rem',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            📋 Material Tracker
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
            {manualLines.length} item{manualLines.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Add new breakout section */}
        {!readOnly && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              id="new-breakout-select"
              defaultValue=""
              style={{ ...inputBase, width: 200, background: 'var(--bg-card)', fontSize: '0.8rem' }}
            >
              <option value="" disabled>Add breakout section…</option>
              {BREAKOUT_OPTIONS.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value="__custom__">+ Custom…</option>
            </select>
            <button
              onClick={() => {
                const sel = document.getElementById('new-breakout-select');
                const val = sel?.value;
                if (!val || val === '__custom__') {
                  const custom = window.prompt('Enter breakout name:');
                  if (custom?.trim()) addLine(custom.trim(), '');
                } else if (val) {
                  addLine(val, '');
                  sel.value = '';
                }
              }}
              style={{ padding: '0.4rem 0.9rem', background: 'var(--accent-blue)', border: 'none', borderRadius: 5, color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
            >
              + Add
            </button>
            <button
              onClick={() => addLine('', '')}
              style={{ padding: '0.4rem 0.9rem', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 5, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
            >
              + Quick Add
            </button>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        {!hasLines ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--text-secondary)' }}>
            <span style={{ fontSize: '2.5rem' }}>📋</span>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>No material lines yet</p>
            <p style={{ margin: 0, fontSize: '0.82rem', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
              Add a breakout section (e.g. Exterior Storefront) then add cost-coded line items.
              Supplies (0.5%) and Contingency (1.25%) are auto-calculated per section.
            </p>
            {!readOnly && (
              <button
                onClick={() => addLine('Exterior Storefront', '')}
                style={{ marginTop: '0.5rem', padding: '0.6rem 1.4rem', background: 'var(--accent-blue)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                + Add First Line
              </button>
            )}
          </div>
        ) : (
          Object.entries(breakoutGroups).map(([name, data]) =>
            renderBreakoutSection(name, data)
          )
        )}
      </div>

      {/* ── Summary Footer ── */}
      {hasLines && (
        <div style={{
          flexShrink: 0,
          background: 'var(--bg-panel)',
          borderTop: '2px solid var(--border-subtle)',
          padding: '1rem 1.5rem',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
        }}>

          {/* Left: cost code breakdown */}
          <div>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
              Cost Code Summary (Base Scope)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {COST_CODES.map(cc => {
                const val = costCodeSummary[cc.code] || 0;
                if (val === 0) return null;
                return (
                  <div key={cc.code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {cc.icon} {cc.code}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      ${fmt(val)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: totals box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', justifyContent: 'center' }}>
            {[
              { label: 'Base Cost',                                                   value: baseSubtotal,  color: 'var(--text-primary)' },
              { label: `Tax (${isTaxExempt ? 'exempt' : taxPct + '% on materials'})`, value: taxAmount,     color: 'var(--text-secondary)' },
              { label: `Markup (${markupPct}%)`,                                      value: markupAmount,  color: 'var(--text-secondary)' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: row.color }}>
                <span>{row.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>${fmt(row.value)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total (Base Scope)</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                ${fmt(totalBid)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
