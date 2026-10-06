/**
 * MarkupsList — Bluebeam-style markups list along the bottom: every markup
 * with subject, sheet, measurement, author and review state; totals by
 * subject; filters; click a row to go to it; export to CSV.
 */
import { useMemo, useState } from 'react';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useStudioStore } from '../../store/useStudioStore';
import { useNavStore } from '../../store/useNavStore';
import { DEFAULT_PDF_PPI } from '../../engine/coordinateSystem';
import { measure, fmtFtIn, fmtSf } from '../../engine/shapeGeometry';
import type { DrawnShape } from '../../types/shapes';

type Row = {
  id: string; subject: string; sheet: string; kind: string; qty: string; qtyNum: number; unit: string;
  author: string; state: string; item: string; note: string; alt: string;
};

export default function MarkupsList({ engine }: { engine: CanvasEngineAPI | null }) {
  const shapes = useStudioStore(s => s.shapes);
  const pages  = useStudioStore(s => s.pages);
  const cals   = useStudioStore(s => s.calibrations);
  const selectedId = useStudioStore(s => s.selectedShapeId);
  const [q, setQ] = useState('');
  const [who, setWho] = useState<'all' | 'engine' | 'user' | 'external'>('all');
  const [hideFlags, setHideFlags] = useState(false);
  const [byTotals, setByTotals] = useState(false);

  const rows = useMemo<Row[]>(() => shapes.map(s => toRow(s, pages, cals)), [shapes, pages, cals]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter(r =>
      (who === 'all' || r.author === who) &&
      (!hideFlags || r.kind !== 'flag') &&
      (!k || `${r.subject} ${r.sheet} ${r.item} ${r.note}`.toLowerCase().includes(k)));
  }, [rows, q, who, hideFlags]);

  const totals = useMemo(() => {
    const m = new Map<string, { subject: string; n: number; qty: number; unit: string }>();
    for (const r of shown) {
      if (r.kind === 'flag') continue;
      const key = r.alt ? `${r.subject} [${r.alt}]` : r.subject;
      const t = m.get(key) ?? { subject: key, n: 0, qty: 0, unit: r.unit };
      t.n += 1; t.qty += r.qtyNum; m.set(key, t);
    }
    return [...m.values()].sort((a, b) => a.subject.localeCompare(b.subject));
  }, [shown]);

  function exportCsv() {
    const head = ['Subject', 'Sheet', 'Measurement', 'Quantity', 'Unit', 'Item', 'Alternate', 'Author', 'Status', 'Note'];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [head.join(','), ...shown.map(r => [r.subject, r.sheet, r.qty, String(r.qtyNum), r.unit, r.item, r.alt, r.author, r.state, r.note].map(esc).join(','))];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${useStudioStore.getState().pdfFileName?.replace(/\.pdf$/i, '') ?? 'markups'} - markups.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="h-56 flex-shrink-0 bg-slate-900 border-t border-slate-800 flex flex-col text-xs">
      <div className="flex items-center gap-2 px-3 h-8 border-b border-slate-800">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Markups</span>
        <span className="text-slate-500">{shown.length} of {rows.length}</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter subject, sheet, item…"
               className="ml-2 w-56 rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none" />
        <select value={who} onChange={e => setWho(e.target.value as typeof who)} className="rounded bg-slate-800 border border-slate-700 px-1 py-0.5 text-xs text-slate-200">
          <option value="all">Everyone</option><option value="engine">Engine</option><option value="user">Mine</option><option value="external">Others (Bluebeam)</option>
        </select>
        <label className="flex items-center gap-1 text-slate-400"><input type="checkbox" checked={hideFlags} onChange={e => setHideFlags(e.target.checked)} />hide flags</label>
        <label className="flex items-center gap-1 text-slate-400"><input type="checkbox" checked={byTotals} onChange={e => setByTotals(e.target.checked)} />totals by subject</label>
        <div className="flex-1" />
        <button onClick={exportCsv} className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800">Export CSV</button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {byTotals ? (
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-900 text-[10px] text-slate-500"><tr><th className="text-left px-3 py-1">Subject</th><th className="text-right px-3">Markups</th><th className="text-right px-3">Quantity</th></tr></thead>
            <tbody>
              {totals.map(t => (
                <tr key={t.subject} className="border-t border-slate-800/70">
                  <td className="px-3 py-0.5 text-slate-200">{t.subject}</td>
                  <td className="px-3 text-right tabular-nums text-slate-300">{t.n}</td>
                  <td className="px-3 text-right tabular-nums text-slate-300">{t.unit === 'LF' ? fmtFtIn(t.qty * 12) : `${t.unit === 'SF' ? fmtSf(t.qty) : t.qty} ${t.unit}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-900 text-[10px] text-slate-500">
              <tr><th className="text-left px-3 py-1">Subject</th><th className="text-left px-2">Sheet</th><th className="text-left px-2">Measurement</th><th className="text-left px-2">Item</th><th className="text-left px-2">Author</th><th className="text-left px-2">Status</th><th className="text-left px-2">Note</th></tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} onClick={() => engine?.focusShape(r.id)}
                    className={`border-t border-slate-800/70 cursor-pointer ${r.id === selectedId ? 'bg-sky-900/40' : 'hover:bg-slate-800/60'}`}>
                  <td className="px-3 py-0.5 text-slate-200 whitespace-nowrap">{r.kind === 'flag' ? <span className="text-amber-400">⚑ </span> : null}{r.subject}</td>
                  <td className="px-2 text-slate-300 whitespace-nowrap">{r.sheet}</td>
                  <td className="px-2 text-slate-300 tabular-nums whitespace-nowrap">{r.qty}</td>
                  <td className="px-2 whitespace-nowrap">
                    {r.item && <button onClick={e => { e.stopPropagation(); useNavStore.getState().setTraceItem(r.item); }} className="text-slate-300 hover:text-sky-300" title="Every sheet this item is on">{r.item}</button>}
                    {r.alt && <span className="ml-1 rounded bg-fuchsia-900/60 px-1 text-[10px] text-fuchsia-200">{r.alt}</span>}
                  </td>
                  <td className="px-2 text-slate-400">{r.author}</td>
                  <td className="px-2 text-slate-400">{r.state}</td>
                  <td className="px-2 text-slate-500 truncate max-w-[28rem]" title={r.note}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function toRow(s: DrawnShape, pages: { id: string; label: string }[], cals: Record<string, { pixelsPerInch: number }>): Row {
  const ppi = cals[s.pageId]?.pixelsPerInch ?? DEFAULT_PDF_PPI;
  const m = measure(s, ppi);
  let qty = '', qtyNum = 0, unit = 'EA';
  const role = s.subjectRole ?? (s.type === 'polyline' || s.type === 'line' ? 'polylength' : s.type === 'marker' ? 'count' : 'area');
  if (role === 'polylength' || role === 'line') {
    const L = s.qtyOverride ?? m.lengthIn ?? 0;
    qty = fmtFtIn(L); qtyNum = L / 12; unit = 'LF';
  } else if (role === 'count' || role === 'flag') {
    qtyNum = s.qtyOverride ?? 1; qty = `${qtyNum}`; unit = 'EA';
  } else {
    const A = s.qtyOverride ?? m.areaSf ?? 0;
    qty = `${fmtSf(A)} sf${m.wIn !== undefined ? `  (${fmtFtIn(m.wIn)} × ${fmtFtIn(m.hIn ?? 0)})` : ''}`;
    qtyNum = role === 'highlight' ? 0 : A; unit = role === 'highlight' ? 'EA' : 'SF';
    if (role === 'highlight') { qty = 'highlight'; qtyNum = 1; }
  }
  return {
    id: s.id,
    subject: s.subject ?? (s.type === 'polyline' ? 'Polylength' : s.type),
    sheet: pages.find(p => p.id === s.pageId)?.label ?? '',
    kind: role, qty, qtyNum, unit,
    author: s.author === 'engine' ? 'engine' : s.author === 'external' ? 'external' : 'user',
    state: s.author === 'engine' ? (s.reviewState ?? 'unreviewed') : '',
    item: s.itemId ?? '',
    alt: s.alternate ?? '',
    note: s.note ?? s.label ?? '',
  };
}
