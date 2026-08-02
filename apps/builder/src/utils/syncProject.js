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

// ─────────────────────────────────────────────────────────────────────────────
// v3 — localState capture (AUDIT 1.1/1.2)
// Most feature state (spec analysis, bidsheet classic-grid frames, custom
// cards, bid settings, hr rates, production rates) historically lived ONLY in
// localStorage — invisible to the project file. v3 snapshots every relevant
// glazebid localStorage key into the payload and restores it on open, so a
// project reopens identically on any machine.
// ─────────────────────────────────────────────────────────────────────────────

// Global (non-project-scoped) config keys worth carrying with the project so
// it reproduces deterministically elsewhere.
const GLOBAL_STATE_KEYS = [
  'glazebid:customSystemCards',
  'glazebid:laborSystems',
  'glazebid-production-rates',   // zustand persist: hourly functions + item rates
  'glazebid-equipment-rates',    // zustand persist: equipment rental rates
  'glazebid_adminSettings',
];

// Keys that must NOT be captured (transient, or first-class payload sections).
const EXCLUDED_KEYS = new Set([
  'glazebid-bid-store',          // frames/workspaceSystems are first-class in payload
  'glazebid:inbox',              // live Studio push — transient
  'glazebid:jumpToSystem',       // navigation intent — transient
]);

/** Snapshot relevant localStorage into { key: rawJsonString }. */
export function collectLocalState(projectName) {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || EXCLUDED_KEYS.has(k)) continue;
      const isProjectKey =
        projectName &&
        k.startsWith('glazebid') &&
        k.includes(`:${projectName}`);
      if (isProjectKey || GLOBAL_STATE_KEYS.includes(k)) {
        out[k] = localStorage.getItem(k);
      }
    }
  } catch { /* localStorage unavailable */ }
  return out;
}

/** Restore a payload's localState snapshot (payload wins — determinism). */
export function applyLocalState(localState) {
  if (!localState || typeof localState !== 'object') return 0;
  let restored = 0;
  for (const [k, v] of Object.entries(localState)) {
    if (EXCLUDED_KEYS.has(k) || typeof v !== 'string') continue;
    try { localStorage.setItem(k, v); restored += 1; } catch { /* quota */ }
  }
  return restored;
}

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
  frames           = [],
  workspaceSystems = null,   // v3: canonical system model from useBidStore
  bidSettings      = null,   // v3: labor rate / markup / tax / crew
  vendorQuotes     = [],
  financials       = {},
  summary          = {},
}) {
  const fd = adminSettings?.financialDefaults ?? {};

  const payload = {
    savedAt: new Date().toISOString(),
    version: '3.0',

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

    // ── v3: Workspace systems (canonical system/frame model) ──────────────────
    workspaceSystems: Array.isArray(workspaceSystems) ? workspaceSystems : [],

    // ── v3: Bid settings (rates / markup / tax / crew) ────────────────────────
    bidSettings: bidSettings ?? null,

    // ── v3: localStorage snapshot (spec analysis, classic-grid frames, custom
    //        cards, hr rates, production rates, admin settings) ────────────────
    localState: collectLocalState(projectName),

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
