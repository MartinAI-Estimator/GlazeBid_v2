/**
 * TracePanel — "click an item → every sheet it appears on".  Floats over the
 * drawing: the item's schedule row, plan tags, elevation and details in
 * reading order.  Click a line to go there; ◀ ▶ step through; "Side by side"
 * puts the next sheet in the split pane, zoomed to the same item.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useNavStore } from '../../store/useNavStore';
import { useStudioStore } from '../../store/useStudioStore';
import { useTakeoffStore } from '../../store/useTakeoffStore';
import { buildTrace, KIND_LABEL, type TraceEntry } from '../../engine/itemTrace';
import { CLASS_NAME } from '../../engine/takeoffImport';
import GlossaryText from '../ui/GlossaryText';

const KIND_COLOR: Record<string, string> = {
  schedule: 'bg-sky-900/60 text-sky-200', plan: 'bg-emerald-900/60 text-emerald-200',
  elevation: 'bg-violet-900/60 text-violet-200', detail: 'bg-amber-900/60 text-amber-200', other: 'bg-slate-800 text-slate-300',
};

export default function TracePanel({ engine }: { engine: CanvasEngineAPI | null }) {
  const itemId = useNavStore(s => s.traceItem);
  const links  = useNavStore(s => s.links);
  const result = useTakeoffStore(s => s.result);
  const shapes = useStudioStore(s => s.shapes);
  const pages  = useStudioStore(s => s.pages);
  const [idx, setIdx] = useState(0);

  const { item, entries } = useMemo(
    () => (itemId ? buildTrace(itemId, result, shapes, pages, links) : { item: null, entries: [] as TraceEntry[] }),
    [itemId, result, shapes, pages, links]);

  useEffect(() => { setIdx(0); if (itemId && entries[0]) go(entries[0]); }, [itemId]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!itemId) return null;

  function go(e: TraceEntry) {
    if (!engine) return;
    if (e.shapeIds.length === 1) { engine.focusShape(e.shapeIds[0]); return; }
    if (e.rect) { engine.focusRect(e.pageId, e.rect, e.kind === 'plan' ? 0.8 : 0.6); return; }
    useStudioStore.getState().setActivePage(e.pageId);
    engine.fitToPage();
  }
  function open(i: number) {
    if (!entries.length) return;
    const k = (i + entries.length) % entries.length;
    setIdx(k); go(entries[k]);
  }
  function sideBySide() {
    if (entries.length < 2) return;
    const nxt = entries[(idx + 1) % entries.length];
    useNavStore.getState().setSplitFocus(nxt.pageId, nxt.rect);
  }

  const qty = item?.qty != null ? `${item.qty}${item.sf_total ? ` · ${Math.round(item.sf_total)} sf` : ''}` : '';
  return (
    <div className="absolute left-2 top-2 z-20 w-80 max-h-[70%] flex flex-col rounded-lg border border-slate-700 bg-slate-900/95 shadow-2xl text-xs">
      <div className="flex items-start gap-2 px-3 py-2 border-b border-slate-800">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white truncate">{itemId}</div>
          <div className="text-slate-400 truncate">
            {item ? <GlossaryText text={CLASS_NAME[item.cls] ?? item.cls} /> : 'not in the takeoff'}{qty ? ` · ${qty}` : ''}
            {item?.alternate ? <span className="ml-1 rounded bg-fuchsia-900/60 px-1 text-fuchsia-200">{item.alternate}</span> : null}
          </div>
        </div>
        <button onClick={() => useNavStore.getState().setTraceItem(null)} className="text-slate-500 hover:text-slate-200" title="Close">✕</button>
      </div>
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-800">
        <button onClick={() => open(idx - 1)} className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800" title="Previous sheet">◀</button>
        <span className="tabular-nums text-slate-400 w-12 text-center">{entries.length ? `${idx + 1} / ${entries.length}` : '0'}</span>
        <button onClick={() => open(idx + 1)} className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800" title="Next sheet">▶</button>
        <div className="flex-1" />
        <button onClick={sideBySide} disabled={entries.length < 2}
                className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                title="Show the next sheet in the split pane">Side by side</button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto py-1">
        {entries.length === 0 && <div className="px-3 py-2 text-slate-500">No sheets found for this item.</div>}
        {entries.map((e, i) => (
          <button key={e.key} onClick={() => open(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left ${i === idx ? 'bg-sky-900/40' : 'hover:bg-slate-800/70'}`}>
            <span className={`w-16 shrink-0 rounded px-1 text-center text-[10px] ${KIND_COLOR[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
            <span className="w-12 shrink-0 font-medium text-slate-100">{e.sheet}</span>
            <span className="flex-1 truncate text-slate-400" title={e.what}>{e.what}</span>
          </button>
        ))}
        {item?.flags?.length ? (
          <div className="mx-3 mt-1 rounded border border-amber-800/60 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-300">
            {item.flags.map((f, i) => <div key={i}>⚑ {f}</div>)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
