/**
 * useFrameBuilderStore — Frame Builder Parametric Engine (Zustand)
 *
 * Central state for the GlazeBid Frame Builder workflow.
 * Manages frame groups, individual frames, system definitions, and BOM generation.
 *
 * Store shape:
 * - Navigation: activeTopTab, activeFrameId, activeInputTab
 * - Groups: frame family definitions (system, finish, glass cascading)
 * - Frames: individual frame instances with overrides
 * - Glass specs library
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { resolveFrameBOM, FINISH_MULTIPLIERS } from '@glazebid/frame-engine';
import useBidStore from './useBidStore';

// ─── Default Glass Specs Library ──────────────────────────────────────────────
const DEFAULT_GLASS_SPECS = [
  {
    specId: 'GL-1',
    name: '1" Clear IG',
    makeup: '1/4" Clear + 1/2" Air + 1/4" Clear',
    thickness: 1.0,
    uValue: 0.47,
    shgc: 0.25,
    isTempered: false,
    hasLaminate: false,
  },
  {
    specId: 'GL-2',
    name: '1" Low-E IG',
    makeup: '1/4" Clear + 1/2" Air + 1/4" Low-E',
    thickness: 1.0,
    uValue: 0.29,
    shgc: 0.23,
    isTempered: false,
    hasLaminate: false,
  },
  {
    specId: 'GL-3',
    name: '1" Bronze IG',
    makeup: '1/4" Bronze + 1/2" Air + 1/4" Clear',
    thickness: 1.0,
    uValue: 0.47,
    shgc: 0.19,
    isTempered: false,
    hasLaminate: false,
  },
  {
    specId: 'GL-4',
    name: 'Spandrel',
    makeup: 'Opacified spandrel glass',
    thickness: 0.25,
    isTempered: true,
    hasLaminate: false,
  },
];

// ─── Pure Helper Functions ────────────────────────────────────────────────────

/**
 * Generate next mark for a new frame by examining existing frames.
 * Assumes marks follow patterns like "A-1", "A-2", "SF-3", etc.
 * If no frames exist, returns "A-1".
 */
function getNextMark(frames) {
  if (!frames || frames.length === 0) return 'A-1';

  // Try to parse marks and find the highest number
  let maxNum = 0;
  const marks = frames.map((f) => f.mark).filter(Boolean);

  for (const mark of marks) {
    const parts = mark.split('-');
    if (parts.length === 2) {
      const num = parseInt(parts[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  // Default to "A" prefix if we can't parse
  const prefix = frames.length > 0 ? (frames[0].mark?.split('-')[0] ?? 'A') : 'A';
  return `${prefix}-${maxNum + 1}`;
}

/**
 * Recursively update all frames belonging to a group
 * when group-level settings change and the frame hasn't overridden them.
 */
function updateFramesFromGroup(frames, groupId, groupUpdates) {
  return frames.map((f) => {
    if (f.groupId !== groupId) return f;

    const patch = {};

    // Cascade vendor system if frame hasn't overridden it
    if (groupUpdates.vendorSystemId !== undefined && !f.vendorSystemId) {
      patch.vendorSystemId = groupUpdates.vendorSystemId;
    }

    // Cascade finish type if frame hasn't overridden it
    if (groupUpdates.finishType !== undefined && !f.finishType) {
      patch.finishType = groupUpdates.finishType;
    }

    // Cascade finish multiplier if frame hasn't overridden it
    if (groupUpdates.finishMultiplier !== undefined && f.finishMultiplier === null) {
      patch.finishMultiplier = groupUpdates.finishMultiplier;
    }

    // Cascade glass spec if frame hasn't overridden it
    if (groupUpdates.glassSpecId !== undefined && !f.glassSpecId) {
      patch.glassSpecId = groupUpdates.glassSpecId;
    }

    return { ...f, ...patch };
  });
}

// ─── Schedule Import / Hydration Helpers ─────────────────────────────────────

/**
 * Maps AI/schedule payload systemType → frame-engine archetype, systemClass,
 * default group name, and labor type (LaborType is frame-level, per PartnerPak model).
 */
const SYSTEM_TYPE_MAP = {
  storefront: {
    archetypeId: 'sf-450',
    systemClass: 'ext-storefront',
    groupName: 'Ext Storefront',
    laborType: 'STANDARD',
  },
  curtainwall: {
    archetypeId: 'cw-medium',
    systemClass: 'cap-curtainwall',
    groupName: 'Ext Curtainwall',
    laborType: 'COMBINATION',
  },
  hollow_metal: {
    archetypeId: 'sf-450', // no HM archetype in catalog yet — closest geometry
    systemClass: 'hollow-metal',
    groupName: 'Hollow Metal',
    laborType: 'STANDARD',
  },
  hollow_metal_fire_rated: {
    archetypeId: 'sf-450',
    systemClass: 'hollow-metal',
    groupName: 'HM Fire-Rated',
    laborType: 'STANDARD',
  },
};

const SHAPE_MAP = {
  rectangle: 'rectangular',
  rectangular: 'rectangular',
  trapezoid: 'trapezoid',
  arc: 'arched',
  arched: 'arched',
  sloped: 'sloped',
  custom: 'rectangular',
};

/** Map a free-text finish string to a known finishType key. */
function mapFinishType(finish) {
  if (!finish || typeof finish !== 'string') return null;
  const f = finish.toLowerCase();
  if (f.includes('bronze')) return 'dark-bronze';
  if (f.includes('black')) return 'black-anod';
  if (f.includes('clear') || f.includes('mill')) return 'clear-anod';
  if (f.includes('kynar') || f.includes('pvdf') || f.includes('2605')) return 'three-coat-kynar';
  if (f.includes('paint') || f.includes('2604') || f.includes('2603')) return 'two-coat-paint';
  return 'custom';
}

const normGlass = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Find an existing glass spec whose name loosely matches the payload string. */
function matchGlassSpec(glassSpecs, glassStr) {
  if (!glassStr) return null;
  const n = normGlass(glassStr);
  return (
    glassSpecs.find((g) => normGlass(g.name) === n) ||
    glassSpecs.find((g) => n.includes(normGlass(g.name)) || normGlass(g.name).includes(n)) ||
    null
  );
}

// ─── Store ───────────────────────────────────────────────────────────────────

const useFrameBuilderStore = create(
  persist(
    (set, get) => ({
      // ── Navigation ────────────────────────────────────────────────────────
      activeTopTab: 'framed', // 'framed' | 'all-glass' | 'glass-takeout' | 'metal-list' | 'dashboard'
      activeFrameId: null,    // string | null — which frame is selected
      activeInputTab: 0,      // 0-6 for the 7 input tabs

      // ── Frame Groups ──────────────────────────────────────────────────────
      // Each group cascades system/finish/glass to all frames in the group
      groups: [],

      // ── Frames ────────────────────────────────────────────────────────────
      // Individual frame instances with optional overrides
      frames: [],

      // ── Glass Specs Library ───────────────────────────────────────────────
      glassSpecs: DEFAULT_GLASS_SPECS,

      // ══════════════════════════════════════════════════════════════════════
      // NAVIGATION ACTIONS
      // ══════════════════════════════════════════════════════════════════════

      setActiveTopTab: (tab) =>
        set({
          activeTopTab: tab,
          activeInputTab: 0, // Reset input tab when switching top tab
        }),

      setActiveFrame: (frameId) =>
        set({
          activeFrameId: frameId,
          activeInputTab: 0, // Reset input tab when switching frame
        }),

      setActiveInputTab: (index) => set({ activeInputTab: index }),

      // ══════════════════════════════════════════════════════════════════════
      // GROUP ACTIONS
      // ══════════════════════════════════════════════════════════════════════

      addGroup: (name, archetypeId = 'sf-450', vendorSystemId = 'kawneer-451t') => {
        const groupId = crypto.randomUUID();
        set((state) => ({
          groups: [
            ...state.groups,
            {
              groupId,
              name,
              archetypeId,
              vendorSystemId,
              altVendor1Id: '',
              altVendor2Id: '',
              finishType: 'mill',
              finishMultiplier: 1.0,
              connectionType: 'screw-spline',
              glassSpecId: 'GL-1',
            },
          ],
        }));
        return groupId;
      },

      updateGroup: (groupId, updates) => {
        set((state) => {
          const updatedGroups = state.groups.map((g) =>
            g.groupId === groupId ? { ...g, ...updates } : g
          );

          // Cascade changes to frames in this group
          const updatedFrames = updateFramesFromGroup(
            state.frames,
            groupId,
            updates
          );

          return {
            groups: updatedGroups,
            frames: updatedFrames,
          };
        });
      },

      removeGroup: (groupId) => {
        set((state) => ({
          groups: state.groups.filter((g) => g.groupId !== groupId),
          frames: state.frames.filter((f) => f.groupId !== groupId),
          activeFrameId: null, // Clear active frame if it belonged to deleted group
        }));
      },

      // ══════════════════════════════════════════════════════════════════════
      // FRAME ACTIONS
      // ══════════════════════════════════════════════════════════════════════

      addFrame: (groupId) => {
        const state = get();
        const group = state.groups.find((g) => g.groupId === groupId);
        if (!group) {
          console.warn(`addFrame: group ${groupId} not found`);
          return null;
        }

        const frameId = crypto.randomUUID();
        const mark = getNextMark(state.frames);

        const newFrame = {
          frameId,
          groupId,
          mark,
          scopeTag: 'BASE_BID',
          quantity: 1,
          sillAFF: 0,
          isMockup: false,
          estimatorNotes: '',
          systemClass: 'ext-storefront',
          shape: 'rectangular',
          widthInches: 0,
          heightInches: 0,
          jointWidthInches: 0.25,
          glassBiteOverride: null,
          bays: 1,
          rows: 1,
          bayConfigs: [],
          rowConfigs: [],
          vendorSystemId: '', // Will inherit from group if not set
          finishType: '', // Will inherit from group if not set
          finishMultiplier: null, // Will inherit from group if not set
          glassSpecId: '', // Will inherit from group if not set
          wallSubstrate: 'CMU',
          headCondition: 'soffit',
          windSpeedMph: 90,
          exposureCategory: 'C',
          buildingHeightFt: 30,
          lastBOM: null,
          cutLengthOverrides: {},
          memberOverrides: {},    // { [memberKey]: { profileVariantId } }
        };

        set((state) => ({
          frames: [...state.frames, newFrame],
          activeFrameId: frameId,
        }));

        return frameId;
      },

      updateFrame: (frameId, updates) => {
        set((state) => {
          const updatedFrames = state.frames.map((f) =>
            f.frameId === frameId ? { ...f, ...updates } : f
          );

          // After dimension/grid/vendor change, trigger BOM resolution
          const needsBOMUpdate =
            updates.widthInches !== undefined ||
            updates.heightInches !== undefined ||
            updates.bays !== undefined ||
            updates.rows !== undefined ||
            updates.bayConfigs !== undefined ||
            updates.rowConfigs !== undefined ||
            updates.vendorSystemId !== undefined ||
            updates.glassSpecId !== undefined;

          if (needsBOMUpdate) {
            // Trigger async BOM resolution
            const frameToResolve = updatedFrames.find((f) => f.frameId === frameId);
            if (frameToResolve) {
              // Schedule BOM resolution (non-blocking)
              setTimeout(() => {
                get().resolveBOM(frameId);
              }, 0);
            }
          }

          return { frames: updatedFrames };
        });
      },

      duplicateFrame: (frameId) => {
        const state = get();
        const frameToClone = state.frames.find((f) => f.frameId === frameId);
        if (!frameToClone) {
          console.warn(`duplicateFrame: frame ${frameId} not found`);
          return null;
        }

        const newFrameId = crypto.randomUUID();
        const mark = getNextMark(state.frames);

        const clonedFrame = {
          ...frameToClone,
          frameId: newFrameId,
          mark,
        };

        set((state) => ({
          frames: [...state.frames, clonedFrame],
          activeFrameId: newFrameId,
        }));

        return newFrameId;
      },

      removeFrame: (frameId) => {
        set((state) => ({
          frames: state.frames.filter((f) => f.frameId !== frameId),
          activeFrameId: state.activeFrameId === frameId ? null : state.activeFrameId,
        }));
      },

      // ══════════════════════════════════════════════════════════════════════
      // SCHEDULE IMPORT — hydrateFrame / hydrateFrames
      // ══════════════════════════════════════════════════════════════════════

      /**
       * Hydrate a single frame from an AI/schedule-import JSON payload
       * (see Frame Payload schema — window schedule import, Path C).
       *
       * - Auto-creates or reuses a group per systemType / location.
       * - Missing fields are reported in `needsInput`, never silently skipped.
       * - EQ bays: when bayWidths is null, bayConfigs stays empty and the UI
       *   renders equal widths (matches existing bay-entry behavior).
       *
       * @param {object} payload
       * @param {object} [opts]  { select: boolean } — make this the active frame
       * @returns {{ ok: boolean, frameId?: string, mark?: string,
       *            fieldsSet: string[], needsInput: string[], warnings: string[] }}
       */
      hydrateFrame: (payload, opts = {}) => {
        const fieldsSet = [];
        const needsInput = [];
        const warnings = [];

        if (!payload || typeof payload !== 'object') {
          return { ok: false, fieldsSet, needsInput, warnings: ['Empty payload'] };
        }

        const sysKey = (payload.systemType || 'storefront').toLowerCase().replace(/[\s-]+/g, '_');
        const sysMap = SYSTEM_TYPE_MAP[sysKey] || SYSTEM_TYPE_MAP.storefront;
        if (!SYSTEM_TYPE_MAP[sysKey]) {
          warnings.push(`Unknown systemType "${payload.systemType}" — defaulted to storefront`);
        }

        const state = get();

        // ── Resolve group (reuse by name, else create) ──
        const groupName = (payload.location || payload.frameSet || '').trim() || sysMap.groupName;
        let group = state.groups.find(
          (g) => g.name.toLowerCase() === groupName.toLowerCase()
        );
        let groupsPatch = null;
        if (!group) {
          const finishType = mapFinishType(payload.finish) || 'clear-anod';
          group = {
            groupId: crypto.randomUUID(),
            name: groupName,
            archetypeId: sysMap.archetypeId,
            vendorSystemId: '',
            altVendor1Id: '',
            altVendor2Id: '',
            finishType,
            finishMultiplier: FINISH_MULTIPLIERS[finishType] ?? 1.0,
            connectionType: 'screw-spline',
            glassSpecId: '',
          };
          groupsPatch = [...state.groups, group];
          fieldsSet.push('group (created)', 'finish');
        }

        // ── Glass spec: match existing or create from payload string ──
        let glassSpecId = '';
        let glassSpecsPatch = null;
        if (payload.primaryGlass) {
          const match = matchGlassSpec(state.glassSpecs, payload.primaryGlass);
          if (match) {
            glassSpecId = match.specId;
          } else {
            glassSpecId = crypto.randomUUID();
            glassSpecsPatch = [
              ...state.glassSpecs,
              {
                specId: glassSpecId,
                name: payload.primaryGlass,
                makeup: payload.primaryGlass,
                thickness: /1\s*["”]/.test(payload.primaryGlass) ? 1.0 : 0.25,
                isTempered: /temp/i.test(payload.primaryGlass),
                hasLaminate: /lam/i.test(payload.primaryGlass),
              },
            ];
            warnings.push(`New glass spec created: "${payload.primaryGlass}"`);
          }
          fieldsSet.push('primaryGlass');
        } else {
          needsInput.push('primaryGlass');
        }

        // ── Geometry ──
        const widthInches = Number(payload.overallWidth) || 0;
        const heightInches = Number(payload.overallHeight) || 0;
        if (widthInches > 0) fieldsSet.push('overallWidth'); else needsInput.push('overallWidth');
        if (heightInches > 0) fieldsSet.push('overallHeight'); else needsInput.push('overallHeight');

        const bays = Math.max(1, Number(payload.panelCount) || 1);
        const rows = Math.max(1, Number(payload.rowCount) || 1);
        if (payload.panelCount) fieldsSet.push('panelCount');
        if (payload.rowCount) fieldsSet.push('rowCount');

        // Bay configs: explicit widths → overrides; door bays → type 'door'
        const doorBays = Array.isArray(payload.doorBays) ? payload.doorBays : [];
        let bayConfigs = [];
        const hasBayWidths =
          Array.isArray(payload.bayWidths) &&
          payload.bayWidths.length === bays &&
          payload.bayWidths.every((w) => typeof w === 'number' && w > 0);
        if (hasBayWidths || doorBays.length > 0) {
          bayConfigs = Array.from({ length: bays }, (_, i) => ({
            index: i,
            type: doorBays.includes(i) ? 'door' : 'glazing',
            ...(hasBayWidths ? { widthOverride: payload.bayWidths[i] } : {}),
          }));
        }
        if (hasBayWidths) {
          fieldsSet.push('bayWidths');
        } else if (bays > 1) {
          warnings.push('Bay widths not provided — defaulted to equal (EQ)');
        }
        if (Array.isArray(payload.bayWidths) && payload.bayWidths.length !== bays && payload.bayWidths.length > 0) {
          warnings.push(`bayWidths length (${payload.bayWidths.length}) ≠ panelCount (${bays}) — ignored`);
        }

        // Row configs: rowHeights is the known extraction gap — flag when missing
        let rowConfigs = [];
        const hasRowHeights =
          Array.isArray(payload.rowHeights) &&
          payload.rowHeights.length === rows &&
          payload.rowHeights.every((h) => typeof h === 'number' && h > 0);
        if (hasRowHeights) {
          rowConfigs = payload.rowHeights.map((h, i) => ({ index: i, heightOverride: h }));
          fieldsSet.push('rowHeights');
        } else if (rows > 1) {
          needsInput.push('rowHeights');
        }

        // ── Sill AFF: entered at bid time — flag when absent ──
        const sillAFF = payload.sillAFF == null ? 0 : Number(payload.sillAFF) || 0;
        if (payload.sillAFF == null) needsInput.push('sillAFF'); else fieldsSet.push('sillAFF');

        // ── Notes: fold import flags the frame model has no field for yet ──
        const noteBits = [];
        if (payload.notes) noteBits.push(payload.notes);
        if (payload.safetyFilm) noteBits.push('⚑ Safety film (SF) required');
        if (payload.brakemetal) noteBits.push('⚑ Brake metal');
        if (payload.squareCornerMullion) noteBits.push('⚑ Square corner mullion');
        if (payload.expansionMullion) noteBits.push('⚑ Expansion mullion');
        if (Array.isArray(payload.specialtyGlass) && payload.specialtyGlass.length) {
          noteBits.push(`⚑ Specialty glass: ${payload.specialtyGlass.map((s) => (typeof s === 'string' ? s : s?.designation || JSON.stringify(s))).join(', ')}`);
        }
        if (sysKey === 'hollow_metal_fire_rated') noteBits.push('⚑ FIRE-RATED hollow metal');
        if (payload.frameSeries) noteBits.push(`Series: ${payload.frameSeries}`);
        if (payload.manufacturer && payload.manufacturer !== 'Generic') noteBits.push(`Mfr: ${payload.manufacturer}`);

        // Flagged fields from the AI extraction layer → needsInput
        if (Array.isArray(payload.flaggedFields)) {
          for (const ff of payload.flaggedFields) {
            if (ff && !needsInput.includes(ff)) needsInput.push(ff);
          }
        }

        const frameId = crypto.randomUUID();
        const mark = payload.mark || getNextMark(state.frames);
        if (payload.mark) fieldsSet.push('mark'); else warnings.push('No mark — auto-assigned');

        const newFrame = {
          frameId,
          groupId: group.groupId,
          mark,
          scopeTag: 'BASE_BID',
          quantity: Math.max(1, Number(payload.quantity) || 1),
          sillAFF,
          isMockup: false,
          estimatorNotes: noteBits.join('\n'),
          systemClass: sysMap.systemClass,
          laborType: sysMap.laborType,
          shape: SHAPE_MAP[(payload.shape || 'rectangle').toLowerCase()] || 'rectangular',
          widthInches,
          heightInches,
          jointWidthInches: 0.25,
          glassBiteOverride: null,
          bays,
          rows,
          bayConfigs,
          rowConfigs,
          hasDoor: !!payload.hasDoor || doorBays.length > 0,
          doorBays,
          vendorSystemId: '',
          finishType: mapFinishType(payload.finish) || '',
          finishMultiplier: null,
          glassSpecId,
          wallSubstrate: 'CMU',
          headCondition: 'soffit',
          windSpeedMph: 90,
          exposureCategory: 'C',
          buildingHeightFt: 30,
          lastBOM: null,
          cutLengthOverrides: {},
          memberOverrides: {},
          importMeta: {
            source: 'schedule-import',
            confidence: payload.confidence ?? null,
            needsInput,
            importedAt: new Date().toISOString(),
          },
        };
        if (payload.quantity) fieldsSet.push('quantity');
        if (payload.systemType) fieldsSet.push('systemType');
        if (payload.finish) fieldsSet.push('finish');

        set((s) => ({
          ...(groupsPatch ? { groups: groupsPatch } : {}),
          ...(glassSpecsPatch ? { glassSpecs: glassSpecsPatch } : {}),
          frames: [...s.frames, newFrame],
          ...(opts.select ? { activeFrameId: frameId } : {}),
        }));

        // Resolve BOM once dimensions are usable
        if (widthInches >= 12 && heightInches >= 12) {
          setTimeout(() => get().resolveBOM(frameId), 0);
        }

        return { ok: true, frameId, mark, groupName: group.name, fieldsSet, needsInput, warnings };
      },

      /**
       * Hydrate many frames from an array of payloads (window schedule drop).
       * Selects the first successfully created frame.
       * @returns {Array} per-payload validation results
       */
      hydrateFrames: (payloads) => {
        if (!Array.isArray(payloads)) return [];
        const results = payloads.map((p, i) =>
          get().hydrateFrame(p, { select: i === 0 })
        );
        return results;
      },

      // ══════════════════════════════════════════════════════════════════════
      // BOM RESOLUTION
      // ══════════════════════════════════════════════════════════════════════

      resolveBOM: (frameId) => {
        const state = get();
        const frame = state.frames.find((f) => f.frameId === frameId);
        if (!frame) return;

        // Guard: need minimum dimensions to resolve
        if (!frame.widthInches || !frame.heightInches || frame.widthInches < 12 || frame.heightInches < 12) return;

        // Resolve effective vendor system — frame override takes priority over group
        const group = state.groups.find((g) => g.groupId === frame.groupId);
        const vendorSystemId = frame.vendorSystemId || group?.vendorSystemId || 'kawneer-451t';
        const finishType = frame.finishType || group?.finishType || 'clear-anod';
        const finishMultiplier = frame.finishMultiplier ?? group?.finishMultiplier ?? FINISH_MULTIPLIERS[finishType] ?? 1.0;
        const glassSpecId = frame.glassSpecId || group?.glassSpecId || 'GL-1';

        // Build bayTypes array from bayConfigs
        const bayTypes = frame.bayConfigs && frame.bayConfigs.length === frame.bays
          ? frame.bayConfigs.map((b) => b.type || 'glazing')
          : Array(frame.bays || 1).fill('glazing');

        try {
          const bom = resolveFrameBOM({
            frameId,
            mark: frame.mark || 'FB-1',
            groupName: group?.name || 'Default',
            scopeTag: frame.scopeTag || 'BASE_BID',
            quantity: frame.quantity || 1,
            widthInches: frame.widthInches,
            heightInches: frame.heightInches,
            bays: frame.bays || 1,
            rows: frame.rows || 1,
            bayTypes,
            vendorSystemId,
            altVendor1Id: frame.altVendor1Id || group?.altVendor1Id,
            altVendor2Id: frame.altVendor2Id || group?.altVendor2Id,
            finishType,
            finishMultiplier,
            glassBiteOverride: frame.glassBiteOverride || undefined,
            stockLengthFt: 21,
            glassSpecId,
          });

          set((state) => ({
            frames: state.frames.map((f) =>
              f.frameId === frameId ? { ...f, lastBOM: bom } : f
            ),
          }));
        } catch (err) {
          console.warn('resolveBOM error for frame', frameId, err);
        }
      },

      pushToBidStore: (frameId) => {
        const state = get();
        const frame = state.frames.find((f) => f.frameId === frameId);
        if (!frame?.lastBOM) {
          console.warn(`pushToBidStore: frame ${frameId} not found or BOM not resolved`);
          return;
        }

        // Write FrameEngineeringPackage to useBidStore as a new frame entry
        try {
          const bidStore = useBidStore.getState();
          if (typeof bidStore.addFrame === 'function') {
            bidStore.addFrame({
              frameId: frame.lastBOM.frameId,
              elevationTag: frame.mark,
              systemType: frame.systemClass || 'ext-storefront',
              inputs: {
                width: frame.widthInches,
                height: frame.heightInches,
                bays: frame.bays || 1,
                rows: frame.rows || 1,
              },
              bom: frame.lastBOM,
            });
          }
        } catch (err) {
          console.warn('pushToBidStore error:', err);
        }
      },

      // ══════════════════════════════════════════════════════════════════════
      // GLASS SPECS
      // ══════════════════════════════════════════════════════════════════════

      addGlassSpec: (spec) => {
        const specId = crypto.randomUUID();
        set((state) => ({
          glassSpecs: [...state.glassSpecs, { ...spec, specId }],
        }));
        return specId;
      },

      updateGlassSpec: (specId, updates) => {
        set((state) => ({
          glassSpecs: state.glassSpecs.map((s) =>
            s.specId === specId ? { ...s, ...updates } : s
          ),
        }));
      },

      // ══════════════════════════════════════════════════════════════════════
      // UTILITIES
      // ══════════════════════════════════════════════════════════════════════

      getEffectiveVendorSystemId: (frameId) => {
        const state = get();
        const frame = state.frames.find((f) => f.frameId === frameId);
        if (!frame) return null;

        // Frame override takes precedence
        if (frame.vendorSystemId) return frame.vendorSystemId;

        // Fall back to group setting
        const group = state.groups.find((g) => g.groupId === frame.groupId);
        return group?.vendorSystemId ?? null;
      },

      getEffectiveFinishMultiplier: (frameId) => {
        const state = get();
        const frame = state.frames.find((f) => f.frameId === frameId);
        if (!frame) return null;

        // Frame override takes precedence
        if (frame.finishMultiplier !== null && frame.finishMultiplier !== undefined) {
          return frame.finishMultiplier;
        }

        // Fall back to group setting
        const group = state.groups.find((g) => g.groupId === frame.groupId);
        return group?.finishMultiplier ?? 1.0;
      },

      getFramesByGroup: (groupId) => {
        const state = get();
        return state.frames.filter((f) => f.groupId === groupId);
      },

      getActiveGroup: () => {
        const state = get();
        const activeFrame = state.frames.find(
          (f) => f.frameId === state.activeFrameId
        );
        if (!activeFrame) return null;
        return state.groups.find((g) => g.groupId === activeFrame.groupId);
      },
    }),
    {
      name: 'glazebid-frame-builder-store',
    }
  )
);

export default useFrameBuilderStore;
