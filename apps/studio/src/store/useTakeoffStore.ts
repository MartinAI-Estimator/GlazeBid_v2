/**
 * useTakeoffStore — the auto-takeoff run loaded into Studio, and the review
 * decision log (every accept / reject / edit / add the estimator makes).
 */
import { create } from 'zustand';
import type { TakeoffResult } from '../engine/takeoffImport';

export type Decision = {
  at:       string;                       // ISO time
  project:  string;
  action:   'reject' | 'edit' | 'reclassify' | 'quantity' | 'add' | 'accept' | 'restore';
  shapeId:  string;
  itemId?:  string;
  subject?: string;
  page?:    string;                       // sheet label
  reason?:  string;                       // reject reasons
  before?:  unknown;
  after?:   unknown;
};

export const REJECT_REASONS = [
  'Not ours', 'By others', 'Duplicate', 'Existing to remain', 'Wrong spot', 'Wrong size', 'Other',
] as const;

type State = {
  status:   'idle' | 'running' | 'done' | 'error';
  error:    string | null;
  result:   TakeoffResult | null;
  project:  string;
  /** Unsent decisions (flushed to the sidecar log). */
  queue:    Decision[];
  /** All decisions this session (for the UI). */
  log:      Decision[];
  /** Reason chosen in the delete prompt, picked up by the logger when the shape disappears. */
  pendingReasons: Record<string, string>;
  /** Shape whose delete prompt is open. */
  rejectPrompt: { shapeId: string; screenX: number; screenY: number } | null;
  /** Panels */
  showSummary: boolean;
  showMarkups: boolean;

  setRunning:  (project: string) => void;
  setResult:   (r: TakeoffResult) => void;
  setError:    (e: string) => void;
  record:      (d: Omit<Decision, 'at' | 'project'>) => void;
  takeQueue:   () => Decision[];
  setPendingReason: (shapeId: string, reason: string) => void;
  takeReason:  (shapeId: string) => string | undefined;
  setRejectPrompt: (p: State['rejectPrompt']) => void;
  toggleSummary: () => void;
  toggleMarkups: () => void;
};

export const useTakeoffStore = create<State>()((set, get) => ({
  status: 'idle', error: null, result: null, project: '',
  queue: [], log: [], pendingReasons: {}, rejectPrompt: null,
  showSummary: false, showMarkups: false,

  setRunning: (project) => set({ status: 'running', error: null, project }),
  setResult:  (r) => set({ status: 'done', result: r, showSummary: true }),
  setError:   (e) => set({ status: 'error', error: e }),

  record: (d) => set(s => {
    const full: Decision = { ...d, at: new Date().toISOString(), project: s.project };
    return { queue: [...s.queue, full], log: [...s.log, full] };
  }),
  takeQueue: () => { const q = get().queue; set({ queue: [] }); return q; },

  setPendingReason: (id, reason) => set(s => ({ pendingReasons: { ...s.pendingReasons, [id]: reason } })),
  takeReason: (id) => {
    const r = get().pendingReasons[id];
    if (r !== undefined) set(s => { const { [id]: _, ...rest } = s.pendingReasons; return { pendingReasons: rest }; });
    return r;
  },
  setRejectPrompt: (p) => set({ rejectPrompt: p }),
  toggleSummary: () => set(s => ({ showSummary: !s.showSummary })),
  toggleMarkups: () => set(s => ({ showMarkups: !s.showMarkups })),
}));
