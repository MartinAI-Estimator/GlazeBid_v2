/**
 * builderBridge.js — connects the frame engine to the rest of the Builder:
 *   - labor: injects laborCalcEngine + the production-rates store
 *   - bid cart: pushes each frame into useBidStore in its existing payload
 *     shape (bom totals + engine hours + rfq), replacing earlier syncs
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
  return { synced: mine.length, kept: keep.length };
}
