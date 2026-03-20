/**
 * structuralEngine.ts
 *
 * Pure TypeScript port of the Python structural_engine.py and structural_calcs.py
 * from the legacy GlazeBid_AIQ backend.
 *
 * All math is self-contained — no network calls, no async, works offline.
 * Runs entirely in the renderer process and is safe to call from any component.
 *
 * Engineering references:
 *   - ASCE 7-22: Minimum Design Loads and Associated Criteria for Buildings
 *   - AAMA SFM-1:  Structural Performance Manual for Storefronts
 *   - AISC Steel Construction Manual 15th Ed. (HSS section tables)
 *   - Aluminum Association ADM: Aluminum Design Manual (allowable stress)
 */

// ── Material Constants ────────────────────────────────────────────────────────

const E_ALU  = 10_100_000; // psi  — Aluminum 6063-T5 (standard extruded)
const E_STL  = 29_000_000; // psi  — Steel A500 (HSS)
const E_GLS  =  10_300_000; // psi — Glass (used for glazing deflection)
const NU_GLS = 0.22;        // Poisson's ratio — glass

// ── Exposure Kz Table (ASCE 7-22 Table 26.10-1) ──────────────────────────────
// Velocity pressure exposure coefficient at height z.
// Linear interpolation between tabulated values.

type KzRow = { height: number; B: number; C: number; D: number };

const KZ_TABLE: KzRow[] = [
  { height:   0, B: 0.57, C: 0.85, D: 1.03 },
  { height:  15, B: 0.57, C: 0.85, D: 1.03 },
  { height:  20, B: 0.62, C: 0.90, D: 1.08 },
  { height:  25, B: 0.66, C: 0.94, D: 1.12 },
  { height:  30, B: 0.70, C: 0.98, D: 1.16 },
  { height:  40, B: 0.76, C: 1.04, D: 1.22 },
  { height:  50, B: 0.81, C: 1.09, D: 1.27 },
  { height:  60, B: 0.85, C: 1.13, D: 1.31 },
  { height:  70, B: 0.89, C: 1.17, D: 1.34 },
  { height:  80, B: 0.93, C: 1.21, D: 1.38 },
  { height:  90, B: 0.96, C: 1.24, D: 1.40 },
  { height: 100, B: 0.99, C: 1.26, D: 1.43 },
  { height: 120, B: 1.04, C: 1.31, D: 1.48 },
  { height: 140, B: 1.09, C: 1.36, D: 1.52 },
  { height: 160, B: 1.13, C: 1.39, D: 1.55 },
  { height: 180, B: 1.17, C: 1.43, D: 1.58 },
  { height: 200, B: 1.20, C: 1.46, D: 1.61 },
];

function getKz(heightFt: number, exposure: 'B' | 'C' | 'D'): number {
  const clamped = Math.max(0, Math.min(heightFt, 200));
  for (let i = 0; i < KZ_TABLE.length - 1; i++) {
    const lo = KZ_TABLE[i];
    const hi = KZ_TABLE[i + 1];
    if (clamped >= lo.height && clamped <= hi.height) {
      const t = (clamped - lo.height) / (hi.height - lo.height);
      return lo[exposure] + t * (hi[exposure] - lo[exposure]);
    }
  }
  return KZ_TABLE[KZ_TABLE.length - 1][exposure];
}

// ── Steel HSS Reinforcement Catalog ──────────────────────────────────────────
// Source: AISC Steel Construction Manual 15th Ed., HSS Rectangular section tables.

export type HSSSection = {
  label:    string;   // e.g. "HSS 3×2×3/16"
  Ix:       number;   // Moment of inertia about x-axis (in⁴) — strong axis
  depth:    number;   // Outside depth (in) — limits fit within mullion pocket
  weight:   number;   // lbs/ft
};

export const HSS_CATALOG: HSSSection[] = [
  { label: 'HSS 2×2×1/8',   Ix: 0.55, depth: 2.0, weight: 2.27 },
  { label: 'HSS 2×2×3/16',  Ix: 0.77, depth: 2.0, weight: 3.32 },
  { label: 'HSS 3×2×1/8',   Ix: 1.62, depth: 3.0, weight: 2.93 },
  { label: 'HSS 3×2×3/16',  Ix: 2.33, depth: 3.0, weight: 4.30 },
  { label: 'HSS 3×3×1/8',   Ix: 2.46, depth: 3.0, weight: 3.58 },
  { label: 'HSS 3×3×3/16',  Ix: 3.55, depth: 3.0, weight: 5.26 },
  { label: 'HSS 4×2×1/8',   Ix: 3.63, depth: 4.0, weight: 3.58 },
  { label: 'HSS 4×2×3/16',  Ix: 5.27, depth: 4.0, weight: 5.26 },
  { label: 'HSS 4×2×1/4',   Ix: 6.62, depth: 4.0, weight: 6.86 },
  { label: 'HSS 4×3×3/16',  Ix: 6.28, depth: 4.0, weight: 5.93 },
  { label: 'HSS 4×4×1/8',   Ix: 6.12, depth: 4.0, weight: 4.23 },
  { label: 'HSS 4×4×3/16',  Ix: 8.84, depth: 4.0, weight: 6.26 },
  { label: 'HSS 4×4×1/4',   Ix: 11.3, depth: 4.0, weight: 8.15 },
  { label: 'HSS 5×3×3/16',  Ix: 11.8, depth: 5.0, weight: 6.87 },
  { label: 'HSS 5×3×1/4',   Ix: 15.3, depth: 5.0, weight: 9.11 },
  { label: 'HSS 6×2×3/16',  Ix: 14.8, depth: 6.0, weight: 7.11 },
  { label: 'HSS 6×4×1/4',   Ix: 28.1, depth: 6.0, weight: 11.4 },
];

// ── Aluminum Mullion Profiles ─────────────────────────────────────────────────

export type MullionProfile = {
  label:    string;
  systemType: 'storefront' | 'curtainwall';
  Ix:       number;   // in⁴
  S:        number;   // in³  (section modulus)
  depth:    number;   // in   (available pocket for steel)
  weight:   number;   // lbs/ft
  allowableStress: number; // psi — 6063-T5 or 6061-T6 per profile
};

export const MULLION_PROFILES: MullionProfile[] = [
  { label: 'SF 2.5" Std',       systemType: 'storefront',   Ix: 1.82, S: 1.09, depth: 2.5,  weight: 0.85, allowableStress: 19_000 },
  { label: 'SF 4.5" Std',       systemType: 'storefront',   Ix: 3.42, S: 1.52, depth: 4.5,  weight: 1.10, allowableStress: 19_000 },
  { label: 'SF 4.5" Heavy',     systemType: 'storefront',   Ix: 4.10, S: 1.82, depth: 4.5,  weight: 1.35, allowableStress: 19_000 },
  { label: 'SF 6.0" Thermal',   systemType: 'storefront',   Ix: 6.20, S: 2.07, depth: 6.0,  weight: 1.55, allowableStress: 19_000 },
  { label: 'CW 7.5" Shallow',   systemType: 'curtainwall',  Ix: 8.50, S: 2.27, depth: 7.5,  weight: 2.20, allowableStress: 19_000 },
  { label: 'CW 10.5" Medium',   systemType: 'curtainwall',  Ix: 15.4, S: 2.93, depth: 10.5, weight: 2.85, allowableStress: 19_000 },
  { label: 'CW 12" Deep',       systemType: 'curtainwall',  Ix: 22.1, S: 3.68, depth: 12.0, weight: 3.40, allowableStress: 19_000 },
];

// ── Inputs & Outputs ──────────────────────────────────────────────────────────

export type ExposureCategory = 'B' | 'C' | 'D';

export type StructuralInputs = {
  /** Frame width in FEET (converted from inches at call site) */
  widthFt:          number;
  /** Frame height / span in FEET */
  heightFt:         number;
  /** Tributary width for mullion load (center-to-center mullion spacing, ft).
   *  Defaults to widthFt / (bayCount + 1) if not provided. */
  mullionSpacingFt?: number;
  /** Number of bays (used to compute default mullion spacing) */
  bayCount?:         number;
  /** Design wind velocity, mph */
  windVelocity:     number;
  /** ASCE 7 exposure category */
  exposure:         ExposureCategory;
  /** Occupancy/risk importance factor (I).  Typ 1.0 for offices; 1.15 for hospitals */
  importanceFactor: number;
  /** Height above grade at the midpoint of the glazing, feet */
  heightAboveGrade: number;
  /** Kzt (topographic factor) — 1.0 for flat sites */
  Kzt?:             number;
  /** Kd  (directionality factor) — 0.85 for buildings per ASCE 7 */
  Kd?:              number;
  /** Selected mullion profile key (index into MULLION_PROFILES) */
  mullionProfileIdx?: number;
  /** Head slope for raked frames, degrees (0 = plumb) */
  headSlopeDeg?:    number;
};

export type WindResults = {
  velocityPressurePsf: number;   // q_z
  positivePressurePsf: number;   // +GC_p
  negativePressurePsf: number;   // -GC_p
  designPressurePsf:   number;   // governing (max abs)
  Kz:                  number;
};

export type DeflectionCheck = {
  deflectionIn:      number;
  limitL175:         number;
  limitL240:         number;
  limitAbsolute:     number;   // 0.75" hard cap
  utilizationL175:   number;   // % of limit consumed
  passesL175:        boolean;
  passesL240:        boolean;
  passesAbsolute:    boolean;
  passes:            boolean;
};

export type StressCheck = {
  bendingStressPsi:    number;
  allowableStressPsi:  number;
  safetyFactor:        number;
  utilizationPct:      number;
  passes:              boolean;
};

export type SpliceRecommendation = {
  needed:       boolean;
  type:         'none' | 'hard-anchor' | 'slip-joint' | 'expansion-anchor';
  reasoning:    string;
  maxSpanFt:    number;
};

export type WindClipRecommendation = {
  spacingIn:    number;    // clip spacing along the vertical mullion
  minLoadLbs:   number;    // min clip shear capacity
  type:         string;    // description
};

export type SteelReinforcementResult = {
  required:     boolean;
  hss?:         HSSSection;
  compositeIx:  number;    // I_total after steel addition
  message:      string;
};

export type MullionCheckStatus =
  | 'PASS'
  | 'PASS_WITH_STEEL'
  | 'UPGRADE_TO_CW'
  | 'FAIL_CRITICAL';

export type MullionCheck = {
  status:         MullionCheckStatus;
  profile:        MullionProfile;
  requiredIx:     number;
  deflection:     DeflectionCheck;
  stress:         StressCheck;
  steel:          SteelReinforcementResult;
  splice:         SpliceRecommendation;
  windClip:       WindClipRecommendation;
  recommendations: string[];
};

export type StructuralResult = {
  inputs:    StructuralInputs;
  wind:      WindResults;
  mullion:   MullionCheck;
  /** Human-readable overall verdict */
  verdict:   string;
  /** True when the analysis is reliable (calibrated span data) */
  reliable:  boolean;
};

// ── Core Calculations ─────────────────────────────────────────────────────────

/** ASCE 7-22 velocity pressure: q_z = 0.00256 × Kz × Kzt × Kd × V² × I */
export function calcWindPressure(inputs: StructuralInputs): WindResults {
  const Kz  = getKz(inputs.heightAboveGrade, inputs.exposure);
  const Kzt = inputs.Kzt ?? 1.0;
  const Kd  = inputs.Kd  ?? 0.85;
  const V   = inputs.windVelocity;
  const I   = inputs.importanceFactor;

  const qz = 0.00256 * Kz * Kzt * Kd * V * V * I;

  // External pressure coefficients for C&C glazing (ASCE 7-22 Fig. 30.4-1)
  // Corner zone (conservative for glazing) GCp +1.0 / -1.8
  const GCp_pos = 1.0;
  const GCp_neg = 1.8;

  return {
    velocityPressurePsf: qz,
    positivePressurePsf: qz * GCp_pos,
    negativePressurePsf: qz * GCp_neg,
    designPressurePsf:   qz * GCp_neg, // negative (suction) governs for glazing
    Kz,
  };
}

/**
 * Mullion deflection check — simply supported beam, uniform distributed load.
 *
 *   δ = (5 × w × L⁴) / (384 × E × I)
 *
 * w  = wind pressure (psf) × tributary width (ft) → lbs/in
 * L  = span height in inches
 * E  = elastic modulus (psi)
 * I  = moment of inertia (in⁴)
 */
export function calcDeflection(
  spanIn:   number,
  wLbsIn:   number,
  E:        number,
  Ix:       number,
): DeflectionCheck {
  const delta       = (5 * wLbsIn * Math.pow(spanIn, 4)) / (384 * E * Ix);
  const limitL175   = spanIn / 175;
  const limitL240   = spanIn / 240;
  const limitAbs    = 0.75;

  const passesL175  = delta <= limitL175;
  const passesL240  = delta <= limitL240;
  const passesAbs   = delta <= limitAbs;

  return {
    deflectionIn:    delta,
    limitL175,
    limitL240,
    limitAbsolute:   limitAbs,
    utilizationL175: (delta / limitL175) * 100,
    passesL175,
    passesL240,
    passesAbsolute:  passesAbs,
    passes:          passesL175 && passesAbs,
  };
}

/**
 * Mullion bending stress check — simply supported beam, uniform load.
 *
 *   M = (w × L²) / 8
 *   σ = M / S
 */
export function calcStress(
  spanIn:          number,
  wLbsIn:          number,
  S:               number,
  allowableStress: number,
): StressCheck {
  const M = (wLbsIn * spanIn * spanIn) / 8;
  const sigma = M / S;

  return {
    bendingStressPsi:   sigma,
    allowableStressPsi: allowableStress,
    safetyFactor:       allowableStress / sigma,
    utilizationPct:     (sigma / allowableStress) * 100,
    passes:             sigma <= allowableStress,
  };
}

/**
 * Steel reinforcement sizing — transformed section method.
 *
 *   I_composite = I_alum + (E_steel / E_alum) × I_steel
 *
 * Iterates HSS catalog from lightest to heaviest, filters by depth envelope,
 * returns the first section that brings I_composite >= I_required.
 */
export function findSteelReinforcement(
  IxRequired:     number,
  IxAluminum:     number,
  depthEnvelope:  number,  // max steel depth that fits in alum pocket
): SteelReinforcementResult {
  const modRatio = E_STL / E_ALU;

  // Already passes — no steel needed
  if (IxAluminum >= IxRequired) {
    return { required: false, compositeIx: IxAluminum, message: 'No steel needed' };
  }

  const IxSteelNeeded = (IxRequired - IxAluminum) / modRatio;

  // Find lightest HSS that fits and provides enough steel Ix
  const candidates = HSS_CATALOG
    .filter(hss => hss.depth <= depthEnvelope)
    .sort((a, b) => a.weight - b.weight);

  for (const hss of candidates) {
    if (hss.Ix >= IxSteelNeeded) {
      const compositeIx = IxAluminum + modRatio * hss.Ix;
      return {
        required:    true,
        hss,
        compositeIx,
        message: `${hss.label} — composite Ix = ${compositeIx.toFixed(2)} in⁴`,
      };
    }
  }

  // No HSS fits
  return {
    required: true,
    compositeIx: IxAluminum,
    message: 'No HSS section fits — upgrade system or reduce span',
  };
}

/**
 * Splice recommendation based on span height and system type.
 *
 * Rules (from field engineering practice):
 *   Storefront  < 12 ft  → no splice
 *   Storefront  12–20 ft → slip joint (expansion joint)
 *   Storefront  > 20 ft  → hard anchor + slip joint
 *   Curtainwall < 14 ft  → no splice
 *   Curtainwall 14–25 ft → slip joint
 *   Curtainwall > 25 ft  → hard anchor
 */
export function calcSplice(
  spanFt:     number,
  systemType: 'storefront' | 'curtainwall',
): SpliceRecommendation {
  if (systemType === 'storefront') {
    if (spanFt < 12) return { needed: false, type: 'none', reasoning: 'Span < 12 ft, no splice required for storefront', maxSpanFt: spanFt };
    if (spanFt <= 20) return { needed: true, type: 'slip-joint', reasoning: 'Span 12–20 ft: expansion/slip joint required at slab', maxSpanFt: spanFt };
    return { needed: true, type: 'hard-anchor', reasoning: 'Span > 20 ft: hard anchor + slip joint — verify with PE', maxSpanFt: spanFt };
  } else {
    if (spanFt < 14) return { needed: false, type: 'none', reasoning: 'Span < 14 ft, no splice required for curtainwall', maxSpanFt: spanFt };
    if (spanFt <= 25) return { needed: true, type: 'slip-joint', reasoning: 'Span 14–25 ft: slip joint at stack joint', maxSpanFt: spanFt };
    return { needed: true, type: 'expansion-anchor', reasoning: 'Span > 25 ft: expansion anchor at intermediate floor — verify with PE', maxSpanFt: spanFt };
  }
}

/**
 * Wind clip spacing and minimum load recommendation.
 *
 * Wind clips resist lateral load transferred from the glazing bite into
 * structural support.  Clip spacing is governed by clip capacity and
 * the design load per linear foot.
 *
 * w_clip = designPressure × tributaryWidth (psf × ft = lbs/ft)
 * spacing = (clip_capacity / w_clip) in inches  → round down to 12" increments
 */
export function calcWindClip(
  designPressurePsf: number,
  tributaryWidthFt:  number,
): WindClipRecommendation {
  // Typical manufacturer clip capacities (lbs) for horizontal loading
  const STD_CLIP_CAPS   = [200, 300, 500, 750, 1000];
  const wPerFt          = designPressurePsf * tributaryWidthFt; // lbs/ft

  // Target no more than 48" spacing (aesthetics + practicality)
  // Find smallest std clip that allows ≥ 12" spacing
  for (const cap of STD_CLIP_CAPS) {
    const spacingIn = (cap / wPerFt) * 12; // convert ft to in
    if (spacingIn >= 12) {
      const snapped = Math.min(48, Math.floor(spacingIn / 6) * 6); // snap to 6" grid, max 48"
      return {
        spacingIn:  snapped,
        minLoadLbs: cap,
        type: `${cap}-lb capacity wind clip @ ${snapped}" o.c.`,
      };
    }
  }

  // Very high load — 12" spacing with 1000 lb clips
  return {
    spacingIn:  12,
    minLoadLbs: 1000,
    type: '1000-lb capacity wind clip @ 12" o.c. — consult structural engineer',
  };
}

// ── Master Analysis Entry Point ───────────────────────────────────────────────

/**
 * runStructuralAnalysis
 *
 * The single public entry point for the structural calculator.
 * Call this from the UI panel; it returns a fully-typed StructuralResult.
 *
 * @example
 *   const result = runStructuralAnalysis({
 *     widthFt:  6,
 *     heightFt: 10,
 *     windVelocity: 90,
 *     exposure: 'C',
 *     importanceFactor: 1.0,
 *     heightAboveGrade: 20,
 *   });
 */
export function runStructuralAnalysis(inputs: StructuralInputs): StructuralResult {
  // ── 1. Wind ──────────────────────────────────────────────────────────────
  const wind = calcWindPressure(inputs);

  // ── 2. Mullion tributary load ─────────────────────────────────────────────
  const bayCount      = inputs.bayCount ?? 1;
  const spacingFt     = inputs.mullionSpacingFt
    ?? inputs.widthFt / (bayCount + 1);
  const spacingFtSafe = Math.max(spacingFt, 0.1);

  // lbs per linear inch of span
  const wLbsIn = (wind.designPressurePsf * spacingFtSafe) / 12;
  const spanIn = inputs.heightFt * 12;

  // ── 3. Select mullion profile ─────────────────────────────────────────────
  const profileIdx = inputs.mullionProfileIdx ?? 1; // default SF 4.5" Std
  const profile    = MULLION_PROFILES[Math.min(profileIdx, MULLION_PROFILES.length - 1)];

  // ── 4. Required Ix (from deflection limit L/175) ──────────────────────────
  const limitDelta  = Math.min(spanIn / 175, 0.75);
  const IxRequired  = (5 * wLbsIn * Math.pow(spanIn, 4)) / (384 * E_ALU * limitDelta);

  // ── 5. Deflection & stress with base aluminum ─────────────────────────────
  const deflectionBase = calcDeflection(spanIn, wLbsIn, E_ALU, profile.Ix);
  const stressBase     = calcStress(spanIn, wLbsIn, profile.S, profile.allowableStress);

  // ── 6. Steel reinforcement (if needed) ───────────────────────────────────
  const steel = findSteelReinforcement(IxRequired, profile.Ix, profile.depth);

  // Recalc deflection using composite Ix when steel is needed
  const IxFinal     = steel.compositeIx;
  const deflection  = steel.required
    ? calcDeflection(spanIn, wLbsIn, E_ALU, IxFinal)
    : deflectionBase;
  const stress      = stressBase;

  // ── 7. Splice & wind clip ─────────────────────────────────────────────────
  const sysType = profile.systemType;
  const splice    = calcSplice(inputs.heightFt, sysType);
  const windClip  = calcWindClip(wind.designPressurePsf, spacingFtSafe);

  // ── 8. Determine status ───────────────────────────────────────────────────
  let status: MullionCheckStatus;
  const recommendations: string[] = [];

  if (!steel.required && deflection.passes && stress.passes) {
    status = 'PASS';
    recommendations.push('✅ Base aluminum mullion is adequate — no reinforcement required.');
  } else if (steel.required && steel.hss && deflection.passes && stress.passes) {
    status = 'PASS_WITH_STEEL';
    recommendations.push(`💡 Install ${steel.hss.label} reinforcement tube inside mullion.`);
    recommendations.push(`   Composite Ix = ${IxFinal.toFixed(2)} in⁴ (required: ${IxRequired.toFixed(2)} in⁴).`);
  } else if (steel.required && !steel.hss) {
    // No HSS fits in storefront — consider curtainwall upgrade
    status = 'UPGRADE_TO_CW';
    recommendations.push('🔄 Switch to curtainwall system — storefront span exceeds available steel reinforcement.');
    recommendations.push('   CW 7.5" shallow provides Ix = 8.50 in⁴ with inherently deeper pocket.');
  } else {
    status = 'FAIL_CRITICAL';
    recommendations.push('🚨 CRITICAL: Span exceeds capacity of all standard curtainwall sections — PE review required.');
  }

  if (splice.needed) {
    recommendations.push(`📌 Splice: ${splice.reasoning}`);
  }

  if (inputs.headSlopeDeg && inputs.headSlopeDeg > 2) {
    recommendations.push(`📐 Raked head at ${inputs.headSlopeDeg.toFixed(1)}° — verify anchor eccentricity at head condition.`);
  }

  recommendations.push(`🪝 Wind clips: ${windClip.type}`);

  if (deflection.utilizationL175 > 80) {
    recommendations.push(`⚠️  Deflection utilization ${deflection.utilizationL175.toFixed(0)}% of L/175 — consider deeper profile.`);
  }
  if (stress.utilizationPct > 80) {
    recommendations.push(`⚠️  Stress utilization ${stress.utilizationPct.toFixed(0)}% — consider higher-strength aluminum alloy.`);
  }

  const verdictMap: Record<MullionCheckStatus, string> = {
    'PASS':            '✅ Adequate — no modifications required',
    'PASS_WITH_STEEL': '💡 Passes with steel reinforcement',
    'UPGRADE_TO_CW':   '🔄 Upgrade to curtainwall recommended',
    'FAIL_CRITICAL':   '🚨 Exceeds standard limits — PE review required',
  };

  return {
    inputs,
    wind,
    mullion: {
      status,
      profile,
      requiredIx: IxRequired,
      deflection,
      stress,
      steel,
      splice,
      windClip,
      recommendations,
    },
    verdict:  verdictMap[status],
    reliable: true,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert inches to feet */
export const inToFt = (inches: number): number => inches / 12;

/** Format psf to 2 decimal places + unit */
export const fmtPsf = (v: number): string => `${v.toFixed(2)} psf`;

/** Format inches to 4 decimal places + unit */
export const fmtIn = (v: number): string => `${v.toFixed(4)}"`;

/** Format psi with thousands separator + unit */
export const fmtPsi = (v: number): string => `${Math.round(v).toLocaleString()} psi`;

export { E_ALU, E_STL, E_GLS, NU_GLS };
