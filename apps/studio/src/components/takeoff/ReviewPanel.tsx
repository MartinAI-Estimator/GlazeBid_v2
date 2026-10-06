/**
 * ReviewPanel — the right-hand review panel: Summary · Specs · Scope · Bid day.
 *
 *   Summary  totals by system, assumptions, coverage (SummaryPanel)
 *   Specs    deterministic Division 08 read + cross-check against the drawings
 *   Scope    per-job scope checklist (found / spec / decision)
 *   Bid day  the checks before Finalize
 */
import { useMemo, useState } from 'react';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import SummaryPanel from './SummaryPanel';
import GlossaryText from '../ui/GlossaryText';
import { useReviewStore, type SpecCheck, type SpecCite, type ScopeDecision } from '../../store/useReviewStore';
import { useStudioStore } from '../../store/useStudioStore';
import { useTakeoffStore } from '../../store/useTakeoffStore';
import { useNavStore } from '../../store/useNavStore';
import { b64, projectNameOf } from '../../hooks/useSetLoader';
import { scopeRows, DECISION_LABEL } from '../../engine/scopeChecklist';
import { bidDayChecks, specAckId } from '../../engine/bidDay';

const SIDECAR_URL = 'http://localhost:8100';

export default function ReviewPanel({ engine }: { engine: CanvasEngineAPI | null }) {
  const tab = useReviewStore(s => s.tab);
  const setTab = useReviewStore(s => s.setTab);
  const bidOpen = useBidDayOpenCount();
  const spec = useReviewStore(s => s.specCheck);
  const T = (id: typeof tab, label: string, badge?: number | string) => (
    <button onClick={() => setTab(id)}
            className={`flex-1 py-2 text-[11px] font-medium border-b-2 ${tab === id ? 'border-sky-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
      {label}{badge ? <span className="ml-1 rounded-full bg-amber-600/80 px-1.5 text-[9px] text-white">{badge}</span> : null}
    </button>
  );
  return (
    <aside className="w-[22rem] flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col min-h-0">
      <div className="flex border-b border-slate-800">
        {T('summary', 'Summary')}
        {T('specs', 'Specs', spec ? (spec.summary.conflict || undefined) : undefined)}
        {T('scope', 'Scope')}
        {T('bidday', 'Bid day', bidOpen || undefined)}
      </div>
      {tab === 'summary' && <SummaryPanel engine={engine} />}
      {tab === 'specs' && <SpecsTab engine={engine} />}
      {tab === 'scope' && <ScopeTab />}
      {tab === 'bidday' && <BidDayTab engine={engine} />}
    </aside>
  );
}

// ── Specs ─────────────────────────────────────────────────────────────────────

export async function runSpecCheck(engine: CanvasEngineAPI | null, book: 'keep' | 'choose' | 'none'): Promise<void> {
  const rv = useReviewStore.getState();
  const project = projectNameOf(useStudioStore.getState().pdfFileName);
  const body: Record<string, unknown> = { project_name: project, use_saved_spec: book !== 'none' };
  if (book === 'choose') {
    if (!window.electron?.openPdf) { rv.setSpecStatus('error', 'Opening files needs the desktop app.'); return; }
    const r = await window.electron.openPdf();
    if (!r.success) return;
    body.spec_pdf_base64 = b64(new Uint8Array(r.buffer));
    body.spec_name = r.fileName;
  }
  rv.setSpecStatus('running');
  const post = (b: object) => fetch(`${SIDECAR_URL}/drawing-intelligence/spec/check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  try {
    let res = await post(body);
    if (res.status === 400) {   // the sidecar hasn't saved this set yet
      const buf = engine?.getPdfBuffer();
      if (buf) await fetch(`${SIDECAR_URL}/drawing-intelligence/sheets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_name: project, pdf_base64: b64(buf) }) });
      res = await post(body);
    }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const out = await res.json() as SpecCheck;
    useReviewStore.getState().setSpecCheck(out);
    // alternates the spec check tied to takeoff items → their markups
    const alt = out.item_alternates ?? {};
    if (Object.keys(alt).length) {
      useStudioStore.setState(st => ({
        shapes: st.shapes.map(s => (s.itemId && alt[s.itemId] && !s.alternate ? { ...s, alternate: alt[s.itemId] } : s)),
      }));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    useReviewStore.getState().setSpecStatus('error', msg.includes('fetch') ? 'The GlazeBid engine (sidecar) is not running.' : msg);
  }
}

const SEV: Record<string, string> = {
  conflict: 'border-red-700/70 bg-red-950/40 text-red-200',
  check: 'border-amber-700/60 bg-amber-950/30 text-amber-200',
  info: 'border-slate-700 bg-slate-800/40 text-slate-300',
};

function CiteLink({ c, engine }: { c: SpecCite; engine: CanvasEngineAPI | null }) {
  const pages = useStudioStore(s => s.pages);
  if (c.item) {
    return <button onClick={() => useNavStore.getState().setTraceItem(c.item!)} className="text-sky-400 hover:text-sky-300">{c.item}</button>;
  }
  const onSet = c.in_drawings || (c.rect && !c.section);
  const pg = onSet && c.page != null ? pages.find(p => p.pdfPageIndex === c.page) : undefined;
  const where = `${c.section ? `${c.section} · ` : ''}${pg ? pg.label : c.page != null ? `spec p.${c.page + 1}` : ''}`;
  return (
    <div className="mt-0.5">
      {pg ? (
        <button onClick={() => (c.rect ? engine?.focusRect(pg.id, c.rect as [number, number, number, number], 0.5) : (useStudioStore.getState().setActivePage(pg.id), engine?.fitToPage()))}
                className="text-sky-400 hover:text-sky-300">{where}</button>
      ) : <span className="text-slate-500">{where}</span>}
      {c.text && <span className="text-slate-400"> — “{c.text.slice(0, 160)}{c.text.length > 160 ? '…' : ''}”</span>}
    </div>
  );
}

function SpecsTab({ engine }: { engine: CanvasEngineAPI | null }) {
  const spec = useReviewStore(s => s.specCheck);
  const status = useReviewStore(s => s.specStatus);
  const err = useReviewStore(s => s.specError);
  const ticks = useReviewStore(s => s.bidday);
  const tick = useReviewStore(s => s.tick);
  const pdfFileName = useStudioStore(s => s.pdfFileName);
  const hasResult = useTakeoffStore(s => !!s.result);
  const [showInfo, setShowInfo] = useState(true);
  const btn = 'px-2 py-1 rounded border text-[11px] disabled:opacity-40';

  return (
    <div className="flex-1 min-h-0 flex flex-col text-xs">
      <div className="px-3 py-2 border-b border-slate-800 space-y-1.5">
        <div className="flex gap-1.5">
          <button disabled={!pdfFileName || status === 'running'} onClick={() => void runSpecCheck(engine, 'choose')}
                  className={`${btn} border-sky-700 text-sky-200 bg-sky-900/40 hover:bg-sky-800/60`}>Choose spec book…</button>
          <button disabled={!pdfFileName || status === 'running'} onClick={() => void runSpecCheck(engine, 'keep')}
                  className={`${btn} border-slate-700 text-slate-300 hover:bg-slate-800`}
                  title="Re-check with the spec book already chosen (or the spec sheets / notes in the drawing set)">{spec ? 'Re-check' : 'Check drawing-set specs'}</button>
        </div>
        <div className="text-[10px] text-slate-500 leading-snug">
          Reads Division 08 (and related sections) without AI, then checks makers, series, finish, glass, hardware and cost items against the drawings{hasResult ? ' and the takeoff' : ' — run the takeoff first for the coverage checks'}.
        </div>
        {status === 'running' && <div className="text-sky-300">Reading the specs…</div>}
        {status === 'error' && <div className="text-red-400">{err}</div>}
        {spec && (
          <div className="text-[11px] text-slate-400">
            {spec.spec_name ? <span className="text-slate-200">{spec.spec_name}</span> : null} {spec.source} · {spec.cards.length} glazing section{spec.cards.length === 1 ? '' : 's'} ·{' '}
            <span className="text-red-300">{spec.summary.conflict ?? 0} conflict</span> · <span className="text-amber-300">{spec.summary.check ?? 0} to check</span> · {spec.summary.info ?? 0} notes
          </div>
        )}
      </div>
      {spec && (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="px-3 pt-2 pb-1 flex items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cross-check</span>
            <div className="flex-1" />
            <label className="flex items-center gap-1 text-[10px] text-slate-500"><input type="checkbox" checked={showInfo} onChange={e => setShowInfo(e.target.checked)} />cost notes</label>
          </div>
          <div className="px-3 space-y-1.5 pb-2">
            {spec.checks.length === 0 && <div className="text-slate-500">Nothing disagrees.</div>}
            {spec.checks.filter(c => showInfo || c.severity !== 'info').map(c => {
              const id = specAckId(c);
              return (
                <div key={id} className={`rounded border px-2 py-1.5 ${SEV[c.severity]} ${ticks[id] ? 'opacity-50' : ''}`}>
                  <div className="flex gap-2">
                    <span className="flex-1 leading-snug"><GlossaryText text={c.message} /></span>
                    {c.severity !== 'info' && (
                      <label className="flex items-start gap-1 text-[10px] text-slate-300 whitespace-nowrap" title="Answered (priced, RFI'd or in the scope letter)">
                        <input type="checkbox" checked={!!ticks[id]} onChange={e => tick(id, e.target.checked)} />done
                      </label>
                    )}
                  </div>
                  <div className="text-[10px]">
                    {c.spec.map((x, i) => <CiteLink key={`s${i}`} c={x} engine={engine} />)}
                    {c.drawings.map((x, i) => <CiteLink key={`d${i}`} c={{ ...x, in_drawings: true }} engine={engine} />)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Glazing sections</div>
          {spec.cards.map(c => (
            <div key={c.section} className="mx-3 mb-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
              <div className="flex gap-2">
                <span className="font-medium text-slate-100">{c.section}</span>
                <span className="flex-1 truncate text-slate-300" title={c.title}><GlossaryText text={c.title} /></span>
                <CiteLink c={{ page: c.page, in_drawings: c.in_drawings }} engine={engine} />
              </div>
              <Line k="Makers" v={c.manufacturers.join(', ')} />
              <Line k="Series" v={c.series.join(', ')} />
              <Line k="Equals" v={c.substitutions} />
              {c.finish.map((f, i) => <Line key={`f${i}`} k={i ? '' : 'Finish'} v={f} />)}
              {c.glass.map((g, i) => <Line key={`g${i}`} k={i ? '' : 'Glass'} v={g} />)}
              <Line k="Hardware" v={c.hardware.join(', ')} />
              <Line k="Carry" v={c.cost.map(x => x.replace('_', ' ')).join(', ')} />
            </div>
          ))}
          {spec.related.length > 0 && (
            <>
              <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Related sections (scope letter)</div>
              {spec.related.map(r => (
                <div key={r.section} className="px-3 py-0.5 text-[11px]"><span className="text-slate-200">{r.section}</span> <span className="text-slate-400">{r.note}</span></div>
              ))}
            </>
          )}
          <div className="h-3" />
        </div>
      )}
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div className="flex gap-2 text-[11px] leading-snug mt-0.5">
      <span className="w-14 shrink-0 text-slate-500">{k}</span>
      <span className="flex-1 text-slate-300"><GlossaryText text={v.length > 260 ? `${v.slice(0, 260)}…` : v} /></span>
    </div>
  );
}

// ── Scope ─────────────────────────────────────────────────────────────────────

function ScopeTab() {
  const result = useTakeoffStore(s => s.result);
  const shapes = useStudioStore(s => s.shapes);
  const spec = useReviewStore(s => s.specCheck);
  const scope = useReviewStore(s => s.scope);
  const setScope = useReviewStore(s => s.setScope);
  const setMany = useReviewStore(s => s.setScopeMany);
  const rows = useMemo(() => scopeRows(result, shapes, spec), [result, shapes, spec]);
  const undecided = rows.filter(r => !scope[r.id]?.decision);
  const opts: ScopeDecision[] = ['included', 'excluded', 'by_others', 'na'];
  return (
    <div className="flex-1 min-h-0 flex flex-col text-xs">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
        <span className="text-slate-400">{rows.length - undecided.length} of {rows.length} decided</span>
        <div className="flex-1" />
        <button disabled={!undecided.length} onClick={() => setMany(Object.fromEntries(undecided.map(r => [r.id, { ...scope[r.id], decision: r.suggestion }])))}
                className="px-2 py-1 rounded border border-slate-700 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                title="Fill every undecided line with the suggestion — then change the ones you disagree with">Accept suggestions</button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {rows.map(r => {
          const d = scope[r.id]?.decision;
          return (
            <div key={r.id} className="px-3 py-1.5 border-b border-slate-800/70">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-slate-200"><GlossaryText text={r.label} /></span>
                {r.found > 0 && <span className="rounded bg-emerald-900/50 px-1 text-[10px] text-emerald-300" title="found in the takeoff">{r.found}</span>}
                {r.sections.map(s => <span key={s} className="rounded bg-sky-900/50 px-1 text-[10px] text-sky-300" title="spec section">{s}</span>)}
                <select value={d ?? ''} onChange={e => setScope(r.id, { ...scope[r.id], decision: (e.target.value || undefined) as ScopeDecision | undefined })}
                        className={`rounded border px-1 py-0.5 text-[11px] ${d ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-amber-700/70 bg-amber-950/30 text-amber-200'}`}>
                  <option value="">{`— ${DECISION_LABEL[r.suggestion]}?`}</option>
                  {opts.map(o => <option key={o} value={o}>{DECISION_LABEL[o]}</option>)}
                </select>
              </div>
              <div className="text-[10px] text-slate-500 leading-snug" title={r.help}>{r.why}</div>
              {(d === 'excluded' || d === 'by_others' || scope[r.id]?.note) && (
                <input defaultValue={scope[r.id]?.note ?? ''} placeholder="note for the scope letter"
                       onBlur={e => setScope(r.id, { ...scope[r.id], note: e.target.value || undefined })}
                       onKeyDown={e => e.stopPropagation()}
                       className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 placeholder-slate-600" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bid day ───────────────────────────────────────────────────────────────────

export function useBidDay() {
  const result = useTakeoffStore(s => s.result);
  const shapes = useStudioStore(s => s.shapes);
  const pages = useStudioStore(s => s.pages);
  const cals = useStudioStore(s => s.calibrations);
  const spec = useReviewStore(s => s.specCheck);
  const scope = useReviewStore(s => s.scope);
  const ticks = useReviewStore(s => s.bidday);
  const sheetsReviewed = useReviewStore(s => s.sheetsReviewed);
  return useMemo(() => bidDayChecks({
    result, shapes, pages, calibrated: new Set(Object.keys(cals)), spec, scope, ticks, sheetsReviewed,
  }), [result, shapes, pages, cals, spec, scope, ticks, sheetsReviewed]);
}

function useBidDayOpenCount(): number {
  const checks = useBidDay();
  return checks.filter(c => !c.done).length;
}

export function BidDayList({ engine, compact = false }: { engine: CanvasEngineAPI | null; compact?: boolean }) {
  const checks = useBidDay();
  const tick = useReviewStore(s => s.tick);
  const setSheet = useReviewStore(s => s.setSheetReviewed);
  const setTab = useReviewStore(s => s.setTab);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      {checks.map(c => (
        <div key={c.id} className="rounded border border-slate-800">
          <div className="flex items-center gap-2 px-2 py-1">
            {c.kind === 'manual' ? (
              <input type="checkbox" checked={c.done} onChange={e => tick(c.id, e.target.checked)} />
            ) : (
              <span className={`w-4 text-center ${c.done ? 'text-emerald-400' : 'text-amber-400'}`}>{c.done ? '✓' : '●'}</span>
            )}
            <button className="flex-1 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <div className={c.done ? 'text-slate-300' : 'text-slate-100'}>{c.label}</div>
              {!compact && <div className="text-[10px] text-slate-500">{c.detail}</div>}
            </button>
            {compact && <span className="text-[10px] text-slate-500 max-w-[45%] truncate" title={c.detail}>{c.detail}</span>}
            {c.id === 'scope' && !c.done && <button onClick={() => setTab('scope')} className="text-[10px] text-sky-400">open</button>}
            {c.id === 'specs' && !c.done && <button onClick={() => setTab('specs')} className="text-[10px] text-sky-400">open</button>}
          </div>
          {open === c.id && c.targets && c.targets.length > 0 && (
            <div className="max-h-48 overflow-auto border-t border-slate-800 px-2 py-1 space-y-0.5">
              {c.targets.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  {t.ackId && (
                    <input type="checkbox" checked={!!t.done}
                           onChange={e => (t.ackId!.startsWith('sheet:') ? setSheet(t.ackId!.slice(6), e.target.checked) : tick(t.ackId!, e.target.checked))}
                           title={t.ackId.startsWith('sheet:') ? 'Looked — nothing of ours on this sheet' : 'Done'} />
                  )}
                  <button className="flex-1 text-left truncate text-slate-300 hover:text-white" title={t.label}
                          onClick={() => { if (t.shapeId) engine?.focusShape(t.shapeId); else if (t.pageId) { useStudioStore.getState().setActivePage(t.pageId); engine?.fitToPage(); } }}>
                    {t.label}
                  </button>
                  {t.ackId?.startsWith('sheet:') && <span className="text-[10px] text-slate-500">nothing ours</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BidDayTab({ engine }: { engine: CanvasEngineAPI | null }) {
  const checks = useBidDay();
  const left = checks.filter(c => !c.done).length;
  return (
    <div className="flex-1 min-h-0 flex flex-col text-xs">
      <div className="px-3 py-2 border-b border-slate-800 text-slate-400">
        {left ? <span className="text-amber-300">{left} item{left === 1 ? '' : 's'} left before Finalize</span> : <span className="text-emerald-300">Ready to finalize</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3"><BidDayList engine={engine} /></div>
    </div>
  );
}
