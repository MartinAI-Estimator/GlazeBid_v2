/**
 * builderBridge.js — connects the frame engine to the rest of the Builder:
 *   - labor: injects laborCalcEngine + the production-rates store
 *   - bid cart: pushes each frame into useBidStore in its existing payload
 *     shape (bom totals + engine hours + rfq), replacing earlier syncs
 *   - other lines (decision 7): bid cart lines and glass-only lites become one
 *     material scope per group on the bid ("Mirrors — from takeoff"); prices the
 *     estimator entered there are kept on every re-send
 */

import { calcFrameMH } from '../../utils/laborCalcEngine';
import useProductionRatesStore from '../../store/useProductionRatesStore';
import useBidStore from '../../store/useBidStore';

export const SOURCE = 'frame-builder-v1';

/** Labor injection for buildTakeoff(). */
export function laborDeps() {
  const r = useProductionRatesStore.getState();
  return {
    calc: calcFrameMH,
    ratesFor: (systemType) => ({
      hf: r.getHourlyFunctions(systemType),
      ir: r.getItemRates(systemType),
      beadsOfCaulk: r.beadsOfCaulk ?? 2,
    }),
  };
}

/** Engine frame result → useBidStore frame payload (legacy-compatible). */
export function toBidFrame(fr) {
  const { spec, bom, labor } = fr;
  const q = spec.quantity;
  const t = bom.totals;
  const vision = bom.glass.find((g) => g.ordered && g.kind === 'vision') ?? bom.glass.find((g) => g.ordered);
  const door = bom.doors[0];
  return {
    frameId: `fbv1_${spec.id}`,
    elevationTag: spec.mark,
    systemType: bom.system.systemType,
    quantity: q,
    source: SOURCE,
    sourceFrameId: spec.id,
    frameSet: spec.frameSet,
    inputs: {
      width: bom.solved.width, height: bom.solved.height,
      bays: bom.solved.columns.length, rows: Math.max(...bom.solved.columns.map((c) => c.rows.length || 1)),
      systemName: bom.system.name, systemId: bom.system.id, systemLabel: bom.system.name,
      joinery: bom.system.joinery, finish: spec.finish, sillAFF: spec.sillAFF,
      shapeMode: bom.solved.outline.template,
      frameSpec: spec,                                   // full spec — reopen in the Frame Builder
    },
    bom: {
      quantity: q,
      totalAluminumLF: +(t.metalLF * q).toFixed(2),
      totalGlassSqFt: +(t.glassSf * q).toFixed(2),
      glassLitesCount: t.lites * q,
      shopHours: +((labor?.shop ?? 0) * q).toFixed(2),
      distHours: +((labor?.dist ?? 0) * q).toFixed(2),
      fieldHours: +((labor?.field ?? 0) * q).toFixed(2),
      totalLaborHours: +((labor?.total ?? 0) * q).toFixed(2),
      liftHours: +((labor?.liftHours ?? 0) * q).toFixed(2),
      laborEngine: 'laborCalcEngine',
      cutList: bom.metal.map((m) => ({ part: m.die ?? m.roleLabel, role: m.role, qty: q, qtyPerFrame: 1, lengthInches: +m.length.toFixed(4), note: m.note })),
      glassSizes: vision
        ? { glassType: vision.glassMark, widthInches: vision.orderW, heightInches: vision.orderH, qty: bom.glass.filter((g) => g.ordered && g.orderW === vision.orderW && g.orderH === vision.orderH).length * q }
        : { glassType: 'Unspecified', widthInches: 0, heightInches: 0, qty: 0 },
      door: door ? { type: door.kind, bay: door.col + 1, widthIn: door.openingW, heightIn: door.openingH, leaves: door.leaves, hasTransom: bom.glass.some((g) => g.kind === 'transom') } : null,
      rfq: {
        frame: { systemType: bom.system.systemType, systemName: bom.system.name, quantity: q, elevationTag: spec.mark },
        metal: bom.metal.map((m) => ({ role: m.role, roleLabel: m.die ? `${m.die} ${m.roleLabel}` : m.roleLabel, lengthInches: m.length, lengthDisplay: '', qtyPerFrame: 1 })),
        glass: bom.glass.filter((g) => g.ordered).map((g) => ({ glassType: `${g.glassMark}${g.tempered ? ' (T)' : ''}`, liteType: g.kind, shape: g.shape, widthInches: g.orderW, heightInches: g.orderH, sqFtEach: g.actualSf, qtyPerFrame: 1 })),
        doors: bom.doors.map((d) => ({ type: d.kind, leaves: d.leaves, openingWidthInches: d.openingW, openingHeightInches: d.openingH, qtyPerFrame: 1 })),
      },
      warnings: bom.warnings,
    },
  };
}

/**
 * Push every solved frame into the bid cart.  Frames this module synced before
 * are replaced; frames from other sources are untouched.
 */
export function syncToBid(takeoffResult) {
  const store = useBidStore.getState();
  const keep = store.frames.filter((f) => f.source !== SOURCE);
  const mine = takeoffResult.frames.filter((f) => f.bom).map(toBidFrame);
  store.loadBid([...keep, ...mine]);
  const lines = syncLinesToBid(takeoffResult);
  return { synced: mine.length, kept: keep.length, lineGroups: lines.groups, lines: lines.lines };
}

export const LINES_SOURCE = 'frame-builder-v1-lines';
export const GLASS_ONLY_GROUP = 'Glass only (glass into frames / doors by others)';
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtIn = (v) => (v ? `${Math.round(v * 16) / 16}"` : '?');

/** Bid lines + glass-only lites → material scopes for the bid (pure; `prev` keeps prices). */
export function toBidCards(takeoffResult, prev = []) {
  const groups = new Map();
  const add = (group, line) => { if (!groups.has(group)) groups.set(group, []); groups.get(group).push(line); };
  for (const b of takeoffResult.bidLines ?? []) {
    add(b.group, {
      id: b.id, quantity: b.quantity, unit: b.unit, flags: b.flags ?? [], itemId: b.itemId,
      description: `${b.quantity ?? '?'} ${b.unit} — ${b.itemId}: ${b.description}${b.alternate ? ` [${b.alternate}]` : ''}`,
    });
  }
  const types = new Map((takeoffResult.glassTypes ?? []).map((g) => [g.id, g]));
  for (const g of takeoffResult.glassOnly?.rows ?? []) {
    const sized = g.sizeIs === 'lite' || (g.sizeIs == null && g.width && g.height);
    const gt = types.get(g.glassTypeId);
    add(GLASS_ONLY_GROUP, {
      id: g.id, quantity: g.qty, unit: 'EA', itemId: g.itemId,
      flags: sized ? [] : ['lite size not entered — opening size shown'],
      description: `${g.qty} EA — ${g.mark}: ${fmtIn(g.width)} × ${fmtIn(g.height)}${sized ? '' : ' (opening — lite size TBD)'} ${gt ? gt.mark : 'project glass'} — ${g.description ?? ''}`.trim(),
    });
  }
  const prevById = new Map(prev.map((c) => [c.id, c]));
  return [...groups.entries()].map(([group, lines]) => {
    const id = `fbv1-lines-${slug(group)}`;
    const old = prevById.get(id);
    const oldMat = new Map((old?.materials ?? []).map((m) => [m.id, m]));
    const materials = lines.map((l) => {
      const o = oldMat.get(l.id);
      return { id: l.id, category: o?.category ?? '', vendor: o?.vendor ?? '', cost: o?.cost ?? 0, ...(o?.totalCost != null ? { totalCost: o.totalCost } : {}),
        description: l.description, takeoff: { itemId: l.itemId, quantity: l.quantity, unit: l.unit, flags: l.flags } };
    });
    const cost = materials.reduce((t, m) => t + (Number(m.cost) || 0), 0);
    return {
      ...(old ?? {}),
      id, type: 'material-only', source: LINES_SOURCE,
      name: `${group} — from takeoff`, shortName: group.length > 10 ? `${group.slice(0, 10)}…` : group,
      description: `${lines.length} line(s) from the Frame Builder takeoff — price each line`,
      frames: [], materials, laborTasks: old?.laborTasks ?? [],
      status: lines.some((l) => l.flags.length) ? 'needs-review' : 'imported',
      totals: { ...(old?.totals ?? {}), totalFrames: 0, totalQuantity: lines.length, totalSF: 0, shopMHs: old?.totals?.shopMHs ?? 0,
        distMHs: old?.totals?.distMHs ?? 0, fieldMHs: old?.totals?.fieldMHs ?? 0, totalCost: cost },
      lastModified: new Date().toISOString(),
    };
  });
}

/** Replace this module's material scopes on the bid; other scopes are untouched. */
export function syncLinesToBid(takeoffResult) {
  const store = useBidStore.getState();
  const prev = (store.workspaceSystems ?? []).filter((s) => s.source === LINES_SOURCE);
  const cards = toBidCards(takeoffResult, prev);
  store.setWorkspaceSystems((all) => [...(all ?? []).filter((s) => s.source !== LINES_SOURCE), ...cards]);
  return { groups: cards.length, lines: cards.reduce((t, c) => t + c.materials.length, 0) };
}
