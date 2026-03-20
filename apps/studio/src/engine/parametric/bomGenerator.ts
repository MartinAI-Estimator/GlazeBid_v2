/**
 * bomGenerator.ts — Decoupled multi-vendor BOM generator.
 *
 * The "Rosetta Stone" function: takes the same FrameGeometry and runs it
 * through any VendorSystem to produce a VendorBOM with manufacturer-specific
 * part numbers, published weights, and a deduplicated glass schedule.
 *
 * Design contract:
 *   FrameGeometry  → ONLY geometry (width, height, GridSpec with doors/bayTypes).
 *                    No manufacturer data, no part numbers.
 *
 *   VendorSystem   → ONLY vendor mapping (archetypeId + parts).
 *                    No geometry data.
 *
 *   bomGenerator(frame, vendor) → VendorBOM with both merged at call-time.
 *
 * 1-Click Value Engineering usage:
 *
 *   const geom = { widthInches: 120, heightInches: 84, grid };
 *
 *   const boms = [
 *     bomGenerator(geom, VENDOR_CATALOG['kawneer-451t']),
 *     bomGenerator(geom, VENDOR_CATALOG['tubelite-t14000']),
 *     bomGenerator(geom, VENDOR_CATALOG['ykk-35h']),
 *     bomGenerator(geom, VENDOR_CATALOG['efco-400']),
 *   ];
 *
 *   // Sort by total aluminum weight:
 *   boms.sort((a, b) => a.totalWeightLB - b.totalWeightLB);
 *
 * Pure TypeScript — no React, no side-effects, no store imports.
 */

import { computeFabricationBOM, type FabricationBOM, type CutListItem, type RakeParams } from './systemEngine';
import { ARCHETYPE_CATALOG, type VendorSystem, type PartRole } from './archetypes';
import type { GridSpec, GlassType } from './gridMath';

// ── Input type ────────────────────────────────────────────────────────────────

/**
 * Pure geometry snapshot of a frame — everything the BOM engine needs, nothing
 * vendor-specific. This is intentionally NOT the full RectShape; the caller
 * extracts just widthInches/heightInches/grid before passing it here so the
 * generator never sees React store internals.
 */
export type FrameGeometry = {
  widthInches:  number;
  heightInches: number;
  /** GridSpec carries rows, cols, mullion positions, doors[], and bayTypes. */
  grid:         GridSpec;
  /**
   * Optional rake geometry for sloped-head frames.
   * When provided, the BOM engine uses leftHeightIn / rightHeightIn for all
   * slope-sensitive calculations instead of the scalar heightInches.
   */
  rake?:        RakeParams;
};

// ── Output types ──────────────────────────────────────────────────────────────

/** A CutListItem annotated with the specific vendor part number and weight. */
export type VendorCutItem = CutListItem & {
  /** Manufacturer's catalog part number for this member role. */
  partNumber:      string;
  /** Short description from the vendor catalog entry. */
  partDescription: string;
  /**
   * Estimated aluminum weight for this line item.
   * = (cutLengthInch × qty / 12) × weightPerLF
   */
  weightLB:        number;
};

/**
 * Deduplicated glass schedule — lites grouped by identical knife size and type.
 * Ready to hand to a glass vendor as an order schedule.
 */
export type GlassScheduleRow = {
  /** Knife width in decimal inches. */
  widthInch:  number;
  /** Knife height in decimal inches. */
  heightInch: number;
  areaSF:     number;
  qty:        number;
  totalSF:    number;
  glassType:  GlassType;
  /** All BOM marks that share this exact size (e.g. ["G-R1-C1", "G-R1-C3"]). */
  marks:      string[];
  /** 'trapezoid' for top-row panes in raked frames; absent or 'rectangular' otherwise. */
  shape?:          'rectangular' | 'trapezoid';
  /** Trapezoid only: left-edge glass knife height. */
  heightInchLeft?:  number;
  /** Trapezoid only: right-edge glass knife height. */
  heightInchRight?: number;
};

/**
 * Complete vendor-tagged BOM output.
 * Extends FabricationBOM (hardware/labor is geometry-derived, not vendor-specific)
 * with vendor identity, annotated cut list, and the glass schedule.
 */
export type VendorBOM = Omit<FabricationBOM, 'cutList'> & {
  /** Vendor identity */
  manufacturer:   string;
  productLine:    string;
  vendorSystemId: string;
  specSection:    string;
  /** Annotated cut list — each item has partNumber + weightLB added. */
  cutList:        VendorCutItem[];
  /** Glass order schedule — unique sizes deduplicated for purchasing. */
  glassSchedule:  GlassScheduleRow[];
  /**
   * Total aluminum weight across all cut pieces.
   * Useful for: material cost estimation, freight calculation, comparison sorting.
   */
  totalWeightLB:  number;
};

// ── Role → PartRole mapping ─────────────────────────────────────────────────

/**
 * Maps the generic cut-list roles from systemEngine onto the VendorSystem PartRole keys.
 *
 * systemEngine CutPieceRole → VendorSystem PartRole
 *
 *   head      → horizontal-member   (head rail is same extrusion family as transoms)
 *   sill      → horizontal-member   (sill is same extrusion, just at the bottom)
 *   transom   → horizontal-member
 *   jamb      → vertical-mullion    (jambs use the vertical extrusion)
 *   mullion   → vertical-mullion    (interior mullions = same extrusion)
 */
const CUT_ROLE_TO_PART_ROLE: Record<string, PartRole> = {
  head:    'horizontal-member',
  sill:    'horizontal-member',
  transom: 'horizontal-member',
  jamb:    'vertical-mullion',
  mullion: 'vertical-mullion',
};

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Generate a vendor-tagged FabricationBOM for a single frame geometry.
 *
 * @param frame       Pure geometry — width, height, GridSpec.
 * @param vendor      A VendorSystem from VENDOR_CATALOG (or a custom one).
 * @throws Error      If vendor references an unknown archetypeId.
 *
 * @returns VendorBOM — geometry-derived quantities + vendor part numbers + weight.
 */
export function bomGenerator(frame: FrameGeometry, vendor: VendorSystem): VendorBOM {
  const archetype = ARCHETYPE_CATALOG[vendor.archetypeId];
  if (!archetype) {
    throw new Error(
      `bomGenerator: VendorSystem '${vendor.id}' references unknown archetypeId '${vendor.archetypeId}'. ` +
      `Valid archetypes: ${Object.keys(ARCHETYPE_CATALOG).join(', ')}`
    );
  }

  // Convert archetype → ProfileParams (the minimal interface systemEngine needs).
  // The label combines manufacturer + product line so the BOM header is useful.
  const profileParams = {
    label:     `${vendor.manufacturer} ${vendor.productLine}`,
    faceWidth: archetype.profileWidth,
    glassBite: archetype.glassBite,
  };

  // Run the geometry engine — pure math, no vendor knowledge.
  const base: FabricationBOM = computeFabricationBOM(
    frame.widthInches,
    frame.heightInches,
    profileParams,
    frame.grid,
    undefined,
    frame.rake,
  );

  // Annotate each cut item with vendor part number + weight.
  let totalWeightLB = 0;

  const cutList: VendorCutItem[] = base.cutList.map((item: CutListItem): VendorCutItem => {
    const partRole  = CUT_ROLE_TO_PART_ROLE[item.role] ?? 'horizontal-member';
    const partEntry = vendor.parts[partRole];

    // Linear feet for this line item (omitted sills have cutLengthInch === 0)
    const lf       = (item.cutLengthInch * item.qty) / 12;
    const weightLB = round2(lf * (partEntry?.weightPerLF ?? 0));
    totalWeightLB += weightLB;

    return {
      ...item,
      partNumber:      partEntry?.partNumber      ?? 'TBD',
      partDescription: partEntry?.description     ?? '',
      weightLB,
    };
  });

  // Build deduplicated glass schedule.
  const glassSchedule = buildGlassSchedule(base);

  return {
    ...base,
    manufacturer:   vendor.manufacturer,
    productLine:    vendor.productLine,
    vendorSystemId: vendor.id,
    specSection:    vendor.specSection,
    cutList,
    glassSchedule,
    totalWeightLB: round2(totalWeightLB),
  };
}

/**
 * Run bomGenerator for multiple vendors and return results sorted cheapest-first
 * by total aluminum weight (a reliable proxy for material cost before pricing
 * data is available).
 *
 * @param frame    Single frame geometry.
 * @param vendors  Array of VendorSystem entries (from VENDOR_CATALOG values).
 */
export function compareVendors(frame: FrameGeometry, vendors: VendorSystem[]): VendorBOM[] {
  return vendors
    .map(v => bomGenerator(frame, v))
    .sort((a, b) => a.totalWeightLB - b.totalWeightLB);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Group glassList entries by identical knife size + type into a purchase schedule. */
function buildGlassSchedule(bom: FabricationBOM): GlassScheduleRow[] {
  const map = new Map<string, GlassScheduleRow>();

  for (const pane of bom.glassList) {
    // Trapezoid panes key on both edge heights — they cannot share a schedule
    // row with a rectangular pane that happens to have the same max height.
    const key = pane.shape === 'trapezoid'
      ? `${pane.widthInch.toFixed(4)}x${(pane.heightInchLeft ?? 0).toFixed(4)}x${(pane.heightInchRight ?? 0).toFixed(4)}x${pane.glassType}`
      : `${pane.widthInch.toFixed(4)}x${pane.heightInch.toFixed(4)}x${pane.glassType}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty++;
      existing.totalSF   = round2(existing.totalSF + pane.areaSF);
      existing.marks.push(pane.mark);
    } else {
      map.set(key, {
        widthInch:  pane.widthInch,
        heightInch: pane.heightInch,
        areaSF:     pane.areaSF,
        qty:        1,
        totalSF:    pane.areaSF,
        glassType:  pane.glassType,
        marks:      [pane.mark],
        ...(pane.shape === 'trapezoid' ? {
          shape:           'trapezoid',
          heightInchLeft:  pane.heightInchLeft,
          heightInchRight: pane.heightInchRight,
        } : {}),
      });
    }
  }

  // Sort: spandrel last, then by area descending
  return Array.from(map.values()).sort((a, b) => {
    if (a.glassType !== b.glassType) {
      return a.glassType === 'vision' ? -1 : 1;
    }
    return b.areaSF - a.areaSF;
  });
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
