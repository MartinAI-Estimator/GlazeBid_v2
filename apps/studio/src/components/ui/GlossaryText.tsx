/**
 * GlossaryText — renders text with glazing terms underlined (dotted); hover a
 * term for its definition.  One tooltip for the whole app (GlossaryTooltip,
 * mounted once in StudioLayout) so it is never clipped by scrolling panels.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { splitTerms, type GlossaryEntry } from '../../constants/glossary';

type Tip = { entry: GlossaryEntry; x: number; y: number } | null;
const useTip = create<{ tip: Tip; show: (t: Tip) => void }>()(set => ({ tip: null, show: tip => set({ tip }) }));

export default function GlossaryText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitTerms(text), [text]);
  return (
    <span className={className}>
      {parts.map((p, i) => p.entry ? (
        <span key={i}
              className="underline decoration-dotted decoration-slate-500 underline-offset-2 cursor-help"
              onMouseEnter={e => { const r = (e.target as HTMLElement).getBoundingClientRect(); useTip.getState().show({ entry: p.entry!, x: r.left, y: r.bottom }); }}
              onMouseLeave={() => useTip.getState().show(null)}>
          {p.text}
        </span>
      ) : <span key={i}>{p.text}</span>)}
    </span>
  );
}

/** Mount once near the root. */
export function GlossaryTooltip() {
  const tip = useTip(s => s.tip);
  if (!tip) return null;
  const left = Math.min(tip.x, window.innerWidth - 340);
  const below = tip.y + 160 < window.innerHeight;
  return (
    <div className="fixed z-[100] w-80 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-200 shadow-2xl pointer-events-none"
         style={below ? { left, top: tip.y + 6 } : { left, bottom: window.innerHeight - tip.y + 26 }}>
      <div className="mb-0.5 font-semibold text-sky-300">{tip.entry.term}</div>
      <div className="leading-relaxed text-slate-300">{tip.entry.def}</div>
    </div>
  );
}
