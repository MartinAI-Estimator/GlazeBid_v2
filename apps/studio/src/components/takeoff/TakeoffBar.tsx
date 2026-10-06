/**
 * TakeoffBar — slim bar above the drawing: run the auto-takeoff, open the
 * Summary / Markups list, and step through the yellow flags.
 */
import { useMemo, useState } from 'react';
import FinalizeDialog from './FinalizeDialog';
import ComparePanel from './ComparePanel';
import { sendFramesToBuilder, useFrameLinkStore } from '../../hooks/useFrameHandoff';
import { useNavStore } from '../../store/useNavStore';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useTakeoffRunner } from '../../hooks/useTakeoffRunner';
import { useStudioStore } from '../../store/useStudioStore';
import { useTakeoffStore } from '../../store/useTakeoffStore';

export default function TakeoffBar({ engine }: { engine: CanvasEngineAPI | null }) {
  const { run }      = useTakeoffRunner(engine);
  const status       = useTakeoffStore(s => s.status);
  const error        = useTakeoffStore(s => s.error);
  const result       = useTakeoffStore(s => s.result);
  const showSummary  = useTakeoffStore(s => s.showSummary);
  const showMarkups  = useTakeoffStore(s => s.showMarkups);
  const toggleSummary = useTakeoffStore(s => s.toggleSummary);
  const toggleMarkups = useTakeoffStore(s => s.toggleMarkups);
  const pdfFileName  = useStudioStore(s => s.pdfFileName);
  const shapes       = useStudioStore(s => s.shapes);
  const selectedId   = useStudioStore(s => s.selectedShapeId);

  const flags = useMemo(() => shapes.filter(s => s.subjectRole === 'flag' && s.reviewState !== 'accepted'), [shapes]);
  const engineCount = useMemo(() => shapes.filter(s => s.author === 'engine' && s.subjectRole !== 'flag').length, [shapes]);
  const flagIdx = flags.findIndex(f => f.id === selectedId);
  const [finalizing, setFinalizing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const notice = useFrameLinkStore(s => s.notice);
  const [sending, setSending] = useState(false);
  async function sendFrames() {
    setSending(true);
    try {
      const r = await sendFramesToBuilder(engine);
      useFrameLinkStore.getState().setNotice({ kind: 'ok', text: `${r.frames} frame types sent to the Frame Builder${r.target ? ` (${r.target})` : ''} — build them from its Incoming list.` });
    } catch (e) {
      useFrameLinkStore.getState().setNotice({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally { setSending(false); }
  }
  const overlay = useNavStore(s => s.overlay);
  const splitPageId = useNavStore(s => s.splitPageId);
  const showSearch = useNavStore(s => s.showSearch);
  const activePageId = useStudioStore(s => s.activePageId);
  const pages = useStudioStore(s => s.pages);
  const showExternal = useNavStore(s => s.showExternal);
  const toggleExternal = useNavStore(s => s.toggleExternal);
  const externalCount = useMemo(() => shapes.filter(s => s.author === 'external').length, [shapes]);

  function step(d: number) {
    if (!flags.length || !engine) return;
    const i = flagIdx < 0 ? (d > 0 ? 0 : flags.length - 1) : (flagIdx + d + flags.length) % flags.length;
    engine.focusShape(flags[i].id);
  }

  const btn = 'px-2.5 py-1 rounded text-[11px] font-medium border transition-colors';
  return (
    <div className="relative flex items-center gap-2 px-3 h-9 bg-slate-900 border-b border-slate-800 text-xs flex-shrink-0">
      <button
        disabled={!pdfFileName || status === 'running'}
        onClick={() => void run()}
        className={`${btn} border-sky-700 text-sky-200 bg-sky-900/40 hover:bg-sky-800/60 disabled:opacity-40`}
        title="Run the GlazeBid auto-takeoff on this set"
      >
        {status === 'running' ? 'Taking off…' : result ? 'Re-run Auto-Takeoff' : 'Run Auto-Takeoff'}
      </button>
      {status === 'running' && <span className="text-slate-400">reading schedules, elevations, plans and details — about 1–3 minutes</span>}
      {status === 'error' && <span className="text-red-400 truncate" title={error ?? ''}>Takeoff failed: {error}</span>}
      {result && status !== 'running' && (
        <span className="text-slate-400">
          {result.items.filter(i => i.kind === 'scope').length} items · {engineCount} markups · {result.elapsed_s ? `${Math.round(result.elapsed_s)} s` : ''}
        </span>
      )}
      <div className="flex-1" />
      {flags.length > 0 && (
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className={`${btn} border-amber-700/60 text-amber-300 hover:bg-amber-900/30`} title="Previous flag">◀</button>
          <button onClick={() => step(1)} className={`${btn} border-amber-700/60 text-amber-300 hover:bg-amber-900/30`} title="Next flag">
            ⚑ {flagIdx >= 0 ? `${flagIdx + 1} / ` : ''}{flags.length} open flag{flags.length === 1 ? '' : 's'}
          </button>
          <button onClick={() => step(1)} className={`${btn} border-amber-700/60 text-amber-300 hover:bg-amber-900/30`} title="Next flag">▶</button>
        </div>
      )}
      {externalCount > 0 && (
        <button onClick={toggleExternal} title="Markups already in the PDF from Bluebeam / others — locked, not part of the takeoff"
                className={`${btn} ${showExternal ? 'border-slate-500 text-slate-200' : 'border-slate-700 text-slate-500'} hover:bg-slate-800`}>
          {showExternal ? 'Hide' : 'Show'} others' markups ({externalCount})
        </button>
      )}
      <button disabled={!pdfFileName} onClick={() => useNavStore.getState().setShowSearch(!showSearch)} title="Search text across the set (Ctrl+F)"
              className={`${btn} ${showSearch ? 'border-slate-500 text-white bg-slate-700' : 'border-slate-700 text-slate-300 hover:bg-slate-800'} disabled:opacity-40`}>Search</button>
      <button disabled={!pdfFileName} title="Show a second sheet beside this one"
              onClick={() => {
                if (splitPageId) { useNavStore.getState().setSplitPage(null); return; }
                const i = pages.findIndex(p => p.id === activePageId);
                useNavStore.getState().setSplitPage((pages[i + 1] ?? pages[i] ?? pages[0])?.id ?? null);
              }}
              className={`${btn} ${splitPageId ? 'border-slate-500 text-white bg-slate-700' : 'border-slate-700 text-slate-300 hover:bg-slate-800'} disabled:opacity-40`}>Split</button>
      <button disabled={!pdfFileName} onClick={() => setComparing(v => !v)} title="Compare against a revision / addendum"
              className={`${btn} ${comparing || overlay ? 'border-purple-500 text-purple-100 bg-purple-900/40' : 'border-slate-700 text-slate-300 hover:bg-slate-800'} disabled:opacity-40`}>
        Compare{overlay ? ` · ${overlay.label}` : ''}
      </button>
      <button onClick={toggleSummary} className={`${btn} ${showSummary ? 'border-slate-500 text-white bg-slate-700' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>Summary</button>
      <button onClick={toggleMarkups} className={`${btn} ${showMarkups ? 'border-slate-500 text-white bg-slate-700' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>Markups List</button>
      {notice && (
        <span className={`max-w-[26rem] truncate ${notice.kind === 'error' ? 'text-red-400' : 'text-emerald-300'}`} title={notice.text}
              onClick={() => useFrameLinkStore.getState().setNotice(null)}>{notice.text}</span>
      )}
      <button disabled={!result || sending} onClick={() => void sendFrames()}
              title="Send every frame type (bays, rows, doors read off the elevations) to the Frame Builder's Incoming list"
              className={`${btn} border-violet-700 text-violet-200 bg-violet-900/30 hover:bg-violet-800/50 disabled:opacity-40`}>
        {sending ? 'Sending…' : 'To Frame Builder'}
      </button>
      <button
        disabled={!pdfFileName}
        onClick={() => setFinalizing(true)}
        className={`${btn} border-emerald-700 text-emerald-200 bg-emerald-900/30 hover:bg-emerald-800/50 disabled:opacity-40`}
        title="Accept, send to the estimate, write the marked set"
      >Finalize</button>
      {finalizing && <FinalizeDialog engine={engine} onClose={() => setFinalizing(false)} />}
      <ComparePanel engine={engine} open={comparing} onClose={() => setComparing(false)} />
    </div>
  );
}
