/**
 * importer.js — Studio / window-schedule frame payloads → FrameSpecs.
 *
 *   const { spec, needsInput, set } = importFrame(payload, { takeoff })
 *   const job = importJob(payloadsDoc, takeoff)   // { frames: [...], glassTypes, finish, report }
 *   const diff = resyncFrame(existingSpec, payload, { takeoff })   // re-send: untouched fields update,
 *                                                                  // edited fields kept + "drawing now says X"
 *
 * Payload: `glazebid.framePayloads/2` frame (sidecar frames.py) — a superset of the
 * Cowork §4 payload hydrateFrame() reads.  Geometry arrives as member CENTERLINES read
 * off the drawing (mullionsX / per-column horizontalsAt, inches from the frame's left /
 * bottom edge); the Frame Builder works in DLO, so each span is converted with the
 * system's sightlines:
 *     edge bay   DLO = span − perimeter sightline − mullion sightline / 2
 *     inner bay  DLO = span − mullion sightline
 *     (rows the same with sill / head / horizontal sightlines)
 * One glass bay (the widest) and one row per bay (the tallest) are left EQ so the frame
 * always closes on the overall size; door bays are locked at the door opening.
 *
 * Every spec carries `importMeta`:
 *   { source, itemId, importedAt, confidence, needs: [...], provenance: {...},
 *     imported: { <field>: value as imported } }   ← re-sync compares against this
 */

import { num } from './units.js';
import { createFrame, normalizeSpec, defaultDoor, newId } from './model.js';
import { getSystem, listSystems } from './library.js';
import { effectiveSystem } from './geometry.js';

const r4 = (v) => Math.round(v * 10000) / 10000;
const r16 = (v) => Math.round(v * 16) / 16;

// ── System from what the drawings / specs named ──────────────────────────────

const CLASS_DEFAULT = {
  ext_sf: 'kawneer-451t', int_sf: 'kawneer-450', fire_rated_sf: 'kawneer-450', int_alum_partition: 'kawneer-450',
  alum_frame_only: 'kawneer-450', ext_cw: 'kawneer-1600-75', int_cw: 'kawneer-1600-6', window_wall: 'kawneer-451t',
  window: 'kawneer-451t',
};

/** { systemId, how: 'named'|'equal'|'class default', note } */
export function resolveSystem(payload, customSystems = []) {
  const maker = String(payload.manufacturer ?? '').toLowerCase();
  const series = String(payload.frameSeries ?? '').toUpperCase().replace(/\s+/g, ' ');
  const cls = payload.cls ?? (String(payload.systemType ?? '').includes('curtain') ? 'ext_cw' : 'ext_sf');
  const make = maker.includes('tubelite') ? 'tubelite' : 'kawneer';
  const pick = (kid) => {
    const id = make === 'tubelite' ? kid.replace('kawneer-', 'tubelite-') : kid;
    return getSystem(id, customSystems)?.id === id ? id : kid;
  };
  if (maker.includes('kawneer') || maker.includes('tubelite')) {
    const s = series.replace(/TRI-?FAB|VG|SERIES|SYSTEM|WALL/g, ' ');
    let kid = null;
    if (/1600\s*UT/.test(s)) kid = 'kawneer-1600ut';
    else if (/1620/.test(s)) kid = 'kawneer-1620';
    else if (/1600|400\s*CW/.test(s)) kid = /6"|\b6\b/.test(series) && !/7/.test(series) ? 'kawneer-1600-6' : 'kawneer-1600-75';
    else if (/501/.test(s)) kid = 'kawneer-501t-ir';
    else if (/601\s*UT|TU24650/.test(s)) kid = 'kawneer-601ut';
    else if (/601\s*T|T24650/.test(s)) kid = 'kawneer-601t';
    else if (/601|E24650/.test(s)) kid = 'kawneer-601';
    else if (/451\s*UT|TU14000/.test(s)) kid = 'kawneer-451ut';
    else if (/451\s*-?\s*T|T14000/.test(s)) kid = 'kawneer-451t';
    else if (/451|E14000/.test(s)) kid = 'kawneer-451';
    else if (/450|4500/.test(s)) kid = 'kawneer-450';
    if (kid) return { systemId: pick(kid), how: 'named', note: `${payload.manufacturer} ${payload.frameSeries}` };
  }
  // another maker named (PITCO, YKK…): priced as the Kawneer / Tubelite equal by size class
  const kid = CLASS_DEFAULT[cls] ?? 'kawneer-451t';
  if (maker && !maker.includes('kawneer') && !maker.includes('tubelite')) {
    let alt = kid;
    if (/2\s*X\s*6|\b6"|TMW|CW/.test(series) && cls.endsWith('sf')) alt = 'kawneer-601t';
    return { systemId: alt, how: 'equal', note: `${payload.manufacturer} ${payload.frameSeries ?? ''} named — priced as the Kawneer equal; confirm` };
  }
  return { systemId: kid, how: 'class default', note: `no series named — ${getSystem(kid)?.name ?? kid} assumed` };
}

// ── Centerlines → DLO ────────────────────────────────────────────────────────

function spansFrom(positions, total) {
  const edges = [0, ...positions, total];
  return edges.slice(1).map((e, i) => e - edges[i]);
}

/** CL spans across a run → DLOs (perimeter member each end, intermediate members between). */
export function spansToDlo(spans, perimA, perimB, inner) {
  const n = spans.length;
  return spans.map((s, i) => s - (i === 0 ? perimA : inner / 2) - (i === n - 1 ? perimB : inner / 2));
}

function eqIndex(values, eligible) {
  let best = -1;
  values.forEach((v, i) => { if (eligible(i) && (best < 0 || v > values[best])) best = i; });
  return best;
}

// ── One frame ────────────────────────────────────────────────────────────────

/**
 * @param {object} p        frame payload (framePayloads/2, or a Cowork §4 payload)
 * @param {object} [opts]   { takeoff, glassTypeIdFor(text), defaultJoints, source }
 */
export function importFrame(p = {}, opts = {}) {
  const tp = opts.takeoff ?? {};
  const needs = [...(p.needs ?? [])].map((n) => ({ field: n.field, reason: n.reason }));
  const need = (field, reason) => needs.push({ field, reason });
  const set = [];

  const sys = resolveSystem(p, tp.customSystems ?? []);
  if (sys.how !== 'named' && !needs.some((n) => n.field === 'system')) need('system', sys.note);

  // size + mode (decision 14)
  let W = num(p.overallWidth, 0); let H = num(p.overallHeight, 0);
  const joints = { head: 0.5, sill: 0.25, left: 0.25, right: 0.25, ...(opts.defaultJoints ?? tp.company?.defaultJoints ?? {}) };
  let mode = p.sizeMode === 'ro' ? 'ro' : 'frame';

  // a door with no frame type → its own door frame around the opening
  const probe = normalizeSpec({ systemId: sys.systemId, columns: [{ kind: 'glass' }] });
  const P = effectiveSystem(probe, tp.customSystems ?? []).profiles;
  const hdrSL = num(P.doorHeader?.sightline, P.head.sightline);
  if (p.standaloneDoor) {
    const d = (p.doors ?? [])[0] ?? {};
    const ow = num(d.width, 0); const oh = num(d.height, 0);
    W = ow ? r4(ow + 2 * P.jamb.sightline) : 0;
    H = oh ? r4(oh + P.head.sightline) : 0;
    mode = 'frame';
  }
  if (W > 0 && H > 0) set.push('size');

  // ── columns ──
  const frameW = mode === 'ro' ? W - joints.left - joints.right : W;
  const frameH = mode === 'ro' ? H - joints.head - joints.sill : H;
  let columns; let rows = [{ dlo: null }]; const bayRows = {};
  const doorsByMark = new Map((p.doors ?? []).map((d) => [d.mark, d]));
  const usedDoors = new Set();
  const doorSpec = (d, colW, openingH) => {
    const kind = d?.kind === 'pair' || colW >= 60 ? 'pair' : 'single';
    const door = { ...defaultDoor(kind), mark: d?.mark ?? '', height: r16(num(openingH, d?.height ?? 84)) };
    if (d?.stile) door.stile = d.stile;
    if (d?.panic) door.hardwarePreset = kind === 'pair' ? 'cvr' : 'rim';
    if (d?.hardware) door.notes = `Hardware set ${d.hardware}`;
    return door;
  };

  if (p.standaloneDoor) {
    const d = (p.doors ?? [])[0];
    columns = [{ kind: 'door', dlo: num(d?.width, null), locked: true, door: doorSpec(d, num(d?.width, 36), d?.height) }];
    if (d) usedDoors.add(d.mark);
    set.push('doors');
  } else if (Array.isArray(p.columns) && p.columns.length && frameW > 0) {
    // the elevation's grid: CL spans → DLO
    const spans = p.columns.map((c) => num(c.widthCL, 0));
    const scale = spans.reduce((a, b) => a + b, 0) > 0 ? frameW / spans.reduce((a, b) => a + b, 0) : 1;
    const dlos = spansToDlo(spans.map((s) => s * scale), P.jamb.sightline, P.jamb.sightline, P.mullion.sightline);
    const eqCol = eqIndex(dlos, (i) => p.columns[i].kind !== 'door');
    columns = p.columns.map((c, i) => {
      if (c.kind === 'door') {
        const d = doorsByMark.get(c.door) ?? null;
        if (d) usedDoors.add(d.mark);
        // the door opening runs from the floor to the header's underside
        let openH = c.doorHeight ? c.doorHeight - hdrSL / 2 : num(d?.height, 84);
        if (openH > frameH - P.head.sightline) {             // unknown / too tall: the door runs to the head
          openH = frameH - P.head.sightline;
          need('doors', `Door bay ${i + 1}: door height not read — taken to the head (${r16(openH)}"). Confirm.`);
        }
        return { kind: 'door', dlo: r16(dlos[i]), locked: true, door: doorSpec(d, dlos[i], openH) };
      }
      return { kind: 'glass', dlo: i === eqCol ? null : r16(dlos[i]) };
    });
    // rows per bay: horizontals (CL from the frame bottom) → row DLOs
    const rowsOf = (c, i) => {
      const hz = (c.horizontalsAt ?? []).filter((h) => h > 0 && h < frameH);
      if (c.kind === 'door') {
        const dh = c.doorHeight ?? null;
        const above = hz.filter((h) => dh == null || h > dh + 1);
        if (!above.length) return null;                     // one transom lite: engine default
        const tops = spansFrom(above.map((h) => h - (dh ?? 0)), frameH - (dh ?? 0));
        const d = spansToDlo(tops, hdrSL / 2, P.head.sightline, P.horizontal.sightline);
        const eq = eqIndex(d, () => true);
        return d.map((v, k) => ({ dlo: k === eq ? null : r16(v) }));
      }
      if (!hz.length) return [{ dlo: null }];
      const d = spansToDlo(spansFrom(hz, frameH), P.sill.sightline, P.head.sightline, P.horizontal.sightline);
      const eq = eqIndex(d, () => true);
      return d.map((v, k) => ({ dlo: k === eq ? null : r16(v) }));
    };
    const perCol = p.columns.map(rowsOf);
    // a shared pattern becomes the frame rows; bays that differ get their own rows
    const key = (r) => JSON.stringify((r ?? []).map((x) => x.dlo));
    const glassIdx = p.columns.map((c, i) => (c.kind === 'glass' ? i : -1)).filter((i) => i >= 0);
    const counts = new Map();
    for (const i of glassIdx) counts.set(key(perCol[i]), (counts.get(key(perCol[i])) ?? 0) + 1);
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (common) rows = JSON.parse(common).map((dlo) => ({ dlo }));
    p.columns.forEach((c, i) => {
      const r = perCol[i];
      if (r && (c.kind === 'door' || key(r) !== common)) bayRows[i] = r;
    });
    set.push('bays', 'rows');
  } else {
    // no grid: bay / row counts (EQ) or the engine's mullion lines
    const n = Math.max(1, Math.round(num(p.panelCount, 1)));
    const nr = Math.max(1, Math.round(num(p.rowCount, 1)));
    if (Array.isArray(p.mullionsX) && p.mullionsX.length === n - 1 && frameW > 0) {
      const dl = spansToDlo(spansFrom(p.mullionsX, frameW), P.jamb.sightline, P.jamb.sightline, P.mullion.sightline);
      const eq = eqIndex(dl, () => true);
      columns = dl.map((v, i) => ({ kind: 'glass', dlo: i === eq ? null : r16(v) }));
    } else columns = Array.from({ length: n }, () => ({ kind: 'glass', dlo: null }));
    if (Array.isArray(p.mullionsY) && p.mullionsY.length === nr - 1 && frameH > 0) {
      const dl = spansToDlo(spansFrom(p.mullionsY, frameH), P.sill.sightline, P.head.sightline, P.horizontal.sightline);
      const eq = eqIndex(dl, () => true);
      rows = dl.map((v, i) => ({ dlo: i === eq ? null : r16(v) }));
    } else rows = Array.from({ length: nr }, () => ({ dlo: null }));
    // doors named on the schedule but no bay read: the first door-sized bay, flagged
    for (const d of p.doors ?? []) {
      if (usedDoors.has(d.mark)) continue;
      need('doors', `Door ${d.mark} belongs in this frame but its bay was not read — set the door bay.`);
    }
  }
  for (const d of p.doors ?? []) {
    if (!usedDoors.has(d.mark) && !needs.some((n) => n.field === 'doors' && n.reason.includes(d.mark))) {
      need('doors', `Door ${d.mark} belongs in this frame but no door bay was matched to it.`);
    }
  }

  // glass / finish
  const glassId = opts.glassTypeIdFor ? opts.glassTypeIdFor(p.primaryGlass) : null;
  if (p.primaryGlass && !glassId) need('glass', `Glass "${p.primaryGlass}" didn't match a job glass type — project default used.`);

  const notes = [
    p.description ? `Drawing: ${p.description}` : null,
    p.notes || null,
    p.variants?.length ? `Elevation also drawn at ${p.variants.map((v) => `${r16(v.overallWidth)} x ${r16(v.overallHeight)}${v.sheet ? ` (${v.sheet})` : ''}`).join(', ')} — make a variant if it's a different opening.` : null,
  ].filter(Boolean).join('\n');

  const spec = normalizeSpec(createFrame({
    id: newId('frame'),
    mark: p.mark ?? '',
    frameSet: p.frameSet ?? frameSetFor(p.cls),
    quantity: num(p.quantity, 1),
    notes,
    systemId: sys.systemId,
    joinery: getSystem(sys.systemId)?.defaultJoinery ?? null,
    finish: p.finish ?? tp.finish ?? '',
    size: { mode, width: r16(W), height: r16(H), joints: mode === 'ro' ? joints : { head: 0, sill: 0, left: 0, right: 0 } },
    sillAFF: num(p.sillAFF, 0),
    columns, rows, bayRows,
    glass: { frameDefault: glassId, lites: {}, temper: {}, hazards: {} },
  }));
  if (!(W > 0 && H > 0)) need('size', 'No size — enter it before building.');
  if (p.sillAFF == null && !p.standaloneDoor) need('sillAFF', 'Sill AFF not on the drawing — 0" used.');

  const uniq = [];
  for (const n of needs) if (!uniq.some((u) => u.field === n.field && u.reason === n.reason)) uniq.push(n);
  spec.importMeta = {
    source: opts.source ?? 'studio',
    itemId: p.itemId ?? p.mark ?? null,
    importedAt: new Date().toISOString(),
    confidence: p.confidence ?? null,
    system: sys,
    needs: uniq,
    provenance: p.provenance ?? {},
    citations: p.citations ?? [],
    imported: snapshot(spec),
    open: uniq.length > 0,
  };
  return { spec, needsInput: uniq, set: [...new Set(set)] };
}

function frameSetFor(cls) {
  return { ext_sf: 'EX SF', int_sf: 'INT SF', fire_rated_sf: 'INT SF', ext_cw: 'EX CW', int_cw: 'INT CW', window_wall: 'EX WW',
    window: 'WINDOWS', int_alum_partition: 'INT SF', alum_frame_only: 'INT SF' }[cls] ?? 'EX SF';
}

/** The fields re-sync tracks, as plain values. */
export function snapshot(spec) {
  return {
    quantity: spec.quantity,
    size: { mode: spec.size.mode, width: spec.size.width, height: spec.size.height },
    systemId: spec.systemId,
    finish: spec.finish,
    glass: spec.glass.frameDefault,
    columns: spec.columns.map((c) => ({ kind: c.kind, dlo: c.dlo, doorMark: c.door?.mark ?? null, doorHeight: c.door?.height ?? null })),
    rows: spec.rows.map((r) => r.dlo),
    bayRows: Object.fromEntries(Object.entries(spec.bayRows ?? {}).map(([k, v]) => [k, v.map((r) => r.dlo)])),
  };
}

// ── Whole job ────────────────────────────────────────────────────────────────

/**
 * Turn a framePayloads/2 document into specs + job-level additions.
 *   → { frames: [{ spec, needsInput }], glassTypes: [new types], finish, nonFrames, report }
 */
export function importJob(doc = {}, takeoff = {}, opts = {}) {
  // (opts.source: 'studio' | 'schedule')
  const existing = takeoff.glassTypes ?? [];
  const newTypes = [];
  const jd = doc.jobDefaults ?? {};
  // job glass types from the specs / drawing notes (decision 12)
  for (const g of jd.glassTypes ?? []) {
    const d = String(g.description ?? '');
    if (existing.concat(newTypes).some((t) => t.source?.text === d)) continue;
    const ig = g.insulating || /\b1"\s*(insul|igu)/i.test(d);
    const id = `SPEC-${newTypes.length + 1}`;
    newTypes.push({
      id, mark: id, description: d.slice(0, 80), kind: /spandrel/i.test(d) ? 'spandrel' : 'vision',
      makeup: ig ? '1/4" + 1/2" AS + 1/4"' : '1/4"', plies: ig ? [0.25, 0.25] : [0.25],
      heat: g.tempered ? 'tempered' : 'annealed', nominal: ig ? 1 : 0.25,
      source: { from: 'specs', section: g.section, page: g.page, text: d },
      use: g.exterior ? 'exterior' : g.interior ? 'interior' : null,
    });
  }
  const allTypes = existing.concat(newTypes);
  const glassTypeIdFor = (txt) => {
    if (!txt) return null;
    const t = String(txt).toLowerCase();
    const byMark = allTypes.find((g) => g.mark && t.includes(String(g.mark).toLowerCase()));
    if (byMark) return byMark.id;
    const ig = /\b1"|insul|igu/.test(t); const mono = /1\/4"|monolithic/.test(t) && !ig;
    const spec = newTypes.find((g) => (ig && g.nominal === 1) || (mono && g.nominal === 0.25));
    if (spec) return spec.id;
    return allTypes.find((g) => (ig && g.nominal === 1 && g.kind === 'vision') || (mono && g.nominal === 0.25))?.id ?? null;
  };
  const finish = jd.finish?.value ?? null;
  const frames = (doc.frames ?? []).map((p) => importFrame(p, { takeoff: { ...takeoff, finish }, glassTypeIdFor, source: opts.source ?? 'studio' }));
  return {
    frames,
    glassTypes: newTypes,
    glassTypeIdFor,
    finish,
    nonFrames: doc.nonFrames ?? [],
    doorTypes: doc.doorTypes ?? [],
    report: {
      frames: frames.length,
      needInput: frames.filter((f) => f.needsInput.length).length,
      buildable: (doc.frames ?? []).filter((p) => p.buildable !== false).length,
      newGlassTypes: newTypes.length,
    },
  };
}

// ── Re-sync (decision 5) ─────────────────────────────────────────────────────

const FIELDS = ['quantity', 'size', 'systemId', 'finish', 'glass', 'columns', 'rows', 'bayRows'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merge a re-sent payload into a frame the estimator may have edited.
 *   untouched fields (current == what was imported) → take the new drawing value
 *   edited fields (current != imported)             → keep, add a "drawing now says" note
 * → { spec, updated: [field], kept: [{ field, now, drawing }] }
 */
export function resyncFrame(current, payload, opts = {}) {
  const fresh = importFrame(payload, opts).spec;
  const before = current.importMeta?.imported;
  if (!before) return { spec: current, updated: [], kept: [], reason: 'not an imported frame' };
  const cur = snapshot(current);
  const nxt = snapshot(fresh);
  const out = structuredClone(current);
  const updated = []; const kept = [];
  for (const f of FIELDS) {
    if (same(cur[f], nxt[f])) continue;                     // nothing changed on the drawing side
    if (same(cur[f], before[f])) {                          // untouched by the estimator → update
      applyField(out, fresh, f);
      updated.push(f);
    } else if (!same(before[f], nxt[f])) {                  // edited AND the drawing changed → ask
      kept.push({ field: f, now: cur[f], drawing: nxt[f] });
    }
  }
  out.importMeta = {
    ...current.importMeta,
    importedAt: new Date().toISOString(),
    needs: fresh.importMeta.needs,
    provenance: fresh.importMeta.provenance,
    imported: { ...before, ...Object.fromEntries(updated.map((f) => [f, nxt[f]])) },
    drawingSays: kept,
    open: kept.length > 0 || fresh.importMeta.needs.length > 0,
  };
  return { spec: normalizeSpec(out), updated, kept };
}

function applyField(out, fresh, f) {
  if (f === 'size') out.size = structuredClone(fresh.size);
  else if (f === 'glass') out.glass = { ...out.glass, frameDefault: fresh.glass.frameDefault };
  else if (f === 'columns') { out.columns = structuredClone(fresh.columns); out.bayRows = structuredClone(fresh.bayRows); }
  else if (f === 'rows') out.rows = structuredClone(fresh.rows);
  else if (f === 'bayRows') out.bayRows = structuredClone(fresh.bayRows);
  else out[f] = structuredClone(fresh[f]);
}

/** Accept one "drawing now says" value on an edited frame. */
export function acceptDrawingValue(spec, field, opts = {}) {
  const k = (spec.importMeta?.drawingSays ?? []).find((x) => x.field === field);
  if (!k) return spec;
  const out = structuredClone(spec);
  const v = k.drawing;
  if (field === 'size') out.size = { ...out.size, ...v };
  else if (field === 'glass') out.glass = { ...out.glass, frameDefault: v };
  else if (field === 'columns') out.columns = v.map((c, i) => ({ ...(out.columns[i] ?? {}), kind: c.kind, dlo: c.dlo }));
  else if (field === 'rows') out.rows = v.map((dlo) => ({ dlo }));
  else if (field === 'bayRows') out.bayRows = Object.fromEntries(Object.entries(v).map(([c, rs]) => [c, rs.map((dlo) => ({ dlo }))]));
  else out[field] = v;
  out.importMeta = { ...out.importMeta, drawingSays: out.importMeta.drawingSays.filter((x) => x.field !== field),
    imported: { ...out.importMeta.imported, [field]: v } };
  return normalizeSpec(out);
}

export { listSystems };
