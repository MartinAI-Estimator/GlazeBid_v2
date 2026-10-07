/**
 * bidRecapExport.js — CSV exports off a `computeBid()` result.
 *
 * Replaces `components/BidSheet/CostCodeExport.js`, which priced every cost
 * code with `laborCost: 0` and filtered out any row whose base cost was zero.
 * The result was a "cost code report" with no labor in it that could never
 * reconcile to the bid total. These exports are built from the engine's own
 * rollups, so they add up by construction.
 */

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '0.00');
const rows = (lines) => lines.map((r) => r.map(esc).join(',')).join('\r\n');

/**
 * The ValorX "Estimated Values" block: one row per cost code, cost / tax /
 * markup / total, then a grand total that matches the bid.
 */
export function costCodeCSV(result, projectName = 'Bid') {
  const out = [
    [`Cost Code Summary — ${projectName}`],
    [`Markup ${result.job.markupPct}%`, `Tax ${result.job.taxPct}%`,
      `Labor $${result.job.laborRate}/hr`],
    [],
    ['Cost Code', 'Description', 'Cost', 'Tax', 'Markup', 'Total'],
  ];
  for (const c of result.costCodes) {
    out.push([c.code, c.label, n2(c.cost), n2(c.tax), n2(c.markup), n2(c.sell)]);
  }
  const t = result.costCodes.reduce(
    (a, c) => ({ cost: a.cost + c.cost, tax: a.tax + c.tax, markup: a.markup + c.markup, sell: a.sell + c.sell }),
    { cost: 0, tax: 0, markup: 0, sell: 0 },
  );
  out.push([]);
  out.push(['', 'TOTAL (base + alternates)', n2(t.cost), n2(t.tax), n2(t.markup), n2(t.sell)]);
  out.push(['', 'Base bid', n2(result.base.cost), n2(result.base.tax),
    n2(result.base.markup), n2(result.base.sell)]);
  out.push(['', 'GPM', `${(result.base.gpm * 100).toFixed(4)}%`]);
  return rows(out);
}

/** One row per scope — breakout x alternate — the way the sheet lists them. */
export function scopeCSV(result, projectName = 'Bid') {
  const out = [
    [`Scope Summary — ${projectName}`],
    [],
    ['Breakout', 'Alternate', 'System', 'SF', 'Man-Hours', 'Labor Cost',
      'Material Cost', 'Cost', 'Tax', 'Markup', 'Sell', 'GPM %', '$/SF'],
  ];
  for (const s of result.scopes) {
    out.push([
      s.breakout, s.alternate || 'Base', s.systemType || '',
      s.areaSqFt ? n2(s.areaSqFt) : '', n2(s.labor.totalMH), n2(s.labor.cost),
      n2(s.material.cost), n2(s.cost), n2(s.tax), n2(s.markup), n2(s.sell),
      (s.gpm * 100).toFixed(2), s.sellPerSqFt ? n2(s.sellPerSqFt) : '',
    ]);
  }
  out.push([]);
  out.push(['BASE BID', '', '', n2(result.totalSqFt), '', '', '',
    n2(result.base.cost), n2(result.base.tax), n2(result.base.markup),
    n2(result.base.sell), (result.base.gpm * 100).toFixed(4), '']);
  for (const a of result.alternates) {
    out.push([a.alternate, a.scopes.join(' / '), '', '', '', '', '',
      n2(a.cost), n2(a.tax), n2(a.markup), n2(a.sell), (a.gpm * 100).toFixed(2), '']);
  }
  return rows(out);
}

/** Lines still waiting on a vendor price — the RFQ chase list. */
export function unpricedCSV(result, projectName = 'Bid') {
  const out = [
    [`Unpriced Lines — ${projectName}`],
    [],
    ['Breakout', 'Alternate', 'Cost Code', 'Description', 'Source', 'Note'],
  ];
  for (const f of result.flagged) {
    out.push([f.breakout, f.alternate || 'Base', f.group, f.description, f.source, f.note || '']);
  }
  return rows(out);
}

/** Hand a CSV to the browser as a download. No-ops outside a browser. */
export function downloadCSV(text, filename) {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return false;
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export const safeName = (s) => String(s || 'bid').replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
