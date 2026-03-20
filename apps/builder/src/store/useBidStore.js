/**
 * useBidStore — Global Bid Cart + Labor Engine (Zustand)
 *
 * Central state for the GlazeBid parametric assembly workflow.
 * Zustand ensures only subscribed slices re-render — critical when
 * an estimator has 50-150 frames in memory simultaneously.
 *
 * Frame payload shape (from ParametricFrameBuilder):
 * {
 *   frameId, elevationTag, systemType,
 *   inputs:  { width, height, bays, rows, glassBite, sightline },
 *   bom:     { totalAluminumLF, totalGlassSqFt, glassLitesCount,
 *              cutList, glassSizes: { widthInches, heightInches, qty } }
 * }
 *
 * Labor Engine:
 *   shopFabHours   = totalAluminumLF  / shopFabVelocity     (LF per hour)
 *   fieldInstHours = totalGlassSqFt   / fieldInstVelocity   (SqFt per hour)
 *   totalLaborCost = totalLaborHours  * burdenedRatePerHour
 *
 * Glass RFQ Aggregator (getGlassRFQ):
 *   Groups all glass across all frames by size + systemType.
 *   Identical sizes are summed — ideal for vendor quote schedule.
 *
 * CSV Export (exportGlassRFQ):
 *   Triggers a browser file-download of the RFQ as a CSV.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Default Labor Velocities ─────────────────────────────────────────────────
// All tuneable live in the store so the estimator can override them per project.
const DEFAULT_LABOR_RATES = {
  shopFabVelocity:    10,   // aluminum LF a fabricator preps per hour
  fieldInstVelocity:  25,   // glass SqFt a field crew glazes per hour
  burdenedRatePerHour: 42,  // fully-burdened $/hr (wages + taxes + benefits)
};

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Re-compute all project-level totals + labor estimates from the frames array.
 * Called after every mutation so every subscriber sees fresh numbers instantly.
 */
function calcTotals(frames, rates) {
  const raw = frames.reduce(
    (acc, f) => {
      acc.totalFrames     += 1;
      acc.totalAluminumLF += f.bom.totalAluminumLF ?? 0;
      acc.totalGlassSqFt  += f.bom.totalGlassSqFt  ?? 0;
      acc.totalLites      += f.bom.glassLitesCount  ?? 0;
      return acc;
    },
    { totalFrames: 0, totalAluminumLF: 0, totalGlassSqFt: 0, totalLites: 0 },
  );

  // ── Labor Engine ──────────────────────────────────────────────────────────
  const shopFabHours   = raw.totalAluminumLF / rates.shopFabVelocity;
  const fieldInstHours = raw.totalGlassSqFt  / rates.fieldInstVelocity;
  const totalLaborHours = shopFabHours + fieldInstHours;
  const estimatedLaborCost = totalLaborHours * rates.burdenedRatePerHour;

  return {
    ...raw,
    labor: {
      shopFabHours:        +shopFabHours.toFixed(2),
      fieldInstHours:      +fieldInstHours.toFixed(2),
      totalLaborHours:     +totalLaborHours.toFixed(2),
      estimatedLaborCost:  +estimatedLaborCost.toFixed(2),
    },
  };
}

/**
 * Glass RFQ Aggregator — pure function, usable outside the store too.
 *
 * Groups frames' glass by (widthInches × heightInches × glassType).
 * Returns a sorted array of line items ready for a vendor schedule:
 *   [{ key, glassType, widthInches, heightInches, qty, sqFtPerLite, systemType, totalSqFt, elevationTags }, ...]
 *
 * Sizes are bucketed by 2-decimal-place rounded keys so trivially
 * different floats don't produce phantom duplicate lines.
 */
export function getGlassRFQ(frames) {
  const map = {};

  for (const frame of frames) {
    const g = frame.bom?.glassSizes;
    if (!g) continue;

    const w    = parseFloat((g.widthInches  ?? 0).toFixed(2));
    const h    = parseFloat((g.heightInches ?? 0).toFixed(2));
    const qty  = g.qty ?? frame.bom.glassLitesCount ?? 0;
    const type = g.glassType ?? frame.systemType ?? 'Unspecified';
    const sys  = frame.systemType ?? 'Unspecified';
    const key  = `${w}x${h}::${type}`;

    if (!map[key]) {
      map[key] = {
        key,
        glassType:    type,
        widthInches:  w,
        heightInches: h,
        qty:          0,
        sqFtPerLite:  +((w * h) / 144).toFixed(4),
        totalSqFt:    0,
        systemType:   sys,
        elevationTags: [],
      };
    }

    map[key].qty       += qty;
    map[key].totalSqFt += +((w * h * qty) / 144).toFixed(4);
    map[key].elevationTags.push(frame.elevationTag ?? '');
  }

  // Sort: largest lite first (most important cut on the schedule)
  return Object.values(map).sort((a, b) => (b.widthInches * b.heightInches) - (a.widthInches * a.heightInches));
}

/**
 * Trigger a browser file-download of the RFQ schedule as a clean CSV.
 * No server round-trip — the data is already in Zustand state.
 */
export function exportGlassRFQtoCSV(rfqLines, projectName = 'GlazeBid Project') {
  const now  = new Date().toLocaleDateString('en-US');
  const rows = [
    [`Glass RFQ Schedule — ${projectName}`, `Exported: ${now}`, '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Line', 'QTY', 'Width (in.)', 'Height (in.)', 'Total SqFt', 'Glass Type', 'System / Type', 'Elevation(s)'],
    ...rfqLines.map((r, i) => [
      i + 1,
      r.qty,
      r.widthInches.toFixed(2),
      r.heightInches.toFixed(2),
      r.totalSqFt.toFixed(2),
      r.glassType,
      r.systemType,
      [...new Set(r.elevationTags)].filter(Boolean).join(', '),
    ]),
    ['', '', '', '', '', '', '', ''],
    ['TOTALS', rfqLines.reduce((s, r) => s + r.qty, 0), '', '',
     rfqLines.reduce((s, r) => s + r.totalSqFt, 0).toFixed(2), '', '', ''],
  ];

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `Glass_RFQ_${projectName.replace(/\s+/g, '_')}_${Date.now()}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Store ────────────────────────────────────────────────────────────────────

const useBidStore = create(
  persist(
    (set, get) => ({

  // ── 1. The Cart ─────────────────────────────────────────────────────────────
  frames: [],

  // ── 2. Labor rate configuration (estimator-tunable per project) ─────────────
  laborRates: { ...DEFAULT_LABOR_RATES },

  // ── 3. Project-level totals (geometry + labor, drives Executive Dashboard) ───
  projectTotals: calcTotals([], DEFAULT_LABOR_RATES),

  // ── 4. Add a frame payload from ParametricFrameBuilder ──────────────────────
  addFrame: (framePayload) => {
    set((state) => {
      const updatedFrames = [...state.frames, framePayload];
      return {
        frames:        updatedFrames,
        projectTotals: calcTotals(updatedFrames, state.laborRates),
      };
    });
  },

  // ── 5. Remove a frame by frameId ────────────────────────────────────────────
  removeFrame: (frameId) => {
    set((state) => {
      const updatedFrames = state.frames.filter((f) => f.frameId !== frameId);
      return {
        frames:        updatedFrames,
        projectTotals: calcTotals(updatedFrames, state.laborRates),
      };
    });
  },

  // ── 6. Update a single frame in-place ───────────────────────────────────────
  updateFrame: (frameId, patch) => {
    set((state) => {
      const updatedFrames = state.frames.map((f) =>
        f.frameId === frameId ? { ...f, ...patch } : f,
      );
      return {
        frames:        updatedFrames,
        projectTotals: calcTotals(updatedFrames, state.laborRates),
      };
    });
  },

  // ── 7. Update a single labor rate — re-runs labor engine instantly ───────────
  setLaborRate: (key, value) => {
    set((state) => {
      const updatedRates = { ...state.laborRates, [key]: Number(value) };
      return {
        laborRates:    updatedRates,
        projectTotals: calcTotals(state.frames, updatedRates),
      };
    });
  },

  // ── 8. Get the aggregated glass RFQ schedule (derived, not stored) ───────────
  //     Call as: useBidStore.getState().getGlassRFQ()
  //     Or subscribe: const rfq = useBidStore(s => getGlassRFQ(s.frames))
  getGlassRFQ: () => getGlassRFQ(get().frames),

  // ── 9. Trigger CSV download of the current RFQ schedule ─────────────────────
  exportGlassRFQ: (projectName) => {
    exportGlassRFQtoCSV(getGlassRFQ(get().frames), projectName);
  },

  // ── 10. Wipe the entire bid ──────────────────────────────────────────────────
  clearBid: () => set({
    frames:        [],
    projectTotals: calcTotals([], DEFAULT_LABOR_RATES),
  }),

  // ── 11. Hydrate from saved JSON blob (load bid from file / backend) ──────────
  loadBid: (frames) => set((state) => ({
    frames,
    projectTotals: calcTotals(frames, state.laborRates),
  })),

  // ── 12. Increment the quantity of a saved frame by 1 (Build & Stamp tool) ───
  //   Derives the per-unit base values from the stored totals so we never need
  //   to re-run the full math engine — just scale up proportionally.
  incrementFrameQuantity: (frameId) => {
    set((state) => {
      const updatedFrames = state.frames.map((f) => {
        if (f.frameId !== frameId) return f;

        const currentQty  = f.quantity ?? 1;
        const newQty      = currentQty + 1;
        const ratio       = newQty / currentQty;

        // Scale all quantity-dependent BOM totals
        const newBom = {
          ...f.bom,
          quantity:        newQty,
          totalAluminumLF: +((f.bom.totalAluminumLF ?? 0) * ratio).toFixed(2),
          totalGlassSqFt:  +((f.bom.totalGlassSqFt  ?? 0) * ratio).toFixed(2),
          glassLitesCount: Math.round((f.bom.glassLitesCount ?? 0) * ratio),
          // Scale the glass-sizes qty so RFQ totals stay accurate
          ...(f.bom.glassSizes ? {
            glassSizes: {
              ...f.bom.glassSizes,
              qty: Math.round((f.bom.glassSizes.qty ?? 0) * ratio),
            },
          } : {}),
          // Scale transom qty if present
          ...(f.bom.transomGlass ? {
            transomGlass: {
              ...f.bom.transomGlass,
              qty: Math.round((f.bom.transomGlass.qty ?? 0) * ratio),
            },
          } : {}),
          // Scale cut-list quantities
          cutList: Array.isArray(f.bom.cutList)
            ? f.bom.cutList.map(item => ({ ...item, qty: +((item.qty ?? 0) * ratio).toFixed(0) * 1 }))
            : f.bom.cutList,
        };

        return { ...f, quantity: newQty, bom: newBom };
      });

      return {
        frames:        updatedFrames,
        projectTotals: calcTotals(updatedFrames, state.laborRates),
      };
    });
  },

  // ── 13. Bulk-import frames extracted from Bluebeam PDF annotations ──────────
  //   Accepts an array of pre-built frame payloads.
  //   Deduplicates by frameId so re-importing the same PDF is idempotent.
  importBluebeamFrames: (incomingFrames) => {
    set((state) => {
      const existingIds = new Set(state.frames.map(f => f.frameId));
      const fresh = incomingFrames.filter(f => !existingIds.has(f.frameId));
      if (!fresh.length) return state; // nothing new to add
      const updatedFrames = [...state.frames, ...fresh];
      return {
        frames:        updatedFrames,
        projectTotals: calcTotals(updatedFrames, state.laborRates),
      };
    });
  },

  // ── 14. Rehydration Engine — restore a full bid from the cloud ───────────────
  // Called by App.jsx after loadProjectFromCloud() resolves successfully.
  //
  // Staging strategy:
  //   • frames[]          → written directly into the store (immediate)
  //   • financials +
  //     vendorQuotes      → staged in pendingRehydration so useBidMath can
  //                         read them once inside its useState() lazy initializer
  //                         on next mount, then clears the slot automatically.
  pendingRehydration: null, // { financials, vendorQuotes } | null

  rehydrateBid: ({ frames = [], financials = null, vendorQuotes = null }) => {
    set((state) => ({
      frames:             frames,
      projectTotals:      calcTotals(frames, state.laborRates),
      pendingRehydration: (financials || vendorQuotes)
        ? { financials, vendorQuotes }
        : null,
    }));
  },

  clearPendingRehydration: () => set({ pendingRehydration: null }),
    }),
    {
      name: 'glazebid-bid-store',
      // Only persist frames + labor rates; projectTotals are derived (recalculated on load)
      partialize: (state) => ({
        frames: state.frames,
        laborRates: state.laborRates,
      }),
    }
  )
);

export default useBidStore;
