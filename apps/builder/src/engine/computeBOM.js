/**
 * computeBOM.js
 *
 * Builder-side re-export bridge for computeFabricationBOM.
 *
 * Because Builder (JSX/Vite port 5173) cannot directly import from
 * Studio (TypeScript/Vite port 5174) via relative path, this file
 * re-implements the same BOM computation logic using the same
 * inputs and outputs as systemEngine.ts computeFabricationBOM().
 *
 * Inputs:
 *   inputs: { width, height, bays, rows, glassBite, sightline }
 *   systemType: string (e.g. 'ext-sf-1', 'cap-cw')
 *
 * Output:
 *   { glassList, cutList, hardware }
 *   - glassList: [{ row, col, knifeW, knifeH, shape }]
 *   - cutList:   [{ mark, partName, lengthInches, qty }]
 *   - hardware:  { shopLaborMhs, fieldLaborMhs }
 */

// ─── Glass Deduct Table (inches) by system type ───────────────────────────────
const DEDUCTS = {
  'ext-sf-1':  { w: 0.75,  h: 0.75  },
  'ext-sf-2':  { w: 0.875, h: 0.875 },
  'int-sf':    { w: 0.75,  h: 0.75  },
  'cap-cw':    { w: 1.0,   h: 1.0   },
  'ssg-cw':    { w: 0.5,   h: 0.5   },
  'door-only': { w: 0.75,  h: 0.75  },
  default:     { w: 0.75,  h: 0.75  },
};

// ─── Profile mark table by system type ───────────────────────────────────────
const PROFILES = {
  'ext-sf-1':  { head: 'HD-1', sill: 'SL-1', jamb: 'JB-1', mull: 'MV-1', tran: 'MH-1' },
  'ext-sf-2':  { head: 'HD-2', sill: 'SL-2', jamb: 'JB-2', mull: 'MV-2', tran: 'MH-2' },
  'int-sf':    { head: 'HD-I', sill: 'SL-I', jamb: 'JB-I', mull: 'MV-I', tran: 'MH-I' },
  'cap-cw':    { head: 'CW-H', sill: 'CW-S', jamb: 'CW-J', mull: 'CW-M', tran: 'CW-T' },
  'ssg-cw':    { head: 'SS-H', sill: 'SS-S', jamb: 'SS-J', mull: 'SS-M', tran: 'SS-T' },
  'door-only': { head: 'DR-H', sill: 'DR-S', jamb: 'DR-J', mull: 'DR-M', tran: 'DR-T' },
  default:     { head: 'HD-1', sill: 'SL-1', jamb: 'JB-1', mull: 'MV-1', tran: 'MH-1' },
};

// ─── Labor rates (MH per lite) by system type ─────────────────────────────────
const LABOR = {
  'ext-sf-1':  { shop: 0.15, field: 0.25 },
  'ext-sf-2':  { shop: 0.18, field: 0.30 },
  'int-sf':    { shop: 0.12, field: 0.20 },
  'cap-cw':    { shop: 0.25, field: 0.40 },
  'ssg-cw':    { shop: 0.20, field: 0.35 },
  'door-only': { shop: 0.30, field: 0.50 },
  default:     { shop: 0.15, field: 0.25 },
};

/**
 * computeFabricationBOM(inputs, systemType)
 * Builder-side equivalent of Studio's systemEngine.computeFabricationBOM()
 */
export function computeFabricationBOM(inputs, systemType) {
  const {
    width    = 60,
    height   = 84,
    bays     = 1,
    rows     = 1,
    glassBite = 0.375,
    sightline = 2.0,
  } = inputs || {};

  const type    = systemType || 'ext-sf-1';
  const deducts = DEDUCTS[type]  || DEDUCTS.default;
  const marks   = PROFILES[type] || PROFILES.default;
  const labor   = LABOR[type]    || LABOR.default;

  // ── Glass list ──────────────────────────────────────────────────────────────
  const bayW = width  / bays;
  const rowH = height / rows;

  // knife size = opening size minus deducts on both sides
  const knifeW = bayW - (deducts.w * 2) - (sightline * 2 * glassBite);
  const knifeH = rowH - (deducts.h * 2) - (sightline * 2 * glassBite);

  const glassList = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < bays; c++) {
      glassList.push({
        row:    r,
        col:    c,
        knifeW: Math.max(knifeW, 1),
        knifeH: Math.max(knifeH, 1),
        shape:  'RECT',
      });
    }
  }

  // ── Cut list ────────────────────────────────────────────────────────────────
  const cutList = [];

  // Head — 1 piece full width
  cutList.push({
    mark:          marks.head,
    partName:      'Head Receptor',
    lengthInches:  width,
    qty:           1,
  });

  // Sill — 1 piece full width
  cutList.push({
    mark:          marks.sill,
    partName:      'Sill Receptor',
    lengthInches:  width,
    qty:           1,
  });

  // Jambs — 2 pieces full height
  cutList.push({
    mark:          marks.jamb,
    partName:      'Jamb',
    lengthInches:  height,
    qty:           2,
  });

  // Vertical mullions — (bays - 1) pieces full height
  if (bays > 1) {
    cutList.push({
      mark:          marks.mull,
      partName:      'Vertical Mullion',
      lengthInches:  height,
      qty:           bays - 1,
    });
  }

  // Horizontal transoms — (rows - 1) pieces full width
  if (rows > 1) {
    cutList.push({
      mark:          marks.tran,
      partName:      'Horizontal Transom',
      lengthInches:  width,
      qty:           rows - 1,
    });
  }

  // ── Hardware / Labor ────────────────────────────────────────────────────────
  const liteCount = glassList.length;
  const hardware = {
    shopLaborMhs:  parseFloat((liteCount * labor.shop).toFixed(2)),
    fieldLaborMhs: parseFloat((liteCount * labor.field).toFixed(2)),
  };

  return { glassList, cutList, hardware };
}
