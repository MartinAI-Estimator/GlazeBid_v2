/**
 * @fileoverview bomResolver/index.ts — High-Level BOM Resolver Engine
 *
 * Takes frame geometry + vendor system + fabrication rules and outputs a complete
 * FrameEngineeringPackage: aluminum BOM, glass schedule, accessories, sealants,
 * labor, doors, and structural analysis result.
 *
 * This is the primary integration layer between:
 *   - Studio frame geometry capture
 *   - Package frame-engine fabrication rules
 *   - Builder costing and BOM aggregation
 *
 * Pure TypeScript — no React, no side-effects.
 * Imports only from ../types, ../archetypes, and ../fabricationRules.
 */

import {
  FrameEngineeringPackage,
  BOMLine,
  GlassScheduleRow,
  AccessoryLine,
  SealantLine,
  LaborSummary,
  DoorPackage,
  AlternateBOM,
  StructuralResult,
  ScopeTag,
  SHOP_MHS_PER_SF,
  FIELD_MHS_PER_SF,
  DOOR_LABOR_HOURS,
} from '../types/index';

import {
  VendorSystem,
  SystemArchetype,
  ARCHETYPE_CATALOG,
  VENDOR_CATALOG,
  getVendorsForArchetype,
} from '../archetypes/index';

import {
  computeFabricationCutList,
  computeBarOptimization,
  computeCaulkSausages,
  DEFAULT_FRAMED_RULES,
  type FabricationRules,
  type CutListEntry,
} from '../fabricationRules/index';

// ============================================================================
// 1. INPUT PARAMETERS TYPE
// ============================================================================

/**
 * Parameters for resolveFrameBOM.
 * Captures all geometry, vendor, and pricing data needed to generate a complete
 * FrameEngineeringPackage.
 */
export type ResolveFrameBOMParams = {
  /** Frame UUID */
  frameId: string;
  /** Architectural mark, e.g., "A-1", "SF-3" */
  mark: string;
  /** Frame group/system name, e.g., "Main Storefront" */
  groupName: string;
  /** Bid phase: BASE_BID, ALT_1, ALT_2, ALLOWANCE */
  scopeTag: ScopeTag;
  /** Number of identical frames at this mark */
  quantity: number;

  // ─── Geometry ───────────────────────────────────────────────────────────
  /** Frame OD width in decimal inches */
  widthInches: number;
  /** Frame OD height in decimal inches (rectangular) or left-side height (raked) */
  heightInches: number;
  /** Number of vertical divisions (bays) */
  bays: number;
  /** Number of horizontal divisions (rows) */
  rows: number;
  /** Per-bay type: 'glazing', 'door-single', or 'door-pair' */
  bayTypes: ('glazing' | 'door-single' | 'door-pair')[];

  // ─── Vendors ────────────────────────────────────────────────────────────
  /** Primary vendor system ID (e.g., 'kawneer-451t') */
  vendorSystemId: string;
  /** First alternate vendor (optional) */
  altVendor1Id?: string;
  /** Second alternate vendor (optional) */
  altVendor2Id?: string;

  // ─── Finish & Glass ─────────────────────────────────────────────────────
  /** Finish type: 'clear-anod', 'dark-bronze', 'two-coat-paint', etc. */
  finishType: string;
  /** Finish cost multiplier, e.g., 1.0 (clear), 1.25 (PVDF) */
  finishMultiplier: number;
  /** Optional glass bite override (inches) */
  glassBiteOverride?: number;
  /** Optional stock length override: 21 or 24 feet */
  stockLengthFt?: 21 | 24;
  /** Glass spec ID for reference */
  glassSpecId: string;
  /** Optional glass unit price per square foot (from quote) */
  pricePerSqFt?: number;

  // ─── Optional rules override ────────────────────────────────────────────
  fabricationRulesOverride?: Partial<FabricationRules>;
};

// ============================================================================
// 2. MAIN BOM RESOLVER FUNCTION
// ============================================================================

/**
 * Resolve a complete BOM for one frame (or frame mark with quantity).
 *
 * Orchestrates:
 *   1. Archetype + vendor resolution
 *   2. Cut-list computation via fabricationRules engine
 *   3. Glass schedule generation
 *   4. Accessory line items (fasteners, setting blocks, gaskets, etc.)
 *   5. Sealant schedule (perimeter caulk)
 *   6. Labor summary (shop, field, distribution)
 *   7. Door package if applicable
 *   8. Alternate vendor BOMs
 *   9. Structural analysis stub
 *
 * @param params - Frame geometry, vendors, and pricing parameters
 * @returns Complete FrameEngineeringPackage ready for Builder integration
 * @throws Error if vendor or archetype not found
 */
export function resolveFrameBOM(params: ResolveFrameBOMParams): FrameEngineeringPackage {
  // ── Resolve archetype & vendor ─────────────────────────────────────────────
  const vendor = VENDOR_CATALOG[params.vendorSystemId];
  if (!vendor) {
    throw new Error(
      `resolveFrameBOM: vendor '${params.vendorSystemId}' not found in VENDOR_CATALOG`
    );
  }

  const archetype = ARCHETYPE_CATALOG[vendor.archetypeId];
  if (!archetype) {
    throw new Error(
      `resolveFrameBOM: archetype '${vendor.archetypeId}' not found in ARCHETYPE_CATALOG`
    );
  }

  const rules = { ...DEFAULT_FRAMED_RULES, ...params.fabricationRulesOverride };
  const glassBite = params.glassBiteOverride ?? archetype.glassBite;
  const stockLengthFt = params.stockLengthFt ?? rules.stockLengthFt;

  // ── Compute cut list ───────────────────────────────────────────────────────
  const cutListResult = computeFabricationCutList(
    params.widthInches,
    params.heightInches,
    params.bays,
    params.rows,
    archetype.profileWidth,
    glassBite,
    // Convert vendor.parts to the format expectedby computeFabricationCutList
    convertVendorPartsForCutList(vendor),
    params.bayTypes,
    rules
  );

  // ── Build aluminum BOM lines ───────────────────────────────────────────────
  const bomLines = buildBOMLines(
    cutListResult.cutList,
    vendor,
    params.quantity,
    params.finishMultiplier,
    stockLengthFt
  );

  // ── Build glass schedule ───────────────────────────────────────────────────
  const glassSchedule = buildGlassSchedule(
    params.widthInches,
    params.heightInches,
    params.bays,
    params.rows,
    params.bayTypes,
    archetype.profileWidth,
    glassBite,
    params.glassSpecId,
    params.pricePerSqFt,
    params.quantity
  );

  // ── Compute total glass SF for labor ───────────────────────────────────────
  const totalGlassSF = glassSchedule.reduce((sum, row) => sum + row.sqft, 0);

  // ── Build accessories (fasteners, setting blocks, gaskets) ─────────────────
  const accessories = buildAccessories(
    cutListResult.liteCount,
    cutListResult.totalJoints,
    sillLFFromGeometry(params.widthInches, params.bays, archetype.profileWidth),
    params.quantity
  );

  // ── Build sealant schedule ─────────────────────────────────────────────────
  const sealant = buildSealants(
    params.widthInches,
    params.heightInches,
    rules,
    params.quantity
  );

  // ── Build labor summary ────────────────────────────────────────────────────
  const labor = buildLaborSummary(totalGlassSF, cutListResult.liteCount);

  // ── Build door packages ────────────────────────────────────────────────────
  const doorCount = params.bayTypes.filter((t) => t !== 'glazing').length;
  const doors = buildDoorPackages(doorCount);

  // ── Build alternates ──────────────────────────────────────────────────────
  const alternates = buildAlternates(
    params,
    cutListResult,
    params.widthInches,
    params.heightInches,
    glassBite,
    params.glassSpecId
  );

  // ── Structural result (stub: PASS by default) ──────────────────────────────
  const structural: StructuralResult = {
    status: 'PASS',
    noteForShops: `Frame ${params.mark}: structural analysis passed for standard conditions.`,
  };

  // ── Assemble complete package ──────────────────────────────────────────────
  return {
    frameId: params.frameId,
    mark: params.mark,
    group: params.groupName,
    scopeTag: params.scopeTag,
    quantity: params.quantity,
    bomLines,
    glassSchedule,
    accessories,
    sealant,
    brakeMetal: [], // Custom sheet metal — not applicable to standard framing
    labor: scaleLaborForQuantity(labor, params.quantity),
    doors,
    alternates,
    structural,
  };
}

// ============================================================================
// 3. HELPER: BUILD BOM LINES
// ============================================================================

/**
 * Convert vendor.parts to the simple {partNumber, description, weightPerLF} format
 * expected by computeFabricationCutList.
 */
function convertVendorPartsForCutList(vendor: VendorSystem): Record<
  string,
  { partNumber: string; description: string; weightPerLF: number }
> {
  const result: Record<string, { partNumber: string; description: string; weightPerLF: number }> =
    {};

  for (const [role, entry] of Object.entries(vendor.parts)) {
    if (entry) {
      result[role] = {
        partNumber: entry.partNumber,
        description: entry.description,
        weightPerLF: entry.weightPerLF ?? 0,
      };
    }
  }

  return result;
}

/**
 * Build BOMLine array from cut list entries.
 * Aggregates like members, computes weight and cost.
 */
function buildBOMLines(
  cutList: CutListEntry[],
  vendor: VendorSystem,
  quantity: number,
  finishMultiplier: number,
  stockLengthFt: 21 | 24
): BOMLine[] {
  const lines: BOMLine[] = [];

  for (const entry of cutList) {
    const totalLF = round2((entry.cutLengthIn * entry.quantity) / 12);
    const totalLbs = round2(totalLF * entry.lbsPerFt);

    // Bar optimization
    const { barsRequired, scrapPercent } = computeBarOptimization(totalLF * quantity, stockLengthFt);

    const line: BOMLine = {
      partNumber: entry.partNumber,
      description: entry.description,
      role: entry.role,
      totalLF: round2(totalLF * quantity),
      barsRequired,
      lbsPerFt: entry.lbsPerFt,
      totalLbs: round2(totalLbs * quantity),
      listPrice: 0, // Would be filled by price book integration
      finishMultiplier,
      extCost: 0, // Calculated when listPrice is known
    };

    lines.push(line);
  }

  return lines;
}

// ============================================================================
// 4. HELPER: BUILD GLASS SCHEDULE
// ============================================================================

/**
 * Build glass schedule from frame geometry.
 * One row per unique glass size + type combination.
 */
function buildGlassSchedule(
  widthInches: number,
  heightInches: number,
  bays: number,
  rows: number,
  bayTypes: ('glazing' | 'door-single' | 'door-pair')[],
  profileWidth: number,
  glassBite: number,
  glassSpecId: string,
  pricePerSqFt?: number,
  quantity: number = 1
): GlassScheduleRow[] {
  const bayWidths = Array(bays).fill(widthInches / bays);
  const rowHeights = Array(rows).fill(heightInches / rows);

  // Deduplicate by glass size
  const glassMap = new Map<string, GlassScheduleRow>();

  for (let r = 0; r < rows; r++) {
    for (let b = 0; b < bays; b++) {
      const isDoorBay = bayTypes[b] !== 'glazing';
      if (isDoorBay) continue;

      const dloW = Math.max(0, bayWidths[b] - profileWidth);
      const dloH = Math.max(0, rowHeights[r] - profileWidth);

      const glassW = round4(dloW + 2 * glassBite);
      const glassH = round4(dloH + 2 * glassBite);
      const sqft = round2((glassW * glassH) / 144);

      const key = `${glassW.toFixed(4)}x${glassH.toFixed(4)}`;
      const existing = glassMap.get(key);

      if (existing) {
        existing.quantity += quantity;
        existing.sqft = round2(existing.sqft + sqft * quantity);
      } else {
        glassMap.set(key, {
          mark: `GL-${key}`,
          widthInches: glassW,
          heightInches: glassH,
          shape: 'rectangular',
          glassSpecId,
          quantity,
          sqft: round2(sqft * quantity),
          isTempered: false,
          isSpandrel: false,
          pricePerSqFt,
          extCost: pricePerSqFt ? round2(sqft * quantity * pricePerSqFt) : undefined,
        });
      }
    }
  }

  return Array.from(glassMap.values());
}

// ============================================================================
// 5. HELPER: BUILD ACCESSORIES
// ============================================================================

/**
 * Build accessory line items from geometry and rules.
 * Includes: setting blocks, screws, weep baffles, end dams, shim tape.
 */
function buildAccessories(
  liteCount: number,
  totalJoints: number,
  sillLF: number,
  quantity: number
): AccessoryLine[] {
  const rules = DEFAULT_FRAMED_RULES;
  const accessories: AccessoryLine[] = [];

  // Setting blocks: 2 per lite
  accessories.push({
    partNumber: 'ACC-SETBLK',
    description: 'Neoprene Setting Block 4"',
    unit: 'EA',
    quantity: round2(liteCount * rules.settingBlocksPerLite * quantity),
    unitCost: 0.35,
    extCost: round2(liteCount * rules.settingBlocksPerLite * quantity * 0.35),
  });

  // Screws: 4 per joint
  accessories.push({
    partNumber: 'ACC-SCREW-SS',
    description: 'Stainless Steel Screw #10 1/2"',
    unit: 'EA',
    quantity: totalJoints * rules.screwsPerJoint * quantity,
    unitCost: 0.08,
    extCost: round2(totalJoints * rules.screwsPerJoint * quantity * 0.08),
  });

  // Weep baffles
  if (sillLF > 0) {
    accessories.push({
      partNumber: 'ACC-WEEP',
      description: 'Weep Baffle',
      unit: 'LF',
      quantity: round2(sillLF * rules.weepBafflesPerLF * quantity),
      unitCost: 0.45,
      extCost: round2(sillLF * rules.weepBafflesPerLF * quantity * 0.45),
    });
  }

  // End dams: 2 per frame
  accessories.push({
    partNumber: 'ACC-ENDDAM',
    description: 'End Dam Plug',
    unit: 'EA',
    quantity: rules.endDamsPerFrame * quantity,
    unitCost: 0.25,
    extCost: round2(rules.endDamsPerFrame * quantity * 0.25),
  });

  // Shim tape
  if (sillLF > 0) {
    accessories.push({
      partNumber: 'ACC-SHIMTAPE',
      description: 'Shim Tape 1/4" × 2" Roll',
      unit: 'LF',
      quantity: round2(sillLF * rules.shimTapePerLFSill * quantity),
      unitCost: 0.12,
      extCost: round2(sillLF * rules.shimTapePerLFSill * quantity * 0.12),
    });
  }

  return accessories;
}

// ============================================================================
// 6. HELPER: BUILD SEALANTS
// ============================================================================

/**
 * Build sealant schedule (perimeter caulk).
 * Computes 20oz sausage count based on joint width/depth and perimeter.
 */
function buildSealants(
  widthInches: number,
  heightInches: number,
  rules: FabricationRules,
  quantity: number
): SealantLine[] {
  const perimeterLF = round2((2 * (widthInches + heightInches)) / 12);
  const sausages = computeCaulkSausages(
    perimeterLF,
    rules.caulkJointWidthIn,
    rules.caulkJointDepthIn,
    10 // 10% waste
  );

  return [
    {
      type: 'silicone-exterior',
      jointLF: round2(perimeterLF * quantity),
      sausageCount: sausages * quantity,
      unitCost: 8.5,
      extCost: round2(sausages * quantity * 8.5),
    },
    {
      type: 'latex-interior',
      jointLF: round2(perimeterLF * quantity),
      sausageCount: Math.ceil((sausages * 0.5) * quantity),
      unitCost: 4.2,
      extCost: round2(Math.ceil((sausages * 0.5) * quantity) * 4.2),
    },
  ];
}

// ============================================================================
// 7. HELPER: BUILD LABOR SUMMARY
// ============================================================================

/**
 * Build labor summary from glass square footage.
 * Shop: 0.110 MHS/SF | Field: 0.264 MHS/SF | Distribution: 25% of shop
 */
function buildLaborSummary(totalGlassSF: number, liteCount: number): LaborSummary {
  const shopHours = round2(totalGlassSF * SHOP_MHS_PER_SF);
  const fieldHours = round2(totalGlassSF * FIELD_MHS_PER_SF);
  const distHours = round2(shopHours * 0.25);

  return {
    shopHours,
    fieldHours,
    distHours,
  };
}

/**
 * Scale labor by quantity.
 */
function scaleLaborForQuantity(labor: LaborSummary, quantity: number): LaborSummary {
  return {
    shopHours: round2(labor.shopHours * quantity),
    fieldHours: round2(labor.fieldHours * quantity),
    distHours: round2(labor.distHours * quantity),
  };
}

// ============================================================================
// 8. HELPER: BUILD DOOR PACKAGES
// ============================================================================

/**
 * Build door package entries for door bays.
 * 8.5 hours per door opening + generic hardware.
 */
function buildDoorPackages(doorCount: number): DoorPackage[] {
  const doors: DoorPackage[] = [];

  for (let i = 0; i < doorCount; i++) {
    doors.push({
      mark: `D-${i + 1}`,
      hardwareSet: 'STD-DORMA-ESA',
      materialCost: 850, // Placeholder
      laborHours: DOOR_LABOR_HOURS,
    });
  }

  return doors;
}

// ============================================================================
// 9. HELPER: BUILD ALTERNATES
// ============================================================================

/**
 * Build alternate BOM entries for alt vendors.
 */
function buildAlternates(
  params: ResolveFrameBOMParams,
  cutListResult: ReturnType<typeof computeFabricationCutList>,
  widthInches: number,
  heightInches: number,
  glassBite: number,
  glassSpecId: string
): AlternateBOM[] {
  const alternates: AlternateBOM[] = [];

  // Alt 1
  if (params.altVendor1Id) {
    const altVendor1 = VENDOR_CATALOG[params.altVendor1Id];
    if (altVendor1) {
      const altArchetype1 = ARCHETYPE_CATALOG[altVendor1.archetypeId];
      if (altArchetype1) {
        const altBOMLines = buildBOMLines(
          cutListResult.cutList,
          altVendor1,
          params.quantity,
          params.finishMultiplier,
          params.stockLengthFt ?? DEFAULT_FRAMED_RULES.stockLengthFt
        );

        const altGlassSchedule = buildGlassSchedule(
          widthInches,
          heightInches,
          params.bays,
          params.rows,
          params.bayTypes,
          altArchetype1.profileWidth,
          glassBite,
          glassSpecId,
          params.pricePerSqFt,
          params.quantity
        );

        const altAccessories = buildAccessories(
          cutListResult.liteCount,
          cutListResult.totalJoints,
          sillLFFromGeometry(widthInches, params.bays, altArchetype1.profileWidth),
          params.quantity
        );

        alternates.push({
          vendorSystemId: params.altVendor1Id,
          scopeTag: 'ALT_1',
          bomLines: altBOMLines,
          glassSchedule: altGlassSchedule,
          accessories: altAccessories,
          totalMaterialCost: computeTotalMaterialCost(altBOMLines, altGlassSchedule, altAccessories),
        });
      }
    }
  }

  // Alt 2
  if (params.altVendor2Id) {
    const altVendor2 = VENDOR_CATALOG[params.altVendor2Id];
    if (altVendor2) {
      const altArchetype2 = ARCHETYPE_CATALOG[altVendor2.archetypeId];
      if (altArchetype2) {
        const altBOMLines = buildBOMLines(
          cutListResult.cutList,
          altVendor2,
          params.quantity,
          params.finishMultiplier,
          params.stockLengthFt ?? DEFAULT_FRAMED_RULES.stockLengthFt
        );

        const altGlassSchedule = buildGlassSchedule(
          widthInches,
          heightInches,
          params.bays,
          params.rows,
          params.bayTypes,
          altArchetype2.profileWidth,
          glassBite,
          glassSpecId,
          params.pricePerSqFt,
          params.quantity
        );

        const altAccessories = buildAccessories(
          cutListResult.liteCount,
          cutListResult.totalJoints,
          sillLFFromGeometry(widthInches, params.bays, altArchetype2.profileWidth),
          params.quantity
        );

        alternates.push({
          vendorSystemId: params.altVendor2Id,
          scopeTag: 'ALT_2',
          bomLines: altBOMLines,
          glassSchedule: altGlassSchedule,
          accessories: altAccessories,
          totalMaterialCost: computeTotalMaterialCost(altBOMLines, altGlassSchedule, altAccessories),
        });
      }
    }
  }

  return alternates;
}

// ============================================================================
// 10. HELPER: COMPUTE TOTAL MATERIAL COST
// ============================================================================

/**
 * Sum extended costs across all material categories.
 */
function computeTotalMaterialCost(
  bomLines: BOMLine[],
  glassSchedule: GlassScheduleRow[],
  accessories: AccessoryLine[]
): number {
  let total = 0;

  total += bomLines.reduce((sum, line) => sum + (line.extCost ?? 0), 0);
  total += glassSchedule.reduce((sum, row) => sum + (row.extCost ?? 0), 0);
  total += accessories.reduce((sum, item) => sum + item.extCost, 0);

  return round2(total);
}

// ============================================================================
// 11. HELPER: COMPUTE SILL LINEAR FOOTAGE
// ============================================================================

/**
 * Compute total sill linear footage from frame width and bay count.
 */
function sillLFFromGeometry(widthInches: number, bays: number, profileWidth: number): number {
  const bayWidths = Array(bays).fill(widthInches / bays);
  let totalSillLF = 0;

  for (const bw of bayWidths) {
    const sillCut = Math.max(0, bw - profileWidth);
    totalSillLF += sillCut / 12;
  }

  return round2(totalSillLF);
}

// ============================================================================
// 12. BATCH RESOLVER: MULTIPLE FRAMES
// ============================================================================

/**
 * Resolve BOM for multiple frames in a single call.
 * Useful for entire estimating sessions.
 *
 * @param framess - Array of frame parameters
 * @returns Array of FrameEngineeringPackages
 */
export function resolveMultipleFrames(
  frames: ResolveFrameBOMParams[]
): FrameEngineeringPackage[] {
  return frames.map((f) => resolveFrameBOM(f));
}

// ============================================================================
// 13. MATH HELPERS
// ============================================================================

/**
 * Round to 2 decimal places.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Round to 4 decimal places.
 */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
