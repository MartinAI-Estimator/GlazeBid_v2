/**
 * archetypes.ts — "Rosetta Stone" Architecture for multi-vendor BOM generation.
 *
 * Two independent layers:
 *
 *  Layer 1 — SystemArchetype
 *    The universal parametric definition of a glazing system.
 *    Contains only geometry rules: profileWidth, profileDepth, glassBite.
 *    Has no manufacturer identity whatsoever.
 *    Archetype IDs match the ProfileKey union in useProjectStore so the UI's
 *    existing FRAME_PROFILES catalog is always derivable.
 *
 *  Layer 2 — VendorSystem
 *    Maps an Archetype's generic part ROLES (vertical-mullion, horizontal-member,
 *    shear-block, …) to a specific manufacturer's part numbers, weights, and
 *    descriptions.
 *
 * Usage pattern — 1-Click Value Engineering:
 *
 *   const geom: FrameGeometry = { widthInches, heightInches, grid };
 *
 *   const kawneerBOM = bomGenerator(geom, VENDOR_CATALOG['kawneer-451t']);
 *   const tubeliteBOM = bomGenerator(geom, VENDOR_CATALOG['tubelite-t14000']);
 *   const ykkBOM      = bomGenerator(geom, VENDOR_CATALOG['ykk-35h']);
 *
 *   // Three parallel BOMs — same geometry, different part numbers & weights.
 *
 * Extension policy:
 *   • To add a new vendor: append to VENDOR_CATALOG only.
 *   • To add a new system depth: append to ARCHETYPE_CATALOG only.
 *   • Frame geometry (GridSpec) never changes between scenarios.
 *
 * Seeded archetypes: 8 (matching ProfileKey values).
 * Seeded vendors: Kawneer, Tubelite, YKK AP, EFCO (storefront + CW lines).
 *
 * Part numbers are from publicly available specification documents; weights
 * are typical published values for each product line.
 */

// ── SystemArchetype ───────────────────────────────────────────────────────────

export type SystemCategory =
  | 'storefront'
  | 'curtainwall'
  | 'window-wall'
  | 'entrance';

/**
 * The universal, manufacturer-neutral description of a glazing system type.
 * Think of this as an ISO blueprint — it defines what the system IS geometrically,
 * without knowing who makes it.
 */
export type SystemArchetype = {
  /** Unique key — matches ProfileKey in useProjectStore for interoperability. */
  id:               string;
  /** Display label, e.g. "Storefront 4.5\" (Standard)". */
  label:            string;
  category:         SystemCategory;
  /**
   * Visible face / sightline width in inches.
   * Also used as the horizontal cut deduction per the screw-spline formula:
   *   horizontalCutLength = bayWidth − profileWidth
   */
  profileWidth:     number;
  /** System depth front-to-back in inches. Governs aluminum weight & thermal class. */
  profileDepth:     number;
  /**
   * How far the glass edge extends into the glazing pocket (inches).
   * Glass knife size = DLO + 2 × glassBite.
   */
  glassBite:        number;
  /** Maximum unsupported mullion span in inches (structural limit). */
  maxSpanMullionIn: number;
  /** Maximum unsupported transom span in inches. */
  maxSpanTransomIn: number;
};

// ── VendorSystem ──────────────────────────────────────────────────────────────

/**
 * Generic roles that every extrusion member in a glazing frame can fulfill.
 * VendorSystem maps each role to a manufacturer part number.
 *
 * Not every role is required for every system:
 *   - Storefront screw-spline → shear-block not applicable
 *   - SSG curtainwall → pressure-plate not applicable
 *   Use Partial<Record<PartRole, VendorPartEntry>> accordingly.
 */
export type PartRole =
  | 'vertical-mullion'      // Primary vertical extrusion (jambs + interior mullions)
  | 'horizontal-member'     // Head, sill, and transom extrusion (same part family)
  | 'shear-block'           // Structural shear connection between vertical and horizontal
  | 'setting-block'         // Glass edge setting/load blocks
  | 'pressure-plate'        // Captured CW: exterior clamp plate
  | 'cap-cover'             // Snap-on finish cover over pressure plate
  | 'corner-key'            // 45° die-cast corner key at head/jamb junction
  | 'door-header'           // Head extrusion specific to door bays
  | 'door-sill-closer'      // Threshold or door bottom (ADA compliance hardware)
  | 'door-jamb-extrusion';  // Jamb extrusion sized to door-frame reveal

export type VendorPartEntry = {
  role:         PartRole;
  /** Manufacturer's catalog part number, as it would appear on a purchase order. */
  partNumber:   string;
  /** Short plain-language description. */
  description:  string;
  /** Published weight in lbs per linear foot. Used for material takeoff weight. */
  weightPerLF?: number;
  /**
   * List price in USD per linear foot (or per piece for setting blocks).
   * Optional — populate from a price book integration when available.
   */
  unitCostPerLF?: number;
};

export type VendorSystem = {
  /** Unique key, e.g. 'kawneer-451t'. Used as the lookup key in VENDOR_CATALOG. */
  id:           string;
  manufacturer: string;
  productLine:  string;
  /** The SystemArchetype.id this product satisfies. Binds geometry to vendor. */
  archetypeId:  string;
  /**
   * CSI MasterFormat section for specifying this system.
   * Storefront: 08 41 13 | Curtainwall: 08 44 13 | Entrance: 08 42 29
   */
  specSection:  string;
  /**
   * Part mappings — Partial because not all roles apply to every system.
   * bomGenerator falls back to partNumber: 'TBD' for any missing role.
   */
  parts:        Partial<Record<PartRole, VendorPartEntry>>;
  notes?:       string;
};

// ── Archetype Catalog ─────────────────────────────────────────────────────────

export const ARCHETYPE_CATALOG: Record<string, SystemArchetype> = {
  'sf-250': {
    id: 'sf-250', label: 'Storefront 2.5"', category: 'storefront',
    profileWidth: 2.0,  profileDepth: 2.5,  glassBite: 0.5,
    maxSpanMullionIn: 96,  maxSpanTransomIn: 72,
  },
  'sf-450': {
    id: 'sf-450', label: 'Storefront 4.5" (Standard)', category: 'storefront',
    profileWidth: 2.0,  profileDepth: 4.5,  glassBite: 0.75,
    maxSpanMullionIn: 144, maxSpanTransomIn: 96,
  },
  'sf-600': {
    id: 'sf-600', label: 'Storefront 6" (Thermal)', category: 'storefront',
    profileWidth: 2.0,  profileDepth: 6.0,  glassBite: 0.75,
    maxSpanMullionIn: 168, maxSpanTransomIn: 108,
  },
  'ww-600': {
    id: 'ww-600', label: 'Window Wall 6"', category: 'window-wall',
    profileWidth: 2.0,  profileDepth: 6.0,  glassBite: 1.0,
    maxSpanMullionIn: 180, maxSpanTransomIn: 120,
  },
  'cw-shallow': {
    id: 'cw-shallow', label: 'Curtainwall 7.5" (Shallow)', category: 'curtainwall',
    profileWidth: 2.5,  profileDepth: 7.5,  glassBite: 1.0,
    maxSpanMullionIn: 216, maxSpanTransomIn: 120,
  },
  'cw-medium': {
    id: 'cw-medium', label: 'Curtainwall 10.5" (Medium)', category: 'curtainwall',
    profileWidth: 2.5,  profileDepth: 10.5, glassBite: 1.0,
    maxSpanMullionIn: 288, maxSpanTransomIn: 144,
  },
  'cw-deep': {
    id: 'cw-deep', label: 'Curtainwall 12" (Deep)', category: 'curtainwall',
    profileWidth: 2.5,  profileDepth: 12.0, glassBite: 1.0,
    maxSpanMullionIn: 360, maxSpanTransomIn: 180,
  },
  'int-sf': {
    id: 'int-sf', label: 'Interior Storefront 2.5"', category: 'storefront',
    profileWidth: 1.75, profileDepth: 2.5,  glassBite: 0.5,
    maxSpanMullionIn: 120, maxSpanTransomIn: 84,
  },
};

// ── Vendor Catalog ────────────────────────────────────────────────────────────
//
// Part numbers from publicly available product specification documents.
// Weights (lb/LF) from published technical data.
//
// Example: Kawneer 451T Technical Manual, Tubelite T14000 Spec Sheet,
//          YKK AP 35H Catalog, EFCO Series 400 Engineering Guide.

export const VENDOR_CATALOG: Record<string, VendorSystem> = {

  // ── Kawneer 451T Trifab (4.5" storefront, screw-spline) ──────────────────
  'kawneer-451t': {
    id: 'kawneer-451t',
    manufacturer: 'Kawneer',
    productLine:  '451T Trifab Framing',
    archetypeId:  'sf-450',
    specSection:  '08 41 13',
    parts: {
      'vertical-mullion':   { role: 'vertical-mullion',   partNumber: '451-010',    description: 'Kawneer 451T Standard Vertical Mullion',          weightPerLF: 1.25  },
      'horizontal-member':  { role: 'horizontal-member',  partNumber: '451-020',    description: 'Kawneer 451T Head/Sill/Transom',                  weightPerLF: 0.95  },
      'shear-block':        { role: 'shear-block',        partNumber: '451-SB01',   description: 'Kawneer 451T Shear Block Assembly'                                   },
      'setting-block':      { role: 'setting-block',      partNumber: '451-SETBLK', description: 'Neoprene Setting Block 4"'                                           },
      'corner-key':         { role: 'corner-key',         partNumber: '451-CK45',   description: 'Kawneer 451T Die-Cast Corner Key'                                    },
    },
    notes: 'Horizontal members notch into verticals. Screw-spline assembly.',
  },

  // ── Kawneer 451T Trifab Heavy (same product, heavy-duty mullion variant) ──
  'kawneer-451t-hd': {
    id: 'kawneer-451t-hd',
    manufacturer: 'Kawneer',
    productLine:  '451T Trifab (Heavy Mullion)',
    archetypeId:  'sf-450',
    specSection:  '08 41 13',
    parts: {
      'vertical-mullion':   { role: 'vertical-mullion',   partNumber: '451-012',    description: 'Kawneer 451T Heavy-Duty Vertical Mullion',         weightPerLF: 1.95  },
      'horizontal-member':  { role: 'horizontal-member',  partNumber: '451-020',    description: 'Kawneer 451T Head/Sill/Transom',                  weightPerLF: 0.95  },
      'shear-block':        { role: 'shear-block',        partNumber: '451-SB01',   description: 'Kawneer 451T Shear Block Assembly'                                   },
      'setting-block':      { role: 'setting-block',      partNumber: '451-SETBLK', description: 'Neoprene Setting Block 4"'                                           },
      'corner-key':         { role: 'corner-key',         partNumber: '451-CK45',   description: 'Kawneer 451T Die-Cast Corner Key'                                    },
    },
    notes: 'Upgraded to 451-012 heavy mullion for spans > 120".',
  },

  // ── Kawneer 1600-1 Curtainwall (6" shallow CW) ───────────────────────────
  'kawneer-1600-1': {
    id: 'kawneer-1600-1',
    manufacturer: 'Kawneer',
    productLine:  '1600 Wall System 1',
    archetypeId:  'cw-shallow',
    specSection:  '08 44 13',
    parts: {
      'vertical-mullion':   { role: 'vertical-mullion',   partNumber: '1600-V100',  description: 'Kawneer 1600-1 Vertical Mullion',                 weightPerLF: 2.10  },
      'horizontal-member':  { role: 'horizontal-member',  partNumber: '1600-H100',  description: 'Kawneer 1600-1 Horizontal Transom',               weightPerLF: 1.60  },
      'pressure-plate':     { role: 'pressure-plate',     partNumber: '1600-PP10',  description: 'Kawneer 1600-1 Pressure Plate',                   weightPerLF: 0.48  },
      'cap-cover':          { role: 'cap-cover',          partNumber: '1600-CC10',  description: 'Kawneer 1600-1 Snap-On Cap',                      weightPerLF: 0.30  },
      'setting-block':      { role: 'setting-block',      partNumber: '1600-SB4',   description: 'Neoprene Setting Block 4" (CW)'                                      },
      'shear-block':        { role: 'shear-block',        partNumber: '1600-SHB1',  description: 'Kawneer 1600 Shear Block'                                            },
    },
    notes: 'Pressure-plate glazing. Thermal strut standard.',
  },

  // ── Tubelite T14000 (4.5" storefront, pour-and-debridge) ─────────────────
  'tubelite-t14000': {
    id: 'tubelite-t14000',
    manufacturer: 'Tubelite',
    productLine:  'E14000 Storefront',
    archetypeId:  'sf-450',
    specSection:  '08 41 13',
    parts: {
      'vertical-mullion':   { role: 'vertical-mullion',   partNumber: 'E14000-V',   description: 'Tubelite E14000 Integral Vertical',               weightPerLF: 1.18  },
      'horizontal-member':  { role: 'horizontal-member',  partNumber: 'E14000-H',   description: 'Tubelite E14000 Horizontal',                      weightPerLF: 0.90  },
      'shear-block':        { role: 'shear-block',        partNumber: 'E14000-SB',  description: 'Tubelite E14000 Shear Block'                                         },
      'setting-block':      { role: 'setting-block',      partNumber: 'SB-NEOP-4',  description: 'Neoprene Setting Block 4"'                                           },
      'corner-key':         { role: 'corner-key',         partNumber: 'E14000-CK',  description: 'Tubelite E14000 Corner Key'                                          },
    },
    notes: 'Pour-and-debridge thermal break. Compatible with Kawneer E14000 interchange.',
  },

  // ── Tubelite E21600 (6" storefront / thermal) ────────────────────────────
  'tubelite-e21600': {
    id: 'tubelite-e21600',
    manufacturer: 'Tubelite',
    productLine:  'E21600 Thermal Storefront',
    archetypeId:  'sf-600',
    specSection:  '08 41 13',
    parts: {
      'vertical-mullion':   { role: 'vertical-mullion',   partNumber: 'E21600-V',   description: 'Tubelite E21600 Thermal Vertical',                weightPerLF: 1.42  },
      'horizontal-member':  { role: 'horizontal-member',  partNumber: 'E21600-H',   description: 'Tubelite E21600 Thermal Horizontal',              weightPerLF: 1.05  },
      'shear-block':        { role: 'shear-block',        partNumber: 'E21600-SB',  description: 'Tubelite E21600 Shear Block'                                         },
      'setting-block':      { role: 'setting-block',      partNumber: 'SB-NEOP-4',  description: 'Neoprene Setting Block 4"'                                           },
      'corner-key':         { role: 'corner-key',         partNumber: 'E21600-CK',  description: 'Tubelite E21600 Corner Key'                                          },
    },
  },

  // ── YKK AP YHC 35H (4.5" storefront) ─────────────────────────────────────
  'ykk-35h': {
    id: 'ykk-35h',
    manufacturer: 'YKK AP',
    productLine:  'YHC 35H Storefront',
    archetypeId:  'sf-450',
    specSection:  '08 41 13',
    parts: {
      'vertical-mullion':   { role: 'vertical-mullion',   partNumber: '35H-1000',   description: 'YKK 35H Integral Vertical Mullion',               weightPerLF: 1.22  },
      'horizontal-member':  { role: 'horizontal-member',  partNumber: '35H-2000',   description: 'YKK 35H Horizontal Member',                       weightPerLF: 0.88  },
      'shear-block':        { role: 'shear-block',        partNumber: '35H-SB',     description: 'YKK 35H Shear Block'                                                },
      'setting-block':      { role: 'setting-block',      partNumber: '35H-SETBLK', description: 'Neoprene Setting Block 4"'                                           },
      'corner-key':         { role: 'corner-key',         partNumber: '35H-CK',     description: 'YKK 35H Corner Key'                                                 },
    },
    notes: 'Dual thermal-break pour-and-debridge. YHC series.',
  },

  // ── YKK AP YCW 750 (7.5" curtainwall) ────────────────────────────────────
  'ykk-ycw750': {
    id: 'ykk-ycw750',
    manufacturer: 'YKK AP',
    productLine:  'YCW 750 Curtainwall',
    archetypeId:  'cw-shallow',
    specSection:  '08 44 13',
    parts: {
      'vertical-mullion':   { role: 'vertical-mullion',   partNumber: 'YCW750-V',   description: 'YKK YCW750 Vertical Mullion',                    weightPerLF: 2.05  },
      'horizontal-member':  { role: 'horizontal-member',  partNumber: 'YCW750-H',   description: 'YKK YCW750 Horizontal Transom',                  weightPerLF: 1.55  },
      'pressure-plate':     { role: 'pressure-plate',     partNumber: 'YCW750-PP',  description: 'YKK YCW750 Pressure Plate',                      weightPerLF: 0.44  },
      'cap-cover':          { role: 'cap-cover',          partNumber: 'YCW750-CC',  description: 'YKK YCW750 Cap Cover',                           weightPerLF: 0.28  },
      'setting-block':      { role: 'setting-block',      partNumber: 'YCW-SB4',    description: 'Neoprene Setting Block 4" (CW)'                                      },
      'shear-block':        { role: 'shear-block',        partNumber: 'YCW750-SHB', description: 'YKK YCW750 Shear Block'                                              },
    },
    notes: 'Dual thermal break. Stick-built installation.',
  },

  // ── EFCO Series 400 (4.5" storefront) ────────────────────────────────────
  'efco-400': {
    id: 'efco-400',
    manufacturer: 'EFCO',
    productLine:  'Series 400 Storefront',
    archetypeId:  'sf-450',
    specSection:  '08 41 13',
    parts: {
      'vertical-mullion':   { role: 'vertical-mullion',   partNumber: '404-100',    description: 'EFCO 400 Series Standard Vertical',               weightPerLF: 1.20  },
      'horizontal-member':  { role: 'horizontal-member',  partNumber: '404-200',    description: 'EFCO 400 Series Horizontal',                      weightPerLF: 0.92  },
      'shear-block':        { role: 'shear-block',        partNumber: '404-SB',     description: 'EFCO 400 Shear Block'                                                },
      'setting-block':      { role: 'setting-block',      partNumber: 'SB-N4',      description: 'Neoprene Setting Block 4"'                                           },
      'corner-key':         { role: 'corner-key',         partNumber: '404-CK',     description: 'EFCO 400 Corner Key Die-Cast'                                        },
    },
    notes: 'Screw-spline assembly. Thermally improved option available.',
  },

  // ── EFCO Series 5600 (6" curtainwall) ────────────────────────────────────
  'efco-5600': {
    id: 'efco-5600',
    manufacturer: 'EFCO',
    productLine:  'Series 5600 Curtainwall',
    archetypeId:  'cw-shallow',
    specSection:  '08 44 13',
    parts: {
      'vertical-mullion':   { role: 'vertical-mullion',   partNumber: '5600-V1',    description: 'EFCO 5600 Vertical Mullion',                      weightPerLF: 2.00  },
      'horizontal-member':  { role: 'horizontal-member',  partNumber: '5600-H1',    description: 'EFCO 5600 Horizontal Transom',                    weightPerLF: 1.52  },
      'pressure-plate':     { role: 'pressure-plate',     partNumber: '5600-PP',    description: 'EFCO 5600 Pressure Plate',                        weightPerLF: 0.46  },
      'cap-cover':          { role: 'cap-cover',          partNumber: '5600-CC',    description: 'EFCO 5600 Cap Cover',                             weightPerLF: 0.29  },
      'setting-block':      { role: 'setting-block',      partNumber: '5600-SB',    description: 'Neoprene Setting Block 4" (CW)'                                      },
      'shear-block':        { role: 'shear-block',        partNumber: '5600-SHB',   description: 'EFCO 5600 Shear Block'                                               },
    },
    notes: 'Thermal strut standard on 5600 series.',
  },
};

/**
 * The list of archetype IDs that have at least one vendor in the catalog.
 * Useful for populating a vendor-selection dropdown filtered by the active
 * archetype on a frame.
 */
export function getVendorsForArchetype(archetypeId: string): VendorSystem[] {
  return Object.values(VENDOR_CATALOG).filter(v => v.archetypeId === archetypeId);
}
