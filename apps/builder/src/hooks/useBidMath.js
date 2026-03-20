/**
 * useBidMath — Financial Aggregator Hook (Lump-Sum Architecture)
 *
 * Data flow:
 *   useBidStore (saved frames with pre-calculated bom.shopHours / bom.fieldHours)
 *     ↓ aggregate by systemType
 *   laborGroups  (read-only labor breakdown)
 *
 *   vendorQuotes (local editable lump-sum rows — estimator types in vendor quotes)
 *     ↓
 *   summary (labor + materials + tax = hardCost) ÷ (1 - GPM%) = Grand Total
 *     ↓
 *   BidCart.jsx (Executive Dashboard + two tables)
 *
 * Material pricing is ALWAYS a lump-sum vendor quote — never unit-priced.
 * Labor is ALWAYS derived from the ParametricFrameBuilder bom hours × labor rate.
 *
 * GPM tiers (auto mode):
 *   $0–$250k        → 30%
 *   $251k–$1M       → 27%
 *   > $1M           → 25%
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import useBidStore from '../store/useBidStore';
import { useProject } from '../context/ProjectContext';

// ─── Tiered GPM helper ─────────────────────────────────────────────────────────
// Accepts the gpmTiers array from adminSettings.financialDefaults.
// Tiers are sorted ascending by upTo so the first match wins.
// An upTo of null means “no ceiling” (the last bucket).
export function getTieredGPM(hardCost, tiers) {
  if (!tiers || tiers.length === 0) {
    // Fallback to hardcoded defaults if no tiers are configured
    if (hardCost > 1_000_000) return 25;
    if (hardCost >   250_000) return 27;
    return 30;
  }
  const sorted = [...tiers].sort((a, b) =>
    (a.upTo ?? Infinity) - (b.upTo ?? Infinity)
  );
  for (const tier of sorted) {
    if (tier.upTo === null || hardCost <= tier.upTo) return tier.gpm;
  }
  return sorted[sorted.length - 1]?.gpm ?? 25;
}

// ─── Default vendor quote rows ────────────────────────────────────────────────
const DEFAULT_VENDOR_QUOTES = [
  { id: 'alum',     label: 'Aluminum / Metal Package',  vendor: '', amount: 0, isTaxable: true  },
  { id: 'glass',    label: 'Glass Package',              vendor: '', amount: 0, isTaxable: true  },
  { id: 'hardware', label: 'Hardware & Anchors',         vendor: '', amount: 0, isTaxable: true  },
  { id: 'subs',     label: 'Subcontractor / Other',      vendor: '', amount: 0, isTaxable: false },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBidMath() {
  // ── Source data ──────────────────────────────────────────────────────────────
  const frames = useBidStore((s) => s.frames);

  // Pull financial defaults from ProjectContext
  const { adminSettings } = useProject();
  const fin = adminSettings?.financialDefaults ?? {};

  // ── Rehydration: read the pending staging slot once at mount ─────────────────
  // useBidStore.rehydrateBid() places { financials, vendorQuotes } here.
  // The lazy useState initializers below consume it synchronously (one-shot);
  // a useEffect clears the slot so subsequent navigation doesn't re-seed stale data.
  const clearPendingRehydration = useBidStore((s) => s.clearPendingRehydration);

  // ── Financial settings (local editable state, seeded from cloud or ProjectContext)
  const [financials, setFinancialsState] = useState(() => {
    const seed = useBidStore.getState().pendingRehydration?.financials;
    return {
      laborRate:      seed?.laborRate      ?? fin.laborRate      ?? 45,
      contingencyPct: seed?.contingencyPct ?? fin.contingencyPct ?? 10,
      marginPct:      seed?.manualMarginPct ?? fin.markupPct     ?? 30,  // manual GPM override
      gpmMode:        seed?.gpmMode        ?? 'auto',
      taxPct:         seed?.taxPct         ?? fin.taxRate        ?? 7.25,
    };
  });

  const setFinancial = useCallback((key, value) => {
    setFinancialsState((prev) => ({ ...prev, [key]: Number(value) }));
  }, []);

  // ── Vendor / Material Quote rows (lump-sum — no unit pricing) ────────────────
  const [vendorQuotes, setVendorQuotesState] = useState(() => {
    const seed = useBidStore.getState().pendingRehydration?.vendorQuotes;
    return (Array.isArray(seed) && seed.length > 0) ? seed : DEFAULT_VENDOR_QUOTES;
  });

  // Clear the staging slot after this mount has consumed it (runs once)
  useEffect(() => {
    if (useBidStore.getState().pendingRehydration) {
      clearPendingRehydration();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateVendorQuote = useCallback((id, field, value) => {
    setVendorQuotesState((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...q, [field]: field === 'amount' ? Number(value) || 0 : value }
          : q
      )
    );
  }, []);

  const addVendorQuote = useCallback(() => {
    const id = `quote_${Date.now()}`;
    setVendorQuotesState((prev) => [
      ...prev,
      { id, label: 'New Line Item', vendor: '', amount: 0, isTaxable: true },
    ]);
  }, []);

  const removeVendorQuote = useCallback((id) => {
    setVendorQuotesState((prev) => prev.filter((q) => q.id !== id));
  }, []);

  // ── Grouped labor breakdown (read-only — aggregated from frame bom) ──────────
  // shopHours + fieldHours in the bom already include the quantity multiplier
  // (ParametricFrameBuilder multiplies by `quantity` in handleSave).
  const laborGroups = useMemo(() => {
    const map = {};
    for (const f of frames) {
      const key = f.systemType || 'Unspecified';
      if (!map[key]) {
        map[key] = {
          systemType:   key,
          frameCount:   0,
          shopHours:    0,
          fieldHours:   0,
          doorCount:    0,
          elevationTags: [],
        };
      }
      const g = map[key];
      g.frameCount  += 1;
      g.shopHours   += f.bom?.shopHours   ?? 0;
      g.fieldHours  += f.bom?.fieldHours  ?? 0;
      if (f.bom?.door?.type && f.bom.door.type !== 'none') {
        g.doorCount += f.bom.door.leaves ?? (f.quantity ?? 1);
      }
      if (f.elevationTag) g.elevationTags.push(f.elevationTag);
    }
    return Object.values(map).map((g) => ({
      ...g,
      shopHours:  +g.shopHours.toFixed(2),
      fieldHours: +g.fieldHours.toFixed(2),
      totalHours: +(g.shopHours + g.fieldHours).toFixed(2),
    }));
  }, [frames]);

  // ── Executive summary — single source of truth ───────────────────────────────
  const summary = useMemo(() => {
    // Labor: aggregate raw hours from bom, apply contingency, apply rate
    const rawLaborHours   = laborGroups.reduce((s, g) => s + g.shopHours + g.fieldHours, 0);
    const totalLaborHours = rawLaborHours * (1 + financials.contingencyPct / 100);
    const totalLaborCost  = totalLaborHours * financials.laborRate;

    // Materials: straight sum of vendor quote lump sums
    const totalMaterialCost = vendorQuotes.reduce((s, q) => s + (q.amount || 0), 0);

    // Tax applies only to taxable material lines
    const taxableAmount = vendorQuotes.reduce(
      (s, q) => s + (q.isTaxable ? q.amount || 0 : 0), 0
    );
    const taxAmount = taxableAmount * (financials.taxPct / 100);

    // Hard cost = labor + materials + tax (the cost basis before GP)
    const costBase       = totalLaborCost + totalMaterialCost + taxAmount;

    // GPM: auto-tier by default, manual override if estimator locked it
    const gpmTiers    = adminSettings?.financialDefaults?.gpmTiers;
    const autoGpm     = getTieredGPM(costBase, gpmTiers);  // e.g. 30
    const activeMarginPct = financials.gpmMode === 'auto'
      ? autoGpm
      : financials.marginPct;

    // Grand Total = Hard Cost ÷ (1 − GPM%)  — correct GP margin formula
    const safeMargin = Math.min(activeMarginPct, 99.9) / 100;  // guard ÷0
    const grandTotal  = safeMargin < 1 ? costBase / (1 - safeMargin) : costBase;
    const grossProfit = grandTotal - costBase;

    return {
      rawLaborHours:     +rawLaborHours.toFixed(2),
      totalLaborHours:   +totalLaborHours.toFixed(2),
      totalLaborCost:    +totalLaborCost.toFixed(2),
      totalMaterialCost: +totalMaterialCost.toFixed(2),
      taxableAmount:     +taxableAmount.toFixed(2),
      taxAmount:         +taxAmount.toFixed(2),
      costBase:          +costBase.toFixed(2),
      autoGpm,                                         // tier-derived GPM (plain number, e.g. 30)
      activeMarginPct:   +activeMarginPct.toFixed(1), // what is actually being applied
      grossProfit:       +grossProfit.toFixed(2),
      grandTotal:        +grandTotal.toFixed(2),
    };
  }, [laborGroups, vendorQuotes, financials, adminSettings]);

  return {
    // Read-only frame data
    frames,
    frameCount:  frames.length,

    // Labor breakdown (aggregated from bom, read-only)
    laborGroups,

    // Material vendor quotes (editable lump sums)
    vendorQuotes,
    updateVendorQuote,
    addVendorQuote,
    removeVendorQuote,

    // Financial settings (editable)
    financials,
    setFinancial,

    // Executive summary
    summary,
  };
}

export default useBidMath;
