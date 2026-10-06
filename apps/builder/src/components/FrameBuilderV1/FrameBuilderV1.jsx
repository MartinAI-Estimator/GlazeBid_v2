/**
 * FrameBuilderV1 — the Parametric Frame Builder (Builder sidebar tab).
 *
 *   left    frame list by frame set (add, copy as variant, delete, reorder)
 *   center  interactive elevation + tool bar (select, glass, temper, split,
 *           merge, joints, lift line) — the drawing IS an input
 *   right   inspector: Frame · Grid · Glass · Doors · Joints · Members ·
 *           Labor · Brake · Takeoff · Job
 *   top     job totals, undo/redo, AI / JSON import, reports, send to bid cart
 *
 * Everything recomputes from the engine on every edit (per-frame results are
 * cached by spec, so big jobs stay fast).
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  buildTakeoff, edit, hydrateFrame, formatFeetInches, formatInches, getSystem,
} from '@glazebid/frame-engine/core';
import useFrameTakeoffStore from './useFrameTakeoffStore';
import FrameCanvas, { glassColorMap } from './FrameCanvas';
import {
  FramePanel, GridPanel, GlassPanel, DoorsPanel, JointsPanel, MembersPanel, LaborPanel, BrakePanel, TakeoffPanel, JobPanel,
} from './Panels';
import { REPORTS } from './reports';
import IncomingPanel, { FromStudioBox, ScheduleUpload } from './IncomingPanel';
import { laborDeps, syncToBid } from './builderBridge';
import useProductionRatesStore from '../../store/useProductionRatesStore';
import './frameBuilderV1.css';

const TOOLS = [
  { key: 'select', label: 'Select', hint: 'Click a lite, member or door to inspect it. Drag to pan, wheel to zoom.' },
  { key: 'glass', label: 'Glass', hint: 'Click lites to paint the active glass type (Glass tab).' },
  { key: 'temper', label: 'Temper', hint: 'Click a lite: auto → force tempered → force annealed → auto.' },
  { key: 'splitH', label: 'Split ─', hint: 'Click a lite to split it with a horizontal.' },
  { key: 'splitV', label: 'Split │', hint: 'Click a lite to split it with a vertical.' },
  { key: 'merge', label: 'Merge', hint: 'Click a mullion or horizontal to remove it and merge the lites.' },
  { key: 'joint', label: 'Joints', hint: 'Click a joint to flip which member runs through.' },
  { key: 'lift', label: 'Lift line', hint: 'Click (or drag) to place this frame\'s lift line.' },
];
const TABS = ['Frame', 'Grid', 'Glass', 'Doors', 'Joints', 'Members', 'Labor', 'Brake', 'Takeoff', 'Job'];
const r2 = (x) => Math.round((x ?? 0) * 100) / 100;

export default function FrameBuilderV1({ projectName, onBack, onNavigate }) {
  const store = useFrameTakeoffStore();
  const { takeoff, selectedFrameId, selection } = store;
  useEffect(() => { store.open(projectName); }, [projectName]); // eslint-disable-line react-hooks/exhaustive-deps

  const [mode, setMode] = useState('select');
  const [tab, setTab] = useState('Frame');
  const [dimMode, setDimMode] = useState('dlo');
  const [showJoints, setShowJoints] = useState(false);
  const [selectedCol, setSelectedCol] = useState(0);
  const [activeGlassId, setActiveGlassId] = useState(null);
  const [toast, setToast] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [incomingOpen, setIncomingOpen] = useState(false);
  const incomingCount = takeoff?.incoming?.frames?.length ?? 0;
  // open the Incoming list when a new hand-off arrives
  useEffect(() => { if (incomingCount) setIncomingOpen(true); }, [takeoff?.incoming?.receivedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // tell Studio what is built / needs input / waiting, with the Frame Builder quantity (decision 11)
  useEffect(() => {
    if (!takeoff || !window.electronAPI?.sendFrameStatus) return undefined;
    const t = setTimeout(() => {
      const frames = [
        ...takeoff.frames.filter((f) => f.importMeta?.itemId).map((f) => ({ itemId: f.importMeta.itemId, mark: f.mark,
          state: f.importMeta.open ? 'needs-input' : 'built', quantity: f.quantity })),
        ...(takeoff.incoming?.frames ?? []).map((p) => ({ itemId: p.itemId, mark: p.mark, state: 'incoming', quantity: p.quantity })),
      ];
      window.electronAPI.sendFrameStatus({ builderProject: projectName, frames });
    }, 800);
    return () => clearTimeout(t);
  }, [takeoff, projectName]);

  // a hand-off that arrived with no project (Studio opened on its own) goes to the project opened next
  useEffect(() => {
    if (!takeoff) return;
    const n = store.claimUnassigned();
    if (n) setToast({ kind: 'info', text: `${n} frame type(s) from Studio added to Incoming.` });
  }, [projectName, !!takeoff]); // eslint-disable-line react-hooks/exhaustive-deps
  const ratesVersion = useProductionRatesStore((s) => s.hourlyFunctionsByType);
  const cache = useRef(new Map());

  const result = useMemo(() => {
    if (!takeoff) return null;
    try { return buildTakeoff(takeoff, laborDeps(), cache.current); }
    catch (err) { console.error('[FrameBuilder] takeoff failed', err); return { error: err.message, frames: [], totals: {} }; }
  }, [takeoff, ratesVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const spec = takeoff?.frames.find((f) => f.id === selectedFrameId) ?? null;
  const frameResult = result?.frames?.find((f) => f.spec.id === selectedFrameId) ?? null;
  const colors = useMemo(() => glassColorMap(takeoff?.glassTypes), [takeoff?.glassTypes]);
  const update = useCallback((fn) => { if (spec) store.updateFrame(spec.id, fn); }, [spec?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!activeGlassId && takeoff?.glassTypes?.length) setActiveGlassId(takeoff.defaultGlassTypeId ?? takeoff.glassTypes[0].id); }, [takeoff?.glassTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input,textarea,select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
      else if (e.key === 'Escape') { setMode('select'); store.select(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } return undefined; }, [toast]);

  if (!takeoff) return <div className="fbv1"><div className="fbv1-empty">Loading takeoff…</div></div>;

  // ── canvas actions ──
  const onAction = (a) => {
    if (!spec) return;
    const solved = frameResult?.bom?.solved;
    if (a.type === 'liftLine') { update((s) => ({ ...s, liftLine: a.aff })); return; }
    if (a.type === 'lite') {
      const l = a.lite;
      setSelectedCol(Math.max(0, l.col));
      if (a.mode === 'glass' && activeGlassId) { update((s) => edit.setLiteGlass(s, l.key, activeGlassId)); return; }
      if (a.mode === 'temper') {
        const cur = spec.glass.temper[l.key];
        update((s) => edit.setLiteTemper(s, l.key, cur === undefined ? true : cur === true ? false : null));
        return;
      }
      if (a.mode === 'splitH') { update((s) => splitLiteH(s, l, solved)); return; }
      if (a.mode === 'splitV') {
        const cx = (l.dloBox.x0 + l.dloBox.x1) / 2;
        update((s) => edit.addExtraMember(s, { orient: 'v', at: Math.round(cx * 16) / 16, from: l.cellBox.y0, to: l.cellBox.y1 }));
        return;
      }
      store.select({ type: 'lite', key: l.key, col: l.col });
      if (tab !== 'Glass') setTab('Glass');
      return;
    }
    if (a.type === 'member') {
      const p = a.member;
      if (a.mode === 'merge') {
        const r = removalFor(p, a.point, solved, spec);
        if (r.error) setToast({ kind: 'warn', text: r.error }); else update(r.fn);
        return;
      }
      store.select({ type: 'member', key: p.member });
      setToast({ kind: 'info', text: `${p.member} · ${p.role} · ${formatInches(p.length)}${p.note ? ` · ${p.note}` : ''}` });
      return;
    }
    if (a.type === 'joint') {
      const j = a.joint;
      if (j.owner === 'miter') { setToast({ kind: 'warn', text: 'Mitered corners have no run-through to flip.' }); return; }
      if (a.mode === 'joint' || a.mode === 'select') update((s) => edit.toggleJoint(s, j.key, j.owner));
      return;
    }
    if (a.type === 'door') { store.select({ type: 'door', key: a.door.col, col: a.door.col }); setSelectedCol(a.door.col); setTab('Doors'); }
  };

  const liftAFF = spec ? (spec.liftLine ?? takeoff.frameSets?.[spec.frameSet]?.liftLine ?? null) : null;
  const tot = result?.totals ?? {};
  const bySet = groupFrames(takeoff.frames);
  const tool = TOOLS.find((t) => t.key === mode);

  return (
    <div className="fbv1">
      {/* ── top bar ── */}
      <header className="fbv1-top">
        <div className="fbv1-title">
          {onBack && <button type="button" className="fbv1-btn ghost" onClick={onBack}>← Back</button>}
          <h2>Frame Builder</h2>
          <span className="fbv1-proj">{projectName || 'Scratch'}</span>
        </div>
        <div className="fbv1-stats">
          <Stat label="Units" v={tot.units} /><Stat label="SF" v={r2(tot.totalSf)} />
          <Stat label="Metal LF" v={r2(tot.metalLF)} sub={`${tot.bars ?? 0} bars`} />
          <Stat label="Lites" v={tot.lites} sub={`${r2(tot.billingSf)} SF billed`} />
          <Stat label="Doors" v={tot.doors} /><Stat label="Hours" v={r2(tot.hours)} />
        </div>
        <div className="fbv1-actions">
          <button type="button" className="fbv1-btn ghost" disabled={!store.past.length} onClick={store.undo} title="Undo (Ctrl+Z)">↶</button>
          <button type="button" className="fbv1-btn ghost" disabled={!store.future.length} onClick={store.redo} title="Redo (Ctrl+Y)">↷</button>
          <button type="button" className={`fbv1-btn ${incomingCount ? 'primary' : 'ghost'}`} onClick={() => setIncomingOpen(true)}
            title="Frames sent from Studio / read from a window schedule, waiting to be built">Incoming{incomingCount ? ` (${incomingCount})` : ''}</button>
          <ScheduleUpload store={store} projectName={projectName} className="fbv1-btn ghost"
            onDone={(r) => setToast({ kind: 'ok', text: r.text })} />
          <button type="button" className="fbv1-btn ghost" onClick={() => setImportOpen(true)}>Import</button>
          <button type="button" className="fbv1-btn ghost" onClick={() => downloadJson(takeoff, projectName)}>Save file</button>
          <div className="fbv1-menu">
            <button type="button" className="fbv1-btn" onClick={() => setReportsOpen((o) => !o)}>Reports ▾</button>
            {reportsOpen && (
              <div className="fbv1-menu-list" onMouseLeave={() => setReportsOpen(false)}>
                {REPORTS.map((r) => (
                  <button key={r.key} type="button" onClick={() => {
                    setReportsOpen(false);
                    try { r.run(result, projectName, colors); }
                    catch (err) { console.error('[FrameBuilder] report failed', err); setToast({ kind: 'warn', text: `Report failed: ${err.message}` }); }
                  }}>{r.label}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="fbv1-btn primary" onClick={() => {
            const s = syncToBid(result);
            setToast({ kind: 'ok', text: `Sent ${s.synced} frame${s.synced === 1 ? '' : 's'} to the bid cart.` });
          }}>Send to Bid Cart</button>
        </div>
      </header>

      <div className="fbv1-body">
        {/* ── frame list ── */}
        <aside className="fbv1-list">
          <div className="fbv1-list-head">
            <span>Frames ({takeoff.frames.length})</span>
            <button type="button" className="fbv1-btn small" onClick={() => store.addFrame()}>+ Frame</button>
          </div>
          {Object.entries(bySet).map(([fsName, frames]) => (
            <div key={fsName} className="fbv1-set">
              <div className="fbv1-set-name">{fsName || '(no set)'}<span>{frames.reduce((s, f) => s + f.quantity, 0)} units</span></div>
              {frames.map((f) => {
                const fr = result?.frames?.find((x) => x.spec.id === f.id);
                const warn = fr?.bom?.warnings?.length ?? (fr?.error ? 1 : 0);
                return (
                  <div key={f.id} className={`fbv1-item ${f.id === selectedFrameId ? 'on' : ''}`} onClick={() => store.selectFrame(f.id)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') store.selectFrame(f.id); }}>
                    <div className="fbv1-item-main">
                      <b>{f.mark || '—'}</b><span className="fbv1-qty">×{f.quantity}</span>
                      {warn > 0 && <span className="fbv1-badge warn" title={(fr?.bom?.warnings ?? [fr?.error]).join('\n')}>{warn}</span>}
                      {f.importMeta?.open && <span className="fbv1-badge flag" title={[...(f.importMeta.drawingSays ?? []).map((k) => `Drawing now says a different ${k.field}`), ...(f.importMeta.needs ?? []).filter((n) => n.field !== 'drawing').map((n) => n.reason)].join('\n') || 'Imported — review it'}>⚑</span>}
                    </div>
                    <div className="fbv1-item-sub">{fr?.bom ? `${formatFeetInches(fr.bom.solved.width)} × ${formatFeetInches(fr.bom.solved.height)}` : '—'} · {getSystem(f.systemId).series}</div>
                    {f.id === selectedFrameId && (
                      <div className="fbv1-item-acts" onClick={(e) => e.stopPropagation()}>
                        <button type="button" title="Copy as variant" onClick={() => store.duplicateFrame(f.id)}>Copy</button>
                        <button type="button" title="Move up" onClick={() => store.moveFrame(f.id, -1)}>↑</button>
                        <button type="button" title="Move down" onClick={() => store.moveFrame(f.id, 1)}>↓</button>
                        <button type="button" className="danger" title="Delete frame" onClick={() => { if (window.confirm(`Delete frame ${f.mark}?`)) store.deleteFrame(f.id); }}>Delete</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </aside>

        {/* ── canvas ── */}
        <main className="fbv1-center">
          <div className="fbv1-tools">
            <div className="fbv1-seg tools">
              {TOOLS.map((t) => (
                <button key={t.key} type="button" className={mode === t.key ? 'on' : ''} title={t.hint} onClick={() => setMode(t.key)}>{t.label}</button>
              ))}
            </div>
            <div className="fbv1-seg">
              {[['dlo', 'DLO'], ['cl', 'CL'], ['overall', 'Overall']].map(([k, l]) => (
                <button key={k} type="button" className={dimMode === k ? 'on' : ''} onClick={() => setDimMode(k)}>{l}</button>
              ))}
            </div>
            <label className="fbv1-check"><input type="checkbox" checked={showJoints} onChange={(e) => setShowJoints(e.target.checked)} />Joints</label>
            {mode === 'glass' && (
              <select className="fbv1-input slim" value={activeGlassId ?? ''} onChange={(e) => setActiveGlassId(e.target.value)}>
                {(takeoff.glassTypes ?? []).map((g) => <option key={g.id} value={g.id}>{g.mark} — {g.description}</option>)}
              </select>
            )}
          </div>
          <div className="fbv1-canvas-wrap">
            {spec && frameResult?.bom
              ? <FrameCanvas result={{ ...frameResult.bom, spec }} glassTypes={takeoff.glassTypes} mode={mode} dimMode={dimMode} selection={selection}
                  onAction={onAction} showJoints={showJoints} liftLineAFF={liftAFF} activeGlassId={activeGlassId} />
              : <div className="fbv1-empty">{frameResult?.error ? `This frame could not be solved: ${frameResult.error}` : 'Add a frame to start.'}</div>}
          </div>
          <div className="fbv1-status">
            <span>{tool?.hint}</span>
            {frameResult?.bom && <span>{frameResult.bom.system.name} · {frameResult.bom.totals.lites} lites · {r2(frameResult.bom.totals.metalLF)} LF / frame · {r2(frameResult.labor?.total)} h / frame</span>}
          </div>
          {toast && <div className={`fbv1-toast ${toast.kind}`}>{toast.text}</div>}
        </main>

        {/* ── inspector ── */}
        <aside className="fbv1-inspector">
          <nav className="fbv1-tabs">
            {TABS.map((t) => <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}{t === 'Takeoff' && frameResult?.bom?.warnings?.length ? <i>{frameResult.bom.warnings.length}</i> : null}</button>)}
          </nav>
          <div className="fbv1-panel">
            {!spec && tab !== 'Job' && <div className="fbv1-empty small">Select a frame.</div>}
            {spec && tab === 'Frame' && <FromStudioBox spec={spec} store={store} onShowInStudio={window.electronAPI?.showInStudio ? (itemId) => window.electronAPI.showInStudio({ itemId, builderProject: projectName }) : null} />}
            {spec && tab === 'Frame' && <FramePanel spec={spec} update={update} takeoff={takeoff} setFrameSet={store.setFrameSet} />}
            {spec && tab === 'Grid' && <GridPanel spec={spec} result={frameResult?.bom} update={update} selectedCol={selectedCol} setSelectedCol={setSelectedCol} />}
            {spec && tab === 'Glass' && <GlassPanel spec={spec} update={update} takeoff={takeoff} store={store} result={frameResult?.bom} selection={selection} activeGlassId={activeGlassId} setActiveGlassId={(id) => { setActiveGlassId(id); setMode('glass'); }} />}
            {spec && tab === 'Doors' && <DoorsPanel spec={spec} update={update} result={frameResult?.bom} takeoff={takeoff} />}
            {spec && tab === 'Joints' && <JointsPanel spec={spec} update={update} result={frameResult?.bom} />}
            {spec && tab === 'Members' && <MembersPanel spec={spec} update={update} result={frameResult?.bom} />}
            {spec && tab === 'Labor' && <LaborPanel spec={spec} update={update} frameResult={frameResult} />}
            {spec && tab === 'Brake' && <BrakePanel spec={spec} update={update} frameResult={frameResult} />}
            {spec && tab === 'Takeoff' && <TakeoffPanel frameResult={frameResult} />}
            {tab === 'Job' && <JobPanel takeoff={takeoff} store={store} />}
          </div>
        </aside>
      </div>

      {incomingOpen && <IncomingPanel takeoff={takeoff} store={store} projectName={projectName} onClose={() => setIncomingOpen(false)} onBuilt={(r) => {
        setIncomingOpen(false); setTab('Frame');
        setToast({ kind: r.kept ? 'warn' : 'ok', text: `Built ${r.added} new frame(s), updated ${r.updated}${r.kept ? `; ${r.kept} frame(s) you edited have drawing changes to review (⚑)` : ''}${r.glassTypes ? `; ${r.glassTypes} glass type(s) added from the specs` : ''}.` });
      }} />}
      {importOpen && <ImportDialog takeoff={takeoff} onClose={() => setImportOpen(false)} onFrames={(specs, notes) => {
        store.addFrames(specs); setImportOpen(false);
        setToast({ kind: notes.length ? 'warn' : 'ok', text: `Imported ${specs.length} frame(s).${notes.length ? ` ${notes.length} field(s) need your input — see each frame's notes.` : ''}` });
      }} onTakeoff={(tp) => { store.replace(tp); setImportOpen(false); setToast({ kind: 'ok', text: 'Takeoff file loaded.' }); }} />}
    </div>
  );
}

function Stat({ label, v, sub }) {
  return <div className="fbv1-stat"><span>{label}</span><b>{v ?? 0}</b>{sub && <em>{sub}</em>}</div>;
}

function groupFrames(frames) {
  const m = {};
  for (const f of frames) (m[f.frameSet] ??= []).push(f);
  return m;
}

/** Split a lite with a horizontal: its row becomes two rows in that bay. */
function splitLiteH(spec, lite, solved) {
  const col = lite.col;
  const colSolved = solved.columns[col];
  if (!colSolved || colSolved.base == null) return spec;
  const rows = (spec.bayRows?.[col] ?? (spec.columns[col]?.kind === 'door' ? [{ dlo: null }] : spec.rows)).map((r) => ({ ...r }));
  // which row is this lite? count lites in the column below it
  const below = solved.lites.filter((l) => l.col === col && l.dloBox.y0 < lite.dloBox.y0 - 1e-6 && Math.abs(l.dloBox.x0 - lite.dloBox.x0) < 1e-3).length;
  const idx = Math.min(below, rows.length - 1);
  const hSL = solved.es.profiles.horizontal.sightline;
  const r = rows[idx];
  const parts = r.dlo == null ? [{ dlo: null }, { dlo: null }] : [{ dlo: Math.round(((r.dlo - hSL) / 2) * 16) / 16 }, { dlo: null }];
  rows.splice(idx, 1, ...parts);
  return { ...spec, bayRows: { ...spec.bayRows, [col]: rows } };
}

/** What "remove this member" means for each kind of member. */
function removalFor(piece, point, solved, spec) {
  const key = String(piece.member);
  if (piece.perimeter) return { error: 'Perimeter members can\'t be removed — change the shape instead.' };
  if (key.startsWith('SS')) return { error: 'That is a stepped sill — set the bay\'s sill step to 0 on the Grid tab.' };
  if (key.startsWith('DH')) return { error: 'That is a door header — change the bay type on the Grid tab.' };
  if (key.startsWith('X')) return { fn: (s) => ({ ...s, extraMembers: s.extraMembers.filter((m) => m.key !== key.replace(/[a-z]$/, '')) }) };
  if (piece.orient === 'h') {
    const keys = key.split('+');
    return { fn: (s) => keys.reduce((acc, k) => edit.removeMember(acc, k), s) };
  }
  // vertical: remove only the stretch between the horizontals around the click
  const vKey = key.replace(/[a-z]$/, '');
  const v = solved.verticals.find((vv) => vv.key === key || vv.line === vKey);
  const x = v?.x ?? piece.x;
  const touching = solved.horizontals.filter((h) => h.x0 <= x + 1e-3 && h.x1 >= x - 1e-3);
  const y = point?.y ?? (piece.y0 + piece.y1) / 2;
  const below = touching.filter((h) => h.y < y).sort((a, b) => b.y - a.y)[0];
  const above = touching.filter((h) => h.y > y).sort((a, b) => a.y - b.y)[0];
  return { fn: (s) => edit.removeMember(s, { v: vKey, from: below?.key ?? 'BOT', to: above?.key ?? 'TOP' }) };
}

function downloadJson(takeoff, projectName) {
  const blob = new Blob([JSON.stringify(takeoff, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${(projectName || 'takeoff').replace(/[^\w-]+/g, '_')}.gbframes.json` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Import: an AI extraction payload (one object or an array — the Cowork
 * context §4 schema), or a whole saved takeoff file.
 */
function ImportDialog({ takeoff, onClose, onFrames, onTakeoff }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const parse = (raw) => {
    setError(null); setPreview(null);
    let data;
    try { data = JSON.parse(raw); } catch (err) { setError(`Not valid JSON: ${err.message}`); return; }
    if (data?.schema === 'glazebid.takeoff/1') { setPreview({ takeoff: data }); return; }
    const list = Array.isArray(data) ? data : Array.isArray(data?.frames) ? data.frames : [data];
    const glassFor = (txt) => {
      if (!txt) return null;
      const t = String(txt).toLowerCase();
      return (takeoff.glassTypes ?? []).find((g) => t.includes(String(g.mark).toLowerCase()) || t.includes(String(g.description).toLowerCase()))?.id ?? null;
    };
    const out = list.map((p) => hydrateFrame(p, { glassTypeIdFor: glassFor }));
    setPreview({ frames: out });
  };
  return (
    <div className="fbv1-modal" role="dialog" aria-modal="true" aria-label="Import frames">
      <div className="fbv1-modal-box">
        <header><h3>Import frames</h3><button type="button" className="fbv1-x" onClick={onClose}>×</button></header>
        <p className="fbv1-sub">Paste the AI frame extraction JSON (one frame or a list), or open a saved <code>.gbframes.json</code> takeoff file.</p>
        <textarea className="fbv1-input area mono" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "mark": "AS1", "systemType": "storefront", "overallWidth": 118, ... }' />
        <div className="fbv1-row">
          <button type="button" className="fbv1-btn" onClick={() => parse(text)}>Read</button>
          <button type="button" className="fbv1-btn ghost" onClick={() => fileRef.current?.click()}>Open file…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setText(t); parse(t); } }} />
        </div>
        {error && <p className="fbv1-warn">{error}</p>}
        {preview?.takeoff && (
          <div className="fbv1-card">
            <b>Saved takeoff: {preview.takeoff.name}</b> — {preview.takeoff.frames?.length ?? 0} frames. Loading replaces the current takeoff (undo is available).
            <div className="fbv1-row"><button type="button" className="fbv1-btn primary" onClick={() => onTakeoff(preview.takeoff)}>Load takeoff</button></div>
          </div>
        )}
        {preview?.frames && (
          <div className="fbv1-card">
            <table className="fbv1-table compact">
              <thead><tr><th>Mark</th><th>Size</th><th>Bays × rows</th><th>Needs your input</th></tr></thead>
              <tbody>{preview.frames.map((h, i) => (
                <tr key={i}><td>{h.spec.mark}</td><td>{formatFeetInches(h.spec.size.width)} × {formatFeetInches(h.spec.size.height)}</td>
                  <td>{h.spec.columns.length} × {h.spec.rows.length}</td>
                  <td className="fbv1-meta">{h.needsInput.map((n) => n.reason).join(' ') || '—'}</td></tr>
              ))}</tbody>
            </table>
            <div className="fbv1-row">
              <button type="button" className="fbv1-btn primary" onClick={() => {
                const notes = preview.frames.flatMap((h) => h.needsInput);
                const specs = preview.frames.map((h) => ({ ...h.spec, notes: [h.spec.notes, h.needsInput.length ? `NEEDS INPUT: ${h.needsInput.map((n) => n.reason).join(' ')}` : null].filter(Boolean).join('\n') }));
                onFrames(specs, notes);
              }}>Build {preview.frames.length} frame(s)</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
