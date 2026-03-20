/**
 * systemEngine.ts — Fabrication-Level BOM Engine.
 *
 * Takes a frame's real-world dimensions, its GridSpec (rows/cols/mullion layout),
 * a FrameProfile (sightline/glassBite/depth), and door specs, then outputs a
 * FabricationBOM: exact cut lengths, glass sizes, and hardware/labor summary.
 *
 * Ported math from legacy GlazeBid_AIQ:
 *  - bidsheet_calculations_v2.py  — bays/DLOs/joints/labor rate formulas
 *  - door_classifier.py           — door stile deductions
 *  - glazing_system_library.py    — ProfileDimensions (face_width, glass_pocket)
 *
 * Key formulas (all from legacy):
 *   Joints          = (bays + dlos) × 2
 *   Horizontal cut  = bayWidth − profile.faceWidth  (one face-width deduction per side)
 *   Glass size      = DLO + 2 × glassBite           (glass extends into pockets beyond DLO)
 *   Shop MHs        = totalGlassSF × 0.110
 *   Field labor MHs = totalGlassSF × 0.264
 *
 * Pure TypeScript — no React, no side-effects, no imports from React components.
 */

import { computeGridAssembly, type GridSpec, type GlassType } from './gridMath';
import { computeDoorAssembly, bayHasDoor } from './doorMath';

// Re-export GlassType so consumers only need to import from systemEngine.
export type { GlassType };

/**
 * Minimal profile geometry consumed by computeFabricationBOM.
 * Deliberately NOT importing FrameProfile from useProjectStore so this engine
 * stays independent of the store layer — both FrameProfile and VendorSystem
 * archetypes satisfy this interface.
 */
export type ProfileParams = {
  /** Human-readable label shown in the BOM header. */
  label:      string;
  /** Visible face width / sightline (inches). Used as horizontal cut deduction. */
  faceWidth:  number;
  /** How far the glass edge extends into the glazing pocket (inches). */
  glassBite:  number;
};

/**
 * Optional rake geometry for sloped-head frames.
 *
 * When provided, leftHeightIn and rightHeightIn replace the scalar heightInch
 * parameter for all slope-sensitive calculations.  A rectangular frame is the
 * degenerate case where leftHeightIn === rightHeightIn (slope = 0, deltaH = 0).
 */
export type RakeParams = {
  /** Height at the left jamb in decimal inches. */
  leftHeightIn:  number;
  /** Height at the right jamb in decimal inches. */
  rightHeightIn: number;
};

// ── Types ─────────────────────────────────────────────────────────────────────

/** Role of an extrusion member in the frame assembly. */
export type CutPieceRole = 'head' | 'sill' | 'jamb' | 'mullion' | 'transom';

/**
 * One line-item in the cut list — a group of identical extrusion pieces.
 */
export type CutListItem = {
  /** Human-readable mark/tag, e.g. "HEAD", "SILL-B2", "TRAN-R1". */
  mark:          string;
  role:          CutPieceRole;
  /** Number of identical pieces at this cut length. */
  qty:           number;
  /** Exact cut length in decimal inches. */
  cutLengthInch: number;
  /** Formatted architectural string, e.g. "3'-4 1/2\"". */
  cutLengthFt:   string;
  /** Optional note, e.g. "OMITTED — door bay". */
  note?:         string;
  /**
   * When true, this member requires a miter (compound angle) cut at the top.
   * Set on the raked head and on all jambs / mullions in a raked frame.
   */
  mitered?:      boolean;
};

/** One glass pane — a unique size in the BOM. */
export type GlassPane = {
  /** Human-readable mark, e.g. "G-R1-C2". Row and column are 1-based. */
  mark:       string;
  /** 0-based row index in the grid. */
  row:        number;
  /** 0-based column index in the grid. */
  col:        number;
  /** Glass knife width in inches (DLO + 2 × glassBite). */
  widthInch:  number;
  /** Glass knife height in inches (DLO + 2 × glassBite). */
  heightInch: number;
  /** Square footage of this lite. */
  areaSF:     number;
  qty:        number;
  glassType:  GlassType;
  /**
   * 'rectangular' for square-cut lites (standard).
   * 'trapezoid'  for top-row panes in raked frames — the glazier must cut a
   * trapezoidal lite; heightInchLeft / heightInchRight provide the two heights.
   */
  shape?:          'rectangular' | 'trapezoid';
  /** Trapezoid only: glass knife height at the LEFT edge of the lite. */
  heightInchLeft?:  number;
  /** Trapezoid only: glass knife height at the RIGHT edge of the lite. */
  heightInchRight?: number;
};

/** Aggregate hardware and labor summary for the frame. */
export type HardwareSummary = {
  /** Number of bay columns — the horizontal divisions of the frame. */
  bays:          number;
  /** Total daylight openings (rows × cols). */
  dlos:          number;
  /**
   * Joints count from legacy bidsheet formula:
   *   joints = (bays + dlos) × 2
   */
  joints:        number;
  /** Frame perimeter in linear feet. */
  perimeterLF:   number;
  /** Sum of all active cut piece lengths in linear feet. */
  totalPieceLF:  number;
  /** Number of bottom sill members omitted because of door bays. */
  sillsOmitted:  number;
  /** Count of single-leaf door openings. */
  singles:       number;
  /** Count of door pairs. */
  pairs:         number;
  /** Field installation hours for door rough-ins (legacy: 8.5 hrs/door). */
  fieldLaborHrs: number;
  /**
   * Shop man-hours (production-based).
   * Legacy bidsheet rate: 0.110 shop_mhs per glazing SF.
   */
  shopLaborMhs:  number;
  /**
   * Field man-hours (production-based).
   * Legacy bidsheet rate: 0.264 field_mhs per glazing SF.
   */
  fieldLaborMhs: number;
};

/** Complete fabrication BOM output from systemEngine. */
export type FabricationBOM = {
  frameWidthInch:    number;
  frameHeightInch:   number;
  /** Label from the assigned FrameProfile, e.g. "SF 4.5\" (Standard)". */
  profileLabel:      string;
  cutList:           CutListItem[];
  glassList:         GlassPane[];
  hardware:          HardwareSummary;
  /** Total linear footage of all cut extrusion pieces. */
  totalFramePieceLF: number;
  /** Total glass area in square feet. */
  totalGlassSF:      number;
  /** True when leftH ≠ rightH — enables rake-specific BOM features. */
  isRaked:            boolean;
  /** Present when isRaked: the left jamb height in decimal inches. */
  rakeLeftHeightIn?:  number;
  /** Present when isRaked: the right jamb height in decimal inches. */
  rakeRightHeightIn?: number;
};

// ── Production rates (from legacy bidsheet_calculations_v2.py) ────────────────
const SHOP_MHS_PER_SF  = 0.110;
const FIELD_MHS_PER_SF = 0.264;

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Compute the full fabrication BOM for a single frame.
 *
 * @param widthInch   Frame outside-dimension width in decimal inches.
 * @param heightInch  Frame outside-dimension height in decimal inches.
 * @param profile     FrameProfile with glassBite, faceWidth, sightline, depth.
 * @param grid        GridSpec with rows, cols, mullion positions, doors, bayTypes.
 * @param bayTypes    Optional per-bay glass type override (merged with grid.bayTypes).
 *                    Key format: `"${col},${row}"` (0-based).
 */
export function computeFabricationBOM(
  widthInch:  number,
  heightInch: number,
  profile:    ProfileParams,
  grid:       GridSpec,
  bayTypes?:  Record<string, GlassType>,
  rake?:      RakeParams,
): FabricationBOM {
  // ── Rake geometry ──────────────────────────────────────────────────────────
  // All frames are treated uniformly as rakes where slope = 0 is the rectangular
  // case.  This eliminates separate code paths — the orthogonal formulas are
  // just the degenerate case of leftHeightIn === rightHeightIn (deltaH = 0).
  const leftH   = rake?.leftHeightIn  ?? heightInch;
  const rightH  = rake?.rightHeightIn ?? heightInch;
  const isRaked = Math.abs(rightH - leftH) > 0.001;
  const slope   = isRaked ? (rightH - leftH) / widthInch : 0; // rise / run (in/in)
  const deltaH  = rightH - leftH;

  // True extrusion length of the raked head member (Pythagorean theorem).
  // For orthogonal frames: sqrt(W² + 0²) = W  →  headHypotenuse === widthInch.
  const headHypotenuse = Math.sqrt(widthInch * widthInch + deltaH * deltaH);

  // computeGridAssembly is called with leftH as the reference height so that
  // every dlo.heightInch it returns equals the DLO height at x = 0 (the LEFT
  // EDGE of the frame).  For the raked top-row DLO height at any position x:
  //   dloH(x) = dlo.heightInch + slope × x
  // This holds because transoms are horizontal (fixed absolute height from sill)
  // so only the head boundary varies across the width.  See section 6.
  const asm        = computeGridAssembly(widthInch, leftH, grid);
  const doors      = grid.doors ?? [];
  const faceW      = profile.faceWidth;
  const mergedTypes: Record<string, GlassType> = { ...(grid.bayTypes ?? {}), ...(bayTypes ?? {}) };

  const cutList:   CutListItem[] = [];
  const glassList: GlassPane[]   = [];

  // ── Inline helper: absolute x of a bay column boundary ─────────────────────
  // Mullion centre-lines sit at vertRelPositions[i] × widthInch.
  // Bay 0 left = 0 (left jamb);  final bay right = widthInch (right jamb).
  function bayEdgeX(col: number, side: 'left' | 'right'): number {
    if (side === 'left')      return col === 0             ? 0         : grid.vertRelPositions[col - 1] * widthInch;
    return   col === grid.cols - 1 ? widthInch : grid.vertRelPositions[col]     * widthInch;
  }

  // ── 1. Head (top perimeter horizontal) ─────────────────────────────────────
  // Raked head: true extrusion length = hypotenuse of (run = width, rise = deltaH).
  // Standard head: hypotenuse = widthInch when slope = 0.
  // Flagged mitered:true when raked — the head receives a compound angle cut at each end.
  const headCutLength = isRaked ? round4(headHypotenuse) : widthInch;
  cutList.push({
    mark:          'HEAD',
    role:          'head',
    qty:           1,
    cutLengthInch: headCutLength,
    cutLengthFt:   fmtArch(headCutLength),
    mitered:       isRaked || undefined,
  });

  // ── 2. Jambs (perimeter verticals, left + right) ────────────────────────────
  // Raked: left jamb = leftH, right jamb = rightH — two separate BOM lines.
  //   Both are flagged mitered because their tops meet the sloped head.
  // Standard: both jambs equal heightInch — one BOM line, qty 2.
  if (isRaked) {
    cutList.push({
      mark:          'JAMB-L',
      role:          'jamb',
      qty:           1,
      cutLengthInch: leftH,
      cutLengthFt:   fmtArch(leftH),
      mitered:       true,
    });
    cutList.push({
      mark:          'JAMB-R',
      role:          'jamb',
      qty:           1,
      cutLengthInch: rightH,
      cutLengthFt:   fmtArch(rightH),
      mitered:       true,
    });
  } else {
    cutList.push({
      mark:          'JAMB',
      role:          'jamb',
      qty:           2,
      cutLengthInch: heightInch,
      cutLengthFt:   fmtArch(heightInch),
    });
  }

  // ── 3. Interior vertical mullions ──────────────────────────────────────────
  // Standard: all (cols − 1) mullions share the same height → one BOM line.
  // Raked: each mullion at x = vertRelPositions[i] × width has a unique height:
  //   mullionHeight(i) = leftH + slope × (vertRelPositions[i] × widthInch)
  //   Mullions with identical rounded heights share one BOM line.
  //   All raked mullions are flagged mitered (sloped top cut).
  const mullionCount = grid.cols - 1;
  if (mullionCount > 0) {
    if (!isRaked) {
      cutList.push({
        mark:          'MUL-V',
        role:          'mullion',
        qty:           mullionCount,
        cutLengthInch: heightInch,
        cutLengthFt:   fmtArch(heightInch),
      });
    } else {
      // Map each mullion index to its precise height, group identical lengths.
      const byHeight = new Map<number, number>(); // cut length (4dp) → count
      for (let i = 0; i < mullionCount; i++) {
        const mullX = grid.vertRelPositions[i] * widthInch;
        const mullH = round4(leftH + slope * mullX);
        byHeight.set(mullH, (byHeight.get(mullH) ?? 0) + 1);
      }
      let grpIdx = 1;
      byHeight.forEach((qty, mullH) => {
        cutList.push({
          mark:          `MUL-V${grpIdx++}`,
          role:          'mullion',
          qty,
          cutLengthInch: mullH,
          cutLengthFt:   fmtArch(mullH),
          mitered:       true,
        });
      });
    }
  }

  // ── 4. Bottom sills (per bay column) ───────────────────────────────────────
  // Sills are always horizontal — rake does NOT affect their cut lengths.
  // Cut length = bayWidth − faceWidth (standard screw-spline deduction).
  // Sill is OMITTED entirely for bay columns containing a door.
  let sillsOmitted = 0;
  for (let c = 0; c < grid.cols; c++) {
    const bw      = asm.bayWidthsInch[c];
    const hasDoor = bayHasDoor(doors, c);
    if (hasDoor) {
      sillsOmitted++;
      cutList.push({
        mark:          `SILL-B${c + 1}`,
        role:          'sill',
        qty:           1,
        cutLengthInch: 0,
        cutLengthFt:   '—',
        note:          'OMITTED — door bay (sill extrusion not ordered)',
      });
    } else {
      const cut = Math.max(0, bw - faceW);
      cutList.push({
        mark:          `SILL-B${c + 1}`,
        role:          'sill',
        qty:           1,
        cutLengthInch: cut,
        cutLengthFt:   fmtArch(cut),
      });
    }
  }

  // ── 5. Transoms (interior horizontal members) ───────────────────────────────
  // Transoms are always horizontal — rake does NOT affect their cut lengths.
  // Cut length = bayWidth − faceWidth (same deduction as sill).
  // Like-lengths grouped for BOM efficiency.
  for (let r = 0; r < grid.rows - 1; r++) {
    const byLength = new Map<number, number>();
    for (let c = 0; c < grid.cols; c++) {
      const cut = Math.max(0, asm.bayWidthsInch[c] - faceW);
      byLength.set(cut, (byLength.get(cut) ?? 0) + 1);
    }
    byLength.forEach((qty, cut) => {
      cutList.push({
        mark:          `TRAN-R${r + 1}`,
        role:          'transom',
        qty,
        cutLengthInch: cut,
        cutLengthFt:   fmtArch(cut),
      });
    });
  }

  // ── 6. Glass list ───────────────────────────────────────────────────────────
  // For raked frames only row 0 (the topmost row, bounded above by the sloped
  // head) produces trapezoidal panes.  All other rows are bounded on both sides
  // by horizontal transoms and remain rectangular.
  //
  // Derivation of dloH(x) for top-row panes:
  //   computeGridAssembly was called with heightInch = leftH, so for a
  //   horizontal transom at fixed absolute height h_t from sill, the physical
  //   top-row height at position x is:
  //     rowH(x)  = h(x) − h_t  =  (leftH + slope·x) − h_t
  //   Deducting one mullionWidthInch for the head/transom members:
  //     dloH(x)  = rowH(x) − mw  =  (leftH − h_t − mw) + slope·x
  //              = dlo.heightInch + slope·x        [since dloH(0) = leftH − h_t − mw]
  //
  //   glassBite is applied to all four sides of the glass blank:
  //     gw      = dlo.widthInch + 2 × glassBite   (same for rect and trap)
  //     ghLeft  = dloH(bLeftX)  + 2 × glassBite
  //     ghRight = dloH(bRightX) + 2 × glassBite
  //   Trapezoid area = ((ghLeft + ghRight) / 2) × gw / 144
  //   GlassPane.heightInch = max(ghLeft, ghRight) for glass-blank ordering.
  let totalGlassSF = 0;
  for (const dlo of asm.daylightOpenings) {
    if (bayHasDoor(doors, dlo.col)) continue;
    const key: string       = `${dlo.col},${dlo.row}`;
    const glassType: GlassType = mergedTypes[key] ?? 'vision';
    const gw = round4(dlo.widthInch + 2 * profile.glassBite);

    if (isRaked && dlo.row === 0) {
      // ── Trapezoidal top-row pane ─────────────────────────────────────────
      const bLeftX  = bayEdgeX(dlo.col, 'left');
      const bRightX = bayEdgeX(dlo.col, 'right');
      const gh_left  = round4(dlo.heightInch + slope * bLeftX  + 2 * profile.glassBite);
      const gh_right = round4(dlo.heightInch + slope * bRightX + 2 * profile.glassBite);
      const gh_max   = Math.max(gh_left, gh_right); // max height for ordering the glass blank
      const sf = round2(((gh_left + gh_right) / 2) * gw / 144);
      totalGlassSF += sf;

      glassList.push({
        mark:            `G-R${dlo.row + 1}-C${dlo.col + 1}`,
        row:             dlo.row,
        col:             dlo.col,
        widthInch:       gw,
        heightInch:      round4(gh_max),
        areaSF:          sf,
        qty:             1,
        glassType,
        shape:           'trapezoid',
        heightInchLeft:  gh_left,
        heightInchRight: gh_right,
      });
    } else {
      // ── Standard rectangular pane ─────────────────────────────────────────
      const gh = round4(dlo.heightInch + 2 * profile.glassBite);
      const sf = round2((gw * gh) / 144);
      totalGlassSF += sf;
      glassList.push({
        mark:       `G-R${dlo.row + 1}-C${dlo.col + 1}`,
        row:        dlo.row,
        col:        dlo.col,
        widthInch:  gw,
        heightInch: gh,
        areaSF:     sf,
        qty:        1,
        glassType,
        shape:      'rectangular',
      });
    }
  }

  // ── 7. Hardware & labor summary ─────────────────────────────────────────────
  const bays   = grid.cols;
  const dlos   = grid.rows * grid.cols;
  // Legacy formula from bidsheet_calculations_v2.py calculate_geometry():
  const joints = (bays + dlos) * 2;

  // Raked frame perimeter = leftH + rightH + sill(widthInch) + head(hypotenuse).
  // Standard frame reduces to 2H + 2W when leftH = rightH = H. ✓
  const perimeterLF = round2((leftH + rightH + widthInch + headCutLength) / 12);

  const totalPieceSumInch = cutList
    .filter(p => p.cutLengthInch > 0)
    .reduce((acc, p) => acc + p.cutLengthInch * p.qty, 0);
  const totalFramePieceLF = round2(totalPieceSumInch / 12);

  // Average height used as fallback door-clearance reference for sloped bays.
  const avgH    = (leftH + rightH) / 2;
  const doorAsm = computeDoorAssembly(doors, asm.bayWidthsInch, avgH, grid.mullionWidthInch);

  // Production-based labor (legacy bidsheet_calculations_v2.py calculate_production()):
  const glassSF       = round2(totalGlassSF);
  const shopLaborMhs  = round2(glassSF * SHOP_MHS_PER_SF);
  const fieldLaborMhs = round2(glassSF * FIELD_MHS_PER_SF);

  const hardware: HardwareSummary = {
    bays,
    dlos,
    joints,
    perimeterLF,
    totalPieceLF:  totalFramePieceLF,
    sillsOmitted,
    singles:       doorAsm.singlesCount,
    pairs:         doorAsm.pairsCount,
    fieldLaborHrs: doorAsm.fieldLaborHrs,
    shopLaborMhs,
    fieldLaborMhs,
  };

  return {
    frameWidthInch:    widthInch,
    frameHeightInch:   heightInch,
    profileLabel:      profile.label,
    cutList,
    glassList,
    hardware,
    totalFramePieceLF,
    totalGlassSF:      glassSF,
    isRaked,
    ...(isRaked ? { rakeLeftHeightIn: leftH, rakeRightHeightIn: rightH } : {}),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Round to 2 decimal places. */
function round2(n: number): number { return Math.round(n * 100) / 100; }
/** Round to 4 decimal places. */
function round4(n: number): number { return Math.round(n * 10000) / 10000; }

/**
 * Format a decimal inch value as an architectural feet-and-inches string.
 * Examples:  40.5 → "3'-4 1/2\""  |  36.0 → "3'"  |  10.25 → "10 1/4\""
 */
export function fmtArch(inches: number): string {
  if (inches <= 0) return '0"';
  const ft  = Math.floor(inches / 12);
  const rem = inches % 12;
  const whole = Math.floor(rem);
  const frac  = rem - whole;

  const FRACS: [number, string][] = [
    [0.0625, '1/16'], [0.125, '1/8'],  [0.1875, '3/16'], [0.25, '1/4'],
    [0.3125, '5/16'], [0.375, '3/8'],  [0.4375, '7/16'], [0.5, '1/2'],
    [0.5625, '9/16'], [0.625, '5/8'],  [0.6875, '11/16'],[0.75, '3/4'],
    [0.8125, '13/16'],[0.875, '7/8'],  [0.9375, '15/16'],
  ];

  let fracStr = '';
  if (frac > 0.015) {
    let best = Infinity;
    for (const [val, str] of FRACS) {
      const d = Math.abs(frac - val);
      if (d < best) { best = d; fracStr = str; }
    }
  }

  const inchPart =
    fracStr
      ? (whole > 0 ? `${whole} ${fracStr}"` : `${fracStr}"`)
      : (whole > 0 ? `${whole}"` : '');

  if (ft === 0) return inchPart || '0"';
  return inchPart ? `${ft}'-${inchPart}` : `${ft}'`;
}
