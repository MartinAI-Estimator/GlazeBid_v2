/**
 * @fileoverview fabricationRules/index.ts — Pure Fabrication Rules Engine
 *
 * This module encodes glazing fabrication rules: standard quantities for fasteners,
 * setting blocks, gaskets, sealants, and hardware per unit frame.
 *
 * Also implements cut-list computation: exact extrusion cut lengths for all members
 * (head, sill, jambs, mullions, transoms) with proper formatting.
 *
 * Key formulas (ported from legacy GlazeBid_AIQ):
 *   - Joints: (bays + lites) × 2
 *   - Cut length: frame perimeter minus face-width deductions
 *   - Glass knife: DLO + 2 × glassBite
 *   - Labor: 0.110 shop MHS/SF + 0.264 field MHS/SF
 *   - Bar optimization: ceil(totalLF / usableLengthIn) with scrap tracking
 *   - Caulk: 20oz sausages per perimeter LF based on joint width/depth
 *
 * Pure TypeScript — no React, no side-effects, no imports except from ../types.
 */

import type {
  BOMLine,
  GlassScheduleRow,
  AccessoryLine,
  SealantLine,
  LaborSummary,
  DoorPackage,
  AlternateBOM,
  FrameEngineeringPackage,
  StructuralResult,
  StructuralStatus,
} from '../types/index';

// ============================================================================
// 1. FABRICATION RULES TYPE AND DEFAULTS
// ============================================================================

/**
 * FabricationRules — standard quantities for hardware, gaskets, and sealants.
 * These are the baseline quantities per frame instance (quantity = 1).
 * Multiply by frame quantity for batch sizing.
 */
export type FabricationRules = {
  /** Number of stainless steel screws per joint (frame corner + mullion intersection) */
  screwsPerJoint: number;
  /** Number of neoprene setting blocks per glass lite */
  settingBlocksPerLite: number;
  /** Number of weep/end dam plugs per frame perimeter */
  endDamsPerFrame: number;
  /** Number of weep baffles per linear foot of sill */
  weepBafflesPerLF: number;
  /** Linear feet of shim tape per linear foot of sill */
  shimTapePerLFSill: number;
  /** Number of drainage holes per sill member */
  drainHolesPerSill: number;
  /** Perimeter caulk joint width in inches (e.g., 0.25") */
  caulkJointWidthIn: number;
  /** Perimeter caulk joint depth in inches (e.g., 0.25") */
  caulkJointDepthIn: number;
  /** Preferred aluminum stock length: 21' or 24' */
  stockLengthFt: 21 | 24;
};

/**
 * DEFAULT_FRAMED_RULES — baseline fabrication rules for standard framed systems.
 * Based on 15+ years of glazing estimating field experience and legacy GlazeBid.
 */
export const DEFAULT_FRAMED_RULES: FabricationRules = {
  screwsPerJoint: 4,
  settingBlocksPerLite: 2,
  endDamsPerFrame: 2,
  weepBafflesPerLF: 1,
  shimTapePerLFSill: 1,
  drainHolesPerSill: 2,
  caulkJointWidthIn: 0.25,
  caulkJointDepthIn: 0.25,
  stockLengthFt: 21,
};

// ============================================================================
// 2. CUT LIST TYPES
// ============================================================================

/**
 * CutListEntry — one line in the frame's extrusion cut list.
 * Grouped by identical cut lengths (e.g., "all head rails = 40.5\"").
 */
export type CutListEntry = {
  /** Role: HEAD, SILL, JAMB_L, JAMB_R, MULLION_V_{n}, TRANSOM_H_{n} */
  role: string;
  /** Vendor part number for this member type, e.g., "KAW-1606-H" */
  partNumber: string;
  /** Human-readable description, e.g., "Head Rail 3\" × 1.75\" 16ga" */
  description: string;
  /** Exact cut length in decimal inches */
  cutLengthIn: number;
  /** Formatted as feet-inches-fractions, e.g., "3'-4 1/2\"" */
  cutLengthFmt: string;
  /** Number of identical pieces at this cut length */
  quantity: number;
  /** Weight per linear foot from vendor */
  lbsPerFt: number;
  /** Total weight: (cutLengthIn * quantity / 12) * lbsPerFt */
  totalLbs: number;
};

// ============================================================================
// 3. FORMATTING HELPERS
// ============================================================================

/**
 * Round to 2 decimal places.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Round to 4 decimal places (used for intermediate calculations).
 */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Format a decimal inch value as an architectural feet-and-inches string with 1/16" fractions.
 *
 * @param inches - Decimal inches to format
 * @returns Formatted string, e.g., "3'-4 1/2\"", "10 1/4\"", "3'", "0\""
 *
 * @example
 * fmtIn(40.5)   → "3'-4 1/2\""
 * fmtIn(36.0)   → "3'"
 * fmtIn(10.25)  → "10 1/4\""
 * fmtIn(0)      → "0\""
 */
export function fmtIn(inches: number): string {
  if (inches <= 0) return '0"';

  const ft = Math.floor(inches / 12);
  const rem = inches % 12;
  const whole = Math.floor(rem);
  const frac = rem - whole;

  // 1/16" fractions: 0 = 0, 1 = 1/16, 2 = 1/8, ... 16 = 1"
  // Use 16ths internally and match to textual form
  const FRACS: Array<[number, string]> = [
    [0.0625, '1/16'],
    [0.125, '1/8'],
    [0.1875, '3/16'],
    [0.25, '1/4'],
    [0.3125, '5/16'],
    [0.375, '3/8'],
    [0.4375, '7/16'],
    [0.5, '1/2'],
    [0.5625, '9/16'],
    [0.625, '5/8'],
    [0.6875, '11/16'],
    [0.75, '3/4'],
    [0.8125, '13/16'],
    [0.875, '7/8'],
    [0.9375, '15/16'],
  ];

  let fracStr = '';
  if (frac > 0.015) {
    let best = Infinity;
    for (const [val, str] of FRACS) {
      const d = Math.abs(frac - val);
      if (d < best) {
        best = d;
        fracStr = str;
      }
    }
  }

  const inchPart = fracStr
    ? whole > 0
      ? `${whole} ${fracStr}"`
      : `${fracStr}"`
    : whole > 0
      ? `${whole}"`
      : '';

  if (ft === 0) return inchPart || '0"';
  return inchPart ? `${ft}'-${inchPart}` : `${ft}'`;
}

// ============================================================================
// 4. GRID MATH HELPERS
// ============================================================================

/**
 * Compute bay and row sizing from frame dimensions, bay count, and row count.
 *
 * @param frameWidthInches - Outside dimension width
 * @param frameHeightInches - Outside dimension height
 * @param bays - Number of vertical divisions
 * @param rows - Number of horizontal divisions
 * @param profileWidth - Mullion face width (for DLO deduction)
 *
 * @returns Object with bay/row widths and heights, and DLO dimensions
 */
function computeGridDimensions(
  frameWidthInches: number,
  frameHeightInches: number,
  bays: number,
  rows: number,
  profileWidth: number
) {
  // Even distribution of bays and rows
  const bayWidths = Array(bays).fill(frameWidthInches / bays);
  const rowHeights = Array(rows).fill(frameHeightInches / rows);

  // Daylight openings: bay/row dimensions minus one mullion width on each side
  // DLO = (bayWidth/rowHeight) - profileWidth
  const dloWidths = bayWidths.map((bw) => Math.max(0, round4(bw - profileWidth)));
  const dloHeights = rowHeights.map((rh) => Math.max(0, round4(rh - profileWidth)));

  return {
    bayWidths,
    rowHeights,
    dloWidths,
    dloHeights,
  };
}

// ============================================================================
// 5. MAIN COMPUTATION FUNCTION
// ============================================================================

/**
 * Compute the complete extrusion cut list for a parametric frame.
 *
 * Handles:
 *   - Head, sill, jambs (left + right)
 *   - Interior vertical mullions
 *   - Interior horizontal transoms
 *   - Door bay logic (omit sill from door bays)
 *   - Cut-length formatting to nearest 1/16"
 *   - Weight aggregation per member type
 *
 * @param widthInches - Frame OD width in decimal inches
 * @param heightInches - Frame OD height in decimal inches
 * @param bays - Number of vertical divisions
 * @param rows - Number of horizontal divisions
 * @param profileWidth - Mullion face width (e.g., 3.0") for DLO deduction
 * @param glassBite - How far glass extends into pocket (e.g., 0.75")
 * @param vendorParts - Map of role → {partNumber, description, weightPerLF}
 * @param bayTypes - Per-bay type: 'glazing', 'door-single', or 'door-pair'
 * @param rules - Override default fabrication rules (optional)
 *
 * @returns Object with cutList, totalJoints, totalGlassSF, totalAlumLF, liteCount
 */
export function computeFabricationCutList(
  widthInches: number,
  heightInches: number,
  bays: number,
  rows: number,
  profileWidth: number,
  glassBite: number,
  vendorParts: Record<string, { partNumber: string; description: string; weightPerLF: number }>,
  bayTypes: ('glazing' | 'door-single' | 'door-pair')[],
  rules?: Partial<FabricationRules>
): {
  cutList: CutListEntry[];
  totalJoints: number;
  totalGlassSF: number;
  totalAlumLF: number;
  liteCount: number;
} {
  const merged = { ...DEFAULT_FRAMED_RULES, ...rules };

  const cutList: CutListEntry[] = [];
  let totalAlumLF = 0;
  let totalGlassSF = 0;

  // ── Grid math ─────────────────────────────────────────────────────────────
  const { bayWidths, rowHeights, dloWidths, dloHeights } = computeGridDimensions(
    widthInches,
    heightInches,
    bays,
    rows,
    profileWidth
  );

  // ── 1. HEAD (top horizontal) ──────────────────────────────────────────────
  const headCut = widthInches;
  const headPart = vendorParts['horizontal-member'] || {
    partNumber: 'TBD',
    description: 'Head Member',
    weightPerLF: 0,
  };
  const headLbs = round2((headCut / 12) * headPart.weightPerLF);
  cutList.push({
    role: 'HEAD',
    partNumber: headPart.partNumber,
    description: headPart.description,
    cutLengthIn: headCut,
    cutLengthFmt: fmtIn(headCut),
    quantity: 1,
    lbsPerFt: headPart.weightPerLF,
    totalLbs: headLbs,
  });
  totalAlumLF += headCut / 12;

  // ── 2. SILL (bottom horizontal, per bay; omitted for door bays) ──────────
  const sillPart = vendorParts['horizontal-member'] || {
    partNumber: 'TBD',
    description: 'Sill Member',
    weightPerLF: 0,
  };
  let sillTotalLF = 0;
  for (let b = 0; b < bays; b++) {
    const isDoorBay = bayTypes[b] !== 'glazing';
    const sillCut = isDoorBay ? 0 : Math.max(0, bayWidths[b] - profileWidth);
    const sillLbs = isDoorBay
      ? 0
      : round2((sillCut / 12) * sillPart.weightPerLF);
    sillTotalLF += sillCut / 12;
    cutList.push({
      role: `SILL_B${b + 1}`,
      partNumber: sillPart.partNumber,
      description: sillPart.description,
      cutLengthIn: sillCut,
      cutLengthFmt: isDoorBay ? '—' : fmtIn(sillCut),
      quantity: 1,
      lbsPerFt: sillPart.weightPerLF,
      totalLbs: sillLbs,
    });
  }
  totalAlumLF += sillTotalLF;

  // ── 3. JAMBS (left + right) ───────────────────────────────────────────────
  const jambPart = vendorParts['vertical-mullion'] || {
    partNumber: 'TBD',
    description: 'Jamb Member',
    weightPerLF: 0,
  };
  const jambCut = heightInches;
  const jambLbs = round2((jambCut / 12) * jambPart.weightPerLF * 2); // 2 jambs
  cutList.push({
    role: 'JAMB',
    partNumber: jambPart.partNumber,
    description: jambPart.description,
    cutLengthIn: jambCut,
    cutLengthFmt: fmtIn(jambCut),
    quantity: 2,
    lbsPerFt: jambPart.weightPerLF,
    totalLbs: jambLbs,
  });
  totalAlumLF += (jambCut / 12) * 2;

  // ── 4. VERTICAL MULLIONS (interior) ───────────────────────────────────────
  const mullionCount = bays - 1;
  if (mullionCount > 0) {
    const mullionCut = heightInches;
    const mullionLbs = round2((mullionCut / 12) * jambPart.weightPerLF * mullionCount);
    cutList.push({
      role: 'MULLION_V',
      partNumber: jambPart.partNumber,
      description: jambPart.description,
      cutLengthIn: mullionCut,
      cutLengthFmt: fmtIn(mullionCut),
      quantity: mullionCount,
      lbsPerFt: jambPart.weightPerLF,
      totalLbs: mullionLbs,
    });
    totalAlumLF += (mullionCut / 12) * mullionCount;
  }

  // ── 5. HORIZONTAL TRANSOMS (interior) ─────────────────────────────────────
  const transomCount = rows - 1;
  if (transomCount > 0) {
    const transomCut = Math.max(0, widthInches - profileWidth);
    const transomLbs = round2((transomCut / 12) * sillPart.weightPerLF * transomCount);
    cutList.push({
      role: 'TRANSOM_H',
      partNumber: sillPart.partNumber,
      description: sillPart.description,
      cutLengthIn: transomCut,
      cutLengthFmt: fmtIn(transomCut),
      quantity: transomCount,
      lbsPerFt: sillPart.weightPerLF,
      totalLbs: transomLbs,
    });
    totalAlumLF += (transomCut / 12) * transomCount;
  }

  // ── 6. Glass schedule and metrics ─────────────────────────────────────────
  let liteCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let b = 0; b < bays; b++) {
      const isDoorBay = bayTypes[b] !== 'glazing';
      if (!isDoorBay) {
        const glassW = round4(dloWidths[b] + 2 * glassBite);
        const glassH = round4(dloHeights[r] + 2 * glassBite);
        const sf = round2((glassW * glassH) / 144);
        totalGlassSF += sf;
        liteCount++;
      }
    }
  }

  // ── 7. Joints calculation (legacy formula) ────────────────────────────────
  // joints = (bays + lites) × 2
  const totalJoints = (bays + liteCount) * 2;

  return {
    cutList,
    totalJoints,
    totalGlassSF: round2(totalGlassSF),
    totalAlumLF: round2(totalAlumLF),
    liteCount,
  };
}

// ============================================================================
// 6. HELPER: Compute bar optimization (scrap tracking)
// ============================================================================

/**
 * Compute the number of stock bars required to fill a total linear footage.
 * Accounts for saw kerf and calculates scrap percentage.
 *
 * @param totalLFNeeded - Total linear feet to cut
 * @param stockLengthFt - Stock bar length: 21 or 24 feet
 * @param kerfInches - Saw kerf per cut (default 0.125" = 1/8")
 *
 * @returns Object with barsRequired and scrapPercent
 */
export function computeBarOptimization(
  totalLFNeeded: number,
  stockLengthFt: 21 | 24,
  kerfInches: number = 0.125
): { barsRequired: number; scrapPercent: number } {
  const usableLengthIn = stockLengthFt * 12 - kerfInches;
  const barsRequired = Math.ceil((totalLFNeeded * 12) / usableLengthIn);
  const usedIn = totalLFNeeded * 12;
  const availableIn = barsRequired * usableLengthIn;
  const scrapPercent = round2(((availableIn - usedIn) / availableIn) * 100);

  return { barsRequired, scrapPercent };
}

// ============================================================================
// 7. HELPER: Compute caulk sausage count
// ============================================================================

/**
 * Compute the number of 20oz sausages needed for perimeter caulk.
 *
 * Coverage: one 20oz sausage seals approximately 36.6 linear feet
 * (depends on joint width × depth).
 *
 * @param perimeterLF - Total linear feet of joint to seal
 * @param jointWidthIn - Joint width in inches
 * @param jointDepthIn - Joint depth in inches
 * @param wastePercent - Waste factor as percentage (default 10)
 *
 * @returns Number of 20oz sausages needed
 */
export function computeCaulkSausages(
  perimeterLF: number,
  jointWidthIn: number,
  jointDepthIn: number,
  wastePercent: number = 10
): number {
  // Coverage per 20oz sausage in LF (empirical from field data)
  const volumePerLF = jointWidthIn * jointDepthIn * 12; // cubic inches per LF
  const coverageLF = 36.6 / (jointWidthIn * jointDepthIn * 12);
  const sausages = Math.ceil((perimeterLF / coverageLF) * (1 + wastePercent / 100));
  return sausages;
}
