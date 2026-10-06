/**
 * useTakeoffRunner — run the auto-takeoff on the open set and load it as
 * editable markups; log review decisions to the sidecar.
 *
 *   const { run } = useTakeoffRunner(engine);   run('Hope Aquatic');
 *   useDecisionLogger();                         // mount once (StudioLayout)
 */
import { useCallback, useEffect } from 'react';
import type { CanvasEngineAPI } from './useCanvasEngine';
import { useStudioStore } from '../store/useStudioStore';
import { useTakeoffStore } from '../store/useTakeoffStore';
import { importTakeoff, type TakeoffResult } from '../engine/takeoffImport';

const SIDECAR_URL = 'http://localhost:8100';

function toBase64(buf: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode(...buf.subarray(i, i + CH));
  return btoa(s);
}

export function useTakeoffRunner(engine: CanvasEngineAPI | null) {
  const run = useCallback(async (projectName?: string) => {
    const tk = useTakeoffStore.getState();
    const st = useStudioStore.getState();
    const buf = engine?.getPdfBuffer();
    if (!buf) { tk.setError('Open a drawing set first.'); return; }
    const project = (projectName || st.pdfFileName || 'untitled').replace(/\.pdf$/i, '');
    tk.setRunning(project);
    try {
      const res = await fetch(`${SIDECAR_URL}/drawing-intelligence/autotakeoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_base64: toBase64(buf), project_name: project }),
      }).catch(() => { throw new Error('The GlazeBid engine (sidecar) is not running.'); });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const result = (await res.json()) as TakeoffResult;
      loadTakeoffResult(result);
    } catch (e) {
      useTakeoffStore.getState().setError(e instanceof Error ? e.message : String(e));
    }
  }, [engine]);
  return { run };
}

/** Put an engine result on the drawings: markups, sheet scales, sheet-number page labels. */
export function loadTakeoffResult(result: TakeoffResult): void {
  const st = useStudioStore.getState();
  const { shapes, calibrations, labels } = importTakeoff(result, st.pages);
  for (const c of calibrations) st.setCalibration(c);
  for (const l of labels) st.setPageLabel(l.pageId, l.label);
  st.replaceEngineShapes(shapes);
  useTakeoffStore.getState().setResult(result);
}

// ── Decision logger ──────────────────────────────────────────────────────────

const GEOM_KEYS = ['origin', 'widthPx', 'heightPx', 'points', 'start', 'end', 'position'] as const;

function pageLabel(pageId: string): string | undefined {
  return useStudioStore.getState().pages.find(p => p.id === pageId)?.label;
}

/**
 * Watches the markups and records the estimator's decisions while a takeoff is
 * loaded: deleting an engine markup (with the reason from the prompt, if any),
 * moving / reshaping it, reclassifying it, typing a quantity, and drawing a
 * markup of their own ("the engine missed this").  Flushed to the sidecar log.
 */
export function useDecisionLogger(): void {
  useEffect(() => startDecisionLogger(), []);
}

/** Start watching markups for review decisions; returns the stop function. */
export function startDecisionLogger(flushEveryMs = 4000): () => void {
  let prevShapes = new Map(useStudioStore.getState().shapes.map(s => [s.id, s]));
  const unsub = useStudioStore.subscribe((s, old) => {
    if (s.editing) return;
    // a change, or the end of a drag (shapes moved live while editing)
    if (s.shapes === old.shapes && !(old.editing && !s.editing)) return;
    const tk = useTakeoffStore.getState();
    const before = prevShapes;
    const after = new Map(s.shapes.map(x => [x.id, x]));
    prevShapes = after;
    if (tk.status !== 'done') return;
    // a whole new engine load is not a decision
    const engineSwap = [...after.values()].some(x => x.author === 'engine' && !before.has(x.id)) &&
                       [...before.values()].some(x => x.author === 'engine' && !after.has(x.id));
    if (engineSwap) return;

    for (const [id, b] of before) {
      if (!after.has(id) && b.author === 'engine') {
        tk.record({ action: 'reject', shapeId: id, itemId: b.itemId, subject: b.subject, page: pageLabel(b.pageId),
                    reason: tk.takeReason(id) ?? 'deleted (no reason given)', before: b });
      }
    }
    const edited: string[] = [];
    for (const [id, a] of after) {
      const b = before.get(id);
      if (!b) {
        if (a.author !== 'engine') {
          tk.record({ action: 'add', shapeId: id, subject: a.subject, page: pageLabel(a.pageId), after: a });
        } else {
          tk.record({ action: 'restore', shapeId: id, itemId: a.itemId, subject: a.subject, page: pageLabel(a.pageId) });
        }
        continue;
      }
      if (a === b || a.author !== 'engine') continue;
      if (a.subject !== b.subject) {
        tk.record({ action: 'reclassify', shapeId: id, itemId: a.itemId, page: pageLabel(a.pageId), before: b.subject, after: a.subject });
      }
      if (a.qtyOverride !== b.qtyOverride) {
        tk.record({ action: 'quantity', shapeId: id, itemId: a.itemId, subject: a.subject, page: pageLabel(a.pageId), before: b.qtyOverride ?? null, after: a.qtyOverride ?? null });
      }
      const geo = GEOM_KEYS.some(k => JSON.stringify((a as Record<string, unknown>)[k]) !== JSON.stringify((b as Record<string, unknown>)[k]));
      if (geo) {
        tk.record({ action: 'edit', shapeId: id, itemId: a.itemId, subject: a.subject, page: pageLabel(a.pageId), before: b, after: a });
      }
      if ((geo || a.subject !== b.subject || a.qtyOverride !== b.qtyOverride) && a.reviewState !== 'edited') edited.push(id);
    }
    if (edited.length) {
      // mark edited without another undo step (the logger ignores this pass: same ids, only reviewState)
      const ids = new Set(edited);
      queueMicrotask(() => {
        useStudioStore.setState(st => ({ shapes: st.shapes.map(x => (ids.has(x.id) ? { ...x, reviewState: 'edited' as const } : x)) }));
      });
    }
  });
  const timer = flushEveryMs > 0 ? setInterval(() => { void flushDecisions(); }, flushEveryMs) : null;
  const onUnload = () => { void flushDecisions(); };
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('beforeunload', onUnload);
  return () => {
    unsub();
    if (timer) clearInterval(timer);
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('beforeunload', onUnload);
  };
}

export async function flushDecisions(): Promise<void> {
  const tk = useTakeoffStore.getState();
  if (!tk.queue.length) return;
  const batch = tk.takeQueue();
  try {
    const res = await fetch(`${SIDECAR_URL}/drawing-intelligence/autotakeoff/decisions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: tk.project, decisions: batch }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    // sidecar not reachable — keep them for the next flush
    useTakeoffStore.setState(s => ({ queue: [...batch, ...s.queue] }));
  }
}
