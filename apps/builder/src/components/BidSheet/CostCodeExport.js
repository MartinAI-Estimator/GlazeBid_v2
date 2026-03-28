/**
 * CostCodeExport.js
 * Generates a cost code breakdown report from BidSummaryDashboard data.
 * Exports to CSV matching Excel SOW rows 97–116 format.
 */

import { COST_CODES } from './SOWMaterialTracker';

const fmt2 = (n) => (typeof n === 'number' ? n : 0).toFixed(2);

/**
 * Build a cost code summary from an array of imported systems.
 * @param {Array}  systems     - importedSystems from BidSummaryDashboard
 * @param {number} markupPct   - markup percentage (e.g. 40)
 * @param {number} taxPct      - tax percentage (e.g. 8.2)
 * @param {boolean} isTaxExempt
 * @returns {Array} rows — one per cost code that has a non-zero value
 */
export function buildCostCodeReport(systems = [], markupPct = 40, taxPct = 8.2, isTaxExempt = false) {
  // Aggregate costs by cost code across all systems
  const totals = {};
  COST_CODES.forEach(cc => { totals[cc.code] = 0; });

  systems.forEach(sys => {
    (sys.materials || []).forEach(line => {
      const cc = line.costCode || line.category || '02-METL';
      // Normalise old flat category names to cost codes
      const normCC = normalizeCostCode(cc);
      if (totals[normCC] !== undefined) {
        totals[normCC] += Number(line.cost) || 0;
      } else {
        totals['02-METL'] += Number(line.cost) || 0;
      }
    });
  });

  // Build report rows
  const rows = COST_CODES.map(cc => {
    const baseCost  = totals[cc.code] || 0;
    const taxAmt    = (!isTaxExempt && cc.group !== 'auto') ? baseCost * (taxPct / 100) : 0;
    const markupAmt = baseCost * (markupPct / 100);
    const total     = baseCost + taxAmt + markupAmt;
    return {
      code:     cc.code,
      label:    cc.label,
      icon:     cc.icon,
      baseCost,
      taxAmt,
      markupAmt,
      total,
      isEmpty:  baseCost === 0,
    };
  }).filter(r => !r.isEmpty);

  // Totals row
  const grandBase   = rows.reduce((s, r) => s + r.baseCost,  0);
  const grandTax    = rows.reduce((s, r) => s + r.taxAmt,    0);
  const grandMarkup = rows.reduce((s, r) => s + r.markupAmt, 0);
  const grandTotal  = rows.reduce((s, r) => s + r.total,     0);

  return {
    rows,
    totals: { baseCost: grandBase, taxAmt: grandTax, markupAmt: grandMarkup, total: grandTotal },
    meta: { markupPct, taxPct, isTaxExempt, generatedAt: new Date().toISOString() },
  };
}

/**
 * Export cost code report as a CSV string.
 * Matches Excel SOW rows 97–116 column format.
 */
export function exportCostCodeCSV(report, projectName = 'GlazeBid Project') {
  const { rows, totals, meta } = report;
  const lines = [];

  // Header block
  lines.push(`"GlazeBid Cost Code Report"`);
  lines.push(`"Project","${projectName}"`);
  lines.push(`"Generated","${new Date(meta.generatedAt).toLocaleString()}"`);
  lines.push(`"Markup","${meta.markupPct}%"`);
  lines.push(`"Tax","${meta.isTaxExempt ? 'Exempt' : meta.taxPct + '%'}"`);
  lines.push('');

  // Column headers
  lines.push('"Cost Code","Description","Base Cost","Tax","Markup","Total"');

  // Data rows
  rows.forEach(r => {
    lines.push([
      `"${r.code}"`,
      `"${r.label}"`,
      `"$${fmt2(r.baseCost)}"`,
      `"$${fmt2(r.taxAmt)}"`,
      `"$${fmt2(r.markupAmt)}"`,
      `"$${fmt2(r.total)}"`,
    ].join(','));
  });

  // Totals row
  lines.push('');
  lines.push([
    '"TOTAL"',
    '""',
    `"$${fmt2(totals.baseCost)}"`,
    `"$${fmt2(totals.taxAmt)}"`,
    `"$${fmt2(totals.markupAmt)}"`,
    `"$${fmt2(totals.total)}"`,
  ].join(','));

  return lines.join('\n');
}

/**
 * Trigger a CSV download in the browser.
 */
export function downloadCostCodeCSV(report, projectName = 'GlazeBid Project') {
  const csv      = exportCostCodeCSV(report, projectName);
  const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url      = URL.createObjectURL(blob);
  const link     = document.createElement('a');
  link.href      = url;
  link.download  = `${projectName.replace(/\s+/g, '_')}_CostCode_Report.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function normalizeCostCode(raw) {
  if (!raw) return '02-METL';
  // Already a valid code
  if (raw.match(/^\d{2}-[A-Z]{3,4}$/)) return raw;
  // Map old flat label names
  const map = {
    'Aluminum (02-Metal)':       '02-METL',
    'Glass':                     '02-GLSS',
    'Doors (Leaves)':            '02-DOOR',
    'Hardware Sets':             '02-HDWR',
    'Caulking & Misc':           '02-CAUL',
    'Equipment':                 '03-EQUP',
    'Subcontractor / Labor':     '07-TRAV',
  };
  return map[raw] || '02-METL';
}
