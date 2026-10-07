/**
 * bidCostEngine.alpine.test.js — the engine against a real, already-priced bid.
 *
 * Fixture: `Alpine Buick GMC - Pre-Contract ValorX.xlsm`, quote Q-225876, the
 * production Salesforce-CPQ bid sheet Martin supplied on 2026-10-06. Every
 * figure below was read out of the workbook; nothing is invented. The decode and
 * the reasoning behind each constant are in
 * `GlazeBid_BidSheet_Decode_AlpineBuick_2026-10-06.md`.
 *
 * Six base breakouts and seven alternates (one a three-line deduct) must
 * reconcile to the sheet's own project total, to the cent:
 *
 *     base   cost 466,950.40  tax 7,181.21  markup 177,441.15  sell 651,572.77
 *     GPM    27.2327%
 *     all    cost 538,765.75  tax 8,610.22  markup 204,730.99  sell 752,106.95
 *
 * Where the sheet's number is a hand-typed estimator override rather than a
 * computed one, the fixture passes it as an explicit `*Override` — and the test
 * at the bottom asserts WHICH ones those are, so the engine's own defaults can
 * never quietly drift away from them unnoticed.
 */

import { describe, it, expect } from 'vitest';
import { computeBid, computeScopeCost, round2 } from '../../engine/bidCostEngine';

// ── the job card (SOW A1:B4 — tax 2%, markup 38%, labor $40.00/hr) ──────────

const JOB = {
  laborRate: 40,
  markupPct: 38,
  taxPct: 2,
  crewSize: 4,
  suppliesPct: 0.5,
  materialContingencyPct: 1.25,
  laborContingencyPct: 2.5,
  shopDrawingsPct: 0.7,
  cleaningHoursPerDay: 0.5,
  bondPct: 0,                 // pre-contract bid: no P&P bond line
  asOf: '2026-10-06',
};

const m = (group, cost, description, over = {}) => ({ group, cost, description, ...over });

// ── base bid ───────────────────────────────────────────────────────────────

const EXT_SF = {
  id: 'ext-sf', breakout: 'Exterior Storefront', systemType: 'Ext SF', areaSqFt: 930.61,
  labor: { shopMH: 63.5, distMH: 42.85, fieldMH: 180.23707000000002, caulkLF: 1018.4200000000001 },
  materials: [
    m('02-METL', 8955, 'Kawneer 451T Center Set 2x4-1/2" Thermal'),
    m('02-METL', 500, 'Wrisco .060 Brake Form'),
    m('02-GLSS', 12659, '1" IGU Clear SB70'),
    m('02-DOOR', 4939, 'Kawneer 1 3/4" Standard'),
    m('02-HDWR', 22000, 'JLM exterior package'),
    m('02-CAUL', 1120.262, '3/8" gray @ $1.10/LF'),
    m('03-EQUP', 3071, "60'-66' telescopic boom, 1 month"),
    m('08-CONT', 14563.1285714286, 'Shipping'),
  ],
  suppliesBasisOverride: 70558.208,       // typed; mat+equip computes to 53,244.26
  cleaningDaysOverride: 5,                // computed would be 6
  laborContingencyHoursOverride: 268,     // computed would be 266.08
  shopDrawingsCostOverride: 452.35,
};

const CURTAIN_WALL = {
  id: 'cw', breakout: 'Curtain Wall', systemType: 'SSG CW', areaSqFt: 4924.12,
  labor: { shopMH: 241.875, distMH: 230.85, fieldMH: 1169.2251833333335, caulkLF: 1672.6599999999999 },
  materials: [
    m('02-METL', 50414, 'Kawneer 1600-1 2-1/2x7-1/2" Captured'),
    m('02-METL', 750, 'Wrisco .060 Brake Form'),
    m('02-METL', 4900, 'Wind load / dead load clips (98)'),
    m('02-GLSS', 68186, '1" IGU Clear SB70'),
    m('02-DOOR', 7350, 'Kawneer 1 3/4" Standard'),
    m('02-HDWR', 500, 'JLM exterior package'),
    m('02-CAUL', 1839.926, '3/8" gray @ $1.10/LF'),
    m('06-SHOP', 3500, 'Engineering'),
    m('03-EQUP', 8640, "80'-86' telescopic boom, 2 months (basket weight)"),
    m('03-EQUP', 1970, '6K telehandler 36", 2 months fork'),
  ],
  suppliesBasisOverride: 157746.294,
  cleaningDaysOverride: 25,               // computed would be 37
  laborContingencyHoursOverride: 1161,
  shopDrawingsCostOverride: 1723.01,
};

const INT_SF = {
  id: 'int-sf', breakout: 'Interior Storefront', systemType: 'Int SF', areaSqFt: 1526.1299999999999,
  labor: { shopMH: 61.25, distMH: 39.5, fieldMH: 183.66146999999998, caulkLF: 1024.82 },
  materials: [
    m('02-METL', 8965.53, 'Kawneer 451 Center Set 2x4-1/2" Non-Thermal'),
    m('02-METL', 500, 'Wrisco .060 Brake Form'),
    m('02-GLSS', 9527.13, '1" IGU Clear SB70'),
    m('02-DOOR', 5785, 'Kawneer 1 3/4" Standard'),
    m('02-HDWR', 5000, 'JLM exterior package'),
    m('02-CAUL', 1947.158, '3/8" gray @ $1.90/LF'),
  ],
  suppliesBasisOverride: 35994.218,
  cleaningDaysOverride: 4,
  laborContingencyHoursOverride: 226,
  shopDrawingsCostOverride: 387.49,
};

const ALL_GLASS = {
  id: 'agw', breakout: 'All Glass Interior Partitions', systemType: null,
  labor: { shopMH: 0, distMH: 0, fieldMH: 0, caulkLF: 0 },
  miscLabor: [
    { label: 'Install Glass', qty: 52, hoursEach: 3 },
    { label: 'Butt Joints', qty: 85, hoursEach: 1 },
    { label: 'Door Installation', qty: 12, hoursEach: 6 },
  ],
  materials: [
    m('02-GLSS', 18623.44, '1/2" monolithic UltraClear'),
    m('02-HDWR', 9053.16, 'CRL package'),
    m('02-CAUL', 650, '1/4" clear butt joints'),
  ],
  suppliesBasisOverride: 36972.51,
  cleaningDaysOverride: 10,
  laborContingencyHoursOverride: 323,
  shopDrawingsCostOverride: 488.17,
};

// no labor at all — the engine must emit this scope without dividing by zero
const AUTO_DOORS = {
  id: 'asd', breakout: 'Automatic Sliding Doors', systemType: null,
  materials: [m('02-DOOR', 76290, 'Stanley auto sliders (15% MU baked into the quote)')],
  shopDrawingsCostOverride: 0,            // the sheet carries no shops line here
};

const GLAZING_ONLY = {
  id: 'glaz', breakout: 'Glazing Only', systemType: null,
  miscLabor: [{ label: 'Installation', qty: 21, hoursEach: 1 }],
  materials: [m('02-GLSS', 250, '1/4" monolithic UltraClear')],
  cleaningDaysOverride: 2,
  cleaningHoursPerDayOverride: 1,         // 1 hr/day here, 0.5 on the framed scopes
  laborContingencyHoursOverride: 23,
  shopDrawingsCostOverride: 0,
};

// ── alternates (priced, excluded from the base bid) ─────────────────────────

const NO_PCTS = { suppliesPctOverride: 0, materialContingencyPctOverride: 0 };

const ALTERNATES = [
  {
    id: 'alt1', breakout: 'Mirrors', alternate: 'Alternate 1',
    miscLabor: [{ label: 'Installation', qty: 4, hoursEach: 2 }],
    materials: [m('02-MIRR', 2500, '1/4" tempered mirror')],
    suppliesBasisOverride: 3500,          // typed above the 2,500 material cost
    cleaningDaysOverride: 1, cleaningHoursPerDayOverride: 1,
    laborContingencyHoursOverride: 5,
  },
  {
    id: 'alt2', breakout: 'Interior Storefront', alternate: 'Alternate 2', ...NO_PCTS,
    materials: [m('02-METL', 13900, 'Add Int SF per plans')],
  },
  {
    id: 'alt3', breakout: 'Exterior Storefront', alternate: 'Alternate 3',
    materials: [m('08-CONT', 5500, 'AAMA 502 water test')],
  },
  {
    id: 'alt4', breakout: 'Sun Control Devices', alternate: 'Alternate 4',
    materials: [m('08-CONT', 22543, 'Window film (15% markup baked in)')],
  },
  {
    id: 'alt5', breakout: 'Exterior Storefront', alternate: 'Alternate 5', ...NO_PCTS,
    materials: [m('02-METL', 20000, 'Painted finish add (20% MU baked in)')],
  },
  {
    id: 'alt6', breakout: 'All Glass Interior Partitions', alternate: 'Alternate 6', ...NO_PCTS,
    materials: [m('02-GLSS', 19528, 'OBE 72 LF additional glass, addendum 2')],
  },
  // Alternate 7 is a DEDUCT spread over three breakouts — negative lines
  {
    id: 'alt7-ext', breakout: 'Exterior Storefront', alternate: 'Alternate 7', ...NO_PCTS,
    materials: [m('02-GLSS', -1320.17, 'Glass deduct')],
  },
  {
    id: 'alt7-cw', breakout: 'Curtain Wall', alternate: 'Alternate 7', ...NO_PCTS,
    materials: [m('02-GLSS', -7112.47, 'Glass deduct')],
  },
  {
    id: 'alt7-agw', breakout: 'All Glass Interior Partitions', alternate: 'Alternate 7', ...NO_PCTS,
    materials: [m('02-GLSS', -4149.26, 'Glass deduct')],
  },
];

export const ALPINE_BID = {
  job: JOB,
  scopes: [EXT_SF, CURTAIN_WALL, INT_SF, ALL_GLASS, AUTO_DOORS, GLAZING_ONLY, ...ALTERNATES],
};

// ── the sheet's own numbers (SOW rows 141, 144, 149-163) ────────────────────

const SHEET_SCOPES = [
  ['Exterior Storefront', null, 81325.9920, 1380.8432, 30903.8770, 113610.7122],
  ['Curtain Wall', null, 219872.5035, 3016.2097, 83551.5513, 306440.2645],
  ['Interior Storefront', null, 44424.6656, 647.0943, 16881.3729, 61953.1328],
  ['All Glass Interior Partitions', null, 42504.7889, 579.4724, 16151.8198, 59236.0811],
  ['Automatic Sliding Doors', null, 77625.0750, 1552.5015, 29497.5285, 108675.1050],
  ['Glazing Only', null, 1197.3750, 5.0875, 455.0025, 1657.4650],
  ['Mirrors', 'Alternate 1', 2926.2500, 51.2250, 1111.9750, 4089.4500],
  ['Interior Storefront', 'Alternate 2', 13900, 278, 5282, 19460],
  ['Exterior Storefront', 'Alternate 3', 5500, 110, 2090, 7700],
  ['Sun Control Devices', 'Alternate 4', 22543, 450.8600, 8566.3400, 31560.2000],
  ['Exterior Storefront', 'Alternate 5', 20000, 400, 7600, 28000],
  ['All Glass Interior Partitions', 'Alternate 6', 19528, 390.5600, 7420.6400, 27339.2000],
  ['Exterior Storefront', 'Alternate 7', -1320.1700, -26.4034, -501.6646, -1848.2380],
  ['Curtain Wall', 'Alternate 7', -7112.4700, -142.2494, -2702.7386, -9957.4580],
  ['All Glass Interior Partitions', 'Alternate 7', -4149.2600, -82.9852, -1576.7188, -5808.9640],
];

describe('Alpine Buick GMC — every breakout reconciles to the sheet', () => {
  const r = computeBid(ALPINE_BID);
  const find = (breakout, alternate) =>
    r.scopes.find((s) => s.breakout === breakout && s.alternate === alternate);

  it.each(SHEET_SCOPES)('%s / %s', (breakout, alternate, cost, tax, markup, sell) => {
    const s = find(breakout, alternate);
    expect(s, `${breakout} / ${alternate} missing`).toBeTruthy();
    expect(s.cost).toBeCloseTo(cost, 2);
    expect(s.tax).toBeCloseTo(tax, 2);
    expect(s.markup).toBeCloseTo(markup, 2);
    expect(s.sell).toBeCloseTo(sell, 2);
  });
});

describe('Alpine Buick GMC — project totals', () => {
  const r = computeBid(ALPINE_BID);

  it('base bid: 466,950.40 cost -> 651,572.77 sell, GPM 27.2327%', () => {
    expect(round2(r.base.cost)).toBe(466950.40);
    expect(r.base.tax).toBeCloseTo(7181.2086, 2);
    expect(r.base.markup).toBeCloseTo(177441.152, 2);
    // The sheet DISPLAYS 651,572.77. Its own cost + tax + markup is
    // 651,572.7606 (B141 + C141 + D141), so ValorX's grand total carries about
    // a cent of per-line rounding that the engine does not. Assert the exact
    // arithmetic, and that it is within a cent of what the sheet prints.
    expect(round2(r.base.sell)).toBe(651572.76);
    expect(Math.abs(r.base.sell - 651572.77)).toBeLessThan(0.01);
    expect(r.base.gpm).toBeCloseTo(0.272327, 6);
  });

  it('GPM is markup / sell, NOT markup / (1 + markup)', () => {
    // tax sits in the sell but not in the profit, so the two differ by ~0.3 pts
    expect(r.base.gpm).toBeCloseTo(0.272327, 6);
    expect(0.38 / 1.38).toBeCloseTo(0.275362, 6);
    expect(r.base.gpm).toBeLessThan(0.38 / 1.38);
  });

  it('base + all alternates: 538,765.75 cost -> 752,106.95 sell', () => {
    expect(round2(r.all.cost)).toBe(538765.75);
    expect(r.all.tax).toBeCloseTo(8610.2156, 2);
    expect(r.all.markup).toBeCloseTo(204730.985, 2);
    expect(Math.abs(r.all.sell - 752106.9507)).toBeLessThan(0.02);
  });

  it('alternate 7 rolls up as a deduct across three breakouts', () => {
    const alt7 = r.alternates.find((a) => a.alternate === 'Alternate 7');
    expect(alt7.scopes).toEqual([
      'Exterior Storefront', 'Curtain Wall', 'All Glass Interior Partitions',
    ]);
    expect(alt7.cost).toBeCloseTo(-12581.90, 2);
    expect(alt7.sell).toBeCloseTo(-17614.66, 2);
    expect(alt7.sell).toBeLessThan(0);
  });

  it('every alternate is reported separately from the base bid', () => {
    expect(r.alternates.map((a) => a.alternate)).toEqual([
      'Alternate 1', 'Alternate 2', 'Alternate 3', 'Alternate 4',
      'Alternate 5', 'Alternate 6', 'Alternate 7',
    ]);
    const altSell = r.alternates.reduce((s, a) => s + a.sell, 0);
    expect(round2(r.base.sell + altSell)).toBe(round2(r.all.sell));
  });
});

describe('Alpine Buick GMC — cost-code export', () => {
  const r = computeBid(ALPINE_BID);
  const code = (c) => r.costCodes.find((x) => x.code === c);

  // SOW "Estimated Values" rows 150-166
  it.each([
    ['02-METL', 108884.53, 2177.6906, 41376.1214],
    ['02-GLSS', 116191.67, 2323.8334, 44152.8346],
    ['02-CAUL', 5557.346, 111.1469, 2111.7915],
    ['02-DOOR', 94364, 1887.28, 35858.32],
    ['02-MIRR', 2500, 50, 950],
    ['02-HDWR', 36553.16, 731.0632, 13890.2008],
    ['05-SUPP', 1906.5562, 38.1311, 724.4913],
    ['03-EQUP', 13681, 273.62, 5198.78],
    ['06-SHOP', 3500, 70, 1330],
    ['08-CONT', 47372.5189, 947.4504, 18001.5572],
  ])('%s', (c, cost, tax, markup) => {
    const row = code(c);
    expect(row, `${c} missing`).toBeTruthy();
    expect(row.cost).toBeCloseTo(cost, 2);
    expect(row.tax).toBeCloseTo(tax, 2);
    expect(row.markup).toBeCloseTo(markup, 2);
  });

  it('all labor lands in 01-GLAZ, untaxed — shop-drawing HOURS included', () => {
    const glaz = code('01-GLAZ');
    // storefront 22,839.9416 + SSG CW 65,678.0073 + misc 19,737.02
    expect(glaz.cost).toBeCloseTo(108254.9689, 2);
    expect(glaz.tax).toBe(0);
    expect(glaz.markup).toBeCloseTo(41136.8882, 2);
  });

  it('the cost codes sum back to the whole bid', () => {
    const t = r.costCodes.reduce(
      (a, x) => ({ cost: a.cost + x.cost, tax: a.tax + x.tax, markup: a.markup + x.markup }),
      { cost: 0, tax: 0, markup: 0 },
    );
    expect(round2(t.cost)).toBe(538765.75);
    expect(t.tax).toBeCloseTo(8610.2156, 2);
    expect(t.markup).toBeCloseTo(204730.985, 2);
  });
});

describe('Alpine Buick GMC — the mechanics behind the numbers', () => {
  const r = computeBid(ALPINE_BID);
  const scope = (b) => r.scopes.find((s) => s.breakout === b && !s.alternate);

  it('labor cost is man-hours x $40.00, exactly', () => {
    expect(scope('Exterior Storefront').labor.frameMH).toBeCloseTo(286.58707, 5);
    expect(scope('Exterior Storefront').labor.frameMH * 40).toBeCloseTo(11463.4828, 4);
    expect(scope('Curtain Wall').labor.frameMH * 40).toBeCloseTo(65678.0073, 4);
    expect(scope('Interior Storefront').labor.frameMH * 40).toBeCloseTo(11376.4588, 4);
  });

  it('caulk LF is the frame perimeter doubled (two beads)', () => {
    expect(scope('Exterior Storefront').labor.caulkLF).toBeCloseTo(509.21 * 2, 2);
    expect(scope('Interior Storefront').labor.caulkLF).toBeCloseTo(512.41 * 2, 2);
    expect(scope('Curtain Wall').labor.caulkLF).toBeCloseTo(836.33 * 2, 2);
  });

  it('supplies and contingency hit the SAME basis — no compounding', () => {
    const s = scope('Exterior Storefront').material;
    expect(s.suppliesBasis).toBeCloseTo(70558.208, 3);
    expect(s.supplies).toBeCloseTo(352.79104, 5);
    expect(s.contingency).toBeCloseTo(881.9776, 5);
    // glazeq would compound: (basis + supplies) x 1.25% = 886.38, 4.41 too high
    expect(s.contingency).not.toBeCloseTo((s.suppliesBasis + s.supplies) * 0.0125, 2);
    expect(s.contingency / s.supplies).toBeCloseTo(2.5, 10);
  });

  it('tax is 2% of material + supplies + contingency, and labor is untaxed', () => {
    const s = scope('Curtain Wall');
    expect(s.material.taxableBase).toBeCloseTo(150810.486145, 4);
    expect(s.tax).toBeCloseTo(3016.2097, 4);
    expect(s.labor.cost).toBeGreaterThan(0);
    expect(s.tax).toBeCloseTo(s.material.taxableBase * 0.02, 6);
  });

  it('markup is 38% of COST, not of cost + tax', () => {
    const s = scope('Exterior Storefront');
    expect(s.markup).toBeCloseTo(s.cost * 0.38, 6);
    expect(s.markup).not.toBeCloseTo((s.cost + s.tax) * 0.38, 2);
  });

  it('freight rides as an 08-Contingency line: taxed, but out of the supplies basis', () => {
    const s = scope('Exterior Storefront').material;
    const ship = s.lines.find((l) => l.description === 'Shipping');
    expect(ship.group).toBe('08-CONT');
    expect(ship.taxable).toBe(true);
    expect(ship.inBasis).toBe(false);
    expect(s.basis).toBeCloseTo(53244.262, 3);   // computed basis excludes freight
  });

  it('a scope with no labor at all prices cleanly', () => {
    const asd = scope('Automatic Sliding Doors');
    expect(asd.labor.totalMH).toBe(0);
    expect(asd.labor.miscLabor).toHaveLength(0);     // no cleaning, no contingency
    expect(asd.material.suppliesBasis).toBeCloseTo(76290, 2);   // computed, not typed
    expect(asd.material.supplies).toBeCloseTo(381.45, 2);
    expect(asd.cost).toBeCloseTo(77625.075, 3);
    expect(Number.isFinite(asd.gpm)).toBe(true);
  });

  it('$/SF comes out per scope, matching the labor tabs', () => {
    // the ValorX labor tabs report FRAME labor per square foot
    expect(scope('Exterior Storefront').frameLaborCostPerSqFt).toBeCloseTo(12.32, 2);
    expect(scope('Interior Storefront').frameLaborCostPerSqFt).toBeCloseTo(7.45, 2);
    expect(scope('Curtain Wall').frameLaborCostPerSqFt).toBeCloseTo(13.34, 2);
    // and the engine also reports sell per SF, which the sheet does not
    expect(scope('Exterior Storefront').sellPerSqFt)
      .toBeCloseTo(113610.7122 / 930.61, 4);
    expect(r.totalSqFt).toBeCloseTo(930.61 + 4924.12 + 1526.13, 2);
  });

  it('nothing is flagged — every line on this sheet is a real quote', () => {
    expect(r.flagged).toEqual([]);
    expect(r.scopes.every((s) => s.flaggedLines === 0)).toBe(true);
  });

  it('no bond on a pre-contract bid', () => {
    expect(r.bond.cost).toBe(0);
    expect(r.bond.sell).toBe(0);
  });
});

describe('Alpine Buick GMC — which figures the estimator overrode', () => {
  it('cleaning days were typed on every framed scope; the formula would say more', () => {
    const r = computeBid(ALPINE_BID);
    const clean = (b) => r.scopes
      .find((s) => s.breakout === b && !s.alternate).labor.miscLabor
      .find((l) => l.key === 'clean');

    expect(clean('Exterior Storefront')).toMatchObject({ qty: 5, computedQty: 6, overridden: true });
    expect(clean('Interior Storefront')).toMatchObject({ qty: 4, computedQty: 6, overridden: true });
    expect(clean('Curtain Wall')).toMatchObject({ qty: 25, computedQty: 37, overridden: true });
    // hours per day is 0.5 on framed work, 1.0 on Glazing Only
    expect(clean('Exterior Storefront').hoursEach).toBe(0.5);
    expect(clean('Glazing Only').hoursEach).toBe(1);
  });

  it("without the overrides the engine's own defaults are self-consistent", () => {
    // same scope, nothing typed: supplies/contingency computed off material+equip,
    // cleaning days off field hours, labor contingency off real man-hours
    const bare = { ...EXT_SF };
    delete bare.suppliesBasisOverride;
    delete bare.cleaningDaysOverride;
    delete bare.laborContingencyHoursOverride;
    delete bare.shopDrawingsCostOverride;

    const s = computeScopeCost(bare, JOB);
    expect(s.material.basis).toBeCloseTo(53244.262, 3);
    expect(s.material.supplies).toBeCloseTo(266.22131, 5);
    expect(s.material.contingency).toBeCloseTo(665.553275, 5);
    const clean = s.labor.miscLabor.find((l) => l.key === 'clean');
    expect(clean).toMatchObject({ qty: 6, hoursEach: 0.5, overridden: false });
    const cont = s.labor.miscLabor.find((l) => l.key === 'cont');
    expect(cont.qty).toBeCloseTo(286.58707, 5);
    expect(cont.hours).toBeCloseTo(7.16467675, 6);
  });

  it("shop drawings, left to the engine, are 0.7% of the base-bid cost at $40/hr", () => {
    const scopes = ALPINE_BID.scopes.map((s) => {
      const copy = { ...s };
      delete copy.shopDrawingsCostOverride;
      return copy;
    });
    const r = computeBid({ job: JOB, scopes });
    // basis is project cost BEFORE the shops line, so it is a touch under the
    // sheet's 466,950.40 (which has the typed shops inside it)
    expect(r.shopDrawings.cost).toBeCloseTo(r.shopDrawings.basis * 0.007, 6);
    expect(r.shopDrawings.rate).toBe(40);                  // the job's MH rate
    expect(r.shopDrawings.hours).toBeCloseTo((r.shopDrawings.basis / 40) * 0.007, 6);
    // the sheet's own four Shops rows divide by 42 on this $40 job, so they come
    // to 76.275 MH against the engine's 0.7%-exact figure. That was a slip.
    expect(r.shopDrawings.hours).toBeGreaterThan(76.275);
    // and it is allocated across the six base breakouts, pro-rata on cost
    expect(r.shopDrawings.lines).toHaveLength(6);
    const alloc = r.shopDrawings.lines.reduce((s, l) => s + l.cost, 0);
    expect(alloc).toBeCloseTo(r.shopDrawings.cost, 6);
  });
});
