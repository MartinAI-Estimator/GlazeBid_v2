/**
 * SearchPanel — Ctrl+F text search across the whole drawing set (the sidecar
 * reads the PDF text).  Hits are grouped by sheet; click one to zoom to it;
 * Enter / Shift+Enter step through them.  Hits are boxed on the drawing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useNavStore, type SearchHit } from '../../store/useNavStore';
import { useStudioStore } from '../../store/useStudioStore';
import { b64, projectNameOf } from '../../hooks/useSetLoader';

const SIDECAR_URL = 'http://localhost:8100';

export async function searchSet(engine: CanvasEngineAPI | null, query: string): Promise<SearchHit[]> {
  const project = projectNameOf(useStudioStore.getState().pdfFileName);
  const post = (body: object) => fetch(`${SIDECAR_URL}/drawing-intelligence/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let res = await post({ project_name: project, query });
  if (res.status === 400) {               // the sidecar hasn't seen this set yet — send it
    const buf = engine?.getPdfBuffer();
    if (!buf) throw new Error('Open a drawing set first.');
    res = await post({ project_name: project, query, pdf_base64: b64(buf) });
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return ((await res.json()) as { hits: SearchHit[] }).hits;
}

export default function SearchPanel({ engine }: { engine: CanvasEngineAPI | null }) {
  const show      = useNavStore(s => s.showSearch);
  const hits      = useNavStore(s => s.searchHits);
  const active    = useNavStore(s => s.activeHit);
  const lastQuery = useNavStore(s => s.searchQuery);
  const pages     = useStudioStore(s => s.pages);
  const [q, setQ] = useState(lastQuery);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (show) setTimeout(() => input.current?.select(), 0); }, [show]);

  const groups = useMemo(() => {
    const m = new Map<number, { page: number; label: string; items: { hit: SearchHit; i: number }[] }>();
    hits.forEach((hit, i) => {
      const g = m.get(hit.page) ?? { page: hit.page, label: pages.find(p => p.pdfPageIndex === hit.page)?.label ?? `p${hit.page + 1}`, items: [] };
      g.items.push({ hit, i }); m.set(hit.page, g);
    });
    return [...m.values()].sort((a, b) => a.page - b.page);
  }, [hits, pages]);

  if (!show) return null;

  async function go() {
    const k = q.trim();
    if (!k) { useNavStore.getState().setSearch('', []); return; }
    setBusy(true); setErr(null);
    try {
      useNavStore.getState().setSearch(k, await searchSet(engine, k));
    } catch (e) {
      setErr(e instanceof Error ? (e.message.includes('fetch') ? 'The GlazeBid engine (sidecar) is not running.' : e.message) : String(e));
    } finally { setBusy(false); }
  }

  function open(i: number) {
    const h = useNavStore.getState().searchHits[i];
    if (!h) return;
    const pg = useStudioStore.getState().pages.find(p => p.pdfPageIndex === h.page);
    if (!pg) return;
    useNavStore.getState().setActiveHit(i);
    engine?.focusRect(pg.id, h.rect, 0.25);
  }

  function step(d: number) {
    if (!hits.length) return;
    open(active < 0 ? (d > 0 ? 0 : hits.length - 1) : (active + d + hits.length) % hits.length);
  }

  function close() {
    useNavStore.getState().setShowSearch(false);
    useNavStore.getState().setSearch('', []);
  }

  return (
    <aside className="w-72 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col text-xs">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-slate-800">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Search set</span>
        <div className="flex-1" />
        <button onClick={close} className="text-slate-500 hover:text-slate-200" title="Close (Esc)">✕</button>
      </div>
      <div className="p-2 border-b border-slate-800 flex gap-1">
        <input
          ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Text on any sheet…"
          onKeyDown={e => {
            e.stopPropagation();          // keep tool shortcuts off while typing
            if (e.key === 'Enter') { if (q.trim() === lastQuery && hits.length) step(e.shiftKey ? -1 : 1); else void go(); }
            if (e.key === 'Escape') close();
          }}
          className="flex-1 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-600"
        />
        <button onClick={() => void go()} disabled={busy} className="px-2 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40">{busy ? '…' : 'Find'}</button>
      </div>
      {err && <div className="px-3 py-2 text-red-400">{err}</div>}
      {lastQuery && !busy && !err && (
        <div className="flex items-center gap-1 px-3 py-1 text-slate-400 border-b border-slate-800">
          <span>{hits.length} hit{hits.length === 1 ? '' : 's'} on {groups.length} sheet{groups.length === 1 ? '' : 's'}</span>
          <div className="flex-1" />
          {hits.length > 0 && <>
            <button onClick={() => step(-1)} className="px-1.5 rounded hover:bg-slate-800" title="Previous (Shift+Enter)">▲</button>
            <span className="tabular-nums">{active >= 0 ? active + 1 : '–'}/{hits.length}</span>
            <button onClick={() => step(1)} className="px-1.5 rounded hover:bg-slate-800" title="Next (Enter)">▼</button>
          </>}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        {groups.map(g => (
          <div key={g.page}>
            <div className="sticky top-0 bg-slate-900/95 px-3 py-1 text-[11px] font-semibold text-sky-300">{g.label} <span className="text-slate-500 font-normal">({g.items.length})</span></div>
            {g.items.map(({ hit, i }) => (
              <button key={i} onClick={() => open(i)}
                      className={`block w-full text-left px-3 py-1 leading-snug ${i === active ? 'bg-sky-900/50 text-white' : 'text-slate-300 hover:bg-slate-800/70'}`}>
                <Highlighted text={hit.context} q={lastQuery} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

function Highlighted({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || !q) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="bg-amber-400/80 text-slate-900 rounded-sm px-0.5">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}
