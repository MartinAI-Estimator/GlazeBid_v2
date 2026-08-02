/**
 * ScheduleImport.jsx — Window Schedule drag-and-drop import (Path C)
 *
 * Flow: files dropped on FrameBuilder (or picked via button)
 *   → parseWindowSchedule() per file (rules-based for sheets, AI for PDFs)
 *   → review table (editable, confidence + needs-input flags)
 *   → Build → useFrameBuilderStore.hydrateFrames()
 *   → results summary (fields set / needs estimator input per frame)
 */

import React, { useState, useEffect, useRef } from 'react';
import { FileSpreadsheet, FileText, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';
import { parseWindowSchedule } from '../../lib/scheduleParser';

const SYSTEM_OPTIONS = [
  { value: 'storefront', label: 'Storefront' },
  { value: 'curtainwall', label: 'Curtainwall' },
  { value: 'hollow_metal', label: 'Hollow Metal' },
  { value: 'hollow_metal_fire_rated', label: 'HM Fire-Rated' },
];

const confColor = (c) => (c == null ? '#71717a' : c >= 0.85 ? '#4ade80' : c >= 0.6 ? '#fbbf24' : '#f87171');

// ─── Component ────────────────────────────────────────────────────────────────

const ScheduleImport = ({ files, onClose }) => {
  const hydrateFrames = useFrameBuilderStore((s) => s.hydrateFrames);

  const [phase, setPhase] = useState('parsing'); // parsing | review | building | done
  const [rows, setRows] = useState([]);          // [{ payload, include, source, fileName }]
  const [errors, setErrors] = useState([]);
  const [results, setResults] = useState([]);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const collected = [];
      const errs = [];
      for (const file of files) {
        const res = await parseWindowSchedule(file);
        if (res.error) errs.push(`${res.fileName}: ${res.error}`);
        if (res.note) errs.push(`${res.fileName}: ${res.note}`);
        for (const p of res.payloads) {
          collected.push({ payload: p, include: true, source: res.source, fileName: res.fileName });
        }
      }
      setErrors(errs);
      setRows(collected);
      setPhase('review');
    })();
  }, [files]);

  const updatePayload = (idx, patch) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, payload: { ...r.payload, ...patch } } : r)));
  };
  const toggleInclude = (idx) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, include: !r.include } : r)));
  };

  const included = rows.filter((r) => r.include);

  const handleBuild = () => {
    setPhase('building');
    // hydrateFrames is synchronous state work; defer a tick so the spinner paints
    setTimeout(() => {
      const res = hydrateFrames(included.map((r) => r.payload));
      setResults(res);
      setPhase('done');
    }, 30);
  };

  const NumCell = ({ value, onChange, width = 62 }) => (
    <input
      type="number"
      value={value ?? ''}
      placeholder="—"
      onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
      style={{ ...st.cellInput, width, ...(value == null ? st.cellMissing : {}) }}
    />
  );

  return (
    <div style={st.backdrop}>
      <div style={st.modal}>
        {/* Header */}
        <div style={st.header}>
          <span style={st.title}>
            Import Window Schedule
            {rows.length > 0 && phase === 'review' && (
              <span style={st.countChip}>{rows.length} frame{rows.length !== 1 ? 's' : ''} found</span>
            )}
          </span>
          <button onClick={onClose} style={st.closeBtn}><X size={15} /></button>
        </div>

        {/* Body */}
        <div style={st.body}>
          {phase === 'parsing' && (
            <div style={st.center}>
              <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#0ea5e9' }} />
              <span style={{ color: '#a1a1aa', fontSize: 12 }}>Reading document…</span>
              <span style={{ color: '#52525b', fontSize: 10 }}>
                {files.map((f) => f.name).join(' · ')}
              </span>
              <span style={{ color: '#52525b', fontSize: 10 }}>
                Elevation drawings are read visually by AI — this can take 30–60 seconds.
              </span>
              <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
            </div>
          )}

          {phase !== 'parsing' && errors.length > 0 && (
            <div style={st.errBox}>
              {errors.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <AlertTriangle size={12} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 11, color: '#fbbf24' }}>{e}</span>
                </div>
              ))}
            </div>
          )}

          {phase === 'review' && rows.length === 0 && errors.length === 0 && (
            <div style={st.center}>
              <span style={{ color: '#71717a', fontSize: 12 }}>No frames found in the dropped file(s).</span>
            </div>
          )}

          {(phase === 'review' || phase === 'building') && rows.length > 0 && (
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={st.table}>
                <thead>
                  <tr>
                    {['', 'Mark', 'System', 'Width (in)', 'Height (in)', 'Bays', 'Rows', 'Qty', 'Glass', 'Conf', 'Src'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const p = r.payload;
                    const flagged = new Set(p.flaggedFields || []);
                    return (
                      <tr key={i} style={{ opacity: r.include ? 1 : 0.35 }}>
                        <td style={st.td}>
                          <input type="checkbox" checked={r.include} onChange={() => toggleInclude(i)} style={{ accentColor: '#0ea5e9', cursor: 'pointer' }} />
                        </td>
                        <td style={st.td}>
                          <input value={p.mark || ''} onChange={(e) => updatePayload(i, { mark: e.target.value })} style={{ ...st.cellInput, width: 58, fontWeight: 600 }} />
                        </td>
                        <td style={st.td}>
                          <select value={p.systemType || 'storefront'} onChange={(e) => updatePayload(i, { systemType: e.target.value })} style={{ ...st.cellInput, width: 108 }}>
                            {SYSTEM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td style={{ ...st.td, ...(flagged.has('overallWidth') ? st.tdFlag : {}) }}>
                          <NumCell value={p.overallWidth} onChange={(v) => updatePayload(i, { overallWidth: v })} />
                        </td>
                        <td style={{ ...st.td, ...(flagged.has('overallHeight') ? st.tdFlag : {}) }}>
                          <NumCell value={p.overallHeight} onChange={(v) => updatePayload(i, { overallHeight: v })} />
                        </td>
                        <td style={st.td}>
                          <NumCell value={p.panelCount} onChange={(v) => updatePayload(i, { panelCount: v })} width={44} />
                        </td>
                        <td style={st.td}>
                          <NumCell value={p.rowCount} onChange={(v) => updatePayload(i, { rowCount: v })} width={44} />
                        </td>
                        <td style={st.td}>
                          <NumCell value={p.quantity} onChange={(v) => updatePayload(i, { quantity: v || 1 })} width={40} />
                        </td>
                        <td style={st.td}>
                          <input value={p.primaryGlass || ''} placeholder="—" onChange={(e) => updatePayload(i, { primaryGlass: e.target.value || null })} style={{ ...st.cellInput, width: 130, ...(p.primaryGlass ? {} : st.cellMissing) }} />
                        </td>
                        <td style={st.td}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: confColor(p.confidence) }}>
                            {p.confidence != null ? Math.round(p.confidence * 100) + '%' : '—'}
                          </span>
                        </td>
                        <td style={st.td}>
                          <span style={{
                            ...st.srcChip,
                            background: r.source === 'vision' ? '#3b1e5f' : r.source === 'ai' ? '#1e3a5f' : '#14532d',
                            color: r.source === 'vision' ? '#c4b5fd' : r.source === 'ai' ? '#7dd3fc' : '#4ade80',
                          }}>
                            {r.source === 'vision' ? 'VISION' : r.source === 'ai' ? 'AI' : 'RULES'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: '6px 12px', fontSize: 10, color: '#52525b' }}>
                Amber cells were flagged by extraction — verify before building. Bays/Rows left blank default to 1×1; row heights and Sill AFF are entered in the Frame Builder after import.
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div style={{ overflow: 'auto', flex: 1, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <CheckCircle2 size={18} style={{ color: '#4ade80' }} />
                <span style={{ color: '#e4e4e7', fontSize: 13, fontWeight: 600 }}>
                  {results.filter((r) => r.ok).length} frame{results.filter((r) => r.ok).length !== 1 ? 's' : ''} built
                </span>
              </div>
              {results.map((r, i) => (
                <div key={i} style={st.resultRow}>
                  <span style={{ fontWeight: 700, color: '#e4e4e7', fontSize: 11, minWidth: 52 }}>{r.mark}</span>
                  <span style={{ color: '#52525b', fontSize: 10, minWidth: 110 }}>→ {r.groupName}</span>
                  {r.needsInput.length > 0 ? (
                    <span style={{ color: '#fbbf24', fontSize: 10 }}>
                      needs input: {r.needsInput.join(', ')}
                    </span>
                  ) : (
                    <span style={{ color: '#4ade80', fontSize: 10 }}>complete</span>
                  )}
                  {r.warnings.length > 0 && (
                    <span style={{ color: '#71717a', fontSize: 9 }} title={r.warnings.join('\n')}>
                      ⚠ {r.warnings.length}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={st.footer}>
          {(phase === 'review' || phase === 'building') && (
            <>
              <span style={{ fontSize: 11, color: '#71717a', flex: 1 }}>
                {included.length} of {rows.length} selected
              </span>
              <button onClick={onClose} style={st.cancelBtn}>Cancel</button>
              <button
                onClick={handleBuild}
                disabled={included.length === 0 || phase === 'building'}
                style={{ ...st.buildBtn, ...(included.length === 0 ? { opacity: 0.4, cursor: 'default' } : {}) }}
              >
                {phase === 'building'
                  ? 'Building…'
                  : `Build ${included.length} Frame${included.length !== 1 ? 's' : ''} →`}
              </button>
            </>
          )}
          {phase === 'done' && (
            <>
              <span style={{ flex: 1 }} />
              <button onClick={onClose} style={st.buildBtn}>Open Frame Builder</button>
            </>
          )}
          {phase === 'review' && rows.length === 0 && null}
        </div>
      </div>
    </div>
  );
};

// ─── Drop overlay (rendered by FrameBuilder while dragging) ──────────────────

export const ScheduleDropOverlay = () => (
  <div style={st.dropOverlay}>
    <div style={st.dropInner}>
      <div style={{ display: 'flex', gap: 10 }}>
        <FileText size={26} style={{ color: '#7dd3fc' }} />
        <FileSpreadsheet size={26} style={{ color: '#4ade80' }} />
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#e4e4e7' }}>Drop window schedule to import</span>
      <span style={{ fontSize: 11, color: '#71717a' }}>PDF · Excel · CSV — frames are extracted and pre-built automatically</span>
    </div>
  </div>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = {
  backdrop: { position: 'absolute', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { width: 'min(940px, 94vw)', maxHeight: '84vh', background: '#111113', border: '1px solid #3f3f46', borderRadius: 8, boxShadow: '0 16px 48px rgba(0,0,0,.7)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 46, padding: '0 16px', borderBottom: '1px solid #27272a', flexShrink: 0 },
  title: { fontSize: 13, fontWeight: 600, color: '#e4e4e7', display: 'flex', alignItems: 'center', gap: 8 },
  countChip: { fontSize: 10, fontWeight: 700, color: '#7dd3fc', background: '#1e3a5f', padding: '2px 8px', borderRadius: 10 },
  closeBtn: { background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', display: 'flex', padding: 4 },
  body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 180 },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  errBox: { margin: '10px 12px 0', padding: '8px 10px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 5, display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: 11 },
  th: { position: 'sticky', top: 0, background: '#1a1a1f', color: '#71717a', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, padding: '7px 8px', textAlign: 'left', borderBottom: '1px solid #27272a', zIndex: 1 },
  td: { padding: '4px 8px', borderBottom: '1px solid #1f1f23', color: '#a1a1aa', whiteSpace: 'nowrap' },
  tdFlag: { background: 'rgba(251,191,36,0.08)' },
  cellInput: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 3, color: '#e4e4e7', fontSize: 11, padding: '3px 5px', outline: 'none', boxSizing: 'border-box' },
  cellMissing: { borderColor: 'rgba(251,191,36,0.5)' },
  srcChip: { fontSize: 8, fontWeight: 800, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 3 },
  resultRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderBottom: '1px solid #1f1f23' },
  footer: { display: 'flex', alignItems: 'center', gap: 8, height: 50, padding: '0 14px', borderTop: '1px solid #27272a', flexShrink: 0 },
  cancelBtn: { background: '#27272a', border: 'none', color: '#a1a1aa', fontSize: 12, padding: '7px 14px', borderRadius: 5, cursor: 'pointer' },
  buildBtn: { background: '#0ea5e9', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 5, cursor: 'pointer' },
  dropOverlay: { position: 'absolute', inset: 0, zIndex: 390, background: 'rgba(14,165,233,0.08)', border: '2px dashed #0ea5e9', borderRadius: 6, margin: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  dropInner: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'rgba(17,17,19,0.92)', padding: '26px 40px', borderRadius: 10, border: '1px solid #27272a' },
};

export default ScheduleImport;
