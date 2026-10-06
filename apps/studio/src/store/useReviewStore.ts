/**
 * useReviewStore — the per-job review state behind the Summary panel's Specs,
 * Scope and Bid-day tabs.  Saved on the sidecar next to the takeoff
 * (_autotakeoff_runs/<project>/studio_state.json) so it survives closing
 * Studio and can be read back for learning.
 */
import { create } from 'zustand';

const SIDECAR_URL = 'http://localhost:8100';

export type SpecCite = { section?: string | null; page?: number | null; text?: string; item?: string; rect?: number[]; in_drawings?: boolean };
export type SpecCheckItem = {
  severity: 'conflict' | 'check' | 'info'; topic: string; message: string; section?: string | null;
  spec: SpecCite[]; drawings: SpecCite[];
};
export type SpecCard = {
  section: string; title: string; page: number; in_drawings?: boolean; manufacturers: string[]; series: string[];
  substitutions: string; finish: string[]; glass: string[]; hardware: string[]; cost: string[];
};
export type SpecSection = { csi: string; key: string; title: string; page: number; ours: boolean; covers: string[]; related?: string | null; in_drawings?: boolean };
export type SpecCheck = {
  source: string; spec_name?: string; sections: SpecSection[]; cards: SpecCard[]; checks: SpecCheckItem[];
  related: { section: string; title: string; page: number; note: string }[];
  summary: Record<string, number>; alternates: { page: number; label: string; text: string; rect: number[]; source?: string }[];
  item_alternates: Record<string, string>; pages_read: number[];
};

export type ScopeDecision = 'included' | 'excluded' | 'by_others' | 'na';
export type ScopeEntry = { decision?: ScopeDecision; note?: string };

type Persisted = {
  scope: Record<string, ScopeEntry>;
  bidday: Record<string, boolean>;            // manual ticks + acknowledged checks / alternates
  sheetsReviewed: Record<string, boolean>;    // sheet label → "looked, nothing of ours"
};

type State = Persisted & {
  project: string;
  specCheck: SpecCheck | null;
  specStatus: 'idle' | 'running' | 'error';
  specError: string | null;
  tab: 'summary' | 'specs' | 'scope' | 'bidday';
  setTab: (t: State['tab']) => void;
  load: (project: string) => Promise<void>;
  setSpecCheck: (s: SpecCheck | null) => void;
  setSpecStatus: (s: State['specStatus'], err?: string | null) => void;
  setScope: (id: string, e: ScopeEntry) => void;
  setScopeMany: (m: Record<string, ScopeEntry>) => void;
  tick: (id: string, v: boolean) => void;
  setSheetReviewed: (label: string, v: boolean) => void;
};

const timers: Record<string, ReturnType<typeof setTimeout>> = {};
function save(project: string, key: keyof Persisted, value: unknown) {
  if (!project) return;
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    void fetch(`${SIDECAR_URL}/drawing-intelligence/studio/state`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: project, key, value }),
    }).catch(() => undefined);
  }, 600);
}

export const useReviewStore = create<State>()((set, get) => ({
  project: '', specCheck: null, specStatus: 'idle', specError: null, tab: 'summary',
  scope: {}, bidday: {}, sheetsReviewed: {},
  setTab: (tab) => set({ tab }),
  load: async (project) => {
    set({ project, specCheck: null, scope: {}, bidday: {}, sheetsReviewed: {}, specStatus: 'idle', specError: null });
    try {
      const res = await fetch(`${SIDECAR_URL}/drawing-intelligence/studio/state`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_name: project }),
      });
      if (!res.ok) return;
      const st = await res.json() as Partial<Persisted> & { _spec_check?: SpecCheck };
      if (get().project !== project) return;
      set({ scope: st.scope ?? {}, bidday: st.bidday ?? {}, sheetsReviewed: st.sheetsReviewed ?? {}, specCheck: st._spec_check ?? null });
    } catch { /* sidecar not running — start empty */ }
  },
  setSpecCheck: (specCheck) => set({ specCheck, specStatus: 'idle', specError: null }),
  setSpecStatus: (specStatus, specError = null) => set({ specStatus, specError }),
  setScope: (id, e) => { const scope = { ...get().scope, [id]: e }; set({ scope }); save(get().project, 'scope', scope); },
  setScopeMany: (m) => { const scope = { ...get().scope, ...m }; set({ scope }); save(get().project, 'scope', scope); },
  tick: (id, v) => { const bidday = { ...get().bidday, [id]: v }; set({ bidday }); save(get().project, 'bidday', bidday); },
  setSheetReviewed: (label, v) => {
    const sheetsReviewed = { ...get().sheetsReviewed, [label]: v };
    set({ sheetsReviewed }); save(get().project, 'sheetsReviewed', sheetsReviewed);
  },
}));
