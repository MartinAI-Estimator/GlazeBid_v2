/**
 * ComparePanel — revisions / addenda.  Pick the revised set; every sheet is
 * matched by sheet number and ranked by how much changed.  Click a sheet to lay
 * the revision over it (red = removed, green = added, purple boxes around the
 * changes).  "Changed items" re-runs the auto-takeoff on the revision and lists
 * the items added / removed / resized.
 *
 * Stays mounted (hidden when closed) so the comparison survives closing it.
 */
import { useState } from 'react';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useNavStore } from '../../store/useNavStore';
import { useStudioStore } from '../../store/useStudioStore';
import { useTakeoffStore } from '../../store/useTakeoffStore';
import { b64, projectNameOf } from '../../hooks/useSetLoader';

const SIDECAR_URL = 'http://localhost:8100';

type Pair = { sheet: string; old_page: number; new_page: number; title?: string; changed: number; removed_px: number; added_px: number };
type Sheets = { pairs: Pair[]; added: { sheet: string; new_page: number; title?: string }[]; removed: { sheet: string; old_page: number; title?: string }[]; new_project_name: string };
type ItemChange = { item: string; change: 'added' | 'removed' | 'changed'; cls?: string; qty?: number; detail?: string; label?: string };

const QUIET = 0.002;   // under 0.2 % of the ink moved = re-plot noise, not a change

async function post<T>(path: string, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SIDECAR_URL}/drawing-intelligence${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch { throw new Error('The GlazeBid engine (sidecar) is not running.'); }
  if (!res.ok) {
    let msg = await res.text();
    try { msg = (JSON.parse(msg) as { detail?: string }).detail ?? msg; } catch { /* plain text */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function pngToBitmap(base64: string): Promise<ImageBitmap> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
}

export default function ComparePanel({ engine, open, onClose }: { engine: CanvasEngineAPI | null; open: boolean; onClose: () => void }) {
  const [revName, setRevName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheets | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showQuiet, setShowQuiet] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [items, setItems] = useState<ItemChange[] | null>(null);
  const overlay = useNavStore(s => s.overlay);
  const takeoffDone = useTakeoffStore(s => !!s.result);

  const project = () => projectNameOf(useStudioStore.getState().pdfFileName);

  async function pickRevision() {
    if (!window.electron?.openPdf) { setErr('Opening files needs the desktop app.'); return; }
    const r = await window.electron.openPdf();
    if (!r.success) return;
    setErr(null); setSheets(null); setItems(null); setActiveSheet(null);
    useNavStore.getState().setOverlay(null);
    setBusy('Matching sheets and measuring changes…');
    try {
      const name = `${project()} (rev ${r.fileName.replace(/\.pdf$/i, '')})`;
      const buf = engine?.getPdfBuffer();
      // make sure the sidecar has the current set too (normally saved on open)
      if (buf) await post('/sheets', { project_name: project(), pdf_base64: b64(buf) }).catch(() => undefined);
      const s = await post<Sheets>('/compare/sheets', { project_name: project(), new_project_name: name, new_pdf_base64: b64(new Uint8Array(r.buffer)) });
      s.pairs.sort((a, b) => b.changed - a.changed);
      setSheets(s); setRevName(r.fileName);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function showOverlay(p: Pair) {
    if (!sheets) return;
    const st = useStudioStore.getState();
    const pg = st.pages.find(x => x.pdfPageIndex === p.old_page);
    if (!pg) return;
    setActiveSheet(p.sheet); setErr(null);
    setBusy(`Overlaying ${p.sheet}…`);
    try {
      const o = await post<{ png_base64: string; page_size: [number, number]; boxes: [number, number, number, number][] }>(
        '/compare/overlay', { project_name: project(), new_project_name: sheets.new_project_name, old_page: p.old_page, new_page: p.new_page, dpi: 72 });
      const bitmap = await pngToBitmap(o.png_base64);
      if (st.continuousScroll) st.toggleContinuousScroll();      // the overlay draws on the single-sheet view
      useNavStore.getState().setOverlay({ pageId: pg.id, bitmap, size: o.page_size, boxes: o.boxes, label: p.sheet });
      if (o.boxes.length) {
        const b = o.boxes.reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])] as [number, number, number, number]);
        engine?.focusRect(pg.id, b, 0.85);
      } else {
        st.setActivePage(pg.id);
        engine?.fitToPage();
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function itemChanges() {
    if (!sheets) return;
    setErr(null);
    setBusy('Running the auto-takeoff on the revision — about 1–3 minutes…');
    try {
      const r = await post<{ changes: ItemChange[] }>('/autotakeoff/diff', { project_name: project(), new_project_name: sheets.new_project_name });
      setItems(r.changes);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  function focusItem(id: string) {
    const s = useStudioStore.getState().shapes.find(x => x.itemId === id && x.author === 'engine');
    if (s) engine?.focusShape(s.id);
  }

  if (!open) return null;
  const changed = sheets?.pairs.filter(p => p.changed >= QUIET) ?? [];
  const quiet = sheets?.pairs.filter(p => p.changed < QUIET) ?? [];
  const pct = (v: number) => (v >= 0.1 ? `${Math.round(v * 100)}%` : `${(v * 100).toFixed(1)}%`);

  return (
    <div className="absolute right-2 top-10 z-30 w-96 max-h-[75vh] flex flex-col rounded-lg border border-slate-700 bg-slate-900/98 shadow-2xl text-xs">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-slate-800">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Compare revision</span>
        <div className="flex-1" />
        {overlay && <button onClick={() => { useNavStore.getState().setOverlay(null); setActiveSheet(null); }} className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800">Clear overlay</button>}
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200" title="Close">✕</button>
      </div>
      <div className="p-3 border-b border-slate-800 space-y-2">
        <button onClick={() => void pickRevision()} disabled={!!busy}
                className="w-full px-2 py-1.5 rounded border border-sky-700 text-sky-200 bg-sky-900/40 hover:bg-sky-800/60 disabled:opacity-40">
          {revName ? 'Choose another revision…' : 'Choose the revised / addendum set…'}
        </button>
        {revName && <div className="text-slate-400 truncate" title={revName}>vs <span className="text-slate-200">{revName}</span></div>}
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600 align-middle mr-1" />removed</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-600 align-middle mr-1" />added</span>
          <span><span className="inline-block w-2.5 h-2.5 border border-purple-500 border-dashed align-middle mr-1" />changed area</span>
        </div>
      </div>
      {busy && <div className="px-3 py-2 text-sky-300">{busy}</div>}
      {err && <div className="px-3 py-2 text-red-400">{err}</div>}
      {sheets && (
        <div className="flex-1 min-h-0 overflow-auto">
          <Section title={`Changed sheets (${changed.length})`}>
            {changed.length === 0 && <div className="px-3 py-1 text-slate-500">No drawing changes found.</div>}
            {changed.map(p => (
              <button key={p.sheet} onClick={() => void showOverlay(p)}
                      className={`flex w-full items-center gap-2 px-3 py-1 text-left ${activeSheet === p.sheet ? 'bg-sky-900/50 text-white' : 'text-slate-300 hover:bg-slate-800/70'}`}>
                <span className="w-14 font-medium text-slate-100">{p.sheet}</span>
                <span className="flex-1 truncate text-slate-400">{p.title}</span>
                <span className="w-16 h-1.5 rounded bg-slate-800 overflow-hidden"><span className="block h-full bg-purple-500" style={{ width: `${Math.min(100, p.changed * 400)}%` }} /></span>
                <span className="w-10 text-right tabular-nums">{pct(p.changed)}</span>
              </button>
            ))}
            {quiet.length > 0 && (
              <button onClick={() => setShowQuiet(v => !v)} className="px-3 py-1 text-slate-500 hover:text-slate-300">
                {showQuiet ? '▾' : '▸'} {quiet.length} unchanged sheet{quiet.length === 1 ? '' : 's'}
              </button>
            )}
            {showQuiet && quiet.map(p => (
              <button key={p.sheet} onClick={() => void showOverlay(p)} className="flex w-full gap-2 px-3 py-0.5 text-left text-slate-500 hover:bg-slate-800/70">
                <span className="w-14">{p.sheet}</span><span className="flex-1 truncate">{p.title}</span>
              </button>
            ))}
          </Section>
          {(sheets.added.length > 0 || sheets.removed.length > 0) && (
            <Section title="Sheets added / removed">
              {sheets.added.map(a => <div key={`a${a.sheet}`} className="px-3 py-0.5 text-green-400">+ {a.sheet} <span className="text-slate-400">{a.title}</span></div>)}
              {sheets.removed.map(r => <div key={`r${r.sheet}`} className="px-3 py-0.5 text-red-400">− {r.sheet} <span className="text-slate-400">{r.title}</span></div>)}
            </Section>
          )}
          <Section title="Changed takeoff items">
            {!items && (
              <div className="px-3 py-1">
                <button onClick={() => void itemChanges()} disabled={!!busy || !takeoffDone}
                        className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                        title={takeoffDone ? '' : 'Run the auto-takeoff on the current set first'}>
                  Re-run takeoff on the revision and list changes
                </button>
              </div>
            )}
            {items && items.length === 0 && <div className="px-3 py-1 text-slate-500">No takeoff items changed.</div>}
            {items?.map(c => (
              <button key={`${c.change}${c.item}`} onClick={() => focusItem(c.item)} className="flex w-full gap-2 px-3 py-1 text-left hover:bg-slate-800/70">
                <span className={`w-16 ${c.change === 'added' ? 'text-green-400' : c.change === 'removed' ? 'text-red-400' : 'text-amber-300'}`}>{c.change}</span>
                <span className="flex-1 text-slate-200">{c.label || c.item}<span className="block text-slate-400">{c.detail ?? (c.qty != null ? `qty ${c.qty}` : '')}</span></span>
              </button>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-800 pb-1">
      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  );
}
