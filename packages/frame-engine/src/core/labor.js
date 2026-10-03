/**
 * labor.js — hours from the built frame through the existing labor engine.
 *
 * The man-hour formulas stay in apps/builder/src/utils/laborCalcEngine.js
 * (Warren Bid Sheet parity).  This module only shapes the topology counts
 * into that engine's input and applies the job adjusters:
 *
 *   hours = calc(below-line counts) + calc(above-line counts) × liftFactor
 *   then × difficulty (frame) × job difficulty
 *
 * The calc function and rates are INJECTED so the engine package does not
 * depend on the Builder app.
 */

import { r4, num } from './units.js';

/** Shape counts for calcFrameMH (quantity 1). */
export function toCalcInput(c, isCW) {
  if (isCW) {
    return { quantity: 1, verticals: c.verticals, horizontals: c.horizontals, panels: c.panels,
      singles: c.singles, pairs: c.pairs, joints: c.joints, perimeter: c.perimeter,
      brakeMetal: c.brakeMetal, ssg: c.ssg, steel: c.steel, vents: c.vents, stoolTrim: c.stoolTrim, ft: c.ft, wlDl: c.wlDl };
  }
  return { quantity: 1, bays: c.bays, rows: c.rows, panels: c.panels, singles: c.singles, pairs: c.pairs,
    joints: c.joints, perimeter: c.perimeter, brakeMetal: c.brakeMetal, ssg: c.ssg, steel: c.steel,
    vents: c.vents, open: c.open, subsills: c.subsills };
}

/**
 * @param {object} counts   bom.laborCounts() result
 * @param {object} opts     { calc, rates: { hf, ir, beadsOfCaulk }, systemType, liftFactor, difficulty, jobDifficulty }
 * @returns {{ shop, dist, field, total, liftHours, below, above, detail }}
 */
export function frameLabor(counts, opts) {
  const { calc, rates, systemType, liftFactor = 1.25, difficulty = 1, jobDifficulty = 1 } = opts;
  if (typeof calc !== 'function' || !rates) {
    return { shop: 0, dist: 0, field: 0, total: 0, liftHours: 0, below: null, above: null, missing: true };
  }
  const run = (c) => calc(toCalcInput(c, counts.isCW), rates.hf, rates.ir, rates.beadsOfCaulk ?? 2, systemType);
  // Below the line gets everything a frame has once (subsills etc.).  Bays / rows
  // for the SF formula ride with whichever side they were classified on.
  const below = run(counts.below);
  const above = counts.hasLift ? run({ ...counts.above, rows: counts.above.bays > 0 ? counts.below.rows : 0 }) : null;
  const mult = num(difficulty, 1) * num(jobDifficulty, 1);
  const lf = num(liftFactor, 1);
  const shop = (below.shopMH + (above?.shopMH ?? 0)) * mult;           // shop work is not done on a lift
  const dist = (below.distributionMH + (above?.distributionMH ?? 0)) * mult;
  const fieldBelow = below.fieldMH * mult;
  const fieldAbove = (above?.fieldMH ?? 0) * lf * mult;
  return {
    shop: r4(shop), dist: r4(dist), field: r4(fieldBelow + fieldAbove),
    total: r4(shop + dist + fieldBelow + fieldAbove),
    liftHours: r4(fieldAbove),
    liftFactor: lf, difficulty: mult,
    below, above,
  };
}

/** Lift equipment: days from lift field hours ÷ (crew × hours/day). */
export function liftEquipment(liftHours, { crew = 2, hoursPerDay = 8, liftType = 'scissor', rates = DEFAULT_LIFT_RATES } = {}) {
  if (!(liftHours > 0)) return null;
  const r = rates[liftType] ?? rates.scissor;
  const days = Math.ceil(liftHours / (crew * hoursPerDay) - 1e-9);
  const weeks = Math.floor(days / 5); const rem = days % 5;
  const rental = Math.min(weeks * r.week + rem * r.day, (weeks + 1) * r.week);
  return { liftType, label: r.label, days, crew, hoursPerDay, rental: r4(rental), delivery: r.delivery, total: r4(rental + r.delivery) };
}

export const DEFAULT_LIFT_RATES = Object.freeze({
  scissor: { label: 'Scissor lift (19–26\')', day: 175, week: 450, delivery: 150 },
  boom:    { label: 'Boom lift (40–60\')',    day: 425, week: 1100, delivery: 250 },
  spider:  { label: 'Spider / tracked lift',  day: 650, week: 1900, delivery: 300 },
});
