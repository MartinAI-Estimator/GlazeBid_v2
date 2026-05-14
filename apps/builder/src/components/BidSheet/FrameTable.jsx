/**
 * FrameTable.jsx — Spreadsheet-style inline-editable table for imported frames.
 *
 * Works directly with importedSystems state (no BidSheet context).
 * Columns adapt per system type via systemColumns.js / getColumnConfigId.
 * Supports: inline cell editing, Tab/Enter/Arrow navigation, delete row, add row.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { getSystemColumns } from './systemColumns';
import { getColumnConfigId } from '../../utils/systemTypeConfig';

// ── Column definitions: prepend fixed cols, append computed cols ─────────────

const FIXED_COLS_LEFT = [
  { key: 'mark',     label: 'Mark',  type: 'text',   width: 100, editable: true },
  { key: 'width',    label: 'W″',    type: 'number', width: 55,  editable: true },
  { key: 'height',   label: 'H″',    type: 'number', width: 55,  editable: true },
  { key: 'quantity', label: 'Qty',    type: 'number', width: 48,  editable: true },
  { key: 'sf',       label: 'SF',     type: 'number', width: 60,  editable: false },
  { key: 'panels',   label: 'Panels', type: 'number', width: 60,  editable: true },
  { key: 'rows',     label: 'Rows',   type: 'number', width: 55,  editable: true },
  { key: 'joints',   label: 'Joints', type: 'number', width: 60,  editable: true },
  { key: 'perimeter', label: 'Perim', type: 'number', width: 60,  editable: true },
  { key: 'manualMaterialCost', label: 'Manual Mat $', type: 'number', width: 92, editable: true },
];

const COMPUTED_COLS = [
  { key: '_shopMH',  label: 'Shop MH',  type: 'computed', width: 72, color: '#a78bfa' },
  { key: '_distMH',  label: 'Dist MH',  type: 'computed', width: 72, color: '#38bdf8' },
  { key: '_fieldMH', label: 'Field MH', type: 'computed', width: 72, color: '#fbbf24' },
  { key: '_totalMH', label: 'Total MH', type: 'computed', width: 78, color: '#34d399' },
];

const FIELD_ALIASES = {
  frame_number: 'mark',
};

const GROUP_COLORS = {
  identity: {
    header: 'rgba(251,191,36,0.18)',
    cell: 'rgba(251,191,36,0.07)',
  },
  geometry: {
    header: 'rgba(96,165,250,0.20)',
    cell: 'rgba(96,165,250,0.08)',
  },
  operations: {
    header: 'rgba(167,139,250,0.18)',
    cell: 'rgba(167,139,250,0.07)',
  },
};

function getColumnTint(col, surface = 'cell') {
  if (!col?.group) return 'transparent';
  return GROUP_COLORS[col.group]?.[surface] || 'transparent';
}

function buildColumns(systemType) {
  const colId = getColumnConfigId(systemType);
  const sysCols = getSystemColumns(colId);
  // sysCols from systemColumns.js are the editable middle section
  const middle = sysCols.map(c => ({
    key: c.key,
    label: c.label,
    type: c.type,
    width: parseInt(c.width) || 80,
    editable: c.editable !== false,
  }));
  return [...FIXED_COLS_LEFT, ...middle, ...COMPUTED_COLS];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const NUM_FIELDS = new Set([
  'width', 'height', 'quantity', 'panels', 'rows', 'joints', 'perimeter',
  'manualMaterialCost',
  'subsills', 'receptors', 'bays', 'gtBays', 'dlos', 'gtDlos', 'pairs', 'singles',
  'ssg', 'steel', 'vents', 'brake', 'open',
  'stool_trim', 'ft', 'wl_dl', 'doors',
]);

const fmt2 = v => (v && v !== 0) ? Number(v).toFixed(2) : '';

// ── Component ───────────────────────────────────────────────────────────────

export default function FrameTable({ system, setImportedSystems, frameResults = [] }) {
  const sysType = system.systemType || system.name;
  const frames = system.frames || [];
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);

  const inputColumns = useMemo(() => {
    const colId = getColumnConfigId(sysType);
    const sysCols = getSystemColumns(colId);
    return sysCols.map(c => ({
      key: c.key,
      label: c.label,
      type: c.type,
      width: parseInt(c.width) || 80,
      editable: c.editable !== false,
      tooltip: c.tooltip,
      group: c.group,
    }));
  }, [sysType]);
  const columns = inputColumns;
  const editableCols = useMemo(() => columns.filter(c => c.editable), [columns]);

  const [editCell, setEditCell] = useState(null); // { row, key }
  const [hoveredRow, setHoveredRow] = useState(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, [editCell]);

  const resolveFieldKey = useCallback((field) => FIELD_ALIASES[field] || field, []);
  const getFrameValue = useCallback((frame, field) => frame?.[resolveFieldKey(field)], [resolveFieldKey]);

  // ── Frame mutations ───────────────────────────────────────────────────────

  const updateFrameField = useCallback((frameIdx, field, raw) => {
    const actualField = resolveFieldKey(field);
    const value = NUM_FIELDS.has(actualField) ? (parseFloat(raw) || 0) : raw;
    setImportedSystems(prev => prev.map(s => {
      if (s.id !== system.id) return s;
      const newFrames = s.frames.map((f, i) => i === frameIdx ? { ...f, [actualField]: value } : f);
      return { ...s, frames: newFrames };
    }));
  }, [system.id, setImportedSystems, resolveFieldKey]);

  const deleteFrame = useCallback((frameIdx) => {
    const f = frames[frameIdx];
    const label = f?.mark || f?.frame_number || `Frame ${frameIdx + 1}`;
    if (!confirm(`Delete ${label}?`)) return;
    setImportedSystems(prev => prev.map(s => {
      if (s.id !== system.id) return s;
      return { ...s, frames: s.frames.filter((_, i) => i !== frameIdx) };
    }));
    setEditCell(null);
  }, [system.id, frames, setImportedSystems]);

  const addFrame = useCallback(() => {
    setImportedSystems(prev => prev.map(s => {
      if (s.id !== system.id) return s;
      const newFrame = { id: `new-${Date.now()}`, mark: '', width: 0, height: 0, quantity: 1, manualMaterialCost: 0, receptors: 0 };
      return { ...s, frames: [...s.frames, newFrame] };
    }));
  }, [system.id, setImportedSystems]);

  const bulkSetReceptors = useCallback((source) => {
    setImportedSystems(prev => prev.map(s => {
      if (s.id !== system.id) return s;
      const nextFrames = (s.frames || []).map(frame => {
        const nextValue = source === 'open'
          ? Math.max(0, Number(frame.open) || 0)
          : Math.max(1, Number(frame.quantity) || 1);
        return { ...frame, receptors: nextValue };
      });
      return { ...s, frames: nextFrames };
    }));
  }, [system.id, setImportedSystems]);

  // ── Cell navigation ───────────────────────────────────────────────────────

  const commitAndMove = useCallback((rowDelta, colDelta) => {
    if (!editCell) return;
    // Commit current
    updateFrameField(editCell.row, editCell.key, draft);

    const colIdx = editableCols.findIndex(c => c.key === editCell.key);
    let nextRow = editCell.row + rowDelta;
    let nextCol = colIdx + colDelta;

    // Wrap on Tab
    if (colDelta !== 0 && rowDelta === 0) {
      if (nextCol >= editableCols.length) { nextCol = 0; nextRow++; }
      if (nextCol < 0) { nextCol = editableCols.length - 1; nextRow--; }
    }

    // Bounds
    if (nextRow < 0 || nextRow >= frames.length) { setEditCell(null); return; }
    nextCol = Math.max(0, Math.min(nextCol, editableCols.length - 1));

    const nextKey = editableCols[nextCol].key;
    const nextValue = getFrameValue(frames[nextRow], nextKey);
    setDraft(nextValue != null && nextValue !== 0 ? String(nextValue) : '');
    setEditCell({ row: nextRow, key: nextKey });
  }, [editCell, draft, editableCols, frames, updateFrameField, getFrameValue]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commitAndMove(1, 0); }
    else if (e.key === 'Tab') { e.preventDefault(); commitAndMove(0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { setEditCell(null); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); commitAndMove(-1, 0); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); commitAndMove(1, 0); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); commitAndMove(0, -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); commitAndMove(0, 1); }
  }, [commitAndMove]);

  const beginEdit = (rowIdx, col) => {
    if (!col.editable) return;
    const v = getFrameValue(frames[rowIdx], col.key);
    setDraft(v != null && v !== 0 ? String(v) : '');
    setEditCell({ row: rowIdx, key: col.key });
  };

  const commitEdit = () => {
    if (!editCell) return;
    updateFrameField(editCell.row, editCell.key, draft);
    setEditCell(null);
  };

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalQty = frames.reduce((s, f) => s + (f.quantity || 1), 0);
  const totalSF = system.totals?.totalSF || frames.reduce((s, f) => {
    const w = (f.width || 0) / 12;
    const h = (f.height || 0) / 12;
    return s + w * h * (f.quantity || 1);
  }, 0);
  const totalMH = frameResults.reduce((s, r) => s + (r?.totalMH || 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--bg-deep)', position: 'relative' }}>

      {/* Sticky header bar */}
      <div style={S.toolbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {frames.length} Elevations · {totalQty} Frames · {totalSF.toFixed(0)} SF
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setShowDetailsPanel(true)} style={S.quickBtn}>
            View Details
          </button>
          <button onClick={() => bulkSetReceptors('open')} style={S.quickBtn}>Receptors = Open</button>
          <button onClick={() => bulkSetReceptors('qty')} style={S.quickBtn}>Receptors = Qty</button>
          <button onClick={addFrame} style={S.addBtn}>+ Add Frame</button>
        </div>
      </div>

      {/* Scrollable table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {frames.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No frames loaded. Import a PartnerPak file or add manually.
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 36 }}>#</th>
                {columns.map(col => (
                  <th
                    key={col.key}
                    title={col.tooltip || ''}
                    style={{
                      ...S.th,
                      width: col.width,
                      color: col.color || 'var(--text-secondary)',
                      textAlign: col.type === 'number' || col.type === 'computed' ? 'right' : 'left',
                      background: getColumnTint(col, 'header'),
                      cursor: col.tooltip ? 'help' : 'default',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
                <th style={{ ...S.th, width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {frames.map((frame, ri) => {
                const fr = frameResults[ri] || {};
                const isActiveRow = editCell?.row === ri;
                const isHoveredRow = hoveredRow === ri;
                const rowOverlay = isActiveRow
                  ? 'rgba(59,130,246,0.22)'
                  : (isHoveredRow ? 'rgba(255,255,255,0.06)' : null);
                const plainRowBg = ri % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent';
                const nonColumnBg = rowOverlay || plainRowBg;
                return (
                  <tr key={frame.id ?? ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseEnter={() => setHoveredRow(ri)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onDoubleClick={() => { const firstEditable = editableCols[0]; if (firstEditable) beginEdit(ri, firstEditable); }}>
                    <td style={{ ...S.rowNum, background: nonColumnBg }}>{ri + 1}</td>
                    {columns.map(col => {
                      const isEditing = editCell?.row === ri && editCell?.key === col.key;
                      const colBaseBg = getColumnTint(col, 'cell');
                      const cellBg = rowOverlay || colBaseBg || plainRowBg;

                      // Computed MH columns
                      if (col.type === 'computed') {
                        let val = 0;
                        if (col.key === '_shopMH')  val = fr.shopMH;
                        if (col.key === '_distMH')  val = fr.distributionMH;
                        if (col.key === '_fieldMH') val = fr.fieldMH;
                        if (col.key === '_totalMH') val = fr.totalMH;
                        return (
                          <td key={col.key} style={{ ...S.cellR, color: col.color, fontWeight: col.key === '_totalMH' ? 700 : 400, background: cellBg }}>
                            {fmt2(val)}
                          </td>
                        );
                      }

                      // SF computed
                      if (col.key === 'sf') {
                        const w = (frame.width || 0) / 12;
                        const h = (frame.height || 0) / 12;
                        const sf = w * h * (frame.quantity || 1);
                        return <td key={col.key} style={{ ...S.cellR, background: cellBg }}>{sf ? sf.toFixed(1) : ''}</td>;
                      }

                      const raw = getFrameValue(frame, col.key);
                      const isNum = col.type === 'number';

                      // Editing
                      if (isEditing) {
                        return (
                          <td key={col.key} style={{ ...S.cellEditing, background: cellBg }}>
                            <input ref={inputRef} type="text" inputMode={isNum ? 'numeric' : 'text'}
                              value={draft} onChange={e => setDraft(e.target.value)}
                              onBlur={commitEdit} onKeyDown={onKeyDown}
                              style={{ ...S.input, textAlign: isNum ? 'right' : 'left' }} />
                          </td>
                        );
                      }

                      // Display
                      const display = raw != null && raw !== '' && raw !== 0
                        ? (isNum ? raw : raw)
                        : '';

                      return (
                        <td key={col.key}
                          style={{ ...(isNum ? S.cellR : S.cellL), cursor: col.editable ? 'cell' : 'default', opacity: display === '' ? 0.25 : 1, background: cellBg }}
                          onClick={() => col.editable && beginEdit(ri, col)}>
                          {display}
                        </td>
                      );
                    })}
                    <td style={{ ...S.deleteCell, background: nonColumnBg }}>
                      <button onClick={() => deleteFrame(ri)} style={S.deleteBtn} title="Delete frame">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-subtle)' }}>
                <td style={S.footLabel}></td>
                <td style={S.footLabel} colSpan={columns.length}>
                  <strong>{frames.length}</strong> elevations · <strong>{totalQty}</strong> frames · <strong>{totalSF.toFixed(0)}</strong> SF
                </td>
                <td style={S.footR}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {showDetailsPanel && (
        <>
          <div
            onClick={() => setShowDetailsPanel(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20 }}
          />
          <aside style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(780px, 94vw)',
            background: 'var(--bg-card)',
            borderLeft: '1px solid var(--border-subtle)',
            zIndex: 21,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-10px 0 30px rgba(0,0,0,0.35)',
          }}>
            <div style={{ padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Hidden Details</div>
                <div style={{ fontSize: '0.86rem', color: 'var(--text-primary)', fontWeight: 700 }}>Rare-use frame metrics and MH breakdown</div>
              </div>
              <button onClick={() => setShowDetailsPanel(false)} style={S.closeBtn}>Close</button>
            </div>

            <div style={{ padding: '0.65rem 0.9rem', borderBottom: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.5rem' }}>
              <div style={S.statCard}><span style={S.statLabel}>Frames</span><span style={S.statValue}>{frames.length}</span></div>
              <div style={S.statCard}><span style={S.statLabel}>Qty</span><span style={S.statValue}>{totalQty}</span></div>
              <div style={S.statCard}><span style={S.statLabel}>Total SF</span><span style={S.statValue}>{totalSF.toFixed(0)}</span></div>
              <div style={S.statCard}><span style={S.statLabel}>Total MH</span><span style={S.statValue}>{fmt2(totalMH) || '0.00'}</span></div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '0.55rem 0.9rem 0.8rem' }}>
              <table style={S.detailsTable}>
                <thead>
                  <tr>
                    {['Mark', 'W', 'H', 'Qty', 'SF', 'Bays', 'DLOs', 'Rows', 'Panels', 'Joints', 'Perim', 'Manual $', 'Shop MH', 'Dist MH', 'Field MH', 'Total MH'].map((h) => (
                      <th key={h} style={S.detailsTh}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {frames.map((f, i) => {
                    const fr = frameResults[i] || {};
                    const sf = (((f.width || 0) / 12) * ((f.height || 0) / 12) * (f.quantity || 1));
                    return (
                      <tr key={f.id || i}>
                        <td style={S.detailsTdL}>{f.mark || `Frame ${i + 1}`}</td>
                        <td style={S.detailsTdR}>{f.width || ''}</td>
                        <td style={S.detailsTdR}>{f.height || ''}</td>
                        <td style={S.detailsTdR}>{f.quantity || 1}</td>
                        <td style={S.detailsTdR}>{sf ? sf.toFixed(1) : ''}</td>
                        <td style={S.detailsTdR}>{f.bays || ''}</td>
                        <td style={S.detailsTdR}>{f.dlos || ''}</td>
                        <td style={S.detailsTdR}>{f.rows || ''}</td>
                        <td style={S.detailsTdR}>{f.panels || ''}</td>
                        <td style={S.detailsTdR}>{f.joints || ''}</td>
                        <td style={S.detailsTdR}>{f.perimeter || ''}</td>
                        <td style={S.detailsTdR}>{f.manualMaterialCost ? Number(f.manualMaterialCost).toFixed(2) : ''}</td>
                        <td style={S.detailsTdR}>{fmt2(fr.shopMH)}</td>
                        <td style={S.detailsTdR}>{fmt2(fr.distributionMH)}</td>
                        <td style={S.detailsTdR}>{fmt2(fr.fieldMH)}</td>
                        <td style={{ ...S.detailsTdR, fontWeight: 700, color: '#34d399' }}>{fmt2(fr.totalMH)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────
const S = {
  toolbar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.45rem 1rem', background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
  },
  addBtn: {
    padding: '4px 12px', borderRadius: 5, fontSize: '0.75rem', fontWeight: 600,
    border: '1px solid var(--border-subtle)', background: 'transparent',
    color: 'var(--accent-blue)', cursor: 'pointer',
  },
  quickBtn: {
    padding: '4px 10px', borderRadius: 5, fontSize: '0.7rem', fontWeight: 600,
    border: '1px solid var(--border-subtle)', background: 'var(--bg-panel)',
    color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  closeBtn: {
    padding: '5px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
    border: '1px solid var(--border-subtle)', background: 'transparent',
    color: 'var(--text-secondary)', cursor: 'pointer',
  },
  statCard: {
    border: '1px solid var(--border-subtle)', borderRadius: 8,
    background: 'var(--bg-panel)', padding: '0.45rem 0.55rem',
    display: 'flex', flexDirection: 'column', gap: '0.1rem',
  },
  statLabel: {
    fontSize: '0.62rem', color: 'var(--text-secondary)', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  statValue: {
    fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  detailsTable: {
    width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem',
    fontVariantNumeric: 'tabular-nums',
  },
  detailsTh: {
    position: 'sticky', top: 0, zIndex: 2,
    padding: '0.35rem 0.4rem', background: 'var(--bg-panel)',
    color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.62rem',
    textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right',
    borderBottom: '1px solid var(--border-subtle)',
  },
  detailsTdL: {
    padding: '0.3rem 0.4rem', textAlign: 'left', color: 'var(--text-primary)',
    borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
  },
  detailsTdR: {
    padding: '0.3rem 0.4rem', textAlign: 'right', color: 'var(--text-secondary)',
    borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
  },
  table: {
    width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
    fontVariantNumeric: 'tabular-nums', tableLayout: 'auto',
  },
  th: {
    position: 'sticky', top: 0, zIndex: 2,
    padding: '0.4rem 0.5rem', fontSize: '0.65rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--text-secondary)', background: 'var(--bg-panel)',
    borderBottom: '2px solid var(--border-subtle)', whiteSpace: 'nowrap',
  },
  rowNum: {
    padding: '0.3rem 0.5rem', textAlign: 'center',
    fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600,
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  cellL: {
    padding: '0.3rem 0.5rem', textAlign: 'left', color: 'var(--text-primary)',
    borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
  },
  cellR: {
    padding: '0.3rem 0.5rem', textAlign: 'right', color: 'var(--text-primary)',
    borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
  },
  cellEditing: {
    padding: '0.15rem 0.25rem',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  input: {
    width: '100%', padding: '0.25rem 0.4rem', fontSize: '0.78rem',
    fontVariantNumeric: 'tabular-nums', background: 'var(--bg-deep)',
    border: '1px solid var(--accent-blue)', borderRadius: 3,
    color: 'var(--text-primary)', outline: 'none',
  },
  deleteCell: {
    padding: '0.3rem 0.35rem', textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  deleteBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-secondary)',
    fontSize: '0.9rem', cursor: 'pointer', opacity: 0.4, padding: '0 4px',
    lineHeight: 1,
  },
  footLabel: {
    padding: '0.45rem 0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)',
    fontWeight: 600,
  },
  footR: {
    padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.75rem',
    color: 'var(--text-secondary)',
  },
};
