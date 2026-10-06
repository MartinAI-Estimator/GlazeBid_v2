/**
 * TakeoffBar — slim bar above the drawing: run the auto-takeoff, open the
 * Summary / Markups list, and step through the yellow flags.
 */
import { useMemo } from 'react';
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

  const flags = useMemo(() => shapes.filter(s => s.subjectRole === 'flag'), [shapes]);
  const engineCount = useMemo(() => shapes.filter(s => s.author === 'engine' && s.subjectRole !== 'flag').length, [shapes]);
  const flagIdx = flags.findIndex(f => f.id === selectedId);

  function step(d: number) {
    if (!flags.length || !engine) return;
    const i = flagIdx < 0 ? (d > 0 ? 0 : flags.length - 1) : (flagIdx + d + flags.length) % flags.length;
    engine.focusShape(flags[i].id);
  }

  const btn = 'px-2.5 py-1 rounded text-[11px] font-medium border transition-colors';
  return (
    <div className="flex items-center gap-2 px-3 h-9 bg-slate-900 border-b border-slate-800 text-xs flex-shrink-0">
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
            ⚑ {flagIdx >= 0 ? `${flagIdx + 1} / ` : ''}{flags.length} flags
          </button>
          <button onClick={() => step(1)} className={`${btn} border-amber-700/60 text-amber-300 hover:bg-amber-900/30`} title="Next flag">▶</button>
        </div>
      )}
      <button onClick={toggleSummary} className={`${btn} ${showSummary ? 'border-slate-500 text-white bg-slate-700' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>Summary</button>
      <button onClick={toggleMarkups} className={`${btn} ${showMarkups ? 'border-slate-500 text-white bg-slate-700' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>Markups List</button>
    </div>
  );
}
