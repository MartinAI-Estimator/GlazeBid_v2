/**
 * ToolChestPanel — Martin's Estimating ToolBox as Studio tools (Bluebeam Tool Chest).
 *
 * Click a tool → the matching drawing tool activates and every markup drawn
 * carries that subject, role and colour:
 *   Areas       → Area tool (click points; or press-drag-release for a rectangle)
 *   Polylengths → Polylength tool (click points; double-click / Enter to finish)
 *   Counts      → click to drop a count / door marker
 *   Highlights  → drag a rectangle
 * Click the active tool again (or press Esc / a plain tool key) to drop it.
 */
import { useMemo, useState } from 'react';
import { TOOL_CHEST, ROLE_LABEL, type ToolChestItem } from '../../constants/toolChest';
import { useStudioStore, type ToolType } from '../../store/useStudioStore';
import type { SubjectRole } from '../../types/shapes';

const ROLE_TOOL: Record<SubjectRole, ToolType> = {
  area: 'polygon',
  polylength: 'polyline',
  count: 'tcount',
  highlight: 'rect',
  line: 'line',
};

const ORDER: SubjectRole[] = ['area', 'polylength', 'count', 'highlight'];

export default function ToolChestPanel() {
  const active    = useStudioStore(s => s.activeSubject);
  const setActive = useStudioStore(s => s.setActiveSubject);
  const setTool   = useStudioStore(s => s.setActiveTool);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ area: true, polylength: true, count: true, highlight: false });

  const groups = useMemo(() => {
    const k = q.trim().toLowerCase();
    const items = k ? TOOL_CHEST.filter(t => t.subject.toLowerCase().includes(k)) : TOOL_CHEST;
    return ORDER.map(r => ({ role: r, items: items.filter(t => t.role === r) })).filter(g => g.items.length);
  }, [q]);

  function pick(t: ToolChestItem) {
    if (active?.subject === t.subject) {
      setActive(null);
      setTool('select');
      return;
    }
    setActive(t);
    setTool(ROLE_TOOL[t.role]);
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col min-h-0">
      <div className="px-3 pt-3 pb-2 border-b border-slate-800">
        <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">Tool Chest</div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Find a tool…"
          className="mt-2 w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-600"
        />
        {active && (
          <div className="mt-2 text-[11px] text-slate-400">
            Drawing: <span className="text-slate-100">{active.subject}</span>
            <span className="text-slate-500"> · Esc to stop</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {groups.map(g => (
          <div key={g.role} className="mb-1">
            <button
              onClick={() => setOpen(o => ({ ...o, [g.role]: !o[g.role] }))}
              className="w-full flex items-center justify-between px-3 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200"
            >
              <span>{ROLE_LABEL[g.role]}</span>
              <span className="text-slate-600">{(open[g.role] || q) ? '▾' : '▸'} {g.items.length}</span>
            </button>
            {(open[g.role] || q) && g.items.map(t => {
              const on = active?.subject === t.subject;
              return (
                <button
                  key={t.subject}
                  onClick={() => pick(t)}
                  title={t.subject}
                  className={`w-full flex items-center gap-2 px-3 py-1 text-left text-xs transition-colors ${
                    on ? 'bg-sky-900/60 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Swatch item={t} />
                  <span className="truncate">{t.subject}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}

function Swatch({ item }: { item: ToolChestItem }) {
  const c = item.stroke;
  if (item.role === 'polylength' || item.role === 'line') {
    return <span className="inline-block w-4 h-[3px] rounded flex-shrink-0" style={{ background: c }} />;
  }
  if (item.role === 'count') {
    return <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 border" style={{ background: c + '99', borderColor: c }} />;
  }
  return <span className="inline-block w-4 h-3 rounded-sm flex-shrink-0 border" style={{ background: c + '55', borderColor: c }} />;
}
