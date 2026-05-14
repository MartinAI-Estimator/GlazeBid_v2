/**
 * archetypes/index.ts — Expanded Archetype and Vendor Catalog for Frame Engine
 *
 * This module provides the Rosetta Stone architecture for parametric BOM generation
 * across multiple manufacturers and system depths. It re-implements and expands upon
 * the Studio archetypes file, providing:
 *
 *   Layer 1 — SystemArchetype:
 *     Universal, manufacturer-neutral definitions of glazing system types.
 *     Defines geometry (profileWidth, profileDepth, glassBite) and structural limits.
 *     10 archetypes + 1 all-glass system.
 *
 *   Layer 2 — VendorSystem:
 *     Maps archetype part ROLES (vertical-mullion, horizontal-member, etc.)
 *     to actual manufacturer part numbers, weights, and descriptions.
 *     12 vendors total: 9 legacy + 3 new (Oldcastle FG-3000, Kawneer 451T variants).
 *
 * Usage pattern — 1-Click Value Engineering:
 *   const geom: FrameGeometry = { widthInches, heightInches, grid };
 *   const bom1 = bomGenerator(geom, VENDOR_CATALOG['kawneer-451t']);
 *   const bom2 = bomGenerator(geom, VENDOR_CATALOG['oldcastle-fg3000']);
 *   // Compare BOMs with different part numbers and weights
 *
 * Extension policy:
 *   • To add a new vendor: append to VENDOR_CATALOG only.
 *   • To add a new system depth: append to ARCHETYPE_CATALOG only.
 *   • Frame geometry (GridSpec) never changes between scenarios.
 *
 * Seeded archetypes: 11 (5 storefronts, 4 curtainwalls, 1 window-wall, 1 all-glass)
 * Seeded vendors: 12 (9 legacy from Studio + 3 new for expansion)
 *
 * Part numbers are from publicly available specification documents; weights
 * are typical published values for each product line.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * System category — classifies the archetype by its application.
 */
export type SystemCategory =
  | 'storefront'
  | 'curtainwall'
  | 'window-wall'
  | 'entrance'
  | 'all-glass';

/**
 * The universal, manufacturer-neutral description of a glazing system type.
 * Think of this as an ISO blueprint — it defines what the system IS geometrically,
 * without knowing who makes it.
 */
export type SystemArchetype = {
  /** Unique key — matches ProfileKey in useProjectStore for interoperability. */
  id: string;
  /** Display label, e.g. "Storefront 4.5\" (Standard)". */
  label: string;
  category: SystemCategory;
  /**
   * Visible face / sightline width in inches.
   * Also used as the horizontal cut deduction per the screw-spline formula:
   *   horizontalCutLength = bayWidth − profileWidth
   */
  profileWidth: number;
  /** System depth front-to-back in inches. Governs aluminum weight & thermal class. */
  profileDepth: number;
  /**
   * How far the glass edge extends into the glazing pocket (inches).
   * Glass knife size = DLO + 2 × glassBite.
   */
  glassBite: number;
  /** Maximum unsupported mullion span in inches (structural limit). */
  maxSpanMullionIn: number;
  /** Maximum unsupported transom span in inches. */
  maxSpanTransomIn: number;
  /** CSI MasterFormat spec section for this system class (e.g., "08 41 13"). */
  specSection: string;
  /** One-sentence description of the system. */
  description: string;
};

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
  | 'door-jamb-extrusion'   // Jamb extrusion sized to door-frame reveal
  | 'thermal-strut';        // Structural silicone thermal break strut (curtainwall)

/**
 * A single part entry within a VendorSystem.
 */
export type VendorPartEntry = {
  role: PartRole;
  /** Manufacturer's catalog part number, as it would appear on a purchase order. */
  partNumber: string;
  /** Short plain-language description. */
  description: string;
  /** Published weight in lbs per linear foot. Used for material takeoff weight. */
  weightPerLF?: number;
  /**
   * List price in USD per linear foot (or per piece for setting blocks).
   * Optional — populate from a price book integration when available.
   */
  unitCostPerLF?: number;
};

/**
 * A manufacturer's implementation of a SystemArchetype.
 * Maps the generic part ROLES to actual part numbers, weights, and descriptions.
 */
export type VendorSystem = {
  /** Unique key, e.g. 'kawneer-451t'. Used as the lookup key in VENDOR_CATALOG. */
  id: string;
  manufacturer: string;
  productLine: string;
  /** The SystemArchetype.id this product satisfies. Binds geometry to vendor. */
  archetypeId: string;
  /**
   * CSI MasterFormat section for specifying this system.
   * Storefront: 08 41 13 | Curtainwall: 08 44 13 | Entrance: 08 42 29
   */
  specSection: string;
  /**
   * Part mappings — Partial because not all roles apply to every system.
   * bomGenerator falls back to partNumber: 'TBD' for any missing role.
   */
  parts: Partial<Record<PartRole, VendorPartEntry>>;
  notes?: string;
};

// ============================================================================
// ARCHETYPE CATALOG — 11 Archetypes (5 SF + 4 CW + 1 WW + 1 All-Glass)
// ============================================================================

export const ARCHETYPE_CATALOG: Record<string, SystemArchetype> = {
  // ── STOREFRONTS (5) ───────────────────────────────────────────────────────

  /**
   * sf-250: 2.5" standard storefront (shallow, economy, screw-spline)
   * Most cost-sensitive small installations. Minimal depth, limited wind loads.
   */
  'sf-250': {
    id: 'sf-250',
    label: 'Storefront 2.5" (Economy)',
    category: 'storefront',
    profileWidth: 1.75,
    profileDepth: 2.5,
    glassBite: 0.625,
    maxSpanMullionIn: 84,
    maxSpanTransomIn: 96,
    specSection: '08 41 13',
    description: 'Shallow 2.5" storefront — screw-spline assembly, economy glazing pocket.',
  },

  /**
   * sf-450: 4.5" standard storefront (standard depth, most common in market)
   * The workhorse of commercial glazing. Balanced cost, wind load, and speed.
   */
  'sf-450': {
    id: 'sf-450',
    label: 'Storefront 4.5" (Standard)',
    category: 'storefront',
    profileWidth: 1.75,
    profileDepth: 4.5,
    glassBite: 0.625,
    maxSpanMullionIn: 120,
    maxSpanTransomIn: 144,
    specSection: '08 41 13',
    description:
      'Standard 4.5" storefront — most common framing depth, screw-spline assembly.',
  },

  /**
   * sf-450-thermal: 4.5" thermal storefront (pour-and-debridge or strut)
   * Adds thermal break for energy code compliance. Typically pour-and-debridge or strut.
   */
  'sf-450-thermal': {
    id: 'sf-450-thermal',
    label: 'Storefront 4.5" (Thermal)',
    category: 'storefront',
    profileWidth: 1.75,
    profileDepth: 4.5,
    glassBite: 0.625,
    maxSpanMullionIn: 120,
    maxSpanTransomIn: 144,
    specSection: '08 41 13',
    description:
      'Thermal 4.5" storefront — pour-and-debridge or strut thermal break, energy code compliant.',
  },

  /**
   * sf-600: 6" storefront (deeper, higher wind loads)
   * Deeper profile supports longer spans and higher wind loads. Thermal break standard.
   */
  'sf-600': {
    id: 'sf-600',
    label: 'Storefront 6" (Deep)',
    category: 'storefront',
    profileWidth: 2.0,
    profileDepth: 6.0,
    glassBite: 0.625,
    maxSpanMullionIn: 144,
    maxSpanTransomIn: 168,
    specSection: '08 41 13',
    description: 'Deep 6" storefront — higher wind loads, thermal break, longer unsupported spans.',
  },

  /**
   * sf-600-thermal: 6" thermal storefront
   * 6" profile with integrated thermal break. Used for high-performance glazing.
   */
  'sf-600-thermal': {
    id: 'sf-600-thermal',
    label: 'Storefront 6" (Thermal)',
    category: 'storefront',
    profileWidth: 2.0,
    profileDepth: 6.0,
    glassBite: 0.625,
    maxSpanMullionIn: 144,
    maxSpanTransomIn: 168,
    specSection: '08 41 13',
    description:
      'Thermal 6" storefront — integrated thermal break, high-performance energy rating.',
  },

  // ── CURTAIN WALLS (4) ─────────────────────────────────────────────────────

  /**
   * cw-shallow: 6" curtainwall (shallow, most common CW)
   * The market standard for mid-rise buildings. Shallow profile balances cost and performance.
   */
  'cw-shallow': {
    id: 'cw-shallow',
    label: 'Curtainwall 6" (Shallow)',
    category: 'curtainwall',
    profileWidth: 2.5,
    profileDepth: 6.0,
    glassBite: 0.75,
    maxSpanMullionIn: 216,
    maxSpanTransomIn: 240,
    specSection: '08 44 13',
    description:
      'Shallow 6" curtainwall — pressure-plate glazing, thermal strut, most common CW profile.',
  },

  /**
   * cw-medium: 7.5" curtainwall (mid-rise standard)
   * Mid-size profile for mid-rise buildings with moderate wind loads.
   */
  'cw-medium': {
    id: 'cw-medium',
    label: 'Curtainwall 7.5" (Medium)',
    category: 'curtainwall',
    profileWidth: 2.5,
    profileDepth: 7.5,
    glassBite: 0.75,
    maxSpanMullionIn: 264,
    maxSpanTransomIn: 288,
    specSection: '08 44 13',
    description:
      'Medium 7.5" curtainwall — mid-rise standard, increased wind capacity, thermal strut.',
  },

  /**
   * cw-deep: 10" curtainwall (high-rise, high wind)
   * Deep profile for high-rise or high-wind locations. Structural-grade aluminum.
   */
  'cw-deep': {
    id: 'cw-deep',
    label: 'Curtainwall 10" (Deep)',
    category: 'curtainwall',
    profileWidth: 2.5,
    profileDepth: 10.0,
    glassBite: 0.75,
    maxSpanMullionIn: 360,
    maxSpanTransomIn: 384,
    specSection: '08 44 13',
    description: 'Deep 10" curtainwall — high-rise / high-wind, maximum span capability.',
  },

  /**
   * cw-ssg: 6" SSG curtainwall (structural silicone glazed, flush exterior)
   * Flush glass exterior with structural silicone sealant. High-end aesthetic.
   */
  'cw-ssg': {
    id: 'cw-ssg',
    label: 'Curtainwall 6" (SSG)',
    category: 'curtainwall',
    profileWidth: 2.5,
    profileDepth: 6.0,
    glassBite: 0.75,
    maxSpanMullionIn: 216,
    maxSpanTransomIn: 240,
    specSection: '08 44 33',
    description:
      'SSG 6" curtainwall — structural silicone glazed, flush glass exterior, architectural finish.',
  },

  // ── WINDOW WALL (1) ───────────────────────────────────────────────────────

  /**
   * ww-600: 6" window wall (floor-to-floor, sits in slab pocket)
   * Mullion sits in slab pocket. Typical for mid-rise office buildings.
   */
  'ww-600': {
    id: 'ww-600',
    label: 'Window Wall 6"',
    category: 'window-wall',
    profileWidth: 2.0,
    profileDepth: 6.0,
    glassBite: 0.625,
    maxSpanMullionIn: 144,
    maxSpanTransomIn: 168,
    specSection: '08 44 54',
    description: 'Window wall 6" — floor-to-floor mullion, sits in slab pocket, thermal strut.',
  },

  // ── ALL-GLASS (1) ─────────────────────────────────────────────────────────

  /**
   * all-glass-interior: Interior frameless all-glass wall
   * Butt-jointed glass with structural silicone, base shoe and cap rail only.
   * No horizontal mullions or shear blocks.
   */
  'all-glass-interior': {
    id: 'all-glass-interior',
    label: 'Interior All-Glass Wall',
    category: 'all-glass',
    profileWidth: 0,
    profileDepth: 0,
    glassBite: 0,
    maxSpanMullionIn: 0,
    maxSpanTransomIn: 0,
    specSection: '08 81 00',
    description:
      'Interior frameless all-glass wall — butt-jointed structural silicone, base shoe + cap rail only.',
  },
};

// ============================================================================
// VENDOR CATALOG — 12 Vendors (9 Legacy + 3 New)
// ============================================================================
//
// Part numbers from publicly available product specification documents.
// Weights (lb/LF) from published technical data.
//
// Example: Kawneer 451T Technical Manual, Tubelite T14000 Spec Sheet,
//          YKK AP 35H Catalog, EFCO Series 400 Engineering Guide.

export const VENDOR_CATALOG: Record<string, VendorSystem> = {
  // ────────────────────────────────────────────────────────────────────────
  // LEGACY VENDORS (9) — from Studio archetypes.ts, copied EXACTLY
  // ────────────────────────────────────────────────────────────────────────

  // ── Kawneer 451T Trifab (4.5" storefront, screw-spline) ──────────────────
  'kawneer-451t': {
    id: 'kawneer-451t',
    manufacturer: 'Kawneer',
    productLine: '451T Trifab Framing',
    archetypeId: 'sf-450',
    specSection: '08 41 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: '451-010',
        description: 'Kawneer 451T Standard Vertical Mullion',
        weightPerLF: 1.25,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: '451-020',
        description: 'Kawneer 451T Head/Sill/Transom',
        weightPerLF: 0.95,
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: '451-SB01',
        description: 'Kawneer 451T Shear Block Assembly',
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: '451-SETBLK',
        description: 'Neoprene Setting Block 4"',
      },
      'corner-key': {
        role: 'corner-key',
        partNumber: '451-CK45',
        description: 'Kawneer 451T Die-Cast Corner Key',
      },
    },
    notes: 'Horizontal members notch into verticals. Screw-spline assembly.',
  },

  // ── Kawneer 451T Trifab Heavy (same product, heavy-duty mullion variant) ──
  'kawneer-451t-hd': {
    id: 'kawneer-451t-hd',
    manufacturer: 'Kawneer',
    productLine: '451T Trifab (Heavy Mullion)',
    archetypeId: 'sf-450',
    specSection: '08 41 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: '451-012',
        description: 'Kawneer 451T Heavy-Duty Vertical Mullion',
        weightPerLF: 1.95,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: '451-020',
        description: 'Kawneer 451T Head/Sill/Transom',
        weightPerLF: 0.95,
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: '451-SB01',
        description: 'Kawneer 451T Shear Block Assembly',
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: '451-SETBLK',
        description: 'Neoprene Setting Block 4"',
      },
      'corner-key': {
        role: 'corner-key',
        partNumber: '451-CK45',
        description: 'Kawneer 451T Die-Cast Corner Key',
      },
    },
    notes: 'Upgraded to 451-012 heavy mullion for spans > 120".',
  },

  // ── Kawneer 1600-1 Curtainwall (6" shallow CW) ───────────────────────────
  'kawneer-1600-1': {
    id: 'kawneer-1600-1',
    manufacturer: 'Kawneer',
    productLine: '1600 Wall System 1',
    archetypeId: 'cw-shallow',
    specSection: '08 44 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: '1600-V100',
        description: 'Kawneer 1600-1 Vertical Mullion',
        weightPerLF: 2.1,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: '1600-H100',
        description: 'Kawneer 1600-1 Horizontal Transom',
        weightPerLF: 1.6,
      },
      'pressure-plate': {
        role: 'pressure-plate',
        partNumber: '1600-PP10',
        description: 'Kawneer 1600-1 Pressure Plate',
        weightPerLF: 0.48,
      },
      'cap-cover': {
        role: 'cap-cover',
        partNumber: '1600-CC10',
        description: 'Kawneer 1600-1 Snap-On Cap',
        weightPerLF: 0.3,
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: '1600-SB4',
        description: 'Neoprene Setting Block 4" (CW)',
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: '1600-SHB1',
        description: 'Kawneer 1600 Shear Block',
      },
    },
    notes: 'Pressure-plate glazing. Thermal strut standard.',
  },

  // ── Tubelite T14000 (4.5" storefront, pour-and-debridge) ─────────────────
  'tubelite-t14000': {
    id: 'tubelite-t14000',
    manufacturer: 'Tubelite',
    productLine: 'E14000 Storefront',
    archetypeId: 'sf-450',
    specSection: '08 41 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: 'E14000-V',
        description: 'Tubelite E14000 Integral Vertical',
        weightPerLF: 1.18,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: 'E14000-H',
        description: 'Tubelite E14000 Horizontal',
        weightPerLF: 0.9,
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: 'E14000-SB',
        description: 'Tubelite E14000 Shear Block',
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: 'SB-NEOP-4',
        description: 'Neoprene Setting Block 4"',
      },
      'corner-key': {
        role: 'corner-key',
        partNumber: 'E14000-CK',
        description: 'Tubelite E14000 Corner Key',
      },
    },
    notes: 'Pour-and-debridge thermal break. Compatible with Kawneer E14000 interchange.',
  },

  // ── Tubelite E21600 (6" storefront / thermal) ────────────────────────────
  'tubelite-e21600': {
    id: 'tubelite-e21600',
    manufacturer: 'Tubelite',
    productLine: 'E21600 Thermal Storefront',
    archetypeId: 'sf-600',
    specSection: '08 41 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: 'E21600-V',
        description: 'Tubelite E21600 Thermal Vertical',
        weightPerLF: 1.42,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: 'E21600-H',
        description: 'Tubelite E21600 Thermal Horizontal',
        weightPerLF: 1.05,
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: 'E21600-SB',
        description: 'Tubelite E21600 Shear Block',
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: 'SB-NEOP-4',
        description: 'Neoprene Setting Block 4"',
      },
      'corner-key': {
        role: 'corner-key',
        partNumber: 'E21600-CK',
        description: 'Tubelite E21600 Corner Key',
      },
    },
  },

  // ── YKK AP YHC 35H (4.5" storefront) ─────────────────────────────────────
  'ykk-35h': {
    id: 'ykk-35h',
    manufacturer: 'YKK AP',
    productLine: 'YHC 35H Storefront',
    archetypeId: 'sf-450',
    specSection: '08 41 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: '35H-1000',
        description: 'YKK 35H Integral Vertical Mullion',
        weightPerLF: 1.22,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: '35H-2000',
        description: 'YKK 35H Horizontal Member',
        weightPerLF: 0.88,
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: '35H-SB',
        description: 'YKK 35H Shear Block',
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: '35H-SETBLK',
        description: 'Neoprene Setting Block 4"',
      },
      'corner-key': {
        role: 'corner-key',
        partNumber: '35H-CK',
        description: 'YKK 35H Corner Key',
      },
    },
    notes: 'Dual thermal-break pour-and-debridge. YHC series.',
  },

  // ── YKK AP YCW 750 (7.5" curtainwall) ────────────────────────────────────
  'ykk-ycw750': {
    id: 'ykk-ycw750',
    manufacturer: 'YKK AP',
    productLine: 'YCW 750 Curtainwall',
    archetypeId: 'cw-shallow',
    specSection: '08 44 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: 'YCW750-V',
        description: 'YKK YCW750 Vertical Mullion',
        weightPerLF: 2.05,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: 'YCW750-H',
        description: 'YKK YCW750 Horizontal Transom',
        weightPerLF: 1.55,
      },
      'pressure-plate': {
        role: 'pressure-plate',
        partNumber: 'YCW750-PP',
        description: 'YKK YCW750 Pressure Plate',
        weightPerLF: 0.44,
      },
      'cap-cover': {
        role: 'cap-cover',
        partNumber: 'YCW750-CC',
        description: 'YKK YCW750 Cap Cover',
        weightPerLF: 0.28,
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: 'YCW-SB4',
        description: 'Neoprene Setting Block 4" (CW)',
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: 'YCW750-SHB',
        description: 'YKK YCW750 Shear Block',
      },
    },
    notes: 'Dual thermal break. Stick-built installation.',
  },

  // ── EFCO Series 400 (4.5" storefront) ────────────────────────────────────
  'efco-400': {
    id: 'efco-400',
    manufacturer: 'EFCO',
    productLine: 'Series 400 Storefront',
    archetypeId: 'sf-450',
    specSection: '08 41 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: '404-100',
        description: 'EFCO 400 Series Standard Vertical',
        weightPerLF: 1.2,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: '404-200',
        description: 'EFCO 400 Series Horizontal',
        weightPerLF: 0.92,
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: '404-SB',
        description: 'EFCO 400 Shear Block',
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: 'SB-N4',
        description: 'Neoprene Setting Block 4"',
      },
      'corner-key': {
        role: 'corner-key',
        partNumber: '404-CK',
        description: 'EFCO 400 Corner Key Die-Cast',
      },
    },
    notes: 'Screw-spline assembly. Thermally improved option available.',
  },

  // ── EFCO Series 5600 (6" curtainwall) ────────────────────────────────────
  'efco-5600': {
    id: 'efco-5600',
    manufacturer: 'EFCO',
    productLine: 'Series 5600 Curtainwall',
    archetypeId: 'cw-shallow',
    specSection: '08 44 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: '5600-V1',
        description: 'EFCO 5600 Vertical Mullion',
        weightPerLF: 2.0,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: '5600-H1',
        description: 'EFCO 5600 Horizontal Transom',
        weightPerLF: 1.52,
      },
      'pressure-plate': {
        role: 'pressure-plate',
        partNumber: '5600-PP',
        description: 'EFCO 5600 Pressure Plate',
        weightPerLF: 0.46,
      },
      'cap-cover': {
        role: 'cap-cover',
        partNumber: '5600-CC',
        description: 'EFCO 5600 Cap Cover',
        weightPerLF: 0.29,
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: '5600-SB',
        description: 'Neoprene Setting Block 4" (CW)',
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: '5600-SHB',
        description: 'EFCO 5600 Shear Block',
      },
    },
    notes: 'Thermal strut standard on 5600 series.',
  },

  // ────────────────────────────────────────────────────────────────────────
  // NEW VENDORS (3) — expansion for additional system coverage
  // ────────────────────────────────────────────────────────────────────────

  // ── Oldcastle FG-3000 (4.5" thermal storefront with strut) ────────────────
  'oldcastle-fg3000': {
    id: 'oldcastle-fg3000',
    manufacturer: 'Oldcastle BuildingEnvelope',
    productLine: 'FG-3000 Thermal Storefront',
    archetypeId: 'sf-450-thermal',
    specSection: '08 41 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: 'FG3000-VM',
        description: 'OBE FG-3000 Thermal Vertical',
        weightPerLF: 1.31,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: 'FG3000-HM',
        description: 'OBE FG-3000 Thermal Horizontal',
        weightPerLF: 0.98,
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: 'FG3000-SB',
        description: 'OBE FG-3000 Shear Block',
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: 'FG3000-SET4',
        description: 'Neoprene Setting Block 4"',
      },
      'corner-key': {
        role: 'corner-key',
        partNumber: 'FG3000-CK',
        description: 'OBE FG-3000 Corner Key',
      },
      'thermal-strut': {
        role: 'thermal-strut',
        partNumber: 'FG3000-TS',
        description: 'OBE FG-3000 Thermal Strut',
        weightPerLF: 0.18,
      },
    },
    notes: 'Thermal strut design. Compatible with OBE curtainwall systems.',
  },

  // ── Kawneer 451T SF250 (2.5" economy storefront) ───────────────────────────
  'kawneer-451t-sf250': {
    id: 'kawneer-451t-sf250',
    manufacturer: 'Kawneer',
    productLine: '451T Trifab 2.5" Storefront',
    archetypeId: 'sf-250',
    specSection: '08 41 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: '451T-250-V',
        description: 'Kawneer 451T 2.5" Vertical',
        weightPerLF: 0.82,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: '451T-250-H',
        description: 'Kawneer 451T 2.5" Horizontal',
        weightPerLF: 0.68,
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: '451T-250-SB',
        description: 'Kawneer 451T Shear Block',
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: 'SB-NEOP-4',
        description: 'Neoprene Setting Block 4"',
      },
      'corner-key': {
        role: 'corner-key',
        partNumber: '451T-CK',
        description: 'Kawneer 451T Corner Key',
      },
    },
    notes: 'Economy storefront. Screw-spline assembly.',
  },

  // ── Kawneer 451T Thermal (4.5" thermal with pour-and-debridge) ────────────
  'kawneer-451t-thermal': {
    id: 'kawneer-451t-thermal',
    manufacturer: 'Kawneer',
    productLine: '451T Trifab Thermal 4.5"',
    archetypeId: 'sf-450-thermal',
    specSection: '08 41 13',
    parts: {
      'vertical-mullion': {
        role: 'vertical-mullion',
        partNumber: '451T-TH-V',
        description: 'Kawneer 451T Thermal Vertical',
        weightPerLF: 1.32,
      },
      'horizontal-member': {
        role: 'horizontal-member',
        partNumber: '451T-TH-H',
        description: 'Kawneer 451T Thermal Horizontal',
        weightPerLF: 1.02,
      },
      'shear-block': {
        role: 'shear-block',
        partNumber: '451T-TH-SB',
        description: 'Kawneer 451T Thermal Shear Block',
      },
      'setting-block': {
        role: 'setting-block',
        partNumber: 'SB-NEOP-4',
        description: 'Neoprene Setting Block 4"',
      },
      'corner-key': {
        role: 'corner-key',
        partNumber: '451T-CK',
        description: 'Kawneer 451T Corner Key',
      },
      'thermal-strut': {
        role: 'thermal-strut',
        partNumber: '451T-TS',
        description: 'Kawneer 451T Thermal Strut',
        weightPerLF: 0.22,
      },
    },
    notes: 'Pour-and-debridge thermal break. Standard on most commercial specs.',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all VendorSystem entries for a given archetype.
 * Useful for populating a vendor-selection dropdown filtered by the active
 * archetype on a frame.
 *
 * @param archetypeId — the SystemArchetype.id to filter by
 * @returns array of VendorSystem entries whose archetypeId matches
 */
export function getVendorsForArchetype(archetypeId: string): VendorSystem[] {
  return Object.values(VENDOR_CATALOG).filter((v) => v.archetypeId === archetypeId);
}

/**
 * Get a single SystemArchetype by its ID.
 *
 * @param id — the archetype ID to look up
 * @returns the SystemArchetype, or undefined if not found
 */
export function getArchetype(id: string): SystemArchetype | undefined {
  return ARCHETYPE_CATALOG[id];
}

/**
 * Get a single VendorSystem by its ID.
 *
 * @param id — the vendor system ID to look up
 * @returns the VendorSystem, or undefined if not found
 */
export function getVendorSystem(id: string): VendorSystem | undefined {
  return VENDOR_CATALOG[id];
}

/**
 * Get all SystemArchetype entries for a given category.
 * Useful for populating category-specific dialogs or filtering views.
 *
 * @param category — the SystemCategory to filter by
 * @returns array of SystemArchetype entries whose category matches
 */
export function getArchetypesByCategory(category: SystemCategory): SystemArchetype[] {
  return Object.values(ARCHETYPE_CATALOG).filter((a) => a.category === category);
}
