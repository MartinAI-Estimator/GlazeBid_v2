/**
 * @fileoverview GlazeBid v2 Frame Engine — Complete Type Definitions
 *
 * This module exports all TypeScript types and constants required by the parametric
 * frame builder engine. These types define the complete contract between:
 *   - Studio (frame geometry capture, glass takeoff, structural analysis)
 *   - Builder (costing, BOM aggregation, pricing)
 *   - Electron main (IPC data structures)
 *
 * All types are self-contained here. Other modules import FROM this file, never vice versa.
 *
 * Key contracts:
 *   - FrameEngineeringPackage: output of the entire frame builder pipeline
 *   - RawTakeoff + FrameGeometry: Studio frame geometry input
 *   - BOMLine + GlassScheduleRow: material cost groups in Builder
 */

// ============================================================================
// 1. ENUMS AND UNION TYPES
// ============================================================================

/**
 * Frame geometry shape types — used by both parametric and custom geometry paths.
 * "Raked" = variable height per side (left/right). "Arched-head" = half-circle top.
 * "Full-arch" = entire frame is circular. "Ribbon" = horizontal glass ribbon (minimal height).
 */
export type FrameGeometryType =
  | 'rectangular'
  | 'raked'
  | 'arched-head'
  | 'full-arch'
  | 'circle'
  | 'triangle'
  | 'custom-polygon'
  | 'ribbon';

/**
 * Scope tag classifies each frame by bid phase.
 * BASE_BID = main estimate. ALT_1/2 = value engineering or upgrade alternates.
 * ALLOWANCE = contingency line item (will not generate detailed BOM).
 */
export type ScopeTag = 'BASE_BID' | 'ALT_1' | 'ALT_2' | 'ALLOWANCE';

/**
 * System class sets the framing family — determines member profiles, connections, and wind/deflection limits.
 * ext-storefront: exterior entrance. cap-curtainwall: column-and-spandrel. ssg: stick-system glass.
 * int-storefront: interior partition. all-glass: no aluminum frame (curtain wall only).
 */
export type SystemClass =
  | 'ext-storefront'
  | 'cap-curtainwall'
  | 'ssg-curtainwall'
  | 'int-storefront'
  | 'all-glass';

/**
 * Wall substrate type — describes the surrounding construction context.
 * Used for connection planning and CAD context generation.
 */
export type WallSubstrate = 'CMU' | 'concrete' | 'stud' | 'steel';

/**
 * Head condition — structural support at top of frame.
 * 'soffit' = exposed soffit (lowest head). 'structure' = above deck/beam.
 * 'open' = roof membrane or exterior (highest wind/deflection demands).
 */
export type HeadCondition = 'soffit' | 'structure' | 'open';

/**
 * Structural advisor decision ladder result.
 * PASS = chosen profile is adequate. ADD_STEEL = add horizontal reinforcement at mid-height.
 * UPGRADE_PROFILE = choose next larger profile. ENGINEER_REQUIRED = custom analysis needed.
 */
export type StructuralStatus = 'PASS' | 'ADD_STEEL' | 'UPGRADE_PROFILE' | 'ENGINEER_REQUIRED';

/**
 * Aluminum finish type — determines cost multiplier and shop processing steps.
 * clear-anod: clear anodized (baseline). dark-bronze: bronze anodize. black-anod: black anodize.
 * two-coat-paint: polyester. three-coat-kynar: PVDF coating. custom: user-supplied multiplier.
 */
export type FinishType =
  | 'clear-anod'
  | 'dark-bronze'
  | 'black-anod'
  | 'two-coat-paint'
  | 'three-coat-kynar'
  | 'custom';

/**
 * Connection type — how vertical mullions connect to head/sill and horizontals to mullions.
 * screw-spline: spline + stainless screws. shear-block: shear block + gasket.
 */
export type ConnectionType = 'screw-spline' | 'shear-block';

// ============================================================================
// 2. FRAME IDENTITY — Metadata and Identification Block
// ============================================================================

/**
 * FrameIdentity — the identity/metadata block for a single frame.
 * Links a frame to its group, system, and bid phase. Mark must match architectural drawing annotations.
 * sillAFF = distance in decimal inches from finished floor to bottom of frame.
 * isMockup = true if this frame is for mockup only (doesn't go in final project).
 */
export type FrameIdentity = {
  /** UUID, unique across all frames in the project */
  frameId: string;
  /** Mark from architectural drawings, e.g. "A-1", "SF-3", "CW-12" */
  mark: string;
  /** Which FrameGroup this frame belongs to (cascades system, finish, glass) */
  groupId: string;
  /** Optional elevation group ID when toggle is enabled */
  elevationId?: string;
  /** System class: storefront, curtainwall, etc. */
  systemClass: SystemClass;
  /** Bid phase classification */
  scopeTag: ScopeTag;
  /** Number of identical frames at this mark */
  quantity: number;
  /** Sill height above finished floor, in decimal inches */
  sillAFF: number;
  /** True if this frame is for mockup only (excluded from final BOM) */
  isMockup: boolean;
  /** Free-form notes from estimator about this frame */
  estimatorNotes: string;
};

// ============================================================================
// 3. FRAME GROUP — System/Finish/Glass Cascade
// ============================================================================

/**
 * FrameGroup — defines the system, finish, connection type, and glass spec
 * that cascades to all member frames in the group.
 * All frames in a group share the same BOM profile set, finish multiplier, and glass spec.
 */
export type FrameGroup = {
  /** UUID, unique across all groups in the project */
  groupId: string;
  /** User-friendly name, e.g. "Main Storefront", "Lobby Curtainwall" */
  name: string;
  /** Which archetype (profile library) this group uses */
  archetypeId: string;
  /** Primary vendor system ID (e.g., Kawneer 1600 system) */
  vendorSystemId: string;
  /** First alternate vendor (for alternate pricing) */
  altVendor1Id?: string;
  /** Second alternate vendor (for alternate pricing) */
  altVendor2Id?: string;
  /** Finish type for all aluminum in this group */
  finishType: FinishType;
  /** Custom finish name (if finishType === 'custom') */
  customFinishName?: string;
  /** Connection method: screw-spline or shear-block */
  connectionType: ConnectionType;
  /** References a GlassSpec.specId — all frames in group use this glass makeup */
  glassSpecId: string;
};

// ============================================================================
// 4. FRAME GEOMETRY — Physical Dimensions and Shape
// ============================================================================

/**
 * FrameGeometry — physical frame dimensions and shape definition.
 * For rectangular frames, only widthInches and heightInches are used.
 * For raked frames, leftHeightInches and rightHeightInches override heightInches.
 * jointWidthInches = mullion width (default 0.25") used in glass size calculations.
 * glassBiteOverride = if set, replaces the archetype's default glass bite (min 1.25").
 */
export type FrameGeometry = {
  /** Overall shape type */
  shape: FrameGeometryType;
  /** Overall width in decimal inches */
  widthInches: number;
  /** Overall height in decimal inches (not used if raked) */
  heightInches: number;
  /** Left side height for raked frames, in decimal inches */
  leftHeightInches?: number;
  /** Right side height for raked frames, in decimal inches */
  rightHeightInches?: number;
  /** Mullion width in decimal inches, used to calculate glass sizes (default 0.25) */
  jointWidthInches: number;
  /** If set, overrides the archetype glass bite for this frame only */
  glassBiteOverride?: number;
};

// ============================================================================
// 5. FRAME GRID — Bay and Row Configuration
// ============================================================================

/**
 * BayType — classification of a vertical division (bay).
 * 'glazing' = standard glass bay. 'door-single' = single door opening.
 * 'door-pair' = double door opening.
 */
export type BayType = 'glazing' | 'door-single' | 'door-pair';

/**
 * BayConfig — configuration for one vertical bay.
 * If widthOverride is not set, the bay width is auto-distributed across remaining space.
 */
export type BayConfig = {
  /** 0-based bay index (left to right) */
  index: number;
  /** If set, override auto-distributed width for this bay only, in inches */
  widthOverride?: number;
  /** Type of bay (glazing, door-single, or door-pair) */
  type: BayType;
};

/**
 * RowConfig — configuration for one horizontal row.
 * If heightOverride is not set, the row height is auto-distributed across remaining space.
 */
export type RowConfig = {
  /** 0-based row index (bottom to top) */
  index: number;
  /** If set, override auto-distributed height for this row only, in inches */
  heightOverride?: number;
};

/**
 * FrameGrid — bay and row configuration for parametric frame generation.
 * bays = total number of vertical divisions. rows = total number of horizontal divisions.
 * bayConfigs and rowConfigs must have length equal to bays and rows respectively.
 */
export type FrameGrid = {
  /** Total number of vertical bays (divisions) */
  bays: number;
  /** Total number of horizontal rows (divisions) */
  rows: number;
  /** Configuration for each bay; length must equal bays */
  bayConfigs: BayConfig[];
  /** Configuration for each row; length must equal rows */
  rowConfigs: RowConfig[];
};

// ============================================================================
// 6. FRAME CONTEXT — Surrounding Construction Context
// ============================================================================

/**
 * FrameContext — metadata about the surrounding construction and structural conditions.
 * Used for CAD context rendering, connection planning, and structural analysis.
 * interiorSide indicates which side of the frame faces the interior (for CAD orientation).
 */
export type FrameContext = {
  /** Type of wall substrate adjacent to frame (CMU, concrete, stud, steel) */
  wallSubstrate: WallSubstrate;
  /** Head condition: soffit, structure, or open roof */
  headCondition: HeadCondition;
  /** True if another frame is immediately to the left (adjacent mullion required) */
  hasAdjacentFrameLeft: boolean;
  /** True if another frame is immediately to the right (adjacent mullion required) */
  hasAdjacentFrameRight: boolean;
  /** Which side of the frame faces the interior ('left' or 'right') */
  interiorSide: 'left' | 'right';
};

// ============================================================================
// 7. GLASS SPEC — Named Glass Specification
// ============================================================================

/**
 * GlassSpec — a named glass makeup (unit assembly) used throughout the project.
 * thickness = total unit thickness (e.g., 1.25" for double-insulated, 0.5" for single).
 * makeup = human-readable layer description, e.g. "1/4\" Clear + 1/2\" Argon + 1/4\" Clear".
 * isTempered/hasLaminate = processing flags. tintCode = optional tint identifier.
 */
export type GlassSpec = {
  /** Unique ID within project, e.g. "GL-1" */
  specId: string;
  /** Display name, e.g. "1\" Clear Insulated" */
  name: string;
  /** Human-readable layer description, e.g. "1/4\" Clear + 1/2\" Air + 1/4\" Clear" */
  makeup: string;
  /** Total unit thickness in decimal inches */
  thickness: number;
  /** U-value for thermal performance (optional) */
  uValue?: number;
  /** Solar heat gain coefficient (optional) */
  shgc?: number;
  /** True if any pane is tempered */
  isTempered: boolean;
  /** True if any layer is laminated */
  hasLaminate: boolean;
  /** Tint code, e.g. "grey", "bronze", "green" (optional) */
  tintCode?: string;
};

// ============================================================================
// 8. BOM LINE — Aluminum Material BOM Line Item
// ============================================================================

/**
 * BOMLine — a single line in the aluminum material takeoff and costing.
 * Represents one member type (e.g., "3\" x 1.75\" Head Profile, 16ga").
 * totalLF = total linear feet needed across all frames.
 * barsRequired = number of 21' or 24' stock bars needed (with scrap allowance).
 * extCost = totalLbs × listPrice × finishMultiplier.
 */
export type BOMLine = {
  /** Vendor part number, e.g. "KAW-1606-H" */
  partNumber: string;
  /** Human-readable description, e.g. "3\" × 1.75\" Head Profile, 16ga Clear Anodized" */
  description: string;
  /** Member role in frame (HEAD, JAMB, SILL, VERTICAL_MULLION, HORIZONTAL_MULLION, etc.) */
  role: string;
  /** Total linear feet needed across all frames using this profile */
  totalLF: number;
  /** Number of stock bars (21' or 24' length) needed including scrap allowance */
  barsRequired: number;
  /** Weight in lbs per linear foot */
  lbsPerFt: number;
  /** Total weight: totalLF × lbsPerFt */
  totalLbs: number;
  /** List price per pound (before finish markup) */
  listPrice: number;
  /** Finish multiplier, e.g. 1.0 (clear anod), 1.25 (PVDF) */
  finishMultiplier: number;
  /** Extended cost: totalLbs × listPrice × finishMultiplier */
  extCost: number;
};

// ============================================================================
// 9. GLASS SCHEDULE ROW — Glass Takeout Line Item
// ============================================================================

/**
 * GlassScheduleRow — one line in the glass takeout sheet.
 * mark = e.g. "GL-1-A" (tying back to frame marks). One mark can have multiple rows
 * if different sizes or shapes are cut. sqft = calculated from width × height.
 * edgeWork = optional finishing (polished, seamed, arrised) affects labor cost.
 */
export type GlassScheduleRow = {
  /** Glass mark from shop drawing, e.g. "GL-1-A", "GL-2-B" */
  mark: string;
  /** Pane width in decimal inches (measured on centerline of frame) */
  widthInches: number;
  /** Pane height in decimal inches (measured on centerline of frame) */
  heightInches: number;
  /** Shape of this glass piece (rectangular, arched-head, triangle, etc.) */
  shape: FrameGeometryType;
  /** Which GlassSpec this pane uses (references GlassSpec.specId) */
  glassSpecId: string;
  /** How many of this exact size/shape are needed */
  quantity: number;
  /** Calculated square footage: (widthInches × heightInches × quantity) / 144 */
  sqft: number;
  /** True if this glass unit is tempered */
  isTempered: boolean;
  /** True if this is a spandrel (opaque) piece */
  isSpandrel: boolean;
  /** Optional edge work: 'polished', 'seamed', 'arrised' */
  edgeWork?: string;
  /** Price per square foot (filled by vendor quote) */
  pricePerSqFt?: number;
  /** Extended cost: sqft × pricePerSqFt */
  extCost?: number;
};

// ============================================================================
// 10. ACCESSORY LINE — Hardware and Sundries
// ============================================================================

/**
 * AccessoryLine — hardware, fasteners, gaskets, and other sundries.
 * unit = unit of measure: EA (each), LF (linear foot), SF (square foot), PR (pair), SET.
 */
export type AccessoryLine = {
  /** Vendor part number */
  partNumber: string;
  /** Description, e.g. "Stainless Steel Screw 1/2\" #10" */
  description: string;
  /** Unit of measure: EA, LF, SF, PR, or SET */
  unit: 'EA' | 'LF' | 'SF' | 'PR' | 'SET';
  /** Quantity in specified units */
  quantity: number;
  /** Cost per unit */
  unitCost: number;
  /** Extended cost: quantity × unitCost */
  extCost: number;
};

// ============================================================================
// 11. SEALANT LINE — Sealant and Gasket Takeoff
// ============================================================================

/**
 * SealantType — identifies the sealant product and application.
 */
export type SealantType =
  | 'silicone-exterior'
  | 'latex-interior'
  | 'structural-silicone'
  | 'urethane-sill'
  | 'latex-head';

/**
 * SealantLine — one sealant product and quantity.
 * jointLF = total linear feet of joint to seal.
 * sausageCount = number of 20oz sausages required (standard unit in glazing).
 */
export type SealantLine = {
  /** Type of sealant product */
  type: SealantType;
  /** Total linear feet of joint to seal across all frames */
  jointLF: number;
  /** Number of 20oz sausages (standard glazing unit) needed */
  sausageCount: number;
  /** Cost per sausage */
  unitCost: number;
  /** Extended cost: sausageCount × unitCost */
  extCost: number;
};

// ============================================================================
// 12. BRAKE METAL LINE — Custom Sheet Metal
// ============================================================================

/**
 * BrakeMetalLine — custom sheet metal fabrication items (sill caps, head caps, etc.).
 * flatPatternLF = the flat pattern length before bending (used for nesting and labor).
 * sqft = developed surface area before bending.
 */
export type BrakeMetalLine = {
  /** Condition/location, e.g. "Sill Cap", "Head Cap", "Exterior Trim" */
  condition: string;
  /** Profile name or description, e.g. "12\" × 2\" Standing Seam" */
  profileName: string;
  /** Total linear feet of this component needed */
  totalLF: number;
  /** Flat pattern length before bending, in linear feet */
  flatPatternLF: number;
  /** Developed surface area in square feet */
  sqft: number;
  /** Total weight in pounds */
  weightLbs: number;
  /** Total fabrication and material cost */
  cost: number;
};

// ============================================================================
// 13. LABOR SUMMARY — Shop and Field Labor
// ============================================================================

/**
 * LaborSummary — labor hour breakdown by phase.
 * All hours are in decimal format (e.g., 8.5 hours = 8 hours 30 minutes).
 */
export type LaborSummary = {
  /** Total man-hours for shop fabrication (cutting, drilling, assembly) */
  shopHours: number;
  /** Total man-hours for distribution/transportation */
  distHours: number;
  /** Total man-hours for field installation and adjustment */
  fieldHours: number;
};

// ============================================================================
// 14. DOOR PACKAGE — Door Hardware Summary
// ============================================================================

/**
 * DoorPackage — hardware and costing for one door opening.
 * mark = e.g. "D-1". hardwareSet = identifying name of hardware group.
 * laborHours = installation hours for this door only.
 */
export type DoorPackage = {
  /** Door mark from frame mark, e.g. "D-1" */
  mark: string;
  /** Hardware group identifier, e.g. "HD-DORMA-ESA-3000" */
  hardwareSet: string;
  /** Material cost for this door including frame, hardware, and gaskets */
  materialCost: number;
  /** Installation labor hours for this door opening only */
  laborHours: number;
};

// ============================================================================
// 15. STRUCTURAL RESULT — Structural Adequacy Analysis
// ============================================================================

/**
 * StructuralResult — output of the structural advisor decision ladder.
 * status tells the estimator whether additional work (steel, profile upgrade, engineering) is needed.
 * windPressurePsf and deflectionRatio are calculated from code tables based on location and frame size.
 */
export type StructuralResult = {
  /** Overall structural status (PASS, ADD_STEEL, UPGRADE_PROFILE, ENGINEER_REQUIRED) */
  status: StructuralStatus;
  /** Recommended steel reinforcement spec if status === ADD_STEEL, e.g. "1.5\"×1.5\"×11ga HSS" */
  steelSpec?: string;
  /** Recommended deeper profile if status === UPGRADE_PROFILE, e.g. "4\" × 2\" Head" */
  upgradeSpec?: string;
  /** Auto-generated text for inclusion in shop drawing note block */
  noteForShops?: string;
  /** Design wind pressure in psf (informational) */
  windPressurePsf?: number;
  /** Span-to-deflection ratio, e.g. 175 means L/175 deflection limit */
  deflectionRatio?: number;
};

// ============================================================================
// 16. ALTERNATE BOM — One Vendor Alternate Pricing
// ============================================================================

/**
 * AlternateBOM — complete BOM (aluminum, glass, hardware, sealant) for one vendor alternate.
 * scopeTag allows different vendors for different bid phases (e.g., ALT_1 uses vendor X).
 * totalMaterialCost = sum of all material costs in this alternate.
 */
export type AlternateBOM = {
  /** Vendor system ID for this alternate (may differ from primary) */
  vendorSystemId: string;
  /** Scope tag (BASE_BID, ALT_1, ALT_2) — allows different vendors per phase */
  scopeTag: ScopeTag;
  /** Aluminum BOM lines for this vendor */
  bomLines: BOMLine[];
  /** Glass takeout schedule for this vendor */
  glassSchedule: GlassScheduleRow[];
  /** Accessories (hardware, fasteners) for this vendor */
  accessories: AccessoryLine[];
  /** Total material cost across all categories in this alternate */
  totalMaterialCost: number;
};

// ============================================================================
// 17. FRAME ENGINEERING PACKAGE — THE PRIMARY OUTPUT CONTRACT
// ============================================================================

/**
 * FrameEngineeringPackage — complete engineering and costing package for one frame (or frame mark).
 *
 * THIS IS THE OUTPUT CONTRACT between Frame Engine and Builder application.
 * Builder's Zustand store (useBidStore) receives this type and distributes costs
 * to appropriate pricing groups (aluminum, glass, hardware, sealant, labor, doors, etc.).
 *
 * All arrays (bomLines, glassSchedule, accessories, sealant, brakeMetal, doors, alternates)
 * are aggregated across all instances of this frame mark (quantity is accounted for).
 *
 * @example
 * // Studio generates frame marks with takeoff data → calls Builder IPC
 * // Builder receives FrameEngineeringPackage[] → adds to bid sheet
 * // Bid sheet uses bomLines[].extCost, glassSchedule[].extCost, etc. for totals
 */
export type FrameEngineeringPackage = {
  /** Frame ID (uuid) */
  frameId: string;
  /** Frame mark from architectural drawing (e.g., "A-1", "SF-3") */
  mark: string;
  /** Frame group name (e.g., "Main Storefront") */
  group: string;
  /** Bid phase classification */
  scopeTag: ScopeTag;
  /** Number of identical frames at this mark */
  quantity: number;

  // ─── Material Cost Groups (populate Builder's cost engine) ───────────────

  /** Aluminum member BOM — Builder aggregates these into material cost group */
  bomLines: BOMLine[];

  /** Glass takeout schedule — Builder aggregates into glass cost group */
  glassSchedule: GlassScheduleRow[];

  /** Hardware, fasteners, gaskets — Builder aggregates into sundries cost group */
  accessories: AccessoryLine[];

  /** Sealants and gaskets — Builder aggregates into sealant cost group */
  sealant: SealantLine[];

  /** Custom sheet metal — Builder aggregates into metal cost group */
  brakeMetal: BrakeMetalLine[];

  // ─── Labor and Hardware ────────────────────────────────────────────────────

  /** Labor breakdown — Builder passes to labor pricing engine */
  labor: LaborSummary;

  /** Door openings and hardware — Builder aggregates into hardware cost group */
  doors: DoorPackage[];

  // ─── Alternates and Structural ─────────────────────────────────────────────

  /** Alternate vendor pricing (for ALT_1, ALT_2 bid columns) */
  alternates: AlternateBOM[];

  /** Structural analysis result — included in shop drawing notes */
  structural: StructuralResult;
};

// ============================================================================
// 18. ALL-GLASS WALL TYPES
// ============================================================================

/**
 * AllGlassPanelState — adjustment mode for an all-glass panel.
 * EQUAL = auto-size, width shared equally with linked siblings.
 * LINKED = width tied to a link group, adjusts with group siblings.
 * LOCKED = user-specified fixed width, does not resize.
 */
export type AllGlassPanelState = 'EQUAL' | 'LINKED' | 'LOCKED';

/**
 * AllGlassPanel — one glass panel in an all-glass wall (no aluminum frame).
 * Panels are arranged vertically side-by-side. isDoor = true if this position holds a door frame.
 */
export type AllGlassPanel = {
  /** UUID for this panel */
  panelId: string;
  /** 0-based index left to right */
  index: number;
  /** Panel width in decimal inches */
  widthInches: number;
  /** Adjustment state: EQUAL, LINKED, or LOCKED */
  state: AllGlassPanelState;
  /** Link group ID — panels in same group resize together (for LINKED state) */
  linkGroupId?: string;
  /** True if this panel position holds a door opening (no glass) */
  isDoor: boolean;
  /** Which GlassSpec this panel uses (if not a door) */
  glassSpecId: string;
  /** Edge finish: polished, seamed, or arrised */
  edgeWork: 'polished' | 'seamed' | 'arrised';
};

/**
 * AllGlassWall — an all-glass wall assembly (no aluminum framing).
 * Used for modern glass curtainwall and all-glass storefronts.
 * Hardware (point fixtures, patch fittings, hinges) defined by hardwareVendorId.
 */
export type AllGlassWall = {
  /** UUID for this wall assembly */
  wallId: string;
  /** Drawing mark, e.g. "AGW-1" */
  mark: string;
  /** Total horizontal run in linear feet */
  totalRunLF: number;
  /** Wall height in decimal inches */
  heightInches: number;
  /** Array of glass panels arranged left to right */
  panels: AllGlassPanel[];
  /** Butt joint width (gap between panels) in decimal inches */
  jointWidthInches: number;
  /** Hardware vendor identifier, e.g. 'crl', 'dorma', 'assa-abloy', 'blumcraft' */
  hardwareVendorId: string;
  /** Glass pane thickness in decimal inches (e.g., 0.5, 0.625, 0.75, 1.0) */
  glassThicknessIn: number;
};

// ============================================================================
// 19. REVISION RECORD — Change Tracking
// ============================================================================

/**
 * FrameChangeType — the nature of a frame change detected during re-takeoff.
 */
export type FrameChangeType = 'added' | 'removed' | 'modified';

/**
 * FrameDiff — one frame change in a revision.
 * Used to track what changed when a project is re-takeoff'd from updated drawings.
 */
export type FrameDiff = {
  /** Frame mark that changed */
  mark: string;
  /** Type of change (added, removed, or modified) */
  changeType: FrameChangeType;
  /** Width change in inches (positive = wider) */
  widthDelta?: number;
  /** Height change in inches (positive = taller) */
  heightDelta?: number;
  /** Free-form notes about this change */
  notes?: string;
};

/**
 * RevisionRecord — one revision cycle of the takeoff.
 * Tracks all changes made in this revision, source (studio or manual), and acceptance status.
 */
export type RevisionRecord = {
  /** UUID for this revision */
  revisionId: string;
  /** ISO 8601 timestamp of revision creation */
  timestamp: string;
  /** Source: 'studio-takeoff' (auto from Studio), or 'manual' (entered by estimator) */
  source: 'studio-takeoff' | 'manual';
  /** Human-readable summary, e.g. "Rev 2 — 14 frames changed" */
  summary: string;
  /** Array of individual frame changes */
  diffs: FrameDiff[];
  /** True if estimator has reviewed and accepted this revision */
  accepted: boolean;
};

// ============================================================================
// 20. METAL TAKEOFF RECORD — Material List Line Item
// ============================================================================

/**
 * MetalTakeoffRecord — one row in the Material Takeoff List (shop ordering sheet).
 * Tracks scrap percentage and color-coded status (green < 8%, yellow 8-10%, red > 10%).
 * Used for inventory planning and material waste analysis.
 */
export type MetalTakeoffRecord = {
  /** Vendor part number */
  partNumber: string;
  /** Full description with gauge and finish, e.g. "3\" × 1.75\" Head Profile 16ga Clear Anod" */
  description: string;
  /** Member role (HEAD, JAMB, SILL, MULLION, etc.) */
  role: string;
  /** Total linear feet needed for all frames */
  totalLFNeeded: number;
  /** Stock bar length chosen: 21 feet or 24 feet */
  stockLengthFt: 21 | 24;
  /** Number of stock bars required (including scrap allowance) */
  barsRequired: number;
  /** Scrap percentage calculated (0-100) */
  scrapPercent: number;
  /** Color-coded scrap status: green (<8%), yellow (8-10%), red (>10%) */
  scrapStatus: 'green' | 'yellow' | 'red';
  /** Weight per linear foot */
  lbsPerFt: number;
  /** Total weight: totalLFNeeded × lbsPerFt */
  totalLbs: number;
  /** Price per pound from vendor */
  pricePerLb: number;
  /** Finish multiplier (e.g., 1.0, 1.25) */
  finishMultiplier: number;
  /** Extended cost: totalLbs × pricePerLb × finishMultiplier */
  extCost: number;
};

// ============================================================================
// 21. CONSTANTS AND LOOKUP TABLES
// ============================================================================

/**
 * FINISH_MULTIPLIERS — cost adder for aluminum finishes.
 * Used to calculate final aluminum price: listPrice × finishMultiplier.
 * Baseline (clear-anod) = 1.0. PVDF (3-coat Kynar) = 1.25.
 */
export const FINISH_MULTIPLIERS: Record<FinishType, number> = {
  'clear-anod': 1.0,
  'dark-bronze': 1.08,
  'black-anod': 1.12,
  'two-coat-paint': 1.15,
  'three-coat-kynar': 1.25,
  'custom': 1.0, // User supplies actual multiplier separately
};

/**
 * SCRAP_THRESHOLDS — scrap percentage color-coding boundaries.
 * Helps estimator identify material waste issues and nesting efficiency.
 * GREEN_MAX = 8%: excellent nesting. YELLOW_MAX = 10%: acceptable.
 * Above 10% = RED: consider retooling or different stock length.
 */
export const SCRAP_THRESHOLDS = {
  /** Maximum scrap % for green status (excellent nesting) */
  GREEN_MAX: 8,
  /** Maximum scrap % for yellow status (acceptable); above this is red (poor nesting) */
  YELLOW_MAX: 10,
} as const;

/**
 * MINIMUM_PANEL_WIDTH_INCHES — structural minimum for all-glass panels.
 * Narrower panels are not permitted (too weak). Used to validate panel configurations.
 */
export const MINIMUM_PANEL_WIDTH_INCHES = 4;

/**
 * DOOR_LABOR_HOURS — standard labor hours for installation of one door opening.
 * Applied whether the door is single or double (pair). Includes hardware installation.
 */
export const DOOR_LABOR_HOURS = 8.5;

/**
 * SHOP_MHS_PER_SF — shop fabrication man-hours per square foot of glass.
 * Includes cutting, edge work, tempering coordination, and assembly.
 * Total shop hours = glassSchedule totalSqft × SHOP_MHS_PER_SF.
 */
export const SHOP_MHS_PER_SF = 0.11;

/**
 * FIELD_MHS_PER_SF — field installation man-hours per square foot of glass.
 * Includes setting, shim adjustment, gasket installation, sealant, and testing.
 * Total field hours = glassSchedule totalSqft × FIELD_MHS_PER_SF.
 */
export const FIELD_MHS_PER_SF = 0.264;
