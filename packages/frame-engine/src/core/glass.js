/**
 * glass.js — glass types, per-lite assignment, auto-temper, ordering sizes.
 *
 * Sizing (geometry.js): glass = DLO + add.  Storefront adds 3/4" per axis,
 * captured curtain wall 1" per axis, SSG edges per manufacturer (system library).
 *
 * Ordered size  : exact glass size rounded to the nearest 1/16".
 * Block size    : each ordered dimension rounded UP to the next EVEN inch
 *                 (vendors price on block size).  24 1/8" → 26".
 * Billing SF    : blockW × blockH / 144.
 *
 * Auto-temper (IBC 2406.4 hazardous locations) + company rules:
 *   door      — within 24" of a door's vertical edge, bottom edge < 60" AFF
 *   large     — single pane > 9 SF, bottom < 18" AFF, top > 36" AFF
 *   flagged   — stairs / landings / wet areas / other (estimator flags the lite)
 *   company   — all monolithic glass tempered ("no plate")
 * A manual per-lite override always wins.
 */

import { blockSize, roundTo, r4, num } from './units.js';

export const GLASS_LB_PER_SF_PER_IN = 13.0;     // soda-lime, ≈ 2.5 g/cc

/** A starter set every new project gets (editable). */
export function defaultGlassTypes() {
  return [
    { id: 'GL-1', mark: 'GL-1', description: '1" Clear Insulated Low-E', kind: 'vision',
      makeup: '1/4" Low-E + 1/2" AS + 1/4" Clear', plies: [0.25, 0.25], heat: 'annealed', nominal: 1 },
    { id: 'GL-2', mark: 'GL-2', description: '1/4" Clear Monolithic', kind: 'vision',
      makeup: '1/4" Clear', plies: [0.25], heat: 'tempered', nominal: 0.25 },
    { id: 'SPAN-1', mark: 'SPAN-1', description: '1" Spandrel Insulated', kind: 'spandrel',
      makeup: '1/4" Opacified + 1/2" AS + 1/4"', plies: [0.25, 0.25], heat: 'heat-strengthened', nominal: 1, spanInsul: true },
    { id: 'NULL', mark: 'NULL', description: 'Null glazing (blank / by others)', kind: 'null',
      makeup: '—', plies: [], heat: 'n/a', nominal: 0 },
  ];
}

export function glassLbPerSf(gt) {
  return (gt?.plies ?? []).reduce((s, t) => s + num(t, 0), 0) * GLASS_LB_PER_SF_PER_IN;
}

export const isMonolithic = (gt) => (gt?.plies?.length ?? 0) === 1 && !gt?.laminated;

/**
 * Evaluate every lite in a solved frame.
 * @param {object} solved   solveFrame() output
 * @param {object} project  { glassTypes, defaultGlassTypeId, company: { temperAllMonolithic } }
 */
export function evaluateGlass(solved, project = {}) {
  const spec = solved.spec;
  const types = project.glassTypes?.length ? project.glassTypes : defaultGlassTypes();
  const byId = new Map(types.map((t) => [t.id, t]));
  const projectDefault = project.defaultGlassTypeId ?? types[0]?.id;
  const company = { temperAllMonolithic: true, ...(project.company ?? {}) };
  const doors = solved.doors ?? [];

  return solved.lites.map((l) => {
    const gid = spec.glass.lites[l.key] ?? spec.glass.frameDefault ?? projectDefault;
    const gt = byId.get(gid) ?? types[0];
    const reasons = [];
    const dloSf = l.dloArea / 144;

    // door proximity: 24" horizontally from either door edge, bottom < 60" AFF
    for (const d of doors) {
      const gap = Math.max(0, l.dloBox.x0 - d.x1, d.x0 - l.dloBox.x1);
      if (gap <= 24 + 1e-6 && l.bottomAFF < 60) { reasons.push('door'); break; }
    }
    if (dloSf > 9 && l.bottomAFF < 18 && l.topAFF > 36) reasons.push('large');
    const hz = spec.glass.hazards[l.key] ?? [];
    if (hz.length) reasons.push(...hz.map((h) => `flag:${h}`));
    if (company.temperAllMonolithic && isMonolithic(gt) && gt.kind !== 'null') reasons.push('company');
    if (gt.heat === 'tempered') reasons.push('spec');

    const manual = spec.glass.temper[l.key];
    const auto = reasons.length > 0;
    const tempered = manual === undefined ? auto : !!manual;
    const heat = gt.kind === 'null' ? 'n/a' : tempered ? 'tempered' : (gt.heat === 'tempered' ? 'annealed' : gt.heat ?? 'annealed');

    const ordW = roundTo(l.glassW); const ordH = roundTo(l.glassH);
    const blkW = blockSize(ordW); const blkH = blockSize(ordH);
    const lbSf = glassLbPerSf(gt);
    const shapeInfo = l.shape === 'rect' ? null : describeShape(l);
    return {
      key: l.key, tag: l.tag, col: l.col, kind: l.kind,
      glassTypeId: gt.id, glassMark: gt.mark, glassDescription: gt.description, makeup: gt.makeup,
      glassKind: gt.kind, spanInsul: !!gt.spanInsul,
      tempered, heat, temperReasons: reasons, temperManual: manual !== undefined,
      shape: l.shape, shapeInfo,
      dloW: r4(l.dloW), dloH: r4(l.dloH),
      exactW: r4(l.glassW), exactH: r4(l.glassH),
      orderW: ordW, orderH: ordH,
      blockW: blkW, blockH: blkH,
      actualSf: r4(l.glassArea / 144),
      billingSf: r4((blkW * blkH) / 144),
      weightLb: r4((l.glassArea / 144) * lbSf),
      perimeterIn: r4(l.glassPerimeter),
      ssgLF: r4(l.ssgEdgesLF),
      bottomAFF: r4(l.bottomAFF), topAFF: r4(l.topAFF),
      ordered: gt.kind !== 'null',
    };
  });
}

/** Human-readable shaped-lite description (bounding box + edge heights). */
function describeShape(l) {
  const g = l.glassPoly;
  const bb = l.glassBox;
  const atX = (x) => {
    const ys = g.filter((p) => Math.abs(p[0] - x) < 1e-3).map((p) => p[1]);
    return ys.length ? Math.max(...ys) - Math.min(...ys) : null;
  };
  const left = atX(bb.x0); const right = atX(bb.x1);
  const verts = g.map(([x, y]) => [r4(x - bb.x0), r4(y - bb.y0)]);
  if (g.length === 4 && left != null && right != null) {
    return { type: 'trapezoid', leftHeight: r4(left), rightHeight: r4(right), vertices: verts };
  }
  return { type: g.length > 8 ? 'curved' : 'polygon', leftHeight: left != null ? r4(left) : null,
    rightHeight: right != null ? r4(right) : null, vertices: verts };
}

/** Glass type mark + heat used to group the glass report. */
export const glassGroupKey = (g) => `${g.glassMark}${g.heat === 'tempered' ? ' (T)' : ''}`;
