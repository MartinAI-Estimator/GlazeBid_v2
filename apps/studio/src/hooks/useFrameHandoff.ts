/**
 * useFrameHandoff — Studio → Frame Builder (decisions 1, 3, 11, 15).
 *
 *   sendFramesToBuilder(engine)                 every frame type (Finalize)
 *   sendFramesToBuilder(engine, { only: id })   one frame type (right-click → Open in Frame Builder)
 *   useFrameHandoffLinks()                      mount once: remembers the Builder project that opened
 *                                               Studio; "Show in Studio" from the Frame Builder opens
 *                                               the item trace; built / needs-input status comes back
 *
 * The sidecar builds the payloads (POST /drawing-intelligence/frames/payload): bays, rows and
 * door bays read off the elevations, doors tied to frame types, job glass / finish from the
 * spec check.  The Builder files them in that project's Frame Builder "Incoming" list.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { CanvasEngineAPI } from './useCanvasEngine';
import { useStudioStore } from '../store/useStudioStore';
import { useNavStore } from '../store/useNavStore';
import { b64, projectNameOf } from './useSetLoader';

const SIDECAR_URL = 'http://localhost:8100';

export type FrameStatus = { itemId: string; mark: string; state: 'built' | 'needs-input' | 'incoming'; quantity?: number; studioQuantity?: number };

type LinkState = {
  builderProject: string | null;
  status: Record<string, FrameStatus>;
  lastSent: { at: string; frames: number; only?: string } | null;
  notice: { kind: 'ok' | 'error'; text: string } | null;
  setNotice: (n: LinkState['notice']) => void;
  setBuilderProject: (p: string | null) => void;
  setStatus: (s: Record<string, FrameStatus>) => void;
  setLastSent: (v: LinkState['lastSent']) => void;
};

export const useFrameLinkStore = create<LinkState>()((set) => ({
  builderProject: null, status: {}, lastSent: null, notice: null,
  setNotice: (notice) => set({ notice }),
  setBuilderProject: (builderProject) => set({ builderProject }),
  setStatus: (status) => set({ status }),
  setLastSent: (lastSent) => set({ lastSent }),
}));

type PayloadDoc = { frames: { itemId: string; mark: string }[]; nonFrames: unknown[]; doorTypes: unknown[]; jobDefaults: unknown; summary: Record<string, number> };

async function fetchPayloads(engine: CanvasEngineAPI | null): Promise<PayloadDoc> {
  const project = projectNameOf(useStudioStore.getState().pdfFileName);
  const post = (path: string, body: object) => fetch(`${SIDECAR_URL}/drawing-intelligence${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let res = await post('/frames/payload', { project_name: project }).catch(() => { throw new Error('The GlazeBid engine (sidecar) is not running.'); });
  if (res.status === 400) {
    const detail = await res.text();
    if (/takeoff/i.test(detail)) throw new Error('Run the auto-takeoff on this set first.');
    const buf = engine?.getPdfBuffer();
    if (buf) await post('/sheets', { project_name: project, pdf_base64: b64(buf) });
    res = await post('/frames/payload', { project_name: project });
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<PayloadDoc>;
}

/** → { frames, target } — throws with a message the UI can show. */
export async function sendFramesToBuilder(engine: CanvasEngineAPI | null, opts: { only?: string } = {}): Promise<{ frames: number; target: string | null }> {
  const send = window.electron?.sendFrameTakeoff;
  if (!send) throw new Error('Sending to the Frame Builder needs the desktop app.');
  const doc = await fetchPayloads(engine);
  // markups the estimator re-subjected or deleted still travel; their item stays the anchor
  let frames = opts.only ? doc.frames.filter((f) => f.itemId === opts.only) : doc.frames;
  // what the estimator decided in Studio travels with it: rejected types stay behind,
  // a typed quantity replaces the plan count
  const shapes = useStudioStore.getState().shapes;
  const byItem = new Map<string, typeof shapes>();
  for (const s of shapes) if (s.itemId && s.author === 'engine' && s.subjectRole !== 'flag') byItem.set(s.itemId, [...(byItem.get(s.itemId) ?? []), s]);
  const hadEngine = shapes.some((s) => s.author === 'engine');
  frames = frames.filter((f) => !hadEngine || byItem.has(f.itemId) || (f as { standaloneDoor?: boolean }).standaloneDoor)
    .map((f) => {
      const typed = (byItem.get(f.itemId) ?? []).find((s) => s.qtyOverride != null && (s.subjectRole === 'count' || s.subjectRole === 'area'));
      return typed ? { ...f, quantity: typed.qtyOverride, studioQuantity: true } : f;
    });
  if (opts.only && !frames.length) throw new Error(`${opts.only} isn't a frame type the Frame Builder can build (no size, or not a frame).`);
  const st = useStudioStore.getState();
  const builderProject = useFrameLinkStore.getState().builderProject;
  send({
    schema: 'glazebid.frameHandoff/1',
    builderProject, studioProject: projectNameOf(st.pdfFileName), pdfName: st.pdfFileName,
    mode: opts.only ? 'one' : 'all', sentAt: new Date().toISOString(),
    doc: { ...doc, frames, nonFrames: opts.only ? [] : doc.nonFrames },
  });
  useFrameLinkStore.getState().setLastSent({ at: new Date().toISOString(), frames: frames.length, only: opts.only });
  return { frames: frames.length, target: builderProject };
}

/** Mount once (StudioLayout). */
export function useFrameHandoffLinks(engine: CanvasEngineAPI | null): void {
  useEffect(() => {
    const e = window.electron;
    const offs: (() => void)[] = [];
    if (e?.onLoadProjectData) {
      offs.push(e.onLoadProjectData((data: unknown) => {
        const d = data as { projectId?: string } | null;
        if (d?.projectId) useFrameLinkStore.getState().setBuilderProject(String(d.projectId));
        return () => undefined;
      }));
    }
    if (e?.onStudioTrace) {
      offs.push(e.onStudioTrace((req: unknown) => {
        const r = req as { itemId?: string } | null;
        if (r?.itemId) useNavStore.getState().setTraceItem(r.itemId);
      }));
    }
    if (e?.onFrameStatus) {
      offs.push(e.onFrameStatus((s: unknown) => {
        const list = (s as { frames?: FrameStatus[] })?.frames ?? [];
        useFrameLinkStore.getState().setStatus(Object.fromEntries(list.map((f) => [f.itemId, f])));
      }));
    }
    // (StudioLayout sends studioReady after this hook has registered — it is called first)
    return () => offs.forEach((off) => { try { off(); } catch { /* ignore */ } });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
}
