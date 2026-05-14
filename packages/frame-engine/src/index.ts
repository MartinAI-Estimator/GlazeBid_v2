/**
 * @glazebid/frame-engine
 *
 * Shared parametric frame engine for GlazeBid v2.
 * Consumed by both apps/builder (JSX, port 5173) and apps/studio (TSX, port 5174).
 *
 * Import pattern:
 *   import { resolveFrameBOM, ARCHETYPE_CATALOG, type FrameEngineeringPackage }
 *     from '@glazebid/frame-engine';
 *
 * Modules:
 *   types/         — All TypeScript types and constants
 *   archetypes/    — SystemArchetype + VendorSystem catalogs (11 archetypes, 12 vendors)
 *   fabricationRules/ — Pure cut-list engine, bar optimization, caulk calculator
 *   bomResolver/   — High-level FrameEngineeringPackage resolver
 *   panelLayout/   — All-glass wall panel layout engine (EQUAL/LINKED/LOCKED)
 *   structural/    — ASCE 7-22 structural analysis engine
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  FrameGeometryType,
  ScopeTag,
  SystemClass,
  WallSubstrate,
  HeadCondition,
  StructuralStatus,
  FinishType,
  ConnectionType,
  FrameIdentity,
  FrameGroup,
  FrameGeometry,
  BayType,
  BayConfig,
  RowConfig,
  FrameGrid,
  FrameContext,
  GlassSpec,
  BOMLine,
  GlassScheduleRow,
  AccessoryLine,
  SealantType,
  SealantLine,
  BrakeMetalLine,
  LaborSummary,
  DoorPackage,
  StructuralResult,
  AlternateBOM,
  FrameEngineeringPackage,
  AllGlassPanelState,
  AllGlassPanel,
  AllGlassWall,
  FrameChangeType,
  FrameDiff,
  RevisionRecord,
  MetalTakeoffRecord,
} from './types/index';

export {
  FINISH_MULTIPLIERS,
  SCRAP_THRESHOLDS,
  MINIMUM_PANEL_WIDTH_INCHES,
  DOOR_LABOR_HOURS,
  SHOP_MHS_PER_SF,
  FIELD_MHS_PER_SF,
} from './types/index';

// ── Archetypes ────────────────────────────────────────────────────────────────
export type {
  SystemCategory,
  SystemArchetype,
  PartRole,
  VendorPartEntry,
  VendorSystem,
} from './archetypes/index';

export {
  ARCHETYPE_CATALOG,
  VENDOR_CATALOG,
  getVendorsForArchetype,
  getArchetype,
  getVendorSystem,
  getArchetypesByCategory,
} from './archetypes/index';

// ── Fabrication Rules ─────────────────────────────────────────────────────────
export type {
  FabricationRules,
  CutListEntry,
} from './fabricationRules/index';

export {
  DEFAULT_FRAMED_RULES,
  fmtIn,
  computeFabricationCutList,
  computeBarOptimization,
  computeCaulkSausages,
} from './fabricationRules/index';

// ── BOM Resolver ──────────────────────────────────────────────────────────────
export {
  resolveFrameBOM,
  resolveMultipleFrames,
} from './bomResolver/index';

// ── Panel Layout (All-Glass) ──────────────────────────────────────────────────
export type {
  PanelState,
  Panel,
  WallLayout,
  ValidationResult,
  LayoutResult,
} from './panelLayout/index';

export {
  redistributePanels,
  addPanel,
  removePanel,
  setPanelWidth,
  linkPanels,
  unlinkPanels,
  toggleDoorPanel,
  createDefaultLayout,
  computeAllGlassBOM,
} from './panelLayout/index';

// ── Structural Analysis ───────────────────────────────────────────────────
export type {
  ExposureCategory,
  StructuralInput,
  HSSRecommendation,
  StructuralAnalysisResult,
} from './structural/index';

export {
  analyzeStructural,
  getDeflectionLimit,
  interpolateKz,
} from './structural/index';
