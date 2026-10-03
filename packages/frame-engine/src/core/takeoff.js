/**
 * takeoff.js — the Frame Builder's job-level takeoff.
 *
 * A TakeoffProject holds every frame on a job plus job settings:
 * {
 *   schema: 'glazebid.takeoff/1', id, name, projectId,
 *   glassTypes: [...], defaultGlassTypeId,
 *   frameSets: { [name]: { liftLine: AFF|null, difficulty: 1 } },
 *   frames: [FrameSpec],
 *   company: { doorFramingBy: 'vendor'|'glazier', temperAllMonolithic: true, rules: {...} },
 *   labor:   { jobDifficulty: 1, liftFactor: 1.25, liftType: 'scissor', crew: 2, hoursPerDay: 8 },
 *   brakeSheet: { widthIn: 48, lengthIn: 120, lapIn: 4 },
 *   customSystems: [],
 * }
 *
 * buildTakeoff() returns every table the reports need.  Pure — no I/O.
 */

import { r4, formatInches } from './units.js';
import { buildFrameTakeoff } from './bom.js';
import { optimizeCuts, scrapColor } from './optimizer.js';
import { sheetYield, DEFAULT_SHEET } from './brakeMetal.js';
import { frameLabor, liftEquipment } from './labor.js';
import { defaultGlassTypes, glassGroupKey } from './glass.js';
import { METAL_ROLES, DEFAULT_RULES } from './library.js';
import { createFrame, newId } from './model.js';

export const TAKEOFF_SCHEMA = 'glazebid.takeoff/1';

export function createTakeoff(over = {}) {
  const glassTypes = defaultGlassTypes();
  return {
    schema: TAKEOFF_SCHEMA,
    id: newId('takeoff'),
    name: 'New takeoff',
    projectId: null,
    glassTypes,
    defaultGlassTypeId: glassTypes[0].id,
    frameSets: { 'EX SF': { liftLine: null, difficulty: 1 } },
    frames: [createFrame({ mark: 'SF-1', frameSet: 'EX SF' })],
    company: { doorFramingBy: 'vendor', temperAllMonolithic: true, rules: {} },
    labor: { jobDifficulty: 1, liftFactor: 1.25, liftType: 'scissor', crew: 2, hoursPerDay: 8 },
    brakeSheet: { ...DEFAULT_SHEET },
    customSystems: [],
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

/**
 * @param {object} tp      TakeoffProject
 * @param {object} [labor] { calc: calcFrameMH, ratesFor: (systemType) => { hf, ir, beadsOfCaulk } }
 */
export function buildTakeoff(tp, labor = {}) {
  const project = {
    glassTypes: tp.glassTypes, defaultGlassTypeId: tp.defaultGlassTypeId,
    company: tp.company, customSystems: tp.customSystems, frameSets: tp.frameSets,
  };
  const rules = { ...DEFAULT_RULES, ...(tp.company?.rules ?? {}) };
  const warnings = [];
  const frames = (tp.frames ?? []).map((spec) => {
    let bom;
    try { bom = buildFrameTakeoff(spec, project); }
    catch (err) {
      warnings.push(`${spec.mark || spec.id}: could not be solved — ${err.message}`);
      return { spec, bom: null, labor: null, error: err.message };
    }
    const fs = tp.frameSets?.[spec.frameSet] ?? {};
    const lab = frameLabor(bom.counts, {
      calc: labor.calc, rates: labor.ratesFor?.(bom.system.systemType), systemType: bom.system.systemType,
      liftFactor: tp.labor?.liftFactor ?? 1.25,
      difficulty: (spec.labor?.difficulty ?? 1) * (fs.difficulty ?? 1),
      jobDifficulty: tp.labor?.jobDifficulty ?? 1,
    });
    bom.warnings.forEach((w) => warnings.push(`${spec.mark || 'Frame'}: ${w}`));
    return { spec, bom, labor: lab };
  });
  const ok = frames.filter((f) => f.bom);

  // ── Metal: per frame set, per die (+ finish), FFD across the set ──
  const dieGroups = new Map();
  for (const f of ok) {
    const q = f.spec.quantity;
    for (const m of f.bom.metal) {
      const die = m.die ?? `(${f.bom.system.manufacturer} ${f.bom.system.name.split('—')[0].trim()} · ${m.roleLabel})`;
      const key = `${f.spec.frameSet}||${die}||${f.spec.finish}`;
      if (!dieGroups.has(key)) dieGroups.set(key, {
        frameSet: f.spec.frameSet, die, mapped: !!m.die, finish: f.spec.finish, role: m.role, roleLabel: m.roleLabel,
        description: m.description, system: f.bom.system.name, manufacturer: f.bom.system.manufacturer,
        stockLengthIn: f.bom.system.stockLengthIn, cuts: new Map(), roles: new Set(),
      });
      const g = dieGroups.get(key);
      g.roles.add(m.roleLabel);
      const lk = `${Math.round(m.length * 16)}`;
      if (!g.cuts.has(lk)) g.cuts.set(lk, { length: m.length, qty: 0, marks: new Set(), notes: new Set() });
      const c = g.cuts.get(lk);
      c.qty += q; c.marks.add(f.spec.mark); if (m.note) c.notes.add(m.note);
    }
  }
  const metalRfq = [...dieGroups.values()].map((g) => {
    const cuts = [...g.cuts.values()].sort((a, b) => b.length - a.length);
    const opt = optimizeCuts(cuts.map((c) => ({ length: c.length, qty: c.qty })), { stockLengthIn: g.stockLengthIn, kerfIn: rules.kerfIn, endTrimIn: rules.endTrimIn });
    return {
      frameSet: g.frameSet, die: g.die, mapped: g.mapped, finish: g.finish, role: g.role, roleLabel: [...g.roles].join(' / '),
      description: g.description, system: g.system, manufacturer: g.manufacturer,
      stockLengthIn: g.stockLengthIn, stockLengthDisplay: `${r4(g.stockLengthIn / 12)}'`,
      cuts: cuts.map((c) => ({ length: r4(c.length), lengthDisplay: formatInches(c.length), qty: c.qty, marks: [...c.marks], notes: [...c.notes] })),
      pieces: cuts.reduce((s, c) => s + c.qty, 0),
      totalLF: r4(cuts.reduce((s, c) => s + c.qty * c.length, 0) / 12),
      bars: opt.barCount, scrapPct: opt.scrapPct, scrapColor: scrapColor(opt.scrapPct), barLayout: opt.bars,
      oversize: opt.oversize.length,
    };
  }).sort((a, b) => a.frameSet.localeCompare(b.frameSet) || (METAL_ROLES[a.role]?.order ?? 99) - (METAL_ROLES[b.role]?.order ?? 99) || String(a.die).localeCompare(String(b.die)));

  // ── Glass: grouped by type (+ temper), then sizes ──
  const glassGroups = new Map();
  for (const f of ok) {
    for (const g of f.bom.glass) {
      if (!g.ordered) continue;
      const gk = glassGroupKey(g);
      if (!glassGroups.has(gk)) glassGroups.set(gk, { key: gk, mark: g.glassMark, description: g.glassDescription, makeup: g.makeup, heat: g.heat, kind: g.glassKind, sizes: new Map() });
      const grp = glassGroups.get(gk);
      const sk = `${g.orderW}x${g.orderH}x${g.shape}x${JSON.stringify(g.shapeInfo?.vertices ?? '')}`;
      if (!grp.sizes.has(sk)) grp.sizes.set(sk, { ...pick(g, ['orderW', 'orderH', 'blockW', 'blockH', 'actualSf', 'billingSf', 'weightLb', 'shape', 'shapeInfo', 'dloW', 'dloH']), qty: 0, locations: [] });
      const s = grp.sizes.get(sk);
      s.qty += f.spec.quantity;
      s.locations.push(`${f.spec.mark}${f.spec.quantity > 1 ? `×${f.spec.quantity}` : ''} ${g.tag}`);
    }
  }
  const glassRfq = [...glassGroups.values()].map((grp) => {
    const sizes = [...grp.sizes.values()].sort((a, b) => b.orderW * b.orderH - a.orderW * a.orderH)
      .map((s) => ({ ...s, widthDisplay: formatInches(s.orderW), heightDisplay: formatInches(s.orderH),
        totalActualSf: r4(s.actualSf * s.qty), totalBillingSf: r4(s.billingSf * s.qty), totalLb: r4(s.weightLb * s.qty) }));
    return { ...grp, sizes,
      lites: sizes.reduce((t, s) => t + s.qty, 0),
      actualSf: r4(sizes.reduce((t, s) => t + s.totalActualSf, 0)),
      billingSf: r4(sizes.reduce((t, s) => t + s.totalBillingSf, 0)),
      weightLb: r4(sizes.reduce((t, s) => t + s.totalLb, 0)) };
  }).sort((a, b) => a.key.localeCompare(b.key));

  // ── Accessories ──
  const accMap = new Map();
  for (const f of ok) for (const a of f.bom.accessories) {
    const k = `${f.bom.system.manufacturer}||${a.part ?? '—'}||${a.role}`;
    if (!accMap.has(k)) accMap.set(k, { manufacturer: f.bom.system.manufacturer, part: a.part, role: a.role, label: a.label, unit: a.unit, qty: 0, marks: new Set() });
    const r = accMap.get(k); r.qty = r4(r.qty + a.qty * f.spec.quantity); r.marks.add(f.spec.mark);
  }
  const accessoriesRfq = [...accMap.values()].map((r) => ({ ...r, qty: r.unit === 'LF' ? r4(r.qty) : Math.ceil(r.qty), marks: [...r.marks] }))
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.label.localeCompare(b.label));
  // sealant in sausages (company rule): 20 oz ≈ 1/2" × 1/2" bead → ~24 LF per sausage at 3/8"–1/2"
  const sealantLF = accessoriesRfq.filter((a) => a.role === 'sealantExterior' || a.role === 'sealantInterior').reduce((s, a) => s + a.qty, 0);

  // ── Doors + hardware ──
  const doorSchedule = []; const hardwareSchedule = [];
  for (const f of ok) for (const d of f.bom.doors) {
    const gt = (tp.glassTypes ?? []).find((g) => g.id === d.glassTypeId);
    doorSchedule.push({
      mark: d.mark, frame: f.spec.mark, frameSet: f.spec.frameSet, qty: f.spec.quantity,
      type: d.kind === 'pair' ? 'Pair' : 'Single', leaves: d.leaves,
      openingW: d.openingW, openingH: d.openingH, openingDisplay: `${formatInches(d.openingW)} × ${formatInches(d.openingH)}`,
      leafW: d.geometry.leafW, leafH: d.geometry.leafH, leafDisplay: `${formatInches(d.geometry.leafW)} × ${formatInches(d.geometry.leafH)}`,
      stile: d.geometry.stileLabel, topRail: d.geometry.topRail, bottomRail: d.geometry.bottomRail, midRail: d.geometry.midRail,
      handing: d.handingLabel, swing: d.swing, finish: d.finish, system: f.bom.system.name,
      glass: gt ? `${gt.mark} — ${gt.description}` : (d.glassTypeId ?? 'Project default'),
      doorGlass: `${formatInches(d.geometry.glassW)} × ${d.geometry.glassHs.map((h) => formatInches(h)).join(' + ')}`,
      hardwareSet: d.hardwarePresetLabel, threshold: d.threshold, notes: d.notes, geometry: d.geometry, door: d,
    });
    hardwareSchedule.push({ mark: d.mark, frame: f.spec.mark, qty: f.spec.quantity, set: d.hardwarePresetLabel,
      type: d.kind === 'pair' ? 'Pair' : 'Single', handing: d.handingLabel,
      items: d.hardware.map((h) => ({ item: h.item, frequency: h.frequency, qtyPerOpening: h.qtyPerOpening, qtyTotal: h.qtyPerOpening * f.spec.quantity })) });
  }

  // ── Brake metal ──
  const brakeRows = [];
  for (const f of ok) for (const b of f.bom.brakeMetal) brakeRows.push({ ...b, frame: f.spec.mark, qtyTotal: b.qty * f.spec.quantity });
  const brakeByGauge = new Map();
  for (const b of brakeRows) {
    const k = `${b.gauge}||${b.finish}`;
    if (!brakeByGauge.has(k)) brakeByGauge.set(k, []);
    brakeByGauge.get(k).push({ girth: b.girth, length: b.length, qty: b.qtyTotal });
  }
  const brakeSheets = [...brakeByGauge.entries()].map(([k, pcs]) => { const [gauge, finish] = k.split('||'); return { gauge, finish, ...sheetYield(pcs, tp.brakeSheet) }; });

  // ── Labor ──
  const laborRows = ok.map((f) => ({
    mark: f.spec.mark, frameSet: f.spec.frameSet, qty: f.spec.quantity, system: f.bom.system.name, laborType: f.bom.system.laborType,
    perFrame: f.labor, shop: r4((f.labor?.shop ?? 0) * f.spec.quantity), dist: r4((f.labor?.dist ?? 0) * f.spec.quantity),
    field: r4((f.labor?.field ?? 0) * f.spec.quantity), lift: r4((f.labor?.liftHours ?? 0) * f.spec.quantity),
    total: r4((f.labor?.total ?? 0) * f.spec.quantity),
    counts: f.bom.counts,
  }));
  const sumBy = (rows, k) => r4(rows.reduce((s, r) => s + (r[k] ?? 0), 0));
  const byFrameSet = groupBy(laborRows, (r) => r.frameSet);
  const laborSummary = {
    rows: laborRows,
    frameSets: Object.entries(byFrameSet).map(([name, rows]) => ({ name, shop: sumBy(rows, 'shop'), dist: sumBy(rows, 'dist'), field: sumBy(rows, 'field'), lift: sumBy(rows, 'lift'), total: sumBy(rows, 'total') })),
    totals: { shop: sumBy(laborRows, 'shop'), dist: sumBy(laborRows, 'dist'), field: sumBy(laborRows, 'field'), lift: sumBy(laborRows, 'lift'), total: sumBy(laborRows, 'total') },
    missingRates: frames.some((f) => f.labor?.missing),
  };
  laborSummary.equipment = liftEquipment(laborSummary.totals.lift, { crew: tp.labor?.crew ?? 2, hoursPerDay: tp.labor?.hoursPerDay ?? 8, liftType: tp.labor?.liftType ?? 'scissor' });

  // ── Recap: one line per frame ──
  const recap = ok.map((f) => {
    const b = f.bom; const t = b.totals;
    const fsMetal = metalRfq.filter((m) => m.frameSet === f.spec.frameSet);
    const scrap = fsMetal.length ? r4(fsMetal.reduce((s, m) => s + m.scrapPct * m.totalLF, 0) / Math.max(1e-9, fsMetal.reduce((s, m) => s + m.totalLF, 0))) : 0;
    return {
      mark: f.spec.mark, frameSet: f.spec.frameSet, qty: f.spec.quantity, system: b.system.name, joinery: b.system.joinery,
      laborType: b.system.laborType, finish: f.spec.finish,
      width: r4(b.solved.width), height: r4(b.solved.height), sizeDisplay: `${formatInches(b.solved.width)} × ${formatInches(b.solved.height)}`,
      shape: b.solved.outline.template, bays: b.solved.columns.length,
      frameSf: t.frameSf, totalSf: r4(t.frameSf * f.spec.quantity), metalLF: r4(t.metalLF * f.spec.quantity), lites: t.lites * f.spec.quantity,
      glassSf: r4(t.glassSf * f.spec.quantity), doors: b.doors.length * f.spec.quantity,
      hours: r4((f.labor?.total ?? 0) * f.spec.quantity), hoursPerSf: t.frameSf ? r4((f.labor?.total ?? 0) / t.frameSf) : 0,
      glassAreaRatio: t.glassAreaRatio, scrapPct: scrap, scrapColor: scrapColor(scrap),
      warnings: b.warnings.length,
    };
  });
  const recapByFrameSet = Object.entries(groupBy(recap, (r) => r.frameSet)).map(([name, rows]) => ({
    name, frames: rows.length, units: rows.reduce((s, r) => s + r.qty, 0), totalSf: sumBy(rows, 'totalSf'),
    metalLF: sumBy(rows, 'metalLF'), lites: rows.reduce((s, r) => s + r.lites, 0), glassSf: sumBy(rows, 'glassSf'),
    doors: rows.reduce((s, r) => s + r.doors, 0), hours: sumBy(rows, 'hours'),
  }));

  return {
    frames, warnings, metalRfq, glassRfq, accessoriesRfq, sealantLF: r4(sealantLF), doorSchedule, hardwareSchedule,
    brakeRows, brakeSheets, laborSummary, recap, recapByFrameSet,
    totals: {
      frames: ok.length, units: ok.reduce((s, f) => s + f.spec.quantity, 0),
      totalSf: sumBy(recap, 'totalSf'), metalLF: sumBy(recap, 'metalLF'), bars: metalRfq.reduce((s, m) => s + m.bars, 0),
      lites: recap.reduce((s, r) => s + r.lites, 0), glassSf: sumBy(recap, 'glassSf'),
      billingSf: r4(glassRfq.reduce((s, g) => s + g.billingSf, 0)), doors: doorSchedule.reduce((s, d) => s + d.qty, 0),
      hours: laborSummary.totals.total,
    },
  };
}

function pick(o, keys) { const r = {}; for (const k of keys) r[k] = o[k]; return r; }
function groupBy(arr, fn) { const m = {}; for (const x of arr) (m[fn(x)] ??= []).push(x); return m; }
