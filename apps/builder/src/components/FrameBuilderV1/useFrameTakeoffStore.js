/**
 * useFrameTakeoffStore — the Frame Builder's job takeoff (Zustand).
 *
 * One TakeoffProject per Builder project, persisted to
 *   localStorage['glazebid:frameTakeoff:<projectName>']
 * — the 'glazebid…:<projectName>' key is picked up by syncProject's
 * collectLocalState(), so it saves and reloads with the .aiq project file.
 * Estimators can also export / import the takeoff as its own JSON file.
 *
 * Every edit goes through `updateFrame(id, fn)` with a pure spec → spec
 * function (engine `edit.*` verbs), so undo/redo is a simple snapshot stack.
 */

import { create } from 'zustand';
import {
  createTakeoff, createFrame, variantOf, normalizeSpec, TAKEOFF_SCHEMA, defaultGlassTypes,
} from '@glazebid/frame-engine/core';

const KEY = (projectName) => `glazebid:frameTakeoff:${projectName || '__scratch__'}`;
const HISTORY = 60;

function readSaved(projectName) {
  try {
    const raw = localStorage.getItem(KEY(projectName));
    if (!raw) return null;
    const tp = JSON.parse(raw);
    if (tp?.schema !== TAKEOFF_SCHEMA) return null;
    return { ...tp, frames: (tp.frames ?? []).map(normalizeSpec) };
  } catch (err) {
    console.error('[FrameBuilder] could not read saved takeoff', err);
    return null;
  }
}

let saveTimer = null;
function scheduleSave(projectName, takeoff) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY(projectName), JSON.stringify({ ...takeoff, updatedAt: new Date().toISOString() })); }
    catch (err) { console.error('[FrameBuilder] could not save takeoff', err); }
  }, 250);
}

const useFrameTakeoffStore = create((set, get) => ({
  projectName: null,
  takeoff: null,
  selectedFrameId: null,
  selection: null,            // { type: 'lite'|'member'|'joint'|'door', key }
  past: [],
  future: [],

  /** Open (or create) the takeoff for a Builder project. */
  open(projectName) {
    if (get().projectName === projectName && get().takeoff) return;
    const tp = readSaved(projectName) ?? createTakeoff({ name: projectName || 'Scratch takeoff', projectId: projectName ?? null });
    set({ projectName, takeoff: tp, selectedFrameId: tp.frames[0]?.id ?? null, selection: null, past: [], future: [] });
  },

  /** Replace the whole takeoff (import). */
  replace(tp) {
    const clean = { ...createTakeoff(), ...tp, frames: (tp.frames ?? []).map(normalizeSpec) };
    get()._commit(clean);
    set({ selectedFrameId: clean.frames[0]?.id ?? null, selection: null });
  },

  _commit(next) {
    const { takeoff, past, projectName } = get();
    set({ takeoff: next, past: takeoff ? [...past.slice(-HISTORY), takeoff] : past, future: [] });
    scheduleSave(projectName, next);
  },

  undo() {
    const { past, takeoff, future, projectName } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ takeoff: prev, past: past.slice(0, -1), future: [takeoff, ...future] });
    scheduleSave(projectName, prev);
  },
  redo() {
    const { past, takeoff, future, projectName } = get();
    if (!future.length) return;
    const next = future[0];
    set({ takeoff: next, past: [...past, takeoff], future: future.slice(1) });
    scheduleSave(projectName, next);
  },

  // ── Frames ──
  selectFrame(id) { set({ selectedFrameId: id, selection: null }); },
  select(selection) { set({ selection }); },

  updateFrame(id, fn) {
    const tp = get().takeoff;
    const frames = tp.frames.map((f) => (f.id === id ? normalizeSpec(fn(f)) : f));
    get()._commit({ ...tp, frames });
  },

  addFrame(over = {}) {
    const tp = get().takeoff;
    const sel = tp.frames.find((f) => f.id === get().selectedFrameId);
    const n = tp.frames.length + 1;
    const f = createFrame({
      mark: `F-${n}`,
      frameSet: sel?.frameSet ?? Object.keys(tp.frameSets)[0] ?? 'EX SF',
      systemId: sel?.systemId,
      finish: sel?.finish ?? 'Clear Anodized',
      ...over,
    });
    get()._commit({ ...tp, frames: [...tp.frames, f] });
    set({ selectedFrameId: f.id, selection: null });
    return f.id;
  },

  duplicateFrame(id) {
    const tp = get().takeoff;
    const src = tp.frames.find((f) => f.id === id);
    if (!src) return;
    const v = variantOf(src, tp.frames.map((f) => f.mark));
    const idx = tp.frames.findIndex((f) => f.id === id);
    const frames = [...tp.frames.slice(0, idx + 1), v, ...tp.frames.slice(idx + 1)];
    get()._commit({ ...tp, frames });
    set({ selectedFrameId: v.id, selection: null });
  },

  deleteFrame(id) {
    const tp = get().takeoff;
    const frames = tp.frames.filter((f) => f.id !== id);
    get()._commit({ ...tp, frames });
    if (get().selectedFrameId === id) set({ selectedFrameId: frames[0]?.id ?? null, selection: null });
  },

  moveFrame(id, dir) {
    const tp = get().takeoff;
    const i = tp.frames.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= tp.frames.length) return;
    const frames = [...tp.frames];
    [frames[i], frames[j]] = [frames[j], frames[i]];
    get()._commit({ ...tp, frames });
  },

  /** Add many frames at once (AI import / window schedule). */
  addFrames(specs) {
    const tp = get().takeoff;
    const frames = [...tp.frames, ...specs.map(normalizeSpec)];
    const sets = { ...tp.frameSets };
    for (const s of specs) if (s.frameSet && !sets[s.frameSet]) sets[s.frameSet] = { liftLine: null, difficulty: 1 };
    get()._commit({ ...tp, frames, frameSets: sets });
    if (specs[0]) set({ selectedFrameId: specs[0].id, selection: null });
  },

  // ── Job settings ──
  updateTakeoff(patch) {
    const tp = get().takeoff;
    get()._commit(typeof patch === 'function' ? patch(tp) : { ...tp, ...patch });
  },

  setFrameSet(name, patch) {
    const tp = get().takeoff;
    get()._commit({ ...tp, frameSets: { ...tp.frameSets, [name]: { liftLine: null, difficulty: 1, ...(tp.frameSets[name] ?? {}), ...patch } } });
  },

  renameFrameSet(oldName, newName) {
    const tp = get().takeoff;
    if (!newName || tp.frameSets[newName]) return;
    const fs = { ...tp.frameSets }; fs[newName] = fs[oldName]; delete fs[oldName];
    get()._commit({ ...tp, frameSets: fs, frames: tp.frames.map((f) => (f.frameSet === oldName ? { ...f, frameSet: newName } : f)) });
  },

  // ── Glass types ──
  upsertGlassType(gt) {
    const tp = get().takeoff;
    const list = tp.glassTypes?.length ? tp.glassTypes : defaultGlassTypes();
    const i = list.findIndex((g) => g.id === gt.id);
    const glassTypes = i >= 0 ? list.map((g) => (g.id === gt.id ? { ...g, ...gt } : g)) : [...list, gt];
    get()._commit({ ...tp, glassTypes });
  },
  removeGlassType(id) {
    const tp = get().takeoff;
    get()._commit({ ...tp, glassTypes: tp.glassTypes.filter((g) => g.id !== id) });
  },
}));

export default useFrameTakeoffStore;
