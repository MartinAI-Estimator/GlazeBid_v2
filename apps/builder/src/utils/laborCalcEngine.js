/**
 * laborCalcEngine.js — Man-Hour Calculation Engine
 *
 * Replicates the Bid Sheet Excel's labor formulas for ALL system types:
 *
 * STOREFRONT (Ext SF, Int SF) — tabs "Ext SF 1" / "Int SF":
 *   Hourly Functions: Bays, >Bays (Assemble/Clips/Set), DLOs, >DLOs (Prep/Set), Doors (Dist/Install)
 *   Item Rates: Joints, Dist, Subsills, Caulk(÷20), SSG, Steel, Vents, Brake, Open
 *   Shop  = jointsMH + bays*assemble + gtBays*assemble + dlos*prep + gtDlos*prep
 *   Dist  = distMH + doors*distribution
 *   Field = subsills + bays*(clips+set) + gtBays*(clips+set) + dlos*set + gtDlos*set
 *           + doors*install + caulk + ssg + steel + vents + brake + open
 *
 * CURTAIN WALL (Cap CW, SSG CW) — tabs "Cap CW" / "SSG CW":
 *   Hourly Functions: Verticals, Horizontals (Assemble/Install), DLOs, >DLOs (Prep/Set), Doors (Dist/Install)
 *   Item Rates: Joints, Dist, Stool Trim, F/T, Caulk(÷12), SSG, Steel, Vents, Brake, WL/DL
 *   Shop  = jointsMH + verts*assemble + horiz*assemble + (dloPrep/2)*dlos + (gtDloPrep/2)*gtDlos
 *   Dist  = distMH + doors*distribution
 *   Field = stoolTrim + verts*install + horiz*install + ft + (dloPrep/2)*dlos + (gtDloPrep/2)*gtDlos
 *           + dlos*set + gtDlos*set + doors*install + caulk + ssg + steel + vents + brake + wlDl
 */

import { getSystemCategory } from './systemTypeConfig.js';

// ─── Storefront formula ─────────────────────────────────────────────────────

function calcFrameMH_SF(frame, hf, ir, beadsOfCaulk) {
  const qty       = frame.quantity || 1;
  // bays: use explicit frame.bays; if absent derive from panels÷rows (PartnerPak: panels=bays×rows)
  const baysPerUnit = frame.bays || Math.round((frame.panels || 0) / (frame.rows || 1));
  const bays      = baysPerUnit * qty;
  const gtBays    = (frame.gtBays || 0) * qty;
  // dlos: prefer frame.panels (per-frame glass count). PartnerPak 'Number of Openings' is
  // pre-multiplied by quantity so MUST NOT be used here. Fall back to frame.dlos for legacy/test data.
  const dlosPerUnit = (frame.panels > 0) ? frame.panels : (frame.dlos || 0);
  const dlos      = dlosPerUnit * qty;
  const gtDlos    = (frame.gtDlos || 0) * qty;
  const doors     = (frame.doors || 0) * qty;
  const pairs     = (frame.pairs || 0) * qty;   // raw pair count (each pair = 2 door leaves)
  const singles   = (frame.singles || 0) * qty;
  const doorTotal = doors + (pairs * 2) + singles; // Excel: AB4 = AB11*2

  const joints    = (frame.joints || 0);
  const subsills  = qty + (frame.addSubsills || 0) * qty;
  const caulkLF   = (frame.perimeter || 0) * beadsOfCaulk;
  const ssg       = (frame.ssg || 0) * qty;
  const steel     = (frame.steel || 0) * qty;
  const vents     = (frame.vents || 0) * qty;
  const brakeMetal = (frame.brakeMetal || frame.brake || 0) * qty;
  const openItem  = (frame.open || 0) * qty;

  const distCount = bays + gtBays + dlos + gtDlos + vents + subsills;

  const jointsMH     = joints    * (ir.joints || 0);
  const distMH       = distCount * (ir.dist || 0);
  const subsillsMH   = subsills  * (ir.subsills || 0);
  const baysMH       = bays      * ((hf.assemble?.bays || 0) + (hf.clips?.bays || 0) + (hf.set?.bays || 0));
  const gtBaysMH     = gtBays    * ((hf.assemble?.gtBays || 0) + (hf.clips?.gtBays || 0) + (hf.set?.gtBays || 0));
  const dlosMH       = dlos      * ((hf.prep?.dlos || 0) + (hf.set?.dlos || 0));
  const gtDlosMH     = gtDlos    * ((hf.prep?.gtDlos || 0) + (hf.set?.gtDlos || 0));
  const doorsMH      = doorTotal * ((hf.distribution?.doors || 0) + (hf.install?.doors || 0));
  const caulkMH      = (caulkLF / 20) * (ir.caulk || 0);
  const ssgMH        = ssg       * (ir.ssg || 0);
  const steelMH      = steel     * (ir.steel || 0);
  const ventsMH      = vents     * (ir.vents || 0);
  const brakeMH      = brakeMetal * (ir.brakeMetal || 0);
  const openMH       = openItem  * (ir.open || 0);

  const totalMH = jointsMH + distMH + subsillsMH + baysMH + gtBaysMH
                + dlosMH + gtDlosMH + doorsMH + caulkMH + ssgMH
                + steelMH + ventsMH + brakeMH + openMH;

  const shopMH = jointsMH
               + bays   * (hf.assemble?.bays || 0)
               + gtBays * (hf.assemble?.gtBays || 0)
               + dlos   * (hf.prep?.dlos || 0)
               + gtDlos * (hf.prep?.gtDlos || 0);

  const distributionMH = distMH + doorTotal * (hf.distribution?.doors || 0);
  const fieldMH = totalMH - shopMH - distributionMH;

  return {
    jointsMH: round(jointsMH), distMH: round(distMH), subsillsMH: round(subsillsMH),
    baysMH: round(baysMH), gtBaysMH: round(gtBaysMH),
    dlosMH: round(dlosMH), gtDlosMH: round(gtDlosMH), doorsMH: round(doorsMH),
    caulkMH: round(caulkMH), ssgMH: round(ssgMH), steelMH: round(steelMH),
    ventsMH: round(ventsMH), brakeMH: round(brakeMH), openMH: round(openMH),
    totalMH: round(totalMH), shopMH: round(shopMH),
    distributionMH: round(distributionMH), fieldMH: round(fieldMH),
    counts: { joints, distCount, subsills, bays, gtBays, dlos, gtDlos, doorTotal,
              caulkLF: round(caulkLF), ssg, steel, vents, brakeMetal, openItem },
  };
}

// ─── Curtain Wall formula ───────────────────────────────────────────────────

function calcFrameMH_CW(frame, hf, ir, beadsOfCaulk) {
  const qty        = frame.quantity || 1;
  const verticals  = (frame.bays || frame.verticals || 0) * qty;
  const horizontals = (frame.rows || frame.horizontals || 0) * qty;
  // dlos: prefer frame.panels (per-frame glass count). Fall back to frame.dlos for legacy/test data.
  const dlosPerUnit = (frame.panels > 0) ? frame.panels : (frame.dlos || 0);
  const dlos       = dlosPerUnit * qty;
  const gtDlos     = (frame.gtDlos || 0) * qty;
  const doors      = (frame.doors || 0) * qty;
  const pairs      = (frame.pairs || 0) * qty;   // raw pair count (each pair = 2 door leaves)
  const singles    = (frame.singles || 0) * qty;
  const doorTotal  = doors + (pairs * 2) + singles; // Excel: AC4 = AC11*2

  const joints     = (frame.joints || 0);
  const stoolTrim  = (frame.stool_trim || frame.stoolTrim || 0) * qty;
  const ft         = (frame.ft || 0) * qty;
  const caulkLF    = (frame.perimeter || 0) * beadsOfCaulk;
  const ssg        = (frame.ssg || 0) * qty;
  const steel      = (frame.steel || 0) * qty;
  const vents      = (frame.vents || 0) * qty;
  const brakeMetal = (frame.brakeMetal || frame.brake || 0) * qty;
  const wlDl       = (frame.wl_dl || frame.wlDl || 0) * qty;

  const distCount  = verticals + horizontals + dlos + gtDlos + vents + stoolTrim;

  // Per-category MHs
  const jointsMH     = joints     * (ir.joints || 0);
  const distMH       = distCount  * (ir.dist || 0);
  const stoolTrimMH  = stoolTrim  * (ir.stoolTrim || 0);
  const ftMH         = ft         * (ir.ft || 0);

  const vertsMH  = verticals   * ((hf.assemble?.verticals || 0) + (hf.install?.verticals || 0));
  const horizMH  = horizontals * ((hf.assemble?.horizontals || 0) + (hf.install?.horizontals || 0));

  const dloPrep   = hf.prep?.dlos || 0;
  const gtDloPrep = hf.prep?.gtDlos || 0;
  const dlosMH    = dlos   * (dloPrep + (hf.set?.dlos || 0));
  const gtDlosMH  = gtDlos * (gtDloPrep + (hf.set?.gtDlos || 0));

  const doorsMH   = doorTotal * ((hf.distribution?.doors || 0) + (hf.install?.doors || 0));

  const caulkMH   = (caulkLF / 12) * (ir.caulk || 0);  // CW: ÷12 (12-ft sticks)
  const ssgMH     = ssg       * (ir.ssg || 0);
  const steelMH   = steel     * (ir.steel || 0);
  const ventsMH   = vents     * (ir.vents || 0);
  const brakeMH   = brakeMetal * (ir.brakeMetal || 0);
  const wlDlMH    = wlDl      * (ir.wlDl || 0);

  const totalMH = jointsMH + distMH + stoolTrimMH + ftMH + vertsMH + horizMH
                + dlosMH + gtDlosMH + doorsMH + caulkMH + ssgMH
                + steelMH + ventsMH + brakeMH + wlDlMH;

  // Shop: joints + verts*assemble + horiz*assemble + (dloPrep/2)*dlos + (gtDloPrep/2)*gtDlos
  const shopMH = jointsMH
               + verticals   * (hf.assemble?.verticals || 0)
               + horizontals * (hf.assemble?.horizontals || 0)
               + (dloPrep / 2)   * dlos
               + (gtDloPrep / 2) * gtDlos;

  // Dist: same as SF
  const distributionMH = distMH + doorTotal * (hf.distribution?.doors || 0);

  // Field: everything else
  const fieldMH = totalMH - shopMH - distributionMH;

  return {
    jointsMH: round(jointsMH), distMH: round(distMH),
    stoolTrimMH: round(stoolTrimMH), ftMH: round(ftMH),
    vertsMH: round(vertsMH), horizMH: round(horizMH),
    dlosMH: round(dlosMH), gtDlosMH: round(gtDlosMH), doorsMH: round(doorsMH),
    caulkMH: round(caulkMH), ssgMH: round(ssgMH), steelMH: round(steelMH),
    ventsMH: round(ventsMH), brakeMH: round(brakeMH), wlDlMH: round(wlDlMH),
    totalMH: round(totalMH), shopMH: round(shopMH),
    distributionMH: round(distributionMH), fieldMH: round(fieldMH),
    counts: { joints, distCount, stoolTrim, ft, verticals, horizontals, dlos, gtDlos,
              doorTotal, caulkLF: round(caulkLF), ssg, steel, vents, brakeMetal, wlDl },
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Calculate MH breakdown for a single frame.
 * Dispatches to the correct formula based on system type category.
 *
 * @param {object} frame        - Frame data object
 * @param {object} hf           - Hourly function rates
 * @param {object} ir           - Item rates
 * @param {number} beadsOfCaulk - Caulk perimeter multiplier
 * @param {string} systemType   - System type name (e.g. 'Ext SF', 'Cap CW')
 */
export function calcFrameMH(frame, hf, ir, beadsOfCaulk = 0, systemType = 'Ext SF') {
  const category = getSystemCategory(systemType);
  if (category === 'curtainwall') {
    return calcFrameMH_CW(frame, hf, ir, beadsOfCaulk);
  }
  return calcFrameMH_SF(frame, hf, ir, beadsOfCaulk);
}

/**
 * Calculate MH totals for an entire system (array of frames).
 */
export function calcSystemMH(frames, hf, ir, beadsOfCaulk = 0, systemType = 'Ext SF') {
  const frameResults = (frames || []).map(f => calcFrameMH(f, hf, ir, beadsOfCaulk, systemType));

  const shopMH         = frameResults.reduce((s, r) => s + r.shopMH, 0);
  const distributionMH = frameResults.reduce((s, r) => s + r.distributionMH, 0);
  const fieldMH        = frameResults.reduce((s, r) => s + r.fieldMH, 0);
  const totalMH        = frameResults.reduce((s, r) => s + r.totalMH, 0);

  return {
    frameResults,
    shopMH:         round(shopMH),
    distributionMH: round(distributionMH),
    fieldMH:        round(fieldMH),
    totalMH:        round(totalMH),
  };
}

/**
 * Calculate cost from MH using labor rate.
 */
export function mhToCost(mh, laborRate) {
  return round((mh || 0) * (laborRate || 0));
}

/**
 * Aggregate counts and individual MH values from an array of frame results.
 * Returns { counts: {...}, mhs: {...} }
 */
export function aggregateFrameResults(frameResults) {
  const counts = {};
  const mhs = {};
  for (const fr of (frameResults || [])) {
    if (fr.counts) {
      for (const [k, v] of Object.entries(fr.counts)) {
        counts[k] = (counts[k] || 0) + (v || 0);
      }
    }
    for (const [k, v] of Object.entries(fr)) {
      if (k.endsWith('MH') && typeof v === 'number') {
        mhs[k] = (mhs[k] || 0) + v;
      }
    }
  }
  return { counts, mhs };
}

function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
