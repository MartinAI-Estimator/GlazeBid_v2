// ─── GlazeBid Smart System Packages ──────────────────────────────────────────
// Each entry defines the engineering profile for a glazing system type.
// ParametricFrameBuilder reads these instead of hardcoded constants so that
// switching systems live-recalculates every glass size, aluminum LF, and labor
// hour in the BOM without the estimator redrawing anything.
//
// geometry.verticalSightline   — face width of vertical mullions/posts (inches)
// geometry.horizontalSightline — face width of horizontal rails (inches)
// geometry.glassBite           — glass bite each side (inches); added to DLO for cut size
// labor.fabLFPerHour           — shop fabrication rate (LF of aluminum per hour)
// labor.installSqFtPerHour     — field installation rate (SqFt of glass per hour)

export const SYSTEM_PACKAGES = {
  sys_storefront: {
    id:   'sys_storefront',
    name: 'Storefront',
    engine: 'GRID',
    geometry: {
      verticalSightline:   2,
      horizontalSightline: 2,
      glassBite:           0.375,
    },
    labor: {
      fabLFPerHour:       12,   // shop: aluminum extrusion cut, fit, assemble
      installSqFtPerHour: 25,   // field: set frames, glaze, seal
    },
  },

  sys_cw_cap: {
    id:   'sys_cw_cap',
    name: 'Captured Curtain Wall',
    engine: 'GRID',
    geometry: {
      verticalSightline:   2.5,
      horizontalSightline: 2.5,
      glassBite:           0.5,
    },
    labor: {
      fabLFPerHour:       8,    // more complex stick-built assembly
      installSqFtPerHour: 18,
    },
  },

  sys_cw_ssg: {
    id:   'sys_cw_ssg',
    name: 'SSG Curtain Wall',
    engine: 'GRID',
    geometry: {
      verticalSightline:   2.5,
      horizontalSightline: 2.5,
      glassBite:           0.5,
    },
    labor: {
      fabLFPerHour:       6,    // SSG requires structural silicone shop-apply time
      installSqFtPerHour: 15,   // more involved field cure / inspection
    },
  },

  sys_int_sf: {
    id:   'sys_int_sf',
    name: 'Interior Storefront',
    engine: 'GRID',
    geometry: {
      verticalSightline:   1.5,
      horizontalSightline: 1.5,
      glassBite:           0.25,
    },
    labor: {
      fabLFPerHour:       14,   // lighter framing, faster fab
      installSqFtPerHour: 30,   // interior — no weather prep, faster install
    },
  },
};

// Ordered array for rendering in the Toolbelt
export const SYSTEM_PACKAGE_LIST = [
  SYSTEM_PACKAGES.sys_storefront,
  SYSTEM_PACKAGES.sys_cw_cap,
  SYSTEM_PACKAGES.sys_cw_ssg,
  SYSTEM_PACKAGES.sys_int_sf,
];

// Default system used on first load
export const DEFAULT_SYSTEM_ID = 'sys_storefront';

// ─── Smart Geometry Catalog — Base + Override Architecture ───────────────────
// Each system has a sensible industy-standard default PLUS a short list of the
// most frequently spec'd vendor presets.  The estimator selects a preset to
// load exact manufacturer geometry, or flips "Custom Override" to type any
// arbitrary values.  We never need to hardcode every SKU in existence.
//
// Fields per entry:
//   sightline    — face width of vertical mullions / posts (inches)
//   hSightline   — face width of horizontal rails (inches; equal to sightline for most systems)
//   bite         — glass bite per side, vertical (inches)
//   hBite        — glass bite per side, horizontal (inches; equal to bite for most systems)
export const SYSTEM_GEOMETRY_CATALOG = {
  sys_storefront: {
    default: { sightline: 2, hSightline: 2, bite: 0.375, hBite: 0.375 },
    presets: [
      { name: 'Kawneer 351T',          sightline: 2,    hSightline: 2,    bite: 0.375,  hBite: 0.375  },
      { name: 'Kawneer 451T',          sightline: 2,    hSightline: 2,    bite: 0.375,  hBite: 0.375  },
      { name: 'YKK YES 45 XT',         sightline: 2,    hSightline: 2,    bite: 0.4375, hBite: 0.4375 },
      { name: 'EFCO 5600',             sightline: 2,    hSightline: 2,    bite: 0.375,  hBite: 0.375  },
      { name: 'EFCO 5700',             sightline: 2,    hSightline: 2,    bite: 0.4375, hBite: 0.4375 },
      { name: 'Oldcastle VersaFrame',  sightline: 2,    hSightline: 2,    bite: 0.4375, hBite: 0.4375 },
      { name: 'Tubelite T14000',       sightline: 2,    hSightline: 2,    bite: 0.375,  hBite: 0.375  },
      { name: 'Trulite SF400',         sightline: 2,    hSightline: 2,    bite: 0.375,  hBite: 0.375  },
    ],
  },

  sys_cw_cap: {
    default: { sightline: 2.5, hSightline: 2.5, bite: 0.5, hBite: 0.5 },
    presets: [
      { name: 'Kawneer 1600 CW 2.5"',  sightline: 2.5,  hSightline: 2.5,  bite: 0.5,    hBite: 0.5    },
      { name: 'Kawneer 1600 CW 2"',    sightline: 2,    hSightline: 2,    bite: 0.5,    hBite: 0.5    },
      { name: 'YKK YCW 750',           sightline: 2.5,  hSightline: 2.5,  bite: 0.5,    hBite: 0.5    },
      { name: 'YKK YCW 500',           sightline: 2,    hSightline: 2,    bite: 0.4375, hBite: 0.4375 },
      { name: 'EFCO 7600',             sightline: 2.5,  hSightline: 2.5,  bite: 0.5,    hBite: 0.5    },
      { name: 'Trulite CW400',         sightline: 2.5,  hSightline: 2.5,  bite: 0.5,    hBite: 0.5    },
    ],
  },

  sys_cw_ssg: {
    default: { sightline: 2.5, hSightline: 2.5, bite: 1.125, hBite: 1.125 },
    presets: [
      { name: 'Kawneer 1600 SSG',       sightline: 2.5,  hSightline: 2.5,  bite: 1.125,  hBite: 1.125  },
      { name: 'YKK YCW 750 SSG',        sightline: 2.5,  hSightline: 2.5,  bite: 1.125,  hBite: 1.125  },
      { name: 'EFCO 7600 SSG',          sightline: 2.5,  hSightline: 2.5,  bite: 1.125,  hBite: 1.125  },
      { name: 'Wausau INvent SSG',      sightline: 2,    hSightline: 2,    bite: 1.0,    hBite: 1.0    },
    ],
  },

  sys_int_sf: {
    default: { sightline: 1.5, hSightline: 1.5, bite: 0.25, hBite: 0.25 },
    presets: [
      { name: 'Kawneer 350 Interior',   sightline: 1.75, hSightline: 1.75, bite: 0.25,   hBite: 0.25   },
      { name: 'YKK YES 35 Interior',    sightline: 1.5,  hSightline: 1.5,  bite: 0.25,   hBite: 0.25   },
      { name: 'Tubelite T14000 Int',    sightline: 1.5,  hSightline: 1.5,  bite: 0.25,   hBite: 0.25   },
      { name: 'EFCO 5200 Interior',     sightline: 1.75, hSightline: 1.75, bite: 0.25,   hBite: 0.25   },
    ],
  },
};
