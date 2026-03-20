/**
 * useProjectStore.ts  (Studio)
 *
 * ── Dual-Screen "Inbox" Architecture ────────────────────────────────────────
 *
 * The project lifecycle is split across two windows / apps:
 *
 *   SCREEN 1 — Studio (Takeoff Engine)
 *     The estimator draws highlights on the PDF.  Each highlight produces a
 *     RawTakeoff — a pure geometry record (page, x/y, width/height, type).
 *     No system assignment.  No engineering.  Just "we measured this thing."
 *
 *   SCREEN 2 — Builder (Inbox + Frame Engineer)
 *     The estimator opens the Inbox, groups one or more RawTakeoffs, and
 *     engineers them into an EngineeredFrame (GridSpec, SystemArchetype, BOM).
 *
 * Data flow:
 *   RawTakeoff[] → inbox  (captured in Studio)
 *   EngineeredFrame[]     (assembled in Builder, references takeoffIds)
 *
 * The `systems` array and `SYSTEM_COLORS` remain in Studio so the canvas can
 * colour highlights for visual grouping.  A `systemId` on a RawTakeoff is an
 * optional preview hint only — the hard engineering lives in EngineeredFrame.
 *
 * IPC sync (Task 5.4): inbox + engineeredFrames will be published over the
 * Electron IPC bridge so Builder stays live-updated from Studio highlights.
 */

import { create } from 'zustand';
import { type CountGroup, defaultCountColor, defaultGroupLabel } from '../engine/parametric/countMath';
import type { GridSpec }        from '../engine/parametric/gridMath';
import type { SystemArchetype } from '../engine/parametric/archetypes';
import type { FabricationBOM }  from '../engine/parametric/systemEngine';
import type { PagePoint }       from '../engine/coordinateSystem';

// ── Profile Depths & Sightlines ───────────────────────────────────────────────
// Ported from: _LEGACY_ARCHIVE/GlazeBid_AIQ/backend/core/cross_reference_engine.py
// ProfileSignature data structure, adapted to TypeScript.

export type ProfileKey =
  | 'sf-250'      // Storefront 2.5" depth (min)
  | 'sf-450'      // Storefront 4.5" depth (standard)
  | 'sf-600'      // Storefront 6" depth (thermal)
  | 'ww-600'      // Window Wall 6"
  | 'cw-shallow'  // Curtainwall 7.5"
  | 'cw-medium'   // Curtainwall 10.5"
  | 'cw-deep'     // Curtainwall 12"
  | 'int-sf';     // Interior Storefront 2.5"

type FrameProfile = {
  /** Unique key used in store and pricing calculations. */
  key:        ProfileKey;
  /** Human-readable label. */
  label:      string;
  /** Visible face width shown from the exterior (inches). */
  faceWidth:  number;
  /** Back-to-front system depth (inches). Determines aluminum weight and thermal class. */
  depth:      number;
  /** How far glass sits into the frame pocket (inches). Reduces the structural DLO. */
  glassBite:  number;
  /** Visible frame width at the glass perimeter (inches — affects DLO calcs). */
  sightline:  number;
};

/** Catalog of standard frame profiles. Prices are depth-dependent; deeper = more material. */
export const FRAME_PROFILES: Record<ProfileKey, FrameProfile> = {
  'sf-250':     { key: 'sf-250',     label: 'SF 2.5"',              faceWidth: 2.0, depth: 2.5,  glassBite: 0.5,  sightline: 2.0 },
  'sf-450':     { key: 'sf-450',     label: 'SF 4.5" (Standard)',   faceWidth: 2.0, depth: 4.5,  glassBite: 0.75, sightline: 2.0 },
  'sf-600':     { key: 'sf-600',     label: 'SF 6" (Thermal)',      faceWidth: 2.0, depth: 6.0,  glassBite: 0.75, sightline: 2.0 },
  'ww-600':     { key: 'ww-600',     label: 'Window Wall 6"',       faceWidth: 2.0, depth: 6.0,  glassBite: 1.0,  sightline: 2.0 },
  'cw-shallow': { key: 'cw-shallow', label: 'CW 7.5" (Shallow)',   faceWidth: 2.5, depth: 7.5,  glassBite: 1.0,  sightline: 2.5 },
  'cw-medium':  { key: 'cw-medium',  label: 'CW 10.5" (Medium)',   faceWidth: 2.5, depth: 10.5, glassBite: 1.0,  sightline: 2.5 },
  'cw-deep':    { key: 'cw-deep',    label: 'CW 12" (Deep)',        faceWidth: 2.5, depth: 12.0, glassBite: 1.0,  sightline: 2.5 },
  'int-sf':     { key: 'int-sf',     label: 'Interior SF 2.5"',     faceWidth: 1.75, depth: 2.5, glassBite: 0.5,  sightline: 1.75 },
};

/** Default profile keyed by system type. */
export const DEFAULT_PROFILE_FOR_SYSTEM: Record<SystemType, ProfileKey> = {
  'ext-sf-1': 'sf-450',
  'ext-sf-2': 'sf-600',
  'int-sf':   'int-sf',
  'cap-cw':   'cw-shallow',
  'ssg-cw':   'cw-shallow',
};

// ── System Type ───────────────────────────────────────────────────────────────

/** Mirrors SystemType from apps/builder — kept in sync manually. */
export type SystemType = 'ext-sf-1' | 'ext-sf-2' | 'int-sf' | 'cap-cw' | 'ssg-cw';

export const SYSTEM_TYPE_LABELS: Record<SystemType, string> = {
  'ext-sf-1': 'Exterior Storefront 1',
  'ext-sf-2': 'Exterior Storefront 2',
  'int-sf':   'Interior Storefront',
  'cap-cw':   'Captured Curtainwall',
  'ssg-cw':   'SSG Curtainwall',
};

/**
 * One distinct colour per system type so frame highlights are instantly
 * recognisable on the PDF canvas.
 */
export const SYSTEM_COLORS: Record<SystemType, string> = {
  'ext-sf-1': '#38bdf8',  // sky blue
  'ext-sf-2': '#a78bfa',  // violet
  'int-sf':   '#34d399',  // emerald
  'cap-cw':   '#fb923c',  // orange
  'ssg-cw':   '#f472b6',  // pink
};

// ── Domain Types ──────────────────────────────────────────────────────────────

/**
 * A glazing system definition — used for canvas colour coding and preview only.
 * Systems are created in Studio and referenced by RawTakeoff.systemId (optional).
 */
type ProjectSystem = {
  id:          string;
  name:        string;
  systemType:  SystemType;
  color:       string;
  profileKey?: ProfileKey;
};

// ── Screen 1 — Studio Capture ─────────────────────────────────────────────────

/**
 * Measurement type:
 *   'Area'  — a rectangular frame highlight (width × height in inches)
 *   'LF'    — a linear-foot measurement (e.g. a sill, head, or jamb line)
 *   'Count' — a discrete unit count marker (e.g. a door, hardware item)
 */
export type TakeoffType = 'Area' | 'LF' | 'Count';

/**
 * RawTakeoff — the immutable output of a Studio drawing action.
 *
 * Captures WHAT was measured and WHERE on the page.  Does NOT contain
 * engineering decisions (system archetype, grid layout, BOM).
 *
 * Shape coordinates are in PAGE-PIXEL space (72 DPI, matches PDF viewport).
 * Inch dimensions are derived at capture time using the active calibration.
 */
export type RawTakeoff = {
  /** Unique stable ID — referenced by EngineeredFrame.takeoffIds. */
  id:           string;
  /** ID of the canvas shape this takeoff was drawn from. */
  shapeId:      string;
  /** Page the shape lives on. */
  pageId:       string;
  /** Top-left X of the bounding box in page-pixel space. */
  x:            number;
  /** Top-left Y of the bounding box in page-pixel space. */
  y:            number;
  /** Bounding-box width in page-pixel space. */
  widthPx:      number;
  /** Bounding-box height in page-pixel space. */
  heightPx:     number;
  /** Real-world width in inches (calibration applied at capture time). */
  widthInches:  number;
  /** Real-world height in inches (calibration applied at capture time). */
  heightInches: number;
  /** Measurement category. */
  type:         TakeoffType;
  /** Optional display label (e.g. system name used at time of capture). */
  label?:       string;
  /**
   * Optional preview system assignment.
   * This is a VISUAL HINT only — it drives the canvas highlight colour.
   * Real engineering happens in EngineeredFrame.
   */
  systemId?:    string;
};

// ── Screen 2 — Builder Engineering ───────────────────────────────────────────

/**
 * EngineeredFrame — the output of the Builder "Inbox" workflow.
 *
 * One EngineeredFrame can aggregate multiple RawTakeoffs (e.g. the estimator
 * groups five identical storefront units from page 2 into a single master frame).
 * The FabricationBOM is computed from GridSpec × SystemArchetype × geometry.
 */
export type EngineeredFrame = {
  /** Unique ID. */
  id:         string;
  /** Human-readable label set by the estimator in Builder. */
  label:      string;
  /**
   * IDs of the RawTakeoffs that feed this engineered frame.
   * Quantity = takeoffIds.length when the BOM is priced out.
   */
  takeoffIds: string[];
  /**
   * The system archetype chosen in Builder (e.g. "Kawneer 350 SSG",
   * "YKK AP 500T").  Drives cut lengths, hardware, and vendor pricing.
   */
  archetype?: SystemArchetype;
  /**
   * Mullion grid layout — rows, cols, door bays, glass types.
   * Shared across all takeoffs in this frame (they must be dimensionally
   * compatible).
   */
  grid?:      GridSpec;
  /**
   * The computed fabrication BOM.  Re-generated whenever archetype/grid changes.
   * Null until the estimator runs "Generate BOM" in Builder.
   */
  bom?:       FabricationBOM;
};

// ── Custom System Cards ──────────────────────────────────────────────────────

/**
 * A lightweight reference to a highlight that feeds into a CustomSystemCard.
 * Stored in the card so Builder can display which drawings items were taken
 * from, and compute area/LF totals automatically.
 */
export type CustomHighlightRef = {
  shapeId:      string;
  pageId:       string;
  label?:       string;
  widthInches:  number;
  heightInches: number;
  /** Pre-computed area in square feet (w × h / 144) */
  areaSF:       number;
  /** Lineal-foot perimeter (2 × (w + h) / 12) — useful for some misc items */
  perimeterLF:  number;
};

/**
 * A "Custom System Card" — wraps misc scope items that don't fit into the
 * standard glazing archetypes (e.g. transaction windows, auto sliders,
 * sunshades, glazing-only items, fire-rated storefront).
 *
 * These cards are pushed to Builder via IPC and land in the
 * "Needs Attention" section for the estimator to price later.
 * They carry just enough data for Builder to show a pre-populated card:
 *  - Geometry refs from the drawing (highlights)
 *  - A category/name chosen by the estimator
 *  - Totals pre-computed from the highlight geometry
 */
export type CustomSystemCard = {
  id:          string;
  /** Estimator-defined name — e.g. "Transaction Windows", "Sunshades Lvl 2" */
  name:        string;
  /** Free-text description / scope note */
  description: string;
  /** ISO timestamp: when the card was created in Studio */
  createdAt:   string;
  /** ISO timestamp of last edit */
  updatedAt:   string;
  /** Highlights that feed this card (from the drawing) */
  highlights:  CustomHighlightRef[];
  /** Aggregate totals computed from highlights */
  totals: {
    count:       number;  // number of highlight items
    totalAreaSF: number;  // sum of areaSF
    totalLF:     number;  // sum of perimeterLF (or lengthInches for line shapes)
  };
};

// ── Frame Type Library ───────────────────────────────────────────────────────

/**
 * A FrameType is a fully-configured, parameterised frame definition created
 * once and reused N times via count dots.  This is the "Type-First" paradigm
 * that replaces drawing individual frame highlights for every instance.
 *
 * The estimator builds each unique frame elevation (e.g. "SF-1A — Main Entry")
 * here, then uses the Click Counter to place dots on the PDF wherever that
 * frame type appears.  The BOM is multiplied by dot count at sync time.
 */
export type FrameType = {
  /** Stable UUID */
  id:        string;
  /**
   * Estimator-defined mark / tag.  Typically matches the architect's mark
   * in the glazing schedule (e.g. "A", "SF-1A", "CW-3").
   */
  mark:      string;
  /** Descriptive name shown in the sidebar list. */
  name:      string;
  /**
   * Canvas dot colour.  Defaults to a rotating palette so each type is
   * visually distinct on the PDF.
   */
  color:     string;
  /**
   * Overall rough-opening / frame dimensions in decimal inches.
   * Used to seed the visual display and BOM engine.
   */
  widthInches:  number;
  heightInches: number;
  /** Number of bays (vertical glass columns). */
  bays:      number;
  /** Number of rows (horizontal glass rows). */
  rows:      number;
  /** System type label, e.g. "Storefront 4.5\" (Standard)". */
  systemLabel: string;
  /**
   * Glass type label, e.g. "1\" Low-E 366".
   * Stored for display; used by BOM engine.
   */
  glassType: string;
  /**
   * The computed FabricationBOM snapshot.
   * Stored at the time the type is saved so count-based sync never needs to
   * re-run the engine — it just multiplies bom × quantity.
   * Null until the estimator saves the type via FrameTypeCreator.
   */
  bom:       FabricationBOM | null;
  /** ISO timestamp */
  createdAt: string;
  updatedAt: string;
};

/**
 * A placed count dot on the PDF canvas for a specific FrameType.
 * Dots are the lightweight "N instances of this type appear here" markers.
 */
export type TypeCountDot = {
  id:           string;
  frameTypeId:  string;   // references FrameType.id
  pageId:       string;
  /** Page-pixel position at the dot centre. */
  position:     PagePoint;
  /**
   * Sequential instance number within this frame type (1, 2, 3...).
   * Used to display the count badge on the dot.
   */
  instanceNum:  number;
  note?:        string;   // optional per-dot note (e.g. "double-height on floor 2")
};

// ── Frame Type Library palette ────────────────────────────────────────────────

const TYPE_COLORS = [
  '#38bdf8', // sky-400
  '#f472b6', // pink-400
  '#34d399', // emerald-400
  '#fb923c', // orange-400
  '#a78bfa', // violet-400
  '#facc15', // yellow-400
  '#60a5fa', // blue-400
  '#f87171', // red-400
  '#4ade80', // green-400
  '#e879f9', // fuchsia-400
];

export function defaultTypeColor(index: number): string {
  return TYPE_COLORS[index % TYPE_COLORS.length];
}

// ── Legacy Count Entry ────────────────────────────────────────────────────────

/**
 * A single count takeoff entry linking a MarkerShape to a CountGroup.
 * Count markers remain Studio-only (they don't produce EngineeredFrames).
 */
type CountEntry = {
  id:           string;
  shapeId:      string;
  pageId:       string;
  systemId:     string;
  countGroupId: string;
  label?:       string;
};

// ── Store ─────────────────────────────────────────────────────────────────────

type ProjectState = {
  /** Glazing system definitions — used for canvas colour coding. */
  systems:          ProjectSystem[];
  /** Raw takeoffs captured in Studio — the Inbox source data. */
  inbox:            RawTakeoff[];
  /** Engineered frames assembled in Builder. */
  engineeredFrames: EngineeredFrame[];
  /** Count groups for discrete-unit markers. */
  countGroups:      CountGroup[];
  /** Count marker entries. */
  counts:           CountEntry[];
  /** Custom system cards for misc scope items (transaction windows, sunshades, etc.) */
  customSystemCards: CustomSystemCard[];
  /** ── Type Library ─── */
  /** Frame type definitions — configured once, counted many times. */
  frameTypes:       FrameType[];
  /** Count dots placed on the canvas for each frame type. */
  typeDots:         TypeCountDot[];

  // ── Systems ───────────────────────────────────────────────────────────────
  addSystem:    (systemType: SystemType, name?: string) => string;
  removeSystem: (systemId: string) => void;
  updateSystem: (systemId: string, patch: Partial<Pick<ProjectSystem, 'name' | 'profileKey'>>) => void;

  // ── Custom System Cards ───────────────────────────────────────────────────
  /** Create a new custom system card and return its id. */
  addCustomSystemCard:    (name: string, description?: string) => string;
  /** Remove a custom system card. */
  removeCustomSystemCard: (cardId: string) => void;
  /** Update card name/description. */
  updateCustomSystemCard: (cardId: string, patch: Partial<Pick<CustomSystemCard, 'name' | 'description'>>) => void;
  /** Append a highlight reference to an existing card. */
  addHighlightToCard:     (cardId: string, ref: CustomHighlightRef) => void;
  /** Remove a single highlight reference from a card. */
  removeHighlightFromCard: (cardId: string, shapeId: string) => void;
  /** Push all custom system cards to Builder via IPC. */
  syncCustomCardsToBuilder: () => void;

  // ── Inbox (RawTakeoffs) ───────────────────────────────────────────────────
  /** Capture a new takeoff from a Studio drawing. Returns the new takeoff id. */
  addTakeoff:              (entry: Omit<RawTakeoff, 'id'>) => string;
  removeTakeoff:           (takeoffId: string) => void;
  /** Remove all takeoffs for a canvas shape (call when the shape is deleted). */
  removeTakeoffsForShape:  (shapeId: string) => void;
  /** Update mutable fields on an existing takeoff (label, systemId). */
  updateTakeoff:           (takeoffId: string, patch: Partial<Pick<RawTakeoff, 'label' | 'systemId'>>) => void;

  // ── Engineered Frames ─────────────────────────────────────────────────────
  /** Create a new engineered frame from a set of inbox takeoff IDs. Returns the new frame id. */
  addEngineeredFrame:    (entry: Omit<EngineeredFrame, 'id'>) => string;
  removeEngineeredFrame: (frameId: string) => void;
  updateEngineeredFrame: (frameId: string, patch: Partial<Omit<EngineeredFrame, 'id'>>) => void;

  // ── Count Groups & Markers ────────────────────────────────────────────────
  addCountGroup:        (label?: string, color?: string) => string;
  removeCountGroup:     (groupId: string) => void;
  updateCountGroup:     (groupId: string, patch: Partial<Pick<CountGroup, 'label' | 'color'>>) => void;
  addCount:             (entry: Omit<CountEntry, 'id'>) => string;
  removeCount:          (countId: string) => void;
  removeCountsForShape: (shapeId: string) => void;

  // ── Frame Type Library ────────────────────────────────────────────────────
  addFrameType:         (entry: Omit<FrameType, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateFrameType:      (typeId: string, patch: Partial<Omit<FrameType, 'id' | 'createdAt'>>) => void;
  removeFrameType:      (typeId: string) => void;
  /** Place a count dot on the canvas for a frame type. Returns new dot id. */
  addTypeDot:           (entry: Omit<TypeCountDot, 'id' | 'instanceNum'>) => string;
  removeTypeDot:        (dotId: string) => void;
  /** Sync the full type library + counts to Builder via IPC. */
  syncFrameTypesToBuilder: () => void;

  /** Reset all project data (new PDF / new project). */
  resetProject: () => void;
};

// ── Cross-tab sync (Studio → Builder) ──────────────────────────────────────────
/**
 * Shared localStorage key.  Builder's useInboxSync hook listens for changes
 * to this key via the `storage` event and hydrates Builder's inbox in real-time.
 * Must match apps/builder/src/utils/launchStudio.ts `LS_INBOX_KEY`.
 */
const LS_INBOX_KEY = 'glazebid:inbox';

function syncInboxToStorage(inbox: RawTakeoff[]): void {
  try {
    localStorage.setItem(LS_INBOX_KEY, JSON.stringify(inbox));
  } catch {
    // Storage quota exceeded or unavailable — non-fatal.
  }
  // Push live update to Builder window via Electron IPC (works across origins).
  try {
    (window as unknown as { electron?: { syncInbox?: (inbox: unknown) => void } })
      .electron?.syncInbox?.(inbox);
  } catch {
    // Not in Electron context — no-op.
  }
}

const LS_CUSTOM_CARDS_KEY = 'glazebid:customSystemCards';

const LS_FRAME_TYPES_KEY  = 'glazebid:frameTypes';

function syncFrameTypesToStorage(types: FrameType[], dots: TypeCountDot[]): void {
  try {
    localStorage.setItem(LS_FRAME_TYPES_KEY, JSON.stringify({ types, dots }));
  } catch { /* quota exceeded — non-fatal */ }
  try {
    (window as unknown as { electron?: { syncFrameTypes?: (payload: unknown) => void } })
      .electron?.syncFrameTypes?.({ types, dots });
  } catch { /* not in Electron */ }
}

function syncCustomCardsToStorage(cards: CustomSystemCard[]): void {
  try {
    localStorage.setItem(LS_CUSTOM_CARDS_KEY, JSON.stringify(cards));
  } catch { /* quota exceeded — non-fatal */ }
  try {
    (window as unknown as { electron?: { syncCustomCards?: (cards: unknown) => void } })
      .electron?.syncCustomCards?.(cards);
  } catch { /* not in Electron */ }
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  systems:           [],
  inbox:             [],
  engineeredFrames:  [],
  countGroups:       [],
  counts:            [],
  customSystemCards: [],
  frameTypes:        [],
  typeDots:          [],

  // ── Systems ───────────────────────────────────────────────────────────────

  addSystem: (systemType, name) => {
    const id    = crypto.randomUUID();
    const label = name ?? `${SYSTEM_TYPE_LABELS[systemType]} ${id.slice(0, 4).toUpperCase()}`;
    const newSystem: ProjectSystem = {
      id,
      name:       label,
      systemType,
      color:      SYSTEM_COLORS[systemType],
      profileKey: DEFAULT_PROFILE_FOR_SYSTEM[systemType],
    };
    set(s => ({ systems: [...s.systems, newSystem] }));
    return id;
  },

  removeSystem: (systemId) =>
    set(s => ({
      systems: s.systems.filter(sys => sys.id !== systemId),
      // Clear the preview hint; takeoffs remain on canvas uncoloured.
      inbox: s.inbox.map(t =>
        t.systemId === systemId ? { ...t, systemId: undefined } : t,
      ),
    })),

  updateSystem: (systemId, patch) =>
    set(s => ({
      systems: s.systems.map(sys =>
        sys.id === systemId ? { ...sys, ...patch } : sys,
      ),
    })),

  // ── Inbox ─────────────────────────────────────────────────────────────────

  addTakeoff: (entry) => {
    const id = crypto.randomUUID();
    set(s => {
      const inbox = [...s.inbox, { ...entry, id }];
      syncInboxToStorage(inbox);
      return { inbox };
    });
    return id;
  },

  removeTakeoff: (takeoffId) =>
    set(s => {
      const inbox = s.inbox.filter(t => t.id !== takeoffId);
      syncInboxToStorage(inbox);
      return { inbox };
    }),

  removeTakeoffsForShape: (shapeId) =>
    set(s => {
      const inbox = s.inbox.filter(t => t.shapeId !== shapeId);
      syncInboxToStorage(inbox);
      return { inbox };
    }),

  updateTakeoff: (takeoffId, patch) =>
    set(s => ({
      inbox: s.inbox.map(t => t.id === takeoffId ? { ...t, ...patch } : t),
    })),

  // ── Engineered Frames ─────────────────────────────────────────────────────

  addEngineeredFrame: (entry) => {
    const id = crypto.randomUUID();
    set(s => ({ engineeredFrames: [...s.engineeredFrames, { ...entry, id }] }));
    return id;
  },

  removeEngineeredFrame: (frameId) =>
    set(s => ({
      engineeredFrames: s.engineeredFrames.filter(f => f.id !== frameId),
    })),

  updateEngineeredFrame: (frameId, patch) =>
    set(s => ({
      engineeredFrames: s.engineeredFrames.map(f =>
        f.id === frameId ? { ...f, ...patch } : f,
      ),
    })),

  // ── Count Groups & Markers ────────────────────────────────────────────────

  addCountGroup: (label, color) => {
    const id     = crypto.randomUUID();
    const groups = get().countGroups;
    const newGroup: CountGroup = {
      id,
      label: label ?? defaultGroupLabel(groups.length),
      color: color ?? defaultCountColor(groups.length),
    };
    set(s => ({ countGroups: [...s.countGroups, newGroup] }));
    return id;
  },

  removeCountGroup: (groupId) =>
    set(s => ({
      countGroups: s.countGroups.filter(g => g.id !== groupId),
      counts:      s.counts.map(c =>
        c.countGroupId === groupId ? { ...c, countGroupId: '' } : c,
      ),
    })),

  updateCountGroup: (groupId, patch) =>
    set(s => ({
      countGroups: s.countGroups.map(g =>
        g.id === groupId ? { ...g, ...patch } : g,
      ),
    })),

  addCount: (entry) => {
    const id = crypto.randomUUID();
    set(s => ({ counts: [...s.counts, { ...entry, id }] }));
    return id;
  },

  removeCount: (countId) =>
    set(s => ({ counts: s.counts.filter(c => c.id !== countId) })),

  removeCountsForShape: (shapeId) =>
    set(s => ({ counts: s.counts.filter(c => c.shapeId !== shapeId) })),

  // ── Custom System Cards ────────────────────────────────────────────────────

  addCustomSystemCard: (name, description = '') => {
    const now  = new Date().toISOString();
    const card: CustomSystemCard = {
      id:          crypto.randomUUID(),
      name,
      description,
      createdAt:   now,
      updatedAt:   now,
      highlights:  [],
      totals:      { count: 0, totalAreaSF: 0, totalLF: 0 },
    };
    set(s => {
      const cards = [...s.customSystemCards, card];
      syncCustomCardsToStorage(cards);
      return { customSystemCards: cards };
    });
    return card.id;
  },

  removeCustomSystemCard: (cardId) =>
    set(s => {
      const cards = s.customSystemCards.filter(c => c.id !== cardId);
      syncCustomCardsToStorage(cards);
      return { customSystemCards: cards };
    }),

  updateCustomSystemCard: (cardId, patch) =>
    set(s => {
      const cards = s.customSystemCards.map(c =>
        c.id === cardId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
      );
      syncCustomCardsToStorage(cards);
      return { customSystemCards: cards };
    }),

  addHighlightToCard: (cardId, ref) =>
    set(s => {
      const cards = s.customSystemCards.map(c => {
        if (c.id !== cardId) return c;
        // Avoid duplicates (same shapeId)
        if (c.highlights.some(h => h.shapeId === ref.shapeId)) return c;
        const highlights = [...c.highlights, ref];
        return {
          ...c,
          highlights,
          updatedAt: new Date().toISOString(),
          totals: {
            count:       highlights.length,
            totalAreaSF: highlights.reduce((sum, h) => sum + h.areaSF, 0),
            totalLF:     highlights.reduce((sum, h) => sum + h.perimeterLF, 0),
          },
        };
      });
      syncCustomCardsToStorage(cards);
      return { customSystemCards: cards };
    }),

  removeHighlightFromCard: (cardId, shapeId) =>
    set(s => {
      const cards = s.customSystemCards.map(c => {
        if (c.id !== cardId) return c;
        const highlights = c.highlights.filter(h => h.shapeId !== shapeId);
        return {
          ...c,
          highlights,
          updatedAt: new Date().toISOString(),
          totals: {
            count:       highlights.length,
            totalAreaSF: highlights.reduce((sum, h) => sum + h.areaSF, 0),
            totalLF:     highlights.reduce((sum, h) => sum + h.perimeterLF, 0),
          },
        };
      });
      syncCustomCardsToStorage(cards);
      return { customSystemCards: cards };
    }),

  syncCustomCardsToBuilder: () => {
    syncCustomCardsToStorage(get().customSystemCards);
  },

  // ── Frame Type Library ────────────────────────────────────────────────────

  addFrameType: (entry) => {
    const now = new Date().toISOString();
    const ft: FrameType = {
      ...entry,
      id:        crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    set(s => {
      const frameTypes = [...s.frameTypes, ft];
      syncFrameTypesToStorage(frameTypes, s.typeDots);
      return { frameTypes };
    });
    return ft.id;
  },

  updateFrameType: (typeId, patch) =>
    set(s => {
      const frameTypes = s.frameTypes.map(ft =>
        ft.id === typeId ? { ...ft, ...patch, updatedAt: new Date().toISOString() } : ft,
      );
      syncFrameTypesToStorage(frameTypes, s.typeDots);
      return { frameTypes };
    }),

  removeFrameType: (typeId) =>
    set(s => {
      const frameTypes = s.frameTypes.filter(ft => ft.id !== typeId);
      const typeDots   = s.typeDots.filter(d => d.frameTypeId !== typeId);
      syncFrameTypesToStorage(frameTypes, typeDots);
      return { frameTypes, typeDots };
    }),

  addTypeDot: (entry) => {
    const id = crypto.randomUUID();
    set(s => {
      // Instance number = how many dots already exist for this type on this page + 1
      const existing = s.typeDots.filter(d => d.frameTypeId === entry.frameTypeId);
      const instanceNum = existing.length + 1;
      const typeDots = [...s.typeDots, { ...entry, id, instanceNum }];
      syncFrameTypesToStorage(s.frameTypes, typeDots);
      return { typeDots };
    });
    return id;
  },

  removeTypeDot: (dotId) =>
    set(s => {
      const typeDots = s.typeDots.filter(d => d.id !== dotId);
      syncFrameTypesToStorage(s.frameTypes, typeDots);
      return { typeDots };
    }),

  syncFrameTypesToBuilder: () => {
    const { frameTypes, typeDots } = get();
    syncFrameTypesToStorage(frameTypes, typeDots);
  },

  resetProject: () => {
    try { localStorage.removeItem(LS_INBOX_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(LS_CUSTOM_CARDS_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(LS_FRAME_TYPES_KEY); } catch { /* ignore */ }
    try {
      (window as unknown as { electron?: { syncInbox?: (inbox: unknown) => void } })
        .electron?.syncInbox?.([]);
    } catch { /* not in Electron */ }
    set({ systems: [], inbox: [], engineeredFrames: [], countGroups: [], counts: [], customSystemCards: [], frameTypes: [], typeDots: [] });
  },
}));
