/**
 * nonframes.js — takeoff lines that aren't frames (decision 7).
 *
 *   routeNonFrame(line)        → { route: 'brake' | 'glass' | 'bid' | 'note', group }
 *     brake  break metal the engine placed on the frames it touches (pieces on each frame)
 *     glass  glazing-only lites (glass into frames / doors by others) → the glass report
 *     bid    mirrors, translucent panels, pass-thru, railings, frameless glass, sun control,
 *            doors in existing frames, break metal not tied to a frame → bid cart lines
 *     note   drawing notes — shown, never priced
 *   brakeFromPayload(list)     → brake pieces for a frame (girth / brakes / hems assumed, flagged)
 *   applyNonFrames(tp, lines)  → takeoff.glassOnly / takeoff.bidLines, upserted by item
 *   glassOnlySizes(tp)         → glass-only lites in the glass report's shape (only rows with a
 *                                confirmed lite size; an opening size read off the drawing is listed, not ordered)
 *   setGlassOnly(row, patch)   → estimator edit (a size typed here is the lite size)
 */
import { num, r4, roundTo, blockSize, formatInches } from './units.js';
import { newBrakePiece } from './brakeMetal.js';
import { defaultGlassTypes, glassLbPerSf, isMonolithic, glassGroupKey } from './glass.js';

const BID_GROUP = {
  mirror: 'Mirrors', translucent_panel: 'Translucent panels', glass_handrail: 'Glass railings',
  sun_control: 'Sun control', all_glass_wall: 'Frameless glass walls & doors', shower: 'Shower enclosures',
  auto_entrance: 'Automatic entrances', revolving_door: 'Revolving doors', fire_rated_glass: 'Fire-rated glass',
  skylight: 'Skylights', canopy: 'Canopies', louver: 'Louvers', break_metal: 'Brake metal',
};
const titleCase = (s) => String(s ?? 'Other').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function routeNonFrame(n = {}) {
  if (n.kind === 'note') return { route: 'note', group: 'Notes' };
  if (n.kind === 'glass') return { route: 'glass', group: 'Glass only' };
  if (n.kind === 'brake_metal' && n.placedOn?.length) return { route: 'brake', group: 'Brake metal' };
  if (n.passThru || /pass[\s_-]?thru|pass[\s_-]?through|transaction/i.test(`${n.cls} ${n.description}`)) return { route: 'bid', group: 'Pass-thru' };
  if (n.kind === 'door') return { route: 'bid', group: 'Doors in existing frames' };
  return { route: 'bid', group: BID_GROUP[n.cls] ?? titleCase(n.cls) };
}

const EDGE_LABEL = { head: 'Head', sill: 'Sill', jambs: 'Jambs', jambL: 'Left jamb', jambR: 'Right jamb', perimeter: 'Perimeter' };
export const BRAKE_ASSUMED = { girth: 12, bends: 3, hems: 1, gauge: '.040 alum' };

/** Payload brakeMetal [{ edge, description, details }] → frame brake pieces. */
export function brakeFromPayload(list = []) {
  return (list ?? []).filter((b) => EDGE_LABEL[b.edge]).map((b) => newBrakePiece({
    description: b.description || `${EDGE_LABEL[b.edge]} brake metal`,
    edge: b.edge, length: null, qty: 1, ...BRAKE_ASSUMED, finish: '',
    details: b.details ?? [], fromDrawing: true,
  }));
}

/** A glazing-only line → a glass-only row (no frame: glass into HM frames / doors by others). */
export function glassOnlyRow(n, { glassTypeIdFor, source } = {}) {
  const needs = [];
  const w = num(n.w_in, 0); const h = num(n.h_in, 0);
  if (w > 0 && h > 0) {
    needs.push({ field: 'size', reason: `${formatInches(w)} × ${formatInches(h)} is the opening / frame size read from the drawing — enter the lite size (DLO + bite) before ordering.` });
  } else {
    needs.push({ field: 'size', reason: 'No size on the drawings — enter the lite size.' });
  }
  const glassTypeId = glassTypeIdFor ? glassTypeIdFor(n.glass ?? n.description) : null;
  if (!glassTypeId) needs.push({ field: 'glass', reason: n.glass ? `Glass "${String(n.glass).slice(0, 60)}" didn't match a job glass type — project default used.` : 'No glass named — project default used.' });
  return {
    id: `GO-${n.itemId}`, itemId: n.itemId, mark: n.itemId, cls: n.cls,
    description: String(n.description ?? '').slice(0, 200), glassText: n.glass ?? null, glassTypeId,
    width: w > 0 ? r4(w) : null, height: h > 0 ? r4(h) : null, sizeIs: w > 0 && h > 0 ? 'opening' : null,
    qty: Math.max(1, Math.round(num(n.quantity, 1))), tempered: null,
    needs, flags: n.flags ?? [], citations: n.citations ?? [], source: source ?? 'studio', edited: false,
  };
}

/** A line for the bid cart. */
export function bidLine(n, group, { source } = {}) {
  const flags = [...(n.flags ?? [])];
  if (n.quantity == null) flags.push('No quantity read — take it off by hand.');
  if (n.kind === 'brake_metal') flags.push('Break metal not tied to a frame on the drawings — priced as a job line.');
  return {
    id: `BL-${n.itemId}`, itemId: n.itemId, group, cls: n.cls,
    description: String(n.description ?? '').slice(0, 200),
    quantity: n.quantity == null ? null : r4(num(n.quantity, 0)), unit: n.unit || 'EA',
    width: n.w_in ?? null, height: n.h_in ?? null, sfTotal: n.sf_total ?? null,
    alternate: n.alternate ?? null, flags, citations: n.citations ?? [], source: source ?? 'studio', edited: false,
  };
}

const TRACKED = { glass: ['width', 'height', 'qty', 'glassTypeId'], bid: ['quantity', 'unit', 'description'] };

/**
 * Put the routed lines on the takeoff.  Rows already there (same item) update unless the
 * estimator edited them — then they're kept and the drawing's values noted on the row.
 * → { takeoff, glassOnly: { added, updated, kept }, bidLines: { … }, brake: n, notes: n }
 */
export function applyNonFrames(tp, lines = [], opts = {}) {
  const glassOnly = [...(tp.glassOnly ?? [])];
  const bidLines = [...(tp.bidLines ?? [])];
  const brakeMeasured = [...(tp.brakeMeasured ?? [])];
  const rep = { glassOnly: { added: 0, updated: 0, kept: 0 }, bidLines: { added: 0, updated: 0, kept: 0 }, brake: 0, notes: 0 };
  const upsert = (list, row, kind, r) => {
    const i = list.findIndex((x) => x.itemId === row.itemId);
    if (i < 0) { list.push(row); r.added++; return; }
    const cur = list[i];
    if (cur.edited) {
      const diff = TRACKED[kind].filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(row[k])).map((k) => ({ field: k, drawing: row[k] }));
      list[i] = { ...cur, drawingSays: diff };
      r.kept++;
    } else { list[i] = { ...row, id: cur.id }; r.updated++; }
  };
  for (const n of lines) {
    const { route, group } = routeNonFrame(n);
    if (route === 'note') { rep.notes++; continue; }
    if (route === 'brake') {
      // the elevation-measured total stays as a cross-check against the pieces on the frames
      const m = { itemId: n.itemId, quantity: n.quantity ?? null, unit: n.unit || 'LF', placedOn: n.placedOn ?? [], description: String(n.description ?? '').slice(0, 200) };
      const i = brakeMeasured.findIndex((x) => x.itemId === n.itemId);
      if (i < 0) brakeMeasured.push(m); else brakeMeasured[i] = m;
      rep.brake++; continue;
    }
    if (route === 'glass') upsert(glassOnly, glassOnlyRow(n, opts), 'glass', rep.glassOnly);
    else upsert(bidLines, bidLine(n, group, opts), 'bid', rep.bidLines);
  }
  return { takeoff: { ...tp, glassOnly, bidLines, brakeMeasured }, ...rep };
}

/** Glass-only rows with a size → { key, group fields, size } for the glass report; plus the unsized. */
export function glassOnlySizes(tp) {
  const types = tp.glassTypes?.length ? tp.glassTypes : defaultGlassTypes();
  const byId = new Map(types.map((t) => [t.id, t]));
  const def = byId.get(tp.defaultGlassTypeId) ?? types[0];
  const temperMono = tp.company?.temperAllMonolithic !== false;
  const sized = []; const unsized = [];
  for (const row of tp.glassOnly ?? []) {
    const w = num(row.width, 0); const h = num(row.height, 0); const q = Math.max(0, Math.round(num(row.qty, 1)));
    // an opening / frame size read off the drawing is never ordered as glass — the lite size is entered first
    if (!(w > 0 && h > 0) || !q || row.sizeIs === 'opening') { unsized.push(row); continue; }
    const gt = byId.get(row.glassTypeId) ?? def;
    if (gt.kind === 'null') continue;
    const tempered = row.tempered != null ? !!row.tempered : gt.heat === 'tempered' || (temperMono && isMonolithic(gt));
    const heat = tempered ? 'tempered' : (gt.heat === 'tempered' ? 'annealed' : gt.heat ?? 'annealed');
    const ordW = roundTo(w); const ordH = roundTo(h);
    const blkW = blockSize(ordW); const blkH = blockSize(ordH);
    const sf = r4((ordW * ordH) / 144);
    sized.push({
      row, key: glassGroupKey({ glassMark: gt.mark, heat }), mark: gt.mark, description: gt.description, makeup: gt.makeup, heat, kind: gt.kind,
      size: { orderW: ordW, orderH: ordH, blockW: blkW, blockH: blkH, actualSf: sf, billingSf: r4((blkW * blkH) / 144),
        weightLb: r4(sf * glassLbPerSf(gt)), shape: 'rect', shapeInfo: null, dloW: null, dloH: null },
      qty: q, location: `${row.mark} (glass only)`,
    });
  }
  return { sized, unsized };
}

/** The estimator edits a glass-only row: a size typed here is the lite size. */
export function setGlassOnly(row, patch = {}) {
  const out = { ...row, ...patch, edited: true };
  if ('width' in patch || 'height' in patch) {
    out.sizeIs = num(out.width, 0) > 0 && num(out.height, 0) > 0 ? 'lite' : null;
    out.needs = (row.needs ?? []).filter((n) => n.field !== 'size');
  }
  if ('glassTypeId' in patch) out.needs = (out.needs ?? []).filter((n) => n.field !== 'glass');
  return out;
}

/** The estimator edits a bid line. */
export function setBidLine(row, patch = {}) {
  return { ...row, ...patch, edited: true };
}
