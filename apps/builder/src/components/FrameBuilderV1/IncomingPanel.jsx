/**
 * IncomingPanel — frames sent from Studio (or read from a window schedule),
 * waiting to be built (decision 13: incoming list, then build).
 *
 *   one row per frame type: mark · source sheet · size · bays × rows · doors · qty ·
 *   status (new / will update / you edited — drawing changed / up to date) · needs input
 *   Build all · Build selected · Dismiss
 *
 * FromStudioBox — on the Frame tab of a built frame: where it came from, what still
 * needs input, and "drawing now says …" values to accept (re-sync, decision 5).
 */
import React, { useMemo, useState } from 'react';
import { formatFeetInches, resyncFrame, findImported, routeNonFrame } from '@glazebid/frame-engine/core';
import { readScheduleFile } from './scheduleIntake';

const ft = (v) => (v ? formatFeetInches(v) : '—');

export function incomingStatus(takeoff, p) {
  const existing = takeoff.frames[findImported(takeoff.frames, p)] ?? null;
  if (!existing) return { key: 'new', label: 'New', existing: null };
  try {
    const r = resyncFrame(existing, p, { takeoff });
    if (r.kept.length) return { key: 'edited', label: `You edited — drawing changed (${r.kept.map((k) => k.field).join(', ')})`, existing };
    if (r.updated.length) return { key: 'update', label: `Will update ${r.updated.join(', ')}`, existing };
    return { key: 'same', label: 'Up to date', existing };
  } catch {
    return { key: 'update', label: 'Will update', existing };
  }
}

const ROUTE_LABEL = {
  brake: (r, n) => `brake metal on ${n.placedOn?.length ?? 0} frame type(s)`,
  glass: () => 'glass report (glass only)',
  bid: (r) => `bid cart — ${r.group}`,
  note: () => 'note only',
};

function routeSummary(lines) {
  const c = { brake: 0, glass: 0, bid: 0, note: 0 };
  for (const n of lines) c[routeNonFrame(n).route]++;
  return [c.brake && `${c.brake} brake metal (on frames)`, c.glass && `${c.glass} glass-only`, c.bid && `${c.bid} bid cart`, c.note && `${c.note} notes`]
    .filter(Boolean).join(' · ');
}

const SOURCE_TAG = { studio: 'Studio', schedule: 'Schedule', 'studio+schedule': 'Studio + schedule' };

function sourceLine(inc) {
  const parts = [];
  if (inc.pdfName || inc.studioFrames?.length) parts.push(`Studio${inc.pdfName ? ` (${inc.pdfName})` : ''}`);
  if (inc.schedule?.fileName) parts.push(`window schedule (${inc.schedule.fileName})`);
  return parts.length ? `From ${parts.join(' + ')}.` : '';
}

/**
 * "Upload schedule…" — a spreadsheet is read here by rules; a PDF by the GlazeBid engine
 * (no AI).  Also takes a file dropped on the button.
 */
export function ScheduleUpload({ store, projectName, onDone, className = 'fbv1-btn' }) {
  const ref = React.useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const take = async (file) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const doc = await readScheduleFile(file, { projectName });
      const r = store.receiveSchedule(doc);
      const text = `${doc.fileName}: ${doc.report.frames} frame type(s) read` +
        (r.merged ? `, ${r.merged} merged with Studio` : '') + (doc.report.needInput ? ` — ${doc.report.needInput} need input` : '') + '.';
      setMsg({ kind: 'ok', text });
      onDone?.({ ...r, text });
    } catch (err) {
      setMsg({ kind: 'error', text: err?.message ?? String(err) });
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <span className="fbv1-upload" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer?.files?.[0]); }}>
      <input ref={ref} type="file" accept=".xlsx,.xlsm,.xls,.csv,.tsv,.pdf" style={{ display: 'none' }} onChange={(e) => take(e.target.files?.[0])} />
      <button type="button" className={className} disabled={busy} onClick={() => ref.current?.click()}
        title="Read a window / frame schedule — spreadsheet by rules, PDF by the GlazeBid engine (no AI). Merged with Studio by mark.">
        {busy ? 'Reading schedule…' : 'Upload schedule…'}
      </button>
      {msg && (msg.kind === 'error' || !onDone) && <span className={`fbv1-meta ${msg.kind === 'error' ? 'fbv1-err' : ''}`}> {msg.text}</span>}
    </span>
  );
}

export default function IncomingPanel({ takeoff, store, projectName, onClose, onBuilt, onOther }) {
  const inc = takeoff.incoming ?? { frames: [] };
  const rows = useMemo(() => inc.frames.map((p) => ({ p, st: incomingStatus(takeoff, p) })), [inc.frames, takeoff]);
  const [sel, setSel] = useState(() => new Set(inc.focus ? [inc.focus] : []));
  const [showNon, setShowNon] = useState(false);
  const buildable = rows.filter((r) => r.p.buildable !== false);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const build = (ids) => { const r = store.buildIncoming(ids); onBuilt?.(r); };

  return (
    <div className="fbv1-modal" role="dialog" aria-modal="true" aria-label="Incoming frames">
      <div className="fbv1-modal-box wide">
        <header>
          <h3>Incoming frames {inc.pdfName ? <span className="fbv1-sub">from {inc.pdfName}</span> : null}</h3>
          <button type="button" className="fbv1-x" onClick={onClose}>×</button>
        </header>
        <div className="fbv1-row">
          <span className="fbv1-sub">{sourceLine(inc)}</span>
          <span style={{ flex: 1 }} />
          <ScheduleUpload store={store} projectName={projectName} />
        </div>
        <p className="fbv1-sub">
          Size and type come from the schedule, the count from the plans, bays from the elevation; every disagreement is listed under
          "Needs your input". Bays, rows and door bays were read off
          the elevations and converted to DLO with each system's sightlines — confirm them. Frames you already built are re-synced:
          fields you never changed update; fields you changed are kept and the drawing's value is shown on the frame to accept or ignore.
        </p>
        {!rows.length && <div className="fbv1-empty small">Nothing waiting. Send frames from Studio (Finalize, or right-click a frame → Open in Frame Builder), or upload the window schedule.</div>}
        {rows.length > 0 && (
          <div className="fbv1-scroll">
            <table className="fbv1-table compact">
              <thead><tr>
                <th><input type="checkbox" checked={sel.size === buildable.length && buildable.length > 0}
                  onChange={(e) => setSel(e.target.checked ? new Set(buildable.map((r) => r.p.itemId)) : new Set())} /></th>
                <th>Mark</th><th>From</th><th>Size</th><th>Bays × rows</th><th>Doors</th><th>Qty</th><th>System</th><th>Status</th><th>Needs your input</th>
              </tr></thead>
              <tbody>
                {rows.map(({ p, st }) => {
                  const nb = p.columns?.length ?? p.panelCount ?? '?';
                  const nr = p.columns ? Math.max(...p.columns.map((c) => c.rows?.length ?? 1)) : p.rowCount ?? '?';
                  const doors = p.columns ? p.columns.filter((c) => c.kind === 'door').length : (p.doors?.length ?? 0);
                  const sheet = p.provenance?.bays?.sheet ?? p.provenance?.size?.sheet ?? (p.citations?.[0] ?? '').split(' ')[0];
                  return (
                    <tr key={p.itemId} className={`${p.buildable === false ? 'muted' : ''} ${st.key}`}>
                      <td><input type="checkbox" disabled={p.buildable === false} checked={sel.has(p.itemId)} onChange={() => toggle(p.itemId)} /></td>
                      <td><b>{p.mark}</b>{p.standaloneDoor ? <span className="fbv1-meta"> door frame</span> : null}</td>
                      <td className="fbv1-meta">{SOURCE_TAG[p.source] ?? 'Studio'}{sheet ? ` · ${sheet}` : ''}</td>
                      <td>{ft(p.overallWidth)} × {ft(p.overallHeight)}{p.sizeMode === 'ro' ? <span className="fbv1-meta"> R.O.</span> : null}</td>
                      <td>{nb} × {nr}</td>
                      <td>{doors || '—'}{p.doors?.length ? <span className="fbv1-meta"> {p.doors.map((d) => d.mark).join(', ')}</span> : null}</td>
                      <td>{p.quantity}</td>
                      <td className="fbv1-meta">{[p.manufacturer, p.frameSeries].filter(Boolean).join(' ')}{p.provenance?.system?.source && p.provenance.system.source !== 'drawing' ? ` (${p.provenance.system.source})` : ''}</td>
                      <td className={`fbv1-status-${st.key}`}>{p.buildable === false ? 'No size — measure in Studio' : st.label}</td>
                      <td className="fbv1-meta">{(p.needs ?? []).filter((n) => n.field !== 'drawing').map((n) => n.reason).join(' ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {inc.nonFrames?.length > 0 && (
          <div className="fbv1-card">
            <div className="fbv1-row">
              <button type="button" className="fbv1-btn ghost small" onClick={() => setShowNon((v) => !v)}>
                {showNon ? '▾' : '▸'} {inc.nonFrames.length} other line(s) — {routeSummary(inc.nonFrames)}
              </button>
              <span style={{ flex: 1 }} />
              {inc.nonFramesApplied
                ? <span className="fbv1-meta">Added to the takeoff ✓</span>
                : <span className="fbv1-meta">Added with Build all, or </span>}
              <button type="button" className="fbv1-btn small" onClick={() => onOther?.(store.applyIncomingNonFrames())}
                title="Glass-only lites → glass report (Other lines); mirrors, translucent, pass-thru and the rest → bid cart lines">
                {inc.nonFramesApplied ? 'Add again' : 'Add other lines now'}
              </button>
            </div>
            {showNon && (
              <table className="fbv1-table compact">
                <thead><tr><th>Item</th><th>Goes to</th><th>Qty</th><th>Description</th></tr></thead>
                <tbody>{inc.nonFrames.map((n, i) => {
                  const r = routeNonFrame(n);
                  return (
                    <tr key={i} className={r.route === 'note' ? 'muted' : ''}><td>{n.itemId}</td>
                      <td className="fbv1-meta">{ROUTE_LABEL[r.route](r, n)}</td>
                      <td>{n.quantity ?? '—'} {n.unit}</td>
                      <td className="fbv1-meta">{String(n.description ?? '').slice(0, 120)}</td></tr>
                  );
                })}</tbody>
              </table>
            )}
          </div>
        )}
        <div className="fbv1-row">
          <button type="button" className="fbv1-btn primary" disabled={!buildable.length} onClick={() => build(null)}>Build all ({buildable.length})</button>
          <button type="button" className="fbv1-btn" disabled={!sel.size} onClick={() => build([...sel])}>Build selected ({sel.size})</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="fbv1-btn ghost" disabled={!sel.size} onClick={() => { store.dismissIncoming([...sel]); setSel(new Set()); }}>Dismiss selected</button>
          <button type="button" className="fbv1-btn ghost" disabled={!rows.length} onClick={() => { if (window.confirm('Dismiss everything waiting?')) store.dismissIncoming(null); }}>Dismiss all</button>
        </div>
      </div>
    </div>
  );
}

const FIELD_LABEL = { quantity: 'Quantity', size: 'Size', systemId: 'System', finish: 'Finish', glass: 'Glass', columns: 'Bays', rows: 'Rows', bayRows: 'Bay rows' };

function showValue(field, v) {
  if (v == null) return '—';
  if (field === 'size') return `${ft(v.width)} × ${ft(v.height)}${v.mode === 'ro' ? ' R.O.' : ''}`;
  if (field === 'columns') return v.map((c) => `${c.kind === 'door' ? 'door ' : ''}${c.dlo == null ? 'EQ' : `${Math.round(c.dlo * 16) / 16}"`}`).join(' | ');
  if (field === 'rows') return v.map((d) => (d == null ? 'EQ' : `${Math.round(d * 16) / 16}"`)).join(' / ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function FromStudioBox({ spec, store, onShowInStudio }) {
  const m = spec.importMeta;
  if (!m) return null;
  const needs = (m.needs ?? []).filter((n) => n.field !== 'drawing');
  const drawingFlags = (m.needs ?? []).filter((n) => n.field === 'drawing');
  const says = m.drawingSays ?? [];
  const src = m.provenance?.bays ?? m.provenance?.size ?? {};
  return (
    <div className={`fbv1-card fbv1-import ${m.open ? 'open' : ''}`}>
      <div className="fbv1-row">
        <b>From {m.source === 'schedule' ? 'the window schedule' : m.source === 'studio+schedule' ? 'Studio + the window schedule' : 'Studio'}</b>
        <span className="fbv1-meta">{[src.sheet, m.scheduleFile, m.system?.how === 'named' ? m.system.note : null].filter(Boolean).join(' · ')}</span>
        <span style={{ flex: 1 }} />
        {onShowInStudio && m.source !== 'schedule' && <button type="button" className="fbv1-btn ghost small" onClick={() => onShowInStudio(m.itemId)} title="Open this frame's elevation, schedule row and details in Studio">Show in Studio</button>}
      </div>
      {says.length > 0 && (
        <div className="fbv1-says">
          {says.map((k) => (
            <div key={k.field} className="fbv1-row">
              <span>{FIELD_LABEL[k.field] ?? k.field}: yours <b>{showValue(k.field, k.now)}</b> — drawing now says <b>{showValue(k.field, k.drawing)}</b></span>
              <span style={{ flex: 1 }} />
              <button type="button" className="fbv1-btn small" onClick={() => store.acceptDrawing(spec.id, k.field)}>Use drawing</button>
            </div>
          ))}
        </div>
      )}
      {needs.length > 0 && <ul className="fbv1-needs">{needs.map((n, i) => <li key={i}>⚑ {n.reason}</li>)}</ul>}
      {drawingFlags.length > 0 && <details><summary className="fbv1-meta">{drawingFlags.length} note(s) from the takeoff</summary>
        <ul className="fbv1-needs">{drawingFlags.map((n, i) => <li key={i}>{n.reason}</li>)}</ul></details>}
      {m.system?.how && m.system.how !== 'named' && <p className="fbv1-meta">System: {m.system.note}</p>}
      {m.open
        ? <button type="button" className="fbv1-btn small" onClick={() => store.markReviewed(spec.id)}>Mark reviewed</button>
        : <span className="fbv1-meta">Reviewed{m.reviewedAt ? ` ${new Date(m.reviewedAt).toLocaleDateString()}` : ''}</span>}
    </div>
  );
}
