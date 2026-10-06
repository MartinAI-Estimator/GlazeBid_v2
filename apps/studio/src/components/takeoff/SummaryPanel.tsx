/**
 * SummaryPanel — where review starts (Martin, 2026-10-06): totals by system,
 * assumptions with their sheet citations, sheet coverage, and the flag count.
 * Click any line to go to its markup on the drawings.
 */
import { useMemo, useState } from 'react';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useStudioStore } from '../../store/useStudioStore';
import { useTakeoffStore } from '../../store/useTakeoffStore';
import { systemTotals, CLASS_NAME, type EngineItem } from '../../engine/takeoffImport';
import { useNavStore } from '../../store/useNavStore';
import GlossaryText from '../ui/GlossaryText';

export default function SummaryPanel({ engine }: { engine: CanvasEngineAPI | null }) {
  const result = useTakeoffStore(s => s.result);
  const log    = useTakeoffStore(s => s.log);
  const shapes = useStudioStore(s => s.shapes);
  const [open, setOpen] = useState<string | null>(null);

  const totals = useMemo(() => (result ? systemTotals(result.items) : []), [result]);
  const flags  = useMemo(() => shapes.filter(s => s.subjectRole === 'flag'), [shapes]);
  const byItem = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shapes) if (s.itemId && s.subjectRole !== 'flag' && !m.has(s.itemId)) m.set(s.itemId, s.id);
    return m;
  }, [shapes]);

  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <p className="text-xs text-slate-500">Open a drawing set and click <span className="text-slate-300">Run Auto-Takeoff</span>. The summary of everything it found shows here.</p>
      </div>
    );
  }

  const scope = result.items.filter(i => i.kind === 'scope');
  const excluded = result.items.filter(i => i.kind === 'excluded');
  const sheetsWithScope = new Set(shapes.filter(s => s.author === 'engine').map(s => s.pageId));
  const pages = useStudioStore.getState().pages;
  const go = (it: EngineItem) => { const id = byItem.get(it.id); if (id) engine?.focusShape(id); };
  const counts = log.reduce<Record<string, number>>((a, d) => { a[d.action] = (a[d.action] ?? 0) + 1; return a; }, {});

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Takeoff Summary</div>
        <div className="mt-1 text-[11px] text-slate-500">
          {result.project || 'Project'} · {result.pages} sheets · {scope.length} items · {flags.length} flags
        </div>
        {log.length > 0 && (
          <div className="mt-1 text-[10px] text-slate-500">
            Your review: {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto text-xs">
        <Section title="Totals by system">
          <table className="w-full">
            <thead><tr className="text-[10px] text-slate-500"><th className="text-left font-medium py-1">System</th><th className="text-right font-medium">EA</th><th className="text-right font-medium">SF</th><th className="text-right font-medium">LF</th></tr></thead>
            <tbody>
              {totals.map(t => (
                <tr key={t.cls} className="border-t border-slate-800/70 cursor-pointer hover:bg-slate-800/60" onClick={() => setOpen(open === t.cls ? null : t.cls)}>
                  <td className="py-1 text-slate-200"><GlossaryText text={t.name} />{t.flagged ? <span className="ml-1 text-amber-400">⚑{t.flagged}</span> : null}</td>
                  <td className="text-right tabular-nums text-slate-300">{t.ea ? t.ea : ''}</td>
                  <td className="text-right tabular-nums text-slate-300">{t.sf ? Math.round(t.sf).toLocaleString() : ''}</td>
                  <td className="text-right tabular-nums text-slate-300">{t.lf ? Math.round(t.lf).toLocaleString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {open && (
            <div className="mt-2 rounded border border-slate-800 bg-slate-950/60">
              {scope.filter(i => i.cls === open).map(i => (
                <button key={i.id} onClick={() => { useNavStore.getState().setTraceItem(i.id); if (!byItem.has(i.id)) go(i); }} title="Show every sheet this item is on" className="w-full text-left px-2 py-1 hover:bg-slate-800 border-b border-slate-800/60 last:border-0">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-200 truncate">{i.id}</span>
                    <span className="text-slate-400 tabular-nums whitespace-nowrap">{i.qty ?? ''} {i.sf_total ? `· ${Math.round(i.sf_total)} sf` : ''}</span>
                  </div>
                  {i.flags.length > 0 && <div className="text-[10px] text-amber-400/90 truncate" title={i.flags.join('\n')}>⚑ {i.flags[0]}</div>}
                </button>
              ))}
            </div>
          )}
        </Section>

        {scope.some(i => i.alternate) && (
          <Section title="Alternates (priced separately)">
            {scope.filter(i => i.alternate).map(i => (
              <button key={i.id} onClick={() => useNavStore.getState().setTraceItem(i.id)} className="flex w-full justify-between px-1 py-0.5 text-left hover:bg-slate-800">
                <span className="text-slate-200">{i.id}</span>
                <span className="text-fuchsia-300">{i.alternate}</span>
              </button>
            ))}
          </Section>
        )}

        <Section title="Assumptions">
          <Assumptions items={scope} />
        </Section>

        <Section title={`Excluded / not ours (${excluded.length})`}>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            {excluded.slice(0, 40).map(i => i.id).join(', ')}{excluded.length > 40 ? ` … +${excluded.length - 40}` : ''}
          </div>
        </Section>

        <Section title="Sheet coverage">
          <div className="space-y-0.5">
            {result.sheets.map(sh => {
              const pg = pages.find(p => p.pdfPageIndex === sh.page);
              const has = pg ? sheetsWithScope.has(pg.id) : false;
              return (
                <div key={sh.page} className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${has ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="w-14 text-slate-300">{sh.sheet}</span>
                  <span className="flex-1 truncate text-slate-500" title={sh.title}>{sh.categories.join(', ')}{sh.title ? ` — ${sh.title}` : ''}</span>
                  {!sh.ppf && <span className="text-[10px] text-amber-500/80" title="No drawing scale found on this sheet">no scale</span>}
                </div>
              );
            })}
          </div>
          {result.skipped.length > 0 && (
            <div className="mt-2 text-[10px] text-slate-500">
              Skipped: {result.skipped.map(s => `${s.sheet ?? s.page}${s.reason ? ` (${s.reason})` : ''}`).join(', ')}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Assumptions({ items }: { items: EngineItem[] }) {
  // series / systems named, implied line items, and the most common notes
  const series = new Map<string, number>();
  const implied = new Map<string, number>();
  const notes = new Map<string, number>();
  for (const i of items) {
    for (const s of (i.series ?? []) as { name?: string; series?: string; mfr?: string }[]) {
      const k = [s.mfr, s.series || s.name].filter(Boolean).join(' ');
      if (k) series.set(k, (series.get(k) ?? 0) + 1);
    }
    for (const im of i.implied ?? []) implied.set(CLASS_NAME[im.cls] ?? im.cls, (implied.get(CLASS_NAME[im.cls] ?? im.cls) ?? 0) + 1);
    for (const n of i.notes ?? []) {
      const k = n.split(':')[0];
      if (k.length < 40) notes.set(k, (notes.get(k) ?? 0) + 1);
    }
  }
  const row = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <div className="space-y-2 text-[11px]">
      <div>
        <div className="text-slate-500">Systems named</div>
        <div className="text-slate-300">{row(series).map(([k, v]) => `${k} (${v})`).join(', ') || 'none named — Kawneer / Tubelite assumed'}</div>
      </div>
      {implied.size > 0 && (
        <div>
          <div className="text-slate-500">Included with frames</div>
          <div className="text-slate-300">{row(implied).map(([k, v]) => `${k} (${v})`).join(', ')}</div>
        </div>
      )}
      {notes.size > 0 && (
        <div>
          <div className="text-slate-500">Rules applied</div>
          <div className="text-slate-300">{row(notes).map(([k, v]) => `${k.replace(/_/g, ' ')} (${v})`).join(', ')}</div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-slate-800">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{title}</div>
      {children}
    </div>
  );
}
