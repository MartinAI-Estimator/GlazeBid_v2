/**
 * syncProject.js — Project File-System Save / Load Utility
 *
 * Serialises the full GlazeBid project state into a structured payload and
 * writes it to disk as  <ProjectsRoot>/<ProjectName>/project.aiq  via the
 * Electron main-process IPC.  No data is stored in localStorage.
 *
 * When running outside Electron (browser dev mode), a graceful in-memory
 * fallback is used so the UI still functions during development.
 *
 * Payload sections
 *   metadata   — project name / ID + snapshot of admin settings in use
 *   takeoff    — all saved frames (shape, dimensions, BOM hours, door data)
 *   financials — vendor quotes, applied GPM mode, rate overrides
 *   summary    — executive numbers (grand total, gross profit, margins)
 */

// ── Dev-mode in-memory fallback (browser only, not shipped to production) ─────
const _devStore = new Map();

function isElectron() {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.saveProject);
}

/**
 * saveProjectToCloud
 * (name kept for backward compatibility — actually saves to disk via Electron IPC)
 *
 * @param {object}  opts
 * @param {string}  opts.projectName    — active project name / display name
 * @param {string}  [opts.projectId]   — optional UUID
 * @param {object}  opts.adminSettings — full adminSettings from ProjectContext
 * @param {array}   opts.frames        — saved frames array from useBidStore
 * @param {array}   opts.vendorQuotes  — lump-sum vendor quote rows from useBidMath
 * @param {object}  opts.financials    — live financial settings from useBidMath state
 * @param {object}  opts.summary       — computed summary object from useBidMath
 *
 * @returns {Promise<{ success: boolean, message: string, savedAt: string, aiqPath?: string }>}
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
          distHours:       f.bom?.distHours        ?? 0,
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
    if (isElectron()) {
      const result = await window.electronAPI.saveProject(projectName, payload);
      if (!result.ok) {
        if (result.error === 'NO_ROOT') {
          throw new Error('NO_ROOT');
        }
        throw new Error(`Save failed: ${result.error}`);
      }
      return { success: true, message: 'Saved to disk', savedAt: payload.savedAt, aiqPath: result.aiqPath };
    }
    // Dev-mode fallback — in-memory only
    _devStore.set(projectName.trim(), payload);
    return { success: true, message: 'Saved (dev mode)', savedAt: payload.savedAt };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * loadProjectFromCloud
 * (name kept for backward compatibility — actually loads from disk via Electron IPC)
 *
 * @param {string}   projectName — the active project name
 * @param {string}  [aiqPath]   — optional explicit path to a .aiq file
 * @returns {Promise<object|null>}  Full v2.0 payload, or null if no file exists yet.
 */
export async function loadProjectFromCloud(projectName, aiqPath) {
  if (!projectName?.trim() && !aiqPath) return null;
  try {
    if (isElectron()) {
      const result = await window.electronAPI.loadProject(projectName?.trim(), aiqPath);
      if (!result.ok) return null;
      return result.payload;
    }
    // Dev-mode fallback
    return _devStore.get(projectName?.trim()) ?? null;
  } catch {
    return null;
  }
}
