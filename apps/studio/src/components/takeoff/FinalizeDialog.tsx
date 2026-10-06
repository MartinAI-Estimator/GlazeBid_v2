/**
 * FinalizeDialog — Martin: "accept on finalize"; Finalize pushes to the
 * GlazeBid estimate and writes the marked PDF.
 *
 *   1. every engine markup not rejected or edited → accepted (logged)
 *   2. the takeoff → Builder's inbox (replacing an earlier finalize)
 *   3. Bluebeam-compatible marked set → save dialog
 */
import { useMemo, useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useTakeoffStore } from '../../store/useTakeoffStore';
import { inboxFromTakeoff, markupsForPdf } from '../../engine/finalize';
import { flushDecisions } from '../../hooks/useTakeoffRunner';
import { projectNameOf } from '../../hooks/useSetLoader';

const SIDECAR_URL = 'http://localhost:8100';

export default function FinalizeDialog({ onClose }: { onClose: () => void }) {
  const shapes = useStudioStore(s => s.shapes);
  const result = useTakeoffStore(s => s.result);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stats = useMemo(() => {
    const eng = shapes.filter(s => s.author === 'engine' && s.subjectRole !== 'flag');
    return {
      unreviewed: eng.filter(s => (s.reviewState ?? 'unreviewed') === 'unreviewed').length,
      edited: eng.filter(s => s.reviewState === 'edited').length,
      flags: shapes.filter(s => s.subjectRole === 'flag').length,
      mine: shapes.filter(s => s.author === 'user' && s.subject).length,
    };
  }, [shapes]);

  async function finalize() {
    setErr(null);
    const notes: string[] = [];
    try {
      // 1. accept
      setBusy('Accepting the engine markups…');
      const st = useStudioStore.getState();
      const accepted = st.shapes.filter(s => s.author === 'engine' && s.subjectRole !== 'flag' && (s.reviewState ?? 'unreviewed') === 'unreviewed');
      useStudioStore.setState(s => ({
        shapes: s.shapes.map(x => (x.author === 'engine' && (x.reviewState ?? 'unreviewed') === 'unreviewed' ? { ...x, reviewState: 'accepted' as const } : x)),
      }));
      if (accepted.length) {
        useTakeoffStore.getState().record({ action: 'accept', shapeId: '*', after: { count: accepted.length, ids: accepted.map(a => a.id), itemIds: [...new Set(accepted.map(a => a.itemId))] } });
      }
      notes.push(`${accepted.length} engine markups accepted`);
      await flushDecisions();

      // 2. estimate (Builder inbox)
      setBusy('Sending the takeoff to the estimate…');
      const st2 = useStudioStore.getState();
      const entries = inboxFromTakeoff(result, st2.shapes, st2.calibrations);
      const ps = useProjectStore.getState();
      for (const t of ps.inbox.filter(t => t.source === 'autotakeoff' || t.source === 'studio-finalize')) ps.removeTakeoff(t.id);
      for (const e of entries) ps.addTakeoff({ ...e, source: e.source === 'studio' ? 'studio-finalize' : e.source });
      notes.push(`${entries.length} takeoff lines sent to the estimate inbox`);

      // 3. marked PDF
      setBusy('Writing the marked set (Bluebeam-compatible)…');
      const payload = markupsForPdf(st2.shapes, st2.pages, st2.calibrations);
      const project = projectNameOf(st2.pdfFileName);
      const r = await fetch(`${SIDECAR_URL}/drawing-intelligence/markups/write`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: project, markups: payload, out_name: `${project} - GlazeBid takeoff.pdf` }),
      });
      if (!r.ok) throw new Error(`marked PDF: ${r.status} ${await r.text()}`);
      const j = await r.json() as { pdf_base64: string; written: number; path: string };
      const bin = atob(j.pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const save = (window as unknown as { electron?: { savePdf?: (b: Uint8Array, n: string) => Promise<{ success: boolean; filePath?: string }> } }).electron?.savePdf;
      if (save) {
        const res = await save(bytes, `${project} - GlazeBid takeoff.pdf`);
        notes.push(res?.success ? `marked set saved (${j.written} markups)` : `marked set kept at ${j.path}`);
      } else {
        notes.push(`marked set written to ${j.path}`);
      }
      setDone(notes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      if (notes.length) setDone(notes);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onMouseDown={onClose}>
      <div className="w-[26rem] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl p-4 text-sm" onMouseDown={e => e.stopPropagation()}>
        <div className="text-slate-100 font-semibold mb-2">Finalize takeoff</div>
        {!done ? (
          <>
            <ul className="text-xs text-slate-300 space-y-1 mb-3">
              <li>• {stats.unreviewed} engine markups you didn't change will be <span className="text-emerald-300">accepted</span> ({stats.edited} edited, kept as edited)</li>
              <li>• {stats.mine} markups you drew go in as your takeoff</li>
              <li>• the takeoff goes to the estimate's inbox (replacing an earlier finalize)</li>
              <li>• a Bluebeam-compatible marked set is written</li>
            </ul>
            {stats.flags > 0 && (
              <div className="text-xs text-amber-300 mb-3">⚑ {stats.flags} yellow flags are still on the drawings — check them before you bid.</div>
            )}
            {err && <div className="text-xs text-red-400 mb-2">{err}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs">Cancel</button>
              <button disabled={!!busy} onClick={() => void finalize()} className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs disabled:opacity-50">
                {busy ?? 'Finalize'}
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className="text-xs text-slate-300 space-y-1 mb-3">{done.map(d => <li key={d}>✓ {d}</li>)}</ul>
            {err && <div className="text-xs text-red-400 mb-2">{err}</div>}
            <div className="flex justify-end"><button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs">Done</button></div>
          </>
        )}
      </div>
    </div>
  );
}
