/**
 * useNavStore — hyperlinked callouts (detail bubbles / sheet references) and
 * Bluebeam-style Previous / Next view history.
 */
import { create } from 'zustand';

export type SheetLink = {
  page: number;                          // pdf page index the callout is on
  rect: [number, number, number, number];
  label: string;                         // "6/A3.8" or "A4.4"
  target_page: number;
  target_rect: [number, number, number, number] | null;
};

export type View = { pageId: string; scale: number; tx: number; ty: number };

type State = {
  links: SheetLink[];
  hoverLink: SheetLink | null;
  back: View[];
  forward: View[];
  showExternal: boolean;
  setLinks: (l: SheetLink[]) => void;
  setHoverLink: (l: SheetLink | null) => void;
  pushView: (v: View) => void;
  popBack: (current: View) => View | null;
  popForward: (current: View) => View | null;
  toggleExternal: () => void;
};

export const useNavStore = create<State>()((set, get) => ({
  links: [], hoverLink: null, back: [], forward: [], showExternal: true,
  setLinks: (links) => set({ links, hoverLink: null }),
  setHoverLink: (hoverLink) => { if (get().hoverLink !== hoverLink) set({ hoverLink }); },
  pushView: (v) => set(s => ({ back: [...s.back, v].slice(-50), forward: [] })),
  popBack: (cur) => {
    const b = get().back;
    if (!b.length) return null;
    set(s => ({ back: s.back.slice(0, -1), forward: [cur, ...s.forward].slice(0, 50) }));
    return b[b.length - 1];
  },
  popForward: (cur) => {
    const f = get().forward;
    if (!f.length) return null;
    set(s => ({ forward: s.forward.slice(1), back: [...s.back, cur].slice(-50) }));
    return f[0];
  },
  toggleExternal: () => set(s => ({ showExternal: !s.showExternal })),
}));
