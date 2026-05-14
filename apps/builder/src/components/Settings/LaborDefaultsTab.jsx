/**
 * LaborDefaultsTab — company-wide default Hr Function / Item rates
 * for Storefront (SF) and Curtain Wall (CW).
 */

import React, { useState, useCallback } from 'react';
import useProductionRatesStore from '../../store/useProductionRatesStore.js';
import {
  CALC_COLS_SF, CALC_COLS_CW,
  EMPTY_HF_SF, EMPTY_HF_CW,
  HF_GROUPS_SF, HF_GROUPS_CW,
} from '../../utils/systemTypeConfig.js';

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ── Default sub-rate values — all blank so the estimator fills them in ────────
const DEFAULT_HF_SF = deepClone(EMPTY_HF_SF);
const DEFAULT_HF_CW = deepClone(EMPTY_HF_CW);

// ── Flat defaults → nested HF + flat IR (for the global store) ─────────────

function buildHFRates(hfDraft) {
  // hfDraft is already { fnName: { col: value } } — pass straight through
  return deepClone(hfDraft);
}

function flatToSFRates(flat, hfDraft, extraCols = []) {
  const n = (k) => Number(flat[k]) || 0;
  const extraIR = Object.fromEntries(extraCols.map(c => [c.key, n(c.key)]));
  return {
    hourlyFunctions: buildHFRates(hfDraft),
    itemRates: {
      joints:     n('joints'),
      dist:       n('dist'),
      subsills:   n('subsills'),
      caulk:      n('caulk'),
      ssg:        n('ssg'),
      steel:      n('steel'),
      vents:      n('vents'),
      brakeMetal: n('brakeMetal'),
      open:       n('open'),
      ...extraIR,
    },
  };
}

function flatToCWRates(flat, hfDraft, extraCols = []) {
  const n = (k) => Number(flat[k]) || 0;
  const extraIR = Object.fromEntries(extraCols.map(c => [c.key, n(c.key)]));
  return {
    hourlyFunctions: buildHFRates(hfDraft),
    itemRates: {
      joints:     n('joints'),
      dist:       n('dist'),
      stoolTrim:  n('stoolTrim'),
      ft:         n('ft'),
      caulk:      n('caulk'),
      ssg:        n('ssg'),
      steel:      n('steel'),
      vents:      n('vents'),
      brakeMetal: n('brakeMetal'),
      wlDl:       n('wlDl'),
      ...extraIR,
    },
  };
}

// ── Column colour coding (mirrors BidSheet palette) ──────────────────────
const COL_COLORS = {
  // SF
  joints:     '#30363d',
  dist:       '#30363d',
  subsills:   '#3d3500',   // yellow
  bays:       '#1c2d45',   // blue
  gtBays:     '#1c2d45',
  dlos:       '#2d1c45',   // purple
  gtDlos:     '#2d1c45',
  doors:      '#3d2200',   // orange  (Pairs + Singles land under 'doors' HF)
  caulk:      '#1c3d25',   // green
  ssg:        '#1c2d45',
  steel:      '#1c2d45',
  vents:      '#1c2d45',
  brakeMetal: '#1c2d45',
  open:       '#1c2d45',
  // CW extras
  stoolTrim:  '#3d3500',
  verticals:  '#1c2d45',
  horizontals:'#1c2d45',
  ft:         '#30363d',
  wlDl:       '#1c2d45',
};

const CELL_W  = 90;
const LABEL_W = 110;

const CUSTOM_BG = '#13223a'; // distinct tint for user-added columns

// ── HF Breakdown Table (Bays / DLOs / Doors groups) ──────────────────────
// BG colours matching the screenshot
const GRP_COLORS = {
  bays:  { header: '#4472c4', cell: '#dce6f1' },
  gtBays:{ header: '#4472c4', cell: '#dce6f1' },
  dlos:  { header: '#7030a0', cell: '#e9d7f5' },
  gtDlos:{ header: '#7030a0', cell: '#e9d7f5' },
  doors: { header: '#ed7d31', cell: '#fce4d6' },
};

function HFBreakdownTable({ groups, hfDraft, onChange }) {
  const cellStyle = (colKey) => ({
    textAlign: 'center', padding: '5px 8px',
    background: GRP_COLORS[colKey]?.cell || '#1e2530',
    color: '#0d1117',
    border: '1px solid #d0d0d0',
    fontSize: '12px',
    minWidth: '72px',
  });
  const inputStyle = {
    width: '64px', background: 'transparent', border: 'none',
    color: '#0d1117', fontSize: '12px', textAlign: 'center', outline: 'none',
  };
  const totalStyle = (colKey) => ({
    textAlign: 'center', padding: '5px 8px',
    background: GRP_COLORS[colKey]?.header || '#2d3748',
    color: '#ffffff', fontWeight: '700', fontSize: '12px',
    border: '1px solid #aaa',
  });
  const labelStyle = {
    padding: '5px 10px', fontWeight: '600', fontSize: '12px',
    color: '#c9d1d9', textAlign: 'right', border: '1px solid #30363d',
    background: '#161b22', whiteSpace: 'nowrap',
  };
  const hdrStyle = (colKey) => ({
    background: GRP_COLORS[colKey]?.header || '#2d3748',
    color: '#fff', fontWeight: '700', fontSize: '11px',
    padding: '6px 8px', textAlign: 'center', border: '1px solid #aaa',
    minWidth: '72px',
  });

  return (
    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '24px' }}>
      {groups.map((grp) => {
        // Compute column totals
        const totals = Object.fromEntries(grp.columns.map(col => [
          col.key,
          grp.rows.reduce((sum, row) => sum + (Number((hfDraft[row.key] || {})[col.key]) || 0), 0),
        ]));

        return (
          <div key={grp.columns.map(c => c.key).join('-')} style={{ border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden' }}>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...labelStyle, background: '#161b22', border: '1px solid #30363d' }} />
                  {grp.columns.map(col => (
                    <th key={col.key} style={hdrStyle(col.key)}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grp.rows.map(row => (
                  <tr key={row.key}>
                    <td style={labelStyle}>{row.label}</td>
                    {grp.columns.map(col => (
                      <td key={col.key} style={cellStyle(col.key)}>
                        <input
                          type="number" min="0" step="0.001"
                          placeholder="—"
                          value={((hfDraft[row.key] || {})[col.key] || '') === 0 ? '' : ((hfDraft[row.key] || {})[col.key] ?? '')}
                          onChange={e => onChange(row.key, col.key, e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td style={{ ...labelStyle, fontWeight: '800', color: '#e6edf3' }}>Total</td>
                  {grp.columns.map(col => (
                    <td key={col.key} style={totalStyle(col.key)}>
                      {totals[col.key].toFixed(2)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function buildEmpty(cols) {
  return Object.fromEntries(cols.map(c => [c.key, '']));
}

function RateTable({ cols, rates, onChange, extraCols, onAddCol, onRemoveCol, onLabelChange }) {
  const totalW = LABEL_W + (cols.length + extraCols.length + 1) * CELL_W;
  return (
    <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid #30363d' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: `${totalW}px` }}>
        <thead>
          <tr>
            <th style={{
              width: LABEL_W, minWidth: LABEL_W,
              background: '#161b22', color: '#8b949e',
              fontSize: '11px', fontWeight: '600', textTransform: 'uppercase',
              padding: '8px 10px', textAlign: 'left',
              position: 'sticky', left: 0, zIndex: 2,
              borderBottom: '1px solid #30363d', borderRight: '1px solid #30363d',
            }}>
              Field
            </th>
            {cols.map(col => (
              <th key={col.key} style={{
                width: CELL_W, minWidth: CELL_W,
                background: COL_COLORS[col.key] || '#161b22',
                color: '#c9d1d9',
                fontSize: '11px', fontWeight: '600',
                padding: '8px 4px', textAlign: 'center',
                borderBottom: '1px solid #30363d',
                borderRight: '1px solid #21262d',
                whiteSpace: 'nowrap',
              }}>
                {col.label}
              </th>
            ))}
            {extraCols.map(col => (
              <th key={col.key} style={{
                width: CELL_W, minWidth: CELL_W,
                background: CUSTOM_BG,
                padding: '4px',
                borderBottom: '1px solid #30363d',
                borderRight: '1px solid #21262d',
                verticalAlign: 'middle',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                  <input
                    value={col.label}
                    onChange={e => onLabelChange(col.key, e.target.value)}
                    style={{
                      width: '62px', background: 'transparent', border: 'none',
                      borderBottom: '1px solid #58a6ff', color: '#c9d1d9',
                      fontSize: '11px', fontWeight: '600', textAlign: 'center',
                      outline: 'none', padding: '1px 0',
                    }}
                  />
                  <button
                    onClick={() => onRemoveCol(col.key)}
                    title="Remove column"
                    style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0, flexShrink: 0 }}
                  >×</button>
                </div>
              </th>
            ))}
            <th style={{ width: CELL_W, minWidth: CELL_W, background: '#161b22', borderBottom: '1px solid #30363d', padding: '5px' }}>
              <button
                onClick={onAddCol}
                style={{
                  width: '100%', background: 'rgba(88,166,255,0.08)',
                  border: '1px dashed #444c56', borderRadius: '4px',
                  color: '#58a6ff', fontSize: '11px', fontWeight: '700',
                  cursor: 'pointer', padding: '5px 2px',
                }}
              >+ Add</button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: '#0d1117' }}>
            <td style={{
              position: 'sticky', left: 0, zIndex: 1,
              background: '#0d1117', color: '#8b949e',
              fontSize: '12px', fontWeight: '600',
              padding: '6px 10px', borderRight: '1px solid #30363d',
            }}>
              Hr Function
            </td>
            {cols.map(col => (
              <td key={col.key} style={{ background: COL_COLORS[col.key] || 'transparent', padding: '3px 4px', borderRight: '1px solid #21262d', borderTop: '1px solid #21262d' }}>
                <input
                  type="number" min="0" step="0.001" placeholder="—"
                  value={rates[col.key] ?? ''}
                  onChange={e => onChange(col.key, e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #444c56', color: '#c9d1d9', fontSize: '12px', textAlign: 'center', padding: '2px 0', outline: 'none', boxSizing: 'border-box' }}
                />
              </td>
            ))}
            {extraCols.map(col => (
              <td key={col.key} style={{ background: CUSTOM_BG, padding: '3px 4px', borderRight: '1px solid #21262d', borderTop: '1px solid #21262d' }}>
                <input
                  type="number" min="0" step="0.001" placeholder="—"
                  value={rates[col.key] ?? ''}
                  onChange={e => onChange(col.key, e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #58a6ff', color: '#c9d1d9', fontSize: '12px', textAlign: 'center', padding: '2px 0', outline: 'none', boxSizing: 'border-box' }}
                />
              </td>
            ))}
            <td style={{ background: '#161b22', borderTop: '1px solid #21262d' }} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function LaborDefaultsTab() {
  const defaultRatesSF    = useProductionRatesStore(s => s.defaultRatesSF);
  const defaultRatesCW    = useProductionRatesStore(s => s.defaultRatesCW);
  const setDefaultRatesSF = useProductionRatesStore(s => s.setDefaultRatesSF);
  const setDefaultRatesCW = useProductionRatesStore(s => s.setDefaultRatesCW);
  const setAllRatesForType = useProductionRatesStore(s => s.setAllRatesForType);
  const storedExtraSF     = useProductionRatesStore(s => s.customColsSF);
  const storedExtraCW     = useProductionRatesStore(s => s.customColsCW);
  const setCustomColsSF   = useProductionRatesStore(s => s.setCustomColsSF);
  const setCustomColsCW   = useProductionRatesStore(s => s.setCustomColsCW);

  const [subTab,      setSubTab]      = useState('sf');
  const [draftSF,     setDraftSF]     = useState(() => ({ ...buildEmpty(CALC_COLS_SF), ...defaultRatesSF }));
  const [draftCW,     setDraftCW]     = useState(() => ({ ...buildEmpty(CALC_COLS_CW), ...defaultRatesCW }));
  const [extraColsSF, setExtraColsSF] = useState(() => storedExtraSF || []);
  const [extraColsCW, setExtraColsCW] = useState(() => storedExtraCW || []);
  // HF sub-rate drafts — keyed by fnName → colKey → value
  const storedHFSF = useProductionRatesStore(s => s.defaultHFRatesSF);
  const storedHFCW = useProductionRatesStore(s => s.defaultHFRatesCW);
  const setDefaultHFRatesSF = useProductionRatesStore(s => s.setDefaultHFRatesSF);
  const setDefaultHFRatesCW = useProductionRatesStore(s => s.setDefaultHFRatesCW);
  const [hfDraftSF,   setHfDraftSF]   = useState(() => deepClone(storedHFSF && Object.keys(storedHFSF).length ? storedHFSF : DEFAULT_HF_SF));
  const [hfDraftCW,   setHfDraftCW]   = useState(() => deepClone(storedHFCW && Object.keys(storedHFCW).length ? storedHFCW : DEFAULT_HF_CW));
  const [saved,       setSaved]       = useState(false);

  const handleChange = useCallback((kind, key, val) => {
    if (kind === 'sf') setDraftSF(p => ({ ...p, [key]: val }));
    else               setDraftCW(p => ({ ...p, [key]: val }));
  }, []);

  const handleHFChange = useCallback((kind, fnName, colKey, val) => {
    const num = val === '' ? '' : Number(val);
    if (kind === 'sf') setHfDraftSF(p => ({ ...p, [fnName]: { ...(p[fnName] || {}), [colKey]: num } }));
    else               setHfDraftCW(p => ({ ...p, [fnName]: { ...(p[fnName] || {}), [colKey]: num } }));
  }, []);

  const handleAddCol = useCallback((kind) => {
    const key = `c_${Date.now()}`;
    if (kind === 'sf') {
      setExtraColsSF(p => [...p, { key, label: 'Custom' }]);
      setDraftSF(p => ({ ...p, [key]: '' }));
    } else {
      setExtraColsCW(p => [...p, { key, label: 'Custom' }]);
      setDraftCW(p => ({ ...p, [key]: '' }));
    }
  }, []);

  const handleRemoveCol = useCallback((kind, colKey) => {
    if (kind === 'sf') {
      setExtraColsSF(p => p.filter(c => c.key !== colKey));
      setDraftSF(p => { const n = { ...p }; delete n[colKey]; return n; });
    } else {
      setExtraColsCW(p => p.filter(c => c.key !== colKey));
      setDraftCW(p => { const n = { ...p }; delete n[colKey]; return n; });
    }
  }, []);

  const handleLabelChange = useCallback((kind, colKey, label) => {
    if (kind === 'sf') setExtraColsSF(p => p.map(c => c.key === colKey ? { ...c, label } : c));
    else               setExtraColsCW(p => p.map(c => c.key === colKey ? { ...c, label } : c));
  }, []);

  const handleSave = () => {
    const coerce = (obj) =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, v === '' ? '' : Number(v)])
      );

    const sfFlat = coerce(draftSF);
    const cwFlat = coerce(draftCW);

    setDefaultRatesSF(sfFlat);
    setDefaultRatesCW(cwFlat);
    setDefaultHFRatesSF(hfDraftSF);
    setDefaultHFRatesCW(hfDraftCW);
    setCustomColsSF([...extraColsSF]);
    setCustomColsCW([...extraColsCW]);

    const sfRates = flatToSFRates(sfFlat, hfDraftSF, extraColsSF);
    const cwRates = flatToCWRates(cwFlat, hfDraftCW, extraColsCW);
    setAllRatesForType('Ext SF', sfRates);
    setAllRatesForType('Int SF', sfRates);
    setAllRatesForType('Cap CW', cwRates);
    setAllRatesForType('SSG CW', cwRates);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (subTab === 'sf') { setDraftSF(buildEmpty(CALC_COLS_SF)); setExtraColsSF([]); setHfDraftSF(deepClone(DEFAULT_HF_SF)); }
    else                 { setDraftCW(buildEmpty(CALC_COLS_CW)); setExtraColsCW([]); setHfDraftCW(deepClone(DEFAULT_HF_CW)); }
    setSaved(false);
  };

  const cols      = subTab === 'sf' ? CALC_COLS_SF  : CALC_COLS_CW;
  const rates     = subTab === 'sf' ? draftSF       : draftCW;
  const extraCols = subTab === 'sf' ? extraColsSF   : extraColsCW;
  const hfDraft   = subTab === 'sf' ? hfDraftSF     : hfDraftCW;
  const hfGroups  = subTab === 'sf' ? HF_GROUPS_SF  : HF_GROUPS_CW;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '100%', boxSizing: 'border-box' }}>

      {/* Section header */}
      <h2 style={{ color: '#e6edf3', fontSize: '16px', fontWeight: '700', margin: '0 0 4px' }}>
        ⏱️ Labor MH Defaults
      </h2>
      <p style={{ color: '#8b949e', fontSize: '13px', margin: '0 0 20px' }}>
        Set company-wide default man-hour rates for each system type. These values will seed
        new systems when you start a bid.
      </p>

      {/* SF / CW sub-tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '1px solid #30363d' }}>
        {[
          { id: 'sf', label: 'Storefront' },
          { id: 'cw', label: 'Curtain Wall' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '8px 22px',
              background: 'none',
              border: 'none',
              borderBottom: subTab === t.id ? '2px solid #58a6ff' : '2px solid transparent',
              color: subTab === t.id ? '#58a6ff' : '#8b949e',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Rate table */}
      <RateTable
        cols={cols}
        rates={rates}
        onChange={(key, val) => handleChange(subTab, key, val)}
        extraCols={extraCols}
        onAddCol={() => handleAddCol(subTab)}
        onRemoveCol={(key) => handleRemoveCol(subTab, key)}
        onLabelChange={(key, label) => handleLabelChange(subTab, key, label)}
      />

      {/* HF Sub-rate breakdown table (SF only for now) */}
      {hfGroups && (
        <>
          <h3 style={{ color: '#c9d1d9', fontSize: '13px', fontWeight: '700', margin: '24px 0 0' }}>
            Hourly Function Sub-rates
          </h3>
          <p style={{ color: '#8b949e', fontSize: '12px', margin: '4px 0 0' }}>
            These sub-rates sum to the Hr Function total used in the Calculation table above.
          </p>
          <HFBreakdownTable
            groups={hfGroups}
            hfDraft={hfDraft}
            onChange={(fnName, colKey, val) => handleHFChange(subTab, fnName, colKey, val)}
          />
        </>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
        <button
          onClick={handleSave}
          style={{
            padding: '8px 22px',
            background: '#238636',
            border: 'none',
            borderRadius: '6px',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          {saved ? '✓ Saved' : 'Save Defaults'}
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: '8px 18px',
            background: 'none',
            border: '1px solid #444c56',
            borderRadius: '6px',
            color: '#8b949e',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Reset Tab
        </button>
      </div>
    </div>
  );
}
