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
  importJob, resyncFrame, acceptDrawingValue, combineSources, findImported, markKey,
  applyNonFrames, setGlassOnly, setBidLine,
} from '@glazebid/frame-engine/core';

const KEY = (projectName) => `glazebid:frameTakeoff:${projectName || '__scratch__'}`;
const KEY_UNASSIGNED = 'glazebid:frameIncoming:unassigned';

/**
 * A new Studio packet replaces the old one; a single-frame send ("Open in Frame Builder")
 * merges by item.  A window schedule already uploaded is merged in by mark (decision 6).
 */
export function mergeIncoming(prev, packet) {
  const doc = packet?.doc ?? {};
  const sched = prev?.schedule?.frames ?? [];
  const base = {
    receivedAt: new Date().toISOString(), source: sched.length ? 'studio+schedule' : (packet?.source ?? 'studio'),
    studioProject: packet?.studioProject ?? null, pdfName: packet?.pdfName ?? null,
    jobDefaults: doc.jobDefaults ?? prev?.jobDefaults ?? null, doorTypes: doc.doorTypes ?? prev?.doorTypes ?? [],
    schedule: prev?.schedule ?? null,
  };
  const incoming = doc.frames ?? [];
  if (packet?.mode === 'one' && prev) {
    const ids = new Set(incoming.map((p) => p.itemId));
    const keys = new Set(incoming.map((p) => markKey(p.mark ?? p.itemId)));
    const other = (p) => !ids.has(p.itemId) && !keys.has(markKey(p.mark ?? p.itemId));
    return { ...prev, ...base,
      studioFrames: [...(prev.studioFrames ?? []).filter(other), ...incoming],
      frames: [...(prev.frames ?? []).filter(other), ...combineSources(incoming, sched).slice(0, incoming.length)],
      focus: incoming[0]?.itemId ?? null };
  }
  return { ...base, studioFrames: incoming, frames: combineSources(incoming, sched), nonFrames: doc.nonFrames ?? [], built: [],
    focus: packet?.mode === 'one' ? incoming[0]?.itemId ?? null : null };
}

/**
 * A window schedule uploaded in the Frame Builder (scheduleIntake.readScheduleFile).
 * Merged by mark with what Studio sent; marks on one side only stay, flagged.
 */
export function mergeScheduleIncoming(prev, doc) {
  const studio = prev?.studioFrames ?? (prev?.frames ?? []).filter((p) => p.source !== 'schedule');
  return {
    built: [], nonFrames: [], doorTypes: [], ...(prev ?? {}),
    receivedAt: new Date().toISOString(),
    source: studio.length ? 'studio+schedule' : 'schedule',
    studioFrames: studio,
    schedule: { fileName: doc.fileName, kind: doc.kind, receivedAt: new Date().toISOString(), frames: doc.frames ?? [] },
    jobDefaults: prev?.jobDefaults ?? doc.jobDefaults ?? null,
    doorTypes: prev?.doorTypes?.length ? prev.doorTypes : doc.doorTypes ?? [],
    nonFrames: prev?.nonFrames?.length ? prev.nonFrames : doc.nonFrames ?? [],
    nonFramesApplied: prev?.nonFrames?.length ? prev?.nonFramesApplied ?? false : false,
    frames: combineSources(studio, doc.frames ?? [], { scheduleFile: doc.fileName }),
    focus: null,
  };
}

function summarizeOther(o) {
  return {
    glassOnly: o.glassOnly.added + o.glassOnly.updated + o.glassOnly.kept,
    bidLines: o.bidLines.added + o.bidLines.updated + o.bidLines.kept,
    kept: o.glassOnly.kept + o.bidLines.kept,
    brake: o.brake, notes: o.notes,
  };
}

function isPristine(f) {
  return f.columns.length === 3 && f.columns.every((c) => c.dlo == null && c.kind === 'glass') && f.rows.length === 1 && !f.notes;
}
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

  // ── Incoming from Studio / window schedule ──
  //
  // takeoff.incoming = { receivedAt, source, studioProject, pdfName, frames: [payload],
  //                      nonFrames, doorTypes, jobDefaults }
  // Nothing is built until the estimator says so (Build all / per row).

  /**
   * Receive a hand-off packet.  Goes to `packet.builderProject`, else the open
   * project.  A project that isn't open gets it in its saved takeoff, ready for
   * when it is opened.  → { target, frames }
   */
  receive(packet) {
    const target = packet?.builderProject || get().projectName || null;
    if (!target) {
      try { localStorage.setItem(KEY_UNASSIGNED, JSON.stringify(packet)); } catch { /* ignore */ }
      return { target: null, frames: packet?.doc?.frames?.length ?? 0 };
    }
    const merge = (tp) => ({ ...tp, incoming: mergeIncoming(tp.incoming, packet) });
    if (target === get().projectName && get().takeoff) {
      get()._commit(merge(get().takeoff));
    } else {
      const tp = readSaved(target) ?? createTakeoff({ name: target, projectId: target, frames: [] });
      try { localStorage.setItem(KEY(target), JSON.stringify({ ...merge(tp), updatedAt: new Date().toISOString() })); }
      catch (err) { console.error('[FrameBuilder] could not store incoming frames', err); }
    }
    return { target, frames: packet?.doc?.frames?.length ?? 0 };
  },

  /** A window schedule read in the Frame Builder → Incoming, merged with Studio by mark. */
  receiveSchedule(doc) {
    const tp = get().takeoff;
    if (!tp) return { frames: 0, merged: 0 };
    const incoming = mergeScheduleIncoming(tp.incoming, doc);
    get()._commit({ ...tp, incoming });
    return {
      frames: incoming.frames.length,
      merged: incoming.frames.filter((p) => p.source === 'studio+schedule').length,
      scheduleOnly: incoming.frames.filter((p) => p.source === 'schedule').length,
    };
  },

  /** Pick up a packet that arrived with no project (Studio opened on its own). */
  claimUnassigned() {
    try {
      const raw = localStorage.getItem(KEY_UNASSIGNED);
      if (!raw) return 0;
      localStorage.removeItem(KEY_UNASSIGNED);
      const packet = JSON.parse(raw);
      get().receive({ ...packet, builderProject: get().projectName });
      return packet?.doc?.frames?.length ?? 0;
    } catch { return 0; }
  },

  /**
   * Build incoming frames (all, or the given item ids).  A mark already built (from
   * Studio or the schedule) is re-synced: untouched fields update, edited fields are kept with a
   * "drawing now says" note.  → { added, updated, kept, glassTypes }
   */
  buildIncoming(itemIds = null) {
    const tp = get().takeoff;
    const inc = tp?.incoming;
    if (!inc?.frames?.length) return { added: 0, updated: 0, kept: 0, glassTypes: 0 };
    const pick = inc.frames.filter((p) => p.buildable !== false && (!itemIds || itemIds.includes(p.itemId)));
    const job = importJob({ frames: pick, jobDefaults: inc.jobDefaults }, tp, { source: inc.source ?? 'studio' });
    const glassTypes = [...(tp.glassTypes?.length ? tp.glassTypes : defaultGlassTypes()), ...job.glassTypes];
    let frames = [...tp.frames];
    const sets = { ...tp.frameSets };
    let added = 0; let updated = 0; let kept = 0;
    let firstId = null;
    pick.forEach((p, i) => {
      const fresh = job.frames[i].spec;
      const idx = findImported(frames, p);
      if (idx >= 0) {
        const r = resyncFrame(frames[idx], p, { takeoff: { ...tp, glassTypes, finish: job.finish }, glassTypeIdFor: job.glassTypeIdFor, source: inc.source });
        frames[idx] = r.spec;
        if (r.updated.length) updated++;
        if (r.kept.length) kept++;
        firstId ??= r.spec.id;
      } else {
        frames.push(fresh);
        if (fresh.frameSet && !sets[fresh.frameSet]) sets[fresh.frameSet] = { liftLine: null, difficulty: 1 };
        added++;
        firstId ??= fresh.id;
      }
    });
    // a fresh takeoff's placeholder frame (SF-1, untouched) goes away once real frames arrive
    if (added && frames.length > added) {
      frames = frames.filter((f) => !(f.importMeta == null && f.mark === 'SF-1' && isPristine(f)));
    }
    const built = new Set(pick.map((p) => p.itemId));
    const left = inc.frames.filter((p) => !built.has(p.itemId));
    let next = { ...tp, glassTypes, frames, frameSets: sets,
      incoming: { ...inc, frames: left, built: [...(inc.built ?? []), ...built] } };
    // Build all also files the other lines (glass-only, bid cart lines) — decision 7
    let other = null;
    if (!itemIds && inc.nonFrames?.length && !inc.nonFramesApplied) {
      other = applyNonFrames(next, inc.nonFrames, { glassTypeIdFor: job.glassTypeIdFor, source: inc.source ?? 'studio' });
      next = { ...other.takeoff, incoming: { ...next.incoming, nonFramesApplied: inc.receivedAt ?? true } };
    }
    get()._commit(next);
    if (firstId) set({ selectedFrameId: firstId, selection: null });
    return { added, updated, kept, glassTypes: job.glassTypes.length, other: other && summarizeOther(other) };
  },

  /** File the incoming non-frame lines: glass-only → glass report, the rest → bid cart lines. */
  applyIncomingNonFrames() {
    const tp = get().takeoff;
    const inc = tp?.incoming;
    if (!inc?.nonFrames?.length) return null;
    const job = importJob({ frames: [], jobDefaults: inc.jobDefaults }, tp, { source: inc.source ?? 'studio' });
    const glassTypes = [...(tp.glassTypes?.length ? tp.glassTypes : defaultGlassTypes()), ...job.glassTypes];
    const other = applyNonFrames({ ...tp, glassTypes }, inc.nonFrames, { glassTypeIdFor: job.glassTypeIdFor, source: inc.source ?? 'studio' });
    get()._commit({ ...other.takeoff, incoming: { ...inc, nonFramesApplied: inc.receivedAt ?? true } });
    return summarizeOther(other);
  },

  // ── Glass-only lites and bid cart lines (non-frame takeoff) ──
  updateGlassOnly(id, patch) {
    const tp = get().takeoff;
    get()._commit({ ...tp, glassOnly: (tp.glassOnly ?? []).map((g) => (g.id === id ? setGlassOnly(g, patch) : g)) });
  },
  removeGlassOnly(id) {
    const tp = get().takeoff;
    get()._commit({ ...tp, glassOnly: (tp.glassOnly ?? []).filter((g) => g.id !== id) });
  },
  addGlassOnly() {
    const tp = get().takeoff;
    const n = (tp.glassOnly ?? []).length + 1;
    const row = { id: `GO-new-${Date.now()}`, itemId: `GO-new-${Date.now()}`, mark: `GO-${n}`, description: '', glassTypeId: null,
      width: null, height: null, sizeIs: null, qty: 1, tempered: null, needs: [], flags: [], citations: [], source: 'manual', edited: true };
    get()._commit({ ...tp, glassOnly: [...(tp.glassOnly ?? []), row] });
  },
  acceptGlassOnlyDrawing(id) {
    const tp = get().takeoff;
    get()._commit({ ...tp, glassOnly: (tp.glassOnly ?? []).map((g) => {
      if (g.id !== id || !g.drawingSays?.length) return g;
      const patch = Object.fromEntries(g.drawingSays.map((d) => [d.field, d.drawing]));
      return { ...setGlassOnly(g, patch), drawingSays: [] };
    }) });
  },
  updateBidLine(id, patch) {
    const tp = get().takeoff;
    get()._commit({ ...tp, bidLines: (tp.bidLines ?? []).map((b) => (b.id === id ? setBidLine(b, patch) : b)) });
  },
  removeBidLine(id) {
    const tp = get().takeoff;
    get()._commit({ ...tp, bidLines: (tp.bidLines ?? []).filter((b) => b.id !== id) });
  },
  addBidLine(group = 'Other') {
    const tp = get().takeoff;
    const id = `BL-new-${Date.now()}`;
    get()._commit({ ...tp, bidLines: [...(tp.bidLines ?? []), { id, itemId: id, group, description: '', quantity: null, unit: 'EA',
      flags: [], citations: [], source: 'manual', edited: true }] });
  },

  /** Drop incoming frames without building them. */
  dismissIncoming(itemIds = null) {
    const tp = get().takeoff;
    if (!tp?.incoming) return;
    const frames = itemIds ? tp.incoming.frames.filter((p) => !itemIds.includes(p.itemId)) : [];
    get()._commit({ ...tp, incoming: { ...tp.incoming, frames, nonFrames: itemIds ? tp.incoming.nonFrames : [] } });
  },

  /** Take the drawing's value for one field the estimator had edited. */
  acceptDrawing(id, field) {
    get().updateFrame(id, (f) => acceptDrawingValue(f, field));
  },

  /** The estimator has looked at an imported frame's flags. */
  markReviewed(id) {
    get().updateFrame(id, (f) => (f.importMeta ? { ...f, importMeta: { ...f.importMeta, open: false, reviewedAt: new Date().toISOString() } } : f));
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
