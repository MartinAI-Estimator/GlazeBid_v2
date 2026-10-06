/**
 * ReviewPopovers — the two small prompts of the review flow:
 *
 *  QtyEditor     double-click a markup → type its quantity (Thus count, length
 *                or area).  When the markup's item has other markups of the same
 *                kind, asks "apply to all N?" (Martin: ask each time).
 *  RejectPrompt  deleting an engine markup from the menu / Properties asks why,
 *                one click (Delete key skips it).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { useTakeoffStore, REJECT_REASONS } from '../../store/useTakeoffStore';
import { DEFAULT_PDF_PPI } from '../../engine/coordinateSystem';
import { measure, fmtFtIn } from '../../engine/shapeGeometry';
import { parseArchitecturalString } from '../../utils/measurementParser';

export function QtyEditor() {
  const pending = useStudioStore(s => s.pendingQtyEdit);
  const shape   = useStudioStore(s => s.shapes.find(x => x.id === s.pendingQtyEdit?.shapeId));
  const ppi     = useStudioStore(s => (shape ? s.calibrations[shape.pageId]?.pixelsPerInch : undefined) ?? DEFAULT_PDF_PPI);
  const close   = () => useStudioStore.getState().setPendingQtyEdit(null);
  const [draft, setDraft] = useState('');
  const [ask, setAsk] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const role = shape?.subjectRole ?? (shape?.type === 'polyline' ? 'polylength' : shape?.type === 'marker' ? 'count' : 'area');
  const siblings = useMemo(() => {
    if (!shape?.itemId) return [];
    return useStudioStore.getState().shapes.filter(x => x.itemId === shape.itemId && x.id !== shape.id && (x.subjectRole ?? '') === (shape.subjectRole ?? ''));
  }, [shape]);

  useEffect(() => {
    if (!shape) return;
    const m = measure(shape, ppi);
    const cur = shape.qtyOverride ?? (role === 'polylength' || role === 'line' ? m.lengthIn : role === 'count' ? 1 : m.areaSf);
    setDraft(cur === undefined ? '' : role === 'polylength' || role === 'line' ? fmtFtIn(cur) : String(Math.round(cur * 100) / 100));
    setAsk(null);
    setTimeout(() => ref.current?.select(), 0);
  }, [pending?.shapeId]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!pending || !shape) return null;

  function parse(): number | null {
    const t = draft.trim();
    if (!t) return null;
    if (role === 'polylength' || role === 'line') {
      // a bare number is feet (LF, the way estimators think); 12'-6" / 150" parse as written
      if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t) * 12;
      const v = parseArchitecturalString(t);
      return Number.isNaN(v) ? null : v;
    }
    const n = parseFloat(t.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function apply(all: boolean) {
    const v = parse();
    const st = useStudioStore.getState();
    const ids = [shape!.id, ...(all ? siblings.map(x => x.id) : [])];
    st.beginEdit();
    for (const id of ids) {
      const x = st.shapes.find(y => y.id === id);
      if (x) st.replaceShapeLive({ ...x, qtyOverride: v });
    }
    st.endEdit();   // the decision logger records the change when the edit ends
    close();
  }

  function commit() {
    if (siblings.length > 0 && ask === null) { setAsk(siblings.length + 1); return; }
    apply(false);
  }

  const unit = role === 'polylength' || role === 'line' ? 'length (12\'-6" or LF)' : role === 'count' ? 'count (Thus)' : 'area (sf)';
  return (
    <div className="fixed z-50" style={{ left: pending.screenX + 8, top: pending.screenY + 8 }}>
      <div className="rounded-md border border-slate-600 bg-slate-900 shadow-xl p-2 w-64 text-xs">
        <div className="text-slate-400 mb-1 truncate">{shape.subject ?? 'Markup'} — {unit}</div>
        <input
          ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') close(); e.stopPropagation(); }}
          className="w-full rounded bg-slate-800 border border-slate-600 px-2 py-1 text-slate-100 focus:outline-none focus:border-sky-500"
        />
        {ask !== null ? (
          <div className="mt-2 space-y-1">
            <div className="text-slate-300">{shape.itemId} has {ask} {role === 'count' ? 'counts' : 'markups'} like this. Apply to:</div>
            <div className="flex gap-1">
              <button onClick={() => apply(true)} className="flex-1 rounded bg-sky-800 hover:bg-sky-700 text-white py-1">All {ask}</button>
              <button onClick={() => apply(false)} className="flex-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 py-1">Just this one</button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex justify-between items-center">
            <button onClick={() => { setDraft(''); apply(false); }} className="text-slate-400 hover:text-slate-200">Clear typed value</button>
            <button onClick={commit} className="rounded bg-sky-800 hover:bg-sky-700 text-white px-3 py-1">Set</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function RejectPrompt() {
  const p = useTakeoffStore(s => s.rejectPrompt);
  const [other, setOther] = useState('');
  if (!p) return null;
  const close = () => useTakeoffStore.getState().setRejectPrompt(null);
  function reject(reason: string) {
    useTakeoffStore.getState().setPendingReason(p!.shapeId, reason);
    useStudioStore.getState().removeShape(p!.shapeId);
    setOther('');
    close();
  }
  return (
    <div className="fixed inset-0 z-50" onMouseDown={close}>
      <div className="absolute rounded-md border border-slate-600 bg-slate-900 shadow-xl p-2 w-56 text-xs"
           style={{ left: Math.min(p.screenX, window.innerWidth - 240), top: Math.min(p.screenY, window.innerHeight - 280) }}
           onMouseDown={e => e.stopPropagation()}>
        <div className="text-slate-300 mb-1">Why remove it? (helps the engine learn)</div>
        {REJECT_REASONS.filter(r => r !== 'Other').map(r => (
          <button key={r} onClick={() => reject(r)} className="w-full text-left px-2 py-1 rounded text-slate-200 hover:bg-slate-800">{r}</button>
        ))}
        <div className="flex gap-1 mt-1">
          <input value={other} onChange={e => setOther(e.target.value)} placeholder="Other…"
                 onKeyDown={e => { if (e.key === 'Enter' && other.trim()) reject(other.trim()); e.stopPropagation(); }}
                 className="flex-1 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-slate-100 focus:outline-none" />
          <button onClick={() => reject(other.trim() || 'Other')} className="rounded bg-slate-700 px-2 text-slate-100">OK</button>
        </div>
        <button onClick={() => reject('deleted (no reason given)')} className="mt-1 w-full text-center text-slate-500 hover:text-slate-300">Skip — just delete</button>
      </div>
    </div>
  );
}
