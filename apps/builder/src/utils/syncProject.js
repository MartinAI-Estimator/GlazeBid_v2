/**
 * syncProject.js — Master Database Save Utility
 *
 * Serializes the full GlazeBid AIQ project state into a structured payload
 * and POST-s it to the FastAPI backend at POST /api/project/save.
 *
 * Payload sections
 *   metadata   — project name / ID + snapshot of admin settings in use
 *   takeoff    — all saved frames (shape, dimensions, BOM hours, door data)
 *   financials — vendor quotes, applied GPM mode, rate overrides
 *   summary    — executive numbers (grand total, gross profit, margins)
 */

/**
 * saveProjectToCloud
 *
 * @param {object}  opts
 * @param {string}  opts.projectName    — active project folder / display name
 * @param {string}  [opts.projectId]   — optional UUID if the backend assigns one
 * @param {object}  opts.adminSettings — full adminSettings from ProjectContext
 * @param {array}   opts.frames        — saved frames array from useBidStore
 * @param {array}   opts.vendorQuotes  — lump-sum vendor quote rows from useBidMath
 * @param {object}  opts.financials    — live financial settings from useBidMath state
 * @param {object}  opts.summary       — computed summary object from useBidMath
 *
 * @returns {Promise<{ success: boolean, message: string, savedAt: string }>}
 */
export async function saveProjectToCloud({
  projectName,
  projectId,
  adminSettings,
  frames       = [],
  vendorQuotes = [],
  financials   = {},
  summary      = {},
}) {
  const fd = adminSettings?.financialDefaults ?? {};

  const payload = {
    savedAt: new Date().toISOString(),
    version: '2.0',

    // ── Metadata ──────────────────────────────────────────────────────────────
    metadata: {
      projectName:   projectName || 'Untitled Project',
      projectId:     projectId   || null,
      // Snapshot the company-wide settings that were active at save time.
      // Allows the bid to be re-opened and reproduced deterministically.
      adminSnapshot: {
        laborRate:      fd.laborRate      ?? 45,
        taxRate:        fd.taxRate        ?? 7.25,
        contingencyPct: fd.contingencyPct ?? 10,
        gpmTiers:       fd.gpmTiers       ?? [],
      },
    },

    // ── Parametric Takeoff ─────────────────────────────────────────────────────
    takeoff: {
      frameCount: frames.length,
      frames: frames.map((f) => ({
        frameId:        f.frameId,
        elevationTag:   f.elevationTag,
        systemType:     f.systemType,
        quantity:       f.quantity        ?? 1,

        // Shape / geometry
        shapeMode:      f.shapeMode       ?? 'rectangular',
        leftLegHeight:  f.leftLegHeight   ?? null,
        rightLegHeight: f.rightLegHeight  ?? null,
        sillStepUps:    f.sillStepUps     ?? {},

        // Estimator-entered dimensions
        inputs: f.inputs ?? {},

        // Calculated BOM
        bom: {
          shopHours:       f.bom?.shopHours        ?? 0,
          fieldHours:      f.bom?.fieldHours        ?? 0,
          totalAluminumLF: f.bom?.totalAluminumLF   ?? 0,
          totalGlassSqFt:  f.bom?.totalGlassSqFt    ?? 0,
          glassLitesCount: f.bom?.glassLitesCount   ?? 0,
          door:            f.bom?.door              ?? null,
          cutList:         f.bom?.cutList           ?? [],
        },
      })),
    },

    // ── Financials ─────────────────────────────────────────────────────────────
    financials: {
      laborRate:        financials.laborRate,
      contingencyPct:   financials.contingencyPct,
      taxPct:           financials.taxPct,
      gpmMode:          financials.gpmMode,       // 'auto' | 'manual'
      manualMarginPct:  financials.marginPct,      // only relevant in manual mode
      appliedMarginPct: summary.activeMarginPct,
      autoGpm:          summary.autoGpm,

      vendorQuotes: vendorQuotes.map((q) => ({
        id:        q.id,
        label:     q.label,
        vendor:    q.vendor,
        amount:    q.amount,
        isTaxable: q.isTaxable,
      })),
    },

    // ── Executive Summary ──────────────────────────────────────────────────────
    summary: {
      totalMaterialCost: summary.totalMaterialCost,
      taxableAmount:     summary.taxableAmount,
      taxAmount:         summary.taxAmount,
      rawLaborHours:     summary.rawLaborHours,
      totalLaborHours:   summary.totalLaborHours,
      totalLaborCost:    summary.totalLaborCost,
      costBase:          summary.costBase,
      autoGpm:           summary.autoGpm,
      activeMarginPct:   summary.activeMarginPct,
      grossProfit:       summary.grossProfit,
      grandTotal:        summary.grandTotal,
    },
  };

  try {
    localStorage.setItem(`glazebid:bid:${projectName.trim()}`, JSON.stringify(payload));
  } catch (err) {
    throw new Error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { success: true, message: 'Saved locally', savedAt: payload.savedAt };
}

/**
 * loadProjectFromCloud
 *
 * Fetches the most recent saved bid payload for a project from the backend.
 * Returns the full payload object on success, or null if no save exists yet
 * (HTTP 404 is treated as a normal "new project" condition, not an error).
 *
 * @param {string} projectName — the active project folder / display name
 * @returns {Promise<object|null>}  Full v2.0 payload, or null if no record.
 */
export async function loadProjectFromCloud(projectName) {
  if (!projectName?.trim()) return null;
  try {
    const raw = localStorage.getItem(`glazebid:bid:${projectName.trim()}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
