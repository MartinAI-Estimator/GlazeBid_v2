/**
 * bidCostEngine.test.js — each rule on its own, with the smallest input that
 * shows it. The end-to-end proof against a real priced bid lives in
 * `bidCostEngine.alpine.test.js`.
 *
 * Every `it` title names the interview decision it pins down.
 */

import { describe, it, expect } from 'vitest';
import {
  computeBid, computeScopeCost, computeScopeLabor, computeScopeMaterial,
  resolveLinePrice, findHistoryPrice, equipmentCost, allocateShopDrawings,
  costCodeRollup, COST_GROUPS, MATERIAL_GROUPS, DEFAULT_JOB, PRICE_SOURCES, round2,
} from '../../engine/bidCostEngine';

/** A deliberately round job so every assertion is readable by eye. */
const JOB = {
  laborRate: 100, markupPct: 20, taxPct: 10, crewSize: 4,
  suppliesPct: 0.5, materialContingencyPct: 1.25, laborContingencyPct: 2.5,
  shopDrawingsPct: 0.7, cleaningHoursPerDay: 0.5, bondPct: 0, asOf: '2026-10-06',
};

const scopeWith = (over = {}) => ({
  id: 's1', breakout: 'Exterior Storefront', systemType: 'Ext SF',
  labor: { shopMH: 10, distMH: 5, fieldMH: 32, caulkLF: 100 },
  materials: [{ group: '02-METL', cost: 10000, description: 'Metal' }],
  shopDrawingsCostOverride: 0,
  ...over,
});

// ── cost groups ────────────────────────────────────────────────────────────

describe('cost groups (#4)', () => {
  it('has the nine material-side groups plus supplies, contingency and labor', () => {
    expect(Object.keys(COST_GROUPS)).toEqual([
      '02-METL', '02-GLSS', '02-DOOR', '02-HDWR', '02-CAUL', '02-MIRR',
      '03-EQUP', '05-SUPP', '06-SHOP', '07-TRAV', '08-CONT', '01-GLAZ',
    ]);
  });

  it('equipment counts as material, so it gets the full material treatment (#14)', () => {
    expect(MATERIAL_GROUPS).toContain('03-EQUP');
    expect(COST_GROUPS['03-EQUP'].kind).toBe('material');
  });

  it('an unknown group falls back to metal rather than vanishing', () => {
    const s = computeScopeCost(scopeWith({
      materials: [{ group: 'nonsense', cost: 500 }],
    }), JOB);
    expect(s.material.lines[0].group).toBe('02-METL');
    expect(s.material.lineTotal).toBe(500);
  });
});

// ── the money shape ────────────────────────────────────────────────────────

describe('the money shape (#5, #6)', () => {
  it('cost is pre-tax; sell = cost + tax + markup', () => {
    const s = computeScopeCost(scopeWith(), JOB);
    expect(s.sell).toBeCloseTo(s.cost + s.tax + s.markup, 10);
  });

  it('markup is on COST, never on cost + tax', () => {
    const s = computeScopeCost(scopeWith(), JOB);
    expect(s.markup).toBeCloseTo(s.cost * 0.2, 10);
    expect(s.markup).not.toBeCloseTo((s.cost + s.tax) * 0.2, 2);
  });

  it('labor is never taxed (#6)', () => {
    const laborOnly = computeScopeCost(scopeWith({ materials: [] }), JOB);
    expect(laborOnly.labor.cost).toBeGreaterThan(0);
    expect(laborOnly.tax).toBe(0);
  });

  it('tax covers materials AND equipment rental (#6, #14)', () => {
    const s = computeScopeCost(scopeWith({
      materials: [
        { group: '02-GLSS', cost: 1000 },
        { group: '03-EQUP', cost: 500 },
      ],
      suppliesPctOverride: 0, materialContingencyPctOverride: 0,
    }), JOB);
    expect(s.material.taxableBase).toBe(1500);
    expect(s.tax).toBeCloseTo(150, 10);
  });

  it('GPM is markup / sell, so tax dilutes it below markup/(1+markup) (#5)', () => {
    const s = computeScopeCost(scopeWith(), JOB);
    expect(s.gpm).toBeCloseTo(s.markup / s.sell, 12);
    expect(s.gpm).toBeLessThan(0.2 / 1.2);
  });

  it('a per-scope markup override beats the project rate (#5)', () => {
    const a = computeScopeCost(scopeWith(), JOB);
    const b = computeScopeCost(scopeWith({ markupPctOverride: 35 }), JOB);
    expect(a.markupRate).toBe(0.2);
    expect(b.markupRate).toBe(0.35);
    expect(b.markup).toBeCloseTo(b.cost * 0.35, 10);
  });
});

// ── supplies and contingency ───────────────────────────────────────────────

describe('supplies and material contingency (#15, #17, #18)', () => {
  const s = computeScopeMaterial(scopeWith({
    materials: [
      { group: '02-METL', cost: 8000 },
      { group: '03-EQUP', cost: 2000 },
      { group: '08-CONT', cost: 1000, description: 'Shipping' },
      { group: '06-SHOP', cost: 500, description: 'Engineering' },
    ],
  }), JOB);

  it('the basis is material + equipment, pre-tax — services and freight are out (#17)', () => {
    expect(s.basis).toBe(10000);
    expect(s.lineTotal).toBe(11500);
  });

  it('contingency uses the SAME basis as supplies and does NOT compound (#18)', () => {
    expect(s.supplies).toBe(50);          // 10,000 x 0.5%
    expect(s.contingency).toBe(125);      // 10,000 x 1.25%, NOT 10,050 x 1.25%
    expect(s.contingency).not.toBeCloseTo((s.basis + s.supplies) * 0.0125, 6);
  });

  it('both percentages are overridable per scope (#15)', () => {
    const hard = computeScopeMaterial(scopeWith({
      suppliesPctOverride: 1.5, materialContingencyPctOverride: 3,
    }), JOB);
    expect(hard.supplies).toBe(150);
    expect(hard.contingency).toBe(300);
  });

  it('a line can opt into the basis explicitly', () => {
    const withFreight = computeScopeMaterial(scopeWith({
      materials: [
        { group: '02-METL', cost: 8000 },
        { group: '08-CONT', cost: 2000, description: 'Shipping', inBasis: true },
      ],
    }), JOB);
    expect(withFreight.basis).toBe(10000);
  });

  it('supplies and contingency are themselves taxed, never in the basis', () => {
    expect(s.taxableBase).toBeCloseTo(11500 + 50 + 125, 10);
    expect(s.tax).toBeCloseTo((11500 + 175) * 0.1, 10);
  });
});

// ── labor ──────────────────────────────────────────────────────────────────

describe('labor (#13, #20)', () => {
  it('one blended rate covers shop, distribution and field hours (#13)', () => {
    const l = computeScopeLabor(scopeWith(), JOB);
    expect(l.frameMH).toBe(47);
    expect(l.rate).toBe(100);
    expect(l.cost).toBeCloseTo(l.totalMH * 100, 10);
  });

  it('the lift multiplier lifts field hours only', () => {
    const l = computeScopeLabor(scopeWith({ liftMultiplier: 1.25 }), JOB);
    expect(l.shopMH).toBe(10);
    expect(l.distMH).toBe(5);
    expect(l.fieldMH).toBe(40);
    expect(l.frameMH).toBe(55);
  });

  it('cleaning days = ceil(fieldMH / (crew x 8)), hours/day from the job (#20)', () => {
    const l = computeScopeLabor(scopeWith(), JOB);       // 32 field / (4 x 8) = 1
    const clean = l.miscLabor.find((x) => x.key === 'clean');
    expect(clean).toMatchObject({ qty: 1, hoursEach: 0.5, hours: 0.5, overridden: false });

    const big = computeScopeLabor(scopeWith({ labor: { fieldMH: 33 } }), JOB);
    expect(big.miscLabor.find((x) => x.key === 'clean').qty).toBe(2);   // rounds UP
  });

  it('a typed cleaning day count overrides the formula but keeps it visible (#20)', () => {
    const l = computeScopeLabor(scopeWith({ cleaningDaysOverride: 5 }), JOB);
    const clean = l.miscLabor.find((x) => x.key === 'clean');
    expect(clean).toMatchObject({ qty: 5, computedQty: 1, overridden: true });
  });

  it('labor contingency is 2.5% of the REAL hours, not of the auto lines', () => {
    const l = computeScopeLabor(scopeWith(), JOB);
    const cont = l.miscLabor.find((x) => x.key === 'cont');
    expect(cont.qty).toBe(47);                    // frame hours, cleaning excluded
    expect(cont.hours).toBeCloseTo(1.175, 10);
  });

  it('typed misc labor is real work and feeds the contingency', () => {
    const l = computeScopeLabor(scopeWith({
      miscLabor: [{ label: 'AG Doors', qty: 12, hoursEach: 6 }],
    }), JOB);
    expect(l.miscMH).toBe(72);
    expect(l.baseMH).toBe(119);
    expect(l.miscLabor.find((x) => x.key === 'cont').qty).toBe(119);
  });

  it('a scope with zero hours gets no cleaning and no contingency', () => {
    const l = computeScopeLabor({ materials: [] }, JOB);
    expect(l.totalMH).toBe(0);
    expect(l.miscLabor).toEqual([]);
    expect(l.cost).toBe(0);
  });
});

// ── pricing precedence ─────────────────────────────────────────────────────

describe('pricing precedence (#2)', () => {
  const history = [
    { key: 'kaw-451T', vendor: 'Kawneer', date: '2026-08-01', unit: 'LF', unitPrice: 12 },
    { key: 'kaw-451T', vendor: 'Kawneer', date: '2026-01-02', unit: 'LF', unitPrice: 9 },
    { key: 'stale-die', vendor: 'Kawneer', date: '2025-11-01', unit: 'LF', unitPrice: 7 },
  ];
  const job = { ...JOB, quoteHistory: history, budgetRates: { 'stale-die': 8, 'nothing-else': 5 } };

  it('a typed cost IS the real quote and wins outright', () => {
    const p = resolveLinePrice({ cost: 1234, quoteKey: 'kaw-451T', qty: 10 }, job);
    expect(p).toMatchObject({ cost: 1234, source: PRICE_SOURCES.QUOTE, flagged: false });
  });

  it('a unit price x qty is also a real quote', () => {
    const p = resolveLinePrice({ unitPrice: 20, qty: 10 }, job);
    expect(p).toMatchObject({ cost: 200, source: PRICE_SOURCES.QUOTE, flagged: false });
  });

  it('with no quote, the freshest history row inside 6 months prices it', () => {
    const p = resolveLinePrice({ quoteKey: 'kaw-451T', qty: 10 }, job);
    expect(p.source).toBe(PRICE_SOURCES.HISTORY);
    expect(p.cost).toBe(120);                     // the Aug row, not the Jan one
    expect(p.date).toBe('2026-08-01');
    expect(p.ageMonths).toBeLessThan(6);
    expect(p.flagged).toBe(false);
  });

  it('a quote older than 6 months never prices a bid (#2)', () => {
    expect(findHistoryPrice('stale-die', job)).toBeNull();
    const p = resolveLinePrice({ quoteKey: 'stale-die', qty: 10 }, job);
    expect(p.source).toBe(PRICE_SOURCES.BUDGET);  // falls through to the budget rate
    expect(p.cost).toBe(80);
    expect(p.flagged).toBe(true);
  });

  it('the 6-month window moves with the bid date', () => {
    // Aug 2026 -> Dec 2026 is 4 months: still usable
    expect(findHistoryPrice('kaw-451T', { ...job, asOf: '2026-12-01' }).unitPrice).toBe(12);
    // Aug 2026 -> Jun 2027 is 10 months: nothing left in the window
    expect(findHistoryPrice('kaw-451T', { ...job, asOf: '2027-06-01' })).toBeNull();
  });

  it('a quote dated after the bid date is ignored, not used', () => {
    expect(findHistoryPrice('kaw-451T', { ...job, asOf: '2026-02-01' }).date)
      .toBe('2026-01-02');
  });

  it('a budget rate works but is flagged "awaiting quote"', () => {
    const p = resolveLinePrice({ quoteKey: 'nothing-else', qty: 2 }, job);
    expect(p).toMatchObject({ cost: 10, source: PRICE_SOURCES.BUDGET, flagged: true });
    expect(p.note).toMatch(/awaiting quote/);
  });

  it('nothing at all prices to $0 and is flagged, not silently dropped', () => {
    const p = resolveLinePrice({ quoteKey: 'unheard-of', qty: 9 }, job);
    expect(p).toMatchObject({ cost: 0, source: PRICE_SOURCES.NONE, flagged: true });
  });

  it('flagged lines surface on the bid result for the estimator to chase', () => {
    const r = computeBid({
      job,
      scopes: [scopeWith({
        materials: [
          { group: '02-METL', quoteKey: 'nothing-else', qty: 2, description: 'Budget metal' },
          { group: '02-GLSS', quoteKey: 'unheard-of', qty: 1, description: 'Unpriced glass' },
        ],
      })],
    });
    expect(r.flagged).toHaveLength(2);
    expect(r.flagged.map((f) => f.source)).toEqual(['budget', 'none']);
    expect(r.scopes[0].flaggedLines).toBe(2);
  });
});

// ── auto-priced lines ──────────────────────────────────────────────────────

describe('auto-priced lines (#4, #14)', () => {
  it('caulking prices off the scope caulk LF x $/LF', () => {
    const s = computeScopeMaterial(scopeWith({
      labor: { caulkLF: 1000 },
      materials: [{ group: '02-CAUL', auto: 'caulking' }],
    }), { ...JOB, caulkPricePerLF: 1.9 });
    expect(s.lineTotal).toBeCloseTo(1900, 10);
    expect(s.lines[0].notes).toMatch(/caulk LF/);
  });

  it('a line-level $/LF beats the company rate', () => {
    const s = computeScopeMaterial(scopeWith({
      labor: { caulkLF: 1000 },
      materials: [{ group: '02-CAUL', auto: 'caulking', pricePerLF: 1.1 }],
    }), JOB);
    expect(s.lineTotal).toBeCloseTo(1100, 10);
  });

  it('equipment prices off the rental table, with $310 per PU/DO', () => {
    const line = {
      auto: 'equipment',
      equipment: { weeks: 2, months: 1, puDo: 2, weekRate: 458, monthRate: 1200 },
    };
    expect(equipmentCost(line, JOB)).toBe(2 * 458 + 1200 + 2 * 310);
  });

  it('the glazier package adds on top when asked for', () => {
    const line = {
      auto: 'equipment',
      equipment: {
        weeks: 1, months: 0, puDo: 0, weekRate: 400, monthRate: 0,
        glazierPkg: true, glazierPkgWeekRate: 75, glazierPkgMonthRate: 200,
      },
    };
    expect(equipmentCost(line, JOB)).toBe(475);
  });

  it('a vendor markup is baked into the line before the project markup', () => {
    const p = resolveLinePrice({ cost: 1000, vendorMarkupPct: 15 }, JOB);
    expect(p.cost).toBeCloseTo(1150, 10);
    expect(p.note).toMatch(/vendor markup 15%/);
  });
});

// ── shop drawings ──────────────────────────────────────────────────────────

describe('shop drawings (#19)', () => {
  const two = [
    scopeWith({ id: 'a', breakout: 'A', shopDrawingsCostOverride: undefined }),
    scopeWith({ id: 'b', breakout: 'B', materials: [{ group: '02-METL', cost: 30000 }], shopDrawingsCostOverride: undefined }),
  ];

  it('is 0.7% of project cost, carried as hours at the labor rate', () => {
    const pass1 = two.map((s) => computeScopeCost(s, JOB));
    const alloc = allocateShopDrawings(pass1, JOB);
    expect(alloc.basis).toBeCloseTo(pass1[0].cost + pass1[1].cost, 10);
    expect(alloc.cost).toBeCloseTo(alloc.basis * 0.007, 10);
    expect(alloc.hours).toBeCloseTo(alloc.cost / 100, 10);
  });

  it('allocates to scopes pro-rata on scope cost', () => {
    const r = computeBid({ job: JOB, scopes: two });
    const [a, b] = r.shopDrawings.lines;
    expect(a.cost + b.cost).toBeCloseTo(r.shopDrawings.cost, 8);
    const pass1 = two.map((s) => computeScopeCost(s, JOB));
    expect(a.cost / b.cost).toBeCloseTo(pass1[0].cost / pass1[1].cost, 6);
  });

  it('is computed on cost BEFORE the shops line, so it is not circular', () => {
    const r = computeBid({ job: JOB, scopes: two });
    expect(r.shopDrawings.basis).toBeLessThan(r.base.cost);
    expect(r.base.cost - r.shopDrawings.basis).toBeCloseTo(r.shopDrawings.cost, 6);
  });

  it('inherits the labor markup and is never taxed', () => {
    const r = computeBid({ job: JOB, scopes: two });
    const noShops = computeBid({
      job: { ...JOB, shopDrawingsPct: 0 },
      scopes: two,
    });
    const delta = r.base.markup - noShops.base.markup;
    expect(delta).toBeCloseTo(r.shopDrawings.cost * 0.2, 6);
    expect(r.base.tax).toBeCloseTo(noShops.base.tax, 8);
  });

  it('a typed per-scope dollar figure overrides the allocation', () => {
    const r = computeBid({
      job: JOB,
      scopes: [two[0], { ...two[1], shopDrawingsCostOverride: 999 }],
    });
    const b = r.shopDrawings.lines.find((l) => l.breakout === 'B');
    expect(b).toMatchObject({ cost: 999, overridden: true });
  });

  it('shopDrawingsRate holds the drafting rate apart from the labor rate', () => {
    // the ValorX sheet divides by 42 on a $40 job, landing at 0.667% not 0.7%
    const pass1 = two.map((s) => computeScopeCost(s, { ...JOB, laborRate: 40 }));
    const alloc = allocateShopDrawings(pass1, { ...JOB, laborRate: 40, shopDrawingsRate: 42 });
    expect(alloc.cost).toBeCloseTo(alloc.basis * 0.007 * (40 / 42), 8);
  });

  it('exports under 01-GLAZ by default, like the sheet does', () => {
    const r = computeBid({ job: JOB, scopes: two });
    expect(r.costCodes.find((c) => c.code === '06-SHOP')).toBeUndefined();
    const glaz = r.costCodes.find((c) => c.code === '01-GLAZ');
    expect(glaz.tax).toBe(0);
  });

  it('can be exported under 06-SHOP instead when a company wants that', () => {
    const r = computeBid({ job: { ...JOB, shopDrawingsCostCode: '06-SHOP' }, scopes: two });
    const shop = r.costCodes.find((c) => c.code === '06-SHOP');
    expect(shop.cost).toBeCloseTo(r.shopDrawings.cost, 6);
    expect(shop.tax).toBe(0);
  });
});

// ── project-level adders and bonds ─────────────────────────────────────────

describe('travel, per diem and bonds (#7, #16)', () => {
  const base = [scopeWith()];

  it('travel and per diem are typed once at project level (#7)', () => {
    const r = computeBid({
      job: {
        ...JOB,
        projectAdders: [
          { label: 'Per Diem', group: '07-TRAV', qty: 20, unitCost: 40 },
          { label: 'Lodging', group: '07-TRAV', qty: 10, unitCost: 150 },
        ],
      },
      scopes: base,
    });
    expect(r.projectAdders.cost).toBe(800 + 1500);
    expect(r.projectAdders.markup).toBeCloseTo(2300 * 0.2, 10);
    expect(r.costCodes.find((c) => c.code === '07-TRAV').cost).toBe(2300);
  });

  it('bonds are a % of the sell before the bond, with no markup on top (#16)', () => {
    const noBond = computeBid({ job: JOB, scopes: base });
    const r = computeBid({ job: { ...JOB, bondPct: 1.5 }, scopes: base });
    expect(r.bond.basis).toBeCloseTo(noBond.base.sell, 8);
    expect(r.bond.cost).toBeCloseTo(noBond.base.sell * 0.015, 8);
    expect(r.bond.markup).toBe(0);
    expect(r.bond.tax).toBe(0);
    expect(r.base.sell).toBeCloseTo(noBond.base.sell + r.bond.cost, 8);
  });

  it('a typed dollar bond overrides the percentage (#16)', () => {
    const r = computeBid({
      job: { ...JOB, bondPct: 1.5, bondCostOverride: 5000 },
      scopes: base,
    });
    expect(r.bond).toMatchObject({ cost: 5000, overridden: true });
  });

  it('the bond is not circular — it is never charged on itself', () => {
    const r = computeBid({ job: { ...JOB, bondPct: 1.5 }, scopes: base });
    expect(r.bond.basis).toBeLessThan(r.base.sell);
    expect(r.bond.cost).toBeCloseTo(r.bond.basis * 0.015, 8);
  });
});

// ── alternates ─────────────────────────────────────────────────────────────

describe('alternates (decode §8.1)', () => {
  const bid = {
    job: JOB,
    scopes: [
      scopeWith(),
      scopeWith({ id: 'add', breakout: 'Mirrors', alternate: 'Alt 1',
        labor: {}, materials: [{ group: '02-MIRR', cost: 2000 }] }),
      scopeWith({ id: 'ded', breakout: 'Exterior Storefront', alternate: 'Alt 2',
        labor: {}, materials: [{ group: '02-GLSS', cost: -5000 }] }),
    ],
  };
  const r = computeBid(bid);

  it('base totals exclude every alternate', () => {
    expect(r.base.cost).toBeCloseTo(r.scopes[0].cost, 8);
  });

  it('each alternate rolls up on its own', () => {
    expect(r.alternates.map((a) => a.alternate)).toEqual(['Alt 1', 'Alt 2']);
    expect(r.alternates[0].cost).toBeGreaterThan(0);
  });

  it('a deduct alternate is negative all the way through', () => {
    const ded = r.alternates[1];
    expect(ded.cost).toBeLessThan(0);
    expect(ded.tax).toBeLessThan(0);
    expect(ded.markup).toBeLessThan(0);
    expect(ded.sell).toBeLessThan(0);
  });

  it('`all` is base plus every alternate', () => {
    const sum = r.alternates.reduce((s, a) => s + a.sell, 0);
    expect(round2(r.all.sell)).toBe(round2(r.base.sell + sum));
  });

  it('an alternate gets shop drawings only if one is typed for it', () => {
    expect(r.shopDrawings.lines.filter((l) => l.alternate)).toEqual([]);
    const withShops = computeBid({
      job: JOB,
      scopes: [bid.scopes[0], { ...bid.scopes[1], shopDrawingsCostOverride: 250 }],
    });
    expect(withShops.shopDrawings.lines.find((l) => l.alternate === 'Alt 1'))
      .toMatchObject({ cost: 250, overridden: true });
  });

  it('several scopes can share one alternate tag', () => {
    const multi = computeBid({
      job: JOB,
      scopes: [
        scopeWith(),
        scopeWith({ id: 'x', breakout: 'A', alternate: 'Alt 7', labor: {}, materials: [{ group: '02-GLSS', cost: -100 }] }),
        scopeWith({ id: 'y', breakout: 'B', alternate: 'Alt 7', labor: {}, materials: [{ group: '02-GLSS', cost: -200 }] }),
      ],
    });
    expect(multi.alternates).toHaveLength(1);
    expect(multi.alternates[0].scopes).toEqual(['A', 'B']);
    // the scope percentages apply to a deduct too: -300 material, -5.25 of
    // supplies (0.5%) and contingency (1.25%) credited back with it
    expect(multi.alternates[0].cost).toBeCloseTo(-305.25, 8);
  });
});

// ── cost-code rollup ───────────────────────────────────────────────────────

describe('cost-code rollup', () => {
  it('every dollar in the bid lands in exactly one cost code', () => {
    const r = computeBid({
      job: { ...JOB, projectAdders: [{ label: 'Per Diem', group: '07-TRAV', cost: 1000 }] },
      scopes: [
        scopeWith({ shopDrawingsCostOverride: undefined }),
        scopeWith({ id: 'alt', breakout: 'Mirrors', alternate: 'Alt 1',
          labor: {}, materials: [{ group: '02-MIRR', cost: 2000 }] }),
      ],
    });
    const t = r.costCodes.reduce(
      (a, x) => ({ cost: a.cost + x.cost, tax: a.tax + x.tax, markup: a.markup + x.markup }),
      { cost: 0, tax: 0, markup: 0 },
    );
    expect(t.cost).toBeCloseTo(r.all.cost, 6);
    expect(t.tax).toBeCloseTo(r.all.tax, 6);
    expect(t.markup).toBeCloseTo(r.all.markup, 6);
  });

  it('is sorted by code so an export is stable', () => {
    const r = computeBid({ job: JOB, scopes: [scopeWith()] });
    const codes = r.costCodes.map((c) => c.code);
    expect(codes).toEqual([...codes].sort());
  });

  it('rolls up directly from scope results too', () => {
    const s = computeScopeCost(scopeWith(), JOB);
    const rows = costCodeRollup([s], JOB);
    expect(rows.find((c) => c.code === '02-METL').cost).toBe(10000);
    expect(rows.find((c) => c.code === '05-SUPP').cost).toBeCloseTo(50, 10);
    expect(rows.find((c) => c.code === '08-CONT').cost).toBeCloseTo(125, 10);
  });
});

// ── reporting and edge cases ───────────────────────────────────────────────

describe('reporting and edges', () => {
  it('reports $/SF per scope — sell and the labor figure the sheet shows', () => {
    const s = computeScopeCost(scopeWith({ areaSqFt: 1000 }), JOB);
    expect(s.sellPerSqFt).toBeCloseTo(s.sell / 1000, 10);
    expect(s.laborCostPerSqFt).toBeCloseTo(s.labor.cost / 1000, 10);
  });

  it('no area means no $/SF rather than Infinity', () => {
    const s = computeScopeCost(scopeWith({ areaSqFt: 0 }), JOB);
    expect(s.sellPerSqFt).toBeNull();
    expect(s.laborCostPerSqFt).toBeNull();
  });

  it('an empty bid is zeros, not NaN', () => {
    const r = computeBid({ job: JOB, scopes: [] });
    expect(r.base).toMatchObject({ cost: 0, tax: 0, markup: 0, sell: 0, gpm: 0 });
    expect(r.all.gpm).toBe(0);
    expect(r.costCodes).toEqual([]);
    expect(r.flagged).toEqual([]);
  });

  it('computeBid() with no argument does not throw', () => {
    expect(() => computeBid()).not.toThrow();
    expect(computeBid().base.sell).toBe(0);
  });

  it('defaults are the company seed values', () => {
    expect(DEFAULT_JOB).toMatchObject({
      laborRate: 42, markupPct: 20, taxPct: 8.25, crewSize: 4,
      suppliesPct: 0.5, materialContingencyPct: 1.25, laborContingencyPct: 2.5,
      shopDrawingsPct: 0.7, cleaningHoursPerDay: 0.5, caulkPricePerLF: 1.9,
    });
  });

  it('garbage in a cost field is 0, not NaN', () => {
    const s = computeScopeCost(scopeWith({
      materials: [{ group: '02-METL', cost: 'not a number' }],
    }), JOB);
    expect(Number.isFinite(s.cost)).toBe(true);
    expect(s.material.lineTotal).toBe(0);
  });

  it('the result is a fresh object — computing twice gives the same numbers', () => {
    const a = computeBid({ job: JOB, scopes: [scopeWith()] });
    const b = computeBid({ job: JOB, scopes: [scopeWith()] });
    expect(a.base).toEqual(b.base);
    expect(a.costCodes).toEqual(b.costCodes);
  });
});
