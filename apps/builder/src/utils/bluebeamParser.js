/**
 * Bluebeam Parser – shared annotation-to-BidStore conversion utilities.
 *
 * Consumed by:
 *   • BlueprintViewer  – live scan of the currently-displayed PDF page
 *   • ProjectIntake    – Smart Scan upload on the home screen
 *
 * Keeping both paths in sync is trivial because all rules and BOM math live here.
 */
import { SYSTEM_PACKAGES, DEFAULT_SYSTEM_ID } from '../data/systemPackages';

// ─── Overlay colours (used in BlueprintViewer's SVG annotation layer) ─────────
export const ANNOT_SYS_COLORS = {
  sys_storefront: { stroke: '#60a5fa', fill: 'rgba(96,165,250,0.08)'  },
  sys_cw_cap:     { stroke: '#a78bfa', fill: 'rgba(167,139,250,0.08)' },
  sys_cw_ssg:     { stroke: '#34d399', fill: 'rgba(52,211,153,0.08)'  },
  sys_int_sf:     { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.08)'  },
};

// ─── Keyword → system-id rules (highest priority first) ───────────────────────
export const ANNOT_SYS_RULES = [
  [/INT[^A-Z]*SF|INT[^A-Z]*STORE|INT[^A-Z]*FRT|INTERIOR/, 'sys_int_sf'],
  [/SSG/,                                                  'sys_cw_ssg'],
  [/CW|CURTAIN|CAP.*WALL|C\.W/,                           'sys_cw_cap'],
  [/SF|STORE|FRONT/,                                       'sys_storefront'],
];

/**
 * Match a label/title string to a system id using ANNOT_SYS_RULES.
 * Returns null if no rule matched (caller should fall back to DEFAULT_SYSTEM_ID).
 */
export function matchSysId(needle) {
  if (!needle) return null;
  const n = needle.toUpperCase();
  for (const [re, id] of ANNOT_SYS_RULES) {
    if (re.test(n)) return id;
  }
  return null;
}

/**
 * Build a minimal but structurally-valid BOM for a single annotation frame.
 * Assumes 1 bay × 1 row — estimator can re-open the Drawer to refine.
 *
 * @param {number} widthIn   – overall frame width in inches
 * @param {number} heightIn  – overall frame height in inches
 * @param {object} pkg       – system package from systemPackages.js
 */
export function buildBluebeamBom(widthIn, heightIn, pkg) {
  const sysSL   = pkg.geometry.verticalSightline;
  const sysBite = pkg.geometry.glassBite;
  const headSL  = 2;
  const sillSL  = 2;

  const totalAluminumLF = +((2 * heightIn + 2 * widthIn) / 12).toFixed(2);
  const dloW = Math.max(0, widthIn  - 2 * sysSL);
  const dloH = Math.max(0, heightIn - headSL - sillSL);
  const cutW = +(dloW + sysBite * 2).toFixed(4);
  const cutH = +(dloH + sysBite * 2).toFixed(4);
  const sqFtPerLite    = (cutW * cutH) / 144;
  const totalGlassSqFt = +sqFtPerLite.toFixed(2);
  const shopHours      = +(totalAluminumLF / pkg.labor.fabLFPerHour).toFixed(2);
  const fieldHours     = +(totalGlassSqFt  / pkg.labor.installSqFtPerHour).toFixed(2);

  return {
    quantity:         1,
    totalAluminumLF,
    totalGlassSqFt,
    glassLitesCount:  1,
    shopHours,
    fieldHours,
    totalLaborHours:  +(shopHours + fieldHours).toFixed(2),
    cutList: [
      { part: 'Vertical',   qty: 2, lengthInches: heightIn, note: 'Bluebeam import — verify field' },
      { part: 'Horizontal', qty: 2, lengthInches: cutW,     note: 'DLO + 2× bite — 1 bay default' },
    ],
    glassSizes: {
      glassType:    'See Spec',
      widthInches:  cutW,
      heightInches: cutH,
      qty:          1,
    },
    _detail: {
      dloWidth:        +dloW.toFixed(4),
      dloHeight:       +dloH.toFixed(4),
      sqFtPerLite:     +sqFtPerLite.toFixed(4),
      systemName:      pkg.name,
      mullionSightline: sysSL,
      glassBite:       sysBite,
      source:          'bluebeam',
    },
  };
}

/**
 * Convert an array of GlazeBid markup annotations (output of
 * pdfAnnotationParser.extractAnnotations) into BidStore-ready frame payloads.
 *
 * Called by ProjectIntake after a Smart Scan so that frames are queued in
 * sessionStorage and auto-imported when the BidSheet opens.
 *
 * @param {Array}  annotations – output of extractAnnotations()
 * @returns {Array} frame payloads for useBidStore.importBluebeamFrames
 */
export function buildBluebeamFramesFromAnnotations(annotations) {
  const frames = [];

  for (const ann of annotations) {
    // Only AREA (Square / Polygon) shapes translate to frame dimensions
    if (ann.type !== 'AREA' || !ann.points || ann.points.length < 4) continue;

    // pdfAnnotationParser runs at scale 1.0 → 1 unit = 1 PDF point = 1/72 inch
    // points[0] = top-left, [1] = top-right, [2] = bottom-right, [3] = bottom-left
    const widthIn  = (ann.points[1].x - ann.points[0].x) / 72;
    const heightIn = (ann.points[2].y - ann.points[1].y) / 72;

    // Skip noise (annotations too small to be a real frame opening)
    if (widthIn < 6 || heightIn < 6) continue;

    const sysId = matchSysId(ann.label) ?? DEFAULT_SYSTEM_ID;
    const pkg   = SYSTEM_PACKAGES[sysId];
    if (!pkg) continue;

    const wR      = +widthIn.toFixed(2);
    const hR      = +heightIn.toFixed(2);
    const frameId = `bb_si_${ann.id}`;
    const tag     = `BB-${pkg.name.replace(/\s+/g, '-').substring(0, 10)}`;

    frames.push({
      frameId,
      elevationTag: tag,
      systemType:   pkg.name,
      source:       'bluebeam',
      quantity:     1,
      inputs: {
        width:            wR,
        height:           hR,
        bays:             1,
        rows:             1,
        glassBite:        pkg.geometry.glassBite,
        mullionSightline: pkg.geometry.verticalSightline,
        headSightline:    2,
        sillSightline:    2,
        systemName:       pkg.name,
      },
      bom: buildBluebeamBom(wR, hR, pkg),
    });
  }

  return frames;
}
