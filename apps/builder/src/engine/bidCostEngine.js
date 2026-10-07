/**
 * bidCostEngine.js — the money waterfall for a GlazeBid bid.
 *
 * Pure. No imports, no stores, no React. Takes a plain `{ job, scopes }` bid
 * object and returns every number the recap screens and the cost-code export
 * need. Nothing in the app calls this yet (interview decision #12: engine and
 * tests first, nothing wired).
 *
 * Decisions this implements, with the interview answer each comes from — see
 * `GlazeBid_BidBuilder_Interview_2026-10-06.md`:
 *
 *   #1  one module shaped like glazeq's computeGroup(), fed by frame-engine counts
 *   #2  pricing precedence: real quote -> quote <= 6 months old -> budget rate -> flagged
 *   #4  nine cost groups
 *   #5  one project markup %, per-scope override; GPM is an output
 *   #6  tax on materials AND equipment rental; labor never taxed
 *   #7  shop drawings per scope line; bonds and travel at project level
 *   #13 one blended labor $/hr for shop, distribution and field
 *   #14 equipment gets full material treatment
 *   #15 supplies and material contingency per scope
 *   #16 bonds = % of final sell, with a typed-dollar override
 *   #17 supplies basis = material + equipment, before tax
 *   #18 material contingency uses the SAME basis as supplies — it does NOT compound
 *   #19 shop drawings = (project cost / the job's MH rate) * 0.7%, allocated
 *   #20 cleaning days = ceil(fieldMH / (crew * 8)), overridable
 *
 * THE MONEY SHAPE, exactly as the ValorX sheet reports it:
 *
 *     cost   = labor cost + material cost      <- PRE-TAX
 *     tax    = taxable material x tax%          <- labor is never taxed
 *     markup = cost x markup%                   <- on cost, NOT on cost + tax
 *     sell   = cost + tax + markup
 *     GPM    = markup / sell                    <- tax is IN sell but NOT in profit,
 *                                                  so GPM != markup/(1+markup)
 *
 * Verified line by line against the Alpine Buick GMC ValorX sheet — see
 * `GlazeBid_BidSheet_Decode_AlpineBuick_2026-10-06.md` and
 * `__tests__/engine/bidCostEngine.alpine.test.js`.
 */

// ── cost groups (interview #4, codes from the ValorX export) ────────────────

/**
 * kind drives the waterfall:
 *   'material'  counts toward the supplies / contingency basis, and is taxed
 *   'service'   taxed, but NOT in the supplies basis (engineering, water tests,
 *               window film, freight — real cost, not glass and metal)
 *   'computed'  produced by the engine itself (supplies, contingency); taxed,
 *               never in the basis (that would be circular)
 *   'labor'     never taxed
 */
export const COST_GROUPS = Object.freeze({
  '02-METL': { label: 'Metal', kind: 'material' },
  '02-GLSS': { label: 'Glass', kind: 'material' },
  '02-DOOR': { label: 'Doors', kind: 'material' },
  '02-HDWR': { label: 'Hardware', kind: 'material' },
  '02-CAUL': { label: 'Caulking', kind: 'material' },
  '02-MIRR': { label: 'Mirrors', kind: 'material' },
  '03-EQUP': { label: 'Equipment', kind: 'material' },
  '05-SUPP': { label: 'Supplies', kind: 'computed' },
  '06-SHOP': { label: 'Shop Drawings / Bonds', kind: 'service' },
  '07-TRAV': { label: 'Travel / Per Diem', kind: 'service' },
  '08-CONT': { label: 'Contingency', kind: 'service' },
  '01-GLAZ': { label: 'Glazing Labor', kind: 'labor' },
});

export const MATERIAL_GROUPS = Object.freeze(
  Object.keys(COST_GROUPS).filter((c) => COST_GROUPS[c].kind === 'material'),
);

/** Group a material line falls in when it names none. */
export const DEFAULT_GROUP = '02-METL';

// ── company defaults (interview "seed constants") ───────────────────────────

export const DEFAULT_JOB = Object.freeze({
  laborRate: 42,                 // #13 one blended $/hr
  markupPct: 20,                 // #5  project markup, labor and material alike
  taxPct: 8.25,                  // #6  materials + equipment only
  crewSize: 4,                   // #20 men on the daily-cleaning crew
  suppliesPct: 0.5,              // #17 of material + equipment, pre-tax
  materialContingencyPct: 1.25,  // #18 same basis as supplies, not compounded
  laborContingencyPct: 2.5,      // of scope MH
  shopDrawingsPct: 0.7,          // #19 of project cost, at the job's MH rate
  shopDrawingsCostCode: '01-GLAZ', // the sheet exports shop HOURS as glazing labor
  cleaningHoursPerDay: 0.5,      // #20 the production sheet's rate, not glazeq's 1.0
  caulkPricePerLF: 1.9,
  bondPct: 0,                    // #16 1.5 when a P&P bond is required
  bondCostOverride: null,
  transportPerPuDo: 310,
  /** Date the bid is priced as of — the anchor for the 6-month quote window (#2). */
  asOf: null,
  quoteHistoryMonths: 6,
  /** [{ key, vendor, date, unit, unitPrice, job, enteredBy }] */
  quoteHistory: [],
  /** { [key]: unitPrice } — budget fallback, flagged. NOT a maintained price book. */
  budgetRates: {},
  /** Project-level typed adders: [{ label, group, cost, taxable }] (#7). */
  projectAdders: [],
});

// ── small helpers ──────────────────────────────────────────────────────────

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const pct = (v) => num(v) / 100;
export const round2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

function monthsBetween(fromISO, toISO) {
  const a = new Date(fromISO);
  const b = new Date(toISO);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Infinity;
  return (b - a) / (1000 * 60 * 60 * 24 * 30.4375);
}

/** Fill a partial job with the company defaults. */
export function jobOf(partial) {
  return { ...DEFAULT_JOB, ...(partial || {}) };
}

// ── pricing precedence (interview #2) ──────────────────────────────────────

export const PRICE_SOURCES = Object.freeze({
  QUOTE: 'quote',        // a real vendor quote entered against the RFQ
  HISTORY: 'history',    // same die / makeup, quoted within the window
  BUDGET: 'budget',      // company budget rate, flagged
  NONE: 'none',          // nothing to price it with — flagged, counts as $0
});

/**
 * Freshest usable history row for `key`, or null. A row older than
 * `quoteHistoryMonths` never prices a bid (#2: a stale price from a changed
 * market must not leak into a live bid).
 */
export function findHistoryPrice(key, job) {
  const j = jobOf(job);
  const asOf = j.asOf || new Date().toISOString().slice(0, 10);
  const rows = (j.quoteHistory || [])
    .filter((r) => r && r.key === key && Number.isFinite(num(r.unitPrice)))
    .map((r) => ({ ...r, ageMonths: monthsBetween(r.date, asOf) }))
    .filter((r) => r.ageMonths >= 0 && r.ageMonths <= j.quoteHistoryMonths)
    .sort((a, b) => a.ageMonths - b.ageMonths);
  return rows[0] || null;
}

/** Cost of one equipment line off the rental table (#14). */
export function equipmentCost(line, job) {
  const j = jobOf(job);
  const e = line.equipment || {};
  const weeks = num(e.weeks);
  const months = num(e.months);
  let c = weeks * num(e.weekRate) + months * num(e.monthRate)
    + num(e.puDo) * num(j.transportPerPuDo);
  if (e.glazierPkg) {
    c += weeks * num(e.glazierPkgWeekRate) + months * num(e.glazierPkgMonthRate);
  }
  return c;
}

/**
 * Resolve one material line to a cost.
 *
 * Returns `{ cost, source, unitPrice, qty, vendor, date, ageMonths, flagged, note }`.
 * `cost` may be negative — an alternate deduct is a first-class line.
 */
export function resolveLinePrice(line, job) {
  const j = jobOf(job);
  const qty = line.qty == null ? 1 : num(line.qty);

  // auto-priced lines first: they have no quote of their own
  if (line.auto === 'caulking') {
    const perLF = line.pricePerLF == null ? j.caulkPricePerLF : num(line.pricePerLF);
    return {
      cost: num(line.caulkLF) * perLF, source: PRICE_SOURCES.QUOTE, unitPrice: perLF,
      qty: num(line.caulkLF), flagged: false, note: 'auto: caulk LF x $/LF',
    };
  }
  if (line.auto === 'equipment') {
    return {
      cost: equipmentCost(line, j), source: PRICE_SOURCES.QUOTE, unitPrice: null,
      qty, flagged: false, note: 'auto: rental table',
    };
  }

  // a typed cost IS the quote — this is what the estimator entered off the RFQ (#8)
  if (line.cost != null && line.cost !== '') {
    const base = num(line.cost);
    return {
      cost: base * (1 + pct(line.vendorMarkupPct)), source: PRICE_SOURCES.QUOTE,
      unitPrice: null, qty, vendor: line.vendor || null, date: line.quoteDate || null,
      flagged: false,
      note: line.vendorMarkupPct ? `vendor markup ${num(line.vendorMarkupPct)}%` : null,
    };
  }
  if (line.unitPrice != null && line.unitPrice !== '') {
    const up = num(line.unitPrice);
    return {
      cost: up * qty, source: PRICE_SOURCES.QUOTE, unitPrice: up, qty,
      vendor: line.vendor || null, date: line.quoteDate || null, flagged: false,
    };
  }

  // no quote yet: history within the window, then the budget rate
  if (line.quoteKey) {
    const hit = findHistoryPrice(line.quoteKey, j);
    if (hit) {
      return {
        cost: num(hit.unitPrice) * qty, source: PRICE_SOURCES.HISTORY,
        unitPrice: num(hit.unitPrice), qty, vendor: hit.vendor || null,
        date: hit.date || null, ageMonths: round2(hit.ageMonths), flagged: false,
        note: `history ${hit.vendor || 'vendor'} ${hit.date} (${round2(hit.ageMonths)} mo)`,
      };
    }
    const budget = j.budgetRates ? j.budgetRates[line.quoteKey] : undefined;
    if (budget != null) {
      return {
        cost: num(budget) * qty, source: PRICE_SOURCES.BUDGET, unitPrice: num(budget),
        qty, flagged: true, note: 'budget — awaiting quote',
      };
    }
  }
  return {
    cost: 0, source: PRICE_SOURCES.NONE, unitPrice: null, qty, flagged: true,
    note: 'unpriced — no quote, no history, no budget rate',
  };
}

// ── labor (interview #13, #20) ──────────────────────────────────────────────

/**
 * Scope labor: frame-engine man-hours, the lift multiplier on field hours, the
 * real misc-labor work lines, then the auto lines the production sheet carries
 * as HOUR lines — daily cleaning, labor contingency and (in pass 2) the
 * allocated shop drawings.
 *
 * @param {object} scope
 * @param {object} job
 * @param {{shopDrawingsCost?: number}} [extra] pass-2 allocation, see computeBid
 */
export function computeScopeLabor(scope, job, extra = {}) {
  const j = jobOf(job);
  const src = scope.labor || {};
  const lift = scope.liftMultiplier == null ? 1 : num(scope.liftMultiplier);
  const rate = num(j.laborRate);

  const shopMH = num(src.shopMH);
  const distMH = num(src.distMH);
  const fieldMH = num(src.fieldMH) * lift;
  const caulkLF = num(src.caulkLF);

  // real work typed as misc labor: AG glass, butt joints, doors, demo, louvers...
  const miscLines = (scope.miscLabor || []).map((m) => ({
    key: m.key || null,
    label: m.label || 'Misc Labor',
    qty: num(m.qty),
    hoursEach: num(m.hoursEach),
    hours: num(m.qty) * num(m.hoursEach),
    auto: false,
  }));
  const miscMH = miscLines.reduce((s, m) => s + m.hours, 0);

  const frameMH = shopMH + distMH + fieldMH;
  const baseMH = frameMH + miscMH;

  const autoLines = [];
  if (baseMH > 0) {
    // #20 days = ceil(fieldMH / (crew * 8)), overridable; hours/day from the sheet
    const crew = Math.max(1, num(scope.crewSizeOverride) || num(j.crewSize) || 4);
    const computedDays = Math.ceil(fieldMH / (crew * 8));
    const days = scope.cleaningDaysOverride == null
      ? computedDays
      : num(scope.cleaningDaysOverride);
    const hrsPerDay = scope.cleaningHoursPerDayOverride == null
      ? num(j.cleaningHoursPerDay)
      : num(scope.cleaningHoursPerDayOverride);
    if (days > 0 && hrsPerDay > 0) {
      autoLines.push({
        key: 'clean', label: 'Daily Cleaning', qty: days, hoursEach: hrsPerDay,
        hours: days * hrsPerDay, auto: true,
        computedQty: computedDays, overridden: scope.cleaningDaysOverride != null,
      });
    }
    // labor contingency rides on the real hours, never on the auto lines
    const contQty = scope.laborContingencyHoursOverride == null
      ? baseMH
      : num(scope.laborContingencyHoursOverride);
    const contRate = pct(scope.laborContingencyPctOverride == null
      ? j.laborContingencyPct
      : scope.laborContingencyPctOverride);
    if (contQty > 0 && contRate > 0) {
      autoLines.push({
        key: 'cont', label: 'Labor Contingency', qty: contQty, hoursEach: contRate,
        hours: contQty * contRate, auto: true,
        computedQty: baseMH, overridden: scope.laborContingencyHoursOverride != null,
      });
    }
  }

  // #19 shop drawings arrive from pass 2 already in dollars (the allocation is
  // pro-rata on cost); carry them as hours so they inherit rate and markup.
  const shopCost = num(extra.shopDrawingsCost);
  if (shopCost !== 0 && rate > 0) {
    autoLines.push({
      key: 'shops', label: 'Shop Drawings', qty: null, hoursEach: null,
      hours: shopCost / rate, auto: true, costCode: j.shopDrawingsCostCode,
    });
  }

  const autoMH = autoLines.reduce((s, m) => s + m.hours, 0);
  const totalMH = baseMH + autoMH;

  return {
    shopMH, distMH, fieldMH, caulkLF,
    frameMH, miscMH, baseMH, autoMH, totalMH,
    rate, liftMultiplier: lift,
    miscLabor: [...miscLines, ...autoLines],
    shopDrawingsCost: shopCost,
    cost: totalMH * rate,
  };
}

// ── material (interview #6, #14, #17, #18) ─────────────────────────────────

/**
 * Scope material: priced lines, then supplies and contingency on the SAME
 * basis (#18), then tax on everything material-side (#6).
 *
 * `inBasis` defaults by cost-group kind: 'material' yes, everything else no.
 * A line may opt in with `inBasis: true` — e.g. if freight should count toward
 * supplies. Alpine's freight rides as an 08-Contingency line and does not.
 *
 * Returns `cost` PRE-TAX; `tax` is reported separately (see the money shape).
 */
export function computeScopeMaterial(scope, job) {
  const j = jobOf(job);
  const caulkLF = num((scope.labor || {}).caulkLF);

  const lines = (scope.materials || []).map((m) => {
    const group = COST_GROUPS[m.group] ? m.group : DEFAULT_GROUP;
    const line = m.auto === 'caulking' && m.caulkLF == null ? { ...m, caulkLF } : m;
    const priced = resolveLinePrice(line, j);
    const kind = COST_GROUPS[group].kind;
    return {
      group,
      groupLabel: COST_GROUPS[group].label,
      kind,
      description: m.description || COST_GROUPS[group].label,
      notes: m.notes || priced.note || null,
      cost: priced.cost,
      inBasis: m.inBasis == null ? kind === 'material' : !!m.inBasis,
      taxable: m.taxable == null ? kind !== 'labor' : !!m.taxable,
      pricing: {
        source: priced.source, unitPrice: priced.unitPrice, qty: priced.qty,
        vendor: priced.vendor || null, date: priced.date || null,
        ageMonths: priced.ageMonths == null ? null : priced.ageMonths,
        flagged: priced.flagged,
      },
    };
  });

  const basis = lines.reduce((s, l) => (l.inBasis ? s + l.cost : s), 0);
  const typedTaxable = lines.reduce((s, l) => (l.taxable ? s + l.cost : s), 0);
  const lineTotal = lines.reduce((s, l) => s + l.cost, 0);

  const suppliesRate = pct(scope.suppliesPctOverride == null
    ? j.suppliesPct
    : scope.suppliesPctOverride);
  const contRate = pct(scope.materialContingencyPctOverride == null
    ? j.materialContingencyPct
    : scope.materialContingencyPctOverride);

  // #17 / #18 — the basis is material + equipment pre-tax, and BOTH percentages
  // hit that same number. The production sheet does not compound; glazeq does.
  const suppliesBasis = scope.suppliesBasisOverride == null
    ? basis
    : num(scope.suppliesBasisOverride);
  const supplies = suppliesBasis * suppliesRate;
  const contingency = suppliesBasis * contRate;

  const cost = lineTotal + supplies + contingency;
  const taxableBase = typedTaxable + supplies + contingency;
  const tax = taxableBase * pct(j.taxPct);

  return {
    lines,
    basis, suppliesBasis, lineTotal,
    supplies, suppliesRate,
    contingency, contingencyRate: contRate,
    cost, tax, taxableBase,
    flaggedLines: lines.filter((l) => l.pricing.flagged).length,
  };
}

// ── one scope ──────────────────────────────────────────────────────────────

/**
 * One scope's cost, tax, markup and sell.
 *
 * `extra.shopDrawingsCost` is the pass-2 allocation; `computeScopeCost` on its
 * own (no extra) is the pass-1 figure the allocation is computed from.
 */
export function computeScopeCost(scope, job, extra = {}) {
  const j = jobOf(job);
  const labor = computeScopeLabor(scope, j, extra);
  const material = computeScopeMaterial(scope, j);

  const markupRate = pct(scope.markupPctOverride == null ? j.markupPct : scope.markupPctOverride);
  const cost = labor.cost + material.cost;      // PRE-TAX
  const tax = material.tax;                     // labor is never taxed
  const markup = cost * markupRate;             // on cost, NOT on cost + tax
  const sell = cost + tax + markup;

  return {
    id: scope.id || null,
    breakout: scope.breakout || scope.name || 'Unassigned',
    alternate: scope.alternate || null,
    systemType: scope.systemType || null,
    areaSqFt: num(scope.areaSqFt) || null,
    markupRate,
    labor: { ...labor, markup: labor.cost * markupRate, sell: labor.cost * (1 + markupRate) },
    material: {
      ...material,
      markup: material.cost * markupRate,
      sell: material.cost + material.tax + material.cost * markupRate,
    },
    cost, tax, markup, sell,
    sellPerSqFt: num(scope.areaSqFt) > 0 ? sell / num(scope.areaSqFt) : null,
    laborCostPerSqFt: num(scope.areaSqFt) > 0 ? labor.cost / num(scope.areaSqFt) : null,
    // frame labor only — the $/SF the ValorX labor tabs report per scope
    frameLaborCostPerSqFt: num(scope.areaSqFt) > 0
      ? (labor.frameMH * labor.rate) / num(scope.areaSqFt)
      : null,
    gpm: sell !== 0 ? markup / sell : 0,
    flaggedLines: material.flaggedLines,
    shopDrawingsCostOverride: scope.shopDrawingsCostOverride == null
      ? null
      : num(scope.shopDrawingsCostOverride),
    // provenance the adapter attached — which workspace system and which
    // parametric frames this scope came from, so a screen can navigate back
    sourceSystemId: scope.sourceSystemId ?? null,
    frameIds: Array.isArray(scope.frameIds) ? scope.frameIds : [],
  };
}

// ── project level, pass 2 ──────────────────────────────────────────────────

/**
 * Shop drawings (#19), Martin's formula verbatim:
 *
 *     hours = (total project cost / the job's MH rate) * 0.007
 *
 * ONE project number, carried as labor HOURS so it inherits the rate and the
 * markup, then allocated to scopes pro-rata by scope cost. Because the divisor
 * IS the job's labor rate, the hours re-multiply by it and the line lands at
 * exactly 0.7% of project cost whatever the rate is set to — so changing the MH
 * rate moves the hours, not the dollars.
 *
 * Computed on project cost BEFORE this line, so it is not circular (the same
 * treatment as the bond).
 *
 * The Alpine Buick GMC sheet divides by 42 on a $40 job, landing its shops
 * lines at 0.667%. That was an estimator slip, not a separate drafting rate —
 * confirmed 2026-10-07 — so there is deliberately no override here to
 * reintroduce it.
 *
 * @param {object[]} pass1 results from computeScopeCost with no shops allocation
 * @returns {{basis:number, hours:number, cost:number, perScope:number[]}}
 */
export function allocateShopDrawings(pass1, job) {
  const j = jobOf(job);
  const laborRate = num(j.laborRate);
  const basis = pass1.reduce((s, r) => s + r.cost, 0);
  const hours = laborRate > 0 ? (basis / laborRate) * pct(j.shopDrawingsPct) : 0;
  const cost = hours * laborRate;

  const perScope = pass1.map((r) => {
    if (r.shopDrawingsCostOverride != null) return r.shopDrawingsCostOverride;
    return basis !== 0 ? cost * (r.cost / basis) : 0;
  });
  return { basis, rate: laborRate, hours, cost, perScope };
}

/** Project-level typed adders — travel, per diem, anything entered once (#7). */
export function computeProjectAdders(job) {
  const j = jobOf(job);
  const markupRate = pct(j.markupPct);
  const lines = (j.projectAdders || []).map((a) => {
    const group = COST_GROUPS[a.group] ? a.group : '07-TRAV';
    const kind = COST_GROUPS[group].kind;
    const cost = a.cost != null ? num(a.cost) : num(a.qty) * num(a.unitCost);
    const taxable = a.taxable == null ? kind !== 'labor' : !!a.taxable;
    const tax = taxable ? cost * pct(j.taxPct) : 0;
    const markup = cost * markupRate;
    return {
      label: a.label || COST_GROUPS[group].label, group,
      groupLabel: COST_GROUPS[group].label,
      cost, tax, taxable, markup, sell: cost + tax + markup,
    };
  });
  return {
    lines,
    cost: lines.reduce((s, l) => s + l.cost, 0),
    tax: lines.reduce((s, l) => s + l.tax, 0),
    markup: lines.reduce((s, l) => s + l.markup, 0),
    sell: lines.reduce((s, l) => s + l.sell, 0),
  };
}

// ── the whole bid ─────────────────────────────────────────────────────────

function rollup(rows) {
  const t = rows.reduce(
    (a, r) => ({
      cost: a.cost + num(r.cost),
      tax: a.tax + num(r.tax),
      markup: a.markup + num(r.markup),
    }),
    { cost: 0, tax: 0, markup: 0 },
  );
  return { ...t, sell: t.cost + t.tax + t.markup };
}

function withGpm(t) {
  // GPM = markup / sell. Tax is IN the sell but NOT in the profit — the
  // production sheet's definition, which is why GPM != markup/(1+markup).
  return { ...t, gpm: t.sell !== 0 ? t.markup / t.sell : 0 };
}

/**
 * Roll the bid up by cost code, the way the ValorX "Estimated Values" block
 * does — this is what an export to the CPQ sheet needs. Shop-drawing HOURS are
 * coded `job.shopDrawingsCostCode` ('01-GLAZ' by default, matching the sheet);
 * only typed dollar lines land in 06-SHOP. Project-level adders (travel, per
 * diem) come in from `job.projectAdders`, so the rollup covers the whole bid.
 */
export function costCodeRollup(scopeResults, job) {
  const j = jobOf(job);
  const taxRate = pct(j.taxPct);
  const out = {};
  const add = (code, cost, tax, markup) => {
    const c = COST_GROUPS[code] ? code : DEFAULT_GROUP;
    const row = out[c] || (out[c] = {
      code: c, label: COST_GROUPS[c].label, cost: 0, tax: 0, markup: 0, sell: 0,
    });
    row.cost += cost; row.tax += tax; row.markup += markup;
    row.sell += cost + tax + markup;
  };

  for (const s of scopeResults) {
    for (const l of s.material.lines) {
      add(l.group, l.cost, l.taxable ? l.cost * taxRate : 0, l.cost * s.markupRate);
    }
    add('05-SUPP', s.material.supplies, s.material.supplies * taxRate,
      s.material.supplies * s.markupRate);
    add('08-CONT', s.material.contingency, s.material.contingency * taxRate,
      s.material.contingency * s.markupRate);
    // labor, split so shop drawings can carry their own code if asked to
    const shops = s.labor.shopDrawingsCost || 0;
    const plainLabor = s.labor.cost - shops;
    add('01-GLAZ', plainLabor, 0, plainLabor * s.markupRate);
    if (shops !== 0) add(j.shopDrawingsCostCode, shops, 0, shops * s.markupRate);
  }
  for (const a of computeProjectAdders(j).lines) add(a.group, a.cost, a.tax, a.markup);
  return Object.values(out).sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Price a whole bid.
 *
 * @param {{ job?: object, scopes?: object[] }} bid
 * @returns `base` (the base bid), `alternates` (one entry per alternate tag,
 *   which may be negative), `all` (base + alternates), per-scope detail, the
 *   shop-drawing allocation, the bond, the cost-code rollup and every flagged
 *   line.
 */
export function computeBid(bid) {
  const job = jobOf(bid && bid.job);
  const scopes = (bid && bid.scopes) || [];

  // pass 1 — every scope, no shop-drawing line yet
  const pass1 = scopes.map((s) => computeScopeCost(s, job));
  const baseIdx = pass1.map((r, i) => (r.alternate ? -1 : i)).filter((i) => i >= 0);

  // pass 2 — shop drawings on the BASE bid's cost, allocated pro-rata (#19).
  // An alternate carries shop drawings only when the estimator typed one.
  const alloc = allocateShopDrawings(baseIdx.map((i) => pass1[i]), job);
  const shopPerScope = new Array(scopes.length).fill(0);
  baseIdx.forEach((i, k) => { shopPerScope[i] = alloc.perScope[k]; });
  pass1.forEach((r, i) => {
    if (r.alternate && r.shopDrawingsCostOverride != null) {
      shopPerScope[i] = r.shopDrawingsCostOverride;
    }
  });

  const results = scopes.map((s, i) =>
    computeScopeCost(s, job, { shopDrawingsCost: shopPerScope[i] }));

  const baseScopes = results.filter((r) => !r.alternate);
  const altScopes = results.filter((r) => r.alternate);
  const adders = computeProjectAdders(job);

  // #16 bonds = % of final sell, computed on sell BEFORE the bond line so it is
  // not circular, with a typed-dollar override. A bond is a pass-through: no
  // markup, no tax.
  const beforeBond = rollup([...baseScopes, adders]);
  const bondCost = job.bondCostOverride != null
    ? num(job.bondCostOverride)
    : beforeBond.sell * pct(job.bondPct);
  const bond = {
    cost: bondCost, tax: 0, markup: 0, sell: bondCost,
    basis: beforeBond.sell, rate: pct(job.bondPct),
    overridden: job.bondCostOverride != null,
  };

  const base = withGpm(rollup([...baseScopes, adders, bond]));

  // alternates: one rollup per tag, negatives included
  const tags = [...new Set(altScopes.map((s) => s.alternate))];
  const alternates = tags.map((tag) => {
    const rows = altScopes.filter((s) => s.alternate === tag);
    return {
      alternate: tag,
      scopes: rows.map((r) => r.breakout),
      ...withGpm(rollup(rows)),
    };
  });

  const all = withGpm(rollup([base, ...alternates]));

  const flagged = [];
  for (const s of results) {
    for (const l of s.material.lines) {
      if (l.pricing.flagged) {
        flagged.push({
          breakout: s.breakout, alternate: s.alternate, group: l.group,
          description: l.description, source: l.pricing.source, cost: l.cost,
          note: l.notes,
        });
      }
    }
  }

  return {
    job,
    scopes: results,
    shopDrawings: {
      pct: job.shopDrawingsPct, rate: alloc.rate, basis: alloc.basis,
      hours: alloc.hours, cost: alloc.cost,
      lines: results
        .filter((r) => r.labor.shopDrawingsCost !== 0)
        .map((r) => ({
          breakout: r.breakout, alternate: r.alternate,
          cost: r.labor.shopDrawingsCost,
          hours: job.laborRate ? r.labor.shopDrawingsCost / num(job.laborRate) : 0,
          overridden: r.shopDrawingsCostOverride != null,
        })),
    },
    projectAdders: adders,
    bond,
    base,
    alternates,
    all,
    costCodes: costCodeRollup(results, job),
    flagged,
    totalSqFt: baseScopes.reduce((s, r) => s + (r.areaSqFt || 0), 0),
  };
}

export default computeBid;
