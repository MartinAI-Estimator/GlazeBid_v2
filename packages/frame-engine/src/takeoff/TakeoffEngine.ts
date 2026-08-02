/**
 * TakeoffEngine.ts — Phase 1: Core Geometry & Takeoff Math Engine
 *
 * Pure TypeScript, zero UI dependencies, zero imports (runnable under
 * node --experimental-strip-types for harness testing).
 *
 * Source of truth: PARAMETRIC_FRAME_BUILDER_SPEC.md
 * Ground truth:    PartnerPak Studio workbook Exercise 8 (TF451 Frame 1)
 *                  84.5 × 102 → jamb cut 101 7/8", bay DLO 39 1/4",
 *                  row DLOs 70" and 25 7/8" (sill face 2 1/8").
 *
 * Coordinate system: X from left outer frame edge, Y from frame base (finished
 * floor / bottom of sill). All dimensions in DECIMAL INCHES internally.
 *
 * Joinery model v1 — VERTICALS_RUN (screw-spline storefront):
 *   - All verticals (jambs + intermediates) run full frame height,
 *     cut = OAH − 2 × framingTolerance.
 *   - Head, sill, and intermediate horizontals butt between verticals,
 *     cut = clear span between adjacent vertical faces.
 * HORIZONTALS_RUN (head/sill run through — shear block) is stubbed for Phase 2.
 */

// ─── Spec Schemas (Section 4) ─────────────────────────────────────────────────

export interface MetalProfile {
  productCode: string;
  description: string;
  profileWidth: number;   // face width in inches (e.g. 2.0)
  profileDepth: number;   // system depth in inches (e.g. 4.5)
  glassBite: number;      // e.g. 0.5
  weightPerFoot?: number;
  stockLength: number;    // inches (e.g. 288)
}

export interface MetalGroup {
  id: string;
  name: string;
  systemType: 'STOREFRONT' | 'CURTAIN_WALL' | 'WINDOW_WALL';
  thermal: boolean;
  head: MetalProfile;
  sill: MetalProfile;
  jambLeft: MetalProfile;
  jambRight: MetalProfile;
  verticalIntermediate: MetalProfile;
  horizontalIntermediate: MetalProfile;
  doorJambCompanion?: MetalProfile;
  pressurePlate?: MetalProfile;
  faceCap?: MetalProfile;
}

export interface DoorConfig {
  id: string;
  name: string;
  type: 'SINGLE' | 'PAIR';
  handing: 'HLSO' | 'HRSO' | 'SO';
  doorWidth: number;
  doorHeight: number;
  stileType: 'NARROW_190' | 'MEDIUM_350' | 'WIDE_500';
  frameType: string;
  hardware: {
    lockCode?: string;
    closerCode?: string;
    hingeCode?: string;
    pushPullCode?: string;
    thresholdCode?: string;
  };
}

export interface FrameBay {
  bayIndex: number;
  width: number;          // centerline-to-centerline span (edge bays from outer frame edge)
  isDoorBay: boolean;
  doorId?: string;
}

export interface FrameRow {
  rowIndex: number;
  bohHeight: number;      // BOH of the horizontal ABOVE this row; top row = OAH − head face
}

export type GlassType = 'ANNEALED' | 'TEMPERED' | 'SPANDREL' | 'PANEL' | 'MIRROR';

export interface GlassLite {
  id: string;
  bayIndex: number;
  rowIndex: number;
  dloWidth: number;
  dloHeight: number;
  glassWidth: number;
  glassHeight: number;
  glassType: GlassType;
  areaSqFt: number;
}

export type MemberType =
  | 'HEAD' | 'SILL' | 'JAMB' | 'VERTICAL' | 'HORIZONTAL'
  | 'STOP' | 'PRESSURE_PLATE' | 'FACE_CAP';

export interface CutListItem {
  partNumber: string;
  description: string;
  memberType: MemberType;
  cutLength: number;       // decimal inches
  fractionDisplay: string; // e.g. `95 7/8"`
  quantity: number;
  finishCode: string;
}

export interface ElevationFrame {
  id: string;
  frameName: string;
  quantityThus: number;
  overallWidth: number;
  overallHeight: number;
  metalGroup: MetalGroup;
  bays: FrameBay[];
  rows: FrameRow[];
  glassSchedule: GlassLite[];
  metalCutList: CutListItem[];
}

// ─── Global Fabrication Constants (Section 2.2) ──────────────────────────────

export const SAW_KERF = 0.1875;                 // 3/16"
export const FRAMING_TOLERANCE_DEFAULT = 0.0625; // 1/16" per end
export const GLAZING_TOLERANCE_DEFAULT = 0;      // spec formula exact; override per job
export const STOCK_LENGTH_24FT = 288;
export const STOCK_LENGTH_21FT = 252;

// ─── Fraction / Display Utilities ─────────────────────────────────────────────

/**
 * Round a decimal to the nearest 1/denominator and return a reduced-fraction
 * display string, e.g. 101.875 → `101 7/8"`. Denominator 32 (default) or 64.
 */
export function formatFraction(inches: number, denominator: 32 | 64 = 32): string {
  if (!isFinite(inches)) return '—';
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  let whole = Math.floor(abs);
  let num = Math.round((abs - whole) * denominator);
  let den: number = denominator;
  if (num === den) { whole += 1; num = 0; }
  while (num > 0 && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
  if (num === 0) return `${sign}${whole}"`;
  if (whole === 0) return `${sign}${num}/${den}"`;
  return `${sign}${whole} ${num}/${den}"`;
}

/** 94.5 → `7'-10 1/2"`; values under 12" render inches-only. */
export function formatFeetInches(inches: number, denominator: 32 | 64 = 32): string {
  if (!isFinite(inches)) return '—';
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  const ft = Math.floor(abs / 12);
  const rem = abs - ft * 12;
  const remStr = formatFraction(rem, denominator);
  if (ft === 0) return `${sign}${remStr}`;
  return `${sign}${ft}'-${remStr}`;
}

/** Round to nearest 1/denominator as a decimal (for tolerance-safe compares). */
export function roundToFraction(inches: number, denominator: 32 | 64 = 32): number {
  return Math.round(inches * denominator) / denominator;
}

// ─── RO ⇄ OAFR (Section 2.1.1) ───────────────────────────────────────────────

export interface ShimSet {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function roughOpeningToFrame(
  roWidth: number,
  roHeight: number,
  shims: ShimSet
): { overallWidth: number; overallHeight: number } {
  return {
    overallWidth: roWidth - (shims.left + shims.right),
    overallHeight: roHeight - (shims.top + shims.bottom),
  };
}

// ─── Takeoff Input ────────────────────────────────────────────────────────────

export type JoineryModel = 'VERTICALS_RUN' | 'HORIZONTALS_RUN';

export interface BaySpec {
  /** centerline-to-centerline span; omit to distribute equally */
  width?: number;
  isDoorBay?: boolean;
  doorId?: string;
}

export interface RowSpec {
  /** BOH of the horizontal above this row; omit on top row / for equal split */
  bohHeight?: number;
  /** default glass for every lite in this row */
  glassType?: GlassType;
}

export interface TakeoffInput {
  id?: string;
  frameName: string;
  quantityThus?: number;

  /** Either OAFR directly… */
  overallWidth?: number;
  overallHeight?: number;
  /** …or RO + shims (mutually exclusive; RO wins if both provided) */
  roWidth?: number;
  roHeight?: number;
  shims?: ShimSet;

  metalGroup: MetalGroup;

  /** number → equal bays; array → explicit CL spans / door bays */
  bays: number | BaySpec[];
  /** number → equal rows; array → explicit BOH datums (bottom row first) */
  rows: number | RowSpec[];

  defaultGlassType?: GlassType;
  /** per-lite overrides keyed `${bayIndex}:${rowIndex}` */
  glassOverrides?: Record<string, GlassType>;

  joinery?: JoineryModel;
  framingTolerance?: number; // per end, default 1/16"
  glazingTolerance?: number; // per glass dim, default 0 (spec formula)
  finishCode?: string;
}

export interface TakeoffWarning {
  code: string;
  message: string;
}

export interface TakeoffResult extends ElevationFrame {
  warnings: TakeoffWarning[];
  /** X centerlines of intermediate verticals (excludes jamb edges) */
  mullionCenterlines: number[];
  /** BOH datum of each intermediate horizontal, per bay layout (uniform v1) */
  bohElevations: number[];
  totalGlassSqFt: number;
  totalAluminumLF: number;
}

// ─── Internal geometry helpers ───────────────────────────────────────────────

/**
 * Bay boundaries: X coordinates of jamb outer edges and mullion centerlines.
 * boundaries[0] = 0, boundaries[n] = overallWidth.
 */
export function computeBayBoundaries(
  overallWidth: number,
  bays: BaySpec[],
  warnings: TakeoffWarning[]
): number[] {
  const n = bays.length;
  const explicit = bays.every((b) => typeof b.width === 'number' && b.width! > 0);
  let widths: number[];

  if (explicit) {
    widths = bays.map((b) => b.width!);
    const sum = widths.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - overallWidth) > 0.03125) {
      warnings.push({
        code: 'BAY_SUM_MISMATCH',
        message: `Bay spans sum to ${formatFraction(sum)} but frame width is ${formatFraction(overallWidth)} — bays normalized proportionally.`,
      });
      const k = overallWidth / sum;
      widths = widths.map((w) => w * k);
    }
  } else {
    const each = overallWidth / n;
    widths = Array(n).fill(each);
  }

  const boundaries = [0];
  let x = 0;
  for (const w of widths) { x += w; boundaries.push(x); }
  boundaries[boundaries.length - 1] = overallWidth; // absorb fp drift
  return boundaries;
}

/**
 * Clear (DLO) width of bay i between member faces:
 * full jamb face at frame edges, half mullion face at interior boundaries.
 */
export function computeBayClearWidth(
  boundaries: number[],
  bayIndex: number,
  mg: MetalGroup
): number {
  const n = boundaries.length - 1;
  const span = boundaries[bayIndex + 1] - boundaries[bayIndex];
  const leftEnc = bayIndex === 0 ? mg.jambLeft.profileWidth : mg.verticalIntermediate.profileWidth / 2;
  const rightEnc = bayIndex === n - 1 ? mg.jambRight.profileWidth : mg.verticalIntermediate.profileWidth / 2;
  return span - leftEnc - rightEnc;
}

/**
 * Row bands from BOH datums.
 * rowSpecs is bottom row first. The horizontal ABOVE row i has BOH = rowSpecs[i].bohHeight
 * (top row has none — it is bounded by the head).
 * Returns per-row { yBottom, yTop } of the clear opening (DLO heights).
 */
export function computeRowBands(
  overallHeight: number,
  rowSpecs: RowSpec[],
  mg: MetalGroup,
  warnings: TakeoffWarning[]
): { yBottom: number; yTop: number; dloHeight: number }[] {
  const n = rowSpecs.length;
  const sillFace = mg.sill.profileWidth;
  const headFace = mg.head.profileWidth;
  const horizFace = mg.horizontalIntermediate.profileWidth;
  const headBottom = overallHeight - headFace;

  // Resolve BOH datums for the n−1 intermediate horizontals
  let bohs: number[] = [];
  const explicit = rowSpecs.slice(0, n - 1).every((r) => typeof r.bohHeight === 'number');
  if (n > 1 && explicit) {
    bohs = rowSpecs.slice(0, n - 1).map((r) => r.bohHeight!);
    const sorted = [...bohs].sort((a, b) => a - b);
    if (JSON.stringify(sorted) !== JSON.stringify(bohs)) {
      warnings.push({ code: 'BOH_ORDER', message: 'BOH datums were not ascending — sorted bottom-up.' });
      bohs = sorted;
    }
  } else if (n > 1) {
    // Equal DLO distribution
    const totalDLO = headBottom - sillFace - (n - 1) * horizFace;
    const each = totalDLO / n;
    let y = sillFace;
    for (let i = 0; i < n - 1; i++) {
      y += each;
      bohs.push(y);
      y += horizFace;
    }
  }

  const bands: { yBottom: number; yTop: number; dloHeight: number }[] = [];
  for (let i = 0; i < n; i++) {
    const yBottom = i === 0 ? sillFace : bohs[i - 1] + horizFace;
    const yTop = i === n - 1 ? headBottom : bohs[i];
    const dloHeight = yTop - yBottom;
    if (dloHeight <= 0) {
      warnings.push({
        code: 'ROW_COLLAPSED',
        message: `Row ${i + 1} clear height is ${formatFraction(dloHeight)} — check BOH datums vs member faces.`,
      });
    }
    bands.push({ yBottom, yTop, dloHeight });
  }
  return bands;
}

// ─── Main engine ──────────────────────────────────────────────────────────────

function normalizeBays(bays: number | BaySpec[]): BaySpec[] {
  if (typeof bays === 'number') {
    return Array.from({ length: Math.max(1, Math.floor(bays)) }, () => ({}));
  }
  return bays.length > 0 ? bays : [{}];
}

function normalizeRows(rows: number | RowSpec[]): RowSpec[] {
  if (typeof rows === 'number') {
    return Array.from({ length: Math.max(1, Math.floor(rows)) }, () => ({}));
  }
  return rows.length > 0 ? rows : [{}];
}

/**
 * Compute the complete elevation takeoff: geometry, cut list, glass schedule.
 * Pure function — same input, same output.
 */
export function computeElevation(input: TakeoffInput): TakeoffResult {
  const warnings: TakeoffWarning[] = [];
  const mg = input.metalGroup;
  const joinery: JoineryModel = input.joinery ?? 'VERTICALS_RUN';
  const framingTol = input.framingTolerance ?? FRAMING_TOLERANCE_DEFAULT;
  const glazingTol = input.glazingTolerance ?? GLAZING_TOLERANCE_DEFAULT;
  const finish = input.finishCode ?? 'MILL';
  const quantityThus = Math.max(1, input.quantityThus ?? 1);

  if (joinery === 'HORIZONTALS_RUN') {
    warnings.push({
      code: 'JOINERY_UNSUPPORTED',
      message: 'HORIZONTALS_RUN (shear block) joinery is Phase 2 — computed as VERTICALS_RUN.',
    });
  }

  // ── OAFR resolution ──
  let overallWidth = input.overallWidth ?? 0;
  let overallHeight = input.overallHeight ?? 0;
  if (input.roWidth != null && input.roHeight != null && input.shims) {
    const o = roughOpeningToFrame(input.roWidth, input.roHeight, input.shims);
    overallWidth = o.overallWidth;
    overallHeight = o.overallHeight;
    // Rule 2: no bottom shim with doors
    const baysArr0 = normalizeBays(input.bays);
    if (input.shims.bottom > 0 && baysArr0.some((b) => b.isDoorBay)) {
      warnings.push({
        code: 'BOTTOM_SHIM_WITH_DOOR',
        message: 'Bottom RO shim is prohibited when the elevation contains a door — raise sills instead (PartnerPak rule 2).',
      });
    }
  }
  if (overallWidth <= 0 || overallHeight <= 0) {
    warnings.push({ code: 'NO_DIMENSIONS', message: 'Frame has no usable overall dimensions.' });
  }

  const baySpecs = normalizeBays(input.bays);
  const rowSpecs = normalizeRows(input.rows);
  const nBays = baySpecs.length;
  const nRows = rowSpecs.length;

  // ── Geometry ──
  const boundaries = computeBayBoundaries(overallWidth, baySpecs, warnings);
  const mullionCenterlines = boundaries.slice(1, -1);
  const bands = computeRowBands(overallHeight, rowSpecs, mg, warnings);
  const bohElevations = bands.slice(0, -1).map((b) => b.yTop);

  const bays: FrameBay[] = baySpecs.map((b, i) => ({
    bayIndex: i,
    width: boundaries[i + 1] - boundaries[i],
    isDoorBay: !!b.isDoorBay,
    doorId: b.doorId,
  }));

  const rows: FrameRow[] = bands.map((band, i) => ({
    rowIndex: i,
    bohHeight: band.yTop, // datum of the member above (head bottom for top row)
  }));

  // ── Cut list ──
  const cuts: CutListItem[] = [];
  const addCut = (
    profile: MetalProfile,
    memberType: MemberType,
    cutLength: number,
    quantity: number
  ) => {
    if (quantity <= 0 || cutLength <= 0) return;
    const rounded = roundToFraction(cutLength);
    // merge identical part+length lines
    const existing = cuts.find(
      (c) => c.partNumber === profile.productCode && c.memberType === memberType &&
             Math.abs(c.cutLength - rounded) < 0.001
    );
    if (existing) { existing.quantity += quantity; return; }
    cuts.push({
      partNumber: profile.productCode,
      description: profile.description,
      memberType,
      cutLength: rounded,
      fractionDisplay: formatFraction(rounded),
      quantity,
      finishCode: finish,
    });
  };

  // Verticals run: jambs + intermediates, full height minus tolerance both ends
  const verticalCut = overallHeight - 2 * framingTol;
  addCut(mg.jambLeft, 'JAMB', verticalCut, 1);
  addCut(mg.jambRight, 'JAMB', verticalCut, 1);
  if (nBays > 1) addCut(mg.verticalIntermediate, 'VERTICAL', verticalCut, nBays - 1);

  // Head + sill: butt between jambs (full clear width between jamb faces)
  const headSillCut = overallWidth - mg.jambLeft.profileWidth - mg.jambRight.profileWidth;
  addCut(mg.head, 'HEAD', headSillCut, 1);

  // Sill: omitted at door bays (Rule 2/5 — jambs run to floor, no sill under door)
  const doorBayIdx = new Set(bays.filter((b) => b.isDoorBay).map((b) => b.bayIndex));
  if (doorBayIdx.size === 0) {
    addCut(mg.sill, 'SILL', headSillCut, 1);
  } else {
    // sill segments only under non-door bays
    for (let i = 0; i < nBays; i++) {
      if (doorBayIdx.has(i)) continue;
      addCut(mg.sill, 'SILL', computeBayClearWidth(boundaries, i, mg), 1);
    }
    warnings.push({
      code: 'SILL_INTERRUPTED',
      message: `Sill omitted at door bay(s) ${[...doorBayIdx].map((i) => i + 1).join(', ')} — segments cut per bay.`,
    });
  }

  // Intermediate horizontals: one per interior band boundary per bay (uniform grid v1),
  // cut to bay clear width. Skipped in door bays (door header logic is Phase 2).
  if (nRows > 1) {
    for (let i = 0; i < nBays; i++) {
      if (doorBayIdx.has(i)) continue;
      addCut(mg.horizontalIntermediate, 'HORIZONTAL', computeBayClearWidth(boundaries, i, mg), nRows - 1);
    }
  }

  // ── Glass schedule ──
  const glassSchedule: GlassLite[] = [];
  const defaultGlass: GlassType = input.defaultGlassType ?? 'ANNEALED';
  let totalGlassSqFt = 0;

  for (let b = 0; b < nBays; b++) {
    const dloWidth = computeBayClearWidth(boundaries, b, mg);
    for (let r = 0; r < nRows; r++) {
      if (doorBayIdx.has(b) && r === 0) continue; // door leaf occupies row 1
      const dloHeight = bands[r].dloHeight;
      if (dloWidth <= 0 || dloHeight <= 0) continue;
      const bite = mg.verticalIntermediate.glassBite || mg.head.glassBite;
      const glassType: GlassType =
        input.glassOverrides?.[`${b}:${r}`] ?? rowSpecs[r].glassType ?? defaultGlass;
      const glassWidth = roundToFraction(dloWidth + 2 * bite - glazingTol);
      const glassHeight = roundToFraction(dloHeight + 2 * bite - glazingTol);
      const areaSqFt = (glassWidth * glassHeight) / 144;
      totalGlassSqFt += areaSqFt;
      glassSchedule.push({
        id: `${input.id ?? input.frameName}-B${b + 1}R${r + 1}`,
        bayIndex: b,
        rowIndex: r,
        dloWidth: roundToFraction(dloWidth),
        dloHeight: roundToFraction(dloHeight),
        glassWidth,
        glassHeight,
        glassType,
        areaSqFt: Math.round(areaSqFt * 100) / 100,
      });
    }
  }

  const totalAluminumLF =
    Math.round(
      (cuts.reduce((t, c) => t + c.cutLength * c.quantity, 0) / 12) * 100
    ) / 100;

  return {
    id: input.id ?? `frame-${input.frameName}`,
    frameName: input.frameName,
    quantityThus,
    overallWidth,
    overallHeight,
    metalGroup: mg,
    bays,
    rows,
    glassSchedule,
    metalCutList: cuts,
    warnings,
    mullionCenterlines,
    bohElevations,
    totalGlassSqFt: Math.round(totalGlassSqFt * 100) / 100,
    totalAluminumLF,
  };
}

// ─── Stock yield (Phase 1 sizing helper; full bin-packing is Phase 5) ────────

export interface StockYield {
  stockLength: number;
  barsNeeded: number;
  totalCutInches: number;
  wastePct: number; // scrap thresholds: <8% green, 8-10% yellow, >10% red
  bars: number[][]; // cut lengths placed per bar
}

/**
 * First-fit-decreasing 1D packing with saw kerf.
 * Good enough for scrap % estimates; optimal packing arrives in Phase 5.
 */
export function estimateStockYield(
  cutLengths: number[],
  stockLength: number = STOCK_LENGTH_24FT,
  kerf: number = SAW_KERF
): StockYield {
  const sorted = [...cutLengths].filter((l) => l > 0).sort((a, b) => b - a);
  const bars: number[][] = [];
  const remaining: number[] = [];

  for (const cut of sorted) {
    if (cut > stockLength) {
      // cannot fit — its own bar (splice condition, flag via waste)
      bars.push([cut]);
      remaining.push(0);
      continue;
    }
    let placed = false;
    for (let i = 0; i < bars.length; i++) {
      if (remaining[i] >= cut + kerf) {
        bars[i].push(cut);
        remaining[i] -= cut + kerf;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bars.push([cut]);
      remaining.push(stockLength - cut - kerf);
    }
  }

  const totalCutInches = sorted.reduce((a, b) => a + b, 0);
  const totalStock = bars.length * stockLength;
  const wastePct = totalStock > 0
    ? Math.round(((totalStock - totalCutInches) / totalStock) * 1000) / 10
    : 0;

  return { stockLength, barsNeeded: bars.length, totalCutInches, wastePct, bars };
}

/** Scale a per-frame cut list by quantityThus for fabrication totals. */
export function scaleCutList(cuts: CutListItem[], quantityThus: number): CutListItem[] {
  const q = Math.max(1, quantityThus);
  return cuts.map((c) => ({ ...c, quantity: c.quantity * q }));
}
